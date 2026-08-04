import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// contanti-registra (18/7/2026) — registra una quota pagata IN CONTANTI.
//
// Il caso reale: alla serata o in sede qualcuno consegna la quota a un
// consigliere. Senza questo, la tessera si emette a mano e il denaro non e'
// tracciato: nessuno sa chi ha in mano quei soldi finche' non arrivano al
// tesoriere.
//
// GATE: solo direttivo (ruolo >= 50), verificato QUI lato server. Nascondere il
// pulsante nell'interfaccia non basta: un socio non deve poter registrare
// pagamenti nemmeno forzando la chiamata.
//
// Vincolo DB da rispettare (pagamenti_contanti_coerenza): se metodo='contanti'
// allora incassato_da, incassato_il e importo sono obbligatori. Non aggirarlo.
//
// [4/8/2026] Estesa agli incassi gia' avvenuti fuori dal sistema che non sono
// contanti: un bonifico vecchio, le quote del registro cartaceo. Cambiano solo
// due campi in ingresso, `metodo` e `data_ricostruita`; chi chiamava prima
// continua a funzionare identico, perche' senza quei campi il metodo resta
// 'contanti' e la data si assume esatta.
// Chi puo': ruolo >= 50. Cosa resta scritto: registrato_da, incassato_da e la
// data reale. Cosa NON si puo': modificare un incasso registrato. Si annulla
// con motivo (annullato_il/da/motivo), perche' il RUNTS chiede di poter
// ricostruire chi ha scritto cosa, e una riga riscritta cancella la storia.

const ALLOWED_ORIGINS = [
  "https://elbrenz-community.netlify.app",
  "https://community.elbrenz.eu",
  "https://app.elbrenz.eu",
  "https://elbrenz.eu",
  "http://localhost:3000",
];
const LIVELLO_MINIMO = 50;
const VERSIONE_INFORMATIVA = "2026-07-18";

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const CORS = corsFor(req);
  const J = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return J({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Identita' certa dal token.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return J({ error: "no_token" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return J({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // 2) GATE direttivo lato server.
  const { data: ruoli } = await admin
    .from("utente_ruolo").select("ruolo:ruolo_id(livello)").eq("utente_id", user.id);
  const livello = Math.max(0, ...(((ruoli ?? []) as any[]).map((r) => r?.ruolo?.livello ?? 0)));
  if (livello < LIVELLO_MINIMO) return J({ error: "non_autorizzato" }, 403);

  let b: any;
  try { b = await req.json(); } catch { return J({ error: "invalid_json" }, 400); }

  // [4/8/2026] ANNULLAMENTO. Un incasso registrato non si modifica: si annulla
  // con un motivo scritto, e la riga resta. Correggere in silenzio vorrebbe
  // dire cancellare la storia di chi ha scritto cosa, che e' proprio quello
  // che al RUNTS serve poter ricostruire.
  if (b?.azione === "annulla") {
    const idPag = String(b?.pagamento_id ?? "");
    const motivo = String(b?.motivo ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(idPag)) return J({ error: "pagamento_non_valido" }, 400);
    if (motivo.length < 5) return J({ error: "motivo_mancante" }, 400);
    const { data: gia } = await admin.from("pagamenti_tesseramento")
      .select("id, annullato_il, metodo").eq("id", idPag).maybeSingle();
    if (!gia) return J({ error: "pagamento_inesistente" }, 404);
    if ((gia as any).annullato_il) return J({ error: "gia_annullato" }, 409);
    // Si annullano solo le registrazioni fatte a mano. Un incasso PayPal si
    // rimborsa dal pannello di PayPal: fingerlo annullato qui lascerebbe il
    // denaro dov'e' e il registro a dire il contrario.
    if (!["contanti", "bonifico", "altro"].includes(String((gia as any).metodo ?? ""))) {
      return J({ error: "solo_registrazioni_manuali", detail: "Un incasso online si rimborsa dal fornitore di pagamento, non si annulla qui." }, 400);
    }
    const { error: eAnn } = await admin.from("pagamenti_tesseramento").update({
      annullato_il: new Date().toISOString(),
      annullato_da: user.id,
      annullato_motivo: motivo.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", idPag);
    if (eAnn) return J({ error: "annullamento_fallito", detail: eAnn.message }, 500);
    console.log(`[contanti-registra] annullato ${idPag} da ${user.id}`);
    return J({ ok: true, azione: "annulla", pagamento_id: idPag });
  }

  // 3) Validazioni. L'attestazione privacy e' OBBLIGATORIA: senza, non si salva.
  const nome = String(b?.nome ?? "").trim();
  const email = String(b?.email ?? "").trim().toLowerCase();
  const importo = Number(b?.importo);
  const incassatoIl = String(b?.incassato_il ?? "").slice(0, 10);
  const incassatoDa = String(b?.incassato_da ?? "").trim();
  const modalita = String(b?.consenso_modalita ?? "");
  // [4/8/2026] Serve anche per gli incassi avvenuti FUORI dal sistema che non
  // sono contanti: un bonifico vecchio mai riconciliato, le quote del registro
  // cartaceo. Il metodo resta 'contanti' se non si dice altro, cosi' chi
  // chiamava prima continua a funzionare uguale.
  const METODI_MANUALI = ["contanti", "bonifico", "altro"];
  const metodo = METODI_MANUALI.includes(String(b?.metodo ?? "")) ? String(b.metodo) : "contanti";
  // Una data ricostruita DICHIARATA e' un dato onesto; una data inventata e
  // taciuta e' un falso. Chi registra una quota del 2020 raccolta a mano non
  // si ricorda il giorno, e va bene: basta che lo dica.
  const dataRicostruita = b?.data_ricostruita === true;
  const tipo = b?.tipo === "integrazione" ? "integrazione" : "quota";

  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return J({ error: "dati_socio_incompleti" }, 400);
  if (!Number.isFinite(importo) || importo <= 0 || importo > 1000) return J({ error: "importo_non_valido" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incassatoIl)) return J({ error: "data_non_valida" }, 400);
  if (!incassatoDa) return J({ error: "incassante_mancante" }, 400);
  if (b?.attestazione !== true) return J({ error: "attestazione_mancante" }, 400);
  if (!["cartaceo", "verbale"].includes(modalita)) return J({ error: "modalita_non_valida" }, 400);

  const anno = new Date(incassatoIl).getFullYear();

  // 4) Domanda: aggiorna quella esistente (stessa email) o creala (iscrizione di persona).
  const { data: esistente } = await admin
    .from("domande_tesseramento").select("id").ilike("email", email).limit(1).maybeSingle();

  let domandaId: string;
  if (esistente) {
    domandaId = (esistente as any).id;
    await admin.from("domande_tesseramento").update({
      consenso_privacy: true, informativa_versione: VERSIONE_INFORMATIVA, consenso_modalita: modalita,
      metodo_scelto: "contanti", // brief 21/7: traccia il metodo sulla domanda
    }).eq("id", domandaId);
  } else {
    const { data: creata, error: eDom } = await admin.from("domande_tesseramento").insert({
      nome, email, anno,
      data_nascita: b?.data_nascita || null,
      comune_nascita: b?.comune_nascita || null,
      sesso: b?.sesso || null,
      stato: "in_attesa",
      consenso_privacy: true,
      informativa_versione: VERSIONE_INFORMATIVA,
      consenso_modalita: modalita,
      metodo_scelto: "contanti", // brief 21/7: traccia il metodo sulla domanda
      // [3/8/2026] Era una stringa nuda, "contanti_di_persona", nella stessa
      // colonna in cui tutto il resto scrive un oggetto. Due forme diverse
      // nello stesso campo rendono impossibile qualunque conteggio.
      // Le chiavi sono source/medium/campaign come ovunque: un secondo
      // vocabolario nella stessa colonna sarebbe stato lo stesso problema
      // travestito da soluzione. Il canale e' quello che e': quota versata in
      // mano, allo sportello o a un incontro.
      sorgente_utm: { source: "contanti_di_persona", medium: "di_persona", campaign: "" },
    }).select("id").single();
    if (eDom || !creata) return J({ error: "domanda_fallita", detail: eDom?.message }, 500);
    domandaId = (creata as any).id;
  }

  // 5) Nome dell'incassante: copia leggibile anche se il profilo cambiera'.
  const { data: inc } = await admin.from("utente").select("nome, cognome, email").eq("id", incassatoDa).maybeSingle();
  const incNome = inc
    ? [ (inc as any).nome, (inc as any).cognome ].filter(Boolean).join(" ").trim() || (inc as any).email
    : "";

  // 6) Pagamento. metodo='contanti' + stato='completato' (il denaro c'e' gia').
  const { data: pag, error: ePag } = await admin.from("pagamenti_tesseramento").insert({
    tipo, metodo, stato: "completato",
    nome, email, anno, importo, valuta: "EUR",
    domanda_id: domandaId,
    incassato_da: incassatoDa,
    incassato_da_nome: incNome,
    incassato_il: incassatoIl,
    registrato_da: user.id,
    consegnato_tesoriere: false,
    data_ricostruita: dataRicostruita,
    note_incasso: (b?.note ?? "").toString().slice(0, 500) || null,
  }).select("id").single();
  if (ePag || !pag) return J({ error: "pagamento_fallito", detail: ePag?.message }, 500);

  // 7) RICEVUTA al socio. Chi paga in contanti ha gli stessi diritti di chi paga
  // online. Riusiamo il meccanismo esistente (ricevuta_dati) e la funzione
  // send-email gia' presente: nessuna funzione duplicata. Il secret vive solo
  // qui lato server. Best-effort: se l'email non parte, il pagamento resta
  // registrato e la ricevuta resta ricostruibile da ricevuta_dati.
  const numeroRicevuta = `C-${anno}-${String((pag as any).id).slice(0, 8)}`;
  const dataIt = incassatoIl.split("-").reverse().join("/");
  const ricevutaDati = {
    numero: numeroRicevuta,
    metodo: "contanti",
    tipo,
    importo_eur: importo,
    data_incasso: incassatoIl,
    incassato_da: incNome,
    socio: nome,
    email_socio: email,
    anno,
    emessa_da: "Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce",
    registrato_da: user.id,
    registrata_il: new Date().toISOString(),
  };
  await admin.from("pagamenti_tesseramento")
    .update({ ricevuta_dati: ricevutaDati }).eq("id", (pag as any).id);

  try {
    const secret = Deno.env.get("SEND_EMAIL_SHARED_SECRET") ?? "";
    if (secret) {
      const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
      const voce = tipo === "integrazione" ? "Integrazione quota associativa" : "Quota associativa";
      const html = `
<div style="font-family:Georgia,serif;color:#1E2E26;max-width:560px;margin:0 auto;">
  <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a6215;margin:0 0 6px;">Associazione El Brenz</p>
  <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:500;margin:0 0 4px;">Ricevuta di pagamento</h1>
  <p style="font-size:13px;color:#6B6B6B;margin:0 0 18px;">n. ${esc(numeroRicevuta)}</p>
  <p style="margin:0 0 14px;">Gentile ${esc(nome)}, confermiamo di aver ricevuto il pagamento seguente.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;">Causale</td><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;text-align:right;">${esc(voce)} ${anno}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;">Importo</td><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;text-align:right;"><strong>${importo.toFixed(2)} euro</strong></td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;">Modalita'</td><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;text-align:right;">Contanti</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;">Data</td><td style="padding:8px 0;border-bottom:1px solid #E5DFCF;text-align:right;">${esc(dataIt)}</td></tr>
    <tr><td style="padding:8px 0;">Ricevuto da</td><td style="padding:8px 0;text-align:right;">${esc(incNome || "un membro del direttivo")}</td></tr>
  </table>
  <p style="font-size:13px;color:#6B6B6B;margin:18px 0 0;line-height:1.6;">
    Somma ricevuta per conto dell'Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce.<br />
    Conserva questa ricevuta: vale come attestazione del versamento.
  </p>
  <p style="font-size:12px;color:#8a8278;margin:18px 0 0;">
    <em>Rais fonde no le 'nglacia</em> · <a href="https://elbrenz.eu" style="color:#8b2a1e;">elbrenz.eu</a>
  </p>
</div>`;
      await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Send-Email-Secret": secret },
        body: JSON.stringify({
          to: email,
          subject: `Ricevuta ${voce.toLowerCase()} ${anno} · El Brenz`,
          html,
          tags: [{ name: "source", value: "contanti" }],
        }),
      });
    }
  } catch (_e) { /* la ricevuta non deve far fallire la registrazione */ }

  // 8) Notifica al direttivo sul canale esistente (best-effort: non blocca).
  try {
    await admin.rpc("invia_comunicazione_direttivo", {
      p_titolo: "Quota in contanti registrata",
      p_corpo: `${nome} · ${importo.toFixed(2)} euro incassati da ${incNome || "un consigliere"} il ${incassatoIl}.`,
      p_url: "/app/amministrazione",
    });
  } catch (_e) { /* la notifica non deve far fallire la registrazione */ }

  return J({ ok: true, pagamento_id: (pag as any).id, domanda_id: domandaId });
});
