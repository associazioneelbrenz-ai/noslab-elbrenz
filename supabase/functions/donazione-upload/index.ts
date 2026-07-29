// donazione-upload — Museo Grande Guerra "Non e Sole"
// Form pubblico con cui le famiglie donano materiale storico digitalizzato.
// Multipart: campi testo + fino a 5 file (jpg/png/webp/pdf, 15 MB cad., 18 MB tot).
// Flusso: valida -> upload nel bucket PRIVATO `donazioni` -> INSERT stato
// 'in_attesa' -> notifica Telegram al direttivo. Nulla e' pubblico finche' il
// curatore non approva e promuove (pattern museo-donazioni-media).
// verify_jwt=false (dichiarato in config.toml). Regole outage 17-21/7 rispettate.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const ALLOWED_ORIGINS = [
  'https://elbrenz.eu',
  'https://www.elbrenz.eu',
  'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu',
  'http://localhost:4321',
  'http://localhost:3000',
]

const RATE_MAX = 3                      // 3 invii per IP/ora (convenzioni_rl_hit)
const MIN_FORM_AGE_MS = 4 * 1000
const MAX_FILES = 5
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_TOTAL_BYTES = 18 * 1024 * 1024
const BUCKET = 'donazioni'

const LIMITS = {
  titolo: { min: 3, max: 140 },
  descrizione: { min: 10, max: 2000 },
  provenienza: { min: 3, max: 200 },
  nome: { min: 2, max: 100 },
  email: { min: 5, max: 200 },
  telefono: { min: 0, max: 40 },
}
const TIPI = ['foto', 'documento', 'lettera', 'oggetto_fotografato', 'altro']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function j(body: unknown, status: number, c: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...c, 'Content-Type': 'application/json' } })
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip'); if (cf) return cf
  const fwd = req.headers.get('x-forwarded-for'); return fwd ? fwd.split(',')[0].trim() : 'unknown'
}

// Sniffing sui magic bytes: il MIME dichiarato dal client non conta.
function sniff(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47)
    return { ext: 'png', mime: 'image/png' }
  if (bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF)
    return { ext: 'jpg', mime: 'image/jpeg' }
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return { ext: 'webp', mime: 'image/webp' }
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
    return { ext: 'pdf', mime: 'application/pdf' }
  return null
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const c = cors(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: c })
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405, c)
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`[donazioni] origin bloccata: ${origin}`)
    return j({ error: 'Origin non consentita' }, 403, c)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Rate limit persistente (stessa RPC delle convenzioni, prefisso dedicato)
  const ip = clientIp(req)
  try {
    const ipHash = await sha256Hex(`donazioni:${ip}`)
    const { data: entro, error } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_MAX })
    if (!error && entro === false) {
      return j({ error: 'Hai inviato troppe donazioni in poco tempo. Riprova tra un paio d\'ore o scrivici a info@elbrenz.eu.' }, 429, c)
    }
  } catch (e) { console.error('[donazioni] rate limit errore (fail-open):', e) }

  // Multipart
  let form: FormData
  try { form = await req.formData() } catch { return j({ error: 'Invio non leggibile. Riprova.' }, 400, c) }
  const S = (k: string) => String(form.get(k) ?? '').trim()

  // Honeypot + time-trap: 200 silenzioso (i bot non devono imparare)
  if (S('_honeypot').length > 0) { console.warn(`[donazioni] honeypot ip=${ip}`); return j({ success: true }, 200, c) }
  const ts = parseInt(S('_ts') || '0', 10)
  if (ts && Date.now() - ts < MIN_FORM_AGE_MS) { console.warn(`[donazioni] time-trap ip=${ip}`); return j({ success: true }, 200, c) }

  // Campi
  const titolo = S('titolo'), descrizione = S('descrizione'), provenienza = S('provenienza')
  const tipo = S('tipo')
  const nome = S('donatore_nome'), email = S('donatore_email'), telefono = S('donatore_telefono')
  const consDiritti = S('consenso_diritti') === '1'
  const consConserv = S('consenso_conservazione') === '1'
  const consPrivacy = S('consenso_privacy') === '1'

  const tra = (v: string, m: { min: number; max: number }) => v.length >= m.min && v.length <= m.max
  if (!tra(titolo, LIMITS.titolo)) return j({ error: `Il titolo deve avere tra ${LIMITS.titolo.min} e ${LIMITS.titolo.max} caratteri.` }, 400, c)
  if (!tra(descrizione, LIMITS.descrizione)) return j({ error: `La descrizione deve avere tra ${LIMITS.descrizione.min} e ${LIMITS.descrizione.max} caratteri.` }, 400, c)
  if (!tra(provenienza, LIMITS.provenienza)) return j({ error: 'Indica la provenienza del materiale (es. "Archivio famiglia Rossi, Vermiglio").' }, 400, c)
  if (!TIPI.includes(tipo)) return j({ error: 'Tipo di materiale non valido.' }, 400, c)
  if (!tra(nome, LIMITS.nome)) return j({ error: 'Indica il tuo nome e cognome.' }, 400, c)
  if (email.length > LIMITS.email.max || !EMAIL_RE.test(email)) return j({ error: 'Email non valida.' }, 400, c)
  if (telefono.length > LIMITS.telefono.max) return j({ error: 'Telefono non valido.' }, 400, c)
  if (!consDiritti) return j({ error: 'Serve la conferma di essere titolare dei diritti o autorizzato dalla famiglia.' }, 400, c)
  if (!consConserv) return j({ error: 'Serve il consenso alla conservazione e alla eventuale pubblicazione con indicazione della provenienza.' }, 400, c)
  if (!consPrivacy) return j({ error: 'Serve l\'accettazione dell\'informativa privacy.' }, 400, c)

  // File
  const rawFiles = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  if (rawFiles.length === 0) return j({ error: 'Allega almeno un file (foto o PDF).' }, 400, c)
  if (rawFiles.length > MAX_FILES) return j({ error: `Puoi allegare al massimo ${MAX_FILES} file per invio.` }, 400, c)
  let totale = 0
  const files: { bytes: Uint8Array; ext: string; mime: string }[] = []
  for (const f of rawFiles) {
    if (f.size > MAX_FILE_BYTES) return j({ error: `Ogni file puo' pesare al massimo 15 MB ("${f.name}" e' troppo grande).` }, 400, c)
    totale += f.size
    if (totale > MAX_TOTAL_BYTES) return j({ error: `L'invio complessivo supera 18 MB: dividi il materiale in piu' invii.` }, 400, c)
    const bytes = new Uint8Array(await f.arrayBuffer())
    const tipoFile = sniff(bytes)
    if (!tipoFile) return j({ error: `Formato non supportato per "${f.name}": usa JPG, PNG, WebP o PDF.` }, 400, c)
    files.push({ bytes, ext: tipoFile.ext, mime: tipoFile.mime })
  }

  // Upload nel bucket PRIVATO, poi INSERT (id generato prima per i path)
  const donazioneId = crypto.randomUUID()
  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const path = `${donazioneId}/${i + 1}.${files[i].ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, files[i].bytes, { contentType: files[i].mime, upsert: false })
    if (upErr) {
      console.error('[donazioni] upload fallito:', upErr)
      // best-effort: rimuovi gli eventuali file gia' caricati di questo invio
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      return j({ error: 'Caricamento non riuscito. Riprova o scrivici a info@elbrenz.eu.' }, 500, c)
    }
    paths.push(path)
  }

  const { error: insErr } = await supabase.from('donazione_materiale').insert({
    id: donazioneId,
    donatore_id: null,
    tipo_donatore: 'esterno',
    donatore_nome: nome,
    donatore_email: email,
    donatore_telefono: telefono || null,
    titolo, descrizione, provenienza, tipo,
    file_urls: paths,
    diritti_dichiarati: consDiritti,
    consenso_conservazione: consConserv,
    consenso_privacy: consPrivacy,
    stato: 'in_attesa',
  })
  if (insErr) {
    console.error('[donazioni] INSERT fallita:', insErr)
    await supabase.storage.from(BUCKET).remove(paths)
    return j({ error: `Non e' stato possibile registrare la donazione. Riprova o scrivici a info@elbrenz.eu.` }, 500, c)
  }

  // Notifica al direttivo (fire-and-forget, pattern convenzioni)
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      'X-Bot-Secret': Deno.env.get('BOT_ANDREAS_SECRET') ?? '',
    },
    body: JSON.stringify({ text: `Museo Grande Guerra: nuova donazione di materiale\n"${titolo}" (${tipo}, ${paths.length} file)\nDa: ${nome}\nIn coda per il curatore.` }),
  }).catch(() => {})

  console.log(`[donazioni] ${donazioneId} registrata ip=${ip} file=${paths.length}`)
  return j({ success: true }, 200, c)
})
