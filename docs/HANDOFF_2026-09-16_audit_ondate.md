# Handoff · 16 settembre 2026 · audit del 13/9 e prime due ondate

Sessione cloud di Claude Code (13-16 settembre), con Cristian sul MacBook
Air per i deploy del sito. Report di partenza: `AUDIT_2026-09-13.md`
(tabella completa dei rilievi, con id `SIC-`, `XSS-`, `PRIV-`, `LEG-`,
`DB-`, `SEO-`, `PERF-`, `DEP-`, `REPO-`). Precedente handoff:
`HANDOFF_2026-09-05_backup.md`.

Ramo di lavoro: `claude/happy-cori-0d7d75` su entrambi i repository
(`noslab-elbrenz` e `elbrenz-community`). L'ondata 1 e' gia' su `main`
(`7dde5fd`), l'ondata 2 no.

---

## 1. Da dove si e' partiti

L'audit del 13/9 ha prodotto 130 rilievi circa. I piu' pesanti: il
repository pubblico con dati di soci nei documenti (`REPO-01`), tre edge
con cancelli aperti o spenti (`invia-push`, `telegram-bot`,
`newsletter-gestione`), email di persone nelle notifiche Telegram
(`PRIV-01`), e una serie di scritture pubbliche che si fidavano
dell'identificativo ricevuto. In mezzo, il 14/9, un guasto vero segnalato
dal Direttivo: la voce dei Guardiani non entrava piu' dal 26/8 per un
`NOT NULL` rimasto su `archivio_audio.file_url` (`b9ac586`, applicato).

## 2. Cosa e' stato fatto

**Ondata 1** (`9124178`, `7dde5fd`, su `main`, sito deployato dall'Air il
15/9, `versione.json` = `7dde5fd`): SIC-01/02/03, PRIV-01, XSS-01..04,
DB-01/02, REPO-01 (redazione dei dati personali in `docs/` e migrazioni),
DEP-01 (`npm audit fix` non breaking). Sette edge deployate e verificate
byte per byte.

**Ondata 2** (quattro commit sul ramo, NON ancora su `main`):

| Commit | Squadra | Contenuto | Stato in produzione |
|---|---|---|---|
| `10e057c` | A, edge pagamenti e soci | SIC-04 (cattura PayPal vuole la sua riga e confronta importo), SIC-09 (gita-verifica-socio: tetto e nome solo con codice tessera), SIC-12 (otp-request: IP da `cf-connecting-ip`, limiter fail-closed), SIC-16 (send-email: confronto costante, `from` solo `@elbrenz.eu`), SIC-18 (contanti-registra: AAL2 obbligatorio, `incassato_da` verificato), PRIV-05 (`informativa_versione` scritta da contact-form, gita-crea-ordine, convenzioni-proposta, museo-gg-proposta; migrazione `20260915100000_priv05_informativa_versione`) | edge deployate (9), migrazione applicata |
| `b860a2f` | B, edge pubbliche e redazione | SIC-05 (guardiani-contributo non riscrive i contributori esistenti), SIC-07 (reazione-pubblica: tetto vero via `convenzioni_rl_hit`, esistenza dell'oggetto), SIC-08 (escape del nome in download-lead), SIC-14 (telegram-setup dietro `x-ingest-token`), SIC-15 (salvataggio-settimanale esclude le tabelle volatili), PRIV-02 (newsletter-broadcast: lead solo se confermati), XSS-08 (articolo-azione: `urlOk`, testi ripuliti, sanitize anche in approvazione) | edge deployate (7) |
| `5299e77` | C, sito e testi | DOMPurify e marked in `public/vendor/` (CSP senza jsdelivr), service worker v3 che non conserva le pagine riservate, `accedi` con controllo di origine sul ritorno, escape in cimiteri di guerra e Grande Guerra, LEG-02 (ricevuta su richiesta in `dona`), PRIV-03/04/06/08 nei testi di privacy e cookie policy (data 15 settembre 2026), honeypot e `_ts` nel modulo newsletter | **in attesa del deploy dall'Air** |
| `e8f77fd` | D, database | DB-04 (colonne di `eventi_esterni` per `anon`), DB-06 (revoca `TRUNCATE` ad `anon`/`authenticated`), DB-07 (prefissi `tessere/` e `biblioteca/` fuori dalle policy degli editori), PRIV-06 (`pulizia_conservazione()` + cron 3:30), DB-05 (quattro cron riportati in migrazione; runbook `docs/DB-05_riparazione_migrazioni_2026-09-15.md`), SIC-17 (`assemblea-convoca` e `libro-sociale-file` nel repository) | 5 migrazioni applicate, versioni `20260915142252` … `20260915142339` |

Tutte le 16 edge toccate sono state rilette dal vivo e confrontate con il
file locale: identiche, salvo `articolo-azione` (Trappola 18). `verify_jwt`
live controllato contro `config.toml` per tutte e sedici: allineate.

**App `elbrenz-community`** (`6c51839` sul ramo, NON deployato): lotto
prestazioni dopo la segnalazione di lentezza in comunita' e videolezioni.
Indice del corso senza i testi delle lezioni e cache di tre minuti
(`corsoConIndice`), pagina della lezione da cinque viaggi in fila a due,
letture del forum in parallelo, avvio con ruolo e 2FA insieme. Build e
lint puliti.

## 2-bis. Ondata 3, chiusa il 16 settembre (solo nel repository)

| Commit | Contenuto |
|---|---|
| `ebf9797` | SEO del Layout e della configurazione: glossario indicizzabile per difetto, un solo predicato per le traduzioni, glossario e storie dichiarati in sitemap, marchio una volta sola nel titolo, description a 155, hreflang non piu' sulle pagine noindex |
| `19aae03` | SEO delle pagine di dettaglio: curatele fuori dagli indici, un solo `<main>` per pagina su 38 pagine, 404 veri al posto dei redirect, dati strutturati di eventi e luoghi, tag della lingua ladina corretto in 46 occorrenze |
| `01478d8` | Prestazioni: 43 copie dello stesso script diventano una, cache di bordo su 26 rotte pubbliche e nessuna personale, service worker con la cache vecchia che ora sparisce davvero, timbro di versione scritto anche da `npx astro build` |
| `8cca3c4` | Trenta pagine dichiaravano un'anteprima social che non esisteva |

Correzioni su lavoro gia' consegnato, fatte lo stesso giorno: `b17408c` (il
consenso dei Guardiani che registrava un rifiuto al posto di un si', gia' in
produzione) e `f90e514` (gate del deploy e Trappola 19 nel CLAUDE.md).

Emerso tirando il filo della rilettura: **il salvataggio settimanale non ha
mai prodotto un backup**, e il promemoria che doveva dirlo e' a sua volta
guasto. Rapporto con le prove: `docs/REPORT_battito_2026-09-16.md`.

**La lista ordinata di cosa fare dall'Air sta in
`docs/DA_FARE_DALL_AIR_2026-09-16.md`.**

## 3. Cosa resta, in ordine

1. **Deploy del sito dall'Air**, ora fino a `8cca3c4` (`versione.json`
   atteso `8cca3c4`), con il gate sull'anon key prima di `netlify deploy`.
   Smoke test: chat di Andreas (librerie da `/vendor/`), logout dopo due
   ricariche di una pagina riservata, iscrizione vera alla newsletter,
   date sulle pagine privacy e cookie policy.
2. **Deploy dell'app** (`netlify deploy --prod` in `elbrenz-community`),
   poi prova da telefono: due lezioni di seguito, ripresa a meta', Comunita'.
3. **Merge su `main`** dell'ondata 2 (Claude lo fa su richiesta, come per
   l'ondata 1).
4. **Runbook DB-05 dall'Air**: `supabase migration repair` per le 68
   certe, poi le A2 verificate il 16/9 (vedi runbook), poi le 193
   `reverted` con calma. Prima: la versione doppia `20260802110000` e i
   `.sql.bak-ondata1` nella cartella migrazioni.
5. **Decisioni di Cristian** (non toccate apposta): SIC-10/13
   (`andreas-chat`, intoccabile), SIC-11 (`andreas-hofer` orfana), SIC-19
   (secondo token amministrativo), SIC-15 (scope Drive `drive.file`),
   XSS-11 (AAL2 obbligatorio negli edge riservati), XSS-12 (cookie
   `__Secure-`), PRIV-03 (SDK PayPal al click), PRIV-07 (minori 14-17),
   LEG-01 (RUNTS), DB-04 residuo (`authenticated` vede ancora le colonne
   riservate), SIC-04 (`completato` ancora ammesso alla cattura), SIC-05
   (marketing riattivabile solo dal link di conferma), SIC-07
   (`forum_post` senza stato pubblico). Tre code piccole:
   `paypal-create-order` e `paypal-webhook` senza `informativa_versione`,
   `send-email` che restituisce ancora i `details` di Resend, commento in
   testa a `newsletter-broadcast` da aggiornare.
6. **Ondata 3** proposta: SEO (20 rilievi) e prestazioni del sito (17),
   solo codice, deploy dopo.

## 4. Trappole imparate

- **Trappola 18** (in `CLAUDE.md`): il deploy via MCP decodifica le
  sequenze `\uXXXX`; `apply_migration` via MCP assegna la propria versione.
- La sessione cloud non deploya il sito (rete chiusa verso Netlify ed
  elbrenz.eu, niente `.env.local`): fa diagnosi, codice, edge via MCP,
  migrazioni via MCP, commit e push. Il sito e l'app si deployano dall'Air.
- Il rate limit dell'API puo' spegnere i sottoagenti a meta' lavoro: il
  lavoro sul disco sopravvive, il rapporto no. Si riparte dal `git status`.
- Prima di misurare la lentezza di un'app si guardano i numeri: le storie
  erano 8 e i post 3. Il peso vero era altrove (i testi di 23 lezioni
  scaricati per un elenco di titoli, e i viaggi verso il gateway in fila).

## 2-ter. Robustezza, 17 settembre (database gia' in produzione)

Non un'ondata dell'audit: il seguito del rapporto sul battito. Quattro
commit.

| Commit | Contenuto | Stato in produzione |
|---|---|---|
| `72d29f7` | `cruscotto-digest` non muore piu' per una chiamata esterna lenta: tetto di 5 secondi sulla lettura di `/versione.json`, di 8 sull'invio Telegram, e il battito dice se il messaggio e' partito | edge deployata v7, verificata, provata dal vivo |
| `0550968` | l'esito `giro_a_vuoto`, `v_servizi_stato` che legge due date invece di una, i sette lanciatori SQL che annotano quando sospendono | migrazione `20260917073434` applicata; `solleciti-quota` deployata v7 e verificata; tre edge solo nel repository |
| `a41d40d` | `pulizia_conservazione()` con una sottotransazione per blocco, e il suo battito | migrazione `20260917074356` applicata e provata |
| `615763a` | `battito_lanciatore` era chiamabile da `anon`: chiusa | migrazione `20260917074702` applicata e verificata |

Effetto letto sul cruscotto: gli allarmi passano da cinque a quattro, e i
quattro rimasti dicono la verita'. `coda-ascolto-promemoria` era sano e
inoperoso, non morto. `solleciti-quota` «gira a vuoto da 20 giorni», e
resta in allarme perche' c'e' davvero una persona che aspetta.

Lezione da mettere via, costata un difetto introdotto e corretto in
giornata: **una revoca non e' fatta finche' non la si e' letta.** In questo
progetto un `ALTER DEFAULT PRIVILEGES` concede EXECUTE ad `anon` e
`authenticated` su ogni funzione nuova dello schema `public`: togliere
PUBLIC non basta, vanno nominati tutti e tre, e poi si controlla con
`has_function_privilege`.

Trovato di passaggio e **non toccato**, perche' e' una decisione: REPO-01
ha un residuo che l'audit non aveva elencato, nomi di soci privati legati
al pagamento della quota nei commenti di due edge function e di sei
migrazioni. Elenco completo dei file in `docs/DA_FARE_DALL_AIR_2026-09-16.md`,
sezione 7.

## 5. Stato di chiusura

Repository `noslab-elbrenz`: ramo `claude/happy-cori-0d7d75` a `615763a`,
tutto pushato, working tree pulito. Produzione: database all'ondata 2 piu'
le tre migrazioni del 17 settembre; edge all'ondata 2 piu' `cruscotto-digest`
v7 e `solleciti-quota` v7; **sito ancora all'ondata 1** (`7dde5fd`, letto
oggi da `/versione.json`). Repository `elbrenz-community`: ramo a `6c51839`,
pushato, non deployato.
