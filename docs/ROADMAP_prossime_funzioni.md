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
