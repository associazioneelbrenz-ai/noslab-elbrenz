# BRIEF CODE · Caricamento video su Bunny Stream dalla PWA soci

Data: 7 settembre 2026. Autore: Claude (chat) su richiesta di Cristian Bresadola.
Repository coinvolti: `noslab-elbrenz` (edge function in `supabase/functions/`, `supabase/config.toml`) e `elbrenz-community` (PWA React 19 + Vite).
Supabase: progetto `wacknihvdjxltiqvxtqr` (EU). Bunny Stream: libreria `735664` ("El Brenz - Corsi"), pull zone `vz-f538a971-7be`.

## 0. Perché e cosa cambia per chi usa la app

Oggi la redazione dei corsi collega un video a una lezione solo scegliendolo da un elenco (`corso-video-libreria`) di video già caricati a mano sulla dashboard Bunny. Non esiste nessuna funzione che riceva un file video. Obiettivo: dal pannello della lezione, accanto a "Scegli il video", un pulsante **"Carica un video"** che porta il file dal telefono o dal computer alla libreria Bunny, mostra l'avanzamento, riprende da solo se cade la rete, collega il video alla lezione e segnala quando Bunny ha finito l'elaborazione.

La chiave API di Bunny non deve mai arrivare al browser. Il file non passa da Supabase: va direttamente a Bunny con una firma temporanea generata da una edge function.

## 1. Regole ferme (valgono su tutto il brief)

1. **Additività.** Nessuna funzione esistente viene modificata nel Lotto A. `corso-video-libreria` e `lezione-firma-video` restano identiche. Se nel Lotto C serve toccare `corso-video-libreria`, prima copia `.bak` e modifica minima con fallback (vedi Lotto C).
2. **Segreti.** `BUNNY_API_KEY` resta solo nei Segreti Supabase (aggiornata e verificata il 7/9/2026, la funzione libreria risponde 200). Nessuna chiave, firma con chiave, o URL con credenziali nei log, negli errori, nelle risposte al client. L'unica cosa che il client riceve è la firma TUS (SHA256 esadecimale) con la sua scadenza: è progettata per essere data al client.
3. **Autorizzazione.** Stessa soglia di `corso-video-libreria`: livello massimo dell'utente in `utente_ruolo` ≥ 25 (collaboratore). La lezione si legge e si aggiorna **con la sessione del chiamante** (client `asUser`, anon key + suo JWT), così è la RLS già in vigore a decidere, non una regola riscritta. Il client `admin` (service role) serve solo per `config_app` e per il ledger.
4. **`config.toml`** deve dichiarare `verify_jwt` per ogni nuova funzione. Un redeploy batch può riabilitare `verify_jwt=true` in silenzio: dopo il deploy, verifica dal dashboard che i flag siano quelli scritti qui.
5. **Deployed ≠ tested.** Nessun lotto è chiuso finché i test della sezione 8 non sono passati **cliccando** in un browser reale, desktop e iPhone. Il report riporta gli esiti misurati, non le intenzioni.
6. **Git è la fonte di verità.** Funzioni deployate solo dal repo (`supabase functions deploy <nome>`), mai dal dashboard. Prima del push: `gh auth switch -u associazioneelbrenz-ai && gh auth setup-git`. Dopo il push: `git log origin/main --oneline` per vedere il commit davvero su origin.
7. **Deploy Netlify della PWA** lo fa Cristian; tu prepari build e istruzioni.
8. Niente em-dash nei testi UI.

## 2. Fatti verificati (non da riverificare, da usare)

**Schema `lezione`** (colonne rilevanti, tutte esistenti): `id uuid`, `modulo_id`, `corso_id`, `titolo`, `slug`, `video_bunny_id text`, `video_url text`, `video_url_originale text`, `durata_min integer`, `immagine_url text`, `pubblicata boolean`, `livello_accesso text`.

**`config_app` chiave `bunny_stream`** (jsonb): `library_id: "735664"`, `cdn_hostname: "vz-f538a971-7be.b-cdn.net"`, `embed_base: "https://iframe.mediadelivery.net/embed"`, `token_attivo: true`, `token_durata_secondi: 7200`.

**Segreti già presenti:** `BUNNY_API_KEY` (chiave API della libreria, scheda API di Bunny, 41 caratteri, verificata 200 il 7/9), `BUNNY_TOKEN_KEY` (chiave di firma degli embed, sezione Security).

**Pattern da copiare** dalle funzioni esistenti: `ALLOWED_ORIGINS`, `corsFor()`, helper `J()`, `sha256Hex()`, lettura utente via `asUser.auth.getUser()`, controllo livello via `utente_ruolo` → `ruolo:ruolo_id(livello)`.

**API Bunny Stream** (base `https://video.bunnycdn.com`, header `AccessKey: <BUNNY_API_KEY>`):
- Crea video: `POST /library/{libraryId}/videos` con body JSON `{"title": "..."}` (opzionali `collectionId`, `thumbnailTime`). Risposta: oggetto video con `guid`.
- Leggi video: `GET /library/{libraryId}/videos/{videoId}`. Campi utili: `status`, `length` (secondi), `encodeProgress`, `thumbnailFileName`, `availableResolutions`, `storageSize`.
- Elimina video: `DELETE /library/{libraryId}/videos/{videoId}` (solo Lotto D, non ora).

**Enumerazione `status` dell'API** (quella che `corso-video-libreria` già usa con `STATO_PRONTO = 4`):
`0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished · 5 Error · 6 UploadFailed · 7 JitSegmenting · 8 JitPlaylistsCreated`

**Enumerazione `Status` del webhook** (DIVERSA, solo Lotto B):
`0 Queued · 1 Processing · 2 Encoding · 3 Finished · 4 ResolutionFinished · 5 Failed · 6 PresignedUploadStarted · 7 PresignedUploadFinished · 8 PresignedUploadFailed · 9 CaptionsGenerated · 10 TitleOrDescriptionGenerated`

Non mescolarle. Nel codice usa due costanti con nomi diversi (`STATO_API_*`, `STATO_WEBHOOK_*`) e un commento che rimanda a questa sezione.

**TUS presigned** (documentazione Bunny "TUS Resumable Uploads"):
- Endpoint: `https://video.bunnycdn.com/tusupload`
- Header obbligatori sulla richiesta TUS: `AuthorizationSignature`, `AuthorizationExpire` (unix seconds), `LibraryId`, `VideoId`
- Firma: `sha256_hex(library_id + api_key + expiration_time + video_id)`, concatenazione di stringhe senza separatori, calcolata **sul server**
- Metadata TUS: `filetype` (MIME, obbligatorio), `title` (obbligatorio), `collection` (opzionale), `thumbnailTime` (ms, opzionale)
- Scadenza consigliata dalla documentazione: almeno 3600 s. Qui: **24 ore** (`86400`), la firma vale solo per quel `video_id`
- Un 401 dal TUS significa: scadenza passata, firma calcolata su valori diversi da quelli inviati, o header `LibraryId`/`VideoId` mancante. I valori firmati sul server devono coincidere byte per byte con gli header inviati dal client
- Ripresa: `upload.findPreviousUploads()` → `resumeFromPreviousUpload(prev[0])` → `start()`. `tus-js-client` salva le impronte in `localStorage` (siamo nella PWA su Netlify, va bene)

## 3. Architettura del Lotto A

```
[PWA, pannello lezione]
  1. utente sceglie file  →  2. POST corso-video-crea {lezione_id, titolo, mime, byte}
                                   ↓ (server: RLS su lezione, livello ≥25, crea video su Bunny,
                                      scrive lezione.video_bunny_id, inserisce ledger, firma)
                              ← {video_id, library_id, firma, scadenza, endpoint}
  3. tus-js-client carica il file direttamente su https://video.bunnycdn.com/tusupload
     (progress, pausa, ripresa automatica)
  4. onSuccess → POST corso-video-stato {lezione_id} ogni 15 s finché status ∈ {4, 5, 6}
                                   ↓ (server: RLS su lezione, GET video su Bunny)
                              ← {status, pronto, in_errore, encode_progress, length, thumbnail}
  5. quando pronto: se lezione.durata_min è vuoto lo compila; UI mostra "Video pronto"
```

Il video viene collegato alla lezione **al momento della creazione** (passo 2), non alla fine del caricamento. Motivo: se l'utente chiude la app a metà, riaprendo la lezione trova "caricamento incompleto" con i pulsanti Riprendi e Scollega, e la ripresa TUS funziona perché il `video_id` è noto. Il costo è un oggetto vuoto su Bunny se l'utente abbandona: lo gestisce il Lotto D, non ora.

## 4. Lotto A · Database (migrazione, additiva)

Nome file: `supabase/migrations/<timestamp>_video_caricamento_ledger.sql`. Applicare con `Supabase:apply_migration` o `supabase db push` dal repo, mai a mano nel dashboard.

```sql
-- Registro dei caricamenti video verso Bunny Stream avviati dalla app.
-- Serve a: riprendere caricamenti interrotti, sapere chi ha caricato cosa,
-- ripulire gli oggetti video mai completati (Lotto D).
create table if not exists public.video_caricamento (
  id               uuid primary key default gen_random_uuid(),
  lezione_id       uuid not null references public.lezione(id) on delete cascade,
  video_bunny_id   text not null,
  titolo           text not null,
  mime             text,
  byte_dichiarati  bigint,
  stato            text not null default 'creato'
                   check (stato in ('creato','in_caricamento','caricato','pronto','errore','annullato')),
  stato_bunny      integer,                 -- ultimo status API letto (enumerazione API, non webhook)
  creato_da        uuid references auth.users(id),
  creato_il        timestamptz not null default now(),
  aggiornato_il    timestamptz not null default now()
);
create index if not exists video_caricamento_lezione_idx on public.video_caricamento(lezione_id);
create unique index if not exists video_caricamento_bunny_idx on public.video_caricamento(video_bunny_id);

alter table public.video_caricamento enable row level security;
-- Nessuna policy per anon/authenticated: la tabella si scrive e si legge solo dalle
-- edge function con service role. Se in futuro la UI deve leggerla, si aggiunge una
-- policy select per livello >= 25, non si apre in lettura a tutti.
revoke all on public.video_caricamento from anon, authenticated;
```

Verifica dopo la migrazione (query separata, non fidarsi del `RETURNING`): `select count(*) from public.video_caricamento;` deve rispondere 0 senza errore, e `select relrowsecurity from pg_class where relname='video_caricamento';` deve dare `true`.

## 5. Lotto A · Edge function `corso-video-crea`

Percorso: `supabase/functions/corso-video-crea/index.ts`. `verify_jwt = true`.

**Input** (POST JSON): `{ lezione_id: uuid, titolo: string, mime: string, byte: number }`.

**Passi, in ordine:**
1. CORS e metodo come nelle funzioni sorelle.
2. Token dall'header → `asUser.auth.getUser()`; se manca o non valido → 401.
3. Livello utente da `utente_ruolo` (client admin) → se < 25 → 403 `non_autorizzato`.
4. Validazioni input: `lezione_id` formato uuid; `titolo` trim 1..200 caratteri; `mime` che inizia per `video/`; `byte` intero positivo, limite superiore configurabile `MAX_BYTE = 8 * 1024^3` (8 GB, valore iniziale, da aggiustare dopo il primo mese) → altrimenti 400 con codice specifico (`titolo_non_valido`, `tipo_file_non_valido`, `file_troppo_grande`).
5. Lettura lezione **con `asUser`**: `select id, titolo, video_bunny_id from lezione where id = :lezione_id`. Se non torna una riga → 403 (è la RLS che ha detto no, come in `lezione-firma-video`).
6. Se `video_bunny_id` è già presente: leggere il ledger per quel video. Se esiste una riga con stato `creato` o `in_caricamento`, **riusa** quel `video_id` e restituisce una nuova firma (è il caso "riprendi"). Altrimenti (video già pronto o preso dall'elenco) → 409 `video_gia_collegato` con `detail` che spiega di scollegare prima: sovrascrivere in silenzio un video pubblicato non è accettabile.
7. `config_app.bunny_stream` (client admin) → `library_id`; se manca → 500 `configurazione_mancante`.
8. `BUNNY_API_KEY` da `Deno.env`; se manca → 500 `chiave_api_mancante` con lo stesso `detail` usato da `corso-video-libreria`.
9. `POST https://video.bunnycdn.com/library/{library_id}/videos` con `{ title }`. Se non ok → 502 `bunny_errore` con `detail: "HTTP <status>"`, e `console.error("[corso-video-crea] Bunny ha risposto", status)`. Estrarre `guid`.
10. Scrittura in transazione logica (due statement con verifica):
    - `update lezione set video_bunny_id = :guid, updated_at = now() where id = :lezione_id` **con `asUser`** (la RLS di scrittura decide). Se la update non tocca una riga → il video su Bunny è orfano: loggare `[corso-video-crea] update lezione negato per <lezione_id>` (senza altri dati) e rispondere 403.
    - `insert into video_caricamento (...) values (..., stato 'creato', creato_da user.id)` con client admin.
    - Rileggere `lezione.video_bunny_id` con `asUser` e confermare che è il `guid`: se no → 500 `scrittura_non_confermata`.
11. Firma: `expire = floor(now/1000) + 86400`; `firma = sha256Hex(library_id + api_key + String(expire) + guid)`. Attenzione: `library_id` è la stringa `"735664"` come in `config_app`, `expire` va concatenato come stringa decimale senza spazi.
12. Risposta 200:
```json
{ "ok": true, "video_id": "<guid>", "library_id": "735664",
  "firma": "<64 hex>", "scadenza": 1757400000,
  "endpoint": "https://video.bunnycdn.com/tusupload",
  "ripresa": false }
```
`ripresa: true` nel caso del passo 6.

Non loggare mai `firma`, `api_key`, il body della risposta di Bunny. Loggare solo codici.

## 6. Lotto A · Edge function `corso-video-stato`

Percorso: `supabase/functions/corso-video-stato/index.ts`. `verify_jwt = true`.

**Input**: `{ lezione_id: uuid, evento?: "caricato" | "annullato" }`.

**Passi:**
1. CORS, token, utente, livello ≥ 25 come sopra.
2. Lezione con `asUser`: `select id, video_bunny_id, durata_min`. Nessuna riga → 403. `video_bunny_id` nullo → 404 `video_non_collegato`.
3. Se `evento` è presente, aggiornare il ledger (client admin) per quel `video_bunny_id`: `caricato` → stato `caricato`; `annullato` → stato `annullato`. Poi proseguire comunque con la lettura dello stato reale.
4. `GET https://video.bunnycdn.com/library/{library_id}/videos/{video_bunny_id}` con `AccessKey`. Se 404 da Bunny → 200 con `{ ok: true, esiste: false }` (il video è stato cancellato su Bunny: la UI deve offrire Scollega). Altro errore → 502 `bunny_errore`.
5. Mappatura sull'enumerazione API: `pronto = status === 4`; `in_errore = status === 5 || status === 6`; `in_corso` altrimenti.
6. Se `pronto` e `lezione.durata_min` è nullo e `length > 0`: `update lezione set durata_min = round(length/60)` con `asUser` (additivo: solo se vuoto, mai sovrascrivere un valore inserito a mano). Aggiornare il ledger a `pronto` con `stato_bunny`.
7. Se `in_errore`: ledger a `errore`.
8. Risposta:
```json
{ "ok": true, "esiste": true, "status": 4, "pronto": true, "in_errore": false,
  "encode_progress": 100, "length_secondi": 485, "risoluzioni": "360p,720p,1080p",
  "titolo": "23 - ..." }
```
Nessuna URL di miniatura in questa risposta finché il Lotto C non è fatto: una URL che dà 403 in UI è peggio di nessuna.

## 7. Lotto A · PWA (`elbrenz-community`)

### Dipendenza
`npm i tus-js-client` (versione corrente 4.x). Nessuna altra libreria.

### Dove
Nel componente del pannello lezione che oggi mostra "Scegli il video" e "Video collegato: <guid>" / "Nessun video collegato". Aggiungere, non sostituire: il pulsante **"Carica un video"** accanto a "Scegli il video". Nessuna modifica al flusso del picker esistente.

### Modulo `src/lib/bunnyUpload.ts` (nuovo)
Espone `avviaCaricamento({ lezioneId, file, titolo, onProgress, onSuccess, onError, onStato })` e `annullaCaricamento()`. Dentro:
1. `POST corso-video-crea` via `supabase.functions.invoke("corso-video-crea", { body })`. Gestire 409 `video_gia_collegato` mostrando il messaggio del server.
2. Costruire `new tus.Upload(file, { endpoint, retryDelays: [0, 3000, 5000, 10000, 20000, 60000, 60000], chunkSize: 50 * 1024 * 1024, headers: { AuthorizationSignature: firma, AuthorizationExpire: String(scadenza), LibraryId: library_id, VideoId: video_id }, metadata: { filetype: file.type || "video/mp4", title: titolo }, onProgress, onSuccess, onError })`.
   `chunkSize` a 50 MB: rende la ripresa granulare su reti mobili. Se Bunny rifiutasse i chunk (errore sul PATCH), portarlo a `Infinity` e scriverlo nel report.
3. Prima di `start()`: `findPreviousUploads()` → se ce n'è una con lo stesso `VideoId` nei metadata, `resumeFromPreviousUpload`.
4. `onError`: se lo status della risposta è 401 → richiedere una nuova firma a `corso-video-crea` con la stessa `lezione_id` (il server riusa il `video_id`, passo 6 della sezione 5), aggiornare gli header e riprendere. Se fallisce due volte di seguito → mostrare errore e fermarsi.
5. `onSuccess`: `POST corso-video-stato { lezione_id, evento: "caricato" }`, poi polling ogni 15 s finché `pronto || in_errore || !esiste`. Fermare il polling quando il componente viene smontato.

### Stati UI (testi pronti, senza em-dash)
- Nessun video: pulsanti **Scegli il video** · **Carica un video**
- Selezione file: `input type="file" accept="video/*"` (su iPhone apre Rullino e file). Dopo la scelta, un campo "Titolo su Bunny" precompilato con `"<numero lezione> - <titolo lezione>"` se il titolo della lezione inizia con un numero, altrimenti con il titolo, modificabile. Mostrare nome file e dimensione in MB. Pulsante **Avvia caricamento**.
- In caricamento: barra con percentuale, MB caricati su MB totali, velocità stimata. Pulsanti **Pausa** / **Riprendi** e **Annulla**. Testo: "Il caricamento riprende da solo se la connessione cade. Puoi chiudere questa pagina: tornando qui potrai riprenderlo."
- Caricato, in elaborazione: "Caricato. Bunny sta elaborando il video (N%)". Nessun pulsante oltre a Scollega. Il picker "Scegli il video" mostrerà lo stesso video come non selezionabile finché non è pronto: coerente.
- Pronto: "Video pronto · durata mm:ss". Se `durata_min` era vuoto è stato compilato dal server.
- Errore Bunny (`in_errore`): "Bunny non è riuscito a elaborare il video. Puoi scollegarlo e ricaricare il file." Pulsante **Scollega** (azzera `video_bunny_id` con la stessa chiamata che il picker usa oggi per collegare; nessuna nuova funzione).
- Caricamento incompleto (all'apertura della lezione: `video_bunny_id` presente, `corso-video-stato` risponde `status` 0 e il ledger è `creato`/`in_caricamento`): "Caricamento non completato." Pulsanti **Riprendi** (richiede firma, riprende TUS) e **Scollega**.
- Video cancellato su Bunny (`esiste: false`): "Il video non esiste più nella libreria Bunny." Pulsante **Scollega**.
- Errori server: mostrare il codice tradotto (`non_autorizzato` → "Non hai i permessi per caricare video", `file_troppo_grande` → "Il file supera il limite di 8 GB", `bunny_errore` → "Bunny ha risposto con un errore (HTTP n). Riprova tra qualche minuto.").

### Cosa NON fare
- Non leggere `video_bunny_id` o `video_url` per costruire URL di riproduzione nel client: la riproduzione resta di `lezione-firma-video`.
- Non usare `localStorage` per altro che l'uso interno di tus-js-client.
- Non aggiungere l'upload alla vetrina pubblica (`corso-vetrina-pubblica`) né a pagine accessibili sotto il livello 25.

## 8. Lotto A · `config.toml`, deploy, test

**`config.toml`** (aggiungere, non riordinare):
```toml
[functions.corso-video-crea]
verify_jwt = true

[functions.corso-video-stato]
verify_jwt = true
```

**Deploy funzioni** dal repo `noslab-elbrenz`: `supabase functions deploy corso-video-crea && supabase functions deploy corso-video-stato`. Poi dal dashboard Edge Functions verificare che entrambe risultino `verify_jwt: true` e che le 69 esistenti non abbiano cambiato flag (confronto con l'elenco pre-deploy, che salvi prima in `docs/ops/`).

**Build PWA**: `npm run build`, produrre lo ZIP per Netlify come da procedura corrente e consegnarlo a Cristian con questo brief. Dopo il suo deploy, i test si fanno sull'URL di produzione `community.elbrenz.eu`, non in locale.

**Test di accettazione** (tutti da eseguire, tutti da riportare con esito, ora, browser):
1. Desktop, Chrome: lezione senza video, "Carica un video", file mp4 di prova da 20-50 MB. Attesi: barra che avanza, "Caricato", poi "Video pronto" entro qualche minuto; su dash.bunny.net il video compare con il titolo dato; `select video_bunny_id, durata_min from lezione where id=...` mostra il guid e la durata; il player della lezione (via `lezione-firma-video`) riproduce.
2. Interruzione: stesso flusso con un file da almeno 200 MB, spegnere il Wi‑Fi a metà per 30 secondi, riaccenderlo. Atteso: il caricamento riprende e completa; su Bunny esiste **un solo** video, non due; il ledger ha una sola riga.
3. Chiudi e riapri: avviare, chiudere la scheda al 30%, riaprire la lezione. Atteso: "Caricamento non completato", Riprendi porta a termine dallo stesso `video_id`.
4. iPhone, PWA installata: file .mov dal Rullino. Atteso: `filetype` `video/quicktime`, caricamento completato, video pronto e riproducibile su iPhone.
5. Permessi: con un utente di livello < 25 chiamare `corso-video-crea` (da console, con il suo JWT). Atteso 403 `non_autorizzato`; nessun oggetto creato su Bunny; nessuna riga nel ledger.
6. Firma scaduta: forzare `scadenza` nel passato modificando l'header lato client in devtools. Atteso: 401 dal TUS, la UI richiede una nuova firma e riprende senza creare un secondo video.
7. 409: su una lezione con video già pronto premere "Carica un video". Atteso: messaggio "scollega prima", nessun oggetto creato su Bunny.
8. Igiene: nei log delle due funzioni (dashboard, ultime 24 h) cercare `AccessKey`, la stringa della firma, `eyJ`: zero occorrenze. Nel bundle Netlify cercare `BUNNY_API_KEY` e `video.bunnycdn.com/library`: la seconda può comparire solo in `bunnyUpload.ts` per l'endpoint TUS, mai con `/library/`.

## 9. Lotto B (opzionale, dopo che A è chiuso) · Webhook Bunny

Sostituisce il polling con una notifica di Bunny quando il video cambia stato.

- Nuova edge function `bunny-webhook`, `verify_jwt = false` (Bunny non ha un JWT Supabase). Autenticazione: firma HMAC-SHA256 del **corpo grezzo** della richiesta con la **Read-only API Key** della libreria come segreto (documentazione Bunny "Webhooks · Signature validation"). Header da controllare: `X-BunnyStream-Signature-Version` = `v1`, `X-BunnyStream-Signature-Algorithm` = `hmac-sha256`, `X-BunnyStream-Signature` = 64 hex minuscoli. Confronto a tempo costante. Il corpo va letto grezzo con `await req.text()` e **non** riserializzato dopo un `JSON.parse`, altrimenti la firma non torna.
- Nuovo secret `BUNNY_READONLY_API_KEY`: lo inserisce Cristian dal dashboard Supabase, copiandolo dalla riga "Read-only API Key" della scheda API di Bunny (icona centrale, non le frecce circolari che rigenerano).
- Payload: `{ VideoLibraryId, VideoGuid, Status }`. Controllare che `VideoLibraryId` sia `735664`. Mappare con l'**enumerazione webhook**: `3` Finished → ledger `pronto`; `5` Failed e `8` PresignedUploadFailed → `errore`; `7` PresignedUploadFinished → `caricato`; gli altri → aggiornare solo `stato_bunny`... no: nel ledger `stato_bunny` è dell'enumerazione API. Salvare lo status webhook in una colonna nuova `stato_webhook integer` (migrazione additiva) per non mescolare le due scale.
- Rispondere sempre 200 a firme valide, 401 a firme non valide, e loggare solo `VideoGuid` e `Status`.
- Configurare l'URL in Bunny → libreria → API → "Webhook URL": `https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/bunny-webhook`. Lo fa Cristian.
- La UI passa da polling a `supabase.channel` Realtime sul ledger solo se si decide di aprire una policy select per livello ≥ 25. Altrimenti resta il polling, che è già accettabile per meno di 50 soci.

## 10. Lotto C (separato, non blocca A) · Miniature vuote nel picker

Sintomo: in "Scegli il video" i riquadri delle miniature sono vuoti. `corso-video-libreria` costruisce `https://<cdn_hostname>/<guid>/<thumbnailFileName>` senza firma. Documentazione Bunny (Stream · Security): il token del pull zone si applica a tutte le URL dirette, comprese miniature e anteprime; un 403 dopo l'attivazione significa token mancante.

**Passo 1, diagnosi (prima di scrivere codice):** prendere una URL `miniatura` dalla risposta della funzione e aprirla nel browser. `403` → serve la firma (passo 2). `404` → `thumbnailFileName` o hostname sbagliati, correggere quello. `200` → il problema è nel rendering della UI, non nell'URL.

**Passo 2, se 403:** nel pull zone `vz-f538a971-7be` (Bunny → libreria → API → Pull zone → Manage → Security) leggere quale Token Authentication è attiva e copiare la sua chiave in un **nuovo** secret `BUNNY_CDN_TOKEN_KEY` (lo fa Cristian). Non riusare `BUNNY_TOKEN_KEY` per assunzione: la chiave di firma degli embed e quella del pull zone possono essere diverse. Implementare la firma seguendo l'implementazione di riferimento `BunnyWay/BunnyCDN.TokenAuthentication` (Node.js): formato avanzato `token=HS256-<base64url(HMAC-SHA256(chiave, path + expires))>&expires=<unix>`, con `path` = `/<guid>/<thumbnailFileName>`, senza IP e senza parametri aggiuntivi. Se il pull zone usa ancora il formato base (MD5), usare quello e scrivere nel report che è deprecato da Bunny.

**Passo 3, modifica minima a `corso-video-libreria`:** copia `.bak`, poi: se `cfg.token_attivo === true` e `BUNNY_CDN_TOKEN_KEY` è presente, `miniatura` diventa l'URL firmata con scadenza `token_durata_secondi`; se la chiave manca, `miniatura: null` (come oggi, senza URL rotte). Nessun'altra riga cambia. Verificare nel picker che le 22 miniature compaiano, su desktop e iPhone.

## 11. Lotto D (in coda, non ora) · Orfani su Bunny

Oggetti creati da `corso-video-crea` e mai caricati (ledger `creato`/`annullato` da più di 48 h, `status` API 0). Funzione di manutenzione che li elenca e, su conferma esplicita del segretario, li elimina con `DELETE /library/{id}/videos/{guid}`. Non implementare finché A non ha girato almeno due settimane.

## 12. Report atteso

`docs/ops/REPORT_caricamento_video_<data>.md` con: file creati e commit (short sha) su `noslab-elbrenz` e `elbrenz-community`; esito della migrazione con le due query di verifica; flag `verify_jwt` post-deploy di tutte le funzioni; gli otto test della sezione 8 con esito, ora, browser; scelte fatte dove il brief lasciava margine (`chunkSize`, testi); cosa resta a Cristian (deploy Netlify, eventuali secret B e C); scostamenti dichiarati. Nessuna chiave, firma o URL con credenziali nel report.

Se qualcosa non riesce, dillo e fermati al gate che ha fallito. Un video "collegato" che non parte è il 401 di oggi sotto un'altra forma.
