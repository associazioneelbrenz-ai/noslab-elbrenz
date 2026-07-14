-- OTP: genera_otp / verifica_otp portate in versione (audit 14/7).
-- Prima vivevano solo nel DB (sicurezza del login non revisionabile). Qui sono
-- committate as-is, con UN hardening: il codice a 6 cifre usa una fonte
-- CRITTOGRAFICA (extensions.gen_random_bytes) invece di random() (PRNG non
-- crittografico, prevedibile). Tutto il resto invariato (bcrypt, single-use,
-- scadenza, max tentativi, invalidazione dei precedenti).

create or replace function public.genera_otp(
  p_email text, p_scope text default 'login', p_ttl_min integer default 10,
  p_max_tentativi integer default 3, p_ip inet default null, p_user_agent text default null)
returns table(otp_id uuid, codice_chiaro text)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_codice text;
  v_hash text;
  v_id uuid;
begin
  update public.auth_otp
  set usato = true, usato_at = now()
  where email = p_email::citext and scope = p_scope and usato = false;

  -- Codice 6 cifre da fonte CRITTOGRAFICA (audit 14/7: era random()).
  v_codice := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');

  v_hash := extensions.crypt(v_codice, extensions.gen_salt('bf', 6));

  insert into public.auth_otp (email, codice_hash, scope, scade_at, max_tentativi, ip_request, user_agent)
  values (p_email::citext, v_hash, p_scope, now() + (p_ttl_min || ' minutes')::interval, p_max_tentativi, p_ip, p_user_agent)
  returning id into v_id;

  return query select v_id, v_codice;
end
$function$;

create or replace function public.verifica_otp(p_email text, p_codice text, p_scope text default 'login')
returns table(valido boolean, motivo text, otp_id uuid)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_rec public.auth_otp%rowtype;
begin
  select * into v_rec
  from public.auth_otp
  where email = p_email::citext and scope = p_scope and usato = false and scade_at > now()
  order by created_at desc limit 1;

  if not found then
    return query select false, 'nessun_codice_attivo', null::uuid; return;
  end if;

  if v_rec.tentativi >= v_rec.max_tentativi then
    update public.auth_otp set usato = true, usato_at = now() where id = v_rec.id;
    return query select false, 'troppi_tentativi', v_rec.id; return;
  end if;

  if extensions.crypt(p_codice, v_rec.codice_hash) = v_rec.codice_hash then
    update public.auth_otp set usato = true, usato_at = now() where id = v_rec.id;
    return query select true, 'ok'::text, v_rec.id;
  else
    update public.auth_otp set tentativi = tentativi + 1 where id = v_rec.id;
    return query select false, 'codice_errato', v_rec.id;
  end if;
end
$function$;
