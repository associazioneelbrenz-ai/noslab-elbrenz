-- =============================================================================
-- 23 agosto 2026 — georeferenziazione dei luoghi + toponomastica estesa.
--
-- Applicata in produzione dalla chat con accesso diretto al database, PRIMA
-- di questo file: qui si versiona lo stato gia' vivo, ricostruito da
-- information_schema, pg_get_constraintdef, pg_get_functiondef e
-- pg_get_triggerdef sul progetto wacknihvdjxltiqvxtqr. Ogni istruzione e'
-- scritta in forma idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP...
-- IF EXISTS prima di ricreare) apposta: deve poter girare senza errori sia su
-- un database che ha gia' queste colonne, sia su uno che non le ha ancora.
--
-- Estende la migrazione "luoghi_interesse_toponimi_e_curatela" del 17/8
-- (versione 20260817152819, gia' nella cronologia): quella aveva introdotto
-- `nome_ladino`/`nome_tedesco` (rimasti vuoti su tutti i 57 luoghi) e la
-- policy che lascia scrivere a chi e' >=50 o ha il ruolo `curatore_contenuti`.
-- Questo file aggiunge la geolocalizzazione guidata (indirizzo -> geocodifica
-- -> coordinate, con lo stato della geocodifica tracciato) e tutto cio' che
-- serve a rendere il ladino anaunico un dato serio: parlata, varianti,
-- pronuncia, audio, etimologia con grado di certezza, attestazioni storiche,
-- e una firma di validazione separata da quella di pubblicazione.
--
-- I 57 luoghi esistenti sono stati marcati geo_stato='manuale' (coordinate
-- gia' inserite e verificate a mano): NON toccarli qui.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) luoghi_interesse — georeferenziazione e curatela in due tempi
-- -----------------------------------------------------------------------------
alter table public.luoghi_interesse
  add column if not exists indirizzo text,
  add column if not exists geo_stato text,
  add column if not exists creato_da uuid references public.utente(id),
  add column if not exists proposto_il timestamptz,
  add column if not exists pubblicato_da uuid references public.utente(id),
  add column if not exists pubblicato_il timestamptz,
  add column if not exists note_curatela text;

alter table public.luoghi_interesse drop constraint if exists luoghi_interesse_geo_stato_check;
alter table public.luoghi_interesse
  add constraint luoghi_interesse_geo_stato_check
  check (geo_stato is null or geo_stato in ('auto', 'manuale', 'non_trovato'));

-- -----------------------------------------------------------------------------
-- 2) luoghi_interesse — toponomastica estesa (nome_ladino/nome_tedesco
--    esistevano gia' dalla migrazione del 17/8, sempre vuoti sui 57 luoghi)
-- -----------------------------------------------------------------------------
alter table public.luoghi_interesse
  add column if not exists parlata text,
  add column if not exists nome_ladino_varianti text[],
  add column if not exists pronuncia_ipa text,
  add column if not exists audio_id uuid references public.archivio_audio(id),
  add column if not exists etimologia text,
  add column if not exists etimologia_strato text,
  add column if not exists etimologia_certezza text,
  add column if not exists toponimo_note text,
  add column if not exists toponimo_validato_da uuid references public.utente(id),
  add column if not exists toponimo_validato_il timestamptz;

alter table public.luoghi_interesse drop constraint if exists luoghi_parlata_check;
alter table public.luoghi_interesse
  add constraint luoghi_parlata_check
  check (parlata is null or parlata in ('noneso', 'solander', 'rabies', 'pegaes'));

alter table public.luoghi_interesse drop constraint if exists luoghi_etim_strato_check;
alter table public.luoghi_interesse
  add constraint luoghi_etim_strato_check
  check (etimologia_strato is null or etimologia_strato in
    ('prelatino_retico', 'latino', 'germanico', 'romanzo_alpino', 'incerto'));

alter table public.luoghi_interesse drop constraint if exists luoghi_etim_certezza_check;
alter table public.luoghi_interesse
  add constraint luoghi_etim_certezza_check
  check (etimologia_certezza is null or etimologia_certezza in
    ('documentata', 'probabile', 'ipotesi', 'incerta'));

-- -----------------------------------------------------------------------------
-- 3) toponimo_attestazione — una riga per ogni volta che il nome compare in
--    una fonte. La forma va presa COM'E' SCRITTA nella fonte, mai normalizzata:
--    quella distanza dalla grafia corrente e' il dato che si sta raccogliendo.
-- -----------------------------------------------------------------------------
create table if not exists public.toponimo_attestazione (
  id uuid primary key default gen_random_uuid(),
  luogo_id uuid not null references public.luoghi_interesse(id) on delete cascade,
  forma text not null,
  anno_da integer,
  anno_a integer,
  fonte text not null,
  collocazione_archivistica text,
  url_fonte text,
  immagine_url text,
  note text,
  inserito_da uuid references public.utente(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_toponimo_attestazione_luogo on public.toponimo_attestazione(luogo_id);

alter table public.toponimo_attestazione enable row level security;

-- Lettura pubblica SOLO se il luogo e' pubblicato. Passa da una funzione
-- (non da una sottoquery diretta nella policy) perche' una sottoquery dentro
-- una policy RLS gira con i permessi di CHI CHIAMA, non con quelli della
-- funzione: su una tabella (luoghi_interesse) senza grant SELECT ad anon,
-- una sottoquery diretta fallirebbe silenziosamente. luogo_e_pubblico() e'
-- SECURITY DEFINER apposta per questo.
drop policy if exists topon_lettura_pubblica on public.toponimo_attestazione;
create policy topon_lettura_pubblica on public.toponimo_attestazione
  for select
  using (public.luogo_e_pubblico(luogo_id));

-- Scrittura: direttivo (>=50) o ruolo curatore_linguistico, come per la forma
-- ladina stessa — e' la stessa competenza, la stessa firma.
drop policy if exists topon_scrittura_curatori on public.toponimo_attestazione;
create policy topon_scrittura_curatori on public.toponimo_attestazione
  for all
  using (public.has_ruolo_min((select auth.uid()), 50) or public.has_ruolo((select auth.uid()), 'curatore_linguistico'))
  with check (public.has_ruolo_min((select auth.uid()), 50) or public.has_ruolo((select auth.uid()), 'curatore_linguistico'));

grant select on public.toponimo_attestazione to anon;
grant select, insert, update, delete on public.toponimo_attestazione to authenticated;

create or replace function public.luogo_e_pubblico(p_luogo uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.luoghi_interesse l where l.id = p_luogo and l.stato = 'pubblicato');
$function$;

-- -----------------------------------------------------------------------------
-- 4) archivio_audio — la categoria 'toponimo' non esisteva
-- -----------------------------------------------------------------------------
alter table public.archivio_audio drop constraint if exists archivio_audio_categoria_audio_check;
alter table public.archivio_audio
  add constraint archivio_audio_categoria_audio_check
  check (categoria_audio in
    ('parola', 'toponimo', 'proverbio', 'racconto', 'canto', 'intervista', 'cantilena', 'preghiera', 'altro'));

-- -----------------------------------------------------------------------------
-- 5) Trigger: solo il direttivo (>=50) pubblica. Rete di sicurezza dietro
--    l'interfaccia — il frontend non offre il bottone a chi non puo' usarlo,
--    ma se qualcuno forzasse la chiamata riceve un errore leggibile, non un
--    "successo" bugiardo. Lascia passare auth.uid() nullo (edge function con
--    chiave di servizio): l'anonimo e' gia' fermato dalla RLS.
-- -----------------------------------------------------------------------------
create or replace function public.luoghi_solo_direttivo_pubblica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.stato = 'pubblicato'
     and coalesce(old.stato,'') <> 'pubblicato'
     and auth.uid() is not null
     and not has_ruolo_min(auth.uid(), 50) then
    raise exception 'Solo il direttivo puo pubblicare un luogo sulla mappa. La scheda resta in bozza.';
  end if;
  if new.stato = 'pubblicato' and coalesce(old.stato,'') <> 'pubblicato' then
    new.pubblicato_il := now();
    new.pubblicato_da := coalesce(new.pubblicato_da, auth.uid());
  end if;
  return new;
end $function$;

drop trigger if exists trg_luoghi_solo_direttivo_pubblica on public.luoghi_interesse;
create trigger trg_luoghi_solo_direttivo_pubblica
  before insert or update on public.luoghi_interesse
  for each row execute function public.luoghi_solo_direttivo_pubblica();

-- -----------------------------------------------------------------------------
-- Verifica dopo l'esecuzione (atteso: 0 righe toccate, sono i 57 luoghi gia'
-- marcati manuale — questa UPDATE e' qui solo come promemoria/idempotenza,
-- NON tocca chi e' gia' 'manuale' ne' chi ha gia' un geo_stato):
--   update public.luoghi_interesse set geo_stato = 'manuale'
--     where geo_stato is null and lat is not null and lng is not null;
-- Non eseguita automaticamente in questo file: se i 57 luoghi risultano gia'
-- 'manuale' (verificato il 23/8), rilanciarla non farebbe nulla di nuovo, ma
-- non e' questo file a doverlo decidere.
-- =============================================================================
