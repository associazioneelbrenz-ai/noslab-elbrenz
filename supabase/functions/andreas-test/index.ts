import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SYSTEM_PROMPT = `Sei Andreas, l'assistente culturale dell'Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo, Trentino).

La tua missione è aiutare i soci a riscoprire la storia, la lingua ladino-anaunica e la cultura delle nostre valli.

Tono: appassionato ma documentato, caldo, comunitario, divulgativo. Rigoroso sulle fonti. Usa espressioni identitarie come "le nostre valli", "i nostri paesi" dove naturale. Mai retorico, mai polemico.

Regole:
- Italiano standard come lingua principale.
- Termini in ladino anaunico in corsivo (markdown *cosi*), con traduzione alla prima occorrenza.
- Mai "dialetto" in senso riduttivo: usa "parlata", "lingua locale", "ladino anaunico".
- Distingui Tirolo storico (include il Trentino fino al 1919) da Tirol attuale (Land austriaco).
- Nomi storici in grafia originale (Clesio, Gaismair, Andreas Hofer, Maria Teresa d'Austria).

Rispondi SOLO sulla base del CONTESTO fornito dagli articoli dell'Associazione. Se il contesto non contiene informazioni sufficienti, dillo apertamente invece di inventare.

Al termine della risposta cita SEMPRE le fonti che hai usato nel formato: _Fonti: [Titolo articolo 1]; [Titolo articolo 2]_`;

Deno.serve(async (req: Request) => {
  const token = req.headers.get("x-ingest-token") ?? "";
  if (token !== (Deno.env.get("INGEST_TOKEN") ?? "elbrenz-ingest-2026-temp")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const body = await req.json() as { query: string };
  if (!body.query) return new Response(JSON.stringify({ error: "missing_query" }), { status: 400 });

  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const t0 = Date.now();

  // 1. Embed query
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: body.query }),
  });
  if (!embRes.ok) return new Response(JSON.stringify({ error: "embed_failed", detail: await embRes.text() }), { status: 500 });
  const emb = (await embRes.json()).data[0].embedding;
  const t_embed = Date.now() - t0;

  // 2. Semantic search
  const { data: hits, error: rpcErr } = await supabase.rpc("match_kb_semantic", {
    query_embedding: emb,
    match_count: 6,
    min_similarity: 0.35,
  });
  if (rpcErr) return new Response(JSON.stringify({ error: "rpc_failed", detail: rpcErr.message }), { status: 500 });

  let searchMode: string = "semantic";
  let finalHits: any[] = hits ?? [];

  // 3. Fallback fulltext se match semantico vuoto o debole
  if (finalHits.length === 0) {
    const { data: ftHits } = await supabase.rpc("match_kb_fulltext", { q: body.query, match_count: 6 });
    finalHits = ftHits ?? [];
    searchMode = "fulltext_fallback";
  }

  // 4. Arricchisco con dati sorgente
  const sorgenteIds = [...new Set(finalHits.map((h: any) => h.sorgente_id))];
  const { data: sorgenti } = await supabase
    .from("andreas_kb_sorgente")
    .select("id, titolo, metadata")
    .in("id", sorgenteIds);
  const srcMap = new Map((sorgenti ?? []).map((s: any) => [s.id, s]));

  const sourcesUsed = finalHits.map((h: any) => ({
    titolo: srcMap.get(h.sorgente_id)?.titolo ?? "?",
    wp_legacy_id: srcMap.get(h.sorgente_id)?.metadata?.wp_legacy_id,
    slug: srcMap.get(h.sorgente_id)?.metadata?.slug,
    similarity: h.similarity ? Number(h.similarity).toFixed(3) : null,
    chunk_index: h.chunk_index,
  }));

  // 5. Costruisci contesto
  const context = finalHits.map((h: any, i: number) => {
    const titolo = srcMap.get(h.sorgente_id)?.titolo ?? "?";
    return `[FONTE ${i + 1}: "${titolo}"]\n${h.contenuto}`;
  }).join("\n\n---\n\n");

  if (finalHits.length === 0) {
    return new Response(JSON.stringify({
      query: body.query,
      answer: "Non ho trovato informazioni sufficienti nei nostri archivi per rispondere a questa domanda. Puoi chiedere a un collaboratore dell'Associazione o riformulare la domanda.",
      sources_used: [],
      search_mode: searchMode,
      timing_ms: { embed: t_embed, total: Date.now() - t0 },
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  // 6. Chiamo Claude Haiku
  const t_claude_start = Date.now();
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `CONTESTO (articoli dell'Associazione):\n\n${context}\n\n---\n\nDOMANDA DEL SOCIO:\n${body.query}`,
      }],
    }),
  });

  if (!claudeRes.ok) {
    return new Response(JSON.stringify({
      error: "claude_failed",
      status: claudeRes.status,
      detail: (await claudeRes.text()).slice(0, 500),
      sources_used: sourcesUsed,
    }), { status: 500 });
  }

  const claudeData = await claudeRes.json();
  const answer = claudeData.content?.[0]?.text ?? "(risposta vuota)";
  const t_claude = Date.now() - t_claude_start;

  return new Response(JSON.stringify({
    query: body.query,
    answer,
    sources_used: sourcesUsed,
    search_mode: searchMode,
    usage: claudeData.usage,
    timing_ms: { embed: t_embed, claude: t_claude, total: Date.now() - t0 },
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
