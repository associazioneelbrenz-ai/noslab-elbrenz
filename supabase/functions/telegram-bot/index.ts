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

// Converte il markdown "alla Claude" di andreas-chat in HTML Telegram-safe
// (parse_mode=HTML supporta solo <b> <i> <u> <s> <a> <code> <pre>).
// Robusto contro l'output LLM: header senza #, grassetto/corsivo bilanciati,
// link/fonti senza parentesi quadre grezze, asterischi orfani rimossi (meglio
// togliere un * spaiato che far sbavare il corsivo su mezza frase). Tiene il
// corsivo dei termini ladini.
function toTelegramHtml(md: string): string {
  // 1. escape HTML PRIMA di inserire i tag
  let t = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 2. blocchi di codice ``` ``` -> <pre> (protetti dagli altri passaggi)
  t = t.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, (_m, c) => `<pre>${String(c).replace(/\n+$/, '')}</pre>`);

  // 3. per riga: header (#..###### -> grassetto, niente #) e liste (- / * -> •)
  t = t.split('\n').map((line) => {
    const h = line.match(/^\s*#{1,6}\s+(.*\S)\s*$/);
    if (h) return `<b>${h[1]}</b>`;
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) return `• ${li[1]}`;
    return line;
  }).join('\n');

  // 4. inline code `code`
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 5. grassetto **testo** / __testo__ (prima del corsivo, così ** non diventa *)
  t = t.replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/__([^\n]+?)__/g, '<b>$1</b>');

  // 6. link [testo](url) -> <a href>; poi [Titolo] senza url -> Titolo (no [])
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\[([^\]\n]+)\]/g, '$1');

  // 7. corsivo *testo* / _testo_ SOLO se bilanciato e senza newline (anti-sbavamento)
  t = t.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
  t = t.replace(/(^|[\s(>])_([^_\n]+?)_(?=[\s).,;:!?<]|$)/g, '$1<i>$2</i>');

  // 8. pulizia: asterischi/hash orfani residui (sicurezza > fedeltà)
  t = t.replace(/\*/g, '');
  t = t.replace(/(^|\n)\s*#{1,6}\s*/g, '$1');
  return t;
}

async function sendMessage(token: string, chatId: number | string, html: string): Promise<void> {
  // Telegram limita a 4096 caratteri per messaggio.
  const testo = html.length > 4000 ? html.slice(0, 3990) + '…' : html;
  const r = await tgApi(token, 'sendMessage', {
    chat_id: chatId, text: testo, parse_mode: 'HTML', disable_web_page_preview: false,
  });
  if (!r.ok) {
    console.error('[telegram-bot] sendMessage fallita:', r.status, (await r.text()).slice(0, 200));
  }
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
  // Log diagnostici (senza esporre i valori) per capire un eventuale silenzio.
  const provided = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!token || !webhookSecret) {
    console.error('[telegram-bot] secret non configurati nei Supabase Secrets:',
      JSON.stringify({ hasToken: !!token, hasWebhookSecret: !!webhookSecret, hasBotSecret: !!botSecret }));
    return new Response('', { status: 200 });
  }
  if (provided !== webhookSecret) {
    console.warn('[telegram-bot] secret header non combacia col setWebhook:',
      JSON.stringify({ headerPresente: provided.length > 0 }));
    return new Response('', { status: 200 });
  }

  let update: Record<string, any>;
  try { update = await req.json(); } catch { return new Response('', { status: 200 }); }

  const message = update.message ?? update.edited_message;
  const text: string = message?.text ?? '';
  const chatId = message?.chat?.id;
  console.log('[telegram-bot] update ricevuto:',
    JSON.stringify({ chatType: message?.chat?.type ?? null, hasText: !!text, cmd: text.slice(0, 20) }));
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
    // Helper per configurare le notifiche al direttivo: restituisce l'id
    // numerico della chat/gruppo corrente (serve per impostare il chat_id
    // del gruppo "Sala comando" nei Secrets). Read-only, innocuo.
    if (cmd === '/chatid' || cmd.startsWith('/chatid')) {
      const tipo = message?.chat?.type ?? 'sconosciuto';
      await sendMessage(token, chatId, `Chat id: <code>${chatId}</code>\nTipo: ${tipo}`);
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
    // IMPORTANTE: NIENTE 'Authorization: Bearer' qui. La publishable key come
    // Bearer farebbe scattare in andreas-chat il ramo JWT (hasJwt=true) ->
    // getUser fallisce (invalid_jwt) e, soprattutto, isTrustedBot (= !hasJwt)
    // non si attiverebbe. Solo apikey + X-Bot-Secret: così il branch bot
    // salta il rate-limit IP e risponde col RAG.
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/andreas-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anon,
        'X-Bot-Secret': botSecret ?? '',
      },
      body: JSON.stringify({ query: text.slice(0, 600), external_id: chatHash }),
    });
    const out = await resp.json().catch(() => ({}));
    if (!(resp.ok && out.ok)) {
      console.error('[telegram-bot] andreas-chat non ok:', resp.status, JSON.stringify(out).slice(0, 300));
    }
    if (resp.ok && out.ok && out.answer) {
      await sendMessage(token, chatId, toTelegramHtml(String(out.answer)));
    } else if (out.error === 'query_too_long') {
      await sendMessage(token, chatId, 'La domanda è un po\' lunga: prova a sintetizzarla in poche righe.');
    } else if (out.error === 'rate_limit_daily') {
      await sendMessage(token, chatId, out.messaggio || 'Per oggi ho risposto a molte domande. Riprova domani 🙏');
    } else {
      await sendMessage(token, chatId, 'Scusa, in questo momento non riesco a risponderti. Riprova tra poco o scrivici a info@elbrenz.eu.');
    }
    return new Response('', { status: 200 });
  } catch (e) {
    console.error('[telegram-bot] errore:', e);
    return new Response('', { status: 200 });
  }
});
