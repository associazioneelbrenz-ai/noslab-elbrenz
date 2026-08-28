// notificaDirettivo — notifica config-driven al gruppo Telegram del direttivo.
//
// 1. Legge il toggle del `tipo` da `telegram_notifica`. Se assente o attivo=false
//    → esce in silenzio (Cristian spegne un tipo con un UPDATE, senza deploy).
// 2. Compone un testo markdown breve (PII minima: nome/importo + link alla vista
//    admin, mai email/telefono/dati completi nel gruppo).
// 3. Invia RIUSANDO l'edge `telegram-bot` (header X-Bot-Secret == BOT_ANDREAS_SECRET,
//    body { notify, text }): è l'unica meccanica che tocca l'API Telegram nel repo.
//    telegram-bot risolve il chat_id da telegram_config e fa escape+HTML del testo.
//
// Best-effort assoluto: try/catch totale, non lancia MAI, non blocca il flusso
// chiamante. Se Telegram è giù, l'insert del socio/pagamento riesce comunque.
// Uso tipico (dopo un insert riuscito, non bloccante):
//   notificaDirettivo(supabase, 'guardiani_lemma', { lemma, variante }).catch(() => {});

const EMOJI: Record<string, string> = {
  Pagamenti: '💳', Guardiani: '📝', Alert: '⚠️',
  Soci: '👤', Eventi: '🎟️', Convenzioni: '🤝',
  Contatti: '📩', Sportello: '📦', Lead: '📚', Redazione: '✍️',
  Museo: '🎖️',
};

// I template ricevono `dati` e tornano righe brevi. PII minima. Il testo è
// markdown: telegram-bot (toTelegramHtml) fa l'escape di & < > e i tag, quindi
// qui NON si escapa a mano e si usa **grassetto** come gli altri caller.
function componiTesto(
  tipo: string,
  categoria: string,
  etichetta: string,
  dati: Record<string, unknown>,
): string {
  const site = 'https://elbrenz.eu';
  const emoji = EMOJI[categoria] ?? '🔔';
  const r: string[] = [`${emoji} **${etichetta}**`];
  const d = dati as Record<string, any>;
  switch (tipo) {
    case 'pagamento_quota':    r.push(`${d.nome ?? '—'} · ${d.importo ?? '?'} €`); break;
    case 'donazione':          r.push(`${d.nome ?? 'Anonimo'} · ${d.importo ?? '?'} €`); break;
    case 'integrazione_quota': r.push(`${d.nome ?? '—'} · ${d.importo ?? '?'} €`); break;
    case 'ricevuta_bonifico':  r.push(`${d.nome ?? '—'} · ricevuta bonifico da verificare${d.anomalia ? ' ⚠ anomalia OCR' : ''}`); break;
    case 'guardiani_lemma':    r.push(`«${d.lemma ?? '—'}» (${d.variante ?? '?'})`, `Valida su ${site}/glossario-console`); break;
    case 'museo_gg_proposta':  r.push(`${d.nome ?? '—'}${d.tipo ? ` · ${d.tipo}` : ''}`, `${String(d.estratto ?? '').slice(0, 140)}`, `Contatto: ${d.contatto ?? '—'}`, `Gestisci su ${site}/museo-gg-curatela`); break;
    case 'alert_anomalia':     r.push(`${d.dettaglio ?? '—'}`); break;
    // [27/8/2026] Cruscotto del direttivo, promemoria settimanale. Regola
    // non negoziabile del brief: si manda anche a zero allarmi, una riga
    // sola — il silenzio non deve poter significare sia "tutto bene" sia
    // "sono morto".
    case 'cruscotto_allarmi': {
      // [28/8/2026] Brief "Piano di salvataggio gratuito": una riga sola,
      // sempre presente (allarme o no), perche' il sito si pubblica da CLI
      // locale e "committato" non e' mai stato "in produzione".
      const v = d.versione ?? {};
      r.push(`Versione in produzione: ${v.commit ?? 'sconosciuta'} (${v.giorni ?? '?'} giorni)`);
      if (d.tuttoAPosto) {
        r.push(`Nessun allarme. Ultima raccolta del radar: ${d.radarUltimo ?? '—'}.`);
      } else {
        // [28/8/2026] Brief "Il battito dei servizi" §4.2: i servizi in
        // allarme vengono prima delle code — di solito ne sono la causa.
        const servizi = Array.isArray(d.servizi) ? d.servizi : [];
        const code = Array.isArray(d.code) ? d.code : [];
        const lavori = Array.isArray(d.lavori) ? d.lavori : [];
        for (const s of servizi) r.push(`· ${s.servizio}: ${s.diagnosi}`);
        for (const c of code) r.push(`· ${c.coda} ferma da ${c.giorni_ferma} giorni`);
        for (const l of lavori) r.push(`· ${l.lavoro} guasto (${l.esito})`);
        r.push(`Cura su ${site}/cruscotto`);
      }
      break;
    }
    // [26/8/2026] Coda di ascolto del glossario ferma da piu' di sette
    // giorni. Testo definitivo del brief, invariato: solo la riga
    // dell'etichetta sopra (comune a tutti i tipi) si aggiunge davanti.
    case 'coda_ascolto': {
      r.push(`Ci sono ${d.n ?? 0} voci in attesa di essere ascoltate. In tutto sono ${d.m ?? 0} secondi. La più vecchia aspetta dal ${d.data ?? '—'}.`);
      r.push(`Ascoltale qui: ${site}/ascolta`);
      break;
    }
    // AGGIUNTA 31/7/2026 — digest settimanale del Radar eventi (GATE 3).
    // Elenco corto: il dettaglio sta nella pagina di curatela, non nel gruppo.
    // [6/8/2026] Riepilogo giornaliero dei Guardiani. Sostituisce il messaggio
    // per singolo lemma: il 6 agosto sono arrivati 23 termini da una persona
    // sola, e ventitre' notifiche per un lavoro fatto in una seduta sono
    // rumore, non informazione.
    case 'guardiani_digest': {
      const chi = Array.isArray(d.contributori) ? d.contributori : [];
      r.push(`${d.totale ?? 0} termini nuovi in coda:`);
      for (const c of chi.slice(0, 10)) r.push(`· ${c.quanti ?? '?'} da ${c.nome ?? '—'}`);
      r.push(`Cura su ${site}/glossario-console`);
      break;
    }
    case 'radar_digest': {
      const lista = Array.isArray(d.eventi) ? d.eventi : [];
      r.push(`${d.totale ?? lista.length} candidati sopra soglia:`);
      for (const e of lista.slice(0, 10)) {
        r.push(`· ${e.punteggio ?? '?'} · ${e.titolo ?? '—'} (${e.comune ?? '?'}, ${e.data ?? '?'})`);
      }
      r.push(`Cura su ${site}/radar-eventi`);
      break;
    }
    case 'nuova_domanda': {
      // Riga pagamento cosi' il direttivo non approva "al buio" (caso n.26,
      // 21/7). metodo_scelto dalla domanda + eventuale riga pagamenti_tesseramento.
      const m = d.metodo_scelto;
      const pagamento = m === 'paypal'
        ? `💳 Pagamento: PayPal · ${d.pag_stato === 'completato' ? 'completato' : 'creato'}`
        : m === 'bonifico'
        ? '🏦 Pagamento: bonifico dichiarato · in attesa di accredito/ricevuta'
        : m === 'contanti'
        ? (d.incassato_da_nome
            ? `💶 Pagamento: contanti · incassato da ${d.incassato_da_nome}${d.incassato_il ? ` il ${d.incassato_il}` : ''}`
            : '💶 Pagamento: contanti · da incassare')
        : 'Pagamento: non indicato';
      r.push(`${d.nome ?? '—'}${d.email ? ` · ${d.email}` : ''}`, pagamento);
      break;
    }
    default:                   r.push(String(d.dettaglio ?? JSON.stringify(dati)).slice(0, 200));
  }
  return r.join('\n');
}

export async function notificaDirettivo(
  supabase: any,
  tipo: string,
  dati: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: cfg } = await supabase
      .from('telegram_notifica')
      .select('categoria, etichetta, attivo')
      .eq('tipo', tipo)
      .maybeSingle();
    if (!cfg || cfg.attivo === false) return; // tipo sconosciuto o spento → non inviare

    const secret = Deno.env.get('BOT_ANDREAS_SECRET');
    const base = Deno.env.get('SUPABASE_URL');
    if (!secret || !base) return;

    const text = componiTesto(tipo, cfg.categoria, cfg.etichetta, dati);
    await fetch(`${base}/functions/v1/telegram-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': secret },
      body: JSON.stringify({ notify: true, text }),
    });
  } catch (e) {
    console.error('[notificaDirettivo] fallita', tipo, e);
  }
}
