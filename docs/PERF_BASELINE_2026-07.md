# Performance — misura di riferimento (Blocco B0)

**19 luglio 2026**, Lighthouse 12, profilo **mobile** (default, rete lenta simulata), sito live.
Ogni intervento successivo si giustifica contro questi numeri.

| pagina | perf | LCP | CLS | TBT | Speed Index |
|---|---|---|---|---|---|
| home | 54 | 4.9 s | 0 | 1.950 ms | 2.9 s |
| articolo (festaval-sole-2013) | 88 | 3.1 s | 0 | 290 ms | 2.2 s |
| mappa | 86 | 3.0 s | 0.001 | 300 ms | 4.2 s |
| luogo (castel-valer) | 91 | 2.5 s | 0 | 270 ms | 2.7 s |

## Obiettivi di chiusura del blocco
- Performance >= 90 mobile su articolo e luoghi · >= 80 sulla mappa
- CLS < 0.1 ovunque · LCP < 2,5 s

## Lettura
- **CLS gia' a posto ovunque** (0-0.001): le dimensioni dichiarate sulle immagini stanno funzionando.
- **Luogo 91 e mappa 86 sono gia' in obiettivo.** Articolo a 88, vicino.
- **La home e' il caso serio: 54, con TBT di 1.950 ms.** Non e' nei target del brief ma e' la porta d'ingresso del sito.
