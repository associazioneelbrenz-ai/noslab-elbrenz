# REPORT — Backup completo e cifrato, 5 settembre 2026

Eseguito su MacBook Air. Rifà da capo il salvataggio del 3 settembre,
i cui file erano risultati **illeggibili**: la chiave privata age
salvata nel Portachiavi il 3/9 si era corrotta (verificato il 4/9).
Il 4/9 è stata generata una chiave nuova, "v2", salvata nel
Portachiavi **in base64** e verificata con il giro di andata e
ritorno byte per byte. Questo backup usa la v2.

L'addendum al brief del 5/9 è arrivato **a lavoro già concluso**: i
gate sono stati ripercorsi nell'ordine prescritto sui file già
prodotti, e le differenze rispetto all'ordine richiesto sono elencate
nella sezione 9, non nascoste.

## Esito in una riga

Database e Storage salvati, cifrati con la chiave v2 e verificati
(gate C1–C3, D, E, G tutti passati). I file del 3/9 sono stati
cancellati. Restano da fare **Google Drive e disco esterno**, bloccati
dagli stessi prerequisiti del 3/9 (app Drive non installata, nessun
disco collegato), e la **copia fuori casa della chiave v2**.

## 1. File creati e dove sono finiti

| File | Byte | Dove |
|---|---|---|
| `database/elbrenz-db-20260905.sql.age` | 21.638.394 | iCloud Drive (`El Brenz – Salvataggi/`) **e** `~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/` |
| `storage/elbrenz-storage-20260905.tar.age` | 431.089.207 | idem |
| `SHA256SUMS.txt` | — | idem (sezione 8) |
| `PROCEDURA-DI-RIPRISTINO.md` | — | idem, aggiornata: storia della chiave, comando per decodificare la v2 dal base64 |
| `REPORT_backup_2026-09-05.md` | — | idem, copia di questo file |

Copie esistenti: **2 su 3** (iCloud + staging locale sullo stesso Mac,
che vale come "pronta da copiare", non come copia indipendente).

## 2. Gate B — launchd fermato e disabilitato

Il plist in `~/Library/LaunchAgents` viene caricato da macOS al login:
dopo il riavvio del Mac di stamattina il lavoro risultava attivo e
sarebbe scattato domenica 6/9 alle 4:00. Comandi eseguiti e risposte,
testuali:

```
$ launchctl bootout gui/501/eu.elbrenz.backup
Boot-out failed: 3: No such process        (già scaricato in un passaggio precedente della sessione)
$ launchctl disable gui/501/eu.elbrenz.backup
(nessun output, exit 0)
$ launchctl print gui/501/eu.elbrenz.backup
Bad request.
Could not find service "eu.elbrenz.backup" in domain for user gui: 501
$ launchctl print-disabled gui/501 | grep elbrenz
	"eu.elbrenz.backup" => true
```

Il plist **non** è stato cancellato. Per riattivare: `launchctl enable
gui/501/eu.elbrenz.backup` e poi `launchctl bootstrap gui/501
~/Library/LaunchAgents/eu.elbrenz.backup.plist`.

## 3. Gate A e D — database

Connessione: **session pooler, porta 5432** (la stessa provata con
psql da Cristian; non il transaction pooler 6543). `pg_dump` 17.11
Homebrew contro server 17.6, formato plain SQL, `--schema=public
--no-owner --no-privileges`, 41 secondi. Dump eseguito alle 10:08 UTC.

Conteggi, tre letture indipendenti più il dump:

| | Snapshot MCP 11:08 UTC | Produzione psql a tempo di dump (10:08 UTC) | Produzione psql 11:14 UTC | Dump (blocchi COPY) |
|---|---|---|---|---|
| tabelle `public` | 127 | 127 | — | 127 (`CREATE TABLE public.`) |
| viste `public` | 43 | 43 | — | 43 (`CREATE VIEW public.`) |
| `dizionario_lemma` | 252 | 252 | 252 | 252 |
| `archivio_audio` | 68 | 68 | 68 | 68 |
| `memoria_persona` | 118 | 118 | 118 | 118 |
| `domande_tesseramento` | 38 | 38 | 38 | 38 |
| `articolo` | 143 | 143 | 143 | 143 |

Nessuna differenza. Il conteggio dal dump è fatto contando le righe
di ogni blocco `COPY public.<tabella> ... FROM stdin;` fino al `\.`
che lo chiude (script Python, non awk; stesso criterio).

Controllo di integrità del file: la riga `-- PostgreSQL database dump
complete` c'è (riga 35.334). **Non è l'ultima riga**: pg_dump 17.11
chiude il file con una riga `\unrestrict <token>` (protezione
introdotta con la patch di sicurezza di agosto 2025, in coppia con
il `\restrict` in testa). È il comportamento atteso di questa
versione, non un troncamento.

Ripristino in un Postgres 17 locale: **non eseguito**, di proposito.
C'è un `postgresql@17` sul Mac, ma il 3/9 quel test aveva già
mostrato che senza lo schema `extensions` di Supabase due tabelle
restano vuote per motivi di ambiente, non del dump: non aggiunge
prova oltre il conteggio dei blocchi COPY, che è passato.

## 4. Gate A ed E — Storage

Scaricato con lo scaricatore per-file (`~/bin/elbrenz-download-bucket.py`)
in una cartella persistente nella home, con ripresa (salta i file
già presenti a dimensione > 0).

| Bucket | Snapshot MCP 11:08 UTC (oggetti / MB) | `storage.objects` a tempo di download (oggetti / byte) | Nell'archivio decifrato (file / byte) |
|---|---|---|---|
| assets-pubblici | 158 / 162,9 | 158 / 170.838.457 | 158 / 170.838.457 |
| avatars | 8 / 0,5 | 8 / 564.734 | 8 / 564.734 |
| donazioni | 1 / 0,0 | 1 / 160 | 1 / 160 |
| glossario-audio | 66 / 5,2 | 66 / 5.418.618 | 66 / 5.418.618 |
| glossario-audio-attesa | 65 / 5,1 | 65 / 5.370.988 | 65 / 5.370.988 |
| libri-sociali | 1 / 0,1 | 1 / 64.265 | 1 / 64.265 |
| ricevute | 1 / 0,1 | 1 / 81.585 | 1 / 81.585 |
| wp-media | 221 / 254,6 | 221 / 267.018.418 | 221 / 267.018.418 |
| **totale** | **521 / 428,5** | **521 / 449.357.225** | **521 / 449.357.225** |

(162,9 MB = 170.838.457 byte diviso 1.048.576: lo snapshot è in MiB.)

Verifiche sull'archivio decifrato:
- `tar -tzf` completato senza errori (exit 0).
- Conteggio per bucket con pattern ancorati (`^\./<bucket>/`, voci
  non-directory): 66, 65, 221, 158, 8, 1, 1, 1, totale 521.
- **Dimensione byte per byte di ogni singolo file** confrontata con
  `metadata.size` di `storage.objects`: elenco produzione (521 righe
  `bucket/nome|byte`) e elenco locale identici con `diff`, 521 su 521.
  Un audio troncato sarebbe emerso qui.
- I 4 bucket vuoti (`archivio`, `convenzioni-staging`,
  `contatti-staging`, `newsletter-immagini`) sono stati interrogati e
  risultano davvero vuoti.

## 5. Gate C — chiave e cifratura

**C1**, chiave pubblica derivata dalla privata letta dal Portachiavi
(`security find-generic-password -s elbrenz-backup-age-key-v2 -w |
base64 -d | age-keygen -y`), accanto al destinatario usato in
cifratura:

```
derivata:      age1g8gfud0ansz29k735mjfx2rfrptatcdvregmruudfuaazgucuyfsxstkgw
destinatario:  age1g8gfud0ansz29k735mjfx2rfrptatcdvregmruudfuaazgucuyfsxstkgw
```

Coincidono.

**C2**, decifratura di prova con identità passata per pipe
(`age -d -i <(security ... | base64 -d) FILE.age > OUT`), mai scritta
su disco: entrambi i file decifrati con exit 0.

**C3**, hash SHA-256 dei file decifrati:

```
365be947b336f0a1c1d2bf408fecc9b851e3494a1a4179d6e70aebd3ca5071c2  elbrenz-db-20260905.sql
c013b0786b8fddaa274447280f46afb92a305c8e25d68b7c1a9224c9365d3d08  elbrenz-storage-20260905.tar.gz
```

Scostamento da dichiarare: l'hash **prima** della cifratura non è
stato registrato, perché la cifratura è avvenuta prima dell'arrivo
dell'addendum. L'identità fra chiaro e decifrato era stata provata
con `cmp` byte per byte (esito: identici) subito dopo la cifratura;
gli hash qui sopra sono quindi anche gli hash dei file in chiaro
originali, per costruzione, ma la doppia misura indipendente non c'è.

## 6. Gate G — igiene dei segreti

Comando (cartella Salvataggi, cartella di lavoro, questo report):

```
grep -rlE 'PGHOST|PGPORT|PGUSER|PGDATABASE|PGPASSWORD|SUPABASE_SERVICE_KEY|postgres://|postgresql://|AGE-SECRET-KEY-|eyJ|service_role|sbp_' \
  ~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno ~/.elbrenz-backup-work/20260905 REPORT_backup_2026-09-05.md | wc -l
```

Risultato: **0 file**. (Alla prima passata ne risultavano 2: le due
copie di `PROCEDURA-DI-RIPRISTINO.md`, per i *nomi* delle variabili
nell'esempio di ripristino e per il prefisso della riga della chiave
nella descrizione. Nessun valore, solo documentazione; gli esempi sono
stati riscritti senza quei token e la passata ripetuta dà 0.)

Ricerca aggiuntiva sui **valori veri** (password e chiave di servizio,
`grep -F` sui valori, senza stamparli) in cartella di lavoro e output
delle attività in background: 0 file.

Nella cartella Salvataggi restano: i due `.age` (in `database/` e
`storage/`), `SHA256SUMS.txt`, `REPORT_backup_2026-09-05.md` e
`PROCEDURA-DI-RIPRISTINO.md`. Quest'ultima non è nell'elenco
dell'addendum: è stata **lasciata di proposito** perché è la guida di
ripristino richiesta dal brief del 3/9, non contiene segreti (gate G
passato) e senza di essa chi trova i file non sa cosa farne. Se va
tolta, basta dirlo. Nessun `.sql`, `.tar`, `.tar.gz` in chiaro da
nessuna parte: cancellati a verifica conclusa (dump, archivio, i 521
file scaricati, le estrazioni di prova).

## 7. Gate F — la chiave vecchia `elbrenz-backup-age-key`

Il test prescritto (decifrare un file del 3/9 con la v1) **non si è
potuto fare**: i file del 3/9 erano già stati cancellati quando è
arrivato l'addendum (vedi sezione 9). Fatti al loro posto:

- La voce v1 letta dal Portachiavi è **una riga sola** (una chiave age
  sono tre righe) e `age-keygen -y` risponde `unknown identity type`:
  age non la riconosce nemmeno come chiave.
- Test sostitutivo: un file di prova cifrato verso il destinatario v1
  (`age18p0k46kp7udlhp9ywrcy2t8e0kathy93fn5hnhd9jvnt0n9psdmqyu6ty8`,
  lo stesso dei file del 3/9) e decifrato con la voce v1 per pipe:
  `age: error: ... error at line 1: unknown identity type`. La voce
  non apre nulla di cifrato verso quella chiave, quindi non avrebbe
  aperto nemmeno i file del 3/9. La diagnosi di mercoledì regge.

La voce v1 **non è stata cancellata**: l'addendum lega la cancellazione
al test sul file vero, che non ho potuto eseguire. Per farlo alla
lettera, i due file del 3/9 potrebbero essere ancora in
"Eliminati di recente" di iCloud Drive (iCloud.com, 30 giorni). La
cancellazione della voce resta un comando, quando Cristian lo vuole:
`security delete-generic-password -s elbrenz-backup-age-key`.

## 8. Gate H — SHA256SUMS per le copie manuali

`SHA256SUMS.txt` nella cartella Salvataggi (e su iCloud):

```
5ec31720c73a6a15bbe12a6a80379d0cc31d72f0b734b628ebe9d18f56e734c3  database/elbrenz-db-20260905.sql.age
44ea99b9efb5b031f40cb0a30a9ccaa63bb63dedc4b45074c4b13d3673605630  storage/elbrenz-storage-20260905.tar.age
```

Verificato subito con `shasum -a 256 -c SHA256SUMS.txt`: OK su
entrambi.

## 9. Scostamenti dall'ordine dei gate (sezione I dell'addendum)

Il lavoro era stato chiuso prima dell'addendum, quindi l'ordine
effettivo è stato: B (scaricato, poi disabilitato) → A/download →
D/dump → cifratura → C1 → decifratura di prova → cmp → E parziale →
ricerca dei valori veri → **cancellazione file 3/9** → commit. Poi,
con l'addendum: B ripetuto con verifica testuale, C1, C2 per pipe,
C3, D completo, E completo (dimensioni per file), G per pattern, H.

Differenze da dichiarare:
1. **I file del 3/9 sono stati cancellati prima di F e prima di G per
   pattern.** I gate 4–7 erano già passati nella sostanza (chiave
   derivata = destinatario, decifratura identica byte per byte,
   127/43/5 conteggi, 521 file e 66+65 audio), ma F non era stato
   fatto e G era stato fatto sui valori, non sui pattern. Conseguenza:
   F eseguito in forma sostitutiva (sezione 7), voce v1 non cancellata.
2. **Nella prima decifratura di prova l'identità è stata scritta in
   un file temporaneo** (`mktemp`, permessi 600, cancellato subito),
   contro il C2. La verifica è stata ripetuta per pipe.
3. **Hash del chiaro pre-cifratura non registrato** (sezione 5).
4. **Ripristino locale saltato** (sezione 3), scelta motivata.
5. `PROCEDURA-DI-RIPRISTINO.md` lasciata in Salvataggi (sezione 6).

## 10. Cose andate storte lungo la strada

- **Il file delle credenziali conteneva due segnaposto.** A inizio
  sessione aveva sei righe, ma password e chiave di servizio erano le
  stringhe letterali `LA_PASSWORD` e `LA_SECRET`. Il numero di righe
  non prova nulla: la prova è la connessione vera, che ha fallito.
  Cristian ha riscritto le due righe e il backup è partito.
- **La sessione del 4/9 non aveva mai iniziato a scaricare**: si era
  fermata subito dopo la chiave v2. Il riavvio del Mac del 5/9 ha
  svuotato `/private/tmp` e con esso lo scratchpad (bene per la copia
  in chiaro della chiave). Per questo la cartella di lavoro di oggi è
  persistente, `~/.elbrenz-backup-work/20260905/`.
- **Cambio di rete a metà scaricamento** (da hotspot Wi-Fi a cavo):
  15 errori DNS nell'elenco delle sottocartelle del bucket privato del
  glossario, abbandonate dal downloader dopo 5 tentativi **senza
  contarle come fallite**: 3 file mancanti in silenzio, ripresi dal
  confronto per bucket contro la produzione e scaricati al secondo
  giro. L'esito "falliti=0" del downloader non basta.
- **Lo script cifrava ancora con la v1**: `~/bin/elbrenz-backup.sh`
  aggiornato alla v2 (copia `.bak`, due righe di differenza).

## 11. Credenziali

- `~/.elbrenz-backup-env` **non è stato cancellato**: la decisione su
  dove far vivere le credenziali per l'automazione è aperta e spetta a
  Cristian. È un file in chiaro nella home, permessi 600.
- La chiave v2 vive in **un solo posto fisico** (Portachiavi del
  MacBook Air).
- Nota per l'automazione: `elbrenz-backup.sh` usa `mktemp` e cancella
  la cartella di lavoro all'uscita, quindi un giro interrotto riparte
  da zero. Prima di riattivarlo converrebbe fargli usare una cartella
  persistente come quella di oggi. Segnalato, non modificato.

## 12. Da fare a mano (Cristian)

1. Copiare `database/`, `storage/`, `SHA256SUMS.txt`, `PROCEDURA-DI-RIPRISTINO.md`
   e questo report da `~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/`
   su Google Drive (`info@elbrenz.eu`) e su un disco esterno. Poi, in
   ciascuna destinazione, dalla cartella copiata:
   ```
   shasum -a 256 -c SHA256SUMS.txt
   ```
   deve rispondere `OK` su entrambi i file.
2. Copia fuori casa della chiave v2 (Portachiavi →
   "El Brenz - chiave privata backup age (v2, base64)"; il valore è
   base64, la procedura di ripristino spiega come decodificarlo).
3. Decidere dove vivono le credenziali per il giro settimanale, poi
   riattivare il lavoro (comandi nella sezione 2).
4. Decidere su `~/.elbrenz-backup-env` e sulla voce v1 del Portachiavi
   (sezione 7).
