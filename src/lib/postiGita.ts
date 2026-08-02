import { createClient } from '@supabase/supabase-js';

/**
 * postiGita — lettura SERVER-SIDE dei posti della gita.
 *
 * Fonte UNICA: la vista pubblica aggregata `v_posti_gita`, la STESSA che
 * alimenta la barra countdown in home (client) e la card nella PWA soci. La
 * logica "54 posti meno le iscrizioni confermate" vive dentro la vista, non
 * qui: così non c'è duplicazione e il numero è sempre coerente ovunque.
 *
 * Fail-safe: ritorna `null` se la query fallisce o la config manca, così le
 * pagine SSR possono rendere una descrizione generica senza MAI andare in 500.
 */

const SB_URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SB_ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

export type PostiGita = { totali: number; occupati: number; disponibili: number };

export async function getPostiGita(
  slug = 'gita-giochi-medievali-2026',
): Promise<PostiGita | null> {
  try {
    if (!SB_URL || !SB_ANON) return null;
    const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('v_posti_gita')
      .select('evento_slug,posti_totali,posti_occupati');
    if (error || !Array.isArray(data) || data.length === 0) return null;
    // La vista ha (di norma) una sola riga per la gita; se ne avesse più di una,
    // si prende quella dello slug richiesto, con fallback alla prima.
    const row = data.find((r: any) => r.evento_slug === slug) ?? data[0];
    const totali = Number(row.posti_totali);
    const occupati = Number(row.posti_occupati);
    if (!Number.isFinite(totali)) return null;
    const occ = Number.isFinite(occupati) ? Math.min(occupati, totali) : 0;
    return { totali, occupati: occ, disponibili: Math.max(totali - occ, 0) };
  } catch {
    return null;
  }
}

/**
 * AGGIUNTA 3/8/2026 — stato della gita da `config_app`.
 *
 * Una sola funzione per tutte le superfici del sito (landing, modulo, home,
 * /eventi), cosi' non puo' succedere che una pagina creda la gita viva e
 * un'altra la sappia annullata. Stessa chiave che consulta l'edge
 * gita-crea-ordine prima di creare un ordine PayPal.
 *
 * Fail-CLOSED: se la lettura non riesce si risponde "annullata". Fra mostrare
 * un invito a pagare per un viaggio che non si fa e nascondere per errore un
 * invito legittimo, il danno recuperabile e' il secondo.
 */
export async function getStatoGita(
  slug = 'gita_giochi_medievali_2026_stato',
): Promise<{ annullata: boolean }> {
  try {
    if (!SB_URL || !SB_ANON) return { annullata: true };
    const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('config_app').select('valore').eq('chiave', slug).maybeSingle();
    if (error) return { annullata: true };
    const stato = (data?.valore as Record<string, unknown> | undefined)?.stato;
    return { annullata: typeof stato === 'string' ? stato !== 'aperta' : true };
  } catch {
    return { annullata: true };
  }
}

/**
 * Descrizione social/meta per la gita, in funzione dei posti disponibili.
 * `posti === null` → generica (fail-safe). Testi come da brief (26/7/2026).
 */
export function descrizioneGita(posti: PostiGita | null): string {
  const coda =
    'Viaggio e ingresso 60 euro, iscrizioni entro il 14 agosto. Tornei, corteo storico e villaggio medievale a Castel Coira.';
  if (!posti) {
    return `Gita sociale El Brenz ai Giochi Medievali del Südtirol, 22 agosto 2026. ${coda}`;
  }
  if (posti.disponibili <= 0) {
    return "Posti esauriti. Scrivici per la lista d'attesa.";
  }
  return `Restano ${posti.disponibili} posti su ${posti.totali}. ${coda}`;
}
