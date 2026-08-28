# Censimento delle funzioni — 28/8/2026

## Una correzione prima della tabella

Il brief parla di sessantanove funzioni. **Le edge function attive deployate su Supabase sono settanta**, contate due volte con metodi diversi (elenco `list_edge_functions` e conteggio programmatico dei suoi elementi) per escludere un mio errore di trascrizione. Non ho tolto una riga per tornare a 69: guardare il dato, non il numero atteso, è la regola che questo stesso brief mette al primo posto. La tabella sotto ha quindi **70 righe**, non 69 — vedi verifica 1 in fondo.

`sentinella-pagine`, come il brief stesso avverte, non è fra queste: è una funzione PL/pgSQL invocata da pg_cron, non una edge function, e non compare qui.

Due funzioni deployate risultano **non più raggiungibili da nessuna versione di codice qui presente**: `lancia_radar_eventi()` e `lancia_radar_classifica()` (i lanciatori SQL di `radar-eventi-harvest`/`radar-eventi-classifica`, chiamati da cron) esistono live a database ma **nessuna migrazione li traccia in questo repository** — verificato con `grep -rl` su tutte le migrazioni, zero risultati, poi confermato che le due funzioni esistono comunque via `pg_proc`. Non è nella lista delle 70 (sono funzioni SQL, non edge), ma è lo stesso difetto di fondo di questo censimento — codice che gira e non è scritto da nessuna parte — e va detto.

Cinque funzioni **deployate non hanno alcun sorgente in nessuno dei due repository**: `assemblea-convoca`, `libro-sociale-file`, `glossario-audio-migrazione`, `pulizia-ricevute-prova`, `upload-temp-og-cimiteri`. Il loro codice esiste solo a Supabase (recuperato con `get_edge_function` per poterle classificare). Le prime due sono vive e chiamate dall'app; le ultime tre sono strumenti una tantum già eseguiti e disattivati sul posto. Segnalato riga per riga.

Una sesta cosa emersa cercando, non dedotta: `wp-import` ha sorgente locale ed è dichiarata in `config.toml`, ma **non è deployata** — verificato con `get_edge_function` → "Function not found". Codice morto nel repository che punta a una funzione che non esiste più. Non è una delle 70 (il censimento è sulle funzioni deployate), ma va segnalato.

---

## La tabella, settanta righe

Legenda classificazione: **cron** · **sito** · **app** · **webhook** · **manuale** · **orfana**. Dove un chiamante non rientra in nessuna delle sei (un solo caso: `invia-push`, innescata da un trigger Postgres, non da un cron né da un servizio esterno), è segnato per quello che è, non forzato nella casella più vicina.

| funzione | verify_jwt | config.toml | chi la chiama | dove l'ho trovato | note |
|---|---|---|---|---|---|
| send-email | false | sì | interna (altre edge) | `supabase/functions/contatti-submit/index.ts:89`, `guardiani-digest/index.ts:206` e molte altre | hub email interno, mai chiamata da fuori |
| ingest-articoli | false | sì | manuale | nessun invoke nel codice; documentata in `CLAUDE.md:161` come popolatore della KB Andreas | strumento di ingestione, a mano quando arriva nuovo materiale |
| otp-request | true | sì | sito + app | `src/pages/redazione.astro:188`, `src/pages/libro-soci.astro:470`; `elbrenz-community/src/pages/Welcome.tsx:55` | |
| otp-verify | true | sì | sito + app | `src/pages/redazione.astro:202`; `elbrenz-community/src/pages/Welcome.tsx:64` | |
| andreas-chat | false | sì | sito | `public/scripts/andreas-chat.js:605,896` (anche chiamata da `supabase/functions/telegram-bot/index.ts:645`) | |
| ingest-doc | false | sì | manuale | nessun invoke; `CLAUDE.md:162` | come ingest-articoli |
| contact-form | false | sì | sito | `src/pages/tesseramento.astro:26` | |
| paypal-create-order | false | sì | sito | `src/pages/tesseramento.astro:32`, `src/pages/rinnovo/[...seg].astro:31` | |
| paypal-capture-order | false | sì | sito | `src/pages/tesseramento.astro:33`, `src/pages/rinnovo/[...seg].astro:32` | |
| paypal-webhook | false | sì | webhook | nessun chiamante interno; verifica firma con `PAYPAL_WEBHOOK_ID` nel proprio codice, coerente col nome | registrata nel pannello sviluppatori PayPal, fuori repo |
| ricevuta-ocr | false | sì | sito | `src/pages/tesseramento.astro:37`, `src/pages/dona.astro:135` | |
| scheda-domanda | false | sì | sito | `src/pages/rinnovo/[...seg].astro:30`, `src/pages/libro-soci.astro:41` | |
| convenzioni-proposta | false | sì | sito | `src/pages/convenzioni.astro:19`, `convenzioni-curatela/[...seg].astro:21` | |
| ingest-chunks | false | sì | manuale | nessun invoke; `CLAUDE.md:25` | come ingest-articoli/ingest-doc |
| tessera-invio | true | sì | interna (altre edge) | `supabase/functions/tessera-invio-admin/index.ts:87` | |
| tessera-download | false | sì | sito | `src/pages/tessera/[codice].astro:53` | |
| wallet-google | false | sì | sito + app | `src/pages/tessera/[codice].astro:57`; `elbrenz-community/src/lib/tessera.ts:72` | |
| **andreas-hofer** | true | sì | **orfana** | nessun chiamante in nessuno dei due repository (ricerca su tutti i tipi di file) | **già segnalata "fuori perimetro" in `docs/HANDOFF_2026-07-06.md:69` il 6/7/2026 — nota da 53 giorni, mai risolta** |
| integrazione-invio | false | sì | manuale | nessun invoke; intestazione propria: canale amministrativo per la campagna "quota 10→20€, delibera CD" | invocata a mano da Cristian, campagna una tantum |
| contatti-submit | false | sì | sito | `src/components/SportelloContatti.astro:15` | |
| **solleciti-integrazione** | false | sì | **orfana** | nessun cron (non è fra i 16 del punto 3), nessun chiamante nel codice | dichiarata "DORMIENTE finché SOLLECITI_LIVE !== 'true'" nella propria intestazione — ma anche attivata, oggi non la lancerebbe nessuno: manca lo schedulatore stesso |
| guardiani-contributo | false | sì | sito | `src/pages/guardiani-curatela/[...seg].astro:19` | |
| gita-verifica-socio | true | sì | sito | `src/pages/gita-giochi-medievali-2026/iscrizione.astro:34` | |
| gita-crea-ordine | true | sì | sito | `iscrizione.astro:35` | |
| gita-cattura-ordine | true | sì | sito | `iscrizione.astro:36` | |
| download-lead | false | sì | sito | `src/pages/fioi-dal-nos.astro:17`, `a-proposito-di-tirolo.astro:14` | |
| telegram-bot | false | sì | webhook + interna | `WEBHOOK_URL` in `telegram-setup/index.ts:15` punta qui; chiamata anche da `contatti-submit/index.ts:188` e da `notificaDirettivo` di più funzioni | doppio ruolo: riceve da Telegram, e altre funzioni la usano per notificare |
| telegram-setup | false | sì | manuale | nessun chiamante; intestazione propria: "una volta verificato il bot, questa function può essere rimossa" | strumento di configurazione one-off |
| articolo-azione | true | sì | sito | `src/pages/redazione.astro:333` | |
| **newsletter-unsubscribe** | false | sì | **orfana** | nessun chiamante reale | `src/pages/newsletter/disiscrizione/[...seg].astro` dichiara nel commento di chiamarla, ma **l'URL effettivo costruito alla riga 24 punta a `newsletter-gestione/disiscrizione`, non qui** — commento superato dai fatti, funzionalità sostituita e mai rimossa |
| newsletter-broadcast | false | sì | manuale | nessun chiamante; intestazione propria: "endpoint AMMINISTRATIVO server-to-server, NON dal browser", gate `X-Broadcast-Secret` | invocata a mano da Cristian per ogni invio reale |
| telegram-link-token | true | sì | sito | `src/pages/collega-telegram.astro:90` | |
| test-search | true | sì | manuale | nessun chiamante; endpoint di collaudo per la ricerca semantica nella KB, gate `x-ingest-token` | |
| andreas-test | true | sì | manuale | nessun chiamante; endpoint di collaudo per prompt/KB di Andreas, gate `x-ingest-token` | |
| museo-gg-proposta | false | sì | sito | `src/pages/non-e-sole-grande-guerra.astro:322` | |
| tessera-invio-admin | true | sì | app | `elbrenz-community/src/pages/Amministrazione.tsx:338` | |
| avatar-upload | true | sì | app | `elbrenz-community/src/lib/avatar.ts:72` | |
| carica-media | true | sì | sito + app | `src/pages/luoghi-curatela.astro:603`; `elbrenz-community/src/lib/{luoghiImmagini,museo,donazione,storie,forum,museoCuratela}.ts` | riusata da sei moduli diversi della PWA |
| push-config | true | sì | app | `elbrenz-community/src/lib/push.ts:40` | |
| **invia-push** | true | sì | **trigger Postgres** (nessuna delle sei classi previste) | trigger `notifica_push_ai AFTER INSERT ON public.notifica` → `notifica_push_webhook()` → `net.http_post` verso questa edge (verificato con `pg_trigger`/`pg_proc`) | automatica ma non cron né webhook esterno: un trigger su INSERT |
| contanti-registra | true | sì | sito + app | `src/pages/tesseramento-curatela.astro:401`; `elbrenz-community/src/lib/contanti.ts:84` | |
| **solleciti-domande** | false | sì | **orfana (già nota)** | nessun cron, nessuna funzione lanciatrice | vedi scheda di lettura al §5 sotto |
| museo-notifica | true | sì | app | `elbrenz-community/src/lib/museoCuratela.ts:295` | |
| museo-donazioni-media | true | sì | app | `elbrenz-community/src/lib/museoCuratela.ts:104` | |
| donazione-upload | false | sì | sito | `src/pages/non-e-sole-grande-guerra.astro:655` | |
| radar-eventi-harvest | false | sì | cron | `cron.job` (§3 del brief): job `radar-eventi-harvest` 03:20 → `lancia_radar_eventi(p_esegui=>true)` | il lanciatore SQL esiste solo a database, nessuna migrazione lo traccia (vedi sopra) |
| radar-eventi-classifica | false | sì | cron | `cron.job` (§3): tre job (`radar-eventi-classifica` 03:40, `radar-eventi-classifica-coda` 04:10, `radar-eventi-digest` lun 07:30) → `lancia_radar_classifica()` | stessa nota sul lanciatore |
| radar-eventi-azione | true | sì | sito | `src/pages/radar-eventi.astro:334` | |
| tessere-qr-orfani | false | sì | manuale | nessun chiamante; intestazione propria: strumento di pulizia storage ad hoc | |
| solleciti-quota | false | sì | cron (sospensione deliberata) | `cron.job` (§3): `solleciti-quota-giornaliero` 07:15 → `lancia_solleciti_quota(p_esegui=>false)` | **non toccare** — regola dell'Associazione: solleciti dopo il 31/12/2026 |
| newsletter-gestione | false | sì | sito | `src/pages/newsletter-curatela.astro:32`, `src/pages/newsletter/index.astro:20`, `newsletter/disiscrizione/[...seg].astro:24` | assorbe anche la disiscrizione (vedi riga newsletter-unsubscribe) |
| guardiani-digest | false | sì | cron | `cron.job` (§3): ogni 30 min; `supabase/migrations/20260806111017_cron_guardiani_digest.sql:18` | |
| link-pagamento | true | sì | app | `elbrenz-community/src/pages/Plancia.tsx:375` | |
| reazione-pubblica | false | sì | sito | `src/pages/guardiani-de-la-lenga/[slug].astro:487` | |
| lemma-correzione | false | sì | sito | `src/pages/guardiani-de-la-lenga/[slug].astro:591` | |
| lemma-commento | false | sì | sito | `src/pages/guardiani-de-la-lenga/[slug].astro:684` | |
| ocr-trascrivi | true | sì | sito + app | `src/pages/trascrizioni.astro:204`; `elbrenz-community/src/lib/storie.ts:140` | |
| glossario-audio | false | sì | sito | `src/pages/glossario-console.astro:1418`, `guardiani-de-la-lenga.astro:27` | |
| libro-sociale-file | true | sì | app | `elbrenz-community/src/lib/libriSociali.ts:142` | **nessun sorgente in nessuno dei due repository** (recuperato con `get_edge_function`) |
| assemblea-convoca | true | sì | app | `elbrenz-community/src/lib/assemblea.ts:83` | **nessun sorgente in nessuno dei due repository** (recuperato con `get_edge_function`) |
| geocodifica-luogo | true | sì | sito + app | `src/pages/luoghi-curatela.astro:626`; `elbrenz-community/src/lib/luoghiProponi.ts:16` | |
| lezione-firma-video | true | sì | app | `elbrenz-community/src/lib/corso.ts:136` | |
| corso-video-libreria | true | sì | app | `elbrenz-community/src/lib/redazioneCorso.ts:98` | |
| corso-vetrina-pubblica | false | sì | sito | `src/pages/formazione.astro:32` | |
| glossario-audio-revisione | true | sì | sito | `src/pages/glossario-console.astro:411` | |
| glossario-audio-migrazione | false | **no → dichiarata oggi** | manuale (già eseguita) | codice recuperato con `get_edge_function` (assente in repo): "una tantum del 25/8/2026 (SIC-06), già eseguita... disattivata di proposito" | stub disattivato, risponde solo un messaggio fisso |
| pulizia-ricevute-prova | false | **no → dichiarata oggi** | manuale (già eseguita) | idem: "una tantum del 25/8/2026 (SIC-05), già eseguita" | idem |
| upload-temp-og-cimiteri | false | **no → dichiarata oggi** | manuale (dismessa) | idem: "Dismessa subito dopo l'uso", risponde 410 | idem |
| coda-ascolto-promemoria | false | sì | cron | `cron.job` (§3): lun 08:00; `supabase/migrations/20260826155611_coda_ascolto_promemoria_telegram.sql:33` | |
| cruscotto-digest | false | sì | cron | `cron.job` (§3): lun 08:00; `supabase/migrations/20260827214033_cruscotto_digest_promemoria_settimanale.sql:25` | |

---

## Le orfane: quattro, non zero

**1. `andreas-hofer`** — assistente AI a tema Andreas Hofer, completo (RAG, rate limit, JWT), mai collegato a nessuna pagina. Segnalata "fuori perimetro" già nell'handoff del 6/7/2026, mai risolta in 53 giorni. **Proposta**: collegare (esiste già una bozza di pagina/lore su Andreas Hofer nel sito — vedi `tiroler-landlibell-1511-bozza.md`) o ritirare esplicitamente se la KB tematica non è più una priorità. Decide Cristian.

**2. `solleciti-integrazione`** — promemoria per l'integrazione quota, dichiarata dormiente da un flag (`SOLLECITI_LIVE`) che però non ha nemmeno un cron da svegliare. **Proposta**: dichiarare deliberata (la sospensione è esplicita e motivata nel codice) finché non si decide di darle davvero un cron.

**3. `newsletter-unsubscribe`** — sostituita nei fatti da `newsletter-gestione/disiscrizione`, il commento che la cita è rimasto ma il codice ha smesso di chiamarla. **Proposta**: ritirare (nel senso del brief: non cancellare, ma correggere il commento bugiardo in `disiscrizione/[...seg].astro` e considerarla chiusa) oppure verificare se esiste ancora un vecchio link di disiscrizione in circolazione (email passate) che punti qui — in tal caso va tenuta viva finché quei link non scadono.

**4. `solleciti-domande`** — già nota dal brief precedente. Vedi scheda di lettura sotto. **Non collegata**, come richiesto.

## Le non dichiarate in config.toml: tre, tutte già corrette

`glossario-audio-migrazione`, `pulizia-ricevute-prova`, `upload-temp-og-cimiteri` — tutte e tre dichiarate oggi in `supabase/config.toml` con `verify_jwt = false`, identico a quanto risultava dal vivo prima della modifica (verificato con `get_edge_function` prima e dopo: invariato).

## Le schedulate che meritano un battito e non sono ancora in `servizio`: nessuna

Le sei edge function davvero chiamate da un lavoro pg_cron (`guardiani-digest`, `radar-eventi-harvest`, `radar-eventi-classifica`, `solleciti-quota`, `coda-ascolto-promemoria`, `cruscotto-digest`) sono già tutte registrate in `servizio`, insieme a `sentinella-pagine` (SQL) e `solleciti-domande` (registrata ma orfana, come già emerso). Non c'è nessun buco da colmare qui.

---

## §5 · Scheda di lettura di `solleciti-domande`

Una correzione alla premessa del brief prima della scheda: la funzione **non manda email a persone reali**. Letto il codice (non dedotto dal nome): avvisa il **gruppo Telegram del direttivo**, un messaggio aggregato via `notificaDirettivo(..., 'sollecito_domande', ...)` — lo stesso canale usato per `cruscotto_allarmi` e `coda_ascolto`. Nessun destinatario individuale, nessuna casella di un socio o di un richiedente coinvolta. Questo non cambia l'istruzione «non collegarla» del brief, ma cambia il rischio reale se qualcuno la collegasse per sbaglio: nel peggiore dei casi il direttivo riceve un messaggio Telegram di troppo, non un socio riceve una email indesiderata.

- **A chi scriverebbe**: al gruppo Telegram del direttivo (categoria "Alert" nella configurazione `telegram_notifica`, tipo `sollecito_domande`), non ai richiedenti.
- **Criterio di selezione**: domande in `domande_tesseramento` con `stato = 'in_attesa'`, `created_at` oltre 48 ore fa, e mai sollecitate oppure sollecitate da più di 24 ore (`sollecito_direttivo_il` nullo o vecchio) — dedup per non ripetere lo stesso avviso ogni pochi minuti se venisse invocata più spesso.
- **Cadenza pensata**: giornaliera, per la propria intestazione ("Pensata per esecuzione SCHEDULATA giornaliera"). Oggi non schedulata da nulla.
- **Quante persone colpirebbe oggi**: **zero**. Verificato invocandola realmente (senza `?dryrun=1`) durante il brief precedente: risposta `{"sollecitate": 0, "messaggio": "nessuna domanda oltre 48h da sollecitare"}` — coerente con l'affermazione del brief che le domande in lavorazione sono zero.
- **Modalità di prova a vuoto**: sì, `?dryrun=1` — nessun invio, nessuna scrittura, restituisce l'elenco di chi verrebbe conteggiato con il numero di giorni di attesa.

Con questa scheda, Cristian può decidere se e quando schedularla. Nessuna azione presa oltre alla lettura.

---

## Le dieci verifiche, una per una

1. **No, con spiegazione.** Il censimento ha **70 righe**, non 69: le funzioni deployate attive sono settanta, contate due volte con metodi indipendenti. Nessuna esclusa: tutte le 70 compaiono in tabella.
2. **Sì.** Ogni riga `sito`/`app`/`webhook` porta file e riga (o, per `paypal-webhook`, la motivazione strutturale sostitutiva quando un file non esiste per definizione — un webhook esterno non ha un "chiamante" nel repository).
3. **Sì.** Ogni riga `manuale` porta una motivazione scritta, tratta dall'intestazione della funzione stessa dove disponibile.
4. **Sì.** Tre funzioni non dichiarate trovate (`glossario-audio-migrazione`, `pulizia-ricevute-prova`, `upload-temp-og-cimiteri`), tutte dichiarate oggi in `config.toml` con `verify_jwt = false`, identico al valore dal vivo verificato prima e dopo con `get_edge_function`.
5. **Sì.** Il conteggio delle funzioni deployate resta 70 (era 70 all'inizio, è 70 alla fine): nessuna cancellata.
6. **Sì.** Nessun lavoro pg_cron toccato: i sedici del punto 3 sono stati solo letti, mai modificati.
7. **Sì.** Verificato via `execute_sql`: `select command from cron.job where jobname = 'solleciti-quota-giornaliero'` → `select public.lancia_solleciti_quota(p_esegui => false)`, invariato.
8. **Sì.** La scheda di lettura di `solleciti-domande` risponde a tutte e cinque le domande del §5, con una correzione fattuale sulla premessa del brief (non manda email, avvisa il direttivo via Telegram).
9. **Sì.** La regola di Trappola 15 è stata aggiunta a `CLAUDE.md`, subito dopo Trappola 14.
10. **Sì.** Nessun file di runtime toccato (solo `config.toml`, `CLAUDE.md`, e questo censimento/report): nessun deploy necessario, nessun cambiamento di comportamento del sito o dell'app.
11. Vedi commit sotto per `git log origin/main --oneline`.
