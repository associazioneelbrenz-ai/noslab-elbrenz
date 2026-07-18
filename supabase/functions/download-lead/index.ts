// download-lead — raccoglie un lead (nome + email, telefono facoltativo) in
// cambio del link di download di una risorsa gratuita (libro Altmayer).
// L'URL del PDF NON è nel sorgente della pagina: lo restituisce questa
// funzione DOPO un submit valido, così il modulo non è aggirabile.
//
// POST { nome, email, telefono?, consenso_privacy, consenso_newsletter?,
//        risorsa?, _honeypot, _ts }
//   - validazione: nome >=2, email regex, consenso_privacy === true
//   - honeypot vuoto + time-trap (form aperto da >=3s) → bot: 200 silenzioso
//   - insert su download_lead (service role), poi { url }
//   - email di ringraziamento facoltativa (Resend via send-email)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { INFORMATIVA_VERSIONE } from '../_shared/consenso.ts';

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
  'https://community.elbrenz.eu',
  'https://www.elbrenz.eu',
  'http://localhost:4321',
  'http://localhost:3000',
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FORM_AGE_MS = 3 * 1000;
const LIM = { nome: 100, email: 200, telefono: 40, risorsa: 60 };

// Risorse scaricabili note: risorsa -> { url pubblico, titolo }. Whitelist
// server-side: il client NON sceglie un URL arbitrario.
function pdfUrl(base: string): string {
  return `${base}/storage/v1/object/public/assets-pubblici/biblioteca/altmayer-a-proposito-di-tirolo-2024.pdf`;
}
// pdf: true -> risorsa scaricabile (ritorna url); false -> lead "soft" senza
// download (es. invito di fine pagina sul documentario), ritorna solo { ok }.
const RISORSE: Record<string, { titolo: string; pdf: boolean }> = {
  'libro-altmayer': { titolo: 'A proposito di Tirolo fino al Lago di Garda', pdf: true },
  'documentario-fioi-dal-nos': { titolo: 'Fiöi dal Nos', pdf: false },
};

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status: number, c: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...c, 'Content-Type': 'application/json' } });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const c = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: c });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405, c);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origin non consentita' }, 403, c);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'JSON non valido' }, 400, c); }

  const nome = String(body.nome ?? '').trim().slice(0, LIM.nome);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, LIM.email);
  const telefono = String(body.telefono ?? '').trim().slice(0, LIM.telefono) || null;
  const consenso = body.consenso_privacy === true;
  const newsletter = body.consenso_newsletter === true;
  const risorsa = (String(body.risorsa ?? 'libro-altmayer').trim().slice(0, LIM.risorsa)) || 'libro-altmayer';
  const honeypot = typeof body._honeypot === 'string' ? body._honeypot : '';
  const ts = typeof body._ts === 'number' ? body._ts : 0;

  const base = Deno.env.get('SUPABASE_URL')!;

  // bot: honeypot pieno o form troppo veloce → 200 silenzioso, ma niente url
  if (honeypot.length > 0 || (ts && Date.now() - ts < MIN_FORM_AGE_MS)) {
    console.warn('[download-lead] bot trap');
    return json({ ok: true }, 200, c);
  }
  if (!RISORSE[risorsa]) return json({ error: 'Risorsa non disponibile.' }, 400, c);
  if (nome.length < 2) return json({ error: 'Scrivi il tuo nome.' }, 400, c);
  if (!EMAIL_REGEX.test(email)) return json({ error: 'Email non valida.' }, 400, c);
  if (!consenso) return json({ error: 'Serve il consenso al trattamento dei dati.' }, 400, c);

  const supabase = createClient(base, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Rate-limit anti abuso (audit 14/7): prima solo origin+honeypot; ogni chiamata
  // invia una email a un indirizzo fornito dal client (amplificatore email-bomb).
  // Limite orario per IP.
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto';
    const { data: entro } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: await sha256Hex(`download:${ip}`), p_max: 10 });
    if (entro === false) return json({ error: 'Troppe richieste: riprova più tardi.' }, 429, c);
  } catch { /* fail-open sul limiter */ }

  const { error: dbErr } = await supabase.from('download_lead').insert({
    risorsa, nome, email, telefono,
    consenso_privacy: true,
    consenso_newsletter: newsletter,
    // registro consensi (B.7): provenienza + versione informativa vigente
    sorgente: { ...(body.sorgente && typeof body.sorgente === 'object' ? body.sorgente as Record<string, unknown> : {}), informativa_versione: INFORMATIVA_VERSIONE },
  });
  if (dbErr) {
    console.error('[download-lead] insert fallita:', dbErr);
    return json({ error: 'Non è stato possibile registrare la richiesta. Riprova.' }, 500, c);
  }

  const haPdf = RISORSE[risorsa].pdf;
  const url = haPdf ? pdfUrl(base) : null;

  // email di ringraziamento SOLO per le risorse scaricabili (col link)
  const secret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (secret && haPdf && url) {
    const titolo = RISORSE[risorsa].titolo;
    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;color:#1E2E26;">
<h2 style="font-family:Georgia,serif;">Grazie, ${nome}!</h2>
<p>Ecco il libro <em>«${titolo}»</em>, concesso gratuitamente dall'autore Everton Altmayer. Se il download non è partito, puoi scaricarlo qui:</p>
<p style="margin:20px 0;"><a href="${url}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:12px 24px;text-decoration:none;font-weight:600;border-radius:4px;">Scarica il libro (PDF)</a></p>
<p style="color:#6b5a3a;font-size:14px;">Buona lettura, dalle nostre valli.<br/>El Brenz APS · <a href="https://elbrenz.eu/a-proposito-di-tirolo" style="color:#8a6215;">la pagina del libro</a></p>
</body></html>`;
    try {
      await fetch(`${base}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': secret },
        body: JSON.stringify({ to: email, subject: 'El Brenz — il tuo libro «A proposito di Tirolo»', html }),
      });
    } catch (e) { console.error('[download-lead] send-email:', e); }
  }

  // notifica al gruppo Telegram del direttivo (best-effort)
  const botSecret = Deno.env.get('BOT_ANDREAS_SECRET');
  if (botSecret) {
    const etichetta = haPdf ? '📖 **Nuovo download del libro**' : '💬 **Nuovo contatto dal documentario**';
    // PII minima (16/7): iniziali + risorsa, mai nome+email nel gruppo. I dati
    // completi restano in download_lead dietro autenticazione.
    const iniziali = nome.split(/\s+/).filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).join('') || '—';
    const risorsaLabel = RISORSE[risorsa]?.titolo ?? risorsa;
    try {
      await fetch(`${base}/functions/v1/telegram-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': botSecret },
        body: JSON.stringify({
          notify: true,
          text: `${etichetta}\n${iniziali} · ${risorsaLabel}` + (newsletter ? '\nHa dato consenso newsletter ✅' : ''),
        }),
      });
    } catch (e) { console.error('[download-lead] notificaTelegram:', e); }
  }

  return json({ ok: true, url }, 200, c);
});
