// lemma-commento — «da noi si diceva così», sotto la parola.
//
// PERCHE' ESISTE, e perche' NON e' il modulo di correzione. Il modulo di
// correzione chiede al curatore di cambiare qualcosa e riceve un esito. Il
// commento no: «mia nonna la usava per dire un'altra cosa» non chiede niente a
// nessuno, e' testimonianza, e va conservata anche quando la scheda resta com'e'.
// Tenerle separate evita due danni opposti: trasformare ogni ricordo in lavoro
// per il curatore, oppure far sparire i ricordi che nessuno accoglie.
//
// TUTTO PASSA DALLA MODERAZIONE. La pagina di una parola e' un documento che
// resta: il giorno che una scheda finisce su un social senza filtro diventa una
// bacheca. Il prezzo e' che un commento non compare subito. Il prezzo
// dell'alternativa e' non poter piu' mostrare il glossario a un linguista.
//
// LA RISPOSTA LO DICE IN CHIARO, invece di far credere che sia gia' online:
// promettere una comparsa immediata e non mantenerla e' il modo piu' rapido per
// far tornare qualcuno a controllare, non vedere niente, e non scrivere piu'.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINI = [
  'https://elbrenz.eu', 'https://www.elbrenz.eu', 'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:5173', 'http://localhost:3000',
];

// Un commento e' un gesto piu' raro di un cuore e piu' impegnativo di una
// correzione: chi ne scrive sei in un'ora non sta raccontando, sta riempiendo.
const TETTO_ORARIO = 6;

function cors(origin: string | null): HeadersInit {
  const allow = origin && ORIGINI.includes(origin) ? origin : ORIGINI[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const J = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors(o) } });

async function impronta(ip: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('commento|' + ip));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return J({ errore: 'metodo_non_ammesso' }, 405, origin);

  let c: Record<string, unknown>;
  try { c = await req.json(); } catch { return J({ errore: 'corpo_non_valido' }, 400, origin); }

  // Esca e tempo minimo. Si risponde ok anche quando si scarta: dire «ti ho
  // riconosciuto» a un automa gli insegna come non farsi riconoscere.
  if (String(c._honeypot ?? '').trim() !== '') return J({ ok: true, ignorato: true }, 200, origin);
  const aperto = Number(c._ts ?? 0);
  if (aperto && Date.now() - aperto < 3000) return J({ ok: true, ignorato: true }, 200, origin);

  const lemma_id = String(c.lemma_id ?? '');
  const testo = String(c.testo ?? '').trim();
  const nome = String(c.nome ?? '').trim().slice(0, 80) || null;
  const email = String(c.email ?? '').trim().slice(0, 160) || null;
  const comune = String(c.comune ?? '').trim().slice(0, 60) || null;

  if (!/^[0-9a-f-]{36}$/i.test(lemma_id)) return J({ errore: 'identificativo_non_valido' }, 400, origin);
  if (testo.length < 2) return J({ errore: 'scrivi_qualcosa' }, 400, origin);
  if (testo.length > 1500) return J({ errore: 'commento_troppo_lungo' }, 400, origin);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return J({ errore: 'email_non_valida' }, 400, origin);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Fallisce CHIUSO come le correzioni: ogni riga in piu' e' una riga che una
  // persona vera dovra' leggere prima di approvarla.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'ignoto';
  const chiave = await impronta(ip);
  const { count, error: errConta } = await sb.from('lemma_commento')
    .select('id', { count: 'exact', head: true })
    .eq('gettone', chiave)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if (errConta) return J({ errore: 'controllo_non_riuscito' }, 503, origin);
  if ((count ?? 0) >= TETTO_ORARIO) return J({ errore: 'troppi_commenti' }, 429, origin);

  // Solo sotto una parola davvero pubblicata: commentare una voce in revisione
  // ne rivelerebbe l'esistenza, e la curatela e' riservata.
  const { data: voce } = await sb.from('dizionario_lemma')
    .select('id, lemma').eq('id', lemma_id).eq('stato', 'pubblicato').maybeSingle();
  if (!voce) return J({ errore: 'voce_non_trovata' }, 404, origin);

  const { data: scritto, error } = await sb.from('lemma_commento')
    .insert({ lemma_id, testo, nome, email, comune, gettone: chiave })
    .select('id')
    .maybeSingle();

  // Non si dichiara riuscito cio' che non ha restituito una riga.
  if (error || !scritto) {
    return J({ errore: 'scrittura_fallita', dettaglio: error?.message ?? 'nessuna riga' }, 500, origin);
  }

  return J({
    ok: true,
    lemma: (voce as any).lemma,
    messaggio: 'Grazie. Il tuo ricordo arriva a un curatore e compare sotto la parola appena approvato.',
  }, 200, origin);
});
