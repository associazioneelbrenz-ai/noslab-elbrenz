// Genera i file di revisione affiancati IT/DE per Brunella Bonapace.
//
// Sorgente: docs/traduzioni_de/data/<pagina>.json
//   { "pagina": "gita-...", "titolo": "...", "url_de": "/de/...",
//     "righe": [ { "it": "...", "de": "..." }, ... ] }
//
// Output: docs/traduzioni_de/<pagina>.docx  (tabella 2 colonne, 1 riga/paragrafo)
//         docs/traduzioni_de/INDICE.docx     (elenco pagine + conteggi)
//
// La traduzione DE la scrive Claude a mano (regole identitarie del brief);
// questo script si limita a impaginare le coppie per la revisione. dev-only.
//
// Uso: node scripts/genera-docx-traduzioni.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
} from 'docx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'docs', 'traduzioni_de');
const DATA = join(DIR, 'data');

const ORO = 'C8923E';
const SCURO = '1E2E26';

function cella(testo, opts = {}) {
  const righe = String(testo ?? '').split('\n');
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: opts.header ? { fill: SCURO } : undefined,
    children: righe.map((r) => new Paragraph({
      children: [new TextRun({
        text: r,
        bold: !!opts.header,
        color: opts.header ? 'F5EEDD' : '000000',
        size: opts.header ? 22 : 21,
      })],
    })),
  });
}

function bordo() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b };
}

function documentoPagina(dati) {
  const header = new TableRow({
    tableHeader: true,
    children: [cella('Italiano (fonte)', { header: true }), cella('Deutsch (bozza Claude, da rivedere)', { header: true })],
  });
  const righe = (dati.righe ?? []).map((r) => new TableRow({ children: [cella(r.it), cella(r.de)] }));
  return new Document({
    creator: 'El Brenz APS',
    title: `Traduzione DE — ${dati.pagina}`,
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: dati.titolo ?? dati.pagina, color: SCURO })] }),
        new Paragraph({ children: [new TextRun({ text: `Pagina: ${dati.url_de ?? ''}`, italics: true, color: '666666', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Revisione terminologica: Brunella Bonapace. La terminologia chiave e gli esonimi delle valli sono gia validati; correzioni nella colonna DE.', size: 20, color: '666666' })] }),
        new Paragraph({ text: '' }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: bordo(), rows: [header, ...righe] }),
      ],
    }],
  });
}

async function main() {
  if (!existsSync(DATA)) { console.error('Nessuna cartella dati:', DATA); process.exit(0); }
  mkdirSync(DIR, { recursive: true });
  const files = readdirSync(DATA).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) { console.log('Nessun file dati in', DATA); return; }
  const indice = [];
  for (const f of files) {
    const dati = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    const doc = documentoPagina(dati);
    const buf = await Packer.toBuffer(doc);
    const out = join(DIR, `${dati.pagina}.docx`);
    writeFileSync(out, buf);
    indice.push({ pagina: dati.pagina, titolo: dati.titolo ?? dati.pagina, url: dati.url_de ?? '', n: (dati.righe ?? []).length });
    console.log(`  ✓ ${dati.pagina}.docx (${(dati.righe ?? []).length} paragrafi)`);
  }
  // indice
  const rowsIdx = [
    new TableRow({ tableHeader: true, children: [cella('Pagina', { header: true }), cella('Paragrafi', { header: true })] }),
    ...indice.map((i) => new TableRow({ children: [cella(`${i.titolo}\n${i.url}`), cella(String(i.n))] })),
  ];
  const docIdx = new Document({
    creator: 'El Brenz APS', title: 'Indice traduzioni DE',
    sections: [{ children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Traduzioni DE da rivedere', color: SCURO })] }),
      new Paragraph({ children: [new TextRun({ text: `${indice.length} pagine. Un file .docx per pagina, tabella IT/DE a due colonne.`, color: '666666', size: 20 })] }),
      new Paragraph({ text: '' }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: bordo(), rows: rowsIdx }),
    ] }],
  });
  writeFileSync(join(DIR, 'INDICE.docx'), await Packer.toBuffer(docIdx));
  console.log(`  ✓ INDICE.docx (${indice.length} pagine)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
