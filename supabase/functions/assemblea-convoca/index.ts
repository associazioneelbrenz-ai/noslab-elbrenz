import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// assemblea-convoca (11/8/2026) — la convocazione dell'assemblea.
//
// Le regole vengono dallo statuto, non dal prodotto, e questa funzione le fa
// rispettare invece di sperare che chi compila se le ricordi:
//
//   1. SI CONVOCANO TUTTI GLI ASSOCIATI NON CESSATI, in regola con la quota o
//      no. Il diritto a essere chiamati non dipende dal versamento, e una
//      convocazione mancata rende l'assemblea contestabile. Chi vota e chi va
//      convocato sono due elenchi diversi: qui serve il primo.
//   2. LUOGO, GIORNO E ORA DI PRIMA E DI SECONDA CONVOCAZIONE, e ORDINE DEL
//      GIORNO. Sono requisiti statutari: senza uno dei tre non si spedisce.
//   3. LA CONVOCAZIONE DEVE PERVENIRE quindici giorni prima, non essere
//      spedita. Il conto lo fa `convocazione_termine` sul database, la stessa
//      funzione che il pannello mostra a schermo: due conti sulla stessa cosa
//      prima o poi divergono.
//   4. CANALE ISTITUZIONALE, senza collegamento di disiscrizione. Una
//      convocazione non e' una newsletter, e un socio che si disiscrivesse per
//      sbaglio renderebbe impugnabile l'assemblea.
//   5. LE CASELLE CONDIVISE ricevono UN MESSAGGIO SOLO con i nomi di entrambi
//      i soci nel corpo, cosi' la convocazione vale per tutti e due.
//   6. LA PROVA CONSERVA LA PERSONA, non l'indirizzo, e il CONTENUTO ESATTO
//      inviato. Non un riferimento a un modello che fra due anni sara' diverso.
//      Quelle righe non si cancellano mai.
//
// GIRO A VUOTO DI DEFAULT: senza `modo: "invia"` non scrive e non spedisce.
// Dice chi riceverebbe cosa e mostra il testo. Nessuna convocazione parte senza
// il via esplicito del segretario.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "http://localhost:3000",
  "http://localhost:5173",
];

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function dataEstesa(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function oraBreve(t: string | null | undefined): string {
  return String(t ?? "").slice(0, 5);
}

type Corpo = {
  modo?: "prova" | "invia";
  tipo?: "assemblea_ordinaria" | "assemblea_straordinaria";
  assemblea_il?: string;
  luogo?: string;
  ora_prima?: string;
  ora_seconda?: string;
  ordine_del_giorno?: string;
  oggetto?: string;
  riunione_id?: string | null;
  /** Quanti giorni durera' l'invio: il termine si conta sull'ultimo che riceve. */
  giorni_invio?: number;
};

/**
 * Il testo della convocazione.
 *
 * `nomi` sono i soci che rispondono a QUELL'indirizzo: se sono due, la
 * convocazione li nomina entrambi ed e' valida per tutti e due. E' la regola
 * gia' stabilita per le caselle condivise, e qui e' il punto in cui si applica.
 */
function convocazioneHtml(p: {
  nomi: string[];
  tipoEsteso: string;
  assemblea_il: string;
  luogo: string;
  ora_prima: string;
  ora_seconda: string;
  ordine_del_giorno: string;
}): string {
  const saluto = p.nomi.length > 1
    ? `Cari ${p.nomi.slice(0, -1).map(esc).join(", ")} e ${esc(p.nomi[p.nomi.length - 1])}`
    : `Caro socio ${esc(p.nomi[0] ?? "")}`.trim();

  const perEntrambi = p.nomi.length > 1
    ? `<p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 16px;padding:8px 12px;background:#F8F1E4;border-radius:6px;">
         Questa convocazione arriva a un indirizzo condiviso e vale per tutti i soci qui nominati:
         <strong>${p.nomi.map(esc).join(", ")}</strong>. Ognuno ha diritto a un voto.
       </p>`
    : "";

  const punti = p.ordine_del_giorno
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => `<li style="margin:0 0 6px;">${esc(r.replace(/^\s*[-*•]\s*/, "").replace(/^\d+[.)]\s*/, ""))}</li>`)
    .join("");

  return `<!DOCTYPE html><html><head>
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light}</style>
</head><body style="margin:0;padding:24px;background:#F8F1E4;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border-top:4px solid #C8923E;padding:28px;">
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#8a6215;margin:0 0 6px;">Associazione El Brenz</p>
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#1E2E26;margin:0 0 18px;">Convocazione di ${esc(p.tipoEsteso)}</h1>

    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 14px;">${saluto},</p>
    ${perEntrambi}
    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 18px;">
      sei convocato all&rsquo;${esc(p.tipoEsteso.toLowerCase())} dei soci, che si terrà come segue.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#666;font-size:13px;width:38%;">Luogo</td>
          <td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#1E2E26;font-size:15px;"><strong>${esc(p.luogo)}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#666;font-size:13px;">Giorno</td>
          <td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#1E2E26;font-size:15px;"><strong>${esc(dataEstesa(p.assemblea_il))}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#666;font-size:13px;">Prima convocazione</td>
          <td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#1E2E26;font-size:15px;">ore <strong>${esc(p.ora_prima)}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#666;font-size:13px;">Seconda convocazione</td>
          <td style="padding:8px 0;border-bottom:1px solid #E5DFCF;color:#1E2E26;font-size:15px;">ore <strong>${esc(p.ora_seconda)}</strong></td></tr>
    </table>

    <p style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#8a6215;border-bottom:2px solid #C8923E;padding-bottom:6px;margin:0 0 12px;">Ordine del giorno</p>
    <ol style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 20px;padding-left:22px;">${punti}</ol>

    <p style="color:#1E2E26;font-size:15px;line-height:1.6;margin:0 0 8px;">
      Ogni socio ha diritto a un voto e può farsi rappresentare da un altro socio con delega
      scritta e firmata. <strong>Sono ammesse al massimo due deleghe per socio.</strong>
    </p>
    <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 20px;">
      L&rsquo;esercizio dei diritti sociali spetta ai soci in regola con la quota.
    </p>

    <p style="color:#8a6215;font-style:italic;font-family:Georgia,serif;font-size:15px;margin:0 0 16px;">Raìs fonde no le &rsquo;nglacia</p>
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0;">
      Associazione El Brenz · Via Trento 40, 38027 Malè (TN) · info@elbrenz.eu<br/>
      Comunicazione dovuta per statuto ai soci dell&rsquo;Associazione. Non è una newsletter e non prevede disiscrizione.
    </p>
  </div></body></html>`;
}

Deno.serve(async (req: Request) => {
  const CORS = corsFor(req);
  const J = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return J({ errore: "Metodo non consentito" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ errore: "Sessione assente." }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ errore: "La sessione è scaduta: rientra e riprova." }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE);
  const { data: puo } = await sb.rpc("puo_gestione_associativa", { p_utente: user.id });
  if (puo !== true) return J({ errore: "Questa sezione è riservata a chi tiene i libri sociali." }, 403);

  let c: Corpo;
  try { c = await req.json(); } catch { return J({ errore: "Richiesta illeggibile." }, 400); }

  const modo = c.modo === "invia" ? "invia" : "prova";
  const tipo = c.tipo === "assemblea_straordinaria" ? "assemblea_straordinaria" : "assemblea_ordinaria";
  const tipoEsteso = tipo === "assemblea_straordinaria" ? "Assemblea straordinaria" : "Assemblea ordinaria";

  // I TRE REQUISITI STATUTARI. Non si spedisce senza, e il motivo si dice per
  // esteso: è la differenza fra un'assemblea valida e una contestabile.
  const mancanti: string[] = [];
  if (!c.assemblea_il || !/^\d{4}-\d{2}-\d{2}$/.test(c.assemblea_il)) mancanti.push("il giorno dell’assemblea");
  if (!String(c.luogo ?? "").trim()) mancanti.push("il luogo");
  if (!String(c.ora_prima ?? "").trim()) mancanti.push("l’ora di prima convocazione");
  if (!String(c.ora_seconda ?? "").trim()) mancanti.push("l’ora di seconda convocazione");
  if (!String(c.ordine_del_giorno ?? "").trim()) mancanti.push("l’ordine del giorno");
  if (mancanti.length) {
    return J({
      errore: `Non si può convocare: manca ${mancanti.join(", manca ")}. Sono requisiti dello statuto, non campi opzionali.`,
      mancanti,
    }, 400);
  }

  const assemblea_il = c.assemblea_il!;
  const giorniInvio = Math.max(1, Math.min(30, Number(c.giorni_invio ?? 1) || 1));

  // IL TERMINE, dalla funzione sul database: una sola implementazione per il
  // pannello e per chi spedisce.
  const { data: termineRows, error: eTermine } = await sb
    .rpc("convocazione_termine", { p_assemblea: assemblea_il, p_giorni_invio: giorniInvio });
  if (eTermine) return J({ errore: "Non riesco a calcolare il termine dei quindici giorni.", dettaglio: eTermine.message }, 500);
  const termine = (termineRows as any[])?.[0];

  // CHI SI CONVOCA: tutti gli associati non cessati alla data dell'assemblea,
  // in regola o no. `convocato` è già questa regola, scritta una volta sola.
  const { data: elenco, error: eElenco } = await sb
    .rpc("associati_alla_data", { p_data: assemblea_il });
  if (eElenco) return J({ errore: "Non riesco a leggere l’elenco degli associati: nessun invio.", dettaglio: eElenco.message }, 500);

  const convocati = ((elenco ?? []) as any[])
    .filter((r) => r.convocato === true)
    .filter((r) => String(r.email ?? "").trim() !== "");
  const senzaIndirizzo = ((elenco ?? []) as any[])
    .filter((r) => r.convocato === true && String(r.email ?? "").trim() === "")
    .map((r) => ({ numero_socio: r.numero_socio, nome: `${r.nome ?? ""} ${r.cognome ?? ""}`.trim() }));

  // LE CASELLE CONDIVISE: un messaggio solo, i nomi di entrambi nel corpo.
  const perIndirizzo = new Map<string, any[]>();
  for (const r of convocati) {
    const em = String(r.email).trim().toLowerCase();
    if (!perIndirizzo.has(em)) perIndirizzo.set(em, []);
    perIndirizzo.get(em)!.push(r);
  }

  const messaggi = [...perIndirizzo.entries()].map(([email, soci]) => {
    const nomi = soci.map((s) => `${s.nome ?? ""} ${s.cognome ?? ""}`.trim()).filter(Boolean);
    return {
      email,
      soci,
      nomi,
      html: convocazioneHtml({
        nomi,
        tipoEsteso,
        assemblea_il,
        luogo: String(c.luogo).trim(),
        ora_prima: oraBreve(c.ora_prima),
        ora_seconda: oraBreve(c.ora_seconda),
        ordine_del_giorno: String(c.ordine_del_giorno),
      }),
    };
  });

  const oggetto = String(c.oggetto ?? "").trim()
    || `Convocazione di ${tipoEsteso.toLowerCase()} — ${dataEstesa(assemblea_il)}`;

  // GIRO A VUOTO. Nessuna riga scritta, nessuna email partita: si vede chi
  // riceverebbe che cosa, e il testo esatto.
  if (modo !== "invia") {
    return J({
      prova: true,
      messaggio: "Nessuna email inviata e nessuna riga scritta. Serve il via esplicito del segretario.",
      termine,
      soci_convocati: convocati.length,
      messaggi_da_mandare: messaggi.length,
      caselle_condivise: messaggi.filter((m) => m.soci.length > 1)
        .map((m) => ({ email: m.email, nomi: m.nomi })),
      senza_indirizzo: senzaIndirizzo,
      oggetto,
      anteprima_html: messaggi[0]?.html ?? null,
      destinatari: messaggi.map((m) => ({ email: m.email, nomi: m.nomi, soci: m.soci.length })),
    });
  }

  const sharedSecret = Deno.env.get("SEND_EMAIL_SHARED_SECRET");
  if (!sharedSecret) return J({ errore: "SEND_EMAIL_SHARED_SECRET mancante: nessun invio." }, 500);

  // La testata della comunicazione: si scrive PRIMA, così se qualcosa si
  // interrompe a metà resta scritto che cosa era partito e verso chi.
  const { data: com, error: eCom } = await sb.from("comunicazione_istituzionale").insert({
    tipo: "convocazione_assemblea",
    oggetto,
    corpo_html: messaggi[0]?.html ?? "",
    assemblea_il,
    luogo: String(c.luogo).trim(),
    ora_prima: oraBreve(c.ora_prima),
    ora_seconda: oraBreve(c.ora_seconda),
    ordine_del_giorno: String(c.ordine_del_giorno),
    riunione_id: c.riunione_id ?? null,
    termine_pervenire: termine?.termine_pervenire ?? null,
    stato: "in_invio",
    creata_da: user.id,
    invio_iniziato_il: new Date().toISOString(),
    destinatari_count: convocati.length,
  }).select("id").single();
  if (eCom || !com) return J({ errore: "Registro non scritto, nessun invio.", dettaglio: eCom?.message }, 500);

  const inviati: unknown[] = [];
  const falliti: unknown[] = [];

  for (const m of messaggi) {
    // LA PROVA CONSERVA LA PERSONA, non l'indirizzo: una riga per socio, anche
    // quando il messaggio è uno solo perché la casella è condivisa. E conserva il
    // CORPO ESATTO, non un riferimento al modello.
    const righe = m.soci.map((s) => ({
      comunicazione_id: com.id,
      domanda_id: s.domanda_id,
      numero_socio: s.numero_socio,
      nome: `${s.nome ?? ""} ${s.cognome ?? ""}`.trim(),
      email: m.email,
      corpo_inviato: m.html,
      esito: "accodata",
    }));
    const { data: scritte, error: eRighe } = await sb
      .from("comunicazione_destinatario").insert(righe).select("id");
    if (eRighe) {
      falliti.push({ email: m.email, perche: "registro non scritto, nessun invio: " + eRighe.message });
      continue;
    }
    const ids = ((scritte ?? []) as any[]).map((r) => r.id);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Send-Email-Secret": sharedSecret },
        body: JSON.stringify({
          to: m.email,
          subject: oggetto,
          html: m.html,
          tags: [{ name: "source", value: "convocazione-assemblea" }],
        }),
      });
      if (resp.ok) {
        await sb.from("comunicazione_destinatario")
          .update({ esito: "inviata", inviata_il: new Date().toISOString() }).in("id", ids);
        inviati.push({ email: m.email, soci: m.nomi });
      } else {
        const t = await resp.text();
        await sb.from("comunicazione_destinatario")
          .update({ esito: "errore", errore: `HTTP ${resp.status} ${t}`.slice(0, 400) }).in("id", ids);
        falliti.push({ email: m.email, http: resp.status });
      }
    } catch (e) {
      await sb.from("comunicazione_destinatario")
        .update({ esito: "errore", errore: String(e).slice(0, 400) }).in("id", ids);
      falliti.push({ email: m.email, errore: String(e).slice(0, 200) });
    }
  }

  await sb.from("comunicazione_istituzionale").update({
    stato: falliti.length ? "inviata_con_errori" : "inviata",
    invio_finito_il: new Date().toISOString(),
  }).eq("id", com.id);

  console.log(`[assemblea-convoca] com=${com.id} inviati=${inviati.length} falliti=${falliti.length}`);
  return J({
    eseguito: true,
    comunicazione_id: com.id,
    termine,
    soci_convocati: convocati.length,
    inviati,
    falliti,
    senza_indirizzo: senzaIndirizzo,
  });
});
