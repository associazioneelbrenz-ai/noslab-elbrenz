import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_TARGET_CHARS = 2400;
const CHUNK_OVERLAP_CHARS = 300;
const OPENAI_BATCH = 50;

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<!--\s*\/?wp:[^>]*-->/g, " ")
    .replace(/\[ngg[^\]]*\]/g, " ")
    .replace(/\[nggallery[^\]]*\]/g, " ")
    .replace(/\[embed\][^\[]*\[\/embed\]/g, " ")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text: string, target = CHUNK_TARGET_CHARS, overlap = CHUNK_OVERLAP_CHARS): string[] {
  if (text.length <= target) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + target, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastPeriod = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
      if (lastPeriod > target * 0.5) end = start + lastPeriod + 1;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks.filter(c => c.length > 80);
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

Deno.serve(async (req: Request) => {
  // Auth via INGEST_TOKEN (secret custom impostato nei secrets della function)
  const expectedToken = Deno.env.get("INGEST_TOKEN") ?? "elbrenz-ingest-2026-temp";
  const providedToken = req.headers.get("x-ingest-token") ?? "";
  if (providedToken !== expectedToken) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return new Response(JSON.stringify({ error: "missing_openai_key" }), { status: 500 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const dryRun = url.searchParams.get("dry_run") === "true";
  const onlyMissing = url.searchParams.get("only_missing") !== "false";

  const { data: articles, error: artErr } = await supabase
    .from("articolo")
    .select("id, wp_legacy_id, titolo, slug, corpo_html, pilastro, categorie_slug, pubblicato_at, tempo_lettura_min, wp_autore_originale")
    .eq("pubblicato", true)
    .not("wp_legacy_id", "is", null)
    .order("wp_legacy_id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (artErr) return new Response(JSON.stringify({ error: "fetch_articles", detail: artErr.message }), { status: 500 });
  if (!articles || articles.length === 0) return new Response(JSON.stringify({ message: "no_articles", offset, limit }), { status: 200 });

  let toProcess = articles;
  if (onlyMissing) {
    const articleIds = articles.map(a => a.id);
    const { data: already } = await supabase
      .from("andreas_kb_sorgente")
      .select("metadata")
      .in("metadata->>articolo_id", articleIds);
    const alreadyIds = new Set((already ?? []).map((r: any) => r.metadata?.articolo_id).filter(Boolean));
    toProcess = articles.filter(a => !alreadyIds.has(a.id));
  }

  const results: any[] = [];
  let totalChunks = 0;
  let totalCharsText = 0;

  for (const art of toProcess) {
    const cleanText = stripHtml(art.corpo_html || "");
    if (cleanText.length < 150) {
      results.push({ wp_legacy_id: art.wp_legacy_id, titolo: art.titolo, skipped: "too_short", chars: cleanText.length });
      continue;
    }
    const chunks = chunkText(cleanText);
    totalCharsText += cleanText.length;
    if (dryRun) {
      results.push({ wp_legacy_id: art.wp_legacy_id, titolo: art.titolo, chars: cleanText.length, n_chunks: chunks.length });
      totalChunks += chunks.length;
      continue;
    }

    const sorgenteMetadata = {
      articolo_id: art.id, wp_legacy_id: art.wp_legacy_id, slug: art.slug,
      pilastro: art.pilastro, categorie_slug: art.categorie_slug, wp_autore_originale: art.wp_autore_originale,
    };

    const { data: existingList } = await supabase
      .from("andreas_kb_sorgente").select("id")
      .eq("metadata->>articolo_id", art.id).limit(1);

    let sorgenteId: string;
    if (existingList && existingList.length > 0) {
      sorgenteId = existingList[0].id;
      await supabase.from("andreas_kb").delete().eq("sorgente_id", sorgenteId);
      await supabase.from("andreas_kb_sorgente").update({
        titolo: art.titolo, n_chunks: chunks.length,
        ingestato_il: new Date().toISOString(), metadata: sorgenteMetadata,
      }).eq("id", sorgenteId);
    } else {
      const { data: newSorg, error: sErr } = await supabase
        .from("andreas_kb_sorgente").insert({
          titolo: art.titolo, autori: art.wp_autore_originale,
          anno: art.pubblicato_at ? new Date(art.pubblicato_at).getFullYear() : null,
          tipo_sorgente: "articolo_rivista", lingua: "it", pilastro: art.pilastro,
          descrizione: `Articolo WP (slug: ${art.slug}, wp_id: ${art.wp_legacy_id})`,
          n_chunks: chunks.length, ingestato_il: new Date().toISOString(),
          visibile_ospiti: true, metadata: sorgenteMetadata,
        }).select("id").single();
      if (sErr || !newSorg) { results.push({ wp_legacy_id: art.wp_legacy_id, error: sErr?.message ?? "insert_sorgente" }); continue; }
      sorgenteId = newSorg.id;
    }

    const embeddings: number[][] = [];
    let embErr: string | null = null;
    for (let i = 0; i < chunks.length; i += OPENAI_BATCH) {
      const batch = chunks.slice(i, i + OPENAI_BATCH);
      try { const emb = await embedBatch(batch, openaiKey); embeddings.push(...emb); }
      catch (e) { embErr = String(e).slice(0, 200); break; }
    }
    if (embErr) { results.push({ wp_legacy_id: art.wp_legacy_id, error: `embed: ${embErr}` }); continue; }
    if (embeddings.length !== chunks.length) continue;

    const rows = chunks.map((c, idx) => ({
      sorgente_id: sorgenteId, chunk_index: idx, contenuto: c,
      n_tokens: Math.ceil(c.length / 4), embedding: embeddings[idx],
      metadata: { titolo_articolo: art.titolo, wp_legacy_id: art.wp_legacy_id, slug: art.slug },
    }));
    const { error: insErr } = await supabase.from("andreas_kb").insert(rows);
    if (insErr) { results.push({ wp_legacy_id: art.wp_legacy_id, error: `chunks: ${insErr.message}` }); continue; }

    totalChunks += chunks.length;
    results.push({ wp_legacy_id: art.wp_legacy_id, titolo: art.titolo.slice(0, 60), chars: cleanText.length, n_chunks: chunks.length, ok: true });
  }

  return new Response(JSON.stringify({
    offset, limit, processed: toProcess.length, fetched: articles.length,
    total_chunks: totalChunks, total_chars: totalCharsText, dry_run: dryRun, results,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
