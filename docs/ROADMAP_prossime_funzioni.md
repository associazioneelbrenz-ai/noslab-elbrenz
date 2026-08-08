# Roadmap · le prossime due funzioni

> Chieste da Cristian l'8 agosto 2026, da fare **dopo** le pendenze aperte.
> Qui c'è la valutazione di fattibilità, non solo l'elenco: serve a decidere
> con quale cominciare sapendo cosa costa.

---

## 1 · OCR automatico dei testi scansionati

**Da dove nasce.** La storia di Coredo e la peste è una fotografia di pagina
stampata: bella da vedere, ma per un motore di ricerca è un rettangolo muto.
Nessuno la trova cercando «peste Coredo», Andreas non può citarla, e chi usa un
lettore di schermo non la legge affatto. Il contenuto c'è ed è invisibile.

**Fattibile: sì, e il pezzo più difficile è già in casa.** Esiste già
`ricevuta-ocr`, che legge le ricevute di pagamento fotografate. La catena è
quella: immagine → estrazione del testo → revisione umana → salvataggio.

**Come dovrebbe funzionare.**

1. Al caricamento di un'immagine in una storia o in un pezzo del museo, parte
   l'estrazione in secondo piano. Nessuna attesa per chi carica.
2. Il testo estratto **non si pubblica da solo**: compare nel pannello di
   curatela accanto alla fotografia, in una casella modificabile.
3. Il curatore corregge e conferma. Solo allora il testo entra nella scheda.
4. In pagina il testo va sotto la fotografia (o in un blocco richiudibile
   «Leggi il testo»), così l'immagine resta la protagonista.

**Il punto su cui non transigere.** L'OCR sulla stampa dell'Ottocento sbaglia:
confonde la esse lunga, mangia gli accenti, spezza le parole a fine riga. Un
testo pubblicato senza rilettura sarebbe *peggio* di nessun testo, perché
sembrerebbe una trascrizione fedele. La curatela umana resta obbligatoria: è la
stessa regola del glossario e del museo.

**Costi e attenzioni.** L'estrazione si paga a immagine. Va messo un tetto e va
registrato quanto si consuma, altrimenti diventa una voce di spesa invisibile.
Le pagine di un libro sotto copyright si trascrivono per uso interno e citazione
breve, non si ripubblicano intere: vale la regola delle quindici parole.

**Vale anche per l'archivio.** Le stesse quattro righe di codice servono ai
documenti d'archivio e alle lettere del museo. È la funzione che apre di più.

---

## 2 · Modificare ciò che è già pubblicato

**Da dove nasce.** Un accento sbagliato, un refuso, una data da correggere. Oggi
un contenuto pubblicato si corregge solo passando dal database, e questo
significa che **non si corregge**: chi vede l'errore non è chi ha le chiavi.

**Fattibile: sì, ed è più semplice dell'OCR.** I pannelli di curatela ci sono
già tutti: glossario, museo, storie, redazione. Manca il permesso di rientrare
in una scheda dopo la pubblicazione, e le guardie che oggi lo impediscono.

**Chi deve poterlo fare.** Curatori nel loro ambito (il curatore del museo sui
pezzi, quello linguistico sui lemmi), admin e super admin ovunque.

**Le tre cose che servono perché non diventi un danno.**

- **La traccia.** Ogni modifica dopo la pubblicazione lascia riga: chi, quando,
  cosa c'era prima. Senza, una correzione sbagliata è indistinguibile da un
  testo sempre stato così, e non si torna indietro. Vale soprattutto per i
  contributi altrui: correggere la storia di un socio senza traccia è una cosa
  che si fa una volta sola, poi nessuno ti manda più niente.
- **Il testo precedente conservato**, almeno l'ultimo. Una colonna, non un
  sistema di versioni.
- **La ricostruzione.** Le pagine del sito sono statiche: una correzione si vede
  al passaggio successivo. Va detto nel pannello, altrimenti il curatore corregge,
  ricarica il sito, non vede il cambiamento e corregge di nuovo.

**Una guardia da sistemare per prima.** `trg_storia_guardia` e
`trg_donazione_guardia` oggi, davanti a chi non riconoscono, **rimettono i valori
vecchi in silenzio invece di rifiutare**. Se si aprono le modifiche senza toccarle,
un curatore correggerà un accento, vedrà «salvato», e il testo sarà quello di
prima. Vanno fatte gridare prima di aprire questa porta.

---

## 3 · La scheda del socio

**Da dove nasce.** Cinque card della plancia portano tutte a `/app/amministrazione`,
cioè all'elenco soci: domande, pagamenti da riscontrare, soci senza incasso,
email ferme. La card promette «guarda cosa è proposto» e consegna l'anagrafica.
È una scorciatoia presa in fretta, e si sente.

**L'idea di Cristian, che è quella giusta**: cliccando il nome di un socio si
apre la sua scheda, con tutto quello che si può fare per lui in un posto solo.

**Cosa ci sta dentro.** Posizione della quota (versato, manca, da quando), il
suo link di pagamento già pronto da copiare, i solleciti già mandati e quando,
la tessera e il suo codice, i ruoli, cosa ha contribuito (lemmi, storie, pezzi
del museo), e le due o tre azioni vere: manda il link, registra un contante,
assegna un ruolo.

**Perché risolve più di un problema.** Oggi per fare una cosa a un socio si passa
da tre schermate diverse e da una funzione senza maniglia. E soprattutto:
**mostrare i solleciti già mandati impedisce di mandarne un secondo per
distrazione**, che è il difetto che stamattina si è evitato solo perché qualcuno
si è ricordato a mano.

**Insieme a questa, le card della plancia vanno fatte puntare dove serve**: una
coda di domande deve aprire le domande, non l'elenco soci. Dove una schermata
dedicata non esiste, la card lo deve dire invece di scaricare l'utente altrove.

---

## 4 · Commenti e proposte di correzione sui termini del glossario

**Da dove nasce.** Una parlata non si stabilisce a tavolino: si discute. Chi
legge *Bedól* sa magari che a Rabbi si dice diversamente, o che l'accento va
altrove, e oggi non ha modo di dirlo se non scrivendo una mail.

**Due cose diverse, e conviene tenerle separate.**

- **Proponi una correzione o un'aggiunta**: strutturata, sul singolo lemma.
  Chi propone indica il campo (definizione, accento, esempio, comune) e cosa
  suggerisce. Arriva in curatela come una proposta, accanto a quelle nuove.
  Non modifica niente da sola: è la stessa regola della curatela obbligatoria.
- **Commento pubblico**: libero, sotto la scheda della parola. È il dibattito,
  e ha un valore diverso: «mia nonna la usava per dire un'altra cosa» non è una
  correzione, è testimonianza, e va conservata come tale.

**Fattibile: sì.** Il canale di proposta esiste già (`guardiani-contributo` con
il suo rate limit e il consenso), e va esteso a «proposta su un lemma esistente»
invece che solo «lemma nuovo». La scheda per parola c'è già, quindi il posto dove
metterli c'è.

**Le tre attenzioni.**

- **Il commento pubblico va moderato prima di comparire**, altrimenti la prima
  pagina del glossario che finisce su un social diventa una bacheca. Meglio: i
  soci commentano e si vede subito, chi non è socio propone e passa dalla
  curatela.
- **Chi propone una correzione va ringraziato anche se si dice di no**, e va
  detto perché: è il momento in cui una persona decide se contribuire ancora.
- **Le proposte accettate cambiano un lemma pubblicato**, quindi questa funzione
  dipende dalla numero 2 e dalle guardie che oggi tacciono.

---

## Ordine consigliato

1. **Le due guardie che tacciono.** Non è una funzione, è la fondazione: finché
   ripristinano in silenzio, ogni correzione può fallire senza dirlo.
2. **La scheda del socio** e le card della plancia che puntano dove serve. Costa
   poco, toglie un fastidio quotidiano, e impedisce un secondo sollecito per
   distrazione.
3. **La modifica del pubblicato**, che gli accenti sbagliati aspettano.
4. **Commenti e proposte sui termini**, che poggia sulla 3.
5. **L'OCR**, che porta più valore di tutte ma richiede una decisione sulla spesa.

---

## Nota sui nomi dei soci

**Fatto l'8 agosto**, non è più roadmap. In classifica compariva «Socio» perché
dieci account su quattordici avevano nome e cognome vuoti, mentre il nome vero
stava nel registro delle domande. Ricongiunti i sei risolvibili con certezza,
più i quattro già a posto.

Restano senza nome: l'account di servizio (giusto così), la casella condivisa
fra due socie (non si indovina) e due indirizzi senza domanda collegata.

**Decisione ancora aperta**: oggi si mostra «Michele C.», nome e iniziale del
cognome. Mostrare il cognome per intero è una scelta di riservatezza che riguarda
persone che non sono state interpellate, quindi la prende il Direttivo, non il
codice.

---

# 5 · Le reazioni, e come rendere viva la community

> Proposta di Giorgia (cuoricini ai commenti e ai termini), rielaborata l'8 agosto
> sulla base di due dati misurati.

## I due dati da cui partire

**`forum_reazione` esiste già dal 16 luglio e ha ZERO righe.** Il bottone c'è, e
nessuno l'ha mai premuto. Quindi il problema della community non è la mancanza di
un cuoricino: aggiungerne un altro significherebbe aggiungere un secondo bottone
inutilizzato accanto al primo.

**Il glossario invece è vivo**: 103 lemmi, sette contributori, decine di parole a
settimana. E 80 lemmi su 103 portano il **comune** di provenienza, su tredici
paesi da Castelfondo a Vermiglio.

La conclusione è che non manca l'interazione: manca il **ponte**. La vita sta in
una stanza e la piazza è nell'altra.

## L'idea: un solo meccanismo, tre significati

Una sola tabella `reazione` polimorfa (`oggetto_tipo`, `oggetto_id`, `utente_id`,
`tipo`), ma il gesto cambia senso secondo l'oggetto. È qui che la cosa smette di
essere un like e diventa uno strumento.

| Oggetto | Il gesto | Cosa produce |
|---|---|---|
| Post della community | ❤️ mi piace | affetto, come ovunque |
| **Termine del glossario** | **«la conosco anch'io»** | **dato linguistico** |
| Pezzo del museo, storia | «mi ha colpito», «ricordo anch'io» | testimonianza |

**Il cuore su una parola non deve essere un applauso.** Deve essere
*«si dice anche da noi»*, e portarsi dietro il comune di chi lo preme.

Da questo nasce una cosa che oggi non abbiamo: la **mappa di diffusione di una
parola**. *Sghirlat* è di Malé o si dice fino a Rabbi? Nessun questionario lo
scoprirebbe. Cinquanta persone che premono un bottone sì.

Questo trasforma la vanità in corpus: la stessa interazione che rende vivace la
pagina produce materiale che un linguista userebbe.

## Il ponte che rende viva la community

La community non si anima con i bottoni: si anima se **ci succede qualcosa**.

Oggi tutto il movimento accade altrove e non lascia traccia in piazza. La
proposta è un **fiume delle attività**, generato dai fatti e non scritto a mano:

- «Simone ha portato quattro parole nuove da Croviana»
- «Tre persone hanno riconosciuto *sghirlat* anche a Malé»
- «Monica ha aggiunto una storia: Ellis Island»
- «Michele ha catalogato un pezzo del museo»

Ogni riga è cliccabile e porta alla cosa vera. Ogni riga è reagibile e
commentabile. **Il feed non è un contenitore da riempire: è lo specchio di quello
che l'Associazione sta già facendo**, e che oggi nessuno vede.

Il materiale esiste già tutto: `punti_evento` registra ogni contributo con tipo,
riferimento e data. Il fiume è una vista su quella tabella, non un lavoro nuovo.

## Le regole che tengono in piedi la cosa

- **Le reazioni NON contano nella curatela.** Un lemma non si pubblica perché ha
  molti cuori: si pubblica se è giusto. Confondere le due cose significa che la
  parola più simpatica batte la parola più esatta, ed è la fine di un glossario.
- **Le reazioni valgono pochi punti, o zero.** Vale la produzione, non l'applauso.
  Altrimenti si scoprono i cuori scambiati per salire in classifica, e il sistema
  che doveva misurare la memoria misura la cortesia.
- **Una reazione sola per persona e per oggetto**, e si può togliere. Vincolo di
  unicità nel database, non nell'interfaccia.
- **Chi non è socio può reagire?** No sui contenuti della community, sì sui
  termini pubblici: «la conosco anch'io» è un dato che vale anche da chi non si è
  ancora tesserato, ed è un motivo in più per tesserarsi.
- **Niente conteggi pubblici a zero.** Un termine con zero cuori non deve
  mostrare «0»: deve invitare a essere il primo.

## Cosa serve, in ordine

1. La tabella `reazione` polimorfa con il vincolo di unicità, e `forum_reazione`
   che le confluisce dentro (senza cancellarla: i suoi zero record non fanno
   danno, ma la strada va una sola).
2. Il bottone sulle schede di parola, con la formula giusta: non «mi piace» ma
   «la conosco anch'io», e il comune di chi preme.
3. La vista del fiume delle attività, letta da `punti_evento`.
4. La mappa di diffusione, che è il pezzo che nessun altro ha e che vale una
   pubblicazione.

I commenti (funzione 4) e le reazioni sono la stessa infrastruttura: conviene
farli insieme.
