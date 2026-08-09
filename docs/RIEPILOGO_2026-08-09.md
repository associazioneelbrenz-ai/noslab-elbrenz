# Riepilogo · 8-9 agosto 2026

> Trenta commit sul sito, uno sull'app. Stato verificato in produzione, non a
> memoria: dove un numero non è stato misurato, è detto.

---

## Il filo, di nuovo

**Nessuna operazione può dichiarare un esito che non ha verificato**, e il suo
gemello scoperto in questi due giorni: **niente si costruisce senza la maniglia
per usarlo**. Due funzioni sono nate perfette e inutilizzabili — `link-pagamento`
e l'OCR — finché non è arrivato il pannello che le apre.

---

## 1 · Denaro e soci

**I link di pagamento esistevano già tutti** (`/integrazione/<codice>`,
`/paga-quota` firmato, `/rinnovo`, `/dona`) e nessuno sapeva come ottenerli: le
email mandavano a `/tesseramento` generico, e il pagamento arrivava senza nome.
È l'origine dei «pagamenti senza domanda collegata». Ora la plancia ha il
riquadro che, data una persona, dà l'indirizzo giusto **e dice perché quello**.
Sulle caselle condivise si ferma invece di indovinare.

**Comunicazioni partite**: 31 email per le quattro storie, 4 solleciti
dell'integrazione, la quota a Lorenzo Conci, l'invito a Roberta Zanella, il
sollecito a Everton. Tutte con ricevuta Resend.

Un errore mio: il primo invio delle 31 è fallito interamente (HTTP 422, tag nel
formato sbagliato). **L'outbox ha dichiarato l'errore invece di fingere il
successo** — se avesse segnato «inviata» all'accodamento, l'annuncio sarebbe
stato dato per ricevuto per settimane.

**Diego Magnoni era chiuso fuori dalla sua Associazione**: accedeva con `live.it`
mentre punti e lemmi stavano su `gmail`. Identità unite, account doppio rimosso
su sua richiesta, e la plancia ora segnala chi ha due account.

---

## 2 · Il lavoro delle persone, riconosciuto

**Simone Pangrazzi aveva due anagrafiche da contributore**: 45 lemmi pubblicati,
la classifica ne contava 15. Da 375 a 1.125 punti.

**Il trigger dei punti era solo su UPDATE**: un lemma nato già pubblicato non
pagava mai. Ne avevano fatto le spese Massimo Paternoster (4 lemmi), Cristian (2),
Marco Bertagnolli (2), Roberta (5). Corretta la causa e riconosciuti gli arretrati.

**«Socio» in classifica non era riservatezza**: era un nome mancante. Dieci
account su quattordici avevano nome e cognome vuoti mentre il nome vero stava nel
registro delle domande.

**E il nome aveva due fonti.** Il profilo leggeva i metadati dell'autenticazione,
che con l'accesso a codice non si scrivono mai: Monica apriva il suo profilo e
trovava «Socio». Ora l'app legge da `utente` e basta.

**Chi contribuisce prima di iscriversi non perde niente**: al primo accesso i
punti arretrati lo aspettano. Collaudato: Roberta riceverebbe 125 punti e il
distintivo all'istante.

---

## 3 · Il glossario diventa vivo

- **«La conosco anch'io»** su 106 schede. Sul termine non è un applauso: chi
  preme dice che quella parola si usa anche da lui e **dice da dove**. È l'inizio
  della mappa di diffusione, che nessun questionario scoprirebbe.
- **«Proponi una correzione»**, con il campo indicato e il pannello dove il
  curatore la legge. Non modifica il lemma: segna la proposta e lascia a una
  persona il gesto.
- **Le voci**: «da noi si diceva…». Non sono correzioni e stanno in una tabella
  loro, perché una testimonianza resta anche quando la scheda non cambia.
- **Il popup dei punti**, solo dopo che una proposta è andata a buon fine: l'unico
  momento in cui un invito non suona come una richiesta.

---

## 4 · Le due guardie che tacevano

`storia_guardia` e `donazione_guardia`, davanti a chi non riconoscevano,
**rimettevano i valori vecchi senza dire niente** e scrivevano `updated_at` lo
stesso. Chi promuoveva una storia leggeva «salvato» e non era vero.

Succedeva anche al capo dell'Associazione: da un canale senza JWT `auth.uid()` è
nullo e il super admin risulta un estraneo.

Ora sollevano un errore, ma **solo se si è davvero provato a toccare i campi
protetti**. E il messaggio nomina il caso del canale senza sessione, che è quello
che ha fatto perdere più tempo.

---

## 5 · Modificare il pubblicato, e l'OCR

Cercando come dare ai curatori il diritto di correggere, ho scoperto che
**ce l'avevano già**. Mancava la traccia: chi ha cambiato cosa, e cosa c'era
prima. Non serve a sorvegliare i curatori, serve a poter dire a chi ha
contribuito che cosa è stato cambiato, e a tornare indietro.

**L'OCR** trascrive le pagine fotografate, ma il testo **non si pubblica da solo**:
sulla stampa dell'Ottocento sbaglia gli accenti e spezza le parole, e una
trascrizione infedele spacciata per fedele è peggio di nessuna. Costo registrato
a immagine, tetto mensile in `config_app`, e la pagina `/trascrizioni` dove una
persona rilegge e conferma.

*Non collaudato*: la qualità dell'estrazione su una pagina vera. Serve una
sessione da curatore.

---

## 6 · L'audit, e tre difetti veri

1. **Una vista definer scavalcava la RLS della sua tabella** (difetto mio):
   qualunque socio poteva leggere chi ha cambiato cosa nei contenuti. È lo stesso
   meccanismo che il 7 agosto ha reso *sicura* la revoca delle letture anonime:
   lì aiutava, qui faceva danno. Regola ricavata: **vista pubblica → definer,
   vista riservata → security_invoker**.
2. **`lancia_guardiani_digest` era eseguibile da chiunque** e fa partire un
   Telegram vero al direttivo. Bastava conoscerne il nome. Revocate 23 funzioni;
   lasciate `has_ruolo*` (girano dentro le politiche RLS) e `tessera_verifica`.
3. **Dieci link 404 in tedesco e inglese**, fra cui il percorso di adesione.

Sano: zero email in errore, zero notifiche fallite, zero pagamenti orfani, zero
numeri di socio doppi, sette cron su sette puliti, nessun `verify_jwt` riacceso
dopo sette deploy.

---

## 7 · SEO e visibilità

- **Tre home con lo stesso titolo**, in italiano: Google le vedeva come duplicati.
  Ora zero duplicati.
- **La parola spariva dal risultato**: le schede del glossario avevano titoli da
  126 caratteri, e il termine — l'unica cosa che distingue quella pagina dalle
  altre 105 — finiva tagliato. Media da 126 a 56.
- **Dati strutturati dal 62% all'82%**, con l'entità dell'Associazione (indirizzo
  vero, codice fiscale, valli servite, lingue, social) ereditata da ogni pagina
  indicizzabile. Non emessa sulle `noindex`: sarebbe un segnale contraddittorio.
- **Tedesco e inglese accesi.** Erano `noindex`, cioè invisibili. Il tedesco è
  scritto bene, non è traduzione automatica. Restava «Accedi» in italiano nella
  cornice: ora *Anmelden* e *Sign in*.
- **Il predefinito invertito**: acceso salvo spegnimento esplicito, perché
  `.env.local` non viaggia con git e la prima build dal Mac Mini avrebbe fatto
  sparire sedici pagine da Google **in silenzio**.

*Da dire*: sono 8 pagine per lingua contro 41 italiane, e la revisione di
Brunella non è mai avvenuta. Accendere le rende visibili, non complete.

---

## 8 · Contributi: l'italiano sì, il ladino no

Quattro lemmi con errori veri, tutti di Diego: `Lutigare → Litigare`,
`costodita → custodita`, `chiaccherone → chiacchierone`, e un esempio che diceva
«attendo che viene» dove il ladino dice «Varda».

**Le forme dialettali non sono state toccate.** Un lemma scritto come il
contributore lo dice *è il dato*: correggerlo distruggerebbe la testimonianza.

Le sette correzioni sono nel registro con prima e dopo — il primo uso vero della
traccia costruita poche ore prima.

---

## Due trappole nuove nel CLAUDE.md

**13** — graffe dentro un commento `{/* */}` in Astro rompono la build con
posizione fasulla. Scoperta nel modo più istruttivo: il commento che spiegava una
correzione ha rotto la build che quella correzione doveva sistemare.

**14** — due espressioni accostate perdono lo spazio: `{T.di} {firma}` rende
«diMonica V.». Invisibile a build verde, si vede solo nell'HTML prodotto.

---

## Aperto

- Qualità dell'OCR su una pagina vera (serve una sessione da curatore)
- 35 pagine SSR: 10 devono restare, 25 possono diventare statiche una per una
- 22 soci approvati su 30 senza account nell'app
- La revisione di Brunella per il tedesco
- Gli incassi in contanti dei quattro solleciti, da registrare in prima nota
- Il giro di allineamento del Mac Mini
