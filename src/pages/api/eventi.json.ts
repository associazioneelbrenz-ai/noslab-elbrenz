// GET /api/eventi.json — prossimi eventi in JSON (per il bot Telegram e usi
// futuri). data >= oggi, non bozza, non annullato, ordinati per data.
// SSR (prerender=false) così è sempre aggiornato senza attendere un rebuild.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = false;

export const GET: APIRoute = async () => {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const eventi = (await getCollection('eventi', ({ data }) => !data.bozza && !data.annullato))
    .filter((e) => e.data.data.getTime() >= oggi.getTime())
    .sort((a, b) => a.data.data.getTime() - b.data.data.getTime())
    .map((e) => ({
      slug: e.id,
      titolo: e.data.titolo,
      data: e.data.data.toISOString().slice(0, 10),
      luogo: e.data.luogo ?? null,
      oraInizio: e.data.oraInizio ?? null,
      descrizioneBreve: e.data.descrizioneBreve ?? null,
      link: e.data.link ?? null,
    }));

  return new Response(JSON.stringify({ ok: true, eventi }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
