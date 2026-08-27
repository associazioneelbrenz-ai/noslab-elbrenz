-- Brief "Cruscotto del direttivo" (27/8/2026 §6.4, verifica 9): il pulsante
-- "segnato oggi" scrive in config_app, chiave cruscotto_controlli. Ma la
-- scrittura su config_app e' riservata dalla RLS esistente a has_ruolo(...,
-- 'super_admin') — un ruolo NOMINALE distinto dal livello numerico: Cristian
-- stesso (ruolo 75, il segretario che ha autorizzato questo brief) non e'
-- super_admin e sarebbe stato bloccato dal proprio cruscotto. Verificato
-- impersonando entrambi gli account reali prima di scrivere questa funzione.
--
-- Funzione stretta, non un grant largo su config_app: scrive SOLO la data
-- di un controllo nominato dentro cruscotto_controlli, gate a ruolo 50 come
-- il resto del cruscotto, mai altre chiavi.
create or replace function public.cruscotto_segna_controllo(p_controllo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := (select auth.uid()); v_valore jsonb;
begin
  if not has_ruolo_min(v_uid, 50) then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  if p_controllo is null or btrim(p_controllo) = '' then
    raise exception 'Nome del controllo mancante';
  end if;

  insert into config_app (chiave, valore, descrizione, categoria, aggiornato_da, updated_at)
  values ('cruscotto_controlli', jsonb_build_object(p_controllo, to_char(now(), 'YYYY-MM-DD')),
          'Date dell''ultima verifica umana dei controlli di sicurezza del cruscotto', 'cruscotto', v_uid, now())
  on conflict (chiave) do update
    set valore = config_app.valore || jsonb_build_object(p_controllo, to_char(now(), 'YYYY-MM-DD')),
        aggiornato_da = v_uid, updated_at = now()
  returning valore into v_valore;

  return v_valore;
end $function$;

revoke all on function public.cruscotto_segna_controllo(text) from public;
revoke all on function public.cruscotto_segna_controllo(text) from anon;
grant execute on function public.cruscotto_segna_controllo(text) to authenticated;
