// radar-eventi-harvest — raccolta notturna degli eventi delle quattro valli
// dalle fonti aperte (portali ComunWeb dei comuni + Comunita' di valle, che
// sono poi i dataset "eventi" di dati.trentino.it). BLOCCO 2, superbrief 30/7.
//
// SICUREZZA: gate header `x-ingest-token` == INGEST_TOKEN, come
// solleciti-domande e tessera-invio. verify_jwt=false (dichiarato in
// config.toml): il gate e' il token, non il JWT. Mai pubblica.
//
// IDEMPOTENZA: l'insert e' un upsert su hash_dedup con ignoreDuplicates.
// Volutamente NON aggiorna le righe esistenti: se il segretario ha gia' scritto
// una nota o approvato un evento, la raccolta notturna non deve calpestarlo.
// Nessuna riga viene mai cancellata.
//
// COSA ENTRA: solo eventi non ancora finiti (data_fine, o data_inizio, da oggi
// in avanti). L'archivio storico dei portali non ci interessa: il Radar guarda
// avanti. Tutto entra in stato 'grezzo': la classificazione e' un altro passo.
//
// DRY-RUN: ?dryrun=1 -> scarica, normalizza e riporta, senza scrivere nulla.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PORTALI, daSearchHit, scaricaPortale, type EventoGrezzo } from '../_shared/radarFonti.ts';

// Quanti portali interrogare in parallelo. Basso di proposito: sono i siti dei
// nostri comuni, non un'API commerciale. Non si bussa in trenta alla volta.
const CONCORRENZA = 4;
// 10 e' il tetto VERO della fonte, non una nostra scelta: il server ignora
// qualunque limit piu' alto e ignora offset. Vedi la nota in _shared/radarFonti.ts.
const PER_PORTALE = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Esegue i task a gruppi, per non aprire trenta connessioni insieme. */
async function aGruppi<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(...await Promise.all(items.slice(i, i + n).map(fn)));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const atteso = Deno.env.get('INGEST_TOKEN') ?? '';
  if (!atteso || req.headers.get('x-ingest-token') !== atteso) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  const url = new URL(req.url);
  const dryrun = url.searchParams.get('dryrun') === '1';
  // ?solo=cles per collaudare un portale alla volta senza svegliare gli altri 30.
  const solo = url.searchParams.get('solo');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const oggi = new Date().toISOString().slice(0, 10);
  const portali = solo ? PORTALI.filter((p) => p.host.includes(solo)) : PORTALI;
  if (!portali.length) return json({ error: 'nessun portale corrisponde a ?solo=' }, 400);

  const esiti: Record<string, unknown>[] = [];
  const raccolti: EventoGrezzo[] = [];

  await aGruppi(portali, CONCORRENZA, async (p) => {
    try {
      const { hits, totale } = await scaricaPortale(p, PER_PORTALE);
      let futuri = 0;
      for (const hit of hits) {
        const ev = await daSearchHit(hit, p);
        if (!ev) continue;
        // Un evento e' ancora vivo se finisce oggi o piu' avanti.
        const fine = ev.data_fine ?? ev.data_inizio;
        if (fine < oggi) continue;
        futuri++;
        raccolti.push(ev);
      }
      esiti.push({ portale: p.host, comune: p.comune, ok: true, letti: hits.length, archivio: totale, futuri });
    } catch (e) {
      // Un comune giu' non deve far fallire la notte intera.
      esiti.push({ portale: p.host, comune: p.comune, ok: false, errore: String(e).slice(0, 200) });
    }
  });

  // Dedup interno alla raccolta: lo stesso evento puo' comparire sul portale del
  // comune e su quello della Comunita' di valle.
  const perHash = new Map<string, EventoGrezzo>();
  for (const ev of raccolti) if (!perHash.has(ev.hash_dedup)) perHash.set(ev.hash_dedup, ev);
  const unici = [...perHash.values()];

  if (dryrun) {
    return json({
      ok: true, dryrun: true, oggi,
      portali_interrogati: portali.length,
      raccolti: raccolti.length, unici: unici.length,
      esiti,
      anteprima: unici.slice(0, 15).map((e) => ({
        titolo: e.titolo, data: e.data_inizio, comune: e.comune, valle: e.valle,
        organizzatore: e.organizzatore, url: e.url_fonte,
      })),
    });
  }

  // Quali hash esistono gia': serve per sapere quali sono davvero NUOVI e per
  // non riscrivere le date di ricorrenza di righe gia' curate.
  const hashes = unici.map((e) => e.hash_dedup);
  const gia = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const { data } = await supabase.from('eventi_esterni')
      .select('hash_dedup').in('hash_dedup', hashes.slice(i, i + 500));
    for (const r of (data as any[]) ?? []) gia.add(r.hash_dedup);
  }
  const nuovi = unici.filter((e) => !gia.has(e.hash_dedup));

  let inseriti = 0;
  const errori: string[] = [];
  for (let i = 0; i < nuovi.length; i += 100) {
    const lotto = nuovi.slice(i, i + 100).map(({ date_ricorrenza: _scarta, ...riga }) => riga);
    const { data, error } = await supabase.from('eventi_esterni')
      .upsert(lotto, { onConflict: 'hash_dedup', ignoreDuplicates: true })
      .select('id, hash_dedup');
    if (error) { errori.push(error.message); continue; }
    const righe = (data as any[]) ?? [];
    inseriti += righe.length;

    // Date della ricorrenza per le sole righe appena create.
    const perId = new Map(righe.map((r) => [r.hash_dedup, r.id]));
    const date: Record<string, unknown>[] = [];
    for (const ev of nuovi.slice(i, i + 100)) {
      const id = perId.get(ev.hash_dedup);
      if (!id || ev.date_ricorrenza.length < 2) continue; // una data sola e' gia' data_inizio
      for (const d of ev.date_ricorrenza) date.push({ evento_id: id, data: d.data, annullata: d.annullata });
    }
    if (date.length) {
      const { error: eD } = await supabase.from('eventi_esterni_date')
        .upsert(date, { onConflict: 'evento_id,data', ignoreDuplicates: true });
      if (eD) errori.push(`date: ${eD.message}`);
    }
  }

  const falliti = esiti.filter((e) => !e.ok).length;
  return json({
    ok: errori.length === 0,
    oggi,
    portali_interrogati: portali.length,
    portali_falliti: falliti,
    raccolti: raccolti.length,
    unici: unici.length,
    gia_presenti: unici.length - nuovi.length,
    inseriti,
    errori,
    esiti,
  });
});
