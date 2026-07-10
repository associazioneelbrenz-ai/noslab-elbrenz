// tessera-download — tessera scaricabile per il telefono (M5.5 Fase A).
//
// GET /tessera-download/{codice}/png  → PNG verticale 1080×1686 (wallet)
// GET /tessera-download/{codice}/pdf  → PDF A6 stampabile
//
// Endpoint PUBBLICO con capability URL: il {codice} è l'HMAC troncato non
// enumerabile della tessera (stesso della pagina /tessera/{codice}); la
// lookup a DB accetta solo codice esatto di domanda approvata.
//
// Render server-side, zero dipendenze frontend:
//   - SVG → PNG via @resvg/resvg-wasm (wasm e font Playfair BUNDLATI nella
//     function: nessuna chiamata esterna a runtime per il rendering);
//   - PDF via pdf-lib (pure JS): pagina A6 con il PNG incorporato;
//   - QR rigenerato in-memory (deterministico, stesso contenuto dell'email);
//   - cache su Storage `assets-pubblici/tessere/wallet/v1/{codice}.{png,pdf}`
//     (upsert): la generazione avviene una sola volta per tessera.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';

const SITO = 'https://elbrenz.eu';
const BUCKET = 'assets-pubblici';
const CACHE_PREFIX = 'tessere/wallet/v1';
const W = 1080;
const H = 1686;

// --- init lazy: wasm e font caricati al primo render, una volta per istanza
let FONT_REGULAR: Uint8Array | null = null;
let FONT_ITALIC: Uint8Array | null = null;
async function ensureReady(): Promise<void> {
  if (FONT_REGULAR) return;
  await initWasm(await Deno.readFile(new URL('./index_bg.wasm', import.meta.url)));
  FONT_REGULAR = await Deno.readFile(new URL('./fonts/PlayfairDisplay-Regular.ttf', import.meta.url));
  FONT_ITALIC = await Deno.readFile(new URL('./fonts/PlayfairDisplay-Italic.ttf', import.meta.url));
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function fetchDataUri(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`asset ${url}: ${r.status}`);
  return `data:image/png;base64,${toB64(new Uint8Array(await r.arrayBuffer()))}`;
}
// Logo e filigrana dal sito (fetch al primo uso, poi in memoria di istanza).
let LOGO_URI = '';
let FILIGRANA_URI = '';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function svgTessera(p: { nome: string; numero: number; anno: number; qrUri: string }): string {
  const nomeSize = p.nome.length > 24 ? 48 : p.nome.length > 16 ? 60 : 72;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="${W}" height="${H}" fill="#1E2E26"/>
  <!-- bandiera ladina -->
  <rect y="0" width="${W}" height="18" fill="#1E4FB4"/>
  <rect y="18" width="${W}" height="18" fill="#FFFFFF"/>
  <rect y="36" width="${W}" height="18" fill="#1E9C48"/>
  <rect y="${H - 54}" width="${W}" height="18" fill="#1E4FB4"/>
  <rect y="${H - 36}" width="${W}" height="18" fill="#FFFFFF"/>
  <rect y="${H - 18}" width="${W}" height="18" fill="#1E9C48"/>
  <!-- filigrana Aquila Tirolensis dorata (opacità già nel PNG) -->
  <image href="${FILIGRANA_URI}" x="90" y="360" width="900"/>
  <!-- intestazione -->
  <image href="${LOGO_URI}" x="90" y="110" width="150" height="150"/>
  <text x="270" y="165" font-family="Playfair Display" font-size="23" fill="#D9A94E" letter-spacing="5">ASSOCIAZIONE STORICO</text>
  <text x="270" y="196" font-family="Playfair Display" font-size="23" fill="#D9A94E" letter-spacing="5">CULTURALE LINGUISTICA</text>
  <text x="270" y="252" font-family="Playfair Display" font-size="54" fill="#F5EEDD">El <tspan fill="#C8923E" font-style="italic">Brenz</tspan> dle Val del Nos</text>
  <line x1="90" y1="320" x2="${W - 90}" y2="320" stroke="#C8923E" stroke-opacity="0.45" stroke-width="2"/>
  <!-- dati socio -->
  <text x="540" y="420" text-anchor="middle" font-family="Playfair Display" font-size="27" fill="#F5EEDD" fill-opacity="0.7" letter-spacing="8">TESSERA SOCIO · ANNO ${p.anno}</text>
  <text x="540" y="520" text-anchor="middle" font-family="Playfair Display" font-size="${nomeSize}" fill="#F5EEDD">${escXml(p.nome)}</text>
  <text x="540" y="596" text-anchor="middle" font-family="Playfair Display" font-size="42" fill="#C8923E" letter-spacing="3">N. ${p.numero}</text>
  <!-- QR di verifica -->
  <rect x="310" y="660" width="460" height="460" rx="28" fill="#FFFFFF"/>
  <image href="${p.qrUri}" x="330" y="680" width="420" height="420"/>
  <text x="540" y="1170" text-anchor="middle" font-family="Playfair Display" font-size="24" fill="#F5EEDD" fill-opacity="0.6" letter-spacing="2">verifica in tempo reale · elbrenz.eu</text>
  <!-- motto -->
  <text x="540" y="1300" text-anchor="middle" font-family="Playfair Display" font-style="italic" font-size="44" fill="#D9A94E">Raìs fonde no le &apos;nglacia</text>
  <text x="540" y="1348" text-anchor="middle" font-family="Playfair Display" font-size="24" fill="#F5EEDD" fill-opacity="0.5">Radici profonde non gelano</text>
  <text x="540" y="1440" text-anchor="middle" font-family="Playfair Display" font-size="27" fill="#F5EEDD" fill-opacity="0.75">Valida fino al 31/12/${p.anno}</text>
  <text x="540" y="1580" text-anchor="middle" font-family="Playfair Display" font-size="22" fill="#F5EEDD" fill-opacity="0.45">Associazione El Brenz · Via Trento 40, Malè (TN) · info@elbrenz.eu</text>
</svg>`;
}

async function renderPng(p: { nome: string; numero: number; anno: number; codice: string }): Promise<Uint8Array> {
  await ensureReady();
  if (!LOGO_URI) LOGO_URI = await fetchDataUri(`${SITO}/logo-eb-footer@2x.png`);
  if (!FILIGRANA_URI) FILIGRANA_URI = await fetchDataUri(`${SITO}/decoro/aquila-oro-filigrana.png`);
  const qrUri: string = await QRCode.toDataURL(`${SITO}/tessera/${p.codice}`, {
    width: 420,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1E2E26', light: '#FFFFFF' },
  });
  const svg = svgTessera({ ...p, qrUri });
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: {
      fontBuffers: [FONT_REGULAR!, FONT_ITALIC!],
      defaultFontFamily: 'Playfair Display',
      loadSystemFonts: false,
    },
  });
  return resvg.render().asPng();
}

async function renderPdf(png: Uint8Array): Promise<Uint8Array> {
  // A6 in punti (105×148 mm): tessera centrata con margine.
  const PAGE_W = 297.64, PAGE_H = 419.53, MARGIN = 12;
  const pdf = await PDFDocument.create();
  pdf.setTitle('Tessera socio El Brenz');
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const img = await pdf.embedPng(png);
  const h = PAGE_H - 2 * MARGIN;
  const w = h * (W / H);
  page.drawImage(img, { x: (PAGE_W - w) / 2, y: MARGIN, width: w, height: h });
  return await pdf.save();
}

function fileResponse(bytes: Uint8Array, tipo: 'png' | 'pdf', numero: number, anno: number): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': tipo === 'png' ? 'image/png' : 'application/pdf',
      'Content-Disposition': `attachment; filename="tessera-elbrenz-n${numero}-${anno}.${tipo}"`,
      'Cache-Control': 'public, max-age=86400',
      'X-Robots-Tag': 'noindex',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const m = new URL(req.url).pathname.match(/\/(\d{1,6}-\d{4}-[0-9a-f]{24})\/(png|pdf)\/?$/);
  if (!m) return new Response('Not found', { status: 404 });
  const codice = m[1];
  const tipo = m[2] as 'png' | 'pdf';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: socio } = await supabase.from('domande_tesseramento')
    .select('nome, numero_tessera, anno')
    .eq('codice_tessera', codice)
    .eq('stato', 'approvata')
    .maybeSingle();
  if (!socio) return new Response('Tessera non trovata', { status: 404 });

  // cache-first su Storage
  const cachePath = `${CACHE_PREFIX}/${codice}.${tipo}`;
  const { data: cached } = await supabase.storage.from(BUCKET).download(cachePath);
  if (cached) {
    return fileResponse(new Uint8Array(await cached.arrayBuffer()), tipo, socio.numero_tessera, socio.anno);
  }

  try {
    const png = await renderPng({
      nome: socio.nome,
      numero: socio.numero_tessera,
      anno: socio.anno,
      codice,
    });
    const bytes = tipo === 'png' ? png : await renderPdf(png);
    await supabase.storage.from(BUCKET).upload(cachePath, bytes.slice().buffer as ArrayBuffer, {
      contentType: tipo === 'png' ? 'image/png' : 'application/pdf',
      upsert: true,
    });
    return fileResponse(bytes, tipo, socio.numero_tessera, socio.anno);
  } catch (e) {
    console.error('[tessera-download] render fallito:', e);
    return new Response('Generazione tessera momentaneamente non disponibile', { status: 500 });
  }
});
