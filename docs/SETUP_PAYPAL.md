# SETUP PayPal — guida per Cristian (M2.6, 7 luglio 2026)

Stato: infrastruttura **deployata e funzionante in LIVE** (decisione di
Cristian del 7/7: sandbox saltata). Restano i passi manuali qui sotto.

## Cosa è già fatto (da Claude Code, 7 luglio)

- Tabella `pagamenti_tesseramento` su Supabase (RLS attiva, **nessuna** policy
  pubblica: scrivono solo le edge function col service role). Campi: tipo
  (quota/donazione), anonimo, nome/cognome/email, order_id, capture_id,
  importo, stato (creato/completato/rimborsato/negato), payer_email.
- Edge function deployate (progetto `wacknihvdjxltiqvxtqr`, `--no-verify-jwt`):
  - `paypal-create-order` — quota SEMPRE 20.00 EUR lato server; donazioni
    1,00–500,00 € validate lato server; donazioni anonime senza dati personali.
  - `paypal-capture-order` — cattura + registrazione a DB (idempotente).
  - `paypal-webhook` — verifica firma OBBLIGATORIA, riconciliazione idempotente.
- Secrets presenti: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
  `PAYPAL_ENV=live`. Il codice legge `PAYPAL_ENV`: con `sandbox` punta a
  `api-m.sandbox.paypal.com`, quindi la sandbox resta usabile in futuro.
- Smoke test superati: donazione 0,50 € → 400; ordine quota live creato
  (oauth ok, riga DB corretta, poi ripulita); webhook senza firma → nessuna
  scrittura.
- Frontend: `/dona` (donazioni, pagina NON linkata) e blocco quota su
  `/tesseramento` visibile solo con `?paypal=1`.
- Client ID pubblico verificato contro l'SDK (attenzione ai copia/incolla:
  la variante con "I" maiuscola è risultata corrotta).

## PASSO 1 — Configura il webhook su developer.paypal.com  ⚠️ DA FARE

1. Login su https://developer.paypal.com col conto Business dell'associazione.
2. Apps & Credentials → app **"El Brenz Tesseramento"** (Live) → sezione
   **Webhooks** → *Add Webhook*.
3. **Webhook URL**:
   ```
   https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/paypal-webhook
   ```
4. Seleziona SOLO questi eventi:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `PAYMENT.CAPTURE.DENIED`
5. Salva e copia il **Webhook ID** che PayPal mostra.
6. Inseriscilo nei secrets Supabase (terminale, account già autenticato):
   ```bash
   supabase secrets set PAYPAL_WEBHOOK_ID=<il-webhook-id> --project-ref wacknihvdjxltiqvxtqr
   ```
   (In alternativa: dashboard Supabase → Edge Functions → Secrets.)
   Finché manca, il webhook risponde 500 e NON scrive nulla — i pagamenti
   funzionano comunque via cattura diretta, manca solo la rete di sicurezza.

## PASSO 2 — Verifica pagamento ospite (carta senza conto)

Su paypal.com (conto Business) → Impostazioni account → Pagamenti sul sito
web → verifica che l'opzione di pagamento come ospite ("PayPal guest
checkout" / carte senza conto) sia attiva.

## PASSO 3 — Test reale (delibera: si testa direttamente in live)

1. **Quota 20 €**: apri https://elbrenz-app.netlify.app/tesseramento?paypal=1
   → nel PASSO 2 compare il riquadro PayPal → paga 20 € (con carta o conto).
   Poi Claude Code verifica su DB: riga `tipo=quota, stato=completato`,
   capture_id valorizzato.
2. **Donazione anonima 1 €**: apri https://elbrenz-app.netlify.app/dona
   → importo 1 € (campo libero) → spunta "Desidero restare anonimo" → paga.
   Verifica su DB: riga `tipo=donazione, anonimo=true` e nome/email/
   payer_email TUTTI NULL.
3. **Webhook**: dopo i pagamenti, controlla su developer.paypal.com →
   Webhooks events che gli eventi risultino consegnati (2xx).
4. **Rimborso di entrambi** dalla dashboard PayPal → il webhook deve portare
   le due righe a `stato=rimborsato` (verifica con Claude Code).

## PASSO 4 — Go-live pubblico (dopo il test)

Chiedi a Claude Code di:
1. flippare `PAYPAL_QUOTA_LIVE` a `true` in `src/pages/tesseramento.astro`
   (il riquadro PayPal diventa visibile a tutti);
2. linkare `/dona` da `/tesseramento` e dalla card Community in home;
3. build + deploy.

## Note di sicurezza

- Il **Client ID** è pubblico per design (sta nell'URL dell'SDK).
- Il **Client Secret** e il **Webhook ID** stanno SOLO nei Supabase secrets:
  mai in chat, mai nel codice, mai in variabili `VITE_`/`PUBLIC_`.
- L'importo della quota è hardcoded nella edge function: il client non può
  manipolarlo. Le donazioni sono validate server-side (1–500 €).
- Eventi webhook con firma non verificata: 400, nessuna scrittura a DB.
