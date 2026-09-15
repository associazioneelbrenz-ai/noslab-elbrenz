-- Ondata 2 dell'audit del 13 settembre 2026 (AUDIT_2026-09-13.md), voce DB-05,
-- consegna 1: i quattro lavori pg_cron attivi in produzione che nessuna
-- migrazione dichiara (Trappola 16: nessun oggetto di database nasce fuori da
-- una migrazione). Sono i quattro più vecchi (jobid 1, 2, 4, 13), nati a mano
-- prima che la regola esistesse.
--
-- Nome, pianificazione e comando sono trascritti ESATTI da cron.job il
-- 15/9/2026, maiuscole e schema compresi, senza cambiarli:
--
--   jobid  1  cleanup_otp_hourly              0 * * * *    select public.cleanup_otp()
--   jobid  2  scadi_ordini_creato_giornaliero 30 3 * * *   select public.scadi_ordini_creato_vecchi()
--   jobid  4  email-outbox-processore         * * * * *    SELECT processa_email_outbox()
--   jobid 13  pulizia-rate-limit              20 * * * *   select public.cleanup_rate_limit()
--
-- Idempotente: cron.unschedule dentro un blocco che tollera l'assenza, poi
-- cron.schedule. Applicarla in produzione cambia solo il jobid (il lavoro
-- viene tolto e rimesso nello stesso istante); la prossima esecuzione resta
-- quella della pianificazione. Le funzioni chiamate esistono già (pg_proc,
-- 15/9/2026) e restano com'erano: cleanup_otp e cleanup_rate_limit eseguibili
-- solo da postgres e service_role.
--
-- RITORNO INDIETRO: non serve, il file descrive lo stato già in essere.

do $$ begin perform cron.unschedule('cleanup_otp_hourly'); exception when others then null; end $$;
select cron.schedule('cleanup_otp_hourly', '0 * * * *',
  $$select public.cleanup_otp()$$);

do $$ begin perform cron.unschedule('scadi_ordini_creato_giornaliero'); exception when others then null; end $$;
select cron.schedule('scadi_ordini_creato_giornaliero', '30 3 * * *',
  $$select public.scadi_ordini_creato_vecchi()$$);

do $$ begin perform cron.unschedule('email-outbox-processore'); exception when others then null; end $$;
select cron.schedule('email-outbox-processore', '* * * * *',
  $$SELECT processa_email_outbox()$$);

do $$ begin perform cron.unschedule('pulizia-rate-limit'); exception when others then null; end $$;
select cron.schedule('pulizia-rate-limit', '20 * * * *',
  $$select public.cleanup_rate_limit()$$);
