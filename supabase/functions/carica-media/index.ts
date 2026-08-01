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

// 1/8/2026 — allineato a donazione-upload: 15 MB per file (erano 12).
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * Sniffing sui magic bytes: quello che il client DICHIARA non conta.
 * Prima ci si fidava dell'header `x-ext` e del content-type, entrambi scelti
 * dal browser: bastava rinominare un file per farlo entrare in una cartella
 * pubblica col tipo sbagliato.
 *
 * ATTENZIONE, il motivo per cui non si e' copiato lo sniffer delle donazioni:
 * quello copre png/jpg/webp/pdf, ma qui EXT_OK ammette anche gif e heic/heif,
 * e le heic sono le foto degli iPhone. Applicarlo com'era avrebbe respinto le
 * fotografie di chi cataloga col telefono. Coperte tutte e otto le estensioni
 * ammesse: se un formato non e' riconosciuto, si rifiuta, ed e' il punto.
 */
function sniff(b: Uint8Array): { ext: string; mime: string } | null {
  // PNG  89 50 4E 47
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)
    return { ext: "png", mime: "image/png" };
  // JPEG  FF D8 FF
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)
    return { ext: "jpg", mime: "image/jpeg" };
  // WEBP  "RIFF"…"WEBP"
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: "webp", mime: "image/webp" };
  // GIF  "GIF87a" / "GIF89a"
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61)
    return { ext: "gif", mime: "image/gif" };
  // HEIC/HEIF: ISO-BMFF, "ftyp" a offset 4, brand a offset 8.
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand))
      return { ext: "heic", mime: "image/heic" };
  }
  // PDF  "%PDF"
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return { ext: "pdf", mime: "application/pdf" };
  return null;
}

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

  // 3) File dal body. L'estensione dichiarata serve solo per un rifiuto
  //    precoce: la parola definitiva la danno i magic bytes, qui sotto.
  const extDichiarata = ((req.headers.get("x-ext") ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")).slice(0, 5) || "jpg";
  if (!EXT_OK.has(extDichiarata)) return J({ error: "estensione_non_ammessa" }, 400);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return J({ error: "empty_body" }, 400);
  if (bytes.length > MAX_FILE_BYTES) {
    return J({ error: "too_large", detail: "Ogni file puo' pesare al massimo 15 MB." }, 413);
  }

  // Il contenuto vero decide estensione e content-type: cosi' un file
  // rinominato non entra nel bucket pubblico travestito da immagine.
  const tipo = sniff(bytes);
  if (!tipo) return J({ error: "formato_non_riconosciuto", detail: "Sono ammesse immagini (JPG, PNG, WebP, GIF, HEIC) e PDF." }, 400);
  if (!EXT_OK.has(tipo.ext)) return J({ error: "estensione_non_ammessa" }, 400);

  // 4) Upload con service role in {cartella}/{uid}/{ts}-{rand}.{ext}.
  const rand = crypto.randomUUID().slice(0, 8);
  const path = `${cartella}/${user.id}/${Date.now()}-${rand}.${tipo.ext}`;
  const { error: upErr } = await admin.storage
    .from("assets-pubblici").upload(path, bytes, { contentType: tipo.mime, upsert: false });
  if (upErr) return J({ error: "upload_failed", detail: upErr.message }, 500);

  const url = admin.storage.from("assets-pubblici").getPublicUrl(path).data.publicUrl;
  return J({ ok: true, url, path });
});
