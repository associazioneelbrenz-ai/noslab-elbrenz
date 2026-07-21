// gita-crea-ordine — crea l'ordine PayPal per l'anticipo della gita sociale.
//
// POST { nome, cognome, email, telefono?, posti, codice_tessera?,
//        consenso_privacy, sorgente_utm? }
//   - anticipo = 30,00 € x posti (FISSATO qui lato server, mai dal client)
//   - bonus preorder: -5,00 € se la prenotazione avviene entro il 31/7/2026
//     (bloccato ADESSO in base all'orologio server; si applica al SALDO in
//     fase 2, non all'anticipo che resta un deposito)
//   - is_socio ricalcolato server-side dall'email (no spoofing tariffa)
//   - consenso_privacy OBBLIGATORIO
// Scrive una riga iscrizioni_gita (stato 'in_attesa') con service role;
// custom_id dell'ordine PayPal = id riga. Risponde { id: orderID }.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  isOriginAllowed,
  jsonResponse,
  paypalAccessToken,
  paypalApiBase,
} from '../_shared/paypal.ts';

const EVENTO = 'gita-giochi-medievali-2026';
const ANTICIPO_UNIT = 30; // € per posto — deliberato, MAI dal client
const BONUS_PREORDER = 5; // € di sconto sul totale se prenoti entro la scadenza
const PREORDER_CUTOFF = new Date('2026-07-31T23:59:59+02:00').getTime();
// Capienza pullman: 54 posti, NO overbooking (verbale direttivo). Il controllo
// vive qui lato server, non solo nel frontend (21/7).
const POSTI_MAX = 54;
// Termine iscrizioni: venerdì 14 agosto 2026, fine giornata Europe/Rome
// (CEST = +02:00). Oltre, l'edge rifiuta (oltre al form chiuso lato pagina).
const ISCRIZIONI_CUTOFF = new Date('2026-08-14T23:59:59+02:00').getTime();
const LIM = { nome: 100, cognome: 100, email: 200, telefono: 40 };

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo non consentito' }, 405, cors);
  if (!isOriginAllowed(origin)) return jsonResponse({ error: 'Origin non consentita' }, 403, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'JSON non valido' }, 400, cors); }

  const nome = String(body.nome ?? '').trim().slice(0, LIM.nome);
  const cognome = String(body.cognome ?? '').trim().slice(0, LIM.cognome);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, LIM.email);
  const telefono = String(body.telefono ?? '').trim().slice(0, LIM.telefono) || null;
  const posti = Math.trunc(Number(body.posti ?? 1));
  const codice = typeof body.codice_tessera === 'string' ? body.codice_tessera.trim() : '';
  const consenso = body.consenso_privacy === true;
  const utm = body.sorgente_utm && typeof body.sorgente_utm === 'object' ? body.sorgente_utm : null;

  if (!nome || !cognome) return jsonResponse({ error: 'Nome e cognome sono obbligatori.' }, 400, cors);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonResponse({ error: 'Email non valida.' }, 400, cors);
  if (!Number.isFinite(posti) || posti < 1 || posti > 10) {
    return jsonResponse({ error: 'Numero di posti non valido (1–10).' }, 400, cors);
  }
  if (!consenso) return jsonResponse({ error: 'Serve il consenso al trattamento dei dati.' }, 400, cors);

  // Chiusura iscrizioni (server-side): oltre il termine si rifiuta a monte,
  // senza creare righe né ordini PayPal.
  if (Date.now() > ISCRIZIONI_CUTOFF) {
    return jsonResponse({
      error: 'Iscrizioni chiuse. Scrivici a info@elbrenz.eu per la lista d\'attesa.',
      chiuse: true,
    }, 403, cors);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Capienza (server-side, no overbooking): posti già occupati =
  // iscrizioni confermate (anticipo/saldo pagato) + prenotazioni in volo
  // (in_attesa create negli ultimi 20 min, così due persone non si aggiudicano
  // lo stesso ultimo posto in una corsa simultanea). Se non c'è spazio per i
  // posti richiesti, si blocca PRIMA di creare riga e ordine PayPal.
  const sogliaInVolo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: occRows, error: occErr } = await supabase
    .from('iscrizioni_gita')
    .select('posti, stato, created_at')
    .eq('evento_slug', EVENTO);
  if (occErr) {
    console.error('[gita-crea-ordine] conteggio capienza fallito:', occErr);
    return jsonResponse({ error: 'Errore interno, riprova più tardi.' }, 500, cors);
  }
  let occupati = 0;
  for (const r of occRows ?? []) {
    const st = String((r as Record<string, unknown>).stato ?? '');
    const p = Number((r as Record<string, unknown>).posti) || 0;
    const ca = (r as Record<string, unknown>).created_at;
    if (st === 'anticipo_pagato' || st === 'saldo_pagato') occupati += p;
    else if (st === 'in_attesa' && typeof ca === 'string' && ca > sogliaInVolo) occupati += p;
  }
  if (occupati + posti > POSTI_MAX) {
    const restano = Math.max(0, POSTI_MAX - occupati);
    return jsonResponse({
      error: restano > 0
        ? `Sul pullman restano solo ${restano} ${restano === 1 ? 'posto' : 'posti'}: riduci il numero, oppure scrivici a info@elbrenz.eu per la lista d'attesa.`
        : 'Il pullman è al completo (54 posti). Scrivici a info@elbrenz.eu per la lista d\'attesa.',
      posti_disponibili: restano,
      esaurito: restano <= 0,
    }, 409, cors);
  }

  // is_socio ricalcolato server-side (domanda approvata con quell'email o codice)
  let isSocio = false;
  {
    let q = supabase.from('domande_tesseramento').select('id')
      .ilike('email', email).eq('stato', 'approvata').limit(1);
    if (codice && /^\d{1,6}-\d{4}-[0-9a-f]{24}$/.test(codice)) {
      q = supabase.from('domande_tesseramento').select('id')
        .eq('codice_tessera', codice).eq('stato', 'approvata').limit(1);
    }
    const { data } = await q.maybeSingle();
    isSocio = !!data;
  }

  const importoAnticipo = (ANTICIPO_UNIT * posti).toFixed(2);
  const bonus = Date.now() <= PREORDER_CUTOFF ? BONUS_PREORDER.toFixed(2) : '0.00';

  const { data: riga, error: dbErr } = await supabase
    .from('iscrizioni_gita')
    .insert({
      evento_slug: EVENTO,
      nome, cognome, email, telefono,
      posti,
      is_socio: isSocio,
      codice_tessera: codice || null,
      stato: 'in_attesa',
      importo_anticipo: importoAnticipo,
      bonus_preorder: bonus,
      metodo: 'paypal',
      consenso_privacy: true,
      sorgente_utm: utm,
    })
    .select('id')
    .single();
  if (dbErr || !riga) {
    console.error('[gita-crea-ordine] insert fallita:', dbErr);
    return jsonResponse({ error: 'Errore interno, riprova più tardi.' }, 500, cors);
  }

  try {
    const token = await paypalAccessToken();
    const resp = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'EUR', value: importoAnticipo },
          description: `Anticipo gita Giochi Medievali 22/8 – ${posti} posto/i`,
          custom_id: riga.id,
        }],
      }),
    });
    const order = await resp.json();
    if (!resp.ok || !order.id) {
      console.error('[gita-crea-ordine] PayPal errore:', resp.status, JSON.stringify(order).slice(0, 300));
      return jsonResponse({ error: 'Errore nella creazione del pagamento.' }, 502, cors);
    }
    await supabase.from('iscrizioni_gita')
      .update({ paypal_order_id: order.id, updated_at: new Date().toISOString() })
      .eq('id', riga.id);
    return jsonResponse({ id: order.id, bonus_preorder: bonus }, 200, cors);
  } catch (err) {
    console.error('[gita-crea-ordine] eccezione:', err);
    return jsonResponse({ error: 'Errore nella creazione del pagamento.' }, 500, cors);
  }
});
