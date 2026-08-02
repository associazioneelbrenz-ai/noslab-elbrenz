-- La mappa in prima fila (brief IV.5 + brief attuativo del 2/8/2026).
-- Idempotente: gia' applicata in produzione dalla chat, qui la si versiona.
--
-- `in_anteprima` marca i luoghi che compaiono nella striscia-anteprima della
-- home (sito e app). La selezione e' CURATA e vive a database, mai nel codice:
-- la Val di Non pesa 35 luoghi su 57, e un'anteprima che pescasse a caso
-- mostrerebbe quasi solo Non, facendo sparire le altre tre valli proprio
-- nella vetrina. I sei scelti coprono le quattro valli e cinque categorie.
alter table public.luoghi_interesse
  add column if not exists in_anteprima boolean not null default false;

update public.luoghi_interesse set in_anteprima = true
 where nome in ('Castel Thun','Santuario di San Romedio','Castel San Michele',
                'Sacrario militare del Passo del Tonale','Segheria veneziana Bègoi',
                'Museo di Punta Linke')
   and stato = 'pubblicato';

create or replace view public.v_luoghi_mappa as
 select id, nome, categoria, valle, lat, lng, descrizione_breve, url_articolo, slug, in_anteprima
   from luoghi_interesse
  where stato = 'pubblicato';

-- create or replace view ripristina i grant di default: il REVOKE va SEMPRE
-- ripetuto (trappola gia' pagata due volte il 2/8).
revoke insert, update, delete, truncate, references, trigger
  on public.v_luoghi_mappa from anon, authenticated;
