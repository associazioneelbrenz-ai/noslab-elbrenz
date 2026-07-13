# BOZZA — Informativa Privacy aggiornata (elbrenz.eu)

> **STATO: bozza in revisione — NON pubblicata su `/privacy`.** Ricevuta da Cristian il 13/7/2026.
> Sotto, la sezione "VERIFICHE CODE" risolve i `[DA CONFERMARE]` tecnici con quanto risulta dal codice.
> Restano a Cristian: i periodi di conservazione (scelta di business), la region Resend (config account, non nel codice),
> e la revisione legale competente. Nessun em-dash. NON pubblicare come definitiva senza OK di Cristian.

---

## VERIFICHE CODE (13/7/2026) — risposte ai [DA CONFERMARE]

| Punto | Domanda del brief | Cosa risulta dal codice reale |
|---|---|---|
| §2(a) Tesseramento | telefono? luogo nascita? | Campi form (`tesseramento.astro`): `nome` (unico campo "Nome e cognome"), `email`, `data_nascita`, `comune_nascita` (= luogo di nascita), `sesso` (M/F), `messaggio` (facoltativo), consenso `gdpr`. **NIENTE telefono.** In più: **upload ricevuta bonifico** (facoltativo) che "può riportare dati bancari" → va menzionato. |
| §2(c) Download | campi | Confermato (`download-lead`): `nome`, `email`, `telefono` **facoltativo**, `consenso_privacy` (obbligatorio), `consenso_newsletter` (facoltativo, separato). Bozza corretta. |
| §2(d) Newsletter | Resend? unsubscribe automatico? | **Non esiste un modulo/newsletter autonomo.** Il consenso newsletter è raccolto come opzione sui form lead-gen (`consenso_newsletter`) e Guardiani (`consenso_marketing`, con **double opt-in** via email di conferma). Invio via Resend (`send-email`). **ATTENZIONE: nel codice NON risulta un link di disiscrizione automatico in ogni email.** La bozza promette "link di disiscrizione presente in ogni messaggio": va implementato prima di dichiararlo. L'import dei 39 contatti in Resend è ancora pendente. |
| §2(e) Guardiani | email del contributore? | **Sì, email OBBLIGATORIA** (`guardiani-de-la-lenga.astro`: `name="email" required`). Non "eventuale". Inoltre si raccolgono parametri **UTM** (source/medium/campaign) se presenti nel link. `consenso_firma` (nome pubblico, opt-in) e `consenso_marketing` (double opt-in). |
| §2(i)/§4 Andreas | Anthropic e OpenAI? | **Confermati entrambi.** `andreas-chat` invia la **domanda dell'utente** a OpenAI (`text-embedding-3-small`, embedding della query) per la ricerca nella KB, e ad **Anthropic** (`claude-haiku-4-5`) per generare la risposta. Entrambi USA. La frase "il testo transita verso tali fornitori" è accurata. |
| §4 FCM/Firebase | push attive? | **NO.** Nessun riferimento a Firebase/FCM/messaging in `src/` né `sw.js`. → **Omettere** Firebase/Google dai responsabili. |
| §4 Resend region | eu-west-1? | Non verificabile dal codice (config di account, non nel repo). Per l'audit interno = **eu-west-1 (UE)**. Da confermare nella dashboard Resend. |
| §5 Conservazione | periodi | Ricevuta bonifico: **max 12 mesi** (già dichiarato nel modulo tesseramento). Contatti/download senza adesione: la bozza propone 24 mesi → **scelta di Cristian**. |

**Risolti il 13/7 (già recepiti nel testo sotto):**
1. Conservazione lead senza adesione (§5): **12 mesi**. ✓
2. Region Resend (§4): **UE eu-west-1**. ✓
3. Unsubscribe (§2d): **implementato** (`/newsletter/disiscrizione`, edge `newsletter-unsubscribe`, commit efdab32). ✓
4. §2(a) telefono tolto + upload ricevuta aggiunto; §2(e) email obbligatoria. ✓
5. Firebase rimosso da §4 (non attivo). ✓

**Resta a Cristian:** OK finale sul testo + eventuale revisione legale competente; poi Code sostituisce `/privacy` con `.bak` e data reale.

---

# Informativa sul trattamento dei dati personali

*Ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679 (GDPR).*
*Ultimo aggiornamento: [DATA DI PUBBLICAZIONE].*

## 1. Titolare del trattamento

Il Titolare del trattamento è l'**Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce**, con sede in Via Trento 40, 38027 Malè (TN), Codice Fiscale 92019480224.
Per ogni questione relativa alla presente informativa e per l'esercizio dei diritti è possibile scrivere a: **info@elbrenz.eu**.

## 2. Quali dati raccogliamo, per quali finalità e con quale base giuridica

Raccogliamo il minimo indispensabile, e solo per le finalità qui indicate. I dati provengono dai moduli e dalle funzioni del sito. Di seguito il dettaglio per ciascun trattamento.

**a) Adesione e tesseramento.** Raccogliamo nome e cognome, indirizzo email, data di nascita, comune di nascita e sesso, oltre a un eventuale messaggio facoltativo. Se si sceglie il pagamento tramite bonifico, è possibile caricare la ricevuta: il documento, che può riportare dati bancari, è conservato in un archivio privato al solo fine di verificare il pagamento e comunque non oltre 12 mesi. Finalità: gestire la richiesta di adesione, il tesseramento e le comunicazioni relative alla vita associativa. Base giuridica: esecuzione del rapporto associativo e adempimento degli obblighi connessi (art. 6.1.b e 6.1.c GDPR); per l'eventuale iscrizione futura in assenza di adesione formale, il consenso (art. 6.1.a). *(VERIFICATO: il modulo non raccoglie il numero di telefono.)*

**b) Contatti e "Sportello El Brenz. Porta la tua Storia".** Raccogliamo nome, indirizzo email e il contenuto del messaggio o della testimonianza inviata. Finalità: rispondere alle richieste e gestire i contributi proposti. Base giuridica: consenso e riscontro alla richiesta dell'interessato (art. 6.1.a e 6.1.b).

**c) Download del libro e del documentario (modulo).** Per scaricare l'opera "A proposito di Tirolo" e per il documentario "Fiöi dal Nos" raccogliamo nome, indirizzo email e, facoltativamente, il numero di telefono. Finalità: fornire la risorsa richiesta e, se acconsentito separatamente, inviare aggiornamenti dell'Associazione. Base giuridica: consenso (art. 6.1.a).

**d) Newsletter e comunicazioni.** Il consenso a ricevere le comunicazioni è raccolto, in modo separato e facoltativo, nei moduli di download e nella proposta ai "Guardiani de la lenga" (con conferma via email, double opt-in). Trattiamo nome e indirizzo email. Finalità: inviare la newsletter e le comunicazioni dell'Associazione. Base giuridica: consenso (art. 6.1.a), revocabile in qualsiasi momento tramite l'apposito link di disiscrizione presente in ogni comunicazione. Gli invii sono gestiti tramite il fornitore Resend. *(VERIFICATO: meccanismo di disiscrizione implementato, `/newsletter/disiscrizione`.)*

**e) "Guardiani de la lenga" (glossario collaborativo).** Chi propone un termine invia la parola, il significato e le informazioni linguistiche correlate, il proprio nome e il proprio indirizzo email; se presenti, registriamo i parametri della campagna (UTM) del link di provenienza. Finalità: raccogliere, validare e conservare il patrimonio linguistico proposto, con eventuale attribuzione, e dare riscontro. Il nome del contributore compare pubblicamente **solo se l'interessato sceglie di renderlo visibile**. Base giuridica: consenso (art. 6.1.a). *(VERIFICATO: l'email è obbligatoria.)*

**f) Proposte di convenzione (esercenti e partner).** Raccogliamo i dati dell'attività e del referente che propone la convenzione. Finalità: valutare e gestire le convenzioni riservate ai soci. Base giuridica: consenso e legittimo interesse alla gestione dei rapporti convenzionali (art. 6.1.a e 6.1.f).

**g) Iscrizione a eventi e gite, con pagamento.** Per l'iscrizione a eventi e gite raccogliamo i dati del partecipante necessari alla partecipazione; i pagamenti (quota, anticipo, donazioni) sono gestiti tramite PayPal. Finalità: gestire l'iscrizione e il relativo pagamento. Base giuridica: esecuzione del servizio richiesto e adempimenti connessi (art. 6.1.b e 6.1.c). I dati di pagamento sono trattati direttamente da PayPal secondo la sua informativa.

**h) Area riservata e redazione (soci e collaboratori).** Per l'accesso all'area riservata e alla redazione utilizziamo l'autenticazione tramite codice inviato via email (OTP). Per i collaboratori editoriali trattiamo i dati dell'account e i contenuti prodotti. Finalità: consentire l'accesso riservato e l'attività editoriale. Base giuridica: esecuzione del rapporto associativo o di collaborazione e consenso (art. 6.1.b e 6.1.a).

**i) Assistente digitale "Andreas".** Le domande poste ad Andreas, sul sito e tramite il canale Telegram, vengono elaborate da fornitori di servizi di intelligenza artificiale per generare la risposta (vedi sezione 4). Non conserviamo le conversazioni. Per il funzionamento del canale Telegram trattiamo un identificativo tecnico della chat, in forma cifrata, al solo fine di limitare gli abusi. L'interazione tramite Telegram è inoltre soggetta all'informativa di Telegram. Base giuridica: legittimo interesse al funzionamento del servizio e alla prevenzione degli abusi (art. 6.1.f). Si invita a non inserire dati personali non necessari nelle domande.

**l) Dati tecnici e di sicurezza.** Per proteggere i moduli da abusi registriamo in modo temporaneo l'indirizzo IP e dati tecnici minimi (ad esempio limiti di frequenza delle richieste). Finalità: sicurezza del sistema e prevenzione di invii automatizzati o abusivi. Base giuridica: legittimo interesse (art. 6.1.f).

## 3. Modalità del trattamento

I dati sono trattati con strumenti informatici, nel rispetto dei principi di liceità, minimizzazione e limitazione delle finalità. La trasmissione avviene tramite connessione cifrata (HTTPS/TLS). L'accesso ai dati è riservato alle persone autorizzate dell'Associazione. Non è previsto alcun processo decisionale automatizzato che produca effetti giuridici sulle persone.

## 4. Responsabili esterni e trasferimenti di dati

Per erogare i propri servizi l'Associazione si avvale di fornitori che agiscono come responsabili del trattamento (art. 28 GDPR):

- **Supabase**: banca dati, autenticazione e archiviazione. Dati ospitati nell'Unione Europea.
- **Resend**: invio delle email transazionali e della newsletter. Dati ospitati nell'Unione Europea (regione eu-west-1).
- **Netlify**: hosting del sito. Il fornitore ha sede negli Stati Uniti: il trasferimento avviene sulla base di garanzie adeguate (clausole contrattuali standard della Commissione europea o meccanismi equivalenti).
- **PayPal**: gestione dei pagamenti. Fornitore con sede negli Stati Uniti, che tratta i dati secondo la propria informativa e con garanzie adeguate.
- **Anthropic e OpenAI**: elaborazione delle domande poste ad Andreas per generare la risposta (OpenAI per la ricerca semantica nella base di conoscenza, Anthropic per la generazione del testo). Fornitori con sede negli Stati Uniti: il trasferimento avviene sulla base di garanzie adeguate. Non è prevista conservazione delle conversazioni da parte dell'Associazione.
- **Telegram**: canale di messaggistica dell'assistente Andreas, soggetto alla propria informativa.

*(VERIFICATO: nessuna notifica push tramite Firebase/FCM è attiva; Google/Firebase non è tra i responsabili.)*

I dati non sono diffusi né ceduti a terzi per finalità commerciali. I trasferimenti verso Paesi al di fuori dell'Unione Europea avvengono, ove presenti, sulla base delle garanzie previste dagli articoli 44 e seguenti del GDPR.

## 5. Periodo di conservazione

Conserviamo i dati per il tempo necessario alle finalità indicate:

- dati relativi ad adesione, tesseramento e pagamenti: per la durata del rapporto associativo e, successivamente, per il tempo richiesto dagli obblighi di legge, inclusi quelli contabili e fiscali; la ricevuta di bonifico eventualmente caricata è conservata non oltre 12 mesi;
- dati raccolti tramite i moduli di contatto e di download, in assenza di adesione: 12 mesi, o fino a richiesta di cancellazione;
- iscritti alla newsletter: fino alla revoca del consenso o alla disiscrizione;
- dati tecnici e di sicurezza: per il tempo strettamente necessario alla finalità di protezione.

Al termine dei periodi indicati i dati sono cancellati o resi anonimi.

## 6. Diritti dell'interessato

In qualsiasi momento è possibile esercitare i diritti previsti dagli articoli 15 e seguenti del GDPR: accesso ai propri dati, rettifica, cancellazione, limitazione del trattamento, portabilità, opposizione, nonché revoca del consenso prestato, senza che ciò pregiudichi la liceità del trattamento effettuato prima della revoca.
Le richieste vanno inviate a **info@elbrenz.eu**. È inoltre possibile proporre reclamo all'Autorità di controllo competente, ossia il **Garante per la protezione dei dati personali** (www.garanteprivacy.it).

## 7. Cookie

Il sito utilizza esclusivamente cookie tecnici e strumenti necessari al funzionamento, e adotta un meccanismo di caricamento su richiesta per i contenuti di terze parti (video, mappa, social), così da non trasmettere dati prima di un'azione esplicita dell'utente. Il dettaglio è riportato nella **Cookie Policy**, richiamabile anche dal piè di pagina insieme al pannello delle preferenze.

## 8. Modifiche alla presente informativa

L'Associazione può aggiornare la presente informativa per adeguarla a modifiche normative o dei servizi. La versione vigente è sempre pubblicata su questa pagina, con l'indicazione della data di ultimo aggiornamento.

---

## Note per Code (implementazione, DOPO OK Cristian)
- Sostituire il testo di `src/pages/privacy.astro` con questa versione (dopo OK e compilazione dei residui). Backup `.bak`, additività.
- Impostare la data reale di pubblicazione.
- Rimando reciproco Privacy ↔ Cookie Policy ↔ Preferenze cookie (già presenti nel footer B.2).
- Rileggere che non restino em-dash nel testo pubblicato.
