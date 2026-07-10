# Allegato — npm audit
_10 luglio 2026 · `npm audit` / `npm audit --omit=dev` · nessun fix applicato (Fase 1 sola lettura)_

**Totale: 27 vulnerabilità (6 low, 18 moderate, 3 high).**

## ⚠ Aggiornamento rispetto alla prima misura (9/7)
Il 9/7 la catena vulnerabile era interamente in devDependencies. Il 10/7 risultano pubblicate advisory che toccano anche **dipendenze di produzione**:

| Pacchetto | Severità | Advisory | Rilevanza reale |
|---|---|---|---|
| **astro** (≤7.0.0-beta.6) | **HIGH** | XSS via unescaped attribute names in spread props (GHSA-jrpj-wcv7-9fh9); Host header SSRF in prerendered error page fetch (GHSA-2pvr-wf23-7pc7) | Framework in produzione. L'XSS richiede spread props con nomi attributo non fidati (pattern non usato nel nostro codice); l'SSRF riguarda il fetch della pagina errore in deployment SSR (noi abbiamo route SSR via adapter Netlify) → **da aggiornare** |
| **@astrojs/netlify** | moderate | Broadens `image.remotePatterns` in Netlify Image CDN config (GHSA-529g-xq4f-cw38) | Adapter in produzione → da aggiornare |
| **vite** (7.0.0–7.3.3) | HIGH | NTLMv2 hash disclosure (Windows) via launch-editor; `server.fs.deny` bypass (Windows) | Solo dev server, solo Windows → impatto reale nullo (dev su macOS) |
| **esbuild** (0.27.3–0.28.0) | moderate | Arbitrary file read dev server (Windows) | Solo dev, solo Windows |
| **@babel/core** (≤7.29.0) | low/mod | Arbitrary file read via sourceMappingURL | Toolchain build |
| **@opentelemetry/core** + catena @netlify/* | moderate | Unbounded memory allocation (W3C Baggage) | Telemetria runtime Netlify |
| **js-yaml**, **yaml**, **tar**, **tmp** | moderate/high | DoS/parsing/path traversal | Toolchain dev/CLI (tmp HIGH: path traversal, usato da tooling locale) |
| **yaml → yaml-language-server → @astrojs/language-server** | moderate | Stack overflow su YAML annidato | Solo editor tooling (già DEBT-019b) |

## Valutazione
- **Nessuna vulnerabilità sfruttabile dal traffico del sito pubblicato** con i pattern di codice attuali; il rischio è concentrato su toolchain e su scenari (Windows dev server) che non ci riguardano.
- Le due advisory su **astro** e **@astrojs/netlify** riguardano però pacchetti di produzione: **AUD-C3 riclassificato BASSO → MEDIO**. `npm audit fix` (senza `--force`) dichiara fix disponibili per tutte: da eseguire in **Ondata 1** con build + smoke test completo prima del deploy.
- `npm audit fix --force` resta VIETATO (breaking change catena yaml — DEBT-019b).
