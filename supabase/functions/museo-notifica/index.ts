import { createClient } from 'jsr:@supabase/supabase-js@2';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

// museo-notifica (21/7) — notifica Telegram al direttivo quando il curatore
// pubblica un pezzo del Museo Grande Guerra. Chiamata dall'app DOPO la
// pubblicazione (update RLS lato client): qui NON si pubblica, si notifica e
// basta. Il secret del bot vive solo lato edge, per questo passa da qui.
//
// GATE: verify_jwt=true (default, dichiarato in config.toml) -> il gateway
// pretende un JWT valido; in piu' verifichiamo lato server che il chiamante sia
// curatore_museo_gg o livello >= 50, cosi' un socio qualsiasi non puo' spammare.
// Best-effort per il chiamante: se qualcosa fallisce, il pezzo resta pubblicato.

const ALLOWED_ORIGINS = [
  'https://elbrenz-community.netlify.app',
  'https://community.elbrenz.eu',
  'https://app.elbrenz.eu',
  'https://elbrenz.eu',
  'http://localhost:3000',
];

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  const CORS = cors(req.headers.get('origin'));
  const J = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return J({ error: 'method_not_allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identita' certa dal token.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return J({ error: 'no_token' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Gate: curatore_museo_gg oppure livello >= 50.
  const { data: ruoli } = await admin
    .from('utente_ruolo').select('ruolo:ruolo_id(nome, livello)').eq('utente_id', user.id);
  const arr = ((ruoli ?? []) as any[]).map((r) => r?.ruolo).filter(Boolean);
  const ok = arr.some((r) => r.nome === 'curatore_museo_gg' || (r.livello ?? 0) >= 50);
  if (!ok) return J({ error: 'non_autorizzato' }, 403);

  let b: any;
  try { b = await req.json(); } catch { return J({ error: 'invalid_json' }, 400); }
  const titolo = String(b?.titolo ?? '').trim().slice(0, 200);
  const curatore = String(b?.curatore ?? '').trim().slice(0, 100) || 'un curatore';
  if (!titolo) return J({ error: 'titolo_mancante' }, 400);

  await notificaDirettivo(admin, 'museo_pezzo_pubblicato', {
    dettaglio: `Nuovo pezzo pubblicato nel Museo Grande Guerra: «${titolo}», a cura di ${curatore}.`,
  });

  return J({ ok: true });
});
