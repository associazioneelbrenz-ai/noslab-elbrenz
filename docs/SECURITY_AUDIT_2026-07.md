# Security Audit — Ecosistema El Brenz

**Data**: 12 luglio 2026 · **Perimetro**: sito Astro (Netlify) + Supabase (Postgres/RLS/Edge) + Resend + PayPal + Telegram.
**Metodo**: read-only. Nessuna modifica in produzione durante l'audit. I fix additivi (con `.bak`) sono applicati/proposti a valle.

> **Premessa onesta**: non esiste "a prova di bomba". La sicurezza è un processo. Questo report alza l'asticella e chiude i buchi concreti; segnala anche cosa richiede una decisione di Cristian prima di toccarlo.

**Verdetto sintetico**: postura **buona**. Nessun buco critico trovato. RLS attiva ovunque, nessun secret server nel frontend, header di sicurezza quasi completi, form protetti. I miglioramenti reali sono: **applicare la CSP** (oggi in Report-Only), **Turnstile** sui form più esposti, revisione **GDPR** (granularità cookie + registro consensi), e alcune viste/policy da rifinire.

---

## 1) RLS — Row Level Security · gravità residua BASSA
- **RLS ATTIVA su tutte le 60 tabelle** dello schema `public` (`rowsecurity=true`). Nessuna tabella scoperta. ✅
- Policy pubbliche permissive `USING (true)` presenti **solo su 3 tabelle non-PII**: `ai_config_ruolo`, `archivio_categoria`, `ruolo` (tassonomie/config, lettura pubblica accettabile). Nessuna tabella con **dati personali** (`utente`, `domande_tesseramento`, `pagamenti_tesseramento`, `download_lead`, `iscrizioni_gita`, `guardiani_contributori`, `newsletter`) è permissiva. ✅
- **`articolo`** (rivisto oggi): editor vede/scrive solo i propri, admin tutti, UPDATE con `WITH CHECK` (niente escalation a `pubblicato`), pubblico via vista. ✅
- **Scritture sensibili via edge con ruolo server-side**: pubblicazione articolo (`articolo-azione`), validazione lemma (`guardiani-contributo`), provisioning ruolo (`otp-verify`) — non da UPDATE client. ✅
- **Viste pubbliche** (8): `v_articoli_pubblici` (solo pubblicati, campi pubblici), `glossario_pubblico` (solo `pubblicato`; email/firma nascoste salvo consenso), `v_posti_gita` (solo conteggi), `convenzioni_pubbliche`, `v_*_mappa`, `v_custodi_memoria`, `vista_ai_statistiche`. Le principali espongono solo campi/righe pubblici.
- **Da rifinire (basso)**: rivedere `ai_config_ruolo` con `USING(true)` (espone la config AI per ruolo: limiti, modello, prompt? verificare che non contenga il prompt di sistema); e audit puntuale delle 8 viste per `security_invoker` e colonne (nessuna deve esporre `email`, `autore_id`, `contributore_id` in chiaro).

## 2) Secret e credenziali · gravità BASSA
- **Nessun secret server nel frontend** (`src/`): nessun `service_role`, `re_…`, `sk-…`, HMAC, token Telegram, PayPal secret. L'unica occorrenza è un **commento** in `src/lib/supabase.ts` che ricorda che la service_role vive solo negli Edge Secrets. ✅
- Espn pubbliche **volute**: `PUBLIC_SUPABASE_ANON_KEY` (publishable) e `PAYPAL_CLIENT_ID` (client-id pubblico per design). Corretto. ✅
- I secret server (`SERVICE_ROLE`, `ADMIN_ACTION_SECRET`, `BOT_ANDREAS_SECRET`, `SEND_EMAIL_SHARED_SECRET`, `PAYPAL_CLIENT_SECRET`, `RESEND_API_KEY`, `TELEGRAM_*`) stanno solo negli Edge Function Secrets. ✅
- **Da verificare (medio)**: scansione della **history git** per secret committati per errore (non completata in questo audit). Se emerge qualcosa → **ruotare** il secret. Il client-id PayPal in chiaro è ok; verificare che il **client-secret** non sia mai finito in un commit.

## 3) Edge function — superficie pubblica · gravità BASSA
- Tutte `verify_jwt=false`, ma **gated**: origin allowlist (elbrenz.eu), secret condiviso (`send-email` richiede `X-Send-Email-Secret`, mai aperta), HMAC nel **path** (mai query string), webhook Telegram con secret header obbligatorio.
- **Validazione input**: email regex, limiti di lunghezza (`FIELD_LIMITS`), whitelist campi/varianti. `corpo_html` degli editor **sanitizzato** (allowlist via parser DOM `deno_dom`) prima della pubblicazione.
- **CORS**: allowlist esplicita, mai `*`.
- **HMAC**: `verificaToken` (in `_shared/admin.ts`) — verificare (medio) che il confronto sia a **tempo costante** e il secret ≥ 32 byte.
- **Output**: lezione Guardiani applicata (le conferme si renderizzano su elbrenz.eu, l'edge risponde JSON). Nessun leak di stack trace al client (errori generici).
- **Da rifinire (basso)**: `andreas-chat` richiede `TURNSTILE_SECRET_KEY` per il Turnstile dopo 2 messaggi — **non configurata** (DEBT-020): oggi il bypass anti-bot è attivo in modalità degradata (log warning). → configurare Turnstile.

## 4) Antispam / form pubblici · gravità MEDIA
- **Honeypot + time-trap (`_ts`)** presenti su: Convenzioni, Guardiani, lead-gen libro, lead-gen documentario, gita. ✅
- **Rate-limit per IP persistente**: `convenzioni_rate_limit` / RPC `convenzioni_rl_hit` (riusata da Guardiani), `ai_rate_limit_pubblico` (Andreas), `telegram_rate_limit` (bot). ✅
- **Turnstile**: predisposto in `andreas-chat` ma **secret mancante** → non attivo. **Nessun captcha** sugli altri form. → **fix consigliato**: configurare `TURNSTILE_SECRET_KEY` e attivare Turnstile (a soglia) sui form più esposti (Sportello, Guardiani, lead-gen). *(Richiede setup Cloudflare — decisione/azione Cristian.)*
- **Da verificare**: che lo **Sportello "Porta la tua Storia"** (`contatti-submit`) abbia honeypot + rate-limit (non verificato in questo giro).

## 5) Security headers (Netlify `public/_headers`) · gravità MEDIA
Presenti e corretti: **HSTS** (1 anno, includeSubDomains), **X-Content-Type-Options: nosniff**, **X-Frame-Options: SAMEORIGIN**, **Referrer-Policy: strict-origin-when-cross-origin**, **Permissions-Policy** (camera/microfono/geolocalizzazione disattivati). ✅
- **CSP in `Content-Security-Policy-Report-Only`** (osservazione, non applicata). → **fix che richiede decisione**: passare a `Content-Security-Policy` (enforced) dopo aver verificato che la policy copra tutte le origini reali (Supabase, PayPal, youtube-nocookie, Instagram, font self-hosted, immagini Storage) e non rompa nulla. Rischio: una CSP enforced sbagliata rompe il sito. **NON applicare senza test + OK.**
- Minori: valutare `X-Frame-Options: DENY` (oggi SAMEORIGIN) e aggiungere `frame-ancestors 'none'` alla CSP quando enforced (anti-clickjacking più stretto), se nessuna pagina va incorniciata.

## 6) GDPR / Privacy / Cookie · gravità MEDIA (area da approfondire)
- **Cookie banner** `vanilla-cookieconsent@3.1.0` presente (GDPR, bottom-left). Pattern **click-to-load** per YouTube/mappa/Instagram: nessuna richiesta a terzi prima del consenso/gesto. ✅
- **Consensi separati** privacy vs newsletter (non pre-spuntati) su lead-gen e Guardiani. ✅
- **Da verificare/decidere** (richiede OK Cristian):
  - il banner blocca **davvero** ogni cookie non essenziale **prima** del consenso, ed è **granulare** (necessari/statistici/marketing) con "rifiuta" facile come "accetta";
  - **Cookie policy** e **Informativa privacy** con elenco reale dei servizi (Supabase, Resend, PayPal, FCM) + finalità, base giuridica, conservazione, **titolare** (Associazione El Brenz, C.F., sede), diritti;
  - **Registro dei consensi**: le tabelle lead/newsletter/tesseramento registrano cosa/quando/versione informativa? (da verificare colonna per colonna);
  - procedura (anche manuale) per **cancellazione/accesso** dati;
  - **DPA/adeguatezza** dei fornitori e residenza dati (EU vs extra-UE).

## 7) Protezione della logica di valore · gravità BASSA
- Logica di valore **lato server**: RAG Andreas (prompt di sistema, retrieval, ranking) in `andreas-chat`; generazione HMAC in `_shared/admin.ts`; pricing/gita e validazioni nelle edge. Il frontend **chiama** le edge, non le contiene. ✅
- **Da verificare (basso)**: che il **prompt di sistema** di Andreas non sia mai nel bundle frontend (è in `andreas-chat`, ok) e che nessun endpoint interno non protetto sia referenziato nel client.
- **Minify** attivo in produzione (Astro build): deterrente, **non** protezione reale. Documentato: il frontend è per definizione leggibile.

## 8) Performance · gravità BASSA (da misurare)
- Embed **click-to-load** (YouTube, Leaflet, Instagram): nessuna richiesta a terzi al load. ✅
- Immagini in gran parte **WebP** con width/height. La pagina **Fiöi dal Nos** è densa (studio ~4000 parole + 1 cartina 800×552): da misurare LCP/CLS.
- **Da fare**: Lighthouse su home + Fiöi dal Nos + gita; verificare `loading="lazy"` ovunque, dimensioni immagini, split JS. *(Non eseguito in questo audit — richiede run dedicata.)*

## 9) Post-mortem incidenti del 12/7 e controlli preventivi
| Incidente | Causa | Controllo preventivo |
|---|---|---|
| Bot Telegram muto | webhook senza `secret_token` combaciante | checklist deploy webhook: `getWebhookInfo` + match secret dopo ogni deploy |
| Andreas muto alle domande | `Authorization: Bearer` verso andreas-chat → ramo JWT | server-to-server: solo `apikey`, mai Bearer; test ponte dopo deploy |
| Validazione Guardiani rotta | piattaforma forza `text/plain` sull'HTML delle edge + go-live senza test | conferme HTML servite dal nostro dominio; **mai `*_LIVE=true` senza smoke test E2E documentato** |
| Pagina Fiöi grezza | fonte sbagliata (DB `corpo_html` vs file curato) | **convenzione**: definire per ogni pagina quale sorgente è "verità" |
| **Regola generale** | — | **niente go-live di una feature senza smoke test end-to-end registrato** |

---

## Fix applicati in questo audit
- (nessuna modifica a codice/produzione durante il report: gli header erano già completi, la RLS già attiva). Report additivo in `docs/`.

## Fix che richiedono una DECISIONE di Cristian (NON applicati)
1. **CSP enforced** (da Report-Only a enforced) — dopo test, per non rompere il sito.
2. **Turnstile** sui form esposti — richiede setup Cloudflare (`TURNSTILE_SECRET_KEY`).
3. **GDPR**: revisione granularità cookie banner + testi informativa/cookie policy + registro consensi + procedura cancellazione dati.
4. **Rotazione secret** se la scansione git ne rivela di committati.

## Fix additivi sicuri proponibili subito (a tuo via)
- Verificare/aggiungere honeypot+rate-limit allo Sportello se mancanti.
- Restringere `ai_config_ruolo` (togliere `USING(true)` se contiene dati sensibili di config).
- Audit colonna-per-colonna delle 8 viste pubbliche.
- `X-Frame-Options: DENY` + `frame-ancestors 'none'` (se nessuna pagina va incorniciata).

*Fine report. Redatto in modalità read-only; nessuna dichiarazione di invulnerabilità.*
