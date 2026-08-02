# Registro dei lavori — ecosistema El Brenz

**Aggiornato: 2 agosto 2026, mattina.**

Questo file esiste per una ragione precisa: fra il 31 luglio e il 2 agosto sono
arrivati sette brief, alcuni dei quali si sovrapponevano e alcuni dei quali
davano per aperte cose già chiuse. Qui **non si perde niente**: ogni voce
proposta in qualunque brief compare, con il suo stato reale verificato.

Legenda: **[FATTO]** eseguito e verificato · **[APERTO]** da fare ·
**[GATE]** aspetta una decisione o un'azione di Cristian ·
**[FUORI]** fuori scope per decisione.

---

## A. Correzioni allo stato riportato nei brief

Cose che i brief davano in un modo e che alla verifica risultano diverse. Sono
in testa perché cambiano le priorità.

| Riportato nel brief | Verificato |
|---|---|
| «home e pagine articolo leggono al build» | **Falso per le pagine articolo**: `/articoli`, `/articoli/<slug>` e `/archivio-storico` hanno `prerender = false`, sono SSR e pubblicano all'istante. **Solo la home** legge al build. |
| «107 articoli senza estratto» | **Era vero, ora sono 0.** Generati il 2/8 con l'opzione b (colonna `estratto` popolata una volta sola). |
| «il socio ha 5 domande al giorno» | **Falso: ne aveva 50.** Il 5 è il fallback nel codice e non entra mai in gioco. Ora 100. |
| «il widget non allega il token» | **Falso: lo allega già** (`andreas-chat.js`, patch M.A.2.6). |
| «serve il dominio del cookie a `.elbrenz.eu`» | **Non risolverebbe nulla**: la sessione sta in **localStorage**, non in un cookie. localStorage è per-origine e non si condivide fra sottodomini. |
| «l'articolo dell'Adige in app non c'è» | **Ora c'è**, verificato a schermo il 2/8 dopo il filtro `tipo_contenuto='post'`. |
| «il prezzo nel widget dice 20 e config_app 10» | **Già allineato a 20 ovunque**: widget (2 punti), `/tesseramento`, `config_app`. |
| «"illimitato" da eliminare dal frontend» | **Nel frontend non c'è.** Unica occorrenza in un articolo d'archivio del 2025, riferita a un corso: archivio intoccabile, non toccata. |
| «confronto slug prima del deploy, poi stop» | **Fatto e chiuso: zero differenze.** 108 URL vivi in markdown, 108 record in vista, nessun redirect necessario. Verificato dopo il deploy chiamando tutti e 108: 200 su 108. |
| «registro consensi fermo dal 21 luglio» | **Falso allarme**: nessun utente creato dopo quella data. La scrittura non si è interrotta. |

---

## B. Fatto e in produzione

### B.1 Database e sicurezza
- **[FATTO]** Audit 31/7–1/8 versionato: `20260802090000_allineamento_audit_completo.sql`. Revoca TRUNCATE ad `anon` su 68 tabelle, revoca scrittura su 13 viste, RLS su `_mappa_img_wp`, `cerca_soci` con controllo sul chiamante, Südtirol nella riga della gita.
- **[FATTO]** `email_outbox` finalmente versionata (`20260801160000`), DDL ricavato dallo schema vivo.
- **[FATTO]** `v_articoli_pubblici` filtra `tipo_contenuto = 'post'`: 27 pagine WordPress fuori.
- **[FATTO]** Vista estesa con `meta_title`, `meta_description`, `immagine_alt`, `noindex`, `wp_autore_originale`, `wp_legacy_id`, `archivio`.
- **[FATTO]** Colonna `articolo.archivio`, travasata dal frontmatter: 56 in sala di lettura, 52 in produzione.
- **[FATTO]** Estratti generati per 107 articoli (opzione b), taglio sulla parola intera, shortcode e URL rimossi.
- **[FATTO]** Limite soci Andreas a 100 in `ai_config_ruolo`; policy `config_app` con quota 20 e messaggio senza «illimitato».
- **[FATTO]** Dopo ogni `create or replace view` il REVOKE è stato ripetuto. Verificato: `anon` ha solo SELECT.

### B.2 Articoli: il database è la fonte
- **[FATTO]** `/articoli/<slug>`, `/articoli` e `/archivio-storico` leggono dalla vista, in SSR.
- **[FATTO]** Home: blocco «Ultimi articoli» dalla vista, ponte `legacy_wp_id` dismesso.
- **[FATTO]** Sitemap: 108 articoli aggiunti a `customPages` (erano usciti tutti passando a SSR).
- **[FATTO]** `avanti-tutta` recuperato: a database c'erano 34 caratteri contro i 1491 del markdown.
- **[FATTO]** Etichette dei pilastri riparate: `PILLAR_LABELS` non conosceva gli slug del database e uscivano vuote.
- **[FATTO]** README in `src/content/articoli/` che avvisa che quei file non alimentano più il sito.
- **[FATTO]** `scripts/esporta-articoli-db.mjs` committato come rete.

### B.3 Eventi
- **[FATTO]** `/eventi/<slug>` con JSON-LD, OG dedicata e voce in sitemap; slug con trigger.
- **[FATTO]** OG generate per 20 eventi + 7 articoli senza copertina: 108/108 articoli ora hanno una copertina.
- **[FATTO]** Generatore OG condiviso (`scripts/_og-modello.mjs`), agganciato al `prebuild`.
- **[FATTO]** Carosello eventi in home: card allineate, copertina dall'OG, derivati leggeri (9 KB invece di 210).
- **[FATTO]** Organizzatori: da deny-list a `organizzatore_segnalato`; pattern «Mulino» corretto in «Ruatti» (non agganciava nulla).

### B.4 App
- **[FATTO]** L'app legge `eventi_esterni_pubblici`: il carosello eventi era vuoto per costruzione.
- **[FATTO]** Filtro `tipo_contenuto='post'`: le 27 pagine legacy non finiscono più fra gli articoli.
- **[FATTO]** Carosello articoli ordinato per data: un pezzo nuovo apre la fila invece di chiuderla.
- **[FATTO]** Esplora: «Eventi» non è più «in arrivo».
- **[FATTO]** Aggiornamento vivo senza Realtime (RLS da curatore lo renderebbero inerte): refetch su focus + poll 60s.

### B.5 Andreas
- **[FATTO]** BASE_STORICA v2 nel prompt, entrambe le varianti (v35), con la clausola nei VINCOLI senza cui sarebbe stata inerte.
- **[FATTO]** Esonimi tedeschi (Nonsberg, Sulzberg, Rabbital, Pejotal) e regola sulle fonti di parte.
- **[FATTO]** Chunk su Franz Hofer etichettato in KB.
- **[FATTO]** Collaudo 2 su 8 (Q1 e Q2, le due che contano di più).

### B.6 Accesso
- **[FATTO]** `/accedi`: OTP esistente, scope `login`, sessione in `elbrenz-auth`. Nessun secondo sistema di autenticazione.
- **[FATTO]** «Accedi» nell'header, desktop e drawer, che diventa «Esci» a sessione viva.
- **[FATTO]** `/accedi` noindex ed escluso dalla sitemap.

---

## C. Aperto, in ordine di priorità

1. **[APERTO] Build hook Netlify per la home.** Le pagine articolo sono già SSR e non ne hanno bisogno; **la home sì**, perché è generata al build. L'hook va agganciato in `articolo-azione` **riga 151**, dove lo stato diventa `pubblicato`. Condizioni: URL nei Supabase Secrets, chiamata **dopo** la scrittura, fallimento dell'hook che **non** fa fallire la pubblicazione, debounce o accodamento.
   **[GATE]** serve che l'URL dell'hook venga creato e messo nei secret: non va in chat.
2. **[APERTO] Collaudo Andreas, domande 3-8.** Bloccate dal limite di 3 al giorno per IP. La terza (martiri d'Anaunia) è il vero banco di prova.
3. **[APERTO] Registro consensi: sei punti scoperti** — donazione materiale, Guardiani, biblioteca, richieste di contatto, racconti, schede dei pezzi.
4. **[APERTO] Museo, tre risposte prima di scrivere codice**: il form mostra `racconto` ed è textarea o editor? Le immagini finiscono nell'array? La pagina pubblica rende racconto e galleria?
5. **[APERTO] CHECK constraint su `museo_gg_pezzo.stato` e `storia.stato`**: oggi non esistono. Servono i valori che il codice scrive davvero.
6. **[APERTO] Due articoli corti**: `avanti-tutta` (recuperato, 1629 caratteri) e `trailer-documentario-fioi-dal-nos` (331). Il secondo va guardato.
7. **[APERTO] Peso della home**: `hero-lago.jpg` 743 KB e l'aquila 392 KB su 3,8 MB totali. Ricomprimere, **il marchio non si tocca**.
8. **[FATTO 2/8 pomeriggio] Mappa in prima fila nell'app**: MappaTeaser vivo sotto il saluto, 57 pin reali, conteggio, respiro di pan, tocco → /app/mappa. **Resta la parte sito**: la sezione mappa in home c'è già (ortofoto + CTA) ma sta fra articoli ed eventi e senza conteggio; spostarla su e aggiungere «57 luoghi» è il pezzo mancante.
8-bis. **[FATTO 2/8 pomeriggio] Andreas post mortem** (`docs/POSTMORTEM_2026-08-02_andreas-blocchi-e-quota.md`): ponte della sessione app→iframe (il socio era trattato da anonimo: localStorage non attraversa le origini), contatore dal limite vero dell'edge invece del 3 cablato, timeout 75s sul «sta pensando», guardia sulla bolla vuota, «senza limiti» eliminato dalla CTA, benvenuto e limite distinguono chi è già dentro. **Collaudo da iPhone a Cristian**: benvenuto senza pitch da socio, contatore a 99 dopo la prima domanda, domanda fuori KB che risponde o fallisce entro 75s.
8-ter. **[FATTO 2/8] Scansione dell'Adige in pagina** (200, 170 KB): il riferimento rotto è chiuso.
9. **[APERTO] Un solo indirizzo per Andreas** che si adatta a chi lo apre, invece di `/andreas` e `/app/andreas`.
10. **[APERTO] File `.bak` nel repo**: decine, non tracciati. O `.gitignore` o cestino.

---

## D. Fermo su Cristian

- **[GATE] Rotazione di `INGEST_TOKEN`** — blocca ogni ingestion. Pattern atomico: `openssl rand` → `supabase secrets set` → `curl` di prova. Nella stessa occasione gli altri token esposti.
- **[GATE] Paragrafo su Andreas nell'informativa** — blocca archivio ricerche **e** push. Conviene un unico aggiornamento privacy che copra entrambi.
- **[GATE SCIOLTO 2/8] Articolo dell'Adige**: Cristian ha deciso che il record a database è la fonte. Era già `pubblicato` dall'1/8 e la pagina legge già dal DB: la decisione conferma lo stato in vigore. La riga di credito («riprodotta con l'autorizzazione della redazione») è in pagina. **Resta un buco**: il corpo referenzia `/img/articoli/adige-2026-07-20.jpg` e quel file non esiste né nel repo né su Storage — la scansione «resta in archivio interno» (nota del brief originale) e non è mai stata caricata. In pagina c'è un'immagine rotta. Serve il file da Cristian; destinazione: `public/img/articoli/adige-2026-07-20.jpg`.
- **[GATE] Gita**: 4 su 54, chiusura 14 agosto. Numero minimo per il pullman ed eventuale penale.
- **[GATE] Push: ogni articolo o solo `in_evidenza`?**
- **[GATE] Utenza di servizio**: serve un campo per marcarla? `cerca_soci` filtra sul livello e un super_admin lo supera.
- **[GATE] Nome pubblico dell'utenza istituzionale**: «MasterBrenz» o «El Brenz»?
- **[GATE] `cerca_soci`**: elenco soci visibile a tutti gli iscritti o ai soli soci?
- **[GATE] Venti tabelle vuote**: accese entro una data o dichiarate dormienti nel README.
- **[GATE] Mail a Michele**: inserita come `bozza`, prova a `info@elbrenz.eu`, `pronta` solo con ok esplicito. Gli invii non li faccio da solo.
- **[GATE] Ingestion**: Maffei 1805, Teßmann (CC BY-NC, OCR gotico da rivedere a mano), Schneller 1870, schede bibliografiche.
- **[GATE] Ripulire la KB prima di riempirla**: togliere le pagine legacy vuote e correggere l'etichetta dei 113 post marcati `articolo_rivista`, che producono il 73,4% dei chunk.

---

## E. Fuori scope, per decisione

- **[FUORI] Radar eventi**: sospeso. Non applicare `20260801090000_radar_eventi_cron.sql`.
- **[FUORI] Bump `@astrojs/netlify`**: 22 vulnerabilità nella toolchain di build. **Dopo il 22 agosto**, finita la campagna della gita.
- **[FUORI] Anagrafica delle persone**: il vero buco architetturale. Il libro soci è `domande_tesseramento`, una tabella di domande con l'anno dentro: al rinnovo 2027 ogni socio genererà una riga slegata dalla precedente.
- **[FUORI] Mediateca**: schema pronto e vuoto. Prima i diritti sulle interviste, le trascrizioni, i costi di storage.

---

## F. Trappole imparate sul campo

- **`create or replace view` azzera i grant.** Ripetere sempre il REVOKE.
- **`utente.cognome` è NOT NULL**: stringa vuota, non NULL.
- **Il glob della collection cattura anche il README**: va escluso nel pattern o la build cade.
- **Satori non digerisce i font self-hosted** (sottoinsiemi ottimizzati): si usa resvg.
- **Il confronto degli slug non vede il contenuto**: `avanti-tutta` aveva slug identico e testo perso al 98%.
- **Un chunk da OCR sbagliato è peggio di nessun chunk**: suona plausibile ed è falso.
- **`andreas-chat` si chiama solo con `apikey`**, mai con Authorization Bearer.
- **Sito e app sono due deploy distinti**: un deploy dalla cartella del sito non tocca l'app.
