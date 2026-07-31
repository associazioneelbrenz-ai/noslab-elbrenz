// _shared/radarFonti.ts — le fonti aperte del Radar eventi e il loro parser.
//
// SCOPERTA DEL 31/7/2026, sondando le API vere (non la documentazione):
// i dataset "Eventi del ..." su dati.trentino.it non sono file scaricabili, sono
// PUNTATORI alla stessa API ComunWeb esposta dai portali delle Comunita' di
// valle. Quindi un solo parser copre entrambe le fonti del brief. La distinzione
// `fonte` resta in tabella perche' distingue la provenienza, non il formato.
//
// L'endpoint giusto NON e' /classes/event (quello torna lo SCHEMA della classe,
// 21 KB identici per ogni comune: ci si casca facilmente) ma
//   /api/opendata/v2/content/search/<query urlencoded>
// con query in linguaggio OpenCity, es.
//   classes 'event' sort [published=>desc] limit '100' offset '0'
// Il sort per data di pubblicazione e' cio' che rende sensata una raccolta
// notturna: le novita' stanno in cima e non serve rileggere tutto l'archivio.
//
// La lista dei portali e' stata verificata uno per uno il 31/7/2026: accanto a
// ogni voce c'e' il numero di eventi presenti quel giorno. Le voci che non
// rispondono restano in lista con la nota: un buco documentato vale piu' di un
// buco silenzioso, e l'harvest riporta comunque l'esito per fonte.

export const USER_AGENT =
  'ElBrenzAPS-RadarEventi/1.0 (+https://elbrenz.eu; associazione.elbrenz@gmail.com)';

export type Valle = 'non' | 'sole' | 'rabbi' | 'pejo';

export interface Portale {
  host: string;
  comune: string;
  valle: Valle;
  fonte: 'comunweb' | 'dati_trentino';
}

// Comuni delle quattro valli. I numeri fra parentesi sono gli eventi in archivio
// al 31/7/2026, utili per capire quale portale e' vivo e quale e' una vetrina.
export const PORTALI: Portale[] = [
  // --- Val di Non ---
  { host: 'www.comune.cles.tn.it',           comune: 'Cles',              valle: 'non', fonte: 'comunweb' }, // 531
  { host: 'www.comune.denno.tn.it',          comune: 'Denno',             valle: 'non', fonte: 'comunweb' }, // 222
  { host: 'www.comune.novella.tn.it',        comune: 'Novella',           valle: 'non', fonte: 'comunweb' }, // 125
  { host: 'www.comune.borgodanaunia.tn.it',  comune: "Borgo d'Anaunia",   valle: 'non', fonte: 'comunweb' }, // 104
  { host: 'www.comune.villedanaunia.tn.it',  comune: "Ville d'Anaunia",   valle: 'non', fonte: 'comunweb' }, // 66
  { host: 'www.comune.cavareno.tn.it',       comune: 'Cavareno',          valle: 'non', fonte: 'comunweb' }, // 46
  { host: 'www.comune.rumo.tn.it',           comune: 'Rumo',              valle: 'non', fonte: 'comunweb' }, // 31
  { host: 'www.comune.bresimo.tn.it',        comune: 'Bresimo',           valle: 'non', fonte: 'comunweb' }, // 22
  { host: 'www.comune.sarnonico.tn.it',      comune: 'Sarnonico',         valle: 'non', fonte: 'comunweb' }, // 14
  { host: 'www.comune.conta.tn.it',          comune: 'Contà',             valle: 'non', fonte: 'comunweb' }, // 13
  { host: 'www.comune.romeno.tn.it',         comune: 'Romeno',            valle: 'non', fonte: 'comunweb' }, // 13
  { host: 'www.comune.sanzeno.tn.it',        comune: 'Sanzeno',           valle: 'non', fonte: 'comunweb' }, // 12
  { host: 'www.comune.sporminore.tn.it',     comune: 'Sporminore',        valle: 'non', fonte: 'comunweb' }, // 8
  { host: 'www.comune.predaia.tn.it',        comune: 'Predaia',           valle: 'non', fonte: 'comunweb' }, // 6
  { host: 'www.comune.ronzone.tn.it',        comune: 'Ronzone',           valle: 'non', fonte: 'comunweb' }, // 6
  { host: 'www.comune.livo.tn.it',           comune: 'Livo',              valle: 'non', fonte: 'comunweb' }, // 6
  { host: 'www.comune.ton.tn.it',            comune: 'Ton',               valle: 'non', fonte: 'comunweb' }, // 4
  { host: 'www.comune.cis.tn.it',            comune: 'Cis',               valle: 'non', fonte: 'comunweb' }, // 3
  { host: 'www.comune.sfruz.tn.it',          comune: 'Sfruz',             valle: 'non', fonte: 'comunweb' }, // 3
  { host: 'www.comune.amblardon.tn.it',      comune: 'Amblar-Don',        valle: 'non', fonte: 'comunweb' }, // 0, portale vuoto
  // Ruffre'-Mendola: il DNS risolve ma il TLS non completa (verificato 31/7/2026).
  // Lasciato in lista: se il comune sistema il certificato entra da solo.
  { host: 'comune.ruffremendola.tn.it',      comune: 'Ruffrè-Mendola',    valle: 'non', fonte: 'comunweb' },

  // --- Val di Sole ---
  { host: 'www.comune.ossana.tn.it',         comune: 'Ossana',            valle: 'sole', fonte: 'comunweb' }, // 53
  { host: 'www.comune.mezzana.tn.it',        comune: 'Mezzana',           valle: 'sole', fonte: 'comunweb' }, // 39
  { host: 'www.comune.caldes.tn.it',         comune: 'Caldes',            valle: 'sole', fonte: 'comunweb' }, // 38
  { host: 'www.comune.dimarofolgarida.tn.it',comune: 'Dimaro Folgarida',  valle: 'sole', fonte: 'comunweb' }, // 24
  { host: 'www.comune.pellizzano.tn.it',     comune: 'Pellizzano',        valle: 'sole', fonte: 'comunweb' }, // 18
  { host: 'www.comune.vermiglio.tn.it',      comune: 'Vermiglio',         valle: 'sole', fonte: 'comunweb' }, // 9
  { host: 'www.comune.terzolas.tn.it',       comune: 'Terzolas',          valle: 'sole', fonte: 'comunweb' }, // 9
  { host: 'www.comune.male.tn.it',           comune: 'Malé',              valle: 'sole', fonte: 'comunweb' }, // 7
  { host: 'www.comune.croviana.tn.it',       comune: 'Croviana',          valle: 'sole', fonte: 'comunweb' }, // 7
  { host: 'www.comune.cavizzana.tn.it',      comune: 'Cavizzana',         valle: 'sole', fonte: 'comunweb' }, // 5
  { host: 'www.comune.commezzadura.tn.it',   comune: 'Commezzadura',      valle: 'sole', fonte: 'comunweb' }, // 2

  // --- Val di Rabbi e Val di Pejo ---
  { host: 'www.comune.rabbi.tn.it',          comune: 'Rabbi',             valle: 'rabbi', fonte: 'comunweb' }, // 4
  { host: 'www.comune.peio.tn.it',           comune: 'Peio',              valle: 'pejo',  fonte: 'comunweb' }, // 42

  // --- Comunita' di valle: sono i dataset "eventi" di dati.trentino.it ---
  { host: 'www.comunitavalledisole.tn.it',   comune: 'Comunità della Valle di Sole', valle: 'sole', fonte: 'dati_trentino' }, // 43
  { host: 'www.comunitavaldinon.tn.it',      comune: 'Comunità della Val di Non',    valle: 'non',  fonte: 'dati_trentino' }, // 1
];

/** Evento normalizzato, pronto per l'insert in eventi_esterni. */
export interface EventoGrezzo {
  fonte: string;
  fonte_id: string | null;
  url_fonte: string | null;
  titolo: string;
  descrizione: string | null;
  data_inizio: string;         // YYYY-MM-DD
  data_fine: string | null;
  ricorrenza: string | null;
  ora_inizio: string | null;   // HH:MM
  ora_fine: string | null;
  luogo: string | null;
  comune: string;
  valle: Valle;
  organizzatore: string | null;
  contatti: string | null;
  prezzo: 'gratuito' | 'pagamento' | 'offerta' | 'nd';
  hash_dedup: string;
  /** date esplose della ricorrenza, per eventi_esterni_date */
  date_ricorrenza: { data: string; annullata: boolean }[];
}

/** Toglie i tag HTML e normalizza gli spazi. Le fonti scrivono in HTML. */
export function stripHtml(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizzazione per il dedup: minuscole, niente accenti, niente punteggiatura. */
export function normalizzaTitolo(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** sha256(titolo normalizzato | data_inizio | comune) in esadecimale. */
export async function hashDedup(titolo: string, dataInizio: string, comune: string): Promise<string> {
  const base = `${normalizzaTitolo(titolo)}|${dataInizio}|${normalizzaTitolo(comune)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const soloData = (iso: unknown): string | null =>
  typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : null;
const soloOra = (iso: unknown): string | null =>
  typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : null;

/**
 * Converte un searchHit ComunWeb in EventoGrezzo. Torna null se manca il minimo
 * indispensabile (titolo o data di inizio): meglio saltare una riga che
 * inventarle un titolo.
 */
export async function daSearchHit(hit: any, portale: Portale): Promise<EventoGrezzo | null> {
  const meta = hit?.metadata ?? {};
  const d = hit?.data?.['ita-IT'] ?? {};
  const extra = hit?.extradata?.['ita-IT'] ?? {};

  const titolo = stripHtml(d.event_title || meta?.name?.['ita-IT'] || '').slice(0, 300);
  if (!titolo) return null;

  const ti = d.time_interval ?? {};
  const input = ti.input ?? {};
  const ricorrenze: any[] = Array.isArray(ti.recurrences) ? ti.recurrences : [];

  const dataInizio = soloData(input.startDateTime) ?? soloData(ricorrenze[0]?.start);
  if (!dataInizio) return null;

  // data_fine: la fine dell'ultima ricorrenza se c'e', altrimenti endDateTime.
  const ultima = ricorrenze.length ? ricorrenze[ricorrenze.length - 1] : null;
  const dataFine = soloData(ultima?.end) ?? soloData(input.endDateTime);

  const descrizione =
    [stripHtml(d.event_abstract), stripHtml(d.description)]
      .filter(Boolean).join(' · ').slice(0, 4000) || null;

  const luoghi = Array.isArray(d.takes_place_in)
    ? d.takes_place_in.map((p: any) => p?.name?.['ita-IT']).filter(Boolean)
    : [];

  const organizzatori = Array.isArray(d.organizer)
    ? d.organizer.map((o: any) => o?.name?.['ita-IT']).filter(Boolean)
    : [];
  const organizzatore =
    (organizzatori.join(', ') || stripHtml(d.organizer_text) || '').slice(0, 300) || null;

  // is_accessible_for_free e' 1/0. Senza il dato NON si tira a indovinare: 'nd'.
  const gratis = d.is_accessible_for_free;
  const prezzo: EventoGrezzo['prezzo'] =
    gratis === 1 || gratis === true ? 'gratuito'
    : gratis === 0 || gratis === false ? 'pagamento'
    : 'nd';

  const urlAlias = typeof extra.urlAlias === 'string' ? extra.urlAlias : null;
  const urlFonte = urlAlias ? `https://${portale.host}${urlAlias}` : (meta.link ?? null);

  // Le ricorrenze arrivano gia' esplose dalla fonte: le teniamo tutte, cosi' la
  // curatela vede le repliche senza doverle dedurre dal testo.
  const dateRicorrenza = ricorrenze
    .map((r) => soloData(r?.start))
    .filter((x): x is string => !!x)
    .slice(0, 200)
    .map((data) => ({ data, annullata: false }));

  return {
    fonte: portale.fonte,
    fonte_id: meta.remoteId ? String(meta.remoteId) : (meta.id ? String(meta.id) : null),
    url_fonte: urlFonte,
    titolo,
    descrizione,
    data_inizio: dataInizio,
    data_fine: dataFine && dataFine !== dataInizio ? dataFine : null,
    ricorrenza: typeof ti.text === 'string' && ricorrenze.length > 1 ? ti.text : null,
    ora_inizio: soloOra(input.startDateTime) ?? soloOra(ricorrenze[0]?.start),
    ora_fine: soloOra(input.endDateTime) ?? soloOra(ricorrenze[0]?.end),
    luogo: luoghi.join(', ').slice(0, 300) || null,
    comune: portale.comune,
    valle: portale.valle,
    organizzatore,
    contatti: stripHtml(d.has_online_contact_point_as_text).slice(0, 300) || null,
    prezzo,
    hash_dedup: await hashDedup(titolo, dataInizio, portale.comune),
    date_ricorrenza: dateRicorrenza,
  };
}

/**
 * Scarica gli eventi piu' recenti di un portale, ordinati per data di
 * pubblicazione decrescente.
 *
 * LIMITE VERO DELLA FONTE, misurato il 31/7/2026 e non documentato da nessuna
 * parte: il server restituisce al massimo **10 risultati** per chiamata,
 * qualunque cosa si scriva in `limit`, e **ignora `offset`** (offset 0, 10 e 20
 * tornano identici). Non esiste quindi una vera paginazione su questo endpoint.
 *
 * Conseguenza di progetto: la copertura non la garantisce la profondita' di una
 * singola lettura, la garantisce la CADENZA. Con il sort per data di
 * pubblicazione, la lettura notturna prende le ultime 10 novita' di ogni
 * portale: i comuni delle valli ne pubblicano molte meno in un giorno, quindi
 * il margine e' ampio. Se un portale dovesse pubblicare piu' di 10 eventi fra
 * due esecuzioni, i piu' vecchi di quella infornata si perdono: e' il motivo
 * per cui la frequenza giornaliera non e' negoziabile al ribasso.
 */
export async function scaricaPortale(
  portale: Portale,
  limite = 10,
  timeoutMs = 20000,
): Promise<{ hits: any[]; totale: number }> {
  const query = `classes 'event' sort [published=>desc] limit '${limite}' offset '0'`;
  const url = `https://${portale.host}/api/opendata/v2/content/search/${encodeURIComponent(query)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return { hits: Array.isArray(body?.searchHits) ? body.searchHits : [], totale: body?.totalCount ?? 0 };
  } finally {
    clearTimeout(timer);
  }
}
