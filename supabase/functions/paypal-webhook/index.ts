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
import { firmaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';
import { grazieIntegrazioneHtml, avvisoCondivisa } from '../_shared/integrazione.ts';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

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
    .select('id, tipo, anonimo, nome, email, payer_email, importo, metodo, notificato, domanda_id');
  if (captureId) q = q.eq('capture_id', captureId);
  else if (orderId) q = q.eq('order_id', orderId);
  else return;
  const { data: riga } = await q.maybeSingle();
  if (!riga || riga.notificato) return;

  // Aggancio domanda (solo quota): 1) match per email su domande in attesa;
  // 2) FIX A2 (approvato da Cristian 8/7/2026): se non c'è alcuna domanda
  //    agganciabile, la CREIAMO in stato 'in_attesa' dai dati del pagamento
  //    — così una quota completata ha SEMPRE domanda_id, anche se l'utente
  //    ha pagato senza inviare il modulo o ha abbandonato dopo il pagamento.
  //    MAI approvazione automatica: il segretario completa i dati e approva
  //    dalla scheda.
  let domandaId: string | null = riga.domanda_id ?? null;
  let domandaCreata = false;
  if (riga.tipo === 'quota' && !domandaId && riga.email) {
    const { data: dom } = await supabase.from('domande_tesseramento')
      .select('id')
      .ilike('email', riga.email)
      .eq('stato', 'in_attesa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dom) domandaId = dom.id;
  }
  if (riga.tipo === 'quota' && !domandaId) {
    const emailDomanda = riga.email || riga.payer_email || 'da-completare@elbrenz.eu';
    const nomeDomanda = riga.nome || riga.payer_email || '(da identificare)';
    const { data: nuova, error: insErr } = await supabase
      .from('domande_tesseramento')
      .insert({
        nome: nomeDomanda,
        email: emailDomanda,
        messaggio: `Domanda creata automaticamente dal pagamento PayPal (capture ${captureId ?? 'n/d'}). Completare i dati anagrafici prima dell'approvazione.`,
      })
      .select('id')
      .single();
    if (!insErr && nuova) {
      domandaId = nuova.id;
      domandaCreata = true;
    } else if (insErr) {
      console.error('[paypal-webhook] auto-creazione domanda fallita:', insErr);
    }
  }
  if (riga.tipo === 'quota' && domandaId && domandaId !== riga.domanda_id) {
    await supabase.from('pagamenti_tesseramento')
      .update({ domanda_id: domandaId, updated_at: new Date().toISOString() })
      .eq('id', riga.id);
  }

  const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!sharedSecret) {
    console.error('[paypal-webhook] SEND_EMAIL_SHARED_SECRET mancante: notifica saltata');
    return;
  }
  const metodoLabel = riga.metodo === 'paypal' ? 'PayPal/carta' : 'bonifico';
  const chi = riga.anonimo ? 'Donatore anonimo' : (riga.nome || riga.email || riga.payer_email || 'in verifica (dati dal pagamento PayPal)');
  const cosa = riga.tipo === 'quota' ? 'Quota sociale 2026'
    : riga.tipo === 'integrazione' ? 'Integrazione quota 2026 (10 €)'
    : 'Donazione';
  let aggancio = '';
  if (riga.tipo === 'quota') {
    if (domandaCreata) {
      aggancio = `<p style="color:#8a6215;"><strong>⚠ Domanda creata automaticamente dal pagamento</strong> (#${domandaId!.slice(0, 8)}): completare i dati anagrafici dalla scheda prima dell'approvazione.</p>`;
    } else if (domandaId) {
      aggancio = `<p style="color:#2d8659;">✓ Agganciato alla domanda <strong>#${domandaId.slice(0, 8)}</strong>.</p>`;
    } else {
      aggancio = `<p style="color:#a33;"><strong>⚠ Pagamento orfano:</strong> impossibile creare o agganciare una domanda — verificare manualmente.</p>`;
    }
    const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET');
    if (domandaId && adminSecret) {
      const exp = Date.now() + TOKEN_TTL_MS;
      const t = await firmaToken(adminSecret, 'vista', domandaId, exp);
      // Parametri nel PATH (non query string): evita la corruzione da encoding
      // quoted-printable delle email (`=` + due cifre esadecimali → byte).
      aggancio += `<p style="margin-top:14px;"><a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/scheda-domanda/vista/${domandaId}/${exp}/${t}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:10px 22px;text-decoration:none;font-weight:600;font-size:13px;border-radius:4px;">Apri scheda domanda →</a></p>`;
    }
  }
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

      // Notifica Telegram al direttivo (16/7): best-effort, gated dalla stessa
      // idempotenza (dentro il blocco `notificato:true`) → una sola volta per
      // pagamento. Tipo → toggle in telegram_notifica. PII minima: nome+importo.
      const tipoNotifica = riga.tipo === 'integrazione' ? 'integrazione_quota'
        : riga.tipo === 'donazione' ? 'donazione'
        : 'pagamento_quota';
      notificaDirettivo(supabase, tipoNotifica, { nome: chi, importo: riga.importo }).catch(() => {});
      // Alert al direttivo se una quota resta orfana (né agganciata né creabile).
      if (riga.tipo === 'quota' && !domandaId) {
        notificaDirettivo(supabase, 'alert_anomalia', {
          dettaglio: `Pagamento quota orfano (${riga.importo} € da ${chi}): nessuna domanda agganciata o creata, verificare.`,
        }).catch(() => {});
      }

      // Ringraziamento al socio per l'INTEGRAZIONE completata (11/7): dentro
      // il guard `notificato` (idempotente sui replay). Link alla tessera
      // ESISTENTE: nessuna nuova tessera, nessun QR.
      if (riga.tipo === 'integrazione' && riga.domanda_id) {
        const { data: dom } = await supabase.from('domande_tesseramento')
          .select('nome, email, numero_tessera, codice_tessera, anno')
          .eq('id', riga.domanda_id).maybeSingle();
        if (dom?.codice_tessera && dom.email) {
          const grazieHtml = grazieIntegrazioneHtml({
            nome: dom.nome,
            anno: dom.anno ?? 2026,
            codiceTessera: dom.codice_tessera,
            avviso: avvisoCondivisa(dom.numero_tessera, dom.nome),
          });
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sharedSecret },
            body: JSON.stringify({
              to: dom.email,
              subject: `Grazie ${dom.nome}: la tua quota ${dom.anno ?? 2026} è completa · El Brenz`,
              html: grazieHtml,
              tags: [{ name: 'source', value: 'integrazione-grazie' }],
            }),
          }).catch((e) => console.error('[paypal-webhook] grazie integrazione fallito:', e));
        }
      }
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
  // AGGIUNTA (fix 8/7/2026): nei webhook REFUNDED reali supplementary_data
  // spesso manca — il capture_id sta nel link "up" del refund
  // (…/v2/payments/captures/{id}). Fallback: parse dei links.
  let captureDaLink: string | null = null;
  if (eventType === 'PAYMENT.CAPTURE.REFUNDED' && Array.isArray(resource.links)) {
    for (const l of resource.links as Array<Record<string, unknown>>) {
      const href = typeof l.href === 'string' ? l.href : '';
      const m = href.match(/\/(?:payments\/)?captures\/([A-Z0-9]+)/i);
      if (l.rel === 'up' && m) { captureDaLink = m[1]; break; }
    }
  }
  const captureId: string | null = eventType === 'PAYMENT.CAPTURE.REFUNDED'
    ? (related.capture_id ? String(related.capture_id) : captureDaLink)
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
