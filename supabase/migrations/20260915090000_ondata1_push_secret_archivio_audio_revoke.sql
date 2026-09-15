-- Ondata 1 dell'audit del 13-14 settembre 2026 (AUDIT_2026-09-13.md):
-- tre chiusure a database, tutte reversibili, nessun dato toccato.

-- ---------------------------------------------------------------------------
-- SIC-02. Il trigger che consegna le push a `invia-push` mandava solo la
-- chiave anonima (pubblica nel sito): il gateway la accettava e la funzione,
-- senza PUSH_WEBHOOK_SECRET configurato, non controllava niente. Chiunque
-- poteva recapitare una notifica con titolo, testo e link a scelta sul
-- telefono di qualsiasi socio. Da oggi la funzione pretende l'header
-- `x-webhook-secret` (fail-closed); qui lo si legge dal Vault, dove
-- `ingest_token` vive gia' per i lavori pianificati, e lo si manda.
-- La funzione e' SECURITY DEFINER (owner postgres): puo' leggere il Vault.
-- ---------------------------------------------------------------------------
create or replace function public.notifica_push_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'ingest_token'
   limit 1;

  perform net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/invia-push',
    body := jsonb_build_object('type', 'INSERT', 'table', 'notifica', 'record', to_jsonb(NEW)),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhY2tuaWh2ZGp4bHRpcXZ4dHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjI1NjEsImV4cCI6MjA5MjI5ODU2MX0.ScOp5xQ7Qma1NBGh6satfja7AsoGHC67G-V_NlHdMoc',
      'x-webhook-secret', coalesce(v_secret, '')
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- DB-01. `archivio_audio` porta l'indirizzo email e il nome di chi ha
-- portato ogni registrazione, e il nome di chi parla anche quando ha chiesto
-- l'anonimato. La policy di lettura dava le righe pubblicate a QUALUNQUE
-- account autenticato, ospite compreso, con tutte le colonne. Nessuna pagina
-- del sito ne' dell'app soci legge la tabella con quel ruolo: il pubblico
-- passa da `glossario_pubblico`, che maschera i nomi secondo i consensi; i
-- curatori (>= 20) leggono dalla console e da `v_coda_ascolto`. La lettura
-- diretta resta quindi ai soli curatori. Le altre policy (curatore
-- linguistico, scrittura >= 25) non cambiano.
-- ---------------------------------------------------------------------------
drop policy if exists aa_select_per_visibilita on public.archivio_audio;
create policy aa_select_curatori on public.archivio_audio
  for select to authenticated
  using (public.has_ruolo_min((select auth.uid()), 20));

-- ---------------------------------------------------------------------------
-- DB-02 / DB-03. Due funzioni SECURITY DEFINER pensate per pg_cron erano
-- eseguibili da qualsiasi account loggato: la prima elenca email e nome dei
-- contributori candidati al tesseramento e, con l'interruttore acceso, scrive
-- inviti e bozze di posta; la seconda fa partire l'annuncio a tutti dei
-- lemmi pubblicati. Il cron gira come postgres e non ne risente.
-- ---------------------------------------------------------------------------
revoke execute on function public.prepara_inviti_tesseramento(boolean) from anon, authenticated, public;
revoke execute on function public.annuncia_lemmi_pubblicati() from anon, authenticated, public;
