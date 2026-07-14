-- Andreas Fondazione — ponte Telegram (linking). Migration ADDITIVA.
-- Collega una volta l'utente Telegram al profilo socio, così il bot conosce
-- il ruolo. RLS deny-by-default: nessuna policy pubblica, accesso solo via
-- service role dalle edge (telegram-link-token, telegram-bot).
--
-- GDPR: il legame telegram_user_id <-> user_id e' un dato personale; consenso
-- al collegamento, revocabile (revoked_at), dichiarato in privacy policy.

create table if not exists public.telegram_link (
  telegram_user_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.telegram_link_token (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_link enable row level security;
alter table public.telegram_link_token enable row level security;
-- nessuna policy: deny-by-default. Le edge accedono con service role (bypassa RLS).
