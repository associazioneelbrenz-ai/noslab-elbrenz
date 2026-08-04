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

---

## 4 agosto 2026 · i numeri di socio dal registro cartaceo

**Deciso da:** Cristian Bresadola (segretario).
**Eseguito da:** la chat, che ha in mano il registro cartaceo tenuto dal 2009.
**Tabelle toccate:** `domande_tesseramento` (`numero_socio`, `categoria_socio`).

### Perché serviva

Il libro degli associati usava `numero_tessera` come identificativo, e non può.
L'Associazione tiene dal 2009 un registro cartaceo con un proprio progressivo
di iscrizione che arriva a centodieci, e le due numerazioni non coincidono
nemmeno da lontano: Cristian Bresadola è il socio **1** e ha la tessera **4**,
Diego Magnoni è il socio **11** e ha la tessera **1**, Michele Corradini è il
socio **15** e ha la tessera **30**.

Un funzionario che affianca i due registri trova la stessa persona con due
numeri diversi. È il tipo di discrepanza che fa mettere in dubbio anche ciò che
è corretto.

### Che cosa è stato caricato

- **18 soci** agganciati al loro progressivo storico del registro cartaceo.
- **12 soci** numerati da **111 a 122**, in ordine di adesione, perché nel
  registro cartaceo non comparivano.
- `categoria_socio` popolata per tutti: **3 fondatori**, **27 ordinari**.
- `Brenz Meister`, l'account di servizio, resta **senza numero** e fuori dal
  libro: non è un associato.

Risultato: trenta assegnazioni, valori da 1 a 122, nessun duplicato.

### I buchi restano buchi, ed è la parte da non dimenticare

Fra 1 e 122 mancano **92 numeri**: il 4, il 5, il 16, il 40, il 95 e altri.
Appartengono a soci iscritti dal 2009 che non sono più attivi e che a database
non ci sono.

Il contatore `prossimo_numero_socio()` prende **sempre il massimo più uno**,
mai il primo libero. Se assegnasse il primo libero, un socio nuovo del 2027
riceverebbe il 4, che dal 2009 è di Daprà Andrea, e il registro racconterebbe
una cosa falsa su due persone insieme. Il numero di un socio resta suo anche
quando esce, anche quando muore.

**Il prossimo numero disponibile è il 123.**

### Cosa NON va rieseguito

Questo caricamento. Lo schema, cioè la colonna, l'indice unico parziale e il
contatore, sta in `supabase/migrations/20260804200000_numero_socio.sql` e si può
rieseguire quante volte si vuole perché non tocca nessun valore. I trenta numeri
no: rieseguirli su un database nuovo li inventerebbe.
