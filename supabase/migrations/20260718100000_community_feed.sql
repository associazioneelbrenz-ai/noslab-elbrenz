-- =====================================================================
-- Community stile feed (§5 Fase 1). Riusa lo schema forum: un POST del feed è
-- un forum_thread (titolo ora FACOLTATIVO), i commenti sono forum_post, le
-- reazioni forum_reazione (già su thread e post). I media (immagini/PDF) vanno
-- in una nuova tabella forum_media legata al thread O al post. Storage pubblico
-- assets-pubblici/community/{uid}/. Additivo: i thread esistenti non si toccano.
-- =====================================================================

-- 1) titolo del thread facoltativo (post-feed senza titolo). Le righe esistenti
--    hanno già un titolo: rilassare il NOT NULL non le rompe.
alter table public.forum_thread alter column titolo drop not null;

-- 2) media di un post del feed o di un commento
create table if not exists public.forum_media (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid references public.forum_thread(id) on delete cascade,
  post_id    uuid references public.forum_post(id)   on delete cascade,
  tipo       text not null default 'immagine',       -- immagine | documento | video | embed
  url        text not null,
  ordine     integer not null default 0,
  created_at timestamptz not null default now(),
  constraint forum_media_parent_ck check (thread_id is not null or post_id is not null)
);
create index if not exists forum_media_thread_idx on public.forum_media(thread_id);
create index if not exists forum_media_post_idx   on public.forum_media(post_id);

alter table public.forum_media enable row level security;

-- lettura: solo soci (>=10), come il resto del forum (community non pubblica)
drop policy if exists forum_media_read on public.forum_media;
create policy forum_media_read on public.forum_media
  for select using ( public.has_ruolo_min(auth.uid(), 10) );

-- inserimento: il socio allega SOLO a un proprio thread o post
drop policy if exists forum_media_insert_own on public.forum_media;
create policy forum_media_insert_own on public.forum_media
  for insert with check (
    public.has_ruolo_min(auth.uid(), 10) and (
      (thread_id is not null and exists (select 1 from public.forum_thread th where th.id = thread_id and th.autore_id = auth.uid()))
      or (post_id is not null and exists (select 1 from public.forum_post p where p.id = post_id and p.autore_id = auth.uid()))
    )
  );

-- eliminazione: il proprietario del contenuto padre o un admin (>=50, moderazione)
drop policy if exists forum_media_delete on public.forum_media;
create policy forum_media_delete on public.forum_media
  for delete using (
    public.has_ruolo_min(auth.uid(), 50)
    or (thread_id is not null and exists (select 1 from public.forum_thread th where th.id = thread_id and th.autore_id = auth.uid()))
    or (post_id is not null and exists (select 1 from public.forum_post p where p.id = post_id and p.autore_id = auth.uid()))
  );

grant select, insert, delete on public.forum_media to authenticated;

-- 3) Storage: i media community vanno in assets-pubblici/community/{uid}/ (bucket
--    pubblico, come storie/museo). Insert nella PROPRIA cartella, socio (>=10).
drop policy if exists community_insert_self on storage.objects;
create policy community_insert_self on storage.objects
  for insert to authenticated
  with check ( bucket_id='assets-pubblici' and (storage.foldername(name))[1] = 'community'
               and (storage.foldername(name))[2] = auth.uid()::text
               and public.has_ruolo_min(auth.uid(), 10) );

drop policy if exists community_delete_own_or_admin on storage.objects;
create policy community_delete_own_or_admin on storage.objects
  for delete to authenticated
  using ( bucket_id='assets-pubblici' and (storage.foldername(name))[1] = 'community'
          and ( (storage.foldername(name))[2] = auth.uid()::text or public.has_ruolo_min(auth.uid(), 50) ) );
