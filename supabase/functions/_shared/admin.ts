// _shared/admin.ts — token firmati per le azioni amministrative (M2.6-ter).
//
// Link "scheda domanda" nelle mail al Direttivo: token HMAC-SHA256 con
// ADMIN_ACTION_SECRET (nei Supabase secrets, generato da Cristian).
// Payload firmato: `${scope}|${id}|${exp}` — scope distingue vista/azione
// (il token della vista NON autorizza l'approvazione), exp è epoch ms
// (30 giorni di validità per i link nelle mail).

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function firmaToken(
  secret: string,
  scope: string,
  id: string,
  exp: number,
): Promise<string> {
  return await hmacHex(secret, `${scope}|${id}|${exp}`);
}

/** Verifica firma + scadenza. Confronto a tempo costante. */
export async function verificaToken(
  secret: string,
  scope: string,
  id: string,
  exp: number,
  token: string,
): Promise<boolean> {
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const atteso = await hmacHex(secret, `${scope}|${id}|${exp}`);
  if (atteso.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < atteso.length; i++) {
    diff |= atteso.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
