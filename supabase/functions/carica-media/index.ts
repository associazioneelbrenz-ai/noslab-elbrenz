import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// carica-media (18/7/2026) — upload generico dei soci su assets-pubblici, via
// SERVICE ROLE. Stesso motivo dell'avatar: il token del login (otp-verify →
// generateLink) e' valido per PostgREST ma lo Storage lo tratta come anonimo →
// gli upload diretti dal client (storie, museo, community) finivano in RLS 400.
// Qui: getUser() da' l'identita' certa; controlliamo il livello minimo per la
// cartella; scriviamo con service role in {cartella}/{uid}/{ts}-{rand}.{ext}.
// L'uid viene SEMPRE dal token verificato → un socio scrive solo nella propria
// cartella. Cartelle in whitelist (con livello minimo). Nessun segreto esce.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "http://localhost:3000",
];
// Cartella → livello minimo richiesto (socio=10). Solo queste sono ammesse.
const CARTELLE: Record<string, number> = { storie: 10, "museo-gg": 10, community: 10 };
const EXT_OK = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "pdf"]);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cartella, x-ext",
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

  // 1) Identita' dal token.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized", detail: uerr?.message ?? null }, 401);

  // 2) Cartella whitelistata + livello minimo.
  const cartella = (req.headers.get("x-cartella") ?? "").trim();
  const minLiv = CARTELLE[cartella];
  if (minLiv === undefined) return J({ error: "cartella_non_ammessa" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: ruoli } = await admin
    .from("utente_ruolo").select("ruolo:ruolo_id(livello)").eq("utente_id", user.id);
  const maxLiv = Math.max(0, ...(((ruoli ?? []) as any[]).map((r) => r?.ruolo?.livello ?? 0)));
  if (maxLiv < minLiv) return J({ error: "livello_insufficiente" }, 403);

  // 3) File dal body.
  const ext = ((req.headers.get("x-ext") ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")).slice(0, 5) || "jpg";
  if (!EXT_OK.has(ext)) return J({ error: "estensione_non_ammessa" }, 400);
  const ctype = req.headers.get("content-type") || "application/octet-stream";
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return J({ error: "empty_body" }, 400);
  if (bytes.length > 12_000_000) return J({ error: "too_large" }, 413);

  // 4) Upload con service role in {cartella}/{uid}/{ts}-{rand}.{ext}.
  const rand = crypto.randomUUID().slice(0, 8);
  const path = `${cartella}/${user.id}/${Date.now()}-${rand}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("assets-pubblici").upload(path, bytes, { contentType: ctype, upsert: false });
  if (upErr) return J({ error: "upload_failed", detail: upErr.message }, 500);

  const url = admin.storage.from("assets-pubblici").getPublicUrl(path).data.publicUrl;
  return J({ ok: true, url, path });
});
