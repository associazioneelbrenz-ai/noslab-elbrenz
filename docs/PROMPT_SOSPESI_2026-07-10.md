# PROMPT SOSPESI — 10 luglio 2026 (mattina)
**Per**: Claude Code · **Da**: Cristian · Esegui nell'ordine. Una decisione alla volta, gate espliciti, regole handoff invariate (additivo, .bak, astro check 0, deploy e invii li autorizzo io).

## STEP 1 — INGEST KB ANDREAS (lotti 1+2, piano prudente già approvato)
Token: leggi `INGEST_TOKEN` dalle variabili d'ambiente della sessione (NON chiedermelo in chat; se manca, fermati e dimmelo).
1. Lotto 1: `docs/kb-ingest/KB_INGEST_lotto1_Baratter.md` → crea la sorgente (Baratter, Athesia 2017) + chunk 1-14, **visibile_ospiti=false** (staging).
2. Lotto 2: `docs/kb-ingest/KB_INGEST_lotto2_Baratter.md` → STESSA sorgente (stesso sorgente_id), chunk 15-30, aggiorna n_chunks=30.
3. TEST: poni ad Andreas (via endpoint, come utente) le 7 domande di verifica (3 in fondo al lotto 1 + 4 in fondo al lotto 2) e **incollami le risposte integrali**.
4. STOP: attendi il mio ok sui chunk sensibili → poi flip `visibile_ospiti=true` + backfill editore/isbn/note_interne sulla sorgente.
5. Edge function andreas-chat: intoccabile, come sempre.

## STEP 2 — TESSERA: nuovo design QR → prova → batch
1. Completa il redesign QR della tessera (richiesta mia di ieri sera). Poi **nuova prova**: reinvia la tessera n.4 al mio indirizzo → STOP → attendi il mio ok sul rendering.
2. Al mio ok: **batch delle 18 restanti** — tessera_inviata=true SOLO a invio riuscito; casi email condivise già decisi: n.13 Nadia Pangrazzi → diegomagnoni@live.it; n.14 M.L. Battistini → monica_valentinotti@hotmail.it con riga di avviso nel corpo ("la tessera di Maria Luisa viene recapitata all'indirizzo di famiglia").
3. Report finale: tabella socio→esito. Nessun sollecito rinnovo prima del 31/12/2026.

## STEP 3 — CONVENZIONI: rifiniture di contenuto
1. Sostituisci lo schema-tipo fac-simile su /convenzioni/schema-tipo col **testo definitivo**: sezione B del file `KIT_convenzioni_soci_v1.md` (te lo metto in docs/; se non lo trovi, chiedimelo).
2. Le due righe seed NosLab e Punto Riflesso: quando ti passo i due benefici (una riga ciascuno), aggiornale — restano in stato 'proposta' fino a delibera CD.

## STEP 4 — DOCUMENTAZIONE (debito accumulato, chiudilo ora)
Aggiorna `docs/HANDOFF` (nuovo file datato 10/7) + `CLAUDE.md` con tutto ciò che è cambiato:
- Step C: PAGAMENTI_LIVE ratificato da Cristian il 9/7 dopo test E2E live → sistema tesseramento ufficialmente operativo
- TESSERE_LIVE = true (9/7); stato invii tessere
- Fix link HMAC nel path: applicato a convenzioni-proposta E scheda-domanda, testato
- Feature Convenzioni: tabella, vista pubblica, edge function, pagina+form, rate limit persistente IP hashato (deviazione dal brief, motivata), nav ON, card home
- Filigrana Aquila + credito PD in /crediti-e-licenze; card Sostieni redesign; widget M3.0 con Diego attivo
- DECISIONE ARCHITETTURALE: PWA soci = STESSO Supabase del sito (Cristian, 9/7) — supera la vecchia regola; repo/Netlify/subdominio separati
- KB Andreas: sorgente Baratter 30 chunk (stato staging/pubblico a seconda dello Step 1)
- Coda aggiornata: UT24 import (attende curatela lista), M4.0 audit, M6.0 PWA kickoff

## STEP 5 — AUDIT M4.0 FASE 1: completamento e report
L'audit è partito (hai già citato AUD-B5): **completalo** secondo il brief in docs/brief-2026-07-08/ e consegna `docs/AUDIT_2026-07/AUDIT_REPORT_2026-07.md` con executive summary, tabella findings per severità, "cosa è già sano", piano fix in 3 ondate, e i censimenti D1/D2/D3/D5 in `censimenti/` (servono per il kit legale). SOLA LETTURA: nessun fix senza mio ok. Se trovi qualcosa di attivamente sfruttabile: stop e segnalazione immediata del singolo punto.

## STEP 6 — RUBRICA UT24 (parte quando ti do la lista curata)
Quando ti consegno `UT24_backlog_candidati.md` spuntato: import del PRIMO LOTTO (~5 uscite) — testo dagli originali Gmail → `src/content/rubrica/` (schema M2.8, trilingue dove esiste, ladino primo, credito+logo+link UT24) → URL articolo su unsertirol24.com per ciascuna → build → screenshot → commit per lotto. ESCLUSA sempre "Pillole di benessere".

## IN CODA DOPO (non iniziare senza mio kickoff)
M6.0 PWA "Community del Brenz" (brief pronto, ricognizione fatta) · fix audit Ondata 1 · kit legale (testi dalla chat web sui censimenti) · radar eventi F1.
