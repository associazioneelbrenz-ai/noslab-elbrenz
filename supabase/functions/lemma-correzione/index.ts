// lemma-correzione — «qui c'è qualcosa che non torna», da chiunque legga.
//
// PERCHE' ESISTE. Una parlata non si stabilisce a tavolino: si discute. Chi
// legge una scheda sa magari che a Rabbi si dice diversamente, o che l'accento
// va altrove, e finora non aveva modo di dirlo se non con una mail che nessuno
// ritrova. Ogni segnalazione persa e' una persona che smette di segnalare.
//
// NON MODIFICA NIENTE. Scrive una proposta che arriva in curatela accanto ai
// lemmi nuovi. La curatela umana non si scavalca nemmeno per un accento: una
// fonte sbagliata resta sbagliata per sempre, e una correzione sbagliata pure.
//
// LE DIFESE, e perche' ognuna c'e':
//   honeypot + tempo minimo -> i moduli pubblici raccolgono spazzatura
//   tetto per indirizzo     -> perche' nessuno riempia la coda del curatore
//   il lemma deve esistere ED essere pubblicato -> una correzione a una voce in
//     revisione ne rivelerebbe l'esistenza, e la curatela e' riservata
//
// LA RISPOSTA DICE SOLO CIO' CHE E' SUCCESSO DAVVERO: si dichiara riuscita solo
// se la scrittura ha restituito una riga. E' la regola che questo progetto ha
// imparato a sue spese, con la conferma dei Guardiani che diceva «fatto» a
// gente che non aveva combinato niente.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINI = [
  'https://elbrenz.eu', 'https://www.elbrenz.eu', 'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:5173', 'http://localhost:3000',
];

const CAMPI = ['definizione', 'esempio', 'grafia_accento', 'comune', 'parlata', 'etimologia', 'altro'];

// Quante proposte al massimo da uno stesso indirizzo in un'ora. Chi legge il
// glossario e trova tre cose da correggere deve poterle dire tutte e tre; chi
// ne manda venti in un'ora non sta correggendo.
const TETTO_ORARIO = 8;

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
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('correzione|' + ip));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return J({ errore: 'metodo_non_ammesso' }, 405, origin);

  let c: Record<string, unknown>;
  try { c = await req.json(); } catch { return J({ errore: 'corpo_non_valido' }, 400, origin); }

  // L'esca: un campo che un essere umano non vede e non compila mai.
  if (String(c._honeypot ?? '').trim() !== '') return J({ ok: true, ignorato: true }, 200, origin);
  // E il tempo: un modulo compilato in meno di tre secondi non l'ha scritto una
  // persona. Si risponde ok lo stesso, perche' dire «ti ho riconosciuto» a un
  // automa gli insegna come non farsi riconoscere la prossima volta.
  const aperto = Number(c._ts ?? 0);
  if (aperto && Date.now() - aperto < 3000) return J({ ok: true, ignorato: true }, 200, origin);

  const lemma_id = String(c.lemma_id ?? '');
  const campo = String(c.campo ?? '');
  const proposta = String(c.proposta ?? '').trim();
  const motivazione = String(c.motivazione ?? '').trim().slice(0, 1200) || null;
  const nome = String(c.nome ?? '').trim().slice(0, 80) || null;
  const email = String(c.email ?? '').trim().slice(0, 160) || null;
  const gettone = String(c.gettone ?? '').slice(0, 64) || null;

  if (!/^[0-9a-f-]{36}$/i.test(lemma_id)) return J({ errore: 'identificativo_non_valido' }, 400, origin);
  if (!CAMPI.includes(campo)) return J({ errore: 'campo_non_valido' }, 400, origin);
  if (proposta.length < 2) return J({ errore: 'scrivi_la_proposta' }, 400, origin);
  if (proposta.length > 1200) return J({ errore: 'proposta_troppo_lunga' }, 400, origin);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return J({ errore: 'email_non_valida' }, 400, origin);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Tetto per indirizzo. Fallisce CHIUSO, al contrario delle reazioni: qui una
  // scrittura in piu' finisce nella coda di una persona vera che dovra'
  // leggerla, e il tempo del curatore e' la risorsa scarsa di tutto il progetto.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'ignoto';
  const chiave = await impronta(ip);
  const { count, error: errConta } = await sb.from('lemma_correzione')
    .select('id', { count: 'exact', head: true })
    .eq('gettone', chiave)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if (errConta) return J({ errore: 'controllo_non_riuscito' }, 503, origin);
  if ((count ?? 0) >= TETTO_ORARIO) return J({ errore: 'troppe_proposte' }, 429, origin);

  const { data: voce } = await sb.from('dizionario_lemma')
    .select('id, lemma').eq('id', lemma_id).eq('stato', 'pubblicato').maybeSingle();
  if (!voce) return J({ errore: 'voce_non_trovata' }, 404, origin);

  // Il gettone del browser resta nel campo suo, l'impronta dell'indirizzo va
  // nello stesso campo solo per il conteggio orario: si conserva l'impronta,
  // che e' quella che serve alla difesa e non identifica nessuno.
  const { data: scritta, error } = await sb.from('lemma_correzione')
    .insert({ lemma_id, campo, proposta, motivazione, nome, email, gettone: chiave })
    .select('id')
    .maybeSingle();

  if (error || !scritta) {
    return J({ errore: 'scrittura_fallita', dettaglio: error?.message ?? 'nessuna riga' }, 500, origin);
  }

  return J({
    ok: true,
    lemma: (voce as any).lemma,
    messaggio: 'Grazie: la tua segnalazione è arrivata a un curatore.',
  }, 200, origin);
});
