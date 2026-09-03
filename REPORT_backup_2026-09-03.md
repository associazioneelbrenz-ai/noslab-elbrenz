# REPORT — Backup completo e cifrato, 3 settembre 2026

Eseguito su MacBook Air, in risposta al BRIEF CODE "Backup completo e
cifrato" (progetto Supabase `wacknihvdjxltiqvxtqr`, piano gratuito,
nessun backup automatico da quattro mesi).

## Esito in una riga

Database e Storage sono salvati, cifrati e verificati. **Due delle tre
copie previste non sono ancora state fatte**: mancano Google Drive e
il disco esterno, per ragioni descritte sotto — non saltate, bloccate
da prerequisiti che solo Cristian può risolvere su questa macchina.

## 1. File creati e dove sono finiti

| File | Dimensione | Dove |
|---|---|---|
| `elbrenz-db-20260903.sql.age` | 21,5 MB | iCloud Drive (`El Brenz – Salvataggi/database/`) **e** `~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/database/` |
| `elbrenz-storage-20260903.tar.age` | 411 MB | iCloud Drive (`El Brenz – Salvataggi/storage/`) **e** la stessa cartella locale, `storage/` |
| `PROCEDURA-DI-RIPRISTINO.md` | — | accanto ai due file cifrati, in entrambi i posti sopra |

**Copie effettivamente esistenti: 2 su 3** (iCloud + la cartella
locale di staging, che NON è una vera seconda copia indipendente
essendo sullo stesso computer — conta come "pronta per essere copiata
altrove", non come copia di sicurezza).

**Mancano**:
- **Google Drive** (`info@elbrenz.eu`): l'app Google Drive non è
  installata su questo Mac (nessuna cartella in
  `~/Library/CloudStorage`). Serve installarla e accedere con
  l'account giusto — non quello personale — prima che questa copia si
  possa fare, da questa o da un'altra macchina.
- **Disco esterno**: nessun disco esterno collegato al momento del
  backup (verificato con `diskutil list external`: vuoto).

I due file cifrati sono pronti e attendono in
`~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/` sul
MacBook Air: appena Drive è installato o un disco è collegato, basta
copiarceli dentro. Non serve rifare il backup da capo per completare
le tre copie.

## 2. I cinque confronti di righe (produzione vs dump)

| Tabella | Produzione | Nel dump | Esito |
|---|---|---|---|
| `dizionario_lemma` | 252 | 252 | ✅ identico |
| `archivio_audio` | 68 | 68 | ✅ identico |
| `memoria_persona` | 118 | 118 | ✅ identico |
| `domande_tesseramento` | 38 | 38 | ✅ identico |
| `articolo` | 143 | 143 | ✅ identico |

Il conteggio "nel dump" è stato letto due volte, con due metodi
indipendenti: (a) contando le righe dentro i blocchi `COPY` del file
`.sql` decifrato, (b) caricando davvero il dump in un Postgres 17
locale usa-e-getta e interrogandolo con `SELECT count(*)`. Il secondo
metodo, più severo, mostra `dizionario_lemma` e `articolo` a **zero
righe locali** — non per un difetto del dump, ma perché quelle due
tabelle hanno un indice/trigger che chiama `extensions.unaccent(...)`,
funzione che Supabase fornisce di serie nei suoi progetti ma che un
Postgres "nudo" non ha. Con lo schema `extensions` assente, l'INSERT
fallisce a runtime pur essendo il dump perfettamente valido — è un
limite dell'ambiente di verifica locale, non del backup. Un ripristino
vero, dentro un progetto Supabase, non ha questo problema (lo schema
`extensions` c'è già). Dettaglio completo in `PROCEDURA-DI-RIPRISTINO.md`.

**Il dump non contiene errori di sintassi**: le 339 righe di errore
viste durante il caricamento di prova si spiegano *tutte* con schemi
(`auth`, `extensions`), tipi (`citext`, `vector`/pgvector) e ruoli
(`authenticated`, `service_role`...) che appartengono alla piattaforma
Supabase e non fanno parte di un dump `--schema=public`, per scelta —
esattamente come richiesto dal brief.

Tabelle e viste: **127 tabelle, 43 viste** nello schema `public` (il
brief indicava "126 tabelle" — la differenza di 1 è verosimilmente una
tabella aggiunta dopo che il brief è stato scritto; il numero qui
sopra è quello letto live il 3/9 sia da `information_schema` sia dal
dump stesso, e i due combaciano).

## 3. I 131 file audio del glossario

Confermati: **66** in `glossario-audio` (pubblico) + **65** in
`glossario-audio-attesa` (privato) = **131**, verificati tre volte:
al momento dello scaricamento, dentro l'archivio `.tar.gz` prima di
cifrarlo, e di nuovo dopo aver decifrato e riestratto l'archivio in
una cartella temporanea. Erano anche la prima cosa scaricata, come
richiesto, prima di qualunque altro bucket.

Tutto lo Storage: **521 file, 430 MB**, su 8 bucket con contenuto (i
4 dichiarati vuoti nel brief — `archivio`, `convenzioni-staging`,
`contatti-staging`, `newsletter-immagini` — sono stati controllati
via API e risultano davvero vuoti, non falliti in silenzio):

| Bucket | File | Visibilità |
|---|---|---|
| glossario-audio | 66 | pubblico |
| glossario-audio-attesa | 65 | privato |
| wp-media | 221 | pubblico |
| assets-pubblici | 158 | pubblico |
| avatars | 8 | pubblico |
| ricevute | 1 | privato |
| libri-sociali | 1 | privato |
| donazioni | 1 | privato |

## 4. Cifratura

Chiave age generata ex novo (nessuna esisteva prima): coppia
pubblica/privata (la pubblica cifra e può stare ovunque, ma è omessa
qui perché questo file è nel repository pubblico; si ricava in
qualsiasi momento dalla privata con `age-keygen -y`). La chiave
**privata**:
- è salvata nel Portachiavi login di questo Mac, voce
  "El Brenz - chiave privata backup age" (servizio
  `elbrenz-backup-age-key`, account `elbrenz-backup`);
- **non ha ancora una copia fuori casa** — questo è un passo che
  spetta a Cristian (stampa o chiavetta USB, portata altrove). Fino ad
  allora, la chiave vive in un solo posto fisico, che è anche dove
  vive il backup: se quel Mac va perso insieme a un guasto capitato
  nello stesso periodo, la cifratura non aiuta.

Verifica: i due file `.age` sono stati decifrati in una cartella
temporanea, confrontati byte per byte con gli originali (`diff`,
identici), e la cartella temporanea è stata cancellata subito dopo.

## 5. Credenziali

- Nessuna credenziale compare in nessun file salvato su disco né nei
  log delle attività di background di questa sessione (verificato con
  una ricerca mirata su tutta la cartella di lavoro e sui log).
- `~/.elbrenz-backup-env` è stato **cancellato** (con sovrascrittura,
  non un semplice `rm`) a backup verificato.
- Una password è comparsa una volta nella trascrizione di questa
  conversazione (non in un file): è una credenziale temporanea
  generata al volo dalla CLI di Supabase per un singolo comando di
  prova, legata a un ruolo effimero creato apposta dalla CLI stessa —
  non la password del file `.elbrenz-backup-env`, né riutilizzabile
  al di fuori di quel comando. Visibile solo a te in questa sessione,
  non persistita da nessuna parte.

## 6. Cose lasciate a metà, di proposito

- **Google Drive e disco esterno**: vedi punto 1. Serve un intervento
  di Cristian (installare l'app con l'account giusto; collegare un
  disco) prima che si possano completare le tre copie.
- **Copia fuori casa della chiave privata**: da fare a mano da
  Cristian, non è delegabile.
- **Script e lavoro automatico settimanale**: preparati, **non
  attivati**, come richiesto:
  - `~/bin/elbrenz-backup.sh` — rifà tutto il procedimento di questa
    sessione (Storage con retry per-file, dump, cifratura, copia
    nelle tre destinazioni quando presenti).
  - `~/bin/elbrenz-download-bucket.py` — lo scaricatore Storage
    resiliente per-file, usato oggi al posto della CLI Supabase dopo
    che quest'ultima si è impuntata su una rete Wi-Fi instabile (vedi
    punto 7).
  - `~/Library/LaunchAgents/eu.elbrenz.backup.plist` — il lavoro
    settimanale (domenica 4:00), scritto sul disco ma **mai caricato**
    (`launchctl load` non è stato eseguito): resta inerte finché non
    lo attivi tu.
  - **Prima di attivarlo**: lo script si aspetta le credenziali
    (`PGPASSWORD`, `SUPABASE_SERVICE_KEY`) nell'ambiente, ma il file
    che le conteneva è stato cancellato apposta. Per un lavoro
    automatico senza supervisione, quelle credenziali vanno lette dal
    Portachiavi, non da un file in chiaro nella home — è una scelta
    che spetta a te, non l'ho presa da solo.

## 7. Cosa è andato storto lungo la strada (per trasparenza)

- La rete Wi-Fi di questa macchina ("Vikings") si è rivelata
  instabile durante il lavoro, con l'interfaccia che oscillava tra due
  intervalli di indirizzi diversi (172.20.10.x e 192.168.x.x) — una
  situazione tipica di un hotspot con segnale debole. La CLI Supabase
  (`supabase storage cp`), che tiene aperta una connessione lunga per
  bucket interi, si interrompeva a metà scaricamento. Soluzione:
  scritto uno scaricatore Python che scarica un file alla volta con
  ritentativi (`~/bin/elbrenz-download-bucket.py`) — un blocco di rete
  costa un file, non un bucket intero.
- Il `pg_dump` di partenza su questa macchina era in versione 16,
  mentre il server Supabase è Postgres 17: `pg_dump` si è rifiutato di
  partire (controllo di versione non aggirabile). Installato
  `postgresql@17` via Homebrew (compilazione da sorgente, ~10 minuti,
  nessuna bottiglia precompilata per macOS Monterey). Effetto
  collaterale: due symlink aggiunti a mano
  (`/usr/local/share/postgresql@17` e `/usr/local/lib/postgresql@17`,
  puntano dentro il Cellar) perché il pacchetto non è stato "linkato"
  con `brew link` — di proposito, per non scavalcare i comandi di
  `postgresql@16` già in uso su questa macchina. Lasciati in piedi:
  servono anche ai backup futuri.

## Prossimi passi per Cristian

1. Copiare i due file da
   `~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/` su
   Google Drive (`info@elbrenz.eu`) e su un disco esterno, quando
   disponibili.
2. Fare una copia fuori casa della chiave privata (Portachiavi →
   "El Brenz - chiave privata backup age").
3. Decidere dove devono vivere le credenziali per il lavoro
   automatico settimanale (Portachiavi, verosimilmente), poi caricare
   `eu.elbrenz.backup.plist` con `launchctl load`.
