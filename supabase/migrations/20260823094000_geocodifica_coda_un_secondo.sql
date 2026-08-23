-- Brief 23/8/2026, sez. 4: Nominatim vieta l'uso non identificato e limita a
-- UNA richiesta al secondo. La edge function e' stateless fra un'invocazione
-- e l'altra: la serializzazione vera serve a livello di database, con un
-- lock di riga che fa aspettare chi arriva mentre un altro sta prenotando.
--
-- Una riga sola, sempre la stessa (id=true): "select ... for update" blocca
-- chiunque altro tenti di prenotare finche' la transazione precedente non ha
-- fatto commit, e chi sblocca legge gia' l'orario aggiornato dall'altro. E'
-- lo stesso principio di una fila con un solo sportello, non N sportelli che
-- si credono soli.

create table if not exists public.geocodifica_coda (
  id boolean primary key default true,
  prossima_disponibile timestamptz not null default now(),
  constraint geocodifica_coda_riga_unica check (id)
);
insert into public.geocodifica_coda (id, prossima_disponibile)
  values (true, now())
  on conflict (id) do nothing;

revoke all on public.geocodifica_coda from public, anon, authenticated;

-- Ritorna il momento (potenzialmente nel futuro) in cui e' il turno del
-- chiamante: la edge function aspetta fino a quell'istante prima di chiamare
-- Nominatim. Ogni prenotazione sposta avanti lo slot successivo di 1.1s,
-- cosi' due chiamate quasi simultanee non finiscono mai sullo stesso secondo.
create or replace function public.geocodifica_prenota_slot()
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prossima timestamptz;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'curatore_contenuti')) then
    raise exception 'non autorizzato';
  end if;

  select prossima_disponibile into v_prossima from public.geocodifica_coda where id = true for update;
  v_prossima := greatest(v_prossima, now());
  update public.geocodifica_coda
     set prossima_disponibile = v_prossima + interval '1100 milliseconds'
   where id = true;

  return v_prossima;
end;
$function$;

revoke all on function public.geocodifica_prenota_slot() from public, anon;
grant execute on function public.geocodifica_prenota_slot() to authenticated;
