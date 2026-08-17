/**
 * Copertine stilose per i pezzi pubblicati del Museo della Grande Guerra.
 *
 * [17/8/2026] Quando la scheda del pezzo e' nata (13/8), la scelta era stata
 * di usare la fotografia stessa come OG, non una card disegnata: «un pezzo di
 * museo e' gia' un'immagine» (vedi il commento in
 * non-e-sole-grande-guerra/[slug].astro). Buona ragione, ma lasciava il Museo
 * l'unico contenuto senza un tasto Condividi — la richiesta esplicita del
 * 17/8 e' stata di allineare Storie, Museo e Glossario tutti allo stesso
 * trattamento. Questo script non sostituisce la fotografia nella pagina: la
 * card generata qui e' SOLO l'anteprima per WhatsApp/social, la scheda
 * continua a mostrare la fotografia vera sopra il cartellino.
 *
 *   npm run og:museo
 *   node scripts/genera-og-museo.mjs --solo <slug>
 *
 * Agganciato al prebuild come eventi, storie e glossario.
 */
import { join } from 'node:path';
import { RADICE, env, preparaFont, modello, scrivi } from './_og-modello.mjs';

const USCITA = join(RADICE, 'public', 'og', 'museo');

const VALLE = {
  val_di_non: 'Val di Non', val_di_sole: 'Val di Sole', val_di_rabbi: 'Val di Rabbi',
  val_di_pejo: 'Val di Pejo', piu_valli: 'Più valli', fuori_valle: 'Fuori valle',
};
const TIPO = {
  foto: 'Fotografia', fotografia: 'Fotografia', cartolina: 'Cartolina',
  lettera: 'Lettera', documento: 'Documento', oggetto: 'Oggetto',
};

async function main() {
  const soloIdx = process.argv.indexOf('--solo');
  const solo = soloIdx > -1 ? process.argv[soloIdx + 1] : null;

  const URL_SB = env('PUBLIC_SUPABASE_URL') || 'https://wacknihvdjxltiqvxtqr.supabase.co';
  const ANON = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!ANON) {
    console.error('Manca PUBLIC_SUPABASE_ANON_KEY (.env.local): senza non leggo il museo.');
    process.exit(1);
  }

  const campi = 'slug,titolo,tipo,anno,periodo,luogo,valle';
  const r = await fetch(`${URL_SB}/rest/v1/museo_gg_pezzo?select=${campi}&stato=eq.pubblicato&order=titolo.asc`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) {
    console.error(`Lettura museo fallita: HTTP ${r.status}`);
    process.exit(1);
  }
  let pezzi = await r.json();
  if (solo) pezzi = pezzi.filter((p) => p.slug === solo);
  if (!pezzi.length) {
    console.log('Nessun pezzo pubblicato da illustrare.');
    return;
  }

  const assets = await preparaFont();
  let fatte = 0;
  let pesoOg = 0;
  let pesoCard = 0;
  for (const p of pezzi) {
    const tipoL = TIPO[p.tipo] ?? p.tipo;
    const quando = p.anno ? String(p.anno) : (p.periodo ?? null);
    const valleL = p.valle ? (VALLE[p.valle] ?? p.valle) : null;
    const sottotitolo = [tipoL, quando, p.luogo || valleL].filter(Boolean).join(' · ');
    const svg = modello({
      titolo: p.titolo,
      sottotitolo,
      piede: 'MUSEO DELLA GRANDE GUERRA · NON E SOLE',
    }, assets);
    const peso = await scrivi(svg, USCITA, p.slug);
    fatte++;
    pesoOg += peso.og;
    pesoCard += peso.card;
    console.log(`  · ${p.slug}  og ${Math.round(peso.og / 1024)} KB · card ${Math.round(peso.card / 1024)} KB  ${p.titolo}`);
  }
  console.log(`\n${fatte} pezzi illustrati in public/og/museo/`);
  console.log(`  og  totale ${Math.round(pesoOg / 1024)} KB`);
  console.log(`  card totale ${Math.round(pesoCard / 1024)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
