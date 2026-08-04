// quota — la quota sociale dell'anno, letta da dove e' scritta una volta sola.
//
// [4/8/2026] Il numero 20 viveva in quattro file: paypal-create-order,
// ricevuta-ocr, contact-form, scheda-domanda. Finche' restano allineati non si
// vede niente; il giorno che il Direttivo delibera 25, uno resta indietro e
// nessuno se ne accorge finche' un socio non paga la cifra sbagliata. E' la
// stessa lezione della tessera senza quota: una regola in due posti prima o
// poi diverge.
//
// La fonte e' config_app, chiave `quota_sociale_per_anno`, un oggetto per anno.
// Aggiungere l'anno nuovo si fa da database, senza toccare il codice.
//
// FALLBACK. Se la lettura fallisce si torna il valore passato dal chiamante,
// che e' quello che quel file usava prima. Cosi' un problema di rete non
// cambia l'importo di un pagamento: al massimo lascia il sistema com'era ieri.
// Per un numero che decide quanto una persona paga, «come ieri» e' la risposta
// giusta, «zero» o «errore» no.

export async function quotaAnno(
  supabase: { from: (t: string) => any },
  anno: number,
  fallback: number,
): Promise<number> {
  // [4/8/2026] Il valore di riserva resta, ma smette di essere INVISIBILE.
  // E' il caso piu' insidioso dei tre: la lettura fallisce, il codice usa il
  // numero di scorta, e chi lo legge lo prende per la quota deliberata. Non
  // lascia traccia da nessuna parte, quindi il giorno che il Direttivo cambia
  // la quota e la lettura si rompe, il sito continua a chiedere la cifra
  // vecchia e nessuno se ne accorge finche' non lo dice un socio.
  //
  // Per un numero che decide quanto una persona paga, «come ieri» resta la
  // risposta giusta: zero o un errore sarebbero peggio. Ma ogni volta che si
  // ripiega sulla scorta, ora si scrive nei log.
  const scorta = (motivo: string): number => {
    console.error(
      `[quota] anno ${anno}: uso il valore di riserva ${fallback} euro perche ${motivo}. ` +
      'Il numero mostrato potrebbe NON essere quello deliberato dal Direttivo. ' +
      'Controlla config_app, chiave quota_sociale_per_anno.',
    );
    return fallback;
  };

  try {
    const { data, error } = await supabase
      .from('config_app').select('valore')
      .eq('chiave', 'quota_sociale_per_anno').maybeSingle();
    if (error) return scorta(`la lettura e fallita: ${error.message}`);
    if (!data) return scorta('la chiave non esiste in config_app');
    const v = (data.valore as Record<string, unknown> | null)?.[String(anno)];
    if (v === undefined || v === null) return scorta(`l anno ${anno} non e ancora stato deliberato`);
    const n = Number(v);
    // Una quota non negativa e non assurda: se il dato a database e' rotto,
    // meglio il valore noto che un numero preso alla lettera.
    if (!Number.isFinite(n) || n <= 0 || n > 1000) return scorta(`il valore a database non e plausibile (${String(v)})`);
    return n;
  } catch (e) {
    return scorta(`eccezione: ${e instanceof Error ? e.message : String(e)}`);
  }
}
