// telegram-setup — configura/diagnostica il webhook del bot Telegram SENZA
// esporre il token. Legge TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET dai
// Supabase Secrets (lato server) e chiama setWebhook con il secret_token
// corretto per costruzione (== TELEGRAM_WEBHOOK_SECRET), poi getWebhookInfo.
//
// GET/POST ?action=set|info|delete (default set). Idempotente e innocuo:
// punta sempre al nostro endpoint con il nostro secret; non restituisce mai
// il token. getWebhookInfo NON contiene il secret_token.
//
// Nota: una volta verificato il bot, questa function può essere rimossa.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const PROJECT = 'wacknihvdjxltiqvxtqr';
const WEBHOOK_URL = `https://${PROJECT}.supabase.co/functions/v1/telegram-bot`;

serve(async (req: Request) => {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });

  // [15/9/2026, audit SIC-14] Cancello amministrativo: senza header
  // x-ingest-token uguale a INGEST_TOKEN (confronto a tempo costante, come in
  // invia-push) non si legge getWebhookInfo ne' si rilancia setWebhook. Se il
  // token non e' configurato si risponde 503, come negli altri canali
  // amministrativi. La funzione resta, cambia solo chi puo' chiamarla.
  const atteso = Deno.env.get('INGEST_TOKEN') ?? '';
  if (!atteso) return json({ error: 'INGEST_TOKEN non configurato' }, 503);
  const ricevuto = req.headers.get('x-ingest-token') ?? '';
  let diff = ricevuto.length === atteso.length ? 0 : 1;
  for (let i = 0; i < atteso.length; i++) diff |= (ricevuto.charCodeAt(i) || 0) ^ atteso.charCodeAt(i);
  if (diff !== 0) return json({ error: 'non autorizzato' }, 403);

  if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN non configurato nei Secrets' }, 400);

  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'set';
  const api = (m: string, body?: unknown) =>
    fetch(`https://api.telegram.org/bot${token}/${m}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json());

  try {
    if (action === 'info') {
      return json({ info: await api('getWebhookInfo'), me: await api('getMe') });
    }
    // set (default). Nessuna azione 'delete': re-impostare è idempotente e
    // innocuo (punta sempre al nostro endpoint col nostro secret), disattivare
    // il webhook no — quindi non esponiamo deleteWebhook qui.
    if (!secret) {
      return json({ error: 'TELEGRAM_WEBHOOK_SECRET non configurato: impossibile impostare un webhook protetto.' }, 400);
    }
    const setResult = await api('setWebhook', {
      url: WEBHOOK_URL,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });
    const info = await api('getWebhookInfo'); // non contiene il secret_token
    return json({ setWebhook: setResult, info });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
