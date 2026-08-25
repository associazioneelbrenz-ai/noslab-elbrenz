// Archivio dei nomi (brief 25/8/2026) — dati letti dal database vero, mai
// incollati nel file. Le funzioni RPC leggono UN fondo per volta (mai
// tutto), stessa protezione della sezione: indirizzo noto solo a chi lo
// riceve, non autenticazione. Quando il fondo passa a "pubblicato" le
// stesse pagine funzionano leggendo le viste pubbliche, senza modifiche.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

export type Fondo = {
  id: string; slug: string; titolo: string; sottotitolo: string | null; tipo: string;
  comune: string; valle: string | null; lat: number | null; lng: number | null;
  anno_da: number | null; anno_a: number | null; descrizione: string | null;
  archivio: string | null; segnatura: string | null; ricercatore: string | null;
  ricercatore_note: string | null; licenza_immagini: string | null;
  planimetria_url: string | null; planimetria_geo: unknown; posti_censiti: number | null;
  stato: string;
};

export type Persona = {
  id: string; fondo_id: string; settore: string | null; numero: number | null;
  nome_completo: string | null; grado: string | null; reparto: string | null;
  data_morte_testo: string | null; data_morte: string | null; anno_nascita: number | null;
  luogo_nascita: string | null; regione_nascita: string | null;
  prigioniero_guerra: boolean; ignoto: boolean; note: string | null; slug: string | null;
};

export async function leggiFondo(slug: string): Promise<Fondo | null> {
  const { data, error } = await sb.rpc('memoria_fondo_bozza_lettura', { p_slug: slug });
  if (error) { console.error('[memoria] lettura fondo fallita:', error.message); return null; }
  return (data?.[0] as Fondo) ?? null;
}

// Tutte le righe, comprese le tombe senza nome: servono ai numeri della
// pagina del fondo. Le tombe senza nome NON hanno una pagina propria (solo
// la planimetria le mostra) — chi genera le pagine filtra con conNome().
export async function leggiPersone(fondoSlug: string): Promise<Persona[]> {
  const { data, error } = await sb.rpc('memoria_persone_bozza_lettura', { p_fondo_slug: fondoSlug });
  if (error) { console.error('[memoria] lettura persone fallita:', error.message); return []; }
  return (data ?? []) as Persona[];
}

export function conNome(p: Persona): boolean {
  return !!p.nome_completo && p.nome_completo !== 'sconosciuto';
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
  if (morte) parti.push(`morto a Malè il ${morte}`);
  return parti.join(', ');
}
