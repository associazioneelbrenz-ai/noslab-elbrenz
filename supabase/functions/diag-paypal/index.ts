// diag-paypal — funzione DIAGNOSTICA TEMPORANEA (8/7/2026).
//
// Scopo: verificare da dentro (dove vivono i secrets) la configurazione
// webhook PayPal e lo stato reale dei capture, senza mai esporre le
// credenziali. SOLA LETTURA verso PayPal. Deployata CON verifica JWT
// (niente --no-verify-jwt): serve la service_role key per chiamarla.
// Da rimuovere quando la verifica rimborsi è chiusa.

import { paypalAccessToken, paypalApiBase } from '../_shared/paypal.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Solo POST' }), { status: 405 });
  }

  let corpo: { captures?: string[]; refund?: string[] } = {};
  try { corpo = await req.json(); } catch { /* body opzionale */ }

  const token = await paypalAccessToken();
  const base = paypalApiBase();
  const auth = { 'Authorization': `Bearer ${token}` };

  // AZIONE (autorizzata da Cristian 8/7/2026, "esegui tutto al meglio"):
  // rimborso TOTALE dei capture indicati per id esplicito. Idempotente via
  // PayPal-Request-Id = "refund-<capture_id>": un retry non duplica il
  // rimborso. Solo per la chiusura dei pagamenti di test.
  const rimborsi: Array<Record<string, unknown>> = [];
  for (const id of corpo.refund ?? []) {
    const r = await fetch(`${base}/v2/payments/captures/${id}/refund`, {
      method: 'POST',
      headers: {
        ...auth,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `refund-${id}`,
      },
      body: '{}', // corpo vuoto = rimborso totale
    });
    const d = await r.json();
    rimborsi.push({
      capture_id: id,
      http: r.status,
      refund_id: d.id ?? null,
      status: d.status ?? null,
      dettaglio: d.details?.[0]?.issue ?? null,
    });
  }

  // 1) Webhook registrati: id, url, eventi sottoscritti.
  const whResp = await fetch(`${base}/v1/notifications/webhooks`, { headers: auth });
  const whData = await whResp.json();
  const webhooks = (whData.webhooks ?? []).map((w: Record<string, unknown>) => ({
    id: w.id,
    url: w.url,
    eventi: ((w.event_types ?? []) as Array<{ name: string }>).map((e) => e.name),
  }));

  // 2) Stato reale dei capture richiesti (rimborsati o no).
  const captures: Array<Record<string, unknown>> = [];
  for (const id of corpo.captures ?? []) {
    const r = await fetch(`${base}/v2/payments/captures/${id}`, { headers: auth });
    const d = await r.json();
    captures.push({ capture_id: id, http: r.status, status: d.status ?? null });
  }

  // 3) Ultimi eventi webhook generati da PayPal (se presenti).
  const evResp = await fetch(`${base}/v1/notifications/webhooks-events?page_size=10`, { headers: auth });
  const evData = await evResp.json();
  const eventi = (evData.events ?? []).map((e: Record<string, unknown>) => ({
    id: e.id,
    tipo: e.event_type,
    creato: e.create_time,
    resource_id: (e.resource as Record<string, unknown> | undefined)?.id ?? null,
  }));

  return new Response(
    JSON.stringify({ env: Deno.env.get('PAYPAL_ENV'), webhooks, captures, rimborsi, eventi }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
