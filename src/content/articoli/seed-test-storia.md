---
title: "Il Tiroler Landlibell del 1511 — articolo di test M2.1"
data_pubblicazione: 2026-05-01
pilastro: 1_storia_valli
tags: [tirol, asburgo, milizia, test-m2-1]
draft: true
excerpt: "Articolo seed di test per validare lo schema Astro Content Collections in M2.1. Contenuto placeholder, da rimuovere prima del primo deploy pubblico."
autore: Cristian Bresadola
---

> ⚠️ **Articolo seed di test M2.1.**
> Questo file esiste per validare visivamente la pipeline `astro check` + `npm run build` con lo schema Zod definito in `src/content.config.ts`.
> Da rimuovere (o flippare a `draft: false` con contenuto reale) prima del primo deploy pubblico.

## Contesto storico — placeholder

Il **Tiroler Landlibell** firmato a Innsbruck il 23 giugno 1511 dall'imperatore Massimiliano I d'Asburgo definisce per la prima volta in modo organico l'obbligo di difesa territoriale del Tirolo storico, valli del Noce comprese.

Il principio è chiaro: il Tirolese difende la propria terra in cambio dell'esenzione dal servizio militare al di fuori dei confini storici. È uno dei pilastri dell'identità militare e civile del territorio fino al 1918.

## Validazione schema

Questo articolo serve a verificare:

1. parsing frontmatter YAML (date, enum, array, default)
2. resolve glob `src/content/articoli/**/*.md`
3. enforcement vincolo `hero_alt` obbligatorio se `hero_image` presente *(non testato qui — frontmatter senza hero_image, è il path "valido senza vincolo")*
4. inferenza tipi TypeScript per `getCollection('articoli')`
5. filtro `draft === false` da applicare in M2.2

## Riferimento legacy

Esiste già una bozza nel mapping legacy (id_wp 1341, vedi `docs/legacy/mapping-pilastri.md` decisione D3) per un articolo definitivo sul Tiroler Landlibell. **Questo file di test non lo sostituisce** — è solo un seed con stesso tema per non sprecare contenuto.
