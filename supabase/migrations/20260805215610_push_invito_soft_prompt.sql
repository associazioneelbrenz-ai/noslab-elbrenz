-- L'invito ad attivare le notifiche: memoria di CHI e' gia' stato interpellato.
--
-- Perche' sul database e non nel browser: la regola e' «dopo un no non si
-- richiede per almeno un mese, dopo due no non si chiede piu'». Una memoria di
-- sessione non arriva a domani, e una che dura un mese nel browser sarebbe
-- immagazzinamento che non vogliamo. Qui la memoria e' della PERSONA, quindi la
-- segue su ogni dispositivo: e' anche piu' giusto cosi'.
--
-- Il permesso del browser si chiede UNA VOLTA SOLA nella vita: un no di sistema
-- non si puo' ritirare. Per questo prima si chiede in casa, e al sistema si
-- arriva solo dopo un si'.

create table if not exists public.push_invito (
  utente_id uuid primary key references auth.users(id) on delete cascade,
  chiesto_il timestamptz,
  rifiuti integer not null default 0,
  accettato_il timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.push_invito enable row level security;

drop policy if exists push_invito_self on public.push_invito;
create policy push_invito_self on public.push_invito
  for all to authenticated
  using (utente_id = (select auth.uid()))
  with check (utente_id = (select auth.uid()));

-- Si puo' chiedere? Vero solo se: mai chiesto, oppure l'ultimo no ha piu' di 30
-- giorni E i no sono meno di due. Chi ha gia' accettato non viene piu' disturbato.
create or replace function public.push_invito_da_mostrare()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    else coalesce((
      select r.accettato_il is null
             and r.rifiuti < 2
             and (r.chiesto_il is null or r.chiesto_il < now() - interval '30 days')
      from push_invito r where r.utente_id = auth.uid()
    ), true)  -- nessuna riga = non gli e' mai stato chiesto
  end;
$$;

-- Registra l'esito dell'invito INTERNO (non del permesso di sistema).
create or replace function public.push_invito_esito(p_accettato boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into push_invito (utente_id, chiesto_il, rifiuti, accettato_il, updated_at)
  values (auth.uid(), now(), case when p_accettato then 0 else 1 end,
          case when p_accettato then now() else null end, now())
  on conflict (utente_id) do update set
    chiesto_il = now(),
    rifiuti = push_invito.rifiuti + case when p_accettato then 0 else 1 end,
    accettato_il = case when p_accettato then now() else push_invito.accettato_il end,
    updated_at = now();
end;
$$;

-- La misura che dice se il lavoro sta funzionando. Solo direttivo (>=50): il
-- conteggio dei dispositivi altrui non e' affare di tutti.
create or replace function public.push_dispositivi_attivi()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when has_ruolo_min(auth.uid(), 50) then (select count(*)::int from push_token where attivo)
    else null
  end;
$$;

grant execute on function public.push_invito_da_mostrare() to authenticated;
grant execute on function public.push_invito_esito(boolean) to authenticated;
grant execute on function public.push_dispositivi_attivi() to authenticated;;
