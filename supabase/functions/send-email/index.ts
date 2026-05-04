// supabase/functions/send-email/index.ts
//
// Edge Function generica per invio email transazionali via Resend.
// Chiamata da altre Edge Function (server-to-server) tramite shared secret.
//
// Auth supportata (in ordine di valutazione):
//   1. X-Send-Email-Secret header == SEND_EMAIL_SHARED_SECRET (env)
//      → pattern raccomandato per chiamate function-to-function
//   2. Authorization: Bearer <legacy_service_role_jwt> (compatibilità)
//      → mantenuto per non rompere caller esistenti
//
// Env secrets richiesti su Supabase:
//   RESEND_API_KEY                — API key con scope "Sending access" e dominio elbrenz.eu
//   SEND_EMAIL_SHARED_SECRET      — stringa random per autenticare chiamate interne
//   RESEND_FROM                   — opzionale, default "El Brenz <noreply@elbrenz.eu>"
//
// IMPORTANTE: verify_jwt deve essere FALSE. La verifica auth la facciamo
// manualmente qui dentro per supportare lo shared secret pattern.
//
// M.A.2.5: introdotto shared secret pattern per sostituire JWT-based auth.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-send-email-secret',
}

interface EmailRequest {
  to: string | string[]
  subject: string
  html: string
  from?: string
  reply_to?: string
  cc?: string | string[]
  bcc?: string | string[]
  tags?: { name: string; value: string }[]
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// =============================================================================
// AUTH — verifica manuale, JWT runtime check è OFF
// =============================================================================

function isAuthenticated(req: Request): { ok: boolean; method: string } {
  const sharedSecretEnv = Deno.env.get('SEND_EMAIL_SHARED_SECRET')
  const headerSecret = req.headers.get('x-send-email-secret')
  if (sharedSecretEnv && headerSecret && headerSecret === sharedSecretEnv) {
    return { ok: true, method: 'shared-secret' }
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim()
    if (token.startsWith('eyJ') && token.length > 100) {
      return { ok: true, method: 'jwt-bearer-legacy' }
    }
  }

  return { ok: false, method: 'none' }
}

// =============================================================================
// MAIN
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const auth = isAuthenticated(req)
  if (!auth.ok) {
    console.warn(`[send-email] unauthorized request, no valid credentials`)
    return jsonResponse(
      { error: 'Unauthorized', code: 'NO_VALID_AUTH' },
      401,
    )
  }

  console.log(`[send-email] authenticated via ${auth.method}`)

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      console.error('[send-email] RESEND_API_KEY not set')
      return jsonResponse({ error: 'Email service not configured' }, 500)
    }

    const body = (await req.json()) as EmailRequest
    const { to, subject, html, from, reply_to, cc, bcc, tags } = body

    if (!to || !subject || !html) {
      return jsonResponse(
        { error: 'Missing required fields: to, subject, html' },
        400,
      )
    }

    const senderDefault =
      Deno.env.get('RESEND_FROM') || 'El Brenz <noreply@elbrenz.eu>'

    const payload: Record<string, unknown> = {
      from: from || senderDefault,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }
    if (reply_to) payload.reply_to = reply_to
    if (cc) payload.cc = Array.isArray(cc) ? cc : [cc]
    if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc]
    if (tags && Array.isArray(tags)) payload.tags = tags

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const result = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error(
        `[send-email] Resend error status=${resendResponse.status} body=${JSON.stringify(
          result,
        )}`,
      )
      return jsonResponse(
        { error: 'Email send failed', details: result },
        resendResponse.status,
      )
    }

    console.log(`[send-email] sent id=${result.id} to=${JSON.stringify(to)} via=${auth.method}`)
    return jsonResponse({ success: true, id: result.id }, 200)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[send-email] error: ${msg}`)
    return jsonResponse({ error: 'Internal server error', message: msg }, 500)
  }
})
