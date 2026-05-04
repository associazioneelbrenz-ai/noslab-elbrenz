import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function emailHtml(codice: string, scope: string): string {
  const scopeLabel = {
    login: "accedere al tuo account",
    signup: "confermare la registrazione",
    recovery: "recuperare il tuo account",
    email_change: "cambiare l'indirizzo email",
  }[scope] ?? "accedere al tuo account";

  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><title>El Brenz - Codice di accesso</title></head>
<body style="font-family: -apple-system, system-ui, sans-serif; background:#f5f1ea; padding:24px; color:#2a2620;">
  <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <h1 style="color:#8b2a1e; font-size:22px; margin:0 0 8px 0;">El Brenz · Codice di accesso</h1>
    <p style="color:#5a5248; margin:0 0 24px 0; font-size:15px;">Associazione Storico Culturale Linguistica delle Valli del Noce</p>
    <p style="font-size:16px; line-height:1.6;">Ciao, hai richiesto di ${scopeLabel}. Usa questo codice per procedere:</p>
    <div style="background:#f5f1ea; border-radius:8px; padding:20px; text-align:center; margin:20px 0;">
      <div style="font-size:36px; font-weight:700; letter-spacing:8px; color:#8b2a1e; font-family: 'SF Mono', Monaco, Menlo, monospace;">${codice}</div>
    </div>
    <p style="color:#5a5248; font-size:14px; line-height:1.6;">Il codice è valido per <strong>10 minuti</strong>. Non condividerlo con nessuno: nessun membro dell'Associazione te lo chiederà mai.</p>
    <p style="color:#5a5248; font-size:14px; line-height:1.6;">Se non sei stato tu a richiedere questo codice, puoi ignorare questa email in tutta tranquillità.</p>
    <hr style="border:none; border-top:1px solid #eae3d7; margin:32px 0 16px;"/>
    <p style="color:#8a8278; font-size:12px; margin:0;"><em>Radici profonde non gelano</em> · <a href="https://www.elbrenz.eu" style="color:#8b2a1e;">www.elbrenz.eu</a></p>
  </div>
</body></html>`;
}

function emailText(codice: string): string {
  return `El Brenz · Codice di accesso: ${codice}\n\nIl codice è valido per 10 minuti. Non condividerlo con nessuno.\nSe non hai richiesto questo codice, ignora questa email.\n\n-- \nAssociazione Storico Culturale Linguistica El Brenz\nhttps://www.elbrenz.eu`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });

  let body: { email?: string; scope?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: CORS }); }

  const email = (body.email ?? "").trim().toLowerCase();
  const scope = body.scope ?? "login";

  if (!isValidEmail(email)) return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: CORS });
  if (!["login", "signup", "recovery", "email_change"].includes(scope))
    return new Response(JSON.stringify({ error: "invalid_scope" }), { status: 400, headers: CORS });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return new Response(JSON.stringify({ error: "missing_resend_key" }), { status: 500, headers: CORS });

  // IP e User-Agent per audit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  // Genera OTP via RPC (torna codice in chiaro solo qui, mai al client)
  const { data: otpData, error: otpErr } = await supabase.rpc("genera_otp", {
    p_email: email, p_scope: scope, p_ttl_min: 10, p_max_tentativi: 3,
    p_ip: ip, p_user_agent: ua,
  });
  if (otpErr || !otpData || otpData.length === 0) {
    return new Response(JSON.stringify({ error: "genera_otp_failed", detail: otpErr?.message }), { status: 500, headers: CORS });
  }
  const { otp_id, codice_chiaro } = otpData[0];

  // Invia email via Resend
  const sender = "El Brenz <accesso@elbrenz.eu>";
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender,
      to: email,
      subject: `El Brenz · Codice di accesso: ${codice_chiaro}`,
      html: emailHtml(codice_chiaro, scope),
      text: emailText(codice_chiaro),
      headers: { "X-Entity-Ref-ID": otp_id },
    }),
  });

  if (!resendRes.ok) {
    const errTxt = await resendRes.text();
    return new Response(JSON.stringify({
      error: "email_send_failed", status: resendRes.status, detail: errTxt.slice(0, 400),
    }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({
    ok: true,
    otp_id,
    ttl_sec: 600,
    message: "Codice inviato. Controlla la tua email (anche spam).",
  }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
});
