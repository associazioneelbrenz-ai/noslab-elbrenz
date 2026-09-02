// guardiani-contributo — motore di contribuzione «Guardiani de la lenga»
// (12/07/2026). Glossario del ladino anaunico crowdsourced con curatela
// umana OBBLIGATORIA (pattern convenzioni-proposta + scheda-domanda).
//
// Rami (dal path):
//   POST  /guardiani-contributo                      → invio contributo
//   GET   /guardiani-contributo/azione/{valida|rifiuta}/{id}/{exp}/{t}
//   POST  /guardiani-contributo/azione/...           → esegue (conferma)
//   GET   /guardiani-contributo/conferma-newsletter/{id}/{token}
//
// SICUREZZA: honeypot + time-trap + rate limit persistente (RPC condivisa
// convenzioni_rl_hit, prefisso guardiani:); HMAC nel PATH (mai query string);
// nessun contributo entra nel glossario pubblico senza validazione umana.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaToken, verificaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';
import { INFORMATIVA_VERSIONE } from '../_shared/consenso.ts';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app', 'https://elbrenz.eu',
  'https://community.elbrenz.eu', 'https://www.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:3000',
];
const RATE_MAX = 5;
const MIN_FORM_AGE_MS = 3000;
const RECIPIENT = 'info@elbrenz.eu';
const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;
const VARIANTI = ['noneso', 'solander', 'rabies', 'pegaes'];
const TIPI = ['parola', 'frase', 'espressione'];

// [10/8/2026] TRE OBBLIGHI, NON DI PIU'.
//
// Decisione del segretario, presa dopo aver valutato l'alternativa. Rendere
// obbligatori tutti i campi sembra la strada rapida per un archivio completo,
// ma i dati dicono il contrario: etimologia, proverbi e categoria erano vuoti
// sul CENTO PER CENTO dei centoquarantasei lemmi, e non per disinteresse.
// Nessuno lascia vuota l'etimologia dopo aver dedicato una sera a ricordare le
// parole di casa sua: la lascia vuota perche' non sa cosa scriverci. Un campo
// obbligatorio che non si capisce non viene compilato meglio, viene riempito a
// caso, e un'etimologia inventata dentro un dizionario e' un danno permanente.
//
// C'e' anche il conto delle persone: Simone ha portato sessantatre parole. Con
// cinque campi obbligatori ne avrebbe portate cinque.
//
// Quindi qui si chiedono solo: il termine, la parlata, IL PAESE (mancava in
// ventiquattro casi su centoquarantasei, e chi propone una parola sa sempre
// dove si dice) e una DEFINIZIONE VERA. Novanta lemmi su centoquarantasei
// stanno sotto i quindici caratteri: sono traduzioni, non definizioni.
// Tutto il resto resta facoltativo, e si puo' aggiungere dopo.
//
// [10/8/2026, poche ore dopo] LA REGOLA DEI QUINDICI CARATTERI ERA SBAGLIATA,
// e l'ha scoperto Monica Valentinotti in mezz'ora: «Come faccio a scrivere una
// riga per spiegare la parola "asá"?». Asá vuol dire «abbastanza». Non esiste
// una definizione di quindici caratteri di «abbastanza» che non sia fuffa messa
// li' per superare un controllo.
//
// Il conteggio dei caratteri andava bene per i sostantivi — il pipistrello, la
// stua, il cadin — e non andava bene per NIENTE ALTRO: avverbi, preposizioni,
// congiunzioni, esclamazioni. Le parole grammaticali si spiegano con una frase
// in cui compaiono, non con una perifrasi.
//
// Quindi la richiesta non e' piu' «scrivi lungo», e' «fammi capire»: o una
// definizione estesa, OPPURE un esempio d'uso. Monica l'esempio l'aveva gia'
// scritto — «Non ghe n'as mai asá» — ed era la spiegazione migliore possibile.
// Il rigore resta: una parola buttata li' da sola, senza definizione vera e
// senza esempio, continua a non passare.
const DEF_MIN = 15;
const ESEMPIO_MIN = 5;
const CATEGORIE = ['sostantivo', 'verbo', 'aggettivo', 'avverbio', 'modo di dire'];

/** La definizione basta da sola, oppure e' l'esempio a fare il lavoro. */
function spiegata(significato: string, esempio: string): boolean {
  if (significato.trim().length >= DEF_MIN) return true;
  return significato.trim().length >= 2 && esempio.trim().length >= ESEMPIO_MIN;
}
const VARIANTE_LABEL: Record<string, string> = {
  noneso: 'Noneso (Val di Non)', solander: 'Solander (Val di Sole)',
  rabies: 'Rabies (Val di Rabbi)', pegaes: 'Pegaes (Val di Pejo)',
};

function cors(origin: string | null): Record<string, string> {
  const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Vary': 'Origin',
  };
}
function json(b: unknown, s: number, c: Record<string, string>): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...c, 'Content-Type': 'application/json' } });
}
function html(body: string, s = 200): Response {
  return new Response(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/>
<title>Guardiani de la lenga · El Brenz</title><style>
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#F8F1E4;color:#1E2E26;margin:0;padding:24px;}
.card{max-width:560px;margin:0 auto;background:#fff;border-top:4px solid #C8923E;border-radius:8px;padding:32px;}
h1{font-family:Georgia,serif;font-size:24px;margin:0 0 8px;}.occhiello{color:#C8923E;text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:600;}
.btn{display:inline-block;padding:12px 26px;border-radius:4px;text-decoration:none;font-weight:600;font-size:14px;border:0;cursor:pointer;}
.ok{background:#C8923E;color:#1E2E26;}.no{background:#fff;color:#a33;border:2px solid #d97a7a;}
textarea{width:100%;box-sizing:border-box;border:1px solid #E5DFCF;border-radius:4px;padding:10px;font-family:inherit;font-size:14px;}
.nota{color:#999;font-size:12px;margin-top:18px;}</style></head><body><div class="card">${body}</div></body></html>`,
    { status: s, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function inviaEmail(to: string, subject: string, body: string, replyTo?: string): Promise<boolean> {
  const secret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!secret) return false;
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': secret },
      body: JSON.stringify({ to, subject, html: body, ...(replyTo ? { reply_to: replyTo } : {}), tags: [{ name: 'source', value: 'guardiani' }] }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const c = cors(origin);
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: c });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET') ?? '';

  // ---- ramo CONFERMA NEWSLETTER (double opt-in) --------------------------
  const mNews = url.pathname.match(/\/conferma-newsletter\/([0-9a-f-]{36})\/([0-9a-f]+)\/?$/);
  if (mNews) {
    const [, id, token] = mNews;
    // [5/8/2026] Qui si rispondeva in HTML, e la piattaforma Supabase lo serve
    // come text/plain con nosniff: chi apriva il link dalla mail si vedeva il
    // sorgente della pagina invece del ringraziamento (segnalato da Monica
    // Valentinotti). Stessa cura del ramo curatela: la pagina la rende
    // elbrenz.eu, l'edge parla JSON. Un browser viene rimandato alla pagina,
    // che poi chiama questo stesso endpoint in JSON — cosi' i link GIA' spediti
    // restano validi. Effetto collaterale gradito: gli scanner antispam che
    // aprono i link non confermano piu' l'iscrizione al posto della persona.
    const vuoleJson = (req.headers.get('accept') ?? '').includes('application/json');
    if (!vuoleJson) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': `${SITO}/guardiani/conferma/${id}/${token}`, 'Cache-Control': 'no-store' },
      });
    }
    const { data: contrib } = await supabase.from('guardiani_contributori')
      .select('id, marketing_token, marketing_double_optin').eq('id', id).maybeSingle();
    if (!contrib || contrib.marketing_token !== token) {
      return json({ ok: false, error: 'link_non_valido' }, 200, c);
    }
    const gia = contrib.marketing_double_optin === true;
    if (!gia) {
      await supabase.from('guardiani_contributori')
        .update({ marketing_double_optin: true, marketing_confermato_il: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
    }
    return json({ ok: true, gia }, 200, c);
  }

  // ---- ramo CURATELA (valida / rifiuta) ----------------------------------
  const mAz = url.pathname.match(/\/azione\/(valida|rifiuta)\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
  if (mAz) {
    // Risposte in JSON (la piattaforma Supabase forza text/plain sull'HTML
    // servito dalle edge: la conferma renderizzata la fa la pagina
    // /guardiani-curatela su elbrenz.eu, che chiama questo endpoint).
    // [10/8/2026] SI PASSA TUTTI DALLA CONSOLE.
    //
    // Questi link nascono il 6 agosto, quando un pannello non c'era e quindi
    // erano l'unico modo di curare. Adesso c'e', e loro hanno due difetti che
    // con un curatore solo erano imprecisioni e con due diventano bugie negli
    // atti del dizionario: girano con la chiave di servizio, quindi ogni
    // validazione si firma «Commissione Linguistica (via email)» invece del
    // nome di chi ha deciso; e scavalcano la regola per cui un curatore non
    // valida i propri lemmi, perche' chi apre un link non ha un'identita'.
    //
    // Il ramo resta INTERO, spento da un interruttore e non cancellato: basta
    // il secret GUARDIANI_LINK_EMAIL=true per riaverlo. Il giorno che la
    // console fosse irraggiungibile, queste maniglie tornerebbero utili.
    // Anche i link gia' spediti smettono di funzionare, ed e' voluto: erano
    // validi trenta giorni, e una porta di servizio aperta per un mese vale
    // quanto non aver chiuso niente.
    if (Deno.env.get('GUARDIANI_LINK_EMAIL') !== 'true') {
      return json({
        ok: false,
        error: 'si_passa_dalla_console',
        console: `${SITO}/glossario-console`,
        message: 'Le validazioni via email sono state chiuse: adesso si cura dalla console, dove la decisione porta il nome di chi la prende.',
      }, 200, c);
    }
    if (!adminSecret) return json({ ok: false, error: 'config_mancante' }, 500, c);
    const azione = mAz[1] as 'valida' | 'rifiuta';
    const id = mAz[2]; const exp = parseInt(mAz[3], 10); const t = mAz[4];
    const ok = await verificaToken(adminSecret, `guardiani-${azione}`, id, exp, t);
    if (!ok) return json({ ok: false, error: 'link_non_valido' }, 403, c);

    const { data: lemma } = await supabase.from('dizionario_lemma')
      .select('id, lemma, parlata, stato').eq('id', id).maybeSingle();
    if (!lemma) return json({ ok: false, error: 'non_trovato' }, 404, c);

    if (req.method === 'GET') {
      // peek: dà alla pagina i dati del lemma + un token fresco per il POST
      if (lemma.stato === 'pubblicato' || lemma.stato === 'rifiutato') {
        return json({ ok: false, error: 'gia_gestito', stato: lemma.stato, lemma: lemma.lemma }, 200, c);
      }
      const expAz = Date.now() + TOKEN_TTL_MS;
      const tAz = await firmaToken(adminSecret, `guardiani-${azione}`, id, expAz);
      // [6/8/2026] La LETTURA non dice piu' `ok`. Diceva `ok: true` come la
      // scrittura, e due risposte che si somigliano prima o poi vengono
      // confuse: bastava che qualcuno prendesse l'esito dell'anteprima per una
      // conferma, e la pagina avrebbe annunciato una pubblicazione mai avvenuta.
      // Qui `trovato` dice quel che e': ho letto il lemma, non ho fatto niente.
      return json({
        trovato: true, azione, lemma: lemma.lemma,
        variante: VARIANTE_LABEL[lemma.parlata] ?? lemma.parlata, stato: lemma.stato,
        post: { id, exp: expAz, t: tAz },
      }, 200, c);
    }

    // POST: esegue la transizione
    if (lemma.stato === 'pubblicato' || lemma.stato === 'rifiutato') {
      return json({ ok: false, error: 'gia_gestito', stato: lemma.stato }, 200, c);
    }
    // [6/8/2026] SI RISPONDE SOLO DOPO AVER VISTO LA RIGA CAMBIATA.
    //
    // Prima l'esito della scrittura non veniva mai guardato: `.update()` di
    // supabase-js non solleva eccezioni, torna un oggetto con `error`, e la
    // funzione rispondeva comunque «e' ora nel glossario pubblico». La mattina
    // del 6 agosto il segretario ha validato piu' di quindici lemmi vedendo
    // quindici conferme, e a database non ne e' cambiato nemmeno uno: la
    // scrittura veniva respinta da tg_punti_lemma (chiave esterna sui punti) e
    // nessuno se ne accorgeva. Su tutti i lemmi in coda created_at e updated_at
    // coincidevano al minuto.
    //
    // Un pannello che dichiara di aver fatto una cosa che non ha fatto e' peggio
    // di un pannello rotto: quello rotto lo vedi. Ora si chiede alla scrittura
    // di restituire la riga, e senza riga non si dice che e' andata bene.
    const patch = azione === 'valida'
      ? {
          stato: 'pubblicato', validato_da: 'Commissione Linguistica El Brenz (via email)',
          validato_il: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
      : null;

    let motivo = '';
    if (azione === 'rifiuta') {
      try { const b = await req.json(); motivo = String((b as Record<string, unknown>)?.motivo ?? '').trim().slice(0, 500); } catch { /**/ }
    }

    const { data: righe, error: errUpd } = await supabase.from('dizionario_lemma')
      .update(patch ?? {
        stato: 'rifiutato', motivo_rifiuto: motivo || null, updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('stato', 'in_revisione')
      .select('id, stato, validato_il');

    if (errUpd) {
      console.error('[guardiani] scrittura curatela fallita:', azione, id, errUpd.code, errUpd.message);
      return json({ ok: false, error: 'scrittura_fallita', dettaglio: errUpd.message }, 500, c);
    }
    if (!righe || righe.length === 0) {
      // Zero righe toccate: o il lemma non c'e' piu', o qualcuno l'ha gestito
      // nel frattempo. In nessuno dei due casi si annuncia un successo.
      const { data: ora } = await supabase.from('dizionario_lemma')
        .select('stato').eq('id', id).maybeSingle();
      return json({
        ok: false,
        error: ora ? 'gia_gestito' : 'non_trovato',
        stato: ora?.stato ?? null,
        lemma: lemma.lemma,
      }, 200, c);
    }

    const riga = righe[0] as { stato: string };
    return json({
      ok: true, azione, stato: riga.stato, lemma: lemma.lemma,
      message: azione === 'valida'
        ? `«${lemma.lemma}» è ora nel glossario pubblico.`
        : `«${lemma.lemma}» non entrerà nel glossario.`,
    }, 200, c);
  }

  // ---- ramo INVIO CONTRIBUTO (POST dal form) -----------------------------
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, c);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origin non consentita' }, 403, c);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto';
  try {
    const ipHash = await sha256Hex(`guardiani:${ip}`);
    const { data: entro } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_MAX });
    if (entro === false) return json({ error: 'Hai inviato troppi contributi: riprova più tardi.' }, 429, c);
  } catch { /* fail-open */ }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'JSON non valido' }, 400, c); }
  const str = (k: string, max = 500) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');

  if (str('_honeypot')) return json({ success: true }, 200, c);
  const ts = typeof body._ts === 'number' ? body._ts : 0;
  if (ts && Date.now() - ts < MIN_FORM_AGE_MS) return json({ success: true }, 200, c);

  const termine = str('termine', 200);
  const variante = str('variante', 20);
  const tipo = str('tipo', 20);
  const significato = str('significato', 2000);
  const comune = str('comune', 100);
  const esempio = str('esempio', 1000);
  // [10/8] I tre campi che nessuno compilava. Restano facoltativi: nel modulo
  // ora hanno accanto un esempio breve che spiega cosa scriverci, che e' la
  // causa a monte del cento per cento di caselle vuote.
  const categoria = str('categoria', 40);
  const etimologia = str('etimologia', 1500);
  const proverbi = str('proverbi', 1500);
  const nome = str('nome', 100);
  const email = str('email', 200).toLowerCase();  // audit 14/7: lowercase per coerenza con unsubscribe/broadcast (GDPR opt-out)
  const consensoGlossario = body.consenso_glossario === true;
  const consensoMarketing = body.consenso_marketing === true;
  const consensoFirma = body.consenso_firma === true;
  const licenza = body.licenza_accettata === true;
  // [3/8/2026] Prima l'oggetto del client entrava in colonna cosi' com'era:
  // qualunque chiave, qualunque lunghezza. Adesso passano solo i tre campi che
  // servono, con le stesse chiavi usate ovunque nel funnel, ripuliti come gia'
  // fa contact-form. Niente di utile dentro = null, non un oggetto vuoto, che
  // sarebbe rumore travestito da dato.
  let utm: Record<string, string> | null = null;
  if (body.utm && typeof body.utm === 'object') {
    const u = body.utm as Record<string, unknown>;
    const pulisci = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');
    const cand = { source: pulisci(u.source), medium: pulisci(u.medium), campaign: pulisci(u.campaign) };
    if (cand.source || cand.medium || cand.campaign) utm = cand;
  }

  if (termine.length < 1) return json({ error: 'Scrivi il termine o la frase.' }, 400, c);
  if (!VARIANTI.includes(variante)) return json({ error: 'Scegli una variante valida.' }, 400, c);
  if (!TIPI.includes(tipo)) return json({ error: 'Scegli il tipo (parola, frase o espressione).' }, 400, c);
  if (significato.length < 2) return json({ error: 'Scrivi che cosa vuol dire in italiano.' }, 400, c);
  if (!spiegata(significato, esempio)) {
    return json({
      error: 'Manca la spiegazione, e ci sono due modi per darla: una riga che spieghi la cosa («il pipistrello, che d’estate esce al tramonto dai fienili» invece di «pipistrello»), oppure, per le parole che una perifrasi non spiega come «abbastanza», una frase d’esempio in cui la parola compare.',
    }, 400, c);
  }
  if (comune.length < 2) return json({ error: 'Dicci in che paese si dice: una parola senza il luogo perde metà del suo valore.' }, 400, c);
  if (categoria && !CATEGORIE.includes(categoria)) return json({ error: 'Categoria grammaticale non valida.' }, 400, c);
  if (nome.length < 2) return json({ error: 'Inserisci il tuo nome.' }, 400, c);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email non valida.' }, 400, c);
  if (!consensoGlossario) return json({ error: 'Serve il consenso all’uso del contributo nel glossario.' }, 400, c);
  if (!licenza) return json({ error: 'Serve accettare la licenza del contributo.' }, 400, c);

  // upsert contributore (per email); doppio opt-in marketing con token
  //
  // [2/9/2026] IL TOKEN NON SI RIGENERA PIU' A OGNI INVIO.
  //
  // Prima ogni lemma proposto dalla stessa email creava un marketing_token
  // nuovo: chi aveva gia' ricevuto la mail di conferma e cliccava il link
  // vecchio si vedeva `link_non_valido`, perche' in tabella il token era gia'
  // cambiato. Ora si legge il contributore esistente PRIMA di scrivere, e il
  // token si genera solo se non ce n'e' gia' uno.
  const { data: contribEsistente } = await supabase.from('guardiani_contributori')
    .select('id, marketing_token, marketing_double_optin, marketing_invitato_il')
    .eq('email', email).maybeSingle();
  let marketingToken: string | null = contribEsistente?.marketing_token ?? null;
  if (consensoMarketing && !marketingToken) marketingToken = crypto.randomUUID().replace(/-/g, '');

  const { data: contrib, error: errC } = await supabase.from('guardiani_contributori')
    .upsert({
      nome, email, consenso_glossario: true, consenso_marketing: consensoMarketing,
      consenso_firma: consensoFirma, licenza_accettata: true, licenza_tipo: 'CC BY 4.0',
      ...(marketingToken ? { marketing_token: marketingToken } : {}),
      sorgente_utm: { ...(utm || {}), informativa_versione: INFORMATIVA_VERSIONE }, updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })
    .select('id, marketing_double_optin, marketing_token').single();
  if (errC || !contrib) { console.error('[guardiani] upsert contributore:', errC); return json({ error: 'Errore interno, riprova.' }, 500, c); }

  const { data: lemma, error: errL } = await supabase.from('dizionario_lemma')
    .insert({
      lemma: termine, parlata: variante, tipo, definizione: significato,
      comune: comune || null, esempi_uso: esempio || null,
      categoria_gramm: categoria || null,
      etimologia: etimologia || null, proverbi: proverbi || null,
      stato: 'in_revisione', contributore_id: contrib.id, sorgente_utm: utm,
    }).select('id').single();
  if (errL || !lemma) { console.error('[guardiani] insert lemma:', errL); return json({ error: 'Errore interno, riprova.' }, 500, c); }

  // [10/8] IL PAESE CHE NON C'E' ANCORA NELL'ELENCO.
  //
  // Nel modulo il paese e' una scelta, ma con la possibilita' di scriverne uno
  // nuovo: chi propone una parola non deve dover indovinare come si scrive il
  // nome della sua frazione, e non deve nemmeno rinunciare se la sua non c'e'.
  // Il valore nuovo entra nel vocabolario come «proposto», cioe' invisibile nel
  // modulo finche' un curatore non lo rende attivo. Cosi' l'elenco cresce senza
  // riempirsi di refusi.
  if (comune) {
    const { data: gia } = await supabase.from('vocabolario_voce')
      .select('id').eq('dominio', 'comune').eq('valore', comune).maybeSingle();
    if (!gia) {
      await supabase.from('vocabolario_voce').insert({
        dominio: 'comune', valore: comune, stato: 'proposto',
        proposto_da: nome, nota: 'arrivato dal modulo pubblico',
      });
    }
  }

  // [6/8/2026] L'avviso per SINGOLO lemma e' stato spento: il 6 agosto sono
  // arrivati 32 termini da cinque persone, 23 dei quali da Simone in una sola
  // seduta, e il sistema trattava un lavoro fatto in blocco come 23 eventi
  // separati (23 mail e 23 messaggi nel gruppo). Ora il riepilogo lo fa
  // `guardiani-digest`, una volta al giorno e solo se e' arrivato qualcosa.
  //
  // La chiamata resta scritta qui, non cancellata, e resta governata dal toggle
  // `telegram_notifica.guardiani_lemma` che ora e' spento: riaccenderlo
  // ripristina il vecchio comportamento con un UPDATE, senza un deploy.
  // Il problema non e' che arriva troppa roba: e' che l'avviso era dimensionato
  // per otto lemmi al mese. Si allarga la porta, non si stringe il rubinetto.
  notificaDirettivo(supabase, 'guardiani_lemma', {
    lemma: termine, variante: VARIANTE_LABEL[variante] ?? variante,
  }).catch(() => {});

  // [6/8/2026] LA MAIL PER SINGOLO TERMINE E' SPENTA. Era il fastidio vero: 23
  // contributi di Simone in una seduta = 23 mail nella casella. Ora il riepilogo
  // lo fa `guardiani-digest` una volta al giorno, e porta DENTRO di se' i link
  // valida/rifiuta di ogni lemma: nessuna maniglia si perde per strada.
  //
  // Il blocco resta qui intero, spento da un interruttore e non cancellato:
  // basta impostare il secret GUARDIANI_MAIL_PER_LEMMA=true per riaverlo, senza
  // rimettere mano al codice. Il giorno che i contributi tornassero rari, la
  // mail immediata sarebbe di nuovo la cosa giusta.
  const mailPerLemma = Deno.env.get('GUARDIANI_MAIL_PER_LEMMA') === 'true';
  if (adminSecret && mailPerLemma) {
    const exp = Date.now() + TOKEN_TTL_MS;
    const tV = await firmaToken(adminSecret, 'guardiani-valida', lemma.id, exp);
    const tR = await firmaToken(adminSecret, 'guardiani-rifiuta', lemma.id, exp);
    // Link alla pagina di curatela su elbrenz.eu (renderizza HTML; chiama
    // l'edge in JSON). Token HMAC nel PATH (non in query: si corrompe in
    // quoted-printable delle email).
    const base = 'https://elbrenz.eu/guardiani-curatela';
    await inviaEmail(RECIPIENT, `[GUARDIANI] «${termine}» (${variante}) da ${nome}`,
      `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
        <div style="background:#fff;padding:28px;border-radius:8px;border-top:4px solid #C8923E;">
          <h1 style="font-size:19px;color:#1E2E26;margin:0 0 4px;">Nuovo contributo al glossario</h1>
          <p style="color:#666;font-size:13px;margin:0 0 16px;">Guardiani de la lenga · da validare</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#8a6215;width:120px;">Termine</td><td style="padding:6px 0;"><strong>${esc(termine)}</strong> (${esc(tipo)})</td></tr>
            <tr><td style="padding:6px 0;color:#8a6215;">Variante</td><td style="padding:6px 0;">${esc(VARIANTE_LABEL[variante] ?? variante)}</td></tr>
            <tr><td style="padding:6px 0;color:#8a6215;">Significato</td><td style="padding:6px 0;">${esc(significato)}</td></tr>
            ${comune ? `<tr><td style="padding:6px 0;color:#8a6215;">Paese</td><td style="padding:6px 0;">${esc(comune)}</td></tr>` : ''}
            ${esempio ? `<tr><td style="padding:6px 0;color:#8a6215;">Esempio</td><td style="padding:6px 0;">${esc(esempio)}</td></tr>` : ''}
            <tr><td style="padding:6px 0;color:#8a6215;">Contributore</td><td style="padding:6px 0;">${esc(nome)} · ${esc(email)}${consensoFirma ? ' · <em>firma pubblica ok</em>' : ' · anonimo nel glossario'}</td></tr>
          </table>
          <div style="margin-top:20px;text-align:center;">
            <a href="${base}/valida/${lemma.id}/${exp}/${tV}" style="display:inline-block;background:#2d8659;color:#fff;padding:11px 26px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px 8px;">✓ Valida e pubblica</a>
            <a href="${base}/rifiuta/${lemma.id}/${exp}/${tR}" style="display:inline-block;background:#fff;color:#a33;border:2px solid #d97a7a;padding:9px 24px;text-decoration:none;font-weight:600;font-size:14px;border-radius:4px;margin:0 6px 8px;">✗ Rifiuta</a>
          </div>
          <p style="color:#999;font-size:11px;text-align:center;">Con conferma in pagina · link validi 30 giorni</p>
        </div></body></html>`, email);
  }

  // cortesia al contributore (ha consenso_glossario)
  await inviaEmail(email, 'Grazie: il tuo contributo al glossario ladino · El Brenz',
    `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#F8F1E4;">
      <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
        <table role="presentation"><tr><td style="width:56px;"><img src="${LOGO_URL}" width="46" height="46" alt="El Brenz" style="border-radius:50%;display:block;"/></td>
        <td><h1 style="font-family:Georgia,serif;font-size:20px;margin:0;color:#1E2E26;">Grazie, ${esc(nome)}!</h1></td></tr></table>
        <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:18px 0 0;">Hai proposto <strong>«${esc(termine)}»</strong> per il glossario del ladino anaunico. Un curatore lo controlla e, appena validato, entrerà nel glossario vivo dei <em>Guardiani de la lenga</em>.</p>
        <p style="color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:16px 0 0;">Raìs fonde no le ’nglacia</p>
        <p style="color:#999;font-size:11px;margin:12px 0 0;">Associazione El Brenz · info@elbrenz.eu</p>
      </div></body></html>`);

  // double opt-in newsletter (solo se ha chiesto il marketing)
  //
  // [2/9/2026] TRE CANCELLI, NON UNO.
  //
  // Chi ha gia' confermato (marketing_double_optin=true) non deve ricevere
  // piu' nulla: prima si guardava solo `consensoMarketing && marketingToken`,
  // mai lo stato di conferma gia' letto dall'upsert poche righe sopra. Chi
  // non ha ancora confermato riceve al massimo un promemoria al mese, non uno
  // per ogni lemma: si guarda `marketing_invitato_il` del contributore letto
  // PRIMA della scrittura (`contribEsistente`, sopra) e si aspettano 30 giorni.
  const giaConfermato = contrib.marketing_double_optin === true;
  const ultimoInvito = contribEsistente?.marketing_invitato_il
    ? new Date(contribEsistente.marketing_invitato_il as string).getTime() : 0;
  const giorniDaUltimoInvito = (Date.now() - ultimoInvito) / (1000 * 60 * 60 * 24);
  const devoInvitareMarketing = consensoMarketing && marketingToken && !giaConfermato && giorniDaUltimoInvito >= 30;

  if (devoInvitareMarketing) {
    // Il link punta alla pagina sul NOSTRO dominio (che chiama l'edge in JSON):
    // piu' rassicurante di un URL supabase.co in una mail, e niente sorgente a
    // schermo. Il vecchio indirizzo dell'edge resta valido e rimanda qui.
    const link = `${SITO}/guardiani/conferma/${contrib.id}/${marketingToken}`;
    await inviaEmail(email, 'Conferma la tua iscrizione · El Brenz',
      `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#F8F1E4;">
        <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
          <h1 style="font-family:Georgia,serif;font-size:20px;margin:0 0 8px;color:#1E2E26;">Un ultimo passo</h1>
          <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0;">Per ricevere gli aggiornamenti sul glossario e sui progetti della lingua, conferma la tua iscrizione:</p>
          <p style="text-align:center;margin:22px 0;"><a href="${link}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:12px 26px;text-decoration:none;font-weight:600;font-size:15px;border-radius:4px;">Conferma l’iscrizione</a></p>
          <p style="color:#999;font-size:12px;margin:0;">Se non l’hai richiesta tu, ignora questa email: senza conferma non riceverai nulla.</p>
        </div></body></html>`);
    await supabase.from('guardiani_contributori')
      .update({ marketing_invitato_il: new Date().toISOString() }).eq('id', contrib.id);
  }

  // [10/8] Si restituisce l'identificativo del lemma perche' subito dopo la
  // pagina puo' mandare la VOCE con `glossario-audio`: e' un lemma appena
  // proposto e non ancora pubblico, quindi non rivela niente a nessuno.
  //
  // E si restituiscono i punti veri. Il popup diceva «venticinque per ogni
  // parola» leggendo un campo che questa funzione non ha mai mandato: dal
  // 10/8 i valori stanno in configurazione (una parola secca vale meno, una
  // parola fatta bene molte volte tanto) e una cifra inventata in pagina
  // sarebbe una promessa che nessuno mantiene.
  let punti: Record<string, unknown> | null = null;
  try {
    const { data: cfg } = await supabase.from('config_app')
      .select('valore').eq('chiave', 'glossario_punti').maybeSingle();
    const { count } = await supabase.from('dizionario_lemma')
      .select('id', { count: 'exact', head: true })
      .eq('contributore_id', contrib.id).eq('stato', 'pubblicato');
    const v = (cfg?.valore ?? {}) as Record<string, number>;
    punti = {
      lemmi_pubblicati: count ?? 0,
      per_parola: v.lemma_secco ?? 5,
      per_parola_completa: v.lemma_completo ?? 22,
      per_voce: v.lemma_audio ?? 150,
    };
  } catch { /* il punteggio e' un di piu': non deve far fallire l'invio */ }

  return json({ success: true, lemma_id: lemma.id, punti }, 200, c);
});
