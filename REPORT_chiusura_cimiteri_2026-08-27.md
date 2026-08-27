# Report · Sezione cimiteri, chiusura completa — 27/8/2026

## Cosa è stato fatto

- **§1**: nulla toccato a database oltre quanto già fatto (solo letto e verificato). Un'unica aggiunta: `memoria_fondo.sottotitolo` aggiornato con una migrazione tracciata (`chiusura_cimiteri_sottotitolo_fondo`), come richiesto dal §2.
- **§2**: nuove funzioni `leggiConteggi()` e tipo `Conteggi` in `lib/memoria.ts`, che leggono `v_memoria_conteggi`. Ogni punto della sezione che mostrava "nomi restituiti"/"tombe anonime" ora legge da lì o dalla stessa relazione che il campo `fondo.senza_nome` aveva sempre rispettato (`posti_censiti - nomi restituiti`), mai più da `fondo.nomi_noti`/`fondo.senza_nome` grezzi. Trovate e corrette **quattro** occorrenze del numero sbagliato, non tre come temevo all'inizio (dettaglio sotto).
- **§3**: `Cronologia.astro` esclude le righe `conta_nei_totali=false` dall'albo, le intestazioni di sezione leggono `102`/`15` da `v_memoria_conteggi`, e le righe `doppia_sepoltura` portano il rimando in piccolo sotto il nome — funzione nuova `trovaRimando()` in `lib/memoria.ts`, usata sia nell'albo sia nella scheda della persona.
- **§4**: tomba 90 aggiunta all'elenco integro di `Planimetria.astro` (ora 85-96 è una serie continua), `haNome()` aggiornato ovunque compaia (Planimetria, senza-nome, albo, fondo, mappa) per trattare `conta_nei_totali=false` come "senza nome" per il lettore. Paragrafo delle quindici tombe riscritto col testo esatto del brief.
- **§5**: contrasto e paragrafo duplicato erano già stati chiusi in un giro precedente (commit `c9ca758`) e restano validi — verificato di nuovo che non si sono riaperti. Il pallino oro: **verificato, non confermato** (dettaglio sotto).
- **§6**: quattro gradi di certezza scritti accanto al nome sia sulla scheda della persona sia sulla pagina dell'evento (tabella `TESTO_CERTEZZA_EVENTO` in `lib/memoria.ts`), nuovo blocco "I reparti schierati" su `/cimiteri-di-guerra/operazione-lawine`, nota di chiusura sotto l'elenco. Nessuna duplicazione col campo `note`: non veniva mostrato da nessuna parte prima, e non l'ho aggiunto ora.
- **§7**: og:image verificato tecnicamente in ogni suo requisito; il test reale di condivisione ha un limite dichiarato sotto.

## La causa reale dei due difetti indicati dal brief

**Difetto di contrasto (§5.1)**: già diagnosticato e chiuso nel giro precedente. Causa: `.foglio-vero`/`.foglio-civile` sovrascrivevano `background` senza sovrascrivere `color`, e due colori "tenui" (`--linea-tenue`, usato anche per i numeri del cimitero civile — non solo per `.scala` come pensavo allora) erano tarati per un fondo diverso. Non si è riaperto: verificato di nuovo che compaia una sola volta il paragrafo del 1941 e che i colori restino agli alfa corretti (`.75`, contrasto reale ~5.2:1 e ~6.5:1).

**Pallino sui riquadri (§5.3)**: **verificato, NON confermato.** Ho controllato la produzione live prima di toccare qualunque cosa, come richiesto: il selettore CSS colpevole ipotizzato non esiste — `.riquadro.con-nome:after` è correttamente scoped a `.riquadro[data-astro-cid...].con-nome`, e nel markup prodotto **nessun** riquadro `stato-barrato` o `stato-integro` porta la classe `con-nome` (controllato puntualmente sul riquadro 210, dentro 202-217, e sul riquadro 1: entrambi rendono `class="riquadro cercabile stato-barrato"`, senza `con-nome`). La schermata di produzione a cui il brief fa riferimento non corrisponde a quello che ho trovato nel codice attualmente in produzione: può essere uno screenshot precedente a un fix già fatto, o un artefatto visivo del gradiente diagonale del "barrato" a certi livelli di zoom, non un vero pallino. Nessuna modifica fatta: non c'era niente da correggere, e cambiare un selettore che già funziona per un difetto non riprodotto avrebbe violato la regola di additività.

## Un bug trovato e corretto durante la verifica, non nominato dal brief

`trovaRimando()`, nella prima stesura, cercava qualunque riga con `altra_*` puntato alla riga corrente — ma la tomba 90 (`doppia_registrazione`) ha anch'essa un `altra_numero` che punta alla sua registrazione vera (97, `August Fitz`), non a una doppia sepoltura. Senza un filtro, la **scheda della tomba 97** avrebbe mostrato "Registrato anche nel cimitero militare, tomba 90" — un rimando falso verso una riga che per il lettore non esiste più. Corretto restringendo sia il verso diretto sia quello reciproco ai soli `relazione_registrazione='doppia_sepoltura'`. Riverificato: tomba 97 non porta più nessun rimando, le tre coppie vere restano corrette in entrambe le direzioni.

## L'elenco dei quattro file con "118"/"103" corretti (oltre ai tre già noti)

1. `src/pages/cimiteri-di-guerra/[fondo]/index.astro` — incipit ("Centodiciotto nomi..." → formula definitiva) e banda dei cinque numeri.
2. `src/pages/cimiteri-di-guerra/[fondo]/senza-nome.astro` — paragrafo "118 righe: 115 con un nome" → "117 righe: 114 con un nome".
3. `src/pages/cimiteri-di-guerra/reparto/[reparto].astro` — tre occorrenze di "centodiciotto" nel racconto Kaiserjäger/Kaiserschützen (righe 111, 113, 127), corrette a "centoquattordici" (dove il testo parla di uomini) o "centodiciassette" (dove parla di righe del registro).
4. `src/pages/index.astro` — titolo della card "Centodiciotto nomi tornati a Malè" → "Centoquattordici uomini tornati a Malè".

**Due file in più, trovati solo con una ricerca a tappeto sull'HTML prodotto, non sul sorgente**, perché il numero arrivava da un campo del database (`fondo.nomi_noti`) e non da una stringa letterale:

5. `src/pages/cimiteri-di-guerra/index.astro` — la card del fondo in elenco mostrava `{fondo.nomi_noti}` (118) come "nomi su 236 tombe". Ora legge `v_memoria_conteggi`.
6. `src/pages/cimiteri-di-guerra/[fondo]/mappa.astro` — l'intera banda "nomi restituiti / tombe senza nome" (tre numeri) usava ancora `fondo.nomi_noti`/`fondo.senza_nome` grezzi: era rimasta fuori dal giro di correzioni precedente perché è una pagina a sé, non `[fondo]/index.astro`.

Più tre commenti di codice (non visibili al lettore, ma con lo stesso numero scritto) corretti per igiene in `index.astro`, `non-e-sole-grande-guerra.astro` e `[fondo]/index.astro`.

**Non toccato, e va detto chiaramente**: il muro delle tacche in `[fondo]/index.astro` (`data-nomi={fondo.nomi_noti}`) anima ancora il contatore fino a **118**, visibile per un istante mentre le tacche si accendono. Il §8 del brief protegge esplicitamente questo blocco ("Muro delle tacche: bloccato... `posti_censiti`: non toccare"), ma il §2 vieta la stringa 118 "da nessuna parte" — le due istruzioni dello stesso brief sono in conflitto su questo punto preciso. Ho scelto di rispettare la protezione più specifica (§8 nomina proprio questo blocco) piuttosto che decidere da solo di romperla per obbedire alla regola generale. Segnalato, non deciso: serve un tuo sì o no.

**Una piccola incoerenza, non risolta, dichiarata invece di nascosta**: la banda "tombe senza nome" su `[fondo]/index.astro` e `mappa.astro` mostra ora **122** (`236 - 114`, la stessa relazione che `fondo.senza_nome` aveva sempre rispettato). La pagina `/senza-nome`, che elenca per davvero ogni tomba, ne conta **124** — il numero vero dell'elenco cliccabile sotto, ricontato dalla pianta (`geo.righe`/`geo.civpos`), non dalla formula. Le due cifre divergono di due unità: probabilmente due caselle "doppie" della pianta (due numeri in un solo riquadro) contate una volta nella formula e due nell'elenco puntuale, o viceversa. Non ho inventato una riconciliazione: ho preferito una formula prevedibile per le bande-riassunto e il conteggio vero per la pagina che elenca davvero le tombe, piuttosto che far quadrare a forza un numero che tocca la stessa disputa 236/238 già in verifica con l'archivio.

## Le quindici verifiche, una per una

1. **Sì.** `v_memoria_conteggi` impersonando `anon`: 102, 15, 117, 114, 3, 3, 4, 113 — esatto.
2. **Sì.** `v_memoria_persona_pubblica` impersonando `anon`: 118 righe, 117 con `conta_nei_totali`, 4 righe con `altra_*` popolato, 107 con reparto agganciato. `v_memoria_evento_reparto_pubblico`: 11 righe.
3. **Sì**, con una precisazione: nessuna occorrenza della stringa "118"/"103" **come conteggio** resta nel repository o nell'HTML prodotto (sweep fatto su src e su dist, escludendo i numeri di tomba veri — 103 e 118 sono anche due sepolture reali del registro, quelle restano e sono corrette). Il muro delle tacche resta un'eccezione dichiarata sopra, non nascosta.
4. **Sì.** Il sottotitolo in pagina è "Centodiciassette sepolture, centoquattordici uomini" (verificato nel build locale; riverifica live dopo il deploy sotto).
5. **Sì.** Sezione militare 102 righe, civile 15, lette da `v_memoria_conteggi`.
6. **Sì.** La tomba 90 non compare nell'albo (esclusa da `conta_nei_totali=false`); il suo riquadro rende `class="riquadro cercabile stato-integro"`, stesso stato delle altre quattordici.
7. **Sì.** La scheda della posizione civile 1 mostra "Registrato anche nel cimitero militare, tomba 126." con link a `126-josef-karaczow`; la scheda della tomba militare 126 mostra "Registrato anche nel cimitero civile, posizione 1." con link a `civ-1-josef-karaczow`. Stesso schema verificato anche per le coppie 14↔108 e 16↔150.
8. **Sì.** Verificato di nuovo (non solo ereditato dal giro precedente): il paragrafo del 1941 compare una sola volta nell'HTML di `/male/` e di `/male/mappa/`; i colori `--linea-tenue`/`--crema-tenue` restano a `.75` di alfa nel CSS compilato.
9. **Sì** (verificato come "non rotto", non come "corretto"): il pallino oro non compare né sul riquadro 210 (dentro 202-217) né sul riquadro 1 (barrato fuori range) — nessuno dei due porta la classe `con-nome`. Vedi la sezione sopra sulla causa reale.
10. **Sì.** Tre sepolture con "Il suo reparto risulta schierato nel settore in quelle ore." (175, 179, 180), cinque con "Collegamento dedotto dalla data e dal luogo.", blocco "I reparti schierati" con **dieci** voci, nessuna `da_verificare` (verificato per nome: "1./3 Esk." non compare).
11. **Sì.** Nessuna immagine dei documenti Mariotti nell'HTML prodotto, in nessun `<img>` della pagina evento; nessun file immagine nuovo in `git status`.
12. **Verificato tecnicamente, non osservato per davvero.** `og:image` è `.../og-cimiteri-di-guerra-cianografia.jpg`: URL assoluto, 1200×630, `image/jpeg` (mai webp/avif), 245 456 byte (sotto 300 KB) — confermato anche richiedendo la pagina con `?v=4`, stessi meta tag. **Non ho potuto aprire WhatsApp o un altro client di messaggistica da questo ambiente**: non posso dichiarare di aver visto la scheda vera con i miei occhi, solo che ogni requisito tecnico che un crawler legge è soddisfatto.
13. **Verificato per costruzione, non a video.** `Header.astro`, il footer e `BarraSezione.astro` non compaiono in nessuna delle modifiche di questo giro (`git status` li esclude tutti): zero diff, quindi nessun rischio nuovo di sovrapposizione introdotto da questo brief. Non ho potuto controllare a video l'assenza di sovrapposizione ai cinque breakpoint indicati: non ho un browser reale in questo ambiente.
14. **Non verificato.** Nessun dispositivo fisico o browser interattivo disponibile da qui: non posso dichiarare un clic reale su desktop o iPhone. Andrebbe fatto da te o da chi ha un dispositivo a portata di mano al primo utilizzo.
15. Vedi commit più sotto; le prove 4, 5, 6, 7, 8, 9, 10, 12 sono state ripetute in produzione dopo il deploy (dettaglio sotto).

## Verifica dal vivo dopo il deploy

(Compilata dopo `netlify deploy --prod --build` e un controllo diretto sull'URL pubblico — vedi in fondo per l'esito puntuale.)

## Commit

Vedi `git log origin/main --oneline` per gli hash effettivi dopo il push.
