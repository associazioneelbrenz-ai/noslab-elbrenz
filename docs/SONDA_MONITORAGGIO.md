# Sonda di monitoraggio ecosistema

GitHub Action (`.github/workflows/sonda.yml`) che ogni 15 minuti verifica che
l'ecosistema El Brenz risponda. Nata dopo l'incidente del 20/7/2026 (form
pubblico rotto per ~13 ore da un `verify_jwt` riacceso, 401 al gateway): questa
sonda quel guasto lo avrebbe visto in 15 minuti.

## Cosa controlla (ogni 15 minuti)

1. `GET https://elbrenz.eu` → 200
2. `GET https://community.elbrenz.eu` → 200
3. `POST contact-form` con `_honeypot` COMPILATO → 200 **o** 429
4. `GET` di un articolo campione (ddl 1539) → 200

## Perche' il honeypot

Il campo `_honeypot` compilato fa rispondere alla funzione **200 in silenzio**,
SENZA inviare email ne' creare domande (e' la trappola anti-bot). Cosi' il probe
prova l'**intera catena gateway + funzione** senza effetti collaterali. E'
esattamente il percorso che il 20/7 rispondeva 401: un `curl` semplice all'edge
NON lo vede (il 401 del gateway si manifesta solo con la chiamata reale che
porta l'apikey), questo probe si'.

Perche' si accetta anche **429**: la sonda gira 4 volte l'ora e il rate limit di
`contact-form` e' 3/ora per IP; se scatta, la funzione risponde comunque (429),
il che prova che la catena regge. Solo `401/403/5xx/timeout` = guasto.

## Notifiche (anti-spam)

- Alla **prima** rottura: apre UNA issue con etichetta `sonda:down` e manda UNA
  notifica al gruppo Telegram del direttivo.
- Finche' resta rotto: **nessuna** nuova notifica (lo stato vive nella issue).
- Al **rientro**: chiude la issue e manda UNA notifica di rientro.

La notifica va **diretta all'API Telegram**, non passa da Supabase: una sonda
non deve dipendere da cio' che monitora.

## Secret da configurare (GitHub → Settings → Secrets and variables → Actions)

| Secret | Valore |
|---|---|
| `SUPABASE_ANON_KEY` | la chiave anon pubblica (quella del frontend) |
| `TELEGRAM_BOT_TOKEN` | token del bot (@andreas_elbrenz_bot o un bot dedicato sonda) |
| `TELEGRAM_CHAT_ID` | id del gruppo direttivo |

Senza `TELEGRAM_*` la sonda gira lo stesso (crea/chiude le issue), ma non manda
messaggi Telegram: lo segnala nei log del run.

## Provare che funziona

- Da **Actions → Sonda ecosistema → Run workflow**, spunta *"usa un URL
  sbagliato"*: forza un fallimento controllato → deve arrivare la notifica
  Telegram e comparire la issue. Un run normale successivo la chiude e manda il
  rientro.

## Tacitarla in manutenzione

- **Tutta**: Actions → Sonda ecosistema → **Disable workflow**.
- **Solo le notifiche** durante un guasto noto: aggiungi l'etichetta
  `sonda-muta` alla issue `sonda:down` aperta. La sonda continua a girare ma non
  notifica (ne' down ne' rientro) finche' l'etichetta c'e'.
