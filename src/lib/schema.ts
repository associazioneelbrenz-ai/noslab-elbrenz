/**
 * A5 — Dati strutturati schema.org.
 *
 * Un solo posto dove sta la verita' sull'ente: se cambia un profilo social o il
 * logo, si tocca qui e basta. I valori sono quelli gia' pubblicati sul sito
 * (footer e sezione "Seguici"), non inventati.
 *
 * Tipi emessi: Organization (NGO) in home, Article sugli articoli,
 * BreadcrumbList sui percorsi, Place sui luoghi (gia' in /luoghi/[slug]).
 */
const SITO = 'https://elbrenz.eu';

export const ORGANIZATION = {
  '@type': 'NGO',
  '@id': `${SITO}/#organization`,
  name: 'Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce',
  alternateName: 'El Brenz',
  url: SITO,
  logo: {
    '@type': 'ImageObject',
    url: `${SITO}/assets/branding/logo/logo-eb-master.png`,
  },
  description:
    'Associazione che studia e tiene viva la storia, la lingua e la cultura delle Valli del Noce: Val di Non, Val di Sole, Val di Rabbi e Val di Pejo.',
  areaServed: 'Valli del Noce, Trentino',
  sameAs: [
    'https://www.facebook.com/ASSOCIAZIONELBRENZ',
    'https://www.instagram.com/elbrenzass',
    'https://www.youtube.com/channel/UCX5cNGUEYPDrzC_G9hxKOzA',
  ],
};

export function schemaOrganization() {
  return { '@context': 'https://schema.org', ...ORGANIZATION };
}

export function schemaArticle(a: {
  titolo: string;
  descrizione?: string | null;
  url: string;
  immagine?: string | null;
  pubblicatoIso?: string | null;
  autore?: string | null;
  sezione?: string | null;
}) {
  const s: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.titolo,
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
    url: a.url,
    // L'autore e' quasi sempre un socio che scrive per l'Associazione: se il
    // nome c'e' lo dichiariamo come Person, altrimenti l'ente stesso.
    author: a.autore ? { '@type': 'Person', name: a.autore } : { '@id': `${SITO}/#organization` },
    publisher: { '@id': `${SITO}/#organization` },
  };
  if (a.descrizione) s.description = a.descrizione;
  if (a.immagine) s.image = a.immagine;
  if (a.pubblicatoIso) s.datePublished = a.pubblicatoIso;
  if (a.sezione) s.articleSection = a.sezione;
  return s;
}

/** Percorso di navigazione: aiuta Google a capire la gerarchia del sito. */
export function schemaBreadcrumb(voci: { nome: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: voci.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: v.nome,
      item: v.url.startsWith('http') ? v.url : SITO + v.url,
    })),
  };
}
