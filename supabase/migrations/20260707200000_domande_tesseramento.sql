-- M2.6-ter — Workflow approvazione tessere (7 luglio 2026)
--
-- domande_tesseramento: persistenza delle domande del modulo /tesseramento
-- (finora esistevano solo come email al Direttivo). Scrive contact-form
-- con service role; RLS attiva SENZA policy pubbliche.
--
-- stato: in_attesa | approvata | respinta — approvazione via scheda-domanda
-- (link firmato nella mail al Direttivo). numero_tessera assegnato SOLO
-- all'approvazione: parte dal Libro Soci esistente via secret TESSERA_SEED
-- (numero = max(TESSERA_SEED, max(numero_tessera)+1)); unique = mai due
-- tessere con lo stesso numero (idempotenza doppio click).
--
-- approvata_da/approvata_il: log per i verbali di ratifica del CD.

create table if not exists public.domande_tesseramento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  messaggio text,
  data_nascita date,
  comune_nascita text,
  sesso text,
  anno int not null default 2026,
  stato text not null default 'in_attesa'
    check (stato in ('in_attesa', 'approvata', 'respinta')),
  numero_tessera int unique,
  approvata_da text,
  approvata_il timestamptz,
  tessera_inviata boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table public.domande_tesseramento is
  'Domande di iscrizione dal modulo /tesseramento (M2.6-ter). Solo service role; approvazione via edge fn scheda-domanda.';

alter table public.domande_tesseramento enable row level security;

create index if not exists domande_tesseramento_email_idx
  on public.domande_tesseramento (lower(email));
create index if not exists domande_tesseramento_stato_idx
  on public.domande_tesseramento (stato);

-- Aggancio pagamento → domanda (match per email o custom_id, nullable).
alter table public.pagamenti_tesseramento
  add column if not exists domanda_id uuid references public.domande_tesseramento (id);

-- Predisposizione rinnovi (regola di business: eventuali solleciti SOLO
-- dopo il 31/12 dell'anno di validità — NON implementati ora).
alter table public.domande_tesseramento
  add column if not exists scadenza date;

-- Idempotenza notifiche pagamento (M2.6-ter B4): il webhook invia la
-- mini-mail al Direttivo una sola volta per pagamento completato.
alter table public.pagamenti_tesseramento
  add column if not exists notificato boolean not null default false;
