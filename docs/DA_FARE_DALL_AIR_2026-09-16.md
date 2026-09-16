# Da fare dall'Air — 16 settembre 2026

Tutto il lavoro delle ondate 2 e 3 è committato e pushato. Niente è andato
perso. Questa è la lista, in ordine, di cosa resta da fare a mano.

Ramo di lavoro, su entrambi i repository: `claude/happy-cori-0d7d75`.

| Repository | Ultimo commit | Stato |
|---|---|---|
| `noslab-elbrenz` | `8cca3c4` | pushato, non deployato |
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

curl -s https://elbrenz.eu/versione.json   # il commit deve essere 8cca3c4
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
- Tre servizi risultano «silenziosi» dal 28 agosto perché non scrivono più
  un battito quando non hanno niente da fare. Vale la pena farglielo
  scrivere: altrimenti «sano e inoperoso» e «morto» si assomigliano troppo.
- Il promemoria settimanale del cruscotto va in timeout. Finché tace, non
  sapremo del prossimo guasto.
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
