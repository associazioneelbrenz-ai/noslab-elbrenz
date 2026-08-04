# Handoff · notte fra il 3 e il 4 agosto 2026

**Tema unico: le tessere emesse senza quota incassata, e tutto quello che si è
tirato dietro.**

Dieci commit, da `6c0802c` a `e93fef3`. Sito e database sono allineati e
verificati. Chi riprende in mano il lavoro parta dalla sezione «Cosa resta»,
che è corta e precisa.

---

## 1. Il difetto da cui è partito tutto

In tredici giorni l'Associazione ha emesso e spedito due tessere a chi non
aveva versato la quota: la **26 a Stefano Schwarz** il 21 luglio, la **29 a
Lorenzo Conci** il 3 agosto.

Il segretario non ha sbagliato. La schermata che arriva dal bottone «Approva»
nell'email diceva «verranno assegnati numero di tessera e QR» e del pagamento
non nominava una parola. Ha fatto esattamente quello che l'interfaccia gli
chiedeva. **L'errore era del sistema, che gli nascondeva l'unica informazione
che serviva per decidere.**

Le cause erano tre e sono state chiuse tutte e tre.

| Causa | Com'era | Com'è |
|---|---|---|
| Il modulo | Il metodo di pagamento si sceglieva **dopo** l'invio, e 30 domande su 35 avevano il campo vuoto | La **scelta** è obbligatoria prima dell'invio. Il versamento no: chi sceglie bonifico o contanti paga dopo per definizione |
| La curatela | Non mostrava i pagamenti e non li richiedeva | L'incasso sta in cima, prima di ogni bottone. Senza quota il bottone di approvazione **non esiste** |
| La mail della tessera | Non nominava il pagamento | In deroga dice che la quota manca, con tutte e tre le modalità e un collegamento personale per pagare |

---

## 2. Che cosa è stato costruito

### A database

- **`trg_blocca_approvazione_senza_incasso`** (applicato dalla chat, versionato
  da me). Rifiuta il passaggio a `approvata` se non risulta una quota
  incassata, salvo deroga motivata. **Non si toglie nemmeno adesso**: è
  l'ultima rete se qualcuno arriva all'approvazione per una strada che non
  passa dalla pagina.
- **`domande_tesseramento.deroga_pagamento_motivo`**: si approva senza incasso,
  ma va detto perché. È la traccia che il RUNTS chiede.
- **`v_soci_in_regola`**: il libro soci. «In regola» vuol dire che **la somma**
  degli incassi validi dell'anno raggiunge la quota dell'anno, non che esiste
  un pagamento qualunque.
- **`v_incassi`**: quote, integrazioni e anticipi delle gite in un posto solo,
  senza duplicare una riga.
- **`sollecito_quota`**: il registro dei promemoria, con vincolo unico su
  (domanda, numero).
- **`quota_anno()`** e la chiave `config_app.quota_sociale_per_anno`: la quota
  smette di vivere dentro il codice.
- **`pagamenti_tesseramento`**: aggiunte `data_ricostruita`, `annullato_il`,
  `annullato_da`, `annullato_motivo`.

### Nelle edge function

- **`scheda-domanda`** (v31): `statoIncasso()` è l'unica a dire se la quota è
  entrata, e la applica sia il ramo JSON sia quello HTML. Nuovi rami
  `json/coda`, `json/paga-quota`, `json/sollecita`.
- **`solleciti-quota`** (v1, **spenta**): il promemoria al socio.
- **`contanti-registra`** (v10): accetta anche bonifici vecchi, date dichiarate
  ricostruite, e l'annullamento con motivo.
- **`tessere-qr-orfani`** (v1): toglie dallo Storage i QR di tessere che non
  appartengono più a nessuno.
- **`contact-form`** (v45): metodo obbligatorio, e la conferma al richiedente,
  che **prima non partiva affatto**.
- **`paypal-webhook`** (v28): il paracadute per i pagamenti orfani non crea più
  domande di tesseramento dagli incassi delle gite.

### Sul sito

- **`/tesseramento-curatela`**: il pannello. Prima alle domande ci si arrivava
  solo dai collegamenti nelle email, e una mail finita nello spam faceva
  sparire una domanda dai radar. Legge dalle viste, non calcola niente.
- **`/paga-quota/{domanda}/{scadenza}/{token}`**: pagare una domanda **già
  inviata**. Prima non esisteva: bisognava tornare sul modulo e ricompilare, e
  nasceva un doppione.
- Il modulo di tesseramento, la sezione eventi in home, le pagine DE ed EN
  della gita annullata.

---

## 3. Le cinque posizioni del libro soci

Sono cinque perché indicano **azioni diverse**, non per gusto di classificare.

| Posizione | Persone | Che cosa vuol dire | Che cosa si fa |
|---|---:|---|---|
| `in_regola` | 9 | La somma raggiunge la quota | Niente |
| `parziale` | 6 | Ha versato ma non basta | Serve un testo che dica «manca il completamento» |
| `da_regolarizzare` | 13 | Registro cartaceo: ha pagato, manca il dato | Servono i dati a Cristian |
| `ammesso_senza_incasso` | 2 | Schwarz e Conci | Promemoria, quando si accende |
| `account_di_sistema` | 1 | Tessera 0, il founder | Niente |
| `annullata` | 4 | Doppioni e fantasmi | Niente |

**I sei parziali hanno a sistema la sola integrazione da 10 €**: la quota base
versata prima che salisse a 20 non è registrata da nessuna parte. Fra loro ci
sono Cristian Bresadola e Diego Magnoni.

**I soci col marcatore dell'import del 7 luglio sono diciannove, non tredici**:
sei hanno già l'integrazione registrata e risultano parziali, tredici non hanno
niente. I dati servono per **diciannove** nomi.

Cassa: **240 €** fra quote e integrazioni 2026, più **120 €** di anticipi della
gita annullata, che sono **da restituire** e nel pannello sono marcati così.

---

## 4. Cosa resta, in ordine di urgenza

1. **Accendere i promemoria.** Sono pronti e spenti. Il giro a vuoto dà **un
   solo destinatario, Stefano Schwarz**, primo promemoria, ammesso da 13
   giorni. Prima però va verificato se ha consegnato la quota in contanti senza
   che nessuno la registrasse. Si accende chiamando `solleciti-quota` con
   `?esegui=1`. La pianificazione notturna si aggiunge dopo il primo giro vero.
2. **I dati dei diciannove**: periodo di raccolta delle quote 2026, importo per
   socio, mezzo. Poi si registrano dal pannello, uno per uno.
3. **Le due edge del denaro.** `paypal-create-order` e `ricevuta-ocr` tengono
   ancora il 20 scritto dentro. Finché non si allineano a `quota_anno()`, **una
   quota nuova va cambiata in due posti**. C'è una nota in testa a entrambi i
   file. Si fa con Cristian alla tastiera, perché si collauda con una
   transazione vera.
4. **Il numero di tessera per Michele Corradini**, che sarà il 30.
5. **Un testo per i parziali**, che non esiste e non va improvvisato.
6. **Il primo giro vero del modulo di registrazione manuale.** La catena è
   collaudata simulando in SQL esattamente ciò che l'edge scrive, ma il flusso
   dal browser vuole il secondo fattore.

---

## 5. Trappole imparate stanotte

- **`revoke execute ... from anon` non basta.** Postgres concede `EXECUTE` al
  ruolo `PUBLIC` per difetto, e `anon` lo eredita da lì. Dopo la prima revoca
  la funzione rispondeva ancora 200, e l'ho scoperto solo chiamandola da fuori.
  Una migration che sembra fatta e non lo è è peggio di una che non c'è.
- **Supabase vieta la `DELETE` diretta su `storage.objects`.** Serve l'API di
  Storage, e la chiave service role vive solo dentro le edge.
- **`create or replace view` non sa inserire una colonna in mezzo.** O si
  appende in fondo, o si fa `drop` e si ricrea.
- **Un esito non gestito in un ramo lo è comunque in un altro.**
  `eseguiApprova` restituisce quattro esiti: il ramo JSON li gestiva tutti,
  quello HTML due, e leggeva `r.gia.stato` su un oggetto senza `gia`. I bottoni
  delle email di luglio puntano lì e i token valgono trenta giorni.
- **Una regola applicata in due posti diverge.** La vecchia scheda filtrava
  `tipo='quota'` e la nuova anche `'integrazione'`: per sedici soci le due
  schermate dicevano il contrario l'una dell'altra.
- **`.or()` di PostgREST separa le condizioni con la virgola.** Un indirizzo
  email concatenato dentro la stringa del filtro aspetta solo il primo
  indirizzo con una virgola dentro.
- **Il vincolo `pagamenti_contanti_coerenza` pretende `incassato_da`.** Non è
  un dettaglio: senza, il database rifiuta la riga, ed è giusto.

---

## 6. Stato di chiusura, verificato

| | |
|---|---|
| Domande | 35 |
| In coda | 0 |
| Ultima tessera | 29, quindi la 30 è libera per Corradini |
| Promemoria inviati | 0 |
| Quote e integrazioni 2026 | 240,00 € |
| Anticipi gita da restituire | 120,00 € |
| Righe di collaudo residue | 0 |
| Trigger | attivo, verificato con riga creata, tentata, rifiutata, cancellata |

Ultimo deploy Netlify: **`6a718bc4ff1d01b193bbd170`**, 04/08.
Working tree pulito, tutto su `origin/main`.
