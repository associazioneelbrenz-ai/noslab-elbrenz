-- =====================================================================
-- Storie = racconti liberi dei soci con immagini. Pubblicazione libera +
-- moderazione (come il Forum). Promozione a pubblica = SOLO admin (>=50):
-- solo allora la storia esce sul sito, visibile a tutti. Default = soci-only.
-- Distinta da Custodi (archivio curato) e Forum (discussione).
-- =====================================================================
create table if not exists public.storia (
  id            uuid primary key default gen_random_uuid(),
  autore_id     uuid not null references auth.users(id) on delete cascade,
  titolo        text not null,
  contenuto     text not null,
  immagini_urls text[] not null default '{}',
  copertina_url text,
  stato         text not null default 'pubblicata',   -- pubblicata | nascosta
  pubblica      boolean not null default false,        -- true = promossa (sul sito)
  diritti_dichiarati boolean not null default false,
  promossa_da   uuid,
  promossa_il   timestamptz,
  moderata_da   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.storia enable row level security;

-- ---- LETTURA ----
-- soci (>=10): tutte le storie non nascoste.
drop policy if exists storia_read_soci on public.storia;
create policy storia_read_soci on public.storia
  for select using ( public.has_ruolo_min(auth.uid(), 10) and stato = 'pubblicata' );
-- anon/pubblico: SOLO le storie promosse pubbliche e non nascoste.
drop policy if exists storia_read_public on public.storia;
create policy storia_read_public on public.storia
  for select using ( pubblica = true and stato = 'pubblicata' );
-- l'autore vede SEMPRE le proprie (anche nascoste) per "I miei contributi".
drop policy if exists storia_read_own on public.storia;
create policy storia_read_own on public.storia
  for select using ( autore_id = auth.uid() );

-- ---- SCRITTURA ----
drop policy if exists storia_insert_socio on public.storia;
create policy storia_insert_socio on public.storia
  for insert with check ( public.has_ruolo_min(auth.uid(), 10) and autore_id = auth.uid() );
drop policy if exists storia_update_socio on public.storia;
create policy storia_update_socio on public.storia
  for update using ( autore_id = auth.uid() ) with check ( autore_id = auth.uid() );
drop policy if exists storia_delete_socio on public.storia;
create policy storia_delete_socio on public.storia
  for delete using ( autore_id = auth.uid() );
-- moderazione + promozione: admin (>=50) su qualunque storia.
drop policy if exists storia_admin_all on public.storia;
create policy storia_admin_all on public.storia
  for all using ( public.has_ruolo_min(auth.uid(), 50) ) with check ( public.has_ruolo_min(auth.uid(), 50) );

grant select on public.storia to anon, authenticated;
grant insert, update, delete on public.storia to authenticated;

-- ---- GUARDIA: i campi riservati (promozione/moderazione) sono ADMIN-ONLY ----
-- La policy update del socio permetterebbe di cambiare qualunque colonna delle
-- PROPRIE storie, incluso pubblica/stato: qui si blocca. Un non-admin non puo'
-- auto-promuoversi a pubblico ne' auto-moderarsi; all'insert i campi riservati
-- sono forzati ai default. Inoltre la dichiarazione dei diritti e' obbligatoria.
create or replace function public.storia_guardia()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
declare admin boolean := public.has_ruolo_min(auth.uid(), 50);
begin
  if tg_op = 'INSERT' then
    new.updated_at := now();
    if not admin then
      new.pubblica := false;
      new.stato := 'pubblicata';
      new.promossa_da := null; new.promossa_il := null; new.moderata_da := null;
      if new.diritti_dichiarati is not true then
        raise exception 'Per condividere una storia devi dichiarare di avere il diritto sulle immagini.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    if not admin then
      new.pubblica := old.pubblica;
      new.stato := old.stato;
      new.promossa_da := old.promossa_da;
      new.promossa_il := old.promossa_il;
      new.moderata_da := old.moderata_da;
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists trg_storia_guardia on public.storia;
create trigger trg_storia_guardia
  before insert or update on public.storia
  for each row execute function public.storia_guardia();

-- ---- STORAGE: upload immagini storie dal socio (>=10) nel prefisso storie/ ----
-- assets-pubblici (pubblico). Le policy esistenti richiedono >=25 in insert;
-- qui si aggiunge il permesso mirato al prefisso storie/ per i soci (>=10).
drop policy if exists assets_storie_insert_soci on storage.objects;
create policy assets_storie_insert_soci on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets-pubblici'
    and (storage.foldername(name))[1] = 'storie'
    and public.has_ruolo_min(auth.uid(), 10)
  );
