// glossario-audio-revisione (25/8/2026) — audit SIC-06.
//
// Le registrazioni non ancora ascoltate nascono in un bucket PRIVATO
// (glossario-audio-attesa): questa funzione è l'unico modo per un curatore
// di sentirle (indirizzo firmato, breve scadenza) e per farle diventare
// pubbliche (sposta il file nel bucket pubblico solo alla pubblicazione).
// Stessa idea già applicata ai video del corso: la validazione è ciò che
// separa il privato dal pubblico, non un bucket comune con la promessa di
// non guardare.
//
// POST MORTEM 26/8/2026. Prima l'indirizzo si ricavava strappando un pezzo
// di testo da `file_url` (che conteneva "/object/public/" anche per il
// bucket privato — un endpoint che per costruzione non può funzionare).
// L'estrazione a stringa aveva continuato a funzionare per puro caso, ma
// era un indirizzo memorizzato: la fotografia di un momento, non una fonte
// di verità. Ora l'unica fonte di verità sono `bucket` e `file_path`,
// colonne che dicono DOVE sta il file, e l'indirizzo — firmato se il
// bucket è privato, pubblico altrimenti — si costruisce al momento
// dell'uso, mai prima, mai lato client.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://elbrenz.eu", "https://www.elbrenz.eu",
  "http://localhost:4321", "http://localhost:3000",
];
const BUCKET_PUBBLICO = "glossario-audio";
const LIVELLO_MINIMO = 25;
const SCADENZA_FIRMA_SECONDI = 300;

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** L'indirizzo si costruisce qui, al momento dell'uso: firmato per un
 * bucket privato, pubblico normale per il bucket pubblico. Mai il contrario. */
async function costruisciIndirizzo(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  scadenzaSecondi = SCADENZA_FIRMA_SECONDI,
): Promise<{ url: string | null; firmato: boolean; errore?: string }> {
  if (bucket === BUCKET_PUBBLICO) {
    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, firmato: false };
  }
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, scadenzaSecondi);
  if (error || !data) return { url: null, firmato: true, errore: error?.message ?? "firma_fallita" };
  return { url: data.signedUrl, firmato: true };
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

  // Stessa soglia delle funzioni di curatela del glossario già in campo
  // (glossario_pubblica_blocco, glossario_correzione_blocco, ecc.): livello
  // >=25 oppure il ruolo dedicato curatore_linguistico.
  const { data: ruoli } = await admin
    .from("utente_ruolo").select("ruolo:ruolo_id(nome, livello)").eq("utente_id", user.id);
  const righeRuolo = (ruoli ?? []) as { ruolo: { nome: string; livello: number } | null }[];
  const livello = Math.max(0, ...righeRuolo.map((r) => r.ruolo?.livello ?? 0));
  const haCuratoreLinguistico = righeRuolo.some((r) => r.ruolo?.nome === "curatore_linguistico");
  if (livello < LIVELLO_MINIMO && !haCuratoreLinguistico) return J({ error: "non_autorizzato" }, 403);

  let b: any;
  try { b = await req.json(); } catch { return J({ error: "invalid_json" }, 400); }
  const azione = String(b?.azione ?? "");

  // La verifica guarda tutta la tabella, non una riga sola: e' la prova che
  // deve impedire che la storia si ripeta (post mortem 26/8/2026, §5). Il
  // terzo controllo — l'indirizzo che risponde davvero — e' quello che
  // conta: gli altri due (colonne valorizzate, file presente) erano veri
  // anche quando l'audio non si ascoltava.
  if (azione === "verifica") {
    const { data: righe, error: eSel } = await admin
      .from("archivio_audio").select("id, titolo, stato, bucket, file_path");
    if (eSel) { console.error("[glossario-audio-revisione] verifica, lettura fallita:", eSel.message); return J({ error: "errore_interno" }, 500); }

    const problemi: { id: string; titolo: string; motivo: string }[] = [];
    for (const r of (righe ?? []) as { id: string; titolo: string; stato: string; bucket: string | null; file_path: string | null }[]) {
      if (!r.bucket || !r.file_path) {
        problemi.push({ id: r.id, titolo: r.titolo, motivo: "manca bucket o percorso a database" });
        continue;
      }
      const cartella = r.file_path.includes("/") ? r.file_path.slice(0, r.file_path.lastIndexOf("/")) : "";
      const nomefile = r.file_path.includes("/") ? r.file_path.slice(r.file_path.lastIndexOf("/") + 1) : r.file_path;
      const { data: elenco, error: eList } = await admin.storage.from(r.bucket).list(cartella, { search: nomefile });
      if (eList || !(elenco ?? []).some((f) => f.name === nomefile)) {
        problemi.push({ id: r.id, titolo: r.titolo, motivo: "il file non esiste nello storage indicato" });
        continue;
      }
      const risultato = await costruisciIndirizzo(admin, r.bucket, r.file_path, 60);
      if (!risultato.url) {
        problemi.push({ id: r.id, titolo: r.titolo, motivo: "indirizzo non costruibile: " + (risultato.errore ?? "") });
        continue;
      }
      try {
        const risposta = await fetch(risultato.url, { method: "GET", headers: { Range: "bytes=0-0" } });
        if (!risposta.ok && risposta.status !== 206) {
          problemi.push({ id: r.id, titolo: r.titolo, motivo: `l'indirizzo risponde ${risposta.status}` });
        }
      } catch (e) {
        problemi.push({ id: r.id, titolo: r.titolo, motivo: "richiesta fallita: " + ((e as Error)?.message ?? "") });
      }
    }
    return J({ ok: true, totale: (righe ?? []).length, problemi });
  }

  const id = String(b?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ error: "id_non_valido" }, 400);

  const { data: riga, error: eRiga } = await admin
    .from("archivio_audio").select("id, stato, bucket, file_path, lemma_id").eq("id", id).maybeSingle();
  if (eRiga) { console.error("[glossario-audio-revisione] lettura fallita:", eRiga.message); return J({ error: "errore_interno" }, 500); }
  if (!riga) return J({ error: "non_trovata" }, 404);

  if (azione === "firma") {
    if (!riga.bucket || !riga.file_path) return J({ error: "percorso_mancante" }, 500);
    const risultato = await costruisciIndirizzo(admin, riga.bucket, riga.file_path);
    if (!risultato.url) {
      console.error("[glossario-audio-revisione] firma fallita:", risultato.errore);
      return J({ error: "firma_fallita" }, 500);
    }
    return J({ ok: true, url: risultato.url, firmato: risultato.firmato });
  }

  if (azione === "decidi") {
    const esito = String(b?.esito ?? "");
    const motivo = b?.motivo ? String(b.motivo).trim().slice(0, 500) : null;
    if (!["pubblicato", "rifiutato"].includes(esito)) return J({ error: "esito_non_valido" }, 400);
    if (esito === "rifiutato" && (!motivo || motivo.length < 3)) {
      return J({ error: "motivo_richiesto", dettaglio: "Scrivi perché la scarti." }, 400);
    }
    // Stesso vincolo di prima: se un altro curatore ha già deciso questa
    // voce nel frattempo, non si sovrascrive una decisione presa.
    if (riga.stato !== "in_attesa") {
      return J({ error: "gia_decisa", dettaglio: "Già decisa da un altro curatore nel frattempo: nessuna modifica." }, 409);
    }

    let bucketFinale = riga.bucket;
    const pathFinale = riga.file_path;
    if (esito === "pubblicato") {
      if (!riga.bucket || !riga.file_path) return J({ error: "percorso_mancante" }, 500);
      if (riga.bucket !== BUCKET_PUBBLICO) {
        // Il file si sposta E le colonne si aggiornano nella stessa
        // operazione (§5 del post mortem): se lo spostamento fallisce, la
        // riga sotto non si tocca, e la voce resta in attesa — mai un
        // record che dice una cosa e uno storage che ne dice un'altra.
        const { error: eSposta } = await admin.storage
          .from(riga.bucket).move(riga.file_path, riga.file_path, { destinationBucket: BUCKET_PUBBLICO });
        if (eSposta) {
          console.error("[glossario-audio-revisione] spostamento file fallito:", eSposta.message);
          return J({ error: "spostamento_fallito", dettaglio: eSposta.message }, 500);
        }
        bucketFinale = BUCKET_PUBBLICO;
      }
    }
    // Il rifiuto lascia il file dov'e', nel riservato: bucket/file_path non
    // cambiano.

    const { data: aggiornata, error: eUpd } = await admin.from("archivio_audio").update({
      stato: esito,
      motivo_rifiuto: esito === "rifiutato" ? motivo : null,
      ascoltato_da: user.id,
      ascoltato_il: new Date().toISOString(),
      bucket: bucketFinale,
      file_path: pathFinale,
    }).eq("id", id).eq("stato", "in_attesa").select("id, lemma_id").maybeSingle();
    if (eUpd || !aggiornata) {
      console.error("[glossario-audio-revisione] aggiornamento fallito:", eUpd?.message);
      return J({ error: "aggiornamento_fallito", dettaglio: eUpd?.message ?? "nessuna riga (forse già decisa nel frattempo)" }, 500);
    }

    let agganciata = false;
    let erroreAggancio: string | null = null;
    if (esito === "pubblicato" && aggiornata.lemma_id) {
      const { error: eLink } = await admin.from("dizionario_lemma")
        .update({ audio_id: id }).eq("id", aggiornata.lemma_id);
      if (eLink) { erroreAggancio = eLink.message; console.error("[glossario-audio-revisione] aggancio al lemma fallito:", eLink.message); }
      else agganciata = true;
    }

    return J({ ok: true, agganciata, erroreAggancio });
  }

  return J({ error: "azione_non_valida" }, 400);
});
