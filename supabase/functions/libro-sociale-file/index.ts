import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// libro-sociale-file (11/8/2026) — il caricamento dei verbali, delle deleghe
// firmate e dei libri storici nel bucket PRIVATO `libri-sociali`.
//
// PERCHE' PASSA DA QUI E NON DALLO STORAGE DIRETTAMENTE. E' il difetto che ha
// fatto perdere le fotografie dei soci per un mese e che e' gia' stato corretto
// due volte (museo, donazioni): il token del login OTP e' valido per PostgREST
// ma lo Storage lo tratta come anonimo, quindi un upload diretto dal client
// muore in RLS e non lo dice a nessuno. Con un verbale sarebbe peggio: un
// documento che sembra caricato e non c'e' e' peggio di un documento mancante,
// perche' nessuno lo ricarica.
//
// SE IL CARICAMENTO FALLISCE, LO DICE. Ogni ritorno di errore porta un motivo
// leggibile: chi carica deve poter distinguere «non e' passato» da «e' passato».
//
// Chi puo': solo chi tiene i libri sociali (ruolo gestione_associativa o livello
// >= 50), verificato con la stessa funzione che governa l'RLS delle tabelle.
// Una porta sola, non due che possono divergere.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "http://localhost:3000",
  "http://localhost:5173",
];

// 25 MB: e' il limite del bucket, e i verbali scansionati ci arrivano vicino.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Le tre cartelle del libro. Non ce ne sono altre e non si accettano percorsi
// dal client: il percorso lo compone questa funzione.
const CARTELLE = new Set(["verbale", "delega", "documento"]);

/**
 * Il contenuto decide, non il nome del file.
 *
 * Il bucket accetta PDF, Word e immagini (una delega firmata arriva spesso come
 * fotografia). Un file rinominato .pdf che pdf non e' viene respinto qui, prima
 * di finire in un libro sociale dove nessuno lo riaprira' per anni.
 */
function sniff(b: Uint8Array): { ext: string; mime: string } | null {
  // PDF  "%PDF"
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return { ext: "pdf", mime: "application/pdf" };
  // DOCX (e ogni Office moderno): e' uno ZIP, "PK\x03\x04"
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04)
    return { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  // DOC vecchio: contenitore OLE2, D0 CF 11 E0 A1 B1 1A E1
  if (b.length > 8 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0 &&
      b[4] === 0xA1 && b[5] === 0xB1 && b[6] === 0x1A && b[7] === 0xE1)
    return { ext: "doc", mime: "application/msword" };
  // JPEG  FF D8 FF
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)
    return { ext: "jpg", mime: "image/jpeg" };
  // PNG  89 50 4E 47
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)
    return { ext: "png", mime: "image/png" };
  return null;
}

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cartella, x-anno",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const CORS = corsFor(req);
  const J = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return J({ error: "Metodo non consentito" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Chi sei, dal token e non dal corpo della richiesta.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "Sessione assente: rientra e riprova. Il file non e' stato caricato." }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) {
    return J({ error: "La sessione e' scaduta: rientra e riprova. Il file non e' stato caricato.", detail: uerr?.message ?? null }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // 2) Il permesso lo decide la STESSA funzione che governa l'RLS delle tabelle
  //    dei libri sociali. Se un domani cambia la regola, cambia in un posto solo.
  const { data: puo, error: eRuolo } = await admin.rpc("puo_gestione_associativa", { p_utente: user.id });
  if (eRuolo) return J({ error: "Non riesco a verificare i permessi: il file non e' stato caricato.", detail: eRuolo.message }, 500);
  if (puo !== true) return J({ error: "Questa sezione e' riservata a chi tiene i libri sociali." }, 403);

  // 3) Cartella e anno: l'unica parte del percorso che arriva da fuori, ed e'
  //    ridotta a una scelta fra tre valori noti e a quattro cifre.
  const cartella = (req.headers.get("x-cartella") ?? "").trim();
  if (!CARTELLE.has(cartella)) return J({ error: "Cartella non ammessa." }, 400);
  const annoRaw = Number(req.headers.get("x-anno") ?? "");
  const anno = Number.isInteger(annoRaw) && annoRaw >= 1900 && annoRaw <= 2200
    ? annoRaw : new Date().getFullYear();

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return J({ error: "Il file e' arrivato vuoto: non e' stato caricato." }, 400);
  if (bytes.length > MAX_FILE_BYTES) {
    return J({ error: "Il file supera i 25 MB e non e' stato caricato." }, 413);
  }

  const tipo = sniff(bytes);
  if (!tipo) {
    return J({ error: "Formato non riconosciuto: il libro sociale accetta PDF, Word e immagini (JPG, PNG). Il file non e' stato caricato." }, 400);
  }

  // 4) Scrittura con service role nel bucket privato. Il percorso lo componiamo
  //    noi: {cartella}/{anno}/{istante}-{casuale}.{est}
  const rand = crypto.randomUUID().slice(0, 8);
  const path = `${cartella}/${anno}/${Date.now()}-${rand}.${tipo.ext}`;
  const { error: upErr } = await admin.storage
    .from("libri-sociali").upload(path, bytes, { contentType: tipo.mime, upsert: false });

  // IL PUNTO DI TUTTA LA FUNZIONE: se non e' passato, si dice perche'.
  if (upErr) {
    console.error("[libro-sociale-file] upload fallito:", upErr.message);
    return J({ error: "Il file NON e' stato caricato.", detail: upErr.message }, 500);
  }

  // Bucket privato: nessun indirizzo pubblico esiste, e non se ne restituisce
  // uno. Chi ha titolo lo apre con un collegamento firmato generato al momento.
  return J({ ok: true, path, privato: true, byte: bytes.length, tipo: tipo.mime });
});
