# Report · Cruscotto del direttivo e separazione delle note — 27/8/2026

## Cosa è stato fatto

**Parte prima** — separazione fra `note` (registro del 1941) e `evento_motivazione` (motivazione redazionale nostra), già spostata a database: reso sulla scheda persona come due cose diverse (testo semplice senza etichetta per `note`, blocco "Nota di ricerca" distinto in coda alla scheda per `evento_motivazione`); il grado di certezza accanto al nome mostra la frase fissa solo quando non c'è già una motivazione sotto, per non ripetere "Il suo reparto risulta schierato…" due volte sulla stessa scheda.

**Parte seconda** — nuova pagina `/cruscotto`, quattro blocchi, promemoria settimanale `cruscotto-digest`. Le viste e le funzioni del §5 erano dichiarate "già fatte, non rifarle": verificarle prima di costruire la pagina (come impone la regola 0) ha trovato **quattro guasti reali**, tutti corretti con migrazioni additive, mai riscrivendo la logica originale oltre il necessario. Dettaglio sotto.

## I quattro guasti trovati verificando, non nominati dal brief

1. **`v_cruscotto_code` restituiva 0 per "domande di tesseramento"**, mentre la tabella vera ne aveva 4 aperte da 44 giorni. Causa: la RLS di `domande_tesseramento` richiede `has_ruolo_min(uid,50)` **e** una sessione con secondo fattore verificato (`aal2`) per l'accesso admin — corretta e voluta altrove, ma `v_cruscotto_code` è `security_invoker` e la eredita. Un ruolo 50 senza essersi rifatto il passo di verifica vedeva un elenco vuoto, non un errore: esattamente il sintomo che la regola 0 del brief descrive. Corretto con `cruscotto_conta_domande()`, funzione `SECURITY DEFINER` che restituisce solo il conteggio e la data più vecchia — mai nome, email, importo — con lo stesso gate a ruolo 50 del resto del cruscotto. La RLS di `domande_tesseramento` non è stata toccata.

2. **`cruscotto_funzioni()` falliva sempre**, errore SQL "column r.url does not exist". Non un refuso di nome: `net._http_response` non ha mai registrato quale URL è stato chiamato, e la sua tabella gemella che la url ce l'ha (`net.http_request_queue`) è una coda di lavoro transitoria — verificata vuota (0 righe) al momento del controllo, sempre svuotata a lavoro fatto. In più, i minuti di risposte rimasti in `net._http_response` sono un registro condiviso e non distinguibile fra sentinella-pagine (chiama pagine Netlify), radar-eventi (chiama API esterne dietro Cloudflare) ed eventuali funzioni edge nostre. Il vero registro delle chiamate alle edge function vive nei log di Supabase (Logs Explorer, backend ClickHouse), leggibile solo via API a finestre di 24 ore — mai da SQL dentro Postgres. Non è una funzione riscrivibile con una correzione minima: il dato che dovrebbe leggere non esiste in Postgres. Corretta seguendo lo stesso principio già scritto in `plancia_salute()` il 7/8/2026 (riga "Consumo Netlify"): restituisce una riga sola, onesta — "Dato non disponibile da Postgres — vedi il Logs Explorer di Supabase" — invece di un errore o di un elenco silenziosamente vuoto che si legge come "nessuna funzione chiamata" quando in realtà è "non lo sappiamo".

3. **`v_cruscotto_completezza` falliva su "Soci in regola collegati a un account"**: `permission denied for view v_soci_in_regola`. Quella vista contiene nome, email, importi incassati, motivi di deroga — dati personali e finanziari veri, giustamente senza grant per `authenticated`. Corretto con `cruscotto_conta_soci_regola()`, stessa forma della soluzione al punto 1: solo i due conteggi, mai la vista intera esposta.

4. **Il pulsante "segnato oggi" era bloccato per chiunque non fosse `super_admin`** — un ruolo nominale distinto dal livello numerico. Verificato sui due account reali con ruolo≥50: `info@elbrenz.eu` (ruolo 99) è `super_admin`, **Cristian stesso** (`cristian.bresadola@gmail.com`, ruolo 75, il segretario che ha autorizzato questo brief) non lo è. Senza correzione, l'unica persona per cui il cruscotto è pensato sarebbe stata esclusa dal proprio pulsante. Corretto con `cruscotto_segna_controllo(p_controllo)`, gate a ruolo 50, che scrive solo la chiave `cruscotto_controlli` di `config_app`, mai altre chiavi.

**Effetto collaterale trovato per strada**: tre "dove" su nove puntavano a rotte che non esistono (`/admin-domande`, `/admin-soci`, `/glossario`). Corrette a `/tesseramento-curatela` (le prime due: è lì che si revisionano le domande e si collegano i soci a un account) e `/glossario-console` (la terza).

**Per far girare il promemoria settimanale è servita un'altra correzione**: `cruscotto_lavori()` e `cruscotto_conta_domande()` controllano `has_ruolo_min(auth.uid(), 50)`, ma l'edge function del digest gira con client service-role — `auth.uid()` è `null` in quel contesto, quindi la stessa chiamata che funziona per un utente vero falliva sempre per il promemoria. Allargato il gate ad accettare anche `auth.role() = 'service_role'` (un contesto già fidato lato server, mai raggiungibile da un browser), senza toglierlo per gli utenti normali.

## Le quattordici verifiche, una per una

1. **Sì.** Sulla scheda live di tomba 179 (`/cimiteri-di-guerra/male/179-peter-stanku/`) il campo `note` non mostra nessun testo redazionale (`nota-registro-persona` non compare: `note` è vuota), e la motivazione compare sotto "Nota di ricerca", distinta.
2. **Sì.** Sulla stessa pagina la stringa «Il suo reparto risulta schierato» compare una sola volta nell'HTML prodotto.
3. **Sì.** Impersonando `info@elbrenz.eu` (ruolo 99, sessione realistica senza claim `aal2`): `v_cruscotto_code` → 4 righe; `cruscotto_lavori()` → tutti i 15 lavori pianificati; `cruscotto_funzioni()` → un elenco non vuoto (la riga onesta descritta sopra, non un errore); `v_cruscotto_completezza` → 5 righe.
4. **Sì.** Impersonando un curatore di ruolo 25: `cruscotto_lavori()` e `cruscotto_conta_domande()` sollevano entrambe "Il cruscotto e riservato al direttivo"; `/cruscotto` mostra di default lo stesso contenuto del vero 404 (verificato per costruzione: lo script rivela `#cru-app` solo se il ruolo confermato è ≥50, altrimenti la sezione resta nascosta e non parte nessuna chiamata dati).
5. **Sì.** `https://elbrenz.eu/cruscotto/` risponde 200 con lo stesso testo del 404 vero ("Questo sentiero non porta da nessuna parte"), `noindex, nofollow`, e non compare in nessuna delle sitemap generate.
6. **Sì.** "Domande di tesseramento aperte" è in cima all'ordinamento (in_allarme=true, giorni_ferma=44), sopra le altre tre code.
7. **Sì.** Tutte le otto rotte usate da "dove" rispondono 200 dal vivo: `/ascolta`, `/radar-eventi`, `/guardiani-curatela`, `/tesseramento-curatela`, `/glossario-console`, `/mappa`, `/cimiteri-di-guerra`, `/cimiteri-di-guerra/male`.
8. **Sì.** `v_cruscotto_completezza` ordinata per rapporto crescente: prima riga "Luoghi con il nome ladino validato", 0 su 58.
9. **Sì, verificato a livello di funzione con l'account reale del segretario** (non con un clic reale sul pulsante, che richiede una sessione browser che non ho da qui): `cruscotto_segna_controllo('advisor_sicurezza')` chiamata impersonando `cristian.bresadola@gmail.com` scrive `{"advisor_sicurezza":"2026-08-27"}` in `config_app`, rileggibile subito dopo con lo stesso account. La riga di prova è stata poi cancellata per non lasciare una verifica falsa in produzione: al primo vero clic la data sarà quella reale.
10. **Dichiarazione in config.toml: sì. Lavoro pg_cron: sì, attivo** (`cruscotto-digest-settimanale`, `0 8 * * 1`). **Esecuzione manuale: sì, consegna confermata** (HTTP 200, `inviato:true`) — ma con allarmi reali presenti oggi (tre code ferme, sette lavori mai eseguiti), non a zero allarmi: non ho potuto verificare dal vivo il testo "Nessun allarme…", solo per costruzione del codice (il ramo esiste ed è scritto correttamente). Sarà verificabile con i propri occhi al primo lunedì senza allarmi, o forzando `cruscotto_conta_domande()`/le code a zero — cosa che non ho fatto per non alterare dati reali.
11. **Sì.** Le pagine dei cimiteri mostrano ancora 102/15 nell'albo, "Centodiciassette sepolture registrate, centoquattordici uomini" nell'incipit — invariate.
12. **Sì.** `Header.astro` e il footer non compaiono in nessuno dei due commit di questo brief: zero diff.
13. **Non verificato.** Nessun dispositivo fisico o browser interattivo disponibile da questo ambiente: non posso dichiarare un clic reale su desktop o iPhone.
14. Vedi commit sotto. Le prove 3, 5, 6, 7, 8, 9, 10, 11 sono state ripetute in produzione dopo la build (dettaglio sopra, dove non già segnato "dal vivo").

## Il lavoro pg_cron creato

`cruscotto-digest-settimanale` — pianificazione `0 8 * * 1` (ogni lunedì alle 8:00), attivo, chiama `lancia_cruscotto_digest(p_esegui => true)`.

## Commit verificati su `origin/main`

```
dccf8a2 cruscotto: rilevatore di silenzi per il direttivo, con quattro guasti verificati e corretti in corsa
edd6c5f og: immagini di condivisione generate per tre eventi pubblicati di recente
56569a3 cimiteri di guerra: separazione fra note del registro ed evento_motivazione
```

Deploy pulito al primo tentativo per entrambi i giri (`netlify deploy --prod --build`, "Deploy is live!").
