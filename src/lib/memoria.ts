// Cimiteri di guerra (brief 25/8/2026) — dati letti dalle viste pubbliche
// vere, mai incollati nel file. Il fondo di Malè è pubblicato: niente più
// RPC per la bozza, si legge come qualunque altro contenuto pubblico. Ogni
// numero e ogni nome di luogo viene dal database: se un domani arriva un
// secondo fondo, queste funzioni bastano già.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// Anteprima di condivisione (brief "rifinire", 26/8/2026 §1): il monumento,
// finché un fondo non ha un'immagine propria. Nessuna didascalia finché il
// segretario non conferma dove si trova esattamente e chi l'ha scattata.
// Addendum "Albo dei nomi, incipit, card in home" (26/8/2026 §5.1): la
// fotografia di monumento aveva provenienza e autore non accertati. Da qui
// in avanti l'anteprima è la cianografia del cimitero militare, ritagliata
// a 1200×630 dalla planimetria vera (mai la fotografia raw: quella non è
// nel formato giusto per un'anteprima social).
export const OG_CIMITERI_ORIZZONTALE = `${SUPABASE_URL}/storage/v1/object/public/assets-pubblici/cimiteri-di-guerra/og-cimiteri-di-guerra-cianografia.jpg`;
export const OG_CIMITERI_QUADRATA = `${SUPABASE_URL}/storage/v1/object/public/assets-pubblici/cimiteri-di-guerra/og-cimiteri-di-guerra-quadrata.jpg`;

export function ogImageFondo(fondo: Fondo): string {
  return OG_CIMITERI_ORIZZONTALE;
}

export type Geo = { righe: number[][]; civpos: Record<string, [number, number]>; nota?: string };

export type Fondo = {
  id: string; slug: string; slug_breve: string; titolo: string; sottotitolo: string | null;
  tipo: string; comune: string; valle: string | null; lat: number | null; lng: number | null;
  anno_da: number | null; anno_a: number | null; descrizione: string | null;
  archivio: string | null; segnatura: string | null; ricercatore: string | null;
  ricercatore_note: string | null; licenza_immagini: string | null;
  planimetria_url: string | null; planimetria_geo: Geo | null; racconto_html: string | null;
  posti_censiti: number | null; nomi_noti: number; senza_nome: number;
  protocollo: string | null; anno_pratica: number | null;
};

export type Persona = {
  id: string; slug: string; fondo_slug: string; fondo_slug_breve: string; fondo_titolo: string;
  comune: string; valle: string | null; settore: string | null; numero: number | null;
  nome_completo: string | null; grado: string | null; reparto: string | null;
  data_morte_testo: string | null; data_morte: string | null; anno_nascita: number | null;
  luogo_nascita: string | null; regione_nascita: string | null;
  prigioniero_guerra: boolean; ignoto: boolean; note: string | null;
  evento_slug: string | null; evento_nome: string | null; evento_certezza: string | null;
  // Brief "Sezione cimiteri, chiusura completa" (27/8/2026 §1.1-1.2): tre
  // colonne nuove su memoria_persona, in coda alla vista pubblica.
  relazione_registrazione: 'doppia_registrazione' | 'doppia_sepoltura' | 'da_verificare' | null;
  conta_nei_totali: boolean;
  nota_registrazione: string | null;
  // nota_registrazione e' una nota di redazione interna (spiega perche' una
  // riga e' doppia o da verificare): non va mai mostrata al lettore. Solo
  // altra_* e' pubblico, ed e' popolato oggi solo sul lato "civile" delle tre
  // doppie sepolture — trovaRimando() sotto lo legge in entrambe le
  // direzioni, senza toccare la vista.
  altra_settore: string | null; altra_numero: number | null; altra_slug: string | null;
  reparto_denominazione: string | null; reparto_scioglimento: string | null;
  reparto_slug: string | null; reparto_certezza: 'certa' | 'alta' | 'da_verificare' | null;
};

// Un rimando funziona in entrambe le direzioni anche se altra_* e' scritto
// oggi solo su una riga per coppia (brief 27/8/2026 §3, verifica 7): se la
// riga non ha un proprio altra_*, si cerca fra le altre persone dello stesso
// fondo quella che rimanda A questa — mai un elenco di coppie scritto a mano,
// solo il campo altra_* letto nei due sensi.
export function trovaRimando(persona: Persona, tutte: Persona[]): { settore: string; numero: number; slug: string } | null {
  if (persona.relazione_registrazione === 'doppia_sepoltura' && persona.altra_settore && persona.altra_numero != null && persona.altra_slug) {
    return { settore: persona.altra_settore, numero: persona.altra_numero, slug: persona.altra_slug };
  }
  // Solo una riga doppia_sepoltura genera un rimando: la tomba 90
  // (doppia_registrazione) punta anch'essa a un'altra riga con altra_*
  // (la sua registrazione vera, 97), ma quel puntatore non e' un rimando fra
  // due sepolture dello stesso uomo — senza questo filtro, la pagina di 97
  // mostrerebbe "registrato anche alla tomba 90", che non esiste piu' per il
  // lettore.
  const reciproco = tutte.find((p) =>
    p.fondo_slug === persona.fondo_slug && p.relazione_registrazione === 'doppia_sepoltura'
    && p.altra_settore === persona.settore && p.altra_numero === persona.numero);
  return reciproco && reciproco.settore && reciproco.numero != null
    ? { settore: reciproco.settore, numero: reciproco.numero, slug: reciproco.slug }
    : null;
}

// I quattro gradi di certezza di un collegamento a un evento (brief
// "Operazione Valanga", 27/8/2026 §6.1): testo definitivo, scritto accanto
// al nome, mai in nota.
export const TESTO_CERTEZZA_EVENTO: Record<string, string> = {
  attestato: 'Nominato nei documenti dell\'operazione.',
  sostenuto: 'Il suo reparto risulta schierato nel settore in quelle ore.',
  probabile: 'Collegamento dedotto dalla data e dal luogo.',
  non_sostenuto: 'Il reparto è stato cercato nei documenti e non compare.',
};

export type Evento = {
  id: string; slug: string; nome: string; nome_originale: string | null;
  data_da: string | null; data_a: string | null; luogo: string | null;
  descrizione: string | null; fonti: string | null;
};

// Sotto le tre persone una pagina di reparto o di provenienza sarebbe vuota:
// e' un parametro, non una condizione sparsa nei file che generano le pagine.
export const SOGLIA_MINIMA_GRUPPO = 3;

// "26.SchRgt" -> "26-schrgt". Slug generico per reparti e regioni di nascita
// cosi' come compaiono nel registro: non li normalizziamo (brief §7), li
// rendiamo solo percorribili in un indirizzo.
export function slugifica(testo: string): string {
  return testo.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Kaiserjäger e Kaiserschützen si riconoscono dalla sigla del reparto
// nell'ordine di battaglia austro-ungarico (TKJgr = Tiroler Kaiserjäger,
// Ksch = Kaiserschützen): un pattern legato alla convenzione dell'esercito
// imperiale, non a Malè, quindi vale anche per un fondo futuro.
export function eReggimentoTirolese(reparto: string | null): boolean {
  return !!reparto && /KschRgt|TKJgrRgt/i.test(reparto);
}

export async function leggiFondi(): Promise<Fondo[]> {
  const { data, error } = await sb.from('v_memoria_fondo_pubblico').select('*');
  if (error) { console.error('[memoria] lettura fondi fallita:', error.message); return []; }
  return (data ?? []) as Fondo[];
}

export async function leggiFondo(slugBreve: string): Promise<Fondo | null> {
  const { data, error } = await sb.from('v_memoria_fondo_pubblico').select('*').eq('slug_breve', slugBreve).maybeSingle();
  if (error) { console.error('[memoria] lettura fondo fallita:', error.message); return null; }
  return data as Fondo | null;
}

// Tutte le righe, comprese le tombe senza nome: servono ai numeri della
// pagina del fondo. Le tombe senza nome NON hanno una pagina propria (solo
// la planimetria le mostra) — chi genera le pagine filtra con conNome().
export async function leggiPersone(fondoSlug: string): Promise<Persona[]> {
  const { data, error } = await sb.from('v_memoria_persona_pubblica').select('*').eq('fondo_slug', fondoSlug);
  if (error) { console.error('[memoria] lettura persone fallita:', error.message); return []; }
  return (data ?? []) as Persona[];
}

export function conNome(p: Persona): boolean {
  return !!p.nome_completo && p.nome_completo !== 'sconosciuto';
}

// Ha davvero un nome E conta: usata ovunque una riga con
// conta_nei_totali=false (oggi solo la tomba 90, una registrazione
// superflua) deve sparire da conteggi, albo e planimetria pur restando nel
// database (brief "chiusura completa", 27/8/2026 §1.1, §3, §4). conNome()
// resta la verita' grezza del dato, non tocca la; questa e' la lettura "conta
// per il lettore".
export function contaComeNoto(p: Persona): boolean {
  return conNome(p) && p.conta_nei_totali !== false;
}

// Vista v_memoria_conteggi (brief "chiusura completa", 27/8/2026 §1.3): una
// riga sola, tutti i totali del fondo. Ogni numero in pagina viene da qui,
// mai da una count() scritta a mano — e' il motivo per cui erano divergenti.
export type Conteggi = {
  sepolture_militari: number; sepolture_civili: number; sepolture_totali: number;
  uomini_distinti: number; uomini_in_entrambi_i_cimiteri: number;
  senza_nome: number; coppie_aperte: number; con_data_di_morte: number;
};

export async function leggiConteggi(): Promise<Conteggi | null> {
  const { data, error } = await sb.from('v_memoria_conteggi').select('*').maybeSingle();
  if (error) { console.error('[memoria] lettura conteggi fallita:', error.message); return null; }
  return data as Conteggi | null;
}

// Tutte le persone di tutti i fondi pubblicati: le pagine di reparto e di
// provenienza vivono sopra /cimiteri-di-guerra, non dentro un fondo, perché
// un reparto o una terra di nascita possono comparire in piu' registri.
export async function leggiTutte(): Promise<Persona[]> {
  const { data, error } = await sb.from('v_memoria_persona_pubblica').select('*');
  if (error) { console.error('[memoria] lettura persone fallita:', error.message); return []; }
  return (data ?? []) as Persona[];
}

// Reparto (brief "fondo 1941", 26/8/2026 §2, §6): non più un raggruppamento
// per sigla ricalcolato al volo dalle persone, ma la tabella vera
// memoria_reparto — 55 sigle, tutte con una pagina propria, nessuna soglia.
// Lo scioglimento e la denominazione vengono dal registro dell'esercito
// austro-ungarico, non da un'ipotesi scritta qui.
export type Reparto = {
  sigla: string; slug: string; scioglimento: string | null; denominazione: string | null;
  arma: string | null; certezza: 'certa' | 'alta' | 'da_verificare'; sigla_padre: string | null;
  note: string | null; caduti: number; caduti_militare: number; caduti_civile: number;
};

export async function leggiReparti(): Promise<Reparto[]> {
  const { data, error } = await sb.from('v_memoria_reparto_pubblico').select('*');
  if (error) { console.error('[memoria] lettura reparti fallita:', error.message); return []; }
  return ((data ?? []) as Reparto[]).sort((a, b) => b.caduti - a.caduti);
}

export async function leggiReparto(slug: string): Promise<Reparto | null> {
  const { data, error } = await sb.from('v_memoria_reparto_pubblico').select('*').eq('slug', slug).maybeSingle();
  if (error) { console.error('[memoria] lettura reparto fallita:', error.message); return null; }
  return data as Reparto | null;
}

// Dalla sigla scritta nel registro (memoria_persona.reparto) alla scheda
// vera: usata dalla pagina persona, che conosce solo la sigla.
export async function leggiRepartoPerSigla(sigla: string): Promise<Reparto | null> {
  const { data, error } = await sb.from('v_memoria_reparto_pubblico').select('*').eq('sigla', sigla).maybeSingle();
  if (error) { console.error('[memoria] lettura reparto per sigla fallita:', error.message); return null; }
  return data as Reparto | null;
}

export type GruppoProvenienza = { slug: string; regione: string; persone: Persona[] };

export async function leggiProvenienze(soglia = SOGLIA_MINIMA_GRUPPO): Promise<GruppoProvenienza[]> {
  const persone = (await leggiTutte()).filter(conNome).filter((p) => p.regione_nascita);
  const gruppi = new Map<string, Persona[]>();
  for (const p of persone) {
    const chiave = p.regione_nascita as string;
    const arr = gruppi.get(chiave) ?? [];
    arr.push(p);
    gruppi.set(chiave, arr);
  }
  return [...gruppi.entries()]
    .filter(([, arr]) => arr.length >= soglia)
    .map(([regione, arr]) => ({ slug: slugifica(regione), regione, persone: arr }))
    .sort((a, b) => b.persone.length - a.persone.length);
}

export async function leggiProvenienza(slug: string, soglia = SOGLIA_MINIMA_GRUPPO): Promise<GruppoProvenienza | null> {
  const gruppi = await leggiProvenienze(soglia);
  return gruppi.find((g) => g.slug === slug) ?? null;
}

export async function leggiEventi(): Promise<Evento[]> {
  const { data, error } = await sb.from('v_memoria_evento_pubblico').select('*');
  if (error) { console.error('[memoria] lettura eventi fallita:', error.message); return []; }
  return (data ?? []) as Evento[];
}

export async function leggiEvento(slug: string): Promise<Evento | null> {
  const { data, error } = await sb.from('v_memoria_evento_pubblico').select('*').eq('slug', slug).maybeSingle();
  if (error) { console.error('[memoria] lettura evento fallita:', error.message); return null; }
  return data as Evento | null;
}

// Vista v_memoria_evento_reparto_pubblico (brief "Operazione Valanga",
// 27/8/2026 §1.4, §6.2): i reparti letti sulle carte del dott. Mariotti per
// un evento. Le riproduzioni non sono pubblicate per volontà del
// ricercatore: questa vista non porta nessuna immagine, solo la lettura.
export type EventoReparto = {
  evento_slug: string; denominazione_documento: string; comando: string | null; sigla: string | null;
  reparto_slug: string | null; reparto_denominazione: string | null;
  confidenza: 'alta' | 'media' | 'da_verificare'; fonte: string | null; citazione: string | null;
  note: string | null; sepolture_a_male: number;
};

export async function leggiEventoReparti(eventoSlug: string): Promise<EventoReparto[]> {
  const { data, error } = await sb.from('v_memoria_evento_reparto_pubblico').select('*').eq('evento_slug', eventoSlug);
  if (error) { console.error('[memoria] lettura reparti evento fallita:', error.message); return []; }
  return (data ?? []) as EventoReparto[];
}

export function meseIt(mese: number): string {
  return ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
    'settembre', 'ottobre', 'novembre', 'dicembre'][mese - 1] ?? '';
}

// "16.10.1918" -> "16 ottobre 1918". Se il testo non è nel formato atteso,
// si restituisce così com'è: meglio un testo grezzo che una data inventata.
export function dataLeggibile(testo: string | null): string | null {
  if (!testo) return null;
  const m = testo.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return testo;
  return `${parseInt(m[1], 10)} ${meseIt(parseInt(m[2], 10))} ${m[3]}`;
}

export function titoloPersona(p: Persona): string {
  const parti = [p.nome_completo];
  if (p.reparto) parti.push(p.reparto);
  const morte = dataLeggibile(p.data_morte_testo);
  if (morte) parti.push(`morto a ${p.comune} il ${morte}`);
  return parti.join(', ');
}

// "Cimitero militare di Malè" -> "cimitero militare di Malè": per usare il
// titolo in mezzo a una frase senza abbassare anche il nome del comune
// (un .toLowerCase() secco scriveva "malè", minuscolo e senza motivo).
// Il comune resta quello vero, non un caso speciale scritto a mano.
export function titoloInFrase(fondo: Fondo): string {
  const suffisso = ` di ${fondo.comune}`;
  if (fondo.titolo.endsWith(suffisso)) {
    return fondo.titolo.slice(0, -suffisso.length).toLowerCase() + suffisso;
  }
  return fondo.titolo.toLowerCase();
}
