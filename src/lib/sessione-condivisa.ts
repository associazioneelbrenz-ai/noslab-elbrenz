/**
 * sessione-condivisa.ts — una sola identità per tutto elbrenz.eu.
 *
 * PERCHE' ESISTE. Il sito vive su `elbrenz.eu`, l'app dei soci su
 * `community.elbrenz.eu`. Il localStorage NON attraversa i sottodomini, quindi
 * un socio che si era autenticato nell'app, aprendo il sito, era uno
 * sconosciuto. Il risultato concreto: Andreas gli dava le tre domande
 * dell'anonimo invece delle sue cento, e la gente lo segnalava dicendo «ma io
 * sono loggato». Aveva ragione: era loggato, solo non lì.
 *
 * I numeri del 10 agosto 2026: dal 2 agosto UNA sola riga nel conteggio per
 * utente contro novantatré messaggi in quello per indirizzo IP. Non un caso
 * limite: la regola.
 *
 * COME SI RISOLVE. I due domini condividono il padre `elbrenz.eu`, e un cookie
 * su `.elbrenz.eu` lo leggono entrambi. Qui c'è uno «storage» che Supabase usa
 * al posto del localStorage: scrive nel cookie condiviso E nel localStorage,
 * legge dal cookie e, se non c'è, dal localStorage.
 *
 * TRE REGOLE CHE LO RENDONO SICURO DA METTERE IN PRODUZIONE:
 *
 *  1. NON TOGLIE NIENTE. Il localStorage continua a essere scritto come prima.
 *     Se i cookie fossero bloccati, o il dominio non fosse elbrenz.eu (sviluppo
 *     in locale, anteprime Netlify), tutto si comporta esattamente come oggi.
 *
 *  2. NON BUTTA FUORI NESSUNO. `chiaviEredita` permette di leggere la sessione
 *     dalla vecchia chiave di ciascuna applicazione: chi era autenticato resta
 *     autenticato, e alla prima scrittura la sessione migra da sola.
 *
 *  3. OGNI ACCESSO E' PROTETTO. Un'eccezione qui dentro significherebbe
 *     nessuno che riesce più ad autenticarsi da nessuna parte: ogni lettura e
 *     ogni scrittura sta dentro un try, e in caso di guaio si ricade sul
 *     comportamento di prima.
 *
 * SULLA SICUREZZA. Il gettone finisce in un cookie leggibile da JavaScript, che
 * come esposizione equivale al localStorage di oggi (entrambi si leggono con un
 * XSS). In più viene inviato nelle richieste ai sottodomini: per questo è
 * `Secure` e `SameSite=Lax`. E' lo stesso schema che usa la libreria ufficiale
 * di Supabase per il rendering lato server.
 */

const DOMINIO = '.elbrenz.eu';
// I browser tengono circa 4096 byte per cookie, nome e attributi compresi. La
// sessione di Supabase (due gettoni piu' il profilo) puo' superarli, quindi si
// spezza in pezzi numerati, come fa la libreria ufficiale.
const PEZZO = 3000;
const MAX_PEZZI = 6;

/** Il cookie condiviso ha senso solo sul dominio vero: in locale si tace. */
function suElbrenz(): boolean {
  try {
    return typeof location !== 'undefined' && /(^|\.)elbrenz\.eu$/.test(location.hostname);
  } catch {
    return false;
  }
}

function cookieGrezzi(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const parte of document.cookie.split(';')) {
      const i = parte.indexOf('=');
      if (i < 1) continue;
      out[decodeURIComponent(parte.slice(0, i).trim())] = parte.slice(i + 1).trim();
    }
  } catch { /* niente document: si torna vuoto */ }
  return out;
}

function leggiCookie(nome: string): string | null {
  const tutti = cookieGrezzi();
  // Prima il cookie intero, poi l'eventuale versione a pezzi.
  if (tutti[nome]) {
    try { return decodeURIComponent(tutti[nome]); } catch { return null; }
  }
  let unito = '';
  for (let i = 0; i < MAX_PEZZI; i++) {
    const p = tutti[`${nome}.${i}`];
    if (!p) break;
    unito += p;
  }
  if (!unito) return null;
  try { return decodeURIComponent(unito); } catch { return null; }
}

function scriviCookie(nome: string, valore: string): void {
  const codificato = encodeURIComponent(valore);
  const comune = `Domain=${DOMINIO}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  // Si ripulisce sempre l'altra forma, altrimenti un residuo a pezzi
  // sopravvive a una scrittura intera e viene letto per primo la volta dopo.
  for (let i = 0; i < MAX_PEZZI; i++) {
    document.cookie = `${nome}.${i}=; ${comune}; Max-Age=0`;
  }
  if (codificato.length <= PEZZO) {
    document.cookie = `${nome}=${codificato}; ${comune}`;
    return;
  }
  document.cookie = `${nome}=; ${comune}; Max-Age=0`;
  for (let i = 0; i * PEZZO < codificato.length && i < MAX_PEZZI; i++) {
    document.cookie = `${nome}.${i}=${codificato.slice(i * PEZZO, (i + 1) * PEZZO)}; ${comune}`;
  }
}

function cancellaCookie(nome: string): void {
  const comune = `Domain=${DOMINIO}; Path=/; SameSite=Lax; Secure; Max-Age=0`;
  document.cookie = `${nome}=; ${comune}`;
  for (let i = 0; i < MAX_PEZZI; i++) document.cookie = `${nome}.${i}=; ${comune}`;
}

/**
 * Lo storage da passare a `createClient({ auth: { storage } })`.
 * `chiaviEredita`: le chiavi di localStorage usate PRIMA di questo cambiamento,
 * lette solo se non c'è già una sessione condivisa. Servono a non disconnettere
 * chi era dentro.
 */
export function sessioneCondivisa(chiaviEredita: string[] = []) {
  return {
    getItem(chiave: string): string | null {
      if (suElbrenz()) {
        try {
          const c = leggiCookie(chiave);
          if (c) return c;
        } catch { /* si prosegue con il localStorage */ }
      }
      try {
        const l = localStorage.getItem(chiave);
        if (l) return l;
      } catch { /* niente localStorage: si prosegue */ }
      for (const vecchia of chiaviEredita) {
        try {
          const v = localStorage.getItem(vecchia);
          if (v) return v;
        } catch { /* si prosegue */ }
      }
      return null;
    },

    setItem(chiave: string, valore: string): void {
      // Il localStorage PRIMA: e' il canale che funziona da sempre, e non deve
      // dipendere dalla riuscita del cookie.
      try { localStorage.setItem(chiave, valore); } catch { /* modalita' privata */ }
      if (suElbrenz()) {
        try { scriviCookie(chiave, valore); } catch { /* si resta al localStorage */ }
      }
    },

    removeItem(chiave: string): void {
      try { localStorage.removeItem(chiave); } catch { /* niente */ }
      // Uscendo si esce davvero: anche dalle chiavi vecchie, altrimenti il
      // ripiego rimetterebbe dentro una sessione che l'utente ha chiuso.
      for (const vecchia of chiaviEredita) {
        try { localStorage.removeItem(vecchia); } catch { /* niente */ }
      }
      if (suElbrenz()) {
        try { cancellaCookie(chiave); } catch { /* niente */ }
      }
    },
  };
}

/** La chiave unica: la stessa sul sito e nell'app, ed e' tutto il punto. */
export const CHIAVE_SESSIONE = 'elbrenz-auth';
