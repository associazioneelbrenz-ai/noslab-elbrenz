# El *Brenz* dle Val del Nos

> *Rais fonde no le 'nglacia*
> — Radici profonde non gelano —

Piattaforma digitale dell'**Associazione Storico Culturale Linguistica El Brenz** delle Valli del Noce.

Sito pubblico editoriale + area soci PWA per la valorizzazione del patrimonio storico, linguistico e culturale ladino anaunico delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo).

---

## 🏔️ Il progetto

El Brenz è un'associazione di promozione sociale fondata il 21 dicembre 2009 a Malè (TN). Questa piattaforma nasce per dare alla lingua ladino-anaunica e al patrimonio culturale delle Valli del Noce una casa digitale permanente nel XXI secolo.

### Obiettivi

- Pubblicare articoli longform di divulgazione storica, linguistica e culturale
- Offrire un archivio digitale di documenti (con attenzione speciale alla Grande Guerra 1914-1918 e alle Insorgenze Tirolesi 1796-1810)
- Custodire la lingua ladino-anaunica in tutti i contenuti identitari
- Fornire ai soci un'area riservata per forum, discussioni, materiali
- Supportare il percorso del DDL n. 1539 (Sen. Patton) per il riconoscimento del gruppo linguistico ladino-retico della Val di Non

---

## 🛠️ Stack tecnico

| Livello | Tecnologia |
|---|---|
| Framework | Astro 6 |
| Runtime islands | React 19 |
| Styling | Tailwind CSS 4 (design tokens in CSS via \`@theme\`) |
| UI components | shadcn/ui (solo dentro islands) |
| Linguaggio | TypeScript strict |
| Backend | Supabase (auth, database Postgres, storage, edge functions) |
| Deploy | Netlify |
| PWA | \`@vite-pwa/astro\` (attivo solo su \`/app/*\`) |
| Bilinguismo | Astro i18n (IT + DE) |

---

## 🚀 Sviluppo locale

Prerequisiti: **Node.js 22+**, **npm 10+**, **Git**.

\`\`\`bash
# Clona il repo
git clone https://github.com/associazioneelbrenz-ai/noslab-elbrenz.git
cd noslab-elbrenz

# Installa dipendenze
npm install

# Dev server (http://localhost:4321)
npm run dev

# Build produzione
npm run build

# Preview build locale
npm run preview
\`\`\`

---

## 🗂️ Struttura del progetto

\`\`\`
noslab-elbrenz/
├── public/              # Asset statici (loghi, favicon, bandiera ladina SVG)
├── src/
│   ├── components/      # Componenti .astro e .tsx (islands)
│   ├── layouts/         # Layout condivisi
│   ├── pages/
│   │   ├── index.astro           # Home pubblica
│   │   ├── articoli/[slug].astro # Pagina articolo dinamica
│   │   ├── andreas.astro         # Andreas Pubblico (con island)
│   │   └── app/                  # Area soci (islands React)
│   ├── lib/             # Client Supabase, utils, costanti
│   └── styles/
│       └── global.css   # Tailwind + design tokens
├── astro.config.mjs
├── tsconfig.json
└── README.md
\`\`\`

---

## 🎨 Identità visiva

- **Motto**: *Rais fonde no le 'nglacia* (sempre in ladino anaunico)
- **Wordmark**: *El Brenz dle Val del Nos*
- **Palette**: verde foresta \`#1E2E26\` · crema caldo \`#F8F1E4\` · oro ambra \`#C8923E\`
- **Tipografia**: Playfair Display (display/titoli) · Source Serif (body) · Inter (UI)

Design system completo e regole di brand in \`src/styles/global.css\` e nel database Supabase (tabella \`config_app\`, categoria \`branding\`).

---

## 🤝 Partner tecnico

Piattaforma digitale realizzata **pro-bono** da **[NosLab S.a.s.](https://noslab.it)** — società di Cristian Bresadola e Giorgia Ferro, fondata il 23 aprile 2026. El Brenz è il primo progetto di NosLab.

---

## 📮 Contatti

- **Associazione**: info@elbrenz.eu · +39 347 107 7636
- **Sede**: Via Trento 40, II piano · 38027 Malè (TN) · C.F. 92019480224
- **NosLab S.a.s.**: info@noslab.it · https://noslab.it

---

*Rais fonde no le 'nglacia.*
