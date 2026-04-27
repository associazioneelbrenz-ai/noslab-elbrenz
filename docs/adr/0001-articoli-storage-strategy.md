# ADR-0001 — Strategia di storage e rendering degli articoli pubblici

- **Stato**: ACCEPTED
- **Data decisione**: 2026-04-26
- **Decisori**: Cristian Bresadola (super_admin)
- **Consultato**: Claude assistant
- **Milestone di riferimento**: M2 — Articoli pubblici (sito vetrina)
- **File nel repo**: `docs/adr/0001-articoli-storage-strategy.md`

---

## Contesto

`noslab-elbrenz` è il sito vetrina pubblico dell'Associazione El Brenz, in produzione su Netlify, costruito con Astro 6.1.9 + adapter `@astrojs/netlify`. M0–M1.7.1 chiuse: layout, branding, PWA installabile, `ArticleLayout.astro` riusabile pronto.

M2 introduce articoli pubblici dinamici. Vincoli:

1. Audience pubblica con SEO critico, niente auth.
2. 142+ articoli legacy WordPress da migrare. WP vecchio ancora online, accesso admin disponibile → export WXR fattibile in autonomia.
3. Editor unico (Cristian). PWA soci arriverà da M3 in poi.
4. Deploy ZIP manuale, SQL via dashboard. Niente CI/CD oggi.

---

## Decisione

### D1 — Storage: **Markdown in `src/content/articoli/` con Astro Content Collections**

Gli articoli vivono come file `.md` versionati in git, validati da uno schema Zod nella content config di Astro. Niente tabella `articoli` su Supabase per M2.

### D2 — Rendering: automatico via Content Collections

`getStaticPaths` legge la collection a build-time e genera HTML statici. Ogni `git push` su `main` triggera il rebuild Netlify automatico — niente build hook custom da scrivere.

### D3 — Import legacy: **bulk con `draft: true`, pubblicazione progressiva**

Script Node parsa l'export WXR del WordPress legacy e genera 142 file `.md` in `src/content/articoli/`, **tutti con `draft: true` nel frontmatter**. Lo schema Zod esclude le bozze dal build di produzione. Cristian rilegge un articolo alla volta e pubblica flippando il flag → `git push` → online entro 60-90 secondi.

---

## Razionale

L'editor è e resta uno (Cristian). "Publish = git push" è coerente con la realtà operativa attuale e dimezza la stima di M2 (4-7h vs 7-12h dell'opzione DB). Niente backoffice da costruire, niente Edge Function per build hook, niente RLS da configurare per articoli pubblici (cosa peraltro paradossale: i contenuti sono pubblici per definizione).

L'opzione DB Supabase (D1=A scartata) avrebbe vinto in uno scenario con editor multipli o interazione articoli↔soci immediata. Né l'uno né l'altro vale per M2.

Il debito tecnico futuro è esplicito: **quando in M3-M4 i soci interagiranno con articoli** (commenti, bookmark, "ti è piaciuto", reazioni in lingua locale), serviranno chiavi di join verso utenti soci. A quel punto si valuta una di due strade:

- **3a** — Tabella Supabase `articoli` *minimale* (solo `slug`, `id` UUID, contatori, FK target di altre tabelle), il body resta in markdown. Markdown e DB convivono.
- **3b** — Migrazione completa a DB del body. Fattibile in 1 sessione con script reverse del bulk-import.

La decisione su 3a vs 3b si rinvia al primo scenario reale che la richiede (M4 forum o successivo). Non si fa refactor proattivo — regola ferrea.

---

## Conseguenze

### Positive
- M2 dimezzata in stima (4-7h invece di 7-12h)
- Zero costi runtime sugli articoli (file statici puri serviti da Netlify CDN)
- Versioning git completo: ogni modifica articolo è tracciata, recuperabile, diff-abile
- Schema Zod validato a build-time → impossibile pubblicare un articolo con campi mancanti o malformati
- SEO immediato: HTML statico pre-renderizzato, sitemap.xml automatica
- Editor singolo su VS Code è esperienza nativa per Cristian (no UI da imparare)

### Negative / debito accettato
- Editor futuri non-tecnici dovrebbero imparare git (problema solo se si materializza)
- Nessun "publish at" schedulato: la data di pubblicazione effettiva = il momento del `git push`. Se serve schedulazione si introduce dopo.
- Migrazione futura a DB ineliminabile quando i soci interagiranno con gli articoli — accettata
- I 142 legacy stanno tutti nel repo come file → repo dimensione cresce. Stima: 142 × 30KB medi = ~4MB body + media esterni. Trascurabile.
- Media (immagini articoli legacy) restano referenziate al loro URL originale sul vecchio WP. Migrazione media è task separato (vedi nota in M2.3).

### Neutre
- Ogni articolo nuovo richiede un commit. Non un problema oggi.
- Ricerca full-text articoli (utile in M5 archivio) si farà via indice client-side (Pagefind, Fuse.js) o via DB minimale 3a se si va in quella direzione.

---

## Roadmap M2 — versione finale

| Codice | Titolo | Output | Stima |
|---|---|---|---|
| **M2.0** | Ricognizione legacy WP | Login WP admin → Tools → Export → "All content" → scarica WXR XML. Audit del file: numero articoli reali, struttura body (Gutenberg / classico / shortcode), media URL, tag/categorie usati, date, autori. Decisione mapping **categorie WP → 6 pilastri El Brenz**. Output: `docs/legacy/audit.md` + `docs/legacy/mapping-pilastri.md` + il file WXR salvato (gitignored o in `docs/legacy/raw/`). | 30-60min |
| **M2.1** | Schema Astro Content Collections | `src/content.config.ts` con schema Zod per collezione `articoli`: `title`, `slug`, `data_pubblicazione`, `pilastro` (enum 6 valori), `tags` (array), `draft` (boolean default true), `hero_image`, `hero_alt`, `excerpt`, `autore`, `legacy_wp_id` (opzionale, traccia origine). 2 articoli a mano per validare schema + render. | 45-60min |
| **M2.2** | Pagine `/articoli` (lista) + `/articoli/[slug]` (dettaglio) | `src/pages/articoli/index.astro` lista paginata 12/pagina con card (hero + titolo + excerpt + tag pilastro), filtro per pilastro come chips. `src/pages/articoli/[slug].astro` riusa `ArticleLayout.astro`, `getStaticPaths` filtra `draft===false`. 3 articoli seed manuali per validazione visiva (1 per pilastro). | 90-120min |
| **M2.3** | Script bulk import WXR → markdown | `scripts/import-wp-legacy.mjs`: parser WXR (libreria `wordpress-export-to-markdown` o simili — da valutare in M2.0), conversione body HTML → Markdown via `turndown`, mapping categorie WP → pilastri El Brenz secondo `mapping-pilastri.md`, generazione 142 file `.md` in `src/content/articoli/` **con `draft: true`**. Verifica: build passa, lista mostra solo i 3 seed (non i 142 legacy in bozza). Media legacy → URL originali (migrazione media rinviata a task M2.3.1 opzionale). | 90-150min |
| **M2.4** | SEO + sitemap dinamica | Meta tags per articolo (`<title>`, `<meta description>`, og:image, twitter card, canonical). `@astrojs/sitemap` configurato per includere solo `draft===false`. `robots.txt` aggiornato con riferimento sitemap. JSON-LD `Article` schema.org. | 45-60min |
| **M2.5** | Service worker integration (ex M1.7.1 residuo) | `public/sw.js` cacha le pagine articolo lette con strategia stale-while-revalidate. Bump versione cache a `v2`. Test offline iPhone: leggi articolo → modalità aereo → ricarica → contenuto disponibile. | 30-45min |

**Totale**: 5.5-9 ore distribuite in 4-6 sessioni di lavoro.

### Cosa NON fa M2

- Backoffice admin di pubblicazione → non serve, publish = git push
- Tabella `articoli` su Supabase → rinviata a quando i soci dovranno interagire (M4+)
- Migrazione media legacy (download immagini dal vecchio WP a `public/articoli/`) → task opzionale M2.3.1, da decidere dopo M2.0 in base a quanti media reali ci sono
- Commenti, bookmark, reazioni → fuori scope M2
- Newsletter da articolo → fuori scope, eventuale M2.6 futuro

---

## Note di metodo

- ADR firmato e datato. Versionato nel repo a `docs/adr/0001-articoli-storage-strategy.md`.
- Eventuale ribaltamento futuro (es. migrazione obbligatoria a DB in M4) → ADR-0002 con riferimento esplicito a questo, no editing del presente.
- "Regola ferrea": niente refactor proattivo. Se in M3-M4 emerge necessità di interazione articoli↔soci, si discute, si scrive ADR-0002, si decide se 3a (DB minimale) o 3b (migrazione completa).
- Mapping `categorie WP → 6 pilastri El Brenz` è una **decisione editoriale di Cristian**, non tecnica. Va presa in M2.0 e congelata in `docs/legacy/mapping-pilastri.md` prima di M2.3.
