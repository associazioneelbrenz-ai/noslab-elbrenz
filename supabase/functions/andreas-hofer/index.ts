// ============================================================
// Edge Function: andreas-hofer
// ============================================================
// Assistente AI dedicato ad Andreas Hofer.
// Proxy verso Anthropic Claude Haiku con:
//  - verifica JWT
//  - rate limiting per ruolo (ai_config_ruolo)
//  - RAG semantico via pgvector (andreas_kb) + full-text fallback
//  - lookup dizionario_lemma + articolo pubblicati
//  - salvataggio conversazione in DB con tracciabilità sorgenti
//
// Secrets richiesti:
//  - ANTHROPIC_API_KEY   (obbligatorio)
//  - OPENAI_API_KEY      (opzionale, abilita embedding semantico)
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ------------------------------------------------------------
// SYSTEM PROMPT
// ------------------------------------------------------------
const SYSTEM_PROMPT = `Ti chiami **Andreas**. Sei l'assistente dell'Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce. Prendi il nome in dedica ad Andreas Hofer (1767–1810), il contadino di Sant'Leonardo in Passiria che guidò la rivolta tirolese del 1809. Non sei Hofer: ne porti il nome come omaggio.

## CHI SEI
Guida digitale della comunità El Brenz. Esperto di:
- Storia delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo)
- Storia del Tirolo storico (fino al 1919) e delle sue stagioni: feudi Thun/Spaur/Nanno, Concilio di Trento, Guerre Rustiche, Rivolta di Andreas Hofer del 1809, Grande Guerra sul fronte alpino, catasto tavolare
- Parlate ladino-anauniche: noneso, solander, rabies, pegaes. Etimologie, proverbi, trascrizioni
- Cultura materiale alpina: stua, mulini, fucine, utensili, architettura lignea
- Figure storiche: Clesio, Bernardo Clesio, Baldassare di Cles, Michael Gaismair, Andreas Hofer, Maria Teresa d'Austria, Beato Carlo d'Asburgo

## TONO DI VOCE
Appassionato ma documentato. Caldo e comunitario. Curioso e divulgativo. Rigoroso sulle fonti, accessibile nella forma. Usa espressioni identitarie come "le nostre valli" o "la nosa storia" con naturalezza, senza enfasi retorica. Dialoga da persona seduta accanto davanti a una stua, non da cattedratico.

## REGOLE LINGUISTICHE
- Italiano standard come lingua principale
- Termini in ladino anaunico in *corsivo* (markdown) e, la prima volta, con traduzione fra parentesi
- Dire sempre "parlata", "lingua locale", "ladino anaunico" — **mai** "dialetto" in senso riduttivo
- Distinguere sempre **Tirolo storico** (fino al 1919, include il Trentino) dal **Tirol attuale** (Land austriaco)
- Nomi storici in grafia originale: Clesio, Gaismair, Andreas Hofer, Baldassare di Cles, Maria Teresa d'Austria, Beato Carlo d'Asburgo
- Date nel testo in formato esteso: "21 dicembre 2009"

## RIGORE STORICO (NON NEGOZIABILE)
- Ogni affermazione storica deve essere **verificabile**
- Se non sei sicuro di una data, di un nome, di un fatto → **dillo esplicitamente**. Mai inventare
- Se la domanda riguarda dati che non conosci (statistiche recenti, nomi di persone viventi non famose) → ammettilo e suggerisci di chiedere all'associazione
- Per temi sensibili (Tirolo, minoranze, Risorgimento, fascismo, religione) → approccio **storico-culturale**, mai politico-attuale. Mai schieramenti partitici
- **PRIORITÀ ALLE SORGENTI DELLA KNOWLEDGE BASE**: se ti vengono fornite sorgenti dall'archivio dell'associazione (sezione SORGENTI DISPONIBILI qui sotto), usale come riferimento principale e citale per titolo. Mai inventare citazioni che non compaiono nelle sorgenti

## FORMATO RISPOSTE
- Risposte brevi per domande brevi, approfondite per domande complesse
- Il sito e l'app sono visti anche da telefono: evita liste troppo lunghe se non servono
- Quando appropriato, concludi suggerendo approfondimenti dall'archivio dell'associazione
- Per domande fuori tema (meteo, politica attuale, sport, tecnologia non storica): risposta gentile di riorientamento

## COSA NON FARE MAI
- Non impersonare Andreas Hofer in prima persona: tu sei un assistente AI, lui era una persona del 1809
- Non esprimere opinioni politiche attuali (autonomia, indipendentismi, partiti)
- Non mettere in bocca a personaggi storici citazioni inventate
- Non giudicare comunità contemporanee (italiane, tedesche, austriache)
- Non usare emoji a meno che l'utente lo faccia
- Non iniziare le risposte con "Certo!", "Che bella domanda!" o simili

## IDENTITÀ DELL'ASSOCIAZIONE
Associazione El Brenz APS, fondata il 21 dicembre 2009. Sede a Mezzana, in Val di Sole. Motto: *"Radici profonde non gelano — Rais fonde no le 'nglacia"*. Pubblicazioni: Lunario dal Nos (annuale), progetto Os dal Nos (archivio sonoro), ricerche storiche. Contatti: info@elbrenz.eu · www.elbrenz.eu`;

// ------------------------------------------------------------
// HTTP handler
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405, corsHeaders);

  const tStart = Date.now();

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Non autenticato" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");  // opzionale

    if (!anthropicKey) {
      return json({ error: "ANTHROPIC_API_KEY non configurata" }, 500, corsHeaders);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json({ error: "Sessione non valida" }, 401, corsHeaders);
    }
    const userId = userData.user.id;

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const {
      domanda,
      conversazione_id,
      tipo = "generica",
    }: {
      domanda?: string;
      conversazione_id?: string;
      tipo?: string;
    } = body;

    if (!domanda || typeof domanda !== "string" || domanda.trim().length < 2) {
      return json({ error: "Domanda mancante o troppo corta" }, 400, corsHeaders);
    }
    if (domanda.length > 4000) {
      return json({ error: "Domanda troppo lunga (max 4000 caratteri)" }, 400, corsHeaders);
    }

    // --- Rate limit ---
    const { data: rimanenti, error: rimErr } = await admin.rpc(
      "ai_messaggi_rimanenti_oggi",
      { p_utente_id: userId },
    );
    if (rimErr) console.error("Errore rate limit:", rimErr);
    if (typeof rimanenti === "number" && rimanenti <= 0) {
      return json({
        error: "Limite giornaliero raggiunto",
        dettaglio: "Hai esaurito le domande di oggi. Riprova domani.",
        codice: "rate_limit_exceeded",
      }, 429, corsHeaders);
    }

    // --- Config del ruolo di peso massimo ---
    const { data: ruoliRes } = await admin
      .from("utente_ruolo")
      .select("ruolo:ruolo_id(nome, livello)")
      .eq("utente_id", userId);

    let nomeRuoloMassimo = "ospite";
    let livelloMax = 0;
    for (const ur of ruoliRes ?? []) {
      const liv = (ur as any).ruolo?.livello ?? 0;
      if (liv > livelloMax) {
        livelloMax = liv;
        nomeRuoloMassimo = (ur as any).ruolo?.nome ?? "ospite";
      }
    }

    const { data: cfg } = await admin
      .from("ai_config_ruolo")
      .select("*")
      .eq("ruolo_nome", nomeRuoloMassimo)
      .maybeSingle();

    const modello = cfg?.modello_preferito ?? "claude-haiku-4-5-20251001";
    const temperature = Number(cfg?.temperature ?? 0.7);
    const maxTokens = cfg?.max_tokens_output ?? 800;
    const ragAbilitato = cfg?.rag_abilitato ?? true;

    // --- Ensure conversazione ---
    let convId = conversazione_id;
    if (!convId) {
      const titoloAuto = domanda.slice(0, 80) + (domanda.length > 80 ? "…" : "");
      const { data: newConv, error: convErr } = await admin
        .from("ai_conversazione")
        .insert({ utente_id: userId, titolo: titoloAuto, tipo })
        .select("id")
        .single();
      if (convErr || !newConv) {
        console.error("Errore creazione conv:", convErr);
        return json({ error: "Impossibile aprire la conversazione" }, 500, corsHeaders);
      }
      convId = newConv.id;
    } else {
      const { data: convOwn } = await admin
        .from("ai_conversazione")
        .select("utente_id")
        .eq("id", convId)
        .maybeSingle();
      if (!convOwn || convOwn.utente_id !== userId) {
        return json({ error: "Conversazione non trovata" }, 404, corsHeaders);
      }
    }

    // --- RAG ---
    const sorgenti: Array<{
      tipo: string;
      id: string;
      titolo: string;
      snippet: string;
      rilevanza: number;
    }> = [];

    if (ragAbilitato) {
      // 1. Knowledge base semantica (se OpenAI disponibile)
      if (openaiKey) {
        try {
          const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              input: domanda,
              model: "text-embedding-3-small",
            }),
          });
          if (embedResp.ok) {
            const embedData = await embedResp.json();
            const queryVec = embedData?.data?.[0]?.embedding;
            if (Array.isArray(queryVec) && queryVec.length === 1536) {
              const { data: kbMatch } = await admin.rpc("match_kb_semantic", {
                query_embedding: queryVec,
                match_count: 6,
                min_similarity: 0.35,
              });
              for (const k of (kbMatch ?? []) as any[]) {
                sorgenti.push({
                  tipo: "kb",
                  id: k.id,
                  titolo: `${k.titolo_sorgente}${k.titolo_sezione ? " — " + k.titolo_sezione : ""}${k.pagina ? " (p. " + k.pagina + ")" : ""}`,
                  snippet: (k.contenuto ?? "").slice(0, 500),
                  rilevanza: Number(k.similarity ?? 0),
                });
              }
            }
          } else {
            console.warn("Embedding OpenAI fallita:", embedResp.status);
          }
        } catch (e) {
          console.warn("Embedding error:", e);
        }
      }

      // 2. Fallback/aggiunta: full-text su KB se semantica non ha trovato
      if (sorgenti.length < 3) {
        const { data: kbFt } = await admin.rpc("match_kb_fulltext", {
          q: domanda,
          match_count: 4,
        });
        for (const k of (kbFt ?? []) as any[]) {
          if (!sorgenti.some((s) => s.id === k.id)) {
            sorgenti.push({
              tipo: "kb",
              id: k.id,
              titolo: `${k.titolo_sorgente}${k.titolo_sezione ? " — " + k.titolo_sezione : ""}${k.pagina ? " (p. " + k.pagina + ")" : ""}`,
              snippet: (k.contenuto ?? "").slice(0, 500),
              rilevanza: Number(k.rank ?? 0.4),
            });
          }
        }
      }

      // 3. Dizionario lemmi
      const { data: lemmi } = await admin
        .from("dizionario_lemma")
        .select("id, lemma, definizione, parlata, etimologia")
        .or(`lemma.ilike.%${esc(domanda)}%,definizione.ilike.%${esc(domanda)}%`)
        .limit(3);
      for (const l of (lemmi ?? []) as any[]) {
        sorgenti.push({
          tipo: "lemma",
          id: l.id,
          titolo: `${l.lemma} (${l.parlata ?? "ladino"})`,
          snippet: `${l.definizione ?? ""}${l.etimologia ? " · Etim.: " + l.etimologia : ""}`.slice(0, 400),
          rilevanza: 0.7,
        });
      }

      // 4. Articoli pubblicati (ILIKE)
      const { data: artRes } = await admin
        .from("articolo")
        .select("id, titolo, estratto, pilastro")
        .eq("pubblicato", true)
        .or(`titolo.ilike.%${esc(domanda)}%,estratto.ilike.%${esc(domanda)}%`)
        .limit(3);
      for (const a of (artRes ?? []) as any[]) {
        sorgenti.push({
          tipo: "articolo",
          id: a.id,
          titolo: a.titolo,
          snippet: (a.estratto ?? "").slice(0, 400),
          rilevanza: 0.5,
        });
      }
    }

    // --- History ---
    const { data: history } = await admin
      .from("ai_messaggio")
      .select("ruolo, contenuto")
      .eq("conversazione_id", convId)
      .in("ruolo", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(10);

    const messages: Array<{ role: string; content: string }> = [];
    for (const m of history ?? []) {
      if (m.ruolo === "user" || m.ruolo === "assistant") {
        messages.push({ role: m.ruolo, content: m.contenuto });
      }
    }
    messages.push({ role: "user", content: domanda });

    // --- Build system ---
    let systemFinale = SYSTEM_PROMPT;
    if (sorgenti.length > 0) {
      systemFinale += `\n\n## SORGENTI DISPONIBILI DALL'ARCHIVIO DELL'ASSOCIAZIONE\n`;
      systemFinale += `Usa prioritariamente queste sorgenti per costruire la risposta. Citale per titolo quando le usi. Non inventare citazioni.\n\n`;
      for (const s of sorgenti) {
        systemFinale += `- [${s.tipo}] "${s.titolo}" — ${s.snippet}\n`;
      }
    }

    // --- Salva domanda ---
    const { data: msgU } = await admin
      .from("ai_messaggio")
      .insert({ conversazione_id: convId, ruolo: "user", contenuto: domanda })
      .select("id")
      .single();

    // --- Chiama Anthropic ---
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modello,
        max_tokens: maxTokens,
        temperature,
        system: systemFinale,
        messages,
      }),
    });

    if (!anthropicResp.ok) {
      const errBody = await anthropicResp.text();
      console.error("Anthropic error:", anthropicResp.status, errBody);
      await admin.from("ai_messaggio").insert({
        conversazione_id: convId,
        ruolo: "assistant",
        contenuto: "Mi spiace, al momento non riesco a risponderti. Riprova tra poco.",
        errore: `Anthropic ${anthropicResp.status}: ${errBody.slice(0, 400)}`,
        modello,
      });
      return json({ error: "Errore del servizio AI", codice: "upstream_error" }, 502, corsHeaders);
    }

    const aiData = await anthropicResp.json();
    const risposta = (aiData?.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n\n");
    const usage = aiData?.usage ?? {};
    const tokensIn = usage.input_tokens ?? null;
    const tokensOut = usage.output_tokens ?? null;

    // --- Salva risposta + sorgenti ---
    const tempoMs = Date.now() - tStart;
    const { data: msgA } = await admin
      .from("ai_messaggio")
      .insert({
        conversazione_id: convId,
        ruolo: "assistant",
        contenuto: risposta,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        modello,
        tempo_ms: tempoMs,
      })
      .select("id")
      .single();

    if (msgA && sorgenti.length > 0) {
      await admin.from("ai_sorgente_citata").insert(
        sorgenti.map((s) => ({
          messaggio_id: msgA.id,
          tipo_sorgente: s.tipo,
          sorgente_id: String(s.id),
          titolo: s.titolo,
          snippet: s.snippet,
          rilevanza: s.rilevanza,
        })),
      );
    }

    await admin
      .from("ai_conversazione")
      .update({ ultima_attivita_at: new Date().toISOString() })
      .eq("id", convId);

    // --- Increment rate limit ---
    const totaleTokens = (tokensIn ?? 0) + (tokensOut ?? 0);
    await admin.rpc("ai_incrementa_rate_limit", {
      p_utente_id: userId,
      p_tokens_totali: totaleTokens,
    });

    return json({
      ok: true,
      conversazione_id: convId,
      messaggio_id: msgA?.id,
      risposta,
      sorgenti: sorgenti.map((s) => ({ tipo: s.tipo, id: s.id, titolo: s.titolo })),
      usage: { tokens_input: tokensIn, tokens_output: tokensOut, tempo_ms: tempoMs },
      limite: { rimanenti_oggi: typeof rimanenti === "number" ? Math.max(rimanenti - 1, 0) : null },
    }, 200, corsHeaders);

  } catch (err) {
    console.error("Andreas fatal:", err);
    return json({
      error: "Errore interno",
      dettaglio: (err as Error)?.message ?? String(err),
    }, 500, corsHeaders);
  }
});

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function esc(s: string): string {
  return s.replace(/[%_\\]/g, " ").trim().slice(0, 100);
}
