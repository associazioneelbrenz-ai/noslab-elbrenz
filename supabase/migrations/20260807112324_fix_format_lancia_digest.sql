-- [7/8/2026] `format()` di Postgres conosce solo %s, %I, %L e %%: `%.1f` non
-- esiste, ed e' roba di C e di altri linguaggi. Il ramo «non invio» andava in
-- errore a ogni giro, cioe' ogni mezz'ora, e l'invio riuscito delle 10:00
-- nascondeva il guasto dietro un successo.
--
-- Trovato dalla plancia al primo collaudo, che e' esattamente il lavoro per cui
-- l'abbiamo costruita: il difetto non si e' fatto notare, e' stato notato.
create or replace function public.lancia_guardiani_digest(p_esegui boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text; v_req bigint; d record;
begin
  select * into d from guardiani_digest_da_inviare();
  if not d.inviare then
    return format('non invio: %s (in coda %s, ore dall ultimo %s)',
                  d.motivo, d.quanti, round(d.ore_dall_ultimo, 1));
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
$$;;
