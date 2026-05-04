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

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

// =============================================================================
// CONFIG
// =============================================================================

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
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

  // 4. Rate limit
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

  // 9. Compose & send
  const html = buildEmailHtml(nome, email, messaggio, dataNascita, comuneNascita, sesso, ip)

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
    return jsonResponse({ success: true }, 200, cors)
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
