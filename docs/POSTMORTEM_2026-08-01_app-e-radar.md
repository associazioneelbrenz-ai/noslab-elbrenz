# Post mortem — 1 agosto 2026

## «Sul sito gli eventi ci sono, sull'app no»

Sintomo riferito da Cristian la sera del 1/8: dopo aver pubblicato i venti
eventi del Radar dal pannello, il sito li mostrava e l'app no. Nemmeno
l'articolo nuovo compariva nella home dell'app.

Non era un deploy mancato. Erano tre cause distinte, che sembravano una sola.

### Causa 1 — due tabelle diverse per la stessa parola «eventi»

L'app leggeva **solo** la tabella `evento` (`src/lib/home.ts`,
`prossimiEventi`). Gli eventi del Radar stanno in `eventi_esterni`. Nessuna
query dell'app ha mai toccato la seconda.

Peggio: in `evento` c'era **una riga sola**, la gita di Sluderno, che la
funzione esclude di proposito (`tipo.neq.gita`) perche' ha la sua card dedicata
col countdown. Quindi il carosello eventi dell'app era **vuoto per
costruzione** — e siccome il componente faceva `if (ev.length === 0) return
null`, la sezione spariva del tutto e non c'era nessun segnale visibile che
qualcosa mancasse. Silenzio, non errore.

Nota: anche il sito aveva la stessa doppiezza in casa. La home leggeva la
collection markdown `src/content/eventi/*.md` (due file, uno dei quali e' un
esempio in bozza), mentre `/eventi` leggeva la tabella `evento` **piu'** la
vista `eventi_esterni_pubblici`. Tre canali per «i nostri eventi».

**Risolto**: l'app ora legge anche `eventi_esterni_pubblici`, con la stessa
regola di scadenza del sito (un ricorrente resta in cartellone fino a
`data_fine`, gli altri fino al giorno stesso). La home del sito ha lo stesso
innesto nel carosello nuovo.

### Causa 2 — l'articolo era una bozza

«Il ladino anaunico e l'AI: l'Adige racconta El Brenz», creato alle 07:05 del
1/8, era `stato = 'bozza'`, `pubblicato = false`, `pubblicato_at` vuoto. La
vista `v_articoli_pubblici` filtra `pubblicato = true AND stato =
'pubblicato'`. L'app si comportava correttamente: non c'era niente da mostrare.

**Non risolto di proposito**: pubblicare un contenuto e' una decisione
editoriale di Cristian, non mia. Resta a un flip di distanza da `/redazione`.

Va ricordato che gli articoli del **sito** vengono da 114 file markdown in
`src/content/articoli/`, quelli dell'**app** dalla tabella `articolo` (143
righe). Sono due corpus distinti che non si parlano: un articolo scritto in
redazione non compare sul sito, e uno scritto in markdown non compare
nell'app. Questo nodo resta aperto.

### Causa 3 — due deploy separati, facili da confondere

Il sito e' il progetto Netlify `a8922ddb…` (`elbrenz.eu`), l'app e'
`8447c184…` (`community.elbrenz.eu`), da repo diverso
(`~/Sviluppo/elbrenz-community`). Un `netlify deploy` lanciato dalla cartella
del sito non tocca l'app nemmeno di striscio. Nella concitazione della sera
questo bastava a far sembrare «non aggiornato» cio' che semplicemente non era
mai stato ridistribuito.

## Perche' non e' stato usato Realtime

Richiesta: «fai in modo che l'app si aggiorni in tempo reale».

La pubblicazione `supabase_realtime` contiene tre tabelle: `forum_post`,
`messaggio`, `notifica`. Aggiungerci `eventi_esterni` non sarebbe bastato: le
RLS di quella tabella sono da curatore, e Realtime le rispetta, quindi al socio
comune non arriverebbe **nessun** evento — un meccanismo che sembra acceso e
non lo e', cioe' il tipo di guasto peggiore. La vista
`eventi_esterni_pubblici`, che invece e' pubblica, non e' pubblicabile in
Realtime perche' non e' una tabella.

Adottato invece: ricarica al ritorno in primo piano (`visibilitychange` +
`focus`) e poll ogni 60 secondi **finche' la pagina e' visibile**. Per il caso
reale — l'app aperta in background mentre il curatore pubblica dal sito — la
differenza percepita e' nulla, e non si consuma rete a schermo spento.

## Il bug nella deny-list, trovato per caso

Nel controllare perche' 5 eventi risultassero `non_promuovibile` e' emerso che
il pattern in `eventi_organizzatori_esclusi` era `Associazione Mulino Ruatti`,
mentre il programma APT scrive `Molino Ruatti` — vocale diversa e nessun
prefisso. Il confronto e' un `includes` letterale
(`radar-eventi-classifica/index.ts:174`): **0 match su 4**. Quei quattro eventi
erano finiti in `non_promuovibile` solo perche' inseriti a mano gia' in quello
stato; il classificatore notturno li avrebbe fatti passare lisci.

Corretto in `Ruatti`, che prende entrambe le grafie. Verificato in SQL: 5 match
su 5.

Nella stessa occasione Cristian ha chiarito il senso della delibera del
13/7/2026: «non piu' partner **operativi**, ma non abbiamo chiuso le
collaborazioni». La lista ha quindi smesso di essere una deny-list: un
organizzatore in elenco non spinge piu' l'evento in `non_promuovibile`, lo
marca soltanto col flag `organizzatore_segnalato` e decide la curatela caso per
caso.

## Cosa resta aperto

1. **Articoli: due corpus che non si parlano** (markdown sul sito, tabella
   `articolo` nell'app). Va deciso quale sia la fonte di verita'.
2. **L'articolo del 1/8 e' ancora bozza**, in attesa della decisione di
   Cristian.
3. **Il pannello non riammette un `non_promuovibile`**: il trigger di guardia
   a database lo consentirebbe al direttivo, ma la edge `radar-eventi-azione`
   risponde 409 a qualunque stato diverso da `proposto`. Porta aperta nel DB,
   chiusa nell'interfaccia.
4. **`curato_da` nullo su venti righe**: le approvazioni in blocco del 1/8 sono
   passate da MCP con `auth.uid()` nullo, quindi il trigger non ha firmato.
   Le pubblicazioni successive, fatte da Cristian loggato, hanno firmato.
