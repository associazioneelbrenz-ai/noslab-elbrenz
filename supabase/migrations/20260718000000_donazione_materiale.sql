-- =====================================================================
-- Donatore non socio (LAVORO B). L'ospite (email verificata via OTP) può donare
-- materiale con file, sotto approvazione admin. DISTINTO dal Museo Fase A: i
-- soci caricano in museo_gg_pezzo (in_attesa); gli ospiti usano questo intake
-- donazione_materiale. File in bucket PRIVATO 'donazioni' (URL firmati per gli
-- admin). Caricato != pubblicato. La pubblicazione avviene catalogando il pezzo
-- nell'archivio giusto (museo_gg_pezzo).
-- =====================================================================
create table if not exists public.donazione_materiale (
  id            uuid primary key default gen_random_uuid(),
  donatore_id   uuid not null references auth.users(id) on delete cascade,
  tipo_donatore text not null default 'ospite',      -- ospite | socio
  titolo        text not null,
  descrizione   text not null,
  provenienza   text,
  tipo          text,                                  -- foto|cartolina|lettera|documento|oggetto|altro
  file_urls     text[] not null default '{}',          -- PATH nel bucket privato donazioni (non URL pubblici)
  diritti_dichiarati boolean not null default false,
  stato         text not null default 'in_attesa',     -- in_attesa | presa_in_carico | catalogata | respinta
  approvata_da  uuid, approvata_il timestamptz, note_interne text,
  created_at    timestamptz not null default now()
);

alter table public.donazione_materiale enable row level security;

-- il donatore (>=1, quindi ospite o socio autenticato) inserisce SOLO le proprie
drop policy if exists donazione_insert_self on public.donazione_materiale;
create policy donazione_insert_self on public.donazione_materiale
  for insert with check ( public.has_ruolo_min(auth.uid(), 1) and donatore_id = auth.uid() );
-- legge le proprie (per vedere lo stato)
drop policy if exists donazione_read_self on public.donazione_materiale;
create policy donazione_read_self on public.donazione_materiale
  for select using ( donatore_id = auth.uid() );
-- il donatore aggiorna/ritira le proprie finché in_attesa
drop policy if exists donazione_update_self on public.donazione_materiale;
create policy donazione_update_self on public.donazione_materiale
  for update using ( donatore_id = auth.uid() and stato = 'in_attesa' )
             with check ( donatore_id = auth.uid() and stato = 'in_attesa' );
-- admin (>=50): gestione completa
drop policy if exists donazione_admin_all on public.donazione_materiale;
create policy donazione_admin_all on public.donazione_materiale
  for all using ( public.has_ruolo_min(auth.uid(), 50) ) with check ( public.has_ruolo_min(auth.uid(), 50) );

grant select, insert, update on public.donazione_materiale to authenticated;

-- Guardia: il donatore non può impostare stato/approvazione, deve dichiarare i
-- diritti, e non supera il rate-limit (max 5 donazioni / 24h).
create or replace function public.donazione_guardia()
  returns trigger language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
declare admin boolean := public.has_ruolo_min(auth.uid(), 50);
begin
  if tg_op = 'INSERT' then
    if not admin then
      new.stato := 'in_attesa';
      new.approvata_da := null; new.approvata_il := null;
      if new.diritti_dichiarati is not true then
        raise exception 'Serve la dichiarazione dei diritti per donare il materiale.';
      end if;
      if (select count(*) from public.donazione_materiale
            where donatore_id = new.donatore_id and created_at > now() - interval '1 day') >= 5 then
        raise exception 'Hai raggiunto il limite di donazioni per oggi. Riprova domani.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if not admin then
      new.stato := old.stato;
      new.approvata_da := old.approvata_da; new.approvata_il := old.approvata_il;
      new.note_interne := old.note_interne;
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists trg_donazione_guardia on public.donazione_materiale;
create trigger trg_donazione_guardia
  before insert or update on public.donazione_materiale
  for each row execute function public.donazione_guardia();

-- Bucket PRIVATO per i file donati (solo immagini e PDF, max 10 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('donazioni', 'donazioni', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Storage: il donatore carica nella PROPRIA cartella donazioni/{uid}/; nessuna
-- lettura pubblica. Gli admin (>=50) leggono (per generare URL firmati).
drop policy if exists donazioni_insert_self on storage.objects;
create policy donazioni_insert_self on storage.objects
  for insert to authenticated
  with check ( bucket_id='donazioni' and (storage.foldername(name))[1] = auth.uid()::text and public.has_ruolo_min(auth.uid(),1) );

drop policy if exists donazioni_read_own_or_admin on storage.objects;
create policy donazioni_read_own_or_admin on storage.objects
  for select to authenticated
  using ( bucket_id='donazioni' and ( (storage.foldername(name))[1] = auth.uid()::text or public.has_ruolo_min(auth.uid(),50) ) );

drop policy if exists donazioni_delete_own_or_admin on storage.objects;
create policy donazioni_delete_own_or_admin on storage.objects
  for delete to authenticated
  using ( bucket_id='donazioni' and ( (storage.foldername(name))[1] = auth.uid()::text or public.has_ruolo_min(auth.uid(),50) ) );
