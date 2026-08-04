-- 20260804093000 — il giro a vuoto diventa il comportamento per difetto
--
-- IL SEGRETO C'E'. `ingest_token` e' stato copiato nel Vault il 4 agosto,
-- leggendolo dalle variabili d'ambiente delle Edge Function tramite una
-- funzione usa e getta, poi rimossa: il valore non e' passato da una chat, da
-- un file, ne' dalla riga di comando. Non e' stato rigenerato perche' quello
-- ruotato il 2 agosto era ancora valido, verificato con una chiamata reale.
--
-- E PROPRIO PER QUESTO SERVE QUESTA MIGRAZIONE. Finche' il Vault era vuoto,
-- `lancia_solleciti_quota` rispondeva SOSPESO e non spediva niente: era una
-- trappola disinnescata dal caso. Con il segreto al suo posto, il lavoro
-- pianificato delle 07:15 avrebbe spedito davvero, domattina, senza che
-- nessuno avesse deciso di accenderlo.
--
-- Il guaio non e' il segreto: e' che l'indirizzo aveva `?esegui=1` cablato
-- dentro. Una funzione che si chiama «lancia» e spedisce al primo tentativo e'
-- una trappola, e prima o poi qualcuno ci mette il piede: basta un `select`
-- dato per curiosita' in una console.
--
-- Adesso l'invio vero vuole una scelta esplicita, `p_esegui => true`. Chiamarla
-- per sbaglio fa un giro a vuoto e lo dice. La stessa difesa esiste gia'
-- nell'edge, che senza `?esegui=1` non scrive e non spedisce: due porte in fila
-- sulla stessa strada, perche' questa e' una strada che manda email.
--
-- I PROMEMORIA RESTANO SPENTI, ed e' voluto. Il lavoro pianificato continua a
-- girare ogni giorno ma a vuoto: cosi' la strada resta collaudata e pronta,
-- senza spedire niente a nessuno. Per accenderlo, quando il Direttivo lo
-- decide, una riga sola:
--
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'solleciti-quota-giornaliero'),
--     command => $$select public.lancia_solleciti_quota(p_esegui => true)$$);

-- La vecchia versione senza parametri va TOLTA, non affiancata: con un
-- parametro che ha un valore predefinito, le due firme si sovrappongono e una
-- chiamata a zero argomenti diventa ambigua. Postgres rifiuterebbe, e il
-- lavoro pianificato si fermerebbe con un errore invece che con un giro a
-- vuoto.
drop function if exists public.lancia_solleciti_quota();

create or replace function public.lancia_solleciti_quota(p_esegui boolean default false)
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
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/solleciti-quota'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );

  -- Il messaggio dice cosa e' successo davvero, non cosa si sperava: chi legge
  -- un log deve capire senza aprire il codice se sono partite delle email.
  return case when p_esegui
    then format('INVIO VERO: richiesta %s inviata a solleciti-quota con esegui=1', v_req)
    else format('giro a vuoto: richiesta %s inviata a solleciti-quota senza esegui. Nessuna email, nessuna riga scritta. Per spedire davvero: lancia_solleciti_quota(p_esegui => true)', v_req)
  end;
end;
$$;

comment on function public.lancia_solleciti_quota(boolean) is
 'Lancia l''edge solleciti-quota per il giro dei promemoria della quota. Non contiene le regole di chi avvisare: quelle stanno nell''edge e in v_soci_in_regola. Per difetto fa un GIRO A VUOTO: spedisce solo con p_esegui => true. Se il segreto ingest_token manca dal Vault, non chiama niente e lo dice.';

-- PUBLIC eredita EXECUTE per difetto: revocare da anon e authenticated non
-- basta. Lezione del 4 agosto, e vale anche per la firma nuova.
revoke execute on function public.lancia_solleciti_quota(boolean) from anon, authenticated, public;

-- Il lavoro pianificato resta acceso ma a vuoto, e lo dice nel comando: chi
-- apre la lista dei cron vede a colpo d'occhio che oggi non spedisce.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'solleciti-quota-giornaliero'),
  command => $cron$select public.lancia_solleciti_quota(p_esegui => false)$cron$
);
