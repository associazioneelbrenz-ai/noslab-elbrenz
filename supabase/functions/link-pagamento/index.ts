// link-pagamento — il link di pagamento giusto per una persona, in un colpo solo.
//
// PERCHE' ESISTE. I link personali di pagamento c'erano gia' tutti (/integrazione,
// /paga-quota, /rinnovo, /dona) e nessuno sapeva come ottenerli: le email scritte
// a mano finivano per mandare a /tesseramento generico. Un pagamento fatto da li'
// non sa a chi appartiene, ed e' esattamente il motivo per cui la plancia trova
// «pagamenti senza domanda collegata». Il difetto non era mancanza di macchina:
// era che la macchina non aveva una maniglia.
//
// COSA FA. Data una persona (per domanda, per email, o nessuna) restituisce
// l'indirizzo corretto e dice perche' quello e non un altro. NON manda niente:
// il link si incolla in una email, in un messaggio, o si detta al telefono.
// Separare «ottenere» da «inviare» e' voluto: chi manda deve poter guardare il
// link prima, e la stessa maniglia serve anche a chi scrive su WhatsApp.
//
// COSA NON TOCCA. La catena PayPal, che e' dichiarata intoccabile: qui si
// costruiscono solo indirizzi verso pagine che esistono gia'. L'importo continua
// a deciderlo il server dentro paypal-create-order, mai il link.
//
// SICUREZZA. Riservata a chi ha ruolo >= 50: il link di /paga-quota e' firmato e
// vale trenta giorni, quindi chi lo ottiene puo' far pagare quella domanda. Il
// codice tessera dell'integrazione e' HMAC e non enumerabile, ma resta un dato
// personale: non finisce in query string, sta nel PATH come vuole la regola del
// progetto (l'uguale piu' due esadecimali si corrompe in quoted-printable).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';
import { quotaAnno } from '../_shared/quota.ts';

const SITO = 'https://elbrenz.eu';
const ANNO_CORRENTE = 2026;

const ORIGINI = [
  'https://elbrenz.eu', 'https://www.elbrenz.eu', 'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu',
  'http://localhost:5173', 'http://localhost:4321', 'http://localhost:3000',
];

function cors(origin: string | null): HeadersInit {
  const allow = origin && ORIGINI.includes(origin) ? origin : ORIGINI[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const J = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return J({ errore: 'metodo_non_ammesso' }, 405, origin);

  const SB_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1) Chi chiede. Serve una sessione vera: il token porta con se' l'identita',
  //    la chiave anonima e' solo il lasciapassare del gateway.
  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) return J({ errore: 'sessione_mancante' }, 401, origin);

  const comeUtente = createClient(SB_URL, ANON, { global: { headers: { Authorization: authz } } });
  const { data: udata, error: uerr } = await comeUtente.auth.getUser();
  if (uerr || !udata?.user) return J({ errore: 'sessione_non_valida' }, 401, origin);

  const admin = createClient(SB_URL, SERVICE);
  const { data: puo } = await admin.rpc('has_ruolo_min', {
    p_utente_id: udata.user.id, p_livello_min: 50,
  });
  if (puo !== true) return J({ errore: 'riservato_agli_amministratori' }, 403, origin);

  // 2) Chi deve pagare.
  let corpo: { domanda_id?: string; email?: string; tipo?: string; anno?: number };
  try { corpo = await req.json(); } catch { return J({ errore: 'corpo_non_valido' }, 400, origin); }

  // Il caso piu' semplice: nessuna persona, si vuole il link generico da dare a
  // chi socio non e'. Una donazione libera non ha bisogno di sapere chi paga.
  if (corpo.tipo === 'donazione' && !corpo.domanda_id && !corpo.email) {
    return J({
      url: `${SITO}/dona`,
      tipo: 'donazione',
      importo: 'libero, da 1 a 500 euro',
      persona: null,
      perche: 'Donazione libera: non serve identificare chi paga, e la pagina non lo chiede.',
    }, 200, origin);
  }

  if (!corpo.domanda_id && !corpo.email) {
    // Nessun riferimento: chi non e' ancora socio comincia dall'adesione, dove
    // la quota si versa in coda al modulo e nasce gia' collegata alla domanda.
    return J({
      url: `${SITO}/tesseramento`,
      tipo: 'adesione',
      importo: null,
      persona: null,
      perche: 'Non e\' stata indicata nessuna persona: questo e\' il percorso per chi socio non e\' ancora. Il pagamento nasce collegato alla domanda che compila.',
    }, 200, origin);
  }

  let q = admin
    .from('domande_tesseramento')
    .select('id, nome, email, numero_socio, stato, codice_tessera')
    .limit(2);
  q = corpo.domanda_id
    ? q.eq('id', corpo.domanda_id)
    : q.ilike('email', String(corpo.email).trim());

  const { data: righe, error: errRighe } = await q;
  if (errRighe) return J({ errore: 'lettura_fallita', dettaglio: errRighe.message }, 500, origin);
  if (!righe || righe.length === 0) {
    // Non e' un errore: e' una persona che non ha una domanda. Le si da' il
    // percorso di adesione, che e' la risposta giusta alla domanda vera.
    return J({
      url: `${SITO}/tesseramento`,
      tipo: 'adesione',
      importo: null,
      persona: null,
      perche: 'Nessuna domanda di adesione trovata per questo riferimento: la persona non risulta socia, quindi il link e\' quello dell\'adesione.',
    }, 200, origin);
  }
  if (righe.length > 1) {
    // Le caselle condivise esistono (due socie su un solo indirizzo): meglio
    // fermarsi che mandare a una persona il link di pagamento di un'altra.
    return J({
      errore: 'persona_ambigua',
      dettaglio: 'Piu\' di una domanda risponde a questo indirizzo. Indica la domanda per identificativo.',
    }, 409, origin);
  }

  const p = righe[0] as {
    id: string; nome: string; email: string;
    numero_socio: number | null; stato: string; codice_tessera: string | null;
  };

  // 3) Quanto ha gia' versato: e' questo che decide quale link e' quello giusto.
  const { data: pagamenti } = await admin
    .from('pagamenti_tesseramento')
    .select('importo, stato, annullato_il')
    .eq('domanda_id', p.id);
  const versato = (pagamenti ?? [])
    .filter((x: any) => x.stato === 'completato' && !x.annullato_il)
    .reduce((s: number, x: any) => s + Number(x.importo ?? 0), 0);

  // La quota si legge da dove e' scritta una volta sola, con lo stesso modulo
  // che usano paypal-create-order e scheda-domanda. Un numero che decide quanto
  // una persona paga non va duplicato: il giorno che il Direttivo delibera 25,
  // chi resta indietro non se ne accorge finche' un socio non paga male.
  const quota = await quotaAnno(admin, Number(corpo.anno) || ANNO_CORRENTE, 20);

  const persona = {
    nome: p.nome, numero_socio: p.numero_socio, stato_domanda: p.stato,
    versato, quota, manca: Math.max(0, quota - versato),
  };

  if (versato >= quota) {
    return J({
      url: null, tipo: 'nessuno', importo: null, persona,
      perche: 'Risulta in regola con la quota: non c\'e\' niente da pagare, e mandare un link sarebbe un errore.',
    }, 200, origin);
  }

  // 4) Ha versato una parte e ha la tessera: e' il caso dell'integrazione, e il
  //    codice tessera identifica la persona senza esporne i dati.
  if (versato > 0 && p.codice_tessera) {
    return J({
      url: `${SITO}/integrazione/${p.codice_tessera}`,
      tipo: 'integrazione', importo: persona.manca, persona,
      perche: 'Ha gia\' versato una parte e ha una tessera: il codice identifica la persona, e l\'importo dell\'integrazione lo fissa il server.',
    }, 200, origin);
  }

  // 5) Non ha versato nulla: link firmato alla sua domanda. Vale trenta giorni,
  //    e il pagamento nasce collegato, che e' tutto il punto di questa funzione.
  const secret = Deno.env.get('ADMIN_ACTION_SECRET');
  if (!secret) return J({ errore: 'segreto_mancante' }, 500, origin);

  const exp = Date.now() + TOKEN_TTL_MS;
  const token = await firmaToken(secret, 'paga-quota', p.id, exp);

  return J({
    url: `${SITO}/paga-quota/${p.id}/${exp}/${token}`,
    tipo: 'quota', importo: persona.manca, persona,
    scade_il: new Date(exp).toISOString(),
    perche: 'Non risulta nessun versamento: link firmato alla sua domanda, cosi\' il pagamento nasce gia\' collegato alla persona invece di arrivare orfano.',
  }, 200, origin);
});
