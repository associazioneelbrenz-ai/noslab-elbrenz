// glossario-audio — la voce della parola (10 agosto 2026).
//
// PERCHE' ESISTE. La grafia del ladino anaunico non e' normalizzata: chi legge
// «Barbustel» non sa come suona. Con la pronuncia accanto quel dubbio sparisce,
// e il dizionario serve anche a chi la lingua la vuole imparare.
//
// E c'e' la conseguenza piu' importante: l'archivio delle voci comincia a
// riempirsi senza che nessuno organizzi interviste. Oggi e' a zero su
// centoquarantasei parole e aspetta i regolani. Con la registrazione dentro il
// modulo, ogni parola puo' portarsi dietro la propria voce.
//
// PERCHE' PASSA DA QUI E NON DALLO STORAGE. Chi propone una parola non e'
// loggato: non ha nessun token, e lo Storage non accetta scritture anonime.
// Percio' si scrive con la chiave di servizio, dopo aver controllato che il
// lemma esista, che il formato sia davvero un file sonoro e che il consenso
// sia in ordine.
//
// I FORMATI: tutti quelli che escono da un telefono. Gli iPhone producono m4a
// con codifica AAC (e a volte lo dichiarano video/mp4), Android e Chrome
// producono webm con Opus, poi ci sono mp3, wav, ogg, 3gp, caf, amr.
// Accettarne solo uno significa escludere meta' delle persone, ed e'
// esattamente l'errore che ha fatto perdere le fotografie del museo per un
// mese quando il contenitore rifiutava il formato degli iPhone.
//
// NIENTE ENTRA NEL GLOSSARIO DA SOLO. La riga nasce con stato «in_attesa»: un
// audio si ascolta prima di pubblicarlo, come si legge una definizione. Il
// lemma NON viene agganciato qui: lo aggancia il curatore dalla console dopo
// aver ascoltato.
//
// AUDIT 25/8/2026 (SIC-06). Il file nasce nel bucket PRIVATO
// glossario-audio-attesa, non in quello pubblico: prima che un curatore
// ascolti e decida, nessuno con il solo indirizzo può sentirlo. Alla
// pubblicazione, glossario-audio-revisione lo sposta nel bucket pubblico —
// mai prima. Le 58 registrazioni già in attesa migrate separatamente.
//
// POST MORTEM 26/8/2026. Qui si scriveva `file_url` con getPublicUrl() su un
// bucket privato: un indirizzo "public" che per un bucket privato non può
// funzionare, per costruzione — non è un problema di permessi, è il tipo di
// endpoint sbagliato. Un indirizzo memorizzato è la fotografia di un
// momento; quello che non cambia è DOVE sta il file. Ora si scrivono
// `bucket` e `file_path`, e l'indirizzo si costruisce al momento dell'uso
// (glossario-audio-revisione), mai qui e mai prima del bisogno.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://elbrenz.eu', 'https://www.elbrenz.eu', 'https://elbrenz-app.netlify.app',
  'https://community.elbrenz.eu', 'https://app.elbrenz.eu',
  'http://localhost:4321', 'http://localhost:5173', 'http://localhost:3000',
];

const BUCKET = 'glossario-audio-attesa'; // audit SIC-06 (25/8/2026): privato finché non pubblicata
// Sei megabyte: un termine sono tre secondi, una frase venti. Chi arriva a sei
// mega non sta registrando una parola.
const MAX_BYTES = 6 * 1024 * 1024;
// Non e' un archivio di interviste, quello e' un'altra cosa (il kit dei
// regolani). Novanta secondi sono gia' generosi per una frase.
const MAX_SECONDI = 90;
const RATE_MAX = 10;

function cors(origin: string | null): Record<string, string> {
  const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Vary': 'Origin',
  };
}
const J = (b: unknown, s: number, c: Record<string, string>) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...c, 'Content-Type': 'application/json' } });

async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Il contenuto vero decide, non quello che il browser dichiara: su iOS il tipo
 * arriva spesso vuoto o come `video/mp4`, e fidarsi dell'etichetta vorrebbe
 * dire respingere proprio i telefoni di chi ha ottant'anni.
 */
function sniff(b: Uint8Array): { ext: string; mime: string } | null {
  const ascii = (i: number, s: string) =>
    b.length > i + s.length && s.split('').every((ch, k) => b[i + k] === ch.charCodeAt(0));

  // OggS — Ogg Vorbis / Opus (Firefox, Android)
  if (ascii(0, 'OggS')) return { ext: 'ogg', mime: 'audio/ogg' };
  // EBML 1A 45 DF A3 — WebM/Matroska (Chrome, Android)
  if (b.length > 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) {
    return { ext: 'webm', mime: 'audio/webm' };
  }
  // RIFF....WAVE
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return { ext: 'wav', mime: 'audio/wav' };
  // fLaC
  if (ascii(0, 'fLaC')) return { ext: 'flac', mime: 'audio/flac' };
  // ID3 oppure frame sync MPEG (FF Ex / FF Fx)
  if (ascii(0, 'ID3')) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (b.length > 2 && b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return { ext: 'mp3', mime: 'audio/mpeg' };
  // caff — Core Audio Format, esce da certe app iOS
  if (ascii(0, 'caff')) return { ext: 'caf', mime: 'audio/x-caf' };
  // #!AMR — registratori Android vecchi
  if (ascii(0, '#!AMR')) return { ext: 'amr', mime: 'audio/amr' };
  // ISO-BMFF: 'ftyp' a offset 4. Qui dentro ci sono m4a (iPhone), mp4 e 3gp.
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (brand.startsWith('3g')) return { ext: '3gp', mime: 'audio/3gpp' };
    // M4A, mp42, isom, qt... Safari registra m4a e lo dichiara video/mp4.
    return { ext: 'm4a', mime: 'audio/mp4' };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const c = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: c });
  if (req.method !== 'POST') return J({ errore: 'metodo_non_ammesso' }, 405, c);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return J({ errore: 'origine_non_consentita' }, 403, c);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Tetto per indirizzo. Fallisce APERTO: qui l'unica cosa in gioco e' una
  // registrazione che non tornera' mai piu', e perderla per un guasto del
  // contatore sarebbe il danno peggiore fra i due.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto';
  try {
    const ipHash = await sha256Hex(`glossario-audio:${ip}`);
    const { data: entro } = await sb.rpc('convenzioni_rl_hit', { p_ip_hash: ipHash, p_max: RATE_MAX });
    if (entro === false) return J({ errore: 'troppe_registrazioni' }, 429, c);
  } catch { /* fail-open, di proposito */ }

  let form: FormData;
  try { form = await req.formData(); } catch { return J({ errore: 'corpo_non_valido' }, 400, c); }

  const s = (k: string, max = 200) => String(form.get(k) ?? '').trim().slice(0, max);
  const lemma_id = s('lemma_id', 40);
  const vociAltri = s('voce_di_altri', 10) === 'true';
  const nomeParlante = s('nome_parlante', 120) || null;
  const consensoParlante = s('consenso_parlante', 10) === 'true';
  const anonimo = s('anonimo', 10) === 'true';
  const portatoDaNome = s('portato_da_nome', 120) || null;
  const portatoDaEmail = s('portato_da_email', 200).toLowerCase() || null;
  const durata = Math.min(Math.max(parseInt(s('durata', 8), 10) || 0, 0), MAX_SECONDI * 2);
  const mimeDichiarato = s('mime', 80) || null;

  if (!/^[0-9a-f-]{36}$/i.test(lemma_id)) return J({ errore: 'lemma_non_valido' }, 400, c);

  // IL CONSENSO, che qui e' la parte delicata. Chi registra la propria voce
  // acconsente con l'atto stesso. Chi registra la voce di un altro no: se un
  // socio registra il nonno, il consenso lo da' il nonno.
  if (vociAltri) {
    if (!nomeParlante) return J({ errore: 'serve_il_nome_di_chi_parla' }, 400, c);
    if (!consensoParlante) return J({ errore: 'serve_il_consenso_di_chi_parla' }, 400, c);
  }

  const file = form.get('audio');
  if (!(file instanceof File)) return J({ errore: 'nessun_file' }, 400, c);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) return J({ errore: 'file_vuoto' }, 400, c);
  if (bytes.length > MAX_BYTES) {
    return J({ errore: 'file_troppo_grande', dettaglio: 'Una registrazione puo\' pesare al massimo 6 MB.' }, 413, c);
  }

  const tipo = sniff(bytes);
  if (!tipo) {
    return J({
      errore: 'formato_non_riconosciuto',
      dettaglio: 'Non riconosco questo file come audio. Vanno bene m4a, mp3, wav, webm, ogg, 3gp: praticamente tutto quello che esce da un telefono.',
    }, 400, c);
  }

  // Il lemma deve esistere. Si accettano sia le voci appena proposte sia
  // quelle gia' pubblicate: chi manda una parola oggi puo' ricordarsi la
  // pronuncia la settimana prossima, e deve poterla aggiungere senza rifare
  // tutto.
  const { data: lemma } = await sb.from('dizionario_lemma')
    .select('id, lemma, tipo, parlata, comune, stato, contributore_id')
    .eq('id', lemma_id).maybeSingle();
  if (!lemma) return J({ errore: 'lemma_non_trovato' }, 404, c);
  if (!['in_revisione', 'pubblicato', 'validato'].includes(lemma.stato)) {
    return J({ errore: 'lemma_non_accetta_voce' }, 409, c);
  }

  const path = `${lemma_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${tipo.ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET)
    .upload(path, bytes, { contentType: tipo.mime, upsert: false });
  if (upErr) return J({ errore: 'caricamento_fallito', dettaglio: upErr.message }, 500, c);

  // I due vocabolari di `archivio_audio` esistono dal principio e vanno
  // rispettati, non allargati per comodita': `categoria_audio` ammette parola,
  // proverbio, racconto, canto, intervista, cantilena, preghiera, altro; la
  // `parlata` ammette le quattro piu' «altra». Il tipo del lemma (parola,
  // frase, espressione) non e' la stessa cosa, quindi si traduce.
  const CATEGORIE_AUDIO = ['parola', 'proverbio', 'racconto', 'canto', 'intervista', 'cantilena', 'preghiera', 'altro'];
  const PARLATE_AUDIO = ['noneso', 'solander', 'rabies', 'pegaes', 'altra'];
  const categoria = CATEGORIE_AUDIO.includes(lemma.tipo ?? '') ? lemma.tipo : 'altro';
  const parlata = PARLATE_AUDIO.includes(lemma.parlata ?? '') ? lemma.parlata : 'altra';

  // Si dichiara riuscito solo cio' che ha restituito una riga: e' la regola che
  // questo progetto ha imparato a sue spese, il 6 agosto, con quindici lemmi
  // dati per pubblicati e nessuno cambiato a database.
  const { data: riga, error } = await sb.from('archivio_audio').insert({
    titolo: lemma.lemma,
    termine_ladino: lemma.lemma,
    categoria_audio: categoria,
    parlata,
    comune_parlante: lemma.comune,
    bucket: BUCKET,
    file_path: path,
    durata_secondi: durata || null,
    formato_audio: tipo.ext,
    mime_originale: mimeDichiarato,
    lemma_id,
    contributore_id: lemma.contributore_id,
    voce_di_altri: vociAltri,
    nome_parlante: vociAltri ? nomeParlante : (anonimo ? null : portatoDaNome),
    consenso_parlante: vociAltri ? consensoParlante : true,
    anonimo,
    portato_da_nome: portatoDaNome,
    portato_da_email: portatoDaEmail,
    registrato_il: new Date().toISOString().slice(0, 10),
    stato: 'in_attesa',
    visibile_ospiti: false,
  }).select('id').maybeSingle();

  if (error || !riga) {
    // Il file e' gia' nel contenitore: si toglie, altrimenti resta un audio
    // orfano che nessuno sapra' mai a chi apparteneva.
    await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    return J({ errore: 'scrittura_fallita', dettaglio: error?.message ?? 'nessuna riga' }, 500, c);
  }

  return J({
    ok: true,
    id: riga.id,
    messaggio: 'Grazie: la tua voce è arrivata. Un curatore la ascolta e, se va bene, la mette sotto la parola.',
  }, 200, c);
});
