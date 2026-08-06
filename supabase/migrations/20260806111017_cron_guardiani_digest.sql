-- Il riepilogo giornaliero dei Guardiani. Stessa forma di lancia_solleciti_quota:
-- il token vive nel Vault, la funzione si ferma spiegando se non lo trova.
-- Meglio un lavoro fermo che uno partito a meta'.
create or replace function public.lancia_guardiani_digest(p_esegui boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_token text; v_req bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun riepilogo inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/guardiani-digest'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return format('richiesta %s inviata a guardiani-digest (esegui=%s)', v_req, p_esegui);
end;
$$;

-- Ore 19:00 italiane (17:00 UTC d'estate): a giornata finita, cosi' il riepilogo
-- copre davvero tutto quello che e' arrivato.
select cron.schedule('guardiani-digest-giornaliero', '0 17 * * *',
                     'select public.lancia_guardiani_digest(p_esegui => true)');;
