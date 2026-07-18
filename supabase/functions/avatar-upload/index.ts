import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// avatar-upload (18/7/2026) — carica la foto profilo del socio.
//
// PERCHE' UN EDGE: il login dell'app conia la sessione via otp-verify
// (admin.generateLink → token GoTrue). Quel token e' valido per PostgREST
// (auth.uid risolve) ma lo Storage lo trattava come anonimo → ogni upload
// avatar finiva in RLS 400, su qualunque bucket/path, anche da admin. Dopo
// piu' tentativi lato client (supabase-js e fetch con Bearer esplicito) il
// sintomo restava. Qui aggiriamo del tutto la RLS Storage lato client:
//   1) validiamo il token con getUser() → identita' CERTA dell'utente;
//   2) scriviamo con il SERVICE ROLE (bypassa la RLS) nel path {uid}/avatar.jpg.
// L'uid viene SEMPRE dal token verificato, mai dal client: un utente non puo'
// scrivere nella cartella di un altro. Nessun segreto esce dall'edge.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app", // PWA soci — staging
  "https://community.elbrenz.eu",          // PWA soci — dominio previsto
  "https://app.elbrenz.eu",                // alias previsto
  "https://elbrenz.eu",
  "http://localhost:3000",                 // dev PWA Vite
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

Deno.serve(async (req: Request) => {
  const CORS = corsFor(req);
  const J = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return J({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Identita' dell'utente dal token (Authorization: Bearer <access_token>).
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);

  const asUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized", detail: uerr?.message ?? null }, 401);

  // 2) Immagine dal body (JPEG gia' ridimensionato lato client).
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return J({ error: "empty_body" }, 400);
  if (bytes.length > 3_000_000) return J({ error: "too_large" }, 413);

  // 3) Upload con SERVICE ROLE (niente RLS). Path = {uid}/avatar.jpg dal token.
  const admin = createClient(SUPABASE_URL, SERVICE);
  const path = `${user.id}/avatar.jpg`;
  const { error: upErr } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { upsert: true, contentType: "image/jpeg" });
  if (upErr) return J({ error: "upload_failed", detail: upErr.message }, 500);

  const base = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const url = `${base}?v=${Date.now()}`;
  const { error: dbErr } = await admin.from("utente").update({ avatar_url: url }).eq("id", user.id);
  if (dbErr) return J({ error: "profile_update_failed", detail: dbErr.message }, 500);

  return J({ ok: true, url });
});
