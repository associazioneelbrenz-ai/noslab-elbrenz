import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// corso-video-libreria (24/8/2026) — elenca i video della libreria Bunny per
// la redazione dei corsi. Il brief e' esplicito su un punto: "non chiedere di
// incollare un identificativo a mano" — e' gia' successo con le trascrizioni,
// ed e' uno dei motivi per cui nessuno l'ha usata. Qui si sceglie da un menu
// (titolo, durata, miniatura), non si trascrive un GUID a occhio.
//
// La chiave dell'API Bunny (BUNNY_API_KEY, dalla scheda "API" della libreria
// su Bunny — DIVERSA dalla chiave di firma BUNNY_TOKEN_KEY) sta nei segreti e
// la chiamata passa da qui, mai dal browser: e' una chiave che legge/gestisce
// l'intera libreria video, non deve mai arrivare al client.
//
// GATE: chi cura i corsi (>=25, "collaboratore"), stessa soglia delle policy
// scrittura su corso/modulo_corso/lezione — non una soglia diversa inventata
// qui.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "https://www.elbrenz.eu",
  "http://localhost:3000",
  "http://localhost:4321",
];
const LIVELLO_MINIMO = 25;
// Stato del video su Bunny Stream: 4 = "Finished" (pronto). Sotto quel
// numero e' ancora in coda o in elaborazione — non lo si lascia scegliere,
// altrimenti nasce una lezione che non parte.
const STATO_PRONTO = 4;

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const CORS = corsFor(req);
  const J = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return J({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: ruoli } = await admin
    .from("utente_ruolo").select("ruolo:ruolo_id(livello)").eq("utente_id", user.id);
  const livello = Math.max(0, ...(((ruoli ?? []) as any[]).map((r) => r?.ruolo?.livello ?? 0)));
  if (livello < LIVELLO_MINIMO) return J({ error: "non_autorizzato" }, 403);

  const { data: cfgRow, error: eCfg } = await admin
    .from("config_app").select("valore").eq("chiave", "bunny_stream").maybeSingle();
  if (eCfg || !cfgRow?.valore) return J({ error: "configurazione_mancante" }, 500);
  const cfg = cfgRow.valore as Record<string, unknown>;
  const libraryId = String(cfg.library_id ?? "");
  const cdnHostname = cfg.cdn_hostname ? String(cfg.cdn_hostname) : null;
  if (!libraryId) return J({ error: "configurazione_incompleta" }, 500);

  const apiKey = Deno.env.get("BUNNY_API_KEY");
  if (!apiKey) {
    return J({
      error: "chiave_api_mancante",
      detail: "Manca il secret BUNNY_API_KEY nei Segreti Supabase: si trova nella scheda «API» della libreria su Bunny Stream (è diversa dalla chiave di firma BUNNY_TOKEN_KEY).",
    }, 500);
  }

  let pagina = 1;
  try { const b = await req.json().catch(() => ({})); if (Number.isFinite(b?.pagina)) pagina = Math.max(1, Number(b.pagina)); } catch { /* pagina 1 */ }

  const url = new URL(`https://video.bunnycdn.com/library/${libraryId}/videos`);
  url.searchParams.set("page", String(pagina));
  url.searchParams.set("itemsPerPage", "100");
  url.searchParams.set("orderBy", "date");

  let res: Response;
  try {
    res = await fetch(url, { headers: { AccessKey: apiKey, accept: "application/json" } });
  } catch (e) {
    console.error("[corso-video-libreria] Bunny non raggiungibile:", e);
    return J({ error: "bunny_non_raggiungibile" }, 502);
  }
  if (!res.ok) {
    console.error("[corso-video-libreria] Bunny ha risposto", res.status);
    return J({ error: "bunny_errore", detail: `HTTP ${res.status}` }, 502);
  }
  const dati = await res.json().catch(() => ({}));
  const video = ((dati as any)?.items ?? []).map((v: any) => ({
    id: v.guid,
    titolo: v.title ?? "(senza titolo)",
    durata_secondi: Number(v.length) || 0,
    miniatura: cdnHostname && v.thumbnailFileName ? `https://${cdnHostname}/${v.guid}/${v.thumbnailFileName}` : null,
    pronto: Number(v.status) === STATO_PRONTO,
    stato_grezzo: Number(v.status),
  }));

  return J({ ok: true, video, totale: (dati as any)?.totalItems ?? video.length, pagina });
});
