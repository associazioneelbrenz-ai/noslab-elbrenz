// salvataggio-settimanale — backup cifrato settimanale, gratuito
// Brief "Piano di salvataggio gratuito" (28/8/2026).
//
// Da quattro mesi il piano Supabase e' quello gratuito: nessun backup
// automatico gestito. Questa funzione copre META' del rischio (i dati delle
// 126 tabelle di `public` e l'INVENTARIO dello Storage, non i file). Le 68
// registrazioni audio delle parlate — la cosa piu' irrecuperabile di tutte —
// restano fuori da qui apposta: troppo pesanti per una edge function, vanno
// nel salvataggio mensile a mano (brief, sezione 4).
//
// COSA FA, IN ORDINE (l'ordine e' la sicurezza, non un dettaglio):
//   1. Controlla il gate x-ingest-token, come le altre pianificate.
//   2. Controlla che BACKUP_PUBKEY e le credenziali Google ci siano PRIMA di
//      leggere un solo dato: se manca qualcosa non ha senso interrogare 126
//      tabelle per poi buttare via il risultato.
//   3. Esporta ogni tabella di public in JSON, a lotti da 1000 righe.
//   4. Elenca (ricorsivamente) gli oggetti di ogni bucket Storage — percorso,
//      dimensione, etag — MAI il contenuto dei file.
//   5. Cifra tutto con age, a chiave pubblica (BACKUP_PUBKEY). Se la
//      cifratura fallisce per qualunque motivo, la funzione si ferma QUI:
//      nessun caricamento, meglio nessun backup che uno in chiaro.
//   6. Carica il file cifrato su Drive, cartella dedicata (service account
//      con accesso in scrittura SOLO a quella cartella — la sicurezza sta
//      nella condivisione fatta da Cristian sulla cartella, non nel codice).
//   7. Conservazione: tiene gli ultimi 8 file settimanali, cancella i piu'
//      vecchi. Non tocca nient'altro nella cartella (filtro per nome).
//   8. Scrive il battito, sia che sia andata bene sia che sia andata male.
//
// SEGRETI ATTESI (Supabase, project secrets — MAI in questa chat, MAI in git):
//   INGEST_TOKEN            — gia' in uso dalle altre pianificate
//   BACKUP_PUBKEY            — age1..., SOLO la chiave pubblica
//   GOOGLE_BACKUP_SA_EMAIL   — email della service account Drive
//   GOOGLE_BACKUP_SA_KEY     — private_key PEM (PKCS8) del JSON della service account
//   GOOGLE_BACKUP_FOLDER_ID  — id della cartella Drive "settimanali/" (NON la
//                              cartella dei salvataggi intera: solo quella e'
//                              condivisa con la service account)
//
// Nessuno di questi valori e' mai stato scritto in questa conversazione.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as age from 'npm:age-encryption@0.3.1';

const LOTTO_RIGHE = 1000;
const LOTTO_STORAGE = 1000;
const CONSERVA_ULTIMI = 8;
const PREFISSO_FILE = 'salvataggio-settimanale-';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---- firma JWT RS256, stesso helper gia' provato in wallet-google --------
function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firmaJwtRs256(payload: Record<string, unknown>, pemPkcs8: string): Promise<string> {
  const pem = pemPkcs8.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const enc = new TextEncoder();
  const testa = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const corpo = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${testa}.${corpo}`));
  return `${testa}.${corpo}.${b64url(new Uint8Array(sig))}`;
}

// ---- token Google via service account (OAuth2 JWT bearer) -----------------
async function otteniTokenGoogle(saEmail: string, saKeyPem: string): Promise<string> {
  const ora = Math.floor(Date.now() / 1000);
  const jwt = await firmaJwtRs256({
    iss: saEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ora,
    exp: ora + 3600,
  }, saKeyPem);

  const risposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!risposta.ok) throw new Error(`token Google fallito: ${await risposta.text()}`);
  const corpo = await risposta.json();
  return corpo.access_token as string;
}

// ---- Drive: carica, elenca, cancella --------------------------------------
async function caricaSuDrive(
  token: string, cartellaId: string, nomeFile: string, contenuto: Uint8Array,
): Promise<string> {
  const bordo = 'elbrenzbackup' + crypto.randomUUID();
  const metadata = JSON.stringify({ name: nomeFile, parents: [cartellaId] });
  const enc = new TextEncoder();
  const corpo = new Blob([
    enc.encode(`--${bordo}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    enc.encode(`--${bordo}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    contenuto,
    enc.encode(`\r\n--${bordo}--`),
  ]);
  const risposta = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${bordo}` },
    body: corpo,
  });
  if (!risposta.ok) throw new Error(`caricamento su Drive fallito: ${await risposta.text()}`);
  const dati = await risposta.json();
  return dati.id as string;
}

async function elencaFileCartella(
  token: string, cartellaId: string,
): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const q = encodeURIComponent(
    `'${cartellaId}' in parents and trashed = false and name contains '${PREFISSO_FILE}'`,
  );
  const risposta = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!risposta.ok) throw new Error(`elenco Drive fallito: ${await risposta.text()}`);
  const dati = await risposta.json();
  return dati.files ?? [];
}

async function cancellaFileDrive(token: string, fileId: string): Promise<void> {
  const risposta = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!risposta.ok && risposta.status !== 404) {
    throw new Error(`cancellazione Drive fallita: ${await risposta.text()}`);
  }
}

// ---- esportazione dati ------------------------------------------------
async function esportaTabelle(
  sb: ReturnType<typeof createClient>,
): Promise<{ tabelle: Record<string, unknown[]>; righeTotali: number; conteggioTabelle: number }> {
  const { data: nomi, error } = await sb.rpc('_salvataggio_elenco_tabelle');
  if (error) throw new Error(`elenco tabelle fallito: ${error.message}`);

  const tabelle: Record<string, unknown[]> = {};
  let righeTotali = 0;

  for (const nome of (nomi ?? []) as string[]) {
    const righe: unknown[] = [];
    let offset = 0;
    for (;;) {
      const { data, error: errSel } = await sb.from(nome).select('*').range(offset, offset + LOTTO_RIGHE - 1);
      if (errSel) throw new Error(`lettura di ${nome} fallita: ${errSel.message}`);
      righe.push(...(data ?? []));
      if (!data || data.length < LOTTO_RIGHE) break;
      offset += LOTTO_RIGHE;
    }
    tabelle[nome] = righe;
    righeTotali += righe.length;
  }

  return { tabelle, righeTotali, conteggioTabelle: Object.keys(tabelle).length };
}

// ---- inventario Storage (percorsi, dimensioni, etag — MAI i file) --------
type VoceInventario = { percorso: string; dimensione: number | null; etag: string | null };

async function elencaOggettiRicorsivo(
  sb: ReturnType<typeof createClient>, bucket: string, prefisso = '',
): Promise<VoceInventario[]> {
  const risultato: VoceInventario[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefisso, {
      limit: LOTTO_STORAGE, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`elenco di ${bucket}/${prefisso} fallito: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const voce of data) {
      const percorsoCompleto = prefisso ? `${prefisso}/${voce.name}` : voce.name;
      if (voce.id === null) {
        risultato.push(...await elencaOggettiRicorsivo(sb, bucket, percorsoCompleto));
      } else {
        risultato.push({
          percorso: percorsoCompleto,
          dimensione: (voce.metadata as Record<string, unknown> | null)?.size as number ?? null,
          etag: (voce.metadata as Record<string, unknown> | null)?.eTag as string ?? null,
        });
      }
    }
    if (data.length < LOTTO_STORAGE) break;
    offset += LOTTO_STORAGE;
  }
  return risultato;
}

async function inventarioStorage(
  sb: ReturnType<typeof createClient>,
): Promise<Record<string, VoceInventario[]>> {
  const { data: bucket, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`elenco bucket fallito: ${error.message}`);
  const inventario: Record<string, VoceInventario[]> = {};
  for (const b of bucket ?? []) {
    inventario[b.name] = await elencaOggettiRicorsivo(sb, b.name);
  }
  return inventario;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const atteso = Deno.env.get('INGEST_TOKEN');
  if (!atteso) return json({ error: 'INGEST_TOKEN non configurato' }, 500);
  if (req.headers.get('x-ingest-token') !== atteso) return json({ error: 'non autorizzato' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  async function fallisci(messaggio: string, dettaglio: Record<string, unknown> = {}): Promise<Response> {
    try {
      await sb.rpc('registra_battito', {
        p_servizio: 'salvataggio-settimanale', p_esito: 'errore',
        p_dettaglio: { errore: messaggio, ...dettaglio },
      });
    } catch (_) { /* il battito non deve mai rompere il lavoro */ }
    return json({ error: messaggio }, 500);
  }

  // Meglio fermarsi ora che dopo aver letto 126 tabelle per niente.
  const pubkey = Deno.env.get('BACKUP_PUBKEY');
  const saEmail = Deno.env.get('GOOGLE_BACKUP_SA_EMAIL');
  const saKey = Deno.env.get('GOOGLE_BACKUP_SA_KEY');
  const cartellaId = Deno.env.get('GOOGLE_BACKUP_FOLDER_ID');
  if (!pubkey) return await fallisci('BACKUP_PUBKEY non configurata: nessun salvataggio possibile senza cifratura.');
  if (!saEmail || !saKey || !cartellaId) {
    return await fallisci('Credenziali Google Drive non configurate (GOOGLE_BACKUP_SA_EMAIL / _SA_KEY / _FOLDER_ID).');
  }

  let tabelle: Record<string, unknown[]>;
  let righeTotali: number;
  let conteggioTabelle: number;
  let storage: Record<string, VoceInventario[]>;
  try {
    const esportazione = await esportaTabelle(sb);
    tabelle = esportazione.tabelle;
    righeTotali = esportazione.righeTotali;
    conteggioTabelle = esportazione.conteggioTabelle;
    storage = await inventarioStorage(sb);
  } catch (e) {
    return await fallisci(`esportazione fallita: ${(e as Error).message}`);
  }

  const payload = JSON.stringify({
    generato_il: new Date().toISOString(),
    tabelle,
    storage_inventario: storage,
  });

  // La cifratura e' l'unico punto in cui, se qualcosa va storto, non si
  // carica NIENTE: e' la regola esplicita del brief, non un dettaglio.
  let cifrato: Uint8Array;
  try {
    const e = new age.Encrypter();
    e.addRecipient(pubkey);
    cifrato = await e.encrypt(payload);
  } catch (err) {
    return await fallisci(`cifratura fallita: ${(err as Error).message}`, { tabelle: conteggioTabelle, righe_totali: righeTotali });
  }

  const nomeFile = `${PREFISSO_FILE}${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json.age`;

  let cancellati: string[] = [];
  try {
    const token = await otteniTokenGoogle(saEmail, saKey);
    await caricaSuDrive(token, cartellaId, nomeFile, cifrato);

    const esistenti = await elencaFileCartella(token, cartellaId);
    esistenti.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
    const daCancellare = esistenti.length > CONSERVA_ULTIMI ? esistenti.slice(0, esistenti.length - CONSERVA_ULTIMI) : [];
    for (const f of daCancellare) {
      await cancellaFileDrive(token, f.id);
      cancellati.push(f.name);
    }
  } catch (err) {
    return await fallisci(`caricamento su Drive fallito: ${(err as Error).message}`, {
      tabelle: conteggioTabelle, righe_totali: righeTotali, dimensione_byte: cifrato.length,
    });
  }

  const dettaglio = {
    tabelle: conteggioTabelle,
    righe_totali: righeTotali,
    dimensione_byte: cifrato.length,
    file: nomeFile,
    cancellati_per_conservazione: cancellati,
  };
  try {
    await sb.rpc('registra_battito', { p_servizio: 'salvataggio-settimanale', p_esito: 'ok', p_dettaglio: dettaglio });
  } catch (_) { /* il battito non deve mai rompere il lavoro */ }

  return json({ ok: true, ...dettaglio });
});
