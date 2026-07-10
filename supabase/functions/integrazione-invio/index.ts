// integrazione-invio — email ai soci storici con bottone "Integra 10 €"
// (quota 2026 passata da 10 a 20 €, delibera CD).
//
// Gate: header `x-ingest-token` == INGEST_TOKEN (canale amministrativo,
// stesso pattern di tessera-invio). Il link di pagamento è
// https://elbrenz.eu/integrazione/{codice_tessera} — codice nel PATH
// (mai query string), importo 10,00 € fissato server-side in
// paypal-create-order (tipo 'integrazione').
//
// Body POST: { numero: number, to?: string (override recapito, email
// condivise n.13/n.14), avviso?: string (riga extra) }.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANNO = 2026;
const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;

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
  if (!expected || req.headers.get('x-ingest-token') !== expected) {
    return json({ error: 'Non autorizzato' }, 401);
  }
  const sendSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!sendSecret) return json({ error: 'SEND_EMAIL_SHARED_SECRET mancante' }, 500);

  let body: { numero?: unknown; to?: unknown; avviso?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON non valido' }, 400);
  }
  const numero = Number(body.numero);
  if (!Number.isInteger(numero) || numero < 1) return json({ error: 'numero non valido' }, 400);
  const toOverride = typeof body.to === 'string' && body.to.includes('@') ? body.to.trim() : null;
  const avviso = typeof body.avviso === 'string' ? body.avviso.trim().slice(0, 300) : '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: socio } = await supabase.from('domande_tesseramento')
    .select('id, nome, email, numero_tessera, codice_tessera')
    .eq('numero_tessera', numero)
    .eq('stato', 'approvata')
    .maybeSingle();
  if (!socio) return json({ error: `Nessun socio approvato con tessera n. ${numero}` }, 404);
  if (!socio.codice_tessera) return json({ error: 'Codice tessera mancante: inviare prima la tessera' }, 409);

  const urlIntegrazione = `${SITO}/integrazione/${socio.codice_tessera}`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-top:4px solid #C8923E;border-radius:8px;padding:32px;">
    <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
      <td style="width:64px;vertical-align:top;"><img src="${LOGO_URL}" alt="Associazione El Brenz" width="52" height="52" style="display:block;border-radius:50%;"/></td>
      <td style="vertical-align:middle;padding-left:6px;">
        <p style="color:#C8923E;text-transform:uppercase;letter-spacing:.18em;font-size:10px;margin:0 0 4px;">El Brenz · Tesseramento ${ANNO}</p>
        <h1 style="font-family:Georgia,serif;font-size:22px;margin:0;color:#1E2E26;font-weight:500;">La quota ${ANNO} passa a 20 €</h1>
      </td>
    </tr></table>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:22px 0 0;">Ciao <strong>${esc(socio.nome)}</strong>,</p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:12px 0 0;">quest'anno la <em>nosa Sociazion</em> è cresciuta: la piattaforma digitale su elbrenz.eu, la tessera con QR e verifica in tempo reale, le <a href="${SITO}/convenzioni" style="color:#8a6215;">convenzioni per i soci</a> e l'assistente storico Andreas. Per coprire i costi di queste nuove attività il Consiglio Direttivo ha portato la quota annuale da 10 a <strong>20 €</strong>.</p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:12px 0 0;">Hai già versato 10 € per il ${ANNO}: ti chiediamo di <strong>integrare i 10 € mancanti</strong>. Bastano due minuti, in modo sicuro con PayPal o carta:</p>
    <p style="text-align:center;margin:26px 0;">
      <a href="${urlIntegrazione}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:14px 30px;text-decoration:none;font-weight:600;font-size:15px;border-radius:4px;">Integra 10 € — tessera n. ${numero}</a>
    </p>
    <p style="color:#666;font-size:13px;line-height:1.6;margin:0;">Preferisci il bonifico o hai domande? Rispondi a questa email o scrivi a <a href="mailto:info@elbrenz.eu" style="color:#8a6215;">info@elbrenz.eu</a>. Grazie di cuore per il sostegno alla <em>nosa storia</em>.</p>
    ${avviso ? `<p style="color:#8a6215;font-size:13px;margin:14px 0 0;background:#FDF9F0;border-left:3px solid #C8923E;padding:10px 14px;">${esc(avviso)}</p>` : ''}
    <p style="color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:22px 0 0;">Raìs fonde no le 'nglacia</p>
    <p style="color:#999;font-size:11px;margin:14px 0 0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
  </div></body></html>`;

  const destinatario = toOverride ?? socio.email;
  try {
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sendSecret },
      body: JSON.stringify({
        to: destinatario,
        subject: `Quota ${ANNO}: integrazione di 10 € — El Brenz (tessera n. ${numero})`,
        html,
        tags: [{ name: 'source', value: 'integrazione-quota' }],
      }),
    });
    if (!resp.ok) return json({ ok: false, numero, error: `send-email ${resp.status}` }, 502);
  } catch {
    return json({ ok: false, numero, error: 'send-email irraggiungibile' }, 502);
  }

  return json({ ok: true, numero, url_integrazione: urlIntegrazione, inviato_a: destinatario });
});
