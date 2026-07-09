# BRIEF M4.0 — AUDIT PROFONDO: sicurezza · performance · privacy · cookie · policy
**Data**: 8 luglio 2026 · **Per**: Claude Code · **Richiesto da**: Cristian (post go-live sito su elbrenz.eu)
**Natura del task**: AUDIT in due fasi. **FASE 1 = SOLA LETTURA** (nessuna modifica a codice, DB, configurazioni) che produce un report. **FASE 2 = fix** eseguiti SOLO dopo approvazione esplicita di Cristian, voce per voce o a blocchi. Questa separazione è vincolante.

**Contesto**: sito Astro 6 statico+SSR su Netlify (elbrenz.eu, apex primary) · Supabase `wacknihvdjxltiqvxtqr` (edge functions: paypal-create-order, paypal-capture-order, paypal-webhook, andreas-chat, OCR ricevute) · PayPal live dietro flag · Resend verificato (team elbrenz, eu-west-1) · widget Andreas (M3.0) · bucket privato `ricevute` · rate limit modulo 3/ora/IP.

**Regole**: in FASE 1 vietato modificare qualsiasi cosa (vale anche per "fix ovvi"). Le edge functions restano zona protetta anche in FASE 2 salvo autorizzazione puntuale. Report onesto: se un'area è sana, dirlo senza inventare problemi; se un controllo non è eseguibile dall'ambiente, dichiararlo invece di simularlo.

---

## FASE 1 — AUDIT (sola lettura)

### A. SICUREZZA — Superficie web
A1. **Security headers** sul sito live:
```bash
curl -sI https://elbrenz.eu/ | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy|cache-control"
```
Verificare presenza/assenza e configurazione di: HSTS (con max-age adeguato), CSP (esiste? whitelist per: self, PayPal SDK, Supabase, instagram.com per lightbox post-consenso, youtube-nocookie), X-Frame-Options o frame-ancestors, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. Controllare se esiste `public/_headers` o `netlify.toml` con sezione headers. Per ogni header mancante: proposta di valore concreto e impatto (attenzione: una CSP troppo rigida rompe PayPal SDK e gli embed — proporre CSP in modalità Report-Only come primo passo).
A2. **Secrets nel repo**: scan del working tree E della history:
```bash
git log --all -p | grep -nE "sb_secret_|re_[A-Za-z0-9]{20,}|PAYPAL_CLIENT_SECRET|sk-ant|BEGIN (RSA|EC) PRIVATE" | head -50
grep -rnE "sb_secret_|re_[A-Za-z0-9]{20,}|sk-ant" src/ supabase/ public/ --include="*" | grep -v node_modules
```
Verificare che `.env*` sia in `.gitignore` e MAI committato (`git log --all --oneline -- .env`). Se emerge un secret in history: segnalarlo come CRITICO con procedura di rotazione, NON tentare rewrite della history senza ok.
A3. **Chiavi esposte al client**: censire cosa finisce nel bundle (`grep -rn "PUBLIC_" src/ .env.example`, ispezione `dist/`): la anon key Supabase è pubblica by design ma va confermato che NULL'ALTRO lo sia (service_role MAI nel client, PayPal client_id pubblico ok, client_secret MAI).

### B. SICUREZZA — Supabase
B1. **RLS**: per OGNI tabella (`pagamenti_tesseramento`, `domande_tesseramento`, `config_app`, tabelle andreas_*, eventuali altre) verificare: RLS abilitata? Policy esistenti? Cosa può fare il ruolo `anon`? Query di censimento (via MCP o SQL editor, SOLA LETTURA):
```sql
SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
```
Test pratico: con la sola anon key, provare una SELECT su pagamenti_tesseramento e domande_tesseramento — deve fallire o restituire zero righe. Riportare l'esito reale.
B2. **Storage**: bucket `ricevute` — confermare privato, censire le storage policies (chi può INSERT? chi SELECT?), verificare che i download passino da signed URL con scadenza breve. Upload: c'è validazione server-side di tipo MIME e dimensione file? Dove?
B3. **Edge functions** (lettura codice, zero modifiche): per ciascuna — input validation (importi, tipi, lunghezze), gestione errori che NON riveli stack/internals al client, CORS (origini ammesse: solo elbrenz.eu o wildcard?), autenticazione (verify_jwt o shared secret sb_secret_*?), idempotenza (capture e webhook — già dichiarata, verificarla nel codice), il token HMAC admin (ADMIN_ACTION_SECRET, TTL 30gg: il TTL è verificato server-side?).
B4. **Advisors Supabase**: eseguire `get_advisors` (security e performance) via MCP e riportare integralmente i risultati.
B5. **Rate limiting reale**: il limite 3 invii/ora/IP del modulo e il limite 3 domande/giorno di Andreas sono applicati SERVER-SIDE o solo client-side? Dove vengono salvati gli IP (vedi anche D4)? Un curl diretto all'edge function bypassa il limite?

### C. SICUREZZA — Pagamenti e Andreas
C1. PayPal: confermare nel codice che importo quota è hardcoded server (20.00), donazioni validate server 1–500, currency EUR forzata, nessun parametro prezzo accettato dal client; webhook: verifica firma obbligatoria PRIMA di ogni side-effect, gestione eventi ignoti (log e 200? 400?), replay protection.
C2. Andreas: l'endpoint andreas-chat ha limiti di lunghezza input e max_tokens output (controllo costi)? Le domande degli utenti vengono loggate/salvate? Dove e per quanto (rilevante anche per privacy, D5)? C'è protezione dall'uso dell'endpoint fuori dal sito (CORS/origin check)? Nota: robustezza a prompt injection va valutata come rischio residuo (esfiltrazione del prompt di sistema, generazione contenuti fuori tema a nostra firma) — riportare lo stato senza modificare il prompt.
C3. `npm audit --omit=dev` + `npm audit` completo: riportare vulnerabilità per severità. NON eseguire `npm audit fix` in Fase 1.

### D. PRIVACY / GDPR — la parte più delicata: confrontare LE POLICY con LA REALTÀ
D1. **Censimento flussi di dati reali** (dal codice, non dalle policy): per ogni punto di raccolta — modulo tesseramento, modulo contatti, upload ricevuta, donazione, chat Andreas, iscrizione futura newsletter — elencare: quali dati, dove finiscono (tabella/bucket/servizio), chi li processa, per quanto restano.
D2. **Censimento processor/terze parti effettivi**: Netlify (hosting+log: quale regione? i log contengono IP), Supabase (verificare la REGIONE del progetto — se è extra-UE va dichiarato), Resend (eu-west-1 ✓), PayPal, Anthropic (Andreas — processing USA: È DICHIARATO in privacy policy?), Meta/Instagram e YouTube (solo post-consenso via embed), eventuali font/CDN esterni (vedi E3). Confrontare questa lista con quella scritta nella privacy policy: ogni divergenza è un finding.
D3. **Cookie e storage reale vs dichiarato**: censire TUTTI i cookie e localStorage/sessionStorage effettivamente impostati: prima del consenso (devono essere solo tecnici), dopo consenso analytics (se esiste), dopo consenso contenuti terzi (embed IG/FB/YT). Includere i localStorage nostri: `andreas_widget_seen`, chiave consenso banner, contatore domande Andreas, e qualsiasi altro (`grep -rn "localStorage\|sessionStorage\|document.cookie" src/`). Confrontare col testo della cookie policy: l'elenco deve combaciare al 100%.
D4. **IP e dati tecnici**: il rate limiting salva IP (dato personale). Dove, in chiaro o hashati, con quale retention? È menzionato nell'informativa? Proposta attesa: hash o retention breve automatica.
D5. **Retention**: ricevute (policy 12 mesi: c'è un meccanismo che la APPLICA o è solo scritta?), pagamenti (obblighi contabili ~10 anni: ok, ma va scritto), domande respinte/scadute, log Andreas, righe rate-limit. Per ogni categoria: retention dichiarata vs applicata.
D6. **Contenuto delle pagine legali**: /privacy e /cookie-policy esistono, sono raggiungibili dal footer di OGNI pagina, indicano Titolare corretto (Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce, Via Trento 40, 38027 Malè TN, C.F. 92019480224, info@elbrenz.eu), base giuridica per trattamento, diritti dell'interessato con modalità di esercizio, elenco processor aggiornato (D2), sezione contenuti incorporati (M2.9), informativa specifica per: pagamenti/tesseramento (dati per legge su registri soci), chat Andreas (assistente AI, processing Anthropic, cosa viene conservato), donazioni anonime (cosa significa davvero: zero dati nel nostro DB, PayPal li vede comunque). Segnalare ogni claim non veritiero o mancante.
D7. **Registri associativi**: il flusso tesseramento produce dati che alimentano il Libro Soci (obbligo di legge APS) — verificare che l'informativa lo dichiari.

### E. PERFORMANCE
E1. **Misurazione**: se Chrome disponibile: `npx lighthouse https://elbrenz.eu --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./audit/lh-home.json --chrome-flags="--headless"` su: home, un articolo, /tesseramento, /andreas, /archivio-storico. In alternativa API PageSpeed: `curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://elbrenz.eu&strategy=mobile"`. Riportare per pagina: Performance score, LCP, CLS, TBT, peso totale, n° richieste.
E2. **Immagini**: hero già `<picture>` WebP ✓ — verificare il resto: articoli migrati da WP (quanti JPG/PNG pesanti in public/? top 20 per peso: `find public dist -type f \( -name "*.jpg" -o -name "*.png" \) -exec du -h {} + | sort -rh | head -20`), width/height espliciti ovunque (CLS), loading=lazy sotto la piega, dimensioni servite vs renderizzate.
E3. **Font**: Playfair Display — self-hosted o da Google Fonts? Se da Google: finding sia performance che PRIVACY (chiamata a Google pre-consenso, nota sentenza tedesca) → proposta self-hosting con preload + font-display: swap + subset latin.
E4. **JS**: PayPal SDK caricato SOLO su /tesseramento e /dona (verificare che non sia nel layout globale); peso del bundle widget Andreas e caricamento (deferred?); nessun altro script terzo pre-consenso.
E5. **Caching**: header cache-control su asset statici con hash (immutable?), HTML (max-age=0 must-revalidate ✓ visto oggi), verifica compressione (br/gzip attivi su Netlify di default).
E6. **SSR**: quali rotte sono SSR (c'è una function ssr.mjs nel deploy) e quali statiche? Le SSR hanno caching? C'è rischio di colli di bottiglia o costi su traffico alto?

### F. QUALITÀ TRASVERSALE (rapida, non esaustiva)
F1. Accessibilità: esito categoria Lighthouse + spot-check manuale su: contrasto oro-su-avorio (probabile punto debole), alt text immagini articoli migrati, focus visibile, aria-label del widget e dei social.
F2. SEO tecnico: sitemap coerente (solo URL apex, no www, no netlify.app), robots.txt, canonical uniformi, meta description presenti, 404 personalizzata esiste?, redirect catena (www→apex→pagina = massimo 2 hop?).

---

## DELIVERABLE FASE 1
File `docs/AUDIT_2026-07/AUDIT_REPORT_2026-07.md` strutturato così:
1. **Executive summary** (mezza pagina, linguaggio non tecnico: Cristian deve poterlo riferire al Direttivo)
2. **Tabella findings**: ID · Area · Descrizione · Evidenza (comando/output/file:riga) · Severità (CRITICO = agire subito / ALTO = entro la settimana / MEDIO = pianificare / BASSO = opportunità) · Fix proposto · Effort stimato (S/M/L) · Rischio del fix (cosa può rompersi)
3. **Cosa è già SANO** (elenco esplicito: dà la misura reale della postura)
4. **Piano fix proposto in 3 ondate**: Ondata 1 = CRITICI+ALTI a rischio zero · Ondata 2 = policy/testi legali · Ondata 3 = performance e rifiniture
5. **Allegati**: output lighthouse JSON, npm audit, advisors Supabase, censimento cookie/storage, censimento flussi dati (D1)

## FASE 2 — FIX (solo dopo ok di Cristian)
- Cristian approva per singola voce o per ondata. Ogni fix: `.bak`, diff minimo, `astro check` 0 errori, commit atomico con ID finding nel messaggio (es. `fix(security): HSTS header [AUD-A1]`).
- I fix alle pagine legali (privacy/cookie): Code propone il TESTO nuovo in un file di bozza, Cristian lo rivede PRIMA che tocchi le pagine (deroga alla zona protetta cookie/privacy concessa SOLO per i testi approvati da Cristian in questa sede).
- Fix su edge functions: ognuno richiede autorizzazione puntuale separata.
- Deploy: sempre e solo Cristian.

## FASE 3 — KIT DOCUMENTI LEGALI (M4.1, dopo la Fase 1)
I censimenti della Fase 1 (D1 flussi dati, D2 processor, D3 cookie/storage, D5 retention) alimentano la stesura del kit legale completo. DIVISIONE DEI RUOLI: le BOZZE dei testi le scrive la chat web con Cristian sui dati reali dell'audit — Code NON redige testi legali. Code:
1. Consegna i censimenti D1/D2/D3/D5 in formato riusabile (markdown tabellare) in `docs/AUDIT_2026-07/censimenti/`.
2. Quando Cristian consegna i testi approvati: implementa le pagine — struttura prevista: /privacy (riscritta) · /cookie-policy (allineata) · /termini · /note-legali-tesseramento (o sezione in /tesseramento) · nota informativa sotto il modulo contatti · nota Andreas (sezione in /andreas e link dal widget) · /crediti-e-licenze. Footer: link a privacy, cookie, termini da OGNI pagina.
3. Documenti interni (registro trattamenti, elenco DPA, procedura breach): restano fuori dal sito; Code può creare i file in `docs/legale/` se Cristian li consegna, mai committare dati di soci al loro interno.

## NOTA FINALE
Se durante l'audit emerge qualcosa di ATTIVAMENTE SFRUTTABILE (secret esposto, RLS assente su tabella con dati personali, endpoint che eroga dati senza auth): interrompere l'audit, segnalare SUBITO a Cristian quel singolo punto con la mitigazione d'emergenza, e attendere istruzioni prima di proseguire.
