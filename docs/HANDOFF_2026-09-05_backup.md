# Handoff · 5 settembre 2026 · backup cifrato rifatto

Sessione sul MacBook Air. Riprende il brief "Backup completo e cifrato"
del 3/9 e il suo addendum del 5/9. Report di dettaglio, con tutti i
gate e gli scostamenti: `REPORT_backup_2026-09-05.md` (anche nella
cartella Salvataggi e su iCloud). Precedente: `REPORT_backup_2026-09-03.md`.

---

## 1. Da dove si è partiti

Il backup del 3/9 era **illeggibile**: la chiave privata age salvata
nel Portachiavi si era corrotta (il 4/9 la voce risultava una riga
sola, e age non la riconosceva come identità). Il 4/9 era stata
generata una chiave v2, salvata in base64, ma la sessione si era
fermata lì, senza scaricare nulla. Il riavvio del Mac del 5/9 ha
svuotato `/private/tmp` e con esso lo scratchpad.

All'inizio della sessione `~/.elbrenz-backup-env` aveva sei righe ma
due erano i segnaposto letterali `LA_PASSWORD` e `LA_SECRET`. Il
numero di righe non prova nulla: la prova è la connessione vera.

## 2. Cosa è stato fatto

- **Backup rifatto da capo e verificato.** Database (127 tabelle, 43
  viste, 5 tabelle di controllo con le stesse righe della produzione)
  e Storage (521 file, 430 MB, ogni singolo file confrontato in byte
  con `storage.objects`). Cifrati verso la chiave v2, decifrati di
  prova con l'identità letta dal Portachiavi per pipe, hash SHA-256 nel
  report. File `elbrenz-db-20260905.sql.age` e
  `elbrenz-storage-20260905.tar.age`.
- **Dove sono**: `~/El-Brenz-Salvataggi-DA-COPIARE-su-Drive-e-disco-esterno/`
  (sottocartelle `database/` e `storage/`) e iCloud Drive
  `El Brenz – Salvataggi/`. Accanto: `SHA256SUMS.txt`,
  `PROCEDURA-DI-RIPRISTINO.md` (aggiornata alla v2), il report.
- **Cancellati**: i file del 3/9 (staging e segnaposto iCloud), la
  voce v1 del Portachiavi, `~/.elbrenz-backup-env` (con `rm -P`), ogni
  copia in chiaro di dump, archivio e file scaricati. Le ultime due
  cancellazioni su indicazione esplicita di Cristian a lavoro chiuso.
- **Chiave**: nel Portachiavi resta solo la v2, servizio
  `elbrenz-backup-age-key-v2`, account `elbrenz-backup`, valore in
  base64. Pubblica
  `age1g8gfud0ansz29k735mjfx2rfrptatcdvregmruudfuaazgucuyfsxstkgw`.
- **`~/bin/elbrenz-backup.sh`** aggiornato con la pubblica v2 (`.bak`
  accanto). **`eu.elbrenz.backup`** (launchd) scaricato e disabilitato
  in modo persistente; plist lasciato al suo posto.
- **Cartella di lavoro persistente** `~/.elbrenz-backup-work/20260905/`
  con gli script del giro manuale (`scarica.sh`, `dump.sh`,
  `confronta-bucket.sh`, `chiudi.sh`), i log e i conteggi di
  riferimento. Nessun dato e nessun segreto dentro.

## 3. Cosa resta, in ordine

1. **Copie su Google Drive (`info@elbrenz.eu`) e disco esterno**, a
   mano: app Drive non installata su questo Mac, nessun disco
   collegato. In ogni destinazione `shasum -a 256 -c SHA256SUMS.txt`.
2. **Copia fuori casa della chiave v2** (stampa o chiavetta). Finché
   manca, chiave e backup vivono nello stesso posto fisico.
3. **Credenziali per l'automazione**: decidere dove vivono (Portachiavi,
   verosimilmente), poi `launchctl enable gui/501/eu.elbrenz.backup` e
   `launchctl bootstrap gui/501 ~/Library/LaunchAgents/eu.elbrenz.backup.plist`.
   Prima di riattivare: lo script usa `mktemp` e cancella la cartella
   di lavoro all'uscita, un giro interrotto riparte da zero; conviene
   fargli usare una cartella persistente come quella di oggi.
4. Per il prossimo giro manuale, ricreare `~/.elbrenz-backup-env` con i
   sei valori veri e **provare la connessione prima di scaricare**.

## 4. Trappole imparate oggi

- **Sei righe non sono sei valori.** Un file di credenziali si verifica
  con una connessione, non con `wc -l`.
- **Il plist in `~/Library/LaunchAgents` si carica da solo al login.**
  "Mai fatto `launchctl load`" non vuol dire inerte: dopo un riavvio è
  attivo. Per fermarlo davvero servono `bootout` più `disable`.
- **`falliti=0` del downloader non basta.** Un elenco di sottocartella
  abbandonato dopo i ritentativi non conta come fallito: tre file
  mancavano in silenzio. La prova è il confronto per numero e byte
  contro `storage.objects`, per bucket e per singolo file.
- **La chiave si prova dal Portachiavi, non dal file.** Derivare la
  pubblica dalla privata letta dal Portachiavi e confrontarla con il
  destinatario, prima di fidarsi di qualunque `.age`.
- **`/private/tmp` non sopravvive al riavvio.** Un lavoro lungo va in
  una cartella persistente nella home, con ripresa.
- **pg_dump 17.11 chiude con `\unrestrict`**, non con "dump complete":
  quella riga c'è ma è la penultima significativa. Non è un troncamento.
- **Un cambio di rete a metà scaricamento** (hotspot → cavo) produce
  errori DNS negli elenchi, non nei file: si vede solo dal confronto.

## 5. Stato di chiusura

| | |
|---|---|
| Copie del backup | 2 su 3 (iCloud + staging locale) |
| Segreti in chiaro sul disco | nessuno |
| Voci nel Portachiavi | solo `elbrenz-backup-age-key-v2` |
| launchd `eu.elbrenz.backup` | non caricato, disabilitato |
| Ultimo commit | vedi `git log`, tutto su `origin/main` |

Nessun deploy Netlify: la sessione non ha toccato `src/` né `public/`.
Le OG image non tracciate in `public/og/` erano già presenti a inizio
sessione e non sono state toccate.
