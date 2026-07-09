-- M5.0 v2 — Convenzioni Soci: proposta self-service + approvazione HMAC.
-- Scrittura SOLO via edge function convenzioni-proposta (service role).
-- RLS attiva SENZA policy sul base table (deny-by-default per anon).
-- La pagina pubblica legge ESCLUSIVAMENTE la vista convenzioni_pubbliche,
-- che espone solo campi non sensibili e solo stato='attiva'.

create table if not exists public.convenzioni (
  id uuid primary key default gen_random_uuid(),
  stato text not null default 'proposta'
    check (stato in ('proposta','attiva','sospesa','rifiutata','cessata')),

  -- Dati PUBBLICABILI dell'attività
  nome_attivita text not null,
  categoria text not null
    check (categoria in ('rifugi','locali','servizi','cultura','benessere','altro')),
  localita text,
  beneficio text not null,          -- max ~200 char, validato in edge fn
  dettagli text,
  url text,
  logo_path text,                   -- fase 2 (upload), nullable ora

  -- Dati del PROPONENTE — MAI pubblicati
  referente_nome text not null,
  referente_email text not null,
  referente_telefono text,

  -- Consensi (checkbox obbligatorie)
  accettazione_schema_tipo boolean not null,
  accettazione_privacy boolean not null,

  -- Curatela
  approvata_il timestamptz,
  note_interne text,

  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table public.convenzioni is
  'Convenzioni soci (M5.0 v2). Proposte via edge fn convenzioni-proposta; approvazione HMAC via email. Referente mai pubblico.';

alter table public.convenzioni enable row level security;
-- NESSUNA policy: anon non legge/scrive il base table. Scrittura solo service role.

create index if not exists convenzioni_stato_idx on public.convenzioni (stato);
create index if not exists convenzioni_categoria_idx on public.convenzioni (categoria);
create index if not exists convenzioni_email_idx on public.convenzioni (lower(referente_email));

-- Vista pubblica: SOLO campi non sensibili, SOLO attive. Definer (bypassa RLS
-- del base table) → si concede SELECT ad anon SOLO su questa vista.
create or replace view public.convenzioni_pubbliche as
  select id, nome_attivita, categoria, localita, beneficio, dettagli, url, logo_path
  from public.convenzioni
  where stato = 'attiva';

comment on view public.convenzioni_pubbliche is
  'Superficie pubblica delle convenzioni attive. NON espone mai referente_* né note_interne.';

grant select on public.convenzioni_pubbliche to anon, authenticated;

-- Trigger updated_at.
create or replace function public.tg_convenzioni_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists convenzioni_updated_at on public.convenzioni;
create trigger convenzioni_updated_at before update on public.convenzioni
  for each row execute function public.tg_convenzioni_updated_at();

-- ---------------------------------------------------------------------------
-- Rate limit PERSISTENTE (IP hashato SHA256, finestra oraria).
-- Il pattern in-memory di contact-form NON protegge su edge runtime multi-
-- istanza (verificato: 5/5 richieste passate — cfr. audit AUD-B5). Qui usiamo
-- una tabella + funzione atomica, come ai_rate_limit_pubblico di Andreas.
-- IP mai in chiaro (anche a beneficio privacy, AUD-D4).
create table if not exists public.convenzioni_rate_limit (
  ip_hash text not null,
  finestra timestamptz not null,     -- inizio finestra (troncata all'ora)
  count int not null default 1,
  primary key (ip_hash, finestra)
);
alter table public.convenzioni_rate_limit enable row level security;
-- Nessuna policy: solo service role. Pulizia: le righe vecchie sono inerti;
-- un cron opzionale può cancellare finestra < now()-1day (non necessario ora).

create or replace function public.convenzioni_rl_hit(p_ip_hash text, p_max int)
returns boolean language plpgsql security definer
set search_path = public as $$
declare c int;
begin
  insert into public.convenzioni_rate_limit (ip_hash, finestra, count)
  values (p_ip_hash, date_trunc('hour', now()), 1)
  on conflict (ip_hash, finestra)
    do update set count = convenzioni_rate_limit.count + 1
  returning count into c;
  return c <= p_max;   -- true = entro il limite (consenti)
end $$;

-- Solo il service role la invoca (dall'edge function). Mai anon/authenticated
-- (evita il finding "security definer eseguibile da anon", AUD-B4a).
revoke execute on function public.convenzioni_rl_hit(text, int) from anon, authenticated, public;
