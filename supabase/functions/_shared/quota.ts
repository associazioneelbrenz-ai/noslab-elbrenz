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
  try {
    const { data, error } = await supabase
      .from('config_app').select('valore')
      .eq('chiave', 'quota_sociale_per_anno').maybeSingle();
    if (error || !data) return fallback;
    const v = (data.valore as Record<string, unknown> | null)?.[String(anno)];
    const n = Number(v);
    // Una quota non negativa e non assurda: se il dato a database e' rotto,
    // meglio il valore noto che un numero preso alla lettera.
    if (!Number.isFinite(n) || n <= 0 || n > 1000) return fallback;
    return n;
  } catch {
    return fallback;
  }
}
