/**
 * Genera le immagini Open Graph degli eventi del Radar, una per evento
 * pubblicato, nello stile delle OG gia' a mano in public/og/.
 *
 * Perche' esiste: gli eventi del Radar hanno una pagina propria
 * (/eventi/<slug>), e una pagina senza la sua OG, quando la condividi, mostra
 * il biglietto da visita generico del sito. Qui il titolo dell'evento, la sua
 * data e il suo luogo finiscono DENTRO l'immagine.
 *
 * Il disegno sta in scripts/_og-modello.mjs, condiviso con le copertine degli
 * articoli: si ritocca in un posto solo.
 *
 *   npm run og:eventi
 *   node scripts/genera-og-eventi.mjs --solo pan-de-na-volta
 *
 * E' agganciato al `prebuild`, quindi ogni build le rigenera da cio' che
 * risulta pubblicato: non restano indietro. Se il DB non risponde il prebuild
 * avvisa e non fa fallire la build, tenendo le immagini gia' committate.
 */
import { join } from 'node:path';
import { RADICE, MESI, env, preparaFont, modello, scrivi } from './_og-modello.mjs';

const USCITA = join(RADICE, 'public', 'og', 'eventi');

const VALLE = { non: 'Val di Non', sole: 'Val di Sole', rabbi: 'Val di Rabbi', pejo: 'Val di Pejo' };

/** La riga sotto il titolo: quando e dove, nel nostro modo di dirlo. */
function sottotitolo(e) {
  const d = new Date(`${e.data_inizio}T00:00:00`);
  let quando = `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
  if (e.ricorrenza) {
    quando = e.ricorrenza.charAt(0).toUpperCase() + e.ricorrenza.slice(1);
  } else if (e.data_fine && e.data_fine !== e.data_inizio) {
    const f = new Date(`${e.data_fine}T00:00:00`);
    quando = d.getMonth() === f.getMonth()
      ? `${d.getDate()}–${f.getDate()} ${MESI[f.getMonth()]} ${f.getFullYear()}`
      : `${d.getDate()} ${MESI[d.getMonth()]} – ${f.getDate()} ${MESI[f.getMonth()]} ${f.getFullYear()}`;
  }
  const dove = [e.comune, VALLE[e.valle] ?? ''].filter(Boolean).join(' · ');
  return [quando, dove].filter(Boolean).join('  ·  ');
}

async function main() {
  const soloIdx = process.argv.indexOf('--solo');
  const solo = soloIdx > -1 ? process.argv[soloIdx + 1] : null;

  const URL_SB = env('PUBLIC_SUPABASE_URL') || 'https://wacknihvdjxltiqvxtqr.supabase.co';
  const ANON = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!ANON) {
    console.error('Manca PUBLIC_SUPABASE_ANON_KEY (.env.local): senza non leggo gli eventi.');
    process.exit(1);
  }

  const campi = 'slug,titolo,data_inizio,data_fine,ricorrenza,comune,valle,pilastro';
  const r = await fetch(`${URL_SB}/rest/v1/eventi_esterni_pubblici?select=${campi}&order=data_inizio.asc`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) {
    console.error(`Lettura eventi fallita: HTTP ${r.status}`);
    process.exit(1);
  }
  let eventi = await r.json();
  if (solo) eventi = eventi.filter((e) => e.slug === solo);
  if (!eventi.length) {
    console.log('Nessun evento pubblicato da illustrare.');
    return;
  }

  const assets = await preparaFont();
  let fatte = 0;
  let pesoOg = 0;
  let pesoCard = 0;
  for (const e of eventi) {
    if (!e.slug) {
      console.warn(`  · saltato «${e.titolo}»: manca lo slug`);
      continue;
    }
    const svg = modello({
      titolo: e.titolo,
      sottotitolo: sottotitolo(e),
      piede: 'APPUNTAMENTI DELLE VALLI DEL NOCE',
    }, assets);
    const peso = await scrivi(svg, USCITA, e.slug);
    fatte++;
    pesoOg += peso.og;
    pesoCard += peso.card;
    console.log(`  · ${e.slug}  og ${Math.round(peso.og / 1024)} KB · card ${Math.round(peso.card / 1024)} KB  ${e.titolo}`);
  }
  console.log(`\n${fatte} eventi illustrati in public/og/eventi/`);
  console.log(`  og  totale ${Math.round(pesoOg / 1024)} KB`);
  console.log(`  card totale ${Math.round(pesoCard / 1024)} KB (questo e' cio' che pesa in home)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
