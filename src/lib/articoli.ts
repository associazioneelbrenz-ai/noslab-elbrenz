// src/lib/articoli.ts
//
// Helper condivisi per il display layer degli articoli (M2.2).
// Centralizza: etichette pilastro leggibili, formattazione date in italiano,
// raggruppamento per anno. Usato da:
//   - src/pages/articoli/[...slug].astro  (dettaglio)
//   - src/components/PaginaPilastro.astro  (liste pilastro)
//   - src/pages/archivio-storico.astro     (archivio storico)
//
// NB: la visibilità è già codificata nei flag del frontmatter
// (draft / archivio): qui NON la reinterpretiamo, ci limitiamo a filtrare.

import type { CollectionEntry } from 'astro:content';

export type Articolo = CollectionEntry<'articoli'>;

/**
 * Etichette leggibili dei 6 pilastri editoriali (+ slot _da_assegnare).
 * Chiave = valore enum del frontmatter, valore = nome mostrato a video.
 * `_da_assegnare` mappa a stringa vuota: niente tag pilastro visibile.
 */
export const PILLAR_LABELS: Record<string, string> = {
  '1_storia_valli': 'Storia',
  '2_lingua_ladinita': 'Lingua',
  '3_cultura_materiale': 'Cultura materiale',
  '4_rievocazioni_eventi': 'Rievocazioni',
  '5_identita_appartenenza': 'Identità',
  '6_vita_associativa': 'Vita associativa',
  '_da_assegnare': '',
};

/** Nome leggibile del pilastro, o stringa vuota se sconosciuto/_da_assegnare. */
export function nomePilastro(pilastro: string): string {
  return PILLAR_LABELS[pilastro] ?? '';
}

/**
 * Data in italiano esteso, es. "24 dicembre 2025".
 * Accetta Date (il campo data_pubblicazione è già coerced a Date dallo schema).
 */
export function formatDataIT(data: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(data);
}

export interface GruppoAnno {
  anno: number;
  articoli: Articolo[];
}

/**
 * Raggruppa gli articoli per anno di pubblicazione.
 * - Anni ordinati DESC (il più recente in alto).
 * - Articoli dentro ciascun anno ordinati per data DESC.
 * Non muta l'array in ingresso.
 */
export function raggruppaPerAnno(articoli: Articolo[]): GruppoAnno[] {
  const perAnno = new Map<number, Articolo[]>();

  for (const a of articoli) {
    const anno = a.data.data_pubblicazione.getFullYear();
    const gruppo = perAnno.get(anno);
    if (gruppo) {
      gruppo.push(a);
    } else {
      perAnno.set(anno, [a]);
    }
  }

  return [...perAnno.keys()]
    .sort((x, y) => y - x)
    .map((anno) => ({
      anno,
      articoli: perAnno
        .get(anno)!
        .slice()
        .sort(
          (a, b) =>
            b.data.data_pubblicazione.getTime() -
            a.data.data_pubblicazione.getTime(),
        ),
    }));
}
