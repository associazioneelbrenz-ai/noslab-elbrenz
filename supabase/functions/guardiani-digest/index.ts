// guardiani-digest (6/8/2026) — il riepilogo giornaliero dei contributi al
// glossario, al posto di una notifica per ogni termine.
//
// PERCHE': il 6 agosto sono arrivati 32 termini da cinque persone, 23 dei quali
// da Simone in una sola seduta. Il sistema trattava un lavoro fatto in blocco
// come 23 eventi separati: 23 mail nella casella e 23 messaggi nel gruppo. Il
// problema non e' il volume dei contributi, che e' una benedizione: e' che
// l'avviso era dimensionato per otto lemmi al mese.
//
// COSA FA: conta i lemmi ancora in revisione arrivati nelle ultime 24 ore,
// raggruppati per contributore, e manda UNA mail al curatore piu' UN messaggio
// al gruppo del direttivo. Se non e' arrivato niente, non parte nulla.
//
// SICUREZZA: gate `x-ingest-token` (canale amministrativo server-to-server, come
// solleciti-quota e ingest-chunks). Nessun CORS: non lo chiama nessun browser.
//
// GIRO A VUOTO PER DIFETTO: senza `?esegui=1` calcola e RESTITUISCE il riepilogo
// senza spedire niente. Stessa convenzione dei solleciti quota, che e' salvata
// piu' di una volta dal mandare una cosa sbagliata a tutti.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';
import { notificaDirettivo } from '../_shared/notificaDirettivo.ts';

const SITO = 'https://elbrenz.eu';
const RECIPIENT = 'info@elbrenz.eu';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const atteso = Deno.env.get('INGEST_TOKEN') ?? '';
  const dato = req.headers.get('x-ingest-token') ?? '';
  if (!atteso || dato !== atteso) return json({ error: 'Non autorizzato' }, 401);

  const esegui = new URL(req.url).searchParams.get('esegui') === '1';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Si legge TUTTA la coda, non solo il giorno: un termine proposto tre giorni
  // fa e ancora in attesa non deve sparire dal riepilogo perche' non e' piu'
  // "di oggi". Il conteggio del giorno serve al titolo, l'elenco serve al
  // lavoro. (Retroattivo, richiesta di Cristian del 6/8.)
  const da = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: righe, error } = await supabase
    .from('dizionario_lemma')
    .select('id, lemma, parlata, comune, definizione, created_at, contributore:contributore_id ( nome )')
    .eq('stato', 'in_revisione')
    .order('created_at', { ascending: true });
  if (error) return json({ ok: false, error: error.message }, 500);

  const lemmi = righe ?? [];
  const nuoviOggi = (lemmi as any[]).filter((l) => l.created_at >= da).length;

  // Una giornata senza arrivi non produce nessun messaggio: un riepilogo che
  // ripete la stessa coda ogni mattina insegna solo a non aprirlo piu'.
  // `?tutti=1` forza il richiamo dell'arretrato anche in un giorno vuoto.
  const forza = new URL(req.url).searchParams.get('tutti') === '1';
  if (lemmi.length === 0 || (nuoviOggi === 0 && !forza)) {
    return json({
      ok: true, totale_coda: lemmi.length, nuovi_oggi: nuoviOggi,
      inviato: false, nota: lemmi.length === 0 ? 'coda vuota' : 'nessun arrivo oggi',
    });
  }

  // Raggruppa per contributore, in ordine di quantita'.
  const conta = new Map<string, number>();
  for (const l of lemmi as any[]) {
    const c = Array.isArray(l.contributore) ? l.contributore[0] : l.contributore;
    const nome = (c?.nome ?? '').trim() || 'senza nome';
    conta.set(nome, (conta.get(nome) ?? 0) + 1);
  }
  const contributori = [...conta.entries()]
    .map(([nome, quanti]) => ({ nome, quanti }))
    .sort((a, b) => b.quanti - a.quanti);

  const totale = lemmi.length;
  const rigaSintesi = contributori.map((c) => `${c.quanti} da ${c.nome}`).join(', ');

  if (!esegui) {
    return json({ ok: true, giro_a_vuoto: true, totale, contributori, anteprima: rigaSintesi });
  }

  // --- Mail unica al curatore ---
  const sendSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET');
  let mailOk = false;
  if (sendSecret) {
    // I link valida/rifiuta stanno DENTRO il riepilogo, uno per riga. Senza
    // questo, spegnere la mail per singolo termine toglierebbe l'unico modo di
    // curare: i link HMAC nascevano li', e il pannello non c'e' ancora. Una
    // mail sola, ma con tutte le maniglie.
    const exp = Date.now() + TOKEN_TTL_MS;
    const righeHtml: string[] = [];
    for (const l of (lemmi as any[]).slice(0, 40)) {
      let azioni = '';
      if (adminSecret) {
        const tV = await firmaToken(adminSecret, 'guardiani-valida', l.id, exp);
        const tR = await firmaToken(adminSecret, 'guardiani-rifiuta', l.id, exp);
        azioni = `<a href="${SITO}/guardiani-curatela/valida/${l.id}/${exp}/${tV}" style="color:#2d8659;font-weight:600;text-decoration:none;">valida</a>
                  &nbsp;·&nbsp;
                  <a href="${SITO}/guardiani-curatela/rifiuta/${l.id}/${exp}/${tR}" style="color:#a33;text-decoration:none;">rifiuta</a>`;
      }
      // La definizione sta NELLA riga, non dietro un link: si approva quello che
      // si e' potuto leggere. Un elenco di soli lemmi con accanto «valida»
      // sarebbe un timbrificio, ed e' esattamente cio' che la curatela non deve
      // diventare.
      righeHtml.push(
        `<tr style="border-top:1px solid #eee;">
           <td style="padding:10px 12px 10px 0;vertical-align:top;">
             <div style="color:#1E2E26;font-size:15px;"><strong>${esc(l.lemma)}</strong></div>
             <div style="color:#8a6215;font-size:12px;">${esc(l.parlata ?? '')}${l.comune ? ` · ${esc(l.comune)}` : ''}</div>
             <div style="color:#444;font-size:13px;line-height:1.5;margin-top:3px;">${esc(l.definizione ?? '')}</div>
           </td>
           <td style="padding:10px 0;font-size:13px;white-space:nowrap;vertical-align:top;">${azioni}</td>
         </tr>`,
      );
    }
    const elenco = righeHtml.join('');
    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
      <div style="background:#fff;padding:28px;border-radius:8px;border-top:4px solid #C8923E;">
        <h1 style="font-size:19px;color:#1E2E26;margin:0 0 4px;">Guardiani de la lenga</h1>
        <p style="color:#666;font-size:13px;margin:0 0 18px;">Il riepilogo di oggi</p>
        <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 16px;">
          ${nuoviOggi > 0 ? `Oggi sono arrivati <strong>${nuoviOggi} termini</strong>. ` : ''}In coda ce ne sono <strong>${totale}</strong>: ${esc(rigaSintesi)}.
        </p>
        <table style="border-collapse:collapse;font-size:14px;margin:0 0 20px;">${elenco}</table>
        ${totale > 40 ? `<p style="color:#666;font-size:13px;margin:0 0 16px;">…e altri ${totale - 40}: li trovi nel riepilogo di domani o nel pannello.</p>` : ''}
        <p style="color:#999;font-size:12px;margin:18px 0 0;">Un solo messaggio al giorno. Se non arriva niente, non arriva nemmeno questo.</p>
      </div></body></html>`;
    try {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sendSecret },
        body: JSON.stringify({
          to: RECIPIENT,
          subject: `[GUARDIANI] ${totale} termini in coda da validare`,
          html,
          tags: [{ name: 'source', value: 'guardiani-digest' }],
        }),
      });
      mailOk = r.ok;
    } catch { mailOk = false; }
  }

  // --- Messaggio unico al gruppo del direttivo ---
  await notificaDirettivo(supabase, 'guardiani_digest', { totale, contributori }).catch(() => {});

  return json({ ok: true, totale, contributori, mail_inviata: mailOk });
});
