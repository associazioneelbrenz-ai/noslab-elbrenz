// supabase/functions/contact-form/index.ts
//
// Edge Function: form contatto pubblico per /tesseramento.
// Wrappa send-email con protezioni anti-abuso prima di inoltrare.
//
// Protezioni:
//   1. Origin whitelist (solo domini fidati)
//   2. Honeypot field server-side (_honeypot deve essere vuoto)
//   3. Time-trap (_ts: tempo apertura form, deve essere > 3 sec fa)
//   4. Validazione campi (lunghezze, email regex)
//   5. HTML escape su input utente
//   6. Rate limit IP (max 3 submission/ora) — in-memory v1
//
// Chiama internamente send-email via SEND_EMAIL_SHARED_SECRET (no JWT).
//
// M.A.2.5 — pagina /tesseramento, form contatto sicuro.
// M.A.2.5 fix CORS: preflight ritorna sempre 200 con header validi se Origin
//   è whitelisted, indipendentemente da metodo. Origin check spostato a dopo
//   il preflight per non rompere il preflight stesso.
// M.A.2.5 fix auth send-email: shared secret pattern invece di SERVICE_ROLE_KEY
//   (che con la nuova gestione chiavi Supabase non è più un JWT valido).
// 20/7 sera (via MCP, concordato con Cristian): redeploy IDENTICO del codice v36
//   con verify_jwt=false. Il deploy CLI del 20/7 mattina aveva riacceso il flag
//   (default CLI) → 401 su tutti gli invii del form pubblico. Nessuna modifica
//   di codice oltre a questo commento. Da persistere in supabase/config.toml.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { firmaToken, TOKEN_TTL_MS } from "../_shared/admin.ts"
import { notificaDirettivo } from "../_shared/notificaDirettivo.ts"

// =============================================================================
// CONFIG
// =============================================================================

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
  'https://community.elbrenz.eu',
  'https://www.elbrenz.eu',
  'http://localhost:4321',  // Astro dev default
  'http://localhost:3000',  // dev alt
]

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000  // 1 ora
const RATE_LIMIT_MAX = 3                       // 3 submissions per IP/ora
const MIN_FORM_AGE_MS = 3 * 1000               // form aperto da almeno 3s

const FIELD_LIMITS = {
  nome: { min: 2, max: 100 },
  email: { min: 5, max: 200 },
  messaggio: { min: 10, max: 2000 },
  comune_nascita: { min: 2, max: 100 },
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const SESSO_VALUES = ['M', 'F']

// Età: minimo 14 anni (sotto i quali serve consenso genitori per APS)
const MIN_AGE_YEARS = 14
const MAX_AGE_YEARS = 120

const SEND_EMAIL_URL =
  'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/send-email'
const RECIPIENT_EMAIL = 'info@elbrenz.eu'

// =============================================================================
// CORS — risposta dinamica in base a Origin presente nella request
// =============================================================================

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function isOriginAllowed(origin: string | null): boolean {
  return !!origin && ALLOWED_ORIGINS.includes(origin)
}

// =============================================================================
// RATE LIMIT — in-memory, si resetta a cold start
// =============================================================================

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

function checkRateLimit(ip: string): {
  allowed: boolean
  remaining: number
  retryAfterSeconds?: number
} {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterMs = entry.windowStart + RATE_LIMIT_WINDOW_MS - now
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

// =============================================================================
// HELPERS
// =============================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

// SHA-256 esadecimale: l'IP non entra MAI in chiaro nella tabella rate limit,
// solo il suo hash (come contatti-submit/convenzioni).
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// =============================================================================
// EMAIL TEMPLATE
// =============================================================================

function buildEmailHtml(
  nome: string,
  email: string,
  messaggio: string,
  dataNascita: string,
  comuneNascita: string,
  sesso: string,
  ip: string,
  pagamentoHtml = '',   // M2.6-ter: sezione PAGAMENTO (stato live)
  schedaHtml = '',      // M2.6-ter: link firmato alla scheda domanda
): string {
  const nomeEsc = escapeHtml(nome)
  const emailEsc = escapeHtml(email)
  const messaggioEsc = escapeHtml(messaggio).replace(/\n/g, '<br/>')
  const comuneEsc = escapeHtml(comuneNascita)
  const dataNascitaFormatted = dataNascita
    ? new Date(dataNascita).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'
  const sessoLabel = sesso === 'M' ? 'Maschile' : sesso === 'F' ? 'Femminile' : '—'
  const dataFormatted = new Date().toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
  })

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #F8F1E4;">
  <div style="background: #fff; padding: 32px; border-radius: 8px; border-top: 4px solid #C8923E;">
    <h1 style="color: #1E2E26; font-size: 22px; margin: 0 0 8px 0;">Nuova richiesta tesseramento</h1>
    <p style="color: #666; font-size: 13px; margin: 0 0 24px 0;">Ricevuta dal form pubblico /tesseramento</p>

    <h2 style="color: #1E2E26; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #C8923E;">Contatto</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; font-size: 13px; width: 140px; vertical-align: top;">Nome</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1E2E26; font-size: 15px;"><strong>${nomeEsc}</strong></td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; font-size: 13px; vertical-align: top;">Email</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1E2E26; font-size: 15px;"><a href="mailto:${emailEsc}" style="color: #C8923E;">${emailEsc}</a></td>
      </tr>
    </table>

    <h2 style="color: #1E2E26; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #C8923E;">Dati anagrafici</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; font-size: 13px; width: 140px; vertical-align: top;">Data di nascita</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1E2E26; font-size: 15px;">${dataNascitaFormatted}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; font-size: 13px; vertical-align: top;">Comune di nascita</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1E2E26; font-size: 15px;">${comuneEsc}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; font-size: 13px; vertical-align: top;">Sesso</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #1E2E26; font-size: 15px;">${sessoLabel}</td>
      </tr>
    </table>

    <h2 style="color: #1E2E26; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #C8923E;">Messaggio</h2>
    <div style="background: #FDF9F0; padding: 16px; border-left: 3px solid #C8923E; color: #1E2E26; font-size: 15px; line-height: 1.6;">${messaggioEsc}</div>

    ${pagamentoHtml}
    ${schedaHtml}

    <div style="margin-top: 24px; padding: 12px 16px; background: #f0f7f1; border-left: 3px solid #2d8659; color: #1E2E26; font-size: 12px;">
      ✓ Consenso GDPR ricevuto · Data invio: ${dataFormatted}
    </div>

    <p style="color: #999; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;">
      IP: ${escapeHtml(ip)} · Rispondi direttamente a questa email per rispondere al richiedente.
    </p>
  </div>
</body>
</html>`
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = buildCorsHeaders(origin)

  console.log(`[contact-form] ${req.method} origin=${origin}`)

  // 1. Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  // 2. Block non-whitelisted origins (sui POST veri)
  if (!isOriginAllowed(origin)) {
    console.warn(`[contact-form] blocked origin: ${origin}`)
    return jsonResponse({ error: 'Origin not allowed' }, 403, cors)
  }

  // 3. Method check
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, cors)
  }

  // 4. Rate limit (in-memory: gate veloce per-istanza, si azzera a cold start)
  const ip = getClientIp(req)
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    console.warn(`[contact-form] rate limit hit ip=${ip}`)
    return jsonResponse(
      {
        error: 'Hai inviato troppe richieste. Riprova più tardi.',
        retryAfter: rl.retryAfterSeconds,
      },
      429,
      cors,
    )
  }

  // 4b. Rate limit PERSISTENTE su DB (C5, 20/7): il gate in-memory qui sopra non
  // sopravvive ai cold start ne' e' condiviso tra istanze. Stessa RPC oraria di
  // contatti-submit/convenzioni, prefisso dedicato per non condividere il bucket.
  // Fail-open: un errore DB non deve mai impedire un'iscrizione.
  try {
    const rlDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const ipHash = await sha256Hex(`contact-form:${ip}`)
    const { data: entro } = await rlDb.rpc('convenzioni_rl_hit', {
      p_ip_hash: ipHash,
      p_max: RATE_LIMIT_MAX,
    })
    if (entro === false) {
      console.warn('[contact-form] rate limit DB hit')
      return jsonResponse(
        { error: 'Hai inviato troppe richieste. Riprova più tardi.' },
        429,
        cors,
      )
    }
  } catch (e) {
    console.error('[contact-form] rate limit DB errore (fail-open):', e)
  }

  // 5. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, cors)
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const messaggio =
    typeof body.messaggio === 'string' ? body.messaggio.trim() : ''
  const dataNascita =
    typeof body.data_nascita === 'string' ? body.data_nascita.trim() : ''
  const comuneNascita =
    typeof body.comune_nascita === 'string' ? body.comune_nascita.trim() : ''
  const sesso =
    typeof body.sesso === 'string' ? body.sesso.trim().toUpperCase() : ''
  const gdpr = body.gdpr === true
  const honeypot = typeof body._honeypot === 'string' ? body._honeypot : ''
  const ts = typeof body._ts === 'number' ? body._ts : 0
  // VETR 2/3 (11/7): sorgente utm opzionale (source/medium/campaign, stringhe
  // corte) -> colonna sorgente_utm jsonb; assente = NULL.
  let sorgenteUtm: Record<string, string> | null = null
  if (body.utm && typeof body.utm === 'object') {
    const u = body.utm as Record<string, unknown>
    const pulisci = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '')
    const cand = { source: pulisci(u.source), medium: pulisci(u.medium), campaign: pulisci(u.campaign) }
    if (cand.source || cand.medium || cand.campaign) sorgenteUtm = cand
  }

  // 6. Honeypot: se compilato, è un bot. Risposta 200 silenziosa.
  if (honeypot.length > 0) {
    console.warn(`[contact-form] honeypot triggered ip=${ip}`)
    return jsonResponse({ success: true, id: 'h_' + Date.now() }, 200, cors)
  }

  // 7. Time-trap
  if (ts && Date.now() - ts < MIN_FORM_AGE_MS) {
    console.warn(`[contact-form] time-trap triggered ip=${ip} age=${Date.now() - ts}`)
    return jsonResponse({ success: true, id: 't_' + Date.now() }, 200, cors)
  }

  // 8a. GDPR consenso obbligatorio
  if (!gdpr) {
    return jsonResponse(
      { error: 'Devi accettare l\'informativa privacy per procedere.' },
      400,
      cors,
    )
  }

  // 8b. Validazione lunghezze base
  if (nome.length < FIELD_LIMITS.nome.min || nome.length > FIELD_LIMITS.nome.max) {
    return jsonResponse(
      { error: `Il nome deve avere tra ${FIELD_LIMITS.nome.min} e ${FIELD_LIMITS.nome.max} caratteri.` },
      400,
      cors,
    )
  }
  if (
    email.length < FIELD_LIMITS.email.min ||
    email.length > FIELD_LIMITS.email.max ||
    !EMAIL_REGEX.test(email)
  ) {
    return jsonResponse({ error: 'Indirizzo email non valido.' }, 400, cors)
  }
  if (
    messaggio.length < FIELD_LIMITS.messaggio.min ||
    messaggio.length > FIELD_LIMITS.messaggio.max
  ) {
    return jsonResponse(
      {
        error: `Il messaggio deve avere tra ${FIELD_LIMITS.messaggio.min} e ${FIELD_LIMITS.messaggio.max} caratteri.`,
      },
      400,
      cors,
    )
  }

  // 8c. Validazione anagrafica
  if (!DATE_REGEX.test(dataNascita)) {
    return jsonResponse({ error: 'Data di nascita non valida.' }, 400, cors)
  }
  const dataNascitaParsed = new Date(dataNascita)
  if (isNaN(dataNascitaParsed.getTime())) {
    return jsonResponse({ error: 'Data di nascita non valida.' }, 400, cors)
  }
  // Range età: 14-120 anni
  const now = Date.now()
  const ageYears = (now - dataNascitaParsed.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  if (ageYears < MIN_AGE_YEARS || ageYears > MAX_AGE_YEARS) {
    return jsonResponse(
      { error: `L'età deve essere compresa tra ${MIN_AGE_YEARS} e ${MAX_AGE_YEARS} anni.` },
      400,
      cors,
    )
  }
  if (
    comuneNascita.length < FIELD_LIMITS.comune_nascita.min ||
    comuneNascita.length > FIELD_LIMITS.comune_nascita.max
  ) {
    return jsonResponse(
      { error: 'Comune di nascita non valido.' },
      400,
      cors,
    )
  }
  if (!SESSO_VALUES.includes(sesso)) {
    return jsonResponse({ error: 'Sesso non valido.' }, 400, cors)
  }

  // 8d. M2.6-ter: persistenza domanda + stato pagamento live + link scheda.
  // Best-effort: un problema qui NON deve mai bloccare l'invio della mail
  // (il flusso storico resta il paracadute).
  let pagamentoHtml = ''
  let schedaHtml = ''
  let domandaIdCreated: string | null = null   // 14/7: ritornato al client per legare il pagamento quota
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: domanda, error: insErr } = await supabase
      .from('domande_tesseramento')
      .insert({
        nome, email, messaggio,
        data_nascita: dataNascita,
        comune_nascita: comuneNascita,
        sesso,
        // B.7 registro consensi: il consenso privacy e' gia' obbligatorio e
        // validato server-side sopra (step 8a, blocca con 400 se !gdpr), qui lo
        // persistiamo nella colonna strutturata. Additivo, migration 13/07.
        consenso_privacy: true,
        sorgente_utm: sorgenteUtm,
      })
      .select('id')
      .single()
    if (insErr) console.error('[contact-form] insert domanda fallita:', insErr)
    if (domanda) domandaIdCreated = domanda.id

    // Stato pagamento quota al momento dell'invio (match per email)
    const { data: pag } = await supabase
      .from('pagamenti_tesseramento')
      .select('stato, metodo, importo, created_at')
      .ilike('email', email)
      .eq('tipo', 'quota')
      .in('stato', ['completato', 'in_verifica'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Notifica Telegram al direttivo (nuova domanda) con la riga pagamento, cosi'
    // non si approva "al buio" (caso n.26, 21/7). metodo_scelto e' di norma NULL
    // all'arrivo (si sceglie in PASSO 2): mostra il metodo se una riga pagamento
    // e' gia' abbinata per email, altrimenti "non indicato". Best-effort.
    if (domanda) {
      await notificaDirettivo(supabase, 'nuova_domanda', {
        nome, email,
        metodo_scelto: (pag as any)?.metodo ?? null,
        pag_stato: (pag as any)?.stato ?? null,
      })
    }

    const pagTesto = pag
      ? (pag.stato === 'completato'
        ? `✓ RICEVUTO — ${pag.importo} € via ${pag.metodo === 'paypal' ? 'PayPal/carta' : 'bonifico'}`
        : `⏳ IN VERIFICA — ricevuta bonifico caricata (${pag.importo ?? '?'} €)`)
      : 'non ancora ricevuto'
    pagamentoHtml = `
    <h2 style="color: #1E2E26; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #C8923E;">Pagamento</h2>
    <div style="background: ${pag && pag.stato === 'completato' ? '#f0f7f1' : '#FDF9F0'}; padding: 16px; border-left: 3px solid ${pag && pag.stato === 'completato' ? '#2d8659' : '#C8923E'}; color: #1E2E26; font-size: 15px;">Quota sociale 2026: <strong>${pagTesto}</strong><br/><span style="font-size:12px;color:#666;">Stato al momento dell'invio della domanda; il pagamento può arrivare dopo (riceverai una mail dedicata).</span></div>`

    // Link firmato alla scheda domanda (se il secret è configurato)
    const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET')
    if (domanda && adminSecret) {
      const exp = Date.now() + TOKEN_TTL_MS
      const t = await firmaToken(adminSecret, 'vista', domanda.id, exp)
      // Parametri nel PATH (non query string): un `=` seguito da due cifre
      // esadecimali verrebbe corrotto dall'encoding quoted-printable dell'email.
      // 16/7: link alla PAGINA Astro (non all'edge): l'edge serve HTML come
      // text/plain → il browser scaricava un .txt. La pagina rende su elbrenz.eu
      // e chiama l'edge in JSON (ramo /json/…). Token HMAC invariato nel path.
      const url = `https://elbrenz.eu/scheda-domanda/vista/${domanda.id}/${exp}/${t}`
      // Azioni in un click (11/7): token dedicati NEL PATH, scadenza 7 giorni,
      // monouso per stato (la domanda gestita non si rigestisce). Il click
      // atterra su una pagina di CONFERMA con bottone: doppio step, zero
      // approvazioni accidentali dalle anteprime email.
      const exp7 = Date.now() + 7 * 24 * 60 * 60 * 1000
      const tEA = await firmaToken(adminSecret, 'email-approva', domanda.id, exp7)
      const tER = await firmaToken(adminSecret, 'email-respingi', domanda.id, exp7)
      const base = `https://elbrenz.eu/scheda-domanda`
      const urlEA = `${base}/email-azione/approva/${domanda.id}/${exp7}/${tEA}`
      const urlER = `${base}/email-azione/respingi/${domanda.id}/${exp7}/${tER}`
      schedaHtml = `
    <div style="margin-top: 20px; text-align: center;">
      <a href="${urlEA}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:12px 28px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px 8px;">✓ Approva</a>
      <a href="${urlER}" style="display:inline-block;background:#fff;color:#a33;border:2px solid #d97a7a;padding:10px 26px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px 8px;">✗ Rifiuta</a>
      <p style="margin:10px 0 0;"><a href="${url}" style="color:#8a6215;font-size:13px;">Apri la scheda completa →</a></p>
      <p style="color:#999;font-size:11px;margin-top:8px;">Bottoni validi 7 giorni, con conferma in pagina; scheda completa valida 30 giorni.</p>
    </div>`
    } else if (domanda && !adminSecret) {
      schedaHtml = `<p style="color:#999;font-size:11px;margin-top:16px;">Scheda domanda non disponibile: configurare ADMIN_ACTION_SECRET (vedi docs/SETUP_PAYPAL.md).</p>`
    }
  } catch (err) {
    console.error('[contact-form] blocco domanda/pagamento fallito:', err)
  }

  // 9. Compose & send
  const html = buildEmailHtml(nome, email, messaggio, dataNascita, comuneNascita, sesso, ip, pagamentoHtml, schedaHtml)

  // Auth verso send-email tramite shared secret (pattern function-to-function).
  // SEND_EMAIL_SHARED_SECRET deve essere configurata come env var su entrambe
  // le function (contact-form e send-email) con lo stesso valore.
  const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET')
  if (!sharedSecret) {
    console.error('[contact-form] SEND_EMAIL_SHARED_SECRET not set')
    return jsonResponse(
      { error: 'Configurazione mancante. Scrivi a info@elbrenz.eu.' },
      500,
      cors,
    )
  }

  try {
    const sendResp = await fetch(SEND_EMAIL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Send-Email-Secret': sharedSecret,
      },
      body: JSON.stringify({
        to: RECIPIENT_EMAIL,
        subject: `Nuova richiesta tesseramento — ${nome}`,
        html,
        reply_to: email,
        tags: [{ name: 'source', value: 'contact-form' }],
      }),
    })

    const sendResult = await sendResp.json()

    if (!sendResp.ok) {
      console.error(
        `[contact-form] send-email failed status=${sendResp.status} body=${JSON.stringify(sendResult)}`,
      )
      return jsonResponse(
        { error: 'Si è verificato un errore. Riprova o scrivi direttamente a info@elbrenz.eu.' },
        500,
        cors,
      )
    }

    console.log(`[contact-form] sent id=${sendResult.id} ip=${ip}`)
    return jsonResponse({ success: true, domanda_id: domandaIdCreated }, 200, cors)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[contact-form] error: ${msg}`)
    return jsonResponse(
      { error: 'Si è verificato un errore. Riprova più tardi.' },
      500,
      cors,
    )
  }
})
