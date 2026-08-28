// scrivi-versione.mjs — timbro di versione in produzione.
// Brief "Piano di salvataggio gratuito" (28/8/2026), sezione sul buco
// trovato dopo: il sito si deploya da CLI locale, non da git, quindi un
// commit su main non cambia niente in produzione finche' qualcuno non
// lancia `netlify deploy --prod` a mano — e la sentinella, controllando
// solo che le rotte rispondano 200, non se ne accorge: una build vecchia
// risponde bene quanto una nuova.
//
// Scritto PRIMA di `astro build` (vedi "prebuild" in package.json), cosi'
// Astro copia public/versione.json in dist/versione.json e Netlify lo
// serve a un percorso fisso. Se git non e' disponibile nell'ambiente di
// build, i campi valgono 'sconosciuto': la build NON deve fallire per
// questo, un timbro mancante e' meno grave di un sito che non si costruisce.

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

function eseguiGit(comando, difetto) {
  try {
    const esito = execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return esito || difetto;
  } catch {
    return difetto;
  }
}

const commit = eseguiGit('git rev-parse --short HEAD', 'sconosciuto');
const ramo = eseguiGit('git rev-parse --abbrev-ref HEAD', 'sconosciuto');

const versione = {
  commit,
  costruito_il: new Date().toISOString(),
  ramo,
};

mkdirSync('public', { recursive: true });
writeFileSync('public/versione.json', JSON.stringify(versione, null, 1) + '\n');
console.log(`[versione] ${commit} (${ramo}) — ${versione.costruito_il}`);
