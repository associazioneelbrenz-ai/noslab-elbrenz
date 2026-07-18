// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * A1 — articoli marcati `noindex` nel DB: vanno esclusi dalla sitemap oltre che
 * ricevere il meta robots. Il ponte e' legacy_wp_id (frontmatter) <-> wp_legacy_id
 * (DB), perche' lo slug del DB non sempre coincide con il nome del file .md, che
 * e' quello che finisce nell'URL. Se il DB non risponde, la sitemap resta com'era:
 * un problema di rete non deve far fallire la build.
 */
async function slugNoindex() {
  const esclusi = new Set();
  const url = process.env.PUBLIC_SUPABASE_URL;
  const anon = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return esclusi;
  try {
    const r = await fetch(`${url}/rest/v1/v_articoli_seo?select=wp_legacy_id&noindex=is.true`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    if (!r.ok) return esclusi;
    const righe = await r.json();
    const idNoindex = new Set(righe.map((x) => Number(x.wp_legacy_id)).filter(Boolean));
    if (idNoindex.size === 0) return esclusi;
    const dir = new URL('./src/content/articoli/', import.meta.url).pathname;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const m = readFileSync(dir + f, 'utf8').match(/^legacy_wp_id:\s*(\d+)/m);
      if (m && idNoindex.has(Number(m[1]))) esclusi.add('/articoli/' + f.replace(/\.md$/, ''));
    }
  } catch {
    // degrado silenzioso
  }
  return esclusi;
}
const NOINDEX = await slugNoindex();

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
        // A1: fuori dalla sitemap gli articoli marcati noindex nel DB.
        for (const p of NOINDEX) if (page.endsWith(p) || page.endsWith(p + '/')) return false;
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