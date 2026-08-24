import { createClient } from '@supabase/supabase-js';

/**
 * postiGita — lettura SERVER-SIDE dei posti della gita.
 *
 * Fonte UNICA: la vista pubblica aggregata `v_posti_gita`, la STESSA che
 * alimenta la barra countdown in home (client) e la card nella PWA soci. La
 * logica "54 posti meno le iscrizioni confermate" vive dentro la vista, non
 * qui: così non c'è duplicazione e il numero è sempre coerente ovunque.
 *
 * Fail-safe: ritorna `null` se la query fallisce o la config manca, così le
 * pagine SSR possono rendere una descrizione generica senza MAI andare in 500.
 */

const SB_URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SB_ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

export type PostiGita = { totali: number; occupati: number; disponibili: number };

export async function getPostiGita(
  slug = 'gita-giochi-medievali-2026',
): Promise<PostiGita | null> {
  try {
    if (!SB_URL || !SB_ANON) return null;
    const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('v_posti_gita')
      .select('evento_slug,posti_totali,posti_occupati');
    if (error || !Array.isArray(data) || data.length === 0) return null;
    // La vista ha (di norma) una sola riga per la gita; se ne avesse più di una,
    // si prende quella dello slug richiesto, con fallback alla prima.
    const row = data.find((r: any) => r.evento_slug === slug) ?? data[0];
    const totali = Number(row.posti_totali);
    const occupati = Number(row.posti_occupati);
    if (!Number.isFinite(totali)) return null;
    const occ = Number.isFinite(occupati) ? Math.min(occupati, totali) : 0;
    return { totali, occupati: occ, disponibili: Math.max(totali - occ, 0) };
  } catch {
    return null;
  }
}

/**
 * AGGIUNTA 3/8/2026 — stato della gita da `config_app`.
 *
 * Una sola funzione per tutte le superfici del sito (landing, modulo, home,
 * /eventi), cosi' non puo' succedere che una pagina creda la gita viva e
 * un'altra la sappia annullata. Stessa chiave che consulta l'edge
 * gita-crea-ordine prima di creare un ordine PayPal.
 *
 * Fail-CLOSED: se la lettura non riesce si risponde "annullata". Fra mostrare
 * un invito a pagare per un viaggio che non si fa e nascondere per errore un
 * invito legittimo, il danno recuperabile e' il secondo.
 */
export async function getStatoGita(
  slug = 'gita_giochi_medievali_2026_stato',
): Promise<{ annullata: boolean; letturaRiuscita: boolean }> {
  try {
    if (!SB_URL || !SB_ANON) return { annullata: true, letturaRiuscita: false };
    const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('config_app').select('valore').eq('chiave', slug).maybeSingle();
    if (error) return { annullata: true, letturaRiuscita: false };
    const stato = (data?.valore as Record<string, unknown> | undefined)?.stato;
    // Nessuna riga NON e' una lettura riuscita: e' una chiave che non si vede,
    // ed e' esattamente il caso che il 4 agosto ha tenuto la gita annullata
    // per un giorno intero mentre la configurazione diceva il contrario.
    if (typeof stato !== 'string') return { annullata: true, letturaRiuscita: false };
    return { annullata: stato !== 'aperta', letturaRiuscita: true };
  } catch {
    return { annullata: true, letturaRiuscita: false };
  }
}

/**
 * La gita e' del 22 agosto 2026: passata quella data non c'e' piu' niente da
 * prenotare, qualunque cosa dica `config_app`. Costante locale apposta, non
 * una lettura di rete: cosi' questo confronto regge ANCHE quando il database
 * non risponde, che e' l'unico caso in cui il resto di questo file non
 * potrebbe garantire niente da solo — il calendario non si scorda mai di
 * chiudere, una persona sì (brief 24/8/2026: il modulo era ancora aperto due
 * giorni dopo l'evento, perche' nessuno aveva spento `config_app` a mano).
 */
const FINE_GITA = new Date('2026-08-22T23:59:59+02:00').getTime();
function gitaConclusa(): boolean {
  return Date.now() > FINE_GITA;
}

/**
 * Lo stato della gita in QUATTRO esiti, non tre.
 *
 * [4/8/2026, secondo giro] Il fail-closed di `getStatoGita` risponde
 * «annullata» quando non riesce a leggere, e per nascondere un invito a pagare
 * va benissimo. Il guaio e' che «annullata» non e' solo una scelta prudente:
 * e' un'AFFERMAZIONE, e la pagina la stampa a caratteri grandi. Un intoppo di
 * rete diventa cosi' un annuncio falso, e la gente smette di iscriversi a un
 * viaggio che si fa.
 *
 * [24/8/2026] La stessa regola vale per la data. Un evento che si e' gia'
 * svolto non e' «annullato» — e' successo, e dirlo annullato sarebbe falso
 * quanto l'opposto. E' un quarto stato, 'conclusa': nasconde l'invito a
 * iscriversi esattamente come 'annullata', ma non mostra il badge rosso
 * "Annullata", perche' non lo e' stata. Controllata qui, in un punto solo, e
 * non nelle singole pagine: home, /eventi, la pagina della gita e il modulo
 * di iscrizione la ereditano tutte insieme, non possono piu' disallinearsi.
 *
 *   'aperta'         -> si invita a iscriversi
 *   'annullata'      -> si dice che e' annullata, ed e' vero
 *   'conclusa'       -> la data e' passata: niente invito, niente badge rosso
 *   'non_verificabile' -> nessuna delle precedenti e' verificata: si tace
 */
export type StatoGita = 'aperta' | 'annullata' | 'conclusa' | 'non_verificabile';

export async function statoGita(
  slug = 'gita_giochi_medievali_2026_stato',
): Promise<StatoGita> {
  const r = await getStatoGita(slug);
  if (!r.letturaRiuscita) {
    // Rumoroso di proposito: un difetto che non si vede e' un difetto che dura
    // mesi. Questa riga e' quella che il 4 agosto sarebbe servita.
    console.error(
      `[gita] stato NON LEGGIBILE da config_app (chiave ${slug}). ` +
      'La pagina non dira ne aperta ne annullata. Controlla le variabili PUBLIC_SUPABASE_* ' +
      'e che la chiave sia in config_app_chiavi_pubbliche().',
    );
    // Anche senza database, il calendario resta leggibile: se la data e' gia'
    // passata lo si puo' dire lo stesso, senza aver bisogno di config_app.
    return gitaConclusa() ? 'conclusa' : 'non_verificabile';
  }
  // Annullata esplicitamente (decisione del segretario) resta annullata anche
  // dopo la data: e' un fatto diverso da "si e' svolta ed e' finita".
  if (r.annullata) return 'annullata';
  return gitaConclusa() ? 'conclusa' : 'aperta';
}

/**
 * Come sopra, ma per le pagine PRERENDERIZZATE, dove il valore si fissa al
 * momento della build e ci resta fino alla build successiva.
 *
 * [4/8/2026] Perche' esiste. Su una pagina SSR il fail-closed e' giusto: se la
 * lettura non riesce si mostra la versione prudente e al caricamento dopo si
 * corregge da sola. Su una pagina generata al build no: un singolo intoppo di
 * rete durante `npm run build` congela «annullata» nell'HTML e ci resta, senza
 * che nessuno lo sappia. E' successo davvero, in questa stessa giornata: una
 * build ha letto male e la home ha pubblicato una gita annullata che annullata
 * non era.
 *
 * Quindi qui la build si FERMA. Meglio un deploy che non parte e lo dice, di
 * uno che riesce e pubblica una cosa falsa.
 */
export async function getStatoGitaAlBuild(
  slug = 'gita_giochi_medievali_2026_stato',
): Promise<{ annullata: boolean }> {
  const r = await getStatoGita(slug);
  if (!r.letturaRiuscita) {
    throw new Error(
      `[gita] Non sono riuscito a leggere lo stato della gita da config_app (chiave ${slug}). ` +
      'La build si ferma di proposito: una pagina prerenderizzata congelerebbe lo stato prudente ' +
      '«annullata» e lo pubblicherebbe come se fosse vero. Controlla la connessione, le variabili ' +
      'PUBLIC_SUPABASE_* e che la chiave sia fra quelle pubbliche (config_app_chiavi_pubbliche).',
    );
  }
  return { annullata: r.annullata };
}

/**
 * Descrizione social/meta per la gita, in funzione dei posti disponibili.
 * `posti === null` → generica (fail-safe). Testi come da brief (26/7/2026).
 */
export function descrizioneGita(posti: PostiGita | null): string {
  const coda =
    // Niente data qui dentro: era cablata al 14 agosto mentre la chiusura vera
    // e' un'altra, e una descrizione social si copia in giro e resta.
    'Viaggio e ingresso 60 euro. Tornei, corteo storico e villaggio medievale a Castel Coira.';
  if (!posti) {
    return `Gita sociale El Brenz ai Giochi Medievali del Südtirol, 22 agosto 2026. ${coda}`;
  }
  if (posti.disponibili <= 0) {
    return "Posti esauriti. Scrivici per la lista d'attesa.";
  }
  return `Restano ${posti.disponibili} posti su ${posti.totali}. ${coda}`;
}

/**
 * I dati della gita che CAMBIANO, letti da dove sono scritti.
 *
 * [4/8/2026] Nasce da due bugie trovate in pagina, tutte e due della specie
 * «il valore vecchio che resta»:
 *
 *   - le pagine dicevano «iscrizioni fino al 14 agosto» mentre in config_app
 *     la chiusura e' il 15: una data cablata a mano il giorno che fu scritta,
 *     e mai piu' toccata;
 *   - promettevano il bonus preorder di 5 euro «entro il 31 luglio» il 4
 *     agosto, cioe' quattro giorni dopo la scadenza. Il server aveva gia'
 *     smesso di applicarlo: la pagina prometteva uno sconto che alla cassa non
 *     arrivava.
 *
 * La seconda e' la piu' seria, perche' riguarda soldi e perche' nessuno se ne
 * accorge finche' non lo dice qualcuno che ha pagato.
 */
export const PREORDER_SCADENZA = new Date('2026-07-31T23:59:59+02:00').getTime();

/** Il bonus preorder e' ancora valido adesso? Stessa soglia della edge
 *  gita-crea-ordine: se qui e la' divergono, la pagina promette e la cassa
 *  smentisce. */
export function bonusPreorderAttivo(): boolean {
  return Date.now() <= PREORDER_SCADENZA;
}

/** La data di chiusura delle iscrizioni, dalla configurazione. Torna null se
 *  non si riesce a leggerla: in quel caso la pagina non scrive nessuna data,
 *  invece di scriverne una vecchia. */
export async function chiusuraIscrizioniGita(
  slug = 'gita_giochi_medievali_2026_stato',
): Promise<Date | null> {
  try {
    if (!SB_URL || !SB_ANON) return null;
    const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('config_app').select('valore').eq('chiave', slug).maybeSingle();
    if (error) { console.error('[gita] chiusura iscrizioni non leggibile:', error.message); return null; }
    const v = (data?.valore as Record<string, unknown> | undefined)?.chiusura_iscrizioni;
    // Anche questo ramo lascia traccia: tornare vuoto in silenzio e' la stessa
    // specie di difetto che questo file esiste per correggere.
    if (typeof v !== 'string') {
      console.error('[gita] chiusura_iscrizioni assente o non testuale nella configurazione:', JSON.stringify(v));
      return null;
    }
    const d = new Date(v + 'T23:59:59+02:00');
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (e) {
    console.error('[gita] chiusura iscrizioni non leggibile:', e);
    return null;
  }
}

/** La data scritta come la scriverebbe una persona, nella lingua della pagina. */
export function dataLunga(d: Date, lingua: 'it' | 'de' | 'en' = 'it'): string {
  const loc = lingua === 'de' ? 'de-DE' : lingua === 'en' ? 'en-GB' : 'it-IT';
  return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
}
