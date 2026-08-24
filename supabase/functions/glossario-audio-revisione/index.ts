// glossario-audio-revisione (25/8/2026) — audit SIC-06.
//
// Le registrazioni non ancora ascoltate nascono ora in un bucket PRIVATO
// (glossario-audio-attesa): questa funzione è l'unico modo per un curatore
// di sentirle (indirizzo firmato, breve scadenza) e per farle diventare
// pubbliche (sposta il file nel bucket pubblico solo alla pubblicazione).
// Stessa idea già applicata stasera ai video del corso: la validazione è
// ciò che separa il privato dal pubblico, non un bucket comune con la
// promessa di non guardare.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://elbrenz.eu", "https://www.elbrenz.eu",
  "http://localhost:4321", "http://localhost:3000",
];
const BUCKET_ATTESA = "glossario-audio-attesa";
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

function pathDaUrl(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
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
  const righe = (ruoli ?? []) as { ruolo: { nome: string; livello: number } | null }[];
  const livello = Math.max(0, ...righe.map((r) => r.ruolo?.livello ?? 0));
  const haCuratoreLinguistico = righe.some((r) => r.ruolo?.nome === "curatore_linguistico");
  if (livello < LIVELLO_MINIMO && !haCuratoreLinguistico) return J({ error: "non_autorizzato" }, 403);

  let b: any;
  try { b = await req.json(); } catch { return J({ error: "invalid_json" }, 400); }
  const azione = String(b?.azione ?? "");
  const id = String(b?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ error: "id_non_valido" }, 400);

  const { data: riga, error: eRiga } = await admin
    .from("archivio_audio").select("id, stato, file_url, lemma_id").eq("id", id).maybeSingle();
  if (eRiga) { console.error("[glossario-audio-revisione] lettura fallita:", eRiga.message); return J({ error: "errore_interno" }, 500); }
  if (!riga) return J({ error: "non_trovata" }, 404);

  if (azione === "firma") {
    if (riga.stato === "pubblicato") return J({ ok: true, url: riga.file_url, firmato: false });
    const path = pathDaUrl(riga.file_url, BUCKET_ATTESA);
    if (!path) return J({ error: "percorso_non_riconosciuto" }, 500);
    const { data: firmato, error: eFirma } = await admin.storage
      .from(BUCKET_ATTESA).createSignedUrl(path, SCADENZA_FIRMA_SECONDI);
    if (eFirma || !firmato) { console.error("[glossario-audio-revisione] firma fallita:", eFirma?.message); return J({ error: "firma_fallita" }, 500); }
    return J({ ok: true, url: firmato.signedUrl, firmato: true });
  }

  if (azione === "decidi") {
    const esito = String(b?.esito ?? "");
    const motivo = b?.motivo ? String(b.motivo).trim().slice(0, 500) : null;
    if (!["pubblicato", "rifiutato"].includes(esito)) return J({ error: "esito_non_valido" }, 400);
    if (esito === "rifiutato" && (!motivo || motivo.length < 3)) {
      return J({ error: "motivo_richiesto", dettaglio: "Scrivi perché la scarti." }, 400);
    }
    // Stesso vincolo di decidiAudio: se un altro curatore ha già deciso
    // questa voce nel frattempo, non si sovrascrive una decisione presa.
    if (riga.stato !== "in_attesa") {
      return J({ error: "gia_decisa", dettaglio: "Già decisa da un altro curatore nel frattempo: nessuna modifica." }, 409);
    }

    let nuovoUrl = riga.file_url;
    if (esito === "pubblicato") {
      const path = pathDaUrl(riga.file_url, BUCKET_ATTESA);
      if (path) {
        const { error: eSposta } = await admin.storage
          .from(BUCKET_ATTESA).move(path, path, { destinationBucket: BUCKET_PUBBLICO });
        if (eSposta) {
          console.error("[glossario-audio-revisione] spostamento file fallito:", eSposta.message);
          return J({ error: "spostamento_fallito", dettaglio: eSposta.message }, 500);
        }
        nuovoUrl = admin.storage.from(BUCKET_PUBBLICO).getPublicUrl(path).data.publicUrl;
      }
      // path nullo: file già fuori dal bucket d'attesa (caso raro, non blocca
      // la decisione — l'indirizzo resta quello che era).
    }

    const { data: aggiornata, error: eUpd } = await admin.from("archivio_audio").update({
      stato: esito,
      motivo_rifiuto: esito === "rifiutato" ? motivo : null,
      ascoltato_da: user.id,
      ascoltato_il: new Date().toISOString(),
      file_url: nuovoUrl,
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
