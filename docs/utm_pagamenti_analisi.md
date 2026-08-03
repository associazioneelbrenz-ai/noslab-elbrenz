# Cablare `sorgente_utm` nei pagamenti: dove mettere le mani

**3 agosto 2026 · analisi, nessuna modifica al flusso di pagamento.**

Il brief chiede di preparare l'analisi e fermarsi: è denaro vero e si collauda
con una transazione vera, quindi si fa con Cristian alla tastiera. Qui c'è cosa
toccare e, prima, una domanda da sciogliere.

---

## La domanda che viene prima del codice

Il campo esiste in cinque punti e **non ha la stessa forma**:

| tabella | tipo | chi lo scrive | cosa ci mette |
|---|---|---|---|
| `iscrizioni_gita` | `jsonb` | `gita-crea-ordine:53,162` | l'oggetto arrivato dal client, senza pulizia |
| `guardiani_contributori` | `jsonb` | `guardiani-contributo:208,217` | oggetto, con dentro anche `informativa_versione` |
| `domande_tesseramento` | esiste, tipo da confermare | `contact-form:444` | **oggetto** `{source, medium, campaign}`, tagliato a 100 caratteri |
| `domande_tesseramento` | la stessa colonna | `contanti-registra:108` | **una stringa nuda**, `"contanti_di_persona"` |
| `pagamenti_tesseramento` | `text` (migration `20260802160000`) | nessuno, oggi | niente |

Le due righe centrali sono la cosa da guardare: **la stessa colonna riceve un
oggetto da una parte e una stringa dall'altra**. Regge solo se è `jsonb`, dove
`"contanti_di_persona"` è un JSON valido; ma allora chi legge deve sapere che
a volte trova un oggetto con tre campi e a volte una parola sola. Non l'ho
potuto verificare dal repo: la colonna non compare in nessuna migration
versionata, è stata aggiunta altrove. **Va letta dal database prima di
scrivere altro codice.**

Su `pagamenti_tesseramento` la colonna è `text` perché l'ho dichiarata così
ieri notte. Con il senno di oggi la scelta è quella sbagliata delle due:
tutte le altre quattro sono `jsonb`, e un `text` costringe a serializzare
all'ingresso e a interpretare all'uscita per l'unica tabella su cui poi si
faranno davvero i conti del funnel. La colonna è vuota, quindi cambiarla non
costa niente. **Decisione a Cristian**, non la prendo da solo.

Una nota che riguarda la lettura, non la scrittura: `contact-form` è l'unico
punto che **pulisce** i valori (trim e taglio a 100). Gli altri passano quello
che arriva dal client. Se il campo diventa la base di un rapporto, la pulizia
va fatta in un posto solo.

---

## I punti esatti da toccare

Il flusso è: pagina → `paypal-create-order` (crea la riga e l'ordine) →
`paypal-capture-order` (segna `completato`). Gli UTM vanno raccolti alla
partenza, non all'incasso: a quel punto l'utente è già passato per PayPal e la
querystring d'origine non c'è più.

### 1. Le tre pagine che chiamano `paypal-create-order`

- `src/pages/tesseramento.astro:31`
- `src/pages/dona.astro:23`
- `src/pages/integrazione/[codice].astro:19`

In ciascuna, leggere `utm_source`, `utm_medium`, `utm_campaign` da
`location.search` al caricamento e passarli nel corpo della `fetch` a
`createOrder`. Il modello da copiare c'è già ed è collaudato:
`contact-form` lato edge (`:332-340`) e il modulo che lo alimenta.

Due accortezze che il modello esistente non ha:

- **Persistere fra le pagine.** Chi arriva su `/andreas?utm_source=…`, legge, e
  solo dopo va a `/tesseramento` perde tutto. I collegamenti che ho messo in
  home e in Andreas portano già gli UTM, ma il percorso reale non è mai una
  sola pagina. Serve un `sessionStorage`, scritto solo se vuoto, così vince la
  prima sorgente e non l'ultima.
- **Il fallback quando non c'è nulla.** Meglio `{source: 'diretto'}` che `null`:
  un rapporto in cui metà delle righe sono vuote non distingue "arrivato
  digitando l'indirizzo" da "non l'abbiamo tracciato".

### 2. `supabase/functions/paypal-create-order/index.ts`

- riga **~46-60**, dove si leggono i campi del corpo: aggiungere la lettura di
  `sorgente_utm` con la stessa pulizia di `contact-form:332-340`, non una
  nuova;
- riga **154**, la `insert` in `pagamenti_tesseramento`: aggiungere il campo.
  È l'unica riga che scrive davvero, tutto il resto sono `update`.

Nient'altro. `paypal-capture-order:84-94` fa solo `update` di stato e importo e
non deve toccare gli UTM: la sorgente si fissa alla partenza.

Da guardare quando ci si mette mano: `paypal-create-order:164-166` scrive già
`metodo_scelto` sulla domanda in modalità best-effort. La stessa struttura
serve per gli UTM, e conviene fare un passaggio solo invece di due.

---

## Cosa NON fare in questo giro

- Non toccare `paypal-webhook`: arriva da PayPal e non ha modo di sapere da
  dove veniva l'utente.
- Non riempire all'indietro le righe già esistenti. Un UTM inventato dopo è
  peggio di un campo vuoto.
- Non aggiungere il campo a `contanti-registra`: lì la sorgente è la persona
  che incassa, e `"contanti_di_persona"` lo dice già. Semmai è quella riga a
  dover prendere la forma che si sceglie, non il contrario.

---

## Collaudo, quando si farà

Con Cristian alla tastiera, una transazione vera:

1. aprire `/tesseramento?utm_source=collaudo&utm_medium=manuale&utm_campaign=utm-pagamenti`;
2. completare un pagamento reale;
3. leggere la riga in `pagamenti_tesseramento` e verificare che i tre valori
   ci siano e siano quelli;
4. ripetere senza querystring e verificare che compaia il fallback scelto, non
   un campo vuoto.
