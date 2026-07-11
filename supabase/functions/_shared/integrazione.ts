// _shared/integrazione.ts — email di ringraziamento a integrazione quota
// completata (11/07/2026). Usata dal webhook PayPal (invii automatici dai
// prossimi pagamenti) e da integrazione-invio (collaudo retroattivo n.4).
// Il link porta alla tessera ESISTENTE: nessuna nuova tessera, nessun QR.

const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function grazieIntegrazioneHtml(p: {
  nome: string;
  anno: number;
  codiceTessera: string;
  avviso?: string;
}): string {
  const urlTessera = `${SITO}/tessera/${p.codiceTessera}`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-top:4px solid #C8923E;border-radius:8px;padding:32px;">
    <table role="presentation" style="border-collapse:collapse;"><tr>
      <td style="width:64px;vertical-align:top;"><img src="${LOGO_URL}" alt="Associazione El Brenz" width="52" height="52" style="display:block;border-radius:50%;"/></td>
      <td style="vertical-align:middle;padding-left:6px;">
        <p style="color:#C8923E;text-transform:uppercase;letter-spacing:.18em;font-size:10px;margin:0 0 4px;">El Brenz · Tesseramento ${p.anno}</p>
        <h1 style="font-family:Georgia,serif;font-size:22px;margin:0;color:#1E2E26;font-weight:500;">Grazie, ${esc(p.nome)}!</h1>
      </td>
    </tr></table>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:20px 0 0;">La tua integrazione è arrivata: la quota ${p.anno} è ora <strong>completa (20 €)</strong>. Con il tuo contributo la <em>nosa Sociazion</em> può far crescere la piattaforma, le convenzioni e tutti i progetti per le valli.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${urlTessera}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:13px 28px;text-decoration:none;font-weight:600;font-size:15px;border-radius:4px;">Rivedi la tua tessera</a>
    </p>
    ${p.avviso ? `<p style="color:#8a6215;font-size:13px;margin:0 0 14px;background:#FDF9F0;border-left:3px solid #C8923E;padding:10px 14px;">${esc(p.avviso)}</p>` : ''}
    <p style="color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:14px 0 0;">Raìs fonde no le 'nglacia</p>
    <p style="color:#999;font-size:11px;margin:14px 0 0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
  </div></body></html>`;
}

/** Riga di avviso per le email condivise (n.13 e n.14). */
export function avvisoCondivisa(numero: number, nome: string): string | undefined {
  return numero === 13 || numero === 14
    ? `Nota: questa email riguarda la tessera di ${nome}.`
    : undefined;
}
