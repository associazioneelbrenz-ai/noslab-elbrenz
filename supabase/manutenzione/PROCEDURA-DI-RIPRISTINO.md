# Procedura di ripristino — El Brenz

Scritta il 28/8/2026, parte del piano di salvataggio gratuito. Una copia di
questo file deve stare anche su Drive, dentro `El Brenz – Salvataggi/`,
accanto ai backup che descrive — se un giorno git non fosse raggiungibile,
la procedura deve esserlo comunque.

Questa procedura è pensata per essere seguibile da chiunque nel direttivo,
non solo da chi l'ha scritta. Se un passo non è chiaro, è un difetto della
procedura, non di chi la legge.

## I tre tipi di salvataggio, e quando serve quale

| Cartella su Drive | Cosa contiene | Fatto da | Quando usarlo |
|---|---|---|---|
| `database/` | Dump completo del database (schema + tutti i dati), un file al mese, a mano | Cristian | Ricostruire tutto da zero: la scelta più completa |
| `storage/` | Copia reale dei file dei bucket (audio, immagini, documenti), un mese alla volta, a mano | Cristian | Recuperare FILE — soprattutto le registrazioni audio: nessun'altra copia le contiene |
| `settimanali/` | Solo i DATI delle tabelle in JSON + l'inventario dello Storage (percorsi/dimensioni, non i file), automatico ogni domenica | Il servizio `salvataggio-settimanale` | Un incidente dei giorni scorsi, quando l'ultimo mensile è troppo vecchio |

**Il settimanale non sostituisce il mensile per i file.** Contiene solo
l'elenco di cosa c'è nello Storage (percorso, dimensione, etag), mai il
contenuto: troppo pesante per una edge function. Se serve un file — e
soprattutto se serve una delle 68 registrazioni audio — l'unica fonte è
`storage/`.

## Prima di iniziare

Serve:
- **La chiave privata age.** Vive nel Portachiavi del Mac di Cristian e in
  una seconda copia fuori casa. Senza di essa NESSUN backup è leggibile,
  per nessuno, in nessun modo: è il compromesso accettato scegliendo la
  cifratura asimmetrica, e va scritto qui a lettere chiare, non solo
  saputo a memoria.
- **Accesso al Drive di `info@elbrenz.eu`**, cartella `El Brenz – Salvataggi/`.
- **Il programma `age`** (<https://github.com/FiloSottile/age>) installato
  sul computer da cui si ripristina, oppure un ambiente Node/Deno con il
  pacchetto `age-encryption` per fare lo stesso lavoro via script.
- Se si ripristina il database: un Postgres di destinazione (locale, o un
  **nuovo** progetto Supabase — mai quello di produzione) e uno strumento
  per eseguire SQL (`psql`, o l'editor SQL della dashboard Supabase).

## Passo 1 — decidere quale file serve

Guarda la tabella sopra. In dubbio, la domanda da farsi è: "mi serve un
file (audio/immagine/documento), o mi servono i dati delle tabelle?" — la
risposta decide la cartella.

## Passo 2 — scaricare e decifrare

Per un dump mensile (`database/elbrenz-YYYYMMDD.sql.age`):

```
age --decrypt -i /percorso/alla/chiave-privata.txt \
    -o elbrenz-YYYYMMDD.sql elbrenz-YYYYMMDD.sql.age
```

Per un salvataggio settimanale (`settimanali/salvataggio-settimanale-YYYYMMDD.json.age`):

```
age --decrypt -i /percorso/alla/chiave-privata.txt \
    -o salvataggio-YYYYMMDD.json salvataggio-settimanale-YYYYMMDD.json.age
```

Se `age` rifiuta il file o la chiave non corrisponde, il file resta
illeggibile: non c'è un modo alternativo, non c'è una password dimenticabile
da recuperare. È voluto (vedi "Se la chiave privata è persa" sotto).

## Passo 3 — verificare PRIMA di fidarsi

Un file che si decifra non è ancora un file utile: va controllato prima di
usarlo per davvero.

Per un dump SQL:
```
head -50 elbrenz-YYYYMMDD.sql          # deve iniziare con istruzioni SQL leggibili
grep -c "^CREATE TABLE" elbrenz-YYYYMMDD.sql   # atteso: intorno a 126
```

Per un salvataggio settimanale JSON:
```
python3 -c "import json; d=json.load(open('salvataggio-YYYYMMDD.json')); \
print(len(d['tabelle']), 'tabelle,', sum(len(v) for v in d['tabelle'].values()), 'righe totali')"
```
Atteso: intorno a 126 tabelle. Se il numero è molto diverso, non procedere:
segnalalo prima di usare il file per un ripristino vero.

## Passo 4 — il ripristino vero e proprio

**Un dump mensile**, dentro un database NUOVO e vuoto (mai sulla produzione):
```
psql "<stringa di connessione del database di destinazione>" -f elbrenz-YYYYMMDD.sql
```

**Un salvataggio settimanale** non ha uno strumento di ripristino pronto:
è pensato come rete di sicurezza per i dati recenti, non come un dump
applicabile con un comando solo. Per usarlo servono due passi manuali:
1. Applicare lo schema da git (la baseline `20260101000000_baseline_schema_fondativo.sql`
   più le migrazioni successive) su un database vuoto.
2. Scrivere (o farsi scrivere, quando serve davvero) uno script che legga
   il JSON e inserisca le righe tabella per tabella, nell'ordine delle
   dipendenze (chi ha chiavi esterne dopo chi viene referenziato).
Questo è il limite onesto del settimanale: copre i dati, non un ripristino
con un comando solo. Va detto qui, non scoperto il giorno che serve.

## Passo 5 — se la chiave privata è persa

Nessun backup, di nessuna settimana o mese, sarà mai più leggibile. È il
compromesso esplicito della cifratura asimmetrica (brief "Piano di
salvataggio gratuito", sezione 3): la chiave privata non è mai stata nei
secrets di Supabase, quindi non c'è un modo per recuperarla da lì. Prima di
dichiararla persa, controllare entrambe le copie note (Portachiavi del Mac
di Cristian, copia fuori casa) — solo dopo, generare una coppia nuova e
aggiornare `BACKUP_PUBKEY` nei secrets: da quel momento i backup vecchi
restano illeggibili per sempre, ma i nuovi torneranno protetti.

## Contatti

Cristian Bresadola, segretario — associazione.elbrenz@gmail.com
