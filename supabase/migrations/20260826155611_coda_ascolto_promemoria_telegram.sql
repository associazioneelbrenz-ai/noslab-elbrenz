-- Coda di ascolto (brief "La coda di ascolto", 26/8/2026 §4c). Promemoria
-- settimanale al direttivo, solo se la coda e' ferma da piu' di sette
-- giorni. Stesso schema di lancia_guardiani_digest: il token vive nel
-- Vault, la funzione si ferma spiegando se non lo trova.
insert into public.telegram_notifica (tipo, categoria, etichetta, attivo)
values ('coda_ascolto', 'Guardiani', 'Coda di ascolto ferma da una settimana', true)
on conflict (tipo) do nothing;

create or replace function public.lancia_coda_ascolto_promemoria(p_esegui boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text; v_req bigint;
  v_n int; v_secondi int; v_piu_vecchia timestamptz;
begin
  select count(*), coalesce(sum(durata_secondi), 0), min(created_at)
    into v_n, v_secondi, v_piu_vecchia
  from v_coda_ascolto;

  if v_n = 0 or v_piu_vecchia is null or v_piu_vecchia > now() - interval '7 days' then
    return format('SOSPESO: coda vuota o non ferma da 7 giorni (n=%s, piu_vecchia=%s)', v_n, v_piu_vecchia);
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun promemoria inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/coda-ascolto-promemoria'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return format('richiesta %s inviata (n=%s, secondi=%s, piu_vecchia=%s)', v_req, v_n, v_secondi, v_piu_vecchia);
end;
$$;

-- Lunedi' 8:00 UTC (9-10 in Italia): una volta alla settimana, non di piu'.
select cron.schedule('coda-ascolto-promemoria-settimanale', '0 8 * * 1',
                     'select public.lancia_coda_ascolto_promemoria(p_esegui => true)');
