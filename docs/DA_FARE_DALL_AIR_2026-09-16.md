# Da fare dall'Air — 16 settembre 2026
*(aggiornata il 17 settembre: vedi la sezione 7 in fondo, il lavoro di
robustezza fatto in giornata è già in produzione sul database)*

Tutto il lavoro delle ondate 2 e 3 è committato e pushato. Niente è andato
perso. Questa è la lista, in ordine, di cosa resta da fare a mano.

Ramo di lavoro, su entrambi i repository: `claude/happy-cori-0d7d75`.

| Repository | Ultimo commit | Stato |
|---|---|---|
| `noslab-elbrenz` | `d4a28ed` | pushato; database e `solleciti-quota` già in produzione, sito e tre edge no |
| `elbrenz-community` | `6c51839` | pushato, non deployato |

---

## 0. Prima di tutto, e si può fare da qualunque computer con un browser

**Il salvataggio settimanale non ha mai prodotto un backup.** Quattro
tentativi dal 28 agosto, quattro fallimenti identici: manca il segreto
`BACKUP_PUBKEY`. Il prossimo tentativo è **domenica 20 settembre alle
02:00** e fallirà allo stesso modo. Dettaglio completo con le prove in
`docs/REPORT_battito_2026-09-16.md`.

Non serve l'Air e non serve un deploy: si fa dal pannello di Supabase, nel
browser, alla voce dei segreti delle edge function.

1. Impostare `BACKUP_PUBKEY` con la chiave **pubblica** age (è scritta in
   `docs/HANDOFF_2026-09-05_backup.md`, ed è pubblica per natura).
2. Controllare che ci siano anche `GOOGLE_BACKUP_SA_EMAIL`,
   `GOOGLE_BACKUP_SA_KEY`, `GOOGLE_BACKUP_FOLDER_ID`. La funzione li
   controlla in quest'ordine, quindi finché manca il primo non sappiamo
   niente degli altri tre.
3. Dopo averli messi, una chiamata a mano alla funzione e poi la lettura del
   battito: deve dire `ok` con il conto delle tabelle.

```sql
select servizio, esito, creato_il, dettaglio
from servizio_battito
where servizio = 'salvataggio-settimanale'
order by creato_il desc limit 3;
```

---

## 1. Deploy del sito

Il sito in produzione è ancora all'ondata 1 (`7dde5fd`). Tutto il resto è
solo nel repository. Vale la Trappola 17: finché non si deploya, non esiste.

```bash
cd ~/Sviluppo/noslab-elbrenz
git fetch origin claude/happy-cori-0d7d75
git checkout claude/happy-cori-0d7d75
git pull origin claude/happy-cori-0d7d75

# nessun backup deve essere rimasto dentro public/ (Trappola 19)
find public -name '*.bak*'        # deve stampare niente

npm run build

# il gate, e va LETTO CON GLI OCCHI (correzione del 16/9 al CLAUDE.md):
# non basta che la chiave non sia vuota, i primi caratteri devono essere
# quelli della chiave vera
grep -o 'SUPABASE_ANON = "[^"]\{0,12\}' .netlify/build/chunks/iscrizione_*.mjs

netlify deploy --prod --dir=dist --site=a8922ddb-53ec-4541-ac15-99570b61a1b2

curl -s https://elbrenz.eu/versione.json   # deve combaciare con:
git rev-parse --short HEAD                 # l'hash del ramo al momento della build
```

### Collaudo da browser, in ordine di rischio

1. **Chat di Andreas**: aprila, manda una domanda, controlla che il testo
   venga formattato. Le librerie ora arrivano da `/vendor/` e non più da un
   servizio esterno: se qualcosa non va, si vede qui.
2. **Pagina riservata e uscita**: apri il cruscotto o la console del
   glossario, ricarica due volte, poi esci. Non deve restare niente in
   cache. È la modifica al service worker.
3. **Modulo newsletter**: un'iscrizione vera con la tua email.
4. **Una pagina qualunque condivisa su WhatsApp**: deve comparire la
   cartolina. Trenta pagine puntavano a un'immagine che non esiste.
5. **Pagine privacy e cookie policy**: la data deve dire 15 settembre 2026.
6. **Un evento e un luogo**: le anteprime social e la scheda.
7. **Uno slug inventato**, per esempio `/luoghi/non-esiste`: deve dare 404,
   non rimandare all'indice.

### Se qualcosa va storto

Il commit precedente all'ondata 2 è `7dde5fd`, quello attualmente in
produzione. Si torna indietro con un deploy di quel commit.

---

## 2. Deploy dell'app dei soci

```bash
cd ~/Sviluppo/elbrenz-community
git fetch origin claude/happy-cori-0d7d75
git checkout claude/happy-cori-0d7d75
git pull origin claude/happy-cori-0d7d75
netlify deploy --prod
```

Collaudo da telefono: apri un corso, passa a due lezioni di seguito (la
seconda deve aprirsi quasi subito), riprendi una lezione lasciata a metà
(deve ripartire dal punto giusto), poi apri Comunità.

Nota: l'indice del corso resta in memoria per tre minuti. Chi pubblica una
lezione dalla redazione la vede comparire entro quel tempo. Se preferisci
che compaia subito, è una riga in più al salvataggio.

---

## 3. Riparazione del registro migrazioni

Guida completa in `docs/DB-05_riparazione_migrazioni_2026-09-15.md`. In
sintesi:

- **68 comandi** `supabase migration repair --status applied`, sezione A1,
  certi.
- **20 comandi** della sezione A2, verificati uno per uno il 16 settembre
  contro il database vivo. Ciascuno ha il commento `# verificata 16/9`.
- **1 sola da decidere**: `20260801090000_radar_eventi_cron.sql`. Non ha
  lasciato traccia nel database e il radar gira per un'altra strada.
  Applicarla creerebbe tre lavori doppioni. Le due vie sono scritte nel
  runbook.
- Prima di tutto: sistemare la versione doppia `20260802110000` e i file
  `.sql.bak-ondata1` rimasti nella cartella delle migrazioni.

---

## 4. Merge su main

Ondate 2 e 3 sono solo sul ramo. Quando il deploy è andato e il collaudo è
passato, si può fare il merge. Dimmelo e lo faccio io, come per l'ondata 1.

---

## 5. Cose che aspettano una tua decisione

Nessuna è urgente, nessuna blocca il deploy.

**Sicurezza e accessi**

- `SIC-10`, `SIC-13`: riguardano `andreas-chat`, che è intoccabile. Vanno
  pianificate come lavoro a sé.
- `SIC-11`: `andreas-hofer` è una edge orfana. Cancellarla è una rimozione.
- `SIC-19`: secondo token amministrativo separato da `INGEST_TOKEN`. Serve
  un segreto nuovo, che generi tu.
- `XSS-11`: rendere obbligatorio il secondo fattore negli edge riservati.
  Rischio di chiudere fuori chi non l'ha ancora attivato.
- `XSS-12`: cookie con prefisso `__Secure-`. Tocca anche l'app.
- La cassa contanti ora pretende il secondo fattore. Oggi regge, perché i
  due che possono usarla ce l'hanno. Ma l'app offre nella tendina chi sta a
  livello 30 e l'edge ne pretende 50: il giorno che assegni
  `gestione_associativa` a qualcuno, quella persona verrà rifiutata senza
  capire perché. Le due soglie vanno allineate prima.

**Privacy e legale**

- `LEG-01`: numero di iscrizione al RUNTS da inserire nei testi.
- `PRIV-07`: minori fra 14 e 17 anni nel tesseramento, serve una scelta.
- `PRIV-03`: caricare l'SDK di PayPal solo al clic. Cambia il
  comportamento di una pagina di pagamento viva, va fatto con un browser
  davanti.
- **La versione dell'informativa.** `_shared/consenso.ts` dice
  `2026-08-10`, che è giusto **oggi**, perché in produzione la pagina della
  privacy dice ancora 10 agosto. Nel momento in cui deployi il sito, la
  pagina dirà 15 settembre e quella costante diventerà sbagliata. Va
  portata a `2026-09-15` e vanno **ridistribuite** le edge che la usano:
  `contact-form`, `gita-crea-ordine`, `convenzioni-proposta`,
  `museo-gg-proposta`, `guardiani-contributo`. Dimmelo e lo faccio io
  subito dopo il tuo deploy.
- 11 persone hanno spuntato la newsletter scaricando il libro, e da oggi
  sono escluse dagli invii perché non hanno mai fatto la conferma in due
  passaggi. Non esiste un percorso automatico per rimediare. Va deciso se
  chiedere loro conferma o cancellare quelle spunte.

**Servizi e manutenzione**

- `solleciti-domande` non ha nessun lavoro pianificato che lo chiami.
  Creargliene uno vuol dire mandare email a persone, quindi decidi tu.
  **Resta aperta**: è l'unica delle tre voci del 16 settembre che il codice
  non può chiudere da solo.
- `solleciti-quota` gira **a vuoto tutti i giorni**, perché il suo lavoro
  pianificato lo chiama con `p_esegui => false`. Da oggi il cruscotto lo
  dice con parole sue («gira a vuoto da 20 giorni») invece di dire
  «silenzioso», ma resta che c'è **una persona in attesa di un promemoria
  che non parte**. Accenderlo vuol dire mandarle una email: decidi tu.
  Il comando è `select public.lancia_solleciti_quota(p_esegui => true);`,
  oppure si cambia il cron `solleciti-quota-giornaliero`.
- ~~Tre servizi risultano «silenziosi» dal 28 agosto~~ — **fatto il 17
  settembre**, vedi sezione 7.
- ~~Il promemoria settimanale del cruscotto va in timeout~~ — **fatto il 17
  settembre**, vedi sezione 7.
- `PERF-11`: React è attivo con zero componenti React. Toglierlo è una
  rimozione.
- `PERF-10`: 1.285 stili di carattere scritti a mano nelle pagine. Si fa un
  file alla volta, mai con una sostituzione cieca.
- Circa 8,3 MB di file in `public/` che nessuna pagina richiama, e otto
  immagini pesanti che andrebbero riesportate a misura. Elenco con pesi e
  posizioni nel rapporto della squadra prestazioni, dentro il commit
  `01478d8`.

---

## Che cosa è cambiato, in breve

**Ondata 2** (edge e database già in produzione dal 15, sito no):
pagamenti, verifica socio, cassa, invio email, codici usa e getta, consensi
con la versione dell'informativa, contributori che non si riscrivono da
fuori, reazioni contate davvero, salvataggio che lascia fuori le tabelle
volatili, colonne riservate chiuse all'anonimo, prefissi protetti nello
storage, pulizia di conservazione, quattro lavori pianificati riportati in
migrazione.

**Ondata 3** (tutto solo nel repository):

- SEO del Layout e della configurazione (`ebf9797`)
- SEO delle pagine di dettaglio (`19aae03`)
- Prestazioni (`01478d8`)
- Anteprime social che puntavano a un file inesistente (`8cca3c4`)

**Correzioni fatte oggi su lavoro già consegnato**: il consenso dei
Guardiani che registrava un rifiuto al posto di un sì (`b17408c`, già in
produzione), il gate del deploy nel CLAUDE.md, la Trappola 18 e la
Trappola 19.

---

## 6. Rilettura avversariale dell'ondata 3, fatta il 16 settembre

Novantacinque agenti, trenta rilievi grezzi, ventuno demoliti dai
verificatori, nove rimasti in piedi. **Quattro erano difetti introdotti
dall'ondata 3 stessa e sono gia' corretti** nel commit `42505e9`: il taglio
della descrizione finito anche sull'anteprima social, l'ora di chiusura
attaccata alla fine di eventi che durano piu' giorni, il confronto sul
marchio sensibile alle maiuscole, il testo alternativo che ripeteva il
titolo.

I cinque rimasti non li ho toccati, perche' vogliono una scelta tua o un
dato che non c'e'.

1. **In home due nodi dei dati strutturati hanno lo stesso identificativo e
   si fondono in una sola entita' con due loghi, due descrizioni e due
   canali YouTube.** Il Layout emette il suo nodo, `index.astro` ne emette
   un altro. Ora condividono l'identificativo, quindi per un motore sono la
   stessa cosa, ma dicono cose diverse. Va deciso quale delle due versioni
   vale e tolto l'altro nodo: e' una rimozione, quindi la decidi tu.
2. **`autoreEnte()` non riconosce l'unico autore che esiste a database**:
   centoventinove articoli continuano a firmarsi «Masterbrenz» come persona
   invece che come Associazione. Serve sapere da te se «Masterbrenz» va
   trattato come l'Associazione o come una persona vera.
3. **`dateModified` dichiara il falso su 134 articoli su 135**: il
   parametro c'e' ma nessuno lo passa, e la vista non espone `updated_at`.
   O si aggiunge la colonna alla vista, o si toglie il campo.
4. **Diciotto pagine statiche hanno una descrizione oltre le 155 battute** e
   vengono tagliate dalla macchina all'ultimo spazio. Il taglio e' una rete,
   non una scelta editoriale: quelle diciotto andrebbero riscritte a mano.
   Le piu' visibili: home, eventi, tesseramento, convenzioni, mappa,
   a proposito di Tirolo, lingua, i tre hub del glossario.
5. **La lista delle rotte riservate filtra per sottostringa**: un domani un
   lemma del glossario che contenga «ascolta» o «redazione» sparirebbe dalla
   sitemap senza che nessuno se ne accorga. Oggi non succede, l'ho
   verificato sui dati veri.

I ventuno rilievi demoliti stanno nel giornale della rilettura, dentro la
cartella della sessione: se un domani uno di loro si ripresenta, li' c'e'
scritto perche' non reggeva.

---

## 7. Robustezza, 17 settembre — cosa è già vivo e cosa no

Quattro commit (`72d29f7`, `0550968`, `a41d40d`, `615763a`). Tre migrazioni
applicate in produzione e una edge deployata; il resto aspetta te.

### Già in produzione, non devi fare niente

**Il guardiano non muore più perché il sito è lento.** `cruscotto-digest`
taceva dal 14 settembre: aveva risposto «Gateway Timeout» e da allora il
promemoria settimanale al Direttivo non partiva più. È il guasto peggiore
possibile, perché è proprio la funzione che dovrebbe raccontare i guasti.
Il motivo erano due chiamate di rete senza tetto di tempo, tutte e due
prima della scrittura del battito: la lettura di `/versione.json` e l'invio
via Telegram. Ora hanno cinque e otto secondi; se scadono si prosegue
comunque e il battito dice se il messaggio è partito. Deployata v7,
riletta dal vivo e identica al repository. Provata: richiesta 18219,
risposta 200, elenco degli allarmi in chiaro. Prima andava in timeout.

**«Gira a vuoto» non è più «morto».** Dei cinque servizi in allarme del 16
settembre, tre non erano guasti: erano vivi e zitti, e la sentinella non
sapeva distinguere le due cose. Adesso esiste un quarto esito,
`giro_a_vuoto`; `v_servizi_stato` legge due date invece di una (l'ultimo
battito qualunque dice «sono vivo», l'ultimo giro vero dice «sto
lavorando») e l'allarme scatta sulla seconda; e i sette lanciatori SQL
scrivono un battito anche quando decidono di sospendere, cosa che prima non
facevano: se un domani `ingest_token` sparisse dal Vault si fermerebbero
tutti e sette in silenzio. Risultato letto adesso: `coda-ascolto-promemoria`
è tornato **sano** (la coda è vuota, non era morto), `solleciti-quota` dice
**«gira a vuoto da 20 giorni»** e resta giustamente in allarme.

**La pulizia notturna non perde sei blocchi per colpa del settimo.**
`pulizia_conservazione()` cancella da sette tabelle in una transazione
sola, e il settimo blocco è il più fragile (`domande_tesseramento` ha nove
chiavi esterne puntate contro). Bastava che un domani qualcuno aggiungesse
una tabella collegata perché quel `DELETE` fallisse portandosi via il
lavoro degli altri sei, in silenzio. Ora ogni blocco ha la sua
sottotransazione, e la pulizia entra nel battito dei servizi: era l'unico
lavoro notturno che tocca dati personali senza nessuna sentinella sopra.
Le sette condizioni di cancellazione sono rimaste identiche, confrontate
una per una.

**Un buco che avevo aperto io, chiuso lo stesso giorno.** La funzione nuova
`battito_lanciatore` era chiamabile da chiunque senza account: bastava un
`revoke ... from public` per sentirsi a posto, ma qui vale un
`ALTER DEFAULT PRIVILEGES` che concede EXECUTE ad `anon` e `authenticated`
su ogni funzione nuova, e togliere PUBLIC non lo tocca. Chiunque avrebbe
potuto scrivere un battito falso e spegnere, per dire, l'allarme del backup.
Chiusa con `615763a` e verificata con `has_function_privilege`. Vale la pena
mettersela via come regola: **una revoca non è fatta finché non la si è
letta.**

### Quello che devi fare tu

1. **Tre edge function hanno il codice nuovo solo nel repository**:
   `cruscotto-digest`, `coda-ascolto-promemoria`, `solleciti-domande`. È il
   battito del giro a vuoto, e per tutte e tre quel giro si fa solo a mano,
   quindi non c'è nessuna fretta. Si allineano con la CLI, dall'Air:

   ```bash
   cd ~/Sviluppo/noslab-elbrenz
   supabase functions deploy cruscotto-digest --project-ref wacknihvdjxltiqvxtqr
   supabase functions deploy coda-ascolto-promemoria --project-ref wacknihvdjxltiqvxtqr
   supabase functions deploy solleciti-domande --project-ref wacknihvdjxltiqvxtqr
   supabase functions list        # Trappola 12: verify_jwt deve restare false per tutte e tre
   ```

2. **`BACKUP_PUBKEY` resta la cosa più urgente** (sezione 0). Il prossimo
   tentativo è domenica 20 alle 02:00. Adesso però almeno il guardiano
   funziona: se domenica fallisce di nuovo, lunedì mattina il messaggio al
   Direttivo lo dirà.

3. **`solleciti-quota`**: c'è una persona che aspetta un promemoria dal 28
   agosto. Vedi la sezione 5.

### Un residuo di REPO-01 che l'audit non aveva visto

L'audit del 13 settembre elencava i dati personali in `docs/` e in due
migrazioni, e l'ondata 1 li ha redatti. Cercando altro ne sono saltati
fuori altri, negli stessi commenti del codice, in un repository pubblico:

| File | Cosa c'è scritto |
|---|---|
| `supabase/functions/solleciti-quota/index.ts` (righe 4 e 7) | due soci con nome e cognome, numero di tessera e il fatto che non avevano versato la quota |
| `supabase/functions/_shared/sollecitoQuota.ts` (riga 3) | lo stesso caso |
| `supabase/functions/contanti-registra/index.ts` (righe 182-183) | quattro persone accoppiate per casella di posta condivisa, più un caso di domande doppie |
| `supabase/migrations/20260803210000_blocca_approvazione_senza_incasso.sql` | gli stessi due soci con i numeri di tessera |
| `supabase/migrations/20260804140000`, `20260804200000`, `20260807120227`, `20260808061517`, `20260809020000` | nomi di soci legati a numero di iscrizione, indirizzi doppi, account sbagliati |

I nomi di chi è **pubblicamente nel Direttivo o è il curatore del Museo**
(Presidente, consiglieri, curatore) stanno già sul sito e non sono un
problema. Gli altri sì: sono persone private accostate a un dato sul
pagamento della quota.

**Non l'ho toccato**, perché REPO-01 è una tua decisione e perché la via
più semplice è sempre la stessa: **rendere privato il repository** chiude
tutta la voce in un colpo, redigere i commenti uno per uno è il ripiego. Se
scegli il ripiego, dimmelo e li sostituisco con le iniziali come ha fatto
l'ondata 1.

### Controlli fatti, che non hanno trovato niente

- `verify_jwt` vivo contro `supabase/config.toml`: **tutte e 72 allineate**.
  (Una prima lettura ne segnalava quattro disallineate: era un falso
  allarme mio, il confronto leggeva la frase «verify_jwt=true» scritta
  dentro i commenti che spiegano la Trappola 12.)
- Le tre edge function che vivono in produzione senza cartella nel
  repository (`glossario-audio-migrazione`, `pulizia-ricevute-prova`,
  `upload-temp-og-cimiteri`) sono **tappi voluti**: rilette una per una, non
  fanno più niente, una risponde 410. Nessuna porta aperta.
- `find public -name '*.bak*'`: zero (Trappola 19).
