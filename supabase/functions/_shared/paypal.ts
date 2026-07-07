// _shared/paypal.ts — helper comuni per le edge function PayPal (M2.6).
//
// PAYPAL_ENV decide l'endpoint API: 'live' → api-m.paypal.com, qualunque
// altro valore → sandbox. Le credenziali stanno SOLO nei Supabase Edge
// Function Secrets (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
// PAYPAL_WEBHOOK_ID); mai nel codice.
//
// CORS: stessa whitelist multi-origin di contact-form (trappola 9 CLAUDE.md:
// sia elbrenz.eu sia elbrenz-app.netlify.app devono essere accettate).

export const ALLOWED_ORIGINS = [
  'https://elbrenz-app.netlify.app',
  'https://elbrenz.eu',
  'https://www.elbrenz.eu',
  'http://localhost:4321', // Astro dev default
  'http://localhost:3000', // dev alt
];

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

export function isOriginAllowed(origin: string | null): boolean {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

export function paypalApiBase(): string {
  return Deno.env.get('PAYPAL_ENV') === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

/** Access token PayPal via client_credentials. Lancia se secrets mancanti. */
export async function paypalAccessToken(): Promise<string> {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET non configurati nei secrets');
  }
  const resp = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`PayPal oauth fallita: ${resp.status} ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.access_token as string;
}

export function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
