# La colonna `istituzionale` in `legacy_urls.csv`

Aggiunta il 4 agosto 2026, su richiesta di Cristian. Criterio: **pagine
istituzionali del vecchio sito**, cioè le pagine che l'Associazione aveva
scritto per raccontare sé stessa e il territorio, distinte dai contenuti
editoriali (articoli, gallerie) e dalle briciole tecniche di WordPress.

Serve a sapere **quali sezioni del vecchio sito sono morte senza un
corrispondente**, che è il punto di partenza del lavoro editoriale.

## Come è calcolata

Una riga vale `si` quando l'indirizzo:

1. comincia con una delle **sezioni istituzionali** del vecchio sito, prese
   dagli indirizzi veri e non immaginate: `/lassociazione`, `/sostenitori`,
   `/progetti`, `/concorso-os-dal-nos`, `/storia`, `/territorio-e-cultura`,
   `/eventi-manifestazioni`, `/glossary`, `/contatti`, `/statuto`,
   `/chi-siamo`, `/dove-siamo`, `/diventa-socio`, `/tesseramento`;
2. **non** è roba di WordPress (`/wp-content`, `/wp-admin`, `/wp-json`,
   `/.well-known`, `/xmlrpc`);
3. **non** è contenuto editoriale o navigazione (`/photogallery`, `/tag/`,
   `/category/`, `/author/`, `/feed`, `/page/`, `/comments`);
4. **non** è un file (`.xml`, `.txt`, `.json`, `.css`, `.js`, immagini);
5. **non** è una pagina-allegato. WordPress crea una «pagina» anche per ogni
   immagine caricata: si riconoscono dallo slug
   (`olympus-digital-camera`, `cropped-*`, `*-jpg`, `dsc_1234`). Non sono
   pagine del sito, sono file travestiti;
6. **non** ha una stringa di interrogazione.

## Cosa viene fuori

**53 pagine istituzionali** su 813 indirizzi, così ripartite per esito:
- **33** con esito `404`
- **13** con esito `non verificato`
- **7** con esito `200`

Le **33 senza corrispondente** (esito 404), per sezione:

| Sezione | Quante |
|---|---|
| `/territorio-e-cultura` | 18 |
| `/concorso-os-dal-nos` | 6 |
| `/eventi-manifestazioni-progetti-2` | 4 |
| `/glossary-2` | 1 |
| `/lassociazione-2` | 1 |
| `/progetti` | 1 |
| `/sostenitori` | 1 |
| `/storia` | 1 |

## Una nota sul numero

Nei brief precedenti si parlava di **32** pagine istituzionali senza
corrispondente. Con questo criterio ne risultano **33**. La differenza è
`/territorio-e-cultura/`, la radice della sezione: nel file è classificata
come `pagina` e non come `pagina-annidata`, quindi un conteggio fatto sul
tipo la lasciava fuori. È a tutti gli effetti una pagina istituzionale morta,
ed è per giunta la madre di dodici delle altre.

Il criterio esclude invece `olympus-digital-camera`, che un conteggio sul
tipo includeva: è la pagina-allegato di una fotografia, non una pagina.
