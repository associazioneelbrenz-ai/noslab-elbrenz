# Report · Riportare in git ciò che vive solo nel database — 28/8/2026

## Prima di tutto: due correzioni fatte in corsa, con l'autorizzazione di Cristian

**Il perimetro è stato ristretto.** In fase di indagine è emerso che la fondazione del progetto — autenticazione, RLS, pgvector, pg_cron, **33 migrazioni datate 21 aprile–22 maggio 2026** — non ha alcun file in questo repository, in nessun momento della sua storia (`git log --diff-filter=A --all` non trova mai quei nomi). È una scoperta molto più grande di quella descritta dal brief. Cristian ha deciso di **non mescolarla con il recupero dei tre giorni**: ricostruire a ritroso autenticazione e RLS è un lavoro dove un errore non è cosmetico, è una falla di sicurezza, e mischiarlo col resto avrebbe reso impossibile capire, se qualcosa si fosse rotto, quale metà l'avesse rotto. **Questo report copre solo il perimetro del 26-28 agosto**, esattamente quello del punto 1 del brief. La fondazione resta un lavoro a parte, non affrontato qui.

**La verifica 8 è stata sostituita da Cristian**, perché come scritta nel brief presupponeva una base ricostruibile da zero che oggi non esiste. La nuova verifica 8 chiedeva un ramo Supabase clonato dalla produzione con applicate solo le migrazioni nuove — ma **il ramo non è disponibile**: `create_branch` ha risposto "Branching is supported only on the Pro plan or above". Senza Docker e senza Postgres locale sulla macchina, nessun ambiente isolato era raggiungibile in nessuna forma. Cristian ha allora autorizzato una terza forma di verifica, per introspezione diretta, dettagliata nella sezione dedicata sotto — **dichiarata esplicitamente come più debole di un'applicazione reale**, con i suoi limiti nominati, non attenuati.

---

## Gli oggetti recuperati

### Previsti dal punto 1 del brief — tutti scritti

- **10 funzioni**: `conferma_ascolto`, `scarta_ascolto`, `lancia_radar_eventi`, `lancia_radar_classifica`, `controlla_radar_eventi`, `registra_battito`, `cruscotto_lavori`, `cruscotto_funzioni`, `cruscotto_servizi`, `cruscotto_conta_domande`.
- **4 tabelle**: `memoria_reparto`, `memoria_evento_reparto`, `servizio`, `servizio_battito` — con RLS, le policy dove previste, e i grant/le revoche esatti verificati dal vivo.
- **7 viste**: `v_memoria_reparto_pubblico`, `v_memoria_conteggi`, `v_memoria_evento_reparto_pubblico`, `v_coda_ascolto`, `v_cruscotto_code`, `v_cruscotto_completezza`, `v_servizi_stato`.
- **1 vista sostituita**: `v_memoria_persona_pubblica`, nella sua forma attuale (dopo i due ampliamenti, trascritti insieme perché la forma finale è l'unica che conta).
- **4 colonne + 1 vincolo** su `memoria_persona`: `stessa_persona_di`, `relazione_registrazione` (col suo check), `nota_registrazione`, `evento_motivazione`, più il vincolo su `evento_certezza`.
- **5 lavori pg_cron**: `radar-eventi-harvest`, `radar-eventi-classifica`, `radar-eventi-classifica-coda`, `radar-eventi-digest`, `radar-eventi-battito`, con le pianificazioni esatte del brief.
- **2 migrazioni di dati di riferimento**: 55 righe di `memoria_reparto`, 8 righe di `servizio`.

### Trovato e NON incluso, di proposito — va detto in cima, non in fondo

Cercando la storia di `v_memoria_persona_pubblica` è emerso che il file `20260826095000_memoria_evento_pubblico_e_persona_arricchita.sql` **esiste già in questo repository** (crea `v_memoria_evento_pubblico` e una prima versione, più semplice, di `v_memoria_persona_pubblica`) **ma non compare nel registro delle migrazioni applicate in produzione** (`supabase_migrations.schema_migrations`, verificato per la versione `20260826095000`: zero righe). La vista `v_memoria_evento_pubblico` esiste comunque dal vivo in produzione, con una forma che corrisponde a quel file.

Non l'ho toccata. Non è uno degli oggetti del punto 1 del brief, ha già un file in git (anche se il registro delle migrazioni applicate non lo conferma), e indagare fino in fondo il perché di quel disallineamento — sintomo dello stesso problema più grande delle 33 migrazioni di aprile-maggio, di scala più piccola — avrebbe significato esattamente il tipo di mescolamento di perimetro che Cristian ha chiesto di evitare. **Segnalato, non risolto**, come le 33 migrazioni mancanti.

Un'indagine più ampia ha mostrato che questo genere di disallineamento fra file locali e registro delle migrazioni applicate **non è isolato**: 225 voci del registro non hanno un file locale corrispondente (di cui solo 33 databili aprile-maggio: le altre ~192 sono sparse per tutta la storia del progetto), e circa 76 file locali non compaiono nel registro. Il pattern più plausibile è un flusso di lavoro che scrive prima via `execute_sql` diretto (ogni chiamata lascia una voce nel registro con un timestamp preciso) e solo in un secondo momento "squaderna" il lavoro in un file di migrazione pulito con un nome tondo, lasciando la voce originale orfana nel registro. **Non indagato oltre**: è la stessa scoperta più grande, non un problema nuovo, e resta fuori da questo perimetro.

Nessun altro oggetto imprevisto è emerso all'interno del perimetro esaminato. Va detto con altrettanta chiarezza: **questa non è stata una scansione cieca dell'intero schema `public`** (l'unico strumento che l'avrebbe fatta, `supabase db diff`, non è disponibile qui) — è stata un'introspezione mirata su ciascuno degli oggetti nominati dal punto 1, più l'indagine puntuale sulla storia di `v_memoria_persona_pubblica` che ha fatto emergere quanto sopra. Non posso escludere che un quarto oggetto del 26-28 agosto, non nominato dal brief e non incontrato per strada, esista ancora non scritto da nessuna parte.

---

## Il metodo di verifica: introspezione diretta, non applicazione reale

**Nessuna prova di applicazione reale è stata possibile.** Non per scelta: `supabase db diff --linked` richiede Docker (`Cannot connect to the Docker daemon`); non c'è Postgres locale sulla macchina (`psql`, `pg_dump`, `postgres`, `initdb` tutti assenti); il branching Supabase richiede il piano Pro, che questo progetto non ha (`PaymentRequiredException: Branching is supported only on the Pro plan or above`). Su richiesta esplicita di Cristian, **non è stato tentato nessun test di applicazione sulla produzione**, nemmeno dentro una transazione con rollback: il rischio di un lock su tabelle vive non valeva il guadagno.

**Cosa è stato fatto invece**, oggetto per oggetto, subito dopo averlo scritto:

1. Per ognuna delle 10 funzioni e delle 8 viste, `pg_get_functiondef`/`pg_get_viewdef` letti dal vivo **due volte** (prima di scrivere, e di nuovo dopo, per escludere derive), e confrontati carattere per carattere con quanto scritto nella migrazione, con uno script di normalizzazione che tiene conto di tre forme di canonicalizzazione che Postgres applica sempre, indipendentemente da come si scrive il sorgente: i cast impliciti (`'testo'` diventa `'testo'::text` quando confrontato con una colonna `text`), gli alias di tipo (`timestamptz` e `timestamp with time zone` sono lo stesso tipo), e gli alias impliciti di colonna nelle espressioni non nominate dentro `VALUES`/`UNION`. Dopo aver escluso questi tre casi — verificati uno per uno, non solo assunti — **tutti e 10 le funzioni e tutte e 8 le viste risultano identiche, senza eccezioni**.
2. Per le 55 righe di `memoria_reparto`, un confronto diretto in sola lettura (`EXCEPT` in entrambe le direzioni fra i valori scritti nella migrazione e la tabella viva, zero scritture, zero rischio) — **vuoto in entrambe le direzioni**: le righe scritte sono esattamente, senza eccezioni, quelle in produzione.
3. Per le tabelle, le colonne, i vincoli, le policy RLS e i grant: trascritti da `information_schema.columns`, `pg_constraint`, `pg_policies`, `information_schema.role_table_grants`, letti dal vivo prima di scrivere ogni riga.
4. Controllo strutturale finale sui tre file di migrazione: parentesi bilanciate, `$function$` in numero pari, apici singoli bilanciati nel codice SQL (esclusi i commenti) — tutti e tre i file passano.

**Cosa questa verifica NON dimostra**, nominato per come Cristian ha chiesto, non attenuato:

1. **L'ordine delle dipendenze fra le istruzioni della migrazione.** Ho ordinato a mano le CREATE (tabelle → colonne → funzioni → viste, rispettando chi legge cosa), ma nessuna esecuzione reale ha confermato che l'ordine scelto sia davvero eseguibile senza errori di "relation does not exist" o simili.
2. **Gli errori sintatticamente validi ma semanticamente sbagliati.** Un refuso che produce SQL valido ma un comportamento diverso da quello vivo non verrebbe mai scoperto da un confronto di testo: solo un'esecuzione reale lo rivelerebbe.

Questi due rischi restano scoperti. Non sono stati mitigati da nessun'altra prova in questo lavoro.

---

## Le dodici verifiche, una per una

1. **Sì.** La migrazione `20260828100000_recupero_schema_servizi_reparti_cruscotto.sql` contiene tutti gli oggetti del punto 1: le 10 funzioni, le 4 tabelle, le 7 viste, la vista sostituita, le 4 colonne e il vincolo — confermato per introspezione diretta come sopra.
2. **Sì, con l'eccezione già segnalata in cima.** Nessun oggetto realmente creato fuori da ogni file di migrazione e mai nominato prima è stato scoperto all'interno del perimetro; `v_memoria_evento_pubblico` (che HA un file, solo non confermato nel registro delle applicate) è stata trovata e volutamente non inclusa, per le ragioni sopra.
3. **Sì.** Nessuna riga della migrazione modifica un oggetto preesistente: tutte le `CREATE OR REPLACE FUNCTION`/`CREATE OR REPLACE VIEW` ricreano oggetti nati nella stessa finestra del 26-28 agosto (confermato: nessuno di questi nomi compare in nessun'altra migrazione già in git), e le uniche `ALTER TABLE` toccano `memoria_persona` per aggiungere colonne nuove (`ADD COLUMN IF NOT EXISTS`) e vincoli nuovi, mai per modificare qualcosa che già esisteva.
4. **Sì.** I cinque lavori pg_cron sono in `20260828100100_recupero_cron_radar_eventi.sql`, ciascuno preceduto da un `cron.unschedule` dentro un blocco che tollera l'assenza, con le pianificazioni esatte del brief (`20 3 * * *`, `40 3 * * *`, `10 4 * * *`, `30 7 * * 1`, `15 8 * * 1`) verificate contro `cron.job` prima di scrivere.
5. **Sì.** Ogni funzione e vista nuova ha la sua `revoke`/`grant` esplicita, verificata dal vivo prima di scriverla (es. `registra_battito`/`lancia_radar_*`/`controlla_radar_eventi` solo a `service_role`; `v_servizi_stato` nessun grant, interna; `v_coda_ascolto` solo `select` ad `authenticated`, niente ad `anon`).
6. **Sì.** Nessun valore di segreto in nessun file: le funzioni leggono `vault.decrypted_secrets` per nome (`'ingest_token'`, `'send_email_shared_secret'`), mai per valore.
7. **Sì.** Le due migrazioni di dati usano `on conflict do nothing`: applicarle una seconda volta lascerebbe il conteggio di righe invariato per costruzione (vincolo unico su `sigla` e su `nome`).
8. **Sostituita da Cristian, vedi sezione dedicata sopra.** Nessuna ricostruzione da zero e nessuna applicazione reale sono state possibili in questo ambiente (niente Docker, niente Postgres locale, branching non disponibile sul piano attuale). La verifica eseguita è l'introspezione diretta descritta sopra, con i suoi due limiti nominati esplicitamente, non un'esecuzione.
9. **Sì**, verificato di nuovo alla fine del lavoro: `v_memoria_conteggi` non è stata toccata (nessuna scrittura), i lavori pg_cron preesistenti (`select count(*) from cron.job` → 16, invariato) e `v_servizi_stato` non sono stati modificati — solo letti per scrivere le migrazioni. Non ho ripetuto le query numeriche esatte del brief (102/15/117/114, otto servizi sani) perché nessun dato è stato scritto: la produzione, semplicemente, non è stata toccata in nessun punto di questo lavoro.
10. **Sì.** Nessun file di runtime (sito, edge function, `config.toml`) è stato toccato: solo tre file di migrazione, questo report, e — vedi sotto — la regola nel file delle convenzioni. Nessun deploy necessario.
11. **Sì.** La regola del punto 5 del brief è stata aggiunta a `CLAUDE.md` (vedi sotto).
12. Vedi commit sotto.

---

## La regola aggiunta al file delle convenzioni

Aggiunta a `CLAUDE.md`, come Trappola 16 (dopo la Trappola 15 del censimento delle funzioni del giorno stesso):

> **Nessun oggetto di database si crea fuori da una migrazione.** Vale per le tabelle, le viste, le funzioni, le policy, i grant e i lavori schedulati. Vale anche per chi lavora via MCP: se un oggetto nasce in una sessione di chat, la migrazione corrispondente fa parte della consegna della stessa sessione, non del giro dopo.
>
> Un oggetto che vive solo nel database non è un lavoro finito fuori posto: è un lavoro che nessuno potrà ricostruire.

---

## Cosa è rimasto fuori, di proposito, e perché

- **Le 33 migrazioni di aprile-maggio 2026** (fondazione: schema iniziale, RLS, pgvector, pg_cron, autenticazione) — decisione esplicita di Cristian, per non mescolare un lavoro ad alto rischio di sicurezza con il recupero di tre giorni. Resta un lavoro a parte, non iniziato.
- **`v_memoria_evento_pubblico`** e il disallineamento più ampio fra file locali e registro delle migrazioni applicate (225 voci del registro senza file, ~76 file senza voce) — segnalato, non indagato oltre, per lo stesso motivo.
- **Un vero test di applicazione della migrazione** — non disponibile in questo ambiente (niente Docker, niente Postgres locale, branching non sul piano attuale). Sostituito dall'introspezione diretta descritta sopra, con i suoi limiti dichiarati.

---

## Commit verificati su `origin/main`

*(da confermare dopo il push — vedi comando sotto)*
