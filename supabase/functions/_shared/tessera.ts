// _shared/tessera.ts — codice di verifica, QR e template email della tessera
// digitale (M5.5). Usato da tessera-invio (reinvii/batch) e da scheda-domanda
// (approvazione): un solo design, zero divergenze fra i due percorsi.
//
// Codice tessera: HMAC-SHA256(ADMIN_ACTION_SECRET, `tessera|{id}|{numero}`)
// troncato a 24 hex — non forgiabile, non enumerabile, DETERMINISTICO
// (rigenerazioni idempotenti). QR PNG su Storage `assets-pubblici/tessere/qr/`
// (upsert): la stessa immagine serve email e pagina /tessera/{codice}.

import QRCode from 'npm:qrcode@1.5.4';
import { firmaToken } from './admin.ts';

export const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;
const FILIGRANA_URL = `${SITO}/decoro/aquila-oro-filigrana.png`;
const BUCKET = 'assets-pubblici';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * Garantisce codice_tessera a DB e QR su Storage per il socio dato.
 * Ritorna { codice, urlVerifica, qrUrl }. Lancia su errore (il chiamante
 * decide come degradare).
 */
export async function ensureCodiceEQr(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  socio: { id: string; numero_tessera: number; anno: number; codice_tessera?: string | null },
  adminSecret: string,
): Promise<{ codice: string; urlVerifica: string; qrUrl: string }> {
  let codice = socio.codice_tessera ?? null;
  if (!codice) {
    const hmac = await firmaToken(adminSecret, 'tessera', socio.id, socio.numero_tessera);
    codice = `${socio.numero_tessera}-${socio.anno}-${hmac.slice(0, 24)}`;
    const { error } = await supabase.from('domande_tesseramento')
      .update({ codice_tessera: codice, updated_at: new Date().toISOString() })
      .eq('id', socio.id);
    if (error) throw new Error(`Salvataggio codice fallito: ${error.message}`);
  }

  const urlVerifica = `${SITO}/tessera/${codice}`;
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
  if (errUp) throw new Error(`Upload QR fallito: ${errUp.message}`);
  const qrUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/${qrPath}`;

  return { codice, urlVerifica, qrUrl };
}

/**
 * HTML email della tessera digitale (card scura, bandiera ladina, filigrana
 * Aquila dorata, QR di verifica). `intro` è il paragrafo sotto la card
 * (benvenuto per l'approvazione, consegna per i reinvii); `avviso` la riga
 * opzionale evidenziata (es. recapito di famiglia).
 */
export function tesseraEmailHtml(p: {
  nome: string;
  numero: number;
  anno: number;
  qrUrl: string;
  urlVerifica: string;
  intro: string;
  avviso?: string;
}): string {
  return `<!DOCTYPE html><html><head>
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light}</style>
</head><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#F5EEDD;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(30,46,38,.35);">
      <!-- bandiera ladina -->
      <div style="border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.12);">
      <div style="height:6px;background:#1E4FB4;"></div>
      <div style="height:6px;background:#FFFFFF;"></div>
      <div style="height:6px;background:#1E9C48;"></div>
      </div>
      <!-- corpo tessera con filigrana Aquila Tirolensis dorata -->
      <div style="padding:34px 36px;color:#1E2E26;background-image:url('${FILIGRANA_URL}');background-repeat:no-repeat;background-position:right -60px center;background-size:340px auto;">
        <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
          <td style="width:76px;vertical-align:top;"><img src="${LOGO_URL}" alt="Timbro Associazione El Brenz" width="64" height="64" style="display:block;border-radius:50%;"/></td>
          <td style="vertical-align:middle;padding-left:6px;">
            <p style="color:#C8923E;text-transform:uppercase;letter-spacing:.22em;font-size:10px;margin:0 0 6px;">Associazione Storico Culturale Linguistica</p>
            <h1 style="font-family:Georgia,serif;font-size:26px;margin:0;color:#1E2E26;font-weight:500;">El <em style="color:#C8923E;">Brenz</em> dle Val del Nos</h1>
          </td>
        </tr></table>
        <div style="border-top:1px solid rgba(200,146,62,.45);margin:22px 0 20px;"></div>
        <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
          <td style="vertical-align:top;">
            <p style="color:#C8923E;text-transform:uppercase;letter-spacing:.18em;font-size:10px;margin:0 0 4px;">Tessera socio · anno ${p.anno}</p>
            <p style="font-size:26px;margin:0 0 4px;font-family:Georgia,serif;color:#1E2E26;">${esc(p.nome)}</p>
            <p style="font-size:15px;margin:0 0 22px;color:#C8923E;font-weight:600;letter-spacing:.06em;">N. ${p.numero}</p>
            <p style="margin:0;color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:16px;">Raìs fonde no le 'nglacia</p>
            <p style="font-size:10px;color:rgba(30,46,38,.55);margin:4px 0 0;letter-spacing:.04em;">Radici profonde non gelano · valida fino al 31/12/${p.anno}</p>
          </td>
          <td style="width:132px;vertical-align:bottom;padding-left:14px;">
            <div style="background:#FFFFFF;border:1px solid #E5DFCF;border-radius:10px;padding:6px;width:120px;">
              <img src="${p.qrUrl}" alt="QR di verifica tessera" width="108" height="108" style="display:block;"/>
            </div>
            <p style="font-size:9px;color:rgba(30,46,38,.55);margin:6px 0 0;text-align:center;letter-spacing:.03em;">verifica in tempo reale</p>
          </td>
        </tr></table>
      </div>
      <div style="border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.12);">
      <div style="height:6px;background:#1E4FB4;"></div>
      <div style="height:6px;background:#FFFFFF;"></div>
      <div style="height:6px;background:#1E9C48;"></div>
      </div>
    </div>
    <p style="color:#1E2E26;font-size:15px;margin:22px 8px 0;">${p.intro}</p>
    <p style="color:#1E2E26;font-size:14px;margin:12px 8px 0;">📲 <a href="${p.urlVerifica}" style="color:#8a6215;font-weight:600;">Scarica la versione per il telefono</a>: dalla pagina della tessera puoi salvarla in galleria o aggiungerla alla schermata Home.</p>
    ${p.avviso ? `<p style="color:#8a6215;font-size:13px;margin:12px 8px 0;background:#FDF9F0;border-left:3px solid #C8923E;padding:10px 14px;">${esc(p.avviso)}</p>` : ''}
    <p style="color:#999;font-size:11px;margin:16px 8px 0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
  </div></body></html>`;
}
