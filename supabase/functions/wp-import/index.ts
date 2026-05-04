import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  // Proteggo con SERVICE_ROLE_KEY come bearer (già disponibile nell'env)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" }
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey
  );

  let records: any[] = [];
  try {
    records = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid_json", detail: String(e) }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  if (!Array.isArray(records) || records.length === 0) {
    return new Response(JSON.stringify({ error: "empty_payload" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  const rows = records.map(r => ({
    wp_legacy_id: r.wp_legacy_id ?? null,
    titolo: r.titolo ?? "",
    slug: r.slug ?? "",
    corpo_html: r.corpo_html ?? "",
    estratto: r.estratto ?? null,
    immagine_copertina_url: r.immagine_copertina_url ?? null,
    autore_id: r.autore_id ?? null,
    wp_autore_originale: r.wp_autore_originale ?? null,
    pilastro: r.pilastro ?? "vita-associativa",
    categorie_slug: r.categorie_slug ?? [],
    tags: r.tags ?? [],
    pubblicato: r.pubblicato ?? false,
    pubblicato_at: r.pubblicato_at ?? null,
    tempo_lettura_min: r.tempo_lettura_min ?? 1,
    tipo_contenuto: r.tipo_contenuto ?? "post",
  }));

  const CHUNK = 20;
  let inserted = 0;
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("articolo")
      .upsert(chunk, { onConflict: "wp_legacy_id", ignoreDuplicates: false })
      .select("wp_legacy_id");

    if (error) {
      errors.push({ chunk_start: i, message: error.message });
    } else {
      inserted += data?.length ?? 0;
    }
  }

  const { count } = await supabase
    .from("articolo")
    .select("*", { count: "exact", head: true })
    .not("wp_legacy_id", "is", null);

  return new Response(JSON.stringify({
    ok: errors.length === 0,
    processed: rows.length,
    inserted_or_updated: inserted,
    total_in_db: count,
    errors
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
