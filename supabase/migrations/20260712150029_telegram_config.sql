-- telegram_config — configurazione runtime del bot (chiave->valore). Usata
-- per il chat_id del gruppo direttivo "Sala comando" (registrato via comando
-- /attiva_notifiche). RLS deny-by-default: solo service_role.
create table if not exists public.telegram_config (
  chiave text primary key,
  valore text not null,
  updated_at timestamptz not null default now()
);
alter table public.telegram_config enable row level security;
