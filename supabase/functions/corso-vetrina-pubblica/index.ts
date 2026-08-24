import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// corso-vetrina-pubblica (24/8/2026) — la vetrina pubblica sul sito per il
// corso interno (video Bunny). Diversa da corso_vetrina/Corsi.tsx (il ponte
// verso NosLab Learn): qui si mostra un assaggio di un corso che vive DENTRO
// la Community, per chi ancora non è socio.
//
// Nessuna sessione: il sito è anonimo, quindi si legge con la chiave di
// servizio (mai nel browser, solo qui) e si filtra a mano cio' che e'
// davvero pubblico — pubblicato/pubblicata, indipendentemente dal
// livello_accesso (quello regola la Community, non l'assaggio pubblico).
// Non si selezionano MAI video_bunny_id, video_url, video_url_originale,
// trascrizione, allegati_urls: l'assaggio e' solo titoli e durate.

const ALLOWED_ORIGINS = [
  "https://elbrenz.eu",
  "https://www.elbrenz.eu",
  "http://localhost:4321",
];

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const CORS = corsFor(req);
  const J = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return J({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: corsi, error: eCorsi } = await admin
    .from("corso")
    .select("id, titolo, slug, sottotitolo, descrizione, immagine_copertina_url")
    .eq("pubblicato", true)
    .order("titolo");
  if (eCorsi) {
    console.error("[corso-vetrina-pubblica] lettura corsi fallita:", eCorsi.message);
    return J({ error: "errore_interno" }, 500);
  }
  if (!corsi?.length) return J({ ok: true, corsi: [] });

  const corsoIds = corsi.map((c) => c.id);
  const [{ data: moduli, error: eModuli }, { data: lezioni, error: eLezioni }] = await Promise.all([
    admin.from("modulo_corso").select("id, corso_id, titolo, ordine").in("corso_id", corsoIds).order("ordine"),
    admin.from("lezione").select("modulo_id, corso_id, titolo, durata_min, ordine")
      .in("corso_id", corsoIds).eq("pubblicata", true).order("ordine"),
  ]);
  if (eModuli || eLezioni) {
    console.error("[corso-vetrina-pubblica] lettura moduli/lezioni fallita:", eModuli?.message, eLezioni?.message);
    return J({ error: "errore_interno" }, 500);
  }

  const esito = corsi.map((c) => {
    const suoiModuli = (moduli ?? []).filter((m) => m.corso_id === c.id);
    const sueLezioni = (lezioni ?? []).filter((l) => l.corso_id === c.id);
    return {
      ...c,
      totale_lezioni: sueLezioni.length,
      totale_minuti: sueLezioni.reduce((s, l) => s + (l.durata_min ?? 0), 0),
      moduli: suoiModuli.map((m) => ({
        titolo: m.titolo,
        lezioni: sueLezioni.filter((l) => l.modulo_id === m.id).map((l) => ({ titolo: l.titolo, durata_min: l.durata_min })),
      })),
    };
  });

  return J({ ok: true, corsi: esito });
});
