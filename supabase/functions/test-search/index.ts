import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const token = req.headers.get("x-ingest-token") ?? "";
  if (token !== (Deno.env.get("INGEST_TOKEN") ?? "elbrenz-ingest-2026-temp")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const body = await req.json() as { query: string; match_count?: number; min_similarity?: number };
  if (!body.query) return new Response(JSON.stringify({ error: "missing_query" }), { status: 400 });

  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Embed query
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: body.query }),
  });
  if (!embRes.ok) return new Response(JSON.stringify({ error: "embed_failed", detail: await embRes.text() }), { status: 500 });
  const emb = (await embRes.json()).data[0].embedding;

  // Semantic search
  const { data: hits, error } = await supabase.rpc("match_kb_semantic", {
    query_embedding: emb,
    match_count: body.match_count ?? 5,
    min_similarity: body.min_similarity ?? 0.3,
  });
  if (error) return new Response(JSON.stringify({ error: "rpc_failed", detail: error.message }), { status: 500 });

  // Arricchisci con titolo sorgente
  const sorgenteIds = [...new Set((hits ?? []).map((h: any) => h.sorgente_id))];
  const { data: sorgenti } = await supabase
    .from("andreas_kb_sorgente")
    .select("id, titolo, tipo_sorgente, pilastro, metadata")
    .in("id", sorgenteIds);
  const srcMap = new Map((sorgenti ?? []).map((s: any) => [s.id, s]));

  const results = (hits ?? []).map((h: any) => ({
    sorgente_titolo: srcMap.get(h.sorgente_id)?.titolo,
    wp_legacy_id: srcMap.get(h.sorgente_id)?.metadata?.wp_legacy_id,
    similarity: Number(h.similarity).toFixed(4),
    chunk_index: h.chunk_index,
    snippet: h.contenuto?.slice(0, 250) + "...",
  }));

  return new Response(JSON.stringify({ query: body.query, n_results: results.length, results }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
