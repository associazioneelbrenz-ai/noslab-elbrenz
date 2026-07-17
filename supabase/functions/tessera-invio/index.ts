// tessera-invio — (re)invio della tessera digitale con QR di verifica (M5.5).
//
// Colma il buco: l'email tessera partiva SOLO alla transizione
// in_attesa→approvata (scheda-domanda); per i soci già approvati (19 storici
// del Libro Soci) non esisteva percorso di invio/reinvio. Questa function è
// il canale amministrativo per prova n.4 + batch, e per futuri reinvii.
//
// SICUREZZA:
//   - gate header `x-ingest-token` == INGEST_TOKEN (stesso pattern DEBT-013
//     di ingest-chunks: canale amministrativo server-to-server, no CORS);
//   - codice/QR/template in _shared/tessera.ts (condiviso con scheda-domanda):
//     codice HMAC deterministico, verifica pubblica via RPC tessera_verifica.
//
// Body POST: { numero: number, to?: string (override recapito, es. email
// condivise n.13/n.14), avviso?: string (riga extra nel corpo) }.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ensureCodiceEQr, tesseraEmailHtml } from '../_shared/tessera.ts';

const ANNO = 2026;
const SITO = 'https://elbrenz.eu';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('INGEST_TOKEN') ?? '';
  const got = req.headers.get('x-ingest-token') ?? '';
  if (!expected || got !== expected) return json({ error: 'Non autorizzato' }, 401);

  const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET');
  const sendSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!adminSecret || !sendSecret) {
    return json({ error: 'Configurazione mancante (ADMIN_ACTION_SECRET / SEND_EMAIL_SHARED_SECRET)' }, 500);
  }
  if (Deno.env.get('TESSERE_LIVE') !== 'true') {
    return json({ error: 'TESSERE_LIVE spento: invio bloccato' }, 409);
  }

  let body: { numero?: unknown; to?: unknown; avviso?: unknown; integrazione?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON non valido' }, 400);
  }
  const numero = Number(body.numero);
  // Tessera 0 = account istituzionale (info@elbrenz.eu, super_admin): numero
  // valido a tutti gli effetti. Limite inferiore a 0, non a 1 (LAVORO E: il
  // «caso 0 falsy» rifiutava la tessera istituzionale).
  if (!Number.isInteger(numero) || numero < 0 || numero > 100000) {
    return json({ error: 'numero tessera non valido' }, 400);
  }
  const toOverride = typeof body.to === 'string' && body.to.includes('@') ? body.to.trim() : null;
  const avviso = typeof body.avviso === 'string' ? body.avviso.trim().slice(0, 300) : '';
  // integrazione: aggiunge alla tessera il link PERSONALE di pagamento dei 10 €
  // (generato qui dal codice del socio, mai passato dal runner).
  const integrazione = body.integrazione === true;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: socio, error: errSel } = await supabase.from('domande_tesseramento')
    .select('id, nome, email, anno, stato, numero_tessera, codice_tessera')
    .eq('numero_tessera', numero)
    .eq('stato', 'approvata')
    .maybeSingle();
  if (errSel) return json({ error: `Lettura domanda fallita: ${errSel.message}` }, 500);
  if (!socio) return json({ error: `Nessun socio approvato con tessera n. ${numero}` }, 404);

  const anno = socio.anno ?? ANNO;
  let codice = '';
  let urlVerifica = '';
  let qrUrl = '';
  try {
    ({ codice, urlVerifica, qrUrl } = await ensureCodiceEQr(
      supabase,
      { id: socio.id, numero_tessera: numero, anno, codice_tessera: socio.codice_tessera },
      adminSecret,
    ));
  } catch (e) {
    return json({ ok: false, numero, error: String(e) }, 500);
  }

  // Link integrazione PERSONALE = /integrazione/{codice} del socio (il codice è
  // gia' l'HMAC per-socio: nessun token nuovo, nessun segreto passato dal runner).
  const integrazioneUrl = integrazione ? `${SITO}/integrazione/${codice}` : undefined;
  // Recapiti condivisi n.13/n.14: nota che chiarisce di chi e' la tessera.
  const avvisoFinale = (numero === 13 || numero === 14)
    ? `Nota: questa email riguarda la tessera di ${socio.nome}.`
    : avviso;

  const tesseraHtml = tesseraEmailHtml({
    nome: socio.nome,
    numero,
    anno,
    qrUrl,
    urlVerifica,
    intro: `Ecco la tua tessera digitale <em>dla nosa Sociazion</em> per l'anno ${anno}. Il codice QR permette a chiunque — ad esempio un esercente convenzionato — di verificarne la validità in tempo reale su <a href="${urlVerifica}" style="color:#8a6215;">elbrenz.eu</a>.`,
    avviso: avvisoFinale,
    integrazioneUrl,
  });

  const destinatario = toOverride ?? socio.email;
  try {
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sendSecret },
      body: JSON.stringify({
        to: destinatario,
        subject: `La tua tessera El Brenz n. ${numero} (${anno})`,
        html: tesseraHtml,
        tags: [{ name: 'source', value: 'tessera-qr' }],
      }),
    });
    if (!resp.ok) {
      return json({ ok: false, numero, codice, error: `send-email ${resp.status}` }, 502);
    }
  } catch {
    return json({ ok: false, numero, codice, error: 'send-email irraggiungibile' }, 502);
  }

  await supabase.from('domande_tesseramento')
    .update({ tessera_inviata: true, updated_at: new Date().toISOString() })
    .eq('id', socio.id);

  return json({ ok: true, numero, codice, url_verifica: urlVerifica, qr: qrUrl, inviato_a: destinatario, url_integrazione: integrazioneUrl ?? null });
});
