import { createClient } from '@supabase/supabase-js';

/**
 * ddl1539 — stato dell'iter del disegno di legge n. 1539 (riconoscimento del
 * gruppo linguistico ladino-retico della Val di Non), letto da `config_app`.
 *
 * Perche' non sta nel codice: l'iter si muove per conto suo, e una data
 * scritta in un file .astro invecchia in silenzio. La chiave e'
 * `ddl_1539_stato`, in whitelist dentro `config_app_chiavi_pubbliche()` e in
 * categoria `editoriale`, quindi leggibile con la anon key.
 *
 * REGOLA, la stessa della gita: un dato che non si riesce a leggere non deve
 * MAI produrre un'affermazione. Qui si ritorna `null` e la riga di stato
 * semplicemente non compare: il resto della card resta intero. Meglio una card
 * senza riga che una card che dichiara come attuale uno stato di un anno fa.
 *
 * ATTENZIONE, e' il punto delicato: home, /lingua, /de e /en sono
 * PRERENDERIZZATE, quindi questo valore si fissa al momento della build. Da
 * solo non basterebbe a mantenere la promessa "si cambia una riga a database
 * senza toccare il sito": per quello la card rilegge la chiave dal client al
 * caricamento (vedi CardDdl1539.astro). Il valore letto qui serve a rendere
 * l'HTML gia' corretto e a non far lampeggiare la riga.
 */

const SB_URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SB_ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

export type StatoDdl1539 = {
  stato: string;
  verificatoIl: string | null;
};

export async function getStatoDdl1539(
  chiave = 'ddl_1539_stato',
): Promise<StatoDdl1539 | null> {
  try {
    if (!SB_URL || !SB_ANON) {
      console.error(
        '[ddl1539] PUBLIC_SUPABASE_* mancanti: la riga di stato non comparira. ' +
        'Build senza .env.local?',
      );
      return null;
    }
    const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('config_app').select('valore').eq('chiave', chiave).maybeSingle();
    if (error) {
      console.error(`[ddl1539] lettura fallita (chiave ${chiave}): ${error.message}`);
      return null;
    }
    const v = data?.valore as Record<string, unknown> | undefined;
    const stato = v?.stato;
    // Nessuna riga non e' una lettura riuscita: e' una chiave che non si vede.
    if (typeof stato !== 'string' || stato.trim() === '') {
      console.error(
        `[ddl1539] chiave ${chiave} assente o senza campo "stato". La riga non comparira. ` +
        'Controlla che la chiave sia in config_app_chiavi_pubbliche().',
      );
      return null;
    }
    const verificato = v?.verificato_il;
    return {
      stato: stato.trim(),
      verificatoIl: typeof verificato === 'string' && verificato.trim() !== ''
        ? verificato.trim()
        : null,
    };
  } catch (e) {
    console.error(`[ddl1539] eccezione in lettura: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** "2026-08-05" -> "5 agosto 2026". Ritorna null se la data non e' valida. */
export function dataEstesaIT(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const mese = mesi[Number(m[2]) - 1];
  if (!mese) return null;
  return `${Number(m[3])} ${mese} ${m[1]}`;
}
