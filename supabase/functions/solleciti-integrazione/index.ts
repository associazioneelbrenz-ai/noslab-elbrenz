// solleciti-integrazione — promemoria gentili per l'integrazione quota 2026
// non ancora completata (11/07/2026). Pensata per esecuzione SCHEDULATA
// giornaliera (pg_cron), ma DORMIENTE finché SOLLECITI_LIVE !== 'true'.
//
// SICUREZZA: gate header `x-ingest-token` == INGEST_TOKEN (canale
// amministrativo, come tessera-invio / integrazione-invio).
//
// LOGICA (costanti configurabili):
//   - candidati: soci con integrazione_richiesta_il valorizzata (= hanno
//     ricevuto la richiesta) e SENZA pagamento integrazione completato
//     (controllo LIVE, non da coda precalcolata → chi paga oggi esce subito);
//   - sollecito 1 a +SOLLECITO_1_GIORNI, sollecito 2 (ULTIMO) a
//     +SOLLECITO_2_GIORNI; MAI più di 2 per socio;
//   - idempotenza: registro solleciti_integrazione con UNIQUE(domanda_id,
//     tipo) — l'insert-claim prima dell'invio evita doppi invii anche se la
//     function gira due volte;
//   - n.13/n.14 (email condivise): riga di avviso nel corpo.
//
// DRY-RUN: se SOLLECITI_LIVE !== 'true' OPPURE ?dryrun=1 → NESSUN invio,
// NESSUNA scrittura: ritorna il report di chi riceverebbe cosa e quando.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { avvisoCondivisa } from '../_shared/integrazione.ts';

const ANNO = 2026;
const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;
// Cadenza (giorni dalla richiesta). Cristian può cambiarli qui.
const SOLLECITO_1_GIORNI = 10;
const SOLLECITO_2_GIORNI = 24;

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), { status, headers: { 'Content-Type': 'application/json' } });
}

function corpoSollecito(p: { nome: string; codice: string; ultimo: boolean; avviso?: string }): string {
  const url = `${SITO}/integrazione/${p.codice}`;
  const chiusuraUltimo = p.ultimo
    ? `<p style="color:#1E2E26;font-size:14px;line-height:1.6;margin:12px 0 0;">Questo è l'ultimo promemoria automatico: dopo non ti scriveremo più. Se preferisci il bonifico o vuoi lasciar perdere, va benissimo lo stesso, e grazie di cuore per esserci.</p>`
    : '';
  return `<!DOCTYPE html><html><head>
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light}</style>
</head><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-top:4px solid #C8923E;border-radius:8px;padding:32px;">
    <table role="presentation" style="border-collapse:collapse;"><tr>
      <td style="width:60px;"><img src="${LOGO_URL}" alt="El Brenz" width="48" height="48" style="display:block;border-radius:50%;"/></td>
      <td><p style="color:#C8923E;text-transform:uppercase;letter-spacing:.18em;font-size:10px;margin:0 0 4px;">El Brenz · Tesseramento ${ANNO}</p>
        <h1 style="font-family:Georgia,serif;color:#1E2E26;font-size:20px;margin:0;font-weight:500;">Un promemoria gentile</h1></td>
    </tr></table>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:20px 0 0;">Ciao <strong>${esc(p.nome)}</strong>, sappiamo bene che le email si perdono nel mucchio: nessun problema.</p>
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:12px 0 0;">Ti lasciamo qui il tuo link personale per completare la quota ${ANNO} con i 10 € di integrazione, quando ti è comodo:</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#C8923E;color:#1E2E26;padding:13px 28px;text-decoration:none;font-weight:600;font-size:15px;border-radius:4px;">Integra 10 €</a>
    </p>
    <p style="color:#666;font-size:13px;line-height:1.6;margin:0;">Se hai già provveduto in altro modo o preferisci il bonifico, scrivici a <a href="mailto:info@elbrenz.eu" style="color:#8a6215;">info@elbrenz.eu</a> e sistemiamo tutto noi.</p>
    ${chiusuraUltimo}
    ${p.avviso ? `<p style="color:#8a6215;font-size:13px;margin:14px 0 0;background:#FDF9F0;border-left:3px solid #C8923E;padding:10px 14px;">${esc(p.avviso)}</p>` : ''}
    <p style="color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:18px 0 0;">Raìs fonde no le 'nglacia</p>
    <p style="color:#999;font-size:11px;margin:12px 0 0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
  </div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const expected = Deno.env.get('INGEST_TOKEN') ?? '';
  if (!expected || req.headers.get('x-ingest-token') !== expected) return json({ error: 'Non autorizzato' }, 401);

  const url = new URL(req.url);
  const live = Deno.env.get('SOLLECITI_LIVE') === 'true';
  const dryrun = !live || url.searchParams.get('dryrun') === '1';
  const sendSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // candidati: hanno ricevuto la richiesta (richiesta_il valorizzata), stato approvata
  const { data: soci } = await supabase.from('domande_tesseramento')
    .select('id, nome, email, numero_tessera, codice_tessera, integrazione_richiesta_il')
    .eq('stato', 'approvata')
    .not('integrazione_richiesta_il', 'is', null);

  const oggi = Date.now();
  const report: Record<string, unknown>[] = [];
  let inviati = 0;

  for (const s of soci ?? []) {
    // controllo pagamento LIVE (non precalcolato): completato = mai più nulla
    const { data: pag } = await supabase.from('pagamenti_tesseramento')
      .select('id').eq('domanda_id', s.id).eq('tipo', 'integrazione').eq('stato', 'completato').limit(1);
    if (pag && pag.length > 0) { report.push({ numero: s.numero_tessera, esito: 'escluso: integrazione completata' }); continue; }
    if (!s.codice_tessera) { report.push({ numero: s.numero_tessera, esito: 'saltato: codice tessera mancante' }); continue; }

    const giorni = Math.floor((oggi - new Date(s.integrazione_richiesta_il as string).getTime()) / 86400000);
    const { data: giaInviati } = await supabase.from('solleciti_integrazione')
      .select('tipo_sollecito').eq('domanda_id', s.id);
    const tipiFatti = new Set((giaInviati ?? []).map((r) => r.tipo_sollecito));

    let tipo: 1 | 2 | null = null;
    if (giorni >= SOLLECITO_2_GIORNI && !tipiFatti.has(2)) tipo = 2;
    else if (giorni >= SOLLECITO_1_GIORNI && !tipiFatti.has(1)) tipo = 1;
    if (tipo === null) {
      const prossimo = tipiFatti.has(1) ? SOLLECITO_2_GIORNI : SOLLECITO_1_GIORNI;
      report.push({ numero: s.numero_tessera, giorni, esito: `nessun sollecito dovuto (il prossimo a +${prossimo}gg, mancano ${prossimo - giorni}gg)` });
      continue;
    }

    if (dryrun) {
      report.push({ numero: s.numero_tessera, nome: s.nome, email: s.email, giorni, sollecito: tipo, esito: 'DRY-RUN: invierebbe' });
      continue;
    }

    // insert-claim idempotente PRIMA dell'invio (UNIQUE domanda_id+tipo)
    const { data: claim, error: errClaim } = await supabase.from('solleciti_integrazione')
      .insert({ domanda_id: s.id, tipo_sollecito: tipo }).select('id').maybeSingle();
    if (errClaim || !claim) { report.push({ numero: s.numero_tessera, esito: 'saltato: già inviato (race)' }); continue; }

    const html = corpoSollecito({
      nome: s.nome, codice: s.codice_tessera as string, ultimo: tipo === 2,
      avviso: avvisoCondivisa(s.numero_tessera, s.nome),
    });
    let ok = false;
    try {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sendSecret ?? '' },
        body: JSON.stringify({
          to: s.email,
          subject: `Un promemoria gentile: la tua integrazione quota ${ANNO} · El Brenz`,
          html, tags: [{ name: 'source', value: `sollecito-${tipo}` }],
        }),
      });
      ok = r.ok;
    } catch { ok = false; }

    if (ok) { inviati++; report.push({ numero: s.numero_tessera, sollecito: tipo, esito: 'inviato' }); }
    else {
      // invio fallito: libera il claim per un retry al prossimo giro
      await supabase.from('solleciti_integrazione').delete().eq('id', claim.id);
      report.push({ numero: s.numero_tessera, sollecito: tipo, esito: 'invio fallito, claim liberato' });
    }
  }

  return json({
    ok: true, dryrun, live,
    cadenza: { sollecito_1_giorni: SOLLECITO_1_GIORNI, sollecito_2_giorni: SOLLECITO_2_GIORNI },
    candidati: (soci ?? []).length, inviati, report,
  });
});
