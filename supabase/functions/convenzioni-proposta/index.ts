// convenzioni-proposta — M5.0 v2
//
// UNA sola edge function per due compiti (brief M5.0 v2):
//   1) POST  (dal form /convenzioni): valida → INSERT stato='proposta' →
//      email al Direttivo con 2 link HMAC (Approva/Rifiuta) → email di
//      cortesia al proponente. Ordine INSERT→email rigoroso (lezione A2:
//      mai email prima della scrittura).
//   2) GET/POST .../azione/{approva|rifiuta}/{id}/{exp}/{t} (link nella mail):
//      GET mostra una pagina di conferma con bottone; POST esegue l'UPDATE
//      (idempotente su stato='proposta'). Token HMAC scope distinti
//      (ADMIN_ACTION_SECRET, pattern _shared/admin.ts già in uso).
//      NB: i parametri stanno nel PATH, non in query string: un URL con
//      `=` seguito da due cifre esadecimali (es. id=1e, t=e3) viene
//      corrotto dall'encoding quoted-printable delle email → i segmenti di
//      path lo evitano del tutto.
//
// Sicurezza: referente_* mai esposti al pubblico (la pagina legge la vista
// convenzioni_pubbliche). Scrittura solo con service role qui dentro.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { firmaToken, verificaToken, TOKEN_TTL_MS } from "../_shared/admin.ts"

// =============================================================================
// CONFIG
// =============================================================================

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
  'https://www.elbrenz.eu',
  'http://localhost:4321',
  'http://localhost:3000',
]

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000  // 1 ora
const RATE_LIMIT_MAX = 3                       // 3 proposte per IP/ora
const MIN_FORM_AGE_MS = 3 * 1000               // form aperto da almeno 3s

const FIELD_LIMITS = {
  nome_attivita: { min: 2, max: 120 },
  beneficio: { min: 5, max: 200 },
  localita: { min: 2, max: 100 },
  dettagli: { min: 0, max: 1000 },
  referente_nome: { min: 2, max: 100 },
  email: { min: 5, max: 200 },
  url: { min: 0, max: 300 },
  telefono: { min: 0, max: 40 },
  indirizzo: { min: 2, max: 150 },
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Geocoding indirizzo -> coordinate via Nominatim/OSM (zero costi, zero key).
// User-Agent identificativo obbligatorio; timeout breve; best-effort.
async function geocodifica(indirizzo: string, localita: string): Promise<{ lat: number; lng: number } | null> {
  const q = [indirizzo, localita, 'Trentino', 'Italia'].filter(Boolean).join(', ')
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'El Brenz - Associazione culturale (info@elbrenz.eu)', 'Accept-Language': 'it' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const arr = await res.json()
    if (!Array.isArray(arr) || arr.length === 0) return null
    const lat = parseFloat(arr[0].lat), lng = parseFloat(arr[0].lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch { return null }
}
const CATEGORIE = ['rifugi', 'locali', 'servizi', 'cultura', 'benessere', 'altro']

// Logo del proponente (facoltativo): resta nel bucket PRIVATO
// convenzioni-staging finché il Direttivo non approva — mai pubblico prima.
// Validazione server-side su magic bytes (il MIME dichiarato non conta).
const LOGO_MAX_BYTES = 1_048_576 // 1 MB
const LOGO_STAGING_BUCKET = 'convenzioni-staging'
const LOGO_PUBLIC_BUCKET = 'assets-pubblici'

function sniffImmagine(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}

const SEND_EMAIL_URL =
  'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/send-email'
const RECIPIENT_EMAIL = 'info@elbrenz.eu'

// =============================================================================
// CORS
// =============================================================================

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function isOriginAllowed(origin: string | null): boolean {
  return !!origin && ALLOWED_ORIGINS.includes(origin)
}

// =============================================================================
// RATE LIMIT — PERSISTENTE su DB (IP hashato SHA256, finestra oraria).
// L'in-memory di contact-form NON protegge su edge runtime multi-istanza
// (verificato: 5/5 richieste passate — audit AUD-B5). Qui: funzione atomica
// convenzioni_rl_hit, come ai_rate_limit_pubblico di Andreas.
// =============================================================================

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// true = entro il limite (consenti). In caso di errore DB: fail-open (non
// blocca gli utenti legittimi; l'abuso resta comunque arginato dai controlli
// honeypot/time-trap e dalla validazione).
async function checkRateLimit(supabase: ReturnType<typeof createClient>, ip: string): Promise<boolean> {
  try {
    const ipHash = await sha256Hex(`convenzioni:${ip}`)
    const { data, error } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_LIMIT_MAX })
    if (error) { console.error('[convenzioni] rl_hit errore:', error); return true }
    return data === true
  } catch (e) { console.error('[convenzioni] rate limit errore:', e); return true }
}

// =============================================================================
// HELPERS
// =============================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function htmlResponse(inner: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Convenzioni El Brenz</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F8F1E4;color:#1E2E26;max-width:620px;margin:0 auto;padding:40px 24px;}
  .card{background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;}
  h1{font-size:20px;margin:0 0 16px;} p{font-size:15px;line-height:1.6;}
  .b{display:inline-block;padding:12px 28px;border-radius:4px;font-weight:600;font-size:15px;text-decoration:none;border:0;cursor:pointer;}
  .approva{background:#2d8659;color:#fff;} .rifiuta{background:#b23b3b;color:#fff;}
  .meta{font-size:13px;color:#666;margin-top:20px;}
  dl{margin:16px 0;} dt{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#8a6215;margin-top:12px;} dd{margin:2px 0 0;font-size:15px;}
</style></head><body><div class="card">${inner}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

function mailDirettivo(row: Record<string, string>, linkApprova: string, linkRifiuta: string): string {
  const r = (k: string) => escapeHtml(row[k] ?? '—')
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
  <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
    <h1 style="color:#1E2E26;font-size:19px;margin:0 0 4px;">Nuova proposta di convenzione</h1>
    <p style="color:#666;font-size:13px;margin:0 0 20px;">${r('nome_attivita')} · categoria ${r('categoria')}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;color:#1E2E26;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;width:150px;color:#8a6215;">Attività</td><td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>${r('nome_attivita')}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#8a6215;">Località</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${r('localita')}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#8a6215;">Beneficio</td><td style="padding:8px 0;border-bottom:1px solid #eee;"><strong style="color:#C8923E;">${r('beneficio')}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#8a6215;">Dettagli</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${r('dettagli')}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#8a6215;">Sito</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${r('url')}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#8a6215;">Referente</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${r('referente_nome')} · ${r('referente_email')} · ${r('referente_telefono')}</td></tr>
    </table>
    <p style="font-size:13px;color:#666;margin:20px 0 8px;">I dati del referente NON sono pubblici. La convenzione appare sul sito solo dopo approvazione.</p>
    <div style="margin-top:20px;text-align:center;">
      <a href="${linkApprova}" style="display:inline-block;background:#2d8659;color:#fff;padding:12px 28px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px;">Approva →</a>
      <a href="${linkRifiuta}" style="display:inline-block;background:#b23b3b;color:#fff;padding:12px 28px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px;">Rifiuta</a>
    </div>
    <p style="color:#999;font-size:11px;margin-top:16px;text-align:center;">Link riservati al Direttivo, validi 30 giorni. Ogni link chiede una conferma prima di agire.</p>
  </div></body></html>`
}

function mailProponente(nome: string, nomeAttivita: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
  <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
    <h1 style="color:#1E2E26;font-size:19px;margin:0 0 12px;">Grazie, ${escapeHtml(nome)}!</h1>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;">Abbiamo ricevuto la vostra proposta di convenzione per <strong>${escapeHtml(nomeAttivita)}</strong>. È ora in verifica da parte dell'Associazione El Brenz: vi ricontattiamo a breve all'indirizzo che ci avete indicato.</p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;">Un caro saluto dalle Valli del Noce.</p>
    <p style="color:#999;font-size:12px;margin-top:20px;">Associazione Storico Culturale Linguistica El Brenz · info@elbrenz.eu</p>
  </div></body></html>`
}

async function inviaEmail(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET')
  if (!sharedSecret) { console.error('[convenzioni] SEND_EMAIL_SHARED_SECRET non impostato'); return false }
  try {
    const resp = await fetch(SEND_EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sharedSecret },
      body: JSON.stringify({ to, subject, html, reply_to: replyTo, tags: [{ name: 'source', value: 'convenzioni' }] }),
    })
    if (!resp.ok) { console.error(`[convenzioni] send-email fallita ${resp.status}`); return false }
    return true
  } catch (e) { console.error('[convenzioni] send-email errore', e); return false }
}

// =============================================================================
// AZIONE (approva / rifiuta) — GET conferma, POST esegue
// =============================================================================

// Estrae i parametri azione dal PATH: .../azione/{approva|rifiuta}/{id}/{exp}/{t}
const AZIONE_RE = /\/azione\/(approva|rifiuta)\/([0-9a-fA-F-]{36})\/(\d+)\/([0-9a-f]+)\/?$/

async function gestisciAzione(req: Request, url: URL): Promise<Response> {
  const secret = Deno.env.get('ADMIN_ACTION_SECRET')
  if (!secret) return htmlResponse(`<h1>Configurazione mancante</h1><p>ADMIN_ACTION_SECRET non impostato.</p>`, 500)

  const m = url.pathname.match(AZIONE_RE)
  if (!m) return htmlResponse(`<h1>Link non valido</h1>`, 400)
  const azione = m[1] as 'approva' | 'rifiuta'
  const id = m[2]
  const exp = parseInt(m[3], 10)
  const t = m[4]

  const ok = await verificaToken(secret, `azione-${azione}`, id, exp, t)
  if (!ok) return htmlResponse(`<h1>Link non valido o scaduto</h1><p>Il link potrebbe essere scaduto (validità 30 giorni). Scrivi a info@elbrenz.eu.</p>`, 403)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // GET: pagina di conferma (evita che gli scanner email mutino lo stato).
  if (req.method === 'GET') {
    const { data } = await supabase.from('convenzioni')
      .select('nome_attivita, categoria, localita, indirizzo, lat, lng, geo_stato, beneficio, stato').eq('id', id).maybeSingle()
    if (!data) return htmlResponse(`<h1>Proposta non trovata</h1>`, 404)
    const verbo = azione === 'approva' ? 'APPROVARE' : 'RIFIUTARE'
    const cls = azione === 'approva' ? 'approva' : 'rifiuta'
    const statoNota = data.stato !== 'proposta'
      ? `<p class="meta">⚠ Questa proposta è già in stato «${escapeHtml(data.stato)}»: l'azione non avrà effetto.</p>` : ''

    // Blocco mappa (solo per APPROVA): parte informativa nel dl (read-only)
    // + input coordinate/checkbox DENTRO il form (curatela, come da brief).
    let geoInfo = ''
    let geoForm = ''
    if (azione === 'approva') {
      const hasCoord = data.lat != null && data.lng != null
      const gmaps = hasCoord ? `https://www.google.com/maps?q=${data.lat},${data.lng}` : ''
      const avvisoGeo = data.geo_stato === 'non_trovato'
        ? `<p class="meta">⚠ Geocodifica non riuscita per «${escapeHtml(data.indirizzo ?? '')}»: inserisci le coordinate a mano (lat, lng) per mostrarla in mappa.</p>`
        : (data.indirizzo ? `<p class="meta">Coordinate proposte automaticamente dall'indirizzo. Verifica e correggi se serve.</p>` : `<p class="meta">Nessun indirizzo indicato: la convenzione non comparirà in mappa (puoi comunque inserire le coordinate a mano).</p>`)
      geoInfo = `<dt>Indirizzo</dt><dd>${escapeHtml(data.indirizzo ?? '—')}</dd>`
      geoForm = `
        ${avvisoGeo}
        <div style="margin:12px 0;padding:12px;background:#FDF9F0;border-left:3px solid #C8923E;text-align:left;">
          <label style="display:inline-block;font-size:13px;color:#666;">Lat <input type="text" name="lat" value="${hasCoord ? data.lat : ''}" style="width:130px;padding:6px;border:1px solid #E5DFCF;border-radius:4px;"/></label>
          <label style="display:inline-block;font-size:13px;color:#666;margin-left:8px;">Lng <input type="text" name="lng" value="${hasCoord ? data.lng : ''}" style="width:130px;padding:6px;border:1px solid #E5DFCF;border-radius:4px;"/></label>
          ${gmaps ? `<p style="margin:8px 0 0;"><a href="${gmaps}" target="_blank" rel="noopener" style="color:#8a6215;font-size:13px;">Verifica su Google Maps ↗</a></p>` : ''}
          <label style="display:block;margin-top:10px;font-size:14px;color:#1E2E26;"><input type="checkbox" name="mostra_in_mappa" value="1" ${data.geo_stato === 'auto' ? 'checked' : ''}/> Mostra questa convenzione sulla mappa pubblica</label>
        </div>`
    }

    return htmlResponse(`
      <h1>Confermi di ${verbo} questa proposta?</h1>
      <dl>
        <dt>Attività</dt><dd>${escapeHtml(data.nome_attivita)}</dd>
        <dt>Categoria</dt><dd>${escapeHtml(data.categoria)}</dd>
        <dt>Località</dt><dd>${escapeHtml(data.localita ?? '—')}</dd>
        <dt>Beneficio</dt><dd>${escapeHtml(data.beneficio)}</dd>
        ${geoInfo}
      </dl>
      ${statoNota}
      <form method="POST" action="${escapeHtml(url.pathname)}">
        ${geoForm}
        <button type="submit" class="b ${cls}">${azione === 'approva' ? 'Sì, approva e pubblica' : 'Sì, rifiuta'}</button>
      </form>
      <p class="meta">${azione === 'approva' ? 'Approvando, la convenzione diventa visibile sul sito.' : 'Rifiutando, la proposta resta archiviata e non viene pubblicata. Nessuna email automatica al proponente.'}</p>`)
  }

  // POST: esegue l'azione (idempotente: solo se ancora 'proposta').
  const nuovoStato = azione === 'approva' ? 'attiva' : 'rifiutata'
  const patch: Record<string, unknown> = { stato: nuovoStato, updated_at: new Date().toISOString() }
  if (azione === 'approva') {
    patch.approvata_il = new Date().toISOString()
    // Coordinate + mostra_in_mappa dal form della scheda (curatela): il
    // segretario conferma o corregge il geocoding prima che diventi pubblico.
    try {
      const fd = await req.formData()
      const latN = parseFloat(String(fd.get('lat') ?? '').trim())
      const lngN = parseFloat(String(fd.get('lng') ?? '').trim())
      const mostra = fd.get('mostra_in_mappa') === '1'
      if (Number.isFinite(latN) && Number.isFinite(lngN)) {
        const { data: prev } = await supabase.from('convenzioni')
          .select('lat, lng, geo_stato').eq('id', id).maybeSingle()
        const cambiate = !prev || prev.lat == null || prev.lng == null
          || Math.abs((prev.lat as number) - latN) > 1e-7 || Math.abs((prev.lng as number) - lngN) > 1e-7
        patch.lat = latN
        patch.lng = lngN
        patch.geo_stato = cambiate ? 'manuale' : (prev?.geo_stato ?? 'manuale')
        patch.mostra_in_mappa = mostra
      } else {
        patch.mostra_in_mappa = false // niente coordinate valide: fuori mappa
      }
    } catch { /* form senza body: approvazione senza tocco geo */ }
  }

  const { data: updated } = await supabase.from('convenzioni')
    .update(patch).eq('id', id).eq('stato', 'proposta').select('id, logo_staging_path').maybeSingle()

  if (!updated) {
    return htmlResponse(`<h1>Nessuna modifica</h1><p>La proposta non era più in stato «proposta» (già approvata o rifiutata in precedenza).</p>`)
  }

  // All'approvazione, il logo in staging PRIVATO diventa pubblico
  // (best-effort: se fallisce, la convenzione resta attiva senza logo e
  // la card usa il fallback con l'iniziale).
  let notaLogo = ''
  if (azione === 'approva' && updated.logo_staging_path) {
    try {
      const staging = updated.logo_staging_path as string
      const ext = staging.split('.').pop() ?? 'png'
      const { data: file, error: dlErr } = await supabase.storage
        .from(LOGO_STAGING_BUCKET).download(staging)
      if (dlErr || !file) throw dlErr ?? new Error('download vuoto')
      const pubPath = `convenzioni/loghi/proposta-${id}.${ext}`
      const { error: upErr } = await supabase.storage.from(LOGO_PUBLIC_BUCKET)
        .upload(pubPath, await file.arrayBuffer(), {
          contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
          upsert: true,
        })
      if (upErr) throw upErr
      await supabase.from('convenzioni')
        .update({ logo_path: pubPath, logo_staging_path: null, updated_at: new Date().toISOString() }).eq('id', id)
      await supabase.storage.from(LOGO_STAGING_BUCKET).remove([staging])
      notaLogo = '<p>Logo del proponente pubblicato insieme alla convenzione.</p>'
    } catch (e) {
      console.error('[convenzioni] pubblicazione logo fallita:', e)
      notaLogo = '<p style="color:#8a6215;">⚠ Il logo caricato dal proponente non è stato pubblicato (errore tecnico): la card usa l\'iniziale. Recuperabile dal bucket convenzioni-staging.</p>'
    }
  }

  return htmlResponse(azione === 'approva'
    ? `<h1>Convenzione approvata ✓</h1><p>Ora è pubblica sul sito nella pagina Convenzioni.</p>${notaLogo}`
    : `<h1>Proposta rifiutata</h1><p>La proposta è stata archiviata. Nessuna comunicazione automatica è stata inviata al proponente.</p>`)
}

// =============================================================================
// MAIN
// =============================================================================

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = buildCorsHeaders(origin)
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Branch AZIONE (link dalla mail): path .../azione/...
  if (url.pathname.includes('/azione/')) {
    return await gestisciAzione(req, url)
  }

  // Branch PROPOSTA (dal form): solo POST + origin whitelisted
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors)
  if (!isOriginAllowed(origin)) {
    console.warn(`[convenzioni] origin bloccata: ${origin}`)
    return jsonResponse({ error: 'Origin non consentita' }, 403, cors)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const ip = getClientIp(req)
  const entroLimite = await checkRateLimit(supabase, ip)
  if (!entroLimite) {
    return jsonResponse({ error: 'Hai inviato troppe proposte. Riprova più tardi.' }, 429, cors)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, cors) }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const nome_attivita = str('nome_attivita')
  const categoria = str('categoria')
  const localita = str('localita')
  const indirizzo = str('indirizzo')
  const beneficio = str('beneficio')
  const dettagli = str('dettagli')
  const rawUrl = str('url')
  const referente_nome = str('referente_nome')
  const referente_email = str('referente_email')
  const referente_telefono = str('referente_telefono')
  const accettazione_schema_tipo = body.accettazione_schema_tipo === true
  const accettazione_privacy = body.accettazione_privacy === true
  const honeypot = typeof body._honeypot === 'string' ? body._honeypot : ''
  const ts = typeof body._ts === 'number' ? body._ts : 0
  // logo facoltativo: base64 (con o senza prefisso data:)
  const logoB64 = typeof body.logo_b64 === 'string' ? body.logo_b64.replace(/^data:[^;]+;base64,/, '') : ''

  // Honeypot + time-trap: risposta 200 silenziosa (bot).
  if (honeypot.length > 0) { console.warn(`[convenzioni] honeypot ip=${ip}`); return jsonResponse({ success: true }, 200, cors) }
  if (ts && Date.now() - ts < MIN_FORM_AGE_MS) { console.warn(`[convenzioni] time-trap ip=${ip}`); return jsonResponse({ success: true }, 200, cors) }

  // Validazioni
  const L = FIELD_LIMITS
  const tra = (v: string, m: { min: number; max: number }) => v.length >= m.min && v.length <= m.max
  if (!tra(nome_attivita, L.nome_attivita)) return jsonResponse({ error: `Il nome dell'attività deve avere tra ${L.nome_attivita.min} e ${L.nome_attivita.max} caratteri.` }, 400, cors)
  if (!CATEGORIE.includes(categoria)) return jsonResponse({ error: 'Categoria non valida.' }, 400, cors)
  if (localita && !tra(localita, L.localita)) return jsonResponse({ error: 'Località non valida.' }, 400, cors)
  if (indirizzo && !tra(indirizzo, L.indirizzo)) return jsonResponse({ error: 'Indirizzo non valido.' }, 400, cors)
  if (!tra(beneficio, L.beneficio)) return jsonResponse({ error: `Il beneficio deve avere tra ${L.beneficio.min} e ${L.beneficio.max} caratteri.` }, 400, cors)
  if (dettagli.length > L.dettagli.max) return jsonResponse({ error: `I dettagli non possono superare ${L.dettagli.max} caratteri.` }, 400, cors)
  if (rawUrl.length > L.url.max) return jsonResponse({ error: 'URL troppo lungo.' }, 400, cors)
  if (!tra(referente_nome, L.referente_nome)) return jsonResponse({ error: 'Nome referente non valido.' }, 400, cors)
  if (referente_email.length > L.email.max || !EMAIL_REGEX.test(referente_email)) return jsonResponse({ error: 'Email referente non valida.' }, 400, cors)
  if (referente_telefono.length > L.telefono.max) return jsonResponse({ error: 'Telefono non valido.' }, 400, cors)
  if (!accettazione_schema_tipo) return jsonResponse({ error: 'Devi accettare lo schema di convenzione-tipo.' }, 400, cors)
  if (!accettazione_privacy) return jsonResponse({ error: 'Devi accettare l\'informativa privacy.' }, 400, cors)

  // Logo: decodifica + sniffing PRIMA dell'insert (input invalido = 400 pulito)
  let logoBytes: Uint8Array | null = null
  let logoTipo: { ext: string; mime: string } | null = null
  if (logoB64) {
    if (logoB64.length > LOGO_MAX_BYTES * 1.4) {
      return jsonResponse({ error: 'Il logo supera 1 MB.' }, 400, cors)
    }
    try {
      logoBytes = Uint8Array.from(atob(logoB64), (c) => c.charCodeAt(0))
    } catch {
      return jsonResponse({ error: 'Logo non leggibile.' }, 400, cors)
    }
    if (logoBytes.length > LOGO_MAX_BYTES) return jsonResponse({ error: 'Il logo supera 1 MB.' }, 400, cors)
    logoTipo = sniffImmagine(logoBytes)
    if (!logoTipo) return jsonResponse({ error: 'Formato logo non supportato: usa PNG, JPG o WebP.' }, 400, cors)
  }

  // Geocoding (best-effort): solo se c'è un indirizzo. mostra_in_mappa resta
  // false: si accende solo dopo la conferma del segretario nella scheda.
  const geo = indirizzo ? await geocodifica(indirizzo, localita) : null

  // INSERT (service role) — PRIMA della mail (lezione A2). Il client è già
  // stato creato in cima per il rate limit.
  const { data: inserted, error: insErr } = await supabase.from('convenzioni').insert({
    nome_attivita, categoria,
    localita: localita || null,
    indirizzo: indirizzo || null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    geo_stato: geo ? 'auto' : (indirizzo ? 'non_trovato' : null),
    mostra_in_mappa: false,
    beneficio,
    dettagli: dettagli || null,
    url: rawUrl || null,
    referente_nome, referente_email,
    referente_telefono: referente_telefono || null,
    accettazione_schema_tipo, accettazione_privacy,
  }).select('id').single()

  if (insErr || !inserted) {
    console.error('[convenzioni] INSERT fallita:', insErr)
    return jsonResponse({ error: 'Non è stato possibile registrare la proposta. Riprova o scrivi a info@elbrenz.eu.' }, 500, cors)
  }

  // Notifica direttivo (14/7, fire-and-forget): nuova convenzione da validare.
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'X-Bot-Secret': Deno.env.get('BOT_ANDREAS_SECRET') ?? '' },
    body: JSON.stringify({ text: `🤝 **Nuova convenzione proposta**\n${nome_attivita}${localita ? ` (${localita})` : ''}\nDa validare nello sportello segretario.` }),
  }).catch(() => {})

  // Upload logo in staging PRIVATO (best-effort: la proposta è già salvata)
  let logoCaricato = false
  if (logoBytes && logoTipo) {
    const stagingPath = `${inserted.id}.${logoTipo.ext}`
    const { error: upErr } = await supabase.storage.from(LOGO_STAGING_BUCKET)
      .upload(stagingPath, logoBytes, { contentType: logoTipo.mime, upsert: true })
    if (upErr) {
      console.error('[convenzioni] upload logo staging fallito:', upErr)
    } else {
      await supabase.from('convenzioni')
        .update({ logo_staging_path: stagingPath, updated_at: new Date().toISOString() })
        .eq('id', inserted.id)
      logoCaricato = true
    }
  }

  // Email al Direttivo con link HMAC (best-effort: la proposta è già salvata).
  const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET')
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/convenzioni-proposta`
  if (adminSecret) {
    const exp = Date.now() + TOKEN_TTL_MS
    const tA = await firmaToken(adminSecret, 'azione-approva', inserted.id, exp)
    const tR = await firmaToken(adminSecret, 'azione-rifiuta', inserted.id, exp)
    const linkA = `${base}/azione/approva/${inserted.id}/${exp}/${tA}`
    const linkR = `${base}/azione/rifiuta/${inserted.id}/${exp}/${tR}`
    const dettagliConLogo = logoCaricato
      ? `${dettagli}${dettagli ? '\n' : ''}[Logo caricato dal proponente: sarà pubblicato automaticamente all'approvazione]`
      : dettagli
    await inviaEmail(RECIPIENT_EMAIL,
      `Nuova proposta di convenzione — ${nome_attivita}`,
      mailDirettivo({ nome_attivita, categoria, localita, beneficio, dettagli: dettagliConLogo, url: rawUrl, referente_nome, referente_email, referente_telefono }, linkA, linkR),
      referente_email)
  } else {
    console.warn('[convenzioni] ADMIN_ACTION_SECRET assente: mail Direttivo senza link azione')
    await inviaEmail(RECIPIENT_EMAIL, `Nuova proposta di convenzione — ${nome_attivita}`,
      mailDirettivo({ nome_attivita, categoria, localita, beneficio, dettagli, url: rawUrl, referente_nome, referente_email, referente_telefono }, '#', '#'), referente_email)
  }

  // Email di cortesia al proponente (best-effort).
  await inviaEmail(referente_email, 'Abbiamo ricevuto la vostra proposta di convenzione — El Brenz',
    mailProponente(referente_nome, nome_attivita))

  console.log(`[convenzioni] proposta ${inserted.id} salvata ip=${ip}`)
  return jsonResponse({ success: true }, 200, cors)
})
