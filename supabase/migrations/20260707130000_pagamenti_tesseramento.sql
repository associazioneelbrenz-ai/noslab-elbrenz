-- M2.6 — Pagamenti tesseramento e donazioni via PayPal (7 luglio 2026)
--
-- Tabella scritta ESCLUSIVAMENTE dalle edge function con service role:
-- RLS attiva e NESSUNA policy pubblica → il client non legge né scrive nulla.
--
-- tipo:   'quota'      → importo 20.00 EUR fissato lato server (edge fn)
--         'donazione'  → importo dal client, validato server-side 1.00-500.00
-- anonimo: per donazioni anonime le edge function NON scrivono nome, email
--          né payer_email (restano NULL per scelta, non per dimenticanza).
-- stato:  creato | completato | rimborsato | negato
--         (creato all'ordine; completato alla cattura o dal webhook;
--          rimborsato/negato riconciliati dal webhook verificato)

create table if not exists public.pagamenti_tesseramento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'quota' check (tipo in ('quota', 'donazione')),
  anonimo boolean not null default false,
  nome text,
  cognome text,
  email text,
  anno int not null default 2026,
  order_id text unique,
  capture_id text unique,
  importo numeric(6,2),
  valuta text not null default 'EUR',
  stato text not null default 'creato'
    check (stato in ('creato', 'completato', 'rimborsato', 'negato')),
  payer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table public.pagamenti_tesseramento is
  'Pagamenti quota sociale e donazioni via PayPal (M2.6). Scrittura solo da edge function con service role; RLS senza policy pubbliche.';

alter table public.pagamenti_tesseramento enable row level security;

-- Nessuna policy: accesso solo via service role (bypassa RLS by design).

create index if not exists pagamenti_tesseramento_stato_idx
  on public.pagamenti_tesseramento (stato);
create index if not exists pagamenti_tesseramento_created_idx
  on public.pagamenti_tesseramento (created_at desc);
