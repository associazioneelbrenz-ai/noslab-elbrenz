// prova-sessione-condivisa.mjs — banco di prova dello storage condiviso.
//
// Un difetto qui dentro non si vede: disconnette tutti, e ci si accorge dalle
// segnalazioni. Queste dodici prove coprono i punti dove sbaglierebbe davvero:
// la sessione spezzata in piu' cookie e ricomposta, il residuo dei pezzi
// vecchi quando la sessione si accorcia, l'uscita che deve svuotare anche la
// chiave ereditata, la migrazione di chi era autenticato nell'app, il
// comportamento fuori da elbrenz.eu e gli attributi del cookie.
//
//   node --experimental-strip-types scripts/prova-sessione-condivisa.mjs
// Banco di prova: un finto document.cookie con le stesse regole del browser
// (Max-Age=0 cancella, ogni scrittura sostituisce il cookie con quel nome).
const store = new Map();
globalThis.location = { hostname: 'community.elbrenz.eu' };
globalThis.document = {
  get cookie() { return [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
  set cookie(riga) {
    const [coppia, ...attr] = riga.split(';').map((s) => s.trim());
    const i = coppia.indexOf('=');
    const nome = coppia.slice(0, i), val = coppia.slice(i + 1);
    const morto = attr.some((a) => /^max-age=0$/i.test(a));
    if (morto || val === '') store.delete(nome); else store.set(nome, val);
  },
};
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, v); },
  removeItem(k) { this._d.delete(k); },
};

const { sessioneCondivisa, CHIAVE_SESSIONE } = await import('../src/lib/sessione-condivisa.ts');

let ko = 0;
const dice = (esito, testo) => { console.log(`  ${esito ? 'ok  ' : 'NO  '}${testo}`); if (!esito) ko++; };

// 1) sessione corta: un cookie solo, e si rilegge identica
const s = sessioneCondivisa();
const corta = JSON.stringify({ access_token: 'abc', expires_at: 123 });
s.setItem(CHIAVE_SESSIONE, corta);
dice(s.getItem(CHIAVE_SESSIONE) === corta, 'sessione corta: scritta e riletta identica');
dice(store.has(CHIAVE_SESSIONE), 'sessione corta: sta in un cookie solo');

// 2) sessione lunga: spezzata in pezzi e ricomposta identica
const lunga = JSON.stringify({ access_token: 'x'.repeat(4200), user: { nome: 'Monica', accenti: 'àèéìòù «»' } });
s.setItem(CHIAVE_SESSIONE, lunga);
dice(s.getItem(CHIAVE_SESSIONE) === lunga, 'sessione lunga (4200 byte): ricomposta identica');
dice(!store.has(CHIAVE_SESSIONE) && store.has(CHIAVE_SESSIONE + '.0'), 'sessione lunga: spezzata in pezzi');

// 3) da lunga a corta: i pezzi vecchi non devono sopravvivere
s.setItem(CHIAVE_SESSIONE, corta);
dice(s.getItem(CHIAVE_SESSIONE) === corta, 'da lunga a corta: rilegge la corta, non un residuo');
dice(!store.has(CHIAVE_SESSIONE + '.0'), 'da lunga a corta: i pezzi vecchi sono spariti');

// 4) uscita: niente resta, ne' cookie ne' localStorage ne' chiave vecchia
const s2 = sessioneCondivisa(['elbrenz-community-auth']);
globalThis.localStorage.setItem('elbrenz-community-auth', corta);
s2.removeItem(CHIAVE_SESSIONE);
dice(s2.getItem(CHIAVE_SESSIONE) === null, 'uscita: non resta dentro per la porta di servizio');

// 5) migrazione: chi era nell'app con la vecchia chiave resta dentro
store.clear(); globalThis.localStorage._d.clear();
globalThis.localStorage.setItem('elbrenz-community-auth', corta);
dice(s2.getItem(CHIAVE_SESSIONE) === corta, 'migrazione: la vecchia sessione dell app viene letta');
s2.setItem(CHIAVE_SESSIONE, corta);
dice(!!store.get(CHIAVE_SESSIONE), 'migrazione: alla prima scrittura passa nel cookie condiviso');

// 6) fuori da elbrenz.eu (locale, anteprime): nessun cookie, solo localStorage
store.clear(); globalThis.localStorage._d.clear();
globalThis.location = { hostname: 'localhost' };
s.setItem(CHIAVE_SESSIONE, corta);
dice(store.size === 0, 'in locale: non scrive cookie di dominio');
dice(s.getItem(CHIAVE_SESSIONE) === corta, 'in locale: funziona lo stesso col localStorage');

// 7) attributi del cookie: Secure, SameSite, dominio giusto
globalThis.location = { hostname: 'elbrenz.eu' };
let ultima = '';
const vero = Object.getOwnPropertyDescriptor(globalThis.document, 'cookie');
Object.defineProperty(globalThis.document, 'cookie', {
  get: vero.get, set(r) { if (r.indexOf('Max-Age=0') === -1) ultima = r; vero.set.call(this, r); },
});
s.setItem(CHIAVE_SESSIONE, corta);
dice(/Domain=\.elbrenz\.eu/.test(ultima) && /Secure/.test(ultima) && /SameSite=Lax/.test(ultima) && /Path=\//.test(ultima),
     'attributi: Domain=.elbrenz.eu, Path=/, Secure, SameSite=Lax');

console.log(ko === 0 ? '\nTutte passate.' : `\n${ko} PROVE FALLITE.`);
process.exit(ko === 0 ? 0 : 1);
