# OG gita — anteprima social dinamica

Le pagine `/gita-giochi-medievali-2026` e `/iscrizione` sono SSR (`prerender = false`) e
generano `og:description`/`meta description` con i posti reali dalla vista `v_posti_gita`
(fonte unica, la stessa della barra countdown in home; helper `src/lib/postiGita.ts`,
fail-safe → descrizione generica, mai 500). `Cache-Control: max-age=300` sulla risposta.

**Nota operativa.** Le anteprime social sono in cache lato piattaforma: per aggiornare il
numero mostrato su Facebook usare il **Sharing Debugger → Scrape Again**
(https://developers.facebook.com/tools/debug/). Consiglio d'uso: rifare lo scrape quando i
posti scendono **sotto 10** (massima urgenza percepita). WhatsApp/Telegram ricostruiscono
l'anteprima al primo invio del link e la tengono in cache per un po'.

**OG image.** `public/og/gita-ritterspiele-2026.jpg` (1200×630, JPG q82, ~115 KB): al momento
è un default generato dalla locandina (verde brand + titolo). Se Cristian ha una versione
grafica dedicata, sostituire il file con lo stesso nome e ridistribuire.
