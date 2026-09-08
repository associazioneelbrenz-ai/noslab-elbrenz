# REPORT · Caricamento video su Bunny Stream, Lotto A lato server (8/9/2026)

Brief: `docs/briefs/BRIEF_CODE_caricamento_video_bunny.md`. Eseguite le sezioni 4, 5, 6 e 8
(solo `config.toml` e deploy). La sezione 7 (PWA) e i test di accettazione della sezione 8
si fanno in una sessione separata nel repo `elbrenz-community`: **il Lotto A non e' chiuso**
(regola 5: deployed non vuol dire tested).

## File e commit su `noslab-elbrenz`

| commit | contenuto |
|---|---|
| a2f6ae5 | `docs/briefs/BRIEF_CODE_caricamento_video_bunny.md` (brief, primo commit) |
| 60186ad | `supabase/migrations/20260908141209_video_caricamento_ledger.sql` |
| 5835ba6 | `supabase/functions/corso-video-crea/index.ts`, `supabase/functions/corso-video-stato/index.ts`, `supabase/config.toml`, `docs/ops/edge_functions_pre_deploy_2026-09-08.md` |

Nessuna funzione esistente e' stata toccata: `corso-video-libreria` e `lezione-firma-video` sono identiche.

## Migrazione

Applicata via MCP `apply_migration` alle 16:0x CEST dell'8/9/2026 (il CLI `supabase migration list`
non raggiungeva il database da questa macchina: timeout verso l'API di login role). Registrata sul
remoto come `20260908141209_video_caricamento_ledger`; il file nel repo e' stato rinominato con la
stessa versione, cosi' un futuro `supabase db push` non prova a riapplicarla.

Verifiche con query separate:

| query | esito |
|---|---|
| `select count(*) from public.video_caricamento;` | 0, nessun errore |
| `select relrowsecurity from pg_class where relname='video_caricamento';` | `true` |
| grant su `video_caricamento` | solo `postgres` e `service_role`; nessuno per `anon`/`authenticated` |
| policy su `video_caricamento` | nessuna (voluto) |
| indici | `video_caricamento_pkey`, `video_caricamento_lezione_idx`, `video_caricamento_bunny_idx` (unique) |

Fatti confermati prima di scrivere il codice: `lezione.updated_at` esiste; la policy
`lezione_write_collab` (ALL, `has_ruolo_min(uid, 25)`) e' gia' in vigore, quindi la `update` con la
sessione del chiamante decide da sola.

## Deploy e flag `verify_jwt`

Deploy dal repo con `supabase functions deploy corso-video-crea` e `... corso-video-stato`
(CLI 2.98.1, Docker spento: bundle fatto lato Supabase). Entrambe `ACTIVE`, versione 1,
`verify_jwt: true`.

Confronto con lo snapshot pre-deploy (`docs/ops/edge_functions_pre_deploy_2026-09-08.md`):
le 72 funzioni preesistenti hanno lo stesso `verify_jwt` e la stessa `version` di prima.
Nessun flag cambiato. (Il brief parla di 69 funzioni: sul progetto ne risultano 72.)

Test dal vivo sul gateway, 8/9/2026 16:13 CEST, `curl` da macOS:

| chiamata | atteso | esito |
|---|---|---|
| POST `corso-video-crea` senza Authorization | 401 dal gateway | 401 `UNAUTHORIZED_NO_AUTH_HEADER` |
| POST `corso-video-stato` senza Authorization | 401 dal gateway | 401 `UNAUTHORIZED_NO_AUTH_HEADER` |
| OPTIONS su entrambe con `origin: community.elbrenz.eu` | 200 | 200 |

Non e' stato possibile fare in locale il controllo dei tipi (Deno non installato): il bundle
remoto ha accettato entrambe le funzioni, ma il primo giro con un JWT vero e' parte dei test
della sezione 8, ancora da fare.

## Scelte dove il brief lasciava margine

- `corso-video-stato` restituisce anche `stato_caricamento` (stato della riga nel registro, o
  `null`): e' l'unico modo in cui la UI puo' distinguere "caricamento non completato" (status 0
  + registro `creato`/`in_caricamento`) da un video preso dall'elenco, visto che la tabella non
  ha policy di lettura per il client.
- `corso-video-crea`: `byte` non intero o non positivo risponde 400 `dimensione_non_valida`
  (il brief nominava solo `file_troppo_grande`).
- Nel caso "riprendi" il registro passa a `in_caricamento` con `aggiornato_il` aggiornato.
- Se l'insert nel registro fallisce dopo l'update della lezione, la lezione viene riportata a
  `video_bunny_id = null` e la risposta e' 500 `registro_non_scritto`: una lezione "collegata" a
  un video che nessuno puo' riprendere sarebbe il 401 di oggi sotto un'altra forma.
- Evento `caricato` non regredisce una riga gia' `pronto` o `errore`; `annullato` non tocca una
  riga `pronto`.
- `durata_min` = `max(1, round(length/60))`: con `round` secco un video sotto i 30 secondi
  darebbe 0.
- Nello stato "in corso" il registro aggiorna solo `stato_bunny`.
- Le cartelle `docs/briefs` e `docs/ops` non esistevano in questo repo: create.

## Cosa resta

- Sessione separata in `elbrenz-community`: sezione 7 (modulo `bunnyUpload.ts`, pannello lezione,
  `tus-js-client`), build, ZIP per Netlify.
- A Cristian: deploy Netlify della PWA.
- Test di accettazione 1-8 della sezione 8, in browser reale desktop e iPhone, dopo il deploy.
- Lotti B, C, D: non iniziati.

Nessuna chiave, firma o URL con credenziali in questo report ne' nei log delle funzioni
(le funzioni loggano solo codici e status HTTP).
