/**
 * jsonPerScript — JSON da mettere dentro un tag script (ld+json o dati).
 *
 * `JSON.stringify` da solo NON e' sicuro dentro un tag script: la stringa
 * "</script>" chiude il tag e quello che segue viene eseguito come codice
 * della pagina. Vale per ogni dato che arriva dal database e che qualcuno,
 * anche in buona fede, puo' aver scritto: un lemma del glossario, il nome di
 * un'attivita' convenzionata, il titolo di un pezzo del museo.
 *
 * Sostituendo ogni "<" con "<" il JSON resta identico per chi lo legge
 * (JSON.parse e i motori di ricerca lo decodificano) ma il parser HTML non
 * vede piu' nessun tag. E' esattamente cio' che Astro fa da solo per
 * `define:vars`; qui lo si fa a mano per `set:html`.
 *
 * (Audit 13-14/9/2026, XSS-01.)
 */
export function jsonPerScript(valore: unknown): string {
  return JSON.stringify(valore).replace(/</g, '\\u003c');
}
