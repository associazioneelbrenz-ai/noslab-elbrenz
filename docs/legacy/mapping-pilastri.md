# Mapping categorie WP → 6 pilastri editoriali El Brenz

- **Data**: 2026-04-27
- **Stato**: BOZZA — richiede revisione editoriale di Cristian Bresadola
- **Decisione**: editoriale, non tecnica
- **Output collegati**: [`audit.md`](./audit.md)

> Questo documento traduce le 6 categorie WordPress legacy nei 6 pilastri editoriali del manuale operativo El Brenz, articolo per articolo dove serve.
>
> È **input vincolante** per `scripts/import-wp-legacy.mjs` (M2.3): il valore del campo `pilastro` nel frontmatter di ogni file `.md` generato deriva da qui.
>
> Una volta congelato, **non si modifica più**. Modifiche successive vanno fatte direttamente sui file `.md` post-import durante la pubblicazione progressiva.

---

## 1. I 6 pilastri editoriali

Dal manuale operativo dell'ecosistema digitale El Brenz:

| ID | Pilastro | Sintesi |
|---|---|---|
| `1_storia_valli` | **1. Storia delle Valli** | Eventi, personaggi, feudi Thun/Spaur/Nanno, Guerre Rustiche, Grande Guerra, Tirolo asburgico, catasto tavolare |
| `2_lingua_ladinita` | **2. Lingua e ladinità** | Etimologie, proverbi, poesie, progetto "Os dal Nos" |
| `3_cultura_materiale` | **3. Cultura materiale** | Stua, mulini, fucine, utensili, architettura alpina |
| `4_rievocazioni_eventi` | **4. Rievocazioni ed eventi** | Gite sociali, serate storiche, presentazioni, concorsi |
| `5_identita_appartenenza` | **5. Identità e appartenenza** | Ponte con catalani, occitani, ladini dolomitici; diaspora trentina; ricorrenze tirolesi |
| `6_vita_associativa` | **6. Vita associativa** | Tesseramento, lunari, pubblicazioni, ringraziamenti |

---

## 2. Regola automatica (priorità)

Per gli articoli che hanno **almeno una categoria semantica** (cioè non solo `Home` o `Senza categoria`), si applica questa regola di priorità decrescente. La prima che matcha vince:

| Priorità | Categoria WP | → Pilastro | Articoli mappati |
|---:|---|---|---:|
| 1 | `Lingua delle Valli del Noce` | `2_lingua_ladinita` | 32 |
| 2 | `Storia e cultura` | `1_storia_valli` | 22 |
| 3 | `Eventi e Manifestazioni` | `4_rievocazioni_eventi` | 8 |
| 4 | `Euregio` | `5_identita_appartenenza` | 18 |

**Razionale priorità**: se un articolo è classificato sia "Lingua" che "Storia", la lingua è il taglio editoriale dominante. Se è "Eventi" e "Storia e cultura", l'evento è la cornice. `Euregio` è la categoria più trasversale (riguarda comunque il rapporto Tirolo-Alto Adige-Trentino) ed è più sicuro mapparla a "Identità" come categoria di fallback.

**Totale automatico mappato**: 80 articoli su 113.

---

## 3. Articoli da assegnare a mano (33 articoli)

Sono i 32 articoli con **solo `Home`** + 1 articolo con **`Senza categoria`**.

Ho fatto una proposta articolo-per-articolo basata su titolo + data + (dove serve) primi 400 caratteri del body. **Va validata da Cristian.**

### Lista completa con proposta di pilastro

| ID WP | Data | Status | Titolo | Pilastro proposto | Note Claude |
|---:|---|---|---|---|---|
| 226 | 2013-04-27 | publish | Avanti tutta!!!!!!!! | `6_vita_associativa` | Articolo di lancio sito ("il sito sta crescendo") |
| 1341 | 2013-10-07 | draft | (no title — Tiroler Landlibell 1511) | `1_storia_valli` | Trascrizione storica, draft incompleto da rivedere |
| 1361 | 2013-10-07 | publish | SunS 2013 | `4_rievocazioni_eventi` | Festival Sun.S — concorso musicale |
| 1402 | 2014-01-16 | publish | Assemblea Annuale dei Soci | `6_vita_associativa` | Vita associativa pura |
| 3440 | 2019-12-12 | draft | IN DISTRIBUZIONE IL LUNARI DAL NOS 2020 | `6_vita_associativa` | Pubblicazione associativa |
| 3578 | 2021-12-10 | draft | Mattioli | ⚠️ **da verificare** | Titolo cripto — cognome? leggere body |
| 3757 | 2025-01-03 | draft | BREVE INTRODUZIONE ALLA STORIA E ALLA CULTURA TIROLESI | `5_identita_appartenenza` | Manifesto identitario; alternativa: `1_storia_valli` |
| 3828 | 2025-09-21 | draft | Conferenza: L'insurrezione tirolese del 1809 | `4_rievocazioni_eventi` | Conferenza storica; alternativa: `1_storia_valli` |
| 473 | 2013-05-08 | publish | ESN EUREGIO MEETING DAL 16 AL 19 MAGGIO 2013 | `5_identita_appartenenza` | Era "Senza categoria" |
| 766 | 2013-06-05 | publish | "Le Lacrime delle Dolomiti di Sesto" | `1_storia_valli` | Probabilmente Grande Guerra |
| 769 | 2013-06-05 | publish | LA REGIONE DI PILSEN SI PRESENTA AL CASTELLO DEL BUONCONSIGLIO | `4_rievocazioni_eventi` | Evento al Buonconsiglio |
| 782 | 2013-06-06 | publish | TERMINE DELLE ISCRIZIONI AL PREMIO GIOVANI RICERCATORI DELL'EUREGIO | `5_identita_appartenenza` | Premio Euregio |
| 935 | 2013-06-30 | publish | Le reliquie di San Romedio | `4_rievocazioni_eventi` | Esposizione reliquie; alternativa: `1_storia_valli` |
| 999 | 2013-08-30 | publish | BENTORNATI!!!! | `6_vita_associativa` | Comunicazione associativa |
| 1064 | 2013-09-04 | publish | "AEROPLANI NEMICI SONO SU TRENTO": LA MOSTRA A TORRE VANGA | `4_rievocazioni_eventi` | Mostra Grande Guerra |
| 1368 | 2013-10-16 | publish | MUSEO REGIONALE TIROLESE FERDINANDEUM | `5_identita_appartenenza` | Riflessione su istituzione tirolese |
| 1385 | 2013-12-22 | publish | Natale 2013 - Buone Feste a tutti!!!!! | `6_vita_associativa` | Auguri associativi |
| 2834 | 2014-03-15 | publish | "STORIE DI EMIGRATI E GUERRIERI DALLA VAL DI RABBI" | `1_storia_valli` | Storia/diaspora |
| 3038 | 2014-11-17 | publish | Buon viaggio Amico!!!! | `6_vita_associativa` | Probabile commemorazione (verificare) |
| 3049 | 2015-02-01 | publish | Si ricomincia con le Poesie dei primi mesi dell'anno! | `2_lingua_ladinita` | Poesie in lingua locale |
| 3099 | 2015-08-07 | publish | Trailer Documentario "Fioi dal Nos" | `2_lingua_ladinita` | Documentario sulla lingua |
| 3106 | 2015-08-08 | publish | OS DAL NOS - SCALETTA ESIBIZIONI | `2_lingua_ladinita` | Progetto musicale El Brenz; alternativa: `4_rievocazioni_eventi` |
| 3580 | 2021-12-13 | publish | CONFERENZA IN DIRETTA - EL BRENZ, REZIA E UNION LADIN NONESA INSIEME | `4_rievocazioni_eventi` | Conferenza con partner |
| 3585 | 2022-11-18 | publish | LUNARI DAL NOS 2023 - LA NOSA STORIA | `6_vita_associativa` | Pubblicazione associativa |
| 3741 | 2024-12-31 | publish | CONOSCI IL TUO TERRITORIO? METTITI ALLA PROVA | `5_identita_appartenenza` | Quiz divulgativo identitario |
| 3762 | 2025-02-13 | publish | Non e Sole sono due valli ladine - Il silenzio della PAT | `2_lingua_ladinita` | Articolo identitario sulla lingua |
| 3768 | 2025-08-14 | publish | Presentazione Libro Hände auf Tirol | `4_rievocazioni_eventi` | Presentazione libro |
| 3783 | 2025-08-16 | publish | Presentazione Disegno di Legge N. 1539: Riconoscimento Gruppo | `5_identita_appartenenza` | Tema riconoscimento identitario; alternativa: `2_lingua_ladinita` |
| 3805 | 2025-08-23 | publish | La Rivolta Contadina nelle Valli del Noce (1525) - Guerra Rustica | `1_storia_valli` | Storia: Guerre Rustiche è esempio del manuale |
| 3831 | 2025-10-05 | publish | Innsbruck ci chiama! Un Viaggio tra Storia Tirolese | `4_rievocazioni_eventi` | Gita sociale |
| 3839 | 2025-12-21 | publish | Un Regalo Speciale per il Nostro Compleanno: Nuova Community | `6_vita_associativa` | Lancio community soci |
| 3844 | 2025-12-24 | publish | La Certezza del Confine: Genesi del Catasto e del Sistema Tavolare | `1_storia_valli` | Storia: catasto tavolare è esempio del manuale |
| 3849 | 2026-01-25 | publish | IL CASO UNICO DEL REGGIMENTO IV/28: "I FIGLI DI PRAGA" IN VAL DI SOLE | `1_storia_valli` | Storia Grande Guerra |

### Articoli con asterisco da rivedere obbligatoriamente

- **ID 3578 "Mattioli"** (2021-12-10, draft): titolo non parlante, va aperto e letto. Cognome di una persona? Studio storico? Materiale per fucina Marinelli?
- **ID 1341 (no title)** (2013-10-07, draft): contiene la trascrizione del Tiroler Landlibell 1511. Valutare se completare bozza o cestinare.

---

## 4. Riepilogo distribuzione finale (con proposta Claude per i 33)

Se Cristian accettasse tutte le proposte Claude, la distribuzione finale sarebbe:

| Pilastro | Da regola automatica | Da revisione manuale | **Totale** |
|---|---:|---:|---:|
| 1. Storia delle Valli | 22 | 7 | **29** |
| 2. Lingua e ladinità | 32 | 4 | **36** |
| 3. Cultura materiale | 0 | 0 | **0** |
| 4. Rievocazioni ed eventi | 8 | 8 | **16** |
| 5. Identità e appartenenza | 18 | 6 | **24** |
| 6. Vita associativa | 0 | 7 | **7** |
| (da verificare body) | 0 | 1 | **1** |
| **TOTALE** | **80** | **33** | **113** |

⚠️ **Pilastro 3 — Cultura materiale rimane scoperto.**

Nessun articolo legacy è stato categorizzato esplicitamente come cultura materiale (mulini, fucine, stua, utensili, architettura). Tre possibilità:

1. Il legacy contiene articoli sul tema ma classificati come `Storia e cultura` → **rilettura editoriale durante pubblicazione progressiva** può spostarli a `3_cultura_materiale` modificando il frontmatter
2. È un'area in cui El Brenz ha pubblicato poco fino al 2025 → **opportunità editoriale** per il futuro: serie di articoli nuovi sul tema (Mulino Ruatti partner, fucina Marinelli citata nei tag, ecc.)
3. Va creato 1-2 articoli starter prima del go-live per non lasciare il pilastro vuoto sul nuovo sito

**Decisione editoriale di Cristian.** Per ora, il mapping bulk lascia il pilastro `3_cultura_materiale` con 0 articoli e si vedrà a regime.

---

## 5. Decisione richiesta a Cristian

Prima di chiudere M2.0 e procedere a M2.1:

### Approvi la **regola di priorità automatica** (sez. 2)?

- ☐ Sì, approvo
- ☐ No, modifica così: ___________

### Approvi le **proposte articolo-per-articolo** della sez. 3?

- ☐ Sì, tutte come da tabella
- ☐ Sì con queste correzioni: (lista ID + nuovo pilastro)
- ☐ Voglio rivedere prima i body di alcuni articoli specifici (lista ID)

### Approvi di **lasciare scoperto** il pilastro `3_cultura_materiale`?

- ☐ Sì, lo riempiremo con articoli nuovi a regime
- ☐ No, riassegno articoli legacy che secondo me ci stanno bene (lista ID con nuovo pilastro `3_cultura_materiale`)

### Articoli con asterisco

- ID 3578 "Mattioli" — vuoi che ti incolli i primi 1000 caratteri del body per decidere?
- ID 1341 Tiroler Landlibell — completare/cestinare?

---

## 6. Una volta congelato

Quando Cristian dà OK su tutte le righe sopra, questo file diventa **input vincolante** per `scripts/import-wp-legacy.mjs` (M2.3):

- Le righe della sez. 3 vanno tradotte in un dictionary `id_wp → pilastro` nel codice dello script
- Le 4 categorie WP semantiche vanno tradotte nel mapping di priorità della sez. 2

Ogni file `.md` generato avrà il campo `pilastro` del frontmatter già impostato secondo questo documento.

---

*Bozza a cura di Claude assistant. Le proposte sui 33 articoli sono "best guess" da titolo + data; la decisione finale è di Cristian Bresadola, super_admin di El Brenz.*
