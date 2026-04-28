# Mapping categorie WP → 6 pilastri editoriali El Brenz

- **Data decisione**: 2026-04-28
- **Stato**: **ACCEPTED** — decisioni editoriali confermate da Cristian Bresadola (super_admin)
- **Decisione**: editoriale, non tecnica
- **Output collegati**: [`audit.md`](./audit.md)
- **Storia**: bozza prodotta 2026-04-27 (commit `f1741bd`), validata e congelata 2026-04-28

> Questo documento traduce le 6 categorie WordPress legacy nei 6 pilastri editoriali del manuale operativo El Brenz, articolo per articolo dove serve.
>
> È **input vincolante** per `scripts/import-wp-legacy.mjs` (M2.3): il valore del campo `pilastro` nel frontmatter di ogni file `.md` generato deriva da qui.
>
> Documento congelato: modifiche successive vanno fatte direttamente sui file `.md` post-import durante la pubblicazione progressiva, non qui.

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

## 2. Regola automatica (priorità decrescente)

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

## 3. Articoli assegnati manualmente (33 articoli)

Sono i 32 articoli con **solo `Home`** + 1 articolo con **`Senza categoria`**.

Decisioni congelate da Cristian Bresadola il 2026-04-28.

### 6. Vita associativa (8 articoli)

| ID WP | Data | Status WP | Titolo | Pilastro |
|---:|---|---|---|---|
| 226 | 2013-04-27 | publish | Avanti tutta!!!!!!!! | `6_vita_associativa` |
| 999 | 2013-08-30 | publish | BENTORNATI!!!! | `6_vita_associativa` |
| 1385 | 2013-12-22 | publish | Natale 2013 - Buone Feste a tutti!!!!! | `6_vita_associativa` |
| 1402 | 2014-01-16 | publish | Assemblea Annuale dei Soci | `6_vita_associativa` |
| 3038 | 2014-11-17 | publish | Buon viaggio Amico!!!! | `6_vita_associativa` |
| 3440 | 2019-12-12 | draft | IN DISTRIBUZIONE IL LUNARI DAL NOS 2020 | `6_vita_associativa` |
| 3585 | 2022-11-18 | publish | LUNARI DAL NOS 2023 - LA NOSA STORIA | `6_vita_associativa` |
| 3839 | 2025-12-21 | publish | Un Regalo Speciale per il Nostro Compleanno: Nuova Community | `6_vita_associativa` |

### 1. Storia delle Valli (7 articoli)

| ID WP | Data | Status WP | Titolo | Pilastro |
|---:|---|---|---|---|
| 766 | 2013-06-05 | publish | "Le Lacrime delle Dolomiti di Sesto" | `1_storia_valli` |
| 1341 | 2013-10-07 | draft | (Tiroler Landlibell 1511 — bozza) | `1_storia_valli` |
| 2834 | 2014-03-15 | publish | "STORIE DI EMIGRATI E GUERRIERI DALLA VAL DI RABBI" | `1_storia_valli` |
| 3757 | 2025-01-03 | draft | BREVE INTRODUZIONE ALLA STORIA E ALLA CULTURA TIROLESI | `1_storia_valli` |
| 3805 | 2025-08-23 | publish | La Rivolta Contadina nelle Valli del Noce (1525) - Guerra Rustica | `1_storia_valli` |
| 3844 | 2025-12-24 | publish | La Certezza del Confine: Genesi del Catasto e del Sistema Tavolare | `1_storia_valli` |
| 3849 | 2026-01-25 | publish | IL CASO UNICO DEL REGGIMENTO IV/28: "I FIGLI DI PRAGA" IN VAL DI SOLE | `1_storia_valli` |

### 4. Rievocazioni ed eventi (8 articoli)

| ID WP | Data | Status WP | Titolo | Pilastro |
|---:|---|---|---|---|
| 769 | 2013-06-05 | publish | LA REGIONE DI PILSEN SI PRESENTA AL CASTELLO DEL BUONCONSIGLIO | `4_rievocazioni_eventi` |
| 935 | 2013-06-30 | publish | Le reliquie di San Romedio | `4_rievocazioni_eventi` |
| 1064 | 2013-09-04 | publish | "AEROPLANI NEMICI SONO SU TRENTO": LA MOSTRA A TORRE VANGA | `4_rievocazioni_eventi` |
| 1361 | 2013-10-07 | publish | SunS 2013 | `4_rievocazioni_eventi` |
| 3580 | 2021-12-13 | publish | CONFERENZA IN DIRETTA - EL BRENZ, REZIA E UNION LADIN NONESA INSIEME | `4_rievocazioni_eventi` |
| 3768 | 2025-08-14 | publish | Presentazione Libro Hände auf Tirol | `4_rievocazioni_eventi` |
| 3828 | 2025-09-21 | draft | Conferenza: L'insurrezione tirolese del 1809 | `4_rievocazioni_eventi` |
| 3831 | 2025-10-05 | publish | Innsbruck ci chiama! Un Viaggio tra Storia Tirolese | `4_rievocazioni_eventi` |

### 2. Lingua e ladinità (4 articoli)

| ID WP | Data | Status WP | Titolo | Pilastro |
|---:|---|---|---|---|
| 3049 | 2015-02-01 | publish | Si ricomincia con le Poesie dei primi mesi dell'anno! | `2_lingua_ladinita` |
| 3099 | 2015-08-07 | publish | Trailer Documentario "Fioi dal Nos" | `2_lingua_ladinita` |
| 3106 | 2015-08-08 | publish | OS DAL NOS - SCALETTA ESIBIZIONI | `2_lingua_ladinita` |
| 3762 | 2025-02-13 | publish | Non e Sole sono due valli ladine - Il silenzio della PAT | `2_lingua_ladinita` |

### 5. Identità e appartenenza (5 articoli)

| ID WP | Data | Status WP | Titolo | Pilastro |
|---:|---|---|---|---|
| 473 | 2013-05-08 | publish | ESN EUREGIO MEETING DAL 16 AL 19 MAGGIO 2013 | `5_identita_appartenenza` |
| 782 | 2013-06-06 | publish | TERMINE DELLE ISCRIZIONI AL PREMIO GIOVANI RICERCATORI DELL'EUREGIO | `5_identita_appartenenza` |
| 1368 | 2013-10-16 | publish | MUSEO REGIONALE TIROLESE FERDINANDEUM | `5_identita_appartenenza` |
| 3741 | 2024-12-31 | publish | CONOSCI IL TUO TERRITORIO? METTITI ALLA PROVA | `5_identita_appartenenza` |
| 3783 | 2025-08-16 | publish | Presentazione Disegno di Legge N. 1539: Riconoscimento Gruppo | `5_identita_appartenenza` |

### Sospeso — `_da_assegnare` (1 articolo)

L'articolo resta in bozza nel nuovo sistema. Cristian deciderà il pilastro durante la rilettura editoriale.

| ID WP | Data | Status WP | Titolo | Pilastro |
|---:|---|---|---|---|
| 3578 | 2021-12-10 | draft | Mattioli (titolo non parlante, da rileggere) | `_da_assegnare` |

---

## 4. Articoli con trattamento speciale

Decisioni editoriali aggiuntive prese in M2.0:

### ID 1341 — Tiroler Landlibell 1511

- **Status WP**: draft, no title, body grezzo (trascrizione storica)
- **Decisione**: importare come bozza nel nuovo sistema
- **Titolo placeholder generato**: `"Tiroler Landlibell 1511 — bozza"`
- **Pilastro**: `1_storia_valli`
- **Frontmatter**: `draft: true`
- **Razionale**: materiale potenzialmente recuperabile, vale la pena tenere in archivio per una eventuale ripresa editoriale futura.

### ID 3578 — "Mattioli"

- **Status WP**: draft, titolo cripto
- **Decisione**: importare come `_da_assegnare`/sospeso
- **Pilastro**: `_da_assegnare` (gestire in script come fallback enum)
- **Frontmatter**: `draft: true`
- **Razionale**: nessuna informazione editoriale al momento per classificarlo. Resta in bozza, decisione rinviata a rilettura post-import.

---

## 5. Distribuzione finale

| Pilastro | Da regola automatica | Da revisione manuale | **Totale** |
|---|---:|---:|---:|
| 1. Storia delle Valli | 22 | 7 | **29** |
| 2. Lingua e ladinità | 32 | 4 | **36** |
| 3. Cultura materiale | 0 | 0 | **0** |
| 4. Rievocazioni ed eventi | 8 | 8 | **16** |
| 5. Identità e appartenenza | 18 | 5 | **23** |
| 6. Vita associativa | 0 | 8 | **8** |
| Sospeso (`_da_assegnare`) | 0 | 1 | **1** |
| **TOTALE** | **80** | **33** | **113** |

### Decisione su pilastro 3 (Cultura materiale)

**Cristian Bresadola, 2026-04-28**: il pilastro `3_cultura_materiale` resta scoperto a 0 articoli. Verrà popolato con articoli nuovi a regime, sfruttando le partnership con Mulino Ruatti, Centro Studi Val di Sole, e potenziali contenuti su fucine, *stua*, architettura alpina.

Conseguenze tecniche per M2.2:
- La pagina lista `/articoli` con filtro per pilastro mostrerà la chip "Cultura materiale" comunque, anche se vuota
- Si può scegliere di nasconderla finché non c'è almeno 1 articolo: decisione di UX da prendere in M2.2

---

## 6. Decisioni editoriali aggiuntive prese in M2.0

### Strategia link rot per `europaregion.info` (93 link nei body legacy)

**Decisione (D4)**: durante la rilettura editoriale di ogni articolo prima di flippare `draft: false`, i link rotti verso `europaregion.info` (e in generale i link morti) vanno **rimossi mantenendo il testo del link**.

Esempio:
- HTML originale: `<a href="http://europaregion.info/news/123">Premio Giovani Ricercatori</a>`
- Markdown post-import: `[Premio Giovani Ricercatori](http://europaregion.info/news/123)` (lo script di import non sa quali sono morti)
- Post-revisione editoriale: `Premio Giovani Ricercatori` (solo testo, link rimosso)

Questa decisione si applica **manualmente al momento della pubblicazione progressiva**, non in bulk durante l'import.

---

## 7. Implementazione in `scripts/import-wp-legacy.mjs` (M2.3)

Il dictionary `id_wp → pilastro` per i 33 articoli manualmente classificati:

```javascript
// Mapping manuale dei 33 articoli con solo "Home" o "Senza categoria"
// Decisione editoriale di Cristian Bresadola, 2026-04-28
const MANUAL_PILLAR_MAP = {
  // 6_vita_associativa (8)
  226: '6_vita_associativa',
  999: '6_vita_associativa',
  1385: '6_vita_associativa',
  1402: '6_vita_associativa',
  3038: '6_vita_associativa',
  3440: '6_vita_associativa',
  3585: '6_vita_associativa',
  3839: '6_vita_associativa',
  
  // 1_storia_valli (7)
  766: '1_storia_valli',
  1341: '1_storia_valli',
  2834: '1_storia_valli',
  3757: '1_storia_valli',
  3805: '1_storia_valli',
  3844: '1_storia_valli',
  3849: '1_storia_valli',
  
  // 4_rievocazioni_eventi (8)
  769: '4_rievocazioni_eventi',
  935: '4_rievocazioni_eventi',
  1064: '4_rievocazioni_eventi',
  1361: '4_rievocazioni_eventi',
  3580: '4_rievocazioni_eventi',
  3768: '4_rievocazioni_eventi',
  3828: '4_rievocazioni_eventi',
  3831: '4_rievocazioni_eventi',
  
  // 2_lingua_ladinita (4)
  3049: '2_lingua_ladinita',
  3099: '2_lingua_ladinita',
  3106: '2_lingua_ladinita',
  3762: '2_lingua_ladinita',
  
  // 5_identita_appartenenza (5)
  473: '5_identita_appartenenza',
  782: '5_identita_appartenenza',
  1368: '5_identita_appartenenza',
  3741: '5_identita_appartenenza',
  3783: '5_identita_appartenenza',
  
  // _da_assegnare (1) - sospeso, rilettura editoriale
  3578: '_da_assegnare',
};
```

Regola di priorità per i restanti 80 articoli (con categoria semantica):

```javascript
const CATEGORY_PRIORITY = [
  ['Lingua delle Valli del Noce', '2_lingua_ladinita'],
  ['Storia e cultura',            '1_storia_valli'],
  ['Eventi e Manifestazioni',     '4_rievocazioni_eventi'],
  ['Euregio',                     '5_identita_appartenenza'],
];

function getPillar(wpId, wpCategories) {
  if (MANUAL_PILLAR_MAP[wpId]) return MANUAL_PILLAR_MAP[wpId];
  for (const [wpCat, pillar] of CATEGORY_PRIORITY) {
    if (wpCategories.includes(wpCat)) return pillar;
  }
  return '_da_assegnare'; // fallback (non dovrebbe mai capitare)
}
```

### Trattamento speciali per ID 1341

```javascript
// In import script
if (post.id === '1341' && (!post.title || post.title.trim() === '')) {
  post.title = 'Tiroler Landlibell 1511 — bozza';
}
```

### Schema Zod (M2.1) — enum pilastri

Lo schema della collection deve includere `_da_assegnare` come valore valido:

```typescript
pilastro: z.enum([
  '1_storia_valli',
  '2_lingua_ladinita',
  '3_cultura_materiale',
  '4_rievocazioni_eventi',
  '5_identita_appartenenza',
  '6_vita_associativa',
  '_da_assegnare',
])
```

---

## 8. Nota di metodo

Documento congelato a stato ACCEPTED in data 2026-04-28.

Modifiche successive non si fanno qui. Vanno fatte direttamente sul file `.md` dell'articolo in `src/content/articoli/` durante la fase di pubblicazione progressiva (cambiando il valore del campo `pilastro` nel frontmatter).

Se in futuro emerge necessità di modificare la regola automatica (sez. 2) o il mapping di gruppi grandi di articoli, → ADR-0002 con riferimento esplicito a questo documento.

---

*Mapping editoriale finale validato da Cristian Bresadola, super_admin di El Brenz, sessione M2.0 chiusa il 2026-04-28.*
