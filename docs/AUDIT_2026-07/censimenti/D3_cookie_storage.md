# Censimento D3 — Cookie e storage reali vs dichiarati
_9 luglio 2026_

## localStorage / sessionStorage / cookie effettivi (grep su `src/`)

| Chiave | Tipo | Impostata da | Quando | Scopo | In cookie policy? |
|---|---|---|---|---|---|
| `cc_cookie` | cookie | vanilla-cookieconsent | sempre (tecnico) | memorizza le scelte di consenso | ✅ Sì |
| `andreas_widget_seen` | localStorage | `FabAndreas.astro` | prima apertura widget | non rimostrare badge "1" | ✅ Sì |
| `embed_instagram` | (consenso) | `EmbedConsenso`/`LightboxEmbed` | dopo consenso embed IG | ricorda consenso contenuti terzi IG | ✅ Sì |
| `embed_youtube` | (consenso) | `EmbedConsenso`/`LightboxEmbed` | dopo consenso embed YT | ricorda consenso contenuti terzi YT | ✅ Sì |

## Esito
**Corrispondenza 100%** tra storage reale e cookie policy dichiarata. Nessun cookie di analytics/tracciamento impostato (non esiste analytics sul sito). Nessuno storage di terze parti prima del consenso: gli embed IG/YT sono click-to-load post-consenso.

**Unico caveat esterno**: i **Google Fonts** (AUD-E3) generano una richiesta a server Google al caricamento pagina (non un cookie, ma un contatto di rete con IP) **prima** di qualsiasi consenso — da risolvere con self-hosting.
