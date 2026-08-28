// solleciti-quota — il promemoria della quota a chi e' stato ammesso ma non
// risulta aver versato.
//
// [4/8/2026] Nasce da Stefano Schwarz: tessera 26 il 21 luglio, quota mai
// arrivata, e per tredici giorni nessuno gliel'ha detto. La mail della tessera
// non nominava il pagamento, quindi lui aveva tutte le ragioni per credersi a
// posto. Con Lorenzo Conci sarebbe successo lo stesso se non fosse intervenuto
// il segretario a mano.
//
// NON confondere con `solleciti-domande`, che avvisa il DIRETTIVO delle
// domande ferme in coda. Questa parla al socio, ed e' un'altra cosa.
//
// EDUCAZIONE PRIMA CHE CODICE. Un promemoria dopo sette giorni, un secondo
// dopo ventuno, poi silenzio: la pratica resta in evidenza nel pannello e a
// quel punto e' una telefonata, non una mail. Tre promemoria automatici sono
// un sollecito di pagamento, e questa e' un'associazione culturale.
//
// CHI NON RICEVE NIENTE, e non e' una dimenticanza:
//   - chi ha una deroga motivata: sono le persone che hanno messo venti euro
//     in mano al segretario a una serata, e ricordare una quota a chi l'ha
//     gia' pagata e' il modo piu' rapido per perdere un socio;
//   - i tredici soci storici del registro cartaceo: hanno pagato davvero,
//     manca solo il dato a sistema;
//   - chi ha un pagamento in verifica: ha fatto il bonifico e sta aspettando
//     noi, non il contrario;
//   - l'account di servizio.
// Tutte queste esclusioni arrivano gratis da `v_soci_in_regola`, che le
// distingue gia': qui si chiede solo `posizione = 'ammesso_senza_incasso'`.
// Una regola scritta in un posto solo non puo' divergere da se stessa.
//
// IL REGISTRO SI SCRIVE PRIMA DI SPEDIRE. La riga in `sollecito_quota` ha un
// vincolo unico su (domanda_id, numero): se due esecuzioni si accavallano, la
// seconda sbatte sul vincolo e salta la persona. Se il registro non si scrive,
// l'email non parte. Meglio un promemoria in ritardo che due nello stesso
// pomeriggio.
//
// SICUREZZA: gate header `x-ingest-token` == INGEST_TOKEN, stesso canale
// amministrativo di solleciti-domande e tessera-invio. verify_jwt=false in
// config.toml: il gate e' il token.
//
// GIRO A VUOTO DI DEFAULT: senza `?esegui=1` non scrive e non spedisce, si
// limita a dire chi riceverebbe cosa. Un lavoro pianificato che manda email e'
// la cosa piu' difficile da fermare quando parte storta.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sollecitoQuotaHtml } from '../_shared/sollecitoQuota.ts';
import { firmaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';

const ANNO = 2026;
const QUOTA_EURO = 20;
const GIORNI_PRIMO = 7;
const GIORNI_SECONDO = 21;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const giorniDa = (iso: string | null): number =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const atteso = Deno.env.get('INGEST_TOKEN');
  if (!atteso) return json({ error: 'INGEST_TOKEN non configurato' }, 500);
  if (req.headers.get('x-ingest-token') !== atteso) return json({ error: 'non autorizzato' }, 401);

  const esegui = new URL(req.url).searchParams.get('esegui') === '1';

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Chi e' ammesso ma non risulta aver versato. Tutte le esclusioni sono gia'
  // dentro questa condizione: vedi il commento in testa.
  const { data: candidati, error: errSel } = await sb
    .from('v_soci_in_regola')
    .select('domanda_id, nome, email, numero_tessera, approvata_il, metodo_scelto, pagamenti_in_verifica')
    .eq('posizione', 'ammesso_senza_incasso');
  if (errSel) {
    try {
      await sb.rpc('registra_battito', {
        p_servizio: 'solleciti-quota', p_esito: 'errore', p_dettaglio: { errore: errSel.message },
      });
    } catch (_) { /* il battito non deve mai rompere il lavoro */ }
    return json({ error: 'lettura fallita', dettaglio: errSel.message }, 500);
  }

  // Chi ha gia' ricevuto qualcosa, e quale.
  const { data: giaInviati } = await sb
    .from('sollecito_quota').select('domanda_id, numero, esito');
  const gia = new Set(
    ((giaInviati ?? []) as Array<Record<string, unknown>>)
      // Un tentativo fallito non blocca il prossimo giro: sarebbe una persona
      // che non riceve mai niente per colpa di un errore di rete.
      .filter((r) => r.esito !== 'fallito')
      .map((r) => `${r.domanda_id}|${r.numero}`),
  );

  const daFare: Array<Record<string, unknown>> = [];
  const saltati: Array<Record<string, unknown>> = [];

  for (const c of (candidati ?? []) as Array<Record<string, any>>) {
    const giorni = giorniDa(c.approvata_il);
    // Difesa in piu' oltre alla vista: se un domani la vista cambiasse, un
    // pagamento in verifica non deve comunque produrre un promemoria.
    if (Number(c.pagamenti_in_verifica ?? 0) > 0) {
      saltati.push({ nome: c.nome, perche: 'ha un pagamento in verifica' });
      continue;
    }
    let numero: 1 | 2 | null = null;
    if (giorni >= GIORNI_SECONDO && !gia.has(`${c.domanda_id}|2`)) numero = 2;
    else if (giorni >= GIORNI_PRIMO && !gia.has(`${c.domanda_id}|1`)) numero = 1;

    if (numero === null) {
      const perche = giorni < GIORNI_PRIMO
        ? `ammesso da ${giorni} giorni, il primo promemoria parte a ${GIORNI_PRIMO}`
        : gia.has(`${c.domanda_id}|2`)
          ? 'ha gia\' ricevuto entrambi i promemoria: da qui in poi e\' una telefonata'
          : `ha gia' ricevuto il primo, il secondo parte a ${GIORNI_SECONDO} giorni`;
      saltati.push({ nome: c.nome, giorni, perche });
      continue;
    }
    daFare.push({
      domanda_id: c.domanda_id, nome: c.nome, email: c.email,
      numero_tessera: c.numero_tessera, giorni, numero,
      metodo_scelto: c.metodo_scelto,
    });
  }

  if (!esegui) {
    return json({
      dryrun: true,
      messaggio: 'Nessuna email inviata, nessuna riga scritta. Ripeti con ?esegui=1 per spedire.',
      quanti: daFare.length,
      destinatari: daFare,
      saltati,
      regole: {
        primo_promemoria_giorni: GIORNI_PRIMO,
        secondo_promemoria_giorni: GIORNI_SECONDO,
        poi: 'silenzio, la pratica resta in evidenza nel pannello',
        esclusi_sempre: ['deroga motivata', 'soci storici del registro cartaceo', 'pagamento in verifica', 'account di sistema'],
      },
    });
  }

  const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET');
  if (!sharedSecret) return json({ error: 'SEND_EMAIL_SHARED_SECRET mancante: nessun invio' }, 500);

  const inviati: Array<Record<string, unknown>> = [];
  const falliti: Array<Record<string, unknown>> = [];

  for (const d of daFare) {
    // 1. Il registro PRIMA. Se questa insert non passa, per errore o perche'
    //    un'altra esecuzione ha gia' preso questa persona, si salta e basta.
    const { data: riga, error: errIns } = await sb.from('sollecito_quota')
      .insert({ domanda_id: d.domanda_id, email: d.email, numero: d.numero, esito: 'in_corso' })
      .select('id').single();
    if (errIns || !riga) {
      saltati.push({ nome: d.nome, perche: 'registro non scritto, nessun invio: ' + (errIns?.message ?? 'motivo ignoto') });
      continue;
    }

    // 2. Il collegamento personale per pagare QUELLA domanda: mandare la
    //    persona su /tesseramento le farebbe ricompilare tutto e nascerebbe un
    //    doppione.
    let urlPagamento: string | undefined;
    if (adminSecret) {
      const exp = Date.now() + TOKEN_TTL_MS;
      urlPagamento = `https://elbrenz.eu/paga-quota/${d.domanda_id}/${exp}/${await firmaToken(adminSecret, 'paga-quota', String(d.domanda_id), exp)}`;
    }

    // 3. L'invio.
    try {
      const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sharedSecret },
        body: JSON.stringify({
          to: d.email,
          subject: `La tua quota ${ANNO} in El Brenz: come completarla`,
          html: sollecitoQuotaHtml({ nome: String(d.nome), anno: ANNO, importo: QUOTA_EURO, urlPagamento }),
          tags: [{ name: 'source', value: `sollecito-quota-${d.numero}` }],
        }),
      });
      if (resp.ok) {
        await sb.from('sollecito_quota').update({ esito: 'inviato' }).eq('id', riga.id);
        inviati.push({ nome: d.nome, email: d.email, numero: d.numero, giorni: d.giorni });
      } else {
        await sb.from('sollecito_quota').update({ esito: 'fallito', dettaglio: `HTTP ${resp.status}` }).eq('id', riga.id);
        falliti.push({ nome: d.nome, http: resp.status });
      }
    } catch (e) {
      await sb.from('sollecito_quota').update({ esito: 'fallito', dettaglio: String(e).slice(0, 300) }).eq('id', riga.id);
      falliti.push({ nome: d.nome, errore: String(e).slice(0, 200) });
    }
  }

  console.log(`[solleciti-quota] inviati=${inviati.length} falliti=${falliti.length} saltati=${saltati.length}`);

  // Battito (brief "Il battito dei servizi", 28/8/2026 §3).
  try {
    await sb.rpc('registra_battito', {
      p_servizio: 'solleciti-quota',
      p_esito: daFare.length === 0 ? 'niente_da_fare' : (falliti.length > 0 ? 'errore' : 'ok'),
      p_dettaglio: { inviati: inviati.length, falliti: falliti.length, saltati: saltati.length },
    });
  } catch (_) { /* il battito non deve mai rompere il lavoro */ }

  return json({ eseguito: true, inviati, falliti, saltati });
});
