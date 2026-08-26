# Inventario delle rotte · Cimiteri di guerra

Ricognizione fatta il 26/8/2026, prima di scrivere la barra di navigazione, come
richiesto dal brief. Ogni riga è una rotta viva o appena aggiunta, mai una
rotta immaginata.

## Menu principale del sito

"Cimiteri di guerra" **c'è già** in `src/components/Header.astro`, dentro il
gruppo "Archivio" (non "Storia delle Valli", come il brief ipotizzava — quel
pilastro nel codice si chiama "Temi" e contiene `/storia`). Non l'ho spostato:
la voce funziona dov'è, e il brief chiede di adattare i collegamenti alle
rotte vere, non il contrario. Segnalo la discrepanza qui invece di deciderla
da solo.

## Pagine per tipo

| Tipo | Rotta reale | File sorgente | Quante | Raggiungibile da home |
|---|---|---|---|---|
| Indice sezione | `/cimiteri-di-guerra` | `src/pages/cimiteri-di-guerra/index.astro` | 1 | Sì — menu "Archivio", e blocco promozionale in home |
| Fondo | `/cimiteri-di-guerra/{slug_breve}` | `src/pages/cimiteri-di-guerra/[fondo]/index.astro` | 1 (male) | Sì — dall'indice sezione |
| Planimetria | `/cimiteri-di-guerra/{slug_breve}/mappa` | `src/pages/cimiteri-di-guerra/[fondo]/mappa.astro` | 1 | Sì — dalla pagina del fondo (e ora anche incorporata lì) |
| Tombe senza nome | `/cimiteri-di-guerra/{slug_breve}/senza-nome` | `src/pages/cimiteri-di-guerra/[fondo]/senza-nome.astro` | 1 | Sì — dalla pagina del fondo |
| Persona | `/cimiteri-di-guerra/{slug_breve}/{slug_persona}` | `src/pages/cimiteri-di-guerra/[fondo]/[persona].astro` | 115 (100 militari + 15 civili con nome) | Sì — da planimetria, ricerca, elenchi |
| Reparto (dettaglio) | `/cimiteri-di-guerra/reparto/{slug}` | `src/pages/cimiteri-di-guerra/reparto/[reparto].astro` | 10 | Sì — dalle schede persona e dall'indice reparti (nuovo) |
| Reparto (indice) | `/cimiteri-di-guerra/reparto` | `src/pages/cimiteri-di-guerra/reparto/index.astro` | 1 — **nuova, non esisteva** | Sì — dalla barra di sezione |
| Provenienza (dettaglio) | `/cimiteri-di-guerra/provenienza/{slug}` | `src/pages/cimiteri-di-guerra/provenienza/[regione].astro` | 12 | Sì — dalle schede persona e dall'indice provenienze (nuovo) |
| Provenienza (indice) | `/cimiteri-di-guerra/provenienza` | `src/pages/cimiteri-di-guerra/provenienza/index.astro` | 1 — **nuova, non esisteva** | Sì — dalla barra di sezione |
| Evento | `/cimiteri-di-guerra/{slug_evento}` | `src/pages/cimiteri-di-guerra/[evento]/index.astro` | 1 (operazione-lawine, "Operazione Valanga") | Sì — dalle schede persona collegate |

**Totale: 144 pagine** (142 già vive + le 2 nuove pagine indice).

## "Tutti i nomi"

Non esiste, e non è mai esistita, una pagina propria con questo nome: la
ricerca fra tutti i nomi vive sulla pagina del fondo, sezione "Cerca un
nome" (`#cerca-un-nome`). La barra di sezione punta lì, non a una rotta
inventata per l'occasione.

## Conteggio dei riquadri della planimetria (verificato in build)

Sul cimitero militare: 215 riquadri totali. 98 portano un nome (96 riquadri
con una sola tomba nominata, 2 riquadri doppi — "180-181" e "182-183" — con
entrambe le tombe nominate). 101 sono "nome non reperito" (sotto la tomba 90,
o un buco dentro il blocco 90-201). 16 sono "fuori dal blocco documentato"
(oltre la tomba 201). 98+101+16 = 215.

Nota: il brief parlava di "103 su 215 clickable" — 103 è il numero di righe
del registro nel settore militare (100 nomi + 3 segnati "sconosciuto"), non
il numero di riquadri cliccabili. I riquadri cliccabili sono 98, perché due
coppie di tombe condividono un solo riquadro disegnato.
