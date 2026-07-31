-- =====================================================================
-- Radar eventi Valli del Noce (BLOCCO 2, superbrief 30/7/2026).
--
-- Raccoglie gli eventi delle quattro valli da fonti aperte (ComunWeb,
-- dati.trentino.it) piu' l'inserimento manuale, li classifica per rilevanza
-- storico-culturale e li mette in una CODA DI CURATELA UMANA.
--
-- REGOLA PORTANTE: nessun evento raggiunge il pubblico da solo. Il percorso e'
-- grezzo -> proposto -> approvato -> pubblicato, e gli ultimi due passaggi sono
-- sempre per mano di una persona. La vista pubblica legge solo 'pubblicato'.
--
-- Gli scartati NON si cancellano mai: con motivo_punteggio sono il materiale
-- per tarare le liste di keyword del classificatore.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. eventi_esterni — la tabella principale
-- ---------------------------------------------------------------------
create table if not exists public.eventi_esterni (
  id            uuid primary key default gen_random_uuid(),

  -- provenienza
  fonte         text not null check (fonte in ('comunweb', 'dati_trentino', 'manuale')),
  fonte_id      text,                       -- id nativo della fonte, per l'idempotenza
  url_fonte     text,

  -- contenuto
  titolo        text not null,
  descrizione   text,
  data_inizio   date not null,
  data_fine     date,
  ricorrenza    text,                       -- es. 'ogni martedi'', date esplose in eventi_esterni_date
  ora_inizio    time,
  ora_fine      time,
  luogo         text,
  comune        text,
  valle         text check (valle is null or valle in ('non', 'sole', 'rabbi', 'pejo')),
  organizzatore text,
  contatti      text,                       -- recapiti PUBBLICI dell'organizzatore, mai dati di privati
  prezzo        text check (prezzo is null or prezzo in ('gratuito', 'pagamento', 'offerta', 'nd')),

  -- classificazione
  punteggio        int check (punteggio is null or (punteggio >= 0 and punteggio <= 100)),
  pilastro         int check (pilastro is null or (pilastro >= 1 and pilastro <= 6)),
  motivo_punteggio jsonb,                   -- keyword che hanno pesato + motivazione del modello
  flag             text[] not null default '{}',  -- bassa_priorita | nota_lingua | accuratezza_da_verificare

  -- curatela
  stato         text not null default 'grezzo'
                check (stato in ('grezzo', 'proposto', 'approvato', 'pubblicato', 'scartato', 'non_promuovibile')),
  note_curatore text,
  curato_da     uuid references auth.users(id) on delete set null,
  curato_il     timestamptz,

  -- idempotenza: sha256 di titolo normalizzato + data_inizio + comune
  hash_dedup    text not null unique,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists eventi_esterni_stato_punteggio_idx
  on public.eventi_esterni (stato, punteggio desc nulls last);
create index if not exists eventi_esterni_data_idx
  on public.eventi_esterni (data_inizio);
create index if not exists eventi_esterni_valle_idx
  on public.eventi_esterni (valle);

-- ---------------------------------------------------------------------
-- 2. eventi_organizzatori_esclusi — lista modificabile SENZA deploy
-- ---------------------------------------------------------------------
-- Volutamente a DB e non nel codice: il direttivo cambia idea, e cambiare idea
-- non deve costare una build. Il match e' case-insensitive su nome_pattern.
create table if not exists public.eventi_organizzatori_esclusi (
  id           uuid primary key default gen_random_uuid(),
  nome_pattern text not null,
  motivo       text,
  attivo       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. eventi_esterni_date — le ricorrenze esplose
-- ---------------------------------------------------------------------
-- Serve perche' le fonti scrivono le eccezioni dentro la descrizione
-- ("non si svolgera' il 17 e il 31 agosto"): qui diventano righe con
-- annullata = true, leggibili da una macchina.
create table if not exists public.eventi_esterni_date (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.eventi_esterni(id) on delete cascade,
  data       date not null,
  annullata  boolean not null default false,
  nota       text,
  created_at timestamptz not null default now(),
  unique (evento_id, data)
);

create index if not exists eventi_esterni_date_evento_idx
  on public.eventi_esterni_date (evento_id);

-- ---------------------------------------------------------------------
-- 4. RLS deny-by-default su tutte e tre
-- ---------------------------------------------------------------------
alter table public.eventi_esterni              enable row level security;
alter table public.eventi_organizzatori_esclusi enable row level security;
alter table public.eventi_esterni_date          enable row level security;

-- Curatela: livello >= 20 (curatore_museo_gg, collaboratore, admin) legge e cura.
-- La PUBBLICAZIONE resta riservata al direttivo (>= 50): la impone il trigger di
-- guardia qui sotto, perche' e' l'unico atto che fa uscire un testo in pubblico.
drop policy if exists eventi_esterni_read_curatori on public.eventi_esterni;
create policy eventi_esterni_read_curatori on public.eventi_esterni
  for select using ( public.has_ruolo_min(auth.uid(), 20) );

drop policy if exists eventi_esterni_write_curatori on public.eventi_esterni;
create policy eventi_esterni_write_curatori on public.eventi_esterni
  for update using ( public.has_ruolo_min(auth.uid(), 20) )
             with check ( public.has_ruolo_min(auth.uid(), 20) );

-- Inserimento manuale (fonte='manuale') dalla pagina di curatela.
-- L'harvest automatico passa da service_role, che bypassa le policy.
drop policy if exists eventi_esterni_insert_curatori on public.eventi_esterni;
create policy eventi_esterni_insert_curatori on public.eventi_esterni
  for insert with check ( public.has_ruolo_min(auth.uid(), 20) );

drop policy if exists eventi_esclusi_read_curatori on public.eventi_organizzatori_esclusi;
create policy eventi_esclusi_read_curatori on public.eventi_organizzatori_esclusi
  for select using ( public.has_ruolo_min(auth.uid(), 20) );

-- La lista degli esclusi la tocca solo il direttivo: e' una decisione politica.
drop policy if exists eventi_esclusi_admin_all on public.eventi_organizzatori_esclusi;
create policy eventi_esclusi_admin_all on public.eventi_organizzatori_esclusi
  for all using ( public.has_ruolo_min(auth.uid(), 50) )
          with check ( public.has_ruolo_min(auth.uid(), 50) );

drop policy if exists eventi_date_read_curatori on public.eventi_esterni_date;
create policy eventi_date_read_curatori on public.eventi_esterni_date
  for select using ( public.has_ruolo_min(auth.uid(), 20) );

drop policy if exists eventi_date_write_curatori on public.eventi_esterni_date;
create policy eventi_date_write_curatori on public.eventi_esterni_date
  for all using ( public.has_ruolo_min(auth.uid(), 20) )
          with check ( public.has_ruolo_min(auth.uid(), 20) );

grant select, insert, update on public.eventi_esterni to authenticated;
grant select on public.eventi_organizzatori_esclusi to authenticated;
grant select, insert, update, delete on public.eventi_esterni_date to authenticated;

-- ---------------------------------------------------------------------
-- 5. Guardia: chi pubblica, e cosa non si puo' scavalcare
-- ---------------------------------------------------------------------
create or replace function public.eventi_esterni_guardia()
  returns trigger language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
declare
  direttivo boolean := public.has_ruolo_min(auth.uid(), 50);
begin
  new.updated_at := now();

  -- 'pubblicato' e' l'unico stato che esce in pubblico: lo mette solo il
  -- direttivo, e solo partendo da 'approvato'. Due mani diverse, non una.
  if new.stato = 'pubblicato' and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicato') then
    if not direttivo then
      raise exception 'La pubblicazione di un evento e'' riservata al direttivo.';
    end if;
    if tg_op = 'UPDATE' and old.stato <> 'approvato' then
      raise exception 'Un evento si pubblica solo dopo essere stato approvato.';
    end if;
  end if;

  -- Un organizzatore escluso non torna promuovibile per distrazione: chi vuole
  -- riabilitarlo passa da eventi_organizzatori_esclusi (decisione del direttivo).
  if tg_op = 'UPDATE' and old.stato = 'non_promuovibile'
     and new.stato in ('approvato', 'pubblicato') and not direttivo then
    raise exception 'Questo organizzatore e'' escluso: serve il direttivo per riammetterlo.';
  end if;

  -- Traccia di chi ha curato, quando lo stato cambia per mano di una persona.
  if tg_op = 'UPDATE' and new.stato is distinct from old.stato and auth.uid() is not null then
    new.curato_da := auth.uid();
    new.curato_il := now();
  end if;

  return new;
end $function$;

drop trigger if exists trg_eventi_esterni_guardia on public.eventi_esterni;
create trigger trg_eventi_esterni_guardia
  before insert or update on public.eventi_esterni
  for each row execute function public.eventi_esterni_guardia();

-- ---------------------------------------------------------------------
-- 6. Vista pubblica — solo 'pubblicato', solo colonne non personali
-- ---------------------------------------------------------------------
-- Fuori restano: contatti, note_curatore, punteggio, motivo_punteggio, flag,
-- curato_da. Il pubblico vede l'evento, non il nostro giudizio sull'evento.
create or replace view public.eventi_esterni_pubblici
with (security_invoker = true) as
select
  e.id, e.titolo, e.descrizione,
  e.data_inizio, e.data_fine, e.ricorrenza, e.ora_inizio, e.ora_fine,
  e.luogo, e.comune, e.valle, e.organizzatore,
  e.url_fonte, e.prezzo, e.pilastro, e.fonte
from public.eventi_esterni e
where e.stato = 'pubblicato';

grant select on public.eventi_esterni_pubblici to anon, authenticated;
-- security_invoker: chi legge la vista deve avere il grant anche sulla tabella
-- sottostante. Il filtro vero resta la policy qui sotto (solo 'pubblicato').
grant select on public.eventi_esterni to anon;

-- La vista e' security_invoker: senza una policy di lettura per anon la vista
-- resterebbe vuota. Questa policy espone SOLO le righe gia' pubblicate.
drop policy if exists eventi_esterni_read_pubblicati on public.eventi_esterni;
create policy eventi_esterni_read_pubblicati on public.eventi_esterni
  for select to anon, authenticated
  using ( stato = 'pubblicato' );

-- ---------------------------------------------------------------------
-- 7. Seed: organizzatori esclusi (delibera del direttivo 13/7/2026)
-- ---------------------------------------------------------------------
insert into public.eventi_organizzatori_esclusi (nome_pattern, motivo)
select v.pattern, 'non piu'' partner, decisione del direttivo 13/7/2026'
from (values ('Centro Studi per la Val di Sole'), ('Associazione Mulino Ruatti')) as v(pattern)
where not exists (
  select 1 from public.eventi_organizzatori_esclusi x where lower(x.nome_pattern) = lower(v.pattern)
);

-- ---------------------------------------------------------------------
-- 8. Notifica Telegram: digest settimanale (GATE 3, risposta di Cristian)
-- ---------------------------------------------------------------------
insert into public.telegram_notifica (tipo, categoria, etichetta, attivo)
values ('radar_digest', 'Eventi', 'Radar eventi: candidati della settimana', true)
on conflict (tipo) do nothing;
