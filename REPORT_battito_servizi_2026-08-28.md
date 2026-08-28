# Report · Il battito dei servizi — 28/8/2026

## Cosa è stato fatto

Ognuno degli otto servizi del registro (`servizio`) scrive ora un battito con `registra_battito()` come ultima operazione prima di rispondere, con esito `ok` / `errore` / `niente_da_fare` e un dettaglio numerico (mai nomi, mai email). Sette sono edge function TypeScript; l'ottavo, `sentinella-pagine`, non è un'edge function come il brief presupponeva ma una funzione PL/pgSQL invocata direttamente da `pg_cron` — verificato con `select command from cron.job where jobname ilike '%sentinella%'` prima di scrivere codice, per non forzare un file TypeScript inesistente. È stato quindi instrumentato con una migrazione SQL, non con un file `index.ts`.

`cruscotto_servizi()` (già a database dal 28/8) falliva sotto client service-role — stesso guasto già visto e corretto nel brief precedente su `cruscotto_lavori()`: `auth.uid()` è `null` in quel contesto. Allargato il gate ad accettare anche `auth.role() = 'service_role'`, senza toglierlo per gli utenti normali.

La pagina `/cruscotto` mostra il nuovo blocco sopra "Lavori pianificati": il segnaposto di `cruscotto_funzioni()` è sparito dal markup e dallo script, sostituito da `cruscotto_servizi()`. La funzione vecchia resta a database, come richiesto dal §6, semplicemente non più chiamata da qui. `cruscotto-digest` include ora i servizi in allarme, renderizzati prima delle code nel messaggio Telegram.

**Non è stato toccato**: le tabelle/vista/funzioni del §2 (solo lette e chiamate), le altre 61 funzioni fuori registro, PWA soci/Andreas/forum/notifiche, `cruscotto_funzioni()` a database.

**Osservazione fuori perimetro, non corretta** (il brief non la chiede e toccarla avrebbe superato il perimetro): `solleciti-domande` non ha alcun lavoro `pg_cron` né funzione `lancia_*` che la invochi, a differenza di quanto dice il commento in testa al suo stesso file ("Schedulata (pg_cron)"). Il servizio è registrato e il battito funziona (verificato invocandolo a mano), ma **in produzione oggi nessuno la chiama da sola**: il suo battito comparirà "mai battuto" finché qualcuno non le dà una pianificazione reale o corregge il commento. Segnalato, non risolto.

## Le dieci verifiche, una per una

1. **Sì.** Le otto funzioni sono state invocate a mano (via `net.http_post` con il token dal Vault, o direttamente per `sentinella-pagine`): `select count(distinct servizio) from servizio_battito` → 8, elenco confermato: `coda-ascolto-promemoria, cruscotto-digest, guardiani-digest, radar-eventi-classifica, radar-eventi-harvest, sentinella-pagine, solleciti-domande, solleciti-quota`.
2. **Sì.** Revocato temporaneamente `execute` su `cruscotto_servizi()` a `service_role`, invocato `cruscotto-digest?esegui=1`: risposta HTTP 500 con `{"ok":false,"error":"permission denied for function cruscotto_servizi"}` (il suo errore normale, non alterato), e `servizio_battito` ha registrato `esito:'errore', dettaglio:{"errore":"permission denied for function cruscotto_servizi"}`. Grant ripristinato subito dopo.
3. **Sì.** Revocato temporaneamente `execute` su `registra_battito(text,text,jsonb)` a `service_role` (confermato con `has_function_privilege` → false), invocato `solleciti-domande`: risposta HTTP 200 normale (`{"ok":true,"dryrun":false,"sollecitate":0,...}`), il lavoro vero non si è accorto del battito bloccato. Grant ripristinato e riverificato (`has_function_privilege` → true).
4. **Sì.** Impersonando ruolo 99 (`info@elbrenz.eu`): `cruscotto_servizi()` → 8 righe, tutte `diagnosi:'sano'`, `in_allarme:false`. (La prima lettura, subito dopo la verifica 1, mostrava un allarme: era `cruscotto-digest` stesso, il cui ultimo battito era l'`errore` scritto apposta dalla verifica 2. Reinvocato `cruscotto-digest` una volta in più per lasciare la storia coerente con la realtà, poi riletto: 8 sani.)
5. **Sì.** Impersonando ruolo 25: `cruscotto_servizi()` solleva "Il cruscotto e riservato al direttivo".
6. **Sì.** Impersonando `anon`: sia `select count(*) from servizio` sia `select count(*) from servizio_battito` rispondono "permission denied", non un elenco vuoto.
7. **Sì**, verificato dal vivo su `https://elbrenz.eu/cruscotto/`: il markup contiene `<div id="cru-servizi">` seguito da `<h3>Lavori pianificati</h3>` e `<div id="cru-lavori">`; nessuna occorrenza di `cru-funzioni` nella pagina; il testo "Ogni servizio programmato dichiara di aver girato e come è andata…" è presente sopra il blocco.
8. **Sì, verificato con un invio reale**, non solo per costruzione del codice. Prima chiamata a `lancia_cruscotto_digest(true)`: nessun servizio in allarme in quel momento, messaggio inviato comunque (`inviato:true`, coerente con "parte anche a zero allarmi" — qui a zero *servizi* in allarme, con code/lavori sì in allarme). Per provare l'ordinamento con dati reali: scritto un battito `errore` di prova su `sentinella-pagine`, richiamato il digest → risposta con `"servizi":[{"servizio":"sentinella-pagine","diagnosi":"ultimo esito in errore"}]` seguito da `"code":[...]`, nello stesso ordine in cui `notificaDirettivo.ts` compone il testo (servizi, poi code, poi lavori — righe consecutive nello stesso messaggio). Il battito di prova non è stato lasciato: `sentinella-pagine` è stata rilanciata subito dopo per il suo giro vero, tornando `sano` (riverificato con `cruscotto_servizi()`: 8 su 8 sani).
9. **Sì.** `git status` mostra solo i file elencati sotto: nessuna riga toccata in `Header.astro`, footer o altre pagine.
10. **Sì.** `git log origin/main --oneline` mostra `f49dce5` come commit più recente. Tutte le verifiche 1-6 sono state ripetute sul progetto Supabase di produzione (non c'è un ambiente locale separato); la 7 e la 8 sono state ripetute contro `https://elbrenz.eu` dopo `netlify deploy --prod --build` (deploy riuscito al primo tentativo, nessun flake).

## Le otto funzioni modificate, con il nome del servizio usato

| Funzione | Tipo | `p_servizio` |
|---|---|---|
| `radar-eventi-harvest` | edge function | `radar-eventi-harvest` |
| `radar-eventi-classifica` | edge function | `radar-eventi-classifica` |
| `guardiani-digest` | edge function | `guardiani-digest` |
| `solleciti-domande` | edge function | `solleciti-domande` |
| `solleciti-quota` | edge function | `solleciti-quota` |
| `coda-ascolto-promemoria` | edge function | `coda-ascolto-promemoria` |
| `cruscotto-digest` | edge function | `cruscotto-digest` |
| `public.sentinella_pagine()` | funzione SQL (pg_cron) | `sentinella-pagine` |

## Commit verificati su `origin/main`

- **`f49dce5`** — *servizi: il battito dei servizi pianificati, sostituisce cruscotto_funzioni()* — 11 file: le otto funzioni sopra, `_shared/notificaDirettivo.ts`, `src/pages/cruscotto.astro`, e due migrazioni (`20260828032206_battito_cruscotto_servizi_service_role.sql`, `20260828032401_battito_sentinella_pagine.sql`).

Verificato con `git log origin/main --oneline` dopo il push (autenticato come `associazioneelbrenz-ai`).
