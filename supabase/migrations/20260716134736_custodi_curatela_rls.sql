-- Curatela «Custodi della Memoria»: RLS admin su custodi_memoria per la UI di
-- catalogazione (/custodi-curatela). Un admin El Brenz (livello>=50) può leggere
-- TUTTE le righe — anche visibile=false, che la vista pubblica nasconde — e
-- crearne/aggiornarne (categoria/valle/epoca/tipo + visibile).
--
-- La tabella ha RLS abilitata ma ZERO policy = default-deny: la pagina pubblica
-- non tocca la tabella (legge la vista v_custodi_memoria). Qui aggiungiamo SOLO
-- policy per il ruolo 'authenticated' gated su has_ruolo_min(auth.uid(),50),
-- stesso modello delle policy editor su `articolo`. anon resta senza accesso
-- alla tabella base. I grant a authenticated (select/insert/update) esistono già.

drop policy if exists custodi_memoria_admin_select on public.custodi_memoria;
create policy custodi_memoria_admin_select on public.custodi_memoria
  for select to authenticated
  using (public.has_ruolo_min(auth.uid(), 50));

drop policy if exists custodi_memoria_admin_insert on public.custodi_memoria;
create policy custodi_memoria_admin_insert on public.custodi_memoria
  for insert to authenticated
  with check (public.has_ruolo_min(auth.uid(), 50));

drop policy if exists custodi_memoria_admin_update on public.custodi_memoria;
create policy custodi_memoria_admin_update on public.custodi_memoria
  for update to authenticated
  using (public.has_ruolo_min(auth.uid(), 50))
  with check (public.has_ruolo_min(auth.uid(), 50));
