// radar-eventi-azione — le azioni di curatela sul Radar eventi. Risponde SOLO
// JSON, mai HTML: le edge function non servono pagine renderizzabili (Supabase
// strippa il Content-Type e il browser scarica un .txt). La pagina Astro
// /radar-eventi chiama questa edge in JSON. Nessun link firmato dentro una
// email che punti qui: l'autorizzazione è il ruolo, non un token in chiaro.
//
// verify_jwt=true (dichiarato in config.toml): il gateway valida il JWT, e qui
// dentro si verifica ANCHE il ruolo. Le scritture usano il client con il JWT
// del curatore, non il service role: così le RLS restano in vigore e il trigger
// di guardia vede il vero auth.uid() (è quello che gli permette di riservare la
// pubblicazione al direttivo e di firmare curato_da).
//
// AZIONI
//   approva   proposto  -> approvato        (livello >= 20)
//   scarta    qualsiasi -> scartato         (livello >= 20)
//   modifica  campi editoriali              (livello >= 20)
//   pubblica  approvato -> pubblicato       (livello >= 50, imposto anche a DB)
//
// Nessun evento raggiunge il pubblico senza passare da approvato e poi
// pubblicato, per mano di due persone.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://elbrenz.eu',
  'https://www.elbrenz.eu',
  'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu',
  'http://localhost:4321',
  'http://localhost:3000',
];

const AZIONI = ['approva', 'pubblica', 'scarta', 'modifica'] as const;
type Azione = typeof AZIONI[number];

// Solo questi campi sono modificabili dalla curatela: il resto (punteggio,
// hash, fonte) è cronaca di come l'evento è arrivato e non si riscrive.
const CAMPI_MODIFICABILI = [
  'titolo', 'descrizione', 'luogo', 'comune', 'valle', 'organizzatore',
  'contatti', 'prezzo', 'pilastro', 'note_curatore',
  'data_inizio', 'data_fine', 'ora_inizio', 'ora_fine',
];

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const h = cors(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, h);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Non autenticato' }, 401, h);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Client con il JWT del curatore: RLS attive, auth.uid() reale.
  const comeUtente = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: eU } = await comeUtente.auth.getUser();
  if (eU || !user) return json({ error: 'Sessione non valida' }, 401, h);

  // Livello massimo fra i ruoli dell'utente.
  const { data: ruoli } = await comeUtente
    .from('utente_ruolo').select('ruolo:ruolo_id ( nome, livello )').eq('utente_id', user.id);
  const livello = ((ruoli as any[]) ?? [])
    .reduce((m: number, r: any) => Math.max(m, r?.ruolo?.livello ?? 0), 0);
  if (livello < 20) return json({ error: 'Non autorizzato per la curatela del Radar' }, 403, h);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON non valido' }, 400, h); }

  const azione = String(body?.azione ?? '') as Azione;
  const id = String(body?.id ?? '');
  if (!AZIONI.includes(azione)) return json({ error: 'Azione sconosciuta' }, 400, h);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Id evento non valido' }, 400, h);

  const { data: evento, error: eLettura } = await comeUtente
    .from('eventi_esterni').select('id, stato, titolo').eq('id', id).maybeSingle();
  if (eLettura) return json({ error: 'Lettura fallita', detail: eLettura.message }, 500, h);
  if (!evento) return json({ error: 'Evento non trovato' }, 404, h);

  let patch: Record<string, unknown>;

  switch (azione) {
    case 'approva':
      if (evento.stato !== 'proposto') {
        return json({ error: `Si approva solo un evento proposto (ora è «${evento.stato}»).` }, 409, h);
      }
      patch = { stato: 'approvato' };
      break;

    case 'pubblica':
      if (livello < 50) {
        return json({ error: 'La pubblicazione è riservata al direttivo.' }, 403, h);
      }
      if (evento.stato !== 'approvato') {
        return json({ error: `Si pubblica solo un evento approvato (ora è «${evento.stato}»).` }, 409, h);
      }
      patch = { stato: 'pubblicato' };
      break;

    case 'scarta':
      patch = { stato: 'scartato' };
      if (typeof body?.note_curatore === 'string') {
        patch.note_curatore = body.note_curatore.slice(0, 2000);
      }
      break;

    case 'modifica': {
      const campi = body?.campi ?? {};
      patch = {};
      for (const k of CAMPI_MODIFICABILI) {
        if (Object.prototype.hasOwnProperty.call(campi, k)) {
          const v = campi[k];
          patch[k] = typeof v === 'string' ? v.slice(0, 4000) : v;
        }
      }
      if (!Object.keys(patch).length) return json({ error: 'Nessun campo da modificare' }, 400, h);
      break;
    }
  }

  const { data: aggiornato, error: eScrittura } = await comeUtente
    .from('eventi_esterni').update(patch).eq('id', id)
    .select('id, stato, titolo, punteggio, pilastro').maybeSingle();

  if (eScrittura) {
    // I messaggi del trigger di guardia sono già in italiano e leggibili:
    // vanno mostrati al curatore così come sono.
    return json({ error: eScrittura.message }, 400, h);
  }
  if (!aggiornato) return json({ error: 'Aggiornamento non applicato (permessi?)' }, 403, h);

  return json({ ok: true, azione, evento: aggiornato }, 200, h);
});
