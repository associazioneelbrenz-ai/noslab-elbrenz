// reazione-pubblica — «la conosco anch'io», da chiunque, anche senza account.
//
// PERCHE' PASSA DA QUI. Il ruolo anonimo non ha alcun permesso sulla tabella
// `reazione`, come su tutte le altre: ogni scrittura pubblica di questo progetto
// passa da una edge con il service role. Qui in piu' c'e' una ragione di
// sostanza: il conteggio delle reazioni su una parola e' un DATO LINGUISTICO, e
// un dato che chiunque puo' gonfiare non e' un dato.
//
// COSA FA. Registra o toglie una reazione e restituisce il conteggio aggiornato
// con i comuni. Il gesto e' un interruttore: chi ha gia' premuto e preme ancora
// toglie la propria, non ne aggiunge una seconda.
//
// L'IDENTITA' DI CHI NON HA UN ACCOUNT e' un gettone generato dal browser. Non
// e' a prova di malintenzionato, e non pretende di esserlo: e' la difesa contro
// la distrazione (il doppio tocco, il ricaricamento), non contro l'attacco. La
// difesa contro l'attacco e' il tetto per indirizzo, qui sotto.
//
// IL COMUNE E' IL MOTIVO PER CUI ESISTE questa funzione. Senza, la reazione su
// una parola resta un applauso; con, diventa la mappa di dove quella parola si
// dice davvero. Non e' obbligatorio: chi non lo mette conta lo stesso, ma
// aggiunge meno.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINI = [
  'https://elbrenz.eu', 'https://www.elbrenz.eu', 'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:5173', 'http://localhost:3000',
];

const TIPI_OGGETTO = ['lemma', 'storia', 'museo_pezzo', 'post', 'articolo'];
const TIPI_REAZIONE = ['conosco', 'mi_piace', 'ricordo'];

// Quante reazioni al massimo da uno stesso indirizzo in un'ora. Alto abbastanza
// da non dare fastidio a chi sfoglia il glossario e ne riconosce venti di fila,
// basso abbastanza da rendere noioso gonfiare un numero.
const TETTO_ORARIO = 60;

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
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('reazione|' + ip));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return J({ errore: 'metodo_non_ammesso' }, 405, origin);

  let c: { oggetto_tipo?: string; oggetto_id?: string; tipo?: string; gettone?: string; comune?: string };
  try { c = await req.json(); } catch { return J({ errore: 'corpo_non_valido' }, 400, origin); }

  const oggetto_tipo = String(c.oggetto_tipo ?? '');
  const oggetto_id = String(c.oggetto_id ?? '');
  const tipo = String(c.tipo ?? 'conosco');
  const gettone = String(c.gettone ?? '').slice(0, 64);
  // Il comune arriva da un campo libero: si accorcia e si ripulisce, perche'
  // finira' in una mappa e un valore sporco la sporca per sempre.
  const comune = String(c.comune ?? '').trim().slice(0, 60) || null;

  if (!TIPI_OGGETTO.includes(oggetto_tipo)) return J({ errore: 'oggetto_non_valido' }, 400, origin);
  if (!TIPI_REAZIONE.includes(tipo)) return J({ errore: 'tipo_non_valido' }, 400, origin);
  if (!/^[0-9a-f-]{36}$/i.test(oggetto_id)) return J({ errore: 'identificativo_non_valido' }, 400, origin);
  if (gettone.length < 8) return J({ errore: 'gettone_mancante' }, 400, origin);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Tetto per indirizzo. Fallisce APERTO: se il conteggio non si puo' leggere,
  // si lascia passare. Un difetto della difesa non deve spegnere la funzione,
  // e qui il danno massimo di un passaggio in piu' e' un numero leggermente
  // gonfio, non un problema di sicurezza.
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'ignoto';
    const chiave = await impronta(ip);
    const { count } = await sb.from('reazione')
      .select('id', { count: 'exact', head: true })
      .eq('gettone', chiave)
      .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) > TETTO_ORARIO) return J({ errore: 'troppe_reazioni' }, 429, origin);
  } catch { /* fallisce aperto, di proposito */ }

  // Solo su cio' che e' davvero pubblico: una reazione a un lemma non ancora
  // validato ne rivelerebbe l'esistenza, e la curatela e' riservata.
  if (oggetto_tipo === 'lemma') {
    const { data: pub } = await sb.from('dizionario_lemma')
      .select('id').eq('id', oggetto_id).eq('stato', 'pubblicato').maybeSingle();
    if (!pub) return J({ errore: 'oggetto_non_pubblico' }, 404, origin);
  }

  // L'interruttore: chi ha gia' premuto e preme ancora, toglie.
  const { data: esistente } = await sb.from('reazione')
    .select('id').eq('oggetto_tipo', oggetto_tipo).eq('oggetto_id', oggetto_id)
    .eq('gettone', gettone).maybeSingle();

  let mia = false;
  if (esistente) {
    await sb.from('reazione').delete().eq('id', (esistente as any).id);
  } else {
    const { error } = await sb.from('reazione')
      .insert({ oggetto_tipo, oggetto_id, tipo, gettone, comune })
      .select('id');
    // Non si dichiara riuscito cio' che non ha restituito una riga: e' la
    // regola che questo progetto ha imparato a sue spese.
    if (error) return J({ errore: 'scrittura_fallita', dettaglio: error.message }, 500, origin);
    mia = true;
  }

  const { data: conteggio } = await sb.from('v_reazioni_conteggio')
    .select('quante, comuni')
    .eq('oggetto_tipo', oggetto_tipo).eq('oggetto_id', oggetto_id).eq('tipo', tipo)
    .maybeSingle();

  return J({
    ok: true,
    mia,
    quante: (conteggio as any)?.quante ?? 0,
    comuni: (conteggio as any)?.comuni ?? [],
  }, 200, origin);
});
