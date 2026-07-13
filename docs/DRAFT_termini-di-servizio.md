# BOZZA — Termini di Servizio / Condizioni d'uso

> **STATO: bozza in revisione — NON pubblicata.** Predisposta da Claude su brief compliance (B.1) del 13/7/2026.
> Richiede l'OK di Cristian e, per la certezza giuridica, una revisione competente prima di andare live su `/termini`.
> Nessun em-dash nel testo pubblico (regola di stile). Note redazionali fra parentesi quadre da rimuovere in pubblicazione.

---

## Termini di servizio

*Ultimo aggiornamento: [DATA DI PUBBLICAZIONE]*

### 1. Oggetto e titolare
Il presente documento disciplina l'uso del sito **elbrenz.eu** (di seguito "il Sito"), gestito dall'**Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce** (di seguito "l'Associazione"), con sede in Via Trento 40, II piano, 38027 Malè (TN), C.F. 92019480224, contattabile all'indirizzo info@elbrenz.eu.

Il Sito è uno strumento culturale e associativo senza scopo di lucro, dedicato alla storia, alla lingua e all'identità delle Valli del Noce.

### 2. Accettazione
Navigando sul Sito e utilizzandone le funzioni (moduli di contatto, area soci, area redazione, proposte al glossario, iscrizioni a eventi, donazioni) l'utente accetta i presenti Termini. Chi non li accetta è invitato a non utilizzare il Sito.

### 3. Uso consentito
L'utente si impegna a utilizzare il Sito nel rispetto della legge, del buon costume e delle finalità culturali dell'Associazione. In particolare è vietato:
- inviare contenuti illeciti, diffamatori, offensivi, discriminatori o lesivi di diritti altrui;
- tentare di accedere ad aree riservate senza autorizzazione, o compromettere la sicurezza e il funzionamento del Sito;
- effettuare raccolta massiva automatizzata di dati (scraping) senza consenso;
- utilizzare i contenuti in modo contrario a quanto previsto alla sezione 5.

### 4. Contenuti proposti dagli utenti (Guardiani de la lenga, area redazione)
Alcune funzioni consentono all'utente di proporre contenuti: termini e voci per il glossario del ladino anaunico ("Guardiani de la lenga") e articoli redazionali (per chi ha ruolo di collaboratore o socio abilitato).

- L'utente **garantisce** di avere il diritto di condividere i contenuti proposti e che questi non violano diritti di terzi.
- Proponendo un contenuto, l'utente concede all'Associazione una **licenza non esclusiva, gratuita, a tempo indeterminato** per pubblicarlo, conservarlo, adattarlo redazionalmente e diffonderlo sul Sito e sui canali dell'Associazione, nell'ambito delle finalità culturali. L'utente **mantiene la titolarità** dei propri contenuti.
- L'Associazione si riserva il diritto di **rivedere, validare, modificare o non pubblicare** i contenuti proposti (per i Guardiani, la validazione è affidata alla Commissione Linguistica dell'Associazione).
- L'attribuzione pubblica del nome del contributore avviene **solo su scelta esplicita** dell'utente. [rinvio a Privacy per il trattamento dei dati]

### 5. Proprietà intellettuale
I contenuti originali del Sito (testi, elaborazioni, grafica, logo e marchio "El Brenz", raccolte documentali curate) sono di titolarità dell'Associazione o dei rispettivi autori e sono protetti dalla normativa sul diritto d'autore.

Ove non diversamente indicato, i contenuti possono essere consultati per uso personale e non commerciale. Qualsiasi riproduzione, ripubblicazione o uso commerciale richiede l'autorizzazione scritta dell'Associazione. I materiali di terzi (immagini, cartografie, citazioni) restano soggetti alle rispettive licenze, indicate nella pagina **Crediti e licenze**.

### 6. Adesione all'Associazione e donazioni
- L'adesione come socio è regolata dallo **Statuto** dell'Associazione, cui si rinvia integralmente.
- Le quote associative e le donazioni sono volontarie e sostengono le attività culturali dell'Associazione. I pagamenti online sono gestiti tramite il fornitore **PayPal**, secondo le condizioni e l'informativa di quest'ultimo; l'Associazione non tratta né conserva i dati completi degli strumenti di pagamento.
- Salvo diversa previsione di legge, le donazioni a un ente senza scopo di lucro non sono rimborsabili. Per iscrizioni a eventi con anticipo si applicano le condizioni indicate nella pagina dell'evento.

### 7. Link e servizi esterni
Il Sito può contenere collegamenti a siti e servizi di terzi (es. YouTube, Instagram, mappe, Telegram) e incorporare contenuti esterni con modalità "carica su richiesta". L'Associazione non è responsabile dei contenuti, delle policy e del funzionamento dei servizi di terzi.

### 8. Limitazione di responsabilità
Il Sito e i suoi contenuti sono forniti "così come sono", a scopo divulgativo e culturale. L'Associazione cura l'accuratezza delle informazioni storiche e linguistiche ma non garantisce che siano prive di errori o sempre aggiornate, né la continuità e assenza di interruzioni del servizio. Nei limiti consentiti dalla legge, l'Associazione non risponde di danni derivanti dall'uso del Sito.

### 9. Modifiche ai Termini
L'Associazione può aggiornare i presenti Termini per adeguarli a esigenze normative o funzionali. La versione vigente è sempre quella pubblicata su questa pagina, con la relativa data di aggiornamento.

### 10. Trattamento dei dati personali
Il trattamento dei dati personali è descritto nella **Informativa sulla privacy** e nella **Cookie policy**, cui si rinvia.

### 11. Legge applicabile e foro competente
I presenti Termini sono regolati dalla **legge italiana**. Per ogni controversia relativa all'interpretazione ed esecuzione è competente il **Foro di Trento**, fatte salve le norme inderogabili a tutela del consumatore che prevedano il foro di residenza o domicilio dell'utente.

### 12. Contatti
Per qualsiasi domanda sui presenti Termini: **info@elbrenz.eu** — Associazione El Brenz, Via Trento 40, 38027 Malè (TN).

---

### Note per l'implementazione (Code, dopo OK)
- Creare `src/pages/termini.astro` con `ArticleLayout` o `Layout`, stile coerente con `/privacy` e `/statuto`.
- OG dedicata (regola og-seo-cura) + voce nel footer B.2 (aggiungere "Termini di servizio" nella `<nav>` già presente in `Layout.astro`).
- Rimuovere le note fra parentesi quadre e impostare la data reale.
- Verificare i rimandi: link a `/statuto`, `/privacy`, `/cookie-policy`, `/crediti-e-licenze`.
