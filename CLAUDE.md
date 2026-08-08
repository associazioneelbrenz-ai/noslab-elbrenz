# CLAUDE.md — Istruzioni operative per Claude Code

> Questo file istruisce Claude Code sul progetto **noslab-elbrenz** (sito El Brenz APS). Va letto **prima** di qualunque task tecnico. Aggiornare quando cambiano stack, convenzioni, decisioni architetturali.

---

## Identità del progetto

**Repo**: `associazioneelbrenz-ai/noslab-elbrenz`
**Path locale**: `~/Sviluppo/noslab-elbrenz/`
**Cliente**: Associazione Storico Culturale Linguistica **El Brenz** delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo, Trentino)
**Founder + dev**: Cristian Bresadola (super_admin, unico developer)
**Owner Google + GitHub repo**: `associazione.elbrenz@gmail.com` / `associazioneelbrenz-ai`

Sito pubblico in produzione: **`https://elbrenz.eu`** (apex, dominio primario; cutover DNS eseguito l'8/7/2026; `www` redirige all'apex; `elbrenz-app.netlify.app` resta come alias Netlify).

---

## AGGIORNAMENTI 9-10 luglio 2026 (leggere: superano regole precedenti)

- **DEPLOY = SEMPRE Claude, in automatico.** Dopo ogni modifica al sito: build → commit → push → `netlify deploy --prod --dir=dist --site=a8922ddb-53ec-4541-ac15-99570b61a1b2` → smoke test su elbrenz.eu. NON lasciare il deploy a Cristian, NON chiedere. **Il DNS resta solo di Cristian.** (Supera "Deploy e DNS li fa solo Cristian".)
- **Pagamenti in produzione**: `PAGAMENTI_LIVE=true` (`src/lib/pagamenti.ts:14`) ratificato dopo test E2E live. Quota + donazioni operative. `TESSERE_LIVE=true` (secret). Annunci pubblici li fa Cristian, non Code.
- **PWA soci = LO STESSO Supabase del sito** (`wacknihvdjxltiqvxtqr`): decisione Cristian 9/7. Supera la regola "PWA = nuovo Supabase". Separati restano repo, progetto Netlify, subdominio (proposta `app.elbrenz.eu`).
- **Feature Convenzioni (M5.0 v2)** live: tabella `convenzioni` + vista `convenzioni_pubbliche` + edge `convenzioni-proposta` + pagine `/convenzioni` e `/convenzioni/schema-tipo`.
- **KB Andreas**: sorgente Baratter (Athesia 2017), 30 chunk, via nuova edge `ingest-chunks`. `andreas-chat` resta INTOCCABILE.
- **Link HMAC nelle email**: SEMPRE nel PATH, mai in query string (`=`+2 hex si corrompe in quoted-printable). Vale per scheda-domanda e convenzioni-proposta.
- Handoff corrente: **`docs/HANDOFF_2026-07-17.md`**.

---

## AGGIUNTA 27 luglio 2026 — due macchine, e i secret vivono nella build

- **Chiedere SEMPRE, a inizio sessione, su che macchina si sta lavorando.** Le
  postazioni sono tre e non sono equivalenti: **MacBook Air** (uso principale in
  settimana), **Mac Mini M4** (fine settimana), **sessione cloud** di Claude Code
  sul web. Non darlo per scontato.
- **La sessione cloud NON puo' deployare il sito** (verificato 27/7): la policy
  di rete blocca `elbrenz.eu` e `*.netlify.app` (403 alla CONNECT), quindi niente
  smoke test ne' collaudo da browser; e `.env.local` non c'e', quindi la build
  esce monca. Dal cloud si fanno diagnosi, lettura DB/edge via MCP, codice,
  commit, push, PR. Il deploy si fa da Air o Mac Mini.
- **Le `PUBLIC_*` sono inlined nella build, non lette a runtime.** Una build
  senza `.env.local` **riesce lo stesso** ma con anon key vuota: il gateway
  risponde 401 e la verifica socio della gita mostra al socio in regola
  l'upsell "non sei socio", in silenzio. Idem convenzioni, posti gita, popup
  locandina, chat Andreas. E i flag assenti valgono `false`, quindi spengono
  DE/EN, Google Wallet e Guardiani.
- **Gate obbligatorio fra `npm run build` e `netlify deploy`**:
  `grep -o 'SUPABASE_ANON = "[^"]\{0,12\}' .netlify/build/chunks/iscrizione_*.mjs`
  → se stampa `SUPABASE_ANON = ""` **fermarsi**, manca `.env.local`.
- **Netlify non builda da git** (`deploy_source: cli`): un push su `main` non
  cambia nulla in produzione finche' non si lancia il deploy da una macchina
  con i secret.
- Dettaglio completo e checklist di allineamento: **`docs/runbook-macchine-e-deploy.md`**.

---

## Stack tecnico (NON discutere senza ragione grave)

| Componente | Tecnologia | Note |
|---|---|---|
| Framework | **Astro v6.3.7** (Vite v5.4.21) | SSG + alcune route SSR via adapter Netlify |
| Adapter | `@astrojs/netlify` | edge functions per route dinamiche |
| Styling | **Tailwind CSS** (utility classes, no `<style>` scoped) | colori brand in tema |
| Backend | **Supabase** (project: `wacknihvdjxltiqvxtqr`) | auth + DB + storage + edge functions |
| Hosting | **Netlify** (site: `a8922ddb-53ec-4541-ac15-99570b61a1b2`, alias `elbrenz-app`) | drag-and-drop NO, sempre CLI |
| Email transazionali | **Resend** (custom SMTP per Supabase Auth + edge function send-email) | dominio `elbrenz.eu` da verificare DKIM/SPF/DMARC |
| AI assistant | **Anthropic Claude Haiku** via edge function `andreas-chat` | RAG su `andreas_kb_sorgente` |
| Cookie banner | `vanilla-cookieconsent@3.1.0` | bottom-left, z-50, GDPR compliant |
| Node | v24.14.1 | npm 11.11.0 |
| Git | 2.37.1 (Apple Git-137.1) | macOS Monterey 12.7.6 |

---

## REGOLA FERREA — non-negoziabile

> **Mai rimuovere nulla di ciò che è stato fatto e confermato funzionante. Solo aggiungere, oppure modificare chiedendo prima a Cristian.**

Vale anche quando il codice sembra migliorabile: niente rimozioni proattive, niente refactoring spontaneo. Questa regola NON significa "scrivere codice spazzatura": significa "non rompere ciò che funziona per inseguire la perfezione architetturale". Se vedi codice migliorabile, segnalalo come nota/commento `// TODO refactor` e prosegui, non rifare.

Quando devi modificare un file esistente:
1. Mostra prima il diff in commento (es. `// AGGIUNTA: <CookieConsent />`)
2. Salva sempre un backup `.bak` prima di scrivere modifiche
3. Esegui modifiche minime, non riscritture di blocchi grandi
4. Verifica con `diff originale.bak nuovo` che siano solo le righe attese

---

## Tono di voce El Brenz (per testi, commit message, commenti)

**Sì**: appassionato ma documentato, caldo e comunitario, curioso e divulgativo, rigoroso sulle fonti, accessibile nella forma. "Le nostre valli", "i nostri paesi", "la nosa storia".

**No**: sarcasmo pesante, polemica politica, schieramenti partitici, toni esclusivi verso chi non è nato in valle, revisionismi, legalese asettico, commenti personali sugli avversari storici.

### Regole linguistiche
- Italiano standard come lingua principale
- Termini in *ladino anaunico* in corsivo, traduzione fra parentesi alla prima occorrenza
- Mai "dialetto" in senso riduttivo — usare "parlata", "lingua locale", "ladino anaunico"
- Distinguere **Tirolo storico** (includeva Trentino fino al 1919) da **Tirol** (Land austriaco attuale)
- **REGOLA FERREA (Cristian, 27/7/2026): per la provincia di Bolzano si scrive SEMPRE "Südtirol"** (con la ü, umlaut), **MAI "Alto Adige"**. Es. "Giochi Medievali dell'Alto Adige" → "Giochi Medievali del Südtirol". Vale per sito, app e testo dentro le OG image. Attenzione: `Südtirol`, non "Sudtirol"/"Suedtirol". (I contenuti d'archivio migrati e le citazioni testuali si valutano caso per caso, non con find-replace cieco.)
- Nomi storici in grafia originale: Clesio, Gaismair, Andreas Hofer, Maria Teresa d'Austria, Beato Carlo d'Asburgo
- Date estese nel testo ("21 dicembre 2009"), compatte nelle didascalie ("21/12/2009")

---

## Vocabolario e architettura informativa

### Pilastri editoriali (riferimento per categorizzazione contenuti)
1. Storia delle Valli (Thun/Spaur/Nanno, Guerre Rustiche, Grande Guerra, Tirolo asburgico, catasto tavolare)
2. Lingua e ladinità (etimologie, proverbi, poesie, "Os dal Nos")
3. Cultura materiale (stua, mulini, fucine, utensili, architettura alpina)
4. Rievocazioni ed eventi
5. Identità e appartenenza (ponte con catalani, occitani, ladini dolomitici)
6. Vita associativa (tesseramento, lunari, pubblicazioni)

### Hashtag standard (per chi pubblica social)
- Sempre: `#elbrenz #migoledestoria #storialocale`
- Geografici (min 2): `#valdinon #valdisole #valdirabbi #valdipejo #vallidelnoce`
- Tematici on-demand: `#tirol #ladinoanaunico #nones #solander #rabies #pegaes #grandeguerra #asburgo #andreashofer`

---

## Struttura repo

```
~/Sviluppo/noslab-elbrenz/
├── src/
│   ├── components/
│   │   ├── BandieraLadina.astro
│   │   ├── BannerAndreas.astro    ← banner CTA in alto
│   │   ├── CookieConsent.astro    ← banner GDPR (DEBT-014, v2 bottom-left)
│   │   ├── FabAndreas.astro       ← FAB rotondo bottom-right z-30
│   │   ├── FirmaIstituzionale.astro
│   │   ├── Header.astro
│   │   ├── Wordmark.astro
│   │   └── andreas/               ← sotto-componenti chat Andreas
│   ├── content/                   ← collections Astro
│   ├── layouts/
│   │   ├── ArticleLayout.astro
│   │   └── Layout.astro           ← principale (head + body + footer)
│   ├── lib/
│   ├── pages/
│   │   ├── andreas/
│   │   ├── archivio.astro
│   │   ├── cookie-policy.astro    ← creata 26/05 (DEBT-014)
│   │   ├── cultura-materiale.astro
│   │   ├── eventi.astro
│   │   ├── index.astro
│   │   ├── lingua.astro
│   │   ├── privacy.astro          ← da aggiornare GDPR (Sprint 2)
│   │   ├── registrati.astro
│   │   ├── rievocazioni.astro
│   │   ├── storia.astro
│   │   └── tesseramento.astro     ← include contact-form
│   └── styles/
│       └── global.css
├── supabase/
│   └── functions/
│       ├── andreas-chat/          ← RAG + Claude Haiku
│       ├── contact-form/          ← email via send-email shared secret
│       ├── ingest-articoli/       ← popola KB Andreas
│       ├── ingest-doc/
│       ├── otp-request/
│       ├── otp-verify/
│       └── send-email/            ← gate Resend, X-Send-Email-Secret
├── public/
├── astro.config.mjs
├── package.json
└── README.md
```

---

## Workflow standard

### Pre-flight (sempre, prima di qualunque azione)
```bash
cd ~/Sviluppo/noslab-elbrenz
gh auth status                                # deve mostrare: Active account: true SU associazioneelbrenz-ai
git status                                    # working tree clean atteso
git log --oneline -5                          # capisci dove siamo
```

Se `gh auth status` non mostra `associazioneelbrenz-ai` come attivo:
```bash
gh auth switch -u associazioneelbrenz-ai
gh auth setup-git
```

### Dev locale
```bash
npm run dev   # Astro su localhost:4321 (o 4322 se 4321 occupata)
```

### Build + deploy prod
```bash
npm run build                                                              # genera dist/
netlify deploy --prod --dir=dist --site=a8922ddb-53ec-4541-ac15-99570b61a1b2
curl -I https://elbrenz-app.netlify.app                                    # verifica HTTP 200
```

### Edge function deploy (Supabase)
```bash
supabase functions deploy <function-name> --project-ref wacknihvdjxltiqvxtqr
```

---

## Trappole già evitate — NON ripeterle

### Trappola 1 — Apple Notes per secret
Notes corrompe base64 con smart-quote (token 32 byte = 44 char base64 diventa 46 char). Salva sempre i secret in **Keychain Access** (Applicazioni → Utility → Accesso Portachiavi → Archivio → Nuova nota sicura) o Bitwarden. **Mai in Notes**.

### Trappola 2 — Zip drag-and-drop su Netlify
Fragile, silenziosamente fallisce. Usa **Netlify CLI**:
```bash
netlify deploy --prod --dir=dist --site=a8922ddb-53ec-4541-ac15-99570b61a1b2
```

### Trappola 3 — Zip dalla cartella sbagliata
Se zippi `dist/`, ottieni `dist/index.html` nello zip → Netlify cerca `/index.html` e fa 404.
Comando giusto:
```bash
cd dist && zip -r ../deploy.zip . && cd ..
# il `.` finale è obbligatorio: significa "contenuto di questa cartella"
```
Verifica: `unzip -l deploy.zip | head -10` deve mostrare `index.html` come primo file in root.

### Trappola 4 — Multi-account GitHub
3 account configurati in keychain via `gh auth login`: `Faldrake` (personale), `associazioneelbrenz-ai` (corretto per questo repo), `NosLab-Sas`. Push fallisce con 403 se attivo è sbagliato.

### Trappola 5 — Apostrofi in commenti shell zsh
Il commento `# Configura l'account` rompe zsh: l'apostrofo apre stringa e attende chiusura → prompt `quote>`. Usa perifrasi senza apostrofo: `# Configura account utente`.

### Trappola 6 — Copia/incolla di output di chat come comandi
Mai copiare il prompt `$` di un altro terminal. Bash interpreta `$` come variabile vuota e i comandi falliscono in cascata. Seleziona SOLO i comandi, non output.

### Trappola 7 — Regex su file Astro che matchano JSDoc
Quando modifichi tag JSX in `.astro` via regex, usa pattern `^\s+<TagName` con flag `re.MULTILINE`, non solo `<TagName`. I commenti JSDoc del frontmatter (` * - <FabAndreas />`) altrimenti vengono matchati e modificati erroneamente.

### Trappola 8 — Confondere repo PR e El Brenz
Cristian lavora in parallelo su `noslab-intelligence` (Punto Riflesso APS) e `noslab-elbrenz` (questo repo). Hanno alcuni file con nomi simili (`Layout.astro`, `Header.astro`). Sempre verificare `pwd` e `git remote -v` prima di modificare.

### Trappola 9 — Edge function CORS multi-origin
Per il cutover, le edge function devono accettare sia `elbrenz.eu` sia `elbrenz-app.netlify.app` come origin. Verificate al 31/05: già OK. Se aggiungi nuove edge function, includile entrambe in `ALLOWED_ORIGINS`.

### Trappola 10 — Cookie banner CSS conflict
`vanilla-cookieconsent` ha CSS globale. Per evitare conflitti con FabAndreas (z-30 bottom-right), il banner è scopato a `#cc-main { --cc-z-index: 50; }` e posizionato `bottom left`. NON spostarlo a bottom-right senza testare.

---

### Trappola 11 — Commento sopra un import a metà frontmatter Astro
Un commento `//` immediatamente sopra un `import` collocato DOPO altre
istruzioni nel frontmatter di un file `.astro` rompe l'hoisting del
compilatore Astro: build fallita con `Unexpected "."` di esbuild e
posizione dell'errore FASULLA (indica una riga innocua). `astro check`
passa lo stesso, quindi il sintomo inganna. Regola: gli import dei file
`.astro` vanno tutti in testa al frontmatter, senza righe di commento
attaccate sopra se l'import non è in prima posizione. (Scoperta 7/7/2026,
bisezione su tesseramento.astro.)

### Trappola 12 — `supabase functions deploy` riaccende `verify_jwt`
Il deploy CLI di una edge function **rimette `verify_jwt=true`** (default) se la
function NON è dichiarata con `verify_jwt = false` in `supabase/config.toml`.
Il 20/7/2026 un deploy di `contact-form` ha così rotto il form pubblico per ~13
ore: il frontend chiama l'edge senza JWT → **401 al gateway su ogni invio**, con
un errore generico lato utente. Il curl all'edge NON lo vede (il 401 del gateway
si manifesta solo con la chiamata reale del browser, che invia l'apikey).
Regole:
1. Ogni function pubblica/server-to-server deve avere il suo blocco
   `[functions.<slug>]` con `verify_jwt = false` in `config.toml`. Già fatto per
   le 14 attuali; aggiungerne di nuove quando se ne creano.
2. **Dopo OGNI deploy di edge function**: `supabase functions list` e controlla
   la colonna `verify_jwt` contro l'atteso. Se una pubblica è tornata `true`,
   ridichiarala in `config.toml` e ridistribuisci (o correggi via MCP).
3. Lo smoke test di chiusura di qualunque lavoro che tocca un form è l'**invio
   reale dal browser**, non il curl.

### Trappola 13 — Graffe dentro un commento `{/* */}` in Astro

Un commento JSX che **contiene delle graffe** rompe la build: Astro le interpreta
come espressioni anche lì dentro. L'errore è `Expected ")" but found "$$render"`
con **posizione fasulla** (indica una riga che non c'entra), esattamente come la
Trappola 11.

```astro
{/* fra {T.di} e {firma(s)} manca lo spazio */}   ← BUILD ROTTA
{/* fra le due espressioni manca lo spazio */}    ← ok
```

Regola: nei commenti Astro **non si citano mai espressioni con le graffe**.
Si descrive a parole, oppure si usa un commento `//` nel frontmatter.
(Scoperta 8/8/2026, su `StorieChePortate.astro`: il commento che spiegava una
correzione ha rotto la build che quella correzione doveva sistemare.)

### Trappola 14 — Due espressioni accostate perdono lo spazio

`{T.di} {firma(s)}` non rende «di Monica V.» ma **«diMonica V.»**: fra due
espressioni adiacenti Astro non conserva lo spazio letterale. Vale ovunque si
accostino due `{...}`.

```astro
{T.di} {firma(s)}          ← esce «diMonica V.»
{T.di + ' ' + firma(s)}    ← corretto
```

Attenzione a NON risolverlo con un template literal come figlio diretto
(`{` + backtick + `}`): rompe il compilatore con lo stesso errore fasullo della
Trappola 13. La concatenazione è la via sicura.

Il difetto è invisibile a build verde e si vede solo nell'HTML prodotto: dopo
ogni modifica a un testo composto, `grep` sul `dist/` e leggere la stringa vera.

## Cose da NON fare mai

- ❌ Modificare il codice direttamente in produzione (anche se il sito è giù)
- ❌ Rimuovere file/funzioni "perché sembrano inutili" senza chiedere a Cristian
- ❌ Refactoring spontaneo del codice funzionante
- ❌ Esporre credenziali in `VITE_*` env (sono visibili al client)
- ❌ Hardcodare API keys in codice frontend
- ❌ Deploy senza build locale verificato prima
- ❌ Push diretto a main senza prima `git status` clean + `gh auth status` corretto
- ❌ Toccare i record MX/SPF/DKIM/DMARC su Aruba durante cutover (vanno SOLO i record A/CNAME)
- ❌ Riprodurre testi copyright (citarli con max 15 parole e link sorgente)
- ❌ Generare contenuti politici, polemici, o di tono escludente

---

## Debt tracker — riferimento corto (vedi `debt_tracker_2026-05-31.md` per dettaglio)

| ID | Status | Titolo breve |
|---|---|---|
| DEBT-001 | ⚠️ aperto | Bug Andreas response edge case (media) |
| DEBT-002 → 008 | ✅ chiusi | Sprint 1 hardening |
| DEBT-009 | ⏸ bloccato | Leaked password Pro-only |
| DEBT-010 | ⚠️ aperto | Extension citext/vector serve superuser |
| DEBT-011 | ⏸ skippato | Tier 3 multiple_permissive_policies |
| DEBT-012 | ✅ chiuso | Edge functions cleanup |
| DEBT-013 | ✅ chiuso | INGEST_TOKEN secret |
| DEBT-014 | ✅ chiuso 26/05 | Cookie banner GDPR |
| DEBT-015 | ⚠️ aperto | Meta SEO + OG + robots.txt |
| DEBT-016 | ✅ chiuso 31/05 | URL hardcoded (era già OK) |
| DEBT-017 | ✅ chiuso parz | npm update supabase |
| DEBT-018 | ⏸ cosmetico | Tab nano |
| DEBT-019 | ✅ chiuso parz | npm audit fix safe |
| DEBT-019b | ⚠️ aperto | yaml --force breaking change |
| DEBT-020 | ⚠️ aperto | TURNSTILE_SECRET_KEY missing |

---

## Riferimenti rapidi

- Sito prod: https://elbrenz-app.netlify.app
- Dashboard Netlify: https://app.netlify.com/sites/elbrenz-app
- Dashboard Supabase: https://supabase.com/dashboard/project/wacknihvdjxltiqvxtqr
- GitHub repo: https://github.com/associazioneelbrenz-ai/noslab-elbrenz
- Sito istituzionale (WP legacy in migrazione): https://www.elbrenz.eu

---

*Ultimo aggiornamento: 8 agosto 2026 (Trappole 13 e 14). Mantenere sincronizzato con HANDOFF e debt_tracker.*
