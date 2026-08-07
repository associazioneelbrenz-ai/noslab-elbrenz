-- [7/8/2026] IL RIEPILOGO SEGUE IL RITMO, NON L'OROLOGIO.
--
-- Stanotte fra le 5:45 e le 6:54 sono arrivati 17 lemmi da tre persone, e il
-- segretario lo avrebbe saputo alle 19: quattordici ore di silenzio mentre la
-- gente lavorava. Il riepilogo giornaliero l'avevamo voluto ieri, quando una
-- mail per termine rendeva la casella inutilizzabile: giusto per otto lemmi al
-- mese, sbagliato per diciassette in una notte.
--
-- Ora parte al PRIMO dei due eventi: N ore dall'ultimo invio con la coda non
-- vuota, oppure la coda che raggiunge N contributi. Con un tetto: mai piu' di un
-- riepilogo ogni due ore, perche' il rimedio non deve ridiventare il problema.
--
-- Le soglie stanno in configurazione: si cambiano con un UPDATE quando cambia il
-- ritmo, che e' esattamente cio' che e' successo nel giro di un giorno.
insert into config_app (chiave, valore, descrizione, categoria) values
  ('guardiani_digest_ore', '6'::jsonb,
   'Ore dall ultimo riepilogo dopo le quali si invia, se la coda non e vuota', 'sistema'),
  ('guardiani_digest_quanti', '10'::jsonb,
   'Lemmi in coda che fanno partire il riepilogo senza aspettare le ore', 'sistema'),
  ('guardiani_digest_minimo_ore', '2'::jsonb,
   'Distanza minima fra due riepiloghi: tetto contro il rimedio che ridiventa problema', 'sistema')
on conflict (chiave) do nothing;

create table if not exists public.guardiani_digest_invio (
  id bigserial primary key,
  inviato_il timestamptz not null default now(),
  quanti integer not null,
  motivo text not null,
  esito text not null default 'ok'
);

-- Decide se e il momento. NON invia: risponde, e chi chiama agisce. Cosi la
-- decisione si puo interrogare senza far partire niente, che e come si collauda
-- una cosa che manda messaggi alle persone.
create or replace function public.guardiani_digest_da_inviare()
returns table (inviare boolean, quanti integer, motivo text, ore_dall_ultimo numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_quanti int; v_ultimo timestamptz; v_ore numeric;
  v_soglia_ore numeric; v_soglia_quanti int; v_minimo numeric;
begin
  select count(*) into v_quanti from dizionario_lemma where stato = 'in_revisione';
  select max(inviato_il) into v_ultimo from guardiani_digest_invio;
  v_ore := extract(epoch from (now() - coalesce(v_ultimo, now() - interval '99 hours'))) / 3600.0;

  select (valore#>>'{}')::numeric into v_soglia_ore    from config_app where chiave='guardiani_digest_ore';
  select (valore#>>'{}')::int     into v_soglia_quanti from config_app where chiave='guardiani_digest_quanti';
  select (valore#>>'{}')::numeric into v_minimo        from config_app where chiave='guardiani_digest_minimo_ore';
  v_soglia_ore := coalesce(v_soglia_ore, 6);
  v_soglia_quanti := coalesce(v_soglia_quanti, 10);
  v_minimo := coalesce(v_minimo, 2);

  if v_quanti = 0 then
    return query select false, v_quanti, 'coda vuota'::text, v_ore; return;
  end if;
  -- Il tetto vince su tutto, anche sulla quantita: due riepiloghi a venti minuti
  -- di distanza sono rumore, per quanti lemmi siano arrivati.
  if v_ore < v_minimo then
    return query select false, v_quanti, 'troppo presto'::text, v_ore; return;
  end if;
  if v_quanti >= v_soglia_quanti then
    return query select true, v_quanti, 'quantita'::text, v_ore; return;
  end if;
  if v_ore >= v_soglia_ore then
    return query select true, v_quanti, 'ore'::text, v_ore; return;
  end if;
  return query select false, v_quanti, 'in attesa'::text, v_ore;
end;
$$;

create or replace function public.lancia_guardiani_digest(p_esegui boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text; v_req bigint; d record;
begin
  select * into d from guardiani_digest_da_inviare();
  if not d.inviare then
    return format('non invio: %s (in coda %s, ore dall ultimo %.1f)', d.motivo, d.quanti, d.ore_dall_ultimo);
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e nel Vault. Nessun riepilogo inviato.';
  end if;

  if not p_esegui then
    return format('giro a vuoto: avrei inviato per %s, %s lemmi in coda', d.motivo, d.quanti);
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/guardiani-digest?esegui=1&tutti=1',
    headers := jsonb_build_object('Content-Type','application/json','x-ingest-token', v_token),
    body := '{}'::jsonb, timeout_milliseconds := 20000);

  insert into guardiani_digest_invio (quanti, motivo) values (d.quanti, d.motivo);
  return format('inviato per %s: %s lemmi (richiesta %s)', d.motivo, d.quanti, v_req);
end;
$$;

select cron.unschedule('guardiani-digest-giornaliero');
select cron.schedule('guardiani-digest', '*/30 * * * *',
                     'select public.lancia_guardiani_digest(p_esegui => true)');;
