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

  integrations: [
    react(),
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});