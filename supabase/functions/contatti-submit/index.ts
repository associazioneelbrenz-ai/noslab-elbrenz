// contatti-submit — Sportello El Brenz «Porta la tua Storia» (11/07/2026).
//
// POST multipart/form-data dal form /contatti: due percorsi (richiesta |
// offerta), 10 categorie con payload condizionale, fino a 3 allegati
// (SOLO documenti_foto e oggetti) nel bucket PRIVATO contatti-staging.
//
// SICUREZZA: honeypot + time-trap + rate limit persistente (riusa la RPC
// convenzioni_rl_hit con prefisso hash dedicato — l'in-memory non protegge
// su edge multi-istanza, lezione AUD-B5); whitelist categorie e payload
// per categoria; allegati validati sui MAGIC BYTES (jpg/png/webp/pdf,
// max 3 × 5MB); CORS whitelist standard. INSERT prima delle email
// (lezione A2); codice pratica atomico EB-YYYY-NNN via next_codice_pratica.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
  'https://www.elbrenz.eu',
  'http://localhost:4321',
  'http://localhost:3000',
];
const RATE_MAX = 5; // pratiche per IP/ora
const MIN_FORM_AGE_MS = 3000;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_FILES = 3;
const STAGING = 'contatti-staging';
const RECIPIENT = 'info@elbrenz.eu';
const SITO = 'https://elbrenz.eu';
const LOGO_URL = `${SITO}/logo-eb-footer@2x.png`;

// whitelist categorie e campi payload ammessi per ciascuna
const CATEGORIE: Record<string, { tipo: 'richiesta' | 'offerta'; campi: string[]; upload?: boolean; archivio?: boolean }> = {
  ricerca_storica:  { tipo: 'richiesta', campi: ['localita', 'cognome_maso', 'periodo', 'cosa_sai_gia'] },
  pubblicazioni:    { tipo: 'richiesta', campi: ['titolo', 'copie', 'consegna'] },
  scuole_visite:    { tipo: 'richiesta', campi: ['data', 'tipo_pubblico', 'tema'] },
  stampa_media:     { tipo: 'richiesta', campi: ['testata'] },
  altro:            { tipo: 'richiesta', campi: [] },
  documenti_foto:   { tipo: 'offerta', campi: ['periodo', 'luogo', 'modalita', 'consenso_custode'], upload: true, archivio: true },
  oggetti:          { tipo: 'offerta', campi: ['descrizione', 'consenso_custode'], upload: true, archivio: true },
  memorie_racconti: { tipo: 'offerta', campi: ['consenso_custode'], archivio: true },
  parole_proverbi:  { tipo: 'offerta', campi: ['parola', 'significato', 'paese_detto', 'consenso_custode'], archivio: true },
  tempo_competenze: { tipo: 'offerta', campi: ['competenze', 'disponibilita'] },
};
const ETICHETTE: Record<string, string> = {
  ricerca_storica: 'Ricerca storica', pubblicazioni: 'Pubblicazioni', scuole_visite: 'Scuole e visite',
  stampa_media: 'Stampa e media', altro: 'Altro', documenti_foto: 'Documenti e fotografie',
  oggetti: 'Oggetti', memorie_racconti: 'Memorie e racconti', parole_proverbi: 'Parole e proverbi',
  tempo_competenze: 'Tempo e competenze',
};

function cors(origin: string | null): Record<string, string> {
  const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status: number, c: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...c, 'Content-Type': 'application/json' } });
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function sniff(b: Uint8Array): { ext: string; mime: string } | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: 'webp', mime: 'image/webp' };
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { ext: 'pdf', mime: 'application/pdf' };
  return null;
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function inviaEmail(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  const secret = Deno.env.get('SEND_EMAIL_SHARED_SECRET');
  if (!secret) return false;
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Send-Email-Secret': secret },
      body: JSON.stringify({ to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}), tags: [{ name: 'source', value: 'sportello' }] }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const c = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: c });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, c);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origin non consentita' }, 403, c);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // rate limit persistente (prefisso dedicato, RPC condivisa)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto';
  try {
    const ipHash = await sha256Hex(`contatti:${ip}`);
    const { data: entro } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_MAX });
    if (entro === false) return json({ error: 'Hai inviato troppe richieste: riprova più tardi.' }, 429, c);
  } catch { /* fail-open, restano honeypot/validazioni */ }

  let fd: FormData;
  try { fd = await req.formData(); } catch { return json({ error: 'Formato non valido' }, 400, c); }
  const str = (k: string, max = 500) => String(fd.get(k) ?? '').trim().slice(0, max);

  // honeypot + time-trap: 200 silenzioso
  if (str('_honeypot')) return json({ success: true }, 200, c);
  const ts = parseInt(str('_ts'), 10);
  if (ts && Date.now() - ts < MIN_FORM_AGE_MS) return json({ success: true }, 200, c);

  const categoria = str('categoria', 50);
  const def = CATEGORIE[categoria];
  if (!def) return json({ error: 'Categoria non valida.' }, 400, c);
  const nome = str('nome', 100);
  const email = str('email', 200);
  const telefono = str('telefono', 40);
  const paese = str('paese', 100);
  const messaggio = str('messaggio', 5000);
  const consenso = str('consenso') === 'on' || str('consenso') === 'true';

  if (nome.length < 2) return json({ error: 'Inserisci il tuo nome.' }, 400, c);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email non valida.' }, 400, c);
  if (!consenso) return json({ error: 'Serve il consenso al trattamento dei dati per rispondere.' }, 400, c);

  // payload condizionale: SOLO i campi ammessi per la categoria
  const payload: Record<string, unknown> = {};
  for (const campo of def.campi) {
    const v = str(`p_${campo}`, 1000);
    if (v) payload[campo] = campo === 'competenze' ? v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10) : v;
  }
  if (!messaggio && Object.keys(payload).length === 0) {
    return json({ error: 'Raccontaci qualcosa: il messaggio è vuoto.' }, 400, c);
  }
  // Custodi della Memoria: nelle categorie d'archivio la scelta è OBBLIGATORIA
  if (def.archivio) {
    if (payload.consenso_custode !== 'nome' && payload.consenso_custode !== 'anonimo') {
      return json({ error: 'Scegli come preferisci essere ringraziato (nome o anonimato).' }, 400, c);
    }
  }

  // allegati: solo per le categorie con upload
  const files = fd.getAll('allegati').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0 && !def.upload) return json({ error: 'Questa categoria non prevede allegati.' }, 400, c);
  if (files.length > MAX_FILES) return json({ error: `Massimo ${MAX_FILES} allegati.` }, 400, c);
  const allegatiValidati: { bytes: Uint8Array; ext: string; mime: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE) return json({ error: 'Ogni allegato può pesare al massimo 5 MB.' }, 400, c);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const tipoFile = sniff(bytes);
    if (!tipoFile) return json({ error: 'Formato allegato non supportato: usa JPG, PNG, WebP o PDF.' }, 400, c);
    allegatiValidati.push({ bytes, ...tipoFile });
  }

  // codice pratica atomico + INSERT (prima delle email)
  const { data: codice, error: errCod } = await supabase.rpc('next_codice_pratica');
  if (errCod || !codice) {
    console.error('[sportello] codice pratica fallito:', errCod);
    return json({ error: 'Errore interno, riprova o scrivi a info@elbrenz.eu.' }, 500, c);
  }
  const { data: riga, error: errIns } = await supabase.from('richieste_contatto').insert({
    codice_pratica: codice, tipo: def.tipo, categoria, nome, email,
    telefono: telefono || null, paese: paese || null, messaggio: messaggio || null,
    payload, consenso_privacy_at: new Date().toISOString(),
  }).select('id').single();
  if (errIns || !riga) {
    console.error('[sportello] insert fallita:', errIns);
    return json({ error: 'Errore interno, riprova o scrivi a info@elbrenz.eu.' }, 500, c);
  }

  // Notifica direttivo (14/7, fire-and-forget): nuova domanda/richiesta dal sito.
  {
    const testo = (messaggio || '').trim();
    const troncato = testo.length > 200 ? testo.slice(0, 197) + '…' : testo;
    const etichetta = def.tipo === 'richiesta' ? 'Chiedi a El Brenz' : 'Porta la tua Storia';
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'X-Bot-Secret': Deno.env.get('BOT_ANDREAS_SECRET') ?? '' },
      body: JSON.stringify({ text: `✉️ **Nuova domanda dal sito** (${etichetta})\nDa ${nome} (${email})${troncato ? `\n"${troncato}"` : ''}` }),
    }).catch(() => {});
  }

  // upload allegati in staging PRIVATO (best-effort, pratica già salvata)
  const paths: string[] = [];
  for (let i = 0; i < allegatiValidati.length; i++) {
    const a = allegatiValidati[i];
    const path = `${riga.id}/${i + 1}.${a.ext}`;
    const { error: errUp } = await supabase.storage.from(STAGING)
      .upload(path, a.bytes, { contentType: a.mime, upsert: true });
    if (!errUp) paths.push(path);
    else console.error('[sportello] upload allegato fallito:', errUp);
  }
  if (paths.length > 0) {
    await supabase.from('richieste_contatto').update({ allegati: paths }).eq('id', riga.id);
  }

  // riepilogo campi per le email
  const righe = [
    ['Pratica', codice], ['Tipo', def.tipo === 'richiesta' ? 'Chiedi a El Brenz' : 'Porta la tua Storia'],
    ['Categoria', ETICHETTE[categoria]], ['Nome', nome], ['Email', email],
    ...(telefono ? [['Telefono', telefono]] : []), ...(paese ? [['Paese/valle', paese]] : []),
    ...Object.entries(payload).map(([k, v]) => [k.replace(/_/g, ' '), Array.isArray(v) ? v.join(', ') : String(v)]),
    ...(messaggio ? [['Messaggio', messaggio]] : []),
    ...(paths.length ? [['Allegati', `${paths.length} file in staging privato`]] : []),
  ];
  const tabella = righe.map(([k, v]) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid #eee;color:#8a6215;width:140px;vertical-align:top;">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid #eee;color:#1E2E26;">${esc(v)}</td></tr>`).join('');

  // PREDISPOSTO, NON ATTIVO (decisione Cristian in sospeso): copia della
  // notifica tempo_competenze a Diego — si attiva creando il secret
  // SPORTELLO_CC_TEMPO_COMPETENZE con l'email di destinazione.
  const ccTempo = categoria === 'tempo_competenze' ? (Deno.env.get('SPORTELLO_CC_TEMPO_COMPETENZE') ?? '') : '';

  await inviaEmail(RECIPIENT,
    `[SPORTELLO][${categoria}] ${codice} · ${nome}`,
    `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
      <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
        <h1 style="color:#1E2E26;font-size:19px;margin:0 0 4px;">Sportello El Brenz: nuova pratica</h1>
        <p style="color:#666;font-size:13px;margin:0 0 20px;">${esc(codice)} · ${esc(ETICHETTE[categoria])}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${tabella}</table>
        <p style="color:#999;font-size:11px;margin-top:16px;">Rispondi direttamente a questa email per rispondere al mittente. Gli allegati sono nel bucket privato contatti-staging/${esc(riga.id)}.</p>
      </div></body></html>`,
    email);
  if (ccTempo) {
    await inviaEmail(ccTempo, `[SPORTELLO][tempo_competenze] ${codice} · ${nome}`,
      `<p>Copia per conoscenza della pratica ${esc(codice)} (volontariato/competenze). Dettagli nella casella info@elbrenz.eu.</p>`);
  }

  const notaPrestito = categoria === 'documenti_foto' && payload.modalita === 'prestito_digitalizzazione'
    ? `<p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:12px 0 0;background:#FDF9F0;border-left:3px solid #C8923E;padding:10px 14px;"><strong>I tuoi originali ti verranno restituiti dopo la digitalizzazione.</strong></p>`
    : '';
  await inviaEmail(email,
    `Sportello El Brenz: pratica ${codice} ricevuta`,
    `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F8F1E4;">
      <div style="background:#fff;padding:32px;border-radius:8px;border-top:4px solid #C8923E;">
        <table role="presentation" style="border-collapse:collapse;"><tr>
          <td style="width:60px;"><img src="${LOGO_URL}" alt="El Brenz" width="48" height="48" style="display:block;border-radius:50%;"/></td>
          <td><h1 style="font-family:Georgia,serif;color:#1E2E26;font-size:20px;margin:0;font-weight:500;">Grazie, ${esc(nome)}!</h1></td>
        </tr></table>
        <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:18px 0 0;">La tua ${def.tipo === 'richiesta' ? 'richiesta' : 'proposta'} è arrivata allo Sportello della <em>nosa Sociazion</em> con il codice <strong>${esc(codice)}</strong>: conservalo per ogni riferimento.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">${tabella}</table>
        ${notaPrestito}
        <p style="color:#1E2E26;font-size:14px;line-height:1.6;margin:16px 0 0;">Ti rispondiamo di norma <strong>entro 7–10 giorni</strong>: siamo volontari, e ogni storia merita il suo tempo. Per aggiungere qualcosa rispondi a questa email citando il codice pratica.</p>
        <p style="color:#D9A94E;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:18px 0 0;">Raìs fonde no le 'nglacia</p>
        <p style="color:#999;font-size:11px;margin:12px 0 0;">Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu</p>
      </div></body></html>`);

  return json({ success: true, codice }, 200, c);
});
