/**
 * i18n — telaio multilingua di El Brenz (Fase 1a, scaffold).
 *
 * ADDITIVO: l'italiano resta la lingua di default alla radice ("/"); il DE e
 * l'EN vivono sotto "/de/" e "/en/". Il "pt"/"es" sono predisposti SOLO nella
 * config di Astro (nessuna pagina, nessuna voce nel selettore).
 *
 * Regole ferme (brief i18n):
 *   - Il ladino anaunico è una LINGUA (mai "dialetto").
 *   - Il motto «Raìs fonde no le 'nglacia» non si traduce MAI (solo la glossa
 *     esplicativa sotto può essere localizzata).
 *   - Nomi propri intraducibili: El Brenz, «Fiöi dal Nos», «Guardiani de la
 *     lenga», «Os dal Nos», «Lunari dal Nos», «Una terra, cinque lingue»,
 *     «Andreas», «Portale Memoria».
 *   - Niente em-dash nei testi pubblici.
 *
 * Glossario DE validato da Brunella (termini fissi):
 *   Val di Non → Nonsberg · Val di Sole → Sulzberg · Val di Rabbi → Rabbital
 *   Val di Pejo → Pejotal · ladino anaunico → anaunisches Ladinisch
 *   Tirolo storico → historisches Tirol.
 *
 * NB: le stringhe DE di questo file sono BOZZA in attesa della revisione di
 * Brunella (gate TRADUZIONI_DE_LIVE lato Layout: finché è false, le pagine
 * DE restano `noindex`). Idem EN con TRADUZIONI_EN_LIVE.
 */

/** Tutte le lingue previste dal telaio (allineate ad astro.config i18n). */
export const locales = ['it', 'de', 'en', 'pt', 'es'] as const;
export type Locale = (typeof locales)[number];

/** Lingue con contenuti reali → mostrate nel selettore. pt/es esclusi. */
export const publicLocales = ['it', 'de', 'en'] as const;
export type PublicLocale = (typeof publicLocales)[number];

export const defaultLang: Locale = 'it';

/** Etichette del selettore (solo lingue con contenuti). */
export const languages: Record<PublicLocale, string> = {
  it: 'Italiano',
  de: 'Deutsch',
  en: 'English',
};

/** Codice `lang` per <html> e valore Open Graph `og:locale`. */
export const htmlLang: Record<PublicLocale, string> = { it: 'it', de: 'de', en: 'en' };
export const ogLocale: Record<PublicLocale, string> = {
  it: 'it_IT',
  de: 'de_DE',
  en: 'en_US',
};

/** aria-label del selettore, localizzato. */
export const switchLabel: Record<PublicLocale, string> = {
  it: 'Cambia lingua',
  de: 'Sprache wechseln',
  en: 'Change language',
};

/**
 * Dizionario delle stringhe d'interfaccia (chrome: nav + footer + hero pilota).
 * Chiavi condivise, valori per lingua. L'italiano riproduce ESATTAMENTE le
 * stringhe già in pagina (così il render IT resta invariato).
 */
export const ui = {
  it: {
    // Nav — tendine di primo livello
    'nav.assoc': "L'Associazione",
    'nav.temi': 'Temi',
    'nav.progetti': 'Progetti',
    'nav.archivio': 'Archivio',
    // Nav — L'Associazione
    'nav.chisiamo': 'Chi siamo',
    'nav.direttivo': 'Il Direttivo',
    'nav.statuto': 'Lo Statuto',
    'nav.convenzioni': 'Convenzioni',
    'nav.contatti': 'Contatti',
    // Nav — Temi
    'nav.storia': 'Storia',
    'nav.lingua': 'Lingua',
    'nav.atlante': 'Le valli nell’Atlante del Ladino',
    'nav.cultura': 'Cultura materiale',
    'nav.rievocazioni': 'Rievocazioni ed eventi',
    'nav.mappa': 'Mappa delle Valli',
    'nav.identita': 'Identità',
    'nav.libro': 'Il libro: A proposito di Tirolo',
    'nav.vita': 'Vita associativa',
    // Nav — Progetti (nomi propri non tradotti)
    'nav.osdalnos': 'Os dal Nos',
    'nav.lunari': 'Lunari dal Nos',
    'nav.portale': 'Portale Memoria',
    'nav.unaterra': 'Una terra, cinque lingue',
    'nav.fioi': 'Fiöi dal Nos',
    'nav.guardiani': 'Guardiani de la lenga',
    // Nav — Archivio
    'nav.archiviostorico': 'Archivio storico',
    'nav.archiviodigitale': 'Archivio digitale',
    'nav.photogallery': 'Photogallery',
    // Footer — intestazioni e link
    'footer.assoc': 'Associazione',
    'footer.sostienici': 'Sostienici',
    'footer.custodi': 'I Custodi della Memoria →',
    'footer.diventasocio': 'Diventa socio →',
    'footer.privacy': 'Privacy',
    'footer.cookie': 'Cookie policy',
    'footer.cookieprefs': 'Preferenze cookie',
    'footer.statuto': 'Statuto',
    'footer.termini': 'Termini di servizio',
    'footer.regolamento': 'Regolamento community',
    'footer.crediti': 'Crediti e licenze',
    // Home pilota — hero + CTA
    'hero.badge': 'Associazione Storico Culturale Linguistica',
    'hero.title1': 'Le radici del',
    'hero.titleEm': 'ladino anaunico',
    'hero.subtitle':
      'Custodiamo, studiamo e divulghiamo la storia, la lingua e la cultura delle Valli del Noce: Val di Non, Val di Sole, Val di Rabbi, Val di Pejo.',
    'hero.mottoGloss': 'Radici profonde non gelano',
    'cta.discover': 'Scopri El Brenz',
    'cta.join': 'Diventa socio',
    'cta.donate': 'Sostienici',
    // Home pilota — nota di cortesia (contenuto completo in passata 1b)
    'pilot.note':
      'Stiamo traducendo il sito. Le pagine complete arrivano a breve; intanto trovi qui la home e puoi tornare alla versione italiana in ogni momento.',
    'pilot.toIt': 'Vai al sito in italiano →',
  },
  de: {
    'nav.assoc': 'Der Verein',
    'nav.temi': 'Themen',
    'nav.progetti': 'Projekte',
    'nav.archivio': 'Archiv',
    'nav.chisiamo': 'Über uns',
    'nav.direttivo': 'Der Vorstand',
    'nav.statuto': 'Die Satzung',
    'nav.convenzioni': 'Vergünstigungen',
    'nav.contatti': 'Kontakt',
    'nav.storia': 'Geschichte',
    'nav.lingua': 'Sprache',
    'nav.atlante': 'Die Täler im Ladinisch-Sprachatlas',
    'nav.cultura': 'Sachkultur',
    'nav.rievocazioni': 'Umzüge und Veranstaltungen',
    'nav.mappa': 'Karte der Täler',
    'nav.identita': 'Identität',
    'nav.libro': 'Das Buch: A proposito di Tirolo',
    'nav.vita': 'Vereinsleben',
    'nav.osdalnos': 'Os dal Nos',
    'nav.lunari': 'Lunari dal Nos',
    'nav.portale': 'Portale Memoria',
    'nav.unaterra': 'Una terra, cinque lingue',
    'nav.fioi': 'Fiöi dal Nos',
    'nav.guardiani': 'Guardiani de la lenga',
    'nav.archiviostorico': 'Historisches Archiv',
    'nav.archiviodigitale': 'Digitales Archiv',
    'nav.photogallery': 'Fotogalerie',
    'footer.assoc': 'Verein',
    'footer.sostienici': 'Unterstützen Sie uns',
    'footer.custodi': 'Die Hüter der Erinnerung →',
    'footer.diventasocio': 'Mitglied werden →',
    'footer.privacy': 'Datenschutz',
    'footer.cookie': 'Cookie-Richtlinie',
    'footer.cookieprefs': 'Cookie-Einstellungen',
    'footer.statuto': 'Satzung',
    'footer.termini': 'Nutzungsbedingungen',
    'footer.regolamento': 'Community-Regeln',
    'footer.crediti': 'Credits und Lizenzen',
    'hero.badge': 'Historisch-kulturell-sprachlicher Verein',
    'hero.title1': 'Die Wurzeln des',
    'hero.titleEm': 'anaunischen Ladinisch',
    'hero.subtitle':
      'Wir bewahren, erforschen und vermitteln die Geschichte, die Sprache und die Kultur der Täler des Noce: Nonsberg, Sulzberg, Rabbital und Pejotal.',
    'hero.mottoGloss': 'Tiefe Wurzeln frieren nicht',
    'cta.discover': 'El Brenz entdecken',
    'cta.join': 'Mitglied werden',
    'cta.donate': 'Unterstützen Sie uns',
    'pilot.note':
      'Wir übersetzen die Website gerade. Die vollständigen Seiten folgen in Kürze; hier finden Sie bereits die Startseite und können jederzeit zur italienischen Fassung zurückkehren.',
    'pilot.toIt': 'Zur italienischen Website →',
  },
  en: {
    'nav.assoc': 'The Association',
    'nav.temi': 'Topics',
    'nav.progetti': 'Projects',
    'nav.archivio': 'Archive',
    'nav.chisiamo': 'About us',
    'nav.direttivo': 'The Board',
    'nav.statuto': 'Statute',
    'nav.convenzioni': 'Partner benefits',
    'nav.contatti': 'Contact',
    'nav.storia': 'History',
    'nav.lingua': 'Language',
    'nav.atlante': 'The valleys in the Ladin Language Atlas',
    'nav.cultura': 'Material culture',
    'nav.rievocazioni': 'Reenactments and events',
    'nav.mappa': 'Map of the Valleys',
    'nav.identita': 'Identity',
    'nav.libro': 'The book: A proposito di Tirolo',
    'nav.vita': 'Association life',
    'nav.osdalnos': 'Os dal Nos',
    'nav.lunari': 'Lunari dal Nos',
    'nav.portale': 'Portale Memoria',
    'nav.unaterra': 'Una terra, cinque lingue',
    'nav.fioi': 'Fiöi dal Nos',
    'nav.guardiani': 'Guardiani de la lenga',
    'nav.archiviostorico': 'Historical archive',
    'nav.archiviodigitale': 'Digital archive',
    'nav.photogallery': 'Photo gallery',
    'footer.assoc': 'Association',
    'footer.sostienici': 'Support us',
    'footer.custodi': 'The Keepers of Memory →',
    'footer.diventasocio': 'Become a member →',
    'footer.privacy': 'Privacy',
    'footer.cookie': 'Cookie policy',
    'footer.cookieprefs': 'Cookie preferences',
    'footer.statuto': 'Statute',
    'footer.termini': 'Terms of service',
    'footer.regolamento': 'Community rules',
    'footer.crediti': 'Credits and licenses',
    'hero.badge': 'Historical, Cultural and Linguistic Association',
    'hero.title1': 'The roots of',
    'hero.titleEm': 'Anaunian Ladin',
    'hero.subtitle':
      'We preserve, study and share the history, language and culture of the Noce Valleys: Val di Non, Val di Sole, Val di Rabbi, Val di Pejo.',
    'hero.mottoGloss': 'Deep roots do not freeze',
    'cta.discover': 'Discover El Brenz',
    'cta.join': 'Become a member',
    'cta.donate': 'Support us',
    'pilot.note':
      'We are translating the website. Full pages are coming soon; for now you have the home page here and can return to the Italian version at any time.',
    'pilot.toIt': 'Go to the Italian website →',
  },
} as const;

export type UIKey = keyof (typeof ui)['it'];

/**
 * useTranslations(lang) → t(key) con fallback all'italiano se una chiave manca
 * nella lingua richiesta (e alla chiave stessa come ultima spiaggia).
 */
export function useTranslations(lang: Locale) {
  const table = (ui as Record<string, Record<string, string>>)[lang] ?? ui.it;
  return function t(key: UIKey): string {
    return table[key] ?? ui.it[key] ?? String(key);
  };
}

// ---------------------------------------------------------------------------
// Routing helpers — usati da language switcher e hreflang.
// ---------------------------------------------------------------------------

/** Home per lingua (l'italiano resta alla radice). */
export const localeHome: Record<PublicLocale, string> = {
  it: '/',
  de: '/de/',
  en: '/en/',
};

/**
 * Registro dei percorsi IT (canonici) che hanno già una traduzione, per
 * lingua. In Fase 1a esiste solo la home; il resto arriva in 1b. Serve alla
 * regola di fallback dello switcher ("stessa pagina se esiste, altrimenti la
 * home di quella lingua") e agli hreflang reciproci.
 */
export const translatedRoutes: Record<PublicLocale, string[]> = {
  it: ['/'],
  de: ['/'],
  en: ['/'],
};

/** Ricava la lingua da un pathname (prefisso /de o /en → altrimenti it). */
export function getLocaleFromPath(pathname: string): PublicLocale {
  const seg = pathname.replace(/^\/+/, '').split('/')[0];
  return seg === 'de' || seg === 'en' ? seg : 'it';
}

/** Normalizza un pathname al percorso IT canonico (rimuove il prefisso locale). */
export function toCanonicalPath(pathname: string): string {
  const lang = getLocaleFromPath(pathname);
  if (lang === 'it') return pathname || '/';
  const stripped = pathname.replace(new RegExp(`^/${lang}(?=/|$)`), '');
  return stripped === '' ? '/' : stripped;
}

/** Il percorso IT canonico esiste tradotto nella lingua data? */
export function hasTranslation(canonicalPath: string, lang: PublicLocale): boolean {
  if (lang === 'it') return true;
  const p = canonicalPath.endsWith('/') || canonicalPath === '/' ? canonicalPath : canonicalPath;
  return translatedRoutes[lang].includes(p);
}

/**
 * URL di una pagina in una lingua target. Se la traduzione non esiste,
 * ricade sulla home di quella lingua (mai una pagina mezza tradotta).
 */
export function localizedUrl(canonicalPath: string, lang: PublicLocale): string {
  if (!hasTranslation(canonicalPath, lang)) return localeHome[lang];
  if (lang === 'it') return canonicalPath || '/';
  if (canonicalPath === '/') return localeHome[lang];
  return `/${lang}${canonicalPath}`;
}
