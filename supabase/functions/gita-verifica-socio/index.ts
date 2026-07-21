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

  let q = supabase.from('domande_tesseramento')
    .select('nome, codice_tessera')
    .eq('email', email)
    .eq('stato', 'approvata')
    .order('anno', { ascending: false })
    .limit(1);
  if (codice && /^\d{1,6}-\d{4}-[0-9a-f]{24}$/.test(codice)) {
    q = supabase.from('domande_tesseramento')
      .select('nome, codice_tessera')
      .eq('codice_tessera', codice)
      .eq('stato', 'approvata')
      .limit(1);
  } else if (codice && /^\d{1,6}$/.test(codice)) {
    // Miglioria (21/7): il socio puo' inserire il semplice NUMERO di tessera
    // (es. "4"). Richiediamo email + numero insieme, cosi' non si espongono
    // nomi altrui digitando numeri a caso (i numeri bassi sono indovinabili).
    q = supabase.from('domande_tesseramento')
      .select('nome, codice_tessera')
      .eq('email', email)
      .eq('numero_tessera', Number(codice))
      .eq('stato', 'approvata')
      .limit(1);
  }
  const { data } = await q.maybeSingle();

  if (!data) return jsonResponse({ socio: false }, 200, cors);
  // solo il nome di battesimo, niente cognome/email/tessera di terzi
  const nome = String(data.nome ?? '').trim().split(/\s+/)[0] || undefined;
  return jsonResponse({ socio: true, nome }, 200, cors);
});
