-- email_outbox — allineamento del repo alla produzione.
--
-- La tabella vive in produzione dal 21 luglio 2026 e non e' mai stata
-- versionata: e' l'errore che questa migration e la gemella
-- 20260802090000 esistono per non ripetere. Il DDL qui sotto e' stato
-- ricavato dallo schema vivo il 2/8/2026, non riscritto a memoria.
--
-- A cosa serve: e' la coda di posta. Un cron (jobid 4) passa ogni minuto,
-- pesca le righe in stato 'pronta' e le manda con il secret preso dal Vault.
-- E' la via per far partire una mail senza avere il secret in mano.
--
-- REGOLA OPERATIVA, non tecnica: una riga si inserisce sempre come 'bozza'.
-- Il passaggio a 'pronta' e' un gesto separato e richiede l'ok esplicito di
-- Cristian, perche' da li' in poi la mail parte da sola entro un minuto.

create table if not exists public.email_outbox (
  id            uuid primary key default gen_random_uuid(),
  destinatario  text not null,
  oggetto       text not null,
  html          text not null,
  reply_to      text,
  cc            text[],
  bcc           text[],
  tags          jsonb,
  stato         text not null default 'bozza',
  tentativi     integer not null default 0,
  richiesta_id  bigint,
  resend_id     text,
  errore        text,
  origine       text not null default 'chat',
  creato_da     uuid default auth.uid(),
  inviata_il    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'email_outbox_stato_check') then
    alter table public.email_outbox add constraint email_outbox_stato_check
      check (stato = any (array['bozza','pronta','in_invio','inviata','errore','annullata']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'email_outbox_origine_check') then
    alter table public.email_outbox add constraint email_outbox_origine_check
      check (origine = any (array['chat','pannello','sistema']));
  end if;
end $$;

-- Indice parziale: il cron cerca solo cio' che deve ancora partire.
create index if not exists idx_email_outbox_da_processare
  on public.email_outbox (stato, created_at)
  where stato = any (array['pronta','in_invio']);

alter table public.email_outbox enable row level security;

-- Solo il direttivo (livello 50) vede e scrive la coda: contiene testi di
-- comunicazioni ufficiali e indirizzi dei destinatari.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_outbox' and policyname='email_outbox_admin_select') then
    create policy email_outbox_admin_select on public.email_outbox
      for select using ((select public.has_ruolo_min(50)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_outbox' and policyname='email_outbox_admin_insert') then
    create policy email_outbox_admin_insert on public.email_outbox
      for insert with check ((select public.has_ruolo_min(50)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_outbox' and policyname='email_outbox_admin_update') then
    create policy email_outbox_admin_update on public.email_outbox
      for update using ((select public.has_ruolo_min(50)))
      with check ((select public.has_ruolo_min(50)));
  end if;
end $$;

revoke truncate on public.email_outbox from anon, authenticated;
