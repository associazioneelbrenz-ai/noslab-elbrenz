# Report · Censimento delle funzioni e chiusura degli orfani — 28/8/2026

## Il numero di orfane: quattro, non zero

**Non è il risultato migliore possibile, e va detto con la stessa precisione di uno cattivo.** Le quattro:

1. **`andreas-hofer`** — assistente AI completo (RAG, rate limit per ruolo, JWT), mai collegato a nessuna pagina. La scoperta più seria del censimento: era già stata segnalata "fuori perimetro" in `docs/HANDOFF_2026-07-06.md` il 6 luglio 2026 — **53 giorni fa** — e non è mai stata risolta né ritirata. Non una scoperta nuova: una scoperta già fatta e poi dimenticata.
2. **`solleciti-integrazione`** — dichiarata "DORMIENTE" da un flag applicativo (`SOLLECITI_LIVE`), ma non ha nemmeno un lavoro pg_cron che potrebbe risvegliarla: anche attivando il flag, oggi non la chiamerebbe nessuno.
3. **`newsletter-unsubscribe`** — sostituita nei fatti da `newsletter-gestione/disiscrizione`. La pagina che nel proprio commento dichiara di chiamarla in realtà, alla riga che conta, costruisce l'URL verso l'altra funzione. Il commento è rimasto, il comportamento è cambiato.
4. **`solleciti-domande`** — già nota dal brief precedente, confermata orfana anche in questo giro.

Una correzione di fatto sulla quinta voce già nota (non una nuova orfana, una correzione): **`solleciti-domande` non manda email a persone reali**, come la premessa del brief sostiene. Letto il codice: notifica il gruppo Telegram del direttivo con un messaggio aggregato, mai un socio o un richiedente. La scheda di lettura completa è nel censimento.

## Altre due scoperte fuori dallo schema delle sei classi

- **`invia-push`** non è cron, sito, app, webhook, manuale né orfana: è innescata da un **trigger Postgres** (`notifica_push_ai AFTER INSERT ON public.notifica`) che chiama `net.http_post` verso l'edge. Automatica, ma di una specie che il brief non aveva previsto. Non forzata in una casella sbagliata: segnalata per quello che è.
- I lanciatori SQL `lancia_radar_eventi()` e `lancia_radar_classifica()` (chiamati dai cron di `radar-eventi-harvest`/`radar-eventi-classifica`) esistono live a database ma **nessuna migrazione li traccia in questo repository**. Stesso difetto di fondo del censimento — codice che gira senza essere scritto da nessuna parte — su una scala diversa (un lanciatore SQL, non un'edge function).
- Cinque funzioni deployate (`assemblea-convoca`, `libro-sociale-file`, `glossario-audio-migrazione`, `pulizia-ricevute-prova`, `upload-temp-og-cimiteri`) **non hanno alcun sorgente in nessuno dei due repository**: recuperate con `get_edge_function` solo per poterle classificare. Le prime due sono vive e chiamate dalla PWA; le ultime tre sono strumenti una tantum già eseguiti e disattivati.
- `wp-import` ha sorgente locale ed è dichiarata in `config.toml`, ma **non è deployata** (`get_edge_function` → "Function not found"): codice morto che punta a una funzione che non esiste più.

## Le undici verifiche, una per una

1. **No, con spiegazione.** Il censimento ha **70 righe, non 69**. Le funzioni deployate attive contate sono settanta — verificato due volte con metodi indipendenti (lista MCP e conteggio programmatico dei suoi elementi) proprio per escludere un mio errore, non quello del brief. Nessuna esclusa: tutte e settanta sono in tabella. Il brief chiedeva 69 righe "una per funzione deployata, nessuna esclusa" — le due condizioni sono in conflitto quando le funzioni deployate sono 70; ho seguito "nessuna esclusa", coerente con la regola 0 del brief stesso ("non dedurre: guardare").
2. **Sì.** Ogni riga classificata `sito`, `app` o `webhook` porta il file e la riga (per `paypal-webhook`, un webhook esterno per definizione non ha un file-chiamante nel repository: la riga porta invece la prova strutturale — verifica firma con `PAYPAL_WEBHOOK_ID` nel proprio codice).
3. **Sì.** Ogni riga `manuale` porta una motivazione scritta, quasi sempre tratta parola per parola dall'intestazione della funzione stessa.
4. **Sì.** Tre funzioni non dichiarate trovate: `glossario-audio-migrazione`, `pulizia-ricevute-prova`, `upload-temp-og-cimiteri`. Tutte e tre dichiarate oggi in `supabase/config.toml` con `verify_jwt = false`, verificato identico al valore dal vivo prima e dopo la modifica (`get_edge_function`, invariato: stesso `updated_at`, nessun redeploy avvenuto).
5. **Sì.** Il conteggio delle funzioni deployate resta 70 prima e dopo: nessuna cancellata.
6. **Sì.** I sedici lavori pg_cron del punto 3 sono stati solo letti (verificato di nuovo alla fine: `select count(*) from cron.job` → 16), mai modificati.
7. **Sì.** `select command from cron.job where jobname = 'solleciti-quota-giornaliero'` → ancora `select public.lancia_solleciti_quota(p_esegui => false)`.
8. **Sì.** La scheda di lettura di `solleciti-domande` (nel censimento) risponde a tutte e cinque le domande del §5: a chi scrive (il direttivo via Telegram, non i richiedenti — correzione rispetto alla premessa del brief), il criterio (`in_attesa` oltre 48h, non risollecitata nelle ultime 24h), la cadenza pensata (giornaliera, oggi non schedulata da nulla), quante persone colpirebbe oggi (zero, verificato con un'invocazione reale nel brief precedente), e la modalità a vuoto (`?dryrun=1`, esistente).
9. **Sì.** Trappola 15 aggiunta a `CLAUDE.md`, subito dopo Trappola 14, con la regola del punto 6 del brief riportata testualmente.
10. **Sì.** Nessun file di runtime toccato: solo `supabase/config.toml`, `CLAUDE.md`, e i due documenti di questo censimento. Nessun deploy necessario, nessun cambiamento di comportamento del sito o dell'app.
11. Vedi sotto.

## Commit verificati su `origin/main`

- **`0625eef`** — *censimento: settanta funzioni, non sessantanove, quattro orfane trovate* — 3 file: `CLAUDE.md`, `supabase/config.toml`, `CENSIMENTO_FUNZIONI_2026-08-28.md`.

Verificato con `git log origin/main --oneline` dopo il push (autenticato come `associazioneelbrenz-ai`):

```
0625eef censimento: settanta funzioni, non sessantanove, quattro orfane trovate
8c4291b report: battito dei servizi, dieci verifiche una per una
f49dce5 servizi: il battito dei servizi pianificati, sostituisce cruscotto_funzioni()
```

Nessun deploy Netlify eseguito: nessun file che il sito o l'app servono agli utenti è stato toccato.
