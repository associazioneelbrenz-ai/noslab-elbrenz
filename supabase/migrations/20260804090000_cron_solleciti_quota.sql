-- 20260804090000 — il lavoro pianificato dei promemoria della quota
--
-- GIA' APPLICATA in produzione. Qui si versiona.
--
-- Non duplica NIENTE della logica: chiama l'edge solleciti-quota, che e' la
-- sola a sapere chi va avvisato e chi no. Riscrivere qui le regole in SQL
-- vorrebbe dire avere due posti che decidono la stessa cosa, ed e' esattamente
-- il guaio da cui viene tutto il lavoro della notte fra il 3 e il 4 agosto.
--
-- IL SEGRETO. Si legge dal Vault, come fa processa_email_outbox: mai in chiaro
-- nel codice, mai in un messaggio. Al momento in cui questo file viene scritto
-- `ingest_token` NON e' nel Vault, quindi il lavoro gira a vuoto e lo dice.
-- Per accenderlo davvero, una riga da eseguire una volta sola:
--
--   select vault.create_secret('<il valore di INGEST_TOKEN>', 'ingest_token',
--                              'Token amministrativo per le edge pianificate');
--
-- Va eseguita da Cristian, perche' il valore non deve passare da una chat.
-- Da quel momento il lavoro parte da solo, senza altre modifiche.

create or replace function public.lancia_solleciti_quota()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_req bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'ingest_token';

  -- Meglio un lavoro che sta fermo spiegando perche' di uno che parte a meta'.
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun promemoria inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/solleciti-quota?esegui=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );

  return format('richiesta %s inviata a solleciti-quota', v_req);
end;
$$;

comment on function public.lancia_solleciti_quota() is
 'Lancia l''edge solleciti-quota per il giro giornaliero dei promemoria. Non contiene le regole di chi avvisare: quelle stanno nell''edge e in v_soci_in_regola. Se il segreto ingest_token manca dal Vault, non chiama niente e lo dice.';

-- Lezione del 4 agosto: revocare da anon e authenticated NON basta, PUBLIC
-- eredita EXECUTE per difetto. Una funzione che manda email non deve stare
-- nell'API per nessun motivo.
revoke execute on function public.lancia_solleciti_quota() from anon, authenticated, public;

-- Una volta al giorno alle 07:15 UTC, cioe' le 9:15 in Italia d'estate.
-- Di giorno e non di notte di proposito: un promemoria che arriva a meta'
-- mattina si legge, e se il lavoro parte storto c'e' qualcuno sveglio.
-- I promemoria maturano a 7 e a 21 giorni: una volta al giorno basta e avanza.
select cron.schedule(
  'solleciti-quota-giornaliero',
  '15 7 * * *',
  $cron$select public.lancia_solleciti_quota()$cron$
);
