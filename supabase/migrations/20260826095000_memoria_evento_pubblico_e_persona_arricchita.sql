-- Brief "Cimiteri di guerra, la sezione completa" (26/8/2026): le pagine dei
-- reparti, delle provenienze e dell'evento hanno bisogno di collegare ogni
-- persona al fondo (slug_breve, per i link) e all'evento (quando c'e', col
-- grado di certezza). Le viste restano l'unica fonte delle pagine.
create view public.v_memoria_evento_pubblico
with (security_invoker = true) as
select id, slug, nome, nome_originale, data_da, data_a, luogo, descrizione, fonti
from memoria_evento;

grant select on public.v_memoria_evento_pubblico to anon, authenticated;

drop view public.v_memoria_persona_pubblica;

create view public.v_memoria_persona_pubblica
with (security_invoker = true) as
select
  p.id,
  p.slug,
  f.slug as fondo_slug,
  f.slug_breve as fondo_slug_breve,
  f.titolo as fondo_titolo,
  f.comune,
  f.valle,
  p.settore,
  p.numero,
  p.nome_completo,
  p.grado,
  p.reparto,
  p.data_morte_testo,
  p.data_morte,
  p.anno_nascita,
  p.luogo_nascita,
  p.regione_nascita,
  p.prigioniero_guerra,
  p.ignoto,
  p.note,
  e.slug as evento_slug,
  e.nome as evento_nome,
  p.evento_certezza
from memoria_persona p
join memoria_fondo f on f.id = p.fondo_id
left join memoria_evento e on e.id = p.evento_id
where f.stato = 'pubblicato';

grant select on public.v_memoria_persona_pubblica to anon, authenticated;
