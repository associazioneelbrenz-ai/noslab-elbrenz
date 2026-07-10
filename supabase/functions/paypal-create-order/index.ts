// paypal-create-order — crea un ordine PayPal (M2.6 + addendum donazioni).
//
// POST { tipo?: 'quota'|'donazione', importo?, nome?, cognome?, email?, anonimo? }
//   - tipo 'quota' (default): importo SEMPRE 20.00 EUR fissato QUI lato
//     server — qualunque importo arrivi dal client viene ignorato.
//   - tipo 'donazione': importo dal client ma validato server-side
//     (numerico, min 1.00, max 500.00, due decimali, EUR). Fuori range → 400.
//   - anonimo (solo donazioni): NON salviamo nome/email — la riga a DB
//     contiene solo tipo, importo, order_id, stato, timestamp.
//
// Scrive la riga su pagamenti_tesseramento (stato 'creato') con service
// role; custom_id dell'ordine PayPal = id della riga (riconciliazione).
// Risponde { id: <orderID> } per l'SDK JS (createOrder).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  isOriginAllowed,
  jsonResponse,
  paypalAccessToken,
  paypalApiBase,
} from '../_shared/paypal.ts';

const ANNO_QUOTA = 2026;
const IMPORTO_QUOTA = '20.00'; // deliberato dal Direttivo — MAI dal client
// Integrazione quota 2026 (10 → 20 €) per i 19 soci storici che hanno già
// versato 10 € sui registri. Importo FISSATO QUI, mai dal client; il socio
// è identificato dal codice tessera (HMAC non enumerabile) → domanda_id
// agganciata già alla creazione (riconciliazione automatica nel webhook).
const IMPORTO_INTEGRAZIONE = '10.00';
const DONAZIONE_MIN = 1.0;
const DONAZIONE_MAX = 500.0;

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

  const tipo = body.tipo === 'donazione' ? 'donazione'
    : body.tipo === 'integrazione' ? 'integrazione'
    : 'quota';
  const anonimo = tipo === 'donazione' && body.anonimo === true;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let importo: string;
  let descrizione: string;
  let domandaId: string | null = null;
  let nomeIntegrazione: string | null = null;
  let emailIntegrazione: string | null = null;
  if (tipo === 'integrazione') {
    const codice = String(body.codice ?? '');
    if (!/^\d{1,6}-\d{4}-[0-9a-f]{24}$/.test(codice)) {
      return jsonResponse({ error: 'Codice tessera non valido.' }, 400, cors);
    }
    const { data: socio } = await supabase.from('domande_tesseramento')
      .select('id, nome, email, numero_tessera')
      .eq('codice_tessera', codice)
      .eq('stato', 'approvata')
      .maybeSingle();
    if (!socio) {
      return jsonResponse({ error: 'Tessera non trovata.' }, 400, cors);
    }
    importo = IMPORTO_INTEGRAZIONE;
    descrizione = `Integrazione quota ${ANNO_QUOTA} – tessera n. ${socio.numero_tessera}`;
    domandaId = socio.id;
    nomeIntegrazione = socio.nome;
    emailIntegrazione = socio.email;
  } else if (tipo === 'quota') {
    importo = IMPORTO_QUOTA;
    descrizione = `Quota sociale ${ANNO_QUOTA} – El Brenz`;
  } else {
    const raw = typeof body.importo === 'number'
      ? body.importo
      : parseFloat(String(body.importo ?? ''));
    if (
      !Number.isFinite(raw) ||
      raw < DONAZIONE_MIN ||
      raw > DONAZIONE_MAX ||
      Math.round(raw * 100) !== raw * 100
    ) {
      return jsonResponse(
        { error: 'Importo donazione non valido: da 1,00 € a 500,00 €, massimo due decimali.' },
        400,
        cors,
      );
    }
    importo = raw.toFixed(2);
    descrizione = 'Erogazione liberale – El Brenz';
  }

  const nome = tipo === 'integrazione' ? nomeIntegrazione
    : anonimo ? null : String(body.nome ?? '').trim().slice(0, 100) || null;
  const cognome = anonimo || tipo === 'integrazione' ? null : String(body.cognome ?? '').trim().slice(0, 100) || null;
  const email = tipo === 'integrazione' ? emailIntegrazione
    : anonimo ? null : String(body.email ?? '').trim().slice(0, 200) || null;

  // riga a DB prima dell'ordine: custom_id PayPal = id riga
  const { data: riga, error: dbErr } = await supabase
    .from('pagamenti_tesseramento')
    .insert({ tipo, anonimo, nome, cognome, email, anno: ANNO_QUOTA, importo, stato: 'creato', domanda_id: domandaId })
    .select('id')
    .single();
  if (dbErr || !riga) {
    console.error('[paypal-create-order] insert fallita:', dbErr);
    return jsonResponse({ error: 'Errore interno, riprova più tardi.' }, 500, cors);
  }

  try {
    const token = await paypalAccessToken();
    const resp = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'EUR', value: importo },
          description: descrizione,
          custom_id: riga.id,
        }],
      }),
    });
    const order = await resp.json();
    if (!resp.ok || !order.id) {
      console.error('[paypal-create-order] PayPal errore:', resp.status, JSON.stringify(order).slice(0, 300));
      return jsonResponse({ error: 'Errore nella creazione del pagamento.' }, 502, cors);
    }

    await supabase
      .from('pagamenti_tesseramento')
      .update({ order_id: order.id, updated_at: new Date().toISOString() })
      .eq('id', riga.id);

    return jsonResponse({ id: order.id }, 200, cors);
  } catch (err) {
    console.error('[paypal-create-order] eccezione:', err);
    return jsonResponse({ error: 'Errore nella creazione del pagamento.' }, 500, cors);
  }
});
