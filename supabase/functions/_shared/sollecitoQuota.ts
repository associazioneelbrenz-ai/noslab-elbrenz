// sollecitoQuota — la mail che chiede a una persona di completare la quota.
//
// [3/8/2026] Nasce da un caso concreto: Stefano Schwarz ha ricevuto la tessera
// 26 il 21 luglio senza aver versato la quota, e per tredici giorni nessuno
// gliel'ha detto. La mail della tessera non nominava il pagamento, quindi lui
// aveva tutte le ragioni per credersi a posto.
//
// Tono: si dà per scontata la buona fede, perché nove volte su dieci è
// esattamente quella. Non è un recupero crediti, è un promemoria fra persone
// che si conoscono.

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function sollecitoQuotaHtml(p: {
  nome: string;
  anno: number;
  importo: number;
  /** Collegamento personale per pagare QUELLA domanda, senza ricompilare nulla. */
  urlPagamento?: string;
}): string {
  const primaVia = p.urlPagamento
    ? `<p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 6px;"><strong>1. Online</strong>, con PayPal o carta. Non serve avere un conto PayPal.</p>
       <p style="text-align:center;margin:14px 0 18px;"><a href="${p.urlPagamento}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:13px 28px;text-decoration:none;font-weight:600;font-size:15px;border-radius:4px;">Paga ${p.importo} € ora</a></p>
       <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 18px;">Il collegamento è già legato alla tua domanda: non devi ricompilare niente.</p>`
    : `<p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 18px;"><strong>1. Online.</strong> Rispondi a questa email e ti mandiamo il collegamento per pagare, già legato alla tua domanda.</p>`;

  return `<!DOCTYPE html><html><head>
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light}</style>
</head><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border-top:4px solid #C8923E;padding:28px;">
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#1E2E26;margin:0 0 14px;">Ciao ${esc(p.nome)}, manca solo la quota</h1>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 16px;">
      La tua domanda di adesione a El Brenz per il ${p.anno} è arrivata, e ti ringraziamo.
      Per completarla manca il versamento della quota sociale, <strong>${p.importo} €</strong>.
      Se l'hai già consegnata a mano a qualcuno del Direttivo, scrivicelo e sistemiamo noi.
    </p>
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#8a6215;border-bottom:2px solid #C8923E;padding-bottom:6px;margin:0 0 14px;">Come versarla</p>
    ${primaVia}
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 6px;"><strong>2. Bonifico</strong>, alla Cassa Rurale Val di Sole, filiale di Mezzana.</p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 18px;padding-left:14px;border-left:3px solid #E5DFCF;">
      <strong>IT84 U081 6335 0100 0019 0116 255</strong><br/>
      Causale: «Quota socio ${p.anno} ${esc(p.nome)}»
    </p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 20px;"><strong>3. Contanti</strong>, di persona al segretario, a un incontro o in sede.</p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Per qualunque cosa rispondi pure a questa email: la leggiamo noi.
    </p>
    <p style="color:#8a6215;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:0 0 18px;">Raìs fonde no le 'nglacia</p>
    <p style="color:#999;font-size:11px;margin:0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
  </div></body></html>`;
}

/**
 * Conferma della domanda, all'indirizzo di chi l'ha inviata.
 *
 * [3/8/2026] Prima non partiva niente: l'unica email andava al Direttivo, e
 * chi si iscriveva restava senza nulla di scritto. Le istruzioni di pagamento
 * viste a schermo sparivano al primo ricaricamento della pagina.
 *
 * Il testo cambia con il metodo scelto, perche' dire a chi ha scelto i contanti
 * come si fa un bonifico e' rumore, e nel rumore si perde la riga che conta.
 */
export function confermaDomandaHtml(p: {
  nome: string;
  anno: number;
  importo: number;
  metodo: 'paypal' | 'bonifico' | 'contanti' | string;
}): string {
  const bonifico = `<p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 6px;">Fai un bonifico di <strong>${p.importo} €</strong> alla Cassa Rurale Val di Sole, filiale di Mezzana.</p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0;padding-left:14px;border-left:3px solid #E5DFCF;"><strong>IT84 U081 6335 0100 0019 0116 255</strong><br/>Causale: «Quota socio ${p.anno} ${esc(p.nome)}»</p>`;

  const contanti = `<p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0;">La quota di <strong>${p.importo} €</strong> si consegna al segretario, di persona a un incontro o in sede. La domanda resta in attesa finche' la quota non e' stata incassata: appena ci arriva te lo confermiamo.</p>`;

  const paypal = `<p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0;">Hai scelto di pagare online i <strong>${p.importo} €</strong>. Se non l'hai gia' fatto puoi tornare sul sito e completare, oppure rispondere a questa email e ti mandiamo il collegamento diretto alla tua domanda.</p>`;

  const blocco = p.metodo === 'bonifico' ? bonifico : p.metodo === 'contanti' ? contanti : paypal;

  return `<!DOCTYPE html><html><head>
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light}</style>
</head><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border-top:4px solid #C8923E;padding:28px;">
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#1E2E26;margin:0 0 14px;">Grazie ${esc(p.nome)}, la domanda e' arrivata</h1>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Il Consiglio Direttivo la esaminera' e riceverai la conferma a questo indirizzo.
      Nel frattempo, ecco come completare la quota sociale ${p.anno}.
    </p>
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#8a6215;border-bottom:2px solid #C8923E;padding-bottom:6px;margin:0 0 14px;">La quota</p>
    ${blocco}
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:20px 0 0;">Se cambi idea sul modo di pagare, va benissimo lo stesso: rispondi pure a questa email.</p>
    <p style="color:#8a6215;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:18px 0;">Raìs fonde no le 'nglacia</p>
    <p style="color:#999;font-size:11px;margin:0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
  </div></body></html>`;
}
