/**
 * Copertine stilose per le storie promosse sul sito pubblico.
 *
 * Perche' esiste: le Storie condividono gia' un tasto Condividi (app e sito),
 * ma l'immagine che parte con il link e' solo la foto di copertina del socio —
 * bella o storta, a seconda di cosa aveva in mano quel giorno. Eventi e
 * articoli hanno gia' una card disegnata (scripts/_og-modello.mjs): le storie
 * no, ed erano l'unico contenuto condivisibile rimasto senza.
 *
 * SOLO LE STORIE PROMOSSE (`v_storia_pubblica`, pubblica=true): sono le uniche
 * con un indirizzo pubblico, elbrenz.eu/storie/{id}. Una storia che vive solo
 * nell'app non ha una pagina da illustrare.
 *
 * Usa l'id come nome file, non lo slug: le storie non ne hanno uno, la loro
 * pagina e' /storie/{id}.
 *
 *   npm run og:storie
 *   node scripts/genera-og-storie.mjs --solo <id>
 *
 * Agganciato al prebuild come gli eventi: se il DB non risponde si salta e
 * restano le immagini gia' committate, la build non si ferma per questo.
 */
import { join } from 'node:path';
import { RADICE, MESI, env, preparaFont, modello, scrivi } from './_og-modello.mjs';

const USCITA = join(RADICE, 'public', 'og', 'storie');

function dataEstesa(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

async function main() {
  const soloIdx = process.argv.indexOf('--solo');
  const solo = soloIdx > -1 ? process.argv[soloIdx + 1] : null;

  const URL_SB = env('PUBLIC_SUPABASE_URL') || 'https://wacknihvdjxltiqvxtqr.supabase.co';
  const ANON = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!ANON) {
    console.error('Manca PUBLIC_SUPABASE_ANON_KEY (.env.local): senza non leggo le storie.');
    process.exit(1);
  }

  const campi = 'id,titolo,autore_nome,created_at';
  const r = await fetch(`${URL_SB}/rest/v1/v_storia_pubblica?select=${campi}&order=created_at.desc`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) {
    console.error(`Lettura storie fallita: HTTP ${r.status}`);
    process.exit(1);
  }
  let storie = await r.json();
  if (solo) storie = storie.filter((s) => s.id === solo);
  if (!storie.length) {
    console.log('Nessuna storia promossa da illustrare.');
    return;
  }

  const assets = await preparaFont();
  let fatte = 0;
  let pesoOg = 0;
  let pesoCard = 0;
  for (const s of storie) {
    const svg = modello({
      titolo: s.titolo,
      sottotitolo: `di ${s.autore_nome} · ${dataEstesa(s.created_at)}`,
      piede: 'STORIE DALLE VALLI DEL NOCE',
    }, assets);
    const peso = await scrivi(svg, USCITA, s.id);
    fatte++;
    pesoOg += peso.og;
    pesoCard += peso.card;
    console.log(`  · ${s.id}  og ${Math.round(peso.og / 1024)} KB · card ${Math.round(peso.card / 1024)} KB  ${s.titolo}`);
  }
  console.log(`\n${fatte} storie illustrate in public/og/storie/`);
  console.log(`  og  totale ${Math.round(pesoOg / 1024)} KB`);
  console.log(`  card totale ${Math.round(pesoCard / 1024)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
