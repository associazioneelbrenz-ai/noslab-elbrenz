-- Correzione immediata: 'cruscotto' non e' fra le categorie ammesse da
-- config_app_categoria_check (branding, economia, feature_flag,
-- integrazione, editoriale, sistema). 'sistema' e' la categoria giusta.
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
          'Date dell''ultima verifica umana dei controlli di sicurezza del cruscotto', 'sistema', v_uid, now())
  on conflict (chiave) do update
    set valore = config_app.valore || jsonb_build_object(p_controllo, to_char(now(), 'YYYY-MM-DD')),
        aggiornato_da = v_uid, updated_at = now()
  returning valore into v_valore;

  return v_valore;
end $function$;
