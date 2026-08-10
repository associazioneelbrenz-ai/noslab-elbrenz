#!/usr/bin/env node
/**
 * glossario-in-andreas.mjs — versa il glossario dei Guardiani nella base di
 * conoscenza di Andreas.
 *
 * PERCHE' ESISTE. Il 10 agosto 2026 a qualcuno che chiedeva «come si dice casa
 * in noneso» Andreas ha risposto «cia», che nel glossario e' la culla dei
 * bambini. Non se l'era inventata dal nulla: e' una voce vera, pescata per
 * assonanza. Il punto e' quello che NON aveva. L'Associazione ha un dizionario
 * di centocinquanta voci validate da una commissione, con parlata, paese e
 * contributore, e l'assistente rispondeva alle domande di lessico leggendo
 * prose storiche e tabelle di fonetica. Su una domanda lessicale non aveva una
 * fonte lessicale, e ha riempito il vuoto.
 *
 * COSA FA. Legge i lemmi PUBBLICATI dalla vista pubblica e li manda a
 * `ingest-chunks`, il canale gia' usato per la Base Linguistica. Non tocca
 * `andreas-chat`, che resta intoccabile: cambia soltanto cio' che Andreas ha
 * da leggere.
 *
 * SOLO I PUBBLICATI. Una voce in revisione e' lingua non ancora confermata, e
 * un assistente che la ripete la trasforma in verita' prima che un curatore
 * abbia deciso.
 *
 * UN FRAMMENTO PER LEMMA, non un elenco unico. Andreas recupera sei frammenti
 * per domanda: se il glossario fosse un blocco solo, una domanda su una parola
 * porterebbe dentro tutte le altre centocinquanta e il modello sceglierebbe a
 * caso. Cosi' invece la domanda «come si dice casa in noneso» pesca la voce
 * giusta, e le cinque piu' vicine fanno da contorno.
 *
 * E OGNI FRAMMENTO CONTIENE LA DOMANDA, non solo la risposta. La riga «Come si
 * dice "casa" in noneso: ciàsa» esiste perche' la somiglianza si misura fra la
 * domanda di chi scrive e il testo del frammento: scriverci dentro la forma
 * della domanda e' cio' che fa funzionare il recupero davvero, invece che in
 * teoria.
 *
 * SI PUO' RILANCIARE QUANDO SI VUOLE: `replace_chunks` ripulisce e riscrive,
 * quindi dopo una sessione di curatela basta rieseguirlo.
 *
 *   node scripts/glossario-in-andreas.mjs           # giro a vuoto, non scrive
 *   node scripts/glossario-in-andreas.mjs --esegui  # scrive davvero
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SOURCE_KEY = 'GLOSSARIO_GUARDIANI_v1';
const ESEGUI = process.argv.includes('--esegui');

// ── le variabili, dal file locale: nessun segreto nel codice ────────────────
function env() {
  const out = {};
  for (const f of ['.env.local', '.env']) {
    try {
      for (const riga of readFileSync(f, 'utf8').split('\n')) {
        const i = riga.indexOf('=');
        if (i < 1 || riga.trimStart().startsWith('#')) continue;
        const k = riga.slice(0, i).trim();
        if (!out[k]) out[k] = riga.slice(i + 1).trim();
      }
    } catch { /* il file puo' non esserci */ }
  }
  return out;
}
const E = env();
const URL_SB = E.PUBLIC_SUPABASE_URL;
const ANON = E.PUBLIC_SUPABASE_ANON_KEY;
const TOKEN = E.INGEST_TOKEN;
if (!URL_SB || !ANON) { console.error('Mancano PUBLIC_SUPABASE_URL / ANON_KEY in .env.local'); process.exit(1); }
if (ESEGUI && !TOKEN) { console.error('Manca INGEST_TOKEN in .env.local: senza non si scrive.'); process.exit(1); }

const PARLATA = {
  noneso: 'noneso (Val di Non)',
  solander: 'solander (Val di Sole)',
  rabies: 'rabies (Val di Rabbi)',
  pegaes: 'pegaes (Val di Pejo)',
};

/**
 * Il testo di un frammento. Scritto per essere letto da un modello: prima la
 * parola, poi il significato, poi la domanda nella forma in cui la gente la
 * fa, poi il contorno. Niente markdown pesante: sono poche righe.
 */
function frammento(v, paesiVeri) {
  const parlata = PARLATA[v.variante] ?? v.variante ?? 'parlata non indicata';
  // Il paese si scrive solo se e' un paese davvero. Ventinove voci hanno
  // «Italia» nel campo, e qualcuna ci ha messo una nota: sono errori del
  // vecchio modulo a testo libero, gia' segnalati nella pagina della qualita'.
  // Qui non si indovina e non si corregge: se il valore non e' nel vocabolario
  // dei paesi, si tace, perche' «Ciapar, a Italia» in bocca ad Andreas sarebbe
  // una sciocchezza detta con autorevolezza.
  const dove = v.comune && paesiVeri.has(v.comune) ? `, a ${v.comune}` : '';
  const righe = [];

  righe.push(`${v.termine} — ${parlata}${dove}`);
  righe.push(`Significato in italiano: ${v.significato_it}`);

  // La forma della domanda, nelle due direzioni. E' la riga che fa agganciare
  // il recupero: chi scrive chiede «come si dice X», non «lemma».
  const it = (v.variante_italiana || v.significato_it || '').trim();
  if (it) {
    const breve = it.length > 60 ? it.slice(0, 60) : it;
    righe.push(`Come si dice «${breve}» in ${v.variante ?? 'ladino anaunico'}: ${v.termine}.`);
  }
  righe.push(`Che cosa vuol dire «${v.termine}» in ladino anaunico: ${v.significato_it}`);

  if (v.categoria_gramm) righe.push(`Categoria grammaticale: ${v.categoria_gramm}.`);
  if (v.esempio_uso) righe.push(`Esempio d'uso: ${v.esempio_uso}`);
  if (v.etimologia) righe.push(`Etimologia: ${v.etimologia}`);
  if (v.proverbi) righe.push(`Detti e proverbi: ${v.proverbi}`);
  if (v.audio_url) righe.push('Di questa parola esiste una registrazione della pronuncia nel glossario.');

  const chi = v.contributore_firma ? ` Portata da ${v.contributore_firma}.` : '';
  righe.push(
    `Voce del glossario «Guardiani de la lenga» dell'Associazione El Brenz, validata dalla Commissione Linguistica.${chi}` +
    (v.slug ? ` Scheda: https://elbrenz.eu/guardiani-de-la-lenga/${v.slug}` : ''),
  );
  return righe.join('\n');
}

/** Un indice per parlata: serve alle domande generali («che parole avete in rabies?»). */
function indice(parlata, voci) {
  const elenco = voci.map((v) => `${v.termine} = ${v.significato_it}`).join('; ');
  return [
    `Indice del glossario: parole raccolte in ${PARLATA[parlata] ?? parlata}`,
    `Nel glossario «Guardiani de la lenga» sono raccolte ${voci.length} voci in ${PARLATA[parlata] ?? parlata}.`,
    `Elenco: ${elenco}`,
    'Il glossario cresce con i contributi della comunita\' e ogni voce e\' validata da un curatore prima di comparire.',
  ].join('\n');
}

const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
const { data, error } = await sb.from('glossario_pubblico').select('*').order('termine');
if (error) { console.error('Non riesco a leggere il glossario:', error.message); process.exit(1); }
const voci = data ?? [];
if (!voci.length) { console.error('Glossario vuoto: non scrivo niente.'); process.exit(1); }

// I paesi veri, secondo il vocabolario controllato: e' l'autorita' su cosa sia
// un paese e cosa no, e non serve indovinare.
const { data: vocab } = await sb.from('vocabolario_pubblico').select('valore').eq('dominio', 'comune');
const paesiVeri = new Set((vocab ?? []).map((r) => r.valore));
const fuori = [...new Set(voci.map((v) => v.comune).filter((c) => c && !paesiVeri.has(c)))];
if (fuori.length) console.log(`Paesi fuori vocabolario, taciuti nei frammenti: ${fuori.join(', ')}`);

const chunks = [];
let i = 0;
for (const v of voci) {
  chunks.push({
    chunk_index: i++,
    titolo_sezione: `${v.termine} (${v.variante ?? '?'})`,
    contenuto: frammento(v, paesiVeri),
    metadata: { lemma: v.termine, parlata: v.variante, comune: v.comune, slug: v.slug },
  });
}
const perParlata = {};
for (const v of voci) (perParlata[v.variante ?? 'altra'] ||= []).push(v);
for (const [p, elenco] of Object.entries(perParlata)) {
  chunks.push({
    chunk_index: i++,
    titolo_sezione: `Indice ${p}`,
    contenuto: indice(p, elenco),
    metadata: { indice: true, parlata: p },
  });
}

console.log(`Glossario: ${voci.length} voci pubblicate → ${chunks.length} frammenti`);
for (const [p, e] of Object.entries(perParlata)) console.log(`  ${p}: ${e.length}`);
console.log('\n--- esempio di frammento ---');
console.log(chunks.find((c) => /ciàsa|casa/i.test(c.contenuto))?.contenuto ?? chunks[0].contenuto);
console.log('----------------------------\n');

if (!ESEGUI) {
  console.log('Giro a vuoto: non ho scritto niente. Rilancia con --esegui per versarlo nella KB.');
  process.exit(0);
}

const res = await fetch(`${URL_SB}/functions/v1/ingest-chunks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-ingest-token': TOKEN },
  body: JSON.stringify({
    source_key: SOURCE_KEY,
    source: {
      titolo: 'Glossario «Guardiani de la lenga» — ladino anaunico delle Valli del Noce',
      autori: 'Comunita\' dei Guardiani de la lenga; curatela della Commissione Linguistica El Brenz',
      anno: new Date().getFullYear(),
      editore: 'Associazione Storico Culturale Linguistica El Brenz APS',
      // `andreas_kb_sorgente` ha un vocabolario chiuso di tipi e «glossario»
      // non c'e'. Si usa quello che esiste ed e' giusto: un dizionario e' un
      // manuale linguistico, ed e' lo stesso tipo della Base Linguistica, con
      // cui questa sorgente lavora in coppia.
      tipo_sorgente: 'manuale_linguistico',
      lingua: 'lld-anau',
      pilastro: 'lingua_e_ladinita',
      descrizione: 'Le voci validate del glossario del ladino anaunico: parola, parlata, paese, significato, esempio d\'uso. E\' la fonte da usare per qualunque domanda su come si dice una cosa nelle parlate delle valli.',
      visibile_ospiti: true,
      note_interne: 'Rigenerato da scripts/glossario-in-andreas.mjs. Solo lemmi pubblicati. Rilanciare dopo ogni sessione di curatela.',
      metadata: { kb_key: SOURCE_KEY, generato_il: new Date().toISOString(), voci: voci.length },
    },
    chunks,
    set_n_chunks: chunks.length,
    replace_chunks: true,
  }),
});
const esito = await res.json().catch(() => ({}));
console.log(res.ok ? 'Fatto:' : 'NON riuscito:', JSON.stringify(esito).slice(0, 600));
process.exit(res.ok ? 0 : 1);
