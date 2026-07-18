import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// push-config (18/7/2026) — espone la VAPID PUBLIC KEY al client (e' pubblica per
// definizione: e' l'applicationServerKey dell'iscrizione push). La leggiamo dal
// secret server VAPID_PUBLIC_KEY cosi' il client non deve averla nel build .env
// (che, deployando da locale, tende a disallinearsi). La private key NON esce mai.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "http://localhost:3000",
];

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve((req: Request) => {
  const CORS = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  return new Response(JSON.stringify({ publicKey }), {
    status: 200, headers: { "Content-Type": "application/json", ...CORS },
  });
});
