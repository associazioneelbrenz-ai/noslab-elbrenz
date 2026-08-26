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
export const OG_CIMITERI_ORIZZONTALE = `${SUPABASE_URL}/storage/v1/object/public/assets-pubblici/cimiteri-di-guerra/og-cimiteri-di-guerra.jpg`;
export const OG_CIMITERI_QUADRATA = `${SUPABASE_URL}/storage/v1/object/public/assets-pubblici/cimiteri-di-guerra/og-cimiteri-di-guerra-quadrata.jpg`;

export function ogImageFondo(fondo: Fondo): string {
  return fondo.planimetria_url ?? OG_CIMITERI_ORIZZONTALE;
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
};

export type Persona = {
  id: string; slug: string; fondo_slug: string; fondo_slug_breve: string; fondo_titolo: string;
  comune: string; valle: string | null; settore: string | null; numero: number | null;
  nome_completo: string | null; grado: string | null; reparto: string | null;
  data_morte_testo: string | null; data_morte: string | null; anno_nascita: number | null;
  luogo_nascita: string | null; regione_nascita: string | null;
  prigioniero_guerra: boolean; ignoto: boolean; note: string | null;
  evento_slug: string | null; evento_nome: string | null; evento_certezza: string | null;
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

// Tutte le persone di tutti i fondi pubblicati: le pagine di reparto e di
// provenienza vivono sopra /cimiteri-di-guerra, non dentro un fondo, perché
// un reparto o una terra di nascita possono comparire in piu' registri.
export async function leggiTutte(): Promise<Persona[]> {
  const { data, error } = await sb.from('v_memoria_persona_pubblica').select('*');
  if (error) { console.error('[memoria] lettura persone fallita:', error.message); return []; }
  return (data ?? []) as Persona[];
}

export type GruppoReparto = { slug: string; reparto: string; persone: Persona[] };

export async function leggiReparti(soglia = SOGLIA_MINIMA_GRUPPO): Promise<GruppoReparto[]> {
  const persone = (await leggiTutte()).filter(conNome).filter((p) => p.reparto);
  const gruppi = new Map<string, Persona[]>();
  for (const p of persone) {
    const chiave = p.reparto as string;
    const arr = gruppi.get(chiave) ?? [];
    arr.push(p);
    gruppi.set(chiave, arr);
  }
  return [...gruppi.entries()]
    .filter(([, arr]) => arr.length >= soglia)
    .map(([reparto, arr]) => ({ slug: slugifica(reparto), reparto, persone: arr }))
    .sort((a, b) => b.persone.length - a.persone.length);
}

export async function leggiReparto(slug: string, soglia = SOGLIA_MINIMA_GRUPPO): Promise<GruppoReparto | null> {
  const gruppi = await leggiReparti(soglia);
  return gruppi.find((g) => g.slug === slug) ?? null;
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
