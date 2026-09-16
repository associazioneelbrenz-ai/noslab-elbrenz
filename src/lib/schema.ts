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

/**
 * [16/9/2026, audit SEO-06] UN SOLO IDENTIFICATIVO PER L'ENTE.
 *
 * L'Associazione aveva due nomi in schema.org: `#organization` qui e
 * `#associazione` nel Layout, che lo emette su ogni pagina. Gli articoli
 * dichiaravano editore e autore puntando al primo, che pero' esiste solo in
 * home: su centoquindici pagine il riferimento cadeva nel vuoto, e un Article
 * senza editore valido non entra fra i risultati ricchi di Google.
 * Vale `#associazione`, che e' quello presente ovunque; i due nodi, avendo
 * ora lo stesso identificativo, per un motore sono la stessa entita'.
 */
const ID_ENTE = `${SITO}/#associazione`;

export const ORGANIZATION = {
  '@type': 'NGO',
  '@id': ID_ENTE,
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

/**
 * [16/9/2026, audit SEO-06] «El Brenz» non e' una persona: quando l'articolo
 * non porta la firma di un socio l'autore e' l'Associazione, e si dichiara
 * come tale (Organization) invece che come Person con quel nome.
 */
function autoreEnte(nome?: string | null) {
  if (!nome) return true;
  const n = nome.trim().toLowerCase().replace(/[«»"'\u2019]/g, '').replace(/\s+/g, ' ');
  return n === 'el brenz'
    || n === 'associazione el brenz'
    || n.startsWith('associazione storico culturale linguistica el brenz');
}

export function schemaArticle(a: {
  titolo: string;
  descrizione?: string | null;
  url: string;
  immagine?: string | null;
  pubblicatoIso?: string | null;
  /** Ultima modifica nota (ISO). Se manca vale la data di pubblicazione. */
  aggiornatoIso?: string | null;
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
    // nome c'e' ed e' quello di una persona lo dichiariamo come Person,
    // altrimenti l'ente stesso.
    author: autoreEnte(a.autore) ? { '@id': ID_ENTE } : { '@type': 'Person', name: a.autore },
    publisher: { '@id': ID_ENTE },
  };
  if (a.descrizione) s.description = a.descrizione;
  if (a.immagine) s.image = a.immagine;
  if (a.pubblicatoIso) s.datePublished = a.pubblicatoIso;
  // [16/9/2026, audit SEO-06] `dateModified` mancava del tutto: e' il campo con
  // cui Google decide se una pagina e' ancora fresca. Dove la data di revisione
  // non c'e', vale quella di pubblicazione - che e' la verita': quel testo da
  // allora non e' stato toccato.
  if (a.aggiornatoIso || a.pubblicatoIso) s.dateModified = a.aggiornatoIso || a.pubblicatoIso;
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
