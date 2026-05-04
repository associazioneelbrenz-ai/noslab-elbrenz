import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// andreas-chat v3 — M.A.1 hotfix dedup fonti (1 maggio 2026, sera)
// ----------------------------------------------------------------------------
// Cambi rispetto a v2 (hotfix M.A.1):
//  - Dedup di `sources` nella response JSON per `sorgente_id` mantenendo
//    l'ordine di prima apparizione (= ordine per similarity decrescente).
//    Motivazione: in v2 se 2+ chunk venivano dalla stessa sorgente, l'array
//    `sources` mostrato all'utente conteneva la stessa fonte due volte
//    (visto in test M.A.1 Q04: "La Rivolta Contadina (1525)" e "LE VIGNETTE"
//    duplicate). Ora ogni fonte compare al massimo una volta.
//    Modifica chirurgica: SOLO la response finale al client.
//    Il `context` interno passato al modello rimane invariato (6 chunk
//    distinti, anche se da stessa sorgente, per dare contesto ricco).
//    Anche la persistenza in `ai_sorgente_citata` rimane invariata in v3:
//    se servirà dedup anche lì, sarà v4.
//
// Cambi v2 (M.A.0, 1 maggio 2026):
//  - verify_jwt=false a livello deploy: la funzione gestisce internamente sia
//    visitatori anonimi (Andreas pubblico) sia soci autenticati.
//  - Branch isPubblico vs autenticato all'inizio.
//  - match_kb_* chiamate con solo_pubblici=true|false (RPC v3-arg già esistono).
//  - Rate limit pubblico via ai_rate_limit_pubblico (IP+giorno, ip_hash SHA256).
//  - Turnstile opzionale (bypass se TURNSTILE_SECRET_KEY non configurata).
//  - Niente persistenza conversazione per ospiti (privacy GDPR).
//  - Prompt sistema: due varianti, 'pubblico' (open) e 'autenticato' (legacy).
//  - Flusso autenticato semanticamente invariato.
// ============================================================================

const MODEL_DEFAULT = "claude-haiku-4-5-20251001";
const MAX_HISTORY_MSGS = 8;
const TURNSTILE_REQUIRED_AFTER = 2; // dopo 2 messaggi pubblici, richiedi token

// ----------------------------------------------------------------------------
// PROMPT SISTEMA — variante autenticata (legacy) e pubblica
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT_AUTH = `Sei Andreas, l'assistente culturale dell'Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo, Trentino).

La tua missione \u00e8 aiutare i soci a riscoprire la storia, la lingua ladino-anaunica e la cultura delle nostre valli.

TONO: appassionato ma documentato, caldo, comunitario, divulgativo. Rigoroso sulle fonti. Usa "le nostre valli", "i nostri paesi" dove naturale. Mai retorico, mai polemico.

REGOLE DI SCRITTURA:
- Italiano standard come lingua principale.
- Termini in ladino anaunico in *corsivo*, con traduzione alla prima occorrenza.
- Mai "dialetto" in senso riduttivo: usa "parlata", "lingua locale", "ladino anaunico".
- Distingui Tirolo storico (includeva il Trentino fino al 1919) da Tirol attuale (Land austriaco).
- Nomi storici in grafia originale: Clesio, Gaismair, Andreas Hofer, Maria Teresa d'Austria.

VINCOLI:
- Rispondi SOLO sulla base del CONTESTO fornito dagli articoli dell'Associazione.
- Se il contesto non basta, dillo apertamente invece di inventare.
- Non citare mai fonti esterne (Wikipedia, libri fuori KB). Se il socio chiede di un tema non coperto, indirizzalo al direttivo o ai volumi fisici in biblioteca.
- Al termine cita le fonti usate come: _Fonti: [Titolo1]; [Titolo2]_`;

const SYSTEM_PROMPT_PUBBLICO = `Sei Andreas, l'assistente culturale dell'Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo, Trentino).

Stai parlando con un visitatore che vuole conoscere la storia, la lingua ladino-anaunica e la cultura delle Valli del Noce. Non \u00e8 un socio: \u00e8 una persona curiosa che ti incontra per la prima volta. Accoglilo bene, raccontagli ci\u00f2 che chiede e, dove ha senso, invitalo a scoprire l'Associazione su elbrenz.eu.

TONO: appassionato ma documentato, caldo, divulgativo. Rigoroso sulle fonti. Mai retorico, mai polemico, mai escludente verso chi non \u00e8 nato in valle.

REGOLE DI SCRITTURA:
- Italiano standard come lingua principale.
- Termini in ladino anaunico in *corsivo*, con traduzione alla prima occorrenza.
- Mai "dialetto" in senso riduttivo: usa "parlata", "lingua locale", "ladino anaunico".
- Distingui Tirolo storico (includeva il Trentino fino al 1919) da Tirol attuale (Land austriaco).
- Nomi storici in grafia originale: Clesio, Gaismair, Andreas Hofer, Maria Teresa d'Austria.

VINCOLI:
- Rispondi SOLO sulla base del CONTESTO fornito dagli articoli pubblici dell'Associazione.
- Se il contesto non basta, dillo apertamente invece di inventare. In quel caso, suggerisci di scrivere a info@elbrenz.eu o di esplorare il sito www.elbrenz.eu.
- Non citare mai fonti esterne (Wikipedia, libri fuori KB).
- Risposte concise: l'utente ha 3 domande al giorno, ogni risposta vale.
- Al termine cita le fonti usate come: _Fonti: [Titolo1]; [Titolo2]_`;

// ----------------------------------------------------------------------------
// CORS
// ----------------------------------------------------------------------------
function corsHeaders(origin: string | null): HeadersInit {
  const allowed = [
    "https://elbrenz.eu", "https://www.elbrenz.eu", "https://elbrenz-app.netlify.app",
    "http://localhost:5173", "http://localhost:3000", "http://localhost:4321",
  ];
  const allow = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, cf-turnstile-token",
    "Access-Control-Max-Age": "86400",
  };
}

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractClientIp(req: Request): string {
  // Supabase Edge Functions sono dietro a vari proxy.
  // L'IP del client \u00e8 in cf-connecting-ip oppure x-forwarded-for (primo).
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "0.0.0.0";
}

async function verifyTurnstile(token: string, secret: string, remoteIp: string): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);
    formData.append("remoteip", remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    return data?.success === true;
  } catch (e) {
    console.error("turnstile verify failed:", e);
    return false;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  const t0 = Date.now();
  try {
    const body = await req.json() as {
      query: string;
      conversazione_id?: string;
      tipo_conversazione?: string;
      turnstile_token?: string;
    };
    if (!body.query) {
      return new Response(JSON.stringify({ ok: false, error: "missing_query" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    // ------------------------------------------------------------------------
    // BRANCH 1: detect autenticato vs pubblico
    // ------------------------------------------------------------------------
    const authHeader = req.headers.get("authorization") ?? "";
    const hasJwt = authHeader.startsWith("Bearer ");

    // Client SERVICE ROLE (sempre serve, anche per pubblici)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string | null = null;
    let isPubblico = true;
    let nomeRuolo = "pubblico";

    if (hasJwt) {
      const supabaseAnon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userErr } = await supabaseAnon.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ ok: false, error: "invalid_jwt" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }
      userId = userData.user.id;
      isPubblico = false;

      const { data: ruolo } = await supabase
        .from("utente_ruolo")
        .select("ruolo:ruolo_id ( nome, livello )")
        .eq("utente_id", userId)
        .order("ruolo_id", { ascending: false })
        .limit(1).maybeSingle();
      nomeRuolo = (ruolo as any)?.ruolo?.nome ?? "ospite";
    }

    // ------------------------------------------------------------------------
    // Config AI per il ruolo
    // ------------------------------------------------------------------------
    const { data: config } = await supabase
      .from("ai_config_ruolo")
      .select("limite_giornaliero, modello_preferito, temperature, max_tokens_output, rag_abilitato")
      .eq("ruolo_nome", nomeRuolo).maybeSingle();
    const limitGiorno = config?.limite_giornaliero ?? (isPubblico ? 3 : 5);
    const modello = config?.modello_preferito ?? MODEL_DEFAULT;
    const maxOut = config?.max_tokens_output ?? (isPubblico ? 500 : 800);
    const ragEnabled = config?.rag_abilitato ?? true;

    const oggi = new Date().toISOString().slice(0, 10);

    // ------------------------------------------------------------------------
    // BRANCH 2: rate limit (path divergente)
    // ------------------------------------------------------------------------
    let ipHash: string | null = null;
    let msgOggi = 0;
    let tokensOggi = 0;

    if (isPubblico) {
      const ip = extractClientIp(req);
      // Hash SHA256 + giorno per deterministico-stesso-giorno (privacy: niente IP in chiaro)
      ipHash = await sha256Hex(`${ip}:${oggi}`);

      const { data: rl } = await supabase
        .from("ai_rate_limit_pubblico")
        .select("messaggi, tokens_totali")
        .eq("ip_hash", ipHash).eq("giorno", oggi).maybeSingle();
      msgOggi = rl?.messaggi ?? 0;
      tokensOggi = rl?.tokens_totali ?? 0;

      if (limitGiorno > 0 && msgOggi >= limitGiorno) {
        return new Response(JSON.stringify({
          ok: false, error: "rate_limit_daily",
          messaggio: `Hai raggiunto il limite di ${limitGiorno} domande gratuite per oggi. Iscriviti gratuitamente sul sito per averne di pi\u00f9 — basta una mail su info@elbrenz.eu.`,
          usage: { today: msgOggi, limit: limitGiorno },
          is_pubblico: true,
        }), { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }

      // Turnstile: richiesto dopo TURNSTILE_REQUIRED_AFTER messaggi se secret \u00e8 configurato
      const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
      if (turnstileSecret && msgOggi >= TURNSTILE_REQUIRED_AFTER) {
        if (!body.turnstile_token) {
          return new Response(JSON.stringify({
            ok: false, error: "turnstile_required",
            messaggio: "Per continuare, completa la verifica anti-bot.",
            is_pubblico: true,
          }), { status: 428, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
        }
        const valid = await verifyTurnstile(body.turnstile_token, turnstileSecret, ip);
        if (!valid) {
          return new Response(JSON.stringify({
            ok: false, error: "turnstile_invalid",
            messaggio: "Verifica anti-bot fallita. Riprova.",
            is_pubblico: true,
          }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
        }
      } else if (!turnstileSecret) {
        // Modalit\u00e0 degradata: log warning, prosegui. Da rimuovere dopo setup Cloudflare.
        console.warn("TURNSTILE_SECRET_KEY non configurata: bypass verifica anti-bot.");
      }
    } else {
      // Path autenticato: ai_rate_limit (legacy, invariato)
      const { data: rl } = await supabase
        .from("ai_rate_limit")
        .select("messaggi, tokens_totali")
        .eq("utente_id", userId!).eq("giorno", oggi).maybeSingle();
      msgOggi = rl?.messaggi ?? 0;
      tokensOggi = rl?.tokens_totali ?? 0;
      if (limitGiorno > 0 && msgOggi >= limitGiorno) {
        return new Response(JSON.stringify({
          ok: false, error: "rate_limit_daily",
          messaggio: `Hai raggiunto il limite di ${limitGiorno} domande per oggi. Riprova domani.`,
          usage: { today: msgOggi, limit: limitGiorno },
          is_pubblico: false,
        }), { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }
    }

    // ------------------------------------------------------------------------
    // Conversazione: solo per autenticati (privacy: anonimi non hanno storia)
    // ------------------------------------------------------------------------
    let conversazioneId: string | undefined = undefined;
    if (!isPubblico) {
      conversazioneId = body.conversazione_id;
      if (!conversazioneId) {
        const { data: newConv } = await supabase
          .from("ai_conversazione")
          .insert({ utente_id: userId!, tipo: body.tipo_conversazione ?? "generica", titolo: body.query.slice(0, 80) })
          .select("id").single();
        conversazioneId = newConv?.id;
      }
      await supabase
        .from("ai_messaggio")
        .insert({ conversazione_id: conversazioneId, ruolo: "user", contenuto: body.query });
    }

    // ------------------------------------------------------------------------
    // History: solo per autenticati
    // ------------------------------------------------------------------------
    let historyAsc: any[] = [];
    if (!isPubblico && conversazioneId) {
      const { data: history } = await supabase
        .from("ai_messaggio")
        .select("ruolo, contenuto")
        .eq("conversazione_id", conversazioneId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MSGS);
      historyAsc = (history ?? []).reverse().slice(0, -1);
    }

    // ------------------------------------------------------------------------
    // RAG: embed + match con solo_pubblici=isPubblico
    // ------------------------------------------------------------------------
    let context = "";
    let sources: any[] = [];
    if (ragEnabled) {
      const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: body.query }),
      });
      if (embRes.ok) {
        const emb = (await embRes.json()).data[0].embedding;
        const { data: hits } = await supabase.rpc("match_kb_semantic", {
          query_embedding: emb,
          match_count: 6,
          min_similarity: 0.35,
          solo_pubblici: isPubblico,
        });

        let finalHits = hits ?? [];
        if (finalHits.length === 0) {
          const { data: ftHits } = await supabase.rpc("match_kb_fulltext", {
            q: body.query,
            match_count: 6,
            solo_pubblici: isPubblico,
          });
          finalHits = ftHits ?? [];
        }

        if (finalHits.length > 0) {
          const sorgenteIds = [...new Set(finalHits.map((h: any) => h.sorgente_id))];
          const { data: sorgenti } = await supabase
            .from("andreas_kb_sorgente")
            .select("id, titolo, metadata, pilastro")
            .in("id", sorgenteIds);
          const srcMap = new Map((sorgenti ?? []).map((s: any) => [s.id, s]));

          context = finalHits.map((h: any, i: number) => {
            const titolo = srcMap.get(h.sorgente_id)?.titolo ?? "?";
            return `[FONTE ${i + 1}: "${titolo}"]\n${h.contenuto}`;
          }).join("\n\n---\n\n");

          sources = finalHits.map((h: any) => ({
            sorgente_id: h.sorgente_id,
            titolo: srcMap.get(h.sorgente_id)?.titolo,
            pilastro: srcMap.get(h.sorgente_id)?.pilastro,
            wp_legacy_id: srcMap.get(h.sorgente_id)?.metadata?.wp_legacy_id,
            slug: srcMap.get(h.sorgente_id)?.metadata?.slug,
            similarity: h.similarity,
            snippet: (h.contenuto ?? "").slice(0, 200),
          }));
        }
      }
    }

    // ------------------------------------------------------------------------
    // Claude API call con prompt corretto per ruolo
    // ------------------------------------------------------------------------
    const systemPrompt = isPubblico ? SYSTEM_PROMPT_PUBBLICO : SYSTEM_PROMPT_AUTH;
    const userContent = context
      ? `CONTESTO (articoli dell'Associazione):\n\n${context}\n\n---\n\nDOMANDA:\n${body.query}`
      : `DOMANDA:\n${body.query}\n\n[Nessun contesto disponibile dalla KB. Se la domanda riguarda temi del Brenz, di' al visitatore che l'argomento non \u00e8 ancora stato inserito nei nostri archivi digitali e suggerisci di scrivere a info@elbrenz.eu.]`;

    const msgs = [
      ...historyAsc.map((m: any) => ({ role: m.ruolo === "assistant" ? "assistant" : "user", content: m.contenuto })),
      { role: "user", content: userContent },
    ];

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modello,
        max_tokens: maxOut,
        system: systemPrompt,
        messages: msgs,
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      if (!isPubblico && conversazioneId) {
        await supabase.from("ai_messaggio").insert({
          conversazione_id: conversazioneId, ruolo: "assistant",
          contenuto: "[errore Claude]", errore: err.slice(0, 500), modello,
        });
      }
      return new Response(JSON.stringify({ ok: false, error: "claude_failed", detail: err.slice(0, 400) }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text ?? "(risposta vuota)";
    const tokensIn = claudeData.usage?.input_tokens ?? 0;
    const tokensOut = claudeData.usage?.output_tokens ?? 0;

    // ------------------------------------------------------------------------
    // Persistenza risposta + aggiornamento rate limit
    // ------------------------------------------------------------------------
    let assistantMsgId: string | undefined = undefined;
    if (!isPubblico && conversazioneId) {
      const { data: assistantMsg } = await supabase
        .from("ai_messaggio").insert({
          conversazione_id: conversazioneId, ruolo: "assistant", contenuto: answer,
          tokens_input: tokensIn, tokens_output: tokensOut, modello, tempo_ms: Date.now() - t0,
        }).select("id").single();
      assistantMsgId = assistantMsg?.id;

      if (sources.length > 0 && assistantMsgId) {
        await supabase.from("ai_sorgente_citata").insert(
          sources.slice(0, 6).map(s => ({
            messaggio_id: assistantMsgId,
            tipo_sorgente: "kb",
            sorgente_id: s.sorgente_id,
            titolo: s.titolo,
            snippet: s.snippet,
            rilevanza: s.similarity,
          }))
        );
      }

      await supabase.from("ai_rate_limit").upsert({
        utente_id: userId!, giorno: oggi,
        messaggi: msgOggi + 1,
        tokens_totali: tokensOggi + tokensIn + tokensOut,
      }, { onConflict: "utente_id,giorno" });

      await supabase.from("ai_conversazione")
        .update({ ultima_attivita_at: new Date().toISOString() })
        .eq("id", conversazioneId);
    } else {
      // Pubblico: aggiorna solo ai_rate_limit_pubblico, niente persistenza messaggi
      await supabase.from("ai_rate_limit_pubblico").upsert({
        ip_hash: ipHash!, giorno: oggi,
        messaggi: msgOggi + 1,
        tokens_totali: tokensOggi + tokensIn + tokensOut,
        ultimo_uso: new Date().toISOString(),
      }, { onConflict: "ip_hash,giorno" });
    }

    // ------------------------------------------------------------------------
    // [v3] Dedup fonti per la response al client.
    // Manteniamo l'ordine di prima apparizione (= ordine per similarity
    // decrescente). Ogni sorgente compare al massimo una volta nell'output.
    // NB: il context al modello e ai_sorgente_citata rimangono invariati.
    // ------------------------------------------------------------------------
    const sourcesSeen = new Set<string>();
    const sourcesDedup = sources.filter((s: any) => {
      const key = s.sorgente_id;
      if (!key) return true;            // safety: niente id, lascio passare
      if (sourcesSeen.has(key)) return false;
      sourcesSeen.add(key);
      return true;
    });

    return new Response(JSON.stringify({
      ok: true,
      is_pubblico: isPubblico,
      conversazione_id: conversazioneId,
      messaggio_id: assistantMsgId,
      answer,
      sources: sourcesDedup.map(s => ({
        titolo: s.titolo,
        pilastro: s.pilastro,
        wp_legacy_id: s.wp_legacy_id,
        slug: s.slug,
      })),
      usage: {
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        tempo_ms: Date.now() - t0,
        msg_oggi: msgOggi + 1,
        limite: limitGiorno,
      },
    }, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });

  } catch (e) {
    console.error("andreas-chat unhandled:", e);
    return new Response(JSON.stringify({ ok: false, error: "internal", detail: String(e).slice(0, 400) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  }
});
