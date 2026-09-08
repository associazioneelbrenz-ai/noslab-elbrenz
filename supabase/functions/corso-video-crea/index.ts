import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// corso-video-crea (8/9/2026, brief "Caricamento video su Bunny Stream dalla
// PWA soci", Lotto A, sezione 5) — primo passo del caricamento di un video
// dalla app: crea l'oggetto video vuoto su Bunny, lo collega SUBITO alla
// lezione (cosi' se l'utente chiude la app a meta' ritrova "caricamento non
// completato" e puo' riprendere), scrive una riga nel registro
// video_caricamento e restituisce al client la firma temporanea con cui
// tus-js-client carica il file DIRETTAMENTE su Bunny. Il file non passa mai
// da Supabase.
//
// SEGRETI: BUNNY_API_KEY (scheda "API" della libreria su Bunny, diversa
// dalla chiave di firma BUNNY_TOKEN_KEY) resta qui. L'unica cosa che esce e'
// la firma TUS, sha256 esadecimale di (library_id + api_key + scadenza +
// video_id): e' progettata da Bunny per essere data al client e vale solo
// per quel video_id fino alla scadenza. Mai loggare firma, chiave o il
// corpo delle risposte di Bunny: solo codici.
//
// AUTORIZZAZIONE: stessa soglia di corso-video-libreria (livello >= 25,
// "collaboratore") per il gate iniziale; la lezione pero' si legge E si
// aggiorna con la sessione del chiamante (client asUser: anon key + suo
// JWT), cosi' sono le RLS "lezione_select" e "lezione_write_collab" gia' in
// vigore a decidere, non una regola riscritta qui. Il client admin (service
// role) serve solo per utente_ruolo, config_app e il registro.
//
// Gli status del video usati qui sono quelli dell'API Bunny (STATO_API_*),
// NON quelli del webhook (Lotto B): vedi la sezione 2 del brief.

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
// Limite iniziale sulla dimensione dichiarata dal client (8 GB): da rivedere
// dopo il primo mese d'uso, come dice il brief.
const MAX_BYTE = 8 * 1024 * 1024 * 1024;
// Durata della firma TUS: 24 ore. Bunny consiglia almeno 3600 s.
const DURATA_FIRMA_SECONDI = 86400;
const BUNNY_API = "https://video.bunnycdn.com";
const ENDPOINT_TUS = "https://video.bunnycdn.com/tusupload";
// Stati del registro per cui un video gia' collegato si puo' riprendere:
// l'oggetto su Bunny esiste ma il file non e' mai arrivato tutto.
const STATI_RIPRENDIBILI = ["creato", "in_caricamento"];

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

  // 1) CORS e metodo.
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return J({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 2) Identita' certa dal token.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized" }, 401);

  // 3) Gate di livello: >= 25, come corso-video-libreria.
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: ruoli } = await admin
    .from("utente_ruolo").select("ruolo:ruolo_id(livello)").eq("utente_id", user.id);
  const livello = Math.max(0, ...(((ruoli ?? []) as any[]).map((r) => r?.ruolo?.livello ?? 0)));
  if (livello < LIVELLO_MINIMO) return J({ error: "non_autorizzato" }, 403);

  // 4) Input.
  let b: any;
  try { b = await req.json(); } catch { return J({ error: "invalid_json" }, 400); }
  const lezioneId = String(b?.lezione_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lezioneId)) {
    return J({ error: "lezione_non_valida" }, 400);
  }
  const titolo = String(b?.titolo ?? "").trim();
  if (titolo.length < 1 || titolo.length > 200) return J({ error: "titolo_non_valido" }, 400);
  const mime = String(b?.mime ?? "").trim();
  if (!mime.startsWith("video/")) return J({ error: "tipo_file_non_valido" }, 400);
  const byte = Number(b?.byte);
  if (!Number.isInteger(byte) || byte <= 0) return J({ error: "dimensione_non_valida" }, 400);
  if (byte > MAX_BYTE) return J({ error: "file_troppo_grande", detail: "Il file supera il limite di 8 GB" }, 400);

  // 5) La lezione si legge CON LA SESSIONE DI CHI CHIEDE: e' la RLS a dire
  // se questa persona ci arriva. Nessuna riga = 403, come lezione-firma-video.
  const { data: lez, error: eLez } = await asUser
    .from("lezione").select("id, titolo, video_bunny_id").eq("id", lezioneId).maybeSingle();
  if (eLez) { console.error("[corso-video-crea] lettura lezione fallita:", eLez.message); return J({ error: "errore_interno" }, 500); }
  if (!lez) return J({ error: "non_autorizzato" }, 403);

  // 6) Video gia' collegato: si riusa solo se il registro dice che il file
  // non e' mai arrivato tutto (caso "riprendi"). In ogni altro caso (video
  // pronto, o preso dall'elenco) sovrascrivere in silenzio non e' accettabile.
  let videoId: string | null = null;
  let ripresa = false;
  if (lez.video_bunny_id) {
    const { data: reg, error: eReg } = await admin
      .from("video_caricamento").select("id, stato").eq("video_bunny_id", lez.video_bunny_id).maybeSingle();
    if (eReg) { console.error("[corso-video-crea] lettura registro fallita:", eReg.message); return J({ error: "errore_interno" }, 500); }
    if (reg && STATI_RIPRENDIBILI.includes(reg.stato)) {
      videoId = String(lez.video_bunny_id);
      ripresa = true;
    } else {
      return J({
        error: "video_gia_collegato",
        detail: "Questa lezione ha gia' un video collegato. Scollegalo prima di caricarne un altro.",
      }, 409);
    }
  }

  // 7) Configurazione Bunny da config_app (mai cablata nel codice).
  const { data: cfgRow, error: eCfg } = await admin
    .from("config_app").select("valore").eq("chiave", "bunny_stream").maybeSingle();
  if (eCfg || !cfgRow?.valore) { console.error("[corso-video-crea] config bunny_stream non leggibile:", eCfg?.message); return J({ error: "configurazione_mancante" }, 500); }
  const cfg = cfgRow.valore as Record<string, unknown>;
  const libraryId = String(cfg.library_id ?? "");
  if (!libraryId) return J({ error: "configurazione_mancante" }, 500);

  // 8) Chiave API: stesso messaggio di corso-video-libreria.
  const apiKey = Deno.env.get("BUNNY_API_KEY");
  if (!apiKey) {
    return J({
      error: "chiave_api_mancante",
      detail: "Manca il secret BUNNY_API_KEY nei Segreti Supabase: si trova nella scheda «API» della libreria su Bunny Stream (è diversa dalla chiave di firma BUNNY_TOKEN_KEY).",
    }, 500);
  }

  if (ripresa && videoId) {
    // Ripresa: nessun nuovo oggetto su Bunny, solo una firma nuova. Nel
    // registro si segna che un caricamento e' (di nuovo) in corso.
    await admin.from("video_caricamento")
      .update({ stato: "in_caricamento", aggiornato_il: new Date().toISOString() })
      .eq("video_bunny_id", videoId);
  } else {
    // 9) Crea l'oggetto video su Bunny.
    let res: Response;
    try {
      res = await fetch(`${BUNNY_API}/library/${libraryId}/videos`, {
        method: "POST",
        headers: { AccessKey: apiKey, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ title: titolo }),
      });
    } catch (e) {
      console.error("[corso-video-crea] Bunny non raggiungibile:", e);
      return J({ error: "bunny_non_raggiungibile" }, 502);
    }
    if (!res.ok) {
      console.error("[corso-video-crea] Bunny ha risposto", res.status);
      return J({ error: "bunny_errore", detail: `HTTP ${res.status}` }, 502);
    }
    const creato = await res.json().catch(() => ({}));
    const guid = String((creato as any)?.guid ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(guid)) {
      console.error("[corso-video-crea] Bunny ha risposto senza guid");
      return J({ error: "bunny_errore", detail: "risposta senza guid" }, 502);
    }

    // 10) Scrittura in due passi con verifica. La lezione si aggiorna con
    // la sessione del chiamante: e' la RLS "lezione_write_collab" a decidere.
    const { data: agg, error: eAgg } = await asUser
      .from("lezione")
      .update({ video_bunny_id: guid, updated_at: new Date().toISOString() })
      .eq("id", lezioneId)
      .select("id");
    if (eAgg || !agg || agg.length !== 1) {
      // L'oggetto su Bunny resta orfano: lo raccoglie il Lotto D.
      console.error("[corso-video-crea] update lezione negato per", lezioneId);
      return J({ error: "non_autorizzato" }, 403);
    }

    const { error: eIns } = await admin.from("video_caricamento").insert({
      lezione_id: lezioneId,
      video_bunny_id: guid,
      titolo,
      mime,
      byte_dichiarati: byte,
      stato: "creato",
      creato_da: user.id,
    });
    if (eIns) {
      // Senza registro la lezione resterebbe "collegata" a un video che
      // nessuno puo' riprendere: si riporta la lezione com'era e si fallisce.
      console.error("[corso-video-crea] insert registro fallita:", eIns.message);
      await asUser.from("lezione")
        .update({ video_bunny_id: null, updated_at: new Date().toISOString() })
        .eq("id", lezioneId).eq("video_bunny_id", guid);
      return J({ error: "registro_non_scritto" }, 500);
    }

    // Rilettura di conferma, sempre con la sessione del chiamante.
    const { data: conferma } = await asUser
      .from("lezione").select("video_bunny_id").eq("id", lezioneId).maybeSingle();
    if (!conferma || conferma.video_bunny_id !== guid) {
      console.error("[corso-video-crea] scrittura non confermata per", lezioneId);
      return J({ error: "scrittura_non_confermata" }, 500);
    }
    videoId = guid;
  }

  // 11) Firma TUS: sha256(library_id + api_key + scadenza + video_id),
  // stringhe concatenate senza separatori, scadenza in secondi unix come
  // decimale. Gli stessi valori (library_id, scadenza, video_id) vanno
  // rimandati dal client negli header TUS byte per byte.
  const scadenza = Math.floor(Date.now() / 1000) + DURATA_FIRMA_SECONDI;
  const firma = await sha256Hex(libraryId + apiKey + String(scadenza) + videoId);

  // 12) Risposta.
  return J({
    ok: true,
    video_id: videoId,
    library_id: libraryId,
    firma,
    scadenza,
    endpoint: ENDPOINT_TUS,
    ripresa,
  });
});
