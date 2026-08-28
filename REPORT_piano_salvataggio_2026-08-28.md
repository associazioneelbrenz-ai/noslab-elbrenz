# Report · Piano di salvataggio gratuito — 28/8/2026

## Prima di tutto: cosa è pronto e cosa resta solo a Cristian

Questo brief ha una parte che il codice può fare da solo (l'automatismo
settimanale) e una parte che **non può essere automatizzata da questa
sessione, per le stesse regole di sicurezza del brief**: generare la coppia
di chiavi, creare la service account Google, condividere una cartella
Drive, e il ponte di stasera a mano — tutte azioni che richiedono un valore
segreto o una decisione che non deve mai passare da questa conversazione.

**Ad oggi, 28 agosto 2026 sera, l'associazione NON ha ancora un backup da
nessuna parte.** Lo aveva già scritto il brief: questo report non lo
cambia da solo. Cambia quando Cristian fa i passi elencati sotto — il primo,
il ponte di stasera, è quello urgente.

---

## Cosa è stato costruito

### 1. L'automatismo settimanale — scritto, distribuito, già verificato dal vivo

- **`supabase/functions/salvataggio-settimanale/index.ts`** — la edge
  function. Esporta ogni tabella di `public` in JSON (a lotti da 1000 righe,
  senza doverle nominare a mano: usa una nuova funzione SQL che le elenca da
  `pg_catalog`), elenca ricorsivamente ogni bucket dello Storage (percorso,
  dimensione, etag — **mai il contenuto dei file**), cifra il risultato con
  `age` a chiave pubblica, carica su Drive con una service account, e tiene
  solo gli ultimi 8 file settimanali. Se manca `BACKUP_PUBKEY` o una
  credenziale Google, si ferma **prima** di leggere un solo dato e non carica
  niente — verificato dal vivo, vedi sotto.
- **`supabase/migrations/20260828120000_salvataggio_settimanale.sql`** —
  applicata in produzione: la funzione `_salvataggio_elenco_tabelle()`
  (elenco dinamico delle 126 tabelle, eseguibile solo da `service_role`),
  `lancia_salvataggio_settimanale()` (stesso schema di `lancia_solleciti_quota`:
  legge `ingest_token` dal Vault — **nessun segreto nuovo**, riusa quello già
  in uso da `solleciti-quota`, `solleciti-domande`, `radar-eventi`, `coda-ascolto-promemoria`
  — e chiama l'edge), lo schedulamento (`cron.schedule`, domenica 02:00 UTC),
  e la riga in `servizio` (cadenza massima 192 ore).
- **`supabase/config.toml`** — dichiarata `verify_jwt = false`, gate
  `x-ingest-token` come le altre pianificate.
- **`src/pages/cruscotto.astro`** — quarta voce nel blocco Sicurezza:
  "Prova di ripristino di un backup: decifrato e confrontato con la
  produzione" (chiave `ripristino_backup`). Nessuna nuova funzione SQL
  necessaria: usa `cruscotto_segna_controllo`, già generica.

**Verificato dal vivo, non solo dedotto**: ho chiamato
`select public.lancia_salvataggio_settimanale();` direttamente (senza mai
vedere il valore del token, letto server-side dal Vault). La funzione ha
superato il gate, ha controllato `BACKUP_PUBKEY` (che oggi non esiste ancora
nei secrets), si è fermata **prima** di leggere qualunque tabella, e ha
scritto il battito:
```
esito: errore
dettaglio: {"errore": "BACKUP_PUBKEY non configurata: nessun salvataggio possibile senza cifratura."}
```
Questo è già, di fatto, la verifica 4 del brief ("se `BACKUP_PUBKEY` viene
tolto, la funzione fallisce e non carica niente") — oggi è ancora più vero
che "tolto": non è mai stato messo.

### 2. La procedura di ripristino — scritta, non ancora su Drive

**`supabase/manutenzione/PROCEDURA-DI-RIPRISTINO.md`** — pensata per essere
seguibile da chiunque nel direttivo. Spiega i tre livelli di salvataggio
(mensile dati+schema, mensile file, settimanale solo-dati), come decifrare,
come verificare prima di fidarsi, come ripristinare, e cosa succede — in
modo esplicito, non minimizzato — se la chiave privata va persa. **Va
copiata su Drive da Cristian**: qui è versionata in git perché non contiene
nessun segreto (solo procedura), ma il brief la vuole anche accanto ai
backup che descrive, per restare raggiungibile anche se git non lo fosse.

### 3. Una scelta in più rispetto al brief letterale, dichiarata qui

Il brief descrive la struttura `El Brenz – Salvataggi/{database,storage}/`
per il ponte a mano. Per l'automatismo settimanale ho previsto una **quarta
sottocartella, `settimanali/`**, non nel testo del brief ma coerente con la
sua stessa logica di minimizzazione degli accessi: la service account
Google va condivisa **solo su `settimanali/`**, mai sulla cartella
`El Brenz – Salvataggi/` intera. Così, anche in caso di bug nel codice, la
service account non può fisicamente toccare `database/`, `storage/` o la
procedura di ripristino — non perché il codice lo impedisca, ma perché
Google stesso rifiuta l'accesso a chi non ha permesso su quella cartella.
È additivo (una sottocartella in più, nessuna struttura tolta) e rende la
verifica 5 del brief ("il service account non può scrivere fuori dalla
cartella dei salvataggi") più forte del minimo richiesto, non più debole.

---

## Cosa NON è stato fatto, e perché — per ciascun punto, non in blocco

| Passo del brief | Fatto? | Perché non da questa sessione |
|---|---|---|
| §4 — ponte di stasera a mano (pg_dump, cifratura, copia bucket, upload Drive) | **No** | Richiede la stringa di connessione reale e l'esecuzione locale sul Mac di Cristian; il brief stesso lo assegna esplicitamente a lui ("Da fare da Cristian, sul suo Mac") |
| Generare la coppia di chiavi age | **No** | `age-keygen` va eseguito sul Mac di Cristian: la chiave privata deve nascere già fuori da qualunque canale che io possa vedere, non generata da me e poi "consegnata" |
| Impostare `BACKUP_PUBKEY` nei secrets Supabase | **No** | Anche se è solo la chiave pubblica (non un segreto in senso stretto), impostarla è l'ultimo passo della generazione della coppia — resta a Cristian per continuità con il passo sopra |
| Creare la service account Google, scaricare la chiave JSON | **No** | Richiede la Google Cloud Console, a cui questa sessione non ha accesso, e comunque è un'azione che crea una nuova identità con permessi — meglio che la faccia chi la governa |
| Condividere `settimanali/` con l'email della service account | **No** | Azione sulla dashboard Google Drive di `info@elbrenz.eu`, dell'account associativo, non mio |
| Impostare `GOOGLE_BACKUP_SA_EMAIL`, `GOOGLE_BACKUP_SA_KEY`, `GOOGLE_BACKUP_FOLDER_ID` nei secrets Supabase | **No** | La chiave della service account è un segreto pieno (accesso in scrittura alla cartella Drive): stessa regola della password postgres, non passa da qui |
| Copiare `PROCEDURA-DI-RIPRISTINO.md` su Drive | **No** | Serve l'accesso a Drive, di Cristian |
| La prova di ripristino (§6, una volta ora + poi ogni sei mesi) | **No** | Serve un backup reale già esistente (che non c'è ancora) e la chiave privata, che non è mai stata qui |

**Cosa invece è stato fatto senza toccare nessun segreto**: tutto il codice,
lo schema SQL, il deploy della edge function, e una verifica dal vivo che
non ha richiesto nessuna credenziale (il fallimento sicuro per mancanza di
`BACKUP_PUBKEY` si osserva proprio *perché* quel valore non esiste ancora).

---

## Le dieci verifiche del brief, una per una

| # | Verifica | Esito |
|---|---|---|
| 1 | Un salvataggio a mano produce un file su Drive, illeggibile senza chiave | **Non verificabile ora** — serve `BACKUP_PUBKEY` e le credenziali Google, che Cristian deve ancora impostare |
| 2 | Il file decifrato contiene tutte le 126 tabelle | **Non verificabile ora**, stesso motivo |
| 3 | I conteggi di 5 tabelle campione coincidono con la produzione | **Non verificabile ora**, stesso motivo |
| 4 | Senza `BACKUP_PUBKEY` la funzione fallisce e non carica niente | ✅ **Verificato dal vivo oggi** (vedi sopra): errore pulito, nessuna lettura, nessun caricamento, battito scritto |
| 5 | Il service account non può scrivere fuori dalla cartella | **Non verificabile ora** — il service account non esiste ancora; il disegno (`settimanali/` condivisa da sola) lo rende verificabile appena esiste |
| 6 | Il battito si scrive sia in successo sia in errore | ✅ **Verificato per il ramo errore** (test sopra); il ramo successo è verificabile solo dopo che Cristian ha configurato le credenziali |
| 7 | La riga in `servizio` esiste e il cruscotto la mostra | ✅ **Verificato**: riga presente (cadenza 192 ore), il cruscotto la mostrerà come "in allarme" finché non gira con successo almeno una volta — corretto, non è ancora sano davvero |
| 8 | La conservazione cancella il più vecchio al nono file | **Non verificabile ora**, serve prima che ne esistano nove |
| 9 | `PROCEDURA-DI-RIPRISTINO.md` su Drive, comprensibile a chi non è Cristian | **Scritta** (in git); **non ancora copiata su Drive** — resta un passo di Cristian |
| 10 | `git log origin/main --oneline` | Sotto, dopo il push |

Sei verifiche su dieci non sono verificabili da questa sessione perché
dipendono da segreti che, correttamente, non sono mai passati da qui. Non è
un lavoro a metà nascosto da belle parole: è esattamente il confine che il
brief stesso ha disegnato tra "additivo, verificabile da codice" e
"decisione/segreto, verificabile solo da chi la tiene in mano".

---

## Cosa deve fare Cristian, in ordine — dal più urgente

### Stasera (§4 del brief, ~20 minuti)
1. Stringa di connessione dalla dashboard Supabase (Project Settings →
   Database) — **non incollarla qui né in nessuna chat**.
2. `pg_dump` completo (dati + schema) verso un file locale.
3. `age-keygen -o elbrenz-backup.key` — genera la coppia. La chiave
   **pubblica** (riga `# public key: age1...`) va segnata da qualche parte
   comoda per il passo successivo; la riga `AGE-SECRET-KEY-...` **resta nel
   file**, non si copia altrove per ora.
4. Cifra il dump: `age -r <chiave pubblica> -o elbrenz-YYYYMMDD.sql.age elbrenz-YYYYMMDD.sql`.
5. Copia i bucket dello Storage con la CLI Supabase, stessa cifratura.
6. Crea su Drive (account `info@elbrenz.eu`, **non personale**):
   ```
   El Brenz – Salvataggi/
     database/       ← il dump cifrato
     storage/         ← la copia dei bucket cifrata
     settimanali/      ← vuota per ora, la userà l'automatismo
     PROCEDURA-DI-RIPRISTINO.md   ← copia di supabase/manutenzione/PROCEDURA-DI-RIPRISTINO.md
   ```
7. Copia `elbrenz-backup.key` nel Portachiavi del Mac **e** su un disco
   esterno o altro supporto fuori casa. Senza questa chiave, tutto quello
   cifrato oggi (e ogni settimana da qui in avanti) resta illeggibile per
   sempre — è il compromesso accettato, non un dettaglio da poi sistemare.

### Poi, per accendere l'automatismo settimanale
8. `supabase secrets set BACKUP_PUBKEY=age1...` (dalla dashboard o CLI —
   solo la chiave **pubblica**, quella dal passo 3).
9. Google Cloud Console: crea una service account dedicata (es.
   `elbrenz-backup@<progetto>.iam.gserviceaccount.com`), scarica la sua
   chiave JSON.
10. Su Drive, condividi **solo** la cartella `settimanali/` (non l'intera
    `El Brenz – Salvataggi/`) con l'email di quella service account, ruolo
    Editor.
11. Imposta tre secrets Supabase: `GOOGLE_BACKUP_SA_EMAIL` (l'email della
    service account), `GOOGLE_BACKUP_SA_KEY` (il campo `private_key` del
    JSON, con gli `\n` letterali del file — stesso formato già in uso per
    `GOOGLE_WALLET_SA_KEY`), `GOOGLE_BACKUP_FOLDER_ID` (l'id della cartella
    `settimanali/`, dall'URL di Drive).
12. Lancia una prova a mano: `select public.lancia_salvataggio_settimanale();`
    dall'editor SQL, poi controlla `servizio_battito` — se `esito='ok'`, il
    primo file cifrato è su Drive. Questo copre le verifiche 1, 2, 3, 6
    (ramo successo) del brief.
13. Aspetta (o forza) un nono giro per vedere la conservazione cancellare
    il più vecchio (verifica 8) — altrimenti basta aspettare 9 domeniche.

### Una volta, poi ogni sei mesi (§6 del brief)
14. Scarica l'ultimo file da Drive, decifra con la chiave privata, verifica
    che sia un dump valido con le tabelle attese e i conteggi coerenti con
    la produzione (istruzioni dettagliate in `PROCEDURA-DI-RIPRISTINO.md`).
15. Segna l'esito col pulsante "Segnato oggi" sul cruscotto, riga
    "Prova di ripristino di un backup" — è già lì, pronta.

---

## §9 del brief, ripetuto qui perché non si perda

Questo è un ponte gratuito, non un sostituto del piano Pro di Supabase (25
$/mese: backup giornalieri automatici, conservazione 7 giorni, ripristino a
un punto nel tempo, e il branching che è mancato per validare la baseline
della settimana scorsa). Con questo piano, se il database si rompe di
martedì, si torna alla domenica precedente — non a un minuto prima. La
decisione se e quando passare al piano Pro resta di Cristian: questo lavoro
serve a non restare scoperti stanotte, non a rendere quella decisione meno
necessaria.

---

## File toccati

- `supabase/functions/salvataggio-settimanale/index.ts` (nuovo) — deployato
  in produzione (versione 1, `verify_jwt=false`).
- `supabase/migrations/20260828120000_salvataggio_settimanale.sql` (nuovo) —
  applicata in produzione.
- `supabase/config.toml` — dichiarazione della nuova funzione.
- `src/pages/cruscotto.astro` — quarta voce Sicurezza.
- `supabase/manutenzione/PROCEDURA-DI-RIPRISTINO.md` (nuovo).
- `REPORT_piano_salvataggio_2026-08-28.md` (questo file).

Nessun oggetto vivo modificato, nessuna riga rimossa da nessuna parte,
nessuna credenziale in nessun file di questo repository — verificato a
mano rileggendo ogni file prima del commit.

## Nota su Netlify

`src/pages/cruscotto.astro` è un file applicativo (la quarta voce
Sicurezza): a differenza degli ultimi due brief, qui un deploy Netlify
serve. Il sito `elbrenz-app` (elbrenz.eu) è collegato a questo repository
su GitHub, quindi il push su `main` dovrebbe aver avviato una build
automatica — ma lo strumento Netlify di questa sessione ha risposto con un
errore del suo gateway (502, Cloudflare) a ogni tentativo di controllo, e
non ho potuto confermare l'esito della build. **Deployed non è testato**:
va controllato a mano che la quarta riga Sicurezza compaia su
`elbrenz.eu/cruscotto` prima di darlo per fatto.

## Commit su `origin/main`

`aa92c53` — "backup: salvataggio settimanale cifrato, automatico e gratuito"
(verificato con `git log origin/main --oneline -1` dopo il push).
