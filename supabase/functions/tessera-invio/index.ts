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
//   - codice tessera = HMAC-SHA256(ADMIN_ACTION_SECRET, `tessera|{id}|{numero}`)
//     troncato a 24 hex (96 bit): non forgiabile, non enumerabile, DETERMINISTICO
//     (reinvii idempotenti: stesso codice, stesso QR, stessa URL);
//   - la verifica pubblica passa dalla RPC `tessera_verifica(codice)` (lookup
//     SOLO per codice esatto — nessun elenco soci esposto).
//
// QR: contenuto = https://elbrenz.eu/tessera/{codice} (URL nel PATH, mai
// query string — lezione quoted-printable). PNG generato server-side con
// npm:qrcode e caricato su Storage `assets-pubblici/tessere/qr/{codice}.png`
// (upsert): zero dipendenze frontend, la stessa immagine serve email e pagina.
//
// Body POST: { numero: number, to?: string (override recapito, es. email
// condivise n.13/n.14), avviso?: string (riga extra nel corpo) }.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import QRCode from 'npm:qrcode@1.5.4';
import { firmaToken } from '../_shared/admin.ts';

const ANNO = 2026;
const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;
const FILIGRANA_URL = `${SITO}/decoro/aquila-oro-filigrana.png`;
const BUCKET = 'assets-pubblici';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

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

  let body: { numero?: unknown; to?: unknown; avviso?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON non valido' }, 400);
  }
  const numero = Number(body.numero);
  if (!Number.isInteger(numero) || numero < 1 || numero > 100000) {
    return json({ error: 'numero tessera non valido' }, 400);
  }
  const toOverride = typeof body.to === 'string' && body.to.includes('@') ? body.to.trim() : null;
  const avviso = typeof body.avviso === 'string' ? body.avviso.trim().slice(0, 300) : '';

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

  // Codice deterministico: reinvio = stesso codice (nessuna invalidazione dei QR già emessi).
  let codice = socio.codice_tessera as string | null;
  if (!codice) {
    const hmac = await firmaToken(adminSecret, 'tessera', socio.id, numero);
    codice = `${numero}-${socio.anno ?? ANNO}-${hmac.slice(0, 24)}`;
    const { error: errCod } = await supabase.from('domande_tesseramento')
      .update({ codice_tessera: codice, updated_at: new Date().toISOString() })
      .eq('id', socio.id);
    if (errCod) return json({ error: `Salvataggio codice fallito: ${errCod.message}` }, 500);
  }

  const urlVerifica = `${SITO}/tessera/${codice}`;

  // QR PNG su Storage (upsert idempotente): stessa immagine per email e pagina.
  const dataUrl: string = await QRCode.toDataURL(urlVerifica, {
    width: 480,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1E2E26', light: '#FFFFFF' },
  });
  const pngBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const qrPath = `tessere/qr/${codice}.png`;
  const { error: errUp } = await supabase.storage.from(BUCKET)
    .upload(qrPath, pngBytes, { contentType: 'image/png', upsert: true });
  if (errUp) return json({ error: `Upload QR fallito: ${errUp.message}` }, 500);
  const qrUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/${qrPath}`;

  const anno = socio.anno ?? ANNO;
  const tesseraHtml = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#1E2E26;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(30,46,38,.35);">
      <!-- bandiera ladina -->
      <div style="height:6px;background:#1E4FB4;"></div>
      <div style="height:6px;background:#FFFFFF;"></div>
      <div style="height:6px;background:#1E9C48;"></div>
      <!-- corpo tessera con filigrana Aquila Tirolensis dorata -->
      <div style="padding:34px 36px;color:#F5EEDD;background-image:url('${FILIGRANA_URL}');background-repeat:no-repeat;background-position:right -60px center;background-size:340px auto;">
        <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
          <td style="width:76px;vertical-align:top;"><img src="${LOGO_URL}" alt="Timbro Associazione El Brenz" width="64" height="64" style="display:block;border-radius:50%;"/></td>
          <td style="vertical-align:middle;padding-left:6px;">
            <p style="color:#D9A94E;text-transform:uppercase;letter-spacing:.22em;font-size:10px;margin:0 0 6px;">Associazione Storico Culturale Linguistica</p>
            <h1 style="font-family:Georgia,serif;font-size:26px;margin:0;color:#F5EEDD;font-weight:500;">El <em style="color:#C8923E;">Brenz</em> dle Val del Nos</h1>
          </td>
        </tr></table>
        <div style="border-top:1px solid rgba(200,146,62,.45);margin:22px 0 20px;"></div>
        <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
          <td style="vertical-align:top;">
            <p style="color:rgba(245,238,221,.7);text-transform:uppercase;letter-spacing:.18em;font-size:10px;margin:0 0 4px;">Tessera socio · anno ${anno}</p>
            <p style="font-size:26px;margin:0 0 4px;font-family:Georgia,serif;color:#F5EEDD;">${esc(socio.nome)}</p>
            <p style="font-size:15px;margin:0 0 22px;color:#C8923E;font-weight:600;letter-spacing:.06em;">N. ${numero}</p>
            <p style="margin:0;color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:16px;">Raìs fonde no le 'nglacia</p>
            <p style="font-size:10px;color:rgba(245,238,221,.5);margin:4px 0 0;letter-spacing:.04em;">Radici profonde non gelano · valida fino al 31/12/${anno}</p>
          </td>
          <td style="width:132px;vertical-align:bottom;padding-left:14px;">
            <div style="background:#FFFFFF;border-radius:10px;padding:6px;width:120px;">
              <img src="${qrUrl}" alt="QR di verifica tessera" width="108" height="108" style="display:block;"/>
            </div>
            <p style="font-size:9px;color:rgba(245,238,221,.6);margin:6px 0 0;text-align:center;letter-spacing:.03em;">verifica in tempo reale</p>
          </td>
        </tr></table>
      </div>
      <div style="height:6px;background:#1E4FB4;"></div>
      <div style="height:6px;background:#FFFFFF;"></div>
      <div style="height:6px;background:#1E9C48;"></div>
    </div>
    <p style="color:#1E2E26;font-size:15px;margin:22px 8px 0;">Ecco la tua tessera digitale <em>dla nosa Sociazion</em> per l'anno ${anno}. Il codice QR permette a chiunque — ad esempio un esercente convenzionato — di verificarne la validità in tempo reale su <a href="${urlVerifica}" style="color:#8a6215;">elbrenz.eu</a>.</p>
    ${avviso ? `<p style="color:#8a6215;font-size:13px;margin:12px 8px 0;background:#FDF9F0;border-left:3px solid #C8923E;padding:10px 14px;">${esc(avviso)}</p>` : ''}
    <p style="color:#999;font-size:11px;margin:16px 8px 0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
  </div></body></html>`;

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

  return json({ ok: true, numero, codice, url_verifica: urlVerifica, qr: qrUrl, inviato_a: destinatario });
});
