# Registro delle correzioni ai dati

Qui si annotano le modifiche fatte **ai dati** del database di produzione, non
allo schema. Lo schema sta nelle migration, che si possono rieseguire; queste
no. Rieseguire una correzione ai dati su un database nuovo significherebbe
inventare righe che non sono mai esistite.

Ogni voce dice: quando, cosa, perché, e chi l'ha decisa.

---

## 3 agosto 2026 · gli anticipi della gita erano contati come quote associative

**Deciso da:** Cristian Bresadola (segretario), con la chat.
**Eseguito da:** la chat, via MCP.
**Tabelle toccate:** `pagamenti_tesseramento`, `domande_tesseramento`.

### Che cosa era successo

I due anticipi della gita ai Giochi Medievali, 90 euro il 26 luglio e 30 euro
il 1 agosto, erano stati registrati in `pagamenti_tesseramento` con
`tipo = 'quota'` e `anno = 2026`. I loro `capture_id` coincidono esattamente
con quelli delle due righe di `iscrizioni_gita`: sono lo stesso denaro, contato
in due posti e nel posto sbagliato.

Da lì erano nate due domande di tesseramento fantasma, con nome
`(da identificare)` ed email `da-completare@elbrenz.eu`, rimaste in coda di
approvazione otto giorni la prima e due la seconda.

Conseguenze concrete: il registro delle quote 2026 diceva 280 euro su dieci
righe invece di 160 su otto; l'Associazione avrebbe potuto emettere due tessere
a due persone che non esistono; e per il rendiconto RUNTS era un errore di
imputazione, non una svista di forma.

### Che cosa è stato corretto

1. i due pagamenti riclassificati da `tipo = 'quota'` a `tipo = 'anticipo_gita'`,
   con `domanda_id` portato a null;
2. le due domande fantasma portate a `stato = 'annullata'`. Non `respinta`:
   nessuno aveva chiesto nulla, e respinta racconterebbe un rifiuto che non
   c'è mai stato;
3. il pagamento di Michele Corradini ricollegato alla sua domanda vera.

Il numero di tessera di Corradini **non** è stato assegnato: lo decide il
segretario.

### La causa, e dove è stata chiusa

Non è stato un errore di chi ha inserito i dati: è il paracadute per i
pagamenti orfani, introdotto l'8 luglio in `paypal-webhook`. Quando un webhook
PayPal non trova una riga corrispondente, ne crea una; e siccome `tipo` ha
`default 'quota'`, ogni incasso di cui il webhook non sappia nulla diventava
una quota associativa, e da lì una domanda da approvare.

Il paracadute è giusto per il tesseramento e sbagliato per tutto il resto,
perché non distingueva da quale flusso arrivasse il denaro.

Chiusura nel commit del 3 agosto su `paypal-webhook`: prima di creare
qualunque riga il webhook chiede a `iscrizioni_gita` se quel `capture_id` o
quell'`order_id` è già suo, e la creazione della domanda segnaposto ora
richiede un segnale esplicito del flusso di tesseramento invece di accontentarsi
di un `tipo` arrivato da un valore predefinito.
