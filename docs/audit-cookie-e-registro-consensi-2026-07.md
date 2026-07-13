# Audit cookie (B.6) e registro dei consensi (B.7) — El Brenz

**Data:** 13 luglio 2026 · **Metodo:** verifica sul codice reale (form, edge, migrazioni, componenti). Parte del brief compliance.

---

## B.6 — Cookie e strumenti di tracciamento sui (nuovi) elementi

### Verdetto: conforme. Un'unica aggiunta fatta (Service Worker in cookie policy).

| Elemento | Comportamento reale | Esito |
|---|---|---|
| **Google Analytics 4** | Nessuno script `gtag`/GA presente nel sito (`src/`, `public/`). La categoria "analytics" del banner è predisposta ma **vuota**: nessun cookie `_ga` viene installato. | ✅ non attivo senza consenso |
| **Embed YouTube/Instagram** | `EmbedConsenso.astro` / `LightboxEmbed.astro`: il cookie `eb_embed_*` viene scritto **solo dentro l'handler del click** ("Carica"), mai al load. Prima del click nessuna richiesta a terzi. Il flag `cc_cookie` (categoria "embed") è controllato prima di ogni auto-load. | ✅ two-click, nessun dato pre-consenso |
| **Popup lead-gen** (libro, documentario) | I moduli non impostano cookie né localStorage: non persistono nulla lato client prima del consenso. Il consenso privacy è separato e obbligatorio. | ✅ nessun cookie pre-consenso |
| **Mappa (PAT/OSM)** | Caricamento su richiesta ("Carica la mappa"), fornitori pubblici senza cookie. | ✅ |
| **localStorage tecnici** | `elbrenz-auth` (sessione area soci, Supabase persistSession) e `andreas_widget_seen` (flag UX). Puramente funzionali, nessun tracciamento. | ✅ già dichiarati in cookie policy |
| **Service Worker / PWA** | `sw.js` registrato in `Layout.astro`: cache di pagine/risorse (Cache Storage) per offline e velocità. Nessun tracciamento. | ✅ **ora dichiarato** in cookie policy (era l'unica omissione) |
| **Cookie di consenso** | `cc_cookie` (vanilla-cookieconsent), necessario, 365 gg. | ✅ dichiarato |

**Fix applicato:** aggiunta la voce **Service Worker (PWA)** nella sezione "Cookie strettamente necessari" della cookie policy + bump data al 13/7/2026. La cookie policy già dichiarava correttamente tutto il resto (cc_cookie, sb-*, i due localStorage, GA4 non attivo, eb_embed, two-click).

---

## B.7 — Registro dei consensi

Il registro dei consensi richiede di poter dimostrare **chi** ha consentito, a **cosa** e **quando** (idealmente con la **versione** dell'informativa).

### Stato attuale per ciascun form

| Form / tabella | Consenso richiesto? | Cosa (colonne) | Quando | Chi | Versione informativa |
|---|---|---|---|---|---|
| **Tesseramento** (`domande_tesseramento`, edge `contact-form`) | Sì, `gdpr` obbligatorio server-side (rifiuta senza) | **non persistito come colonna** (citato nell'email di notifica) | `created_at` | nome, email | no |
| **Sportello "Porta la tua Storia"** | da verificare | migration **vuota nel repo** (tabella creata direttamente in DB) → verificare colonne in dashboard | presumid. `created_at` | sì | no |
| **Download libro/documentario** (`download_lead`) | Sì, `consenso_privacy` obbligatorio | `consenso_privacy`, `consenso_newsletter` (separati) | `created_at` | nome, email | no (jsonb `sorgente` presente) |
| **Guardiani** (`guardiani_contributori`) | Sì | `consenso_glossario`, `consenso_marketing`, `marketing_double_optin`, `marketing_confermato_il`, `consenso_firma`, `licenza_accettata`, `licenza_tipo` | `created_at`, `updated_at` | nome, email | no (jsonb `sorgente_utm` presente) |
| **Iscrizione gita** (`iscrizioni_gita`) | Sì, `consenso_privacy` | `consenso_privacy` | `created_at` | dati partecipante | no (jsonb `sorgente_utm`) |
| **Convenzioni** (`convenzioni`) | Sì | `accettazione_schema_tipo`, `accettazione_privacy` | `created_at` | referente | no |

### Punti di forza (già conformi)
- **Nessun form accetta dati senza consenso**: il consenso è validato server-side e blocca l'invio se assente.
- **Consenso newsletter/marketing separato** dal consenso privacy (mai pre-spuntato), con **double opt-in** sui Guardiani.
- **Chi** e **quando** sono sempre registrati (`nome`/`email` + `created_at`).
- **Revoca**: disiscrizione GDPR implementata (`/newsletter/disiscrizione`, spegne i flag).

### Lacune rilevate
1. **`domande_tesseramento` non persiste il flag di consenso** come colonna: il consenso è imposto e citato nell'email, ma non c'è una colonna `consenso_privacy` a registro strutturato.
2. **Versione dell'informativa non registrata** in nessuna tabella. La conformità è comunque sostenibile per correlazione: l'informativa è versionata per data (attuale: 13/7/2026) e ogni consenso ha `created_at`, quindi si può determinare quale versione era vigente. Ma un campo esplicito è preferibile.
3. **Sportello**: schema non nel repo (migration vuota) → verificare in dashboard che registri il consenso.

### Rimedio proposto (migration pronta, NON applicata)
File: **`docs/migration-registro-consensi-DA-APPLICARE.sql`**. Additivo, non distruttivo:
- aggiunge `consenso_privacy boolean not null default false` a `domande_tesseramento`;
- aggiunge `informativa_versione text` (default `'2026-07-13'`) a `domande_tesseramento`, `download_lead`, `guardiani_contributori`, `iscrizioni_gita`, `convenzioni`.

Va **applicata al DB da Cristian** (disciplina del repo: le migration in `supabase/migrations/` sono già applicate; questa resta in `docs/` finché non eseguita, poi spostarla). **Dopo l'applicazione**, wiring lato edge (follow-up di Code):
- `contact-form`: scrivere `consenso_privacy: true` e `informativa_versione` nell'insert;
- `download-lead`, `guardiani-contributo`, edge gita, edge convenzioni: scrivere `informativa_versione` (costante `INFORMATIVA_VERSIONE`) nell'insert/upsert.

Finché la migration non è applicata, la conformità regge per correlazione (consenso obbligatorio + `created_at` + data dell'informativa).

---

*Fine audit. B.6 chiuso (conforme + SW dichiarato). B.7 conforme su chi/cosa/quando; enhancement versione informativa staged per applicazione DB.*
