import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// corso-video-stato (8/9/2026, brief "Caricamento video su Bunny Stream
// dalla PWA soci", Lotto A, sezione 6) — stato di elaborazione del video
// collegato a una lezione, letto da Bunny. La app lo interroga dopo aver
// finito il caricamento TUS (ogni 15 s finche' il video e' pronto o in
// errore) e all'apertura della lezione, per capire se c'e' un caricamento
// lasciato a meta'.
//
// AUTORIZZAZIONE: gate di livello >= 25 come corso-video-libreria; la
// lezione si legge e si aggiorna con la sessione del chiamante (asUser),
// cosi' decidono le RLS "lezione_select" e "lezione_write_collab" gia' in
// vigore. Il client admin serve per utente_ruolo, config_app e il registro
// video_caricamento.
//
// STATI: qui si usa l'enumerazione "status" dell'API Bunny (STATO_API_*),
// la stessa di corso-video-libreria. NON e' quella del webhook (Lotto B),
// che ha numeri diversi: vedi la sezione 2 del brief.
//   0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished
//   5 Error · 6 UploadFailed · 7 JitSegmenting · 8 JitPlaylistsCreated
//
// Nessuna URL di miniatura in questa risposta finche' il Lotto C non e'
// fatto: una URL che da' 403 in UI e' peggio di nessuna.

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
const BUNNY_API = "https://video.bunnycdn.com";
const STATO_API_FINISHED = 4;
const STATO_API_ERROR = 5;
const STATO_API_UPLOAD_FAILED = 6;
const EVENTI_AMMESSI = ["caricato", "annullato"];

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

  // 1) CORS, metodo, identita', gate di livello.
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

  let b: any;
  try { b = await req.json(); } catch { return J({ error: "invalid_json" }, 400); }
  const lezioneId = String(b?.lezione_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lezioneId)) {
    return J({ error: "lezione_non_valida" }, 400);
  }
  const evento = b?.evento == null ? null : String(b.evento);
  if (evento !== null && !EVENTI_AMMESSI.includes(evento)) return J({ error: "evento_non_valido" }, 400);

  // 2) Lezione con la sessione del chiamante: e' la RLS a decidere.
  const { data: lez, error: eLez } = await asUser
    .from("lezione").select("id, video_bunny_id, durata_min").eq("id", lezioneId).maybeSingle();
  if (eLez) { console.error("[corso-video-stato] lettura lezione fallita:", eLez.message); return J({ error: "errore_interno" }, 500); }
  if (!lez) return J({ error: "non_autorizzato" }, 403);
  if (!lez.video_bunny_id) return J({ error: "video_non_collegato" }, 404);
  const videoId = String(lez.video_bunny_id);
  const adesso = () => new Date().toISOString();

  // 3) Evento dal client: aggiorna il registro, poi si legge comunque lo
  // stato reale da Bunny. "caricato" non regredisce una riga gia' pronta o
  // in errore; "annullato" non tocca una riga gia' pronta.
  if (evento === "caricato") {
    await admin.from("video_caricamento")
      .update({ stato: "caricato", aggiornato_il: adesso() })
      .eq("video_bunny_id", videoId).in("stato", ["creato", "in_caricamento"]);
  } else if (evento === "annullato") {
    await admin.from("video_caricamento")
      .update({ stato: "annullato", aggiornato_il: adesso() })
      .eq("video_bunny_id", videoId).neq("stato", "pronto");
  }

  // Configurazione e chiave, come nelle funzioni sorelle.
  const { data: cfgRow, error: eCfg } = await admin
    .from("config_app").select("valore").eq("chiave", "bunny_stream").maybeSingle();
  if (eCfg || !cfgRow?.valore) { console.error("[corso-video-stato] config bunny_stream non leggibile:", eCfg?.message); return J({ error: "configurazione_mancante" }, 500); }
  const cfg = cfgRow.valore as Record<string, unknown>;
  const libraryId = String(cfg.library_id ?? "");
  if (!libraryId) return J({ error: "configurazione_mancante" }, 500);

  const apiKey = Deno.env.get("BUNNY_API_KEY");
  if (!apiKey) {
    return J({
      error: "chiave_api_mancante",
      detail: "Manca il secret BUNNY_API_KEY nei Segreti Supabase: si trova nella scheda «API» della libreria su Bunny Stream (è diversa dalla chiave di firma BUNNY_TOKEN_KEY).",
    }, 500);
  }

  // 4) Stato reale da Bunny.
  let res: Response;
  try {
    res = await fetch(`${BUNNY_API}/library/${libraryId}/videos/${videoId}`, {
      headers: { AccessKey: apiKey, accept: "application/json" },
    });
  } catch (e) {
    console.error("[corso-video-stato] Bunny non raggiungibile:", e);
    return J({ error: "bunny_non_raggiungibile" }, 502);
  }
  if (res.status === 404) {
    // Il video e' stato cancellato su Bunny: la UI deve offrire "Scollega".
    return J({ ok: true, esiste: false });
  }
  if (!res.ok) {
    console.error("[corso-video-stato] Bunny ha risposto", res.status);
    return J({ error: "bunny_errore", detail: `HTTP ${res.status}` }, 502);
  }
  const v = await res.json().catch(() => ({})) as any;

  // 5) Mappatura sull'enumerazione API.
  const status = Number(v?.status);
  const pronto = status === STATO_API_FINISHED;
  const inErrore = status === STATO_API_ERROR || status === STATO_API_UPLOAD_FAILED;
  const lengthSecondi = Number(v?.length) || 0;

  // 6) Pronto: durata compilata solo se vuota (mai sovrascrivere un valore
  // inserito a mano), con la sessione del chiamante. Registro a "pronto".
  if (pronto) {
    if (lez.durata_min == null && lengthSecondi > 0) {
      const durataMin = Math.max(1, Math.round(lengthSecondi / 60));
      const { error: eDur } = await asUser
        .from("lezione")
        .update({ durata_min: durataMin, updated_at: adesso() })
        .eq("id", lezioneId).is("durata_min", null);
      if (eDur) console.error("[corso-video-stato] durata_min non scritta:", eDur.message);
    }
    await admin.from("video_caricamento")
      .update({ stato: "pronto", stato_bunny: status, aggiornato_il: adesso() })
      .eq("video_bunny_id", videoId);
  } else if (inErrore) {
    // 7) Errore di Bunny: registro a "errore".
    await admin.from("video_caricamento")
      .update({ stato: "errore", stato_bunny: status, aggiornato_il: adesso() })
      .eq("video_bunny_id", videoId);
  } else {
    // In corso: si aggiorna solo l'ultimo status letto.
    await admin.from("video_caricamento")
      .update({ stato_bunny: status, aggiornato_il: adesso() })
      .eq("video_bunny_id", videoId);
  }

  // Stato del registro, per la UI: e' l'unico modo in cui la app puo'
  // sapere se un video con status 0 e' un caricamento lasciato a meta'
  // (registro "creato"/"in_caricamento") o un video preso dall'elenco
  // (nessuna riga). La tabella non ha policy di lettura per il client.
  const { data: reg } = await admin
    .from("video_caricamento").select("stato").eq("video_bunny_id", videoId).maybeSingle();

  // 8) Risposta.
  return J({
    ok: true,
    esiste: true,
    status,
    pronto,
    in_errore: inErrore,
    encode_progress: Number(v?.encodeProgress) || 0,
    length_secondi: lengthSecondi,
    risoluzioni: v?.availableResolutions ? String(v.availableResolutions) : null,
    titolo: v?.title ?? null,
    stato_caricamento: reg?.stato ?? null,
  });
});
