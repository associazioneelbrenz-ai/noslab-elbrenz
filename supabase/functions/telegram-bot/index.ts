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

async function sendMessage(token: string, chatId: number | string, html: string): Promise<{ ok: boolean; error?: string }> {
  // Telegram limita a 4096 caratteri per messaggio.
  const testo = html.length > 4000 ? html.slice(0, 3990) + '…' : html;
  const r = await tgApi(token, 'sendMessage', {
    chat_id: chatId, text: testo, parse_mode: 'HTML', disable_web_page_preview: false,
  });
  if (!r.ok) {
    const body = (await r.text()).slice(0, 300);
    console.error('[telegram-bot] sendMessage fallita:', r.status, body);
    return { ok: false, error: `HTTP ${r.status} ${body}` };
  }
  return { ok: true };
}

// ── Cruscotto direttivo (Fase 1, 16/7) — helper condivisi ────────────────
// Escape HTML per i valori dinamici nei messaggi parse_mode=HTML.
function escHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Risoluzione ruolo El Brenz dell'utente Telegram collegato: telegram_link
// (revoked_at null) → utente_ruolo → ruolo a livello MASSIMO. Stessa logica del
// ramo testo libero (rate-limit soci), qui riusata per il gate di gestione.
async function risolviRuolo(
  supabase: any,
  fromId: number | undefined,
): Promise<{ userId: string; nome?: string; livello: number } | null> {
  if (!fromId) return null;
  const { data: link } = await supabase.from('telegram_link')
    .select('user_id').eq('telegram_user_id', fromId).is('revoked_at', null).maybeSingle();
  if (!link?.user_id) return null;
  const { data: ruoli } = await supabase.from('utente_ruolo')
    .select('ruolo:ruolo_id ( nome, livello )').eq('utente_id', link.user_id);
  const top = (ruoli ?? [])
    .map((r: any) => ({ nome: r?.ruolo?.nome as string | undefined, livello: Number(r?.ruolo?.livello ?? 0) }))
    .reduce((m: any, x: any) => (x.livello > m.livello ? x : m), { nome: undefined as string | undefined, livello: 0 });
  return { userId: link.user_id, nome: top.nome, livello: top.livello };
}

// Gate dei comandi di gestione: ammessi in chat privata OPPURE nella "Sala
// comando" (il gruppo direttivo registrato in telegram_config.direttivo_chat_id).
// Gate SEMPRE sul MITTENTE: risponde solo se il ruolo El Brenz ha livello>=50.
// Ogni altro gruppo/canale → silenzio totale (il bot non spamma gruppi terzi né
// si rivela). Non-admin: rifiuto generico in privato, muto nel gruppo (no spam).
// 16/7: esteso alla Sala comando (Fase 1). NB: i comandi Fase 2 (dati sensibili)
// resteranno DM-only e NON useranno questo gate esteso.
async function gateAdmin(
  supabase: any,
  token: string,
  message: any,
  chatId: number | string,
): Promise<boolean> {
  const tipo = message?.chat?.type;
  const inPrivato = tipo === 'private';

  // È la Sala comando (gruppo direttivo registrato in telegram_config)?
  let inSalaComando = false;
  if (tipo === 'group' || tipo === 'supergroup') {
    const { data } = await supabase.from('telegram_config')
      .select('valore').eq('chiave', 'direttivo_chat_id').maybeSingle();
    inSalaComando = !!data?.valore && String(data.valore) === String(chatId);
    if (!inSalaComando) return false; // altro gruppo → silenzio totale
  }
  if (!inPrivato && !inSalaComando) return false; // canali/altro → silenzio

  // Gate sul MITTENTE, sempre.
  const r = await risolviRuolo(supabase, message?.from?.id);
  if (!r || r.livello < 50) {
    if (inPrivato) {
      await sendMessage(token, chatId, 'Non ti riconosco come <b>amministratore</b> di El Brenz. Se dovresti esserlo, collega il tuo account dall\'area soci del sito.');
    }
    // nella Sala comando: nessun messaggio (niente spam nel gruppo)
    return false;
  }
  return true;
}

// Variante DM-only del gate (Fase 2, dati più sensibili: soci, pagamenti, ecc.):
// ammessa SOLO in chat privata — mai nei gruppi, nemmeno la Sala comando, per non
// esporre PII nel gruppo. Gate sul mittente identico (ruolo El Brenz livello>=50).
// In qualsiasi gruppo/canale: silenzio (return false senza messaggio).
async function gateAdminDM(
  supabase: any,
  token: string,
  message: any,
  chatId: number | string,
): Promise<boolean> {
  if (message?.chat?.type !== 'private') return false; // gruppi/canali → silenzio
  const r = await risolviRuolo(supabase, message?.from?.id);
  if (!r || r.livello < 50) {
    await sendMessage(token, chatId, 'Non ti riconosco come <b>amministratore</b> di El Brenz. Se dovresti esserlo, collega il tuo account dall\'area soci del sito.');
    return false;
  }
  return true;
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

  // ── NOTIFICA INTERNA (server-to-server da altre edge) ──────────────────
  // Chiamata con header X-Bot-Secret == BOT_ANDREAS_SECRET e body { text }.
  // Invia il messaggio al gruppo direttivo registrato (telegram_config).
  // NON è un update Telegram: gestita PRIMA del gate webhook.
  const botHdr = req.headers.get('x-bot-secret') ?? '';
  if (botSecret && botHdr === botSecret) {
    const jsonResp = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (!token) return jsonResp({ ok: false, error: 'no_token' });
    let b: Record<string, any> = {};
    try { b = await req.json(); } catch { /* body vuoto */ }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await supabase.from('telegram_config').select('valore').eq('chiave', 'direttivo_chat_id').maybeSingle();
    const dest = data?.valore;
    if (!dest) return jsonResp({ ok: false, error: 'gruppo_non_registrato' });
    await sendMessage(token, dest, toTelegramHtml(String(b.text ?? '')));
    return jsonResp({ ok: true });
  }

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

    // Andreas Fondazione (ponte Telegram): /start CON parametro = collegamento
    // account. Il token e' case-sensitive (base64url) quindi lo leggo dal testo
    // ORIGINALE, non da `cmd` (lowercased). `/start` senza token cade sotto e
    // mostra il benvenuto INVARIATO.
    const startTok = text.trim().match(/^\/start(?:@\w+)?\s+(\S+)$/i);
    if (startTok) {
      const linkToken = startTok[1];
      const fromId = message?.from?.id;
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: tok } = await supabase.from('telegram_link_token')
        .select('user_id, expires_at, used_at').eq('token', linkToken).maybeSingle();
      const valido = !!tok && !tok.used_at && new Date(tok.expires_at).getTime() > Date.now();
      if (!valido || !fromId) {
        await sendMessage(token, chatId,
          'Questo link di collegamento non è valido, è scaduto o è già stato usato. Genera un nuovo collegamento dall\'area soci del sito e riprova entro pochi minuti.');
        return new Response('', { status: 200 });
      }
      // upsert del legame (un telegram_user_id -> un socio); riattiva se revocato.
      await supabase.from('telegram_link').upsert(
        { telegram_user_id: fromId, user_id: tok!.user_id, revoked_at: null, created_at: new Date().toISOString() },
        { onConflict: 'telegram_user_id' },
      );
      await supabase.from('telegram_link_token').update({ used_at: new Date().toISOString() }).eq('token', linkToken);
      await sendMessage(token, chatId,
        '✅ <b>Account collegato!</b>\nOra ti riconosco come socio anche qui su Telegram. Puoi scollegarlo quando vuoi dall\'area soci del sito.');
      return new Response('', { status: 200 });
    }

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
    // Diagnostica canale notifiche direttivo (14/7): invia una notifica di
    // PROVA al gruppo registrato e RIPORTA l'esito reale (se fallisce, l'errore
    // Telegram — es. chat_id stale dopo migrazione a supergruppo). Solo admin,
    // dentro un gruppo.
    if (cmd === '/test_notifica' || cmd.startsWith('/test_notifica')) {
      const tipoChat = message?.chat?.type;
      if (tipoChat !== 'group' && tipoChat !== 'supergroup') {
        await sendMessage(token, chatId, 'Usa <b>/test_notifica</b> dentro il gruppo del direttivo.');
        return new Response('', { status: 200 });
      }
      const cm = await tgApi(token, 'getChatMember', { chat_id: chatId, user_id: message?.from?.id }).then((r) => r.json()).catch(() => null);
      const st = cm?.result?.status;
      if (st !== 'creator' && st !== 'administrator') {
        await sendMessage(token, chatId, 'Solo un <b>amministratore</b> del gruppo può usare /test_notifica.');
        return new Response('', { status: 200 });
      }
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data } = await supabase.from('telegram_config').select('valore').eq('chiave', 'direttivo_chat_id').maybeSingle();
      const dest = data?.valore;
      if (!dest) {
        await sendMessage(token, chatId, 'Nessun gruppo registrato per le notifiche. Esegui <b>/attiva_notifiche</b> qui dentro.');
        return new Response('', { status: 200 });
      }
      const res = await sendMessage(token, dest, '✅ <b>Test notifica direttivo</b>\nSe leggi questo messaggio, il canale delle notifiche funziona.');
      if (res.ok) {
        const diff = String(dest) !== String(chatId)
          ? `\n⚠ L'id registrato (<code>${dest}</code>) è diverso da quello di questo gruppo (<code>${chatId}</code>): se le notifiche non arrivano qui, ri-esegui /attiva_notifiche.`
          : '';
        await sendMessage(token, chatId, `Notifica di prova inviata al gruppo registrato (<code>${dest}</code>). ✓${diff}`);
      } else {
        await sendMessage(token, chatId, `❌ Invio FALLITO al chat <code>${dest}</code>:\n<code>${String(res.error ?? '').replace(/</g, '&lt;')}</code>\n\nProbabile id cambiato (supergruppo): esegui <b>/attiva_notifiche</b> qui dentro per registrare l'id corretto di questo gruppo (<code>${chatId}</code>).`);
      }
      return new Response('', { status: 200 });
    }
    // Registrazione del gruppo direttivo per le notifiche. Va usato DENTRO il
    // gruppo, e solo da un suo amministratore (anti-dirottamento notifiche).
    if (cmd.startsWith('/attiva_notifiche') || cmd.startsWith('/disattiva_notifiche')) {
      const tipo = message?.chat?.type;
      if (tipo !== 'group' && tipo !== 'supergroup') {
        await sendMessage(token, chatId, 'Usa questo comando <b>dentro il gruppo</b> del direttivo che deve ricevere le notifiche.');
        return new Response('', { status: 200 });
      }
      const fromId = message?.from?.id;
      const cm = await tgApi(token, 'getChatMember', { chat_id: chatId, user_id: fromId }).then((r) => r.json()).catch(() => null);
      const status = cm?.result?.status;
      if (status !== 'creator' && status !== 'administrator') {
        await sendMessage(token, chatId, 'Solo un <b>amministratore</b> del gruppo può gestire le notifiche.');
        return new Response('', { status: 200 });
      }
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (cmd.startsWith('/disattiva_notifiche')) {
        await supabase.from('telegram_config').delete().eq('chiave', 'direttivo_chat_id');
        await sendMessage(token, chatId, '🔕 Notifiche disattivate: questo gruppo non riceverà più gli avvisi.');
      } else {
        await supabase.from('telegram_config').upsert(
          { chiave: 'direttivo_chat_id', valore: String(chatId), updated_at: new Date().toISOString() },
          { onConflict: 'chiave' },
        );
        await sendMessage(token, chatId, '✅ Notifiche attivate: questo gruppo riceverà gli avvisi del direttivo (nuove iscrizioni alla gita, nuovi download del libro, e i prossimi eventi che aggancerò).');
      }
      return new Response('', { status: 200 });
    }
    // ── CRUSCOTTO DIRETTIVO (Fase 1) — comandi di gestione DM-only, admin ──
    // Gate: SOLO chat privata + ruolo El Brenz livello>=50 (via linking). PII
    // minima: solo conteggi/nomi/stati + link alla vista autenticata. Query
    // strutturate, mai RAG. Additivi: non toccano i comandi/flussi esistenti.
    if (cmd === '/cruscotto' || cmd.startsWith('/cruscotto')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdmin(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const setteGiorniFa = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const c = async (q: any): Promise<number> => (await q).count ?? 0;
      // Stati REALI verificati nel DB (16/7): domande approvata/in_attesa;
      // convenzioni proposta/attiva; lemmi in_revisione/pubblicato.
      const [soci, domandeSospese, lemmiDaValidare, convenzioniProposte, leadSettimana] = await Promise.all([
        c(supabase.from('domande_tesseramento').select('*', { count: 'exact', head: true }).eq('stato', 'approvata')),
        c(supabase.from('domande_tesseramento').select('*', { count: 'exact', head: true }).eq('stato', 'in_attesa')),
        c(supabase.from('dizionario_lemma').select('*', { count: 'exact', head: true }).eq('stato', 'in_revisione')),
        c(supabase.from('convenzioni').select('*', { count: 'exact', head: true }).eq('stato', 'proposta')),
        c(supabase.from('download_lead').select('*', { count: 'exact', head: true }).gte('created_at', setteGiorniFa)),
      ]);

      await sendMessage(token, chatId,
        '📊 <b>Cruscotto El Brenz</b>\n\n' +
        `👤 Soci: <b>${soci}</b>\n` +
        `📝 Domande in sospeso: <b>${domandeSospese}</b>\n` +
        `📖 Lemmi Guardiani da validare: <b>${lemmiDaValidare}</b>\n` +
        `🤝 Convenzioni proposte: <b>${convenzioniProposte}</b>\n` +
        `📚 Lead ultimi 7 giorni: <b>${leadSettimana}</b>\n\n` +
        'Dettagli: /guardiani · /notifiche');
      return new Response('', { status: 200 });
    }

    // Lemmi Guardiani da validare (in_revisione). Mostra il NOME del
    // contributore (mai email), via join contributore_id → guardiani_contributori.
    if (cmd === '/guardiani' || cmd.startsWith('/guardiani')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdmin(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const { data: lemmi, count } = await supabase.from('dizionario_lemma')
        .select('lemma, parlata, contributore:contributore_id ( nome )', { count: 'exact' })
        .eq('stato', 'in_revisione').order('created_at', { ascending: true }).limit(10);

      if (!lemmi || lemmi.length === 0) {
        await sendMessage(token, chatId, '📖 <b>Guardiani</b>\nNessun lemma da validare. Ottimo lavoro!');
        return new Response('', { status: 200 });
      }
      const righe = lemmi.map((l: any) =>
        `• «<b>${escHtml(l.lemma)}</b>» (${escHtml(l.parlata)})${l.contributore?.nome ? ' · ' + escHtml(l.contributore.nome) : ''}`);
      await sendMessage(token, chatId,
        `📖 <b>Guardiani — ${count} da validare</b>\n\n` + righe.join('\n') +
        ((count ?? 0) > 10 ? `\n\n…e altri ${(count ?? 0) - 10}.` : '') +
        '\n\nValida su https://www.elbrenz.eu/guardiani-curatela');
      return new Response('', { status: 200 });
    }

    // Gestione toggle notifiche direttivo da Telegram: /notifiche [on|off <tipo>].
    if (cmd === '/notifiche' || cmd.startsWith('/notifiche')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdmin(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const parti = text.trim().split(/\s+/);            // /notifiche [on|off] [tipo]
      const azione = (parti[1] ?? '').toLowerCase();
      const tipo = parti[2];

      if (azione === 'on' || azione === 'off') {
        if (!tipo) {
          await sendMessage(token, chatId, 'Uso: <code>/notifiche on|off &lt;tipo&gt;</code>');
          return new Response('', { status: 200 });
        }
        const { data: esiste } = await supabase.from('telegram_notifica').select('tipo').eq('tipo', tipo).maybeSingle();
        if (!esiste) {
          await sendMessage(token, chatId, `Tipo <code>${escHtml(tipo)}</code> inesistente. Scrivi /notifiche per la lista.`);
          return new Response('', { status: 200 });
        }
        await supabase.from('telegram_notifica')
          .update({ attivo: azione === 'on', updated_at: new Date().toISOString() }).eq('tipo', tipo);
        await sendMessage(token, chatId,
          `${azione === 'on' ? '🔔' : '🔕'} Notifica <b>${escHtml(tipo)}</b> ${azione === 'on' ? 'attivata' : 'disattivata'}.`);
        return new Response('', { status: 200 });
      }

      // nessun argomento → elenco stato dei toggle
      const { data: tipi } = await supabase.from('telegram_notifica')
        .select('tipo, etichetta, categoria, attivo').order('categoria');
      const righe = (tipi ?? []).map((t: any) => `${t.attivo ? '🔔' : '🔕'} <code>${escHtml(t.tipo)}</code> — ${escHtml(t.etichetta)}`);
      await sendMessage(token, chatId,
        '<b>Notifiche direttivo</b>\n\n' + (righe.length ? righe.join('\n') : 'Nessun tipo configurato.') +
        '\n\nPer cambiare: <code>/notifiche off lead_download</code>');
      return new Response('', { status: 200 });
    }

    // ── FASE 2 — comandi read-only su dati sensibili, DM-only (gateAdminDM) ──
    // Stati/colonne verificati nel DB (16/7). PII minima: aggregati + piccole
    // liste (nomi/importi, "Anonimo" dove previsto), mai email/telefono. Query
    // strutturate, mai RAG. Silenzio nei gruppi (anche Sala comando).
    if (cmd === '/soci' || cmd.startsWith('/soci')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdminDM(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const anno = new Date().getFullYear();
      const cnt = async (q: any): Promise<number> => (await q).count ?? 0;
      const [sociAnno, sociTot, sospese, daInviare] = await Promise.all([
        cnt(supabase.from('domande_tesseramento').select('*', { count: 'exact', head: true }).eq('stato', 'approvata').eq('anno', anno)),
        cnt(supabase.from('domande_tesseramento').select('*', { count: 'exact', head: true }).eq('stato', 'approvata')),
        cnt(supabase.from('domande_tesseramento').select('*', { count: 'exact', head: true }).eq('stato', 'in_attesa')),
        cnt(supabase.from('domande_tesseramento').select('*', { count: 'exact', head: true }).eq('stato', 'approvata').eq('tessera_inviata', false)),
      ]);
      const { data: recenti } = await supabase.from('domande_tesseramento')
        .select('nome, numero_tessera').eq('stato', 'approvata')
        .order('approvata_il', { ascending: false, nullsFirst: false }).limit(5);
      const righe = (recenti ?? []).map((s: any) => `• ${escHtml(s.nome)}${s.numero_tessera ? ' · n. ' + s.numero_tessera : ''}`);
      await sendMessage(token, chatId,
        '👤 <b>Soci El Brenz</b>\n\n' +
        `Soci ${anno}: <b>${sociAnno}</b>\n` +
        `Totale approvati: <b>${sociTot}</b>\n` +
        `📝 Domande in sospeso: <b>${sospese}</b>\n` +
        `✉️ Tessere da inviare: <b>${daInviare}</b>` +
        (righe.length ? '\n\n<b>Ultimi approvati</b>\n' + righe.join('\n') : ''));
      return new Response('', { status: 200 });
    }

    if (cmd === '/pagamenti' || cmd.startsWith('/pagamenti')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdminDM(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const anno = new Date().getFullYear();
      const cnt = async (q: any): Promise<number> => (await q).count ?? 0;
      const eur = (n: number) => n.toFixed(2).replace('.', ',');
      // Incassato completato dell'anno, split per tipo (somma lato edge: volumi bassi).
      const { data: compl } = await supabase.from('pagamenti_tesseramento')
        .select('tipo, importo').eq('stato', 'completato').eq('anno', anno);
      let tot = 0;
      const perTipo: Record<string, number> = {};
      for (const p of (compl ?? [])) {
        const imp = Number(p.importo) || 0;
        tot += imp;
        perTipo[p.tipo] = (perTipo[p.tipo] || 0) + imp;
      }
      const [daVerificare, anomalie] = await Promise.all([
        cnt(supabase.from('pagamenti_tesseramento').select('*', { count: 'exact', head: true }).eq('metodo', 'bonifico').eq('stato', 'in_verifica')),
        cnt(supabase.from('pagamenti_tesseramento').select('*', { count: 'exact', head: true }).eq('anomalia', true)),
      ]);
      const { data: recenti } = await supabase.from('pagamenti_tesseramento')
        .select('tipo, importo, nome, anonimo').eq('stato', 'completato')
        .order('created_at', { ascending: false }).limit(5);
      const splitRighe = Object.entries(perTipo).map(([t, v]) => `· ${t}: ${eur(v)} €`);
      const recRighe = (recenti ?? []).map((p: any) =>
        `• ${p.anonimo ? 'Anonimo' : escHtml(p.nome ?? '—')} · ${p.tipo} · ${eur(Number(p.importo) || 0)} €`);
      await sendMessage(token, chatId,
        '💳 <b>Pagamenti</b>\n\n' +
        `Incassato ${anno} (completati): <b>${eur(tot)} €</b>` +
        (splitRighe.length ? '\n' + splitRighe.join('\n') : '') +
        `\n\n🧾 Bonifici da verificare: <b>${daVerificare}</b>\n` +
        `⚠️ Anomalie: <b>${anomalie}</b>` +
        (recRighe.length ? '\n\n<b>Ultimi completati</b>\n' + recRighe.join('\n') : ''));
      return new Response('', { status: 200 });
    }

    if (cmd === '/convenzioni' || cmd.startsWith('/convenzioni')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdminDM(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const { data: proposte, count } = await supabase.from('convenzioni')
        .select('nome_attivita, categoria, localita', { count: 'exact' })
        .eq('stato', 'proposta').order('created_at', { ascending: true }).limit(10);
      const attive = (await supabase.from('convenzioni').select('*', { count: 'exact', head: true }).eq('stato', 'attiva')).count ?? 0;
      if (!proposte || proposte.length === 0) {
        await sendMessage(token, chatId, `🤝 <b>Convenzioni</b>\nNessuna proposta da validare.\nAttive: <b>${attive}</b>`);
        return new Response('', { status: 200 });
      }
      const righe = proposte.map((k: any) =>
        `• <b>${escHtml(k.nome_attivita)}</b>${k.categoria ? ' · ' + escHtml(k.categoria) : ''}${k.localita ? ' · ' + escHtml(k.localita) : ''}`);
      await sendMessage(token, chatId,
        `🤝 <b>Convenzioni — ${count} da validare</b>\n\n` + righe.join('\n') +
        ((count ?? 0) > 10 ? `\n\n…e altre ${(count ?? 0) - 10}.` : '') +
        `\n\nAttive: <b>${attive}</b>`);
      return new Response('', { status: 200 });
    }

    // /custodi mostra DUE code distinte: lo Sportello (richieste_contatto nuove)
    // e la vetrina Custodi della Memoria (custodi_memoria da pubblicare).
    if (cmd === '/custodi' || cmd.startsWith('/custodi')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdminDM(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const { data: sportello, count: nNuove } = await supabase.from('richieste_contatto')
        .select('codice_pratica, tipo, categoria, nome', { count: 'exact' })
        .eq('stato', 'nuova').order('created_at', { ascending: true }).limit(10);
      const { data: vetrina, count: nVetrina } = await supabase.from('custodi_memoria')
        .select('nome_pubblico, paese, anonimo', { count: 'exact' })
        .eq('visibile', false).order('created_at', { ascending: true }).limit(10);

      const spRighe = (sportello ?? []).map((r: any) =>
        `• ${escHtml(r.codice_pratica ?? '—')} · ${escHtml(r.tipo ?? '—')}${r.categoria ? ' / ' + escHtml(r.categoria) : ''}${r.nome ? ' · ' + escHtml(r.nome) : ''}`);
      const vtRighe = (vetrina ?? []).map((r: any) =>
        `• ${r.anonimo ? 'Anonimo' : escHtml(r.nome_pubblico ?? '—')}${r.paese ? ' · ' + escHtml(r.paese) : ''}`);

      await sendMessage(token, chatId,
        `📦 <b>Sportello — ${nNuove ?? 0} pratiche nuove</b>` +
        (spRighe.length ? '\n' + spRighe.join('\n') : '\nNessuna pratica nuova.') +
        `\n\n📚 <b>Custodi da pubblicare — ${nVetrina ?? 0}</b>` +
        (vtRighe.length ? '\n' + vtRighe.join('\n') : '\nNessuno in attesa.'));
      return new Response('', { status: 200 });
    }

    // /redazione: articoli in coda di approvazione (stato in_approvazione, il
    // valore reale del flusso editor; in_revisione è dei lemmi Guardiani).
    if (cmd === '/redazione' || cmd.startsWith('/redazione')) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if (!(await gateAdminDM(supabase, token, message, chatId))) return new Response('', { status: 200 });

      const { data: coda, count } = await supabase.from('articolo')
        .select('titolo', { count: 'exact' })
        .eq('stato', 'in_approvazione').order('inviato_at', { ascending: true, nullsFirst: false }).limit(10);
      if (!coda || coda.length === 0) {
        await sendMessage(token, chatId, '✍️ <b>Redazione</b>\nNessun articolo in coda di approvazione.');
        return new Response('', { status: 200 });
      }
      const righe = coda.map((a: any) => `• ${escHtml(a.titolo ?? '(senza titolo)')}`);
      await sendMessage(token, chatId,
        `✍️ <b>Redazione — ${count} da approvare</b>\n\n` + righe.join('\n') +
        ((count ?? 0) > 10 ? `\n\n…e altri ${(count ?? 0) - 10}.` : '') +
        '\n\nGestisci su https://www.elbrenz.eu/redazione');
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

    // Andreas Fondazione (ponte Telegram): risoluzione LIVELLO a ogni messaggio.
    // Se l'utente e' collegato (telegram_link, revoked_at null) e ha ruolo
    // socio+ (livello>=10), alza il tetto come sul web (ai_config_ruolo).
    // ADDITIVO: se NON collegato, tettoEffettivo resta TETTO_GIORNO -> comportamento
    // pubblico INVARIATO. Il tier si legge LIVE: se il socio decade, cade.
    let tettoEffettivo = TETTO_GIORNO;
    const fromIdMsg = message?.from?.id;
    if (fromIdMsg) {
      const { data: link } = await supabase.from('telegram_link')
        .select('user_id').eq('telegram_user_id', fromIdMsg).is('revoked_at', null).maybeSingle();
      if (link?.user_id) {
        // ruolo a LIVELLO massimo tra quelli dell'utente (audit 14/7: non
        // ordinare per ruolo_id, che non implica il livello piu' alto).
        const { data: ruoli } = await supabase.from('utente_ruolo')
          .select('ruolo:ruolo_id ( nome, livello )')
          .eq('utente_id', link.user_id);
        const top = (ruoli ?? [])
          .map((r: any) => ({ nome: r?.ruolo?.nome as string | undefined, livello: Number(r?.ruolo?.livello ?? 0) }))
          .reduce((m, x) => (x.livello > m.livello ? x : m), { nome: undefined as string | undefined, livello: 0 });
        const nome = top.nome;
        const livello = top.livello;
        if (livello >= 10 && nome) {
          const { data: cfg } = await supabase.from('ai_config_ruolo')
            .select('limite_giornaliero').eq('ruolo_nome', nome).maybeSingle();
          const lim = cfg?.limite_giornaliero;
          tettoEffettivo = (lim === -1) ? Number.POSITIVE_INFINITY : (lim ?? TETTO_GIORNO);
        }
      }
    }

    if (usati >= tettoEffettivo) {
      await sendMessage(token, chatId,
        `Hai raggiunto il limite di ${tettoEffettivo} domande per oggi 🙏 Torna domani, oppure scrivici a info@elbrenz.eu.`);
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
