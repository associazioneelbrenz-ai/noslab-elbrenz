// radar-eventi-classifica — dà un punteggio di rilevanza agli eventi 'grezzo'
// e li porta in coda di curatela. BLOCCO 2, superbrief 30/7/2026.
//
// COME RAGIONA, in due tempi:
//
// 1. PRE-FILTRO DETERMINISTICO (le liste di keyword qui sotto). Derivano da un
//    filtro manuale vero: 50 pagine del pieghevole APT Val di Sole di agosto
//    2026, circa 300 voci, 15 utili. Un segnale negativo esclude da solo e
//    l'evento non arriva nemmeno al modello: non si pagano token per una
//    lezione di zumba.
// 2. CLAUDE HAIKU, solo su cio' che è sopravvissuto al pre-filtro, per il
//    punteggio fine, il pilastro editoriale e la motivazione.
//
// Il punteggio deterministico fa da PAVIMENTO, ma solo quello ricavato
// dall'IDENTITA' dell'evento (titolo, luogo, organizzatore): il modello puo'
// alzarlo, mai scendere sotto. Cio' che sta nella sola descrizione non vincola,
// perche' i portali comunali usano descrizioni "a blocco" che elencano tutte le
// attivita' della settimana. Vedi la nota lunga su preFiltro().
// Tutti i numeri restano in motivo_punteggio per la taratura.
//
// AMBIGUI: mai decisi in automatico. Chi nomina il "dialetto" prende il flag
// nota_lingua (il contenuto puo' essere ottimo: la fonte usa la sua parola, noi
// useremo "ladino anaunico" nei NOSTRI testi, senza correggere l'APT in
// pubblico). Le rievocazioni spettacolari prendono accuratezza_da_verificare:
// valgono come segnalazione in agenda, non come storia certificata.
//
// SICUREZZA: gate header `x-ingest-token` == INGEST_TOKEN. verify_jwt=false
// dichiarato in config.toml. Mai pubblica.
//
// MODALITA':
//   POST                -> classifica il lotto di 'grezzo'
//   POST ?dryrun=1      -> calcola e riporta, senza scrivere
//   POST ?digest=1      -> NON classifica: manda al direttivo il digest
//                          settimanale dei candidati sopra soglia (GATE 3)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

const MODELLO = 'claude-haiku-4-5-20251001';
const SOGLIA_PROPOSTO = 60;   // >= 60 va in coda curatore (GATE 2, confermato)
const SOGLIA_MINIMA = 30;     // 30-59 entra comunque, con flag bassa_priorita
const LOTTO_MAX = 40;         // eventi classificati per invocazione
const PAUSA_MS = 250;         // fra una chiamata e l'altra, per non forzare il rate limit

// --- Segnali forti: +30 ciascuno, cumulabili fino a 100 -------------------
const FORTI = [
  'segheria veneziana', 'segheria', 'mulino', 'molino', 'forno', 'paneti',
  'pan de na volta', 'caseificio turnario', 'casel', 'filatura', 'tessitura',
  'ecomuseo', 'maso', 'masi', 'utensili', 'catasto', 'tavolare',
  'libro fondiario', 'trincee', 'trincea', 'grande guerra', 'forte',
  'schützen', 'schutzen', 'arciduca', 'arciduchessa', 'asburgico',
  'asburgica', 'maria teresa', 'tirolo', 'rievocazione storica',
  'civiltà solandra', 'civilta solandra', 'museo etnografico',
  'archivio storico', 'documentario etnografico', 'transumanza', 'pastori',
  'leggende locali', 'leggenda', 'nones', 'solander', 'rabies', 'pegaés',
  'pegaes', 'ladino',
];

// --- Segnali medi: +15 ----------------------------------------------------
const MEDI = [
  'castello', 'visita guidata', 'chiesa', 'mostra', 'corpo bandistico',
  'banda', 'coro', 'sagra', 'processione', 'rancio', 'usanza', 'tradizione',
];

// --- Segnali negativi: -40, escludono da soli -----------------------------
const NEGATIVI = [
  'yoga', 'pilates', 'zumba', 'fitness', 'barefooting', 'aromaterapia',
  'baby dance', 'baby disco', 'magic show', 'bolle di sapone',
  'caccia al tesoro', 'e-bike', 'ebike', 'mountain bike', 'rafting',
  'canyoning', 'minigolf', 'bike park', 'dj set', 'aperitivo', 'miss italia',
  'uci mtb', 'tribute', 'cover band',
];

// --- Ambigui: alzano un flag, non decidono --------------------------------
const AMBIGUI_LINGUA = ['dialetto', 'vernacolo'];
const AMBIGUI_SPETTACOLO = [
  'medievale', 'medioevo', 'rievocazione', 'corteo storico', 'giochi storici',
];

const PILASTRI = [
  '1 Storia delle Valli', '2 Lingua e ladinità', '3 Cultura materiale',
  '4 Rievocazioni ed eventi', '5 Identità e appartenenza', '6 Vita associativa',
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Normalizza per il confronto: minuscole, via gli accenti, ogni carattere non
 * alfanumerico diventa spazio, e il risultato viene incorniciato di spazi.
 * Cosi' `contiene()` puo' cercare ` parola ` e ottenere un confronto per PAROLA
 * INTERA senza scrivere regex (che con ü di «Schützen» e é di «pegaés» darebbero
 * confini di parola sbagliati).
 */
function normalizza(s: string): string {
  return ' ' + s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + ' ';
}

const contiene = (testo: string, chiave: string) => testo.includes(normalizza(chiave));

interface PreFiltro {
  /** Pavimento: solo i segnali nell'identita' dell'evento. Il modello non lo abbassa. */
  punteggio: number;
  /** Indicativo: tutti i segnali, descrizione compresa. Solo per l'audit. */
  punteggio_testo: number;
  forti: string[];
  forti_titolo: string[];
  medi: string[];
  negativi: string[];
  flag: string[];
}

/**
 * DUE LETTURE, e la distinzione e' il cuore della taratura del 31/7/2026.
 *
 * I portali comunali pubblicano spesso una descrizione "a blocco": un'unica
 * scheda che elenca tutte le attivita' della settimana. Il collaudo su dati veri
 * ha mostrato l'effetto: «Cles Estate - 7 agosto» prendeva 90 punti perche' nel
 * blocco comparivano parole forti, mentre «Cles Estate - 6 agosto» veniva
 * escluso perche' nello STESSO blocco c'erano pilates e baby dance. Il testo
 * della descrizione non descrive quel singolo evento.
 *
 * Quindi:
 * - IDENTITA' (titolo, luogo, organizzatore) -> fa punteggio e fa da pavimento.
 *   Un titolo che nomina un mulino e' un mulino, e il modello non puo' smentirlo.
 * - DESCRIZIONE -> concorre solo al punteggio indicativo e ai flag. Non vincola
 *   il modello, che il testo lo legge davvero.
 *
 * Stessa logica sui negativi: un negativo esclude da solo, MA non se l'identita'
 * dell'evento porta gia' un segnale forte. Altrimenti «Riapertura del Mulino
 * Bertagnolli, con aperitivo» morirebbe per la parola aperitivo.
 */
function preFiltro(ev: Record<string, any>): PreFiltro {
  const identita = normalizza([ev.titolo, ev.luogo, ev.organizzatore].filter(Boolean).join(' '));
  const tutto = normalizza([ev.titolo, ev.luogo, ev.organizzatore, ev.descrizione].filter(Boolean).join(' '));

  const fortiTitolo = FORTI.filter((k) => contiene(identita, k));
  const mediTitolo = MEDI.filter((k) => contiene(identita, k));
  const forti = FORTI.filter((k) => contiene(tutto, k));
  const medi = MEDI.filter((k) => contiene(tutto, k));
  const negativi = NEGATIVI.filter((k) => contiene(tutto, k));

  const flag: string[] = [];
  if (AMBIGUI_LINGUA.some((k) => contiene(tutto, k))) flag.push('nota_lingua');
  if (AMBIGUI_SPETTACOLO.some((k) => contiene(tutto, k))) flag.push('accuratezza_da_verificare');

  const pavimento = Math.min(100, fortiTitolo.length * 30 + mediTitolo.length * 15);
  const indicativo = Math.min(100, forti.length * 30 + medi.length * 15);

  // Il negativo esclude, tranne quando l'identita' dell'evento dice il contrario.
  const escludiPerNegativo = negativi.length > 0 && pavimento === 0;

  return {
    punteggio: escludiPerNegativo ? 0 : pavimento,
    punteggio_testo: escludiPerNegativo ? 0 : indicativo,
    forti, forti_titolo: fortiTitolo, medi,
    negativi: escludiPerNegativo ? negativi : [],
    flag,
  };
}

/** L'organizzatore (o un co-organizzatore) è nella lista dei segnalati? */
function escluso(ev: Record<string, any>, patterns: string[]): string | null {
  const campo = `${ev.organizzatore ?? ''} ${ev.titolo ?? ''}`.toLowerCase();
  return patterns.find((p) => campo.includes(p)) ?? null;
}

// Schema della risposta del modello. Niente vincoli numerici: gli output
// strutturati non li supportano, quindi il clamp lo facciamo noi qui sotto.
const SCHEMA = {
  type: 'object',
  properties: {
    punteggio: { type: 'integer', description: 'Rilevanza 0-100 per una associazione di storia e lingua locale delle Valli del Noce' },
    pilastro: { type: 'integer', description: 'Pilastro editoriale 1-6' },
    motivazione: { type: 'string', description: 'Una frase, massimo 200 caratteri, sul perché di questo punteggio' },
  },
  required: ['punteggio', 'pilastro', 'motivazione'],
  additionalProperties: false,
};

const SYSTEM = `Sei il documentalista dell'Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo, Trentino).

Valuti quanto un evento del territorio meriti di finire nella nostra agenda pubblica. Ci interessa la storia locale, la lingua ladina anaunica, la cultura materiale (mulini, segherie, forni, caselli, masi, utensili), il Tirolo storico e gli Asburgo, la Grande Guerra, le rievocazioni documentate, i musei etnografici e gli archivi.

NON ci interessano sport, fitness, benessere, animazione per bambini, discoteca, aperitivi, gare ciclistiche, concerti di cover band.

I sei pilastri editoriali:
${PILASTRI.map((p) => `- ${p}`).join('\n')}

Rispondi solo con i dati richiesti. Sii severo: un evento che si svolge in un comune delle valli ma di tema estraneo NON è rilevante, il comune da solo non basta.`;

async function chiediHaiku(
  apiKey: string,
  ev: Record<string, any>,
  pf: PreFiltro,
): Promise<{ punteggio: number; pilastro: number; motivazione: string } | null> {
  const testo = [
    `Titolo: ${ev.titolo}`,
    ev.descrizione ? `Descrizione: ${String(ev.descrizione).slice(0, 1200)}` : null,
    ev.luogo ? `Luogo: ${ev.luogo}` : null,
    `Comune: ${ev.comune}`,
    ev.organizzatore ? `Organizzatore: ${ev.organizzatore}` : null,
    ev.data_inizio ? `Data: ${ev.data_inizio}` : null,
    pf.forti.length ? `Parole chiave forti già rilevate: ${pf.forti.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  // Retry con backoff su 429 e 5xx. Gli altri errori non si ritentano: se la
  // richiesta è malformata, ritentarla resta malformata.
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODELLO,
          max_tokens: 400,
          system: SYSTEM,
          output_config: { format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content: testo }],
        }),
      });
    } catch (e) {
      console.error('[classifica] rete', String(e));
      await attesa(500 * 2 ** tentativo);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const pausa = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * 2 ** tentativo;
      await attesa(Math.min(pausa, 8000));
      continue;
    }

    if (!res.ok) {
      console.error('[classifica] HTTP', res.status, (await res.text()).slice(0, 300));
      return null;
    }

    const body = await res.json();
    if (body?.stop_reason === 'refusal') return null;

    const blocco = (body?.content ?? []).find((b: any) => b?.type === 'text');
    if (!blocco?.text) return null;
    try {
      const out = JSON.parse(blocco.text);
      return {
        punteggio: Math.max(0, Math.min(100, Math.round(Number(out.punteggio) || 0))),
        pilastro: Math.max(1, Math.min(6, Math.round(Number(out.pilastro) || 1))),
        motivazione: String(out.motivazione ?? '').slice(0, 300),
      };
    } catch {
      return null;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const atteso = Deno.env.get('INGEST_TOKEN') ?? '';
  if (!atteso || req.headers.get('x-ingest-token') !== atteso) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  const url = new URL(req.url);
  const dryrun = url.searchParams.get('dryrun') === '1';
  const soloDigest = url.searchParams.get('digest') === '1';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ---- MODALITÀ DIGEST (settimanale, GATE 3) -----------------------------
  if (soloDigest) {
    const oggi = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('eventi_esterni')
      .select('titolo, data_inizio, comune, punteggio')
      .eq('stato', 'proposto')
      .gte('punteggio', SOGLIA_PROPOSTO)
      .gte('data_inizio', oggi)
      .order('punteggio', { ascending: false })
      .limit(12);
    if (error) return json({ error: 'query_fallita', detail: error.message }, 500);

    const righe = (data as any[]) ?? [];
    if (!righe.length) return json({ ok: true, digest: true, candidati: 0, inviato: false });

    if (!dryrun) {
      await notificaDirettivo(supabase, 'radar_digest', {
        totale: righe.length,
        eventi: righe.map((r) => ({
          titolo: r.titolo, data: r.data_inizio, comune: r.comune, punteggio: r.punteggio,
        })),
      });
    }
    return json({ ok: true, digest: true, candidati: righe.length, inviato: !dryrun, anteprima: righe });
  }

  // ---- MODALITÀ CLASSIFICAZIONE ------------------------------------------
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY non configurata' }, 500);

  const { data: esclusiRows } = await supabase
    .from('eventi_organizzatori_esclusi')
    .select('nome_pattern')
    .eq('attivo', true);
  const patterns = ((esclusiRows as any[]) ?? [])
    .map((r) => String(r.nome_pattern ?? '').toLowerCase())
    .filter(Boolean);

  const { data: grezzi, error } = await supabase
    .from('eventi_esterni')
    .select('*')
    .eq('stato', 'grezzo')
    .order('data_inizio', { ascending: true })
    .limit(LOTTO_MAX);
  if (error) return json({ error: 'query_fallita', detail: error.message }, 500);

  const righe = (grezzi as any[]) ?? [];
  const esiti: Record<string, unknown>[] = [];
  let chiamateModello = 0;
  const errori: string[] = [];

  for (const ev of righe) {
    const pf = preFiltro(ev);
    const patternEscluso = escluso(ev, patterns);

    let stato: string;
    let punteggio = pf.punteggio;
    let pilastro: number | null = null;
    let motivazione = '';
    const flag = [...pf.flag];
    let haiku: { punteggio: number; pilastro: number; motivazione: string } | null = null;

    if (pf.negativi.length) {
      // Escluso dal pre-filtro: niente token spesi.
      stato = 'scartato';
      punteggio = 0;
      motivazione = `Escluso dal pre-filtro: ${pf.negativi.join(', ')}`;
    } else {
      haiku = await chiediHaiku(apiKey, ev, pf);
      chiamateModello++;
      if (haiku) {
        // Il deterministico è il pavimento: le keyword non si scavalcano.
        punteggio = Math.max(pf.punteggio, haiku.punteggio);
        pilastro = haiku.pilastro;
        motivazione = haiku.motivazione;
      } else {
        errori.push(`modello non disponibile per «${String(ev.titolo).slice(0, 60)}»`);
        motivazione = 'Punteggio dalle sole parole chiave: il modello non ha risposto.';
      }
      stato = punteggio >= SOGLIA_MINIMA ? 'proposto' : 'scartato';
      if (punteggio >= SOGLIA_MINIMA && punteggio < SOGLIA_PROPOSTO) flag.push('bassa_priorita');
      await attesa(PAUSA_MS);
    }

    // Un organizzatore in lista non e' piu' partner operativo, ma la
    // collaborazione non e' chiusa (decisione di Cristian, 1/8/2026): non
    // blocca piu' l'evento, lo segnala soltanto. Lo stato resta quello che
    // merita il contenuto, e la curatela decide caso per caso.
    if (patternEscluso) flag.push('organizzatore_segnalato');

    const motivo = {
      forti: pf.forti,
      forti_titolo: pf.forti_titolo,
      medi: pf.medi,
      negativi: pf.negativi,
      punteggio_prefiltro: pf.punteggio,        // pavimento, dalla sola identita'
      punteggio_testo: pf.punteggio_testo,      // indicativo, descrizione compresa
      punteggio_modello: haiku?.punteggio ?? null,
      motivazione,
      organizzatore_segnalato: patternEscluso,
      modello: haiku ? MODELLO : null,
    };

    esiti.push({
      id: ev.id, titolo: ev.titolo, comune: ev.comune, data: ev.data_inizio,
      stato, punteggio, pilastro, flag, motivo,
    });

    if (!dryrun) {
      const { error: eU } = await supabase.from('eventi_esterni')
        .update({ stato, punteggio, pilastro, flag, motivo_punteggio: motivo })
        .eq('id', ev.id);
      if (eU) errori.push(`update ${ev.id}: ${eU.message}`);
    }
  }

  // Battito (brief "Il battito dei servizi", 28/8/2026 §3): solo per la
  // classificazione vera, mai per ?digest=1 (non e' il servizio registrato)
  // ne' per un giro a vuoto (?dryrun=1, nessuna scrittura reale avvenuta).
  if (!dryrun) {
    try {
      await supabase.rpc('registra_battito', {
        p_servizio: 'radar-eventi-classifica',
        p_esito: righe.length === 0 ? 'niente_da_fare' : (errori.length > 0 ? 'errore' : 'ok'),
        p_dettaglio: {
          esaminati: righe.length,
          proposti: esiti.filter((e) => e.stato === 'proposto').length,
          scartati: esiti.filter((e) => e.stato === 'scartato').length,
        },
      });
    } catch (_) { /* il battito non deve mai rompere il lavoro */ }
  }

  return json({
    ok: errori.length === 0,
    dryrun,
    esaminati: righe.length,
    chiamate_modello: chiamateModello,
    proposti: esiti.filter((e) => e.stato === 'proposto').length,
    scartati: esiti.filter((e) => e.stato === 'scartato').length,
    non_promuovibili: esiti.filter((e) => e.stato === 'non_promuovibile').length,
    errori,
    esiti,
  });
});
