-- Cimiteri di guerra — brief "fondo 1941", 26/8/2026 §9. Additivo: due
-- colonne nuove, nessuna esistente toccata. Il fondo di Malè non e' un
-- registro del 1918: e' una pratica amministrativa del 1941 che rivede le
-- sepolture di guerra, protocollo Zl. 13.800/1941 — va detto in testa alla
-- pagina, non solo nel racconto.
alter table public.memoria_fondo add column if not exists protocollo text;
alter table public.memoria_fondo add column if not exists anno_pratica integer;

update public.memoria_fondo
set protocollo = 'Zl. 13.800/1941',
    anno_pratica = 1941
where slug_breve = 'male';

create or replace view public.v_memoria_fondo_pubblico as
select id, slug, slug_breve, titolo, sottotitolo, tipo, comune, valle, lat, lng,
       anno_da, anno_a, descrizione, archivio, segnatura, ricercatore, ricercatore_note,
       licenza_immagini, planimetria_url, planimetria_geo, racconto_html, posti_censiti,
       (select count(*) from memoria_persona p where p.fondo_id = f.id) as nomi_noti,
       posti_censiti - (select count(*) from memoria_persona p where p.fondo_id = f.id) as senza_nome,
       protocollo, anno_pratica
from public.memoria_fondo f
where stato = 'pubblicato';

alter view public.v_memoria_fondo_pubblico set (security_invoker = true);
revoke all on public.v_memoria_fondo_pubblico from anon, authenticated;
grant select on public.v_memoria_fondo_pubblico to anon, authenticated;
