-- La sezione va in produzione come "Cimiteri di guerra", con URL corti
-- (/cimiteri-di-guerra/male) mentre lo slug archivistico resta quello vero
-- (cimitero-militare-male). Il segmento breve è un dato del fondo, non una
-- trasformazione di stringa nel codice: quando arriva un secondo fondo, la
-- pagina non deve toccare un solo file per saperne il nome.
--
-- Approfitto della stessa migrazione per aggiungere planimetria_geo alla
-- vista pubblica: mancava, e serve alla pagina della planimetria.
alter table public.memoria_fondo add column slug_breve text unique;

update public.memoria_fondo set slug_breve = 'male' where slug = 'cimitero-militare-male';

alter table public.memoria_fondo alter column slug_breve set not null;

drop view public.v_memoria_fondo_pubblico;

create view public.v_memoria_fondo_pubblico
with (security_invoker = true) as
select
  id,
  slug,
  slug_breve,
  titolo,
  sottotitolo,
  tipo,
  comune,
  valle,
  lat,
  lng,
  anno_da,
  anno_a,
  descrizione,
  archivio,
  segnatura,
  ricercatore,
  ricercatore_note,
  licenza_immagini,
  planimetria_url,
  planimetria_geo,
  posti_censiti,
  (select count(*) from memoria_persona p where p.fondo_id = f.id) as nomi_noti,
  posti_censiti - (select count(*) from memoria_persona p where p.fondo_id = f.id) as senza_nome
from memoria_fondo f
where stato = 'pubblicato';

grant select on public.v_memoria_fondo_pubblico to anon, authenticated;
