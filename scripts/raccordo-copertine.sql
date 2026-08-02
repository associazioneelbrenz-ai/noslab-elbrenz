-- Generato da genera-og-articoli.mjs. Collega le copertine appena create.
update public.articolo a
set immagine_copertina_url = v.url
from (values
  ('el-brenz-e-union-ladin-nonesa-insieme-per-le-valli-del-noce', 'https://elbrenz.eu/og/articoli/el-brenz-e-union-ladin-nonesa-insieme-per-le-valli-del-noce.jpg'),
  ('speciale-censimento-linguistico-2021', 'https://elbrenz.eu/og/articoli/speciale-censimento-linguistico-2021.jpg'),
  ('fioi-dal-nos-ladinita-nonesa-e-solandra-cultura-e-lingua-on-line', 'https://elbrenz.eu/og/articoli/fioi-dal-nos-ladinita-nonesa-e-solandra-cultura-e-lingua-on-line.jpg'),
  ('after-movie-os-dal-nos-2018', 'https://elbrenz.eu/og/articoli/after-movie-os-dal-nos-2018.jpg'),
  ('trailer-documentario-fioi-dal-nos', 'https://elbrenz.eu/og/articoli/trailer-documentario-fioi-dal-nos.jpg'),
  ('expolingua-berlin', 'https://elbrenz.eu/og/articoli/expolingua-berlin.jpg'),
  ('avanti-tutta', 'https://elbrenz.eu/og/articoli/avanti-tutta.jpg')
) as v(slug, url)
where a.slug = v.slug and a.immagine_copertina_url is null;
