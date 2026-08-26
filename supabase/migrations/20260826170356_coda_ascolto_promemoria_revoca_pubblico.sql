-- L'advisor di sicurezza segnala che lancia_coda_ascolto_promemoria e'
-- eseguibile da anon e authenticated via /rest/v1/rpc: stesso difetto di
-- default-grant gia' visto su conferma_ascolto/scarta_ascolto in questo
-- brief. La funzione va chiamata solo da pg_cron (ruolo postgres): nessun
-- client deve poterla invocare da REST.
revoke execute on function public.lancia_coda_ascolto_promemoria(boolean) from public;
revoke execute on function public.lancia_coda_ascolto_promemoria(boolean) from anon;
revoke execute on function public.lancia_coda_ascolto_promemoria(boolean) from authenticated;
