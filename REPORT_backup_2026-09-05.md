# REPORT — Backup completo e cifrato, 5 settembre 2026

Eseguito su MacBook Air. Rifà da capo il salvataggio del 3 settembre,
i cui file erano risultati **illeggibili**: la chiave privata age
salvata nel Portachiavi il 3/9 si era corrotta (verificato il 4/9,
la chiave pubblica derivata non combaciava). Il 4/9 è stata generata
una chiave nuova, "v2", salvata nel Portachiavi **in base64** e
verificata con il giro di andata e ritorno byte per byte.

## Esito in una riga

Database e Storage salvati, cifrati con la chiave v2 e verificati.
I file del 3/9 sono stati cancellati. Come il 3/9, restano da fare
**Google Drive e disco esterno**: sono ancora bloccati dagli stessi
prerequisiti (app Drive non installata su questo Mac, nessun disco
collegato), che solo Cristian può risolvere.

## 1. File creati e dove sono finiti

| File | Dimensione | Dove |
|---|---|---|
| `elbrenz-db-20260905.sql.age` | 21,6 MB | iCloud Drive (`El Brenz – Salvataggi/database/`) **e** `~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/database/` |
| `elbrenz-storage-20260905.tar.age` | 431 MB | iCloud Drive (`El Brenz – Salvataggi/storage/`) **e** la stessa cartella locale, `storage/` |
| `PROCEDURA-DI-RIPRISTINO.md` | — | accanto ai due file cifrati, in entrambi i posti; aggiornata con la storia della chiave e il comando per decodificare la v2 dal base64 |

Copie esistenti: **2 su 3** (iCloud + staging locale sullo stesso
Mac, che vale come "pronta da copiare", non come copia indipendente).

## 2. Verifiche eseguite

**Database** (`pg_dump` 17.11, schema `public`, 41 secondi):
127 tabelle e 43 viste nel dump, come in produzione. Confronto righe
sulle cinque tabelle di controllo, produzione vs blocchi `COPY` del dump:

| Tabella | Produzione | Nel dump |
|---|---|---|
| `dizionario_lemma` | 252 | 252 |
| `archivio_audio` | 68 | 68 |
| `memoria_persona` | 118 | 118 |
| `domande_tesseramento` | 38 | 38 |
| `articolo` | 143 | 143 |

Non è stato ripetuto il caricamento in un Postgres locale usa-e-getta
fatto il 3/9: il dump è dello stesso tipo, e quel test aveva già
mostrato che i soli errori erano gli schemi e i tipi della piattaforma
Supabase, assenti per scelta da un dump `--schema=public`.

**Storage**: 521 file, 430 MB, su 8 bucket, scaricati con lo
scaricatore per-file (`~/bin/elbrenz-download-bucket.py`). Ogni bucket
è stato confrontato con `storage.objects` in produzione **per numero
di file e per somma dei byte**, non solo a occhio:

| Bucket | File | Byte |
|---|---|---|
| glossario-audio | 66 | 5.418.618 |
| glossario-audio-attesa | 65 | 5.370.988 |
| wp-media | 221 | 267.018.418 |
| assets-pubblici | 158 | 170.838.457 |
| avatars | 8 | 564.734 |
| ricevute | 1 | 81.585 |
| libri-sociali | 1 | 64.265 |
| donazioni | 1 | 160 |

Tutti identici. I 4 bucket vuoti (`archivio`, `convenzioni-staging`,
`contatti-staging`, `newsletter-immagini`) sono stati interrogati e
risultano davvero vuoti.

**Cifratura**: entrambi i file `.age` sono stati decifrati in una
cartella temporanea usando la chiave v2 **letta dal Portachiavi**
(decodificata dal base64), non da una copia su disco: confronto byte
per byte con gli originali, identici. L'archivio decifrato è stato
anche riestratto: 521 file, 66 + 65 audio del glossario, albero
identico a quello scaricato. La cartella temporanea è stata cancellata.

## 3. Cose andate storte, e come si sono risolte

- **Il file delle credenziali conteneva due segnaposto.** Al riavvio
  della sessione, `~/.elbrenz-backup-env` aveva sei righe, ma password
  e chiave di servizio erano le stringhe letterali `LA_PASSWORD` e
  `LA_SECRET`. Il numero di righe non prova nulla: la prova è una
  connessione vera, che infatti ha fallito. Cristian ha riscritto le
  due righe e il backup è partito. Lezione: **verificare sempre le
  credenziali con una connessione reale prima di scaricare.**
- **La sessione del 4/9 non aveva mai iniziato a scaricare.** Dalla
  trascrizione risulta che si è fermata subito dopo aver generato e
  verificato la chiave v2. Il Mac è poi stato riavviato il 5/9, e il
  riavvio ha svuotato `/private/tmp`, dove viveva lo scratchpad: la
  copia in chiaro della chiave è sparita (bene), e con lei qualunque
  cartella di lavoro. Per questo il lavoro di oggi è stato fatto in
  una cartella **persistente** nella home
  (`~/.elbrenz-backup-work/20260905/`), dove lo scaricatore salta i
  file già presenti: un'altra interruzione non sarebbe costata i
  430 MB.
- **Cambio di rete a metà scaricamento.** Il Mac è passato
  dall'hotspot Wi-Fi alla rete cablata durante il giro: 15 errori DNS
  nell'elenco delle sottocartelle del bucket privato del glossario,
  che il downloader ha abbandonato dopo 5 tentativi **senza contarli
  come falliti** (3 file mancanti, in silenzio). Li ha ripresi il
  confronto per bucket contro la produzione, e un secondo giro li ha
  scaricati. Lezione: l'esito "falliti=0" del downloader non basta,
  conta il confronto numero+byte contro `storage.objects`.
- **Lo script cifrava ancora con la chiave v1.** `~/bin/elbrenz-backup.sh`
  aveva la chiave pubblica v1 scritta dentro: aggiornata alla v2 (copia
  `.bak` accanto, differenza di due righe).
- **Il lavoro `launchd` era attivo senza che nessuno lo avesse
  acceso.** macOS carica da solo i plist in `~/Library/LaunchAgents`
  al login: dopo il riavvio, `eu.elbrenz.backup` risultava caricato e
  sarebbe scattato domenica 6/9 alle 4:00 (uscendo subito per mancanza
  di credenziali). Su indicazione di Cristian è stato **scaricato e
  disabilitato** (`launchctl disable`, sopravvive ai riavvii) finché
  non si decide dove far vivere le credenziali per l'automazione.

## 4. Credenziali e chiave

- Nessuna credenziale compare nei log della cartella di lavoro né nei
  file di output delle attività in background (ricerca letterale sui
  valori veri, nessun risultato).
- `~/.elbrenz-backup-env` **non è stato cancellato** questa volta: la
  decisione su dove far vivere le credenziali è aperta e spetta a
  Cristian. Finché c'è, è un file in chiaro nella home con permessi
  600.
- Nel Portachiavi resta anche la vecchia voce v1
  (`elbrenz-backup-age-key`, del 3/9): la cancellazione tentata il
  4/9 non l'ha rimossa. È stantia e non serve più; lasciata lì per
  non fare cancellazioni non richieste.
- La chiave v2 vive **in un solo posto fisico** (Portachiavi del
  MacBook Air). La copia fuori casa resta da fare a mano da Cristian.

## 5. Strumenti lasciati sul disco

- `~/bin/elbrenz-backup.sh` (chiave v2) e `~/bin/elbrenz-download-bucket.py`.
- `~/.elbrenz-backup-work/20260905/`: gli script del giro manuale
  (`scarica.sh`, `dump.sh`, `confronta-bucket.sh`, `chiudi.sh`), i log
  e i conteggi di riferimento. Nessun dato in chiaro: dump, archivio e
  file scaricati sono stati cancellati a verifica conclusa.
- `~/Library/LaunchAgents/eu.elbrenz.backup.plist`: presente ma
  disabilitato.

Nota per l'automazione: `elbrenz-backup.sh` usa `mktemp` e cancella la
cartella di lavoro all'uscita, quindi un giro interrotto riparte da
zero. Prima di riattivarlo converrebbe fargli usare una cartella
persistente come quella di oggi. Segnalato, non modificato.

## Prossimi passi per Cristian

1. Copiare i due file da
   `~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/` su
   Google Drive (`info@elbrenz.eu`) e su un disco esterno.
2. Copia fuori casa della chiave v2 (Portachiavi →
   "El Brenz - chiave privata backup age (v2, base64)"; il valore è
   base64, la procedura di ripristino spiega come decodificarlo).
3. Decidere dove vivono le credenziali per il giro settimanale, poi
   riattivare il lavoro con `launchctl enable gui/501/eu.elbrenz.backup`
   e `launchctl load ~/Library/LaunchAgents/eu.elbrenz.backup.plist`.
4. Decidere se cancellare `~/.elbrenz-backup-env` e la voce v1 del
   Portachiavi.
