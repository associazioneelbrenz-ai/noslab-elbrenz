// src/content.config.ts
//
// Schema Astro Content Collections per gli articoli pubblici di El Brenz.
// M2.1 — creato 1 maggio 2026 sopra HEAD 84ff511 (M2.0 chiusa).
//
// Riferimenti:
//   - ADR-0001 (storage articoli pubblici via Markdown + Content Collections)
//   - docs/legacy/mapping-pilastri.md (mapping 113 articoli legacy → 6 pilastri)
//   - manuale operativo ecosistema digitale, sezione pilastri editoriali
//
// Astro 6.1.9 — Content Layer API con glob loader (NON la legacy
// `src/content/<collection>/` convention).

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Enum dei 6 pilastri editoriali + slot _da_assegnare per i casi sospesi
// (vedi M2.0 decisione D2: id_3578 Mattioli classificato _da_assegnare,
//  e fallback futuro per articoli non ancora classificati).
const pilastroEnum = z.enum([
  "1_storia_valli",
  "2_lingua_ladinita",
  "3_cultura_materiale",
  "4_rievocazioni_eventi",
  "5_identita_appartenenza",
  "6_vita_associativa",
  "_da_assegnare",
]);

// Collezione articoli — tutti gli articoli pubblici (legacy WP + nuovi).
// La pubblicazione effettiva è controllata dal flag `draft`:
//   draft: true   → presente in repo, MAI in build/sitemap/lista pubblica
//   draft: false  → visibile sul sito, indicizzato, in sitemap
//
// Default `draft: true` è consapevole: protegge dal pubblicare per errore.
// Il flip a false è un atto editoriale esplicito (ADR-0001 D3=C "primo").
const articoli = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articoli" }),

  schema: z.object({
    // OBBLIGATORI ----------------------------------------------------------

    /**
     * Titolo dell'articolo. Max 200 char è ampio: i titoli legacy WP più
     * lunghi visti in M2.0 erano sotto i 150 char. SEO consiglia ≤60, ma il
     * vincolo SEO lo applichiamo lato meta-title in M2.4, non qui.
     */
    title: z.string().min(1).max(200),

    /**
     * Data di pubblicazione (originale per i legacy, futura per i nuovi).
     * Coerce: accetta sia stringhe ISO `YYYY-MM-DD` che oggetti Date
     * pre-parsati dal frontmatter YAML.
     */
    data_pubblicazione: z.coerce.date(),

    /**
     * Pilastro editoriale di appartenenza. Vedi `pilastroEnum` sopra.
     * Lo slot `_da_assegnare` esiste apposta per non bloccare l'import
     * dei legacy con classificazione incerta.
     */
    pilastro: pilastroEnum,

    // OPZIONALI CON DEFAULT -----------------------------------------------

    /**
     * Tag liberi (lowercase, kebab-case raccomandato). Usati per
     * navigazione laterale, related posts e SEO long-tail.
     * Default: array vuoto (nessun tag).
     */
    tags: z.array(z.string()).default([]),

    /**
     * Flag draft. true = articolo non pubblicato. Filtrato in
     * getStaticPaths in M2.2 e nella sitemap in M2.4.
     * Default: true → safety-first, niente pubblicazioni accidentali.
     */
    draft: z.boolean().default(true),

    /**
     * Flag archivio (M2.3). true = articolo storico/legacy, leggibile ma
     * fuori dalle liste-pilastro di produzione: confluisce nella pagina
     * /archivio-storico (raggruppato per anno, stile in sordina).
     *   archivio: false → compare nella lista del proprio pilastro
     *   archivio: true  → compare solo in /archivio-storico
     * Entrambi gli stati restano !draft ⇒ pagina /articoli/{slug} generata.
     * Default: false → un articolo è "in produzione" salvo decisione esplicita.
     * NB: il campo è presente nel frontmatter di tutti i 113 legacy (M2.3);
     * qui lo dichiariamo nello schema così `entry.data.archivio` è tipato
     * e non viene scartato da Zod.
     */
    archivio: z.boolean().default(false),

    /**
     * Autore. 95.6% degli articoli legacy WP (108/113) hanno
     * Cristian Bresadola come autore: lo mettiamo a default.
     * Le 5 eccezioni vanno indicate esplicitamente nel frontmatter
     * dell'articolo specifico.
     */
    autore: z.string().default("Cristian Bresadola"),

    // OPZIONALI PURI ------------------------------------------------------

    /**
     * URL dell'immagine hero. Per ora possono essere URL assoluti del
     * vecchio WordPress (`https://www.elbrenz.eu/wp-content/...`) finché
     * la migrazione media non viene fatta in M2.3.1 (opzionale, post-import).
     * Per i nuovi articoli: path relativo a /public/ (es.
     * `/img/articoli/foo.jpg`) oppure import asset Astro.
     */
    hero_image: z.string().url().or(z.string().startsWith("/")).optional(),

    /**
     * Testo alternativo per hero_image. OBBLIGATORIO se hero_image è
     * presente — vincolo enforced da .superRefine() sotto.
     * Accessibilità (WCAG 1.1.1): qualunque immagine informativa
     * deve avere un alt esplicito.
     */
    hero_alt: z.string().min(1).max(250).optional(),

    /**
     * Riassunto breve per lista articoli e meta-description.
     * Max 300 per lasciare margine: la meta-description finale (140-160)
     * sarà troncata o riformulata in M2.4.
     */
    excerpt: z.string().max(300).optional(),

    /**
     * ID originale del post WordPress legacy (es. 3805 per la Guerra Rustica).
     * Solo per gli articoli importati. Ci serve per:
     *   - tracciare la provenienza
     *   - generare redirect permanenti dal vecchio URL al nuovo (M2.4)
     *   - debug e ricognizioni
     */
    legacy_wp_id: z.number().int().positive().optional(),
  })
  // Vincolo incrociato: hero_image presente ⇒ hero_alt obbligatorio.
  // Astro Zod supporta .superRefine; usiamo .refine per leggibilità.
  .refine(
    (data) => !data.hero_image || (data.hero_image && data.hero_alt && data.hero_alt.length > 0),
    {
      message:
        "hero_alt è obbligatorio quando hero_image è presente (accessibilità WCAG 1.1.1).",
      path: ["hero_alt"],
    },
  ),
});

// Collezione eventi (M2.4) — calendario dei prossimi appuntamenti, mostrato
// nel blocco "Prossimi eventi" della home (data >= oggi, max 3).
// Un file markdown per evento in src/content/eventi/, nome convenzionale
// YYYY-MM-DD-slug-breve.md; il body è la descrizione estesa (non ancora
// renderizzata: servirà per future pagine evento).
//
// Nomi campi in italiano, coerenti col dominio (il brief M2.4 li fissa così).
// NB discrepanza consapevole con la collection articoli, che usa nomi misti
// inglesi (title, draft) per ragioni storiche di import WP: qui draft si
// chiama `bozza` e la data `data`.
const eventi = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/eventi" }),

  schema: z.object({
    /** Titolo dell'evento. */
    titolo: z.string().min(1).max(200),

    /** Data dell'evento (giorno). Coerce come data_pubblicazione degli articoli. */
    data: z.coerce.date(),

    /** Ora di inizio, testo libero breve, es. "20:30". */
    oraInizio: z.string().optional(),

    /** Luogo, es. "Malè, Sala civica". */
    luogo: z.string().optional(),

    /** Descrizione breve per la card in home. */
    descrizioneBreve: z.string().optional(),

    /** Eventuale link a pagina esterna/locandina. */
    link: z.string().url().optional(),

    /** Eventuale immagine (path in /public/ o URL). */
    immagine: z.string().optional(),
    /** Testo alternativo dell'immagine (accessibilità). */
    imageAlt: z.string().optional(),

    /** true = evento annullato: non compare in home. */
    annullato: z.boolean().default(false),

    /** true = bozza: mai mostrato. Default false a differenza degli articoli:
     *  un evento si crea di norma per pubblicarlo subito. */
    bozza: z.boolean().default(false),
  }),
});

// Collezione rubrica (M2.8) — "Una terra, cinque lingue": la rubrica mensile
// trilingue di El Brenz pubblicata anche su UT24 (unsertirol24.com),
// collaborazione con credito e link sempre presenti.
// Un file per uscita: src/content/rubrica/YYYY-MM-slug.md
// Corpo: TRE sezioni nell'ordine ladino → italiano → tedesco, separate dagli
// heading fissi "## Ladin anaunic", "## Italiano", "## Deutsch" che il layout
// riconosce (ancore + attributi lang). Il ladino viene SEMPRE per primo:
// scelta identitaria. Pilastro editoriale di riferimento: Lingua e ladinità.
const rubrica = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/rubrica" }),

  schema: z.object({
    /** Titolo in ladino anaunico — SEMPRE presente, mostrato per primo. */
    titolo_lad: z.string().min(1).max(200),
    /** Titolo italiano. */
    titolo_it: z.string().min(1).max(200),
    /** Titolo tedesco. */
    titolo_de: z.string().min(1).max(200),

    /** Data di uscita (mensile). */
    data: z.coerce.date(),

    /** Autore, di norma la firma collettiva. */
    autore: z.string().default("El Brenz"),

    /** Link all'uscita originale su UT24 (credito obbligatorio quando c'è). */
    link_ut24: z.string().url().optional(),

    /** Estratto italiano per card e meta description. */
    estratto_it: z.string().max(300),

    /** true = non pubblicata (come `bozza` degli eventi). */
    bozza: z.boolean().default(false),
  }),
});

export const collections = { articoli, eventi, rubrica };
