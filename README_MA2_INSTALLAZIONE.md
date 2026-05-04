# M.A.2 — Pagina /andreas (Astro)

Pacchetto da installare nel repo Astro del sito El Brenz.
Versione: **v0.1** del 02/05/2026 (M.A.2 build).

---

## 📦 Cosa contiene questo pacchetto

```
src/
├── pages/andreas/index.astro           ← pagina /andreas
└── components/andreas/AndreasChat.astro ← componente chat

public/
├── styles/andreas-chat.css             ← stile della chat
├── scripts/andreas-chat.js             ← logica vanilla JS
└── assets/branding/
    ├── logo/
    │   ├── logo-eb-master.png          (2048×2048, nero, regola ferrea: intoccabile)
    │   ├── logo-eb-crema.png           (2048×2048, crema su trasparente, per sfondi scuri)
    │   ├── logo-eb-512.png             (512, nero)
    │   ├── logo-eb-256.png             (256, nero)
    │   └── logo-eb-256-crema.png       (256, crema)
    └── andreas/
        ├── andreas-sorriso-master.png  (2048×2048, default)
        ├── andreas-pensa-master.png    (2048×2048, thinking state)
        ├── andreas-sorriso-hero.png    (512, per uso futuro)
        ├── andreas-sorriso-bubble.png  (256 circolare, avatar chat)
        ├── andreas-pensa-bubble.png    (256 circolare, "sta pensando")
        ├── andreas-sorriso-fab.png     (192, FAB galleggiante retina)
        └── andreas-sorriso-fab-small.png (96, FAB galleggiante)
```

---

## 🚀 Installazione (3 minuti)

### 1. Copia i file nel repo

Copia la struttura `src/` e `public/` di questo pacchetto **dentro** il tuo repo Astro, mantenendo i path. Se la cartella `src/components/andreas/` non esiste, viene creata.

⚠️ **Verifica path Layout**: in `src/pages/andreas/index.astro` l'import del Layout è:
```astro
import Layout from '../../layouts/Layout.astro';
```
Se nel tuo repo il Layout è in un'altra posizione, **correggi solo questa riga**.

### 2. Verifica props del Layout

Il file `index.astro` passa al Layout 3 props: `title`, `description`, `image`. Se il tuo `Layout.astro` ha nomi diversi (es. `pageTitle` invece di `title`), adatta. Apri il tuo Layout e controlla.

### 3. Test locale in modalità MOCK (zero config)

```bash
npm run dev
```

Vai su `http://localhost:4321/andreas` (porta default Astro). La chat funziona subito in **modalità MOCK** con 4 risposte simulate.

---

## 🔌 Passaggio a produzione (edge function reale)

Quando vuoi che la chat chiami davvero l'edge function `andreas-chat` v3 (la stessa già in produzione e validata 15/15 query), **non modificare il file JS**. Usa invece la configurazione runtime via `window.ANDREAS_CONFIG`.

Apri `src/components/andreas/AndreasChat.astro` e **prima** del tag `<script src="/scripts/andreas-chat.js">` aggiungi:

```astro
<!-- Config runtime — letta da andreas-chat.js -->
<script is:inline define:vars={{
  supabaseUrl: import.meta.env.PUBLIC_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
}}>
  window.ANDREAS_CONFIG = {
    MOCK_MODE: false,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
  };
</script>
```

Aggiungi nel file `.env` del repo Astro (o nelle variabili d'ambiente Netlify):

```bash
PUBLIC_SUPABASE_URL=https://wacknihvdjxltiqvxtqr.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<la-tua-anon-key>
```

Le variabili `PUBLIC_*` sono visibili al client (è ok per `anon_key`, è disegnata per essere pubblica come da convenzione Supabase).

---

## 🧪 Smoke test M.A.2

Dopo deploy in produzione, fai questi 5 test rapidi:

1. **Apri /andreas** → header verde foresta + logo EB visibile + Andreas welcome con `Bondì.` in oro corsivo.
2. **Click chip "Chi era Andreas Hofer?"** → vedi avatar che cambia da sorriso a pensa, 3 puntini animati, poi risposta in typewriter, poi card fonti espandibili.
3. **Domanda libera** ("Parlami della stua trentina") → l'edge function risponde con contenuto rilevante dal KB.
4. **Esaurisci 3 domande** → CTA verde con "Registrati / Diventa socio" appare. Composer disabilitato.
5. **Mobile (Chrome DevTools, 375px)** → tutto leggibile, niente overflow orizzontale, font input ≥16px (no zoom iOS).

Se uno di questi 5 test fallisce, **NON deployare** e segnala.

---

## ⚠️ Backlog noto (NON in questo pacchetto)

Lasciato fuori da M.A.2 per scope chiuso:

| Issue | Descrizione | Quando |
|---|---|---|
| **MA1-01..04** | Fix v4 ereditati da M.A.1 | Sessione separata futura |
| **Turnstile** | Anti-bot dopo 2 domande (TURNSTILE_SECRET_KEY non configurata) | Bypass mode accettato per V1 |
| **FAB galleggiante** | Bottone Andreas su tutto il sito | M.A.2.5 (sessione separata) |
| **Pagine /registrati e /tesseramento** | Le CTA puntano lì ma le pagine non esistono ancora | M.A.2.5 (sessione separata) |
| **Open Graph image dedicata** | Card 1200×630 per share social | Quando serve (oggi usiamo l'Andreas master quadrato) |
| **M.A.5 — Curation collaborativa lingua** | UI per super_admin/curatori per addestrare Andreas | Da formalizzare in roadmap fine sessione |

---

## 🔒 Regole ferree attive

1. **Logo EB intoccabile** → solo file ufficiali sopra. Mai ridisegnato.
2. **Andreas identità grafica fissa** → costume solandro, barba nera, cappello nero ripiegato a destra, piuma oro.
3. **Solo aggiunte, niente rimozioni** → questo pacchetto aggiunge file, non sostituisce nulla del Layout o degli stili globali esistenti.

---

## 📝 Note tecniche

- **Niente framework**: vanilla JS, peso ~14KB minified senza CDN. Marked + DOMPurify caricati lazy da CDN al primo uso (~60KB gzipped).
- **No localStorage**: ospiti non hanno persistenza cross-reload. GDPR-friendly.
- **Accessibilità**: `role="log"`, `aria-live="polite"`, focus management, contrasto AA verificato.
- **Responsive**: testato 320px, 375px, 768px, desktop.
- **Browser support**: tutti i browser moderni (Chrome, Firefox, Safari, Edge ultime 2 versioni).

---

## 🆘 Se qualcosa non funziona

1. **Pagina bianca** → controlla path Layout in `index.astro`.
2. **Stile assente** → verifica che `/public/styles/andreas-chat.css` sia stato copiato.
3. **Asset Andreas non visibili** → controlla che `/public/assets/branding/` esista nella build (Astro serve `/public/*` come root).
4. **Modalità MOCK ma volevi produzione** → `window.ANDREAS_CONFIG.MOCK_MODE` non è `false`, vedi sezione "Passaggio a produzione".
5. **Errore CORS chiamando edge function** → verifica nel dashboard Supabase che `andreas-chat` accetti origine del sito (`https://elbrenz.eu`).

Per altro: screenshot e vai con la prossima sessione.
