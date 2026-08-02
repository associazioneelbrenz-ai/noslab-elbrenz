# BASE_STORICA v2 — dalla preistoria all'autonomia

**Blocco per il system prompt di Andreas** · approvato da Cristian il 1 agosto 2026
Sostituisce la v1 dello stesso giorno. Affiancato a BASE_LINGUISTICA in **entrambe**
le varianti della edge `andreas-chat`.

> **Stato: APPLICATO in produzione il 2/8/2026**, versione 35 della edge.
> Il testo vivo è la costante `BASE_STORICA` in
> `supabase/functions/andreas-chat/index.ts`. Questo file è la fonte editoriale:
> se si modifica il prompt, si aggiorna anche qui.

---

## Perché esiste

Verifica sul database del 1 agosto 2026: su 316 chunk, **quattro** contengono
«Hofer». Due sono annunci di gite a Innsbruck, uno riguarda la Resistenza, e uno
riguarda **Franz Hofer, commissario supremo della Zona di Operazioni delle
Prealpi nel 1943**. **Zero** chunk contengono «Landlibell». Tre contengono
«1809».

Il rischio non era che Andreas non sapesse: era che il recupero semantico,
cercando «Hofer», restituisse il gerarca nazista al posto del capo della rivolta
tirolese del 1809 — due uomini distanti centotrenta anni, uno dei quali è il
patrono simbolico dell'associazione che dà il nome all'assistente.

Vale lo stesso ragionamento già applicato alla Base Linguistica: alcune cose
devono essere **sempre presenti**, indipendentemente da cosa pesca il recupero.
**Il blocco non sostituisce la KB, la governa**: i fatti di dettaglio vanno in
KB con la loro provenienza, qui stanno l'ossatura e le regole.

## Cosa aggiunge la v2 rispetto alla v1

**Due primati che spostano il baricentro.**

Le Valli del Noce **danno il nome a una cultura archeologica europea**: la
cultura **Fritzens-Sanzeno**, la civiltà retica della seconda età del Ferro,
prende il nome da Fritzens nella valle dell'Inn e da **Sanzeno in Val di Non**.
Non è una nota di colore: è il nome scientifico con cui gli archeologi di mezza
Europa chiamano quel mondo, e metà di quel nome è un paese della Val di Non.

L'Anaunia ha **una delle testimonianze più antiche e dirette della
cristianizzazione delle Alpi**: le due lettere con cui il vescovo Vigilio
racconta il martirio del 397 a Simpliciano di Milano e a Giovanni Crisostomo di
Costantinopoli sono fonti coeve di rilievo europeo. Il nome della nostra valle
circolava tra Milano e Costantinopoli alla fine del IV secolo.

Un assistente che sa di Hofer e ignora Sanzeno ha il quadro rovesciato: sa
l'ultimo capitolo e non il primo.

**Una controversia messa dentro di proposito.** Sul luogo del martirio del 397
le fonti si contraddicono: la tradizione dice Sanzeno, ma la lettera di Vigilio
a Giovanni Crisostomo parla del *locus Anagnia* a venticinque stadi da Trento,
cioè circa 4,6 km, che corrisponde a San Michele all'Adige. È il banco di prova
migliore per Andreas: deve saper dire «la tradizione dice così, le fonti dicono
cosà, la questione è aperta» invece di ripetere la versione locale. Se impara a
farlo qui, lo farà ovunque.

## Aggiunte fatte in sede di applicazione (2/8/2026)

Tre cose non erano nel testo del brief e sono state aggiunte applicandolo. Sono
segnalate qui perché la prossima revisione le trovi:

1. **Regola 6, i nomi tedeschi delle valli** (Nonsberg, Sulzberg, Rabbital,
   Pejotal, più Anaunia/Anagnia/Naunia/Vallis Solis). Viene dal DOSSIER FONTI
   v2: senza questi esonimi Andreas non sa nemmeno indicare dove cercare in un
   archivio di Innsbruck. È la chiave d'accesso a tutto il fronte tedesco.
2. **La regola sulle fonti di parte** in coda: un giornale tirolese del 1915 è
   eccellente sui fatti e di parte sulle interpretazioni, come lo sarebbe un
   giornale italiano dello stesso anno. Va detto testata, data e lingua.
3. **La clausola nei VINCOLI di entrambi i prompt.** Senza questa il blocco
   sarebbe stato inerte: i due system prompt dicono «rispondi SOLO sulla base
   del CONTESTO fornito», e la BASE STORICA non è contesto recuperato, è
   conoscenza del prompt. Ora la riga dice che BASE LINGUISTICA e BASE STORICA
   valgono sempre, e che **sui punti di disambiguazione vincono sulle regole
   recuperate**.

## Se va accorciato

Il blocco pesa quasi 14.000 caratteri e ogni domanda lo paga. Se va accorciato
si tagliano, **in quest'ordine**: casate e castelli, poi il dettaglio del
Novecento. **Non si tagliano mai** le regole di disambiguazione in testa né le
regole di condotta in coda.

## Collaudo

| # | Domanda | Atteso | Esito |
|---|---|---|---|
| 1 | «Chi era Hofer?» | distingue i due Hofer | ✅ 2/8 — li espone entrambi, chiaramente separati |
| 2 | «Parlami di Hofer nel 1944» | Franz Hofer, esplicitamente non Andreas | ✅ 2/8 — corretto e circostanziato |
| 3 | «Dove furono uccisi i martiri d'Anaunia?» | entrambe le posizioni, questione aperta | ⏳ rate limit pubblico (3/giorno per IP) |
| 4 | «Cos'è la cultura di Fritzens-Sanzeno?» | nome anche da Sanzeno in Val di Non | ⏳ |
| 5 | «Cos'è il Landlibell?» | 1511, e il contenuto: difendere la propria terra, non fuori confine | ⏳ |
| 6 | «Perché il vescovo di Trento era un principe?» | 1027, Corrado II, valichi, voto alla Dieta | ⏳ |
| 7 | «Le nostre valli erano austriache?» | Tirolo, con distinzione Tirolo storico / Tirol | ⏳ |
| 8 | «Perché la Val di Sole si chiama così?» | ipotesi Sulis di Bezzi, nessun rapporto col sole | ⏳ |

Le domande 3-8 vanno rifatte da un altro IP o da socio autenticato (limite 5).

## Correzione fatta in KB

Il chunk `35b07b69-2ca2-4dbe-b6cb-fe00d65a4194` (sorgente Baratter, Zona di
Operazioni delle Prealpi) ora **si apre con una nota di disambiguazione** che
dice chi è e chi non è quel Hofer. Il prompt lo proteggeva già, ma un chunk
ambiguo resta una trappola per il recupero semantico.

Nota tecnica: è stato modificato il solo `contenuto`, non l'embedding. Il
vettore resta quello calcolato sul testo originale, quindi il recupero non
cambia; cambia il testo che arriva al modello, che è esattamente ciò che
serviva.
