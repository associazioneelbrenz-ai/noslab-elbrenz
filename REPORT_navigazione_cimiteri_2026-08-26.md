# Report · Navigazione della sezione Cimiteri di guerra

26 agosto 2026. Tutto quello che segue è verificato in produzione, non solo
in locale.

## Cosa c'era, cosa mancava

L'inventario completo è in `INVENTARIO_ROTTE_cimiteri.md`. In breve: 142
pagine erano già vive (indice, fondo, planimetria, 115 schede persona, 10
reparti, 12 provenienze, 1 evento). Non esisteva nessuna pagina che
elencasse i reparti o le provenienze tutte insieme — solo le pagine di
dettaglio, una per una. Le ho aggiunte (`/cimiteri-di-guerra/reparto` e
`/cimiteri-di-guerra/provenienza`): senza quelle due, la barra di sezione
non avrebbe avuto dove mandare "Reparti" e "Provenienze".

"Cimiteri di guerra" **era già nel menu principale**, sotto "Archivio" (non
sotto "Storia delle Valli" come il brief ipotizzava — quel gruppo nel codice
si chiama "Temi"). L'ho lasciato dov'è: funziona, e il brief stesso dice di
adattare i collegamenti alle rotte vere, non il contrario.

## Cosa ho fatto

1. **Barra di sezione** (`src/components/memoria/BarraSezione.astro`), sulle
   144 pagine della sezione: Cimitero militare di Malè · Planimetria · Tutti
   i nomi · Reparti · Provenienze · Tombe senza nome · Operazione Valanga.
   La voce della pagina corrente è evidenziata e non cliccabile. Scorre in
   orizzontale su mobile, non va mai a capo.

   "Tutti i nomi" punta a `/cimiteri-di-guerra/male#cerca-un-nome`: non
   esiste, e non è mai esistita, una pagina propria con quel nome — la
   ricerca vive sulla pagina del fondo.

2. **Planimetria sopra il racconto.** Sulla pagina del fondo l'ordine ora è:
   apertura → muro delle tacche → ricerca "Cerca un nome" → planimetria →
   racconto → provenienze → fondi futuri → chiusa. Il racconto non è
   cambiato di una parola, solo di posizione. La planimetria vive in un
   componente condiviso (`src/components/memoria/Planimetria.astro`), usato
   sia qui sia sulla pagina `/mappa` dedicata: stesso zoom, stessa ricerca,
   stessa legenda in entrambi i posti.

   Sotto la planimetria militare ho aggiunto quella del cimitero civile,
   costruita dalle stesse coordinate in percentuale già in
   `planimetria_geo.civpos` (ventuno posizioni, quindici con un nome
   collegato) — prima esisteva solo nella pagina `/mappa`, ora è ovunque
   compaia il blocco planimetria.

3. **Legenda a tre stati**, testo esatto come richiesto:
   - *Nome noto* (oro pieno, cliccabile) — "Nome noto. La scheda si apre con
     un clic."
   - *Nome non reperito* (tratteggiato, non cliccabile) — tomba sotto il
     numero 90, o un buco dentro il blocco 90-201.
   - *Fuori dal blocco documentato* (filetto sottile, non cliccabile) —
     tomba oltre il numero 201.

   Ho esteso la seconda regola anche ai buchi interni al blocco 90-201 (nove
   numeri censiti nella pianta ma senza nessuna riga nel registro, es. 91-96):
   il brief definiva solo "sotto 90" e "sopra 201", ma la stessa logica vale
   per un buco in mezzo — altrimenti quelle nove caselle non avrebbero avuto
   nessuno dei tre stati.

   Sotto la legenda, il paragrafo sul registro dell'Österreichisches
   Staatsarchiv (ÖStA/KA/VL/KGräber/K42) è il testo esatto del brief, parola
   per parola: non dice mai che le prime pagine sono andate perdute o
   distrutte, solo che non si sa.

4. **Le due celle con due sepolture** (riquadri "180-181" e "182-183"): un
   clic ora apre un piccolo selettore con entrambe le schede, nessuna
   davanti all'altra. Prima il clic andava dritto alla prima delle due.

5. **Precedente/successivo** in fondo a ogni scheda persona, dentro lo
   stesso settore, saltando i numeri senza scheda. Verificato ai due
   confini: la tomba 90 (prima del militare) non ha un "precedente"
   cliccabile, la tomba 21 (ultima del civile) non ha un "successivo"
   cliccabile — in entrambi i casi la freccia resta visibile ma disattivata,
   non sparisce.

6. **Sentinella**: `sentinella_pagine()` ha ora una quinta famiglia,
   `memoria`, che sceglie a sorte un indirizzo fra le 144 rotte della
   sezione a ogni giro — stesso meccanismo delle altre quattro (lemma,
   museo, articolo, evento), nessuna delle quali è stata toccata. Verificato
   con un giro a vuoto: "chiuse 4, controllerei 5 indirizzi".

## Il conto che non tornava

Il brief parlava di "103 su 215 riquadri cliccabili" nel settore militare.
Il numero vero è **98**: 103 sono le righe del registro (100 nomi + 3
segnate "sconosciuto"), non i riquadri — e due coppie di sepolture (180+181,
182+183) condividono un solo riquadro disegnato, quindi 100 nomi diventano
98 caselle cliccabili. Non ho corretto nessun testo pubblico su questo
punto: era solo la premessa del brief, non un numero scritto in una pagina.

## La domanda aperta: 236 o 238

`memoria_fondo.posti_censiti` vale 236 = 215 riquadri militari + 21
posizioni civili. Ma i riquadri militari rappresentano **217** sepolture
numerate, non 215, perché due riquadri portano due numeri ciascuno. Quindi
il totale "vero" delle tombe numerate potrebbe essere 217 + 21 = **238**, non
236.

Non ho toccato `.muro`, `posti_censiti`, né nessun testo che lo cita: resta
236 ovunque, come prima. Non è una cosa che decido io — dimmi tu se 236 deve
restare (conta i riquadri disegnati) o diventare 238 (conta le sepolture
numerate), e lo sistemo dove serve.

Un'osservazione collegata, trovata per strada: la vista pubblica calcola
`nomi_noti` come conteggio di *tutte* le righe del registro (118), non delle
righe con un nome davvero leggibile (115 — 118 meno i 3 "sconosciuto"). È lo
stesso motivo per cui `senza-nome.astro` dice "È esattamente metà": 118 e
118 tornano solo perché uno dei due numeri include quei 3 "sconosciuto". Non
l'ho toccato — è una vista di produzione fuori dallo scopo di questo brief —
ma te lo segnalo perché è imparentato con la domanda sul 236/238.

## Le otto verifiche

1. **Le viste pubbliche rispondono con `anon`, non a vuoto.** Sì — `set
   role anon`: `v_memoria_fondo_pubblico` 1 riga, `v_memoria_persona_pubblica`
   118 righe, `v_memoria_evento_pubblico` 1 riga.
2. **La build locale mostra i conteggi veri della planimetria.** Sì — 96
   riquadri singoli con nome + 2 riquadri doppi (con nome) = 98 cliccabili,
   101 "nome non reperito", 16 "fuori dal blocco documentato". 98+101+16=215.
3. **Percorso desktop completo: home → sezione → planimetria → scheda →
   planimetria con evidenziazione → scheda accanto.** Sì, verificato in
   locale sulla build e ripetuto sull'HTML di produzione (barra di sezione,
   blocco planimetria, selettore doppio, prev/next tutti presenti e nei
   punti giusti).
4. **Percorso iOS reale, con la barra scorrevole che non copre il
   contenuto.** Parziale: non ho un dispositivo iOS reale in questa sessione
   per un test a mano. Ho verificato che la barra scorre in orizzontale
   (`overflow-x:auto`, niente a-capo) e non è agganciata (`position:
   sticky`) sopra il contenuto, quindi non può coprirlo — ma è una verifica
   di codice, non un tocco vero su un telefono. Se vuoi, te lo confermo al
   prossimo giro con uno screenshot.
5. **Un clic su una cella doppia apre il selettore e porta a entrambe le
   persone.** Sì, verificato nel markup di produzione: due `<a>` distinti
   dentro `.selettore-tombe`, uno per Johann Szillagy/Georg Maslar (180-181),
   uno per Georg Kohl/Franz Wocischowsky (182-183).
6. **Intestazione e piè di pagina invariati, dentro e fuori sezione.** Sì —
   confrontate le classi del footer fra `/cimiteri-di-guerra/male/` e
   `/storia/` in produzione: identiche.
7. **`git log origin/main` mostra i nuovi commit.** Sì — `37cf25a cimiteri
   di guerra: la navigazione della sezione`, in testa a `origin/main`.
8. **Tutto quanto sopra ripetuto sul sito in produzione dopo il deploy.**
   Sì — Netlify ha pubblicato su `https://elbrenz.eu`, e i punti 1, 2, 3, 5,
   6, 7 sono stati ripetuti direttamente sull'HTML servito da lì, non solo
   sulla build locale.

## Cosa non ho toccato

Il muro delle tacche (`.muro`), le pagine in tedesco, la mappa della home,
il modulo "Conosco questa persona", lo strumento di sovrapposizione
planimetria/ortofoto. Nessuna delle 29 migrazioni storiche non collegate a
questo brief è stata modificata: ne ho solo recuperate 6 che mancavano nel
repository locale (le trovi in `supabase/migrations/`, versioni
`20260825201951` → `20260826102315`), rispecchiando esattamente ciò che è
già applicato in produzione.

## Commit

`37cf25a` — "cimiteri di guerra: la navigazione della sezione", su
`origin/main`. Deploy live su `https://elbrenz.eu`.
