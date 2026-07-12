// guardiani-contributo — motore di contribuzione «Guardiani de la lenga»
// (12/07/2026). Glossario del ladino anaunico crowdsourced con curatela
// umana OBBLIGATORIA (pattern convenzioni-proposta + scheda-domanda).
//
// Rami (dal path):
//   POST  /guardiani-contributo                      → invio contributo
//   GET   /guardiani-contributo/azione/{valida|rifiuta}/{id}/{exp}/{t}
//   POST  /guardiani-contributo/azione/...           → esegue (conferma)
//   GET   /guardiani-contributo/conferma-newsletter/{id}/{token}
//
// SICUREZZA: honeypot + time-trap + rate limit persistente (RPC condivisa
// convenzioni_rl_hit, prefisso guardiani:); HMAC nel PATH (mai query string);
// nessun contributo entra nel glossario pubblico senza validazione umana.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaToken, verificaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app', 'https://elbrenz.eu', 'https://www.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:3000',
];
const RATE_MAX = 5;
const MIN_FORM_AGE_MS = 3000;
const RECIPIENT = 'info@elbrenz.eu';
const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;
const VARIANTI = ['noneso', 'solander', 'rabies', 'pegaes'];
const TIPI = ['parola', 'frase', 'espressione'];
const VARIANTE_LABEL: Record<string, string> = {
  noneso: 'Noneso (Val di Non)', solander: 'Solander (Val di Sole)',
  rabies: 'Rabies (Val di Rabbi)', pegaes: 'Pegaes (Val di Pejo)',
};

function cors(origin: string | null): Record<string, string> {
  const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Vary': 'Origin',
  };
}
function json(b: unknown, s: number, c: Record<string, string>): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...c, 'Content-Type': 'application/json' } });
}
function html(body: string, s = 200): Response {
  return new Response(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/>
<title>Guardiani de la lenga · El Brenz</title><style>
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#F8F1E4;color:#1E2E26;margin:0;padding:24px;}
.card{max-width:560px;margin:0 auto;background:#fff;border-top:4px solid #C8923E;border-radius:8px;padding:32px;}
h1{font-family:Georgia,serif;font-size:24px;margin:0 0 8px;}.occhiello{color:#C8923E;text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:600;}
.btn{display:inline-block;padding:12px 26px;border-radius:4px;text-decoration:none;font-weight:600;font-size:14px;border:0;cursor:pointer;}
.ok{background:#C8923E;color:#1E2E26;}.no{background:#fff;color:#a33;border:2px solid #d97a7a;}
textarea{width:100%;box-sizing:border-box;border:1px solid #E5DFCF;border-radius:4px;padding:10px;font-family:inherit;font-size:14px;}
.nota{color:#999;font-size:12px;margin-top:18px;}</style></head><body><div class="card">${body}</div></body></html>`,
    { status: s, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function inviaEmail(to: string, subject: string, body: string, replyTo?: string): Promise<boolean> {
  const secret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!secret) return false;
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': secret },
      body: JSON.stringify({ to, subject, html: body, ...(replyTo ? { reply_to: replyTo } : {}), tags: [{ name: 'source', value: 'guardiani' }] }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const c = cors(origin);
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: c });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET') ?? '';

  // ---- ramo CONFERMA NEWSLETTER (double opt-in) --------------------------
  const mNews = url.pathname.match(/\/conferma-newsletter\/([0-9a-f-]{36})\/([0-9a-f]+)\/?$/);
  if (mNews) {
    const [, id, token] = mNews;
    const { data: contrib } = await supabase.from('guardiani_contributori')
      .select('id, marketing_token, marketing_double_optin').eq('id', id).maybeSingle();
    if (!contrib || contrib.marketing_token !== token) {
      return html('<p class="occhiello">Guardiani de la lenga</p><h1>Link non valido</h1><p>Il link di conferma è scaduto o già usato.</p>');
    }
    if (!contrib.marketing_double_optin) {
      await supabase.from('guardiani_contributori')
        .update({ marketing_double_optin: true, marketing_confermato_il: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
    }
    return html('<p class="occhiello">Guardiani de la lenga</p><h1>Iscrizione confermata ✓</h1><p>Grazie! Da ora riceverai gli aggiornamenti sul glossario e sui progetti della lingua. <em>Raìs fonde no le ’nglacia.</em></p>');
  }

  // ---- ramo CURATELA (valida / rifiuta) ----------------------------------
  const mAz = url.pathname.match(/\/azione\/(valida|rifiuta)\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
  if (mAz) {
    // Risposte in JSON (la piattaforma Supabase forza text/plain sull'HTML
    // servito dalle edge: la conferma renderizzata la fa la pagina
    // /guardiani-curatela su elbrenz.eu, che chiama questo endpoint).
    if (!adminSecret) return json({ ok: false, error: 'config_mancante' }, 500, c);
    const azione = mAz[1] as 'valida' | 'rifiuta';
    const id = mAz[2]; const exp = parseInt(mAz[3], 10); const t = mAz[4];
    const ok = await verificaToken(adminSecret, `guardiani-${azione}`, id, exp, t);
    if (!ok) return json({ ok: false, error: 'link_non_valido' }, 403, c);

    const { data: lemma } = await supabase.from('dizionario_lemma')
      .select('id, lemma, parlata, stato').eq('id', id).maybeSingle();
    if (!lemma) return json({ ok: false, error: 'non_trovato' }, 404, c);

    if (req.method === 'GET') {
      // peek: dà alla pagina i dati del lemma + un token fresco per il POST
      if (lemma.stato === 'pubblicato' || lemma.stato === 'rifiutato') {
        return json({ ok: false, error: 'gia_gestito', stato: lemma.stato, lemma: lemma.lemma }, 200, c);
      }
      const expAz = Date.now() + TOKEN_TTL_MS;
      const tAz = await firmaToken(adminSecret, `guardiani-${azione}`, id, expAz);
      return json({
        ok: true, azione, lemma: lemma.lemma,
        variante: VARIANTE_LABEL[lemma.parlata] ?? lemma.parlata, stato: lemma.stato,
        post: { id, exp: expAz, t: tAz },
      }, 200, c);
    }

    // POST: esegue la transizione
    if (lemma.stato === 'pubblicato' || lemma.stato === 'rifiutato') {
      return json({ ok: false, error: 'gia_gestito', stato: lemma.stato }, 200, c);
    }
    if (azione === 'valida') {
      await supabase.from('dizionario_lemma').update({
        stato: 'pubblicato', validato_da: 'Commissione Linguistica El Brenz (via email)',
        validato_il: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', id).eq('stato', 'in_revisione');
      return json({ ok: true, azione: 'valida', stato: 'pubblicato', lemma: lemma.lemma,
        message: `«${lemma.lemma}» è ora nel glossario pubblico.` }, 200, c);
    }
    let motivo = '';
    try { const b = await req.json(); motivo = String((b as Record<string, unknown>)?.motivo ?? '').trim().slice(0, 500); } catch { /**/ }
    await supabase.from('dizionario_lemma').update({
      stato: 'rifiutato', motivo_rifiuto: motivo || null, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('stato', 'in_revisione');
    return json({ ok: true, azione: 'rifiuta', stato: 'rifiutato', lemma: lemma.lemma,
      message: `«${lemma.lemma}» non entrerà nel glossario.` }, 200, c);
  }

  // ---- ramo INVIO CONTRIBUTO (POST dal form) -----------------------------
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, c);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origin non consentita' }, 403, c);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto';
  try {
    const ipHash = await sha256Hex(`guardiani:${ip}`);
    const { data: entro } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_MAX });
    if (entro === false) return json({ error: 'Hai inviato troppi contributi: riprova più tardi.' }, 429, c);
  } catch { /* fail-open */ }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'JSON non valido' }, 400, c); }
  const str = (k: string, max = 500) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');

  if (str('_honeypot')) return json({ success: true }, 200, c);
  const ts = typeof body._ts === 'number' ? body._ts : 0;
  if (ts && Date.now() - ts < MIN_FORM_AGE_MS) return json({ success: true }, 200, c);

  const termine = str('termine', 200);
  const variante = str('variante', 20);
  const tipo = str('tipo', 20);
  const significato = str('significato', 2000);
  const comune = str('comune', 100);
  const esempio = str('esempio', 1000);
  const nome = str('nome', 100);
  const email = str('email', 200);
  const consensoGlossario = body.consenso_glossario === true;
  const consensoMarketing = body.consenso_marketing === true;
  const consensoFirma = body.consenso_firma === true;
  const licenza = body.licenza_accettata === true;
  const utm = (body.utm && typeof body.utm === 'object') ? body.utm as Record<string, string> : null;

  if (termine.length < 1) return json({ error: 'Scrivi il termine o la frase.' }, 400, c);
  if (!VARIANTI.includes(variante)) return json({ error: 'Scegli una variante valida.' }, 400, c);
  if (!TIPI.includes(tipo)) return json({ error: 'Scegli il tipo (parola, frase o espressione).' }, 400, c);
  if (significato.length < 2) return json({ error: 'Spiega il significato in italiano.' }, 400, c);
  if (nome.length < 2) return json({ error: 'Inserisci il tuo nome.' }, 400, c);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email non valida.' }, 400, c);
  if (!consensoGlossario) return json({ error: 'Serve il consenso all’uso del contributo nel glossario.' }, 400, c);
  if (!licenza) return json({ error: 'Serve accettare la licenza del contributo.' }, 400, c);

  // upsert contributore (per email); doppio opt-in marketing con token
  const marketingToken = consensoMarketing ? crypto.randomUUID().replace(/-/g, '') : null;
  const { data: contrib, error: errC } = await supabase.from('guardiani_contributori')
    .upsert({
      nome, email, consenso_glossario: true, consenso_marketing: consensoMarketing,
      consenso_firma: consensoFirma, licenza_accettata: true, licenza_tipo: 'CC BY 4.0',
      ...(marketingToken ? { marketing_token: marketingToken } : {}),
      sorgente_utm: utm, updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })
    .select('id, marketing_double_optin, marketing_token').single();
  if (errC || !contrib) { console.error('[guardiani] upsert contributore:', errC); return json({ error: 'Errore interno, riprova.' }, 500, c); }

  const { data: lemma, error: errL } = await supabase.from('dizionario_lemma')
    .insert({
      lemma: termine, parlata: variante, tipo, definizione: significato,
      comune: comune || null, esempi_uso: esempio || null,
      stato: 'in_revisione', contributore_id: contrib.id, sorgente_utm: utm,
    }).select('id').single();
  if (errL || !lemma) { console.error('[guardiani] insert lemma:', errL); return json({ error: 'Errore interno, riprova.' }, 500, c); }

  // email al curatore con link HMAC valida/rifiuta (best-effort)
  if (adminSecret) {
    const exp = Date.now() + TOKEN_TTL_MS;
    const tV = await firmaToken(adminSecret, 'guardiani-valida', lemma.id, exp);
    const tR = await firmaToken(adminSecret, 'guardiani-rifiuta', lemma.id, exp);
    // Link alla pagina di curatela su elbrenz.eu (renderizza HTML; chiama
    // l'edge in JSON). Token HMAC nel PATH (non in query: si corrompe in
    // quoted-printable delle email).
    const base = 'https://elbrenz.eu/guardiani-curatela';
    await inviaEmail(RECIPIENT, `[GUARDIANI] «${termine}» (${variante}) da ${nome}`,
      `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
        <div style="background:#fff;padding:28px;border-radius:8px;border-top:4px solid #C8923E;">
          <h1 style="font-size:19px;color:#1E2E26;margin:0 0 4px;">Nuovo contributo al glossario</h1>
          <p style="color:#666;font-size:13px;margin:0 0 16px;">Guardiani de la lenga · da validare</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#8a6215;width:120px;">Termine</td><td style="padding:6px 0;"><strong>${esc(termine)}</strong> (${esc(tipo)})</td></tr>
            <tr><td style="padding:6px 0;color:#8a6215;">Variante</td><td style="padding:6px 0;">${esc(VARIANTE_LABEL[variante] ?? variante)}</td></tr>
            <tr><td style="padding:6px 0;color:#8a6215;">Significato</td><td style="padding:6px 0;">${esc(significato)}</td></tr>
            ${comune ? `<tr><td style="padding:6px 0;color:#8a6215;">Paese</td><td style="padding:6px 0;">${esc(comune)}</td></tr>` : ''}
            ${esempio ? `<tr><td style="padding:6px 0;color:#8a6215;">Esempio</td><td style="padding:6px 0;">${esc(esempio)}</td></tr>` : ''}
            <tr><td style="padding:6px 0;color:#8a6215;">Contributore</td><td style="padding:6px 0;">${esc(nome)} · ${esc(email)}${consensoFirma ? ' · <em>firma pubblica ok</em>' : ' · anonimo nel glossario'}</td></tr>
          </table>
          <div style="margin-top:20px;text-align:center;">
            <a href="${base}/valida/${lemma.id}/${exp}/${tV}" style="display:inline-block;background:#2d8659;color:#fff;padding:11px 26px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px 8px;">✓ Valida e pubblica</a>
            <a href="${base}/rifiuta/${lemma.id}/${exp}/${tR}" style="display:inline-block;background:#fff;color:#a33;border:2px solid #d97a7a;padding:9px 24px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px 8px;">✗ Rifiuta</a>
          </div>
          <p style="color:#999;font-size:11px;text-align:center;">Con conferma in pagina · link validi 30 giorni</p>
        </div></body></html>`, email);
  }

  // cortesia al contributore (ha consenso_glossario)
  await inviaEmail(email, 'Grazie: il tuo contributo al glossario ladino · El Brenz',
    `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#F8F1E4;">
      <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
        <table role="presentation"><tr><td style="width:56px;"><img src="${LOGO_URL}" width="46" height="46" alt="El Brenz" style="border-radius:50%;display:block;"/></td>
        <td><h1 style="font-family:Georgia,serif;font-size:20px;margin:0;color:#1E2E26;">Grazie, ${esc(nome)}!</h1></td></tr></table>
        <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:18px 0 0;">Hai proposto <strong>«${esc(termine)}»</strong> per il glossario del ladino anaunico. Un curatore lo controlla e, appena validato, entrerà nel glossario vivo dei <em>Guardiani de la lenga</em>.</p>
        <p style="color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:16px 0 0;">Raìs fonde no le ’nglacia</p>
        <p style="color:#999;font-size:11px;margin:12px 0 0;">Associazione El Brenz · info@elbrenz.eu</p>
      </div></body></html>`);

  // double opt-in newsletter (solo se ha chiesto il marketing)
  if (consensoMarketing && marketingToken) {
    const link = `${Deno.env.get('SUPABASE_URL')}/functions/v1/guardiani-contributo/conferma-newsletter/${contrib.id}/${marketingToken}`;
    await inviaEmail(email, 'Conferma la tua iscrizione · El Brenz',
      `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#F8F1E4;">
        <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
          <h1 style="font-family:Georgia,serif;font-size:20px;margin:0 0 8px;color:#1E2E26;">Un ultimo passo</h1>
          <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0;">Per ricevere gli aggiornamenti sul glossario e sui progetti della lingua, conferma la tua iscrizione:</p>
          <p style="text-align:center;margin:22px 0;"><a href="${link}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:12px 26px;text-decoration:none;font-weight:600;font-size:15px;border-radius:4px;">Conferma l’iscrizione</a></p>
          <p style="color:#999;font-size:12px;margin:0;">Se non l’hai richiesta tu, ignora questa email: senza conferma non riceverai nulla.</p>
        </div></body></html>`);
  }

  return json({ success: true }, 200, c);
});
