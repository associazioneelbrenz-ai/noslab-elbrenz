// gita-verifica-socio — verifica se un'email corrisponde a un socio in regola.
//
// POST { email, codice? } → { socio: boolean, nome?: string }
// Socio "in regola" = esiste una domanda_tesseramento APPROVATA con quella
// email. Non esponiamo MAI dati di terzi: solo il flag e, se socio, il nome
// di battesimo (per un saluto personalizzato in pagina). Se arriva anche il
// codice tessera, lo usiamo come conferma aggiuntiva ma non è obbligatorio.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  isOriginAllowed,
  jsonResponse,
} from '../_shared/paypal.ts';
import { firmaToken } from '../_shared/admin.ts';

// [15/9/2026, audit SIC-09] Questo endpoint e' un oracolo «e' socio?» senza
// limite: col ramo del numero si scopriva la tessera in un centinaio di
// tentativi, e il nome di battesimo usciva a chiunque avesse un'email.
// Ora: rate limit per IP con la RPC oraria condivisa (fail-closed), e il nome
// esce solo a chi presenta il codice tessera completo, ricalcolato con l'HMAC
// del progetto (_shared/tessera.ts). Senza codice verificato: solo si'/no.
const RATE_MAX = 10;
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip'); if (cf) return cf.trim();
  const fwd = req.headers.get('x-forwarded-for'); return fwd ? fwd.split(',')[0].trim() : 'unknown';
}
function ugualiATempoCostante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo non consentito' }, 405, cors);
  if (!isOriginAllowed(origin)) return jsonResponse({ error: 'Origin non consentita' }, 403, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'JSON non valido' }, 400, cors); }

  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonResponse({ error: 'Email non valida.' }, 400, cors);
  }
  const codice = typeof body.codice === 'string' ? body.codice.trim() : '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // [15/9/2026, audit SIC-09] Rate limit per IP. Se il limitatore non risponde
  // si chiude (503), con lo stesso messaggio che la pagina gia' sa mostrare.
  try {
    const ipHash = await sha256Hex(`gita-verifica:${clientIp(req)}`);
    const { data: entro, error: rlErr } = await supabase.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_MAX });
    if (rlErr) throw rlErr;
    if (entro !== true) {
      return jsonResponse({
        errore: true,
        messaggio: 'Troppi tentativi di verifica da questo collegamento. Riprova fra un\'ora, oppure scrivici a info@elbrenz.eu.',
      }, 429, cors);
    }
  } catch (e) {
    console.error('[gita-verifica-socio] limitatore non disponibile:', e);
    return jsonResponse({
      errore: true,
      messaggio: 'Non riusciamo a verificare la tua posizione in questo momento. Riprova fra poco: non significa che tu non sia socio.',
    }, 503, cors);
  }
  let conCodiceCompleto = false;

  let q = supabase.from('domande_tesseramento')
    .select('id, numero_tessera, nome, codice_tessera')
    .eq('email', email)
    .eq('stato', 'approvata')
    .order('anno', { ascending: false })
    .limit(1);
  if (codice && /^\d{1,6}-\d{4}-[0-9a-f]{24}$/.test(codice)) {
    conCodiceCompleto = true;
    q = supabase.from('domande_tesseramento')
      .select('id, numero_tessera, nome, codice_tessera')
      .eq('codice_tessera', codice)
      .eq('stato', 'approvata')
      .limit(1);
  } else if (codice && /^\d{1,6}$/.test(codice)) {
    // Miglioria (21/7): il socio puo' inserire il semplice NUMERO di tessera
    // (es. "4"). Richiediamo email + numero insieme, cosi' non si espongono
    // nomi altrui digitando numeri a caso (i numeri bassi sono indovinabili).
    q = supabase.from('domande_tesseramento')
      .select('id, numero_tessera, nome, codice_tessera')
      .eq('email', email)
      .eq('numero_tessera', Number(codice))
      .eq('stato', 'approvata')
      .limit(1);
  }
  // [4/8/2026] L'ERRORE NON SI SCARTA PIU'. Prima era `const { data } = ...`:
  // se la query falliva, `data` restava vuoto e si rispondeva «socio: false»,
  // che la pagina mostra a un socio in regola come «non risulti socio» e gli
  // propone di tesserarsi di nuovo. Un guasto di rete diventava un'accusa.
  // E' gia' successo, con la chiave anonima vuota in una build.
  //
  // Adesso: non trovato e non-riuscito sono due risposte diverse. La prima e'
  // un fatto, la seconda e' un'ammissione di non sapere.
  const { data, error } = await q.maybeSingle();

  if (error) {
    console.error('[gita-verifica-socio] lettura fallita:', error.message);
    return jsonResponse({
      errore: true,
      messaggio: 'Non riusciamo a verificare la tua posizione in questo momento. Riprova fra poco: non significa che tu non sia socio.',
    }, 503, cors);
  }

  if (!data) return jsonResponse({ socio: false }, 200, cors);
  // [15/9/2026, audit SIC-09] Il nome esce solo se il codice tessera completo
  // presentato coincide (a tempo costante) con l'HMAC ricalcolato per quella
  // riga; senza secret o senza codice si risponde solo «socio: true».
  let codiceVerificato = false;
  if (conCodiceCompleto) {
    const adminSecret = Deno.env.get('ADMIN_ACTION_SECRET') ?? '';
    if (adminSecret && data.id && data.numero_tessera != null) {
      const hmac = await firmaToken(adminSecret, 'tessera', String(data.id), Number(data.numero_tessera));
      codiceVerificato = ugualiATempoCostante(codice.split('-')[2] ?? '', hmac.slice(0, 24));
    }
  }
  // solo il nome di battesimo, niente cognome/email/tessera di terzi
  const nome = String(data.nome ?? '').trim().split(/\s+/)[0] || undefined;
  return jsonResponse({ socio: true, nome: codiceVerificato ? nome : undefined }, 200, cors);
});
