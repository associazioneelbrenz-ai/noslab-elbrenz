-- =====================================================================
-- Riconoscimenti e crescita community (Fase 1). Punti ancorati alla QUALITÀ
-- (reazioni ricevute, contributi validati), livelli COSMETICI (mai gating),
-- distintivi. Scrittura punti SOLO server-side (trigger SECURITY DEFINER):
-- nessuna policy di insert per il socio. Additivo.
-- =====================================================================

-- 1) Ledger append-only
create table if not exists public.punti_evento (
  id uuid primary key default gen_random_uuid(),
  utente_id uuid not null references public.utente(id) on delete cascade,
  tipo_azione text not null,
  punti integer not null,
  riferimento_tipo text,
  riferimento_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_punti_evento_utente on public.punti_evento(utente_id);
create index if not exists idx_punti_evento_giorno on public.punti_evento(utente_id, created_at);
alter table public.punti_evento enable row level security;
drop policy if exists punti_read_self on public.punti_evento;
create policy punti_read_self on public.punti_evento for select using (utente_id = auth.uid());
drop policy if exists punti_admin_all on public.punti_evento;
create policy punti_admin_all on public.punti_evento for all
  using (public.has_ruolo_min(auth.uid(),50)) with check (public.has_ruolo_min(auth.uid(),50));

-- 2) Livelli (config)
create table if not exists public.livello (
  id serial primary key, codice text unique not null, nome text not null,
  soglia_punti integer not null, ordine integer not null, descrizione text, icona text
);
alter table public.livello enable row level security;
drop policy if exists livello_read_all on public.livello;
create policy livello_read_all on public.livello for select using (true);
drop policy if exists livello_admin_write on public.livello;
create policy livello_admin_write on public.livello for all
  using (public.has_ruolo_min(auth.uid(),50)) with check (public.has_ruolo_min(auth.uid(),50));
insert into public.livello (codice,nome,soglia_punti,ordine,descrizione) values
 ('l0','Nuova voce',0,0,'Benvenuto nella comunità'),
 ('l1','Partecipante',25,1,'Hai iniziato a contribuire'),
 ('l2','Voce attiva',75,2,'La tua presenza si fa sentire'),
 ('l3','Contributore',200,3,'Contribuisci con costanza'),
 ('l4','Pilastro della comunità',500,4,'Un riferimento per gli altri soci'),
 ('l5','Memoria vivente',1000,5,'Custode del patrimonio delle valli')
on conflict (codice) do nothing;

-- 3) Distintivi + 4) assegnazioni
create table if not exists public.distintivo (
  id serial primary key, codice text unique not null, nome text not null,
  descrizione text, criterio text, icona text
);
alter table public.distintivo enable row level security;
drop policy if exists distintivo_read_all on public.distintivo;
create policy distintivo_read_all on public.distintivo for select using (true);
drop policy if exists distintivo_admin_write on public.distintivo;
create policy distintivo_admin_write on public.distintivo for all
  using (public.has_ruolo_min(auth.uid(),50)) with check (public.has_ruolo_min(auth.uid(),50));
insert into public.distintivo (codice,nome,descrizione,criterio) values
 ('prima_voce','Prima voce','Il tuo primo post nella Community','Primo post pubblicato'),
 ('cronista','Cronista','Racconti con costanza','10 post pubblicati'),
 ('cuore_valli','Cuore delle valli','I soci apprezzano ciò che condividi','50 reazioni ricevute'),
 ('custode','Custode','Hai arricchito il Museo delle valli','Primo pezzo Museo approvato'),
 ('parola_nostra','Parola nostra','Custodisci la lingua delle valli','Primo lemma validato'),
 ('memoria_condivisa','Memoria condivisa','Una tua storia è stata promossa','Prima storia pubblica')
on conflict (codice) do nothing;

create table if not exists public.utente_distintivo (
  utente_id uuid not null references public.utente(id) on delete cascade,
  distintivo_id integer not null references public.distintivo(id) on delete cascade,
  assegnato_il timestamptz not null default now(), assegnato_da uuid,
  primary key (utente_id, distintivo_id)
);
alter table public.utente_distintivo enable row level security;
drop policy if exists udist_read_self on public.utente_distintivo;
create policy udist_read_self on public.utente_distintivo for select using (utente_id = auth.uid());
drop policy if exists udist_admin_all on public.utente_distintivo;
create policy udist_admin_all on public.utente_distintivo for all
  using (public.has_ruolo_min(auth.uid(),50)) with check (public.has_ruolo_min(auth.uid(),50));

-- preferenza visibilità del livello agli altri soci
alter table public.utente add column if not exists mostra_livello boolean not null default true;

-- =====================================================================
-- Helper server-side
-- =====================================================================
-- Assegna punti (idempotente su tipo+riferimento se richiesto)
create or replace function public.gam_add(p_utente uuid, p_tipo text, p_punti int, p_riftipo text, p_rifid text, p_idemp boolean default true)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_utente is null then return; end if;
  if p_idemp and p_rifid is not null and exists (
    select 1 from public.punti_evento where utente_id=p_utente and tipo_azione=p_tipo and riferimento_id=p_rifid
  ) then return; end if;
  insert into public.punti_evento(utente_id,tipo_azione,punti,riferimento_tipo,riferimento_id)
  values (p_utente,p_tipo,p_punti,p_riftipo,p_rifid);
end $$;

-- Assegna un distintivo per codice (on conflict do nothing)
create or replace function public.gam_distintivo(p_utente uuid, p_codice text)
returns void language plpgsql security definer set search_path=public as $$
declare did int;
begin
  if p_utente is null then return; end if;
  select id into did from public.distintivo where codice=p_codice;
  if did is null then return; end if;
  insert into public.utente_distintivo(utente_id,distintivo_id) values (p_utente,did)
  on conflict do nothing;
end $$;

-- Livello di un utente (SOLO livello + totale; niente ledger). Rispetta la
-- preferenza mostra_livello: se off, ritorna nessuna riga.
create or replace function public.livello_utente(u uuid)
returns table (utente_id uuid, punti_totali bigint, livello_codice text, livello_nome text, livello_ordine int)
language sql stable security definer set search_path=public as $$
  with vis as (select mostra_livello from public.utente where id=u),
  tot as (select coalesce(sum(punti),0)::bigint as p from public.punti_evento where utente_id=u)
  select u, (select p from tot), l.codice, l.nome, l.ordine
  from public.livello l
  where (select mostra_livello from vis) is true
    and l.soglia_punti <= (select p from tot)
  order by l.soglia_punti desc limit 1;
$$;
revoke all on function public.livello_utente(uuid) from anon, public;
grant execute on function public.livello_utente(uuid) to authenticated;

-- =====================================================================
-- Trigger: reazioni ricevute (+2 all'autore, escl. auto-reazione); -2 su delete
-- =====================================================================
create or replace function public.tg_punti_reazione_ins() returns trigger
language plpgsql security definer set search_path=public as $$
declare autore uuid; n int;
begin
  if NEW.thread_id is not null then select autore_id into autore from public.forum_thread where id=NEW.thread_id;
  elsif NEW.post_id is not null then select autore_id into autore from public.forum_post where id=NEW.post_id; end if;
  if autore is not null and autore <> NEW.utente_id then
    perform public.gam_add(autore,'reazione_ricevuta',2,'forum_reazione',NEW.id::text,true);
    select count(*) into n from public.punti_evento where utente_id=autore and tipo_azione='reazione_ricevuta' and punti>0;
    if n >= 50 then perform public.gam_distintivo(autore,'cuore_valli'); end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_punti_reazione_ins on public.forum_reazione;
create trigger trg_punti_reazione_ins after insert on public.forum_reazione
for each row execute function public.tg_punti_reazione_ins();

create or replace function public.tg_punti_reazione_del() returns trigger
language plpgsql security definer set search_path=public as $$
declare autore uuid;
begin
  if OLD.thread_id is not null then select autore_id into autore from public.forum_thread where id=OLD.thread_id;
  elsif OLD.post_id is not null then select autore_id into autore from public.forum_post where id=OLD.post_id; end if;
  if autore is not null and autore <> OLD.utente_id then
    -- compensazione: -2 (non idempotente: è una rettifica distinta)
    perform public.gam_add(autore,'rettifica',-2,'forum_reazione',OLD.id::text,false);
  end if;
  return OLD;
end $$;
drop trigger if exists trg_punti_reazione_del on public.forum_reazione;
create trigger trg_punti_reazione_del after delete on public.forum_reazione
for each row execute function public.tg_punti_reazione_del();

-- =====================================================================
-- Trigger: post (bacheca) +2 e commento +1, con tetto 10 punti/giorno combinato
-- =====================================================================
create or replace function public.tg_punti_thread_ins() returns trigger
language plpgsql security definer set search_path=public as $$
declare oggi int; nthread int;
begin
  if NEW.tipo <> 'bacheca' then return NEW; end if;
  select coalesce(sum(punti),0) into oggi from public.punti_evento
    where utente_id=NEW.autore_id and tipo_azione in ('post_creato','commento') and created_at::date = now()::date;
  if oggi < 10 then perform public.gam_add(NEW.autore_id,'post_creato',2,'forum_thread',NEW.id::text,true); end if;
  select count(*) into nthread from public.forum_thread where autore_id=NEW.autore_id and tipo='bacheca';
  if nthread = 1 then perform public.gam_distintivo(NEW.autore_id,'prima_voce'); end if;
  if nthread >= 10 then perform public.gam_distintivo(NEW.autore_id,'cronista'); end if;
  return NEW;
end $$;
drop trigger if exists trg_punti_thread_ins on public.forum_thread;
create trigger trg_punti_thread_ins after insert on public.forum_thread
for each row execute function public.tg_punti_thread_ins();

create or replace function public.tg_punti_post_ins() returns trigger
language plpgsql security definer set search_path=public as $$
declare oggi int;
begin
  select coalesce(sum(punti),0) into oggi from public.punti_evento
    where utente_id=NEW.autore_id and tipo_azione in ('post_creato','commento') and created_at::date = now()::date;
  if oggi < 10 then perform public.gam_add(NEW.autore_id,'commento',1,'forum_post',NEW.id::text,true); end if;
  return NEW;
end $$;
drop trigger if exists trg_punti_post_ins on public.forum_post;
create trigger trg_punti_post_ins after insert on public.forum_post
for each row execute function public.tg_punti_post_ins();

-- compensazione all'eliminazione (moderazione): revoca i punti del contenuto
create or replace function public.tg_punti_thread_del() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.punti_evento where tipo_azione='post_creato' and riferimento_id=OLD.id::text and utente_id=OLD.autore_id) then
    perform public.gam_add(OLD.autore_id,'rettifica',-2,'forum_thread',OLD.id::text,false);
  end if;
  return OLD;
end $$;
drop trigger if exists trg_punti_thread_del on public.forum_thread;
create trigger trg_punti_thread_del after delete on public.forum_thread
for each row execute function public.tg_punti_thread_del();

create or replace function public.tg_punti_post_del() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.punti_evento where tipo_azione='commento' and riferimento_id=OLD.id::text and utente_id=OLD.autore_id) then
    perform public.gam_add(OLD.autore_id,'rettifica',-1,'forum_post',OLD.id::text,false);
  end if;
  return OLD;
end $$;
drop trigger if exists trg_punti_post_del on public.forum_post;
create trigger trg_punti_post_del after delete on public.forum_post
for each row execute function public.tg_punti_post_del();

-- =====================================================================
-- Trigger di milestone (curatela): museo +20, lemma +25, storia +15
-- =====================================================================
create or replace function public.tg_punti_museo() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if NEW.stato='pubblicato' and OLD.stato is distinct from 'pubblicato' then
    perform public.gam_add(NEW.caricato_da,'museo_approvato',20,'museo_gg_pezzo',NEW.id::text,true);
    perform public.gam_distintivo(NEW.caricato_da,'custode');
  end if;
  return NEW;
end $$;
drop trigger if exists trg_punti_museo on public.museo_gg_pezzo;
create trigger trg_punti_museo after update on public.museo_gg_pezzo
for each row execute function public.tg_punti_museo();

create or replace function public.tg_punti_lemma() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if NEW.stato in ('validato','pubblicato') and (OLD.stato is null or OLD.stato not in ('validato','pubblicato')) then
    perform public.gam_add(NEW.contributore_id,'lemma_validato',25,'dizionario_lemma',NEW.id::text,true);
    perform public.gam_distintivo(NEW.contributore_id,'parola_nostra');
  end if;
  return NEW;
end $$;
drop trigger if exists trg_punti_lemma on public.dizionario_lemma;
create trigger trg_punti_lemma after update on public.dizionario_lemma
for each row execute function public.tg_punti_lemma();

create or replace function public.tg_punti_storia() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if NEW.pubblica is true and OLD.pubblica is distinct from true then
    perform public.gam_add(NEW.autore_id,'storia_pubblicata',15,'storia',NEW.id::text,true);
    perform public.gam_distintivo(NEW.autore_id,'memoria_condivisa');
  end if;
  return NEW;
end $$;
drop trigger if exists trg_punti_storia on public.storia;
create trigger trg_punti_storia after update on public.storia
for each row execute function public.tg_punti_storia();

-- =====================================================================
-- Profilo completo (avatar + bio) una tantum: +5
-- =====================================================================
create or replace function public.tg_punti_profilo() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if NEW.avatar_url is not null and btrim(coalesce(NEW.bio,'')) <> '' then
    perform public.gam_add(NEW.id,'profilo_completo',5,'utente',NEW.id::text,true);
  end if;
  return NEW;
end $$;
drop trigger if exists trg_punti_profilo on public.utente;
create trigger trg_punti_profilo after update on public.utente
for each row when (NEW.avatar_url is not null and btrim(coalesce(NEW.bio,'')) <> '')
execute function public.tg_punti_profilo();
