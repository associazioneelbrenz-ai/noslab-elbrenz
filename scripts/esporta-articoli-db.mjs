/**
 * Ponte fra i due corpus degli articoli: esporta in markdown i pezzi scritti
 * in redazione che sul sito non ci sono ancora.
 *
 * IL PROBLEMA. Gli articoli vivono in due posti che non si parlano:
 *   - il SITO rende `src/content/articoli/*.md` (Content Collections);
 *   - l'APP e la redazione leggono la tabella `articolo` del database.
 * Un pezzo scritto in /redazione finisce solo nel database: compare nell'app e
 * non su elbrenz.eu. Questo script chiude quel buco in una direzione sola,
 * DB → markdown, che e' quella che serve: la redazione e' il posto dove si
 * scrive, il markdown e' quello da cui il sito legge.
 *
 * COSA NON FA, di proposito:
 *   - non tocca MAI un file che esiste gia' (chi ha scritto a mano vince);
 *   - non esporta le righe `tipo_contenuto = 'pagina'`: sono le vecchie
 *     pagine WordPress migrate (Contatti, Lo Statuto, Chi siamo, «Anno 2013»…),
 *     quindici delle quali col corpo vuoto, e sul sito esistono gia' come
 *     pagine Astro vere. Esportarle creerebbe doppioni;
 *   - non committa e non pubblica niente: scrive i file e basta, cosi' la
 *     revisione la fa `git diff` prima di decidere.
 *
 * I nuovi file nascono con `draft: true`. Il flip a false resta un atto
 * editoriale esplicito, come vuole ADR-0001.
 *
 *   node scripts/esporta-articoli-db.mjs              # mostra cosa farebbe
 *   node scripts/esporta-articoli-db.mjs --scrivi     # scrive davvero
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTICOLI = join(RADICE, 'src', 'content', 'articoli');

// I pilastri del database usano slug corti, la collection un enum numerato.
const PILASTRO = {
  storia: '1_storia_valli',
  lingua: '2_lingua_ladinita',
  'cultura-materiale': '3_cultura_materiale',
  rievocazioni: '4_rievocazioni_eventi',
  identita: '5_identita_appartenenza',
  'vita-associativa': '6_vita_associativa',
};

function env(chiave) {
  if (process.env[chiave]) return process.env[chiave];
  const f = join(RADICE, '.env.local');
  if (!existsSync(f)) return '';
  const riga = readFileSync(f, 'utf8').split('\n').find((r) => r.startsWith(`${chiave}=`));
  return riga ? riga.slice(chiave.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

/** Stringa YAML sicura: si cita sempre e si raddoppiano gli apici. */
const yaml = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function frontmatter(a) {
  const data = (a.pubblicato_at ?? new Date().toISOString()).slice(0, 10);
  const pilastro = PILASTRO[a.pilastro] ?? '_da_assegnare';
  const tags = Array.isArray(a.tags) ? a.tags : [];
  const righe = [
    '---',
    `title: ${yaml(a.titolo)}`,
    `data_pubblicazione: ${data}`,
    `pilastro: ${pilastro}`,
  ];
  if (tags.length) {
    righe.push('tags:');
    for (const t of tags) righe.push(`  - ${yaml(t)}`);
  }
  // Sempre bozza: la pubblicazione sul sito resta una decisione umana.
  righe.push('draft: true');
  righe.push('archivio: false');
  righe.push(`autore: ${yaml('El Brenz')}`);
  if (a.estratto) righe.push(`excerpt: ${yaml(String(a.estratto).slice(0, 300))}`);
  if (a.immagine_copertina_url) righe.push(`og_image: ${yaml(a.immagine_copertina_url)}`);
  righe.push('---', '');
  return righe.join('\n');
}

async function main() {
  const scrivi = process.argv.includes('--scrivi');

  const URL_SB = env('PUBLIC_SUPABASE_URL') || 'https://wacknihvdjxltiqvxtqr.supabase.co';
  const ANON = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!ANON) {
    console.error('Manca PUBLIC_SUPABASE_ANON_KEY (.env.local).');
    process.exit(1);
  }

  const campi = 'slug,titolo,estratto,corpo_html,pilastro,tags,pubblicato_at,tipo_contenuto,immagine_copertina_url';
  const r = await fetch(`${URL_SB}/rest/v1/v_articoli_pubblici?select=${campi}&tipo_contenuto=eq.post&order=pubblicato_at.desc`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) {
    console.error(`Lettura articoli fallita: HTTP ${r.status}`);
    process.exit(1);
  }
  const righe = await r.json();

  const presenti = new Set(
    readdirSync(ARTICOLI).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
  );

  const mancanti = righe.filter((a) => a.slug && !presenti.has(a.slug));

  console.log(`Nel database: ${righe.length} articoli pubblicati (solo 'post').`);
  console.log(`Gia' in markdown: ${righe.length - mancanti.length}.`);
  console.log(`Da esportare: ${mancanti.length}.\n`);

  if (!mancanti.length) {
    console.log('I due corpus sono allineati: niente da fare.');
    return;
  }

  for (const a of mancanti) {
    const dest = join(ARTICOLI, `${a.slug}.md`);
    console.log(`  · ${a.slug}.md  ← ${a.titolo}`);
    if (scrivi) {
      // Il corpo resta HTML: Astro lo rende dentro il markdown senza
      // conversioni, e una conversione automatica su testo d'archivio
      // rischierebbe di rovinare figure, tabelle e citazioni.
      writeFileSync(dest, `${frontmatter(a)}${a.corpo_html ?? ''}\n`, 'utf8');
    }
  }

  console.log(scrivi
    ? `\nScritti ${mancanti.length} file. Rivedili con «git diff» e alza draft a false quando sei d'accordo.`
    : '\nProva secca: nessun file scritto. Rilancia con --scrivi per procedere.');
}

main().catch((e) => { console.error(e); process.exit(1); });
