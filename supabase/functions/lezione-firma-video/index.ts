import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// lezione-firma-video (24/8/2026) — indirizzo firmato per l'iframe Bunny di
// una lezione. Oggi (brief "il corso") gli indirizzi salvati in
// lezione.video_url sono aperti a chiunque li copi: le regole a database
// proteggono l'ELENCO delle lezioni, non i filmati. Da qui in poi il client
// non legge mai video_url ne' video_bunny_id: chiede QUESTA funzione, che
// decide lei cosa restituire.
//
// AUTORIZZAZIONE: non una copia scritta a mano delle regole di accesso, le
// STESSE regole — la lezione si legge con la sessione del chiamante (client
// "asUser", chiave anon + il suo JWT), quindi passa la RLS "lezione_select"
// gia' in vigore (pubblicata + livello_accesso, o >=25 per la redazione). Se
// la riga non torna, chi chiede non ha diritto: 403, senza dover indovinare
// perche'.
//
// FIRMA: solo se config_app.bunny_stream.token_attivo e' true (il segretario
// lo accende dalla dashboard Bunny + il secret BUNNY_TOKEN_KEY). Prima che
// sia acceso, l'indirizzo resta quello semplice — stessa esposizione di
// oggi, ma MAI piu' scritto in una colonna che il client legge direttamente:
// il giorno che si accende il token, cambia solo questa funzione, non il
// resto dell'app.
//
// La chiave BUNNY_TOKEN_KEY non compare MAI nella risposta, nei log, negli
// errori: se manca mentre il token e' acceso, si fallisce e basta.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "https://www.elbrenz.eu",
  "http://localhost:3000",
  "http://localhost:4321",
];

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function sha256Hex(testo: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

  // 1) Identita' certa dal token.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized" }, 401);

  let b: any;
  try { b = await req.json(); } catch { return J({ error: "invalid_json" }, 400); }
  const lezioneId = String(b?.lezione_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(lezioneId)) return J({ error: "lezione_non_valida" }, 400);

  // 2) La lezione si legge CON LA SESSIONE DI CHI CHIEDE: e' la RLS
  // "lezione_select" a decidere se questa persona ci arriva, non una
  // condizione riscritta qui. Mai un video_bunny_id passato dal client.
  const { data: lez, error: eLez } = await asUser
    .from("lezione").select("id, video_bunny_id").eq("id", lezioneId).maybeSingle();
  if (eLez) { console.error("[lezione-firma-video] lettura lezione fallita:", eLez.message); return J({ error: "errore_interno" }, 500); }
  if (!lez) return J({ error: "non_autorizzato" }, 403);
  if (!lez.video_bunny_id) return J({ error: "video_non_collegato" }, 404);

  // 3) Configurazione Bunny, da config_app (mai cablata nel codice).
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: cfgRow, error: eCfg } = await admin
    .from("config_app").select("valore").eq("chiave", "bunny_stream").maybeSingle();
  if (eCfg || !cfgRow?.valore) { console.error("[lezione-firma-video] config bunny_stream non leggibile:", eCfg?.message); return J({ error: "configurazione_mancante" }, 500); }
  const cfg = cfgRow.valore as Record<string, unknown>;
  const libraryId = String(cfg.library_id ?? "");
  const embedBase = String(cfg.embed_base ?? "");
  if (!libraryId || !embedBase) return J({ error: "configurazione_incompleta" }, 500);

  const base = `${embedBase}/${libraryId}/${lez.video_bunny_id}`;

  // 4) Senza protezione attiva: indirizzo semplice. Stessa esposizione di
  // oggi (nessun peggioramento), ma non piu' letta da una colonna pubblica.
  if (cfg.token_attivo !== true) {
    return J({ ok: true, url: base, firmato: false });
  }

  // 5) Con protezione attiva: token = sha256(chiave + video_id + scadenza).
  const chiave = Deno.env.get("BUNNY_TOKEN_KEY");
  if (!chiave) {
    console.error("[lezione-firma-video] token_attivo=true ma BUNNY_TOKEN_KEY manca nei segreti");
    return J({ error: "firma_non_disponibile" }, 500);
  }
  const durata = Number(cfg.token_durata_secondi) || 7200;
  const expires = Math.floor(Date.now() / 1000) + durata;
  const firma = await sha256Hex(chiave + lez.video_bunny_id + expires);

  return J({ ok: true, url: `${base}?token=${firma}&expires=${expires}`, firmato: true, expires });
});
