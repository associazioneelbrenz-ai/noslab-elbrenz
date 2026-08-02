# Post mortem — 2 agosto 2026, Andreas: i blocchi e la quota del socio

Segnalazione di Cristian, con screenshot da iPhone: «Andreas spesso si blocca,
soprattutto quando non sa cosa rispondere. E in app, da socio, dà comunque solo
3 domande.»

Erano **quattro difetti distinti** che si presentavano come due sintomi.

---

## 1. Il socio in app trattato da anonimo — il difetto architetturale

**Catena verificata, pezzo per pezzo:**

1. L'app apre Andreas come **iframe** di `elbrenz.eu/andreas/embed`
   (`AndreasPopup.tsx`).
2. L'app vive su `community.elbrenz.eu`, l'embed su `elbrenz.eu`:
   **localStorage non attraversa le origini**.
3. Il widget (`andreas-chat.js`) cerca la sessione in `localStorage
   'elbrenz-auth'` — che nell'origine dell'iframe non esiste.
4. Nessun token → nessun header `Authorization` → l'edge instrada su
   `andreas_pubblico` → **3 domande per IP**, anche per un socio.

È lo stesso fenomeno del login web scoperto la mattina: la sessione non sta in
un cookie ma in localStorage, e localStorage è per-origine. Lì la conseguenza
era «dal sito non ci si autentica»; qui era «l'app autenticata non riesce a
dirlo all'iframe».

**Fix: il ponte della sessione**, tre pezzi tutti additivi.

- `AndreasPopup.tsx` (app): all'apertura del popup manda la sessione
  all'iframe via `postMessage`, **targetOrigin inchiodato a
  `https://elbrenz.eu`** così il token non può finire altrove. Doppio canale
  (risposta al segnale «pronto» + invio su load) perché l'ordine degli eventi
  non è garantito.
- `embed.astro` (sito): script inline **prima** del widget. Accetta messaggi
  solo da `https://community.elbrenz.eu` (e localhost:3000 per il dev), valida
  la forma, deposita la sessione in `window.__EB_EMBED_SESSION` ed espone la
  promessa `__EB_EMBED_WAIT` (si risolve all'arrivo della sessione o dopo
  500 ms, così l'embed aperto da solo parte comunque da anonimo).
- `andreas-chat.js`: `getAuthToken()` guarda prima `__EB_EMBED_SESSION`, poi
  localStorage; `init()` attende `__EB_EMBED_WAIT` se esiste. Fuori
  dall'embed le due variabili sono undefined e nulla cambia.

**Perché l'attesa**: il widget parte al DOMContentLoaded, il postMessage
arriva dopo. Senza la promessa, il benvenuto sarebbe stato composto da anonimo
anche per il socio: race condition classica, chiusa con handshake.

## 2. Il contatore diceva 3 a chiunque

`INITIAL_QUOTA: 3` era **cablato nel widget**, e il decremento era cieco
(`remainingQuota - 1`). L'edge però dice già la verità in ogni risposta:
`usage.msg_oggi` e `usage.limite` (3 pubblico, 5 ospite, 100 socio, −1 admin).

**Fix**: il contatore segue l'edge. A sessione presente parte neutro (nessun
numero finto), e dalla prima risposta mostra `limite − msg_oggi`. Con limite
−1 non mostra nulla. Il decremento cieco resta come ripiego se `usage`
mancasse.

## 3. Il «sta pensando» eterno

La fetch verso `andreas-chat` **non aveva timeout**. E il percorso più lento
dell'edge è proprio quello delle domande fuori KB: match vettoriale a vuoto →
secondo tentativo full-text → Claude senza contesto. Su rete mobile con cold
start, il tempo si allunga; se l'edge stalla, il «sta pensando» restava lì per
sempre. È esattamente il «si blocca quando non sa cosa rispondere».

**Fix**: `AbortController` a 75 secondi → messaggio d'errore onesto invece
dell'attesa infinita.

## 4. La bolla vuota

Se la risposta fosse arrivata vuota, il typewriter finiva subito e la bolla
restava lì, bianca, indistinguibile da un blocco (visibile in uno degli
screenshot). Non dovrebbe poter succedere (l'edge ha il suo fallback
«(risposta vuota)»), ma la UI ora ha la sua guardia: testo di cortesia con
`info@elbrenz.eu` al posto del nulla.

---

## Trovato strada facendo

- **«per Andreas senza limiti»** nella CTA del limite raggiunto
  (`andreas-chat.js`): la promessa che la decisione del 2/8 aveva bandito,
  sfuggita ai grep perché non usa la parola «illimitato». Sostituita con «100
  domande al giorno». La caccia a un divieto va fatta sul concetto, non sulla
  parola.
- **La CTA del limite non distingueva chi è già dentro**: a un socio che
  esaurisce le 100 domande proponeva di diventare socio. Ora il riquadro per
  chi è autenticato dice solo che il contatore riparte a mezzanotte.
- **Il benvenuto** faceva il pitch («3 domande gratuite... diventa socio») a
  chiunque, socio compreso. Ora il paragrafo compare solo per l'anonimo.

## Collaudo che resta a Cristian (da iPhone, browser reale)

1. App da socio → FAB Andreas → il benvenuto **non** deve dire «3 domande
   gratuite» e il contatore parte senza numero.
2. Prima domanda → il contatore deve dire **99 rimanenti** (o il numero vero).
3. Domanda fuori KB (es. un personaggio inventato) → risposta o errore
   entro ~75 secondi, mai «sta pensando» eterno.
4. Da Safari anonimo su elbrenz.eu → comportamento identico a prima
   (3 domande, pitch nel benvenuto).

## Lezioni

- **localStorage è per-origine**: è la seconda volta in un giorno che questa
  proprietà spiega un sintomo diverso. Ogni superficie che deve conoscere la
  sessione ha bisogno di un canale esplicito.
- **Un'attesa senza timeout è un blocco che aspetta di manifestarsi.**
- **I valori cablati mentono appena il contesto cambia**: il 3 del widget era
  giusto per il pubblico e falso per tutti gli altri ruoli.
- **I divieti si cercano per concetto**: «illimitato» era sparito, «senza
  limiti» no.
