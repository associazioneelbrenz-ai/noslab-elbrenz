import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// glossario-audio-pubblica (29/8/2026, brief "La coda di ascolto dentro
// l'app soci") — due azioni sullo Storage per la coda di ascolto dentro
// l'app, entrambe via SERVICE ROLE:
//   firma     { audio_id } -> signed URL 10 min del file (per riprodurlo)
//   pubblica  { audio_id } -> copia il file dal bucket privato
//             glossario-audio-attesa al pubblico glossario-audio, prima
//             che il client chiami conferma_ascolto
//
// MOTIVO, letto in museo-donazioni-media (non dedotto, la stessa frase
// spiega perche' esiste quella funzione): "Il client nel pannello opera sul
// bucket PRIVATO col token del login OTP, che lo Storage tratta da anon:
// signed URL (anteprima) E copia file (promuovi) fallivano con RLS." Non e'
// solo la scrittura: anche la SOLA firma di un URL, fatta con
// `supabase.storage.from(bucket).createSignedUrl()` direttamente dal
// client, e' gia' rotta sotto una sessione nata da otp-verify in questa
// app. Il brief chiede "URL firmati con la sessione dell'utente
// autenticato": qui la sessione autentica la RICHIESTA (verificata con
// getUser() sul token), la firma vera la fa poi il service role — stessa
// forma di museo-donazioni-media/azione 'anteprima', non una scorciatoia.
//
// conferma_ascolto/scarta_ascolto restano chiamate DIRETTE del client con
// la propria sessione (RPC via PostgREST, non Storage: quel canale accetta
// il token OTP correttamente, e' documentato solo lo Storage a non farlo).
// Questa funzione non scrive mai stato='pubblicato': quello lo fa solo
// conferma_ascolto, dopo, con la sua stessa transazione.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "http://localhost:3000",
];
const BUCKET_PUBBLICO = "glossario-audio";
const LIVELLO_MINIMO = 20;
const FIRMA_TTL = 600; // 10 minuti, come museo-donazioni-media

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

  // 1) Identita' dal token — stessa forma di carica-media/museo-donazioni-media.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized", detail: uerr?.message ?? null }, 401);

  let body: { azione?: string; audio_id?: string };
  try { body = await req.json(); } catch { return J({ error: "corpo_non_valido" }, 400); }
  const azione = String(body.azione ?? "");
  const audioId = (body.audio_id ?? "").trim();
  if (!audioId) return J({ error: "audio_id_mancante" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // 2) Livello minimo — stesso controllo di conferma_ascolto/scarta_ascolto.
  //    Qui e' per non firmare/copiare per chi non ha titolo; il cancello
  //    vero, per la scrittura in database, resta dentro le due funzioni RPC.
  const { data: ruoli } = await admin
    .from("utente_ruolo").select("ruolo:ruolo_id(livello)").eq("utente_id", user.id);
  const maxLiv = Math.max(0, ...(((ruoli ?? []) as any[]).map((r) => r?.ruolo?.livello ?? 0)));
  if (maxLiv < LIVELLO_MINIMO) return J({ error: "livello_insufficiente" }, 403);

  // 3) La riga deve essere davvero in coda: non si firma o copia un file a
  //    caso, e non si ripete il lavoro se qualcuno ha gia' lavorato la voce.
  const { data: riga, error: eRiga } = await admin
    .from("archivio_audio").select("bucket, file_path, stato, ascoltato_il")
    .eq("id", audioId).maybeSingle();
  if (eRiga) return J({ error: "lettura_fallita", detail: eRiga.message }, 500);
  if (!riga || riga.stato !== "in_attesa" || riga.ascoltato_il !== null) {
    return J({ error: "non_in_coda" }, 409);
  }

  if (azione === "firma") {
    const { data, error } = await admin.storage.from(riga.bucket).createSignedUrl(riga.file_path, FIRMA_TTL);
    if (error || !data?.signedUrl) return J({ error: "firma_fallita", detail: error?.message ?? null }, 500);
    return J({ ok: true, url: data.signedUrl });
  }

  if (azione === "pubblica") {
    // Gia' nel bucket pubblico (non dovrebbe succedere per una riga
    // 'in_attesa', ma se succede non e' un errore da bloccare qui).
    if (riga.bucket === BUCKET_PUBBLICO) return J({ ok: true, gia_pubblico: true });
    const { error: eCopia } = await admin.storage
      .from(riga.bucket).copy(riga.file_path, riga.file_path, { destinationBucket: BUCKET_PUBBLICO });
    if (eCopia) return J({ error: "copia_fallita", detail: eCopia.message }, 500);
    return J({ ok: true });
  }

  return J({ error: "azione_non_riconosciuta" }, 400);
});
