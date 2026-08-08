# Riepilogo dei lavori · 7-8 agosto 2026

> Documento di allineamento. Stato verificato a database e in produzione, non a memoria.
> Ogni numero riportato qui è stato misurato, e dove non lo è viene detto.

---

## Il filo che tiene insieme tutta la giornata

**Nessuna operazione può dichiarare un esito che non ha verificato.**

È il principio che ha guidato ogni correzione, ed è emerso lo stesso difetto in cinque punti diversi del sistema: una curatela che diceva «pubblicato» senza controllare di aver toccato una riga, una conferma di iscrizione che mostrava HTML grezzo, un caricamento che riusciva in silenzio perdendo il file, una registrazione di contanti che dichiarava errore mentre scriveva, un trigger che annullava una modifica senza dirlo.

Corollari applicati ovunque:

- gli errori devono essere **visibili**, non silenziosi;
- i controlli **segnalano**, non correggono da soli;
- ciò che non è tracciato va **dichiarato**, non mostrato come zero.

---

## 1 · I permessi che nessun audit aveva visto

### Il problema

Il ruolo `anon` (il visitatore non registrato) aveva **INSERT, UPDATE e DELETE su tutte e 90 le tabelle** dello schema pubblico, più TRUNCATE su nove, più SELECT su 103.

Nessuno dei due audit esterni l'aveva rilevato, **e non poteva**: un sito può avere sicurezza di grado A, cookie esemplari e tempi eccellenti mentre chiunque ha il permesso di scrittura su tutto. Gli audit misurano la superficie, non i privilegi.

### Il censimento che ha reso sicura la revoca

Prima di revocare, l'elenco dei flussi pubblici che scrivono:

| Flusso | Come scrive |
|---|---|
| Proposta di un lemma | edge `guardiani-contributo` |
| Richiesta di contatto | edge `contact-form` / `contatti-submit` |
| Domanda di tesseramento e pagamento | edge `paypal-*`, `ricevuta-ocr` |
| Iscrizione newsletter | edge `newsletter-gestione` |
| Iscrizione alla gita | edge `gita-*` |
| Donazione di materiale | edge `donazione-upload` |
| Proposta per il museo | edge `museo-gg-proposta` |

**Nessuna pagina pubblica scrive col client anonimo.** Le scritture dirette che esistono stanno in pagine di curatela, che richiedono una sessione e scrivono come `authenticated`.

### Cosa è stato fatto

- Revocate **INSERT, UPDATE, DELETE, TRUNCATE** su tutte le tabelle;
- revocate anche via `ALTER DEFAULT PRIVILEGES`, altrimenti la prossima tabella nasce di nuovo scrivibile;
- attivata la RLS su `guardiani_digest_invio`, l'unica che ne era priva;
- chiuse le **letture** su 70 tabelle sensibili (denaro, persone, canali, registri interni, forum, stanze di Andreas), più `v_forum_autore` e le 16 tabelle raggiungibili solo attraverso una vista.

### Perché si poteva fare senza rompere il sito

**Le viste pubbliche non sono `security_invoker`**: girano coi privilegi del proprietario, quindi `glossario_pubblico` continua a leggere `dizionario_lemma` anche ora che l'anonimo su quella tabella non ha più nulla.

Unica eccezione trovata: `v_forum_autore` **è** security_invoker. La revoca l'aveva già spenta per l'anonimo, senza danno perché nessun flusso pubblico la usa (solo la curatela del museo e il forum dell'app, sempre dopo il login).

### Lo stato oggi

```
oggetti leggibili dall'anonimo    25   (11 viste + 14 tabelle di contenuto)
non dichiarati                     0
scritture anonime                  0
permessi concessi a PUBLIC         0
```

Ciò che resta aperto è **dichiarato** in `permesso_anon_lettura_attesa`, con il motivo riga per riga. Il sesto controllo della plancia segnala le letture non dichiarate senza toglierle: una scrittura anonima è sempre un difetto, una lettura nuova è una domanda.

### Il dettaglio che vale più della correzione

La tabella che dichiara i permessi attesi **è stata pescata dal proprio controllo un minuto dopo essere nata**, già leggibile dal pubblico per via dei privilegi predefiniti. È la dimostrazione, senza bisogno di argomentarla, che il difetto sarebbe tornato da solo.

### Nota onesta

**Nessun dato stava uscendo.** La RLS fermava già tutte quelle letture. Ciò che è stato chiuso è la porta esterna dietro cui c'era una serratura girata. Non era un'emergenza, ed era comunque giusto farlo: la RLS è una politica scritta a mano, e una politica sbagliata domani apre ciò che oggi tiene chiuso.

---

## 2 · Andreas: difesa dall'iniezione nel prompt

### Le due porte

Nel prompt di Andreas entrano **due testi che non controlliamo**:

1. la domanda di chi scrive nella casella;
2. **i pezzi di conoscenza recuperati dalla KB**, che nascono da fonti esterne e dagli articoli scritti in redazione.

Il secondo è il più insidioso, perché arriva etichettato `[FONTE n]` e quindi con l'aria di essere materiale nostro e affidabile. Chi scrive un articolo può far arrivare ad Andreas, anche senza volerlo, un testo che somiglia a un comando.

### La difesa, su due piani

**Struttura**: il materiale non fidato viaggia dentro `<documenti_recuperati>` e `<domanda_utente>`, e da quel materiale le etichette vengono neutralizzate (funzione `neutralizza`). Nessuno può chiudere il proprio blocco e aprirne uno che sembri di sistema. Neutralizzato anche il **titolo** della fonte, non solo il contenuto.

**Regola**: la clausola `DIFESA` sta dentro i `VINCOLI` di **entrambi** i prompt. In questo progetto si era già visto con la Base Storica che un blocco non richiamato dai VINCOLI resta inerte.

Il filtro è volutamente stretto: tocca solo le etichette e il marcatore `[FONTE`. Un filtro largo rovinerebbe la prosa vera, dove «istruzioni» è una parola normale.

### I collaudi, tutti in produzione

| Attacco | Esito |
|---|---|
| Contraffazione delle etichette + richiesta del prompt + link esterno | respinto |
| Finta autorità del direttivo + cambio di personaggio + richiesta di dati altrui | respinto su tutto, e rimasto in italiano |
| Documento avvelenato incollato nella domanda, con parola-canarino | respinto |
| **Chunk avvelenato dentro la KB vera** | respinto |

L'ultimo è quello che conta. Il chunk è stato inserito **dentro una fonte autentica e pubblica**, con l'embedding clonato da un chunk vero: la distanza diventa identica, quindi il gemello avvelenato entra nel contesto ogni volta che entra l'originale. Verificato in SQL: i due compaiono appaiati a somiglianza `1.0000`.

Il veleno era nel contesto. Andreas non gli ha obbedito: nessun canarino, nessun recapito estraneo, nessuna firma falsa, nessun prompt svelato, e ha risposto normalmente alla domanda vera.

Chunk rimosso e verificato a zero, per marcatore **e** per testo. Contatore delle domande pubbliche rimesso al valore precedente.

### Un difetto trovato e corretto

Davanti al documento avvelenato, Andreas **spiegava il tentativo invece di rispondere alla domanda legittima** che gli stava accanto, al contrario di quanto la clausola stessa prescriveva. Regola e comportamento non coincidevano, ed è peggio di nessuna regola perché dà falsa fiducia. Riscritta e ricollaudata.

---

## 3 · Accessibilità: il contrasto dell'oro

### La misura

`#C8923E` (l'oro del marchio) su crema `#F8F1E4` fa **2,45:1**. Il minimo per un testo è 4,5:1, e per il testo grande 3:1: non passava nemmeno quello.

Non è pedanteria da certificazione. È il motivo per cui una didascalia dorata su fondo panna, letta al sole o da chi ha settant'anni, semplicemente non si vede.

`#8a6215` è lo stesso oro portato in ombra: **4,87:1**, resta caldo.

### Perché la correzione sta nel foglio di stile

La classe `text-[#C8923E]` è scritta **identica** 221 volte, sul chiaro e sullo scuro. Dal codice non si distingue quale sta su cosa: una sostituzione a tappeto avrebbe spento l'oro anche dove funziona (sui fondi verdi fa 5,18:1 ed è giusto così).

La regola guarda l'**antenato**, che è il solo posto da cui si vede il contesto. Coperti anche i 45 stati al passaggio del mouse, che viravano all'oro pieno.

A mano solo i 16 colori in linea, fra cui il corsivo e i collegamenti della prosa degli articoli, cioè **108 pagine**, e il capolettera.

### Il marchio non è stato toccato

Le WCAG 1.4.3 escludono esplicitamente i logotipi dal requisito di contrasto. Il nome dell'Associazione è un segno, non un testo da leggere.

### Il difetto che stava per essere introdotto

Il fondo `#16231D` non era nell'elenco degli scuri. L'oro scurito ci sarebbe finito sopra a **2,95:1**, peggio di quello che si stava correggendo, su quattro pagine.

Trovato perché l'elenco è stato ricavato **misurando il costruito**: si estraggono tutti i `bg-[#...]` con luminanza sotto 0,18 e si verifica quali contengono testo oro. Il metodo è scritto nel commento del foglio di stile.

### Le misure finali

```
home        63 fallimenti  ->  1   (il marchio, esenzione voluta)
/lingua     52 passano     ->  1   (idem)
articolo    collegamenti a rgb(138,98,21)
```

Sulla home coesistono 2 ori pieni (sul verde) e 51 scuriti: la regola distingue davvero il contesto invece di appiattire tutto.

### Aperto

**L'app dei soci ha lo stesso difetto.** Il suo `body` ha sfondo avorio e `color: var(--oro)` compare come testo in circa trenta regole. Non corretta perché l'app è quasi tutta dietro il login e senza una sessione reale si misurerebbe solo la pagina di benvenuto: sarebbe un cambiamento a occhi chiusi, lo stesso errore evitato con `#16231D`.

---

## 4 · Le vetrine

### Storie

Era un elenco, ora è una pagina che fa leggere: copertina grande sull'ultima arrivata, le altre a due colonne, e come attacco **le prime righe vere del racconto**, non un riassunto inventato. In fondo la porta per chi vuole raccontare la propria.

Prerenderizzata, non più SSR: cambia qualche volta al mese e non ha ragione di essere ricostruita a ogni visita.

**Le firme non ci sono, ed è una scelta.** Tutti e quattro i racconti risultano scritti da un account la cui casella è condivisa da **due socie** (Maria Luisa Battistini n. 94 e Monica Valentinotti n. 3), e su quell'account nome e cognome sono vuoti. Il database non sa quale delle due abbia scritto.

Fra un nome che potrebbe essere sbagliato e nessun nome, il secondo è l'unico onesto: una firma sbagliata su un racconto di famiglia non è un dettaglio tecnico. Quando l'attribuzione sarà certa basta riaccendere `autore_nome`, che la vista fornisce già.

### Museo

Mancava la faccia, e con due soli pezzi era la cosa più importante: una pagina che si desse arie da museo ricco farebbe una figura peggiore di una che dice che sta nascendo.

Ora spiega che è **un museo senza sede**, dichiara quanti pezzi ha, mette in evidenza il primo portato da un socio (gli Standschützen di Cusiano) e chiarisce che **l'oggetto resta a casa**: entra in archivio la sua immagine e la sua storia.

---

## 5 · La scrittura parziale silenziosa

### Il sintomo

Un aggiornamento su `storia` scriveva `updated_at` e **non** scriveva `pubblica` né `promossa_il`, senza errori e restituendo i valori vecchi.

### La causa

`trg_storia_guardia`, trigger BEFORE UPDATE. Se chi scrive non risulta amministratore:

```sql
new.pubblica    := old.pubblica;
new.stato       := old.stato;
new.promossa_il := old.promossa_il;   -- e altri due
```

ma `new.updated_at := now()` viene eseguito **prima**, e fuori dalla condizione.

La guardia chiede `has_ruolo_min(auth.uid(), 50)`. Quando la scrittura arriva da un canale **senza JWT** (service role, editor SQL, edge function) `auth.uid()` è nullo, e la guardia tratta il capo dell'Associazione come un estraneo. In silenzio.

È la stessa famiglia del blocco che impediva a Corradini di pubblicare al museo: una guardia che tace invece di gridare.

### Dove può accadere ancora

Cercato il modo di fare in tutto lo schema (`new.<campo> := old.<campo>` in un trigger BEFORE):

| Tabella | Campi ripristinati in silenzio |
|---|---|
| `storia` | 5 |
| `donazione_materiale` | 4 |

**Nient'altro.** E il negativo vale quanto il positivo: su `pagamenti_tesseramento`, `domande_tesseramento`, `iscrizioni_gita`, `assoc_riunione` e `assoc_delibera` i trigger **sollevano errori** invece di ripristinare, che è il comportamento giusto.

### Una seconda famiglia da tenere a mente

Una UPDATE respinta dalla RLS **non è un errore: è zero righe toccate**. Stessa illusione di successo, causa diversa. La difesa è quella già applicata a `guardiani-contributo` e `articolo-azione`: `.select()` dopo la scrittura, e dichiarare riuscito solo ciò che torna indietro.

### Da fare

Entrambe le guardie andrebbero corrette allo stesso modo: **sollevare un errore invece di ripristinare**. Non fatto perché tocca il comportamento di pubblicazione.

---

## 6 · Comunicazioni ai soci

### Le quattro storie

- **Notifica nell'app**: 11 soci raggiunti (livello ≥ 10), **2 push consegnate** su 2 dispositivi mirati, zero fallite. Gli altri nove non hanno un dispositivo registrato.
- **Email**: **31 su 31 partite**, ognuna con la ricevuta Resend, zero errori. Un indirizzo per persona, con la casella condivisa contata una sola volta.

Usato il tipo di notifica `comunita` invece di inventarne uno nuovo: l'app ha un ripiego per i tipi sconosciuti, ma le **preferenze** per tipo no, e un tipo fuori elenco sarebbe un avviso che nessuno può spegnere.

### Un errore commesso e corretto

Il primo tentativo di invio è fallito: **tutte e 31 respinte con HTTP 422** da Resend. Causa: i tag passati come stringhe nude `["storie","soci"]` invece che come coppie `[{"name": ..., "value": ...}]`.

Trovato confrontando le respinte con quelle partite davvero il 4 agosto. Corretto il formato e rimesse in coda: nessuna aveva `inviata_il`, quindi nessun doppione.

**La cosa importante**: l'outbox ha **dichiarato l'errore invece di fingere il successo**, salvando codice HTTP e messaggio riga per riga. Se avesse segnato «inviata» all'accodamento, come fanno molti sistemi, l'annuncio sarebbe stato dato per ricevuto per settimane.

### I solleciti

Quattro solleciti dell'integrazione (Pangrazzi n. 13, Santini n. 88, Costanzi n. 90, Bresadola n. 91) più la quota intera a Lorenzo Conci n. 122.

**Una discordanza segnalata e risolta dal segretario**: a database nessuno dei quattro ha un pagamento registrato, quindi risulterebbe mancante l'intera quota di 20 euro e non l'integrazione di 10. Il segretario ha confermato che le integrazioni parziali sono state incassate in contanti e non ancora registrate. I testi sono quindi corretti, ma **restano da registrare quegli incassi**, altrimenti i quattro risultano non in regola nei libri sociali.

---

## Stato delle pendenze

| | |
|---|---|
| Permessi anonimi | **chiuso** |
| Viste che identificavano per email | **chiuso** |
| Ponte account ↔ numero di socio | **chiuso** |
| `contanti-registra` non ripetibile | **chiuso** |
| `caricaFilePrivato` | **chiuso** |
| Plancia operativa | **chiusa**, sei controlli |
| Dizionario dei Guardiani | **chiuso** |
| Vetrine di storie e museo | **chiuse** |
| Collaudi di Andreas | **chiusi** |
| Contrasto dell'oro nell'app | **aperto**, serve una sessione loggata |
| Le due guardie che tacciono | **aperto** |
| Quattro eventi in curatela | **aperti** dal 4 agosto |
| Incassi in contanti da registrare | **aperto** |

---

## Quello che resta all'Associazione non è codice

I contenuti dei cinquantasei luoghi della mappa. Il consenso dei contatti storici. I dati dei soci del registro cartaceo. Le tre telefonate ai possibili regolani.

*Raìs fonde no le 'nglacia*
