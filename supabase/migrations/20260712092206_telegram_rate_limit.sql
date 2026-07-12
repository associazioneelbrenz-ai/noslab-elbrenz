-- telegram_rate_limit — tetto giornaliero per utente Telegram (chat_id
-- hashato SHA256 per privacy). RLS deny-by-default: scrive solo service_role.
create table if not exists public.telegram_rate_limit (
  chat_id_hash text not null,
  giorno date not null,
  messaggi int not null default 0,
  ultimo_uso timestamptz not null default now(),
  primary key (chat_id_hash, giorno)
);
alter table public.telegram_rate_limit enable row level security;
-- nessuna policy: deny-by-default per anon/authenticated. Solo service_role.
