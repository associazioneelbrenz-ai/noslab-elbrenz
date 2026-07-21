// ricevuta-ocr — upload ricevuta bonifico + estrazione campi via Claude
// (M2.6-bis). POST multipart/form-data: file (jpg/png/pdf, max 10 MB),
// tipo ('quota'|'donazione'), nome?, email?.
//
// Flusso: salva il file nel bucket PRIVATO 'ricevute' (nessuna policy:
// solo service role) → OCR best-effort con Claude Haiku (structured
// outputs: JSON garantito valido) → riga su pagamenti_tesseramento con
// metodo='bonifico' e stato='in_verifica'.
//
// REGOLA: MAI approvazione né rifiuto automatici. La conferma a
// 'completato' è sempre manuale. L'OCR serve solo a pre-compilare la
// verifica; incoerenze (quota: importo ≠ 20.00 o causale non coerente,
// o campi illeggibili) alzano solo il flag `anomalia`.
//
// Retention: file cancellato dopo conferma o max 12 mesi (documentato in
// HANDOFF e nell'informativa breve del modulo).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildCorsHeaders, isOriginAllowed, jsonResponse } from '../_shared/paypal.ts';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MIME_OK: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
const IMPORTO_QUOTA = 20.0;

const SCHEMA_ESTRAZIONE = {
  type: 'object',
  properties: {
    importo: { type: ['string', 'null'], description: 'Importo del bonifico, es. "20.00"' },
    valuta: { type: ['string', 'null'], description: 'Codice valuta, es. "EUR"' },
    data: { type: ['string', 'null'], description: 'Data operazione in formato YYYY-MM-DD' },
    ordinante: { type: ['string', 'null'], description: 'Nome dell\'ordinante del bonifico' },
    causale: { type: ['string', 'null'], description: 'Causale del bonifico' },
    cro_trn: { type: ['string', 'null'], description: 'CRO o TRN della transazione' },
  },
  required: ['importo', 'valuta', 'data', 'ordinante', 'causale', 'cro_trn'],
  additionalProperties: false,
};

type Estratto = {
  importo: string | null;
  valuta: string | null;
  data: string | null;
  ordinante: string | null;
  causale: string | null;
  cro_trn: string | null;
};

/** OCR best-effort: null se la chiamata fallisce (non blocca l'upload). */
async function estraiCampi(bytes: Uint8Array, mime: string): Promise<Estratto | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('[ricevuta-ocr] ANTHROPIC_API_KEY mancante');
    return null;
  }
  // base64 senza newline (richiesto dall'API)
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);

  const blocco = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        output_config: { format: { type: 'json_schema', schema: SCHEMA_ESTRAZIONE } },
        messages: [{
          role: 'user',
          content: [
            blocco,
            {
              type: 'text',
              text: 'Questo documento è la ricevuta di un bonifico bancario. Estrai i campi richiesti dallo schema. Usa null per ogni campo non presente o non leggibile con certezza; non inventare valori.',
            },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      console.error('[ricevuta-ocr] Anthropic errore:', resp.status, (await resp.text()).slice(0, 200));
      return null;
    }
    const data = await resp.json();
    if (data.stop_reason === 'refusal') return null;
    const testo = (data.content ?? []).find((b: { type: string }) => b.type === 'text')?.text;
    return testo ? JSON.parse(testo) as Estratto : null;
  } catch (err) {
    console.error('[ricevuta-ocr] eccezione OCR:', err);
    return null;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: 'Invia il modulo come multipart/form-data.' }, 400, cors);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonResponse({ error: 'Nessun file ricevuto.' }, 400, cors);
  }
  const ext = MIME_OK[file.type];
  if (!ext) {
    return jsonResponse({ error: 'Formato non supportato: usa JPG, PNG o PDF.' }, 400, cors);
  }
  if (file.size > MAX_BYTES) {
    return jsonResponse({ error: 'File troppo grande: massimo 10 MB.' }, 400, cors);
  }

  const tipo = form.get('tipo') === 'donazione' ? 'donazione' : 'quota';
  const nome = String(form.get('nome') ?? '').trim().slice(0, 100) || null;
  const email = String(form.get('email') ?? '').trim().slice(0, 200) || null;
  // 14/7: binding ricevuta bonifico <-> domanda_tesseramento (come custom_id
  // in paypal-create-order): la ricevuta non deve restare orfana. Facoltativo
  // (upload possibile anche senza domanda), validato come UUID.
  const domandaRaw = String(form.get('domanda_id') ?? '').trim();
  const domandaId = /^[0-9a-f-]{36}$/i.test(domandaRaw) ? domandaRaw : null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Rate-limit anti abuso (audit 14/7): ogni chiamata fa OCR Anthropic (costo),
  // upload storage e insert. Prima solo l'origin gate (spoofabile). Limite orario per IP.
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto';
    const { data: entro } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: await sha256Hex(`ricevuta:${ip}`), p_max: 6 });
    if (entro === false) return jsonResponse({ error: 'Troppi invii: riprova più tardi.' }, 429, cors);
  } catch { /* fail-open sul limiter */ }

  // 1. Salva il file nel bucket privato (prima dell'OCR: la ricevuta non
  //    va mai persa anche se l'estrazione fallisce).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('ricevute')
    .upload(path, bytes, { contentType: file.type });
  if (upErr) {
    console.error('[ricevuta-ocr] upload storage fallito:', upErr);
    return jsonResponse({ error: 'Caricamento non riuscito, riprova.' }, 500, cors);
  }

  // 2. OCR best-effort.
  const estratto = await estraiCampi(bytes, file.type);

  // 3. Flag anomalia — MAI rifiuto automatico, solo segnalazione.
  let anomalia = false;
  if (!estratto) {
    anomalia = true; // illeggibile / OCR non disponibile
  } else if (tipo === 'quota') {
    const imp = estratto.importo ? parseFloat(estratto.importo.replace(',', '.')) : NaN;
    const causaleOk = (estratto.causale ?? '').toLowerCase().includes('quota');
    if (!Number.isFinite(imp) || Math.abs(imp - IMPORTO_QUOTA) > 0.001 || !causaleOk) {
      anomalia = true;
    }
  }

  const { error: dbErr } = await supabase.from('pagamenti_tesseramento').insert({
    tipo,
    metodo: 'bonifico',
    anno: new Date().getFullYear(),  // audit 14/7: coerenza con paypal-create-order (riconciliazione per anno)
    stato: 'in_verifica',
    anomalia,
    nome,
    email,
    domanda_id: domandaId,
    importo: estratto?.importo ? parseFloat(estratto.importo.replace(',', '.')) || null : null,
    ricevuta_path: path,
    ricevuta_dati: estratto,
  });
  if (dbErr) {
    console.error('[ricevuta-ocr] insert fallita:', dbErr);
    return jsonResponse({ error: 'Errore interno, riprova più tardi.' }, 500, cors);
  }

  // Traccia il metodo scelto sulla domanda (brief 21/7): caricando la ricevuta
  // il richiedente ha scelto il bonifico. Best-effort, non blocca il flusso.
  if (domandaId) {
    await supabase.from('domande_tesseramento').update({ metodo_scelto: 'bonifico' }).eq('id', domandaId);
  }

  // Notifica Telegram al direttivo (16/7): ricevuta bonifico caricata, da
  // verificare. Best-effort, non blocca la risposta al socio. PII minima.
  notificaDirettivo(supabase, 'ricevuta_bonifico', {
    nome, importo: estratto?.importo ?? null, anomalia,
  }).catch(() => {});

  return jsonResponse(
    { success: true, message: 'Ricevuta caricata! La verificheremo e riceverai conferma via email.' },
    200,
    cors,
  );
});
