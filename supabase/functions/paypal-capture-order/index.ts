// paypal-capture-order — cattura un ordine approvato (M2.6).
//
// POST { orderID } → POST /v2/checkout/orders/{id}/capture.
// A cattura riuscita aggiorna la riga su pagamenti_tesseramento:
// stato 'completato', capture_id, importo effettivo, payer_email
// (MAI per le donazioni anonime). Idempotente: se PayPal risponde
// ORDER_ALREADY_CAPTURED consideriamo il pagamento già riuscito.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  isOriginAllowed,
  jsonResponse,
  paypalAccessToken,
  paypalApiBase,
} from '../_shared/paypal.ts';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo non consentito' }, 405, cors);
  }
  if (!isOriginAllowed(origin)) {
    return jsonResponse({ error: 'Origin non consentita' }, 403, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON non valido' }, 400, cors);
  }
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
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await resp.json();

    // Idempotenza: ordine già catturato = successo (utente ha ricaricato).
    const alreadyCaptured = resp.status === 422 &&
      JSON.stringify(data).includes('ORDER_ALREADY_CAPTURED');

    if (!resp.ok && !alreadyCaptured) {
      console.error('[paypal-capture-order] PayPal errore:', resp.status, JSON.stringify(data).slice(0, 300));
      return jsonResponse({ error: 'Cattura del pagamento non riuscita.' }, 502, cors);
    }

    const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
    const captureId: string | null = capture?.id ?? null;
    const importo: string | null = capture?.amount?.value ?? null;
    const payerEmail: string | null = data?.payer?.email_address ?? null;

    // riga esistente (creata da paypal-create-order)
    const { data: riga } = await supabase
      .from('pagamenti_tesseramento')
      .select('id, anonimo')
      .eq('order_id', orderID)
      .maybeSingle();

    const aggiorna: Record<string, unknown> = {
      stato: 'completato',
      updated_at: new Date().toISOString(),
    };
    if (captureId) aggiorna.capture_id = captureId;
    if (importo) aggiorna.importo = importo;

    if (riga) {
      if (!riga.anonimo && payerEmail) aggiorna.payer_email = payerEmail;
      await supabase.from('pagamenti_tesseramento').update(aggiorna).eq('id', riga.id);
    } else {
      // rete di sicurezza: riga mancante (non dovrebbe accadere) — creala.
      // Prudenza privacy: nessun payer_email, tipo non determinabile qui.
      await supabase.from('pagamenti_tesseramento').upsert(
        { order_id: orderID, ...aggiorna },
        { onConflict: 'order_id' },
      );
    }

    return jsonResponse({ success: true, stato: 'completato' }, 200, cors);
  } catch (err) {
    console.error('[paypal-capture-order] eccezione:', err);
    return jsonResponse({ error: 'Errore interno nella cattura.' }, 500, cors);
  }
});
