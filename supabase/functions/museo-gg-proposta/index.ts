// museo-gg-proposta — proposta pubblica di materiale per il Museo della Grande
// Guerra (V1, senza upload file). Form pubblico su /non-e-sole-grande-guerra.
//
// Flusso: POST dal form (origin whitelisted) -> anti-spam (honeypot + time-trap
// + rate-limit persistente riusando convenzioni_rl_hit) -> validazioni ->
// INSERT in museo_gg_proposta (service-role: la tabella NON ha insert pubblico)
// -> notifica al direttivo (config-driven, _shared/notificaDirettivo.ts, toggle
// telegram_notifica tipo 'museo_gg_proposta') -> risposta JSON.
//
// La proposta NON e' un pezzo del museo: e' una segnalazione. La curatela
// (/museo-gg-curatela) la vede, ricontatta, digitalizza e pubblica.
// Dati del proponente MAI pubblici (RLS admin >=50).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { notificaDirettivo } from "../_shared/notificaDirettivo.ts"

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
  'https://community.elbrenz.eu',
  'https://www.elbrenz.eu',
  'http://localhost:4321',
  'http://localhost:3000',
]

const RATE_LIMIT_MAX = 3            // 3 proposte per IP/ora
const MIN_FORM_AGE_MS = 3 * 1000    // form aperto da almeno 3s

const TIPI = ['foto', 'cartolina', 'lettera', 'documento', 'oggetto', 'altro']
const L = {
  nome: { min: 2, max: 100 },
  contatto: { min: 3, max: 200 },
  descrizione: { min: 5, max: 2000 },
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
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
function jsonResponse(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
// Rate-limit persistente: riusa la funzione atomica di convenzioni (contatore
// per ip_hash + finestra oraria). Namespace distinto col prefisso 'museo_gg:'.
// Fail-open in caso di errore DB (honeypot/time-trap restano comunque).
async function checkRateLimit(supabase: ReturnType<typeof createClient>, ip: string): Promise<boolean> {
  try {
    const ipHash = await sha256Hex(`museo_gg:${ip}`)
    const { data, error } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_LIMIT_MAX })
    if (error) { console.error('[museo-gg-proposta] rl_hit errore:', error); return true }
    return data === true
  } catch (e) { console.error('[museo-gg-proposta] rate limit errore:', e); return true }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = buildCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors)
  if (!isOriginAllowed(origin)) {
    console.warn(`[museo-gg-proposta] origin bloccata: ${origin}`)
    return jsonResponse({ error: 'Origin non consentita' }, 403, cors)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const ip = getClientIp(req)
  if (!(await checkRateLimit(supabase, ip))) {
    return jsonResponse({ error: 'Hai inviato troppe proposte. Riprova più tardi.' }, 429, cors)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, cors) }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const nome = str('nome')
  const contatto = str('contatto')
  const tipoRaw = str('tipo')
  const descrizione = str('descrizione')
  const accettazione_privacy = body.accettazione_privacy === true
  const honeypot = typeof body._honeypot === 'string' ? body._honeypot : ''
  const ts = typeof body._ts === 'number' ? body._ts : 0

  // Honeypot + time-trap: 200 silenzioso (bot), nessun insert.
  if (honeypot.length > 0) { console.warn(`[museo-gg-proposta] honeypot ip=${ip}`); return jsonResponse({ success: true }, 200, cors) }
  if (ts && Date.now() - ts < MIN_FORM_AGE_MS) { console.warn(`[museo-gg-proposta] time-trap ip=${ip}`); return jsonResponse({ success: true }, 200, cors) }

  // Validazioni
  const tra = (v: string, m: { min: number; max: number }) => v.length >= m.min && v.length <= m.max
  if (!tra(nome, L.nome)) return jsonResponse({ error: 'Inserisci il tuo nome.' }, 400, cors)
  if (!tra(contatto, L.contatto)) return jsonResponse({ error: 'Lascia un contatto valido (email o telefono).' }, 400, cors)
  if (!tra(descrizione, L.descrizione)) return jsonResponse({ error: `Descrivi il materiale (tra ${L.descrizione.min} e ${L.descrizione.max} caratteri).` }, 400, cors)
  const tipo = tipoRaw && TIPI.includes(tipoRaw) ? tipoRaw : null
  if (!accettazione_privacy) return jsonResponse({ error: 'Devi acconsentire al trattamento dei dati per essere ricontattato.' }, 400, cors)

  // INSERT (service-role) — prima della notifica (mai notificare senza scrittura).
  const { data: inserted, error: insErr } = await supabase.from('museo_gg_proposta')
    .insert({ nome, contatto, tipo, descrizione })
    .select('id').single()

  if (insErr || !inserted) {
    console.error('[museo-gg-proposta] INSERT fallita:', insErr)
    return jsonResponse({ error: 'Non è stato possibile registrare la proposta. Riprova o scrivi a info@elbrenz.eu.' }, 500, cors)
  }

  // Notifica direttivo (config-driven, best-effort: la proposta è già salvata).
  // Qui il contatto SERVE (per ricontattare), quindi lo includiamo.
  notificaDirettivo(supabase, 'museo_gg_proposta', {
    nome, tipo: tipo ?? '', estratto: descrizione, contatto,
  }).catch(() => {})

  console.log(`[museo-gg-proposta] proposta ${inserted.id} salvata ip=${ip}`)
  return jsonResponse({ success: true }, 200, cors)
})
