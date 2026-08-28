-- 20260828120000 — il lavoro pianificato del salvataggio settimanale
-- Brief "Piano di salvataggio gratuito" (28/8/2026).
--
-- Stesso schema di lancia_solleciti_quota: questa funzione non contiene
-- NESSUNA delle regole di cosa salvare o come cifrare — quelle stanno
-- nell'edge salvataggio-settimanale. Qui c'e' solo il gate, la chiamata e
-- lo schedulamento.
--
-- IL SEGRETO. Letto dal Vault come le altre pianificate: mai in chiaro nel
-- codice, mai in un messaggio. Usa lo stesso 'ingest_token' gia' in uso da
-- solleciti-quota, solleciti-domande, radar-eventi e coda-ascolto-promemoria
-- — nessun nuovo segreto da creare per questo.
--
-- QUELLO CHE QUESTA MIGRAZIONE NON PUO' ACCENDERE DA SOLA: la funzione gira
-- a vuoto (l'edge risponde 500 e non carica niente) finche' mancano, nei
-- secrets del progetto Supabase, BACKUP_PUBKEY, GOOGLE_BACKUP_SA_EMAIL,
-- GOOGLE_BACKUP_SA_KEY e GOOGLE_BACKUP_FOLDER_ID. Nessuno di questi valori
-- deve passare da una chat: si impostano dalla dashboard o dalla CLI, a mano.

-- ---------------------------------------------------------------------------
-- Elenco delle tabelle da esportare, senza doverle nominare a mano.
-- SECURITY DEFINER solo per leggere pg_catalog (nessun dato applicativo),
-- eseguibile solo dal service_role: l'edge la chiama per sapere COSA
-- esportare, non e' un endpoint pubblico.
-- ---------------------------------------------------------------------------
create or replace function public._salvataggio_elenco_tabelle()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
$function$;

comment on function public._salvataggio_elenco_tabelle() is
 'Elenca le tabelle (non le viste) dello schema public, per il salvataggio settimanale. Solo service_role: non e'' un endpoint applicativo.';

revoke execute on function public._salvataggio_elenco_tabelle() from public, anon, authenticated;
grant execute on function public._salvataggio_elenco_tabelle() to service_role;

-- ---------------------------------------------------------------------------
-- Il lancio: chiama l'edge, che sa tutto il resto (cosa esportare, come
-- cifrare, dove caricare, cosa cancellare per la conservazione).
-- ---------------------------------------------------------------------------
create or replace function public.lancia_salvataggio_settimanale()
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

  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun salvataggio lanciato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/salvataggio-settimanale',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    -- Piu' lungo delle altre pianificate: esporta fino a 126 tabelle e
    -- l'inventario di 12 bucket Storage prima di cifrare e caricare su Drive.
    timeout_milliseconds := 120000
  );

  return format('richiesta %s inviata a salvataggio-settimanale', v_req);
end;
$$;

comment on function public.lancia_salvataggio_settimanale() is
 'Lancia l''edge salvataggio-settimanale per il backup cifrato di dati e inventario Storage. Non contiene le regole di cosa esportare o come cifrare: quelle stanno nell''edge. Se il segreto ingest_token manca dal Vault, non chiama niente e lo dice.';

revoke execute on function public.lancia_salvataggio_settimanale() from anon, authenticated, public;

-- La domenica alle 02:00 UTC (le 03:00 in Italia d'inverno, le 04:00 d'estate)
-- — il brief chiede "la domenica alle 02:00" senza fuso; qui, come per le
-- altre pianificate di questo progetto, il riferimento e' l'UTC di pg_cron.
-- Di notte e di proposito, a differenza dei solleciti: qui non c'e' nessuno
-- da svegliare, solo un file da preparare prima di lunedi' mattina.
select cron.schedule(
  'salvataggio-settimanale-domenica',
  '0 2 * * 0',
  $cron$select public.lancia_salvataggio_settimanale()$cron$
);

-- ---------------------------------------------------------------------------
-- Il servizio, per il cruscotto e per registra_battito.
-- Cadenza massima 192 ore (8 giorni): una settimana esatta piu' un giorno di
-- margine, cosi' un salvataggio che scivola di qualche ora un lunedi' non
-- suona come guasto.
-- ---------------------------------------------------------------------------
insert into public.servizio (nome, descrizione, cadenza_massima_ore, attivo) values
('salvataggio-settimanale', 'Backup cifrato settimanale di dati e inventario Storage su Drive', 192, true)
on conflict (nome) do nothing;
