-- =====================================================================
-- Museo della Grande Guerra — archivio digitale AUTONOMO, staccato dai
-- Custodi. Tabella propria + galleria pubblica + curatela admin.
-- Fase B (ora): upload/pubblicazione solo admin (>=50).
-- Fase A (futura): upload soci in PWA con validazione (policy socio-insert
-- 'in_attesa' da aggiungere allora).
-- I Custodi restano intatti (custodi_memoria, sezione='custodi').
-- =====================================================================
create table if not exists public.museo_gg_pezzo (
  id            uuid primary key default gen_random_uuid(),
  titolo        text not null,
  descrizione   text,
  tipo          text not null default 'foto',      -- foto|cartolina|lettera|documento|oggetto
  anno          int,
  periodo       text,                               -- es. '1914-1918'
  luogo         text,
  valle         text,                               -- val_di_non|val_di_sole|val_di_rabbi|val_di_pejo|piu_valli
  fonte         text not null,                      -- provenienza/collocazione: OBBLIGATORIA (cartellino)
  elaborazione  text,                               -- es. 'elaborazione Michele Corradini'
  donatore      text,                               -- nome pubblico di chi dona; 'Anonimo' se richiesto
  immagini_urls text[] not null default '{}',       -- una o piu' immagini (es. fronte/retro cartolina)
  consenso_dichiarato boolean not null default false,
  stato         text not null default 'in_attesa',  -- in_attesa|pubblicato
  caricato_da   uuid,                               -- utente che carica (fase A); admin in fase B
  validato_da   uuid,
  validato_il   timestamptz,
  ordine        int  not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.museo_gg_pezzo enable row level security;

-- Lettura pubblica: SOLO pezzi pubblicati (deny-by-default per tutto il resto).
drop policy if exists museo_gg_public_read on public.museo_gg_pezzo;
create policy museo_gg_public_read on public.museo_gg_pezzo
  for select using (stato = 'pubblicato');

-- Scrittura/upload: solo admin (>=50) in fase B.
-- (Fase A aggiungera' una policy socio-insert limitata a stato='in_attesa'.)
drop policy if exists museo_gg_admin_write on public.museo_gg_pezzo;
create policy museo_gg_admin_write on public.museo_gg_pezzo
  for all
  using ( public.has_ruolo_min(auth.uid(), 50) )
  with check ( public.has_ruolo_min(auth.uid(), 50) );

grant select on public.museo_gg_pezzo to anon, authenticated;
grant insert, update, delete on public.museo_gg_pezzo to authenticated;

-- --- Guardia a DB: il "cartellino" del museo e' obbligatorio -----------------
-- Non si puo' pubblicare (stato='pubblicato') senza fonte, senza almeno
-- un'immagine e senza consenso dichiarato. Vincolo lato DB oltre alla UI.
create or replace function public.museo_gg_guardia_pubblicazione()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
begin
  new.updated_at := now();
  if new.stato = 'pubblicato' then
    if coalesce(btrim(new.fonte), '') = '' then
      raise exception 'Impossibile pubblicare: la fonte/provenienza e'' obbligatoria (cartellino).';
    end if;
    if new.immagini_urls is null or array_length(new.immagini_urls, 1) is null then
      raise exception 'Impossibile pubblicare: serve almeno un''immagine.';
    end if;
    if new.consenso_dichiarato is not true then
      raise exception 'Impossibile pubblicare: manca la dichiarazione di consenso.';
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists trg_museo_gg_guardia on public.museo_gg_pezzo;
create trigger trg_museo_gg_guardia
  before insert or update on public.museo_gg_pezzo
  for each row execute function public.museo_gg_guardia_pubblicazione();
