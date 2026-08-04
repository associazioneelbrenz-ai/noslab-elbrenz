// scheda-domanda — scheda HTML per il Direttivo con approvazione a un click
// (M2.6-ter). Server-rendered da questa function, NON nel sito statico.
//
// SICUREZZA:
//   - accesso SOLO con token HMAC firmato (ADMIN_ACTION_SECRET, scadenza
//     30 giorni) incluso nel link della mail al Direttivo;
//   - scope separati: il token 'vista' NON autorizza l'approvazione — i
//     bottoni portano token 'azione' distinti;
//   - X-Robots-Tag noindex + meta robots; nessun elenco navigabile;
//   - idempotenza: approva agisce SOLO su stato 'in_attesa' con UPDATE
//     condizionato — doppio click non invia due tessere né brucia numeri.
//
// NUMERAZIONE: numero_tessera = max(TESSERA_SEED, max(esistenti)+1).
// Seed = 20 (Libro Soci: 1-19 assegnate manualmente, righe storiche a DB).
//
// TESSERE_LIVE (secret, 'true' per attivare): finché spento, l'approvazione
// assegna numero e stato ma NON invia l'email tessera al socio (Resend
// senza dominio autenticato). La scheda lo dichiara esplicitamente.
//
// FASE 1 dichiarata: tessera come email HTML brandizzata, PDF in fase 2.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaToken, verificaToken, TOKEN_TTL_MS } from '../_shared/admin.ts';
import { ensureCodiceEQr, tesseraEmailHtml } from '../_shared/tessera.ts';
import { sollecitoQuotaHtml } from '../_shared/sollecitoQuota.ts';
import { quotaAnno } from '../_shared/quota.ts';

const ANNO = 2026;
// Quota sociale dell'anno. Qui il numero si MOSTRA soltanto (mail, pannello):
// non decide quanto qualcuno paga. Si legge da config_app tramite quotaAnno(),
// con 20 come rete se la lettura non riesce.
const QUOTA_FALLBACK = 20;

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function pagina(titolo: string, corpo: string): Response {
  const html = `<!DOCTYPE html>
<html lang="it"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>${esc(titolo)} — El Brenz</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #F8F1E4; color: #1E2E26; margin: 0; padding: 24px; }
  .card { max-width: 640px; margin: 0 auto; background: #fff; border-top: 4px solid #C8923E; border-radius: 8px; padding: 32px; }
  h1 { font-family: Georgia, 'Playfair Display', serif; font-size: 26px; margin: 0 0 4px; }
  .occhiello { color: #C8923E; text-transform: uppercase; letter-spacing: .18em; font-size: 11px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 9px 0; border-bottom: 1px solid #eee; font-size: 15px; vertical-align: top; }
  td:first-child { color: #666; font-size: 13px; width: 150px; }
  .stato { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .in_attesa { background: #fdf3df; color: #8a6215; } .approvata { background: #eaf3ee; color: #2d8659; }
  .respinta { background: #fbecec; color: #a33; }
  .pag-ok { background: #eaf3ee; border-left: 3px solid #2d8659; padding: 12px 16px; }
  .pag-no { background: #FDF9F0; border-left: 3px solid #C8923E; padding: 12px 16px; }
  .btn { display: inline-block; padding: 13px 26px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 14px; border: 0; cursor: pointer; }
  .btn-ok { background: #C8923E; color: #1E2E26; } .btn-no { background: #fff; color: #a33; border: 2px solid #d97a7a; }
  .nota { color: #999; font-size: 12px; margin-top: 20px; }
  form { display: inline-block; margin-right: 12px; margin-top: 16px; }
</style></head>
<body><div class="card">${corpo}</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

function erroreHtml(msg: string): Response {
  return pagina('Accesso negato', `
    <p class="occhiello">El Brenz · Area riservata</p>
    <h1>Accesso negato</h1>
    <p>${esc(msg)}</p>
    <p class="nota">Se il link è scaduto, apri la mail più recente della domanda o scrivi a info@elbrenz.eu.</p>`);
}

// [4/8/2026] I campi anagrafici che il registro cartaceo ha e il database non
// aveva. L'elenco vive in un posto solo ed e' anche la lista bianca di cosa si
// puo' scrivere dal pannello: se fosse scritto due volte, prima o poi una delle
// due copie lascerebbe passare un campo che non deve passare, per esempio lo
// stato della domanda o il numero di tessera.
const CAMPI_ANAGRAFICI = [
  'cognome',
  'residenza_via', 'residenza_civico', 'residenza_cap', 'residenza_comune', 'residenza_provincia',
  'telefono', 'categoria_socio', 'stato_socio',
  'cessazione_data', 'cessazione_motivo',
  'note_segreteria', 'codice_fiscale',
  // Statuto 2014: il recesso ha effetto dal SECONDO mese successivo a quello in
  // cui il Consiglio riceve la comunicazione. Serve la data di RICEZIONE, non
  // quella in cui qualcuno la registra a sistema.
  'recesso_comunicato_il',
] as const;

const CATEGORIE_SOCIO = ['ordinario', 'fondatore', 'onorario', 'sostenitore'];
const STATI_SOCIO = ['attivo', 'cessato'];
const MOTIVI_CESSAZIONE = ['recesso', 'decadenza_morosita', 'esclusione', 'decesso'];

// I campi che il libro degli associati pretende.
//
// [4/8/2026, decisione di Cristian] Il CODICE FISCALE e' fra questi: e'
// obbligatorio. La prima versione lo teneva fuori, e sbagliava.
//
// Resta pero' vuoto a database, e non e' una contraddizione: trenta schede
// storiche non ce l'hanno, e metterci un vincolo NOT NULL bloccherebbe ogni
// scrittura su quelle righe invece di aiutare a completarle. Obbligatorio vuol
// dire due cose precise: il modulo pubblico non lo lascia saltare, e una
// scheda che ne e' priva risulta INCOMPLETA e si vede.
//
// Il TELEFONO invece resta fuori apposta: e' un recapito utile
// all'Associazione, ma un registro non e' incompleto perche' manca un numero.
const CAMPI_LIBRO_ASSOCIATI = [
  'cognome', 'data_nascita', 'comune_nascita', 'codice_fiscale',
  'residenza_via', 'residenza_civico', 'residenza_cap', 'residenza_comune', 'residenza_provincia',
  'categoria_socio', 'approvata_il',
];

const vuoto = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

function anagraficaCompleta(riga: Record<string, unknown>): boolean {
  return CAMPI_LIBRO_ASSOCIATI.every((c) => !vuoto(riga[c]));
}

// Quante schede mancano di ciascun campo. Serve a sapere DA DOVE cominciare:
// «trenta schede incomplete» non dice niente, «trenta senza residenza e una
// senza data di ammissione» dice che il lavoro e' uno solo.
function contaMancanti(righe: Array<Record<string, unknown>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CAMPI_LIBRO_ASSOCIATI) {
    const quante = righe.filter((r) => vuoto(r[c])).length;
    if (quante > 0) out[c] = quante;
  }
  return out;
}

// Pulizia e controllo di un campo in arrivo. Torna il valore da scrivere,
// oppure un Error con una frase leggibile: il vincolo esiste anche a database,
// ma un messaggio di Postgres letto da un segretario non aiuta nessuno.
function normalizzaCampo(campo: string, grezzo: unknown): unknown | Error {
  if (grezzo === null || grezzo === undefined) return null;
  let v = String(grezzo).trim();
  // La casella svuotata significa «questo dato non lo so»: si scrive vuoto, non
  // stringa vuota, cosi' i conteggi di completezza tornano.
  if (v === '') return null;

  switch (campo) {
    case 'residenza_cap':
      if (!/^[0-9]{5}$/.test(v)) return new Error('Il CAP deve essere di cinque cifre.');
      return v;
    case 'residenza_provincia':
      v = v.toUpperCase();
      if (!/^[A-Z]{2}$/.test(v)) return new Error('La provincia va scritta con due lettere, per esempio TN.');
      return v;
    case 'codice_fiscale':
      v = v.toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9]{11,16}$/.test(v)) return new Error('Il codice fiscale non sembra scritto bene.');
      return v;
    case 'categoria_socio':
      if (!CATEGORIE_SOCIO.includes(v)) return new Error('Categoria di socio non prevista.');
      return v;
    case 'stato_socio':
      if (!STATI_SOCIO.includes(v)) return new Error('Stato del socio non previsto.');
      return v;
    case 'cessazione_motivo':
      if (!MOTIVI_CESSAZIONE.includes(v)) return new Error('Motivo di cessazione non previsto dallo statuto.');
      return v;
    case 'cessazione_data':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Error('La data di cessazione va scritta per intero.');
      return v;
    case 'recesso_comunicato_il':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Error('La data della comunicazione di recesso va scritta per intero.');
      return v;
    case 'telefono':
      // Larghi di proposito: i numeri del registro cartaceo sono scritti in
      // dieci modi diversi e rifiutarli costringerebbe a riscriverli tutti.
      if (v.length > 40) return new Error('Il numero di telefono e troppo lungo.');
      return v;
    case 'note_segreteria':
      return v.slice(0, 2000);
    default:
      return v.slice(0, 200);
  }
}

// [4/8/2026] La gita e' annullata o no. Lo chiede la cassa: un anticipo di una
// gita annullata e' denaro incassato ma DA RESTITUIRE, e va detto; lo stesso
// anticipo di una gita che si fa e' incasso e basta.
//
// La domanda si fa al database e non si scrive nella pagina, perche' il 3
// agosto la gita e' stata annullata, il 4 riaperta, e una pagina che se lo
// ricorda per conto suo mente al primo ripensamento. E' successo davvero.
async function gitaAnnullata(sb: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const { data } = await sb.from('config_app').select('valore')
      .eq('chiave', 'gita_giochi_medievali_2026_stato').maybeSingle();
    const stato = (data?.valore as Record<string, unknown> | undefined)?.stato;
    // Qui NON si fa fail-closed: questa funzione gira con la chiave di
    // servizio, che legge sempre. Se lo stato manca del tutto, la gita non
    // risulta annullata: e' il caso in cui non c'e' nessuna gita.
    return typeof stato === 'string' && stato !== 'aperta';
  } catch {
    return false;
  }
}

// Ramo JSON (16/7): la pagina Astro /scheda-domanda renderizza nativamente su
// elbrenz.eu (la piattaforma Supabase forza text/plain sull'HTML delle edge →
// download .txt). Qui rispondiamo JSON sui path con prefisso /json/…, lasciando
// i rami HTML e i link email già in circolazione intatti (additività).
function jsonR(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

// [3/8/2026] Lo stato dell'incasso, letto con la STESSA regola del trigger
// blocca_approvazione_senza_incasso: pagamento completato, tipo quota o
// integrazione, agganciato alla domanda. Se pagina e database applicassero
// regole diverse direbbero cose diverse sulla stessa persona, ed e' esattamente
// il guaio da cui veniamo.
//
// I tentativi NON riusciti si riportano a parte: dicono che la persona ci ha
// provato, ed e' un'informazione diversa dal non aver fatto nulla.
async function statoIncasso(supabase: any, id: string, email: string | null) {
  const campi = 'stato, metodo, importo, anomalia, capture_id, created_at, domanda_id';
  const tipi = ['quota', 'integrazione'];

  // [4/8/2026] Due ricerche separate invece di una `.or()` con l'indirizzo
  // concatenato dentro la stringa del filtro. In quella sintassi la virgola
  // separa le condizioni: un indirizzo che contenesse una virgola o una
  // parentesi spezzerebbe il filtro in due e la query smetterebbe di dire
  // quello che credi. Oggi nessun indirizzo a database lo fa, ma era una riga
  // che aspettava il primo indirizzo strano. Qui l'email e' un VALORE.
  const [perDomanda, perEmail] = await Promise.all([
    supabase.from('pagamenti_tesseramento').select(campi)
      .eq('domanda_id', id).in('tipo', tipi)
      .order('created_at', { ascending: false }).limit(10),
    email
      ? supabase.from('pagamenti_tesseramento').select(campi)
          .ilike('email', email).in('tipo', tipi)
          .order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  // Unione in memoria, senza doppioni: la stessa riga puo' arrivare da
  // entrambe le ricerche.
  const visti = new Set<string>();
  const righe: Array<Record<string, unknown>> = [];
  for (const r of [...((perDomanda.data ?? []) as Array<Record<string, unknown>>),
                   ...((perEmail.data ?? []) as Array<Record<string, unknown>>)]) {
    const k = String(r.capture_id ?? '') + '|' + String(r.created_at ?? '') + '|' + String(r.importo ?? '');
    if (visti.has(k)) continue;
    visti.add(k);
    righe.push(r);
  }
  righe.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  // Per dire "incassata" si pretende l'aggancio alla domanda, non la sola
  // omonimia di email: e' cio' che guarda il trigger, e un pagamento agganciato
  // a un'altra domanda della stessa persona non vale per questa.
  const incassati = righe.filter((r) => r.stato === 'completato' && r.domanda_id === id);
  const tentativi = righe.filter((r) => r.stato !== 'completato');
  // Righe completate ma NON agganciate: vanno mostrate, perche' quasi sempre
  // sono il pagamento giusto che ha perso il collegamento, e il segretario deve
  // poterlo vedere invece di ritrovarsi un "nessun pagamento" che mente.
  const daAgganciare = righe.filter((r) => r.stato === 'completato' && r.domanda_id !== id);
  return { incassata: incassati.length > 0, incassati, tentativi, daAgganciare };
}

// Esecuzione azioni: logica di business condivisa tra il ramo HTML (POST) e il
// ramo JSON. Ritorna dati strutturati; il chiamante formatta HTML o JSON.
type EsitoApprova =
  | { errore: string }
  | { bloccato: string }
  | { ok: false; gia: { stato: string; numero_tessera: number | null } }
  | { ok: true; nome: string; email: string; numero: number; tessereLive: boolean; invio: 'inviata' | 'off' | 'no-secret' | 'fallita'; urlVerifica: string | null; deroga: boolean };

async function eseguiApprova(supabase: any, secret: string, d: string, derogaMotivo?: string): Promise<EsitoApprova> {
  const seed = parseInt(Deno.env.get('TESSERA_SEED') ?? '', 10);
  if (!Number.isFinite(seed)) return { errore: 'TESSERA_SEED non configurato: approvazione bloccata per proteggere la numerazione del Libro Soci.' };

  const { data: maxRow } = await supabase.from('domande_tesseramento')
    .select('numero_tessera').not('numero_tessera', 'is', null)
    .order('numero_tessera', { ascending: false }).limit(1).maybeSingle();
  const numero = Math.max(seed, (maxRow?.numero_tessera ?? 0) + 1);

  // [4/8/2026] IL NUMERO DI SOCIO, che non e' il numero di tessera.
  // Il libro degli associati usa il progressivo del registro cartaceo tenuto
  // dal 2009, non il numero stampato sulla tessera: Cristian Bresadola e' il
  // socio 1 e ha la tessera 4.
  //
  // Si prende SEMPRE il massimo piu' uno, MAI il primo buco libero: i buchi
  // (4, 5, 16, 40, 95 e altri novanta) appartengono a soci storici che non
  // sono a database, e riassegnarli farebbe raccontare al registro una cosa
  // falsa su due persone insieme. Il numero di un socio resta suo anche quando
  // esce. La regola vive nella funzione a database, in un posto solo.
  const { data: prossimoSocio, error: errNumSocio } = await supabase.rpc('prossimo_numero_socio');
  if (errNumSocio || typeof prossimoSocio !== 'number') {
    // Senza numero di socio non si approva: una riga nel libro degli associati
    // senza il suo progressivo e' una riga che poi qualcuno numera a mano, ed
    // e' cosi' che nascono i doppioni.
    return { errore: 'Non riesco ad assegnare il numero di socio: approvazione bloccata per proteggere il libro degli associati.' };
  }

  // La deroga viaggia NELLA STESSA update dello stato: il trigger guarda la
  // riga che sta per essere scritta, quindi scriverla dopo non servirebbe a
  // niente e scriverla prima lascerebbe una deroga appesa a una domanda che poi
  // non viene approvata.
  const deroga = (derogaMotivo ?? '').trim().slice(0, 1000);
  const patch: Record<string, unknown> = {
    stato: 'approvata', numero_tessera: numero, numero_socio: prossimoSocio, scadenza: `${ANNO}-12-31`,
    approvata_da: 'via email-link segretario', approvata_il: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  if (deroga) patch.deroga_pagamento_motivo = deroga;

  const { data: agg, error: aggErr } = await supabase.from('domande_tesseramento')
    .update(patch)
    .eq('id', d).eq('stato', 'in_attesa')
    .select('id, nome, email');

  // Il trigger rifiuta con un messaggio scritto per una persona: va riportato
  // cosi' com'e', non tradotto in "gia' gestita", che sarebbe una bugia e
  // manderebbe il segretario a cercare un problema che non esiste.
  if (aggErr) {
    console.error('[scheda-domanda] approvazione rifiutata:', aggErr);
    const msg = String((aggErr as Record<string, unknown>).message ?? '');
    if (msg.includes('Approvazione bloccata')) return { bloccato: msg };
    return { errore: 'Non e\' stato possibile approvare la domanda. Riprova, e se insiste segnalalo.' };
  }

  if (!agg || agg.length === 0) {
    const { data: gia } = await supabase.from('domande_tesseramento').select('stato, numero_tessera').eq('id', d).maybeSingle();
    return { ok: false, gia: { stato: gia?.stato ?? 'gestita', numero_tessera: gia?.numero_tessera ?? null } };
  }
  const socio = agg[0];

  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'X-Bot-Secret': Deno.env.get('BOT_ANDREAS_SECRET') ?? '' },
    body: JSON.stringify({ text: `🎉 **Nuovo socio**\n${socio.nome} è ora socio/a (tessera n. ${numero}).` }),
  }).catch(() => {});

  const tessereLive = Deno.env.get('TESSERE_LIVE') === 'true';
  let invio: 'inviata' | 'off' | 'no-secret' | 'fallita' = 'off';
  let urlVerifica: string | null = null;
  if (tessereLive) {
    const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
    if (!sharedSecret) { invio = 'no-secret'; }
    else {
      try {
        const { urlVerifica: uv, qrUrl } = await ensureCodiceEQr(supabase, { id: d, numero_tessera: numero, anno: ANNO, codice_tessera: null }, secret);
        urlVerifica = uv;
        // In deroga la mail porta il collegamento per pagare QUELLA domanda:
        // mandare la persona su /tesseramento le farebbe ricompilare tutto e
        // nascerebbe un doppione.
        const expPaga = Date.now() + TOKEN_TTL_MS;
        const urlPagaQuota = deroga
          ? `https://elbrenz.eu/paga-quota/${d}/${expPaga}/${await firmaToken(secret, 'paga-quota', d, expPaga)}`
          : undefined;
        const tesseraHtml = tesseraEmailHtml({
          nome: socio.nome, numero, anno: ANNO, qrUrl, urlVerifica: uv,
          intro: `Benvenuto nella <em>nosa Sociazion</em>! La tua domanda è stata approvata dal Consiglio Direttivo: questa email vale come tessera digitale per l'anno ${ANNO}.`,
          // In deroga la tessera parte lo stesso, ma la mail dice che la quota
          // manca: tacerlo e' cio' che ha lasciato Schwarz convinto di essere a
          // posto per tredici giorni.
          ...(deroga ? { quotaDaSaldare: { importo: await quotaAnno(supabase, ANNO, QUOTA_FALLBACK), urlPagamento: urlPagaQuota } } : {}),
        });
        const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sharedSecret },
          body: JSON.stringify({ to: socio.email, subject: `Benvenuto in El Brenz: tessera n. ${numero} (${ANNO})`, html: tesseraHtml, tags: [{ name: 'source', value: 'tessera' }] }),
        });
        if (resp.ok) {
          await supabase.from('domande_tesseramento').update({ tessera_inviata: true, updated_at: new Date().toISOString() }).eq('id', d);
          invio = 'inviata';
        } else { invio = 'fallita'; }
      } catch { invio = 'fallita'; }
    }
  }
  return { ok: true, nome: socio.nome, email: socio.email, numero, tessereLive, invio, urlVerifica, deroga: !!deroga };
}

async function eseguiRespingi(supabase: any, d: string, motivo: string): Promise<{ fatto: boolean }> {
  const { data: agg } = await supabase.from('domande_tesseramento')
    .update({ stato: 'respinta', motivo_rifiuto: motivo || null, approvata_da: 'via email-link segretario', approvata_il: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', d).eq('stato', 'in_attesa')
    .select('id');
  return { fatto: !!(agg && agg.length > 0) };
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('ADMIN_ACTION_SECRET');
  if (!secret) {
    return erroreHtml('Configurazione mancante (ADMIN_ACTION_SECRET non impostato — vedi docs/SETUP_PAYPAL.md).');
  }

  const url = new URL(req.url);

  // ── RAMO JSON (/json/…) — consumato dalla pagina Astro /scheda-domanda ──────
  // La pagina rende su elbrenz.eu (charset ok, niente download .txt) e chiama qui
  // in JSON. Preflight CORS + peek (GET) + esecuzione (POST). Scope token identici
  // ai rami HTML. Ritorna PRIMA del flusso HTML sottostante, che resta invariato.
  if (url.pathname.includes('/json/')) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      } });
    }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // [4/8/2026] La CODA: l'elenco delle domande da lavorare.
    //
    // Finora al segretario ci si arrivava solo dai collegamenti nelle email.
    // Se una mail finiva nello spam, o veniva archiviata per sbaglio, quella
    // domanda spariva dai radar: e' successo, ed e' il motivo per cui tre
    // domande erano rimaste ferme sei giorni a luglio.
    //
    // Qui la porta e' la SESSIONE, non un token firmato: si legge il Bearer,
    // si verifica l'utente e si controlla il livello di ruolo lato server.
    // Non si passa dalle policy RLS perche' quelle pretendono aal2, cioe' il
    // secondo fattore, che la sessione OTP non ha: leggere di qui con il
    // service role e un gate esplicito e' piu' onesto che abbassare le RLS.
    //
    // I token per agire su ciascuna domanda si coniano qui, freschi: la lista
    // e' solo una lista, ogni azione porta la sua firma.
    if (url.pathname.endsWith('/json/coda') && req.method === 'POST') {
      const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!bearer) return jsonR({ ok: false, error: 'no_token' }, 401);
      const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: uerr } = await asUser.auth.getUser();
      if (uerr || !user) return jsonR({ ok: false, error: 'unauthorized' }, 401);
      const { data: ruoli } = await sb.from('utente_ruolo')
        .select('ruolo:ruolo_id(nome, livello)').eq('utente_id', user.id);
      const livello = Math.max(0, ...(((ruoli ?? []) as Array<Record<string, any>>).map((r) => r?.ruolo?.livello ?? 0)));
      if (livello < 50) return jsonR({ ok: false, error: 'non_autorizzato' }, 403);

      // [4/8/2026] La posizione la decide la VISTA, non piu' questa funzione.
      // Prima il pannello se la ricalcolava in TypeScript: due punti che
      // applicano la stessa regola sono due punti che prima o poi divergono, ed
      // e' proprio il guaio da cui viene tutta questa storia. Adesso
      // v_soci_in_regola e' l'unica a dire chi e' in regola, e sa distinguere
      // anche i tredici del registro cartaceo e l'account di servizio, cose che
      // il pannello da solo non poteva sapere.
      const { data: soci, error: errSoci } = await sb.from('v_soci_in_regola')
        .select('*').order('approvata_il', { ascending: false, nullsFirst: true });
      if (errSoci) return jsonR({ ok: false, error: 'lettura', message: errSoci.message }, 500);

      // Chi ha gia' ricevuto un promemoria, e quando: il segretario deve poter
      // vedere che una persona e' gia' stata avvisata prima di telefonarle.
      const { data: promemoria } = await sb.from('sollecito_quota')
        .select('domanda_id, numero, inviato_il, esito');
      const perDomanda = new Map<string, Array<Record<string, unknown>>>();
      for (const r of (promemoria ?? []) as Array<Record<string, unknown>>) {
        const k = String(r.domanda_id ?? '');
        if (!perDomanda.has(k)) perDomanda.set(k, []);
        perDomanda.get(k)!.push(r);
      }

      // [4/8/2026] L'anagrafica del registro cartaceo. Sta sulla domanda e non
      // nella vista, perche' la vista risponde alla domanda «e' in regola con
      // la quota», che e' un'altra cosa. Serve al pannello per riempire il
      // modulo di completamento senza far ridigitare quello che gia' c'e'.
      const { data: anagrafiche } = await sb.from('domande_tesseramento')
        .select(`id, ${CAMPI_ANAGRAFICI.join(', ')}, data_nascita, comune_nascita, sesso, anagrafica_aggiornata_il, anagrafica_aggiornata_da`);
      const anagPerId = new Map(((anagrafiche ?? []) as Array<Record<string, any>>).map((a) => [a.id, a]));

      const exp = Date.now() + TOKEN_TTL_MS;
      const righe = [];
      for (const x of (soci ?? []) as Array<Record<string, any>>) {
        const a = anagPerId.get(x.domanda_id) ?? {};
        righe.push({
          ...x,
          ...a,
          // `a` porta con se' la sua `id`, che e' la stessa: la si riafferma
          // dopo lo spread per non dipendere dall'ordine delle chiavi.
          id: x.domanda_id,
          anagrafica_completa: anagraficaCompleta({ ...x, ...a }),
          promemoria: (perDomanda.get(x.domanda_id) ?? []).sort((a, b) => Number(a.numero) - Number(b.numero)),
          vista: `https://elbrenz.eu/scheda-domanda/vista/${x.domanda_id}/${exp}/${await firmaToken(secret, 'vista', x.domanda_id, exp)}`,
        });
      }

      // La completezza si conta sulla stessa popolazione del libro soci: i
      // soci ammessi, senza l'account di servizio. Contarla su tutte e
      // trentacinque le domande, annullate comprese, darebbe un numero che non
      // corrisponde a nessun lavoro reale da fare.
      const daCompletare = righe.filter((r: Record<string, any>) =>
        r.stato === 'approvata' && r.posizione !== 'account_di_sistema');
      // [4/8/2026] IL COLLEGAMENTO DI RINNOVO, e la regola che lo governa.
      //
      // I solleciti di rinnovo partono DOPO il 31 dicembre, mai prima: chiedere
      // a novembre la quota dell'anno dopo e' il modo piu' rapido per far
      // sentire una persona un abbonamento invece che un socio.
      //
      // Quella regola qui non e' scritta in un commento e basta: finche' l'anno
      // non e' cominciato il collegamento NON VIENE PROPRIO GENERATO. Nessun
      // collegamento, nessuna email possibile. Una regola che vive solo nella
      // buona volonta' di chi guarda il pannello, prima o poi, non regge.
      const annoRinnovo = ANNO + 1;
      const { data: sollecitabile } = await sb.rpc('rinnovo_sollecitabile', { p_anno: annoRinnovo });
      const rinnoviAperti = sollecitabile === true;
      if (rinnoviAperti) {
        const expR = Date.now() + TOKEN_TTL_MS;
        for (const r of righe as Array<Record<string, any>>) {
          if (r.stato !== 'approvata' || r.posizione === 'account_di_sistema' || r.stato_socio === 'cessato') continue;
          r.rinnovo = `https://elbrenz.eu/rinnovo/${annoRinnovo}/${r.domanda_id}/${expR}/`
            + await firmaToken(secret, `rinnovo-${annoRinnovo}`, r.domanda_id, expR);
        }
      }

      const completezza = {
        totale: daCompletare.length,
        complete: daCompletare.filter((r: Record<string, any>) => r.anagrafica_completa).length,
        mancanti: contaMancanti(daCompletare),
      };

      // La cassa, dalla vista che tiene insieme quote, integrazioni e anticipi
      // delle gite senza duplicare una riga. Nessun totale calcolato qui: si
      // sommano righe che arrivano gia' pronte.
      // `id` serve per poter annullare una registrazione manuale dal dettaglio
      // della cassa; `annullato_motivo` per far vedere perche', invece di una
      // riga barrata senza spiegazione.
      const { data: incassi } = await sb.from('v_incassi')
        .select('id, tabella, tipo, nome, email, anno, importo, stato, metodo, quando, incassato_il, data_ricostruita, annullato_motivo, note_incasso')
        .order('quando', { ascending: false });

      // Chi puo' aver materialmente incassato: serve al modulo di
      // registrazione manuale, perche' i contanti li prende spesso un
      // consigliere e non chi poi li registra. Solo id e nome: qui non
      // servono altri dati personali e non si mandano.
      const { data: membri } = await sb.from('utente_ruolo')
        .select('utente_id, ruolo:ruolo_id(livello), utente:utente_id(id, nome, cognome, email)');
      const incassanti = [...new Map(
        ((membri ?? []) as Array<Record<string, any>>)
          .filter((m) => (m?.ruolo?.livello ?? 0) >= 50 && m?.utente?.id)
          .map((m) => [m.utente.id, {
            id: m.utente.id,
            nome: [m.utente.nome, m.utente.cognome].filter(Boolean).join(' ').trim() || m.utente.email,
          }]),
      ).values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

      return jsonR({
        ok: true, tipo: 'coda', livello, quota: await quotaAnno(sb, ANNO, QUOTA_FALLBACK),
        righe,
        incassi: incassi ?? [],
        incassanti,
        completezza,
        gita_annullata: await gitaAnnullata(sb),
        rinnovi: {
          anno: annoRinnovo,
          aperti: rinnoviAperti,
          perche: rinnoviAperti
            ? null
            : `I rinnovi per il ${annoRinnovo} si aprono il 1 gennaio ${annoRinnovo}. Chiedere prima la quota dell anno dopo fa sentire un socio un abbonamento.`,
        },
        io: user.id,
      });
    }

    // [4/8/2026] COMPLETAMENTO ANAGRAFICO. E' qui che si recupera il registro
    // cartaceo tenuto dal 2009, una persona alla volta.
    //
    // PERCHE' QUI E NON NELLA SCHEDA A TOKEN. La scheda `/scheda-domanda/vista/`
    // si apre con un collegamento firmato, che dimostra da dove viene il link ma
    // non chi lo sta usando: chiunque abbia inoltrato quella mail potrebbe
    // aprirlo. Per i dati anagrafici serve sapere CHI scrive, quindi si passa
    // dalla sessione e dal ruolo, come per la coda e il libro soci.
    //
    // I DATI ANAGRAFICI SI CORREGGONO, al contrario degli incassi: un indirizzo
    // cambia, un cognome era scritto male. Proprio per questo si tiene lo
    // storico di chi ha cambiato cosa: senza, una correzione sbagliata e'
    // indistinguibile da un dato che e' sempre stato cosi'.
    if (url.pathname.endsWith('/json/anagrafica') && req.method === 'POST') {
      const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!bearer) return jsonR({ ok: false, error: 'no_token' }, 401);
      const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: uerr } = await asUser.auth.getUser();
      if (uerr || !user) return jsonR({ ok: false, error: 'unauthorized' }, 401);
      const { data: ruoli } = await sb.from('utente_ruolo')
        .select('ruolo:ruolo_id(livello)').eq('utente_id', user.id);
      const livello = Math.max(0, ...(((ruoli ?? []) as Array<Record<string, any>>).map((r) => r?.ruolo?.livello ?? 0)));
      if (livello < 50) return jsonR({ ok: false, error: 'non_autorizzato' }, 403);

      let corpo: Record<string, any>;
      try { corpo = await req.json(); } catch { return jsonR({ ok: false, error: 'json_non_valido' }, 400); }

      const domandaId = String(corpo?.domanda_id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(domandaId)) return jsonR({ ok: false, error: 'domanda_non_valida' }, 400);

      const { data: prima, error: errPrima } = await sb.from('domande_tesseramento')
        .select(`id, nome, ${CAMPI_ANAGRAFICI.join(', ')}`).eq('id', domandaId).maybeSingle();
      if (errPrima || !prima) return jsonR({ ok: false, error: 'domanda_inesistente' }, 404);

      // Solo i campi dell'elenco si possono scrivere da qui. Accettare quello
      // che arriva e passarlo all'update vorrebbe dire lasciare che questa
      // chiamata cambi lo stato della domanda o il numero di tessera.
      const modifiche: Record<string, unknown> = {};
      const campiIn = (corpo?.campi ?? {}) as Record<string, unknown>;
      for (const campo of CAMPI_ANAGRAFICI) {
        if (!(campo in campiIn)) continue;
        const pulito = normalizzaCampo(campo, campiIn[campo]);
        if (pulito instanceof Error) return jsonR({ ok: false, error: 'campo_non_valido', campo, message: pulito.message }, 400);
        // Il confronto e' con il valore gia' a database: un campo rimandato
        // identico non e' una modifica e non deve sporcare lo storico.
        if (pulito !== ((prima as Record<string, any>)[campo] ?? null)) modifiche[campo] = pulito;
      }

      if (Object.keys(modifiche).length === 0) {
        return jsonR({ ok: true, invariato: true, message: 'Nessun campo cambiato.' });
      }

      // Il vincolo di coerenza sta a database, ma un errore di Postgres letto
      // da un segretario non aiuta nessuno: la stessa regola, detta prima e in
      // italiano.
      const statoDopo = 'stato_socio' in modifiche ? modifiche.stato_socio : (prima as Record<string, any>).stato_socio;
      const dataDopo = 'cessazione_data' in modifiche ? modifiche.cessazione_data : (prima as Record<string, any>).cessazione_data;
      const motivoDopo = 'cessazione_motivo' in modifiche ? modifiche.cessazione_motivo : (prima as Record<string, any>).cessazione_motivo;
      if (statoDopo === 'cessato' && (!dataDopo || !motivoDopo)) {
        return jsonR({
          ok: false, error: 'cessazione_incompleta',
          message: 'Per registrare una cessazione servono la data e il motivo: un socio che esce senza che si sappia quando e perche non e una cessazione registrata.',
        }, 400);
      }

      const adesso = new Date().toISOString();
      // [4/8/2026] Se questa modifica fa cessare un socio, resta scritto CHI
      // l'ha deliberata e quando. Lo statuto dice che la qualita' di socio si
      // perde per mancato pagamento, ma il termine lo delibera il Consiglio:
      // qui si REGISTRA una decisione presa altrove, e senza il nome di chi
      // l'ha presa non e' una decisione, e' una riga comparsa da sola.
      const diventaCessato = modifiche.stato_socio === 'cessato'
        && (prima as Record<string, any>).stato_socio !== 'cessato';
      const { error: errUp } = await sb.from('domande_tesseramento')
        .update({
          ...modifiche,
          anagrafica_aggiornata_il: adesso, anagrafica_aggiornata_da: user.id,
          ...(diventaCessato ? { cessazione_deliberata_da: user.id, cessazione_deliberata_il: adesso } : {}),
        })
        .eq('id', domandaId);
      if (errUp) return jsonR({ ok: false, error: 'aggiornamento_fallito', message: errUp.message }, 500);

      // Lo storico tiene i soli campi toccati, con il prima e il dopo: cosi' si
      // legge, invece di andare confrontato a mano contro l'intera riga.
      const primaSoloToccati: Record<string, unknown> = {};
      for (const k of Object.keys(modifiche)) primaSoloToccati[k] = (prima as Record<string, any>)[k] ?? null;
      await sb.from('anagrafica_modifica').insert({
        domanda_id: domandaId, modificato_da: user.id,
        prima: primaSoloToccati, dopo: modifiche,
      });

      return jsonR({
        ok: true, domanda_id: domandaId,
        campi_cambiati: Object.keys(modifiche),
        aggiornata_il: adesso,
      });
    }

    // [4/8/2026] LIBRO SOCI. Il registro che al RUNTS va esibito.
    //
    // Ramo a parte, non un pezzo di /json/coda, per due ragioni. La prima e' la
    // minimizzazione: qui servono le date di nascita, che nel pannello della
    // coda non servono e quindi non devono nemmeno partire dal server. La
    // seconda e' che il libro soci ha una popolazione diversa dalla coda: solo
    // chi e' stato ammesso, e senza l'account di servizio, che non e' una
    // persona e in un registro dei soci non ci va.
    //
    // NON RICALCOLA NIENTE. La posizione rispetto alla quota arriva da
    // v_soci_in_regola e i totali da v_incassi, gli stessi che alimentano il
    // pannello: se questo file si mettesse a rifare i conti, il registro
    // esibito e il pannello potrebbero dire due cose diverse sulla stessa
    // persona, ed e' esattamente il guaio da cui nasce tutto questo lavoro.
    //
    // I BUCHI SI DICHIARANO. Il conteggio di cosa manca esce da qui insieme ai
    // dati: un registro che nasconde le proprie lacune e' peggio di uno che le
    // dichiara, perche' il funzionario che se ne accorge da solo non si fida
    // piu' nemmeno del resto.
    if (url.pathname.endsWith('/json/libro-soci') && req.method === 'POST') {
      const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!bearer) return jsonR({ ok: false, error: 'no_token' }, 401);
      const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: uerr } = await asUser.auth.getUser();
      if (uerr || !user) return jsonR({ ok: false, error: 'unauthorized' }, 401);
      const { data: ruoli } = await sb.from('utente_ruolo')
        .select('ruolo:ruolo_id(nome, livello)').eq('utente_id', user.id);
      const livello = Math.max(0, ...(((ruoli ?? []) as Array<Record<string, any>>).map((r) => r?.ruolo?.livello ?? 0)));
      if (livello < 50) return jsonR({ ok: false, error: 'non_autorizzato' }, 403);

      const { data: soci, error: errSoci } = await sb.from('v_soci_in_regola')
        .select('domanda_id, nome, email, anno, numero_tessera, codice_tessera, stato, approvata_il, posizione, quota_dovuta, totale_incassato, manca, in_deroga, deroga_pagamento_motivo, ultimo_incasso_il, metodi_incasso, socio_storico')
        .eq('stato', 'approvata')
        .neq('posizione', 'account_di_sistema');
      // `Brenz Meister` e ogni altro account di servizio restano fuori: la
      // vista li riconosce dal numero di tessera 0, e non sono associati.
      if (errSoci) return jsonR({ ok: false, error: 'lettura', message: errSoci.message }, 500);

      // L'anagrafica sta sulla domanda, non nella vista. Si prende solo per le
      // persone che finiscono nel registro, e solo i campi che il registro
      // chiede: non si porta dietro tutto il resto per comodita'.
      const ids = (soci ?? []).map((s: Record<string, any>) => s.domanda_id);
      const { data: anag } = await sb.from('domande_tesseramento')
        .select(`id, data_nascita, comune_nascita, sesso, numero_socio, ${CAMPI_ANAGRAFICI.join(', ')}`).in('id', ids);
      const perId = new Map(((anag ?? []) as Array<Record<string, any>>).map((a) => [a.id, a]));

      const righe = ((soci ?? []) as Array<Record<string, any>>).map((s) => {
        const a = perId.get(s.domanda_id) ?? {};
        const unita = { ...s, ...a, domanda_id: s.domanda_id };
        return {
          ...unita,
          // Vuoto vuol dire attivo, per un socio ammesso: finche' non si
          // dichiara una cessazione, con la sua data e il suo motivo, il socio
          // e' dentro. La regola sta scritta qui e non presunta altrove.
          stato_socio: unita.stato_socio ?? 'attivo',
          anagrafica_completa: anagraficaCompleta(unita),
        };
      }).sort((x, y) => {
        // [4/8/2026] Per NUMERO DI SOCIO, non piu' per numero di tessera: e'
        // quello il progressivo del libro degli associati, ed e' l'ordine in
        // cui il registro cartaceo si legge dal 2009. Chi non ce l'ha ancora va
        // in fondo, non in testa con uno zero finto.
        const nx = x.numero_socio ?? Number.MAX_SAFE_INTEGER;
        const ny = y.numero_socio ?? Number.MAX_SAFE_INTEGER;
        if (nx !== ny) return nx - ny;
        return String(x.nome ?? '').localeCompare(String(y.nome ?? ''));
      });

      // I totali del denaro vengono da v_incassi, la stessa fonte del pannello.
      const { data: incassi } = await sb.from('v_incassi')
        .select('tipo, stato, importo, anno');
      const completati = ((incassi ?? []) as Array<Record<string, any>>).filter((i) => i.stato === 'completato');
      const sommaPerTipo: Record<string, number> = {};
      for (const i of completati) {
        sommaPerTipo[String(i.tipo)] = (sommaPerTipo[String(i.tipo)] ?? 0) + Number(i.importo ?? 0);
      }

      const conta = (p: string) => righe.filter((r) => r.posizione === p).length;
      // Gli attivi e i cessati sono due elenchi, non uno con una colonna in
      // piu': un libro degli associati che registra solo gli ingressi e'
      // incompleto per definizione, e chi e' uscito va letto tutto insieme.
      const attivi = righe.filter((r) => r.stato_socio !== 'cessato');
      const cessati = righe.filter((r) => r.stato_socio === 'cessato');

      const lacune = {
        senza_data_ammissione: righe.filter((r) => !r.approvata_il).length,
        senza_numero_tessera: righe.filter((r) => r.numero_tessera == null).length,
        senza_data_nascita: righe.filter((r) => !r.data_nascita).length,
        senza_comune_nascita: righe.filter((r) => !r.comune_nascita).length,
        senza_cognome: righe.filter((r) => vuoto(r.cognome)).length,
        senza_residenza: righe.filter((r) =>
          vuoto(r.residenza_via) || vuoto(r.residenza_civico) || vuoto(r.residenza_cap)
          || vuoto(r.residenza_comune) || vuoto(r.residenza_provincia)).length,
        senza_categoria: righe.filter((r) => vuoto(r.categoria_socio)).length,
        senza_codice_fiscale: righe.filter((r) => vuoto(r.codice_fiscale)).length,
        senza_numero_socio: righe.filter((r) => r.numero_socio == null).length,
        // Il numero che conta: quante schede non reggerebbero il confronto con
        // il registro cartaceo, campo per campo.
        schede_incomplete: righe.filter((r) => !r.anagrafica_completa).length,
        per_campo: contaMancanti(righe),
      };

      return jsonR({
        ok: true, tipo: 'libro-soci', anno: ANNO,
        quota: await quotaAnno(sb, ANNO, QUOTA_FALLBACK),
        estratto_il: new Date().toISOString(),
        estratto_da: user.email ?? '',
        righe,
        cessati,
        riepilogo: {
          iscritti: righe.length,
          attivi: attivi.length,
          cessati: cessati.length,
          complete: righe.filter((r) => r.anagrafica_completa).length,
          in_regola: conta('in_regola') + conta('in_regola_per_deroga'),
          parziale: conta('parziale'),
          da_regolarizzare: conta('da_regolarizzare'),
          ammesso_senza_incasso: conta('ammesso_senza_incasso'),
        },
        incassi: sommaPerTipo,
        gita_annullata: await gitaAnnullata(sb),
        lacune,
        // [4/8/2026] Chi vota in assemblea. Statuto 2014: «l'esercizio dei
        // diritti sociali spetta ai soci regolarmente iscritti e in regola con
        // il versamento della quota». L'elenco dice anche chi NON vota e
        // perche': uno che nasconde le esclusioni non regge una contestazione.
        voto: (await sb.rpc('aventi_diritto_voto', { p_anno: ANNO })).data ?? [],
      });
    }

    const jPaga = url.pathname.match(/\/json\/paga-quota\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
    // [4/8/2026] Il RINNOVO: come paga-quota, ma per un anno preciso. L'anno
    // sta nell'indirizzo E dentro lo scopo firmato, cosi' cambiarlo a mano
    // invalida il collegamento: nessuno puo' farsi comparire davanti la
    // quota di un anno diverso da quello per cui il collegamento e' stato
    // emesso.
    const jRinn = url.pathname.match(/\/json\/rinnovo\/(\d{4})\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
    const jSoll = url.pathname.match(/\/json\/sollecita\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
    const jVista = url.pathname.match(/\/json\/vista\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
    const jEmail = url.pathname.match(/\/json\/email-azione\/(approva|respingi)\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
    const jAz = url.pathname.match(/\/json\/azione\/(approva|respingi)\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);

    // [3/8/2026] Link di pagamento per una domanda GIA' INVIATA. Prima non
    // esisteva: per pagare bisognava tornare su /tesseramento e ricompilare, e
    // nasceva una seconda domanda per la stessa persona. Qui la domanda e'
    // quella, indicata dal token, e paypal-create-order la riconosce dal
    // domanda_id senza crearne un'altra.
    // IL RINNOVO NON E' UNA NUOVA ADESIONE. Chi e' gia' socio non ricompila la
    // domanda, non ridA' i dati anagrafici e non ripassa dal Consiglio: deve
    // solo versare la quota dell'anno nuovo. Il numero di tessera resta il suo
    // per sempre (decisione di Cristian, 4/8): cambia solo l'anno.
    if (jRinn && req.method === 'GET') {
      const [, annoS, id, e, tok] = jRinn;
      const anno = parseInt(annoS, 10);
      if (!(await verificaToken(secret, `rinnovo-${anno}`, id, parseInt(e, 10), tok))) return jsonR({ ok: false, error: 'token' });

      const { data: dom } = await sb.from('domande_tesseramento')
        .select('nome, cognome, email, stato, numero_tessera, stato_socio').eq('id', id).maybeSingle();
      if (!dom) return jsonR({ ok: false, error: 'not_found' });
      // Un socio cessato non rinnova: se ha cambiato idea, la sua posizione la
      // riapre il Consiglio, non un collegamento in una mail vecchia.
      if (dom.stato !== 'approvata' || dom.stato_socio === 'cessato') {
        return jsonR({ ok: false, error: 'non_rinnovabile' });
      }

      // La posizione per QUELL'anno, dalla funzione che sa distinguere gli
      // anni: la vista storica direbbe «in regola» per sempre.
      const { data: pos } = await sb.rpc('soci_al_anno', { p_anno: anno });
      const mia = ((pos ?? []) as Array<Record<string, any>>).find((r) => r.domanda_id === id);

      return jsonR({
        ok: true, tipo: 'rinnovo', domanda_id: id, anno,
        nome: dom.nome, cognome: dom.cognome, email: dom.email,
        numero_tessera: dom.numero_tessera,
        quota: mia ? Number(mia.quota_dovuta) : null,
        versato: mia ? Number(mia.versato) : 0,
        manca: mia ? Number(mia.manca) : null,
        gia_rinnovato: mia ? ['in_regola', 'in_regola_per_deroga'].includes(String(mia.posizione)) : false,
        posizione: mia?.posizione ?? null,
      });
    }

    if (jPaga && req.method === 'GET') {
      const [, id, e, tok] = jPaga;
      if (!(await verificaToken(secret, 'paga-quota', id, parseInt(e, 10), tok))) return jsonR({ ok: false, error: 'token' });
      const { data: dom } = await sb.from('domande_tesseramento')
        .select('nome, email, stato, numero_tessera').eq('id', id).maybeSingle();
      if (!dom) return jsonR({ ok: false, error: 'not_found' });
      const inc = await statoIncasso(sb, id, dom.email);
      return jsonR({
        ok: true, tipo: 'paga-quota', domanda_id: id,
        nome: dom.nome, email: dom.email, stato: dom.stato,
        numero_tessera: dom.numero_tessera, quota: await quotaAnno(sb, ANNO, QUOTA_FALLBACK), incassata: inc.incassata,
      });
    }

    // POST: sollecito del pagamento al richiedente. Lo lancia il segretario da
    // un bottone, una domanda alla volta: non e' una spedizione di massa e non
    // passa dalla coda email_outbox.
    if (jSoll && req.method === 'POST') {
      const [, id, e, tok] = jSoll;
      if (!(await verificaToken(secret, 'azione-approva', id, parseInt(e, 10), tok))) return jsonR({ ok: false, error: 'token' });
      const { data: dom } = await sb.from('domande_tesseramento')
        .select('nome, email, stato').eq('id', id).maybeSingle();
      if (!dom) return jsonR({ ok: false, error: 'not_found' });
      const inc = await statoIncasso(sb, id, dom.email);
      if (inc.incassata) return jsonR({ ok: false, error: 'gia_incassata', message: 'La quota per questa domanda risulta gia\' incassata: nessun sollecito inviato.' });
      const sharedSecret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
      if (!sharedSecret) return jsonR({ ok: false, error: 'config', message: 'SEND_EMAIL_SHARED_SECRET non configurato: sollecito non inviato.' });
      const expP = Date.now() + TOKEN_TTL_MS;
      const urlPaga = `https://elbrenz.eu/paga-quota/${id}/${expP}/${await firmaToken(secret, 'paga-quota', id, expP)}`;
      const html = sollecitoQuotaHtml({ nome: dom.nome, anno: ANNO, importo: await quotaAnno(sb, ANNO, QUOTA_FALLBACK), urlPagamento: urlPaga });
      try {
        const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': sharedSecret },
          body: JSON.stringify({ to: dom.email, subject: `La tua quota ${ANNO} in El Brenz: come completarla`, html, tags: [{ name: 'source', value: 'sollecito-quota' }] }),
        });
        if (!resp.ok) return jsonR({ ok: false, error: 'invio', message: 'Invio non riuscito, riprova fra poco.' });
      } catch {
        return jsonR({ ok: false, error: 'invio', message: 'Invio non riuscito, riprova fra poco.' });
      }
      return jsonR({ ok: true, azione: 'sollecita', message: `Sollecito inviato a ${dom.email}, con il collegamento per pagare la sua domanda.` });
    }

    // POST: esecuzione azione (stessa logica business dei rami HTML)
    if (jAz && req.method === 'POST') {
      const [, az, id, e, tok] = jAz;
      if (!(await verificaToken(secret, `azione-${az}`, id, parseInt(e, 10), tok))) return jsonR({ ok: false, error: 'token' });
      if (az === 'respingi') {
        let motivo = '';
        try { const b = await req.json(); motivo = String(b?.motivo ?? '').trim().slice(0, 500); } catch { /* no body */ }
        const { fatto } = await eseguiRespingi(sb, id, motivo);
        return jsonR({ ok: true, azione: 'respingi', fatto, message: fatto ? 'Domanda segnata come respinta. Nessuna comunicazione automatica al richiedente.' : 'La domanda non era più in attesa (già gestita).' });
      }
      let derogaMotivo = '';
      try { const b = await req.json(); derogaMotivo = String(b?.deroga_motivo ?? '').trim().slice(0, 1000); } catch { /* no body */ }
      const r = await eseguiApprova(sb, secret, id, derogaMotivo);
      if ('bloccato' in r) return jsonR({ ok: false, error: 'senza_incasso', message: r.bloccato });
      if ('errore' in r) return jsonR({ ok: false, error: 'config', message: r.errore });
      if (!r.ok) return jsonR({ ok: false, error: 'gia_gestito', stato: r.gia.stato, numero_tessera: r.gia.numero_tessera });
      const message = r.invio === 'inviata' ? `Tessera n. ${r.numero} assegnata e inviata a ${r.email}.${r.deroga ? ' Nella mail e\' spiegato che la quota va ancora versata, con tutte e tre le modalita\'.' : ''}`
        : r.invio === 'fallita' ? `Tessera n. ${r.numero} assegnata, ma l'invio email è fallito: riprovare o inviare a mano.`
        : `Tessera n. ${r.numero} assegnata. Invio email tessera disattivato (TESSERE_LIVE spento).`;
      return jsonR({ ok: true, azione: 'approva', stato: 'approvata', nome: r.nome, numero_tessera: r.numero, invio: r.invio, urlVerifica: r.urlVerifica, message });
    }

    // GET: peek scheda completa (scope 'vista') + token freschi per il POST
    if (jVista && req.method === 'GET') {
      const [, id, e, tok] = jVista;
      if (!(await verificaToken(secret, 'vista', id, parseInt(e, 10), tok))) return jsonR({ ok: false, error: 'token' });
      const { data: dom } = await sb.from('domande_tesseramento').select('*').eq('id', id).maybeSingle();
      if (!dom) return jsonR({ ok: false, error: 'not_found' });
      const inc = await statoIncasso(sb, id, dom.email);
      const expAz = Date.now() + TOKEN_TTL_MS;
      const postApprova = { id, exp: expAz, t: await firmaToken(secret, 'azione-approva', id, expAz) };
      const postRespingi = { id, exp: expAz, t: await firmaToken(secret, 'azione-respingi', id, expAz) };
      return jsonR({
        ok: true, tipo: 'vista',
        domanda: {
          nome: dom.nome, email: dom.email, stato: dom.stato, numero_tessera: dom.numero_tessera,
          data_nascita: dom.data_nascita, comune_nascita: dom.comune_nascita, sesso: dom.sesso,
          messaggio: dom.messaggio, created_at: dom.created_at, approvata_il: dom.approvata_il, approvata_da: dom.approvata_da,
          metodo_scelto: dom.metodo_scelto, deroga_pagamento_motivo: dom.deroga_pagamento_motivo,
        },
        // `incassata` la decide il SERVER con la stessa regola del trigger: la
        // pagina non deve dedurla contando righe, o prima o poi dedurra' male.
        incassata: inc.incassata,
        incassati: inc.incassati, tentativi: inc.tentativi, daAgganciare: inc.daAgganciare,
        quota: await quotaAnno(sb, ANNO, QUOTA_FALLBACK),
        // Stesso token dell'approvazione: chi puo' approvare puo' sollecitare,
        // e sollecitare e' l'azione meno impegnativa delle due.
        postSollecita: postApprova,
        tessereLive: Deno.env.get('TESSERE_LIVE') === 'true', postApprova, postRespingi,
      });
    }

    // GET: conferma da bottone email (scope 'email-approva'/'email-respingi')
    if (jEmail && req.method === 'GET') {
      const [, az, id, e, tok] = jEmail;
      if (!(await verificaToken(secret, `email-${az}`, id, parseInt(e, 10), tok))) return jsonR({ ok: false, error: 'token' });
      const { data: dom } = await sb.from('domande_tesseramento').select('nome, email, stato, numero_tessera, metodo_scelto').eq('id', id).maybeSingle();
      if (!dom) return jsonR({ ok: false, error: 'not_found' });
      if (dom.stato !== 'in_attesa') return jsonR({ ok: false, error: 'gia_gestito', stato: dom.stato, numero_tessera: dom.numero_tessera, nome: dom.nome });
      const expAz = Date.now() + TOKEN_TTL_MS;
      const post = { id, exp: expAz, t: await firmaToken(secret, `azione-${az}`, id, expAz) };
      // [3/8/2026] Questa e' la schermata che il 3 agosto ha emesso la tessera
      // 29 senza quota: prometteva «verranno assegnati numero di tessera e QR»
      // e del pagamento non diceva una parola. Ora l'incasso viaggia con la
      // conferma, e la pagina lo mette prima di qualunque bottone.
      const inc = az === 'approva' ? await statoIncasso(sb, id, dom.email) : null;
      return jsonR({
        ok: true, tipo: 'email-azione', azione: az, nome: dom.nome, post,
        ...(inc ? {
          incassata: inc.incassata, incassati: inc.incassati,
          tentativi: inc.tentativi, daAgganciare: inc.daAgganciare,
          metodo_scelto: dom.metodo_scelto, quota: await quotaAnno(sb, ANNO, QUOTA_FALLBACK),
          postSollecita: post,
        } : {}),
      });
    }

    return jsonR({ ok: false, error: 'bad_request' });
  }

  // Parametri sia nel PATH (nuovo, immune all'encoding quoted-printable delle
  // email: un `=` seguito da due cifre esadecimali viene corrotto) sia in
  // query string (retrocompatibile con i link già inviati).
  //   Path vista:  /scheda-domanda/vista/{d}/{exp}/{t}
  //   Path azione: /scheda-domanda/azione/{approva|respingi}/{d}/{exp}/{t}
  let d = url.searchParams.get('d') ?? '';
  let exp = parseInt(url.searchParams.get('exp') ?? '', 10);
  let t = url.searchParams.get('t') ?? '';
  let azione = url.searchParams.get('azione'); // per POST: approva | respingi
  const mAz = url.pathname.match(/\/azione\/(approva|respingi)\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
  const mVista = url.pathname.match(/\/vista\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
  // Azioni in un click dall'email (11/7): GET di CONFERMA con bottone,
  // token dedicati scope email-*, 7 giorni, monouso per stato.
  const mEmail = url.pathname.match(/\/email-azione\/(approva|respingi)\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f]+)\/?$/);
  let emailAzione: 'approva' | 'respingi' | null = null;
  if (mEmail) {
    emailAzione = mEmail[1] as 'approva' | 'respingi'; d = mEmail[2]; exp = parseInt(mEmail[3], 10); t = mEmail[4];
  } else if (mAz) {
    azione = mAz[1]; d = mAz[2]; exp = parseInt(mAz[3], 10); t = mAz[4];
  } else if (mVista) {
    d = mVista[1]; exp = parseInt(mVista[2], 10); t = mVista[3];
  }

  if (!/^[0-9a-f-]{36}$/.test(d)) return erroreHtml('Link non valido.');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ------------------------------------------------- GET: conferma da email
  if (emailAzione) {
    const okTok = await verificaToken(secret, `email-${emailAzione}`, d, exp, t);
    if (!okTok) return erroreHtml('Link non valido o scaduto (i bottoni email valgono 7 giorni). Usa la scheda completa dalla stessa email.');
    const { data: dom } = await supabase.from('domande_tesseramento')
      .select('nome, stato, numero_tessera').eq('id', d).maybeSingle();
    if (!dom) return erroreHtml('Domanda non trovata.');
    if (dom.stato !== 'in_attesa') {
      return pagina('Già gestita', `
        <p class="occhiello">El Brenz · Tesseramento</p>
        <h1>Nessuna azione necessaria</h1>
        <p>La domanda di <strong>${esc(dom.nome)}</strong> risulta già <span class="stato ${esc(dom.stato)}">${esc(dom.stato)}</span>${dom.numero_tessera ? ` con tessera n. <strong>${dom.numero_tessera}</strong>` : ''}.</p>`);
    }
    const expAz = Date.now() + TOKEN_TTL_MS;
    const tAz = await firmaToken(secret, `azione-${emailAzione}`, d, expAz);
    const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/scheda-domanda`;
    if (emailAzione === 'approva') {
      return pagina('Conferma approvazione', `
        <p class="occhiello">El Brenz · Tesseramento</p>
        <h1>Confermi l'approvazione di ${esc(dom.nome)}?</h1>
        <p>Verranno assegnati numero di tessera e QR, e partirà l'email con la tessera digitale.</p>
        <form method="post" action="${base}?d=${d}&exp=${expAz}&t=${tAz}&azione=approva">
          <button type="submit" class="btn btn-ok">Sì, approva e invia la tessera</button>
        </form>
        <p class="nota">Se non intendevi approvare, chiudi semplicemente questa pagina: non è successo nulla.</p>`);
    }
    return pagina('Conferma rifiuto', `
      <p class="occhiello">El Brenz · Tesseramento</p>
      <h1>Confermi il rifiuto della domanda di ${esc(dom.nome)}?</h1>
      <p>Nessuna email automatica verrà inviata al richiedente: il caso resta da gestire a mano.</p>
      <form method="post" action="${base}?d=${d}&exp=${expAz}&t=${tAz}&azione=respingi">
        <label style="display:block;font-size:13px;color:#666;margin-bottom:6px;">Motivo (facoltativo, resta interno)</label>
        <textarea name="motivo" rows="3" maxlength="500" style="width:100%;box-sizing:border-box;border:1px solid #E5DFCF;border-radius:4px;padding:10px;font-family:inherit;font-size:14px;"></textarea>
        <div style="margin-top:14px;">
          <button type="submit" class="btn btn-no">Sì, rifiuta la domanda</button>
        </div>
      </form>
      <p class="nota">Se non intendevi rifiutare, chiudi semplicemente questa pagina: non è successo nulla.</p>`);
  }

  // ---------------------------------------------------------------- POST: azioni
  if (req.method === 'POST' && (azione === 'approva' || azione === 'respingi')) {
    const okToken = await verificaToken(secret, `azione-${azione}`, d, exp, t);
    if (!okToken) return erroreHtml('Token azione non valido o scaduto.');

    if (azione === 'respingi') {
      let motivo = '';
      try {
        const fd = await req.formData();
        motivo = String(fd.get('motivo') ?? '').trim().slice(0, 500);
      } catch { /* form senza body: nessun motivo */ }
      const { fatto } = await eseguiRespingi(supabase, d, motivo);
      return pagina('Domanda respinta', `
        <p class="occhiello">El Brenz · Tesseramento</p>
        <h1>${fatto ? 'Domanda segnata come respinta' : 'Nessuna modifica'}</h1>
        <p>${fatto ? 'La domanda è stata respinta. Nessuna comunicazione automatica è stata inviata al richiedente.' : 'La domanda non era più in attesa (già approvata o respinta in precedenza).'}</p>`);
    }

    // --- APPROVA: idempotente, un solo numero, un solo invio (logica condivisa)
    const r = await eseguiApprova(supabase, secret, d);
    if ('errore' in r) return erroreHtml(r.errore);
    // [4/8/2026] Il ramo che mancava. `bloccato` non ha `errore` e non ha `ok`,
    // quindi finiva nel ramo sotto e cercava `r.gia.stato` su un oggetto senza
    // `gia`: la funzione cadeva. Non era teorico: i bottoni delle email di
    // luglio puntano qui e i token valgono trenta giorni, quindi bastava aprire
    // una vecchia mail e premere approva su una domanda senza quota per
    // ottenere una pagina rotta. Il dato era salvo perche' il trigger blocca
    // comunque, ma chi guardava vedeva un errore incomprensibile, ed e' lo
    // scenario in cui una persona ragionevole conclude che sia rotto il blocco
    // e prova ad aggirarlo.
    // Il messaggio del trigger si mostra com'e': e' scritto per essere letto.
    if ('bloccato' in r) {
      const expScheda = Date.now() + TOKEN_TTL_MS;
      const tScheda = await firmaToken(secret, 'vista', d, expScheda);
      return pagina('Approvazione bloccata', `
        <p class="occhiello">El Brenz · Tesseramento</p>
        <h1>Approvazione bloccata</h1>
        <p>${esc(r.bloccato)}</p>
        <p>Dalla scheda completa puoi <strong>sollecitare il pagamento</strong> oppure <strong>approvare in deroga</strong> spiegando il motivo, per esempio se la quota e' gia' stata raccolta in contanti.</p>
        <p><a href="https://elbrenz.eu/scheda-domanda/vista/${d}/${expScheda}/${tScheda}" style="color:#8a6215;font-weight:600;">Apri la scheda completa &rarr;</a></p>`);
    }
    if (!r.ok) {
      return pagina('Già gestita', `
        <p class="occhiello">El Brenz · Tesseramento</p>
        <h1>Nessuna modifica</h1>
        <p>La domanda risulta già <strong>${esc(r.gia.stato)}</strong>${r.gia.numero_tessera ? ` con tessera n. <strong>${r.gia.numero_tessera}</strong>` : ''}. Nessuna nuova tessera inviata, nessun numero bruciato.</p>`);
    }

    const esitoInvio = r.invio === 'inviata'
      ? `<p style="color:#2d8659;">✓ Tessera digitale inviata a <strong>${esc(r.email)}</strong>.</p>`
      : r.invio === 'fallita'
        ? `<p style="color:#a33;">⚠ Invio email tessera fallito: riprovare o inviare manualmente.</p>`
        : `<p class="nota">⚠ Invio email tessera DISATTIVATO (flag TESSERE_LIVE spento: Resend senza dominio autenticato). La tessera n. ${r.numero} è assegnata: inviala dopo l'attivazione.</p>`;
    const linkTessera = (r.invio === 'inviata' && r.urlVerifica)
      ? `<p><a href="${r.urlVerifica}" style="color:#2d8659;font-weight:600;">Vedi la tessera pubblica di ${esc(r.nome)} →</a></p>`
      : '';

    return pagina('Domanda approvata', `
      <p class="occhiello">El Brenz · Tesseramento</p>
      <h1>Domanda approvata ✓</h1>
      <p><strong>${esc(r.nome)}</strong> è socio ${ANNO} con tessera <strong>n. ${r.numero}</strong> (scadenza 31/12/${ANNO}).</p>
      ${esitoInvio}
      ${linkTessera}
      <p class="nota">Approvazione registrata: via email-link segretario, ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}. Ricordare la ratifica nel prossimo verbale del CD.</p>`);
  }

  // ---------------------------------------------------------------- GET: scheda
  const okVista = await verificaToken(secret, 'vista', d, exp, t);
  if (!okVista) return erroreHtml('Token non valido o scaduto (i link valgono 30 giorni).');

  const { data: dom } = await supabase.from('domande_tesseramento')
    .select('*').eq('id', d).maybeSingle();
  if (!dom) return erroreHtml('Domanda non trovata.');

  // [4/8/2026] Anche il ramo HTML passa da statoIncasso. Prima si calcolava i
  // pagamenti per conto suo filtrando `tipo` sul solo valore 'quota': per i
  // sedici soci che hanno versato l'integrazione da 10 euro, questa pagina
  // diceva che non risultava nessun pagamento mentre la scheda nuova diceva il
  // contrario. Due schermate, due verita' sulla stessa persona.
  // Una sola funzione, una sola verita': e' lo stesso principio per cui la
  // pagina e il trigger applicano la stessa regola.
  const inc = await statoIncasso(supabase, d, dom.email);
  const rigaPag = (p: Record<string, any>) => `<div class="${p.stato === 'completato' ? 'pag-ok' : 'pag-no'}" style="margin-bottom:8px;">
      ${p.stato === 'completato' ? '✓' : '⏳'} <strong>${esc(p.stato)}</strong> — ${esc(p.importo ?? '?')} € via ${p.metodo === 'paypal' ? 'PayPal/carta' : esc(p.metodo ?? 'non indicato')}${p.anomalia ? ' · <strong style="color:#a33">ANOMALIA da verificare</strong>' : ''}
      <span style="color:#999;font-size:12px;"> · ${new Date(p.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</span>
    </div>`;
  const pagHtml = inc.incassata
    ? inc.incassati.map(rigaPag).join('')
      + (inc.tentativi.length ? inc.tentativi.map(rigaPag).join('') : '')
    : `<div class="pag-no"><strong>Nessuna quota incassata.</strong> ${dom.metodo_scelto ? `Il richiedente ha scelto <strong>${esc(dom.metodo_scelto)}</strong>.` : 'Il richiedente non ha scelto nessun metodo.'}</div>`
      + (inc.tentativi.length ? inc.tentativi.map(rigaPag).join('') : '')
      + (inc.daAgganciare.length ? `<div class="pag-no" style="margin-top:8px;"><strong>Attenzione:</strong> risultano pagamenti completati con questa email ma non collegati a questa domanda.</div>` + inc.daAgganciare.map(rigaPag).join('') : '');

  const expAz = Date.now() + TOKEN_TTL_MS;
  const tApprova = await firmaToken(secret, 'azione-approva', d, expAz);
  const tRespingi = await firmaToken(secret, 'azione-respingi', d, expAz);
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/scheda-domanda`;

  const azioni = dom.stato === 'in_attesa'
    ? `<form method="post" action="${base}?d=${d}&exp=${expAz}&t=${tApprova}&azione=approva">
         <button type="submit" class="btn btn-ok">Approva e invia tessera</button>
       </form>
       <form method="post" action="${base}?d=${d}&exp=${expAz}&t=${tRespingi}&azione=respingi"
             onsubmit="return confirm('Segnare la domanda come respinta?');">
         <button type="submit" class="btn btn-no">Segna respinta</button>
       </form>
       ${Deno.env.get('TESSERE_LIVE') === 'true' ? '' : '<p class="nota">⚠ TESSERE_LIVE spento: approvando si assegna il numero ma l\'email tessera NON parte (Resend non autenticato).</p>'}`
    : `<p>Domanda già <span class="stato ${esc(dom.stato)}">${esc(dom.stato)}</span>${dom.numero_tessera ? ` — tessera n. <strong>${dom.numero_tessera}</strong>` : ''}${dom.approvata_il ? `<br/><span class="nota">il ${new Date(dom.approvata_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} (${esc(dom.approvata_da ?? '')})</span>` : ''}</p>`;

  return pagina(`Domanda — ${dom.nome}`, `
    <p class="occhiello">El Brenz · Tesseramento ${ANNO}</p>
    <h1>${esc(dom.nome)}</h1>
    <p><span class="stato ${esc(dom.stato)}">${esc(dom.stato)}</span></p>
    <table>
      <tr><td>Email</td><td><a href="mailto:${esc(dom.email)}">${esc(dom.email)}</a></td></tr>
      <tr><td>Data di nascita</td><td>${dom.data_nascita ? new Date(dom.data_nascita).toLocaleDateString('it-IT') : '—'}</td></tr>
      <tr><td>Comune di nascita</td><td>${esc(dom.comune_nascita ?? '—')}</td></tr>
      <tr><td>Sesso</td><td>${dom.sesso === 'M' ? 'Maschile' : dom.sesso === 'F' ? 'Femminile' : '—'}</td></tr>
      <tr><td>Messaggio</td><td>${esc(dom.messaggio ?? '—')}</td></tr>
      <tr><td>Domanda inviata</td><td>${new Date(dom.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</td></tr>
    </table>
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;border-bottom:2px solid #C8923E;padding-bottom:8px;">Pagamento quota (live)</h2>
    ${pagHtml}
    ${azioni}
    <p class="nota">Scheda riservata al Direttivo · link valido 30 giorni · non indicizzata.</p>`);
});
