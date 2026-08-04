// _shared/newsletter.ts — disiscrizione dalle comunicazioni (newsletter/marketing).
//
// Link firmato HMAC nel PATH (mai query string: `=`+2hex si corrompe in
// quoted-printable nelle email). Riusa firmaToken/verificaToken di
// _shared/admin.ts con uno scope dedicato, così NON serve un nuovo secret.
//
// La disiscrizione NON crea tabelle: spegne i flag di consenso esistenti
// (download_lead.consenso_newsletter, guardiani_contributori.consenso_marketing
// e marketing_double_optin). Gli invii futuri filtrano su quei flag, quindi
// flag=false ⇒ soppresso. Revoca del consenso a regola di GDPR.

import { firmaToken } from './admin.ts';

export const UNSUB_SCOPE = 'newsletter-unsub';
// Link a lunga validità: la disiscrizione deve funzionare anche su email vecchie.
export const UNSUB_TTL_MS = 3 * 365 * 24 * 60 * 60 * 1000; // ~3 anni

/** email -> segmento base64url (senza padding, path-safe, niente `=`). */
export function emailToSeg(email: string): string {
  const bytes = new TextEncoder().encode(email);
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** segmento base64url -> email. */
export function segToEmail(seg: string): string {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * URL completo di disiscrizione da inserire (piccolo e sobrio) nelle email
 * marketing. `siteBase` es. "https://elbrenz.eu".
 */
export async function linkDisiscrizione(siteBase: string, email: string, secret: string): Promise<string> {
  const e = email.trim().toLowerCase();
  const exp = Date.now() + UNSUB_TTL_MS;
  const token = await firmaToken(secret, UNSUB_SCOPE, e, exp);
  return `${siteBase.replace(/\/$/, '')}/newsletter/disiscrizione/${emailToSeg(e)}/${exp}/${token}`;
}

// [4/8/2026] CONFERMA dell'iscrizione, cioe' il secondo passo del doppio
// opt-in. Scope diverso da quello della disiscrizione: un collegamento non
// deve poter fare il mestiere dell'altro, e con lo stesso scope basterebbe
// cambiare una parola nell'indirizzo.
export const CONFERMA_SCOPE = 'newsletter-conferma';
// Sette giorni: un consenso confermato a mesi di distanza non dimostra piu'
// niente sulla volonta' di quel momento, e una richiesta che scade e' anche
// un modo di rispettare chi ha deciso di non rispondere.
export const CONFERMA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** URL completo di conferma dell'iscrizione (doppio opt-in). */
export async function linkConferma(siteBase: string, email: string, secret: string): Promise<string> {
  const e = email.trim().toLowerCase();
  const exp = Date.now() + CONFERMA_TTL_MS;
  const token = await firmaToken(secret, CONFERMA_SCOPE, e, exp);
  return `${siteBase.replace(/\/$/, '')}/newsletter/conferma/${emailToSeg(e)}/${exp}/${token}`;
}

/**
 * Footer HTML volutamente discreto (piccolo, grigio, in fondo) per le email
 * marketing: presente e cliccabile come vuole il GDPR, ma non appariscente.
 */
export function footerDisiscrizione(url: string): string {
  return `<p style="margin:26px 0 0;padding-top:14px;border-top:1px solid #e7e0cf;color:#aaa197;font-size:11px;line-height:1.5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">Ricevi questa email perché fai parte della comunità delle Valli del Noce di El Brenz. Se proprio non vuoi più ricevere le nostre notizie, puoi <a href="${url}" style="color:#aaa197;text-decoration:underline;">disiscriverti qui</a>.</p>`;
}
