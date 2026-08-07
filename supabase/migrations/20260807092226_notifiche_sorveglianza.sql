-- [7/8/2026] IL CANALE SI SORVEGLIA DA SOLO.
--
-- Le notifiche si sono rotte tre volte in tre giorni, ogni volta in modo diverso
-- e ogni volta IN SILENZIO: il tubo staccato dal 29 luglio, la valanga da
-- trecento messaggi evitata per un pelo, il riepilogo che arrivava quattordici
-- ore dopo. Nessuno dei tre si e' fatto notare: li abbiamo trovati guardando.
--
-- Qui non si aggiunge un secondo motore di invio: si aggiunge la memoria di cosa
-- e' successo, e una domanda che qualcuno pone al posto nostro.

create table if not exists public.notifica_consegna (
  id bigserial primary key,
  notifica_id uuid,
  tipo text,
  utente_id uuid,
  destinatari_token integer not null default 0,   -- quanti dispositivi si sono tentati
  consegnati integer not null default 0,
  falliti integer not null default 0,
  esito text not null,        -- 'consegnata' | 'nessun_destinatario' | 'preferenza_spenta' | 'fallita'
  dettaglio text,
  tentativi integer not null default 1,
  quando timestamptz not null default now()
);
create index if not exists notifica_consegna_quando on public.notifica_consegna (quando desc);
create index if not exists notifica_consegna_tipo on public.notifica_consegna (tipo, quando desc);

alter table public.notifica_consegna enable row level security;
drop policy if exists notifica_consegna_direttivo on public.notifica_consegna;
create policy notifica_consegna_direttivo on public.notifica_consegna for select to authenticated
  using (has_ruolo_min((select auth.uid()), 50));

-- LO ZERO DESTINATARI NON E UN SUCCESSO. Oggi tre dispositivi su trentadue soci
-- vuol dire che quasi ogni annuncio arriva quasi a nessuno: deve essere visibile,
-- non nascosto dentro un 200.
create or replace function public.salute_notifiche(p_giorni integer default 7)
returns table (voce text, valore text, allarme boolean)
language sql stable security definer set search_path = public as $$
  with finestra as (select now() - make_interval(days => p_giorni) as da)
  select 'Dispositivi con notifiche accese',
         (select count(*)::text from push_token where attivo),
         (select count(*) from push_token where attivo) = 0
  union all
  select 'Notifiche create negli ultimi ' || p_giorni || ' giorni',
         (select count(distinct url)::text from notifica, finestra where created_at >= finestra.da),
         false
  union all
  -- Il difetto che ha tenuto le push ferme dal 29 luglio senza che nessuno se ne
  -- accorgesse: un tipo che dovrebbe esserci e non c'e.
  select 'Ultimo avviso di contenuto (museo, articolo, evento, glossario)',
         coalesce((select to_char(max(created_at), 'DD/MM HH24:MI') from notifica
                   where tipo in ('museo','articolo','evento','glossario')), 'MAI'),
         coalesce((select max(created_at) from notifica
                   where tipo in ('museo','articolo','evento','glossario'))
                  < now() - interval '7 days', true)
  union all
  select 'Consegne a zero destinatari negli ultimi ' || p_giorni || ' giorni',
         (select count(*)::text from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'nessun_destinatario'),
         (select count(*) from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'nessun_destinatario') > 0
  union all
  select 'Consegne fallite negli ultimi ' || p_giorni || ' giorni',
         (select count(*)::text from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'fallita'),
         (select count(*) from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'fallita') > 0
  union all
  select 'Riepilogo Guardiani: ultimo invio',
         coalesce((select to_char(max(inviato_il), 'DD/MM HH24:MI') from guardiani_digest_invio), 'MAI'),
         false;
$$;

grant execute on function public.salute_notifiche(integer) to authenticated;;
