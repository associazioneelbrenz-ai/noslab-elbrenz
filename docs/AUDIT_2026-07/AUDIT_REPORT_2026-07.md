# AUDIT REPORT — El Brenz (elbrenz.eu) · Luglio 2026
**Fase 1 — sola lettura** · eseguito il 9 luglio 2026 · nessuna modifica a codice/DB/config.
Riferimento: `BRIEF_M4.0`. Metodo: ispezione codice, query Management API Supabase (read-only), header HTTP live, advisors Supabase, npm audit.

---

## 1. Executive summary (per il Direttivo)

Il sito è **in buona salute di fondo**: i pagamenti sono blindati bene (l'importo della quota lo decide il server, non il browser; le donazioni sono validate; la firma dei pagamenti PayPal è verificata prima di scrivere qualsiasi cosa), il database è protetto riga per riga su tutte le 46 tabelle (un estraneo non legge né domande né pagamenti — verificato sul campo), non ci sono password o chiavi segrete finite per errore nel codice pubblico, e i dati sono ospitati in Europa (Francoforte).

Le cose da sistemare sono **soprattutto di conformità privacy e di "cinture di sicurezza" del browser**, non falle sfruttabili subito:
1. **Mancano le intestazioni di sicurezza** che dicono al browser come proteggere i visitatori (nessuna è configurata). Rischio medio, correzione semplice e a rischio quasi nullo.
2. **L'informativa privacy è incompleta**: cita solo 3 fornitori (Netlify, Supabase, Resend) ma il sito ne usa altri che trattano dati — soprattutto **Anthropic** (l'assistente Andreas, elaborazione negli USA), oltre a PayPal, e i **font di Google** caricati da server americani. Questo è il punto più delicato per il GDPR.
3. **I caratteri tipografici** arrivano da Google: vanno ospitati sul nostro sito (è insieme un tema di privacy e di velocità).

Nessun problema **critico e attivamente sfruttabile** è emerso: non è stato necessario interrompere l'audit. Tutto ciò che segue è pianificabile con calma, per ondate.

---

## 2. Tabella findings

Severità: **CRITICO** (subito) · **ALTO** (entro la settimana) · **MEDIO** (pianificare) · **BASSO** (opportunità).
Effort: S = < 1h · M = mezza giornata · L = più giornate.

| ID | Area | Descrizione | Evidenza | Sev. | Fix proposto | Effort | Rischio del fix |
|----|------|-------------|----------|------|--------------|--------|-----------------|
| AUD-A1 | Sec web | **Zero security header** sul sito live: nessun HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Nessun `public/_headers` né sezione headers in `netlify.toml`. | `curl -sI https://elbrenz.eu/` → nessun header di sicurezza; `_headers` assente | ALTO | Creare `public/_headers`: HSTS `max-age=31536000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` restrittiva; **CSP in Report-Only** come primo passo (whitelist self, PayPal SDK, Supabase, instagram/youtube-nocookie post-consenso). | M | CSP full romperebbe PayPal/embed → per questo Report-Only prima. Gli altri header sono a rischio ~nullo. |
| AUD-D2 | Privacy | **Informativa privacy incompleta**: `/privacy` cita solo Netlify, Supabase, Resend. Mancano **Anthropic** (Andreas, USA), **PayPal**, **Google Fonts** (USA), Meta/Instagram e YouTube (post-consenso). | `grep` processor in `src/pages/privacy.astro` → solo 3 su ~7 | ALTO | Testi a cura chat web + Cristian (Fase 3); Code fornisce il censimento D1/D2 già pronto in `censimenti/`. | M | Solo testo; nessun rischio tecnico. |
| AUD-E3 | Priv/Perf | **Google Fonts** caricati da `fonts.googleapis.com`/`gstatic.com` (3 famiglie). Connessione a Google prima del consenso (rilievo GDPR, sentenza tedesca) + costo performance. | `src/layouts/Layout.astro:81-84` | ALTO | Self-hosting: scaricare woff2 subset latin, servirli da `/fonts/`, `preload` + `font-display: swap`. Rimuove del tutto la chiamata a Google. | M | Rischio basso: verificare che i pesi/varianti servite coincidano (evitare FOUT). |
| AUD-B3 | Sec Supabase | **CORS wildcard** (`Access-Control-Allow-Origin: *`) su `otp-request`, `otp-verify`, `send-email`, `andreas-hofer`. Le altre function (paypal*, contact-form, andreas-chat) hanno whitelist corretta. `send-email` è protetta da shared-secret (mitigato); otp-* no. | `supabase/functions/otp-request/index.ts:5`, `otp-verify/index.ts:5`, `send-email/index.ts:25` | MEDIO | Sostituire `*` con la whitelist `ALLOWED_ORIGINS` già usata altrove. Zona protetta: richiede autorizzazione puntuale per function. | S | Basso: se un client legittimo usa un'origin non in lista va aggiunta. |
| AUD-C2a | Andreas | **Nessun limite di lunghezza** sull'input `body.query`: solo check `!body.query`. Testo arbitrariamente lungo va all'embedding OpenAI e a Claude → rischio costo/abuso. | `andreas-chat/index.ts:149` (solo `if(!body.query)`), nessun `.length` | MEDIO | Aggiungere cap server-side (es. 1000-2000 char) → 400 se superato. Zona protetta edge function. | S | Basso: soglia va tarata per non tagliare domande legittime. |
| AUD-B5 | Sec Supabase | **Rate limit contact-form in memoria** (`Map` per-istanza): si azzera ai cold start ed è per-istanza, quindi aggirabile. Andreas invece usa tabella `ai_rate_limit_pubblico` con `ip_hash` SHA256 (persistente ✓). | `contact-form/index.ts:92` (`rateLimitMap = new Map`) | MEDIO | Portare il rate limit contact-form su tabella (come Andreas) o su Turnstile (già predisposto, DEBT-020). | M | Medio: tocca edge function; testare che utenti legittimi non vengano bloccati. |
| AUD-D4 | Privacy | **IP del visitatore** inserito nella mail di notifica al Direttivo (`IP: ...`), usato anche nel rate limit in memoria. Non persistito a DB per il modulo, ma va dichiarato nell'informativa. | `contact-form/index.ts:223` | MEDIO | Menzionare nell'informativa il trattamento dell'IP (sicurezza/anti-abuso) e la retention; valutare hash. | S | Solo testo/informativa. |
| AUD-D5 | Privacy | **Retention ricevute (12 mesi)** documentata solo in commento; nessun meccanismo automatico verificato che cancelli i file scaduti. | `ricevuta-ocr/index.ts:15` (commento), nessun cron trovato | MEDIO | Cron Supabase di pulizia bucket `ricevute` > 12 mesi, oppure procedura manuale documentata. | M | Basso se ben targettizzato per data. |
| AUD-D6 | Privacy | **C.F. Titolare assente in `/cookie-policy`** (presente in `/privacy`). Coerenza titolare su entrambe le pagine legali. | `grep 92019480224`: privacy=1, cookie-policy=0 | MEDIO | Aggiungere blocco Titolare completo alla cookie-policy (Fase 2 testi). | S | Solo testo. |
| AUD-B4a | Sec Supabase | **Funzioni SECURITY DEFINER eseguibili da `anon`** (`has_ruolo`, `has_ruolo_min`, `e_socio_in_regola`, `peso_ruolo`). Advisor WARN. | advisors security → `anon_security_definer_function_executable` | MEDIO | `REVOKE EXECUTE ... FROM anon` dove non serve; verificare non rompa le policy che le richiamano. | M | Medio: alcune policy potrebbero dipenderne — testare prima. |
| AUD-F2a | SEO | **Manca 404 personalizzata** (`src/pages/404.astro` assente); Netlify serve un 404 generico. | `ls src/pages/404.astro` → assente; `curl` 404 ok ma non brandizzato | BASSO | Creare `src/pages/404.astro` con layout del sito e link utili. | S | Nullo. |
| AUD-F2b | SEO | **Copertura Open Graph scarsa** in home (1 sola meta `og:`). | `curl https://elbrenz.eu/ \| grep -c og:` → 1 | BASSO | Completare og:title/description/image/url/type via Layout (DEBT-015 collegato). | M | Nullo. |
| AUD-E1 | Perf | **Performance mobile 45/100** (Lighthouse locale): LCP 4.7s, **TBT 2.660ms** (alto), CLS 0.002 (ottimo), peso 596 KiB. Il TBT elevato è coerente con font Google bloccanti + JS. Accessibilità **96**, SEO **100**. | `lh-home.json` (headless) | MEDIO | Interventi combinati: self-host font [E3], differire JS non critico, ottimizzare LCP (hero). Rimisurare dopo Ondata 3. | M | Basso, ma misurare prima/dopo. |
| AUD-B4b | Sec Supabase | **Estensioni `citext` e `vector` in schema public** (advisor WARN, già noto DEBT-010: lo spostamento richiede privilegi superuser non disponibili). | advisors security → `extension_in_public` | BASSO | Spostare in schema dedicato quando/se possibile; nel frattempo accettato. | M | Medio: spostare estensioni può rompere riferimenti — rimandato. |
| AUD-B4c | Perf DB | **~80 indici mai usati** + `multiple_permissive_policies` su molte tabelle (advisor). Pulizia/consolidamento (già noto DEBT-011). | advisors performance | BASSO | Rivedere indici inutilizzati e consolidare policy permissive ridondanti. Nessuna urgenza. | L | Medio: rimuovere indici sbagliati degrada query — analisi prima. |
| AUD-C3 | Deps | **27 vulnerabilità npm** (6 low, 18 moderate, 3 high) **tutte in devDependencies** (catena `yaml` → `yaml-language-server` → `@astrojs/language-server`). Non finiscono nel bundle di produzione. | `npm audit` → catena solo dev | BASSO | Aggiornare `@astrojs/language-server` quando esce fix; non urgente (già DEBT-019b). | S | `npm audit fix --force` porterebbe breaking change (yaml) → evitare. |

---

## 3. Cosa è già SANO (postura reale)

- **Segreti**: scan del working tree e della history git → **nessun secret esposto** (`sb_secret_`, `re_`, `sk-ant-`, chiavi private). `.env*` correttamente in `.gitignore`, **mai committato**. [AUD-A2]
- **Chiavi client**: nel bundle solo `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` (pubblica by design). `dist/` privo di service_role, client_secret PayPal, chiavi AI. [AUD-A3]
- **RLS**: abilitata su **tutte le 46 tabelle** `public`. Test pratico con sola anon key su `pagamenti_tesseramento` e `domande_tesseramento` → **`[]` (0 righe)**, accesso negato. Le tabelle sensibili scrivono solo via service_role dentro le edge function. [AUD-B1]
- **Storage**: bucket `ricevute` e `archivio` **privati** ✓. Upload ricevute con validazione **server-side** di MIME (jpg/png/pdf) e dimensione (max 10 MB). [AUD-B2]
- **PayPal**: importo quota **hardcoded server** `20.00` (qualunque valore dal client è ignorato), donazioni validate server 1.00–500.00 EUR a due decimali, **currency EUR forzata**; **firma webhook verificata OBBLIGATORIAMENTE prima di ogni scrittura** (evento non firmato → 400, nessun side-effect); replay-safe. Postura eccellente. [AUD-C1]
- **Andreas**: `max_tokens` output limitato (500 pubblico / 800 auth), rate limit giornaliero server-side su tabella con `ip_hash` **SHA256** (IP non in chiaro), CORS con whitelist. **Le chat pubbliche NON vengono salvate** (persistenza solo per utenti autenticati) — privacy-positivo. [AUD-C2]
- **Dati in UE**: progetto Supabase in **eu-central-1 (Francoforte)**; Resend eu-west-1. [AUD-D2]
- **Cookie/storage**: unica chiave nostra `andreas_widget_seen` + `cc_cookie` (banner) + `embed_instagram`/`embed_youtube` (post-consenso). **Elenco combacia al 100% con la cookie policy.** Nessun cookie di tracciamento pre-consenso. [AUD-D3]
- **Performance base**: hero in `<picture>` WebP, asset `/_astro/` con `cache-control: public, max-age=31536000, immutable`, PayPal SDK caricato **solo** su `/tesseramento` e `/dona`, output `static` (nessun collo di bottiglia SSR). [AUD-E4/E5/E6]
- **SEO tecnico**: sitemap **solo apex** (no www, no netlify.app), canonical apex uniformi, redirect `www → apex` in **1 hop (301)**, `robots.txt` presente. [AUD-F2]

---

## 4. Piano fix proposto in 3 ondate

**Ondata 1 — sicurezza a rischio ~zero (subito)**
- AUD-A1 security headers (`public/_headers`, CSP in Report-Only) — non tocca codice applicativo.
- AUD-F2a 404 personalizzata · AUD-C2a cap input Andreas · AUD-B3 CORS whitelist su otp-*/send-email (con autorizzazione puntuale edge function).

**Ondata 2 — conformità privacy e testi legali** (chat web + Cristian scrivono i testi; Code implementa)
- AUD-D2 processor mancanti in privacy (Anthropic/PayPal/Google Fonts/Meta/YouTube) · AUD-D4 IP · AUD-D5 retention ricevute · AUD-D6 titolare in cookie-policy · kit legale M4.1.

**Ondata 3 — performance e rifiniture**
- AUD-E3 self-hosting font (anche privacy) · AUD-F2b Open Graph completi · AUD-B4a revoke SECURITY DEFINER da anon · AUD-B5 rate limit persistente/Turnstile · AUD-B4b/c cleanup DB (indici/policy) · AUD-C3 update dev deps.

---

## 5. Allegati
- `censimenti/D1_flussi_dati.md` — punti di raccolta dati (per kit legale)
- `censimenti/D2_processor.md` — terze parti effettive vs dichiarate
- `censimenti/D3_cookie_storage.md` — cookie/localStorage reali
- `censimenti/advisors_supabase.md` — output integrale advisors
- `lh-home.json` — Lighthouse home (mobile, headless locale): Performance **45**, Accessibilità **96**, SEO **100**; LCP 4.7s, TBT 2.660ms, CLS 0.002, 596 KiB. (PageSpeed API in quota esaurita per il 9/7 → misura via Lighthouse locale.)

---

*Fase 1 completata. Nessun fix applicato. In attesa dell'ok di Cristian, voce per voce o per ondata (Fase 2). I fix su edge function e sulle pagine legali richiedono autorizzazione puntuale come da brief.*
