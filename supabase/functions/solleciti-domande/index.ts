// solleciti-domande — sollecito al DIRETTIVO per le domande di tesseramento
// ferme in 'in_attesa' oltre 48h (C.5, 20/7/2026). Pensata per esecuzione
// SCHEDULATA giornaliera (pg_cron), mai pubblica.
//
// Nasce dall'incidente: 3 domande erano rimaste ferme 6 giorni senza che
// nessuno le vedesse. La vista "Domande in coda" (app, C.4) le rende visibili;
// questo e' il promemoria proattivo che bussa da solo.
//
// SICUREZZA: gate header `x-ingest-token` == INGEST_TOKEN (stesso canale
// amministrativo di solleciti-integrazione / tessera-invio). verify_jwt=false
// (dichiarato in config.toml): il gate e' il token, non il JWT.
//
// LOGICA: notifica UNA volta al giorno per domanda (dedup su
// domande_tesseramento.sollecito_direttivo_il). Un solo messaggio aggregato al
// direttivo (l'alert non deve spammare: il dettaglio sta nel pannello). Il
// contenuto e' PII minima (conteggio + anzianita'), coerente con notificaDirettivo.
//
// DRY-RUN: ?dryrun=1 -> nessun invio, nessuna scrittura: ritorna chi verrebbe
// sollecitato. Utile per il collaudo senza far partire il messaggio.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

const SOGLIA_ORE = 48;   // una domanda entra in sollecito dopo 48h di attesa
const RIPETI_ORE = 24;   // e non piu' di una volta ogni 24h

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('INGEST_TOKEN') ?? '';
  if (!expected || req.headers.get('x-ingest-token') !== expected) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const sogliaAttesa = new Date(Date.now() - SOGLIA_ORE * 3600 * 1000).toISOString();
  const sogliaRipeti = new Date(Date.now() - RIPETI_ORE * 3600 * 1000).toISOString();

  // in_attesa da oltre 48h, mai sollecitate o non nelle ultime 24h.
  const { data: domande, error } = await supabase
    .from('domande_tesseramento')
    .select('id, nome, created_at, sollecito_direttivo_il')
    .eq('stato', 'in_attesa')
    .lt('created_at', sogliaAttesa)
    .or(`sollecito_direttivo_il.is.null,sollecito_direttivo_il.lt.${sogliaRipeti}`)
    .order('created_at', { ascending: true });

  if (error) return json({ error: 'query_fallita', detail: error.message }, 500);
  const lista = domande ?? [];

  if (lista.length === 0) {
    return json({ ok: true, dryrun, sollecitate: 0, messaggio: 'nessuna domanda oltre 48h da sollecitare' });
  }

  const giorni = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const piuVecchia = giorni(lista[0].created_at);
  const dettaglio = lista.length === 1
    ? `1 domanda in attesa da ${piuVecchia} giorni. Aprila nel pannello Amministrazione dell'app.`
    : `${lista.length} domande in attesa da oltre 48h (la piu' vecchia da ${piuVecchia} giorni). Controllale nel pannello Amministrazione dell'app.`;

  if (dryrun) {
    return json({
      ok: true, dryrun: true, sollecitate: lista.length,
      anteprima: dettaglio,
      domande: lista.map((d) => ({ id: d.id, nome: d.nome, giorni: giorni(d.created_at) })),
    });
  }

  // Notifica aggregata al direttivo (best-effort). Il tipo 'sollecito_domande'
  // ha il suo toggle in telegram_notifica: se spento, notificaDirettivo esce
  // in silenzio e sotto NON marchiamo (cosi' riprova domani se riacceso).
  let inviata = false;
  try {
    await notificaDirettivo(supabase, 'sollecito_domande', { dettaglio });
    inviata = true;
  } catch (e) {
    console.error('[solleciti-domande] notifica fallita:', e);
  }

  // Marca il sollecito SOLO se l'abbiamo effettivamente tentato (idempotenza a 24h).
  if (inviata) {
    const ids = lista.map((d) => d.id);
    await supabase
      .from('domande_tesseramento')
      .update({ sollecito_direttivo_il: new Date().toISOString() })
      .in('id', ids);
  }

  return json({ ok: true, dryrun: false, sollecitate: lista.length, notifica_inviata: inviata });
});
