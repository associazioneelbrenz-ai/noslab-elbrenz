// tessere-qr-orfani — rimuove dallo Storage i QR di tessere che non
// appartengono piu' a nessuno.
//
// [4/8/2026] Nasce da un caso minuscolo e da un problema che ritorna. Il
// collaudo del 3 agosto ha fatto assegnare la tessera 30 a una domanda di
// prova; la domanda e' stata cancellata, ma il QR e' rimasto nel bucket
// pubblico, raggiungibile da chiunque conosca l'indirizzo. Non e' un dato
// sensibile, ma e' una tessera che non esiste, servita da un dominio nostro.
//
// Cancellare a mano non si puo': Supabase blocca la DELETE diretta su
// storage.objects (protect_delete), e la chiave service role vive solo qui
// dentro. Da qui si passa dall'API di Storage, che e' la strada giusta.
//
// COSA CANCELLA, e nient'altro: i file sotto `tessere/qr/` il cui numero di
// tessera NON compare in domande_tesseramento. Se il numero c'e', il file
// resta, punto. Non c'e' modo di far cancellare a questa funzione un QR di un
// socio vero, nemmeno sbagliando i parametri: non prende parametri.
//
// SICUREZZA: gate header `x-ingest-token` == INGEST_TOKEN, lo stesso canale
// amministrativo di solleciti-domande e tessera-invio. verify_jwt=false
// dichiarato in config.toml: il gate e' il token, non il JWT.
//
// DRY-RUN DI DEFAULT: senza `?esegui=1` non cancella niente e si limita a
// dire cosa toglierebbe. Una funzione che cancella deve chiedere il permesso
// due volte.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'assets-pubblici';
const PREFISSO = 'tessere/qr';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const atteso = Deno.env.get('INGEST_TOKEN');
  if (!atteso) return json({ error: 'INGEST_TOKEN non configurato' }, 500);
  if (req.headers.get('x-ingest-token') !== atteso) return json({ error: 'non autorizzato' }, 401);

  const esegui = new URL(req.url).searchParams.get('esegui') === '1';

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: file, error: errList } = await sb.storage.from(BUCKET).list(PREFISSO, { limit: 1000 });
  if (errList) return json({ error: 'lettura bucket fallita', dettaglio: errList.message }, 500);

  // I numeri di tessera che esistono davvero. Si legge una volta sola: una
  // query per file sarebbe lenta e, peggio, darebbe risultati incoerenti se
  // qualcuno approvasse una domanda mentre la funzione gira.
  const { data: righe, error: errDom } = await sb
    .from('domande_tesseramento').select('numero_tessera').not('numero_tessera', 'is', null);
  if (errDom) return json({ error: 'lettura domande fallita', dettaglio: errDom.message }, 500);
  const vivi = new Set((righe ?? []).map((r: Record<string, unknown>) => String(r.numero_tessera)));

  const orfani: string[] = [];
  const tenuti: string[] = [];
  for (const f of file ?? []) {
    const nome = (f as Record<string, unknown>).name as string;
    if (!nome || !nome.endsWith('.png')) continue;
    // Formato: {numero}-{anno}-{codice}.png
    const numero = nome.split('-')[0];
    if (!/^\d+$/.test(numero)) continue;
    if (vivi.has(numero)) tenuti.push(nome);
    else orfani.push(`${PREFISSO}/${nome}`);
  }

  if (!esegui) {
    return json({
      dryrun: true,
      messaggio: 'Nessun file toccato. Ripeti con ?esegui=1 per cancellare.',
      da_cancellare: orfani, quanti: orfani.length, tenuti: tenuti.length,
    });
  }

  if (orfani.length === 0) return json({ eseguito: true, cancellati: 0, tenuti: tenuti.length });

  const { error: errDel } = await sb.storage.from(BUCKET).remove(orfani);
  if (errDel) return json({ error: 'cancellazione fallita', dettaglio: errDel.message }, 500);

  console.log('[tessere-qr-orfani] cancellati:', orfani.join(', '));
  return json({ eseguito: true, cancellati: orfani.length, quali: orfani, tenuti: tenuti.length });
});
