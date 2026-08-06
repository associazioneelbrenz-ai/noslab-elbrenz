-- Raccolte tematiche del Museo Grande Guerra: «i ragazzi del 1899», «le donne
-- rimaste», «il fronte in Val di Rabbi».
--
-- Perche' non bastano i filtri: una raccolta non e' una query su valle o
-- periodo, e' un ATTO EDITORIALE. Ha un titolo, un'introduzione che tiene
-- insieme i pezzi, e un ordine scelto a mano perche' il racconto abbia un
-- principio e una fine. I filtri servono a cercare, le raccolte a far leggere.
--
-- Stesse regole dei pezzi: nulla si pubblica da solo, la guardia riporta in
-- bozza chi non ha titolo a curare.

create table if not exists public.museo_gg_raccolta (
  id uuid primary key default gen_random_uuid(),
  slug text,
  titolo text not null,
  occhiello text,
  sommario text,                       -- una frase, per le card e la meta description
  introduzione text,                   -- il testo che apre la raccolta
  copertina_url text,
  stato text not null default 'bozza', -- bozza | pubblicata
  ordine integer not null default 100,
  creata_da uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.museo_gg_raccolta_pezzo (
  raccolta_id uuid not null references public.museo_gg_raccolta(id) on delete cascade,
  pezzo_id uuid not null references public.museo_gg_pezzo(id) on delete cascade,
  ordine integer not null default 100,
  nota text,                           -- perche' questo pezzo sta in questa raccolta
  primary key (raccolta_id, pezzo_id)
);

create index if not exists museo_gg_raccolta_pezzo_ord
  on public.museo_gg_raccolta_pezzo (raccolta_id, ordine);

-- Slug: stessa forma dei pezzi, assegnato SOLO all'inserimento cosi' un titolo
-- corretto non rompe i link gia' condivisi.
create or replace function public.museo_gg_raccolta_slug_auto()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.slug is null or trim(new.slug) = '' then
    new.slug := public.museo_gg_slugify(new.titolo, new.id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_museo_gg_raccolta_slug on public.museo_gg_raccolta;
create trigger trg_museo_gg_raccolta_slug
  before insert on public.museo_gg_raccolta
  for each row execute function public.museo_gg_raccolta_slug_auto();

-- Guardia: senza titolo a curare, la raccolta resta in bozza. E non si pubblica
-- una raccolta vuota o senza introduzione: sarebbe una stanza con il cartello
-- e niente dentro.
create or replace function public.museo_gg_raccolta_guardia()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  puo_curare boolean := public.has_ruolo_min(auth.uid(), 50)
                        or public.has_ruolo(auth.uid(), 'curatore_museo_gg');
begin
  new.updated_at := now();
  if not puo_curare and new.stato is distinct from 'bozza' then
    new.stato := 'bozza';
  end if;
  if new.stato = 'pubblicata' then
    if coalesce(btrim(new.introduzione), '') = '' then
      raise exception 'Impossibile pubblicare: la raccolta ha bisogno di un''introduzione.';
    end if;
    if not exists (select 1 from museo_gg_raccolta_pezzo rp where rp.raccolta_id = new.id) then
      raise exception 'Impossibile pubblicare: la raccolta non contiene nessun pezzo.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_museo_gg_raccolta_guardia on public.museo_gg_raccolta;
create trigger trg_museo_gg_raccolta_guardia
  before insert or update on public.museo_gg_raccolta
  for each row execute function public.museo_gg_raccolta_guardia();

-- RLS
alter table public.museo_gg_raccolta enable row level security;
alter table public.museo_gg_raccolta_pezzo enable row level security;

drop policy if exists raccolta_public_read on public.museo_gg_raccolta;
create policy raccolta_public_read on public.museo_gg_raccolta
  for select using (stato = 'pubblicata');

drop policy if exists raccolta_curatore_all on public.museo_gg_raccolta;
create policy raccolta_curatore_all on public.museo_gg_raccolta
  for all to authenticated
  using (has_ruolo_min((select auth.uid()), 50) or has_ruolo((select auth.uid()), 'curatore_museo_gg'))
  with check (has_ruolo_min((select auth.uid()), 50) or has_ruolo((select auth.uid()), 'curatore_museo_gg'));

-- I legami si leggono se la raccolta e' pubblica (il pezzo poi filtra da se').
drop policy if exists raccolta_pezzo_public_read on public.museo_gg_raccolta_pezzo;
create policy raccolta_pezzo_public_read on public.museo_gg_raccolta_pezzo
  for select using (exists (
    select 1 from museo_gg_raccolta r where r.id = raccolta_id and r.stato = 'pubblicata'
  ));

drop policy if exists raccolta_pezzo_curatore_all on public.museo_gg_raccolta_pezzo;
create policy raccolta_pezzo_curatore_all on public.museo_gg_raccolta_pezzo
  for all to authenticated
  using (has_ruolo_min((select auth.uid()), 50) or has_ruolo((select auth.uid()), 'curatore_museo_gg'))
  with check (has_ruolo_min((select auth.uid()), 50) or has_ruolo((select auth.uid()), 'curatore_museo_gg'));

-- Notifica alla pubblicazione, tipo 'museo': per chi riceve e' sempre il museo
-- che parla, non serve un tipo nuovo da spegnere a parte.
create or replace function public.notifica_raccolta_pubblicata()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'pubblicata'
     and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicata')
     and new.slug is not null then
    perform notifica_broadcast(
      'museo',
      'Una raccolta nuova nel Museo',
      new.titolo,
      'https://elbrenz.eu/non-e-sole-grande-guerra/raccolte/' || new.slug
    );
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notifica_raccolta on public.museo_gg_raccolta;
create trigger trg_notifica_raccolta
  after insert or update of stato on public.museo_gg_raccolta
  for each row execute function public.notifica_raccolta_pubblicata();;
