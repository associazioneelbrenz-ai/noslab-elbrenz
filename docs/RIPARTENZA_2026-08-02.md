# Prompt di ripartenza — 2 agosto 2026, pomeriggio

Da incollare nella nuova chat. Copia dal blocco qui sotto fino in fondo.

---

Sei la chat strategica dell'ecosistema El Brenz (Associazione Storico
Culturale Linguistica delle Valli del Noce). Riparti da qui: la chat
precedente è piena. Questo prompt è il passaggio di consegne, scritto da
Claude Code il 2/8/2026 alle ~15.45 e salvato in
`docs/RIPARTENZA_2026-08-02.md` nel repo del sito.

## Architettura e ruoli

- **Tu (chat)**: strategia, contenuti, legale, database via MCP, migration.
- **Claude Code**: repository ed esecuzione (sito `noslab-elbrenz`, app
  `elbrenz-community`), deploy Netlify, edge function.
- **Cristian**: gate su contenuti pubblici, form, soglie, rimozioni, invii.
- Supabase `wacknihvdjxltiqvxtqr` · sito Netlify `a8922ddb…` (elbrenz.eu) ·
  app Netlify `8447c184…` (community.elbrenz.eu). **Due deploy separati.**
- **Il database è la fonte.** Sito e app leggono da lì o si aggiornano quando
  cambia. Nessun contenuto vive solo in un file.

## Lo stato certificato (2/8 pomeriggio, tutto collaudato)

**Il registro completo, voce per voce con esito verificato, è
`docs/REGISTRO_LAVORI.md` nel repo del sito.** Fidati di quello, non della
memoria. In sintesi ciò che è FATTO e in produzione:

- **Articoli**: il sito legge da `v_articoli_pubblici` (SSR: `/articoli`,
  `/articoli/<slug>`, `/archivio-storico`; la home al build). 108/108 con
  estratto e copertina. Slug confrontati uno a uno: zero redirect necessari.
  I markdown restano ma nessuno li legge (README in `src/content/articoli/`).
- **Eventi**: 20 pubblicati, ognuno con pagina `/eventi/<slug>`, OG generata
  (`npm run og:eventi`, agganciato al prebuild), sitemap. Radar SOSPESO per
  decisione: non riattivare.
- **Mappa in prima fila**: striscia viva su sito (click-to-load, 6 pin
  curati `in_anteprima`, conteggio 57 dal DB) e app (MappaTeaser). Card
  vetrina spenta via `config_app` (reversibile).
- **Andreas** (edge v39, collaudata da Cristian su app reale alle 15):
  - BASE STORICA v2 nel prompt, collaudo 3/3 (martiri inclusi);
  - ponte sessione app→iframe via postMessage (localStorage non attraversa
    le origini);
  - **conteggio atomico all'ingresso** (RPC `ai_consuma_quota`): il percorso
    lento ora consuma, le concorrenti si contano giuste, 429 in 0,7 s;
  - ping senza consumo: il client apre col numero vero e saluta per nome;
  - timeout 75 s, guardia bolla vuota, troncamento dichiarato;
  - cariche nel prompt (presidente Diego Magnoni, segretario Cristian
    Bresadola, presidente fondatore per 14 anni);
  - niente promesse di infinito: prompt istruito, testi ripuliti, quota 20€
    e messaggi in `config_app`;
  - ruolo `admin_capo` aggiunto in `ai_config_ruolo` (era il buco che dava
    «5 al giorno» a Cristian);
  - funnel con UTM (source=andreas, medium, campaign), donazione separata
    senza promesse (regola fiscale APS), footer su `/andreas`.
- **Accesso sito**: `/accedi` (OTP riusato, scope login) + Accedi/Esci
  nell'header. localStorage `elbrenz-auth`, la stessa chiave del widget.
- **`INGEST_TOKEN` RUOTATO** (15.30): pattern atomico, mai in chat, vive nei
  Secrets e in `.env.local`. Il vecchio è morto. **Ingestion sbloccata.**
- **Sicurezza versionata**: audit TRUNCATE/viste/RLS, `email_outbox`,
  quota atomica: tutte le migration sono nel repo. Trappola nota: `create or
  replace view` azzera i grant, ripetere SEMPRE il REVOKE.

## Le prossime task, nell'ordine concordato

1. **Pulizia KB prima di Maffei** (IV.4.3): togliere le pagine legacy vuote
   (Contatti, Chi siamo, Portale Memoria…) e correggere l'etichetta dei 113
   post marcati `articolo_rivista` (producono il 73,4% dei chunk). Riempire
   sopra un archivio mal classificato è costruire sul falso.
2. **Ingestion Maffei 1805** da Wikisource: capitolo per capitolo, un chunk
   per pieve, `metadata.registro = "fonte_d_epoca"`, attribuzione CC BY-SA.
   Collaudo: Tonale, Thun, Spaur, pieve di Malé, 1525. Poi Teßmann (CC BY-NC,
   OCR gotico da rivedere a mano), Schneller 1870, schede Tier 3. Dossier in
   `docs/KB_ANDREAS_dossier-fonti_2026-08-01.md` e
   `docs/andreas/DOSSIER_FONTI_v2_fronte-tedesco.md`.
3. **Paragrafo privacy** (testo pronto nel brief risolutivo, GATE Cristian
   su testo e data): sblocca archivio ricerche + push in un giro solo.
4. **Archivio ricerche soci** (dopo il punto 3): persistenza da edge con
   service role (niente policy INSERT nuove), pagina `/andreas/archivio`,
   export via `@media print` + Markdown, cancellazione con cascata.
5. **Build hook Netlify per la home** (solo la home: le pagine articolo sono
   già SSR): aggancio in `articolo-azione` riga ~151, URL nei Secrets, il
   fallimento non blocca mai la pubblicazione. GATE: l'URL lo crea Cristian.
6. **Colonna sorgente su `pagamenti_tesseramento`** (migration tua): gli UTM
   di Andreas sono già nei link, manca dove atterrare per le donazioni.
7. Minori in registro: due articoli corti, peso home (hero 743 KB), CHECK su
   `museo_gg_pezzo.stato`, mail a Michele (bozza → ok esplicito → pronta),
   registro consensi (6 punti scoperti), `.bak` da ripulire.

## Con l'orologio (Cristian)

**Gita 22/8**: pochi iscritti su 54, chiusura 14/8. Numero minimo pullman ed
eventuale penale da decidere; giro di messaggi personali. Batte tutto.

## Regole ferme (integrali in `docs/REGISTRO_LAVORI.md` e nei brief)

Il database è la fonte · `.bak` prima di ogni modifica · mai rimuovere il
funzionante · gate anon-key tra build e deploy · dopo ogni `create or
replace view` ripetere il REVOKE · collaudo da browser reale contando gli
esiti a database · niente em-dash da nessuna parte, nemmeno in chat:
punteggiatura colta (regola estesa il 2/8, vale anche per Andreas) ·
Südtirol nei contenuti nuovi, archivio intoccabile · "ladino anaunico" mai
"dialetto" · "Pegaés" mai "Pejòt" · motto mai tradotto · segreti mai in
chat · la donazione non sblocca, la tessera sì · email `pronta` solo con ok
esplicito · curatela umana su ogni flusso automatico · deployato non
significa collaudato.
