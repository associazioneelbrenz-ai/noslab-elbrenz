import { createClient } from 'jsr:@supabase/supabase-js@2';

// museo-donazioni-media (21/7) — operazioni Storage sul ramo donazioni per il
// pannello curatore, via SERVICE ROLE. Il client nel pannello opera sul bucket
// PRIVATO 'donazioni' col token del login OTP, che lo Storage tratta da anon:
// signed URL (anteprima) e copia file (promuovi) fallivano con RLS. Qui il
// service role fa il lavoro, dopo aver verificato il ruolo LATO SERVER.
//
// GATE: verify_jwt=true (config.toml) + ruolo curatore_museo_gg o livello >= 50.
// Azioni:
//   anteprima      { donazione_id, indice } -> signed URL 10 min del file
//                  (verificato appartenere alla donazione).
//   promuovi-copia { donazione_id, pezzo_id } -> copia le IMMAGINI della
//                  donazione dal bucket privato al percorso pubblico dei media
//                  pezzi, aggiorna immagini_urls del pezzo, ritorna gli URL.
//                  La donazione originale resta INTATTA.

const ALLOWED_ORIGINS = [
  'https://elbrenz-community.netlify.app',
  'https://community.elbrenz.eu',
  'https://app.elbrenz.eu',
  'https://elbrenz.eu',
  'http://localhost:3000',
];
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const FIRMA_TTL = 600; // 10 minuti

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
  if (req.method !== 'POST') return J({ error: 'Metodo non consentito' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identita' dal token.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return J({ error: 'Sessione mancante' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: 'Sessione non valida' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Gate ruolo SERVER-SIDE: curatore_museo_gg o livello >= 50.
  const { data: ruoli } = await admin
    .from('utente_ruolo').select('ruolo:ruolo_id(nome, livello)').eq('utente_id', user.id);
  const arr = ((ruoli ?? []) as any[]).map((r) => r?.ruolo).filter(Boolean);
  const autorizzato = arr.some((r) => r.nome === 'curatore_museo_gg' || (r.livello ?? 0) >= 50);
  if (!autorizzato) return J({ error: 'Non sei autorizzato alla curatela del museo.' }, 403);

  let b: any;
  try { b = await req.json(); } catch { return J({ error: 'Richiesta non valida' }, 400); }
  const azione = String(b?.azione ?? '');
  const donazioneId = String(b?.donazione_id ?? '');
  if (!donazioneId) return J({ error: 'Donazione non indicata' }, 400);

  // La donazione (per verificare che i file richiesti siano davvero suoi).
  const { data: don } = await admin
    .from('donazione_materiale').select('id, file_urls').eq('id', donazioneId).maybeSingle();
  if (!don) return J({ error: 'Donazione non trovata' }, 404);
  const files: string[] = (don.file_urls as string[]) ?? [];

  // --- ANTEPRIMA: signed URL 10 min di un singolo file della donazione --------
  if (azione === 'anteprima') {
    const indice = Number(b?.indice ?? -1);
    const path = files[indice];
    if (!path) return J({ error: 'File non trovato nella donazione' }, 404);
    const { data, error } = await admin.storage.from('donazioni').createSignedUrl(path, FIRMA_TTL);
    if (error || !data?.signedUrl) return J({ error: 'Anteprima non disponibile', detail: error?.message ?? null }, 500);
    return J({ ok: true, url: data.signedUrl });
  }

  // --- PROMUOVI-COPIA: copia le immagini al pubblico e le lega al pezzo -------
  if (azione === 'promuovi-copia') {
    const pezzoId = String(b?.pezzo_id ?? '');
    if (!pezzoId) return J({ error: 'Pezzo di destinazione non indicato' }, 400);

    const nuovi: string[] = [];
    for (const path of files) {
      const ext = (path.split('.').pop() || '').toLowerCase();
      if (!IMG_EXT.has(ext)) continue; // solo immagini diventano immagini del pezzo
      const { data: file, error: dlErr } = await admin.storage.from('donazioni').download(path);
      if (dlErr || !file) continue;
      const dest = `museo-gg/da-donazione/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await admin.storage.from('assets-pubblici')
        .upload(dest, await file.arrayBuffer(), { contentType: file.type || 'image/jpeg', upsert: false });
      if (upErr) continue;
      nuovi.push(admin.storage.from('assets-pubblici').getPublicUrl(dest).data.publicUrl);
    }

    if (nuovi.length > 0) {
      // Aggiunge alle eventuali immagini gia' presenti sul pezzo.
      const { data: pz } = await admin.from('museo_gg_pezzo').select('immagini_urls').eq('id', pezzoId).maybeSingle();
      const esistenti: string[] = (pz?.immagini_urls as string[]) ?? [];
      await admin.from('museo_gg_pezzo')
        .update({ immagini_urls: [...esistenti, ...nuovi], updated_at: new Date().toISOString() })
        .eq('id', pezzoId);
    }
    return J({ ok: true, urls: nuovi });
  }

  return J({ error: 'Azione non riconosciuta' }, 400);
});
