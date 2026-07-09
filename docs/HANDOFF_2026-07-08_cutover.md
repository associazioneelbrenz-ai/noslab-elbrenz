# HANDOFF — 8 luglio 2026 (sessione cutover & go-live)
**Sostituisce HANDOFF_DEFINITIVO_2026-07-08.md come documento di ripartenza. Da salvare in `docs/` del repo.**
Progetto: sito pubblico El Brenz · Astro 6 + Tailwind · repo `associazioneelbrenz-ai/noslab-elbrenz` · branch `main` · Supabase `wacknihvdjxltiqvxtqr` · Netlify `elbrenz-app` (site id `a8922ddb-53ec-4541-ac15-99570b61a1b2`)

## A. EVENTI DELLA GIORNATA — TUTTO VERIFICATO

### 1. CUTOVER DNS ESEGUITO E RIUSCITO (mattina, ~07:33–08:30)
- Gate pre-cutover chiuso: merge `wip/display-layer`→`main` (HEAD `15ef1ff`), 449 redirect 301 in `public/_redirects` (test 3/3 verdi: /lassociazione-2/, /sostenitori/, /2023/), deploy produzione da `main`.
- Aruba (dns-panel.aruba.it): `A @ → 75.2.60.5` (TTL 5 min) · `CNAME www → elbrenz-app.netlify.app` (TTL 5 min) · **record AAAA @ e www ELIMINATI** (erano `2a00:6d40:4:1::c326:28` — valore annotato per rollback) · vecchio `A www → 31.11.36.28` eliminato. MX/SPF/DKIM/DMARC/mail/pop3/smtp/imap/ftp/webmail/SRV: INTATTI.
- Nota Aruba: la pubblicazione della zona autoritativa (dns.technorail.com) arriva minuti DOPO la conferma del pannello — non è un errore.
- Netlify: domini `elbrenz.eu` + `www.elbrenz.eu` verificati, SSL Let's Encrypt emesso, sito live su https://elbrenz.eu.
- **DECISIONE: primary domain = apex `elbrenz.eu`** (www redirige ad apex). Motivo: canonical/og:url/sitemap deployati puntano all'apex. Ogni link pubblicato usa `https://elbrenz.eu/...` senza www. NON cambiare.
- Scoperta collaterale: su Aruba esistono GIÀ `resend._domainkey` (TXT) e TXT `send` con SPF amazonses → il task Resend (coda 1) è probabilmente solo una VERIFICA sul dashboard Resend, non una configurazione da zero.

### 2. COLLAUDO PAGAMENTI M2.6 — 4/4 VERDE ✅
1. ✅ Pagamento quota €20 live (7/7, capture `7BA10076FV6259001`)
2. ✅ Donazione €1 anonima (capture `0DX512335D448615L`, nome/cognome/email/payer_email NULL, anonimo=true)
3. ✅ Verifica DB (8/7 mattina via MCP)
4. ✅ Rimborsi eseguiti da Cristian dal dashboard PayPal (8/7 ~11:53) → **entrambe le righe aggiornate a `rimborsato` DAL WEBHOOK in autonomia** (updated_at 09:53:28/29 UTC) — catena firma→REFUNDED→riconciliazione certificata in live.
- ⚠️ **FLAG `PAGAMENTI_LIVE` ANCORA SPENTO**. Unico bloccante residuo: anomalia A2 (sotto).
- Righe test da eliminare al go-live (id espliciti, previa SELECT + ok Cristian):
  `5f7e12b9-e23b-47e3-9385-2ca35489d974` (quota rimborsata) · `7dd2cbe0-6f14-4f7c-9830-8c4d4bd2c7fe` (donazione rimborsata) · `f0994339-eb41-4ea1-9447-40741b713581` (ordine 'creato' abbandonato del 7/7 18:29 UTC)

### 3. ANOMALIE APERTE
- **A2 (BLOCCANTE go-live)**: pagamento quota test `completato` ma `domanda_id=NULL` e NESSUNA riga in `domande_tesseramento` per il test "Faldrake" (7/7 ~18:44 UTC). In produzione = quota incassata senza domanda da approvare né nominativo. Indagine e fix assegnati a Code (brief chiusura, Step 2): flusso modulo→domanda→ordine, log edge functions 7/7 18:30–19:00 UTC, fix da proporre a Cristian PRIMA di implementare.
- **A3 (autorizzata la rimozione)**: contenuto estraneo di Punto Riflesso in fondo a https://elbrenz.eu/andreas/ ("riflessologia... percorsi..."). Probabile Trappola 8. Blocco operativo già consegnato a Cristian per Code; rimozione esplicitamente autorizzata, limitata a quel contenuto.

### 4. GIÀ ANDATO LIVE OGGI (Code ha eseguito in giornata)
- **M3.0 widget Andreas**: FabAndreas apre pannello overlay (non più navigazione a /andreas), header verde con avatar, chat funzionante, fascia "Preferisci parlare con una persona?" con bottone "Scrivi al Segretario — Cristian" (wa.me/393396383790, messaggio precompilato), badge rosso "1" con localStorage `andreas_widget_seen`. **Bottone "Scrivi al Presidente — Diego" nel codice ma NON attivo: manca il numero** (consenso di Diego già registrato, riferito dal segretario 8/7; Diego va PRIMO nell'ordine).
- **M2.9-bis embed Seguici**: eseguito ma giudicato inadeguato da Cristian (chrome Meta, disallineamenti) → sostituito dal brief M2.9-ter (sotto).

## B. DECISIONI PRESE OGGI (vincolanti)
1. Primary domain = apex (v. sopra).
2. Sezione Seguici: **Opzione A per Facebook** = card brandizzata NOSTRA, zero iframe/Page Plugin. Migole = copertine statiche brandizzate + lightbox con embed reel al click.
3. Consenso contenuti terzi: agganciato al cookie banner (categoria "Contenuti di terze parti"), chiesto UNA volta e ricordato; EmbedConsenso come fallback dentro il lightbox.
4. **Deroga estesa** (8/7): embed pagina Facebook autorizzato — poi superato dalla scelta Opzione A: la card FB non usa alcun servizio Meta.
5. Widget Andreas: ordine contatti Presidente→Segretario; badge sparisce alla prima apertura e non ricompare.
6. Footer: credit "Sito sviluppato da NosLab" (link https://noslab.it) + pulsanti social SVG inline (FB, IG, YouTube, YouTube Music, Telegram predisposto commentato) — brief consegnato, esecuzione in coda.
7. Motto: grafia corretta «Raìs fonde no le 'nglacia» — verifica/fix nel task footer.
8. Reel migole scelti (embed: `/reel/{SC}/embed/`): DaK4JBVMQAE · DZe6NM8MxxI · DS5Vl-RjC84. Parametri `?igsh=` sempre omessi.
9. UT24: Manuela ha dato l'OK al cross-posting (contenta dei backlink) → import backlog dagli originali Gmail sbloccato.

## C. BRIEF PRODOTTI OGGI (file .md consegnati a Cristian per Code)
1. `BRIEF_M-CUTOVER_chiusura_8lug2026.md` — smoke E2E, **A2**, footer NosLab+Raìs, verifica 4/4 (già superata), go-live gated. + blocco A3 consegnato in chat. + `ADDENDUM_footer_social.md` (pulsanti social).
2. `BRIEF_M2.9bis_embed_migole_facebook.md` — SUPERATO da M2.9-ter per la parte estetica (gli URL reel restano validi).
3. `BRIEF_M2.9ter_redesign_seguici.md` — redesign Seguici: quadri+lightbox+consenso banner+card FB opzione A. ATTIVO.
4. `BRIEF_M3.0_widget_andreas.md` — ESEGUITO da Code (resta il micro-diff numero Diego).

## D. ORDINE DI LAVORO PER CODE (prossima sessione)
1. Brief chiusura: **A2** (bloccante) → A3 → footer (NosLab + social + Raìs)
2. Con A2 risolto + ok esplicito Cristian: **GO-LIVE** — flip `PAGAMENTI_LIVE` (localizzarlo prima: grep, potrebbe stare in `config_app`), pulizia 3 righe test, verifica box "Sostieni El Brenz" in home e /dona
3. M2.9-ter redesign Seguici
4. Micro-diff bottone Diego (quando arriva il numero)

## E. INPUT MANCANTI DA CRISTIAN
1. **Numero WhatsApp di Diego** (chiesto 3 volte 😄) → attiva il bottone Presidente
2. **3 immagini copertina reel** per M2.9-ter (screenshot dall'app IG; il redesign può andare live coi placeholder)
3. Test browser residui: domanda ad Andreas (fatta di fatto usando il widget), UN invio modulo contatti "TEST TECNICO"
4. Gruppo Telegram + prenotazione bot via @BotFather (`AndreasElBrenzBot`) — token SOLO nei Supabase secrets, MAI in chat
5. Dopo go-live: pubblicazione annuncio (la chat web prepara i testi con link https://elbrenz.eu/tesseramento) + invio mail a Manuela già nelle bozze Gmail (l'ok informale è comunque arrivato)

## F. CODA DOPO (ordine confermato)
1. Resend: VERIFICA dashboard (DNS forse già a posto, v. A.1) → sblocca tessere digitali + conferme
2. TESSERE_LIVE (dopo Resend + ok Cristian + recapito diretto Battistini)
3. Rubrica UT24: struttura (brief M2.8 in repo) + import backlog da Gmail a lotti
4. Photogallery + vignette (BRIEF M2.5)
5. Verbale CD 2/2026 da compilare/firmare; quota 20€ a verbale; ratifica Corradini; quote Daprà/Corradini (tessere 20-21)
6. i18n DE/EN Livello 1 (fine luglio)
7. Radar eventi F1 (seconda metà luglio) + bot Telegram Andreas 2.0 (verifica/notifica/controllo ecosistema, modello Daishi PR) — progetto da briefare quando si apre il cantiere
8. Post-RUNTS: statuto CTS, deposito PAT, PayPal non profit; Satispay fase 2

## G. REGOLE VIGENTI (invariate)
Additivo; `.bak`; diff minimi; zero dipendenze npm nuove; zero fetch client-side (eccezioni: SDK PayPal, chiamate andreas-chat esistenti, embed SOLO click-to-load/lightbox post-consenso); `astro check` 0 errori; account git `associazioneelbrenz-ai`; deploy/DNS solo Cristian; zone protette: edge functions, /archivio-digitale, nav, hero, cookie/privacy (salvo deroghe puntuali documentate). Email: Resend free 100/giorno, test "TEST TECNICO". Contenuti: motto in ladino mai tradotto nel markup; mai "dialetto"; Tirolo storico ≠ Tirol; hashtag #elbrenz #migoledestoria #storialocale + 2 geografici. PWA soci = progetto separato.
