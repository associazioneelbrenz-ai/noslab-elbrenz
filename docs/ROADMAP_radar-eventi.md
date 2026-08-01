# Roadmap Radar eventi Valli del Noce

> Documento di lavoro, aggiornato al **31 luglio 2026**.
> Copre il BLOCCO 2 del superbrief del 30/7 e la parte di **relazioni esterne** che il brief non prevedeva ma che il censimento della casella `associazione.elbrenz@gmail.com` ha reso necessaria.
> Il BLOCCO 1 (coda legale) è chiuso: vedi in fondo, sezione "Stato a monte".

---

## 1. Perché le relazioni contano quanto il codice

Il Radar nasce con due fonti automatiche (API open data ComunWeb e `dati.trentino.it`) e una manuale (`fonte = 'manuale'`). Le fonti automatiche coprono **quello che i Comuni pubblicano**, non quello che il territorio organizza davvero: le sagre di paese, le aperture straordinarie dei musei, le serate delle Pro Loco viaggiano per posta elettronica e su carta, non su API.

Il censimento della casella lo conferma: gli eventi che ci interessano di più stanno già arrivando via email, da anni, e nessuno li ha mai raccolti in modo strutturato.

**Conseguenza operativa:** il Radar Fase 1 va progettato sapendo che la fonte `manuale` non è un ripiego ma un canale primario, e che alcune relazioni vanno riaperte prima che il codice sia pronto, perché i tempi di risposta di un ente turistico non sono i tempi di una migration.

---

## 2. Censimento contatti APT (esito reale, non ipotesi)

Fonte: ricerca sulla casella `associazione.elbrenz@gmail.com` e su `info@elbrenz.eu`, luglio 2026.

### 2.1 APT Val di Non (`visitvaldinon.it`)

| Data | Interlocutore | Oggetto | Esito |
|---|---|---|---|
| 03/09/2015 | `info@visitvaldinon.it` | Invito alle associazioni del terzo settore, incontro su gestione amministrativa e fiscale | El Brenz in lista di distribuzione (circa 50 associazioni) |
| 14/10/2015 | `ufficio.stampa@visitvaldinon.it` | **"Invio griglia comunicazione eventi per tabloid invernale"** | Griglia da compilare per far entrare i propri eventi nella pubblicazione APT |
| 22/10/2015 | `ufficio.stampa@visitvaldinon.it` | Sollecito invio eventi tabloid invernale 2015/2016 | Nessuna risposta tracciata |
| 20/11/2015 | `ufficio.stampa@visitvaldinon.it` | Criteri autorizzazione utilizzo **logo Val di Non** | Documento ricevuto, mai usato |
| 11/11/2020 | citazione indiretta | Stefano Cogoli (Consiglio provinciale) scrive a Cristian: "domani cerco il presidente Apt Val di Non Paoli per richiedere qualche info" | Contesto: pratica copyright Stanzel, non eventi |

**Lettura.** Il rapporto esiste ma è **dormiente dal 2015**. El Brenz risulta ancora in una mailing list associazioni di allora. Il canale storico è `ufficio.stampa@`, e nel 2015 funzionava a griglia compilata: significa che l'APT Val di Non ha (o aveva) un flusso di raccolta eventi da terzi, che è esattamente l'aggancio che serve al Radar. Da verificare se oggi quel flusso sia diventato un portale.

Altro nominativo emerso: **Giulia Dalla Palma** (`giulia.dallapalma@visitvaldinon.it`), in copia su una lista del 2014. Da verificare se sia ancora in organico prima di scriverle.

### 2.2 APT Val di Sole (`visitvaldisole.it`)

| Data | Interlocutore | Oggetto | Esito |
|---|---|---|---|
| 05/11/2021 | `info@valdisoleritornoalfuturo.it` | Invito incontro online progetto "Val di Sole Ritorno al Futuro" | Cristian non partecipa |
| 08/11/2021 | Cristian → APT | Scusa per l'assenza, chiede come recuperare | **Scambio reale a due vie** |
| 09/11/2021 | Irene (APT) → Cristian | "Se vuole può contattarci telefonicamente o passare qui in sede", orari 8.30-12.30 e 14.00-17.30 | Invito aperto, **mai raccolto** |
| 29/03/2022 e 01/04/2022 | `info@visitvaldisole.it` | Laboratori "Dai sogni ai progetti", comunicazioni operatori | Ricevute, nessuna risposta |
| 15/09/2022 | **Susanna Menapace** (`susanna.menapace@visitvaldisole.it`), con **Fabio Sacco** (`fabio.sacco@visitvaldisole.it`) | Invito ai membri giovani delle associazioni, "Next Generation Workshop" | Nessuna risposta tracciata |
| 27/09/2022 | `info@visitvaldisole.it` | ApeRitorno al Futuro, 30 settembre, Birreria Stal | Ultimo contatto in assoluto |

**Lettura.** Qui il rapporto è **più caldo ma interrotto nel 2022**, con una porta lasciata aperta per iscritto da Irene nel novembre 2021. Ci sono due nomi e cognomi con indirizzo diretto, il che vale più di un `info@`. L'APT Val di Sole ci ha cercati come associazione del territorio, non viceversa.

### 2.3 Rabbi e Pejo

Nessun contatto autonomo tracciato. Amministrativamente rientrano nel bacino dell'APT Val di Sole (Rabbi, Pejo) e dell'APT Val di Non per la parte anaune, quindi non servono canali separati in Fase 1.

---

## 3. Fonti umane già attive che il Radar deve intercettare

Non sono APT, ma sono la ragione per cui la fonte `manuale` va presa sul serio.

| Fonte | Indirizzo | Cadenza | Valore per il Radar |
|---|---|---|---|
| **Pro Loco Malé Nuova APS** | `maleproloco@gmail.com` (rif. Chiara, tel. 327 6526915) | **Settimanale, attivissima nel 2026** | Calendario eventi Malé e frazioni con locandine allegate, El Brenz già in Bcc come operatore. La fonte migliore in assoluto per la Val di Sole, e arriva da sola |
| **Castelli del Buonconsiglio** | `info@buonconsiglio.it` | Mensile | Castel Thun e Castel Caldes: pilastro 1, segnale forte quasi sempre |
| **METS Museo degli Usi e Costumi** | `info@museosanmichele.it` | Irregolare | "Mulini aperti", Giornate europee dei mulini, eTNo festival, convegni stufe a olle: pilastro 3 puro |
| Centro Studi per la Val di Sole | `biblioteca@` / `museo@centrostudiperlavaldisole.it` | Irregolare | **Organizzatore escluso** per delibera del direttivo del 13/7/2026. Va nel seed di `eventi_organizzatori_esclusi`, con `stato = 'non_promuovibile'`: resta visibile al direttivo, non esce mai in pubblico |

Nota tecnica: queste email arrivano in Bcc a `associazione.elbrenz@gmail.com`. Un eventuale ingest automatico della casella è **fuori perimetro Fase 1** e va valutato a parte, perché tocca dati personali di terzi e va scritto in privacy prima di essere costruito. Per ora: lettura umana e inserimento `manuale`.

---

## 4. Azioni proposte sulle APT (decide Cristian)

Le mette in coda il direttivo, non Code. Nessuna di queste è una riga di codice.

### A1. Riaprire il canale con APT Val di Sole (priorità alta)
Ripartire dal filo del novembre 2021, che è ancora citabile: "ci eravate invitati al percorso Ritorno al Futuro, ci scusiamo per l'assenza di allora, oggi l'associazione ha un sito, un'app soci e una sezione eventi". Interlocutori: Susanna Menapace e Fabio Sacco, con `info@` in copia.
**Chiedere due cose concrete:** come far arrivare i nostri eventi nei loro canali, e se esiste un feed o un calendario riutilizzabile per la nostra agenda.

### A2. Riaprire il canale con APT Val di Non (priorità media)
Scrivere a `ufficio.stampa@visitvaldinon.it` richiamando la griglia eventi del 2015 e chiedendo se il flusso esista ancora in forma digitale. Verificare prima che Giulia Dalla Palma sia ancora in organico.

### A3. Ringraziare e formalizzare con la Pro Loco Malé (priorità alta, costo zero)
Riceviamo già tutto. Basta dire che li rilanciamo in agenda con credito e link, e chiedere che ci scrivano direttamente per gli eventi a contenuto storico o di tradizione.

### A4. Domanda di fondo per il direttivo
Il Radar serve solo a **noi** per riempire `/eventi`, o è anche uno **strumento di relazione** da mettere sul tavolo delle APT ("noi selezioniamo e raccontiamo gli eventi di valore storico e culturale delle valli")? La risposta cambia il tono delle lettere A1 e A2, e cambia anche se l'output pubblico vada tenuto sobrio o vada valorizzato come servizio.

**Vincolo di tono:** nessuna richiesta di soldi, nessuna proposta di convenzione commerciale in prima lettera. Le APT sono enti, non partner di sconto soci.

**Vincolo di forma:** le lettere le scrive Cristian o Code sotto dettatura, ma **le manda Cristian**. Code non invia email a enti esterni.

---

## 5. Gate di design: risposte e stato

| # | Gate | Risposta |
|---|---|---|
| 1 | Frequenza harvest | **Giornaliera notturna** (Cristian, 31/7). Vincolo tecnico sopravvenuto: la fonte torna al massimo 10 eventi per portale e ignora `offset`, quindi la copertura la garantisce la cadenza, non la profondità. La frequenza giornaliera **non è negoziabile al ribasso**. |
| 2 | Soglia coda curatore | **≥ 60** confermata. 30-59 entra con flag `bassa_priorita`, sotto 30 va in `scartato` ma si conserva per la taratura. |
| 3 | Notifica Telegram | **Digest settimanale**, lunedì mattina, al gruppo direttivo. Toggle in `telegram_notifica` (tipo `radar_digest`): si spegne con un UPDATE, senza deploy. |
| 4 | Output pubblico Fase 1 | **Solo il sito** (default assunto, non ancora confermato). Newsletter e bot restano fuori: la newsletter non ha ancora un broadcast vero. |
| 5 | Chi cura | **Livello ≥ 20** cura (curatore museo, collaboratori, admin); la **pubblicazione** resta al direttivo ≥ 50. Default assunto, non ancora confermato: due mani diverse sull'unico atto che esce in pubblico. |
| 6 | APT prima o dopo | Aperto. Ora che il Radar funziona, l'argomento "guardate cosa abbiamo fatto" è disponibile: propende per il dopo. |

I gate 4 e 5 sono stati risolti con un default dichiarato per non fermare il lavoro: se la scelta è diversa, il 4 è una riga di codice e il 5 è un numero in una policy.

---

## 5-bis. Stato al 1 agosto 2026

**In piedi e verificato:**

- Migration `20260731120000_radar_eventi.sql` applicata: `eventi_esterni`, `eventi_organizzatori_esclusi`, `eventi_esterni_date`, RLS deny-by-default, vista pubblica `eventi_esterni_pubblici` (solo `pubblicato`, niente colonne personali), trigger di guardia, seed dei due organizzatori esclusi.
- Tre edge deployate, `verify_jwt` verificato dopo il deploy: `radar-eventi-harvest` e `radar-eventi-classifica` a `false` col gate `x-ingest-token`, `radar-eventi-azione` a `true`. I tre gate rispondono 401 come devono.
- Pagina `/radar-eventi` live, `noindex`, fuori dalla sitemap, login OTP e gating di ruolo.
- Sonda estesa ai tre gate.

**Aperto:**

- **Lo scheduling.** `20260801090000_radar_eventi_cron.sql` è scritta ma non applicata: pg_cron deve passare `x-ingest-token` e il token va messo nel Vault. Prerequisito di Cristian, coincide con la rotazione di INGEST_TOKEN già in sospeso dal 29/7.
- **Il ciclo completo su dati reali** (harvest → classifica → approva → pubblica) non è stato eseguito: senza il token non si può lanciare l'harvest. La logica di raccolta e pre-filtro è però stata provata contro i portali veri riportandola in Python: 17 portali interrogati, 43 eventi futuri, e i falsi positivi trovati sono stati corretti nel codice.
- **Il primo riempimento sarà magro.** Con 10 eventi per portale e nessun backfill possibile, il Radar si popola nei giorni successivi, man mano che i comuni pubblicano. È un'altra ragione per cui la fonte `manuale` e i rapporti con le APT contano.

---

## 6. Stato a monte

**BLOCCO 1 (coda legale) chiuso e verificato in produzione il 31/7/2026.**

| Cosa | Stato live |
|---|---|
| `/cookie-policy` v2, numerazione `2.x` rimossa, tabella cookie e archiviazione locale, revoca esplicita, riferimenti corretti a privacy, termini e regolamento | Live, "Ultimo aggiornamento: 30 luglio 2026" |
| `/privacy`, voce "Cookie e tecnologie simili" nei trattamenti trasversali di 1.3, numerazione intatta | Live |
| `/termini`, perimetro esplicito sito più app soci `community.elbrenz.eu` nella sezione 1 | Live |
| Banner: categoria `analytics` rimossa (decisione Cristian 30/7), resta `necessary` in sola lettura | Live |
| Footer "Preferenze cookie": è un `<button type="button" data-cc="show-preferencesModal">`, quindi attivabile da tastiera | Live |

Commit su `origin/main`: `6109ef3`, `ebf7900`, `eacac8f`.

---

*Roadmap Radar eventi · El Brenz APS · 31 luglio 2026*
