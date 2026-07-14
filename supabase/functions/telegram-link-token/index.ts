// telegram-link-token — edge AUTENTICATA per il ponte Telegram (linking).
//
// Andreas Fondazione, 2o mattone. Genera un token monouso opaco che il socio
// porta al bot col deep-link (/start <token>). Serve anche stato e revoca del
// collegamento (self-service area socio).
//
// SICUREZZA:
//   - Richiede JWT utente (stesso ramo di andreas-chat: getUser); 401 se assente.
//   - Token opaco 32 byte base64url, monouso, scadenza 10 minuti.
//   - Tabelle telegram_link / telegram_link_token: RLS deny-by-default, questa
//     edge accede con SERVICE ROLE.
//   - verify_jwt=false a livello deploy: l'auth e' gestita qui dentro.
//
// Azioni (JSON body { action }): "create" (default) | "status" | "revoke".
//   create → { ok, token, deep_link, expires_at }
//   status → { ok, linked: bool, since? }
//   revoke → { ok, revoked: bool }

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app', 'https://elbrenz.eu', 'https://www.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:3000',
];
const BOT_USERNAME = Deno.env.get('TELEGRAM_BOT_USERNAME') ?? 'andreas_elbrenz_bot';
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minuti

function cors(origin: string | null): Record<string, string> {
  const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Vary': 'Origin',
  };
}
function json(b: unknown, s: number, c: Record<string, string>): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...c, 'Content-Type': 'application/json' } });
}

function tokenOpaco(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const c = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });

  // Origin allow-list per le chiamate browser (le server-to-server non hanno origin).
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ ok: false, error: 'origin_non_consentita' }, 403, c);
  }

  // Auth: JWT utente obbligatorio (stesso pattern di andreas-chat).
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ ok: false, error: 'unauthorized' }, 401, c);
  }
  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabaseAnon.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ ok: false, error: 'invalid_jwt' }, 401, c);
  }
  const userId = userData.user.id;

  // Service role per le tabelle in RLS deny-by-default.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let action = 'create';
  if (req.method === 'GET') {
    action = 'status';
  } else {
    try {
      const body = await req.json();
      if (body && typeof body.action === 'string') action = body.action;
    } catch { /* body vuoto → create */ }
  }

  // STATUS: il socio ha un collegamento attivo?
  if (action === 'status') {
    const { data: link } = await supabase
      .from('telegram_link')
      .select('telegram_user_id, created_at')
      .eq('user_id', userId).is('revoked_at', null)
      .maybeSingle();
    return json({ ok: true, linked: !!link, since: link?.created_at ?? null }, 200, c);
  }

  // REVOKE: il socio scollega il proprio Telegram.
  if (action === 'revoke') {
    await supabase
      .from('telegram_link')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId).is('revoked_at', null);
    return json({ ok: true, revoked: true }, 200, c);
  }

  // CREATE (default): genera token monouso + deep-link.
  if (action === 'create') {
    const token = tokenOpaco();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    const { error: insErr } = await supabase
      .from('telegram_link_token')
      .insert({ token, user_id: userId, expires_at: expiresAt });
    if (insErr) {
      console.error('[telegram-link-token] insert fallita:', insErr);
      return json({ ok: false, error: 'errore_interno' }, 500, c);
    }
    return json({
      ok: true,
      token,
      deep_link: `https://t.me/${BOT_USERNAME}?start=${token}`,
      expires_at: expiresAt,
    }, 200, c);
  }

  return json({ ok: false, error: 'action_non_valida' }, 400, c);
});
