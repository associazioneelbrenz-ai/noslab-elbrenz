-- download_lead — lead raccolti al download gratuito di risorse (libro
-- Altmayer, ecc). RLS deny-by-default: scrive SOLO service_role via edge.
create table if not exists public.download_lead (
  id uuid primary key default gen_random_uuid(),
  risorsa text not null,
  nome text not null,
  email text not null,
  telefono text,
  consenso_privacy boolean not null default false,
  consenso_newsletter boolean not null default false,
  sorgente jsonb,
  created_at timestamptz not null default now()
);
create index if not exists download_lead_risorsa_idx on public.download_lead (risorsa, created_at desc);
create index if not exists download_lead_newsletter_idx on public.download_lead (consenso_newsletter) where consenso_newsletter = true;

alter table public.download_lead enable row level security;
-- nessuna policy: deny-by-default per anon/authenticated. Solo service_role.
