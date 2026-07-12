-- STEP 2 (resto): INSERT solo come proprio autore; SELECT editor=propri,
-- admin=tutti; il pubblico legge da v_articoli_pubblici (owner bypass RLS).
drop policy if exists articolo_insert_collab on public.articolo;
create policy articolo_insert_collab on public.articolo
  for insert to authenticated
  with check (autore_id = (select auth.uid()) and has_ruolo_min((select auth.uid()), 25));

drop policy if exists articolo_select_pubblici on public.articolo;
create policy articolo_select_own_or_admin on public.articolo
  for select to authenticated
  using (autore_id = (select auth.uid()) or has_ruolo_min((select auth.uid()), 50));
