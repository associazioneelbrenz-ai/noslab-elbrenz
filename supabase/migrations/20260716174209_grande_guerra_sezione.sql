-- «Non e Sole Grande Guerra»: da categoria Custodi a SEZIONE autonoma.
-- Riusa l'infrastruttura Custodi (custodi_memoria, curatela, RLS) via un campo
-- `sezione`: 'custodi' (default) e 'grande_guerra'. Additivo.

-- 1) La Grande Guerra esce dalle categorie dei Custodi (0 righe la referenziano).
delete from public.custodi_categoria where slug = 'grande-guerra';

-- 2) Campo sezione sulla rubrica (default 'custodi').
alter table public.custodi_memoria
  add column if not exists sezione text not null default 'custodi';

-- 3) Vista pubblica: espone anche `sezione` (le pagine filtrano per sezione).
--    Sempre gated visibile=true.
create or replace view public.v_custodi_memoria as
  select c.nome_pubblico,
         c.paese,
         c.descrizione_contributo,
         c.anno,
         c.anonimo,
         c.categoria_slug,
         c.valle,
         c.epoca,
         c.tipo_materiale,
         cat.titolo_it    as categoria_titolo_it,
         cat.titolo_lenga as categoria_titolo_lenga,
         cat.ordine       as categoria_ordine,
         c.sezione
  from public.custodi_memoria c
  left join public.custodi_categoria cat on cat.slug = c.categoria_slug
  where c.visibile = true;
