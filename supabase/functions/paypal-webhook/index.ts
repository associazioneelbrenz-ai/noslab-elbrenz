// paypal-webhook — riconciliazione eventi PayPal (M2.6).
//
// Rete di sicurezza: se l'utente chiude il browser tra approvazione e
// cattura, o per rimborsi/dinieghi, PayPal notifica qui.
//
// SICUREZZA: verifica OBBLIGATORIA della firma via
// POST /v1/notifications/verify-webhook-signature con PAYPAL_WEBHOOK_ID.
// Evento non verificato → 400 e NESSUNA scrittura a DB.
//
// Eventi gestiti:
//   PAYMENT.CAPTURE.COMPLETED → stato 'completato'
//   PAYMENT.CAPTURE.REFUNDED  → stato 'rimborsato'
//   PAYMENT.CAPTURE.DENIED    → stato 'negato'
// Idempotente: upsert con vincolo unique su capture_id, replay dello
// stesso evento non crea duplicati. Il webhook non scrive MAI payer_email
// (lo fa solo la cattura, e solo per pagamenti non anonimi).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { paypalAccessToken, paypalApiBase } from '../_shared/paypal.ts';

const STATI: Record<string, string> = {
  'PAYMENT.CAPTURE.COMPLETED': 'completato',
  'PAYMENT.CAPTURE.REFUNDED': 'rimborsato',
  'PAYMENT.CAPTURE.DENIED': 'negato',
};

// M2.6-ter (B4): mini-mail al Direttivo quando un pagamento diventa
// 'completato'. Idempotente via colonna `notificato` (i replay dello stesso
// evento non spediscono due volte). Match domanda per email (solo quota);
// quota senza domanda agganciabile → "pagamento orfano, verificare".
// L'email si marca notificato SOLO a invio riuscito (retry al prossimo
// evento in caso di errore transitorio).
async function notificaCompletato(
  supabase: ReturnType<typeof createClient>,
  captureId: string | null,
  orderId: string | null,
): Promise<void> {
  let q = supabase.from('pagamenti_tesseramento')
    .select('id, tipo, anonimo, nome, email, importo, metodo, notificato, domanda_id');
  if (captureId) q = q.eq('capture_id', captureId);
  else if (orderId) q = q.eq('order_id', orderId);
  else return;
  const { data: riga } = await q.maybeSingle();
  if (!riga || riga.notificato) return;

  // aggancio domanda (solo quota, serve una email sul pagamento)
  let domandaId: string | null = riga.domanda_id ?? null;
  if (riga.tipo === 'quota' && !domandaId && riga.email) {
    const { data: dom } = await supabase.from('domande_tesseramento')
      .select('id')
      .ilike('email', riga.email)
      .eq('stato', 'in_attesa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dom) {
      domandaId = dom.id;
      await supabase.from('pagamenti_tesseramento')
        .update({ domanda_id: dom.id, updated_at: new Date().toISOString() })
        .eq('id', riga.id);
    }
  }

  const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!sharedSecret) {
    console.error('[paypal-webhook] SEND_EMAIL_SHARED_SECRET mancante: notifica saltata');
    return;
  }
  const metodoLabel = riga.metodo === 'paypal' ? 'PayPal/carta' : 'bonifico';
  const chi = riga.anonimo ? 'Donatore anonimo' : (riga.nome || riga.email || 'sconosciuto');
  const cosa = riga.tipo === 'quota' ? 'Quota sociale 2026' : 'Donazione';
  const aggancio = riga.tipo === 'quota'
    ? (domandaId
      ? `<p style="color:#2d8659;">✓ Agganciato alla domanda <strong>#${domandaId.slice(0, 8)}</strong>.</p>`
      : `<p style="color:#a33;"><strong>⚠ Pagamento orfano:</strong> nessuna domanda in attesa con questa email — verificare manualmente.</p>`)
    : '';
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
  <div style="background:#fff;padding:28px;border-radius:8px;border-top:4px solid #2d8659;">
    <h1 style="color:#1E2E26;font-size:20px;margin:0 0 16px;">Pagamento ricevuto ✓</h1>
    <p style="color:#1E2E26;font-size:15px;margin:0 0 6px;"><strong>${cosa}</strong> — ${riga.importo} € via ${metodoLabel}</p>
    <p style="color:#1E2E26;font-size:15px;margin:0 0 12px;">Da: <strong>${chi}</strong></p>
    ${aggancio}
    <p style="color:#999;font-size:11px;margin-top:20px;">Notifica automatica dal webhook PayPal · El Brenz</p>
  </div></body></html>`;

  try {
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sharedSecret },
      body: JSON.stringify({
        to: 'info@elbrenz.eu',
        subject: `Pagamento ricevuto — ${cosa} ${riga.importo} € (${chi})`,
        html,
        tags: [{ name: 'source', value: 'paypal-webhook' }],
      }),
    });
    if (resp.ok) {
      await supabase.from('pagamenti_tesseramento')
        .update({ notificato: true, updated_at: new Date().toISOString() })
        .eq('id', riga.id);
      console.log('[paypal-webhook] notifica inviata per', riga.id);
    } else {
      console.error('[paypal-webhook] send-email fallita:', resp.status);
    }
  } catch (err) {
    console.error('[paypal-webhook] notifica fallita:', err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo non consentito' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const webhookId = Deno.env.get('PAYPAL_WEBHOOK_ID');
  if (!webhookId) {
    console.error('[paypal-webhook] PAYPAL_WEBHOOK_ID non configurato nei secrets');
    return new Response(JSON.stringify({ error: 'Webhook non configurato' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event: Record<string, unknown>;
  const rawBody = await req.text();
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Verifica firma (obbligatoria) ---------------------------------------
  try {
    const token = await paypalAccessToken();
    const verifyResp = await fetch(
      `${paypalApiBase()}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: req.headers.get('paypal-auth-algo'),
          cert_url: req.headers.get('paypal-cert-url'),
          transmission_id: req.headers.get('paypal-transmission-id'),
          transmission_sig: req.headers.get('paypal-transmission-sig'),
          transmission_time: req.headers.get('paypal-transmission-time'),
          webhook_id: webhookId,
          webhook_event: event,
        }),
      },
    );
    const verify = await verifyResp.json();
    if (!verifyResp.ok || verify.verification_status !== 'SUCCESS') {
      console.warn('[paypal-webhook] firma NON verificata:', JSON.stringify(verify).slice(0, 200));
      return new Response(JSON.stringify({ error: 'Firma non verificata' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    console.error('[paypal-webhook] errore verifica firma:', err);
    return new Response(JSON.stringify({ error: 'Verifica firma fallita' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Riconciliazione ------------------------------------------------------
  const eventType = String(event.event_type ?? '');
  const nuovoStato = STATI[eventType];
  if (!nuovoStato) {
    // evento non di nostro interesse: 200 così PayPal non ritenta
    return new Response(JSON.stringify({ received: true, ignored: eventType }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resource = (event.resource ?? {}) as Record<string, unknown>;
  // Per COMPLETED/DENIED resource.id è il capture_id; per REFUNDED è l'id del
  // refund e il capture sta nei link "up" — usiamo anche l'order_id correlato.
  const supplementary = (resource.supplementary_data ?? {}) as Record<string, unknown>;
  const related = (supplementary.related_ids ?? {}) as Record<string, unknown>;
  const orderId: string | null = related.order_id ? String(related.order_id) : null;
  const captureId: string | null = eventType === 'PAYMENT.CAPTURE.REFUNDED'
    ? (related.capture_id ? String(related.capture_id) : null)
    : (resource.id ? String(resource.id) : null);
  const importo = (resource.amount as Record<string, unknown> | undefined)?.value ?? null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const aggiorna: Record<string, unknown> = {
    stato: nuovoStato,
    updated_at: new Date().toISOString(),
  };

  try {
    // 1° tentativo: riga per capture_id
    if (captureId) {
      const { data: byCapture } = await supabase
        .from('pagamenti_tesseramento')
        .update(aggiorna)
        .eq('capture_id', captureId)
        .select('id');
      if (byCapture && byCapture.length > 0) {
        if (nuovoStato === 'completato') await notificaCompletato(supabase, captureId, orderId);
        return ok(eventType, nuovoStato);
      }
    }
    // 2° tentativo: riga per order_id (cattura mai registrata dal client)
    if (orderId) {
      const upd = { ...aggiorna } as Record<string, unknown>;
      if (captureId) upd.capture_id = captureId;
      if (importo && nuovoStato === 'completato') upd.importo = importo;
      const { data: byOrder } = await supabase
        .from('pagamenti_tesseramento')
        .update(upd)
        .eq('order_id', orderId)
        .select('id');
      if (byOrder && byOrder.length > 0) {
        if (nuovoStato === 'completato') await notificaCompletato(supabase, captureId, orderId);
        return ok(eventType, nuovoStato);
      }
    }
    // 3°: nessuna riga trovata — inserisci (upsert su capture_id evita
    // duplicati al replay). Nessun dato personale.
    if (captureId) {
      await supabase.from('pagamenti_tesseramento').upsert(
        {
          capture_id: captureId,
          order_id: orderId,
          importo: nuovoStato === 'completato' ? importo : null,
          ...aggiorna,
        },
        { onConflict: 'capture_id' },
      );
    }
    if (nuovoStato === 'completato') await notificaCompletato(supabase, captureId, orderId);
    return ok(eventType, nuovoStato);
  } catch (err) {
    console.error('[paypal-webhook] errore riconciliazione:', err);
    return new Response(JSON.stringify({ error: 'Errore riconciliazione' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function ok(eventType: string, stato: string): Response {
  console.log(`[paypal-webhook] ${eventType} → ${stato}`);
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
