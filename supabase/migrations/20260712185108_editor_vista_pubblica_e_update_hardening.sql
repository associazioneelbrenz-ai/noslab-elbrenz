-- Editor STEP 2 (parziale, additivo + hardening mirato) + vista pubblica.

-- Vista pubblica: solo articoli pubblicati, campi pubblici (niente autore_id,
-- stato, motivo_rifiuto, campi interni). Pattern come convenzioni_pubbliche.
create or replace view public.v_articoli_pubblici as
  select id, titolo, slug, sottotitolo, estratto, corpo_html,
         immagine_copertina_url, pilastro, tags, categorie_slug,
         tipo_contenuto, in_evidenza, tempo_lettura_min, pubblicato_at
  from public.articolo
  where pubblicato = true and stato = 'pubblicato';
grant select on public.v_articoli_pubblici to anon, authenticated;

-- Hardening UPDATE: la policy esistente non aveva WITH CHECK, quindi un editor
-- poteva impostare pubblicato=true, cambiare autore_id o modificare articoli
-- gia pubblicati. La ricreiamo con la stessa USING + WITH CHECK stretto.
drop policy if exists articolo_update_collab on public.articolo;
create policy articolo_update_collab on public.articolo
  for update to public
  using ((autore_id = (select auth.uid())) or has_ruolo_min((select auth.uid()), 50))
  with check (
    ((autore_id = (select auth.uid())) and stato in ('bozza','rifiutato'))
    or has_ruolo_min((select auth.uid()), 50)
  );
