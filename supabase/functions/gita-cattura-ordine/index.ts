// gita-cattura-ordine — cattura l'anticipo approvato e conferma l'iscrizione.
//
// POST { orderID } → cattura PayPal, porta la riga iscrizioni_gita a
// 'anticipo_pagato' (capture_id, payer_email, importo reale), poi:
//   - email di conferma al partecipante (Resend via send-email)
//   - notifica al Direttivo (info@elbrenz.eu)
// Idempotente: ORDER_ALREADY_CAPTURED = successo; se la riga è già
// 'anticipo_pagato' non re-invia le email.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  isOriginAllowed,
  jsonResponse,
  paypalAccessToken,
  paypalApiBase,
} from '../_shared/paypal.ts';

const DIRETTIVO = 'info@elbrenz.eu';

function euro(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : String(v ?? '');
}

// Notifica al gruppo Telegram del direttivo (best-effort). Il testo può usare
// **grassetto**: telegram-bot lo converte in HTML.
async function notificaTelegram(text: string): Promise<void> {
  const secret = Deno.env.get('BOT_ANDREAS_SECRET');
  if (!secret) return;
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': secret },
      body: JSON.stringify({ notify: true, text }),
    });
  } catch (e) { console.error('[gita-cattura] notificaTelegram', e); }
}

async function inviaEmail(to: string | string[], subject: string, html: string): Promise<void> {
  const secret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!secret) { console.error('[gita-cattura] SEND_EMAIL_SHARED_SECRET mancante'); return; }
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': secret },
      body: JSON.stringify({ to, subject, html }),
    });
    if (!r.ok) console.error('[gita-cattura] send-email', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error('[gita-cattura] send-email irraggiungibile', e); }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo non consentito' }, 405, cors);
  if (!isOriginAllowed(origin)) return jsonResponse({ error: 'Origin non consentita' }, 403, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'JSON non valido' }, 400, cors); }
  const orderID = String(body.orderID ?? '').trim();
  if (!orderID || orderID.length > 64 || !/^[A-Za-z0-9_-]+$/.test(orderID)) {
    return jsonResponse({ error: 'orderID non valido' }, 400, cors);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const token = await paypalAccessToken();
    const resp = await fetch(`${paypalApiBase()}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await resp.json();
    const alreadyCaptured = resp.status === 422 && JSON.stringify(data).includes('ORDER_ALREADY_CAPTURED');
    if (!resp.ok && !alreadyCaptured) {
      console.error('[gita-cattura] PayPal errore:', resp.status, JSON.stringify(data).slice(0, 300));
      return jsonResponse({ error: 'Cattura del pagamento non riuscita.' }, 502, cors);
    }
    const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
    const captureId: string | null = capture?.id ?? null;
    const importo: string | null = capture?.amount?.value ?? null;
    const payerEmail: string | null = data?.payer?.email_address ?? null;

    const { data: riga } = await supabase.from('iscrizioni_gita')
      .select('id, nome, cognome, email, posti, is_socio, bonus_preorder, stato, importo_anticipo')
      .eq('paypal_order_id', orderID)
      .maybeSingle();

    if (!riga) {
      // rete di sicurezza: riga assente (non dovrebbe accadere)
      console.error('[gita-cattura] riga mancante per order', orderID);
      return jsonResponse({ success: true, stato: 'anticipo_pagato' }, 200, cors);
    }

    const giaConfermata = riga.stato === 'anticipo_pagato' || riga.stato === 'saldo_pagato';

    const aggiorna: Record<string, unknown> = { stato: 'anticipo_pagato', updated_at: new Date().toISOString() };
    if (captureId) aggiorna.paypal_capture_id = captureId;
    if (importo) aggiorna.importo_anticipo = importo;
    if (payerEmail) aggiorna.payer_email = payerEmail;
    await supabase.from('iscrizioni_gita').update(aggiorna).eq('id', riga.id);

    // email solo alla PRIMA conferma (idempotenza)
    if (!giaConfermata) {
      const importoMostra = importo ?? riga.importo_anticipo;
      const bonus = Number(riga.bonus_preorder) > 0;
      const bonusRiga = bonus
        ? `<p style="margin:0 0 14px;color:#2d8659;"><strong>Bonus preorder confermato:</strong> hai bloccato <strong>5&nbsp;€ di sconto</strong> sul totale della gita.</p>`
        : '';
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;color:#1E2E26;">
<h2 style="font-family:Georgia,serif;color:#1E2E26;">Il tuo posto è fermato 🛡️</h2>
<p>Ciao ${riga.nome}, grazie: la tua iscrizione alla <strong>Gita ai Giochi Medievali</strong> di Sluderno (sabato 22 agosto 2026) è confermata.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 12px 4px 0;color:#6b5a3a;">Partecipanti</td><td style="padding:4px 0;"><strong>${riga.posti}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b5a3a;">Anticipo versato</td><td style="padding:4px 0;"><strong>${euro(importoMostra)} €</strong></td></tr>
</table>
${bonusRiga}
<p style="background:#FDF9F0;border-left:4px solid #C8923E;padding:12px 16px;border-radius:4px;">Il <strong>saldo</strong> (costo totale della gita meno l'anticipo${bonus ? ' e meno il bonus preorder' : ''}) ti sarà comunicato appena definito: riceverai per email le istruzioni per pagarlo (PayPal/carta o bonifico). Nessun addebito automatico.</p>
<p style="color:#6b5a3a;font-size:14px;">A presto, insieme, nel Medioevo.<br/>El Brenz APS · <a href="https://elbrenz.eu/gita-giochi-medievali-2026" style="color:#8a6215;">i dettagli della gita</a></p>
</body></html>`;
      await inviaEmail(riga.email, 'El Brenz — iscrizione alla gita confermata', html);

      const notifica = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;color:#1E2E26;">
<h3>Nuova iscrizione gita (anticipo pagato)</h3>
<p><strong>${riga.nome} ${riga.cognome}</strong> — ${riga.email}<br/>
Posti: <strong>${riga.posti}</strong> · Socio: <strong>${riga.is_socio ? 'sì' : 'no'}</strong><br/>
Anticipo: <strong>${euro(importoMostra)} €</strong> · Bonus preorder: <strong>${euro(riga.bonus_preorder)} €</strong><br/>
Capture: ${captureId ?? 'n/d'}</p></body></html>`;
      await inviaEmail(DIRETTIVO, `Gita: nuova iscrizione — ${riga.nome} ${riga.cognome} (${riga.posti} posti)`, notifica);

      await notificaTelegram(
        `🏰 **Nuova iscrizione alla gita**\n${riga.nome} ${riga.cognome} · ${riga.posti} posto/i\n` +
        `Socio: ${riga.is_socio ? 'sì' : 'no'} · anticipo ${euro(importoMostra)} €` +
        (Number(riga.bonus_preorder) > 0 ? ` · bonus preorder ${euro(riga.bonus_preorder)} €` : ''),
      );
    }

    return jsonResponse({ success: true, stato: 'anticipo_pagato' }, 200, cors);
  } catch (err) {
    console.error('[gita-cattura] eccezione:', err);
    return jsonResponse({ error: 'Errore interno nella cattura.' }, 500, cors);
  }
});
