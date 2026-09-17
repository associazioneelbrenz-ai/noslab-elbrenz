-- Distinguere «gira a vuoto» da «morto» nel battito dei servizi
-- 17 settembre 2026, seguito del rapporto docs/REPORT_battito_2026-09-16.md.
--
-- IL PROBLEMA. Tre servizi su nove risultavano in allarme come «silenzioso da
-- 464 ore», e nessuno dei tre era morto:
--
--   * coda-ascolto-promemoria: il lanciatore lancia_coda_ascolto_promemoria()
--     controlla da se' che la coda sia non vuota e ferma da sette giorni. Se
--     non lo e', restituisce «SOSPESO» e non chiama nemmeno la funzione. La
--     funzione non gira, quindi non scrive un battito, quindi sembra morta.
--     Era invece sana e senza niente da fare.
--   * solleciti-quota: il lavoro pianificato lo chiama ogni giorno con
--     p_esegui => false, cioe' a vuoto. La funzione esce presto e non scrive
--     un battito. Viva, ma inoperosa per scelta di chi ha scritto il cron.
--   * solleciti-domande: non ha nessun lavoro pianificato (Trappola 15).
--     Quello e' un buco vero, e resta segnalato: non lo chiude questa
--     migrazione, perche' mandare solleciti e' una decisione di Cristian.
--
-- La forma del guasto e' sempre quella di CLAUDE.md: una cosa sembra a posto
-- (o sembra rotta) perche' nessuno guarda la cosa giusta. Un servizio che non
-- scrive un battito e' indistinguibile da un servizio che non c'e' piu'.
--
-- LA CURA, in tre pezzi.
--
-- 1. Un esito nuovo, 'giro_a_vuoto': il giro di collaudo lascia traccia. Non
--    dice «ho lavorato», dice «sono vivo e non ho lavorato».
-- 2. La vista v_servizi_stato impara a leggere due date invece di una:
--    l'ultimo battito qualunque (sono vivo?) e l'ultimo giro VERO (sto
--    lavorando?). L'allarme scatta sul secondo, la diagnosi le usa entrambe.
-- 3. I sette lanciatori scrivono un battito anche quando decidono di
--    sospendere. Oggi tutti e sette possono fermarsi in silenzio se il
--    segreto ingest_token sparisce dal Vault, e nessuno saprebbe perche'.
--
-- NIENTE E' STATO TOLTO. Il vincolo si allarga, la vista guadagna due colonne
-- in fondo e una diagnosi in piu', i lanciatori conservano parola per parola
-- il testo che restituiscono: cambia solo che, prima di restituirlo,
-- registrano il motivo.

-- ---------------------------------------------------------------------------
-- 1. L'esito nuovo.
-- ---------------------------------------------------------------------------
-- Il vincolo si allarga: i tre esiti di prima restano validi tutti e tre.
alter table public.servizio_battito drop constraint if exists servizio_battito_esito_check;
alter table public.servizio_battito add constraint servizio_battito_esito_check
  check (esito in ('ok', 'errore', 'niente_da_fare', 'giro_a_vuoto'));

comment on column public.servizio_battito.esito is
  'ok = ha lavorato; niente_da_fare = ha girato e non c''era niente da fare; errore = ha provato e non ce l''ha fatta; giro_a_vuoto = giro di collaudo, nessuna scrittura e nessun invio. I primi tre sono giri VERI e spengono l''allarme, il quarto dice solo che il servizio e'' vivo.';

-- ---------------------------------------------------------------------------
-- 2. Un aiuto per i lanciatori, che non deve mai rompere il lavoro.
-- ---------------------------------------------------------------------------
-- Stessa promessa che le edge function si fanno da anni con il loro
-- try/catch attorno a registra_battito: annotare non e' il lavoro, e non
-- deve poterlo far fallire. Qui la promessa vale doppio, perche' chi chiama
-- e' pg_cron: un'eccezione non gestita dentro un lanciatore annullerebbe
-- l'intero giro e lascerebbe il lavoro segnato come fallito.
create or replace function public.battito_lanciatore(p_servizio text, p_esito text, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform registra_battito(p_servizio, p_esito,
                             jsonb_build_object('da', 'lanciatore', 'motivo', p_motivo));
  exception when others then
    -- Il battito non deve mai rompere il lavoro.
    null;
  end;
end $function$;
revoke execute on function public.battito_lanciatore(text, text, text) from public;
grant execute on function public.battito_lanciatore(text, text, text) to service_role;
comment on function public.battito_lanciatore(text, text, text) is
  'Battito scritto da un lanciatore SQL quando decide di sospendere invece di chiamare la edge function. Non solleva mai: se il battito non si scrive, il lavoro prosegue lo stesso.';

-- ---------------------------------------------------------------------------
-- 3. La vista: due date invece di una.
-- ---------------------------------------------------------------------------
-- Le colonne di prima restano nello stesso ordine e con lo stesso nome (lo
-- impone create or replace view, e va bene cosi': cruscotto_servizi() legge
-- per nome). Le due nuove stanno in fondo.
--
-- Perche' l'allarme guarda l'ultimo giro VERO e non l'ultimo battito: un
-- servizio che gira a vuoto tutti i giorni e' vivo ma non sta facendo il suo
-- lavoro, ed e' esattamente il caso di solleciti-quota, che ha una persona in
-- attesa di un sollecito che non parte. Spegnere quell'allarme sarebbe
-- peggio del falso allarme di prima.
--
-- Per un servizio che non scrive mai battiti di collaudo, ultimo_giro_vero e
-- ultimo_battito coincidono: l'allarme si comporta esattamente come prima.
create or replace view public.v_servizi_stato as
select s.nome,
       s.descrizione,
       s.cadenza_massima_ore,
       s.attivo,
       b.creato_il as ultimo_battito,
       b.esito as ultimo_esito,
       round(extract(epoch from now() - b.creato_il) / 3600.0, 1) as ore_fa,
       s.attivo and (
         b.creato_il is null
         or b.esito = 'errore'
         or v.creato_il is null
         or v.creato_il < (now() - make_interval(hours => s.cadenza_massima_ore))
       ) as in_allarme,
       case
         when b.creato_il is null then 'mai battuto'
         when b.esito = 'errore' then 'ultimo esito in errore'
         when b.creato_il < (now() - make_interval(hours => s.cadenza_massima_ore)) then 'silenzioso'
         when v.creato_il is null then 'gira a vuoto: non ha mai fatto un giro vero'
         when v.creato_il < (now() - make_interval(hours => s.cadenza_massima_ore))
           then 'gira a vuoto da ' || floor(extract(epoch from now() - v.creato_il) / 86400.0)::int || ' giorni'
         else 'sano'
       end as diagnosi,
       v.creato_il as ultimo_giro_vero,
       round(extract(epoch from now() - v.creato_il) / 86400.0, 1) as giorni_senza_giro_vero
from servizio s
left join lateral (
  select x.creato_il, x.esito from servizio_battito x
  where x.servizio = s.nome order by x.creato_il desc limit 1
) b on true
left join lateral (
  select x.creato_il from servizio_battito x
  where x.servizio = s.nome and x.esito <> 'giro_a_vuoto'
  order by x.creato_il desc limit 1
) v on true;
-- Nessuna GRANT: vista interna, letta solo da cruscotto_servizi().

-- ---------------------------------------------------------------------------
-- 4. I sette lanciatori annotano quando si fermano.
-- ---------------------------------------------------------------------------
-- Tutti e sette conservano parola per parola il testo che restituivano. La
-- riga aggiunta e' sempre la stessa: prima di restituire, scrivi perche'.

-- 4.1 coda-ascolto-promemoria — qui sta il falso allarme piu' vecchio: la
-- coda e' vuota da settimane, il lanciatore sospende, e la vista lo leggeva
-- come «silenzioso da 464 ore». Adesso dice «sano», che e' la verita'.
create or replace function public.lancia_coda_ascolto_promemoria(p_esegui boolean default true)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text; v_req bigint;
  v_n int; v_secondi int; v_piu_vecchia timestamptz;
begin
  select count(*), coalesce(sum(durata_secondi), 0), min(created_at)
    into v_n, v_secondi, v_piu_vecchia
  from v_coda_ascolto;

  if v_n = 0 or v_piu_vecchia is null or v_piu_vecchia > now() - interval '7 days' then
    perform battito_lanciatore('coda-ascolto-promemoria', 'niente_da_fare',
      format('coda vuota o non ferma da 7 giorni (n=%s, piu_vecchia=%s)', v_n, v_piu_vecchia));
    return format('SOSPESO: coda vuota o non ferma da 7 giorni (n=%s, piu_vecchia=%s)', v_n, v_piu_vecchia);
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    perform battito_lanciatore('coda-ascolto-promemoria', 'errore', 'ingest_token assente dal Vault');
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
$function$;

-- 4.2 solleciti-quota.
create or replace function public.lancia_solleciti_quota(p_esegui boolean default false)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
  v_req bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'ingest_token';

  -- Meglio un lavoro che sta fermo spiegando perche' di uno che parte a meta'.
  if v_token is null then
    perform battito_lanciatore('solleciti-quota', 'errore', 'ingest_token assente dal Vault');
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun promemoria inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/solleciti-quota'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );

  return case when p_esegui
    then format('INVIO VERO: richiesta %s inviata a solleciti-quota con esegui=1', v_req)
    else format('giro a vuoto: richiesta %s inviata a solleciti-quota senza esegui. Nessuna email, nessuna riga scritta. Per spedire davvero: lancia_solleciti_quota(p_esegui => true)', v_req)
  end;
end;
$function$;

-- 4.3 cruscotto-digest.
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
    perform battito_lanciatore('cruscotto-digest', 'errore', 'ingest_token assente dal Vault');
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

-- 4.4 guardiani-digest — tre uscite invece di una: non c'e' niente da
-- mandare, il segreto manca, oppure e' un giro di collaudo.
create or replace function public.lancia_guardiani_digest(p_esegui boolean default true)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_req bigint; d record;
begin
  select * into d from guardiani_digest_da_inviare();
  if not d.inviare then
    perform battito_lanciatore('guardiani-digest', 'niente_da_fare',
      format('%s (in coda %s, ore dall ultimo %s)', d.motivo, d.quanti, round(d.ore_dall_ultimo, 1)));
    return format('non invio: %s (in coda %s, ore dall ultimo %s)',
                  d.motivo, d.quanti, round(d.ore_dall_ultimo, 1));
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    perform battito_lanciatore('guardiani-digest', 'errore', 'ingest_token assente dal Vault');
    return 'SOSPESO: il segreto ingest_token non e nel Vault. Nessun riepilogo inviato.';
  end if;

  if not p_esegui then
    perform battito_lanciatore('guardiani-digest', 'giro_a_vuoto',
      format('avrei inviato per %s, %s lemmi in coda', d.motivo, d.quanti));
    return format('giro a vuoto: avrei inviato per %s, %s lemmi in coda', d.motivo, d.quanti);
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/guardiani-digest?esegui=1&tutti=1',
    headers := jsonb_build_object('Content-Type','application/json','x-ingest-token', v_token),
    body := '{}'::jsonb, timeout_milliseconds := 20000);

  insert into guardiani_digest_invio (quanti, motivo) values (d.quanti, d.motivo);
  return format('inviato per %s: %s lemmi (richiesta %s)', d.motivo, d.quanti, v_req);
end;
$function$;

-- 4.5 radar-eventi-harvest.
create or replace function public.lancia_radar_eventi(p_esegui boolean default true, p_solo text default null::text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text; v_req bigint; v_url text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    perform battito_lanciatore('radar-eventi-harvest', 'errore', 'ingest_token assente dal Vault');
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessuna raccolta avviata.';
  end if;

  v_url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/radar-eventi-harvest';
  if not p_esegui then
    v_url := v_url || '?dryrun=1';
    if p_solo is not null then v_url := v_url || '&solo=' || p_solo; end if;
  elsif p_solo is not null then
    v_url := v_url || '?solo=' || p_solo;
  end if;

  v_req := net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  return format('richiesta %s inviata a %s', v_req, v_url);
end $function$;

-- 4.6 radar-eventi-classifica — «nessun evento grezzo» e' il caso normale
-- di quasi tutti i giorni: senza battito, due giorni di calma avrebbero fatto
-- scattare un allarme (la cadenza e' 30 ore).
create or replace function public.lancia_radar_classifica(p_esegui boolean default true, p_digest boolean default false)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_req bigint; v_url text; v_grezzi int;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    perform battito_lanciatore('radar-eventi-classifica', 'errore', 'ingest_token assente dal Vault');
    return 'SOSPESO: ingest_token assente dal Vault.';
  end if;

  if not p_digest then
    select count(*) into v_grezzi from eventi_esterni where stato = 'grezzo';
    if v_grezzi = 0 then
      perform battito_lanciatore('radar-eventi-classifica', 'niente_da_fare', 'nessun evento in stato grezzo');
      return 'NIENTE DA FARE: nessun evento in stato grezzo.';
    end if;
  end if;

  v_url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/radar-eventi-classifica';
  if p_digest then v_url := v_url || '?digest=1' || case when p_esegui then '' else '&dryrun=1' end;
  elsif not p_esegui then v_url := v_url || '?dryrun=1';
  end if;

  v_req := net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  return format('richiesta %s inviata (grezzi in coda: %s)', v_req, coalesce(v_grezzi::text,'n/d'));
end $function$;

-- 4.7 salvataggio-settimanale — questo e' il piu' importante dei sette: e'
-- l'unico dove si rischia di perdere qualcosa che non torna indietro.
create or replace function public.lancia_salvataggio_settimanale()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
  v_req bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'ingest_token';

  if v_token is null then
    perform battito_lanciatore('salvataggio-settimanale', 'errore', 'ingest_token assente dal Vault');
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun salvataggio lanciato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/salvataggio-settimanale',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );

  return format('richiesta %s inviata a salvataggio-settimanale', v_req);
end;
$function$;
