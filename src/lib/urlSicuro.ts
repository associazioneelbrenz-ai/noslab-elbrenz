/**
 * urlSicuro — un indirizzo che arriva dal database va in un `href` solo se
 * e' davvero un indirizzo: "javascript:" e "data:" sono stringhe legittime
 * per il database e link pericolosi per il browser. Astro protegge
 * l'attributo dalle virgolette, non dallo schema.
 *
 * - `urlEsterno`: solo http(s) assoluti (siti delle convenzioni, schede degli
 *   organizzatori, fonti d'archivio).
 * - `urlSicuro`: http(s) assoluti oppure percorsi interni che iniziano con
 *   una sola barra (articoli collegati ai luoghi).
 *
 * Restituiscono `null` quando il valore non va reso: il template salta il
 * link invece di renderlo cliccabile.
 *
 * (Audit 13-14/9/2026, XSS-03 / SIC-06.)
 */
export function urlEsterno(u: unknown): string | null {
  const s = String(u ?? '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : null;
}

export function urlSicuro(u: unknown): string | null {
  const s = String(u ?? '').trim();
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  if (/^\/(?![\/\\])[^\s]*$/.test(s)) return s;
  return null;
}
