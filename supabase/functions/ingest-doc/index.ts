import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_TARGET_CHARS = 2400;
const CHUNK_OVERLAP_CHARS = 300;
const OPENAI_BATCH = 50;

function cleanText(t: string): string {
  if (!t) return "";
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
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
      // Preferisci break su \n\n, poi su \n, poi su ". "
      const lastPara = slice.lastIndexOf("\n\n");
      const lastLine = slice.lastIndexOf("\n");
      const lastPeriod = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
      if (lastPara > target * 0.5) end = start + lastPara + 2;
      else if (lastLine > target * 0.5) end = start + lastLine + 1;
      else if (lastPeriod > target * 0.5) end = start + lastPeriod + 1;
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
  const token = req.headers.get("x-ingest-token") ?? "";
  if (token !== (Deno.env.get("INGEST_TOKEN") ?? "elbrenz-ingest-2026-temp")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  let body: {
    titolo: string;
    testo: string;
    autori?: string;
    anno?: number;
    tipo_sorgente?: string;
    pilastro?: string;
    lingua?: string;
    descrizione?: string;
    visibile_ospiti?: boolean;
    metadata?: Record<string, any>;
    replace_existing_key?: string; // se fornita una chiave in metadata, delete + re-insert
  };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 }); }

  if (!body.titolo || !body.testo) {
    return new Response(JSON.stringify({ error: "missing_titolo_or_testo" }), { status: 400 });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const testoClean = cleanText(body.testo);
  if (testoClean.length < 200) {
    return new Response(JSON.stringify({ error: "testo_troppo_breve", chars: testoClean.length }), { status: 400 });
  }

  const chunks = chunkText(testoClean);
  const metadata = body.metadata ?? {};

  // Se replace_existing_key specificato, cerca e cancella sorgente esistente
  let sorgenteId: string | null = null;
  if (body.replace_existing_key && metadata[body.replace_existing_key]) {
    const key = body.replace_existing_key;
    const val = metadata[key];
    const { data: existing } = await supabase
      .from("andreas_kb_sorgente")
      .select("id")
      .eq(`metadata->>${key}`, String(val))
      .limit(1);
    if (existing && existing.length > 0) {
      sorgenteId = existing[0].id;
      await supabase.from("andreas_kb").delete().eq("sorgente_id", sorgenteId);
      await supabase.from("andreas_kb_sorgente").update({
        titolo: body.titolo,
        autori: body.autori ?? null,
        anno: body.anno ?? null,
        tipo_sorgente: body.tipo_sorgente ?? "documento_archivio",
        lingua: body.lingua ?? "it",
        pilastro: body.pilastro ?? null,
        descrizione: body.descrizione ?? null,
        visibile_ospiti: body.visibile_ospiti ?? false,
        n_chunks: chunks.length,
        ingestato_il: new Date().toISOString(),
        metadata,
      }).eq("id", sorgenteId);
    }
  }

  // Insert se non esisteva
  if (!sorgenteId) {
    const { data: newSorg, error: sErr } = await supabase
      .from("andreas_kb_sorgente").insert({
        titolo: body.titolo,
        autori: body.autori ?? null,
        anno: body.anno ?? null,
        tipo_sorgente: body.tipo_sorgente ?? "documento_archivio",
        lingua: body.lingua ?? "it",
        pilastro: body.pilastro ?? null,
        descrizione: body.descrizione ?? null,
        visibile_ospiti: body.visibile_ospiti ?? false,
        n_chunks: chunks.length,
        ingestato_il: new Date().toISOString(),
        metadata,
      }).select("id").single();
    if (sErr || !newSorg) {
      return new Response(JSON.stringify({ error: "insert_sorgente_failed", detail: sErr?.message }), { status: 500 });
    }
    sorgenteId = newSorg.id;
  }

  // Embeddings batch
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += OPENAI_BATCH) {
    const batch = chunks.slice(i, i + OPENAI_BATCH);
    try {
      const emb = await embedBatch(batch, openaiKey);
      embeddings.push(...emb);
    } catch (e) {
      return new Response(JSON.stringify({ error: "embed_failed", detail: String(e).slice(0, 300) }), { status: 500 });
    }
  }

  const rows = chunks.map((c, idx) => ({
    sorgente_id: sorgenteId,
    chunk_index: idx,
    contenuto: c,
    n_tokens: Math.ceil(c.length / 4),
    embedding: embeddings[idx],
    metadata: { titolo_sorgente: body.titolo, ...metadata },
  }));

  const { error: insErr } = await supabase.from("andreas_kb").insert(rows);
  if (insErr) {
    return new Response(JSON.stringify({ error: "insert_chunks_failed", detail: insErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    ok: true,
    sorgente_id: sorgenteId,
    titolo: body.titolo,
    chars: testoClean.length,
    n_chunks: chunks.length,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
