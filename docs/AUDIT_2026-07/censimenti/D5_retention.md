# Censimento D5 — Retention: dichiarata vs applicata
_10 luglio 2026 · completa la Fase 1 (brief M4.0 §D5) · base per il kit legale M4.1_

| Categoria di dati | Dove | Retention dichiarata | Retention APPLICATA (meccanismo reale) | Divergenza |
|---|---|---|---|---|
| **Ricevute bonifico** (file) | bucket privato `ricevute` | 12 mesi (commento `ricevuta-ocr/index.ts:15`) | ❌ **Nessun meccanismo**: né cron né procedura documentata | **Sì — AUD-D5**: la policy esiste solo scritta |
| **Pagamenti** (quota/donazioni) | tabella `pagamenti_tesseramento` | non dichiarata in informativa | Conservazione illimitata (corretta per obblighi contabili ~10 anni) | Parziale: la conservazione decennale va **scritta** in privacy |
| **Domande tesseramento approvate** | `domande_tesseramento` | Libro Soci: obbligo di legge APS | Conservazione illimitata (corretta) | No, ma l'informativa deve citare il Libro Soci (D7) |
| **Domande respinte/scadute** | `domande_tesseramento` (stato `respinta`) | ❌ non definita | Nessuna cancellazione | **Sì**: definire termine (proposta: 12 mesi dal rigetto) |
| **OTP di accesso** | tabella `auth_otp` | — (dato tecnico) | ✅ **cron `cleanup_otp_hourly`** (`0 * * * *` → `cleanup_otp()`): pulizia oraria automatica | No — l'unica retention già APPLICATA |
| **Rate limit Andreas** (ip_hash SHA256 + giorno) | `ai_rate_limit_pubblico`, `ai_rate_limit` | — | ❌ Nessuna pulizia: le righe (solo hash, non IP in chiaro) si accumulano | Minore: dato pseudonimizzato; consigliato cron di pulizia > 30 gg |
| **Rate limit convenzioni** (ip_hash SHA256) | `convenzioni_rate_limit` / `convenzioni_rl_hit` | — | ❌ Nessuna pulizia automatica | Minore: come sopra |
| **Chat Andreas pubblica** | — | — | ✅ **Non salvata** (nessuna persistenza per ospiti) | No — privacy-positivo |
| **Chat Andreas autenticata** | `ai_conversazione`, `ai_messaggio` | non dichiarata | Persistente (account socio), nessuna scadenza | Sì: va dichiarata in informativa + eventuale cancellazione su richiesta |
| **Proposte convenzioni rifiutate** | tabella `convenzioni` | 12 mesi (dichiarato in D1) | ❌ Nessun meccanismo automatico | Sì: come ricevute, policy scritta senza applicazione |
| **Newsletter** (futura) | tabella `newsletter` | fino a disiscrizione | Feature non ancora attiva | — |
| **IP nelle mail al Direttivo** (contact-form) | casella info@elbrenz.eu (Gmail) | ❌ non dichiarata | Retention della casella email (indefinita) | **Sì — AUD-D4**: trattamento IP da dichiarare |
| **Log hosting** | Netlify | non dichiarata nel dettaglio | Retention gestita da Netlify (default ~30 gg) | Minore: citare in privacy come processor |
| **Email transazionali** | Resend (eu-west-1) | processor dichiarato ✓ | Retention gestita da Resend | No |

## Sintesi
- **Unica retention già applicata con meccanismo automatico**: OTP (`cleanup_otp_hourly` via pg_cron ✓ — pg_cron installato e funzionante nel progetto).
- **Dichiarate ma non applicate**: ricevute 12 mesi, proposte convenzioni rifiutate 12 mesi → serve cron di pulizia (pattern già disponibile: `cleanup_otp`).
- **Da definire e dichiarare**: domande respinte, chat autenticate, righe rate-limit, conservazione contabile pagamenti, IP nelle notifiche.
