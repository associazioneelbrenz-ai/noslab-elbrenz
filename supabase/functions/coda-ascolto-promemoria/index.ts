// coda-ascolto-promemoria (brief "La coda di ascolto", 26/8/2026 §4c) —
// promemoria settimanale al gruppo del direttivo se la coda di ascolto del
// glossario e' ferma da piu' di sette giorni. Non decide da sola quando
// mandarlo: la funzione Postgres lancia_coda_ascolto_promemoria() controlla
// prima che la coda sia davvero non vuota e la voce piu' vecchia superi i
// sette giorni, poi chiama questa funzione — che ricalcola comunque da se',
// non si fida solo del chiamante.
//
// SICUREZZA: gate `x-ingest-token`, stesso canale server-to-server di
// guardiani-digest e solleciti-quota. Nessun CORS: non lo chiama un browser.
//
// GIRO A VUOTO PER DIFETTO: senza `?esegui=1` calcola e restituisce senza
// spedire — stessa convenzione del resto del progetto.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function dataLeggibile(iso: string): string {
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const d = new Date(iso);
  return `${d.getUTCDate()} ${mesi[d.getUTCMonth()]}`;
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

  const { data: righe, error } = await supabase
    .from('v_coda_ascolto')
    .select('audio_id, durata_secondi, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    try {
      await supabase.rpc('registra_battito', {
        p_servizio: 'coda-ascolto-promemoria', p_esito: 'errore', p_dettaglio: { errore: error.message },
      });
    } catch (_) { /* il battito non deve mai rompere il lavoro */ }
    return json({ ok: false, error: error.message }, 500);
  }

  const coda = righe ?? [];
  const n = coda.length;
  const secondi = (coda as any[]).reduce((tot, r) => tot + (r.durata_secondi ?? 0), 0);
  const piuVecchia = coda[0]?.created_at as string | undefined;
  const settimanaFa = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (n === 0 || !piuVecchia || new Date(piuVecchia).getTime() > settimanaFa) {
    // Battito (brief "Il battito dei servizi", 28/8/2026 §3): solo
    // sull'esecuzione vera (?esegui=1), mai su un giro di collaudo.
    if (esegui) {
      try {
        await supabase.rpc('registra_battito', {
          p_servizio: 'coda-ascolto-promemoria', p_esito: 'niente_da_fare', p_dettaglio: { n, secondi },
        });
      } catch (_) { /* il battito non deve mai rompere il lavoro */ }
    }
    return json({
      ok: true, inviato: false, n, secondi,
      nota: n === 0 ? 'coda vuota' : 'la voce piu\' vecchia ha meno di sette giorni',
    });
  }

  if (!esegui) {
    return json({ ok: true, giro_a_vuoto: true, n, secondi, piu_vecchia: piuVecchia });
  }

  await notificaDirettivo(supabase, 'coda_ascolto', {
    n, m: secondi, data: dataLeggibile(piuVecchia),
  }).catch(() => {});

  // Battito (brief "Il battito dei servizi", 28/8/2026 §3).
  try {
    await supabase.rpc('registra_battito', {
      p_servizio: 'coda-ascolto-promemoria', p_esito: 'ok', p_dettaglio: { n, secondi },
    });
  } catch (_) { /* il battito non deve mai rompere il lavoro */ }

  return json({ ok: true, inviato: true, n, secondi, piu_vecchia: piuVecchia });
});
