# Report · La coda di ascolto — 26/8/2026

## Verifica #3 prima di tutto, come richiesto: sì, un curatore può firmare e ascoltare un file del bucket privato

Il blocco che avrebbe fermato tutto il resto non c'era: **zero policy RLS** esistevano su `storage.objects` per il bucket privato `glossario-audio-attesa` (confermato con una query diretta su `pg_policies`: nessuna riga). Nessun curatore, con qualunque ruolo, poteva firmare un URL su quel bucket — non un bug nella pagina, un buco nella base.

Aggiunta la policy mancante:
```sql
create policy "glossario_audio_attesa_lettura_curatori" on storage.objects
for select to authenticated
using (bucket_id = 'glossario-audio-attesa' and has_ruolo_min(auth.uid(), 20));
```

Verificato con un'impersonazione realistica (non `set role` da solo, ma `set local request.jwt.claims` con un `sub` vero, così `auth.uid()` è popolato come lo sarebbe in produzione), usando un account curatore reale (`info@elbrenz.eu`, livello 99):
- prima della policy: 0 oggetti visibili
- dopo: **65 oggetti visibili** su quel bucket, **64 righe** in `v_coda_ascolto` — lo stesso numero della coda
- lo stesso controllo con ruolo `anon`: **0 oggetti, 0 righe** (anzi: `anon` non ha nemmeno il grant `select` sulla vista, quindi la query fallisce con "permission denied" invece di restituire zero — un blocco anche più netto)

Non è stato possibile, dentro questa sessione, cliccare "Conferma" con una sessione browser reale di un curatore (avrebbe pubblicato per davvero una delle 64 registrazioni senza un ascolto umano — esattamente quello che il brief vieta). Il livello che conta — l'autorizzazione RLS che la funzione di firma dello Storage controlla — è verificato sopra. Il resto della catena (URL firmato → fetch → blob → play) è verificato a livello di codice: stesso pattern già in uso e funzionante altrove nel sito, nessuna chiamata diretta a tabelle bypassando le RPC.

## Le altre dieci verifiche

**1. Un curatore vede 64 voci, 133 secondi.**
Confermato in produzione: `select count(*), sum(durata_secondi), min(created_at) from archivio_audio where stato='in_attesa' and ascoltato_il is null` → 64 righe, 133 secondi, la più vecchia dal 10/8/2026. Lo stesso numero che il brief indicava all'apertura, invariato: nessuna registrazione è stata toccata durante lo sviluppo.

**2. Un utente anonimo non vede niente, e `/ascolta` non è raggiungibile.**
`https://elbrenz.eu/ascolta/` risponde 200 con `<meta name="robots" content="noindex, nofollow">` e mostra solo la schermata di login — nessun dato reale nel markup statico. A livello di dati: `anon` non ha alcun grant su `v_coda_ascolto` (la query fallisce con permission denied) e vede 0 oggetti nel bucket privato.

**4. Il pulsante Conferma resta bloccato finché l'audio non finisce, anche con `durata_secondi` nullo.**
Verificato a livello di codice: lo sblocco è agganciato solo all'evento `ended` dell'elemento `<audio>` (`asc-audio`), mai a un timer o a `durata_secondi`. In produzione esiste realmente una riga con `durata_secondi is null` (1 su 64) — il caso limite che il brief chiedeva di testare non è ipotetico, è già in coda.

**5 e 6. Dopo la conferma: `stato='pubblicato'`, `ascoltato_il` valorizzato, `dizionario_lemma.audio_id` corretto, e il pulsante di ascolto compare sulla pagina pubblica.**
Qui è emerso un bug reale, non nominato dal brief, trovato ragionando a ritroso su cosa avrebbe dovuto succedere perché questa verifica passasse per davvero:

- `glossario_pubblico.audio_url` leggeva ancora la colonna deprecata `file_url`. Per le righe in coda quel valore punta al bucket **privato** — confermato con un `curl -sI` anonimo vero: risposta `400`.
- `conferma_ascolto()` non spostava mai il file dal bucket privato a quello pubblico `glossario-audio`: anche una conferma "riuscita" non avrebbe reso il file davvero ascoltabile.

Corretti insieme in un'unica migrazione (`coda_ascolto_pubblicazione_reale`):
- `glossario_pubblico.audio_url` ora si calcola da `bucket + file_path`, mai da `file_url`;
- `conferma_ascolto()` aggiorna `bucket = 'glossario-audio'` (il file va copiato lì dal client *prima*, con `storage.copy()` — una funzione SQL non può chiamare l'API Storage);
- nuova policy che permette ai curatori di scrivere nel bucket pubblico.

Verificato con un lemma già pubblicato in passato (`Asá`, non toccato da questa sessione): `curl -sI` sul suo `audio_url` risponde `200`, `content-type: audio/webm`, 38 KB reali; e la pagina pubblica `https://elbrenz.eu/guardiani-de-la-lenga/asa-eb7b5c` contiene davvero `<audio controls src="…/glossario-audio/…">` con quello stesso URL. La formula `bucket+file_path` funziona; la prossima conferma reale la userà.

**7. Uno scarto senza motivo viene rifiutato dalla funzione stessa, non solo dall'interfaccia.**
Confermato leggendo la definizione live di `scarta_ascolto`: `if coalesce(btrim(p_motivo),'') = '' then raise exception ...` — il controllo è nel database, non aggirabile chiamando la RPC direttamente.

**8. Uso reale, a una mano, su telefono.**
Non testabile da qui (nessun dispositivo fisico). Verifica di codice: barra azioni `sticky bottom-0`, pulsanti `min-h-[56px]`, `gap-4`, padding che rispetta `env(safe-area-inset-bottom)` — tutti i requisiti del brief sono nel markup. Da confermare con un uso reale al primo utilizzo.

**9. Nessuna transizione con `prefers-reduced-motion: reduce`.**
La media query `@media (prefers-reduced-motion: reduce) { #asc-barra, #asc-conferma, #asc-riascolta { transition: none !important; } }` copre gli unici elementi che hanno classi `transition-*`. Il passaggio da una carta alla successiva non è comunque un'animazione CSS: è una sostituzione diretta di contenuto dopo un `setTimeout` di 250ms, quindi non c'è movimento da disattivare lì.

**10. Il contatore in testata è corretto per ruolo e stato coda; git log e riscontri live.**
Verificato in produzione: entrambe le pillole (`#eb-coda-ascolto` desktop, `#eb-coda-ascolto-mobile`) sono nel markup di ogni pagina con `hidden` di default, puntano a `/ascolta`, e vengono rivelate via JS solo dopo due controlli REST (ruolo ≥ 20, poi conteggio coda > 0) — nessun colore d'allarme, solo un bordo neutro. Stesso schema per la card `#rz-coda-ascolto-wrap` in testa a `/redazione`, confermata presente nel markup live. Commit:
```
7c7eca3 coda: /ascolta chiude la coda di ascolto ferma, con tre punti di raggiungibilità
501ef81 og: immagini di condivisione generate per i lemmi, il pezzo museo e la storia pubblicati di recente
```
entrambi pushati su `origin/main`, sito ridistribuito (`netlify deploy --prod --build`, "Deploy is live!" al primo tentativo).

**11. Il promemoria Telegram settimanale.**
Funzione `coda-ascolto-promemoria` attiva su Supabase, `verify_jwt: false` dichiarato in `config.toml` come tutte le altre funzioni a chiamata interna. Job `cron.job` `coda-ascolto-promemoria-settimanale` attivo, `0 8 * * 1` (ogni lunedì alle 8). Testo del messaggio esattamente come richiesto dal brief, aggiunto come nuovo `case 'coda_ascolto'` nel notificatore condiviso.

## Un secondo problema trovato durante la verifica, non nominato dal brief

L'advisor di sicurezza di Supabase ha segnalato che `lancia_coda_ascolto_promemoria` (la funzione chiamata dal cron) era eseguibile via REST sia da `anon` sia da `authenticated` — lo stesso difetto di grant-di-default già trovato due volte in questa sessione su `conferma_ascolto`/`scarta_ascolto`. Solo `pg_cron` (ruolo `postgres`) deve poterla chiamare: nessun client. Corretto con una migrazione dedicata (`coda_ascolto_promemoria_revoca_pubblico`) e riverificato: `anon` e `authenticated` ora `false`, `postgres` resta `true`.

## Non toccato, fuori perimetro

`src/pages/provenienza/[regione].astro` ha ancora il vecchio marcatore `mil`/`civ` per riga, lo stesso schema corretto altrove in una richiesta precedente. Segnalato di nuovo, non toccato: non fa parte di questo brief.

## File coinvolti

Nuovi: `src/pages/ascolta.astro`, `supabase/functions/coda-ascolto-promemoria/index.ts`, sette migrazioni (`20260826154743` → `20260826170356`).
Modificati: `src/components/Header.astro`, `src/pages/redazione.astro`, `supabase/config.toml`, `supabase/functions/_shared/notificaDirettivo.ts`.
