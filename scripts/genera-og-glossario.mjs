/**
 * Copertine stilose per le voci del glossario (Guardiani de la lenga).
 *
 * Perche' esiste: ogni voce ha gia' il suo indirizzo (/guardiani-de-la-lenga/
 * <slug>, dal 10/8) ma nessun tasto Condividi e un'OG generica identica per
 * tutte le 57+ parole — chi condivideva una voce mandava in giro il biglietto
 * da visita del glossario intero, non la parola.
 *
 * La card mostra il lemma, il significato e la parlata: si legge la parola
 * anche prima di aprire il link, che e' il punto di un dizionario condiviso.
 *
 *   npm run og:glossario
 *   node scripts/genera-og-glossario.mjs --solo <slug>
 *
 * Agganciato al prebuild come eventi e storie: se il DB non risponde si salta
 * e restano le immagini gia' committate.
 */
import { join } from 'node:path';
import { RADICE, env, preparaFont, modello, scrivi } from './_og-modello.mjs';

const USCITA = join(RADICE, 'public', 'og', 'glossario');

const PARLATA = {
  noneso: 'Noneso · Val di Non', solander: 'Solander · Val di Sole',
  rabies: 'Rabies · Val di Rabbi', pegaes: 'Pegaes · Val di Pejo',
};

async function main() {
  const soloIdx = process.argv.indexOf('--solo');
  const solo = soloIdx > -1 ? process.argv[soloIdx + 1] : null;

  const URL_SB = env('PUBLIC_SUPABASE_URL') || 'https://wacknihvdjxltiqvxtqr.supabase.co';
  const ANON = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!ANON) {
    console.error('Manca PUBLIC_SUPABASE_ANON_KEY (.env.local): senza non leggo il glossario.');
    process.exit(1);
  }

  const campi = 'slug,termine,significato_it,variante,comune';
  const r = await fetch(`${URL_SB}/rest/v1/glossario_pubblico?select=${campi}&slug=not.is.null&order=termine.asc`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) {
    console.error(`Lettura glossario fallita: HTTP ${r.status}`);
    process.exit(1);
  }
  let voci = await r.json();
  if (solo) voci = voci.filter((v) => v.slug === solo);
  if (!voci.length) {
    console.log('Nessuna voce pubblicata da illustrare.');
    return;
  }

  const assets = await preparaFont();
  let fatte = 0;
  let pesoOg = 0;
  let pesoCard = 0;
  for (const v of voci) {
    const parlataL = v.variante ? (PARLATA[v.variante] ?? v.variante) : null;
    const sottotitolo = [v.significato_it, parlataL || v.comune].filter(Boolean).join(' · ');
    const svg = modello({
      titolo: v.termine,
      sottotitolo,
      piede: 'GUARDIANI DE LA LENGA · GLOSSARIO',
    }, assets);
    const peso = await scrivi(svg, USCITA, v.slug);
    fatte++;
    pesoOg += peso.og;
    pesoCard += peso.card;
    console.log(`  · ${v.slug}  og ${Math.round(peso.og / 1024)} KB · card ${Math.round(peso.card / 1024)} KB  ${v.termine}`);
  }
  console.log(`\n${fatte} voci illustrate in public/og/glossario/`);
  console.log(`  og  totale ${Math.round(pesoOg / 1024)} KB`);
  console.log(`  card totale ${Math.round(pesoCard / 1024)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
