/**
 * Genera le immagini Open Graph degli eventi del Radar, una per evento
 * pubblicato, nello stile delle OG gia' a mano in public/og/.
 *
 * Perche' esiste: gli eventi del Radar hanno ora una pagina propria
 * (/eventi/<slug>), e una pagina senza la sua OG, quando la condividi, mostra
 * il biglietto da visita generico del sito. Qui il titolo dell'evento, la sua
 * data e il suo luogo finiscono DENTRO l'immagine.
 *
 * Come: l'SVG del modello si compone qui e lo rasterizza resvg. Satori e'
 * stato scartato: i nostri font self-hosted sono sottoinsiemi ottimizzati e il
 * suo parser opentype non li regge, mentre resvg li usa senza storie. I font
 * sono quindi gli STESSI del sito (public/fonts/*.woff2, decompressi in ttf a
 * ogni giro in una cartella temporanea): nessun download da rete, nessun font
 * di sistema, immagine identica su qualunque macchina.
 *
 *   node scripts/genera-og-eventi.mjs            # tutti i pubblicati
 *   node scripts/genera-og-eventi.mjs --solo pan-de-na-volta
 *
 * Le immagini finiscono in public/og/eventi/<slug>.png e vanno committate: la
 * pagina evento e' SSR, ma l'OG e' un asset statico servito da Netlify. Un
 * evento pubblicato DOPO l'ultimo deploy non ha ancora la sua immagine: la
 * pagina in quel caso ripiega su /og/og-eventi.jpg, che e' comunque in stile.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';
import sharp from 'sharp';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const USCITA = join(RADICE, 'public', 'og', 'eventi');
const FONTS = join(tmpdir(), 'elbrenz-og-fonts');

const VERDE = '#1E2E26';
const CREMA = '#F5EEDD';
const ORO = '#C8923E';
const BLU = '#2B5CAB';
const VERDE_BANDA = '#1E7A3C';

const VALLE = { non: 'Val di Non', sole: 'Val di Sole', rabbi: 'Val di Rabbi', pejo: 'Val di Pejo' };
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function env(chiave) {
  if (process.env[chiave]) return process.env[chiave];
  const f = join(RADICE, '.env.local');
  if (!existsSync(f)) return '';
  const riga = readFileSync(f, 'utf8').split('\n').find((r) => r.startsWith(`${chiave}=`));
  return riga ? riga.slice(chiave.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const dataUri = (rel) =>
  `data:image/png;base64,${readFileSync(join(RADICE, 'public', rel)).toString('base64')}`;

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

/**
 * A capo sulle parole, con una stima della larghezza: resvg non espone un
 * misuratore, e per un modello a larghezza fissa la stima basta. Playfair sta
 * intorno a 0,47 em di media sul nostro testo (maiuscole e ascendenti gia'
 * pesate); si taglia largo per non rischiare la riga che sborda.
 */
function aCapo(testo, corpo, larghezzaMax) {
  const perCarattere = corpo * 0.48;
  const maxCaratteri = Math.max(8, Math.floor(larghezzaMax / perCarattere));
  const parole = String(testo).split(/\s+/);
  const righe = [];
  let riga = '';
  for (const p of parole) {
    const tentativo = riga ? `${riga} ${p}` : p;
    if (tentativo.length > maxCaratteri && riga) {
      righe.push(riga);
      riga = p;
    } else {
      riga = tentativo;
    }
  }
  if (riga) righe.push(riga);
  return righe;
}

/** Il titolo lungo rimpicciolisce invece di traboccare. */
function corpoTitolo(titolo) {
  const n = titolo.length;
  if (n <= 26) return 76;
  if (n <= 42) return 64;
  if (n <= 58) return 54;
  return 46;
}

function modello(e, assets) {
  const corpo = corpoTitolo(e.titolo);
  const LARGHEZZA_TESTO = 790;
  const righe = aCapo(e.titolo, corpo, LARGHEZZA_TESTO).slice(0, 3);
  const interlinea = Math.round(corpo * 1.14);

  // Il blocco centrale si centra sullo spazio fra il filo d'oro e il piede.
  const centro = 386;
  const yPrima = centro - ((righe.length - 1) * interlinea) / 2;
  const titoloSvg = righe
    .map((r, i) => `<text x="62" y="${yPrima + i * interlinea}" font-family="Playfair Display" font-size="${corpo}" fill="${CREMA}">${esc(r)}</text>`)
    .join('\n    ');
  const ySub = yPrima + (righe.length - 1) * interlinea + 52;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${VERDE}"/>

  <!-- Aquila tirolese in filigrana, come nelle OG storiche -->
  <image xlink:href="${assets.aquila}" x="700" y="40" width="560" height="560" opacity="0.13"/>

  <!-- Bande ladine in testa -->
  <rect x="0" y="0"  width="1200" height="7" fill="${BLU}"/>
  <rect x="0" y="7"  width="1200" height="6" fill="${CREMA}"/>
  <rect x="0" y="13" width="1200" height="9" fill="${VERDE_BANDA}"/>

  <!-- Testata: monogramma e ragione sociale -->
  <image xlink:href="${assets.logo}" x="62" y="62" width="92" height="92"/>
  <text x="180" y="96" font-family="Inter" font-size="18" letter-spacing="4.2" fill="${ORO}">ASSOCIAZIONE STORICO CULTURALE LINGUISTICA</text>
  <text x="180" y="146" font-family="Playfair Display" font-size="40" fill="${CREMA}">El Brenz dle Val del Nos</text>

  <!-- Filo d'oro -->
  <rect x="62" y="184" width="1076" height="1" fill="${ORO}" opacity="0.55"/>

  <!-- Il cuore: titolo dell'evento, poi quando e dove -->
  ${titoloSvg}
  <text x="62" y="${ySub}" font-family="Playfair Display" font-style="italic" font-size="30" fill="${ORO}">${esc(sottotitolo(e))}</text>

  <!-- Piede -->
  <text x="62" y="566" font-family="Inter" font-size="22" fill="${CREMA}" opacity="0.85">elbrenz.eu</text>
  <text x="1138" y="566" text-anchor="end" font-family="Inter" font-size="15" letter-spacing="2.6" fill="${ORO}" opacity="0.8">APPUNTAMENTI DELLE VALLI DEL NOCE</text>

  <!-- Bande ladine in coda -->
  <rect x="0" y="608" width="1200" height="9" fill="${VERDE_BANDA}"/>
  <rect x="0" y="617" width="1200" height="6" fill="${CREMA}"/>
  <rect x="0" y="623" width="1200" height="7" fill="${BLU}"/>
</svg>`;
}

async function preparaFont() {
  mkdirSync(FONTS, { recursive: true });
  for (const f of ['playfair-display', 'playfair-display-italic', 'inter']) {
    const dest = join(FONTS, `${f}.ttf`);
    const ttf = Buffer.from(await decompress(readFileSync(join(RADICE, 'public/fonts', `${f}.woff2`))));
    writeFileSync(dest, ttf);
  }
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

  await preparaFont();
  const assets = {
    logo: dataUri('assets/branding/logo/logo-eb-crema.png'),
    aquila: dataUri('decoro/aquila-oro-filigrana.png'),
  };

  mkdirSync(USCITA, { recursive: true });
  let fatte = 0;
  let pesoOg = 0;
  let pesoCard = 0;
  for (const e of eventi) {
    if (!e.slug) {
      console.warn(`  · saltato «${e.titolo}»: manca lo slug`);
      continue;
    }
    const png = new Resvg(modello(e, assets), {
      font: { fontDirs: [FONTS], defaultFontFamily: 'Playfair Display', loadSystemFonts: false },
      fitTo: { mode: 'width', value: 1200 },
    }).render().asPng();

    // Due uscite, due mestieri diversi:
    //   .jpg  1200x630 — quella che va nei meta og:image. I crawler social
    //         vogliono raster grande; il PNG di resvg pesa ~210 KB, il JPEG a
    //         qualita' 86 sta sotto la meta' senza differenze visibili su un
    //         fondo piatto come il nostro.
    //   -card.webp 560x294 — la miniatura del carosello in home. Le card sono
    //         larghe 280 px: servire loro l'immagine intera voleva dire ~1,7 MB
    //         di home per otto eventi.
    const jpg = await sharp(png).jpeg({ quality: 86, progressive: true }).toBuffer();
    const card = await sharp(png).resize(560, 294).webp({ quality: 78 }).toBuffer();
    writeFileSync(join(USCITA, `${e.slug}.jpg`), jpg);
    writeFileSync(join(USCITA, `${e.slug}-card.webp`), card);

    fatte++;
    pesoOg += jpg.length;
    pesoCard += card.length;
    console.log(`  · ${e.slug}  og ${Math.round(jpg.length / 1024)} KB · card ${Math.round(card.length / 1024)} KB  ${e.titolo}`);
  }
  console.log(`\n${fatte} eventi illustrati in public/og/eventi/`);
  console.log(`  og  totale ${Math.round(pesoOg / 1024)} KB`);
  console.log(`  card totale ${Math.round(pesoCard / 1024)} KB (questo e' cio' che pesa in home)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
