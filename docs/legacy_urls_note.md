# Inventario degli URL del vecchio sito WordPress

**3 agosto 2026 · censimento. Nessuna regola di redirect scritta, come da brief.**

Il file è `docs/legacy_urls.csv`, 813 righe.

**[4 agosto 2026]** Il CSV ha una colonna in più, `istituzionale`, che marca
le pagine istituzionali del vecchio sito: 53 in tutto, di cui **33 senza
corrispondente**. Il criterio è in `docs/legacy_urls_criterio.md`.

---

## Come è stato costruito, e perché non dalla sitemap

Il brief chiedeva di scaricare `https://www.elbrenz.eu/sitemap.xml` e i suoi
figli. Non è più possibile: dopo il cutover DNS dell'8 luglio quell'host è il
sito nuovo, e `/sitemap.xml` risponde 404 dell'Astro. La sitemap di WordPress
non esiste più da nessuna parte in rete.

La fonte usata al suo posto è l'**Internet Archive** (CDX API,
`matchType=domain` su `elbrenz.eu`, tutte le catture, non solo le riuscite):
2.196 risorse archiviate, filtrate a 811 percorsi unici di tipo HTML, feed RSS,
XML e PDF. È una base più ricca di quanto sarebbe stata la sitemap, perché
contiene anche ciò che WordPress non dichiarava: paginazione, feed per articolo,
pagine allegato, gallerie.

A quegli 811 sono stati aggiunti a mano i 2 percorsi che il brief chiedeva
esplicitamente e che l'archivio non aveva catturato: `/page/11/` e `/page/12/`.
Le altre voci richieste erano già presenti: `/feed/`, `/page/2/`–`/page/22/`, le
sei edizioni di Os dal Nos, le gallerie `/photogallery/`.

**Il CSV ha due colonne in più** rispetto alle quattro chieste. `esito_oggi` è
il codice HTTP che l'URL restituisce adesso seguendo i redirect, `dove_atterra_oggi`
è la destinazione finale. Sono state aggiunte perché senza di esse l'inventario
dice quali URL esistevano ma non quali si sono persi, che è la domanda vera.
Tutti gli 813 URL sono stati interrogati uno per uno.

---

## Il risultato in una riga

**I 96 articoli del vecchio sito rispondono tutti 200 e atterrano
sull'articolo giusto.** La migrazione dei contenuti editoriali è intatta: non
c'è un solo articolo perso. Quello che si è perso è tutto il resto.

| tipo | totale | 200 | 404 | non verificato |
|---|---:|---:|---:|---:|
| articolo (`/YYYY/MM/slug/`) | 96 | **96** | 0 | 0 |
| archivio per data (`/YYYY/`, `/YYYY/MM/`, `/YYYY/MM/GG/`) | 85 | 85 | 0 | 0 |
| pagina allegato | 76 | 75 | 1 | 0 |
| feed RSS | 106 | 96 | 9 | 1 |
| paginazione | 97 | 73 | **21** | 3 |
| photogallery | 53 | 7 | **46** | 0 |
| pagina | 16 | 5 | **11** | 0 |
| pagina annidata | 103 | 3 | **32** | 68 |
| tag | 48 | 48 | 0 | 0 |
| categoria / autore / home / query | 64 | 56 | 4 | 4 |
| interno WordPress (`/wp-*`, `/xmlrpc`) | 69 | 9 | 57 | 3 |

I 76 «non verificati» sono percorsi profondi con caratteri che `curl` non ha
risolto: vanno ricontrollati a mano, non sono un esito.

---

## Che cosa risponde 404, in concreto

### 1. Le sezioni istituzionali del vecchio menù (33 pagine)

Sono la perdita più consistente, perché erano contenuto redazionale, non
impalcatura.

> **[4 agosto 2026] Sono 33, non 32.** Il conteggio precedente veniva dalla
> riga «pagina annidata» della tabella qui sopra, che resta giusta: le pagine
> *annidate* a 404 sono davvero 32. Ma fra le istituzionali morte c'è anche
> **`/territorio-e-cultura/`**, la radice della sezione, che nel censimento è
> classificata come `pagina` e non come `pagina-annidata`: contando sul tipo
> restava fuori, pur essendo la madre di dodici delle altre.
>
> Dal 4 agosto il CSV ha una colonna **`istituzionale`** che le marca una per
> una, e il criterio è scritto in `docs/legacy_urls_criterio.md`. Il numero da
> usare è **33**.

L'elenco:

- `/territorio-e-cultura/` e i suoi rami: castelli, malghe, musei, rifugi
  (Molino Ruatti, Museo Retico di Sanzeno, Ecomuseo di Peio, Museo della Guerra
  Bianca di Vermiglio, Biblioteca del Centro Studi a Terzolas, Museo della
  Civiltà Solandra, Castelfondo, Castel San Pietro, Altaguardia…)
- `/concorso-os-dal-nos/os-dal-nos-N-edizione-YYYY/` — tutte e sei le edizioni
- `/lassociazione-2/dalle-origini-a-giorni-nostri/`
- `/eventi-manifestazioni-progetti-2/attivita-2011/`, `-2013/`, `-2014/`
- `/storia/ricerche/`, `/progetti/…`, `/sostenitori/sostenitori/`
- `/glossary-2/`

Fuori dal conto delle 33, ma anch'esse a 404: **`/segheria-male/`** e
**`/copertina/`**. Sono pagine singole di contenuto, non sezioni
istituzionali, e la colonna `istituzionale` le marca `no`. Restano da
recuperare, ma appartengono al lavoro editoriale sugli articoli, non a quello
sulle sezioni.

Buona parte di questi contenuti oggi vive in forma diversa sul sito nuovo
(i musei nella mappa dei luoghi, Os dal Nos nella sua pagina, la storia
dell'associazione nelle pagine istituzionali), ma **con URL diversi e senza un
ponte**: chi arriva dal vecchio link o da Google trova il 404.

### 2. La paginazione dell'archivio: `/page/2/` … `/page/22/`

Tutte e ventuno rispondono 404. Erano le pagine che Google percorreva per
raggiungere gli articoli vecchi.

### 3. Le gallerie fotografiche (46 URL, 3 gallerie)

`/photogallery/anno-2012/commemorazione-del-beato-carlo-dasburgo-9-settembre-male/`,
`/photogallery/anno-2012/presepio-el-brenz-natale-2012-male/`,
`/photogallery/anno-2013/la-nossa-storia-n-piaza-21-luglio-male/`, ciascuna
moltiplicata dalle varianti NextGEN (`/nggallery/thumbnails/page/N`,
`/slideshow`). Tre eventi, non quarantasei: il numero è gonfiato dal plugin.

### 4. Nove feed e l'apparato WordPress

`/wp-login.php`, `/wp-admin/`, `/xmlrpc.php` e simili: 404 previsto e giusto.
Fra i 404 ci sono anche `/ads.txt`, `/app-ads.txt`, `/sitemap.html`,
`/atom.xml`, `/index.xml`, `/sitemap.rss`, che erano sonde di servizio.

---

## I redirect che già funzionano

Non c'è nessuna regola scritta per gli articoli: il sito nuovo ha semplicemente
gli stessi slug. La catena è `www.elbrenz.eu/2013/04/avanti-tutta/` → 301
sull'apex → 200 su `/articoli/avanti-tutta`. Verificato su tutti e 96.

Gli 85 archivi per data e le 75 pagine allegato atterrano su
`/archivio-storico`: non è l'articolo preciso, ma è una pagina utile e non un
404. Anche i 48 tag rispondono 200.

Nota sui **circa 7 slug divergenti** che il brief chiedeva di controllare: alla
prova dei fatti non ce ne sono. Tutti e 96 gli URL articolo del vecchio sito
risolvono all'articolo corrispondente. La divergenza fra nome del file markdown
e slug del database — che è cosa diversa — non produce URL rotti perché il sito
serve la pagina a partire dallo slug del database, che è quello storico.

---

## Cosa resta da decidere

Sono scelte di Cristian, qui non è stata scritta nessuna regola.

1. **Le 33 pagine istituzionali** (colonna `istituzionale = si` nel CSV, esito
   404): valgono un redirect verso il corrispondente attuale (i musei verso
   `/luoghi/…`, Os dal Nos verso `/os-dal-nos`), oppure sono contenuto da
   riscrivere e basta? Conviene partire da `/territorio-e-cultura/`: sotto di
   lei stanno diciotto delle trentatré.
2. **`/page/2/`–`/page/22/`**: un redirect secco a `/archivio-storico` chiude
   ventuno 404 con una riga sola.
3. **Le tre gallerie**: le foto esistono ancora da qualche parte? Se sì è
   materiale per il Portale della memoria, non per un redirect.
4. `/ads.txt` e `/app-ads.txt` erano probabilmente residui di un plugin, non
   roba nostra: verificare prima di dargli peso.
