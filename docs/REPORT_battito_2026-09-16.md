# Il salvataggio settimanale non ha mai funzionato, e il messaggero che doveva dirlo è guasto

16 settembre 2026, sessione cloud. Emerso mentre si rileggeva l'ondata 2
dell'audit: una voce diceva che il salvataggio del 13 settembre aveva
risposto 500. Tirando quel filo è venuto su tutto il resto.

Tutte le prove qui sotto sono letture dal database di produzione
(`servizio_battito`, `v_servizi_stato`, `cron.job`, `cron.job_run_details`).

---

## 1. Il salvataggio non ha mai prodotto un backup. Nemmeno uno.

`servizio_battito` conserva quattro tentativi, e sono quattro fallimenti
identici:

| Quando | Esito | Motivo registrato |
|---|---|---|
| 28/08/2026 21:15 | errore | `BACKUP_PUBKEY non configurata: nessun salvataggio possibile senza cifratura.` |
| 30/08/2026 02:00 | errore | stesso |
| 06/09/2026 02:00 | errore | stesso |
| 13/09/2026 02:00 | errore | stesso |

Il lavoro pianificato `salvataggio-settimanale-domenica` (`0 2 * * 0`) parte
regolarmente e `cron.job_run_details` lo segna `succeeded` ogni volta: il
lavoro misura se la richiesta è partita, non come è finita. La funzione
parte, controlla il primo cancello, non trova il segreto `BACKUP_PUBKEY` e
si ferma prima di leggere un solo dato. È il comportamento giusto, scritto
apposta nel brief del 28 agosto: meglio nessun backup che uno in chiaro.

Il punto è che il segreto non è mai stato impostato. Dal 28 agosto
l'associazione crede di avere un salvataggio automatico settimanale e non
ne ha nessuno. Il prossimo tentativo è domenica 20 settembre alle 02:00 e
fallirà allo stesso modo.

**Cosa serve**: impostare nei Supabase secrets `BACKUP_PUBKEY` (la chiave
PUBBLICA age, quella che sta già scritta nell'handoff del 5 settembre e che
è pubblica per natura) e verificare che ci siano anche
`GOOGLE_BACKUP_SA_EMAIL`, `GOOGLE_BACKUP_SA_KEY` e
`GOOGLE_BACKUP_FOLDER_ID`. La funzione li controlla in quest'ordine, quindi
finché manca il primo non sappiamo nulla degli altri tre. Poi una chiamata
a mano e la lettura del battito: deve dire `ok` con il conto delle tabelle.

Nota: i salvataggi fatti a mano il 5 settembre (database e Storage, cifrati
e verificati) esistono e stanno dove dice quell'handoff. Non siamo senza
copie. Siamo senza l'automatismo che credevamo di avere.

## 2. Il cruscotto che doveva avvisare è guasto dal 14 settembre

`cruscotto-digest` è il promemoria settimanale che manda al gruppo del
direttivo l'elenco dei servizi in allarme. La regola scritta nel suo codice
è esplicita: si manda anche a zero allarmi, perché il silenzio non deve
poter significare sia «tutto bene» sia «sono morto».

Ultimo battito: 14/09/2026 08:00, esito **errore**, dettaglio
`{"errore": "Gateway Timeout"}`. Il lavoro pianificato è partito
(`succeeded`), la funzione è andata in timeout.

Il giro precedente, 07/09/2026 08:00, era riuscito e diceva:
`{"servizi_guasti": 5, "code_in_allarme": 1}`. Quindi il 7 settembre un
messaggio con cinque servizi in allarme è partito davvero. Il 14 settembre
non è partito niente.

**Cosa serve**: capire perché va in timeout (quale delle letture che fa è
diventata lenta) e, indipendentemente da questo, che un timeout del
messaggero sia visibile da qualche altra parte. Oggi il guasto della
sentinella si vede solo guardando la tabella che la sentinella stessa
doveva farci guardare.

## 3. Cinque servizi in allarme adesso

Da `v_servizi_stato`, lettura del 16/09/2026 alle 11:50 UTC:

| Servizio | Ultimo battito | Esito | Diagnosi |
|---|---|---|---|
| salvataggio-settimanale | 13/09 02:00 | errore | ultimo esito in errore |
| cruscotto-digest | 14/09 08:00 | errore | ultimo esito in errore |
| coda-ascolto-promemoria | 28/08 03:46 | ok | silenzioso da 464 ore |
| solleciti-domande | 28/08 03:46 | niente_da_fare | silenzioso da 464 ore |
| solleciti-quota | 28/08 03:46 | ok | silenzioso da 464 ore |

Sani: guardiani-digest, radar-eventi-harvest, radar-eventi-classifica,
sentinella-pagine.

Sui tre «silenziosi» c'è una differenza importante da capire prima di
intervenire:

- `solleciti-quota`: il lavoro pianificato `solleciti-quota-giornaliero`
  (`15 7 * * *`) gira davvero, e stamattina alle 07:15 ha risposto
  `succeeded`. Quindi la funzione viene chiamata ma non scrive più un
  battito. O esce presto senza scriverlo, o fallisce prima di arrivarci.
- `coda-ascolto-promemoria`: stessa forma, il suo lavoro settimanale è
  partito il 14/09.
- `solleciti-domande`: **non ha nessun lavoro pianificato**. Nell'elenco
  completo di `cron.job` non esiste una voce che lo chiami. È la Trappola 15
  un'altra volta: una funzione pubblicata e mai collegata a nulla.

**Cosa serve**: decidere se un servizio che non ha niente da fare debba
scrivere lo stesso un battito «niente_da_fare» (io direi di sì: altrimenti
«sano e inoperoso» e «morto» si assomigliano troppo), e decidere se
`solleciti-domande` deve avere un lavoro pianificato oppure no. La seconda è
una scelta che manda email a persone, quindi non la prendo io.

## 4. La forma comune di tutti e tre i guasti

È sempre la stessa, ed è già scritta in `CLAUDE.md` più di una volta: una
cosa sembra a posto perché nessuno guarda la cosa giusta.

- `cron.job_run_details` dice `succeeded` quando la richiesta parte, non
  quando il lavoro riesce. Quattro `succeeded` sopra quattro fallimenti.
- La funzione che doveva tradurre i battiti in un messaggio umano è
  anch'essa un servizio che può guastarsi, e quando si guasta tace.
- Un servizio che non scrive un battito è indistinguibile da un servizio
  che non c'è più.

La misura giusta non è un altro controllo, è che il controllo esistente
fallisca **rumorosamente**. Vale la pena ragionarci con calma.

---

## In ordine di urgenza

1. `BACKUP_PUBKEY` nei secrets, prima di domenica 20. È l'unico punto dove
   si rischia di perdere qualcosa di irrecuperabile.
2. Capire il timeout di `cruscotto-digest`, perché finché tace non sapremo
   del prossimo guasto.
3. Battito «niente_da_fare» per i servizi inoperosi, così «silenzioso»
   torna a voler dire qualcosa.
4. Decidere su `solleciti-domande`: lavoro pianificato, oppure motivazione
   scritta del perché non ne ha uno.
