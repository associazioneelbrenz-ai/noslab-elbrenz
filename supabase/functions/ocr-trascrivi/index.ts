// ocr-trascrivi — legge il testo dentro una fotografia di pagina stampata.
//
// PERCHE' ESISTE. Una scansione e' bella da vedere e muta per tutto il resto:
// nessun motore di ricerca la trova, Andreas non puo' citarla, un lettore di
// schermo non la legge. Il contenuto c'e' ed e' invisibile.
//
// LA REGOLA CHE NON SI TOCCA. Il testo estratto NON viene pubblicato. Finisce in
// `ocr_trascrizione` con stato `da_rivedere`, e ci resta finche' una persona non
// lo conferma. L'OCR sulla stampa dell'Ottocento confonde la esse lunga, mangia
// gli accenti e spezza le parole a fine riga: un testo pubblicato senza
// rilettura sarebbe PEGGIO di nessun testo, perche' sembrerebbe una trascrizione
// fedele e verrebbe citato come tale.
//
// RISERVATA a ruolo >= 25 (i curatori). Non e' un servizio pubblico: ogni
// chiamata costa, e chi la fa deve avere un nome.
//
// IL TETTO E' MENSILE e sta in config_app: si cambia senza deploy. Ogni
// estrazione registra modello e token, perche' un consumo che nessuno vede e'
// una spesa che cresce finche' non arriva la fattura.
//
// COSA CHIEDE AL MODELLO, e perche' cosi': trascrivere e basta. Niente riassunti,
// niente modernizzazione dell'ortografia, niente correzioni: se il testo dice
// «nè» con l'accento sbagliato per l'uso di oggi, quello e' il documento. Chi
// trascrive un documento storico non lo migliora.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINI = [
  'https://elbrenz.eu', 'https://www.elbrenz.eu', 'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:5173', 'http://localhost:3000',
];

const MODELLO = 'claude-haiku-4-5';

const ISTRUZIONE = [
  'Questa immagine e\' la fotografia o la scansione di una pagina stampata o manoscritta,',
  'quasi sempre in italiano e spesso dell\'Ottocento o del primo Novecento.',
  '',
  'Trascrivi il testo COSI\' COM\'E\'. In particolare:',
  '- non correggere l\'ortografia, gli accenti o la punteggiatura, nemmeno se oggi sarebbero sbagliati;',
  '- non modernizzare le parole e non sciogliere le abbreviazioni;',
  '- ricongiungi le parole spezzate a fine riga, togliendo il trattino;',
  '- mantieni i capoversi, ignora le intestazioni di pagina e i numeri di pagina;',
  '- se una parola e\' illeggibile scrivi [illeggibile]; se sei incerto fra due letture scrivi la piu\' probabile seguita da [?];',
  '- non aggiungere commenti, titoli o spiegazioni tue.',
  '',
  'Rispondi con il solo testo trascritto.',
].join('\n');

function cors(origin: string | null): HeadersInit {
  const allow = origin && ORIGINI.includes(origin) ? origin : ORIGINI[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const J = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors(o) } });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return J({ errore: 'metodo_non_ammesso' }, 405, origin);

  const SB_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1) Chi chiede. Serve una sessione vera: ogni chiamata costa.
  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) return J({ errore: 'sessione_mancante' }, 401, origin);
  const comeUtente = createClient(SB_URL, ANON, { global: { headers: { Authorization: authz } } });
  const { data: udata, error: uerr } = await comeUtente.auth.getUser();
  if (uerr || !udata?.user) return J({ errore: 'sessione_non_valida' }, 401, origin);

  const sb = createClient(SB_URL, SERVICE);
  const { data: puo } = await sb.rpc('has_ruolo_min', { p_utente_id: udata.user.id, p_livello_min: 25 });
  if (puo !== true) return J({ errore: 'riservato_ai_curatori' }, 403, origin);

  let c: { oggetto_tipo?: string; oggetto_id?: string; immagine_url?: string };
  try { c = await req.json(); } catch { return J({ errore: 'corpo_non_valido' }, 400, origin); }

  const oggetto_tipo = String(c.oggetto_tipo ?? '');
  const oggetto_id = String(c.oggetto_id ?? '');
  const immagine_url = String(c.immagine_url ?? '');
  if (!['storia', 'museo_pezzo', 'archivio'].includes(oggetto_tipo)) return J({ errore: 'oggetto_non_valido' }, 400, origin);
  if (!/^[0-9a-f-]{36}$/i.test(oggetto_id)) return J({ errore: 'identificativo_non_valido' }, 400, origin);
  // Solo immagini nostre: un indirizzo altrui trasformerebbe questa funzione in
  // un lettore di pagine per chiunque, a spese dell'Associazione.
  if (!/^https:\/\/wacknihvdjxltiqvxtqr\.supabase\.co\/storage\/v1\/object\/public\//.test(immagine_url)) {
    return J({ errore: 'immagine_non_nostra' }, 400, origin);
  }

  // 2) L'interruttore e il tetto, come dati.
  const { data: cfg } = await sb.from('config_app').select('chiave, valore')
    .in('chiave', ['ocr_attivo', 'ocr_tetto_mensile']);
  const leggi = (k: string) => (cfg ?? []).find((r: any) => r.chiave === k)?.valore;
  if (leggi('ocr_attivo') === false) return J({ errore: 'ocr_spento' }, 503, origin);
  const tetto = Number(leggi('ocr_tetto_mensile') ?? 200) || 200;

  const inizioMese = new Date();
  inizioMese.setUTCDate(1); inizioMese.setUTCHours(0, 0, 0, 0);
  const { count: fatte } = await sb.from('ocr_trascrizione')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', inizioMese.toISOString());
  if ((fatte ?? 0) >= tetto) {
    return J({ errore: 'tetto_mensile_raggiunto', fatte, tetto }, 429, origin);
  }

  // 3) Gia' fatta? Non si paga due volte la stessa pagina.
  const { data: gia } = await sb.from('ocr_trascrizione')
    .select('id, stato, testo')
    .eq('oggetto_tipo', oggetto_tipo).eq('oggetto_id', oggetto_id).eq('immagine_url', immagine_url)
    .maybeSingle();
  if (gia && (gia as any).stato !== 'fallita') {
    return J({ ok: true, gia_fatta: true, stato: (gia as any).stato, testo: (gia as any).testo }, 200, origin);
  }

  // 4) L'immagine, presa da noi.
  let bytes: Uint8Array; let mime: string;
  try {
    const img = await fetch(immagine_url);
    if (!img.ok) return J({ errore: 'immagine_non_raggiungibile', stato: img.status }, 404, origin);
    mime = img.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) return J({ errore: 'formato_non_supportato', mime }, 400, origin);
    bytes = new Uint8Array(await img.arrayBuffer());
  } catch (e) {
    return J({ errore: 'immagine_non_scaricata', dettaglio: String(e).slice(0, 160) }, 502, origin);
  }

  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  const b64 = btoa(bin);

  // 5) La trascrizione.
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return J({ errore: 'chiave_mancante' }, 500, origin);

  let testo = ''; let tin = 0; let tout = 0; let motivo = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELLO,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
            { type: 'text', text: ISTRUZIONE },
          ],
        }],
      }),
    });
    if (!r.ok) {
      motivo = 'HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300);
    } else {
      const d = await r.json();
      if (d.stop_reason === 'refusal') motivo = 'il modello ha rifiutato di trascrivere';
      testo = (d.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
      tin = d.usage?.input_tokens ?? 0;
      tout = d.usage?.output_tokens ?? 0;
      if (d.stop_reason === 'max_tokens') {
        // Si dice, invece di consegnare mezza pagina come se fosse tutta.
        motivo = 'testo troncato: la pagina e\' piu\' lunga dello spazio disponibile';
      }
    }
  } catch (e) {
    motivo = 'eccezione: ' + String(e).slice(0, 200);
  }

  const riuscita = testo.trim().length > 0;
  const riga = {
    oggetto_tipo, oggetto_id, immagine_url,
    testo: riuscita ? testo.trim() : null,
    testo_grezzo: riuscita ? testo.trim() : null,
    stato: riuscita ? 'da_rivedere' : 'fallita',
    errore: motivo || null,
    modello: MODELLO, token_in: tin, token_out: tout,
    chi: udata.user.id,
  };

  // Si scrive comunque, anche il fallimento: un tentativo che non lascia traccia
  // verrebbe rifatto all'infinito, pagandolo ogni volta.
  const { data: scritta, error } = await sb.from('ocr_trascrizione')
    .upsert(riga, { onConflict: 'oggetto_tipo,oggetto_id,immagine_url' })
    .select('id, stato')
    .maybeSingle();

  if (error || !scritta) {
    return J({ errore: 'scrittura_fallita', dettaglio: error?.message ?? 'nessuna riga' }, 500, origin);
  }

  return J({
    ok: riuscita,
    stato: (scritta as any).stato,
    testo: riuscita ? testo.trim() : null,
    avvertenza: motivo || null,
    token: { in: tin, out: tout },
    messaggio: riuscita
      ? 'Trascritta. Va riletta da una persona prima di comparire in pagina.'
      : 'Non sono riuscito a leggere questa immagine.',
  }, 200, origin);
});
