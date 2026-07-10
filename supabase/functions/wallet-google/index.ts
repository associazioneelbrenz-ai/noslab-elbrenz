// wallet-google — link "Save to Google Wallet" per la tessera socio
// (M5.5 Fase B — PREDISPOSTA, NON LIVE).
//
// GET /wallet-google/{codice} → 302 a https://pay.google.com/gp/v/save/{jwt}
//
// DORMIENTE finché WALLET_GOOGLE_LIVE !== 'true' (risponde 503). Per andare
// live servono i passi di Cristian sulla Google Wallet Console (vedi handoff)
// e questi secrets Supabase:
//   GOOGLE_WALLET_ISSUER_ID  — Issuer ID dalla Wallet Console
//   GOOGLE_WALLET_SA_EMAIL   — email della service account (…@…iam.gserviceaccount.com)
//   GOOGLE_WALLET_SA_KEY     — private_key PEM (PKCS8) dal JSON della service account
//
// Il JWT è "skinny": classe Generic + oggetto inline nel payload firmato
// RS256 — nessuna chiamata alla Wallet REST API a runtime. Il QR nel pass
// contiene la stessa URL di verifica https://elbrenz.eu/tessera/{codice}.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITO = 'https://elbrenz.eu';

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  if (Deno.env.get('WALLET_GOOGLE_LIVE') !== 'true') {
    return new Response(JSON.stringify({ error: 'Google Wallet non ancora attivo' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
  const saEmail = Deno.env.get('GOOGLE_WALLET_SA_EMAIL');
  const saKey = Deno.env.get('GOOGLE_WALLET_SA_KEY');
  if (!issuerId || !saEmail || !saKey) {
    return new Response(JSON.stringify({ error: 'Credenziali Google Wallet non configurate' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const m = new URL(req.url).pathname.match(/\/(\d{1,6}-\d{4}-[0-9a-f]{24})\/?$/);
  if (!m) return new Response('Not found', { status: 404 });
  const codice = m[1];

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: socio } = await supabase.from('domande_tesseramento')
    .select('nome, numero_tessera, anno')
    .eq('codice_tessera', codice)
    .eq('stato', 'approvata')
    .maybeSingle();
  if (!socio) return new Response('Tessera non trovata', { status: 404 });

  const urlVerifica = `${SITO}/tessera/${codice}`;
  const classId = `${issuerId}.elbrenz_tessera_socio`;
  const objectId = `${issuerId}.tessera_${socio.numero_tessera}_${socio.anno}`;

  const jwt = await firmaJwtRs256({
    iss: saEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [SITO],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [{
        id: objectId,
        classId,
        state: 'ACTIVE',
        hexBackgroundColor: '#1E2E26',
        logo: { sourceUri: { uri: `${SITO}/logo-eb-footer@2x.png` } },
        cardTitle: { defaultValue: { language: 'it', value: 'El Brenz dle Val del Nos' } },
        subheader: { defaultValue: { language: 'it', value: `Tessera socio · anno ${socio.anno}` } },
        header: { defaultValue: { language: 'it', value: socio.nome } },
        textModulesData: [
          { id: 'numero', header: 'Tessera', body: `N. ${socio.numero_tessera}` },
          { id: 'motto', header: 'Raìs fonde no le ’nglacia', body: 'Radici profonde non gelano' },
          { id: 'validita', header: 'Validità', body: `fino al 31/12/${socio.anno}` },
        ],
        barcode: { type: 'QR_CODE', value: urlVerifica, alternateText: `N. ${socio.numero_tessera}` },
        linksModuleData: { uris: [{ uri: urlVerifica, description: 'Verifica in tempo reale' }] },
      }],
    },
  }, saKey);

  return new Response(null, {
    status: 302,
    headers: { Location: `https://pay.google.com/gp/v/save/${jwt}` },
  });
});
