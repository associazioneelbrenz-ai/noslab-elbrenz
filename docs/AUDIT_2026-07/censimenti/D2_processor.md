# Censimento D2 — Processor / terze parti effettivi vs dichiarati
_9 luglio 2026_

| Processor | Ruolo | Regione | Dati trattati | Dichiarato in /privacy? |
|---|---|---|---|---|
| **Netlify** | Hosting + log (IP nei log server) | (verificare regione log; edge globale) | traffico, IP nei log | ✅ Sì |
| **Supabase** | DB + Auth + Storage + Edge Functions | **eu-central-1 (Francoforte, UE)** | tutti i dati applicativi | ✅ Sì |
| **Resend** | Email transazionali | eu-west-1 (UE) | email destinatari, contenuto notifiche | ✅ Sì |
| **PayPal** | Pagamenti quota/donazioni | UE/USA | dati pagatore, importi | ❌ **NO — da aggiungere** |
| **Anthropic (Claude)** | Andreas (chat) + OCR ricevute | **USA** | testo domande, immagini ricevute | ❌ **NO — da aggiungere (critico GDPR: trasferimento USA)** |
| **OpenAI** | Embedding per RAG Andreas | **USA** | testo domande | ❌ **NO — da aggiungere** |
| **Google Fonts** | Caratteri (googleapis/gstatic) | **USA** | IP visitatore (pre-consenso) | ❌ **NO — + rilievo sentenza tedesca (AUD-E3)** |
| **Meta / Instagram** | Embed reel (solo post-consenso) | USA | solo dopo consenso lightbox | Parziale (sezione embed) — verificare |
| **YouTube (nocookie)** | Embed video (post-consenso) | USA | solo dopo consenso | Parziale — verificare |

**Divergenze (finding AUD-D2)**: `/privacy` cita 3 processor su ~9 effettivi. Mancano PayPal, Anthropic, OpenAI, Google Fonts, e vanno chiariti Meta/YouTube. **Anthropic e OpenAI comportano trasferimento USA** e sono il punto più rilevante da sanare nei testi (Fase 3).
