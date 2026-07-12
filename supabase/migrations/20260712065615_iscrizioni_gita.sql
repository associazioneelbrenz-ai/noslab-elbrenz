-- iscrizioni_gita — registrazioni + anticipo gita sociale (V1).
-- RLS deny-by-default: scrive SOLO service_role dalle edge function.
create table if not exists public.iscrizioni_gita (
  id uuid primary key default gen_random_uuid(),
  evento_slug text not null default 'gita-giochi-medievali-2026',
  nome text not null,
  cognome text not null,
  email text not null,
  telefono text,
  posti int not null default 1 check (posti between 1 and 10),
  is_socio boolean not null default false,
  codice_tessera text,
  stato text not null default 'in_attesa'
    check (stato in ('in_attesa','anticipo_pagato','saldo_pagato','annullato')),
  importo_anticipo numeric(8,2),          -- deposito totale versato (30 x posti)
  importo_saldo numeric(8,2),             -- null finche il costo non e noto (fase 2)
  bonus_preorder numeric(8,2) not null default 0,  -- sconto preorder bloccato alla prenotazione
  metodo text check (metodo in ('paypal','carta','bonifico')),
  paypal_order_id text,
  paypal_capture_id text unique,
  payer_email text,
  consenso_privacy boolean not null default false,
  note text,
  sorgente_utm jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iscrizioni_gita_order_idx on public.iscrizioni_gita (paypal_order_id);
create index if not exists iscrizioni_gita_evento_stato_idx on public.iscrizioni_gita (evento_slug, stato);

alter table public.iscrizioni_gita enable row level security;
-- deny-by-default: nessuna policy per anon/authenticated. Solo service_role scrive.

-- Vista pubblica: SOLO conteggi aggregati, nessun dato personale.
create or replace view public.v_posti_gita as
  select
    'gita-giochi-medievali-2026'::text as evento_slug,
    54 as posti_totali,
    coalesce((
      select sum(posti) from public.iscrizioni_gita
      where evento_slug = 'gita-giochi-medievali-2026'
        and stato in ('anticipo_pagato','saldo_pagato')
    ), 0)::int as posti_occupati;

grant select on public.v_posti_gita to anon, authenticated;
