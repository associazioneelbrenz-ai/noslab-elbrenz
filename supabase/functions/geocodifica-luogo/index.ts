import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// geocodifica-luogo (23/8/2026) — proxy verso Nominatim per il modulo di
// proposta luoghi (PWA soci + /luoghi-curatela). MAI chiamata dal browser: la
// policy d'uso di Nominatim vieta l'uso non identificato e limita a una
// richiesta al secondo. Fatta dal client, ogni socio userebbe il proprio
// indirizzo di rete e ci farebbe bloccare il servizio senza che nessuno se ne
// accorga.
//
// GATE: chi puo' proporre un luogo (>=50 o curatore_contenuti), verificato
// dentro geocodifica_prenota_slot() — stessa regola di chi scrive su
// luoghi_interesse (policy luoghi_admin_all). Un utente senza permesso viene
// fermato PRIMA di consumare la coda, non dopo.
//
// SERIALIZZAZIONE: geocodifica_prenota_slot() (a database, con lock di riga)
// ritorna il momento in cui e' il turno di questa chiamata. Si aspetta fino a
// quel momento, poi si chiama Nominatim: cosi' due richieste quasi simultanee
// da persone diverse non cadono mai sullo stesso secondo, anche fra invocazioni
// diverse della funzione (che tra loro non condividono memoria).
//
// PLAUSIBILITA': coordinate fuori dal Trentino non si salvano mai. Meglio
// nessuna posizione che una posizione sbagliata su una mappa pubblica.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "https://www.elbrenz.eu",
  "http://localhost:3000",
  "http://localhost:4321",
];

// Viewbox largo attorno alle Valli del Noce (min_lon,min_lat,max_lon,max_lat).
// Senza bounded=1 apposta: da' la precedenza a un risultato qui dentro, ma non
// esclude il resto. Se davvero non c'e' niente in zona, la risposta di
// Nominatim puo' arrivare da fuori — ed e' li' che serve il controllo sotto.
const VIEWBOX = "10.35,46.55,11.30,46.05";
// Trentino-Alto Adige, largo apposta: un margine stretto scarterebbe posti
// veri vicini al bordo (es. verso la Val di Peio, al confine con la Lombardia).
const TRENTINO_BBOX = { latMin: 45.6, latMax: 47.1, lngMin: 10.3, lngMax: 12.5 };

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

  // 1) Identita' certa dal token: stesso pattern di contanti-registra.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized" }, 401);

  let b: any;
  try { b = await req.json(); } catch { return J({ error: "invalid_json" }, 400); }
  const indirizzo = String(b?.indirizzo ?? "").trim().slice(0, 300);
  if (indirizzo.length < 3) return J({ error: "indirizzo_troppo_corto" }, 400);

  // 2) Prenota il turno. Il gate di autorizzazione vive DENTRO questa RPC: un
  // utente senza permesso di scrivere luoghi viene fermato qui, senza far
  // avanzare la coda per chi verra' dopo.
  const { data: slot, error: eSlot } = await asUser.rpc("geocodifica_prenota_slot");
  if (eSlot) {
    const negato = /non autorizzato/i.test(eSlot.message ?? "");
    return J({ error: negato ? "non_autorizzato" : "coda_non_disponibile", detail: eSlot.message }, negato ? 403 : 500);
  }
  const attesaMs = new Date(slot as string).getTime() - Date.now();
  if (attesaMs > 0) await new Promise((r) => setTimeout(r, attesaMs));

  // 3) Nominatim. User-Agent identificativo con recapito, come gia' stabilito
  // per le convenzioni: la policy d'uso lo richiede esplicitamente.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", indirizzo);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("countrycodes", "it");

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "ElBrenzAssociazione/1.0 (info@elbrenz.eu)" } });
  } catch (e) {
    console.error("[geocodifica-luogo] fetch Nominatim fallito:", e);
    return J({ ok: true, esito: "non_trovato", motivo: "servizio_non_raggiungibile" });
  }
  if (!res.ok) {
    console.error("[geocodifica-luogo] Nominatim ha risposto", res.status);
    return J({ ok: true, esito: "non_trovato", motivo: "servizio_non_disponibile" });
  }

  const risultati = await res.json().catch(() => []);
  const primo = Array.isArray(risultati) ? risultati[0] : null;
  if (!primo) {
    console.log(`[geocodifica-luogo] nessun risultato per "${indirizzo}" (utente ${user.id})`);
    return J({ ok: true, esito: "non_trovato" });
  }

  const lat = Number(primo.lat);
  const lng = Number(primo.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return J({ ok: true, esito: "non_trovato", motivo: "coordinate_non_valide" });
  }

  // 4) Plausibilita' lato server: fuori dal Trentino non si salva mai. E'
  // spesso il caso di un "via Roma" o "piazza Duomo" cercato senza contesto.
  if (lat < TRENTINO_BBOX.latMin || lat > TRENTINO_BBOX.latMax || lng < TRENTINO_BBOX.lngMin || lng > TRENTINO_BBOX.lngMax) {
    console.log(`[geocodifica-luogo] scartato fuori Trentino: "${indirizzo}" -> ${lat},${lng} (utente ${user.id})`);
    return J({ ok: true, esito: "non_trovato", motivo: "fuori_zona" });
  }

  console.log(`[geocodifica-luogo] trovato "${indirizzo}" -> ${lat},${lng} (utente ${user.id})`);
  return J({ ok: true, esito: "trovato", lat, lng, display_name: String(primo.display_name ?? indirizzo) });
});
