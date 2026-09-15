// newsletter-gestione — la voce dell'Associazione: lista, campagne, invio.
//
// [4/8/2026] Perche' esiste. L'Associazione aveva trenta soci e nessun modo di
// rivolgersi a tutti insieme: ogni comunicazione era scritta a mano, una
// persona per volta. Con un comunicato stampa pronto e mai spedito, era il
// collo di bottiglia piu' stretto di tutto l'ecosistema.
//
// NON SPEDISCE DA SE'. Una campagna scrive una riga per destinatario in
// `email_outbox`, e il processore che gira ogni minuto fa il resto. Cosi' un
// invio a trenta persone che si interrompe a meta' riparte da dove era
// arrivato invece di rimandare tutto a tutti. Il registro `newsletter_invio`
// ha un vincolo unico su (campagna, indirizzo): e' quello che rende la ripresa
// possibile e il doppio invio impossibile.
//
// GIRO A VUOTO PER DIFETTO. Senza `esegui: true` una campagna dice chi
// riceverebbe e non scrive niente. Stessa sicura dei promemoria della quota, e
// per la stessa ragione: una campagna sbagliata non si richiama.
//
// LA PROVA A SE STESSI NON E' OPZIONALE. Finche' `provata_il` e' vuota,
// l'invio vero viene rifiutato. E' la regola che in questa casa ha gia'
// evitato dei guai.
//
// DUE BASI GIURIDICHE. Ai soci ci si rivolge in forza del rapporto
// associativo, a chi socio non e' solo con il consenso confermato in doppio
// opt-in. La distinzione vive in `v_newsletter_destinatari`, non qui.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaToken, verificaToken } from '../_shared/admin.ts';
import {
  linkConferma, linkDisiscrizione, footerDisiscrizione,
  segToEmail, CONFERMA_SCOPE, UNSUB_SCOPE,
} from '../_shared/newsletter.ts';

const SITE = 'https://elbrenz.eu';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// [15/9/2026, audit SIC-01] Il nome che una persona scrive nel modulo finisce
// dentro l'HTML della mail di conferma: si escapa, come fanno tutte le altre
// funzioni di questa casa.
const escHtml = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const TETTO_RESEND = 100;
const INDIRIZZO_PROVA = 'info@elbrenz.eu';

const ORIGINI_AMMESSE = [
  'https://elbrenz.eu', 'https://www.elbrenz.eu', 'https://elbrenz-app.netlify.app',
  'https://app.elbrenz.eu', 'https://community.elbrenz.eu', 'http://localhost:4321',
];

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINI_AMMESSE.includes(o) ? o : ORIGINI_AMMESSE[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const ip = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'ignoto';

Deno.serve(async (req: Request) => {
  const CORS = cors(req);
  const J = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 1), {
      status: s,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return J({ ok: false, error: 'metodo' }, 405);

  const url = new URL(req.url);
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const firmaSecret = Deno.env.get('ADMIN_ACTION_SECRET') ?? '';
  if (!firmaSecret) return J({ ok: false, error: 'configurazione', message: 'ADMIN_ACTION_SECRET mancante' }, 500);

  let corpo: Record<string, any> = {};
  try { corpo = await req.json(); } catch { /* alcuni rami non hanno corpo */ }

  // Gate amministrativo: DUE strade, con lo stesso livello di fiducia.
  //
  //  1. Sessione con ruolo >= 50, verificata lato server. E' la strada del
  //     pannello, ed e' quella che lascia scritto CHI ha fatto una cosa.
  //  2. Header `x-ingest-token`, il canale amministrativo gia' usato da
  //     tessera-invio e dai solleciti. Serve per i giri a vuoto da riga di
  //     comando e per un domani un lavoro pianificato: chi ha quel token ha
  //     gia' le chiavi di casa, quindi non e' un varco in piu'.
  //
  // Con il token non c'e' una persona a cui attribuire l'azione: si scrive un
  // identificativo nullo invece di inventarne uno, perche' un registro che
  // attribuisce a Tizio una cosa fatta da uno script e' peggio di un registro
  // che dice «non lo so».
  async function chiSei(): Promise<{ id: string | null; email: string } | null> {
    const atteso = Deno.env.get('INGEST_TOKEN');
    if (atteso && req.headers.get('x-ingest-token') === atteso) {
      return { id: null, email: 'canale-amministrativo' };
    }
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!bearer) return null;
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return null;
    const { data: ruoli } = await sb.from('utente_ruolo')
      .select('ruolo:ruolo_id(livello)').eq('utente_id', user.id);
    const liv = Math.max(0, ...(((ruoli ?? []) as Array<Record<string, any>>).map((r) => r?.ruolo?.livello ?? 0)));
    return liv >= 50 ? { id: user.id, email: user.email ?? '' } : null;
  }

  // =======================================================================
  // PUBBLICO: iscrizione (primo passo del doppio opt-in)
  // =======================================================================
  //
  // Non iscrive: mette in attesa e manda il collegamento di conferma. Finche'
  // quel collegamento non viene aperto, questa persona non riceve NIENTE
  // tranne la richiesta di conferma stessa.
  if (url.pathname.endsWith('/iscrizione')) {
    // [15/9/2026, audit SIC-01] Questo era l'unico modulo pubblico senza
    // nessuna porta: ogni POST faceva partire una mail da noreply@elbrenz.eu
    // verso un indirizzo a scelta di chi chiamava, quante volte voleva. Ora
    // ha lo stesso pacchetto degli altri moduli: origine del sito, esca e
    // tempo minimo (si risponde ok anche quando si scarta: a un automa non si
    // spiega come non farsi riconoscere), tetto per indirizzo IP e per
    // indirizzo email. Il tetto fallisce CHIUSO: qui in gioco c'e' la
    // reputazione del dominio, non una registrazione irripetibile.
    const origine = req.headers.get('origin') ?? '';
    if (!ORIGINI_AMMESSE.includes(origine)) return J({ ok: false, error: 'origine_non_consentita' }, 403);
    if (String(corpo?._honeypot ?? '').trim() !== '') return J({ ok: true, stato: 'in_attesa', ignorato: true });
    const aperto = Number(corpo?._ts ?? 0);
    if (aperto && Date.now() - aperto < 3000) return J({ ok: true, stato: 'in_attesa', ignorato: true });

    const email = String(corpo?.email ?? '').trim().toLowerCase();
    const nome = String(corpo?.nome ?? '').trim().slice(0, 120) || null;
    if (!EMAIL_RE.test(email)) return J({ ok: false, error: 'email_non_valida' }, 400);

    try {
      const [perIp, perEmail] = await Promise.all([
        sb.rpc('convenzioni_rl_hit', { p_ip_hash: await sha256Hex(`newsletter:ip:${ip(req)}`), p_max: 5 }),
        sb.rpc('convenzioni_rl_hit', { p_ip_hash: await sha256Hex(`newsletter:email:${email}`), p_max: 2 }),
      ]);
      if (perIp.error || perEmail.error) throw new Error(perIp.error?.message ?? perEmail.error?.message);
      if (perIp.data === false || perEmail.data === false) {
        return J({ ok: false, error: 'troppe_richieste', message: 'Troppe richieste in poco tempo. Riprova fra un\'ora.' }, 429);
      }
    } catch (e) {
      console.error('[newsletter] tetto non verificabile:', (e as Error)?.message);
      return J({ ok: false, error: 'tetto_non_verificabile', message: 'Non riusciamo a registrare la richiesta in questo momento. Riprova fra poco.' }, 503);
    }

    // Modalita' di collaudo: fa tutto tranne spedire, e restituisce il
    // collegamento firmato. Serve a provare il percorso senza mandare posta a
    // indirizzi finti, che rimbalzerebbero e sporcherebbero la reputazione del
    // dominio. Vuole il token amministrativo: non e' a disposizione del
    // pubblico.
    const provaSenzaInvio = corpo?.prova_senza_invio === true
      && req.headers.get('x-ingest-token') === (Deno.env.get('INGEST_TOKEN') ?? '\u0000');

    const { data: esistente } = await sb.from('newsletter_iscritto')
      .select('id, stato, updated_at, created_at').eq('email', email).maybeSingle();

    // Chi e' gia' confermato non riceve una seconda richiesta: sarebbe un
    // messaggio non richiesto travestito da cortesia.
    if (esistente?.stato === 'confermato') {
      return J({ ok: true, gia_iscritto: true, message: 'Questo indirizzo riceve gia le notizie dell Associazione.' });
    }

    // [15/9/2026, audit SIC-01] Chi e' in attesa da meno di un giorno ha gia'
    // la mail di conferma nella casella: non se ne manda un'altra (era la via
    // per riempire una casella altrui di richieste).
    const ultimo = Date.parse(String(esistente?.updated_at ?? esistente?.created_at ?? ''));
    if (esistente?.stato === 'in_attesa' && Number.isFinite(ultimo) && Date.now() - ultimo < 24 * 60 * 60 * 1000) {
      return J({ ok: true, stato: 'in_attesa', gia_in_attesa: true, message: 'Ti abbiamo gia scritto: controlla la casella (anche la posta indesiderata) e apri il collegamento di conferma.' });
    }

    let iscrittoId = esistente?.id ?? null;
    if (!iscrittoId) {
      const { data: creato, error } = await sb.from('newsletter_iscritto').insert({
        email, nome, stato: 'in_attesa',
        origine: String(corpo?.origine ?? 'modulo_sito').slice(0, 60),
      }).select('id').single();
      if (error) {
        console.error('[newsletter] iscrizione non scritta:', error.message);
        return J({ ok: false, error: 'iscrizione_fallita', message: 'Non siamo riusciti a registrare la richiesta. Riprova fra poco.' }, 500);
      }
      iscrittoId = creato.id;
    } else {
      // Chi si era disiscritto e torna: si riparte dall'attesa, mai
      // direttamente da confermato. Il consenso di prima e' stato revocato e
      // non torna in vita da solo.
      await sb.from('newsletter_iscritto').update({
        stato: 'in_attesa', nome: nome ?? undefined,
        disiscritto_il: null, disiscritto_ip: null, disiscritto_da_campagna: null,
        updated_at: new Date().toISOString(),
      }).eq('id', iscrittoId);
    }

    const link = await linkConferma(SITE, email, firmaSecret);
    const html = `<div style="font-family:Georgia,serif;color:#1E2E26;max-width:560px;margin:0 auto;">
  <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a6215;margin:0 0 6px;">Associazione El Brenz</p>
  <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:500;margin:0 0 14px;">Confermi l'iscrizione?</h1>
  <p style="margin:0 0 14px;line-height:1.6;">${nome ? `Gentile ${escHtml(nome)}, ` : ''}hai chiesto di ricevere le notizie dell'Associazione El Brenz delle Valli del Noce. Per completare l'iscrizione basta un clic.</p>
  <p style="margin:22px 0;"><a href="${link}" style="background:#C8923E;color:#1E2E26;padding:12px 26px;border-radius:4px;text-decoration:none;font-weight:600;">Sì, confermo l'iscrizione</a></p>
  <p style="font-size:13px;color:#6B6B6B;margin:0;line-height:1.6;">Se non sei stato tu, non devi fare niente: senza questa conferma non ti scriveremo. Il collegamento vale sette giorni.</p>
  <p style="font-size:12px;color:#8a8278;margin:20px 0 0;"><em>Ra&iacute;s fonde no le 'nglacia</em> &middot; <a href="${SITE}" style="color:#8b2a1e;">elbrenz.eu</a></p>
</div>`;

    // La riga in coda si scrive comunque, ma in `bozza` quando e' un
    // collaudo: la coda la ignora, e resta la traccia che il percorso e'
    // stato fatto.
    //
    // [4/8, trovato in collaudo] L'errore di questo inserimento NON si ignora.
    // Nella prima stesura non veniva guardato, e il vincolo su `origine` lo
    // faceva fallire: la funzione rispondeva «ti abbiamo scritto» a una
    // persona a cui non era partito niente, e quella restava in attesa per
    // sempre aspettando una mail che non esisteva. Un errore che mente e'
    // peggio di un errore che si vede.
    const { data: riga, error: errCoda } = await sb.from('email_outbox').insert({
      destinatario: email,
      oggetto: 'Confermi l\'iscrizione alle notizie di El Brenz?',
      html,
      stato: provaSenzaInvio ? 'bozza' : 'pronta',
      origine: 'newsletter-conferma',
      tags: [{ name: 'source', value: 'newsletter-optin' }],
    }).select('id').single();

    if (errCoda || !riga) {
      // Se la conferma non parte, l'iscrizione non esiste: si toglie la riga
      // in attesa, cosi' la persona puo' riprovare invece di restare bloccata
      // in uno stato da cui non uscirebbe mai.
      if (!esistente) await sb.from('newsletter_iscritto').delete().eq('id', iscrittoId);
      console.error('[newsletter] coda non scritta:', errCoda?.message);
      return J({
        ok: false, error: 'conferma_non_accodata',
        message: 'Non siamo riusciti a inviarti la mail di conferma. Riprova fra poco.',
      }, 500);
    }

    return J({
      ok: true, stato: 'in_attesa',
      message: 'Ti abbiamo scritto: apri il collegamento nella mail per completare l iscrizione.',
      // In modalita' di collaudo si restituiscono ENTRAMBI i collegamenti:
      // senza quello di disiscrizione non si potrebbe provare la revoca senza
      // spedire una campagna vera a qualcuno.
      ...(provaSenzaInvio
        ? {
          prova_senza_invio: true,
          link_conferma: link,
          link_disiscrizione: await linkDisiscrizione(SITE, email, firmaSecret),
          outbox_id: riga.id,
        }
        : {}),
    });
  }

  // =======================================================================
  // PUBBLICO: conferma (secondo passo) e disiscrizione
  // =======================================================================
  const mConf = url.pathname.match(/\/conferma\/([^/]+)\/(\d+)\/([0-9a-f]+)\/?$/);
  if (mConf) {
    const [, seg, expS, token] = mConf;
    let email = '';
    try { email = segToEmail(seg).toLowerCase(); } catch { return J({ ok: false, error: 'link' }, 400); }
    if (!(await verificaToken(firmaSecret, CONFERMA_SCOPE, email, Number(expS), token))) {
      return J({ ok: false, error: 'link_scaduto' }, 400);
    }
    const { data: r } = await sb.from('newsletter_iscritto')
      .select('id, stato, nome').ilike('email', email).maybeSingle();
    if (!r) return J({ ok: false, error: 'non_trovato' }, 404);
    if (r.stato === 'confermato') return J({ ok: true, gia: true, email, nome: r.nome });

    const adesso = new Date().toISOString();
    // Data e indirizzo IP: senza questi due un consenso e' un'affermazione
    // senza prova, e fra tre anni non si dimostra piu' niente.
    const { error } = await sb.from('newsletter_iscritto').update({
      stato: 'confermato', confermato_il: adesso, confermato_ip: ip(req), updated_at: adesso,
    }).eq('id', r.id);
    if (error) return J({ ok: false, error: 'conferma_fallita', message: error.message }, 500);
    return J({ ok: true, email, nome: r.nome, confermato_il: adesso });
  }

  const mDis = url.pathname.match(/\/disiscrizione\/([^/]+)\/(\d+)\/([0-9a-f]+)\/?$/);
  if (mDis) {
    const [, seg, expS, token] = mDis;
    let email = '';
    try { email = segToEmail(seg).toLowerCase(); } catch { return J({ ok: false, error: 'link' }, 400); }
    if (!(await verificaToken(firmaSecret, UNSUB_SCOPE, email, Number(expS), token))) {
      return J({ ok: false, error: 'link_scaduto' }, 400);
    }
    const adesso = new Date().toISOString();
    const campagna = /^[0-9a-f-]{36}$/i.test(String(corpo?.campagna_id ?? '')) ? corpo.campagna_id : null;

    // Ha effetto immediato e non chiede conferme: chiedere «sei sicuro?» a chi
    // ha gia' deciso di andarsene e' il modo piu' rapido per farsi ricordare
    // male. La riga NON si cancella: e' la prova che la revoca e' stata
    // rispettata.
    const { data: gia } = await sb.from('newsletter_iscritto')
      .select('id').ilike('email', email).maybeSingle();
    if (gia) {
      await sb.from('newsletter_iscritto').update({
        stato: 'disiscritto', disiscritto_il: adesso, disiscritto_ip: ip(req),
        disiscritto_da_campagna: campagna, updated_at: adesso,
      }).eq('id', gia.id);
    } else {
      // Chi si disiscrive senza essere in lista ci finisce comunque, da
      // disiscritto: e' l'unico modo per non riscriverlo alla prossima
      // importazione.
      await sb.from('newsletter_iscritto').insert({
        email, stato: 'disiscritto', origine: 'disiscrizione_diretta',
        disiscritto_il: adesso, disiscritto_ip: ip(req), disiscritto_da_campagna: campagna,
      });
    }

    // I flag storici restano la fonte per le vecchie edge: si spengono anche
    // quelli, altrimenti una disiscrizione varrebbe qui e non la'.
    await sb.from('download_lead').update({ consenso_newsletter: false }).ilike('email', email);
    await sb.from('guardiani_contributori')
      .update({ consenso_marketing: false, marketing_double_optin: false }).ilike('email', email);

    // Il registro dei consensi, per chi ha un utente: un consenso dato e uno
    // revocato devono essere ricostruibili a distanza di anni.
    const { data: u } = await sb.from('utente').select('id').ilike('email', email).maybeSingle();
    if (u?.id) {
      await sb.from('consenso').insert({
        utente_id: u.id, tipo: 'privacy', versione: 'newsletter-revoca',
        contesto: { azione: 'revoca_newsletter', email, campagna_id: campagna, ip: ip(req) },
      });
    }

    return J({ ok: true, email, disiscritto_il: adesso });
  }

  // =======================================================================
  // AMMINISTRATIVO
  // =======================================================================
  const io = await chiSei();
  if (!io) return J({ ok: false, error: 'non_autorizzato' }, 403);

  // --- il pannello: campagne, gruppi, residuo giornaliero ---
  // [4/8] `endsWith('/pannello')` acchiappava anche `/istituzionale/pannello`,
  // e il canale istituzionale si ritrovava i numeri della newsletter. Due
  // rotte che finiscono con la stessa parola non sono la stessa rotta.
  if (url.pathname.endsWith('/pannello') && !url.pathname.includes('/istituzionale/')) {
    const { data: campagne } = await sb.from('newsletter')
      .select('*').order('created_at', { ascending: false });
    const { data: gruppi } = await sb.from('v_newsletter_destinatari').select('gruppo, email');
    const conte: Record<string, number> = { tutti: 0, soci_tutti: 0, soci_in_regola: 0, non_soci: 0 };
    for (const g of (gruppi ?? []) as Array<Record<string, any>>) conte[g.gruppo] = (conte[g.gruppo] ?? 0) + 1;

    const { data: iscritti } = await sb.from('newsletter_iscritto').select('stato');
    const perStato: Record<string, number> = {};
    for (const i of (iscritti ?? []) as Array<Record<string, any>>) perStato[i.stato] = (perStato[i.stato] ?? 0) + 1;

    const { data: residuo } = await sb.rpc('email_residuo_giornaliero', { p_tetto: TETTO_RESEND });
    const { count: candidati } = await sb.from('v_newsletter_candidati_consenso')
      .select('email', { count: 'exact', head: true });

    return J({
      ok: true, io: io.id, indirizzo_prova: INDIRIZZO_PROVA,
      campagne: campagne ?? [], gruppi: conte, iscritti: perStato,
      residuo_giornaliero: residuo ?? 0, tetto: TETTO_RESEND,
      candidati_consenso: candidati ?? 0,
    });
  }

  // --- salvare una bozza ---
  if (url.pathname.endsWith('/campagna-salva')) {
    const oggetto = String(corpo?.oggetto ?? '').trim().slice(0, 300);
    const html = String(corpo?.corpo_html ?? '');
    const gruppo = String(corpo?.gruppo ?? 'tutti');
    if (oggetto.length < 3) return J({ ok: false, error: 'oggetto_corto' }, 400);
    if (html.trim().length < 10) return J({ ok: false, error: 'corpo_corto' }, 400);
    if (!['tutti', 'soci_tutti', 'soci_in_regola', 'non_soci'].includes(gruppo)) return J({ ok: false, error: 'gruppo' }, 400);

    const id = String(corpo?.id ?? '');
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      const { data: gia } = await sb.from('newsletter').select('stato').eq('id', id).maybeSingle();
      // Una campagna gia' inviata non si modifica: quello che e' partito e'
      // partito, e riscriverlo qui vorrebbe dire avere un archivio che non
      // corrisponde a cio' che la gente ha in casella.
      if (gia && gia.stato !== 'bozza') return J({ ok: false, error: 'non_modificabile', message: 'Questa campagna non e piu una bozza.' }, 409);
      const { error } = await sb.from('newsletter')
        .update({ oggetto, corpo_html: html, gruppo }).eq('id', id);
      if (error) return J({ ok: false, error: 'salvataggio', message: error.message }, 500);
      return J({ ok: true, id });
    }
    const { data: creata, error } = await sb.from('newsletter')
      .insert({ oggetto, corpo_html: html, gruppo, stato: 'bozza', creata_da: io.id })
      .select('id').single();
    if (error) return J({ ok: false, error: 'salvataggio', message: error.message }, 500);
    return J({ ok: true, id: creata.id });
  }

  // --- la prova a se stessi, che e' obbligatoria prima dell'invio ---
  if (url.pathname.endsWith('/campagna-prova')) {
    const id = String(corpo?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ ok: false, error: 'campagna' }, 400);
    const { data: c } = await sb.from('newsletter').select('*').eq('id', id).maybeSingle();
    if (!c) return J({ ok: false, error: 'campagna_inesistente' }, 404);

    const link = await linkDisiscrizione(SITE, INDIRIZZO_PROVA, firmaSecret);
    const { error } = await sb.from('email_outbox').insert({
      destinatario: INDIRIZZO_PROVA,
      oggetto: `[PROVA] ${c.oggetto}`,
      html: `<div style="background:#FDF9F0;border-left:4px solid #C8923E;padding:10px 14px;margin:0 0 18px;font-family:sans-serif;font-size:13px;color:#8a6215;">Questa e una PROVA della campagna, inviata solo a questo indirizzo. I destinatari veri non hanno ricevuto niente.</div>${c.corpo_html}${footerDisiscrizione(link)}`,
      stato: 'pronta',
      origine: 'newsletter-prova',
      tags: [{ name: 'source', value: 'newsletter-prova' }],
    });
    if (error) return J({ ok: false, error: 'prova_fallita', message: error.message }, 500);

    const adesso = new Date().toISOString();
    await sb.from('newsletter').update({ provata_il: adesso, provata_da: io.id }).eq('id', id);
    return J({ ok: true, provata_il: adesso, a: INDIRIZZO_PROVA });
  }

  // --- l'invio, che per difetto e' un giro a vuoto ---
  if (url.pathname.endsWith('/campagna-invia')) {
    const id = String(corpo?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ ok: false, error: 'campagna' }, 400);
    const esegui = corpo?.esegui === true;

    const { data: c } = await sb.from('newsletter').select('*').eq('id', id).maybeSingle();
    if (!c) return J({ ok: false, error: 'campagna_inesistente' }, 404);
    // Una campagna gia' inviata non si rimanda: si duplica in una bozza nuova.
    if (c.stato === 'inviata') return J({ ok: false, error: 'gia_inviata', message: 'Questa campagna e gia stata inviata. Per rimandarla, duplicala in una bozza nuova.' }, 409);
    if (c.stato === 'annullata') return J({ ok: false, error: 'annullata' }, 409);

    const gruppo = c.gruppo ?? 'tutti';
    const { data: dest } = await sb.from('v_newsletter_destinatari')
      .select('email, nome').eq('gruppo', gruppo);
    const destinatari = (dest ?? []) as Array<Record<string, any>>;

    // Chi ha gia' ricevuto QUESTA campagna non la riceve due volte. E' il
    // motivo per cui un invio interrotto puo' ripartire senza danni.
    const { data: gia } = await sb.from('newsletter_invio')
      .select('email').eq('campagna_id', id);
    const serviti = new Set(((gia ?? []) as Array<Record<string, any>>).map((r) => String(r.email).toLowerCase()));
    const daFare = destinatari.filter((d) => !serviti.has(String(d.email).toLowerCase()));

    const { data: residuo } = await sb.rpc('email_residuo_giornaliero', { p_tetto: TETTO_RESEND });
    const spazio = Number(residuo ?? 0);
    const sfora = daFare.length > spazio;

    if (!esegui) {
      return J({
        ok: true, giro_a_vuoto: true,
        message: 'Nessuna email accodata, nessuna riga scritta. Ripeti con esegui per spedire davvero.',
        campagna: { id, oggetto: c.oggetto, gruppo, stato: c.stato, provata_il: c.provata_il },
        quanti: daFare.length,
        gia_serviti: serviti.size,
        destinatari: daFare.map((d) => ({ email: d.email, nome: d.nome })),
        residuo_giornaliero: spazio, tetto: TETTO_RESEND,
        // Si dice PRIMA di partire, non a meta' strada: meta' dei soci
        // informati e meta' no e' il risultato peggiore possibile, perche'
        // nessuno sa quale meta' e'.
        supera_il_tetto: sfora,
        avviso_tetto: sfora
          ? `I destinatari sono ${daFare.length} ma oggi restano ${spazio} invii. Partendo ora ne resterebbero fuori ${daFare.length - spazio}: conviene spalmare su piu giorni, oppure rilanciare domani e riprendera da dove si e fermata.`
          : null,
        pronta_a_partire: Boolean(c.provata_il) && daFare.length > 0 && !sfora,
        // La prova non e' un consiglio: senza, l'invio viene rifiutato.
        blocco: !c.provata_il ? 'Serve prima una prova su un indirizzo dell Associazione.' : null,
      });
    }

    if (!c.provata_il) {
      return J({ ok: false, error: 'mai_provata', message: 'Prima di inviare, manda una prova a un indirizzo dell Associazione.' }, 400);
    }
    if (daFare.length === 0) return J({ ok: false, error: 'nessun_destinatario' }, 400);

    await sb.from('newsletter').update({
      stato: 'in_invio', invio_iniziato_il: c.invio_iniziato_il ?? new Date().toISOString(),
      gruppo, destinatari_count: destinatari.length,
      destinatari_filtro: { gruppo, risolto_il: new Date().toISOString(), quanti: destinatari.length },
    }).eq('id', id);

    let accodati = 0; let saltati = 0;
    for (const d of daFare.slice(0, spazio)) {
      const email = String(d.email).toLowerCase();
      // IL REGISTRO PRIMA. Se questa riga non si scrive, l'email non parte:
      // meglio una comunicazione in ritardo che due nella stessa casella.
      const { data: reg, error: errReg } = await sb.from('newsletter_invio')
        .insert({ campagna_id: id, email }).select('id').single();
      if (errReg || !reg) { saltati++; continue; }

      const link = await linkDisiscrizione(SITE, email, firmaSecret);
      const { data: out, error: errOut } = await sb.from('email_outbox').insert({
        destinatario: email,
        oggetto: c.oggetto,
        html: `${c.corpo_html}${footerDisiscrizione(link)}`,
        stato: 'pronta',
        origine: 'newsletter-campagna',
        tags: [{ name: 'source', value: 'newsletter' }, { name: 'campagna', value: id }],
      }).select('id').single();
      if (errOut || !out) {
        // Se la coda non accetta, si toglie la riga di registro: altrimenti
        // quella persona risulterebbe servita senza aver ricevuto niente, e
        // nessun rilancio la recupererebbe.
        await sb.from('newsletter_invio').delete().eq('id', reg.id);
        saltati++; continue;
      }
      await sb.from('newsletter_invio').update({ outbox_id: out.id }).eq('id', reg.id);
      accodati++;
    }

    const restano = daFare.length - accodati - saltati;
    const finita = restano <= 0 && saltati === 0;
    await sb.from('newsletter').update({
      stato: finita ? 'inviata' : 'in_invio',
      inviata: finita,
      inviata_at: finita ? new Date().toISOString() : null,
      invio_finito_il: finita ? new Date().toISOString() : null,
      inviata_da: io.id,
      consegnati: (c.consegnati ?? 0) + accodati,
    }).eq('id', id);

    return J({
      ok: true, eseguito: true, accodati, saltati, restano,
      stato: finita ? 'inviata' : 'in_invio',
      message: finita
        ? 'Tutti i destinatari sono in coda. Il processore spedisce entro pochi minuti.'
        : `Accodati ${accodati}. Ne restano ${restano}: rilancia domani e riprendera da dove si e fermata.`,
    });
  }

  // =======================================================================
  // IL CANALE ISTITUZIONALE
  // =======================================================================
  //
  // Un binario diverso, non una casella in piu' sullo stesso. Statuto 2014: la
  // convocazione deve pervenire per iscritto AI SOCI almeno quindici giorni
  // prima. Ai soci tutti: chi non e' in regola perde il diritto di VOTO, non
  // quello di essere CONVOCATO.
  //
  // NIENTE DISISCRIZIONE, ed e' la ragione per cui esiste questo canale. Se la
  // convocazione viaggiasse sulla newsletter porterebbe con se' il collegamento
  // di disiscrizione, e un socio che un giorno clicca «non voglio piu'
  // ricevere» smetterebbe di ricevere anche le convocazioni: un'assemblea a cui
  // un socio non e' stato convocato e' impugnabile. Sarebbe uno strumento per
  // autoescludersi dalla vita associativa con un clic, senza capirlo.

  // Il piede di pagina che sostituisce la disiscrizione: dice PERCHE' non c'e'.
  // Chi riceve deve capire che non e' una svista ne' una furbizia.
  const piedeIstituzionale = `<p style="margin:26px 0 0;padding-top:14px;border-top:1px solid #e7e0cf;color:#8a8278;font-size:11.5px;line-height:1.6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">Ricevi questo messaggio perche&#39; sei socio dell&#39;Associazione El Brenz delle Valli del Noce. Le comunicazioni dell&#39;Associazione, come le convocazioni di assemblea, sono dovute per statuto e non si possono disattivare. Le notizie e gli articoli sono un&#39;altra cosa: da quelli puoi toglierti quando vuoi.</p>`;

  // I destinatari, raggruppati per indirizzo ma tenendo i SOCI. E' la
  // differenza che rende dimostrabile una convocazione: si prova che quel socio
  // e' stato convocato, non che quella casella e' stata raggiunta.
  async function destinatariIstituzionali() {
    const { data } = await sb.from('v_associati_per_indirizzo')
      .select('email, domande, numeri_socio, nomi, quanti_soci');
    return (data ?? []) as Array<Record<string, any>>;
  }

  // «Cara Nadia, caro Diego»: alla casella condivisa arriva UN messaggio che
  // nomina ENTRAMBI, altrimenti l'altra persona formalmente non e' stata
  // convocata. I nomi sono di battesimo: e' una lettera, non un atto notarile.
  function intestazione(nomi: string[]): string {
    const battesimo = nomi.map((n) => String(n).trim().split(/\s+/)[0]).filter(Boolean);
    if (battesimo.length === 0) return 'Care socie, cari soci,';
    if (battesimo.length === 1) return `Ciao ${battesimo[0]},`;
    return `Ciao ${battesimo.slice(0, -1).join(', ')} e ${battesimo[battesimo.length - 1]},`;
  }

  if (url.pathname.endsWith('/istituzionale/pannello')) {
    const { data: com } = await sb.from('comunicazione_istituzionale')
      .select('*').order('creata_il', { ascending: false });
    const dest = await destinatariIstituzionali();
    const persone = dest.reduce((t, d) => t + Number(d.quanti_soci ?? 0), 0);
    const { data: residuo } = await sb.rpc('email_residuo_giornaliero', { p_tetto: TETTO_RESEND });
    return J({
      ok: true, indirizzo_prova: INDIRIZZO_PROVA,
      comunicazioni: com ?? [],
      persone, indirizzi: dest.length,
      caselle_condivise: dest.filter((d) => Number(d.quanti_soci) > 1)
        .map((d) => ({ email: d.email, nomi: d.nomi })),
      residuo_giornaliero: residuo ?? 0, tetto: TETTO_RESEND,
    });
  }

  if (url.pathname.endsWith('/istituzionale/salva')) {
    const oggetto = String(corpo?.oggetto ?? '').trim().slice(0, 300);
    const html = String(corpo?.corpo_html ?? '');
    const tipo = String(corpo?.tipo ?? 'comunicazione');
    const assemblea = String(corpo?.assemblea_il ?? '').trim();
    if (oggetto.length < 3) return J({ ok: false, error: 'oggetto_corto' }, 400);
    if (html.trim().length < 10) return J({ ok: false, error: 'corpo_corto' }, 400);
    if (!['convocazione_assemblea', 'quota', 'tessera', 'rendiconto', 'comunicazione'].includes(tipo)) {
      return J({ ok: false, error: 'tipo_non_valido' }, 400);
    }
    // Una convocazione senza la data dell'assemblea non permette di calcolare i
    // quindici giorni, che e' proprio il conto che nessuno fa a mente.
    if (tipo === 'convocazione_assemblea' && !/^\d{4}-\d{2}-\d{2}$/.test(assemblea)) {
      return J({ ok: false, error: 'data_assemblea_mancante', message: 'Per una convocazione serve la data dell assemblea: da li si contano i quindici giorni.' }, 400);
    }

    const id = String(corpo?.id ?? '');
    const campi = {
      oggetto, corpo_html: html, tipo,
      assemblea_il: /^\d{4}-\d{2}-\d{2}$/.test(assemblea) ? assemblea : null,
    };
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      const { data: gia } = await sb.from('comunicazione_istituzionale').select('stato').eq('id', id).maybeSingle();
      if (gia && gia.stato !== 'bozza') return J({ ok: false, error: 'non_modificabile' }, 409);
      const { error } = await sb.from('comunicazione_istituzionale').update(campi).eq('id', id);
      if (error) return J({ ok: false, error: 'salvataggio', message: error.message }, 500);
      return J({ ok: true, id });
    }
    const { data: creata, error } = await sb.from('comunicazione_istituzionale')
      .insert({ ...campi, creata_da: io.id }).select('id').single();
    if (error) return J({ ok: false, error: 'salvataggio', message: error.message }, 500);
    return J({ ok: true, id: creata.id });
  }

  if (url.pathname.endsWith('/istituzionale/prova')) {
    const id = String(corpo?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ ok: false, error: 'comunicazione' }, 400);
    const { data: c } = await sb.from('comunicazione_istituzionale').select('*').eq('id', id).maybeSingle();
    if (!c) return J({ ok: false, error: 'inesistente' }, 404);
    const { error } = await sb.from('email_outbox').insert({
      destinatario: INDIRIZZO_PROVA,
      oggetto: `[PROVA] ${c.oggetto}`,
      html: `<div style="background:#FDF9F0;border-left:4px solid #C8923E;padding:10px 14px;margin:0 0 18px;font-family:sans-serif;font-size:13px;color:#8a6215;">PROVA della comunicazione istituzionale. I soci non hanno ricevuto niente.</div>${intestazione(['Nome Esempio', 'Altro Esempio'])}${c.corpo_html}${piedeIstituzionale}`,
      stato: 'pronta', origine: 'istituzionale-prova',
      tags: [{ name: 'source', value: 'istituzionale-prova' }],
    });
    if (error) return J({ ok: false, error: 'prova_fallita', message: error.message }, 500);
    const adesso = new Date().toISOString();
    await sb.from('comunicazione_istituzionale').update({ provata_il: adesso, provata_da: io.id }).eq('id', id);
    return J({ ok: true, provata_il: adesso, a: INDIRIZZO_PROVA });
  }

  if (url.pathname.endsWith('/istituzionale/invia')) {
    const id = String(corpo?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ ok: false, error: 'comunicazione' }, 400);
    const esegui = corpo?.esegui === true;
    const { data: c } = await sb.from('comunicazione_istituzionale').select('*').eq('id', id).maybeSingle();
    if (!c) return J({ ok: false, error: 'inesistente' }, 404);
    if (c.stato === 'inviata') return J({ ok: false, error: 'gia_inviata' }, 409);

    const dest = await destinatariIstituzionali();
    const { data: gia } = await sb.from('comunicazione_destinatario')
      .select('domanda_id').eq('comunicazione_id', id);
    const serviti = new Set(((gia ?? []) as Array<Record<string, any>>).map((r) => String(r.domanda_id)));
    const daFare = dest.filter((d) => (d.domande as string[]).some((x) => !serviti.has(String(x))));

    const { data: residuo } = await sb.rpc('email_residuo_giornaliero', { p_tetto: TETTO_RESEND });
    const spazio = Number(residuo ?? 0);
    const persone = daFare.reduce((t, d) => t + Number(d.quanti_soci ?? 0), 0);

    // I QUINDICI GIORNI si contano dall'ULTIMO che riceve, non dal primo. Oggi
    // trenta invii stanno in una giornata, ma la data si mostra comunque:
    // e' il conto che nessuno fa a mente e che invalida un'assemblea.
    const { data: entro } = c.assemblea_il
      ? await sb.rpc('invio_da_concludere_entro', { p_assemblea: c.assemblea_il })
      : { data: null };

    if (!esegui) {
      return J({
        ok: true, giro_a_vuoto: true,
        message: 'Nessuna email accodata, nessuna riga scritta.',
        comunicazione: { id, oggetto: c.oggetto, tipo: c.tipo, stato: c.stato, provata_il: c.provata_il, assemblea_il: c.assemblea_il },
        persone, indirizzi: daFare.length,
        gia_serviti: serviti.size,
        destinatari: daFare.map((d) => ({ email: d.email, nomi: d.nomi, numeri_socio: d.numeri_socio })),
        residuo_giornaliero: spazio, tetto: TETTO_RESEND,
        supera_il_tetto: daFare.length > spazio,
        invio_da_concludere_entro: entro ?? null,
        quindici_giorni: c.assemblea_il
          ? `L invio deve essere CONCLUSO entro il ${entro}: i quindici giorni dello statuto si contano dall ultimo socio che riceve, non dal primo.`
          : null,
        pronta_a_partire: Boolean(c.provata_il) && daFare.length > 0,
        blocco: !c.provata_il ? 'Serve prima una prova su un indirizzo dell Associazione.' : null,
        // Si dice a chiare lettere, perche' chi manda deve saperlo.
        senza_disiscrizione: true,
      });
    }

    if (!c.provata_il) return J({ ok: false, error: 'mai_provata' }, 400);
    if (daFare.length === 0) return J({ ok: false, error: 'nessun_destinatario' }, 400);

    await sb.from('comunicazione_istituzionale').update({
      stato: 'in_invio', invio_iniziato_il: c.invio_iniziato_il ?? new Date().toISOString(),
      destinatari_count: persone,
    }).eq('id', id);

    let accodati = 0; let saltati = 0;
    for (const d of daFare.slice(0, spazio)) {
      const nomi = (d.nomi as string[]) ?? [];
      // Il corpo ESATTO che riceve questa casella, gia' personalizzato: e'
      // quello che finisce nel registro, non un riferimento a un modello che
      // domani potrebbe essere cambiato.
      const corpoInviato = `<p style="margin:0 0 14px;">${intestazione(nomi)}</p>${c.corpo_html}${piedeIstituzionale}`;

      const { data: out, error: errOut } = await sb.from('email_outbox').insert({
        destinatario: d.email, oggetto: c.oggetto, html: corpoInviato,
        stato: 'pronta', origine: 'istituzionale',
        tags: [{ name: 'source', value: 'istituzionale' }, { name: 'comunicazione', value: id }],
      }).select('id').single();
      if (errOut || !out) { saltati++; continue; }

      // UNA RIGA PER SOCIO, non per indirizzo: alla casella condivisa
      // corrispondono due soci convocati, e sono due righe.
      const domande = (d.domande as string[]) ?? [];
      const numeri = (d.numeri_socio as (number | null)[]) ?? [];
      for (let i = 0; i < domande.length; i++) {
        await sb.from('comunicazione_destinatario').insert({
          comunicazione_id: id, domanda_id: domande[i],
          numero_socio: numeri[i] ?? null, nome: nomi[i] ?? null,
          email: d.email, corpo_inviato: corpoInviato, outbox_id: out.id,
          esito: 'accodata',
        });
      }
      accodati++;
    }

    const restano = daFare.length - accodati - saltati;
    const finita = restano <= 0 && saltati === 0;
    await sb.from('comunicazione_istituzionale').update({
      stato: finita ? 'inviata' : 'in_invio',
      invio_finito_il: finita ? new Date().toISOString() : null,
    }).eq('id', id);

    return J({ ok: true, eseguito: true, accodati, saltati, restano, stato: finita ? 'inviata' : 'in_invio' });
  }

  // --- la richiesta di consenso ai contatti storici, una volta sola ---
  //
  // E' il punto piu' delicato di tutto il lavoro. Nessuno di questi indirizzi
  // ha mai dato un consenso alla newsletter, perche' il consenso non esisteva
  // come campo. Non si importano e non si iscrivono d'ufficio: si chiede.
  // Una richiesta fatta bene da' una lista pulita per dieci anni, fatta male
  // e' una segnalazione al Garante.
  if (url.pathname.endsWith('/richiesta-consenso')) {
    const esegui = corpo?.esegui === true;
    const { data: cand } = await sb.from('v_newsletter_candidati_consenso')
      .select('email, nome, fonti, e_socio, da_download');
    const candidati = (cand ?? []) as Array<Record<string, any>>;
    const { data: residuo } = await sb.rpc('email_residuo_giornaliero', { p_tetto: TETTO_RESEND });
    const spazio = Number(residuo ?? 0);

    // DUE TESTI, non uno. Ai soci non stiamo chiedendo il permesso di
    // scrivere: quello c'e' gia' ed e' il rapporto associativo. Stiamo
    // chiedendo se vogliono ANCHE le notizie. Mandare a un socio di sedici anni
    // un messaggio che gli chiede se accetta di essere contattato e' il modo
    // migliore per fargli pensare che non lo conosciamo.
    const soci = candidati.filter((c) => c.e_socio);
    const nonSoci = candidati.filter((c) => !c.e_socio);

    // La provenienza dichiarata dev'essere VERA per ognuno. Chi non viene dai
    // materiali scaricati non riceve il testo che dice «hai scaricato un
    // materiale»: resta fuori e lo si segnala, perche' gli si risponde da
    // persona. Dichiarare male la provenienza di un indirizzo e' proprio il
    // problema che questa mail dovrebbe risolvere.
    const nonSociDaDownload = nonSoci.filter((c) => c.da_download);
    const nonSociAltri = nonSoci.filter((c) => !c.da_download);

    const primoNome = (n: unknown) => String(n ?? '').trim().split(/\s+/)[0] || 'socia, caro socio';

    if (!esegui) {
      return J({
        ok: true, giro_a_vuoto: true,
        message: 'Nessuna email accodata. I testi li scrive la chat, l invio lo autorizza Cristian.',
        quanti: soci.length + nonSociDaDownload.length,
        testo_a_soci: soci.length,
        testo_b_non_soci: nonSociDaDownload.length,
        // Chi va escluso dall'invio automatico, con il suo riferimento: a
        // queste persone si risponde a mano.
        esclusi_da_scrivere_a_mano: nonSociAltri.map((c) => ({ email: c.email, nome: c.nome, fonti: c.fonti })),
        residuo_giornaliero: spazio,
        supera_il_tetto: (soci.length + nonSociDaDownload.length) > spazio,
        destinatari_a: soci.map((c) => ({ email: c.email, nome: c.nome })),
        destinatari_b: nonSociDaDownload.map((c) => ({ email: c.email, nome: c.nome, fonti: c.fonti })),
        testi_pronti: {
          a: typeof corpo?.corpo_soci === 'string' && corpo.corpo_soci.trim().length > 40,
          b: typeof corpo?.corpo_non_soci === 'string' && corpo.corpo_non_soci.trim().length > 40,
        },
      });
    }

    const corpoA = String(corpo?.corpo_soci ?? '');
    const corpoB = String(corpo?.corpo_non_soci ?? '');
    const oggettoA = String(corpo?.oggetto_soci ?? '').trim();
    const oggettoB = String(corpo?.oggetto_non_soci ?? '').trim();
    if (corpoA.trim().length < 40 || oggettoA.length < 3 || corpoB.trim().length < 40 || oggettoB.length < 3) {
      return J({ ok: false, error: 'testi_mancanti', message: 'Servono ENTRAMBI i testi approvati, con i rispettivi oggetti.' }, 400);
    }

    let accodati = 0;
    // UN SOLO INVIO, NESSUN SOLLECITO: una richiesta di consenso che si ripete
    // non e' una richiesta, e' una pressione.
    for (const gruppo of [
      { lista: soci.slice(0, spazio), html: corpoA, oggetto: oggettoA },
      { lista: nonSociDaDownload, html: corpoB, oggetto: oggettoB },
    ]) {
      for (const c of gruppo.lista) {
        if (accodati >= spazio) break;
        const email = String(c.email).toLowerCase();
        const { data: gia } = await sb.from('newsletter_iscritto')
          .select('id').ilike('email', email).maybeSingle();
        if (gia) continue;
        const { data: creato } = await sb.from('newsletter_iscritto').insert({
          email, nome: c.nome, stato: 'in_attesa', origine: 'richiesta_consenso_storici',
          note: `Indirizzo gia noto: ${(c.fonti ?? []).join('; ')}`,
        }).select('id').single();
        if (!creato) continue;
        const link = await linkConferma(SITE, email, firmaSecret);
        const html = gruppo.html
          .replaceAll('{{LINK_CONFERMA}}', link)
          .replaceAll('{{NOME}}', primoNome(c.nome));
        const { error: errCoda } = await sb.from('email_outbox').insert({
          destinatario: email, oggetto: gruppo.oggetto, html,
          stato: 'pronta', origine: 'newsletter-richiesta-consenso',
          tags: [{ name: 'source', value: 'newsletter-richiesta-consenso' }],
        });
        if (errCoda) { await sb.from('newsletter_iscritto').delete().eq('id', creato.id); continue; }
        accodati++;
      }
    }
    return J({
      ok: true, eseguito: true, accodati,
      esclusi_da_scrivere_a_mano: nonSociAltri.map((c) => c.email),
    });
  }

  return J({ ok: false, error: 'rotta_sconosciuta' }, 404);
});
