-- telegram_notifica — toggle config-driven per le notifiche al gruppo direttivo.
-- Un tipo = un evento notificabile. attivo=false → il modulo _shared/notificaDirettivo
-- esce in silenzio (Cristian può spegnere un tipo rumoroso con un UPDATE, senza deploy).
-- Accesso SOLO service_role (le edge): RLS on, nessuna policy pubblica.
--
-- Nota (16/7): inseriamo SOLO i tipi che il modulo invia davvero, per non avere
-- toggle inerti. Le notifiche già live (socio, gita, convenzione, contatto/sportello,
-- lead, redazione) restano inline nei rispettivi edge e NON passano da qui: additività.
create table if not exists public.telegram_notifica (
  tipo        text primary key,
  categoria   text not null,
  etichetta   text not null,
  attivo      boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.telegram_notifica enable row level security;
-- (nessuna policy: accesso solo via service_role dalle edge function)

insert into public.telegram_notifica (tipo, categoria, etichetta, attivo) values
  ('pagamento_quota',    'Pagamenti', 'Pagamento quota ricevuto',        true),
  ('donazione',          'Pagamenti', 'Donazione ricevuta',              true),
  ('integrazione_quota', 'Pagamenti', 'Integrazione quota ricevuta',     true),
  ('ricevuta_bonifico',  'Pagamenti', 'Ricevuta bonifico da verificare', true),
  ('guardiani_lemma',    'Guardiani', 'Nuovo lemma proposto',            true),
  ('alert_anomalia',     'Alert',     'Anomalia da controllare',         true)
on conflict (tipo) do nothing;
