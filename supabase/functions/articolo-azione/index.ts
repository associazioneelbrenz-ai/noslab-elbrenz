// articolo-azione — workflow redazionale degli articoli (Editor).
//
// POST { azione: 'invia'|'approva'|'rifiuta', articolo_id, motivo? }
//   Authorization: Bearer <JWT utente> (l'isola /redazione lo passa).
//   - invia   (editor): proprio articolo in stato bozza|rifiutato -> in_approvazione,
//              sanitizza corpo_html (anti-XSS), set inviato_at; notifica il segretario.
//   - approva (admin+): -> pubblicato (pubblicato=true, pubblicato_at, approvato_da);
//              notifica l'editor.
//   - rifiuta (admin+): -> rifiutato (+ motivo_rifiuto, approvato_da); notifica l'editor.
// Verifica ruolo SERVER-SIDE. Le mutazioni usano service_role (bypassano RLS)
// solo dopo il controllo. Nessuna transizione sensibile dal client diretto.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app', 'https://elbrenz.eu', 'https://www.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:3000',
];
const DIRETTIVO = 'info@elbrenz.eu';

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Vary': 'Origin',
  };
}
const json = (b: unknown, s: number, c: Record<string, string>) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...c, 'Content-Type': 'application/json' } });

// ---- Sanitizzazione HTML (allowlist, parser DOM reale) --------------------
const TAGS = new Set(['P','BR','H2','H3','H4','STRONG','EM','B','I','U','A','UL','OL','LI','BLOCKQUOTE','IMG','FIGURE','FIGCAPTION','HR']);
const ATTR: Record<string, Set<string>> = { A: new Set(['href','title']), IMG: new Set(['src','alt']) };
const KILL = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','LINK','META','SVG']);

function urlOk(v: string): boolean {
  const s = v.trim().toLowerCase();
  if (s.startsWith('javascript:') || s.startsWith('vbscript:') || s.startsWith('data:')) return false;
  return true;
}
function cleanEl(el: Element) {
  // profondità: lavora su una copia della lista figli (muta durante il ciclo)
  for (const child of Array.from(el.children)) cleanEl(child as Element);
  const tag = el.tagName;
  if (KILL.has(tag)) { el.remove(); return; }
  if (!TAGS.has(tag)) {
    // unwrap: sposta i figli al posto dell'elemento, poi rimuovilo
    const parent = el.parentNode;
    if (parent) { while (el.firstChild) parent.insertBefore(el.firstChild, el); el.remove(); }
    return;
  }
  const allowed = ATTR[tag] ?? new Set<string>();
  for (const name of el.getAttributeNames()) {
    const low = name.toLowerCase();
    if (low.startsWith('on') || !allowed.has(low)) { el.removeAttribute(name); continue; }
    if ((low === 'href' || low === 'src') && !urlOk(el.getAttribute(name) ?? '')) el.removeAttribute(name);
  }
}
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  const body = doc?.querySelector('body');
  if (!body) return '';
  for (const child of Array.from(body.children)) cleanEl(child as Element);
  return body.innerHTML;
}

async function inviaEmail(to: string | string[], subject: string, html: string) {
  const secret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!secret) return;
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': secret },
      body: JSON.stringify({ to, subject, html }),
    });
  } catch (e) { console.error('[articolo-azione] email', e); }
}
async function notificaTelegram(text: string) {
  const secret = Deno.env.get('BOT_ANDREAS_SECRET');
  if (!secret) return;
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': secret },
      body: JSON.stringify({ notify: true, text }),
    });
  } catch (e) { console.error('[articolo-azione] telegram', e); }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const c = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: c });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405, c);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origin non consentita' }, 403, c);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Autenticazione richiesta' }, 401, c);

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ud, error: uerr } = await anon.auth.getUser();
  if (uerr || !ud?.user) return json({ error: 'Sessione non valida' }, 401, c);
  const userId = ud.user.id;

  // Livello MASSIMO tra i ruoli dell'utente (audit 14/7: prima si ordinava per
  // ruolo_id, che non implica il livello piu' alto -> un admin con anche 'socio'
  // poteva ricevere 403 e non poter pubblicare).
  const { data: ruoli } = await service.from('utente_ruolo')
    .select('ruolo:ruolo_id ( nome, livello )').eq('utente_id', userId);
  const livello = (ruoli ?? []).reduce((m: number, r: any) => Math.max(m, Number(r?.ruolo?.livello ?? 0)), 0);
  if (livello < 25) return json({ error: 'Non autorizzato (serve ruolo redazione).' }, 403, c);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'JSON non valido' }, 400, c); }
  const azione = String(body.azione ?? '');
  const articoloId = String(body.articolo_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(articoloId)) return json({ error: 'articolo_id non valido' }, 400, c);

  const { data: art } = await service.from('articolo')
    .select('id, titolo, autore_id, stato, corpo_html').eq('id', articoloId).maybeSingle();
  if (!art) return json({ error: 'Articolo non trovato' }, 404, c);

  const now = new Date().toISOString();

  if (azione === 'invia') {
    if (art.autore_id !== userId) return json({ error: 'Puoi inviare solo i tuoi articoli.' }, 403, c);
    if (!['bozza', 'rifiutato'].includes(art.stato)) return json({ error: 'Solo bozze o articoli rifiutati possono essere inviati.' }, 409, c);
    const pulito = sanitize(String(art.corpo_html ?? ''));
    await service.from('articolo').update({
      stato: 'in_approvazione', inviato_at: now, corpo_html: pulito, motivo_rifiuto: null, updated_at: now,
    }).eq('id', articoloId);
    await inviaEmail(DIRETTIVO, `Redazione: nuovo articolo da approvare — ${art.titolo}`,
      `<p>Un editor ha inviato per approvazione l'articolo <strong>${art.titolo}</strong>.</p><p>Approvalo o rifiutalo dall'area redazione.</p>`);
    await notificaTelegram(`📝 **Articolo da approvare**\n${art.titolo}`);
    return json({ ok: true, stato: 'in_approvazione' }, 200, c);
  }

  if (azione === 'approva' || azione === 'rifiuta') {
    if (livello < 50) return json({ error: 'Solo il segretario può approvare o rifiutare.' }, 403, c);
    // email dell'autore per notificarlo
    let emailAutore: string | null = null;
    try { const { data: au } = await service.auth.admin.getUserById(art.autore_id); emailAutore = au?.user?.email ?? null; } catch { /* */ }

    if (azione === 'approva') {
      await service.from('articolo').update({
        stato: 'pubblicato', pubblicato: true, pubblicato_at: now, approvato_da: userId, updated_at: now,
      }).eq('id', articoloId);
      // Ingestion Andreas KB: da wire con l'interfaccia di ingest-articoli (TODO).
      if (emailAutore) await inviaEmail(emailAutore, 'El Brenz — il tuo articolo è stato pubblicato',
        `<p>Il tuo articolo <strong>${art.titolo}</strong> è stato approvato e pubblicato. Grazie!</p>`);
      await notificaTelegram(`✅ **Articolo pubblicato**\n${art.titolo}`);
      return json({ ok: true, stato: 'pubblicato' }, 200, c);
    } else {
      const motivo = String(body.motivo ?? '').trim().slice(0, 1000);
      await service.from('articolo').update({
        stato: 'rifiutato', motivo_rifiuto: motivo || 'Nessun motivo specificato', approvato_da: userId, updated_at: now,
      }).eq('id', articoloId);
      if (emailAutore) await inviaEmail(emailAutore, 'El Brenz — il tuo articolo richiede modifiche',
        `<p>Il tuo articolo <strong>${art.titolo}</strong> è stato rimandato indietro.</p><p><em>Motivo:</em> ${motivo || 'non specificato'}</p><p>Puoi correggerlo e reinviarlo dall'area redazione.</p>`);
      return json({ ok: true, stato: 'rifiutato' }, 200, c);
    }
  }

  return json({ error: 'Azione non riconosciuta' }, 400, c);
});
