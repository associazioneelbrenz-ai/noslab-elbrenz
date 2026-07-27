// ingest-base-linguistica.mjs — ingestione della Base Linguistica v1 in andreas_kb.
//
// Sorgente: docs/andreas/BASE_LINGUISTICA_v1.md
// Chunking PER SEZIONE §: ogni ### sottosezione = 1 chunk; le sezioni ## senza
// sottosezioni = 1 chunk; le TABELLE restano intere dentro il loro chunk.
// ESCLUSE le sezioni 0, 10, 14 (comportamento e registro non sono conoscenza RAG).
// Idempotente: replace_chunks=true → una futura v2 sostituisce la v1 (delete +
// re-insert per sorgente), non si accumula. NON tocca le altre sorgenti.
//
// USO (lo lancia Cristian, ha il secret):
//   INGEST_TOKEN=<token> node scripts/ingest-base-linguistica.mjs
// Dry-run (senza token, solo anteprima dei chunk):
//   node scripts/ingest-base-linguistica.mjs --dry

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/andreas/BASE_LINGUISTICA_v1.md');
const SB = process.env.SUPABASE_URL || 'https://wacknihvdjxltiqvxtqr.supabase.co';
const TOKEN = process.env.INGEST_TOKEN || '';
const DRY = process.argv.includes('--dry') || !TOKEN;
const EXCLUDE = new Set(['0', '10', '14']);

// 1) Segmenta il documento agli heading ## / ###
const lines = fs.readFileSync(DOC, 'utf8').split('\n');
const segs = [];
let buf = null;
for (const line of lines) {
  const h2 = line.match(/^## (\d+)\.\s*(.*)$/);
  const h3 = line.match(/^### (\d+\.\d+)\s*(.*)$/);
  if (h2) { if (buf) segs.push(buf); buf = { level: 2, num: h2[1], title: line.replace(/^##\s*/, '').trim(), body: [] }; }
  else if (h3) { if (buf) segs.push(buf); buf = { level: 3, num: line.match(/^### (\d+\.\d+)/)[1], sec: line.match(/^### (\d+)\.\d+/)[1], title: line.replace(/^###\s*/, '').trim(), body: [] }; }
  else if (buf) buf.body.push(line);
}
if (buf) segs.push(buf);

const cleanBody = (arr) => arr.join('\n').replace(/\n?-{3,}\s*$/, '').trim();

// 2) Assembla i chunk (una sezione con figli ### emette i figli, non sé stessa)
const chunks = [];
let idx = 0;
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  if (s.level === 2) {
    if (EXCLUDE.has(s.num)) continue;
    const hasChild = segs[i + 1] && segs[i + 1].level === 3 && segs[i + 1].sec === s.num;
    if (!hasChild) chunks.push({ chunk_index: idx++, titolo_sezione: s.title, contenuto: cleanBody(s.body), metadata: { sezione: s.num } });
  } else {
    if (EXCLUDE.has(s.sec)) continue;
    chunks.push({ chunk_index: idx++, titolo_sezione: s.title, contenuto: cleanBody(s.body), metadata: { sezione: s.num } });
  }
}

const payload = {
  source_key: 'BASE_LINGUISTICA_v1',
  source: {
    titolo: 'Base Linguistica delle Valli del Noce (Ladino Anaunico)',
    autori: 'Associazione El Brenz',
    anno: 2026,
    tipo_sorgente: 'manuale_linguistico',
    lingua: 'it',
    pilastro: 'lingua',
    descrizione: 'Manuale del Ladino Anaunico (Nònes, Solandro, Rabìes, Pegaés): fonetica comparata, morfosintassi, lessico verificato dai parlanti, convenzioni ortografiche e corpus di riferimento.',
    visibile_ospiti: true,
    metadata: { versione: '1.0', data: '2026-07' },
  },
  chunks,
  replace_chunks: true,
  set_n_chunks: chunks.length,
};

console.log(`Documento: ${DOC}`);
console.log(`Chunk generati: ${chunks.length} (escluse §${[...EXCLUDE].join(', §')})`);
for (const c of chunks) console.log(`  [${String(c.chunk_index).padStart(2, '0')}] §${c.metadata.sezione}  ${c.titolo_sezione.slice(0, 60)}  (${c.contenuto.length} car)`);

if (DRY) {
  console.log('\n--dry / nessun INGEST_TOKEN: anteprima soltanto, niente POST.');
  process.exit(0);
}

const res = await fetch(`${SB}/functions/v1/ingest-chunks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-ingest-token': TOKEN },
  body: JSON.stringify(payload),
});
const txt = await res.text();
console.log(`\ningest-chunks → HTTP ${res.status}\n${txt}`);
process.exit(res.ok ? 0 : 1);
