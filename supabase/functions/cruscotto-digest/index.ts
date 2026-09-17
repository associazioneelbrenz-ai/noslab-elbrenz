// cruscotto-digest (brief "Cruscotto del direttivo", 27/8/2026 §8) —
// promemoria settimanale al gruppo del direttivo: solo le code in allarme e
// i lavori guasti. REGOLA NON NEGOZIABILE del brief: manda un messaggio
// anche quando e' tutto a posto, una riga sola — il silenzio non deve poter
// significare sia "tutto bene" sia "sono morto".
//
// SICUREZZA: gate x-ingest-token, stesso canale server-to-server delle
// altre funzioni pianificate. Nessun CORS: non lo chiama un browser.
//
// Legge v_cruscotto_code e cruscotto_lavori() col client service-role.
// Verificato: sotto service-role auth.uid() e' null, quindi il gate
// originale has_ruolo_min(auth.uid(),50) dentro quelle due funzioni (e
// dentro cruscotto_conta_domande(), chiamata da v_cruscotto_code) falliva
// sempre — "select * from cruscotto_lavori()" impersonando service_role
// dava "Il cruscotto e riservato al direttivo". Allargato il gate delle tre
// funzioni ad accettare anche auth.role()='service_role' (migrazione
// cruscotto_gate_service_role_digest), un contesto gia' fidato lato server:
// la service key non lascia mai il server, ed e' comunque protetta a monte
// dal gate x-ingest-token di questa stessa funzione.
//
// cron.job/cron.job_run_details non sono raggiungibili da supabase-js: lo
// schema cron non e' esposto da PostgREST (per questo cruscotto_lavori()
// esiste come funzione SECURITY DEFINER, non come vista diretta) — da qui
// il passaggio dalla RPC invece di un tentativo diretto sullo schema.
//
// GIRO A VUOTO PER DIFETTO: senza ?esegui=1 calcola e restituisce senza
// spedire — stessa convenzione del resto del progetto.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function dataOraLeggibile(iso: string | null): string {
  if (!iso) return 'mai';
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const d = new Date(iso);
  return `${d.getUTCDate()} ${mesi[d.getUTCMonth()]} alle ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const atteso = Deno.env.get('INGEST_TOKEN') ?? '';
  const dato = req.headers.get('x-ingest-token') ?? '';
  if (!atteso || dato !== atteso) return json({ error: 'Non autorizzato' }, 401);

  const esegui = new URL(req.url).searchParams.get('esegui') === '1';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: righeCoda, error: erroreCoda } = await supabase
    .from('v_cruscotto_code').select('coda, giorni_ferma, in_allarme').eq('in_allarme', true);
  if (erroreCoda) {
    try {
      await supabase.rpc('registra_battito', {
        p_servizio: 'cruscotto-digest', p_esito: 'errore', p_dettaglio: { errore: erroreCoda.message },
      });
    } catch (_) { /* il battito non deve mai rompere il lavoro */ }
    return json({ ok: false, error: erroreCoda.message }, 500);
  }

  const { data: lavori, error: erroreLavori } = await supabase.rpc('cruscotto_lavori');
  if (erroreLavori) {
    try {
      await supabase.rpc('registra_battito', {
        p_servizio: 'cruscotto-digest', p_esito: 'errore', p_dettaglio: { errore: erroreLavori.message },
      });
    } catch (_) { /* il battito non deve mai rompere il lavoro */ }
    return json({ ok: false, error: erroreLavori.message }, 500);
  }

  // Servizi in allarme (brief "Il battito dei servizi", 28/8/2026 §4.2): un
  // servizio che non gira e' piu' grave di una coda che si allunga, perche'
  // di solito e' la causa — va prima delle code nel messaggio.
  const { data: servizi, error: erroreServizi } = await supabase.rpc('cruscotto_servizi');
  if (erroreServizi) {
    try {
      await supabase.rpc('registra_battito', {
        p_servizio: 'cruscotto-digest', p_esito: 'errore', p_dettaglio: { errore: erroreServizi.message },
      });
    } catch (_) { /* il battito non deve mai rompere il lavoro */ }
    return json({ ok: false, error: erroreServizi.message }, 500);
  }

  const lavoriGuasti = ((lavori ?? []) as any[])
    .filter((l) => l.in_allarme)
    .map((l) => ({ lavoro: l.lavoro, esito: l.esito }));
  const radar = ((lavori ?? []) as any[]).find((l) => l.lavoro === 'radar-eventi-harvest');
  const radarUltimo = radar?.esito === 'succeeded' ? (radar.ultima_esecuzione as string) : null;

  const serviziGuasti = ((servizi ?? []) as any[])
    .filter((s) => s.in_allarme)
    .map((s) => ({ servizio: s.servizio, diagnosi: s.diagnosi }));

  const code = ((righeCoda ?? []) as any[]).map((r) => ({ coda: r.coda, giorni_ferma: r.giorni_ferma }));
  const tuttoAPosto = code.length === 0 && lavoriGuasti.length === 0 && serviziGuasti.length === 0;

  // Versione in produzione (brief "Piano di salvataggio gratuito", 28/8/2026):
  // il sito si pubblica da CLI locale, non da git — un commit su main non
  // dice niente su cosa gira davvero. Una riga sola nel promemoria, letta
  // dallo stesso /versione.json del cruscotto. Se non risponde, non deve
  // rompere il resto del digest: si dice "sconosciuta" e si va avanti.
  //
  // [17/9/2026] IL GUARDIANO NON PUO' MORIRE PERCHE' IL SITO E' LENTO.
  //
  // Questa `fetch` non aveva un tetto di tempo. pg_net chiama la funzione con
  // `timeout_milliseconds := 20000`: se elbrenz.eu tardava, la funzione veniva
  // tagliata a meta' e il battito, che sta in fondo, non veniva mai scritto.
  // E' successo davvero il 14 settembre («Gateway Timeout») e da allora il
  // promemoria del direttivo ha smesso di partire, senza che nessuno lo
  // sapesse: e' il guasto peggiore possibile, perche' e' proprio questa la
  // funzione che dovrebbe raccontare i guasti. Cinque secondi bastano e
  // avanzano per un file di tre righe; se non arriva, si dice «sconosciuta» e
  // si va avanti, che era gia' l'intenzione scritta qui sotto.
  let versione: { commit: string; giorni: number | null } = { commit: 'sconosciuta', giorni: null };
  try {
    const rv = await fetch('https://elbrenz.eu/versione.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (rv.ok) {
      const v = await rv.json();
      const giorni = v.costruito_il ? Math.floor((Date.now() - new Date(v.costruito_il).getTime()) / 86400000) : null;
      versione = { commit: v.commit ?? 'sconosciuta', giorni };
    }
  } catch (_) { /* il digest non deve mai rompersi per questo */ }

  if (!esegui) {
    return json({ ok: true, giro_a_vuoto: true, tutto_a_posto: tuttoAPosto, servizi: serviziGuasti, code, lavori_guasti: lavoriGuasti, versione });
  }

  // [17/9/2026] Stesso motivo del tetto qui sopra: `notificaDirettivo` fa una
  // sua `fetch` verso telegram-bot, anche quella senza limite di tempo, e sta
  // PRIMA della scrittura del battito. Se Telegram non risponde, senza questa
  // corsa la funzione muore qui e il battito non si scrive: resteremmo di
  // nuovo senza sapere niente. Otto secondi, poi si prosegue comunque, e il
  // battito dira' se il messaggio e' partito o no.
  let messaggioInviato = true;
  try {
    await Promise.race([
      notificaDirettivo(supabase, 'cruscotto_allarmi', {
        tuttoAPosto,
        servizi: serviziGuasti,
        code,
        versione,
        lavori: lavoriGuasti,
        radarUltimo: dataOraLeggibile(radarUltimo),
      }),
      new Promise((_, ko) => setTimeout(() => ko(new Error('telegram_lento')), 8000)),
    ]);
  } catch (_) { messaggioInviato = false; }

  // Battito (brief "Il battito dei servizi", 28/8/2026 §3).
  try {
    await supabase.rpc('registra_battito', {
      p_servizio: 'cruscotto-digest',
      p_esito: 'ok',
      p_dettaglio: { tutto_a_posto: tuttoAPosto, servizi_guasti: serviziGuasti.length, code_in_allarme: code.length, lavori_guasti: lavoriGuasti.length, messaggio_inviato: messaggioInviato },
    });
  } catch (_) { /* il battito non deve mai rompere il lavoro */ }

  return json({ ok: true, inviato: messaggioInviato, tutto_a_posto: tuttoAPosto, servizi: serviziGuasti, code, lavori_guasti: lavoriGuasti });
});
