/**
 * Il modello grafico delle nostre Open Graph, in un posto solo.
 *
 * Lo usano sia gli eventi del Radar (genera-og-eventi.mjs) sia gli articoli
 * senza copertina (genera-og-articoli.mjs). Sta qui perche' il giorno che si
 * ritocca il filo d'oro o la posizione dell'aquila non si debba farlo due
 * volte, con il rischio che le due famiglie di immagini divergano.
 *
 * Ricalca le OG disegnate a mano in public/og/: fondo verde, bande ladine
 * sopra e sotto, monogramma EB, occhiello in oro spaziato, titolo in Playfair,
 * sottotitolo in corsivo oro, elbrenz.eu in basso e l'aquila tirolese in
 * filigrana sulla destra.
 *
 * I font sono quelli self-hosted del sito (public/fonts/*.woff2), decompressi
 * in ttf a ogni giro. Satori e' stato provato e scartato: sono sottoinsiemi
 * ottimizzati e il suo parser opentype li rifiuta. resvg li usa senza storie.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';
import sharp from 'sharp';

export const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = join(tmpdir(), 'elbrenz-og-fonts');

export const VERDE = '#1E2E26';
export const CREMA = '#F5EEDD';
export const ORO = '#C8923E';
const BLU = '#2B5CAB';
const VERDE_BANDA = '#1E7A3C';

export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Legge una variabile da .env.local senza dipendenze. */
export function env(chiave) {
  if (process.env[chiave]) return process.env[chiave];
  const f = join(RADICE, '.env.local');
  try {
    const riga = readFileSync(f, 'utf8').split('\n').find((r) => r.startsWith(`${chiave}=`));
    return riga ? riga.slice(chiave.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const dataUri = (rel) =>
  `data:image/png;base64,${readFileSync(join(RADICE, 'public', rel)).toString('base64')}`;

export async function preparaFont() {
  mkdirSync(FONTS, { recursive: true });
  for (const f of ['playfair-display', 'playfair-display-italic', 'inter']) {
    const ttf = Buffer.from(await decompress(readFileSync(join(RADICE, 'public/fonts', `${f}.woff2`))));
    writeFileSync(join(FONTS, `${f}.ttf`), ttf);
  }
  return {
    logo: dataUri('assets/branding/logo/logo-eb-crema.png'),
    aquila: dataUri('decoro/aquila-oro-filigrana.png'),
  };
}

/**
 * A capo sulle parole, con una stima della larghezza: resvg non espone un
 * misuratore, e per un modello a larghezza fissa la stima basta. Playfair sta
 * intorno a 0,48 em di media sul nostro testo; si taglia largo per non
 * rischiare la riga che sborda.
 */
function aCapo(testo, corpo, larghezzaMax) {
  const maxCaratteri = Math.max(8, Math.floor(larghezzaMax / (corpo * 0.48)));
  const righe = [];
  let riga = '';
  for (const p of String(testo).split(/\s+/)) {
    const tentativo = riga ? `${riga} ${p}` : p;
    if (tentativo.length > maxCaratteri && riga) { righe.push(riga); riga = p; }
    else riga = tentativo;
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
  if (n <= 78) return 46;
  return 40;
}

/**
 * Compone l'SVG.
 * @param {{titolo: string, sottotitolo?: string, piede?: string}} dati
 * @param {{logo: string, aquila: string}} assets
 */
export function modello(dati, assets) {
  const corpo = corpoTitolo(dati.titolo);
  const righe = aCapo(dati.titolo, corpo, 790).slice(0, 3);
  const interlinea = Math.round(corpo * 1.14);

  const centro = 386;
  const yPrima = centro - ((righe.length - 1) * interlinea) / 2;
  const titoloSvg = righe
    .map((r, i) => `<text x="62" y="${yPrima + i * interlinea}" font-family="Playfair Display" font-size="${corpo}" fill="${CREMA}">${esc(r)}</text>`)
    .join('\n  ');
  const ySub = yPrima + (righe.length - 1) * interlinea + 52;

  const sotto = dati.sottotitolo
    ? `<text x="62" y="${ySub}" font-family="Playfair Display" font-style="italic" font-size="30" fill="${ORO}">${esc(dati.sottotitolo)}</text>`
    : '';
  const piede = dati.piede
    ? `<text x="1138" y="566" text-anchor="end" font-family="Inter" font-size="15" letter-spacing="2.6" fill="${ORO}" opacity="0.8">${esc(dati.piede)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${VERDE}"/>
  <image xlink:href="${assets.aquila}" x="700" y="40" width="560" height="560" opacity="0.13"/>

  <rect x="0" y="0"  width="1200" height="7" fill="${BLU}"/>
  <rect x="0" y="7"  width="1200" height="6" fill="${CREMA}"/>
  <rect x="0" y="13" width="1200" height="9" fill="${VERDE_BANDA}"/>

  <image xlink:href="${assets.logo}" x="62" y="62" width="92" height="92"/>
  <text x="180" y="96" font-family="Inter" font-size="18" letter-spacing="4.2" fill="${ORO}">ASSOCIAZIONE STORICO CULTURALE LINGUISTICA</text>
  <text x="180" y="146" font-family="Playfair Display" font-size="40" fill="${CREMA}">El Brenz dle Val del Nos</text>

  <rect x="62" y="184" width="1076" height="1" fill="${ORO}" opacity="0.55"/>

  ${titoloSvg}
  ${sotto}

  <text x="62" y="566" font-family="Inter" font-size="22" fill="${CREMA}" opacity="0.85">elbrenz.eu</text>
  ${piede}

  <rect x="0" y="608" width="1200" height="9" fill="${VERDE_BANDA}"/>
  <rect x="0" y="617" width="1200" height="6" fill="${CREMA}"/>
  <rect x="0" y="623" width="1200" height="7" fill="${BLU}"/>
</svg>`;
}

/**
 * Rasterizza e scrive i due derivati:
 *   <slug>.jpg       1200x630 — quella che va nei meta og:image;
 *   <slug>-card.webp  560x294 — la miniatura dei caroselli.
 * Servire la piena risoluzione nelle card costava 1,7 MB di home.
 */
export async function scrivi(svg, cartella, slug) {
  const png = new Resvg(svg, {
    font: { fontDirs: [FONTS], defaultFontFamily: 'Playfair Display', loadSystemFonts: false },
    fitTo: { mode: 'width', value: 1200 },
  }).render().asPng();

  const jpg = await sharp(png).jpeg({ quality: 86, progressive: true }).toBuffer();
  const card = await sharp(png).resize(560, 294).webp({ quality: 78 }).toBuffer();
  mkdirSync(cartella, { recursive: true });
  writeFileSync(join(cartella, `${slug}.jpg`), jpg);
  writeFileSync(join(cartella, `${slug}-card.webp`), card);
  return { og: jpg.length, card: card.length };
}
