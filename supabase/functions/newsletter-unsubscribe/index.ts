// newsletter-unsubscribe — revoca del consenso alle comunicazioni marketing.
//
// GET  /newsletter-unsubscribe/{emailSeg}/{exp}/{token}  -> peek { ok, email(mascherata) }
// POST /newsletter-unsubscribe/{emailSeg}/{exp}/{token}  -> spegne i flag di consenso
//
// Token HMAC nel PATH (scope 'newsletter-unsub', ADMIN_ACTION_SECRET),
// verifica a tempo costante (verificaToken). NESSUNA nuova tabella: aggiorna
// i consensi esistenti. Idempotente. La conferma HTML la rende la pagina su
// elbrenz.eu (la piattaforma forza text/plain sull'HTML delle edge): qui solo JSON.
//
// Il peek (GET) NON disiscrive: serve solo a mostrare la pagina soft. La
// disiscrizione avviene solo col POST, cioè su clic esplicito dell'utente
// (così i prefetch/scanner dei client email non disiscrivono per sbaglio).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verificaToken } from '../_shared/admin.ts';
import { segToEmail, UNSUB_SCOPE } from '../_shared/newsletter.ts';

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
  'https://community.elbrenz.eu',
  'https://www.elbrenz.eu',
  'http://localhost:4321',
  'http://localhost:3000',
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status: number, c: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...c, 'Content-Type': 'application/json' } });
}
function mascheraEmail(email: string): string {
  const [u, d] = email.split('@');
  if (!u || !d) return '***';
  const testa = u.length <= 2 ? u[0] : u.slice(0, 2);
  return `${testa}${'*'.repeat(Math.max(1, u.length - testa.length))}@${d}`;
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const c = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: c });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'origin' }, 403, c);

  const url = new URL(req.url);
  const m = url.pathname.match(/\/newsletter-unsubscribe\/([A-Za-z0-9_-]+)\/(\d+)\/([0-9a-f]+)\/?$/i);
  if (!m) return json({ ok: false, error: 'bad_path' }, 400, c);
  const [, seg, expStr, token] = m;

  let email = '';
  try { email = segToEmail(seg).trim().toLowerCase(); } catch { return json({ ok: false, error: 'invalid' }, 200, c); }
  const exp = Number(expStr);

  const secret = Deno.env.get('ADMIN_ACTION_SECRET');
  if (!secret) { console.error('[newsletter-unsubscribe] ADMIN_ACTION_SECRET mancante'); return json({ ok: false, error: 'server' }, 500, c); }

  const valido = EMAIL_REGEX.test(email) && await verificaToken(secret, UNSUB_SCOPE, email, exp, token);
  // 200 (non 4xx) così la pagina mostra un messaggio gentile invece di un errore.
  if (!valido) return json({ ok: false, error: 'invalid' }, 200, c);

  // GET = peek: mostra a chi si riferisce, senza disiscrivere.
  if (req.method === 'GET') return json({ ok: true, email: mascheraEmail(email) }, 200, c);
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405, c);

  // POST = disiscrizione effettiva (revoca del consenso). Idempotente.
  const base = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(base, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = new Date().toISOString();
  try {
    await supabase.from('guardiani_contributori')
      .update({ consenso_marketing: false, marketing_double_optin: false, updated_at: now })
      .eq('email', email);
    await supabase.from('download_lead')
      .update({ consenso_newsletter: false })
      .eq('email', email);
  } catch (e) {
    console.error('[newsletter-unsubscribe] update fallito:', e);
    return json({ ok: false, error: 'db' }, 500, c);
  }
  return json({ ok: true, email: mascheraEmail(email) }, 200, c);
});
