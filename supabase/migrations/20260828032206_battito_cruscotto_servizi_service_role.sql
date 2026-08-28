-- Brief "Il battito dei servizi" (28/8/2026 §4.2): cruscotto-digest deve
-- includere anche i servizi in allarme, e gira con client service-role
-- (auth.uid() null in quel contesto). Stesso guasto e stessa correzione gia'
-- applicati a cruscotto_lavori()/cruscotto_conta_domande() nel brief
-- precedente: verificato che "select * from cruscotto_servizi()" impersonando
-- service_role falliva con "Il cruscotto e riservato al direttivo" prima di
-- questa migrazione. Si allarga il gate, non lo si toglie.
create or replace function public.cruscotto_servizi()
returns table (servizio text, descrizione text, ultimo_battito timestamptz, ultimo_esito text, ore_fa numeric, cadenza_massima_ore integer, in_allarme boolean, diagnosi text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select v.nome, v.descrizione, v.ultimo_battito, v.ultimo_esito, v.ore_fa,
         v.cadenza_massima_ore, v.in_allarme, v.diagnosi
  from v_servizi_stato v
  order by v.in_allarme desc, v.ore_fa desc nulls first, v.nome;
end $function$;

grant execute on function public.cruscotto_servizi() to authenticated;
revoke execute on function public.cruscotto_servizi() from anon;
grant execute on function public.cruscotto_servizi() to service_role;
