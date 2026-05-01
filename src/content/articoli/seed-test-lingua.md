---
title: "Bonanot e bona jornada — appunto di test M2.1"
data_pubblicazione: 2026-05-01
pilastro: 2_lingua_ladinita
tags: [nones, saluti, ladino-anaunico, test-m2-1]
draft: true
excerpt: "Articolo seed di test per validare lo schema Astro Content Collections in M2.1, ramo lingua ladina. Contenuto placeholder."
autore: Cristian Bresadola
legacy_wp_id: 9999
---

> ⚠️ **Articolo seed di test M2.1.**
> Questo file copre il ramo "articolo legacy con `legacy_wp_id`" dello schema. Da rimuovere prima del deploy pubblico.

## I saluti del *nones*

In *nones* (ladino anaunico delle Valli del Noce) i saluti più correnti sono:

- **bonanot** — buona notte, saluto serale di commiato
- **bona jornada** — buongiorno, saluto della mattina

Sono entrambi confermati nel glossario interno (vedi *config_app* `glossario_nones` punti A e B).

## Cosa valida questo seed

| Campo schema | Valore | Cosa testa |
|---|---|---|
| `pilastro` | `2_lingua_ladinita` | enum value |
| `tags` | array di 4 elementi | parsing array YAML |
| `legacy_wp_id` | `9999` | numero intero positivo |
| `draft` | `true` | filtro pubblicazione |
| `data_pubblicazione` | `2026-05-01` | coerce string → Date |

## Riferimento

Tema reale e ricco da espandere in articolo definitivo dopo che il glossario nones D1-D5 sarà chiuso. Per ora **placeholder**.
