/**
 * Copertine per gli articoli che non ne hanno.
 *
 * Sette pezzi pubblicati — quasi tutti del filone «Lingua e ladinità», i piu'
 * vecchi risalgono al 2013 — sono arrivati dalla migrazione WordPress senza
 * immagine. Sul sito si nota poco, nell'app la card resta un rettangolo
 * grigio in mezzo alle altre.
 *
 * Usa lo STESSO modello delle OG eventi (scripts/_og-modello.mjs): fondo
 * verde, bande ladine, monogramma, titolo in Playfair. Cambia cosa si scrive:
 * il sottotitolo e' la data estesa, il piede il pilastro editoriale.
 *
 *   node scripts/genera-og-articoli.mjs            # prova secca
 *   node scripts/genera-og-articoli.mjs --scrivi   # genera i file
 *
 * Le immagini finiscono in public/og/articoli/ e vanno committate. Il campo
 * `immagine_copertina_url` sul database NON lo tocca questo script: si scrive
 * a parte, per non far dipendere un dato di produzione da una generazione di
 * file locale.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RADICE, MESI, env, preparaFont, modello, scrivi } from './_og-modello.mjs';

const USCITA = join(RADICE, 'public', 'og', 'articoli');

const PILASTRO = {
  storia: 'STORIA DELLE VALLI',
  lingua: 'LINGUA E LADINITÀ',
  'cultura-materiale': 'CULTURA MATERIALE',
  rievocazioni: 'RIEVOCAZIONI ED EVENTI',
  identita: 'IDENTITÀ E APPARTENENZA',
  'vita-associativa': 'VITA ASSOCIATIVA',
};

function dataEstesa(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

async function main() {
  const scriviDavvero = process.argv.includes('--scrivi');

  const URL_SB = env('PUBLIC_SUPABASE_URL') || 'https://wacknihvdjxltiqvxtqr.supabase.co';
  const ANON = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!ANON) {
    console.error('Manca PUBLIC_SUPABASE_ANON_KEY (.env.local).');
    process.exit(1);
  }

  const campi = 'slug,titolo,pilastro,pubblicato_at,immagine_copertina_url,tipo_contenuto';
  const r = await fetch(
    `${URL_SB}/rest/v1/v_articoli_pubblici?select=${campi}&tipo_contenuto=eq.post&immagine_copertina_url=is.null&order=pubblicato_at.desc`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
  );
  if (!r.ok) {
    console.error(`Lettura articoli fallita: HTTP ${r.status}`);
    process.exit(1);
  }
  const senza = await r.json();

  if (!senza.length) {
    console.log('Tutti gli articoli pubblicati hanno gia' + "'" + ' una copertina.');
    return;
  }

  console.log(`Articoli pubblicati senza copertina: ${senza.length}\n`);
  if (!scriviDavvero) {
    for (const a of senza) console.log(`  · ${a.slug}.jpg  ← ${a.titolo}`);
    console.log('\nProva secca: nessun file scritto. Rilancia con --scrivi.');
    return;
  }

  const assets = await preparaFont();
  const sql = [];
  for (const a of senza) {
    const svg = modello({
      titolo: a.titolo,
      sottotitolo: dataEstesa(a.pubblicato_at),
      piede: PILASTRO[a.pilastro] ?? '',
    }, assets);
    const peso = await scrivi(svg, USCITA, a.slug);
    console.log(`  · ${a.slug}  og ${Math.round(peso.og / 1024)} KB · card ${Math.round(peso.card / 1024)} KB`);
    sql.push(`  ('${a.slug.replace(/'/g, "''")}', 'https://elbrenz.eu/og/articoli/${a.slug}.jpg')`);
  }

  // Il collegamento al database si scrive a mano, con questo pronto da
  // incollare: cosi' resta un gesto esplicito e verificabile.
  const raccordo = join(RADICE, 'scripts', 'raccordo-copertine.sql');
  writeFileSync(raccordo,
    `-- Generato da genera-og-articoli.mjs. Collega le copertine appena create.\n` +
    `update public.articolo a\n` +
    `set immagine_copertina_url = v.url\n` +
    `from (values\n${sql.join(',\n')}\n) as v(slug, url)\n` +
    `where a.slug = v.slug and a.immagine_copertina_url is null;\n`, 'utf8');

  console.log(`\n${senza.length} copertine in public/og/articoli/`);
  console.log(`Raccordo SQL pronto in scripts/raccordo-copertine.sql`);
}

main().catch((e) => { console.error(e); process.exit(1); });
