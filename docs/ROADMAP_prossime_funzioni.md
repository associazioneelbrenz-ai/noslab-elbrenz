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

## Ordine consigliato

Prima **la modifica del pubblicato**, che costa meno e toglie un fastidio
quotidiano. Poi **l'OCR**, che porta più valore ma richiede una decisione sulla
spesa.

E prima ancora di entrambe, le due guardie che tacciono: sono la fondazione su
cui poggia la seconda funzione.

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
