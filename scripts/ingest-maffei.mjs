/**
 * Ingestion di Maffei 1805 nella KB di Andreas (primo blocco del dossier fonti).
 *
 * Jacopo Antonio Maffei, «Periodi istorici e topografia delle valli di Non e
 * di Sole nel Tirolo meridionale», Rovereto, Marchesani, 1805. Dominio
 * pubblico; trascrizione di Wikisource italiana in CC BY-SA. E' la fonte che
 * il dossier chiama «la scoperta piu' importante»: descrizione storica e
 * topografica delle due valli, pieve per pieve, scritta da un contemporaneo
 * del periodo tirolese.
 *
 * REGOLE DEL DOSSIER RISPETTATE QUI:
 * - non e' una pagina web copiata: e' un'OPERA, con autore, anno, editore e
 *   stato dei diritti registrati nella sorgente;
 * - la datazione dell'interpretazione viaggia nei metadata di ogni sorgente
 *   (registro: fonte_d_epoca, anno_interpretazione: 1805): un'opera del 1805
 *   e' eccellente sui fatti e datata sulle letture, e Andreas deve dirlo;
 * - attribuzione: autore, 1805, Wikisource, CC BY-SA.
 *
 * ONESTA' SUL CORPUS: la pagina Wikisource dichiara «Questo testo e'
 * incompleto» (trascrizione in corso). Si ingerisce cio' che c'e' e lo si
 * scrive nei metadata (trascrizione_completa: false): meglio un corpus
 * parziale dichiarato che uno finto-integrale.
 *
 * COME: un POST a ingest-chunks PER CAPITOLO (l'edge fa gli embedding in
 * batch e un solo POST da ~200 chunk sforerebbe il timeout). Il primo POST
 * usa replace_chunks per l'idempotenza dei rilanci; i successivi accodano
 * con chunk_index progressivo.
 *
 *   node scripts/ingest-maffei.mjs           # prova secca: scarica e conta
 *   node scripts/ingest-maffei.mjs --ingest  # ingerisce davvero
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://it.wikisource.org/w/api.php';
const OPERA = 'Periodi istorici e topografia delle valli di Non e Sole nel Tirolo meridionale';
const SOURCE_KEY = 'MAFFEI_1805';
const MAX_CHUNK = 1900;   // in linea con la KB esistente (media 1600, max 2400)

// I capitoli di contenuto, nell'ordine dell'opera. Le pagine radice, l'Indice
// Generale e le pagine-sommario di sezione si saltano: un chunk-sommario
// ruberebbe slot di retrieval senza dire niente.
const CAPITOLI = [
  ['Introduzione', 'Introduzione'],
  ['Periodi istorici/Notizie dell\'Anaunia de\' tempi antichi del Gentilesimo', 'Periodi istorici · Notizie dell\'Anaunia dei tempi antichi del Gentilesimo'],
  ['Periodi istorici/Della Conversione dell\'Anaunia alla fede di Gesù Cristo', 'Periodi istorici · Della Conversione dell\'Anaunia'],
  ['Periodi istorici/Delle cose dell\'Anaunia sotto varj Governi finchè il Trentino fu eretto in Principato Vescovile', 'Periodi istorici · L\'Anaunia sotto vari governi fino al Principato Vescovile'],
  ['Periodi istorici/Dell\'Anaunia, ossia delle Valli di Non e di Sole, sino a Bernardo Clesio', 'Periodi istorici · Le Valli di Non e di Sole fino a Bernardo Clesio'],
  ['Periodi istorici/Da Bernardo Clesio fino al Secolo XVIII', 'Periodi istorici · Da Bernardo Clesio al Settecento'],
  ['Periodi istorici/Dal Secolo XVIII. fino al principio del XIX.', 'Periodi istorici · Dal Settecento al principio dell\'Ottocento'],
  ['Topografia della Valle di Non/Introduzione', 'Topografia della Valle di Non · Introduzione'],
  ['Topografia della Valle di Non/Quartiere di mezzo', 'Topografia della Valle di Non · Quartiere di mezzo'],
  ['Topografia della Valle di Non/Quartiere di là dell\'acqua', 'Topografia della Valle di Non · Quartiere di là dell\'acqua'],
  ['Topografia della Valle di Non/Giurisdizione di Castelfondo', 'Topografia della Valle di Non · Giurisdizione di Castelfondo'],
  ['Topografia della Valle di Sole', 'Topografia della Valle di Sole'],
];

function env(chiave) {
  if (process.env[chiave]) return process.env[chiave];
  const f = join(RADICE, '.env.local');
  if (!existsSync(f)) return '';
  const riga = readFileSync(f, 'utf8').split('\n').find((r) => r.startsWith(`${chiave}=`));
  return riga ? riga.slice(chiave.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

/** Scarica una sottopagina e la riduce a testo pulito. */
async function scarica(sottopagina) {
  const url = `${API}?action=parse&page=${encodeURIComponent(`${OPERA}/${sottopagina}`)}&prop=text&format=json&formatversion=2`;
  const r = await fetch(url, { headers: { 'User-Agent': 'ElBrenz-KB/1.0 (info@elbrenz.eu)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} su ${sottopagina}`);
  const d = await r.json();
  let h = d.parse?.text ?? '';

  // Pulizia: via stili, metadati RDF microformat, avvisi di servizio, numeri
  // di pagina della scansione e riferimenti interni di Wikisource.
  h = h.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ');
  h = h.replace(/<span[^>]*class="[^"]*(ws-noexport|noprint|mw-page-container)[^"]*"[^>]*>[\s\S]*?<\/span>/g, ' ');
  h = h.replace(/<div[^>]*class="[^"]*(ws-noexport|noprint|intestazione|sister-project|navigation-not-searchable)[^"]*"[^>]*>[\s\S]*?<\/div>/g, ' ');
  h = h.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, ' ');           // richiami di nota
  h = h.replace(/<[^>]+>/g, ' ');
  // Entita' HTML principali
  h = h.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
       .replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&#8217;|&rsquo;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»');
  // Residui dei microdati dublin core rimasti come testo
  h = h.replace(/dc:[a-z]+/gi, ' ').replace(/opt:role="?aut"?/gi, ' ');
  h = h.replace(/Questo testo è incompleto\.?/gi, ' ');
  h = h.replace(/&#x25(ba|c4);|[◄►]/gi, ' ');   // frecce della navigazione
  h = h.replace(/\s+/g, ' ').trim();
  // L'intestazione di navigazione di Wikisource (titoli precedente/successivo)
  // chiude con «]»: se una parentesi quadra orfana compare nei primi 250
  // caratteri, tutto cio' che la precede e' navigazione, non testo del 1805.
  const parentesi = h.indexOf(']');
  if (parentesi > -1 && parentesi < 250) h = h.slice(parentesi + 1).trim();
  // Capolettera spezzato dallo strip («C Hiunque» -> «Chiunque»): la lettera
  // isolata seguita da parola con maiuscola capita solo in apertura di
  // capitolo, quindi la fusione si applica ai soli primi 200 caratteri.
  const testa = h.slice(0, 200).replace(/\b([A-Z]) ([A-Z])([a-zàèéìòù])/g, (_, a, b, c) => a + b.toLowerCase() + c);
  h = testa + h.slice(200);
  return h;
}

/** Spezza il testo in chunk su confini di frase, fino a MAX_CHUNK. */
function spezza(testo) {
  const frasi = testo.split(/(?<=[.!?;])\s+/);
  const out = [];
  let cur = '';
  for (const f of frasi) {
    if ((cur + ' ' + f).length > MAX_CHUNK && cur) {
      out.push(cur.trim());
      cur = f;
    } else {
      cur = cur ? cur + ' ' + f : f;
    }
  }
  if (cur.trim().length > 0) out.push(cur.trim());
  // I mozziconi finali sotto i 200 caratteri si fondono col precedente.
  if (out.length > 1 && out[out.length - 1].length < 200) {
    const coda = out.pop();
    out[out.length - 1] += ' ' + coda;
  }
  return out;
}

async function main() {
  const ingest = process.argv.includes('--ingest');
  const TOKEN = env('INGEST_TOKEN');
  if (ingest && !TOKEN) {
    console.error('Manca INGEST_TOKEN in .env.local.');
    process.exit(1);
  }

  // 1. Scarico e spezzo tutto, poi decido.
  const pacchi = [];
  let totaleChar = 0;
  for (const [sotto, titoloSezione] of CAPITOLI) {
    const testo = await scarica(sotto);
    if (testo.length < 300) {
      console.warn(`  · SALTATO «${titoloSezione}»: solo ${testo.length} caratteri (pagina vuota o sommario)`);
      continue;
    }
    const chunks = spezza(testo);
    totaleChar += testo.length;
    pacchi.push({ titoloSezione, chunks });
    console.log(`  · ${titoloSezione}: ${testo.length} caratteri -> ${chunks.length} chunk`);
    await new Promise((r) => setTimeout(r, 300));   // gentilezza verso Wikisource
  }
  const totChunk = pacchi.reduce((s, p) => s + p.chunks.length, 0);
  console.log(`\nTotale: ${pacchi.length} capitoli, ${totaleChar} caratteri, ${totChunk} chunk.`);

  if (!ingest) {
    // Anteprima dei primi chunk per il controllo umano della pulizia.
    const anteprima = pacchi.slice(0, 2).map((p) =>
      `=== ${p.titoloSezione} ===\n${p.chunks[0].slice(0, 700)}…`).join('\n\n');
    console.log('\n--- ANTEPRIMA PULIZIA ---\n' + anteprima);
    console.log('\nProva secca: nessuna scrittura. Rilancia con --ingest.');
    return;
  }

  // 2. Un POST per capitolo. Il primo con replace_chunks (idempotenza).
  const source = {
    titolo: 'Periodi istorici e topografia delle valli di Non e di Sole nel Tirolo meridionale',
    autori: 'Jacopo Antonio Maffei',
    anno: 1805,
    editore: 'Marchesani, Rovereto',
    tipo_sorgente: 'libro',
    lingua: 'it',
    pilastro: 'storia',
    visibile_ospiti: true,
    descrizione: 'Descrizione storica e topografica delle Valli di Non e di Sole, pieve per pieve, scritta nel 1805 da un contemporaneo del periodo tirolese. Dominio pubblico; trascrizione Wikisource (CC BY-SA), dichiarata incompleta alla data di ingestion.',
    note_interne: 'Ingerito il 2/8/2026 da Wikisource con scripts/ingest-maffei.mjs. Trascrizione parziale: rilanciare lo script quando Wikisource completa i capitoli mancanti.',
    metadata: {
      registro: 'fonte_d_epoca',
      anno_interpretazione: 1805,
      licenza: 'Opera in dominio pubblico; trascrizione Wikisource CC BY-SA',
      url: 'https://it.wikisource.org/wiki/' + OPERA.replace(/ /g, '_'),
      trascrizione_completa: false,
    },
  };

  let indice = 0;
  let primo = true;
  for (const p of pacchi) {
    const chunks = p.chunks.map((c) => ({
      chunk_index: indice++,
      titolo_sezione: p.titoloSezione,
      contenuto: c,
      metadata: { registro: 'fonte_d_epoca', anno_interpretazione: 1805 },
    }));
    const r = await fetch('https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/ingest-chunks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-token': TOKEN },
      body: JSON.stringify({
        source_key: SOURCE_KEY,
        source,
        chunks,
        replace_chunks: primo,
        set_n_chunks: indice,
      }),
    });
    const esito = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`  ✗ «${p.titoloSezione}»: HTTP ${r.status}`, JSON.stringify(esito).slice(0, 300));
      process.exit(1);
    }
    console.log(`  ✓ «${p.titoloSezione}»: ${chunks.length} chunk ingeriti`);
    primo = false;
  }
  console.log(`\nFatto: ${indice} chunk nella sorgente ${SOURCE_KEY}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
