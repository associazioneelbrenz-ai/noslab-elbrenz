-- Brief 24/8/2026, item 4: le foto dei luoghi non erano previste — solo
-- `fonte_immagine` (il credito), vuota su tutti i 57. Applicata in
-- produzione dalla chat PRIMA di questo file: qui si versiona.
--
-- `immagini_urls text[]`, stesso schema gia' in uso per `museo_gg_pezzo`.
-- Le due viste pubbliche sono state riscritte per esporla — in coda, perche'
-- CREATE OR REPLACE VIEW non permette di riordinare le colonne esistenti —
-- e i permessi SELECT ri-concessi esplicitamente, perche' quell'istruzione
-- li azzera in silenzio. Il testo qui sotto e' quello letto da
-- pg_get_viewdef sul database vivo, non ricostruito a memoria.

alter table public.luoghi_interesse add column if not exists immagini_urls text[];

create or replace view public.v_luoghi_pagina
with (security_invoker = true) as
select
  l.id, l.slug, l.nome, l.categoria, l.valle, l.lat, l.lng,
  l.descrizione_breve, l.descrizione_estesa, l.meta_description,
  l.url_articolo, l.fonte_immagine,
  case when l.toponimo_validato_il is not null then l.nome_ladino else null end as nome_ladino,
  l.nome_tedesco,
  case when l.toponimo_validato_il is not null then l.parlata else null end as parlata,
  case when l.toponimo_validato_il is not null then l.nome_ladino_varianti else null end as nome_ladino_varianti,
  case when l.toponimo_validato_il is not null then l.pronuncia_ipa else null end as pronuncia_ipa,
  case when l.toponimo_validato_il is not null then a.file_url else null end as audio_url,
  l.etimologia, l.etimologia_strato, l.etimologia_certezza,
  (l.toponimo_validato_il is not null) as toponimo_validato,
  (coalesce(btrim(l.nome_ladino), '') <> '' and l.toponimo_validato_il is null) as toponimo_in_verifica,
  l.immagini_urls
from public.luoghi_interesse l
left join public.archivio_audio a on a.id = l.audio_id
where l.stato = 'pubblicato' and l.slug is not null and l.slug <> '';

create or replace view public.v_luoghi_mappa
with (security_invoker = true) as
select
  l.id, l.nome, l.categoria, l.valle, l.lat, l.lng,
  l.descrizione_breve, l.url_articolo, l.slug, l.in_anteprima,
  case when l.toponimo_validato_il is not null then l.nome_ladino else null end as nome_ladino,
  l.immagini_urls[1] as immagine_copertina
from public.luoghi_interesse l
where l.stato = 'pubblicato';

grant select on public.v_luoghi_pagina to anon, authenticated;
grant select on public.v_luoghi_mappa to anon, authenticated;
