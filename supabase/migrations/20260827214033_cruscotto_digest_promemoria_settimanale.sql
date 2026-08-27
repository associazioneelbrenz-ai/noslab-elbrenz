-- Brief "Cruscotto del direttivo" (27/8/2026 §8): promemoria settimanale,
-- ogni lunedi' alle 8:00. A differenza di coda-ascolto-promemoria, qui NON
-- c'e' una condizione di sospensione: il brief chiede esplicitamente un
-- messaggio anche a zero allarmi ("il silenzio non deve poter significare
-- sia tutto bene sia sono morto"), quindi lancia_cruscotto_digest() chiama
-- sempre l'edge, che poi decide da sola il contenuto del messaggio.
insert into telegram_notifica (tipo, categoria, etichetta, attivo)
values ('cruscotto_allarmi', 'Alert', 'Cruscotto del direttivo', true)
on conflict (tipo) do nothing;

create or replace function public.lancia_cruscotto_digest(p_esegui boolean default true)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_req bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun promemoria inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/cruscotto-digest'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return format('richiesta %s inviata', v_req);
end;
$function$;

select cron.schedule('cruscotto-digest-settimanale', '0 8 * * 1', $$select public.lancia_cruscotto_digest(p_esegui => true)$$);
