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
    case 'guardiani_lemma':    r.push(`«${d.lemma ?? '—'}» (${d.variante ?? '?'})`, `Valida su ${site}/guardiani-curatela`); break;
    case 'museo_gg_proposta':  r.push(`${d.nome ?? '—'}${d.tipo ? ` · ${d.tipo}` : ''}`, `${String(d.estratto ?? '').slice(0, 140)}`, `Contatto: ${d.contatto ?? '—'}`, `Gestisci su ${site}/museo-gg-curatela`); break;
    case 'alert_anomalia':     r.push(`${d.dettaglio ?? '—'}`); break;
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
