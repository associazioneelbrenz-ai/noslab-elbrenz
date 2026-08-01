# Stato consolidato — sito e app, 2 agosto 2026

Fotografia di come stanno le cose dopo la sessione del 1-2 agosto, scritta per
non doverla ricostruire a memoria la prossima volta. Sotto, i prossimi passi.

---

## 1. Le fonti dei contenuti, una volta per tutte

È il punto che ha generato più confusione. Non esiste **una** fonte: ne
esistono tre, e ognuna serve un posto diverso.

| Contenuto | Dove vive | Chi lo legge |
|---|---|---|
| **Articoli** | `src/content/articoli/*.md` (114 file) | il **sito** (`/articoli`, `/articoli/<slug>`) |
| | tabella `articolo` (143 righe) | l'**app** e `/redazione` |
| **Nostri eventi** | `src/content/eventi/*.md` (2 file) | la **home del sito** |
| | tabella `evento` (1 riga: la gita) | `/eventi` blocco A, e l'**app** |
| **Eventi delle valli** | tabella `eventi_esterni` (20 righe) | `/eventi` blocco B, `/eventi/<slug>`, home del sito, **app** |

Misurato il 2/8: **i due corpus articoli non divergono**. 108 pezzi pubblicati,
gli stessi da entrambe le parti. Lo scarto apparente erano 27 righe
`tipo_contenuto = 'pagina'` (vecchie pagine WordPress, quindici col corpo
vuoto) e 6 bozze. Vedi `POSTMORTEM_2026-08-01_app-e-radar.md`.

**Regola pratica**: un pezzo scritto in `/redazione` nasce solo nel database.
Per portarlo anche sul sito si lancia `npm run articoli:esporta` (prova secca),
poi `node scripts/esporta-articoli-db.mjs --scrivi`, si rivede con `git diff` e
si alza `draft` a false. Lo script non sovrascrive mai un file esistente e non
esporta le `pagina`.

---

## 2. Gli eventi delle valli, dal radar alla pagina

Il flusso completo, dal portale del comune al post condiviso:

1. **Raccolta** — `radar-eventi-harvest` pesca dai portali aperti.
2. **Classificazione** — `radar-eventi-classifica` assegna punteggio e
   pilastro (Haiku + parole chiave deterministiche come pavimento). Un
   organizzatore nella lista `eventi_organizzatori_esclusi` **non blocca più**
   l'evento: aggiunge il flag `organizzatore_segnalato` e decide la curatela.
3. **Curatela** — `/radar-eventi`: `proposto → approvato` (livello ≥ 20), poi
   `approvato → pubblicato` (livello ≥ 50, direttivo). Due gradini, due
   persone, per disegno.
4. **Pubblicazione** — la vista `eventi_esterni_pubblici` espone solo
   `stato = 'pubblicato'`. Il filtro sta a database, non nel markup: un evento
   proposto non può comparire in pubblico nemmeno per errore.
5. **Uscita** — `/eventi` (calendario), `/eventi/<slug>` (scheda con JSON-LD e
   OG dedicata), carosello in home, carosello nell'app.

**Lo slug** è una colonna su `eventi_esterni`, riempita da trigger sulle righe
nuove: nessuno deve ricordarsene a mano.

**Le OG** le genera `npm run og:eventi`, agganciato al `prebuild`: ogni build
le rigenera, quindi non restano indietro rispetto a ciò che è stato pubblicato.
Se il DB non risponde o manca la chiave, il prebuild avvisa e **non** fa
fallire la build: restano le immagini già committate.

Due derivati per due mestieri:
- `<slug>.jpg` 1200×630 (~59 KB) → il meta `og:image`;
- `<slug>-card.webp` 560×294 (~9 KB) → la miniatura dei caroselli.

Servire la piena risoluzione nelle card costava 1,7 MB di home. Ora 181 KB per
tutti e venti.

---

## 3. La gerarchia visiva: i nostri contro le valli

Vale sia in home sia nell'app, ed è deliberata: segnaliamo gli appuntamenti del
territorio senza spacciarli per nostri.

|  | I nostri | Delle valli |
|---|---|---|
| Larghezza card | 360 px (app 258) | 280 px (app 214) |
| Bordo | oro doppio + ombra calda | filo sottile |
| Fondo | bianco | sabbia |
| Etichetta | `EL BRENZ` su oro | `DALLE VALLI` contornata |
| Copertina | immagine dell'evento | OG generata |
| Azione | CTA piena (iscrizione, countdown) | «Scopri →» |

Sulla scheda `/eventi/<slug>` la stessa distinzione è detta a parole in fondo,
per chi arriva da un link condiviso.

---

## 4. Aggiornamento in tempo reale

L'app ricarica eventi e articoli al ritorno in primo piano
(`visibilitychange` + `focus`) e ogni 60 s finché la pagina è visibile.

**Non si usa Supabase Realtime**, e non è una scorciatoia: la pubblicazione
`supabase_realtime` copre solo `forum_post`, `messaggio`, `notifica`.
Aggiungerci `eventi_esterni` non basterebbe, perché le sue RLS sono da curatore
e Realtime le rispetta: al socio comune non arriverebbe nulla. Un meccanismo
che sembra acceso e non lo è sarebbe peggio di non averlo.

---

## 5. Due deploy separati

| | Repo | Sito Netlify | Dominio |
|---|---|---|---|
| Sito | `noslab-elbrenz` | `a8922ddb-53ec-4541-ac15-99570b61a1b2` | elbrenz.eu |
| App | `elbrenz-community` | `8447c184-c98c-4e00-a198-65502903774b` | community.elbrenz.eu |

Un deploy lanciato dalla cartella del sito **non tocca l'app**. È la causa di
metà dei «ma non si vede niente» di questa sessione.

Il gate fra build e deploy del sito resta obbligatorio:
`grep -o 'SUPABASE_ANON = "[^"]\{0,12\}' .netlify/build/chunks/iscrizione_*.mjs`

---

## 6. Prossimi passi

### Decisioni che aspettano Cristian

1. **`v_articoli_pubblici` alla fonte.** Oggi la vista restituisce anche le 27
   `pagina` legacy; il filtro `tipo_contenuto = 'post'` è nell'app. Correggerlo
   nella vista è più pulito ma tocca un oggetto condiviso.
2. **La porta chiusa nel pannello Radar.** Il trigger a database consente al
   direttivo di riportare un `non_promuovibile` ad approvato; la edge
   `radar-eventi-azione` risponde 409 a qualunque stato diverso da `proposto`.
   Oggi quei casi si sbloccano solo da database.
3. **Le 27 pagine legacy.** Restano nella tabella `articolo` come `pagina`,
   quindici vuote. Vanno archiviate, cancellate o lasciate lì?
4. **Il 404 visto sul telefono.** Tutti i link app → sito rispondono 200:
   serve sapere quale schermata l'ha prodotto per chiuderlo.

### Lavoro pronto da fare

5. **Copertine agli 8 articoli che non ne hanno.** Nell'app la card resta un
   rettangolo grigio. Lo stesso generatore delle OG eventi può fare da
   ripiego: stesso stile, titolo dentro.
6. **Mediateca** è l'ultima casella «in arrivo» in Esplora. Eventi è stata
   sbloccata il 2/8.
7. **`curato_da` nullo su venti righe**: le approvazioni in blocco del 1/8
   sono passate da MCP con `auth.uid()` nullo.
8. **Notifiche push** (FCM): disegno parcheggiato, 4 decisioni aperte.

### Igiene

9. **I file `.bak` nel repo** sono decine, tutti non tracciati. Vanno o in
   `.gitignore` o nel cestino.
10. **`npm audit`** segnala vulnerabilità residue; DEBT-019b (`yaml --force`)
    è ancora aperto.
