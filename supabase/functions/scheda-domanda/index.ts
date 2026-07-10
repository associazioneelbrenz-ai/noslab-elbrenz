// scheda-domanda — scheda HTML per il Direttivo con approvazione a un click
// (M2.6-ter). Server-rendered da questa function, NON nel sito statico.
//
// SICUREZZA:
//   - accesso SOLO con token HMAC firmato (ADMIN_ACTION_SECRET, scadenza
//     30 giorni) incluso nel link della mail al Direttivo;
//   - scope separati: il token 'vista' NON autorizza l'approvazione — i
//     bottoni portano token 'azione' distinti;
//   - X-Robots-Tag noindex + meta robots; nessun elenco navigabile;
//   - idempotenza: approva agisce SOLO su stato 'in_attesa' con UPDATE
//     condizionato — doppio click non invia due tessere né brucia numeri.
//
// NUMERAZIONE: numero_tessera = max(TESSERA_SEED, max(esistenti)+1).
// Seed = 20 (Libro Soci: 1-19 assegnate manualmente, righe storiche a DB).
//
// TESSERE_LIVE (secret, 'true' per attivare): finché spento, l'approvazione
// assegna numero e stato ma NON invia l'email tessera al socio (Resend
// senza dominio autenticato). La scheda lo dichiara esplicitamente.
//
// FASE 1 dichiarata: tessera come email HTML brandizzata, PDF in fase 2.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaToken, verificaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';
import { ensureCodiceEQr, tesseraEmailHtml } from '../_shared/tessera.ts';

const ANNO = 2026;

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function pagina(titolo: string, corpo: string): Response {
  const html = `<!DOCTYPE html>
<html lang="it"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>${esc(titolo)} — El Brenz</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #F8F1E4; color: #1E2E26; margin: 0; padding: 24px; }
  .card { max-width: 640px; margin: 0 auto; background: #fff; border-top: 4px solid #C8923E; border-radius: 8px; padding: 32px; }
  h1 { font-family: Georgia, 'Playfair Display', serif; font-size: 26px; margin: 0 0 4px; }
  .occhiello { color: #C8923E; text-transform: uppercase; letter-spacing: .18em; font-size: 11px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 9px 0; border-bottom: 1px solid #eee; font-size: 15px; vertical-align: top; }
  td:first-child { color: #666; font-size: 13px; width: 150px; }
  .stato { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .in_attesa { background: #fdf3df; color: #8a6215; } .approvata { background: #eaf3ee; color: #2d8659; }
  .respinta { background: #fbecec; color: #a33; }
  .pag-ok { background: #eaf3ee; border-left: 3px solid #2d8659; padding: 12px 16px; }
  .pag-no { background: #FDF9F0; border-left: 3px solid #C8923E; padding: 12px 16px; }
  .btn { display: inline-block; padding: 13px 26px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 14px; border: 0; cursor: pointer; }
  .btn-ok { background: #C8923E; color: #1E2E26; } .btn-no { background: #fff; color: #a33; border: 2px solid #d97a7a; }
  .nota { color: #999; font-size: 12px; margin-top: 20px; }
  form { display: inline-block; margin-right: 12px; margin-top: 16px; }
</style></head>
<body><div class="card">${corpo}</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

function erroreHtml(msg: string): Response {
  return pagina('Accesso negato', `
    <p class="occhiello">El Brenz · Area riservata</p>
    <h1>Accesso negato</h1>
    <p>${esc(msg)}</p>
    <p class="nota">Se il link è scaduto, apri la mail più recente della domanda o scrivi a info@elbrenz.eu.</p>`);
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('ADMIN_ACTION_SECRET');
  if (!secret) {
    return erroreHtml('Configurazione mancante (ADMIN_ACTION_SECRET non impostato — vedi docs/SETUP_PAYPAL.md).');
  }

  const url = new URL(req.url);
  // Parametri sia nel PATH (nuovo, immune all'encoding quoted-printable delle
  // email: un `=` seguito da due cifre esadecimali viene corrotto) sia in
  // query string (retrocompatibile con i link già inviati).
  //   Path vista:  /scheda-domanda/vista/{d}/{exp}/{t}
  //   Path azione: /scheda-domanda/azione/{approva|respingi}/{d}/{exp}/{t}
  let d = url.searchParams.get('d') ?? '';
  let exp = parseInt(url.searchParams.get('exp') ?? '', 10);
  let t = url.searchParams.get('t') ?? '';
  let azione = url.searchParams.get('azione'); // per POST: approva | respingi
  const mAz = url.pathname.match(/\/azione\/(approva|respingi)\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
  const mVista = url.pathname.match(/\/vista\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
  if (mAz) {
    azione = mAz[1]; d = mAz[2]; exp = parseInt(mAz[3], 10); t = mAz[4];
  } else if (mVista) {
    d = mVista[1]; exp = parseInt(mVista[2], 10); t = mVista[3];
  }

  if (!/^[0-9a-f-]{36}$/.test(d)) return erroreHtml('Link non valido.');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ---------------------------------------------------------------- POST: azioni
  if (req.method === 'POST' && (azione === 'approva' || azione === 'respingi')) {
    const okToken = await verificaToken(secret, `azione-${azione}`, d, exp, t);
    if (!okToken) return erroreHtml('Token azione non valido o scaduto.');

    if (azione === 'respingi') {
      const { data: agg } = await supabase.from('domande_tesseramento')
        .update({ stato: 'respinta', approvata_da: 'via email-link segretario', approvata_il: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', d).eq('stato', 'in_attesa')
        .select('id');
      const fatto = agg && agg.length > 0;
      return pagina('Domanda respinta', `
        <p class="occhiello">El Brenz · Tesseramento</p>
        <h1>${fatto ? 'Domanda segnata come respinta' : 'Nessuna modifica'}</h1>
        <p>${fatto ? 'La domanda è stata respinta. Nessuna comunicazione automatica è stata inviata al richiedente.' : 'La domanda non era più in attesa (già approvata o respinta in precedenza).'}</p>`);
    }

    // --- APPROVA: idempotente, un solo numero, un solo invio -----------------
    const seed = parseInt(Deno.env.get('TESSERA_SEED') ?? '', 10);
    if (!Number.isFinite(seed)) {
      return erroreHtml('TESSERA_SEED non configurato: approvazione bloccata per proteggere la numerazione del Libro Soci.');
    }

    // numero = max(seed, max(numero_tessera)+1); UPDATE condizionato su
    // stato='in_attesa' ⇒ il doppio click non rientra (0 righe aggiornate).
    const { data: maxRow } = await supabase.from('domande_tesseramento')
      .select('numero_tessera')
      .not('numero_tessera', 'is', null)
      .order('numero_tessera', { ascending: false })
      .limit(1)
      .maybeSingle();
    const numero = Math.max(seed, (maxRow?.numero_tessera ?? 0) + 1);

    const { data: agg } = await supabase.from('domande_tesseramento')
      .update({
        stato: 'approvata',
        numero_tessera: numero,
        scadenza: `${ANNO}-12-31`,
        approvata_da: 'via email-link segretario',
        approvata_il: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', d).eq('stato', 'in_attesa')
      .select('id, nome, email');

    if (!agg || agg.length === 0) {
      const { data: gia } = await supabase.from('domande_tesseramento')
        .select('stato, numero_tessera').eq('id', d).maybeSingle();
      return pagina('Già gestita', `
        <p class="occhiello">El Brenz · Tesseramento</p>
        <h1>Nessuna modifica</h1>
        <p>La domanda risulta già <strong>${esc(gia?.stato ?? 'gestita')}</strong>${gia?.numero_tessera ? ` con tessera n. <strong>${gia.numero_tessera}</strong>` : ''}. Nessuna nuova tessera inviata, nessun numero bruciato.</p>`);
    }

    const socio = agg[0];
    const tessereLive = Deno.env.get('TESSERE_LIVE') === 'true';
    let esitoInvio = `<p class="nota">⚠ Invio email tessera DISATTIVATO (flag TESSERE_LIVE spento: Resend senza dominio autenticato). La tessera n. ${numero} è assegnata: inviala dopo l'attivazione.</p>`;

    if (tessereLive) {
      const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
      if (sharedSecret) {
        // AGGIORNATO 10/7 (autorizzazione puntuale): template allineato al
        // design tessera QR (M5.5) — card scura, bandiera ladina, filigrana
        // Aquila, QR di verifica. Rendering condiviso in _shared/tessera.ts
        // (stesso di tessera-invio). La logica di approvazione è invariata.
        try {
          const { urlVerifica, qrUrl } = await ensureCodiceEQr(
            supabase,
            { id: d, numero_tessera: numero, anno: ANNO, codice_tessera: null },
            secret,
          );
          const tesseraHtml = tesseraEmailHtml({
            nome: socio.nome,
            numero,
            anno: ANNO,
            qrUrl,
            urlVerifica,
            intro: `Benvenuto nella <em>nosa Sociazion</em>! La tua domanda è stata approvata dal Consiglio Direttivo: questa email vale come tessera digitale per l'anno ${ANNO}.`,
          });
          const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sharedSecret },
            body: JSON.stringify({
              to: socio.email,
              subject: `Benvenuto in El Brenz — tessera n. ${numero} (${ANNO})`,
              html: tesseraHtml,
              tags: [{ name: 'source', value: 'tessera' }],
            }),
          });
          if (resp.ok) {
            await supabase.from('domande_tesseramento')
              .update({ tessera_inviata: true, updated_at: new Date().toISOString() }).eq('id', d);
            esitoInvio = `<p style="color:#2d8659;">✓ Tessera digitale inviata a <strong>${esc(socio.email)}</strong>.</p>`;
          } else {
            esitoInvio = `<p style="color:#a33;">⚠ Invio email tessera fallito (${resp.status}): riprovare o inviare manualmente.</p>`;
          }
        } catch {
          esitoInvio = `<p style="color:#a33;">⚠ Invio email tessera fallito (rete): riprovare o inviare manualmente.</p>`;
        }
      }
    }

    return pagina('Domanda approvata', `
      <p class="occhiello">El Brenz · Tesseramento</p>
      <h1>Domanda approvata ✓</h1>
      <p><strong>${esc(socio.nome)}</strong> è socio ${ANNO} con tessera <strong>n. ${numero}</strong> (scadenza 31/12/${ANNO}).</p>
      ${esitoInvio}
      <p class="nota">Approvazione registrata: via email-link segretario, ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}. Ricordare la ratifica nel prossimo verbale del CD.</p>`);
  }

  // ---------------------------------------------------------------- GET: scheda
  const okVista = await verificaToken(secret, 'vista', d, exp, t);
  if (!okVista) return erroreHtml('Token non valido o scaduto (i link valgono 30 giorni).');

  const { data: dom } = await supabase.from('domande_tesseramento')
    .select('*').eq('id', d).maybeSingle();
  if (!dom) return erroreHtml('Domanda non trovata.');

  const { data: pagamenti } = await supabase.from('pagamenti_tesseramento')
    .select('stato, metodo, importo, anomalia, created_at')
    .or(`domanda_id.eq.${d},email.ilike.${dom.email}`)
    .eq('tipo', 'quota')
    .order('created_at', { ascending: false })
    .limit(3);

  const pagHtml = (pagamenti && pagamenti.length > 0)
    ? pagamenti.map((p) => `<div class="${p.stato === 'completato' ? 'pag-ok' : 'pag-no'}" style="margin-bottom:8px;">
        ${p.stato === 'completato' ? '✓' : '⏳'} <strong>${esc(p.stato)}</strong> — ${esc(p.importo ?? '?')} € via ${p.metodo === 'paypal' ? 'PayPal/carta' : 'bonifico'}${p.anomalia ? ' · <strong style="color:#a33">ANOMALIA da verificare</strong>' : ''}
        <span style="color:#999;font-size:12px;"> · ${new Date(p.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</span>
      </div>`).join('')
    : `<div class="pag-no">Nessun pagamento quota trovato per questa email (può arrivare più tardi: arriverà una mail dedicata).</div>`;

  const expAz = Date.now() + TOKEN_TTL_MS;
  const tApprova = await firmaToken(secret, 'azione-approva', d, expAz);
  const tRespingi = await firmaToken(secret, 'azione-respingi', d, expAz);
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/scheda-domanda`;

  const azioni = dom.stato === 'in_attesa'
    ? `<form method="post" action="${base}?d=${d}&exp=${expAz}&t=${tApprova}&azione=approva">
         <button type="submit" class="btn btn-ok">Approva e invia tessera</button>
       </form>
       <form method="post" action="${base}?d=${d}&exp=${expAz}&t=${tRespingi}&azione=respingi"
             onsubmit="return confirm('Segnare la domanda come respinta?');">
         <button type="submit" class="btn btn-no">Segna respinta</button>
       </form>
       ${Deno.env.get('TESSERE_LIVE') === 'true' ? '' : '<p class="nota">⚠ TESSERE_LIVE spento: approvando si assegna il numero ma l\'email tessera NON parte (Resend non autenticato).</p>'}`
    : `<p>Domanda già <span class="stato ${esc(dom.stato)}">${esc(dom.stato)}</span>${dom.numero_tessera ? ` — tessera n. <strong>${dom.numero_tessera}</strong>` : ''}${dom.approvata_il ? `<br/><span class="nota">il ${new Date(dom.approvata_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} (${esc(dom.approvata_da ?? '')})</span>` : ''}</p>`;

  return pagina(`Domanda — ${dom.nome}`, `
    <p class="occhiello">El Brenz · Tesseramento ${ANNO}</p>
    <h1>${esc(dom.nome)}</h1>
    <p><span class="stato ${esc(dom.stato)}">${esc(dom.stato)}</span></p>
    <table>
      <tr><td>Email</td><td><a href="mailto:${esc(dom.email)}">${esc(dom.email)}</a></td></tr>
      <tr><td>Data di nascita</td><td>${dom.data_nascita ? new Date(dom.data_nascita).toLocaleDateString('it-IT') : '—'}</td></tr>
      <tr><td>Comune di nascita</td><td>${esc(dom.comune_nascita ?? '—')}</td></tr>
      <tr><td>Sesso</td><td>${dom.sesso === 'M' ? 'Maschile' : dom.sesso === 'F' ? 'Femminile' : '—'}</td></tr>
      <tr><td>Messaggio</td><td>${esc(dom.messaggio ?? '—')}</td></tr>
      <tr><td>Domanda inviata</td><td>${new Date(dom.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</td></tr>
    </table>
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;border-bottom:2px solid #C8923E;padding-bottom:8px;">Pagamento quota (live)</h2>
    ${pagHtml}
    ${azioni}
    <p class="nota">Scheda riservata al Direttivo · link valido 30 giorni · non indicizzata.</p>`);
});
