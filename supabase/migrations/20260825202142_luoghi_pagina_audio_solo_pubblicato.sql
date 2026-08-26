-- v_luoghi_pagina unisce archivio_audio per la pronuncia del toponimo. Con
-- security_invoker il join richiede il SELECT sulla tabella, che ad anon mancava:
-- la scheda pubblica di ogni luogo rispondeva "permission denied".
-- Il grant apre la porta; la RLS (visibile_ospiti oppure ruolo) decide cosa passa.
grant select on public.archivio_audio to anon;

-- Doppia sicurezza: la vista espone la registrazione solo se e' stata PUBBLICATA,
-- non solo se il toponimo e' validato. Cosi' una voce in attesa non puo' finire
-- online nemmeno se un giorno qualcuno le accendesse il flag di visibilita'.
create or replace view public.v_luoghi_pagina as
 select l.id, l.slug, l.nome, l.categoria, l.valle, l.lat, l.lng,
    l.descrizione_breve, l.descrizione_estesa, l.meta_description, l.url_articolo, l.fonte_immagine,
    case when l.toponimo_validato_il is not null then l.nome_ladino else null::text end as nome_ladino,
    l.nome_tedesco,
    case when l.toponimo_validato_il is not null then l.parlata else null::text end as parlata,
    case when l.toponimo_validato_il is not null then l.nome_ladino_varianti else null::text[] end as nome_ladino_varianti,
    case when l.toponimo_validato_il is not null then l.pronuncia_ipa else null::text end as pronuncia_ipa,
    case when l.toponimo_validato_il is not null and a.stato = 'pubblicato' then a.file_url else null::text end as audio_url,
    case when l.toponimo_validato_il is not null then l.etimologia else null::text end as etimologia,
    case when l.toponimo_validato_il is not null then l.etimologia_strato else null::text end as etimologia_strato,
    case when l.toponimo_validato_il is not null then l.etimologia_certezza else null::text end as etimologia_certezza,
    l.toponimo_validato_il is not null as toponimo_validato,
    coalesce(btrim(l.nome_ladino),'') <> '' and l.toponimo_validato_il is null as toponimo_in_verifica,
    l.immagini_urls
   from public.luoghi_interesse l
   left join public.archivio_audio a on a.id = l.audio_id
  where l.stato = 'pubblicato' and l.slug is not null and l.slug <> '';

alter view public.v_luoghi_pagina set (security_invoker = true);
revoke all on public.v_luoghi_pagina from anon, authenticated;
grant select on public.v_luoghi_pagina to anon, authenticated;;
