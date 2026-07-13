// newsletter-broadcast — invio di una comunicazione a tutti gli iscritti che
// hanno dato il consenso, con footer di disiscrizione GDPR in OGNI email.
//
// Endpoint AMMINISTRATIVO server-to-server (NON dal browser). Gate: header
// X-Broadcast-Secret === NEWSLETTER_BROADCAST_SECRET (secret da impostare da
// Cristian). Nessun invio possibile senza secret.
//
// POST body: { subject, html, test?: boolean, dryRun?: boolean }
//   - dryRun: NON invia, restituisce solo il conteggio destinatari.
//   - test:   invia SOLO a info@elbrenz.eu (prova richiesta prima di ogni
//             invio reale), con footer reale.
//   - reale:  invia a tutti gli iscritti con consenso, deduplicati.
//
// Destinatari = unione, deduplicata per email:
//   - download_lead        WHERE consenso_newsletter = true
//   - guardiani_contributori WHERE consenso_marketing = true AND marketing_double_optin = true
// (la disiscrizione spegne questi flag ⇒ chi si è disiscritto è già escluso.)
//
// Ogni email riceve un link di disiscrizione firmato (HMAC nel path) via
// _shared/newsletter.ts. Invio uno-a-uno tramite l'edge send-email (Resend).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { linkDisiscrizione, footerDisiscrizione } from '../_shared/newsletter.ts';

const SITE_BASE = 'https://elbrenz.eu';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEND_DELAY_MS = 130; // ritmo gentile verso Resend

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  // --- gate: solo con il secret amministrativo ---
  const secret = Deno.env.get('NEWSLETTER_BROADCAST_SECRET');
  if (!secret) { console.error('[newsletter-broadcast] NEWSLETTER_BROADCAST_SECRET non impostato'); return json({ ok: false, error: 'not_configured' }, 503); }
  if (req.headers.get('X-Broadcast-Secret') !== secret) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }

  const subject = String(body.subject ?? '').trim();
  const html = String(body.html ?? '');
  const test = body.test === true;
  const dryRun = body.dryRun === true;
  if (!dryRun && (subject.length < 2 || html.length < 2)) return json({ ok: false, error: 'subject/html mancanti' }, 400);

  const base = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(base, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // --- destinatari (dedup per email) ---
  const dedup = new Map<string, string>(); // email -> nome
  const { data: leads } = await supabase.from('download_lead')
    .select('email, nome').eq('consenso_newsletter', true);
  for (const r of leads ?? []) {
    const e = String(r.email ?? '').trim().toLowerCase();
    if (EMAIL_REGEX.test(e) && !dedup.has(e)) dedup.set(e, String(r.nome ?? '').trim());
  }
  const { data: guard } = await supabase.from('guardiani_contributori')
    .select('email, nome').eq('consenso_marketing', true).eq('marketing_double_optin', true);
  for (const r of guard ?? []) {
    const e = String(r.email ?? '').trim().toLowerCase();
    if (EMAIL_REGEX.test(e) && !dedup.has(e)) dedup.set(e, String(r.nome ?? '').trim());
  }

  let destinatari = [...dedup.entries()].map(([email, nome]) => ({ email, nome }));
  const totaleIscritti = destinatari.length;

  if (test) destinatari = [{ email: 'info@elbrenz.eu', nome: 'El Brenz' }];
  if (dryRun) return json({ ok: true, dryRun: true, iscritti: totaleIscritti }, 200);

  // --- invio uno-a-uno con footer di disiscrizione firmato ---
  const sendSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  const signSecret = Deno.env.get('ADMIN_ACTION_SECRET');
  if (!sendSecret || !signSecret) return json({ ok: false, error: 'secrets_mancanti' }, 500);

  let sent = 0; let failed = 0;
  for (const d of destinatari) {
    try {
      const link = await linkDisiscrizione(SITE_BASE, d.email, signSecret);
      const fullHtml = `${html}${footerDisiscrizione(link)}`;
      const r = await fetch(`${base}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sendSecret },
        body: JSON.stringify({ to: d.email, subject, html: fullHtml }),
      });
      if (r.ok) sent++; else { failed++; console.error('[newsletter-broadcast] send-email KO', d.email, r.status); }
    } catch (e) { failed++; console.error('[newsletter-broadcast] errore invio', d.email, e); }
    await sleep(SEND_DELAY_MS);
  }

  return json({ ok: true, test, iscritti: totaleIscritti, inviati: sent, falliti: failed }, 200);
});
