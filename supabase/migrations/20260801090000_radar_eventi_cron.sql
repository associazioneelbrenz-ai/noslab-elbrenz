-- =====================================================================
-- Radar eventi — schedulazione (GATE 1: raccolta giornaliera notturna).
--
-- ⚠️  NON ANCORA APPLICATA. Richiede un passo che solo Cristian puo' fare:
--     mettere INGEST_TOKEN nel Vault. Vedi il blocco PREREQUISITO qui sotto.
--     La migration e' scritta per fallire in modo pulito e rumoroso se il
--     segreto non c'e', invece di creare cron job che falliscono in silenzio
--     ogni notte.
--
-- PERCHE' IL VAULT E NON UNA COSTANTE NEL CODICE: pg_cron chiama la edge
-- function via pg_net, e la edge vuole l'header x-ingest-token. Scrivere il
-- token dentro una funzione lo metterebbe in chiaro in pg_proc, leggibile da
-- chiunque abbia accesso al DB. Stessa meccanica gia' in uso per
-- send_email_shared_secret (processa_email_outbox, cron jobid 4).
--
-- PREREQUISITO (una volta sola, da Cristian):
--
--   1. Generare un token nuovo. INGEST_TOKEN va comunque RUOTATO: quello
--      attuale e' finito in uno screenshot (nota del 29/7).
--        openssl rand -base64 32
--   2. Impostarlo come secret delle edge function:
--        supabase secrets set INGEST_TOKEN='<token>' --project-ref wacknihvdjxltiqvxtqr
--   3. Metterlo nel Vault con lo STESSO valore:
--        select vault.create_secret('<token>', 'ingest_token',
--               'Token per le edge schedulate (radar, solleciti)');
--   4. Applicare questa migration.
--
-- Dopo il punto 2, ricordarsi che anche solleciti-domande e
-- solleciti-integrazione usano lo stesso INGEST_TOKEN: cambiandolo cambiano
-- anche loro, ed e' corretto cosi', ma va saputo.
-- =====================================================================

-- Guardia: se il segreto non c'e', ci si ferma qui con un messaggio leggibile.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ingest_token') then
    raise exception
      'Manca il segreto ''ingest_token'' nel Vault. Esegui prima i punti 1-3 del blocco PREREQUISITO in testa a questa migration.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Chiamata a una edge del Radar, con il token letto dal Vault
-- ---------------------------------------------------------------------
create or replace function public.radar_chiama_edge(p_slug text, p_query text default '')
  returns bigint
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_token text;
  v_base  text;
  v_req   bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    raise exception 'ingest_token assente dal Vault';
  end if;

  -- URL del progetto: nessun hardcode del project-ref sparso per il DB.
  v_base := current_setting('app.settings.supabase_url', true);
  if v_base is null or v_base = '' then
    v_base := 'https://wacknihvdjxltiqvxtqr.supabase.co';
  end if;

  select net.http_post(
    url     := v_base || '/functions/v1/' || p_slug || p_query,
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-ingest-token',  v_token
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_req;

  return v_req;
end $function$;

revoke all on function public.radar_chiama_edge(text, text) from public, anon, authenticated;

comment on function public.radar_chiama_edge(text, text) is
  'Chiama una edge del Radar eventi col token dal Vault. Solo per pg_cron: il token non deve mai passare per il client.';

-- ---------------------------------------------------------------------
-- I tre appuntamenti
-- ---------------------------------------------------------------------
-- Orari in UTC (pg_cron su Supabase non e' localizzato). D'estate l'ora
-- locale e' UTC+2: 00:30 UTC = 02:30 a casa nostra. Per un lavoro notturno
-- lo scarto invernale di un'ora e' irrilevante.
--
-- La raccolta e la classificazione sono separate di 45 minuti apposta: se la
-- raccolta rallenta perche' un portale comunale non risponde, la
-- classificazione non parte a vuoto.

select cron.unschedule('radar-harvest-notturno')  where exists (select 1 from cron.job where jobname='radar-harvest-notturno');
select cron.unschedule('radar-classifica-notturna') where exists (select 1 from cron.job where jobname='radar-classifica-notturna');
select cron.unschedule('radar-digest-settimanale') where exists (select 1 from cron.job where jobname='radar-digest-settimanale');

-- Raccolta: ogni notte. La cadenza NON e' negoziabile al ribasso: la fonte
-- torna al massimo 10 eventi per portale e ignora offset, quindi la copertura
-- la garantisce la frequenza, non la profondita' di lettura.
select cron.schedule(
  'radar-harvest-notturno', '30 0 * * *',
  $cron$ select public.radar_chiama_edge('radar-eventi-harvest') $cron$
);

-- Classificazione: subito dopo, sui 'grezzo' appena entrati.
select cron.schedule(
  'radar-classifica-notturna', '15 1 * * *',
  $cron$ select public.radar_chiama_edge('radar-eventi-classifica') $cron$
);

-- Digest al direttivo: lunedi' mattina, 06:00 UTC = 08:00 locali (GATE 3).
-- Il toggle resta in telegram_notifica: si spegne con un UPDATE, senza deploy.
select cron.schedule(
  'radar-digest-settimanale', '0 6 * * 1',
  $cron$ select public.radar_chiama_edge('radar-eventi-classifica', '?digest=1') $cron$
);
