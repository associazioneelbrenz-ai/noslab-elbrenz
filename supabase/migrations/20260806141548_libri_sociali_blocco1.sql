-- LIBRI SOCIALI · Blocco 1 (6/8/2026)
--
-- Il principio che decide tutto: il PDF e' l'allegato, LA DELIBERA E' IL DATO.
-- Un archivio conserva file; un libro sociale conserva deliberazioni che si
-- cercano e si citano. «Delibera CD n. 2/2023, quota confermata a 10 euro» deve
-- essere una riga interrogabile, non una frase dentro un allegato da aprire.

-- ---- Il ruolo, distinto e assegnabile (modello curatore_museo_gg) -----------
-- Livello 30: sopra collaboratore (25), sotto admin (50). Non e' una scala di
-- potere ma un incarico: chi tiene i libri non e' per forza amministratore.
insert into ruolo (nome, descrizione, livello)
values ('gestione_associativa', 'Tenuta dei libri sociali, archivio e prima nota', 30)
on conflict (nome) do nothing;

create or replace function public.puo_gestione_associativa(p_utente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    has_ruolo(p_utente, 'gestione_associativa') or has_ruolo_min(p_utente, 50),
    false);
$$;

-- ---- Le riunioni -----------------------------------------------------------
create table if not exists public.assoc_riunione (
  id uuid primary key default gen_random_uuid(),
  organo text not null check (organo in ('assemblea_ordinaria','assemblea_straordinaria','consiglio_direttivo')),
  anno integer not null,
  numero integer not null,
  data_riunione date not null,
  luogo text,
  ora_apertura time,
  ora_chiusura time,
  convocazione text check (convocazione in ('prima','seconda')),
  -- Per le assemblee il quorum si dimostra con questi due numeri.
  aventi_diritto integer,
  presenti_n integer,
  presenti text,
  assenti_giustificati text,
  presiede text,
  verbalizza text,
  ordine_del_giorno text,
  file_path text,              -- bucket PRIVATO libri-sociali
  file_nome text,
  note text,
  annullato_il timestamptz,
  annullato_da uuid,
  annullato_motivo text,
  creato_da uuid,
  created_at timestamptz not null default now(),
  aggiornato_da uuid,
  updated_at timestamptz not null default now()
);

-- NUMERAZIONE SENZA BUCHI E SENZA RIUSO: unica per organo e anno, e vale anche
-- per i verbali annullati. In un libro sociale un numero bruciato resta bruciato:
-- riusarlo farebbe sparire una riunione dalla cronologia.
create unique index if not exists assoc_riunione_numero_unico
  on public.assoc_riunione (organo, anno, numero);

-- ---- Le delibere -----------------------------------------------------------
create table if not exists public.assoc_delibera (
  id uuid primary key default gen_random_uuid(),
  riunione_id uuid not null references public.assoc_riunione(id) on delete restrict,
  numero integer not null,
  oggetto text not null,
  testo text,
  esito text not null default 'approvata_unanimita'
    check (esito in ('approvata_unanimita','approvata_maggioranza','respinta','rinviata')),
  voti_favorevoli integer,
  voti_contrari integer,
  voti_astenuti integer,
  tag text[] not null default '{}',
  -- Le delibere sulle cariche si agganciano alla persona: cosi' il libro degli
  -- associati e quello delle adunanze si parlano.
  socio_id uuid references public.domande_tesseramento(id) on delete set null,
  creato_da uuid,
  created_at timestamptz not null default now(),
  aggiornato_da uuid,
  updated_at timestamptz not null default now(),
  unique (riunione_id, numero)
);

create index if not exists assoc_delibera_tag on public.assoc_delibera using gin (tag);
create index if not exists assoc_delibera_ricerca on public.assoc_delibera
  using gin (to_tsvector('italian', coalesce(oggetto,'') || ' ' || coalesce(testo,'')));

-- ---- Il numero che il sistema PROPONE, e che la persona conferma ------------
-- Nessuna numerazione automatica silenziosa: questa funzione suggerisce, non
-- assegna. Se il numero proposto risultasse gia' usato, l'indice unico ferma
-- l'inserimento e lo dice.
create or replace function public.assoc_prossimo_numero(p_organo text, p_anno integer)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(max(numero), 0) + 1
  from assoc_riunione where organo = p_organo and anno = p_anno;
$$;

-- ---- UN VERBALE NON SI CANCELLA --------------------------------------------
-- Si corregge (e resta scritto chi e quando) oppure si annulla con motivo, e
-- resta visibile come annullato. La cronologia e' il valore del libro.
create or replace function public.assoc_vieta_cancellazione()
returns trigger language plpgsql as $$
begin
  raise exception 'Un verbale registrato non si cancella: si corregge, oppure si annulla con motivo.';
end;
$$;
drop trigger if exists trg_assoc_riunione_no_delete on public.assoc_riunione;
create trigger trg_assoc_riunione_no_delete
  before delete on public.assoc_riunione
  for each row execute function public.assoc_vieta_cancellazione();

drop trigger if exists trg_assoc_delibera_no_delete on public.assoc_delibera;
create trigger trg_assoc_delibera_no_delete
  before delete on public.assoc_delibera
  for each row execute function public.assoc_vieta_cancellazione();

-- ---- Traccia delle correzioni ----------------------------------------------
create table if not exists public.assoc_modifica (
  id bigserial primary key,
  tabella text not null,
  riga_id uuid not null,
  chi uuid,
  quando timestamptz not null default now(),
  prima jsonb,
  dopo jsonb
);

create or replace function public.assoc_traccia_modifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.aggiornato_da := coalesce(auth.uid(), new.aggiornato_da);
  insert into assoc_modifica (tabella, riga_id, chi, prima, dopo)
  values (tg_table_name, new.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;
drop trigger if exists trg_assoc_riunione_modifica on public.assoc_riunione;
create trigger trg_assoc_riunione_modifica before update on public.assoc_riunione
  for each row execute function public.assoc_traccia_modifica();
drop trigger if exists trg_assoc_delibera_modifica on public.assoc_delibera;
create trigger trg_assoc_delibera_modifica before update on public.assoc_delibera
  for each row execute function public.assoc_traccia_modifica();

-- ---- RLS: solo chi tiene i libri, e nessun DELETE per nessuno --------------
alter table public.assoc_riunione enable row level security;
alter table public.assoc_delibera enable row level security;
alter table public.assoc_modifica enable row level security;

drop policy if exists assoc_riunione_lettura on public.assoc_riunione;
create policy assoc_riunione_lettura on public.assoc_riunione for select to authenticated
  using (puo_gestione_associativa((select auth.uid())));
drop policy if exists assoc_riunione_scrittura on public.assoc_riunione;
create policy assoc_riunione_scrittura on public.assoc_riunione for insert to authenticated
  with check (puo_gestione_associativa((select auth.uid())));
drop policy if exists assoc_riunione_correzione on public.assoc_riunione;
create policy assoc_riunione_correzione on public.assoc_riunione for update to authenticated
  using (puo_gestione_associativa((select auth.uid())))
  with check (puo_gestione_associativa((select auth.uid())));

drop policy if exists assoc_delibera_lettura on public.assoc_delibera;
create policy assoc_delibera_lettura on public.assoc_delibera for select to authenticated
  using (puo_gestione_associativa((select auth.uid())));
drop policy if exists assoc_delibera_scrittura on public.assoc_delibera;
create policy assoc_delibera_scrittura on public.assoc_delibera for insert to authenticated
  with check (puo_gestione_associativa((select auth.uid())));
drop policy if exists assoc_delibera_correzione on public.assoc_delibera;
create policy assoc_delibera_correzione on public.assoc_delibera for update to authenticated
  using (puo_gestione_associativa((select auth.uid())))
  with check (puo_gestione_associativa((select auth.uid())));

drop policy if exists assoc_modifica_lettura on public.assoc_modifica;
create policy assoc_modifica_lettura on public.assoc_modifica for select to authenticated
  using (puo_gestione_associativa((select auth.uid())));

grant execute on function public.assoc_prossimo_numero(text, integer) to authenticated;
grant execute on function public.puo_gestione_associativa(uuid) to authenticated;;
