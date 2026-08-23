-- Brief 23/8/2026, sez. 6.4-6.5: "un luogo si puo' pubblicare anche con la
-- toponomastica non ancora validata: in quel caso la scheda pubblica non
-- mostra il nome ladino". Il gate vive QUI, nella vista, non nelle pagine:
-- le pagine gia' fanno `{luogo.nome_ladino && ...}`, quindi restituire null
-- quando non e' validato basta, senza toccare il codice delle pagine.
--
-- Gating solo su cio' che descrive COME si dice il nome ladino (nome, parlata,
-- varianti, pronuncia, audio): quello o e' giusto o non lo si mostra, non c'e'
-- via di mezzo onesta. L'etimologia invece porta gia' il proprio grado di
-- certezza (etimologia_certezza) mostrato accanto: un'ipotesi etichettata
-- "ipotesi" e' un dato onesto anche prima che qualcuno la validi. nome_tedesco
-- non fa parte della validazione del curatore linguistico (che risponde della
-- forma LADINA), resta sempre visibile quando c'e'.
--
-- security_invoker=on preservato esplicitamente: senza, il join a
-- archivio_audio girerebbe con i permessi di chi ha CREATO la vista, non di
-- chi guarda la pagina, e un audio non ancora "visibile_ospiti" finirebbe
-- comunque pubblico.

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
  (coalesce(btrim(l.nome_ladino), '') <> '' and l.toponimo_validato_il is null) as toponimo_in_verifica
from public.luoghi_interesse l
left join public.archivio_audio a on a.id = l.audio_id
where l.stato = 'pubblicato' and l.slug is not null and l.slug <> '';

create or replace view public.v_luoghi_mappa
with (security_invoker = true) as
select
  l.id, l.nome, l.categoria, l.valle, l.lat, l.lng,
  l.descrizione_breve, l.url_articolo, l.slug, l.in_anteprima,
  case when l.toponimo_validato_il is not null then l.nome_ladino else null end as nome_ladino
from public.luoghi_interesse l
where l.stato = 'pubblicato';
