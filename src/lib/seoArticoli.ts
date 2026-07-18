/**
 * A1 — Metadati SEO degli articoli, letti dal DB IN BUILD.
 *
 * Il sito rende gli articoli dalle Content Collection (i .md), mentre i campi
 * SEO (meta_title, meta_description, immagine_alt, noindex) stanno in
 * public.articolo. Il ponte e' `legacy_wp_id` nel frontmatter, che corrisponde
 * a `articolo.wp_legacy_id`.
 *
 * La lettura avviene UNA VOLTA in fase di build (le pagine articolo sono SSG):
 * i tag finiscono nell'HTML servito, come richiesto, senza costo a runtime.
 * Se il DB non risponde, si degrada in silenzio ai dati del frontmatter: un
 * problema di rete non deve far fallire la build del sito.
 */
import { createClient } from '@supabase/supabase-js';

export type SeoArticolo = {
  meta_title: string | null;
  meta_description: string | null;
  immagine_alt: string | null;
  noindex: boolean;
  /** A2 — copertina per og:image (URL assoluto su Storage dopo la migrazione). */
  copertina: string | null;
  /** A2 — article:published_time (ISO). */
  pubblicato_at: string | null;
};

/** Immagine OG di riserva per i ~27 articoli senza copertina: meglio
 *  un'anteprima sobria e brandizzata che nessuna anteprima. */
export const OG_DEFAULT = '/og/default.png';

let cache: Map<number, SeoArticolo> | null = null;

export async function mappaSeoArticoli(): Promise<Map<number, SeoArticolo>> {
  if (cache) return cache;
  cache = new Map();
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) return cache;
  try {
    const sb = createClient(url, anon);
    const { data } = await sb
      .from('v_articoli_seo')
      .select('wp_legacy_id, meta_title, meta_description, immagine_alt, noindex, immagine_copertina_url, pubblicato_at');
    for (const r of (data ?? []) as any[]) {
      if (r.wp_legacy_id == null) continue;
      cache.set(Number(r.wp_legacy_id), {
        meta_title: r.meta_title || null,
        meta_description: r.meta_description || null,
        immagine_alt: r.immagine_alt || null,
        noindex: r.noindex === true,
        copertina: r.immagine_copertina_url || null,
        pubblicato_at: r.pubblicato_at || null,
      });
    }
  } catch {
    // Degrado silenzioso: si usano i dati del frontmatter.
  }
  return cache;
}

/** Titolo per il tag <title>: meta_title se c'e', altrimenti il titolo
 *  dell'articolo troncato a una lunghezza sensata (il suffisso " | El Brenz"
 *  lo aggiunge il Layout). Taglia sull'ultimo spazio, non a meta' parola. */
export function titoloSeo(metaTitle: string | null, titolo: string, max = 60): string {
  const t = (metaTitle || titolo || '').trim();
  if (t.length <= max) return t;
  const tagliato = t.slice(0, max);
  const spazio = tagliato.lastIndexOf(' ');
  return (spazio > 30 ? tagliato.slice(0, spazio) : tagliato).trimEnd() + '…';
}
