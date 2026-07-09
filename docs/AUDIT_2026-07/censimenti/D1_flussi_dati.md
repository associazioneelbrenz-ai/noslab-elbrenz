# Censimento D1 — Flussi di dati reali (dal codice, non dalle policy)
_9 luglio 2026 · base per il kit legale M4.1_

| Punto di raccolta | Dati raccolti | Dove finiscono | Chi processa | Retention |
|---|---|---|---|---|
| **Modulo tesseramento** (`/tesseramento`, edge `contact-form`) | nome, email, messaggio, data nascita, comune nascita, sesso; IP (in mail) | tabella `domande_tesseramento` (Supabase eu-central-1); notifica via Resend a info@elbrenz.eu | Supabase (host DB), Resend (email) | Libro Soci: obbligo APS; domande non approvate: da definire |
| **Modulo contatti** (stesso endpoint `contact-form`) | nome, email, messaggio, IP | mail a info@elbrenz.eu via Resend; INSERT domanda | Resend, Supabase | come sopra |
| **Upload ricevuta bonifico** (`ricevuta-ocr`) | file jpg/png/pdf (max 10MB), dati estratti OCR (importo, data, ordinante, causale, CRO/TRN) | bucket privato `ricevute` (Supabase); OCR via **Anthropic Claude Haiku** (USA) | Supabase, **Anthropic (USA)** | dichiarata 12 mesi (meccanismo da implementare — AUD-D5) |
| **Donazione PayPal** (`paypal-create-order`/`webhook`) | se anonima: **nessun dato personale nel nostro DB** (nome/email/payer_email NULL); tipo, importo, order_id, stato, timestamp | tabella `pagamenti_tesseramento` | PayPal (vede comunque i dati del pagatore), Supabase | obblighi contabili ~10 anni |
| **Quota tesseramento PayPal** | nome, cognome, email (se forniti), importo, order_id | `pagamenti_tesseramento` + link a `domande_tesseramento` | PayPal, Supabase | Libro Soci / contabili |
| **Chat Andreas pubblica** (`andreas-chat`) | testo domanda; **ip_hash SHA256** per rate limit | **NON salvata** per utenti pubblici; `ai_rate_limit_pubblico` solo hash IP+giorno | **Anthropic (USA)** per la risposta, OpenAI (embedding), Supabase | rate limit: per giorno |
| **Chat Andreas autenticata** | domanda + risposta, conversazione | `ai_conversazione`, `ai_messaggio` | Anthropic, OpenAI, Supabase | persistente (account socio) |
| **Proposta convenzione** (`/convenzioni`, edge `convenzioni-proposta`) | nome attività, categoria, località, beneficio, dettagli, url; **referente**: nome, email, telefono; IP hashato (rate limit) | tabella `convenzioni` (referente MAI pubblico; vista `convenzioni_pubbliche` espone solo campi attività); notifica a info@ + cortesia al referente via Resend | Supabase, Resend | proposte rifiutate: cancellate entro 12 mesi; convenzioni attive: durata del rapporto |
| **Newsletter** (futura) | email | tabella `newsletter` | Supabase, (invio Resend) | fino a disiscrizione |

**Note**: IP visitatore compare nella mail di notifica al Direttivo (`contact-form`) e nel rate limit. OCR e Andreas comportano trasferimento USA (Anthropic/OpenAI) → **da dichiarare** in informativa (AUD-D2).
