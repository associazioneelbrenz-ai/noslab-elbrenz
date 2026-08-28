# Report · La baseline dello schema fondativo — 28/8/2026

## Due domande per Cristian, prima di tutto il resto

1. **I backup automatici di Supabase sono attivi?** Con quale frequenza e per quanto tempo vengono conservati? Non ho un modo per verificarlo da qui (nessuno strumento MCP espone la configurazione dei backup di progetto) — è una domanda che solo la dashboard Supabase, sezione Backups del progetto `wacknihvdjxltiqvxtqr`, può rispondere con certezza.
2. **Un ripristino da backup è mai stato provato**, anche solo come esercizio? Questa baseline riguarda la *riproducibilità* (copiare il sistema), non il *disaster recovery* (salvarlo) — ma le due cose si confondono facilmente, ed è meglio saperlo separatamente: se la risposta a questa domanda è no, è il rischio più grande dei due, più grande di qualunque cosa scritta sotto.

---

## La dichiarazione obbligatoria, nel corpo del report, non in una nota

**Questa baseline non è mai stata applicata a nessun database.** Descrive lo schema di produzione al 28 agosto 2026 secondo l'introspezione, ma che sia eseguibile su un database vuoto, nell'ordine giusto e senza errori di dipendenza, non è stato provato. Va provata alla prima occasione in cui esista un ambiente locale (Docker, o Postgres installato a mano).

Una baseline non validata è comunque enormemente meglio di nessuna baseline — ma va etichettata per quello che è, non presentata come più solida di quanto sia.

---

## Perché per introspezione e non per dump

Il piano originale (`supabase db dump --schema public`) richiede Docker, non disponibile su questa macchina (`Cannot connect to the Docker daemon`). Ho trovato `pg_dump` reale installato via Homebrew (`/usr/local/Cellar/libpq/18.4/bin/pg_dump`, keg-only, non su PATH) — niente Docker necessario per usarlo. Ma il ruolo di login del CLI (`cli_login_postgres.wacknihvdjxltiqvxtqr`, quello che compare in `supabase db dump --dry-run`) non ha privilegi di SELECT/LOCK sulle tabelle: `permission denied for table utente` durante il `LOCK TABLE` che `pg_dump` esegue anche per un dump solo-schema. Non è la password del superuser `postgres` — è un ruolo isolato per il solo flusso di login del CLI.

A quel punto l'unica strada per un dump letterale sarebbe stata la password `postgres` reale, incollata in questa conversazione. **Cristian ha rifiutato l'opzione**, con un motivo non negoziabile: quella password è accesso pieno in lettura e scrittura a ogni tabella, dati personali dei soci compresi — il segreto più potente del sistema, e non si muove per una conversazione. Ha scelto l'introspezione, e ha censito lui stesso la produzione in anticipo per darmi un bersaglio numerico esatto da centrare, così la superficie larga dell'introspezione diventasse un numero verificabile invece di una promessa. Questa regola (mai credenziali di database grezze in chat) resta valida per il resto e oltre questa sessione.

Di conseguenza, la parola "dump" nel resto di questo report va letta come "ricostruzione via query su `pg_catalog`/`information_schema`, statement per statement", non come output letterale di `pg_dump`.

---

## Righe rimosse (o mai scritte) dal "dump", e perché

Non essendoci un dump letterale da cui tagliare righe, il perimetro è stato **escluso per costruzione** dalle query stesse. Elenco di ciò che manca deliberatamente, con il motivo:

| Escluso | Motivo |
|---|---|
| Schemi `auth`, `storage`, `realtime`, `vault`, `cron`, `extensions`, `net`, `graphql`, `graphql_public`, `information_schema`, `supabase_migrations` | Gestiti dalla piattaforma Supabase, non da questo progetto. Il brief chiede solo `public`. |
| Le 118 funzioni dell'estensione `vector` e le 47 di `citext` | Non sono nostre: appartengono alle estensioni. Ricrearle a mano avrebbe reso la base inapplicabile (conflitto con le funzioni che l'estensione stessa crea). Sostituite dalle due righe `CREATE EXTENSION IF NOT EXISTS vector/citext`. |
| Indici, tipi, operatori e cast che dipendono da un'estensione (`pg_depend.deptype='e'`) | Stesso motivo — ricreati automaticamente da `CREATE EXTENSION`. |
| `OWNER TO ...` su qualunque oggetto | Non rimosso: **mai stato scritto**. L'introspezione via `pg_get_*def()` non emette mai `OWNER TO` — a differenza di un dump letterale, qui non c'è nulla da tagliare su questo fronte, è una conseguenza del metodo, non un'omissione fatta a mano. |
| Ruoli specifici dell'istanza (es. `cli_login_postgres.*`) | Stesso motivo: mai apparsi in nessuna query di introspezione. |
| Qualunque valore di segreto | Le funzioni che leggono segreti li leggono per nome da `vault.decrypted_secrets` in fase di esecuzione — la baseline contiene solo quel nome, mai un valore. Verificato leggendo tutte le 162 funzioni nel file assemblato: nessuna stringa che assomigli a una chiave o una password. |

---

## Le cinque verifiche del brief, una per una

### 1 — La baseline contiene tutti gli oggetti `public`, nessuno mancante o in più

Confronto fra i bersagli numerici dati da Cristian e i numeri ottenuti dall'introspezione (query dirette su `pg_catalog`, rieseguite ora per questo report, non solo durante la costruzione):

| Categoria | Atteso | Ottenuto | Esito |
|---|---:|---:|---|
| Tabelle | 126 | 126 | ✅ |
| Viste | 43 | 43 | ✅ |
| Funzioni nostre (escluse `vector`/`citext`) | 162 | 162 | ✅ |
| Trigger non interni | 68 | 68 | ✅ |
| Indici (esclusi quelli di estensione) | 390 | 390 | ✅ (126 da PK + 44 da UNIQUE + 220 autonomi) |
| Sequenze autonome | 12 | 12 | ✅ |
| Policy RLS | 238 | 238 | ✅ |
| Tipi enum | 0 | 0 | ✅ |
| Vincoli CHECK | 115 | 115 | ✅ |
| Chiavi esterne | 136 | 136 | ✅ |
| Colonne con default | 477 | 477 | ✅ — vedi nota sotto |
| Tabelle con RLS attiva | 126/126 | 126/126 | ✅ |

**Nota sulle colonne con default — una differenza trovata e spiegata, non nascosta.** La prima query contava 484, non 477. La differenza (7) sono colonne `GENERATED ALWAYS AS (...) STORED`: hanno una riga in `pg_attrdef` esattamente come un default ordinario, ma non sono un `DEFAULT` — sono espressioni calcolate, e vanno scritte come `GENERATED ALWAYS AS (...) STORED`, non come `DEFAULT ...` (le due sintassi non sono intercambiabili: un `DEFAULT` accetta un valore in INSERT, una colonna generata lo rifiuta sempre). Query corretta per distinguerle via `pg_attribute.attgenerated <> ''`; le 7 colonne sono scritte nella baseline con la sintassi corretta, non contate fra i 477 default.

Tutti e 421 i vincoli (126 PK + 44 UNIQUE + 136 FK + 115 CHECK) e tutti i 390 indici sono stati riverificati ora, direttamente contro `pg_constraint`/`pg_class`, non solo durante la costruzione del file.

### 2 — Nessun segreto, nessun ruolo di istanza, nessun dato personale

Verificato per costruzione (vedi tabella sopra) e per lettura diretta del file assemblato (9144 righe): nessuna stringa `OWNER TO`, nessun ruolo `cli_login_postgres.*` o simile, nessuna riga contenente un valore di segreto. La baseline descrive **struttura**, mai dati: zero righe `INSERT` in tutto il file.

### 3 — Il registro delle migrazioni dopo la registrazione contiene la baseline, e tutte le altre righe sono rimaste identiche

Prima di toccare il registro, lo stato precedente (304 righe) è stato salvato integralmente in `supabase/manutenzione/2026-08-28-ledger-prima-del-repair.txt` (verificato: 304 righe, `version|name`) — l'unica salvaguardia richiesta dal brief prima di un'operazione delicata sul registro.

Registrazione fatta con un `INSERT` diretto in `supabase_migrations.schema_migrations` (versione `20260101000000`, nome `baseline_schema_fondativo`) — puro lavoro contabile, nessuna istruzione DDL della baseline è stata eseguita. Verificato subito dopo: 305 righe totali, 1 con quella versione.

Verifica di fedeltà, doppia direzione, entrambe sola lettura:
- Le 304 righe del file di riferimento **meno** le righe del registro attuale (esclusa la baseline): **zero differenze**.
- Conteggio del registro attuale (esclusa la baseline): **304 righe, 304 versioni distinte** — stesso numero del file di riferimento, nessuna riga persa, nessuna duplicata, nessuna comparsa dal nulla.

### 4 — La produzione è rimasta invariata

Nessuna istruzione della baseline eseguita: solo l'`INSERT` contabile sul registro (verifica 3) e query di sola lettura per tutto il resto. Controllo diretto, oggi, degli indicatori che il brief chiede:

| Controllo | Atteso | Ottenuto | Esito |
|---|---|---|---|
| `v_memoria_conteggi` | 102 / 15 / 117 / 114 | sepolture_militari 102, sepolture_civili 15, sepolture_totali 117, uomini_distinti 114 | ✅ |
| `v_servizi_stato` | 8 servizi sani | 8 righe, tutte `diagnosi: "sano"` | ✅ |
| `cron.job` attivi | 16 | 16 | ✅ |

### 5 — Nessuna istruzione della baseline è mai stata eseguita sulla produzione

Vera per costruzione, non per test: il file `20260101000000_baseline_schema_fondativo.sql` non è mai stato passato a `execute_sql`, `apply_migration`, né a nessun altro canale di esecuzione in questa sessione. L'unica scrittura sul database in tutta questa sessione è stato l'`INSERT` contabile della verifica 3, che non fa parte del contenuto della baseline (è un'operazione sul registro, non sullo schema). Non c'è nulla da "testare" qui: è un'affermazione negativa su un'azione mai compiuta, verificabile rileggendo la sequenza di chiamate fatte, non lo stato del database.

---

## Il caso `v_memoria_evento_pubblico` — si scioglie da solo

Il censimento precedente aveva segnalato questa vista come un caso ambiguo: ha un file in git (`20260826095000_memoria_evento_pubblico_e_persona_arricchita.sql`), ma il registro delle migrazioni applicate non registra mai quella versione — sintomo dello stesso problema più grande delle migrazioni fondative mai versionate.

Con la baseline, il caso si scioglie: la vista è una delle 43 introspezionate direttamente dal vivo (non dal file storico, dalla vista *reale* così com'è oggi in produzione) e scritta in `views_section.sql`:

```sql
create or replace view public.v_memoria_evento_pubblico as
select id, slug, nome, ... from memoria_evento;
alter view public.v_memoria_evento_pubblico set (security_invoker = true);
```

Da qui in avanti, chiunque ricostruisca un ambiente dalla baseline ottiene questa vista nella sua forma vera, indipendentemente da cosa dica o non dica il registro delle migrazioni sul file storico del 26 agosto. Il disallineamento fra quel file e il registro resta un fatto storico non risolto (motivo per cui esiste, resta segnalato nel report del 26-28 agosto), ma smette di essere un problema per la riproducibilità: la baseline non dipende da quel file, dipende dalla vista viva.

---

## Due difetti trovati nel proprio metodo, e corretti prima di consegnare

Vale la pena renderli espliciti: non sono difetti della baseline finita, sono difetti nelle query usate per costruirla, trovati verificando invece di fidarsi del primo risultato.

1. **Il prefisso di schema spariva dai nomi delle tabelle nei vincoli.** La prima query per i 421 vincoli usava `conrelid::regclass::text`, che Postgres abbrevia senza prefisso quando il nome è risolvibile dal `search_path` — risultato sintatticamente valido ma incoerente (`alter table _import_gokollab add constraint ...` invece di `alter table public._import_gokollab add constraint ...`). Trovato con un controllo mirato (`grep -c "^alter table public\..*add constraint"` tornava 0 contro il file), corretto unendo `pg_constraint` a `pg_class` direttamente e costruendo il nome con `format('...public.%I...', ...)`. Rigenerata l'intera sezione, riverificata: tutti e 421 i vincoli ora correttamente prefissati.

2. **`bool_or()` su un insieme vuoto restituisce NULL, non falso — e 16 oggetti sarebbero spariti in silenzio dai grant.** La query per le deviazioni di grant su tabelle/viste testava `not bool_or(...)` per decidere se revocare tutti i permessi da `authenticated`; ma per le 16 tabelle/viste con **zero** grant a `authenticated`, `bool_or` su zero righe è NULL, e `not null` è ancora NULL — non vero — quindi quel ramo non scattava mai, proprio per gli oggetti che più ne avevano bisogno. Trovato riformulando il controllo con `NOT EXISTS` (che su un insieme vuoto è correttamente vero) e confrontando i due risultati: 16 oggetti (`anagrafica_modifica`, `deroga_quota`, `geocodifica_coda`, `newsletter_invio`, `newsletter_iscritto`, `servizio`, `servizio_battito`, `tesseramento_anno`, `v_associati_istituzionale`, `v_associati_per_indirizzo`, `v_contanti_da_riconciliare`, `v_incassi`, `v_newsletter_candidati_consenso`, `v_newsletter_destinatari`, `v_servizi_stato`, `v_soci_in_regola`) mancavano. Aggiunte le 16 righe `revoke all on public.X from authenticated;` esplicite, con commento nel file che spiega il motivo.

Nessuno dei due difetti ha mai toccato la produzione — erano nella query di generazione, corretti prima che il file venisse assemblato nella sua forma finale.

---

## Cosa non si può verificare, e perché

Nessun ambiente per applicare davvero la baseline: niente Docker (`Cannot connect to the Docker daemon`), niente Postgres locale, nessun branching Supabase disponibile su questo piano. La sola cosa che avrebbe dato una prova reale — applicarla a un database vuoto e vedere se finisce senza errori, nell'ordine giusto — non è stata possibile fare, non per scelta. Quanto scritto sopra (verifiche 1-5) è la migliore approssimazione ottenibile per introspezione: conferma che il *contenuto* corrisponde alla produzione, non che il *file* sia eseguibile da zero. Questi sono due fatti diversi, ed è per questo che la dichiarazione in cima al report esiste e resta necessaria.

---

## File toccati

- `supabase/migrations/20260101000000_baseline_schema_fondativo.sql` (nuovo, 9144 righe) — la baseline. Timestamp deliberatamente anteriore alla prima migrazione reale del registro (`20260421064913_enable_citext`).
- `supabase/manutenzione/2026-08-28-ledger-prima-del-repair.txt` (nuovo) — le 304 righe del registro prima della registrazione della baseline, la salvaguardia richiesta dal brief.
- `REPORT_baseline_schema_2026-08-28.md` (questo file).

Nessun file applicativo toccato — nessun deploy Netlify necessario.

## Commit su `origin/main`

`ffbb08b` — "db: baseline dello schema fondativo, per introspezione, mai applicata" (verificato con `git log origin/main --oneline -1` dopo il push).
