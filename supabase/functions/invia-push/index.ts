import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// invia-push (18/7/2026) — consegna Web Push (VAPID) su INSERT di `notifica`.
//
// INNESCO: Database Webhook Supabase su public.notifica INSERT → questa edge.
// Passi: 1) rispetta notifica_preferenza(utente_id, tipo).push (assenza=attiva);
// 2) calcola il badge = conteggio notifiche NON lette del destinatario;
// 3) invia a tutti i push_token attivi con web-push + VAPID; 4) su 404/410
// disattiva il token morto. Usa la SERVICE ROLE (legge token/preferenze altrui).
//
// PREREQUISITI (Cristian): secret VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
// VAPID_SUBJECT; e il Database Webhook che punta qui. Senza VAPID la funzione
// esce pulita (nessun invio), cosi' e' sicura anche se innescata prima del setup.
//
// SICUREZZA: il webhook va configurato con un header segreto condiviso
// (X-Webhook-Secret = PUSH_WEBHOOK_SECRET) OPPURE deployata con verify_jwt e
// Authorization col service key. Qui verifichiamo l'header segreto se presente.

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@elbrenz.eu";
  const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

  // Difesa: se e' impostato un secret condiviso, l'header deve combaciare.
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-webhook-secret") ?? "";
    if (got !== WEBHOOK_SECRET) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    // Setup non ancora completato: esce senza errore (nessun invio).
    return new Response(JSON.stringify({ ok: true, skipped: "vapid_not_configured" }), { status: 200 });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  let payloadReq: any;
  try { payloadReq = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 }); }
  // Il webhook Supabase manda { type, table, record, old_record }.
  const rec = payloadReq?.record ?? payloadReq;
  const utente_id: string | undefined = rec?.utente_id;
  const tipo: string = rec?.tipo ?? "comunita";
  if (!utente_id) return new Response(JSON.stringify({ error: "no_utente" }), { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE);

  // 1) Preferenza push per tipo (assenza = attiva).
  const { data: pref } = await admin
    .from("notifica_preferenza")
    .select("push").eq("utente_id", utente_id).eq("tipo", tipo).maybeSingle();
  if (pref && pref.push === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "pref_off" }), { status: 200 });
  }

  // 2) Badge = notifiche non lette del destinatario.
  const { count: unread } = await admin
    .from("notifica").select("id", { count: "exact", head: true })
    .eq("utente_id", utente_id).eq("letta", false);
  const badge = unread ?? 0;

  // 3) Token attivi del destinatario.
  const { data: tokens } = await admin
    .from("push_token").select("id, token").eq("utente_id", utente_id).eq("attivo", true);
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, badge }), { status: 200 });
  }

  const body = JSON.stringify({
    titolo: rec?.titolo ?? "El Brenz",
    corpo: rec?.corpo ?? "",
    url: rec?.url ?? "/app",
    tipo,
    badge,
  });

  let inviati = 0;
  const morti: string[] = [];
  for (const row of tokens as { id: string; token: string }[]) {
    let sub: unknown;
    try { sub = JSON.parse(row.token); } catch { morti.push(row.id); continue; }
    try {
      await webpush.sendNotification(sub as webpush.PushSubscription, body);
      inviati++;
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) morti.push(row.id); // subscription scaduta/rimossa
    }
  }
  if (morti.length) {
    await admin.from("push_token").update({ attivo: false }).in("id", morti);
  }

  return new Response(JSON.stringify({ ok: true, sent: inviati, disattivati: morti.length, badge }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
