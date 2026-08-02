# Questi file NON alimentano più il sito

**Dal 2 agosto 2026 il sito legge gli articoli dal database, non da qui.**

Se modifichi uno di questi `.md` non succede niente: la pagina pubblica non
cambia. È il tipo di trappola che fa perdere un pomeriggio, quindi sta scritto
grande.

## Dove si scrive adesso

In **`/redazione`**, che salva nella tabella `articolo` di Supabase
(`wacknihvdjxltiqvxtqr`). Da lì leggono, attraverso la vista
`v_articoli_pubblici`:

| Pagina | File |
|---|---|
| `/articoli` | `src/pages/articoli/index.astro` |
| `/articoli/<slug>` | `src/pages/articoli/[...slug].astro` |
| `/archivio-storico` | `src/pages/archivio-storico.astro` |
| Blocco «Ultimi articoli» in home | `src/pages/index.astro` |
| Caroselli dell'app | `elbrenz-community`, `src/lib/home.ts` |

La vista espone solo `pubblicato = true AND stato = 'pubblicato' AND
tipo_contenuto = 'post'`. Le pagine articolo sono SSR: un pezzo pubblicato si
vede subito, senza aspettare un deploy. **La home fa eccezione**, è generata al
build: il blocco «Ultimi articoli» si aggiorna al deploy successivo.

## Perché i file restano qui

Perché non si rimuove ciò che ha funzionato. Sono l'originale della migrazione
da WordPress e la copia di sicurezza del passaggio al database: se un domani
saltasse fuori che un testo a database è monco, l'originale è in questa
cartella e in dieci anni di storia git.

Un caso è già successo: `avanti-tutta.md` aveva 1491 caratteri di testo mentre
a database c'era «Contenuto in aggiornamento.», 34 caratteri. Il confronto
degli slug non poteva vederlo, perché gli slug coincidevano. È stato trovato
misurando il corpo di tutti e 108 gli articoli e riportato a mano nel database.
Sugli altri 107 lo scarto è rientrato nel fisiologico.

## Se serve il percorso inverso

`scripts/esporta-articoli-db.mjs` porta in markdown i pezzi del database che
qui non ci sono. Non sovrascrive mai un file esistente, salta le righe
`tipo_contenuto = 'pagina'` e scrive tutto `draft: true`. Serve come rete, non
come flusso ordinario.

## Il flag `archivio`

Esisteva solo nel frontmatter di questi file e distingue la sala di lettura
storica (`/archivio-storico`, 56 articoli) dalla produzione (52). Il 2/8 è
stato portato sulla colonna `articolo.archivio` e travasato. Se sposti un
articolo fra le due, si fa a database.

## Cosa NON è cambiato

- **Gli URL.** Nascevano dal nome del file, ora nascono dallo slug: sono stati
  confrontati uno per uno prima del passaggio, 108 contro 108, zero differenze.
  Nessun redirect è stato necessario.
- **`src/content/eventi/`**, che è un'altra cosa e alimenta ancora la home.
- **`src/content.config.ts`**, che descrive ancora questa collection: serve
  perché i file restino validi e leggibili.
