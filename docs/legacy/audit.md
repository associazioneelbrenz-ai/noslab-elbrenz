# Audit legacy WordPress — `www.elbrenz.eu`

- **Data audit**: 2026-04-27
- **File analizzato**: `associazionestoricoculturalelinguistica*el-brenz*_WordPress_2026-04-27.xml` (1.8 MB, WXR v1.2)
- **Strumento**: parser Python `xml.etree`, eseguito da Claude in fase M2.0
- **Output collegati**: [`mapping-pilastri.md`](./mapping-pilastri.md)

> Questo audit fotografa lo stato del WordPress legacy alla data di esportazione.
> Lo usiamo come input per M2.1 (schema Content Collection) e M2.3 (script bulk import WXR → Markdown).

---

## 1. Numeri reali

| Metrica | Valore |
|---|---|
| Items totali nel WXR | 360 |
| **Articoli** (`post_type=post`) | **113** |
| Pagine | 0 |
| Allegati (media library) | 247 |
| Articoli pubblicati | 107 |
| Articoli in bozza | 6 |
| Articoli privati / schedulati / cestinati / password protected | 0 |

⚠️ **La stima ADR-0001 era 142+. Il numero reale è 113.** Il delta non cambia nessuna decisione architetturale, ma aggiorna la stima M2.3 del 20% in meno (115-130 minuti invece di 90-150).

---

## 2. Distribuzione temporale

```
2013: ████████████████████████████████  65   (anno di lancio del sito)
2014: ████  8
2015: ██  5
2016: ▍ 1
2017: ███  7
2018: ███  6
2019: ██  4
2020:    0   (gap pandemico)
2021: ██  5
2022: ▍ 1
2023:    0   (gap)
2024: ▍ 1
2025: █████  9   (rilancio editoriale)
2026: ▍ 1
```

**Lettura**: il 2013 è l'anno di carica iniziale (58% degli articoli). Poi la produzione cala drasticamente con due gap completi (2020 e 2023). Il 2025 segna un rilancio editoriale evidente con 9 articoli.

**Implicazione editoriale**: i 65 articoli del 2013 sono il corpus storico da rileggere con più attenzione in fase di pubblicazione progressiva (D3 dell'ADR-0001). Molti potrebbero essere informazioni datate (eventi passati, "summer camp 2013", iniziative concluse) e potrebbero non valere la pena di pubblicare nel nuovo sito.

---

## 3. Autori

| Autore | Articoli |
|---|---:|
| Cristian Bresadola (`Masterbrenz`) | 108 |
| Marco Anselmi (`AnSeLM1x`) | 2 |
| Michele Bortolameolli (`Mikele`) | 2 |
| Massimo Paternoster | 1 |
| Paolo Antonioni (`Paolac`) | 0 (account dichiarato, mai pubblicato) |

Cristian è autore del 95.6% degli articoli. Decisione di policy per M2.1 (schema): il campo `autore` nel frontmatter è **obbligatorio** ma con default `Cristian Bresadola`. Per i 5 articoli scritti da altri autori, il valore va impostato esplicitamente.

---

## 4. Stile del corpo articolo

| Stile | Articoli | Note |
|---|---:|---|
| HTML classico (editor pre-Gutenberg) | **94** | Conversione `turndown` standard, pulizia minima |
| Misto Gutenberg + HTML classico | 18 | Articoli più recenti con qualche blocco Gutenberg incapsulato in HTML legacy |
| Plaintext | 0 | — |
| Body vuoto | 1 | Articolo ID 1341 (Tiroler Landlibell, draft senza titolo) |

✅ **Notizia ottima per M2.3**: zero Gutenberg puro. Il 95% dei body è HTML classico, che è il caso più semplice da convertire in Markdown.

### Lunghezza body

| Statistica | Caratteri |
|---|---:|
| Minima | 0 |
| Mediana | 3.623 |
| Media | 5.727 |
| Massima | 46.659 |

Lunghezza tipica: 3-6 KB di HTML, equivalenti a 800-1.200 parole. Ci sono articoli "monstre" oltre i 40 KB (probabili pubblicazioni di ricerca o trascrizioni).

---

## 5. Shortcode usati

15 shortcode unici, distribuiti in pochi articoli. La gran parte è gestibile.

| Shortcode | Occorrenze | Strategia M2.3 |
|---|---:|---|
| `[download]` | 11 | Convertire in link `[testo](url)` |
| `[embed]` | 9 | Gestire come embed YouTube/Vimeo (oEmbed → iframe o link) |
| `[link]` | 5 | Convertire in link Markdown |
| `[pdf]` | 2 | Convertire in link Markdown verso PDF |
| `[pressnotes]` | 2 | Plugin specifico, da rimuovere e annotare |
| `[contact-form-7]` | 1 | Rimuovere (form non migrato) |
| `[warning]`, `[nnsbruck]`, `[ma]`, `[matteo]`, `[i]`, `[a]`, `[sotto]`, `[clicca]` | 1 ciascuno | **Errori di battitura** dell'autore (parentesi quadre incidentali). Lasciare il testo, rimuovere parentesi |

✅ **Nessun shortcode bloccante.** I 7 "shortcode" da 1 occorrenza sono falsi positivi: testo legittimo dell'articolo che il parser ha riconosciuto come shortcode per via delle quadre.

⚠️ **Galleria e caption**: zero `[gallery]` e zero `[caption]`. Le immagini sono sempre `<img>` HTML standard. Nessun shortcode di layout fotografico da gestire.

---

## 6. Media (immagini)

| Metrica | Valore |
|---|---:|
| Articoli con immagini | 103 (91%) |
| Articoli senza immagini | 9 |
| Immagini totali (tag `<img>`) | 235 |
| Immagini interne (`elbrenz.eu/wp-content/uploads/`) | 167 (71%) |
| Immagini esterne (link a domini terzi) | 68 (29%) |
| Allegati nella media library del WXR | 247 |
| Embed/iframe (video YouTube ecc.) | 11 |

### Decisione media in M2.3

**ADR-0001 prevede**: media legacy referenziati ai loro URL originali sul vecchio WP. Migrazione media è task opzionale `M2.3.1`.

**Raccomandazione**: dato che il WP legacy `www.elbrenz.eu` è ancora online e amministrato (lo è oggi), gli URL `wp-content/uploads/...` continueranno a funzionare. Il nuovo sito Astro che diventerà `www.elbrenz.eu` deve però condividere lo stesso dominio, quindi:

- **Opzione A** (consigliata): gli URL `https://www.elbrenz.eu/wp-content/uploads/...` referenziano file che dovranno restare accessibili anche dopo il go-live del nuovo sito. Soluzione: copiare la cartella `wp-content/uploads/` nel nuovo deploy (es. `public/wp-content/uploads/`) o configurare un reverse proxy/redirect.
- **Opzione B**: scaricare in massa i 167 media interni in `public/articoli/legacy-media/` e riscrivere gli URL nei `.md` durante l'import.

**Decisione rinviata a M2.3.1**, dopo discussione con Cristian. Per ora, gli URL restano puntati al vecchio WP.

⚠️ **68 immagini esterne** (Facebook, archive.org, siti istituzionali) sono soggette a link rot. Vanno verificate al momento della pubblicazione progressiva di ogni articolo.

---

## 7. Tassonomia: categorie e tag

### Categorie WP dichiarate (6)

| Categoria | Occorrenze totali | Categoria primaria* |
|---|---:|---:|
| **Home** (categoria-ombrello, presente su quasi tutto) | 101 | 31 |
| Eventi e Manifestazioni | 53 | 29 |
| Euregio | 48 | 48 |
| Storia e cultura | 33 | 2 |
| Lingua delle Valli del Noce | 32 | 1 |
| Senza categoria | 1 | 1 |

*"Categoria primaria" = la prima categoria semantica diversa da `Home` e `Senza categoria` assegnata a quell'articolo.

**Lettura cruciale**: `Home` è una categoria di servizio che è stata applicata a moltissimi articoli senza valore semantico. Va **ignorata** nel mapping ai pilastri El Brenz. I 31 articoli che hanno **solo** `Home` come categoria sono effettivamente non classificati e vanno revisionati a mano (vedi `mapping-pilastri.md`).

### Tag WP (52 unici)

I tag più frequenti hanno solo 4 occorrenze massimo. Tag uso-singolo: la maggioranza.

Top 7:
- `ladino`, `val di non`, `val di pejo`, `val di rabbi`, `val di sole` (4 ciascuno)
- `giovani` (3)

Gli altri 45 tag hanno 1-2 occorrenze. **Conclusione**: il sistema di tag legacy è stato usato in modo sporadico e poco strutturato.

**Decisione M2.1 (schema)**: il campo `tags` del frontmatter sarà **opzionale** e popolato in import bulk con i tag WP esistenti (per traccia), ma il sistema di tag andrà ridisegnato a regime — probabilmente convergendo sui geografici (`val-di-non`, `val-di-sole`, `val-di-rabbi`, `val-di-pejo`) e sui tematici dell'identità editoriale El Brenz.

---

## 8. Anomalie

| Anomalia | Conteggio | Strategia |
|---|---:|---|
| Articoli senza titolo | 1 | ID 1341 (draft) — ignorabile, è già bozza |
| Articoli senza slug | 4 | Generare slug da titolo durante import (`slugify`) |
| Articoli con body vuoto | 1 | ID 1341 (draft) — ignorabile |
| Articoli password-protected | 0 | — |
| Bozze | 6 | Mantenute come `draft: true` (coerenti con D3 ADR-0001) |
| Autori mai pubblicati | 1 | Paolo Antonioni — ignorato in import |

**Articoli problematici da gestire esplicitamente nel parser** (`scripts/import-wp-legacy.mjs`):

- ID 1341: titolo vuoto + body presente ma in formato testo grezzo da Tiroler Landlibell → **probabilmente recuperabile**, da rivedere manualmente
- 4 articoli con `<wp:post_name>` vuoto: lo script genera slug da titolo via libreria `slugify` con opzioni `{lower: true, strict: true, locale: 'it'}`

---

## 9. Link uscenti — domini più citati

| Dominio | Occorrenze | Note |
|---|---:|---|
| europaregion.info | 93 | Sito Euregio Tirolo-Alto Adige-Trentino. **Link rot probabile**, verificare prima di pubblicare |
| facebook.com | 16 | Eventi/post FB; verificare se ancora online |
| lanostraautonomia.eu | 5 | — |
| slowfoodtrentinoaltoadige.it | 5 | — |
| centrostudivaldisole.it | 5 | Partner istituzionale |
| valleisarco.info | 5 | — |
| youtube.com | 4 | Embed video — verificare se ancora pubblici |

**Implicazione**: 93 link a `europaregion.info` su un sito che potrebbe essere stato ridisegnato. In fase di pubblicazione progressiva, controllo manuale obbligatorio link-per-link prima di togliere il `draft: true`.

---

## 10. Conclusioni operative per M2.1, M2.2, M2.3

### M2.1 — Schema Content Collection

Lo schema Zod deve avere:

- `title` (string, required) — gestire l'unico articolo senza titolo come bozza
- `slug` (string, required) — generato da titolo se assente
- `data_pubblicazione` (date, required)
- `pilastro` (enum 6 valori, required) — vedi `mapping-pilastri.md`
- `tags` (array string, optional, default `[]`)
- `draft` (boolean, default `true`)
- `hero_image` (string URL, optional) — può puntare ancora al vecchio WP
- `hero_alt` (string, optional ma raccomandato)
- `excerpt` (string, optional, max 200 char) — generato da prime 200 char se assente
- `autore` (string, default `Cristian Bresadola`)
- `legacy_wp_id` (number, optional) — ID dell'articolo nel WP originale, per tracciabilità

### M2.3 — Script bulk import

- Skip articoli con `wp:status = trash` (qui sono 0)
- Set `draft: true` per **tutti** i 113 articoli, indipendentemente dallo status WP
- Conversione body via `turndown` con regola custom per shortcode (vedi sez. 5)
- Slug generato con `slugify` se assente
- `data_pubblicazione` da `wp:post_date`
- Mapping categoria → pilastro come da `mapping-pilastri.md`
- Salvare `legacy_wp_id` per tracciabilità
- Output: 113 file `.md` in `src/content/articoli/`, naming `<data>-<slug>.md`

### Costi e tempi rivisti

- Repository: +113 file × 30KB medi = ~3.4 MB di body markdown. Trascurabile.
- Build Astro: 113 pagine in più (ma all'inizio solo gli `draft: false`, cioè quelli che Cristian pubblicherà progressivamente).
- M2.3 stima: rivista a **75-120 minuti** (giù dai 90-150 dell'ADR, perché 113 < 142 e il body è tutto HTML classico).

---

## 11. File generati in questo audit

- `docs/legacy/audit.md` — questo documento
- `docs/legacy/mapping-pilastri.md` — bozza mapping categorie WP → 6 pilastri El Brenz
- `docs/legacy/raw/elbrenz_wxr.xml` — file WXR originale (gitignored, vedi `.gitignore`)

Il file WXR raw va escluso da git per due motivi:
1. Contiene autori, email, eventuali bozze private
2. È un export "fotografia" rigenerabile in qualsiasi momento dal WP

Aggiungere a `.gitignore`:

```
docs/legacy/raw/
docs/legacy/raw/*
```

---

*Audit a cura di Claude assistant per Cristian Bresadola, sessione M2.0 del 2026-04-27.*
