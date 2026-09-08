-- 8/9/2026, brief "Caricamento video su Bunny Stream dalla PWA soci", Lotto A.
-- Registro dei caricamenti video verso Bunny Stream avviati dalla app.
-- Serve a: riprendere caricamenti interrotti, sapere chi ha caricato cosa,
-- ripulire gli oggetti video mai completati (Lotto D).
create table if not exists public.video_caricamento (
  id               uuid primary key default gen_random_uuid(),
  lezione_id       uuid not null references public.lezione(id) on delete cascade,
  video_bunny_id   text not null,
  titolo           text not null,
  mime             text,
  byte_dichiarati  bigint,
  stato            text not null default 'creato'
                   check (stato in ('creato','in_caricamento','caricato','pronto','errore','annullato')),
  stato_bunny      integer,                 -- ultimo status API letto (enumerazione API, non webhook)
  creato_da        uuid references auth.users(id),
  creato_il        timestamptz not null default now(),
  aggiornato_il    timestamptz not null default now()
);
create index if not exists video_caricamento_lezione_idx on public.video_caricamento(lezione_id);
create unique index if not exists video_caricamento_bunny_idx on public.video_caricamento(video_bunny_id);

alter table public.video_caricamento enable row level security;
-- Nessuna policy per anon/authenticated: la tabella si scrive e si legge solo dalle
-- edge function con service role. Se in futuro la UI deve leggerla, si aggiunge una
-- policy select per livello >= 25, non si apre in lettura a tutti.
revoke all on public.video_caricamento from anon, authenticated;
