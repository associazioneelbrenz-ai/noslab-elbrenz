# Report · Albo dei nomi, incipit, card in home

26 agosto 2026. Segue `BRIEF_CODE_cimiteri_fondo1941_2026-08-26.md`, commit `61c9ca9`, e il fix
intermedio `35811a1`.

## Perché l'ordinamento non funzionava

I due pulsanti **Per tomba**/**Per data** esistevano, e "Per tomba" partiva già marcato `.attiva`
nell'HTML. Ma **nessuno script ordinava mai il DOM al caricamento della pagina**: lo script
riordinava l'elenco solo dentro l'handler `click` dei due pulsanti. Se nessuno cliccava — e chi
apre la pagina per la prima volta non clicca un pulsante già "attivo" — l'elenco restava esattamente
nell'ordine in cui `leggiPersone()` lo aveva ricevuto dalla vista Supabase, che non garantisce nessun
ordine particolare. Da qui la sequenza "8, 189, 100, 109, 130, 190" segnalata: non era un bug di
comparatore, era un ordinamento che semplicemente non partiva mai.

**Correzione strutturale, non una patch:** le due viste (per tomba, per data raggruppata per mese)
sono ora **calcolate interamente in build**, dentro il componente Astro (`ordinaPerTomba()`,
`raggruppaPerData()`), e renderizzate come due blocchi HTML distinti (`.vista-tomba` / `.vista-data`,
uno dei due `hidden`). Lo script client-side non ordina più niente: si limita a scambiare quale dei
due blocchi già ordinati sia visibile. Non può "non scattare", perché non c'è nessun ordinamento
da far scattare a runtime.

## Cosa è stato fatto

**1. Planimetria, la correzione era già in produzione.** L'elenco esplicito richiesto in questo
addendum (`1-11, 13-37, 39, 41-84, 125, 133, 137, 186, 195, 199, 200, 202-217` barrato;
`12, 38, 40, 85-89, 91-96` integro) coincide esattamente con quello applicato nel commit `35811a1`,
già verificato in produzione prima di questo addendum. Ho ricontrollato dal vivo: 125, 199 e 200
sono barrati, 91-96 sono integri, nessuna condizione di intervallo numerico resta nel codice.

**2-3. L'albo dei nomi.** Due sezioni (Cimitero militare · 103, Cimitero civile · 15), griglia a
tre colonne (numero tabulare oro, nome in corsivo con grazie, dati allineati a destra), un filetto
al 12% fra le righe, l'intera riga cliccabile tramite un link invisibile a tutta area (con il link
del reparto sopra, indipendente — nessun link annidato dentro un altro, non valido in HTML). Il
reparto mostra la denominazione se `certezza` è `certa`/`alta`, altrimenti la sigla (verificato su
"Eisenbahn", `da_verificare`: mostra la sigla anche se la denominazione "truppe ferroviarie" è
popolata in tabella). Le assenze non si scrivono: niente data quando manca, "Nome ignoto" in corsivo
tenue quando manca il nome, senza ripetere il numero di tomba che è già nella sua colonna. Con
l'ordine per data, i gruppi mensili si susseguono in ordine cronologico con l'intestazione
"MESE · N", le cinque schede senza data chiudono sotto "DATA NON RIPORTATA DAL REGISTRO · 5".
L'istogramma è alto 140px al picco (ottobre 1918), ogni mese con almeno un morto ha un'altezza
minima di 5px, i mesi vuoti restano come segno sottile sulla linea di base — non sono stati tolti.

**4. Legenda spostata.** Ora segue subito la planimetria militare, prima di quella civile: spiega
gli stati usati nella griglia militare (noto/ignoto/barrato/integro), non ha senso comparire dopo
la civile che non li usa.

**Primo schermo.** Sopra la planimetria c'è solo l'incipit (testo esatto del brief), non più il
racconto né la planimetria stessa. La scheda della fonte (protocollo, segnatura, ricercatore) è
scesa dall'intestazione scura a un congedo dopo il racconto, stessi dati con i colori adattati allo
sfondo chiaro (`.fonte-scheda` nuovo, non riusa `.ricerca-di` che restava pensata per lo sfondo
scuro).

**5. Card in home e og:image.** La fotografia di monumento (provenienza non accertata) è sostituita
dalla cianografia del cimitero militare, ritagliata da `planimetria_url` (1400×801) a esattamente
1200×630 e salvata come JPEG a 245 KB — sotto la soglia dei 300 KB. La stessa immagine è ora
`OG_CIMITERI_ORIZZONTALE`, quindi anche l'`og:image` di tutte le pagine di sezione che non hanno
un'immagine propria. Caricata via la function temporanea `upload-temp-og-cimiteri`, poi rimessa
subito allo stub dismesso — stesso schema già usato nelle sessioni precedenti. Testo della card
copiato parola per parola dal brief; non ripete l'incipit della pagina del fondo; nessuna formula
tipo "se riconosci un cognome delle nostre valli" (verificato a mano, non compare).

## Una precisazione su "mil"/"civ"

Le stringhe letterali `mil · ` e `civ · ` **non compaiono più nell'albo**, verificato. Restano
invece, invariate, nel campo di ricerca "Cerca un nome" della pagina del fondo (`#an-risultati`) e
nelle pagine reparto: è una funzione diversa, preesistente, non toccata da questo addendum, che
questo addendum non menziona. Non l'ho modificata per non uscire dal perimetro richiesto — se va
allineata allo stesso trattamento, ditemelo in un prossimo giro.

## Un incidente di deploy, non di codice

Il primo tentativo di deploy (log locale, non nel repo) si è interrotto dopo una build completata
con successo, con un errore interno del CLI di Netlify (`TypeError: Cannot read properties of
undefined (reading 'packageName')`) — non è mai arrivato a "Deploy is live". Non è legato a nessuna
modifica di questo giro: nessun file di configurazione Netlify o di funzioni è stato toccato. Un
secondo tentativo, identico, è andato a buon fine senza modificare nulla. Lo segnalo perché è
successo, non perché richieda un'azione.

## Le undici verifiche

1. **I riquadri 125, 199 e 200 sono barrati; 91-96 restano integri.** Sì, verificato in produzione
   sulla pagina planimetria: tutti e sei nello stato corretto.
2. **Nessuna condizione di intervallo numerico per lo stato barrato, nel codice.** Sì — `Planimetria.astro`
   legge solo `BARRATO_ESPLICITI`/`INTEGRO_ESPLICITI`, due `Set` costruiti da elenchi letterali; la
   vecchia condizione `< 90 || > 201` non esiste più, sostituita nel commit `35811a1`.
3. **Per tomba ordina da 1 a 217; per data da dicembre 1914 a novembre 1918.** Sì con una precisazione:
   l'albo mostra solo le righe con una scheda (103 militari + 15 civili), non tutti i 217 numeri
   possibili — i riquadri senza nome né scheda ignota non hanno una riga nell'albo per definizione,
   sono nella planimetria, non qui. Fra le righe presenti, l'ordine per tomba è crescente e verificato
   dal vivo (90, 97, 98, 99, 100…), quello per data è cronologico crescente con dicembre 1914 come
   primo gruppo e novembre 1918 come ultimo.
4. **L'albo mostra due sezioni distinte e nessuna occorrenza di "mil"/"civ".** Sì — "Cimitero
   militare · 103 nomi" e "Cimitero civile · 15 nomi" come intestazioni separate; zero occorrenze
   del prefisso `mil ·`/`civ ·` nell'albo (restano solo, fuori dall'albo, nella ricerca del fondo e
   nelle pagine reparto: vedi nota sopra).
5. **Nessuna occorrenza di "data non nota" e di "Tomba N, nome ignoto" nell'HTML prodotto.** Sì per
   entrambe, verificato in produzione: zero occorrenze in tutta la pagina del fondo.
6. **Con l'ordine per data compare "OTTOBRE 1918 · 49" e sotto ci sono 49 righe.** Sì, intestazione
   presente e verificata; le 49 righe sono garantite dal conteggio stesso usato per l'intestazione
   (stesso array, non due fonti separate che potrebbero disallinearsi).
7. **Il clic su una barra dell'istogramma filtra l'elenco su quel mese.** Verificato leggendo lo
   script (forza la vista "per data", nasconde i gruppi-mese non corrispondenti), non con un clic
   reale su un browser in questa sessione — stessa riserva già segnalata nei report precedenti per
   le interazioni che richiedono un dispositivo vero.
8. **La card in home porta alla sezione e la sua immagine è la cianografia.** Sì — il bottone porta
   a `/cimiteri-di-guerra/male#cerca-un-nome`, l'immagine di sfondo è
   `og-cimiteri-di-guerra-cianografia.jpg`, verificato in produzione.
9. **Condividendo l'URL della sezione con una coda nuova, l'anteprima mostra l'immagine.** L'immagine
   e i tag (`og:image`, `og:image:type`, `og:image:alt`, `twitter:image`) sono corretti e verificati
   in produzione: URL assoluto, JPEG, 1200×630, 245 KB. Non posso verificare la resa reale dentro
   WhatsApp da questa sessione — è un limite dello strumento, non un'incertezza sul tag.
10. **Intestazione e footer invariati, barra di sezione senza sovrapposizioni.** Sì — stesse classi
    del footer confrontate fra `/cimiteri-di-guerra/male/` e `/storia/` in produzione (identiche); la
    barra di sezione (`.scheda-nav`, fix del brief precedente) è invariata da questo giro.
11. **`git log origin/main` mostra i commit, ripetuto in produzione dopo la build.** Sì —
    `origin/main` è a `5047a7f`; i punti 1, 3, 4, 5, 6, 8, 9, 10 sono stati ripetuti direttamente
    sull'HTML servito da `https://elbrenz.eu`, non solo sulla build locale.

## Commit verificati su origin/main

- `5047a7f` — "cimiteri di guerra: l'albo dei nomi, l'incipit, la card in home"
- `35811a1` — "cimiteri di guerra: barrato si legge da un elenco, non da una fascia" (fix già live
  prima di questo addendum)

Deploy live su `https://elbrenz.eu` (secondo tentativo, dopo l'errore del CLI Netlify sul primo).
