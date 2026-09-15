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

// [15/9/2026, audit SIC-04] La "rete di sicurezza" che creava una riga
// mancante come 'completato' (tipo quota per default, importo dell'ordine)
// e' chiusa: senza riga si risponde 404 PRIMA di catturare, e le catture
// perse le riconcilia paypal-webhook. Il codice resta, irraggiungibile.
const RETE_SICUREZZA_RIGA_MANCANTE = false;

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

  // [15/9/2026, audit SIC-04] La riga si cerca PRIMA di catturare: senza una
  // riga nata da paypal-create-order non si tocca PayPal. Con un orderID
  // qualunque del merchant (un anticipo gita, un ordine creato lato client)
  // prima si catturava e si scriveva una quota nel libro cassa.
  // 'completato' resta ammesso per il ricaricamento della pagina (PayPal
  // risponde ORDER_ALREADY_CAPTURED e la riga non cambia sostanza).
  const { data: riga, error: rigaErr } = await supabase
    .from('pagamenti_tesseramento')
    .select('id, anonimo, nome, stato, importo, valuta')
    .eq('order_id', orderID)
    .maybeSingle();
  if (rigaErr) {
    console.error('[paypal-capture-order] lettura riga fallita:', rigaErr.message);
    return jsonResponse({ error: 'Errore interno nella cattura.' }, 500, cors);
  }
  if (!riga) {
    return jsonResponse({ error: 'Ordine non trovato.' }, 404, cors);
  }
  if (riga.stato !== 'creato' && riga.stato !== 'completato') {
    return jsonResponse({ error: 'Questo ordine non e\' piu\' catturabile. Se pensi sia un errore scrivici a info@elbrenz.eu.' }, 409, cors);
  }

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
    // Nome del pagante da PayPal (safety net 14/7): serve a non avere mai orfani
    // "sconosciuto". Usato solo se la riga non ha gia' un nome (non lo sovrascrive).
    const payerName: string | null =
      [data?.payer?.name?.given_name, data?.payer?.name?.surname].filter(Boolean).join(' ').trim() || null;

    // riga esistente (creata da paypal-create-order)
    // [15/9/2026, audit SIC-04] La lettura della riga e' salita prima della
    // cattura (vedi sopra): qui `riga` e' gia' certa.

    // [15/9/2026, audit SIC-04] Importo e valuta catturati devono coincidere
    // con la riga: se no la riga NON si marca completata, l'anomalia va nei
    // log e la riconciliazione resta al webhook.
    const valutaCatturata: string | null = capture?.amount?.currency_code ?? null;
    const importoCoerente = importo === null || Number(importo) === Number(riga.importo);
    const valutaCoerente = valutaCatturata === null || valutaCatturata === (riga.valuta ?? 'EUR');
    if (!importoCoerente || !valutaCoerente) {
      console.error(`[paypal-capture-order] importo/valuta non coerenti con la riga ${riga.id}: atteso ${riga.importo} ${riga.valuta ?? 'EUR'}, catturato ${importo} ${valutaCatturata}`);
      return jsonResponse({ error: 'Il pagamento non corrisponde all\'ordine registrato: lo verifichiamo noi, scrivici a info@elbrenz.eu.' }, 409, cors);
    }

    const aggiorna: Record<string, unknown> = {
      stato: 'completato',
      updated_at: new Date().toISOString(),
    };
    if (captureId) aggiorna.capture_id = captureId;
    if (importo) aggiorna.importo = importo;

    if (riga) {
      if (!riga.anonimo && payerEmail) aggiorna.payer_email = payerEmail;
      if (!riga.anonimo && payerName && !riga.nome) aggiorna.nome = payerName;
      await supabase.from('pagamenti_tesseramento').update(aggiorna).eq('id', riga.id);
    } else if (RETE_SICUREZZA_RIGA_MANCANTE) {
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
