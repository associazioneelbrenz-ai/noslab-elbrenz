// tessera-invio-admin — invio/reinvio tessere e solleciti integrazione dalla
// DASHBOARD admin dell'app, autorizzato dalla SESSIONE dell'admin (JWT + ruolo
// >=50 + AAL2), NON da INGEST_TOKEN nel client. L'INGEST_TOKEN vive solo qui
// nell'ambiente dell'edge: internamente richiama tessera-invio (nessuna
// duplicazione della logica codice/QR/email/integrazione).
//
// Deploy: con verify_jwt attivo (il gateway valida il JWT; qui verifichiamo
// ruolo e AAL2). Chiamata dall'app via supabase.functions.invoke (manda da solo
// Authorization: Bearer <access_token> + apikey).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function aalDalJwt(jwt: string): string {
  try {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(p)).aal ?? ''
  } catch { return '' }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authz = req.headers.get('Authorization') ?? ''
  if (!authz.startsWith('Bearer ')) return json({ error: 'Non autorizzato' }, 401)
  const jwt = authz.slice(7)

  // 1) Sessione valida
  const userClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: authz } } })
  const { data: udata, error: uerr } = await userClient.auth.getUser()
  if (uerr || !udata?.user) return json({ error: 'Sessione non valida' }, 401)
  const uid = udata.user.id

  // 2) AAL2 (2FA verificato) obbligatorio
  if (aalDalJwt(jwt) !== 'aal2') return json({ error: 'Serve la verifica in due passaggi (2FA).' }, 403)

  // 3) Ruolo >= 50
  const admin = createClient(SB_URL, SERVICE)
  const { data: okRuolo, error: erRuolo } = await admin.rpc('has_ruolo_min', { p_utente_id: uid, p_livello_min: 50 })
  if (erRuolo || okRuolo !== true) return json({ error: 'Riservato agli amministratori.' }, 403)

  // --- azione ---
  let body: { numero?: unknown; numeri?: unknown; integrazione?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400) }

  let numeri: number[] = []
  if (Array.isArray(body.numeri)) numeri = (body.numeri as unknown[]).map(Number).filter((n) => Number.isInteger(n))
  else if (Number.isInteger(Number(body.numero))) numeri = [Number(body.numero)]
  numeri = [...new Set(numeri)]
  if (!numeri.length) return json({ error: 'Nessun numero indicato' }, 400)
  if (numeri.length > 200) return json({ error: 'Troppi numeri in un colpo (max 200).' }, 400)
  const integrazione = body.integrazione === true

  const ingest = Deno.env.get('INGEST_TOKEN') ?? ''
  if (!ingest) return json({ error: 'Configurazione mancante (INGEST_TOKEN).' }, 500)

  const esiti: { numero: number; ok: boolean; error: string | null; url_integrazione?: string | null }[] = []
  for (const n of numeri) {
    try {
      const r = await fetch(`${SB_URL}/functions/v1/tessera-invio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ingest-token': ingest, 'apikey': ANON },
        body: JSON.stringify({ numero: n, integrazione }),
      })
      const d = await r.json().catch(() => ({}))
      esiti.push({ numero: n, ok: r.ok && d?.ok === true, error: (r.ok && d?.ok) ? null : (d?.error ?? `HTTP ${r.status}`), url_integrazione: d?.url_integrazione ?? null })
    } catch (e) {
      esiti.push({ numero: n, ok: false, error: String(e) })
    }
    if (numeri.length > 1) await new Promise((res) => setTimeout(res, 1500)) // anti rate-limit
  }

  return json({
    ok: true,
    inviati: esiti.filter((e) => e.ok).length,
    falliti: esiti.filter((e) => !e.ok).map((e) => e.numero),
    esiti,
  })
})
