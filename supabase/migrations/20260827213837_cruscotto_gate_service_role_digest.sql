-- Brief "Cruscotto del direttivo" (27/8/2026 §8): il promemoria settimanale
-- gira via edge function con client service-role (nessun utente autenticato
-- dietro, quindi auth.uid() e' null). cruscotto_lavori() e
-- cruscotto_conta_domande() (quest'ultima chiamata a sua volta da
-- v_cruscotto_code) controllano has_ruolo_min(auth.uid(), 50): sotto
-- service-role questo e' sempre falso, e la funzione solleva l'eccezione
-- anche per il chiamante fidato. Verificato: "select * from cruscotto_lavori()"
-- impersonando service_role falliva con "Il cruscotto e riservato al
-- direttivo" prima di questa migrazione.
--
-- Si allarga il gate, non lo si toglie: resta la stessa eccezione per un
-- utente autenticato sotto ruolo 50, si aggiunge solo il varco per
-- service_role, che e' gia' un contesto fidato lato server (mai
-- raggiungibile da un browser: la service key non lascia mai il server).
create or replace function public.cruscotto_lavori()
returns table (lavoro text, pianificazione text, attivo boolean, ultima_esecuzione timestamptz, esito text, ore_fa numeric, in_allarme boolean)
language plpgsql
security definer
set search_path to 'public', 'cron'
as $function$
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select j.jobname::text,
         j.schedule::text,
         j.active,
         u.start_time,
         coalesce(u.status, 'mai eseguito')::text,
         round(extract(epoch from now() - u.start_time)/3600.0, 1),
         (u.start_time is null or u.status is distinct from 'succeeded' or u.start_time < now() - interval '8 days')
  from cron.job j
  left join lateral (
    select r.status, r.start_time from cron.job_run_details r
    where r.jobid = j.jobid order by r.start_time desc limit 1
  ) u on true
  where j.active
  order by j.jobname;
end $function$;

grant execute on function public.cruscotto_lavori() to authenticated;
revoke execute on function public.cruscotto_lavori() from anon;
grant execute on function public.cruscotto_lavori() to service_role;

create or replace function public.cruscotto_conta_domande()
returns table(in_attesa integer, piu_vecchia timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select count(*)::integer, min(d.created_at)
  from domande_tesseramento d
  where d.stato not in ('approvata', 'rifiutata');
end $function$;

grant execute on function public.cruscotto_conta_domande() to authenticated;
revoke execute on function public.cruscotto_conta_domande() from anon;
grant execute on function public.cruscotto_conta_domande() to service_role;
