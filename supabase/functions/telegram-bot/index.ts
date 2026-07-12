// telegram-bot — webhook del bot Telegram "Andreas — El Brenz" (MVP pubblico).
//
// Un solo cervello: la KB di Andreas via edge andreas-chat (chiamata come
// bot fidato con X-Bot-Secret, che salta il rate-limit IP). Qui gestiamo:
//   - verifica del webhook (header X-Telegram-Bot-Api-Secret-Token)
//   - comandi /start /help /eventi /tessera
//   - testo libero → rate-limit per utente (chat_id hashato) → andreas-chat
//
// verify_jwt=false (è un webhook): deploy con --no-verify-jwt. La protezione
// è il secret header. Nessuna persistenza delle conversazioni (GDPR); il
// chat_id è hashato SHA256 nel rate-limit.
//
// Secrets richiesti (Supabase Edge Function Secrets):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, BOT_ANDREAS_SECRET

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TETTO_GIORNO = 10; // domande/giorno per utente Telegram
const EVENTI_URL = 'https://www.elbrenz.eu/api/eventi.json';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function tgApi(token: string, method: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// HTML escape + conversione markdown di Andreas (*corsivo*, _corsivo_) in
// <i>…</i> per parse_mode=HTML (tiene il corsivo dei termini ladini).
function toTelegramHtml(text: string): string {
  let t = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
  t = t.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  return t;
}

async function sendMessage(token: string, chatId: number | string, html: string): Promise<void> {
  // Telegram limita a 4096 caratteri per messaggio.
  const testo = html.length > 4000 ? html.slice(0, 3990) + '…' : html;
  await tgApi(token, 'sendMessage', {
    chat_id: chatId, text: testo, parse_mode: 'HTML', disable_web_page_preview: false,
  });
}

const BENVENUTO =
  'Ciao! Sono <i>Andreas</i>, l\'assistente di El Brenz. Chiedimi di storia, ' +
  'lingua ladino-anaunica e cultura delle Valli del Noce.\n\n' +
  'Comandi: /eventi · /tessera';

const TESSERA =
  'Vuoi sostenere El Brenz e la nostra lingua? Diventa socio 👉 ' +
  'https://www.elbrenz.eu/tesseramento';

function dataEstesa(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(iso + 'T00:00:00'));
  } catch { return iso; }
}

async function comandoEventi(): Promise<string> {
  try {
    const r = await fetch(EVENTI_URL, { headers: { Accept: 'application/json' } });
    const out = await r.json();
    const eventi = Array.isArray(out?.eventi) ? out.eventi : [];
    if (eventi.length === 0) return 'Nessun appuntamento in programma al momento — torna presto!';
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const righe = eventi.slice(0, 8).map((e: Record<string, unknown>) => {
      const d = dataEstesa(String(e.data));
      const luogo = e.luogo ? ` · ${esc(String(e.luogo))}` : '';
      const link = e.link ? `\n${e.link}` : '';
      return `📅 <b>${esc(String(e.titolo))}</b>\n${d}${luogo}${link}`;
    });
    return 'I prossimi appuntamenti delle nostre valli:\n\n' + righe.join('\n\n');
  } catch {
    return 'Non riesco a leggere gli eventi in questo momento. Riprova più tardi o scrivi a info@elbrenz.eu.';
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const botSecret = Deno.env.get('BOT_ANDREAS_SECRET');

  // Protezione webhook: se il secret header non combacia → 200 vuoto (silenzio).
  const provided = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!token || !webhookSecret || provided !== webhookSecret) {
    return new Response('', { status: 200 });
  }

  let update: Record<string, any>;
  try { update = await req.json(); } catch { return new Response('', { status: 200 }); }

  const message = update.message ?? update.edited_message;
  const text: string = message?.text ?? '';
  const chatId = message?.chat?.id;
  if (!chatId || !text) return new Response('', { status: 200 });

  try {
    const cmd = text.trim().toLowerCase();

    if (cmd === '/start' || cmd === '/help' || cmd.startsWith('/start') || cmd.startsWith('/help')) {
      await sendMessage(token, chatId, BENVENUTO);
      return new Response('', { status: 200 });
    }
    if (cmd === '/tessera' || cmd.startsWith('/tessera')) {
      await sendMessage(token, chatId, TESSERA);
      return new Response('', { status: 200 });
    }
    if (cmd === '/eventi' || cmd.startsWith('/eventi')) {
      await tgApi(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
      await sendMessage(token, chatId, await comandoEventi());
      return new Response('', { status: 200 });
    }
    // altri comandi non riconosciuti → trattali come domanda? No: guida.
    if (cmd.startsWith('/')) {
      await sendMessage(token, chatId, 'Comando non riconosciuto. Prova /eventi, /tessera, oppure scrivimi una domanda su storia e lingua delle nostre valli.');
      return new Response('', { status: 200 });
    }

    // TESTO LIBERO → rate-limit per utente, poi andreas-chat
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const oggi = new Date().toISOString().slice(0, 10);
    const chatHash = await sha256Hex(String(chatId));

    const { data: rl } = await supabase.from('telegram_rate_limit')
      .select('messaggi').eq('chat_id_hash', chatHash).eq('giorno', oggi).maybeSingle();
    const usati = rl?.messaggi ?? 0;
    if (usati >= TETTO_GIORNO) {
      await sendMessage(token, chatId,
        `Hai raggiunto il limite di ${TETTO_GIORNO} domande per oggi 🙏 Torna domani, oppure scrivici a info@elbrenz.eu.`);
      return new Response('', { status: 200 });
    }
    // incrementa subito (anti-abuso), anche se la risposta poi fallisse
    await supabase.from('telegram_rate_limit').upsert(
      { chat_id_hash: chatHash, giorno: oggi, messaggi: usati + 1, ultimo_uso: new Date().toISOString() },
      { onConflict: 'chat_id_hash,giorno' },
    );

    await tgApi(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });

    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/andreas-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anon,
        'Authorization': `Bearer ${anon}`,
        'X-Bot-Secret': botSecret ?? '',
      },
      body: JSON.stringify({ query: text.slice(0, 600), external_id: chatHash }),
    });
    const out = await resp.json().catch(() => ({}));
    if (resp.ok && out.ok && out.answer) {
      await sendMessage(token, chatId, toTelegramHtml(String(out.answer)));
    } else if (out.error === 'query_too_long') {
      await sendMessage(token, chatId, 'La domanda è un po\' lunga: prova a sintetizzarla in poche righe.');
    } else {
      await sendMessage(token, chatId, 'Scusa, in questo momento non riesco a risponderti. Riprova tra poco o scrivici a info@elbrenz.eu.');
    }
    return new Response('', { status: 200 });
  } catch (e) {
    console.error('[telegram-bot] errore:', e);
    return new Response('', { status: 200 });
  }
});
