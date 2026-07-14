// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  // URL canonico del sito in produzione.
  // Usato da @astrojs/sitemap per generare URL assolute
  // e da Astro per i meta tag Open Graph.
  site: 'https://elbrenz.eu',

  // Output statico: tutte le pagine sono prerenderizzate in HTML.
  // Perfetto per SEO sui 142+ articoli longform di El Brenz.
  // Le pagine dinamiche (Andreas, area soci /app/*) useranno
  // `export const prerender = false` in testa al file della pagina.
  output: 'static',

  // Adapter Netlify: gestisce il build output per il deploy su Netlify.
  // Anche con output 'static' l'adapter è utile per la gestione
  // dei redirect, degli header di sicurezza e delle edge functions future.
  adapter: netlify(),

  // Redirect 301 permanenti (per non perdere i link legacy).
  redirects: {
    // vecchio slug WP del documentario -> pagina d'onore Fiöi dal Nos
    '/documentario-ladinita-nonesa-e-solandra-cultura-e-lingua': {
      status: 301,
      destination: '/fioi-dal-nos',
    },
  },

  // i18n (Fase 1a): IT alla radice, DE/EN sotto /de/ e /en/. pt/es predisposte
  // solo qui (nessuna pagina, nessuna voce nel selettore). prefixDefaultLocale
  // false → l'IT non prende prefisso: le rotte esistenti restano invariate.
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'de', 'en', 'pt', 'es'],
    routing: { prefixDefaultLocale: false },
  },

  integrations: [
    react(),
    // Sitemap con hreflang per-locale (solo lingue con pagine: it/de/en).
    // Esclude le pagine DE/EN finché le traduzioni non sono "live": restano
    // noindex, quindi non devono comparire nella sitemap (audit 14/7).
    sitemap({
      filter: (page) => {
        const deLive = process.env.TRADUZIONI_DE_LIVE === 'true';
        const enLive = process.env.TRADUZIONI_EN_LIVE === 'true';
        if (!deLive && page.includes('/de/')) return false;
        if (!enLive && page.includes('/en/')) return false;
        return true;
      },
      i18n: {
        defaultLocale: 'it',
        locales: { it: 'it-IT', de: 'de-DE', en: 'en-US' },
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});