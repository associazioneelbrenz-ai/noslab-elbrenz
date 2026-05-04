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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });

  let body: { email?: string; codice?: string; scope?: string; nome?: string; cognome?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: CORS }); }

  const email = (body.email ?? "").trim().toLowerCase();
  const codice = (body.codice ?? "").trim();
  const scope = body.scope ?? "login";

  if (!isValidEmail(email)) return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: CORS });
  if (!/^\d{6}$/.test(codice)) return new Response(JSON.stringify({ error: "invalid_code_format" }), { status: 400, headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Verifica OTP
  const { data: verifyData, error: verifyErr } = await supabase.rpc("verifica_otp", {
    p_email: email, p_codice: codice, p_scope: scope,
  });
  if (verifyErr) return new Response(JSON.stringify({ error: "verify_rpc_failed", detail: verifyErr.message }), { status: 500, headers: CORS });
  if (!verifyData || verifyData.length === 0 || !verifyData[0].valido) {
    const motivo = verifyData?.[0]?.motivo ?? "sconosciuto";
    return new Response(JSON.stringify({ ok: false, motivo }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  }

  // 2. Recupero o creo user in auth.users
  let userId: string | null = null;
  const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  // listUsers non filtra per email: devo fare ricerca via db
  const { data: utenteRow } = await supabase
    .from("utente").select("id, email").eq("email", email).maybeSingle();

  if (utenteRow) {
    userId = utenteRow.id;
  } else {
    // signup: creo auth user + record in public.utente
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email, email_confirm: true,
      user_metadata: { nome: body.nome ?? null, cognome: body.cognome ?? null, via_otp: true },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: "create_user_failed", detail: createErr?.message }), { status: 500, headers: CORS });
    }
    userId = created.user.id;

    // Inserisco in public.utente (trigger potrebbe già gestirlo, ma faccio upsert per sicurezza)
    await supabase.from("utente").upsert({
      id: userId, email,
      nome: body.nome ?? "", cognome: body.cognome ?? "",
    }, { onConflict: "id" });

    // Assegno ruolo base 'ospite'
    const { data: ruoloOspite } = await supabase.from("ruolo").select("id").eq("nome", "ospite").single();
    if (ruoloOspite) {
      await supabase.from("utente_ruolo").upsert({
        utente_id: userId, ruolo_id: ruoloOspite.id,
      }, { onConflict: "utente_id,ruolo_id" });
    }
  }

  // 3. Genera session Supabase via magiclink admin + verify chain
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink", email,
  });
  if (linkErr || !linkData.properties?.action_link) {
    return new Response(JSON.stringify({ error: "generate_link_failed", detail: linkErr?.message }), { status: 500, headers: CORS });
  }

  // 4. Faccio fetch sull'action_link per ottenere i token.
  // L'action_link è del tipo: https://PROJ.supabase.co/auth/v1/verify?token=XXX&type=magiclink&redirect_to=YYY
  // La risposta è un 303 con Location: YYY#access_token=...&refresh_token=...&expires_in=...&token_type=bearer
  const actionLink = linkData.properties.action_link;
  const verifyRes = await fetch(actionLink, {
    method: "GET",
    redirect: "manual",
    headers: { "apikey": SERVICE_KEY },
  });

  if (verifyRes.status !== 303 && verifyRes.status !== 302) {
    return new Response(JSON.stringify({
      error: "verify_link_failed",
      status: verifyRes.status,
      detail: (await verifyRes.text()).slice(0, 300),
    }), { status: 500, headers: CORS });
  }

  const location = verifyRes.headers.get("location") ?? "";
  const hashIdx = location.indexOf("#");
  if (hashIdx === -1) {
    return new Response(JSON.stringify({ error: "no_hash_in_redirect", location: location.slice(0, 200) }), { status: 500, headers: CORS });
  }
  const hashParams = new URLSearchParams(location.slice(hashIdx + 1));
  const access_token = hashParams.get("access_token");
  const refresh_token = hashParams.get("refresh_token");
  const expires_in = Number(hashParams.get("expires_in") ?? "3600");

  if (!access_token || !refresh_token) {
    return new Response(JSON.stringify({ error: "tokens_not_found", location: location.slice(0, 200) }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({
    ok: true,
    user_id: userId,
    email,
    session: { access_token, refresh_token, expires_in, token_type: "bearer" },
  }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
});
