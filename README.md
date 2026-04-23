# noslab-elbrenz

> **Rais fonde no le 'nglacia** · *Radici profonde non gelano*

Frontend ufficiale dell'**Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce** (fondata 21 dicembre 2009, sede in Malè, Trentino).

Il progetto custodisce e divulga il patrimonio storico, linguistico e culturale delle Valli del Noce — Val di Non, Val di Sole, Val di Rabbi e Val di Pejo — con particolare attenzione al **ladino anaunico** (*noneso, solander, rabies, pegaes*) e alla storia tirolese del territorio.

---

## Architettura

- **Sito pubblico** (`/`, `/articoli/[slug]`, pilastri editoriali) — prerenderizzato statico per SEO eccellente
- **Area soci** (`/app/*`) — PWA installabile con forum, archivio, chat, sala direttivo
- **Andreas** (`/andreas`) — assistente AI sulla cultura anaunica, accessibile al pubblico e ai soci con livelli differenziati

## Stack tecnico

- [Astro 6](https://astro.build) — framework principale
- [React 19](https://react.dev) — runtime delle islands interattive
- [Tailwind 4](https://tailwindcss.com) — styling
- TypeScript strict mode ovunque
- [Supabase](https://supabase.com) — backend (auth, DB, storage, edge functions, realtime)
- [Netlify](https://netlify.com) — hosting e deploy
- [`@vite-pwa/astro`](https://vite-pwa-org.netlify.app) — service worker attivo solo sulle rotte `/app/*`

## Sviluppo locale

Prerequisiti: Node.js 20+ e npm 10+.

```sh
# Clona il repository
git clone https://github.com/associazioneelbrenz-ai/noslab-elbrenz.git
cd noslab-elbrenz

# Installa le dipendenze
npm install

# Avvia il dev server
npm run dev
```

Il sito sarà disponibile su [http://localhost:4321](http://localhost:4321).

## Comandi disponibili

| Comando | Azione |
|---|---|
| `npm run dev` | Avvia il dev server su `localhost:4321` |
| `npm run build` | Costruisce il sito di produzione in `./dist/` |
| `npm run preview` | Anteprima locale del build di produzione |
| `npm run astro ...` | Esegue comandi della CLI Astro |

## Struttura delle cartelle

```text
/
├── public/              asset statici (immagini, favicon, font)
├── src/
│   ├── assets/          immagini importate nei componenti
│   ├── layouts/         layout Astro riutilizzabili
│   ├── pages/           rotte del sito (una pagina = un file)
│   └── styles/          CSS globale
├── astro.config.mjs     configurazione Astro
├── tsconfig.json        configurazione TypeScript (strict)
└── package.json
```

## Pilastri editoriali

I contenuti del sito seguono sei pilastri tematici:

1. **Storia delle Valli** — eventi, personaggi, feudi, Guerre Rustiche, Grande Guerra, Tirolo asburgico
2. **Lingua e ladinità** — etimologie, proverbi, poesie, progetto *Os dal Nos*
3. **Cultura materiale** — *stua*, mulini, fucine, architettura alpina
4. **Rievocazioni ed eventi** — gite sociali, serate storiche, presentazioni
5. **Identità e appartenenza** — ponti con catalani, occitani, ladini dolomitici; ricorrenze tirolesi
6. **Vita associativa** — tesseramento, lunari, pubblicazioni

## Contatti Associazione

- Sito: [www.elbrenz.eu](https://www.elbrenz.eu)
- Email: [info@elbrenz.eu](mailto:info@elbrenz.eu)
- Facebook: [@ASSOCIAZIONELBRENZ](https://facebook.com/ASSOCIAZIONELBRENZ)
- Instagram: [@elbrenzass](https://instagram.com/elbrenzass)

---

## Credit tecnico

Piattaforma realizzata **pro-bono** da **[NosLab S.a.s.](https://noslab.it)** — società di progettazione digitale con sede in Trentino, co-fondata da Cristian Bresadola e Giorgia Ferro. NosLab presta gratuitamente know-how, progettazione e sviluppo all'Associazione El Brenz come contributo al patrimonio linguistico e culturale delle Valli del Noce.

El Brenz è il primo lavoro pro-bono di NosLab S.a.s. — funziona sia come riconoscimento dovuto all'Associazione, sia come dimostrazione pubblica della qualità tecnica della società.

## Licenza

Codice: questo repository è pubblico a scopo di trasparenza. Contenuti editoriali, marchio, fotografie d'archivio e testi in ladino anaunico restano di proprietà dell'Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce.