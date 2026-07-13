# Runbook — Invio newsletter (broadcast) El Brenz

Edge: `newsletter-broadcast` (live, gated). Ogni email include automaticamente il
**footer di disiscrizione** firmato. I disiscritti sono già esclusi (flag spenti).
Codice: `supabase/functions/newsletter-broadcast/index.ts`.

**Destinatari automatici** = unione deduplicata di:
- `download_lead` con `consenso_newsletter = true`
- `guardiani_contributori` con `consenso_marketing = true AND marketing_double_optin = true`

---

## Prerequisiti (una tantum) — a cura di Cristian
1. **Impostare il secret** nei Supabase secrets:
   `supabase secrets set NEWSLETTER_BROADCAST_SECRET=<stringa lunga casuale> --project-ref wacknihvdjxltiqvxtqr`
   (generane una da >=32 caratteri, salvala in Keychain/Bitwarden, MAI in Notes.)

2. **I 39 contatti storici — attenzione GDPR.** Non vanno aggiunti d'ufficio alla
   newsletter: non hanno un consenso registrato. Due strade lecite:
   - **(consigliata) email di ricontatto con opt-in**: si invia loro UNA email che
     chiede di iscriversi (link a un modulo con consenso). Solo chi accetta entra
     tra i destinatari. Rispetta il GDPR.
   - oppure documentare una base giuridica idonea prima di includerli.
   Fammi sapere quale strada: preparo il flusso (modulo/tabella) di conseguenza.

---

## Uso (server-to-server; l'header col secret è obbligatorio)

Imposta in shell (NON committare il secret):
```bash
SECRET='<NEWSLETTER_BROADCAST_SECRET>'
URL='https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/newsletter-broadcast'
```

### 1. Conteggio destinatari (dry-run, non invia)
```bash
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -H "X-Broadcast-Secret: $SECRET" -d '{"dryRun":true}'
# -> {"ok":true,"dryRun":true,"iscritti": N}
```

### 2. PROVA a info@elbrenz.eu (obbligatoria prima del reale)
```bash
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -H "X-Broadcast-Secret: $SECRET" \
  -d '{"test":true,"subject":"Prova newsletter El Brenz","html":"<h1>Ciao dalle valli</h1><p>Contenuto di prova.</p>"}'
# invia SOLO a info@elbrenz.eu, col footer di disiscrizione reale.
```
Controlla in casella: resa, footer discreto in fondo, link di disiscrizione che
apre /newsletter/disiscrizione e funziona.

### 3. Invio reale (dopo OK e dopo aver visto la prova)
```bash
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -H "X-Broadcast-Secret: $SECRET" \
  -d '{"subject":"<oggetto>","html":"<contenuto HTML completo>"}'
# -> {"ok":true,"iscritti":N,"inviati":X,"falliti":Y}
```

## Note
- Il footer di disiscrizione è aggiunto in automatico: NON metterlo nell'html.
- `html` è l'HTML completo del corpo (usa stile inline; niente CSS esterno).
- Ritmo invii ~130ms/email (gentile verso Resend).
- Regola ferma: nessun invio reale senza OK di Cristian + prova a info@ vista.
