// ingest-chunks — ingestione di contenuti GIÀ CHUNKATI nella KB di Andreas.
//
// A differenza di ingest-doc (che prende un testo unico e lo ri-chunka da sé),
// qui i chunk arrivano pronti con chunk_index e titolo_sezione espliciti: serve
// per le schede di sintesi curate a mano (es. lotti Baratter) dove la struttura
// per sezione è significativa e va preservata.
//
// Auth: header x-ingest-token == INGEST_TOKEN (secret). Embedding server-side
// con OPENAI_API_KEY (text-embedding-3-small, stesso spazio di andreas-chat).
// Find-or-create della sorgente via metadata->>kb_key: così il lotto 2 aggiunge
// chunk alla STESSA sorgente del lotto 1.
//
// NON tocca andreas-chat. Idempotenza a carico del chiamante (chunk_index
// unici per sorgente); opzione replace per ripulire prima di reinserire.

import { createClient } from "jsr:@supabase/supabase-js@2";

const EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_BATCH = 50;

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

interface ChunkIn {
  chunk_index: number;
  titolo_sezione?: string;
  contenuto: string;
  pagina?: number | null;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  const token = req.headers.get("x-ingest-token") ?? "";
  const expected = Deno.env.get("INGEST_TOKEN") ?? "";
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  let body: {
    source_key: string;
    source?: {
      titolo: string; autori?: string; anno?: number; editore?: string; isbn?: string;
      tipo_sorgente?: string; lingua?: string; pilastro?: string; descrizione?: string;
      visibile_ospiti?: boolean; note_interne?: string; metadata?: Record<string, unknown>;
    };
    chunks: ChunkIn[];
    set_n_chunks?: number;
    replace_chunks?: boolean; // se true, cancella i chunk esistenti della sorgente prima di inserire
  };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 }); }

  if (!body.source_key || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return new Response(JSON.stringify({ error: "missing_source_key_or_chunks" }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return new Response(JSON.stringify({ error: "openai_key_missing" }), { status: 500 });

  // 1. Find-or-create sorgente per metadata->>kb_key
  let sorgenteId: string | null = null;
  const { data: existing } = await supabase
    .from("andreas_kb_sorgente").select("id").eq("metadata->>kb_key", body.source_key).limit(1);
  if (existing && existing.length > 0) sorgenteId = existing[0].id;

  let sorgenteCreata = false;
  if (!sorgenteId) {
    if (!body.source || !body.source.titolo) {
      return new Response(JSON.stringify({ error: "source_not_found_and_no_metadata" }), { status: 400 });
    }
    const meta = { ...(body.source.metadata ?? {}), kb_key: body.source_key };
    const { data: ns, error: sErr } = await supabase.from("andreas_kb_sorgente").insert({
      titolo: body.source.titolo,
      autori: body.source.autori ?? null,
      anno: body.source.anno ?? null,
      editore: body.source.editore ?? null,
      isbn: body.source.isbn ?? null,
      tipo_sorgente: body.source.tipo_sorgente ?? "saggio_storico_sintesi",
      lingua: body.source.lingua ?? "it",
      pilastro: body.source.pilastro ?? null,
      descrizione: body.source.descrizione ?? null,
      visibile_ospiti: body.source.visibile_ospiti ?? false,
      note_interne: body.source.note_interne ?? null,
      metadata: meta,
      ingestato_il: new Date().toISOString(),
    }).select("id").single();
    if (sErr || !ns) return new Response(JSON.stringify({ error: "insert_sorgente_failed", detail: sErr?.message }), { status: 500 });
    sorgenteId = ns.id;
    sorgenteCreata = true;
  }

  if (body.replace_chunks) {
    await supabase.from("andreas_kb").delete().eq("sorgente_id", sorgenteId);
  }

  // 2. Embedding (batch) su titolo_sezione + contenuto
  const texts = body.chunks.map((c) => (c.titolo_sezione ? `${c.titolo_sezione}\n\n${c.contenuto}` : c.contenuto));
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += OPENAI_BATCH) {
    try {
      embeddings.push(...await embedBatch(texts.slice(i, i + OPENAI_BATCH), openaiKey));
    } catch (e) {
      return new Response(JSON.stringify({ error: "embed_failed", detail: String(e).slice(0, 300) }), { status: 500 });
    }
  }

  // 3. Insert chunk
  const rows = body.chunks.map((c, idx) => ({
    sorgente_id: sorgenteId,
    chunk_index: c.chunk_index,
    pagina: c.pagina ?? null,
    titolo_sezione: c.titolo_sezione ?? null,
    contenuto: c.contenuto,
    n_tokens: Math.ceil(c.contenuto.length / 4),
    embedding: embeddings[idx],
    metadata: c.metadata ?? {},
  }));
  const { error: insErr } = await supabase.from("andreas_kb").insert(rows);
  if (insErr) return new Response(JSON.stringify({ error: "insert_chunks_failed", detail: insErr.message }), { status: 500 });

  // 4. Aggiorna n_chunks se richiesto
  if (body.set_n_chunks != null) {
    await supabase.from("andreas_kb_sorgente")
      .update({ n_chunks: body.set_n_chunks, updated_at: new Date().toISOString() })
      .eq("id", sorgenteId);
  }

  return new Response(JSON.stringify({
    ok: true,
    sorgente_id: sorgenteId,
    sorgente_creata: sorgenteCreata,
    chunk_inseriti: rows.length,
    chunk_index_range: [rows[0].chunk_index, rows[rows.length - 1].chunk_index],
    n_chunks_set: body.set_n_chunks ?? null,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
