# REPORT — Delibere del Consiglio Direttivo, 2 settembre 2026

Riscontro al BRIEF CODE del 2/9/2026 ("Interventi approvati dal Consiglio
Direttivo del 1° settembre 2026"). Ordine come nel brief.

---

## 1. URGENTE · La mail di iscrizione che parte a ogni lemma — FATTO

**Causa confermata leggendo il codice** (`supabase/functions/guardiani-contributo/index.ts`, ramo INVIO CONTRIBUTO):

- `marketingToken` veniva generato con `crypto.randomUUID()` a **ogni** invio, senza mai leggere se il contributore ne aveva già uno: chi cliccava un link di conferma già ricevuto lo trovava scaduto, perché il token in tabella era nel frattempo cambiato.
- Il blocco che spedisce la mail di doppio consenso controllava solo `consensoMarketing && marketingToken`, **mai** `contrib.marketing_double_optin` — pure letto dalla `select` dell'upsert poche righe sopra, e mai usato.

**Correzione** (`supabase/functions/guardiani-contributo/index.ts`, commit `cb0594c`):

- Il contributore esistente si legge **prima** di scrivere (`contribEsistente`); il token si genera solo se non esiste già.
- Nuova colonna `guardiani_contributori.marketing_invitato_il` (migrazione `20260902120000_guardiani_marketing_invitato_il.sql`).
- La mail parte solo se: `consensoMarketing` **e** non ancora confermato (`marketing_double_optin != true`) **e** ultimo invito assente o più vecchio di 30 giorni.

Edge function ridistribuita (`supabase functions deploy guardiani-contributo`); `verify_jwt` verificato `false` dopo il deploy, come da `config.toml` (Trappola 12).

### Verifiche del punto 1, una per una

Eseguite in produzione con un contributore di prova (`test-brief-cd-20260902@elbrenz.eu`), poi ripulito interamente (0 righe residue in `dizionario_lemma`, `guardiani_contributori`, `vocabolario_voce`).

1. **Due lemmi di fila, stesso indirizzo e consenso: la mail di conferma parte una volta sola.** → **SÌ.** `marketing_invitato_il` si è valorizzato al primo invio e non è cambiato al secondo.
2. **Il `marketing_token` non cambia fra il primo e il secondo invio.** → **SÌ.** Stesso token (`2ad59e7c48494be195b2bfaa2180d6f5`) su entrambe le righe verificate a database.
3. **Un contributore con `marketing_double_optin = true` che invia un lemma non riceve nulla.** → **SÌ.** Impostato `marketing_invitato_il` a 60 giorni fa via SQL (per essere sicuri che, senza la correzione, sarebbe scattato un nuovo invio) e mandato un terzo lemma: `marketing_invitato_il` è rimasto quello di 60 giorni fa, prova che nessuna mail è partita.
4. **La mail di cortesia col riepilogo della parola continua a partire sempre.** → **SÌ** (per costruzione: quel blocco non è stato toccato, il diff è verificabile riga per riga nel commit).

---

## 2. Geolocalizzazione — CAUSA NON TROVATA, non "sistemato"

Come chiesto: si riporta la causa reale, non un cambiamento fatto alla cieca.

**Cosa è stato verificato:**

- Chiamata diretta a Nominatim con gli stessi parametri della edge function (`viewbox`, `countrycodes=it`, `limit=1`): **"San Romedio" risponde correttamente**, primo risultato "Santuario di San Romedio" a 46.3690243, 11.1064838 — dentro il riquadro Trentino (`TRENTINO_BBOX`) usato dal controllo di plausibilità lato server. La geocodifica in sé **funziona** per questa query esatta.
- Verificata `geocodifica_coda` (la fila a un secondo per Nominatim): non è mai rimasta bloccata nel futuro, l'ultima prenotazione risale al 23/8 — nessun accumulo di attesa che spieghi un "non risponde".
- Verificato `verify_jwt = true` su `geocodifica-luogo`: **corrisponde** a quanto dichiarato in `config.toml` — non è la Trappola 12.
- Cercato nei log delle edge function (finestre di 24h, fino al limite di trattenimento disponibile: 31/8–2/9) qualunque invocazione di `geocodifica-luogo` che citi "San Romedio", "Romidi" o anche solo il nome della funzione: **nessuna riga trovata**, in nessuna delle finestre controllate.

**Conclusione onesta:** la richiesta non risulta mai arrivata alla edge function nel periodo osservabile, e quando la si esegue direttamente contro Nominatim con gli stessi parametri funziona. L'ipotesi più coerente con il codice (non verificata, perché non riproducibile) è il cancello di autorizzazione dentro `geocodifica_prenota_slot()`: serve ruolo ≥50 o `curatore_contenuti`; chi non lo ha riceve un errore generico ("Ricerca non riuscita. Riprova o posiziona a mano.") indistinguibile, a vista, da un vero "non risponde". Non è stato toccato nulla: senza una riproduzione reale, cambiare codice al buio avrebbe rischiato di nascondere il sintomo senza cambiarne la causa.

**Per chiudere davvero questo punto** servirebbe: la persona che ha provato "San Romedio" a confermare (a) su quale account/ruolo era loggata, e (b) se ha visto un messaggio d'errore preciso o solo l'assenza di reazione.

---

## 3. Accorpamento dei doppioni: parlata e paese — FATTO

**Causa reale trovata guardando `v_variante_candidate` (non dedotta):**

Il ramo `'traduzione'` (stessa definizione) e il ramo `'grafia'` (lemma simile) non filtravano **mai** sulla parlata. E il ramo `'grafia'` esclude **esplicitamente** i lemmi con grafia identica (`a.lem_n <> b.lem_n`), perché pensato per i quasi-uguali: il caso più ovvio — grafia identica — non veniva **mai** proposto da nessuno dei due rami. **Sores** (Croviana/Malé) e i due **Becár** (macellaio/pungere) non comparivano mai in console: non per il ramo grafia (escluso per costruzione), non per il ramo traduzione (le loro definizioni non coincidono affatto).

**Correzione** (migrazione `20260902130000_variante_candidate_parlata_paese.sql`):

- `'traduzione'` e `'grafia'` guadagnano il filtro `a.parlata = b.parlata`: parlate diverse non sono più proposte come doppioni.
- Nuovo ramo `'stesso_termine'` (grafia identica dopo normalizzazione), anch'esso filtrato per parlata uguale.
- Nuova colonna `stesso_comune`, visibile in console accanto a ogni coppia.

**Verificato in produzione, su dati reali** (non un test sintetico): dopo il deploy, `v_variante_candidate` propone ora **9 coppie `stesso_termine`**, fra cui esattamente i due casi del brief:
- **Sores**, solander, Malé vs Croviana — proposto, `stesso_comune = false` (propone, non fonde, come chiesto).
- **Becár**, solander — proposto con le due definizioni reali affiancate ("Macellaio" / "Pungere"), visibili in console prima di qualunque decisione: l'omografo è ora **visibile** per la prima volta, dove prima era invisibile.

**Nota sul meccanismo di fusione richiesto dal brief:** il brief chiede di usare `vocabolario_voce.unito_in`. Guardando lo schema, quel campo esiste solo per i doppioni del vocabolario di riferimento (`dominio`: `comune`, `categoria_gramm`, `parlata` — non contiene lemmi). Il meccanismo che esiste per i lemmi è `lemma_relazione` (tipo `variante`), già usato dalla console per questa esatta funzione, e rispetta già lo stesso principio richiesto: la voce assorbita **non si cancella mai**, resta e compare affiancata sulla scheda pubblica dell'altra. Non è stato creato nulla di nuovo: si è usato il meccanismo corretto già esistente.

---

## 4. Caricamento massivo — FATTO, con un limite dichiarato

Nuovo pannello "Caricamento massivo" in `/glossario-console` (tab accanto agli altri, stesso cancello ≥25 o `curatore_linguistico` già in vigore per l'intera console).

- Si incolla testo (una riga per candidato, colonne separate da tabulazione o punto e virgola: termine, definizione, parlata, paese, esempio), con due valori di riserva opzionali (parlata e paese) per chi porta molte parole tutte della stessa valle.
- **Nessun candidato entra mai pubblicato**: l'inserimento è sempre `stato = 'in_revisione'`, identico a un contributo dal modulo pubblico.
- La categoria grammaticale è **solo un suggerimento**, e solo quando l'indizio è affidabile: l'unico criterio usato è "la definizione italiana comincia con un articolo → probabile sostantivo". Ogni altro indizio (desinenze del termine ladino, lunghezza) è stato **scartato di proposito**: senza un analizzatore morfologico vero del ladino anaunico, avrebbe sbagliato categoria in silenzio — esattamente ciò che il brief vieta. Nessun valore di categoria viene mai scritto senza quell'indizio.
- I tre obblighi del modulo singolo (termine, paese, definizione vera o esempio) restano: un candidato che non li soddisfa **entra comunque** in revisione, segnalato nell'anteprima prima dell'importazione — non scartato in silenzio. Una volta importato, lo stesso indicatore "N da completare" che la console già mostra su ogni voce (generico, non specifico ai lemmi nuovi) lo segnala anche nella coda normale.
- La curatela reale resta quella di sempre: tab "I lemmi" → filtro "In revisione", nessuna coda nuova.
- Un paese scritto libero (non nel vocabolario controllato) entra come `proposto` in `vocabolario_voce`, in blocco (una proposta per valore distinto, non una per riga) — stesso comportamento del modulo pubblico.

**Limite dichiarato:** il permesso di scrittura è stato verificato leggendo le policy RLS di `dizionario_lemma` e `vocabolario_voce` (la stessa `has_ruolo_min(25)` che già permette il resto della console), e la build è verde; **non è stato eseguito un collaudo end-to-end da un vero account curatore in un browser**, perché questa sessione non ha una sessione autenticata con quel ruolo. Consigliato un giro di prova reale prima di darlo per definitivamente collaudato.

---

## 5. Suggerimento di luoghi vicini e affini — VERIFICATO E COSTRUITO (v1 semplice)

**Verifica richiesta dal brief, prima di tutto:**

- **58 luoghi pubblicati su 58 hanno coordinate valide** (lat/lng non nulle) e plausibili: tutte dentro il riquadro del Trentino, distribuite su un'area di circa 25×40 km coerente con le Valli del Noce. 57 coppie di coordinate distinte su 58 (un solo doppione, non allarmante).
- **Nessun dato di percorso reale esiste in questo schema**: `luoghi_interesse` ha solo `lat`/`lng` puntuali, nessuna tabella di sentieri o tracciati.
- Tutte le 58 hanno `geo_stato = 'manuale'` (posizionate a mano sulla mappa, non geocodificate): coerente, sono precedenti alla funzione `geocodifica-luogo` del 23/8.

**Il dato regge** → costruita la prima versione semplice chiesta dal brief: nessun modello, nessuna libreria nuova.

La sezione "Altri luoghi in {valle}" di `/luoghi/{slug}` (che leggeva solo la stessa valle — una valle è larga chilometri, quindi metteva vicini luoghi lontani fra loro e ne escludeva altri appena oltre il confine) ora usa **distanza reale (haversine)** più un **bonus di affinità di categoria** (equivalente a 1.5 km più vicino), lato server, sui 58 luoghi esistenti. Rinominata "Luoghi vicini", ogni voce mostra ora anche valle e distanza.

**Verificato in produzione** (`/luoghi/bagni-di-rabbi`): propone luoghi ora anche da valli diverse quando geograficamente più vicini (es. musei in Val di Sole a 7,4 km, prima invisibili perché la pagina è in Val di Rabbi), con le distanze reali mostrate.

---

## 6. Sezione «scotúm» — FATTO

`'scotum'` aggiunto come quarto valore del dominio `tipo` di `dizionario_lemma` (migrazione `20260902140000_dizionario_lemma_tipo_scotum.sql`), non come tabella separata — come richiesto, è una voce del glossario con la sua natura.

- Vincolo a database aggiornato.
- Validazione `guardiani-contributo` aggiornata e ridistribuita (`verify_jwt` verificato invariato).
- Moduli pubblici **IT, DE, EN** aggiornati: nuova opzione nel campo Tipo, spiegazione breve di cosa scrivere (come già fatto per etimologia e proverbi), e il filtro di ricerca del glossario pubblico ora distingue "Solo scotúm" da "detti e modi di dire" (prima li avrebbe confusi).

---

## 7. Museo Retico — VERIFICATO, non costruito nulla

Come richiesto: **nessun contatto ancora stabilito con il Museo, quindi nessuna sezione dedicata è stata costruita.**

Verifica fatta: la tabella `convenzioni` già in produzione (usata oggi da NosLab e Punto Riflesso) ha esattamente i campi che servirebbero — nome attività, categoria (testo libero, nessun vincolo da cambiare), località, beneficio, dettagli, referente con contatti, coordinate mappa, e l'intero flusso di proposta/approvazione con doppio consenso già collaudato (vedi `convenzioni-audit-1-8`). **La struttura esistente copre già il caso**: quando l'accordo con il Museo Retico esisterà, basterà una riga in più in quella tabella (via il modulo pubblico o inserimento diretto), non nuovo codice.

---

## 8. Fuori perimetro — rispettato

Non toccati: e-commerce (nessuna predisposizione, nessun gancio), procedura App Store, coda di ascolto, radar eventi, cruscotto, battito dei servizi, sezione cimiteri, i 30 lemmi col campo paese svuotato l'8/8 (il valore resta nel campo `fonte`, la correzione spetta al contributore).

---

## Commit verificati su `origin/main`

| Commit | Contenuto | Item |
|---|---|---|
| `cb0594c` | guardiani-contributo: fix mail marketing + migrazione `marketing_invitato_il` | 1 |
| `ee83e2b` | `v_variante_candidate` (parlata/paese/stesso_termine) + pannello Caricamento massivo | 3, 4 |
| `db5b78a` | scotúm: migrazione + edge + moduli IT/DE/EN | 6 |
| `bf271f6` | luoghi vicini: prossimità + affinità di categoria | 5 |

`git rev-parse origin/main` = `bf271f63595806f32927f81d4e7830d19ff13756` — verificato coincidere con `HEAD` locale dopo il push.

## Deploy (voce distinta dal commit, come da Trappola 17)

Build eseguita **dopo** il push (non da un working tree sporco, per uno stampo di versione onesto), gate `SUPABASE_ANON` verificato non vuoto, `netlify deploy --prod` lanciato, e confrontato l'hash:

```
curl -s https://elbrenz.eu/versione.json
{ "commit": "bf271f6", "costruito_il": "2026-09-02T17:25:24.926Z", "ramo": "main" }
```

Coincide con `origin/main`. Smoke test eseguiti dopo il deploy: `/luoghi/bagni-di-rabbi` (200, sezione "Luoghi vicini" con distanze reali cross-valle), `/guardiani-de-la-lenga` (opzione "Scotúm" presente nel modulo e nel filtro), `/glossario-console/` (200 dopo redirect trailing-slash).

Edge function `guardiani-contributo` ridistribuita due volte in questa sessione (fix mail + scotúm); `verify_jwt` controllato `false` dopo ciascun deploy, come da `config.toml` (Trappola 12).

---

*Raìs fonde no le 'nglacia.*
