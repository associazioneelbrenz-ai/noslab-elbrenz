-- battito_lanciatore non deve essere chiamabile da fuori
-- 17 settembre 2026, poche ore dopo 20260917073434_battito_giro_a_vuoto.
--
-- L'ERRORE, mio, trovato dal linter di Supabase subito dopo: quella
-- migrazione chiudeva la funzione nuova con
--
--   revoke execute on function public.battito_lanciatore(...) from public;
--
-- che non basta. In questo progetto vale un ALTER DEFAULT PRIVILEGES che
-- concede EXECUTE su ogni funzione nuova dello schema public direttamente ai
-- ruoli `anon` e `authenticated`: sono concessioni esplicite, e togliere
-- PUBLIC non le tocca. Risultato letto da pg_proc.proacl:
--   {postgres=X, anon=X, authenticated=X, service_role=X}
--
-- Cosa permetteva. Chiunque, senza account, poteva chiamare
-- /rest/v1/rpc/battito_lanciatore e scrivere un battito qualsiasi per un
-- servizio qualsiasi. Bastava un 'ok' inventato su salvataggio-settimanale
-- per spegnere l'allarme del backup che non funziona da tre settimane. Cioe'
-- esattamente il contrario di quello che quella migrazione stava cercando di
-- fare: rendere il guasto rumoroso.
--
-- La forma giusta e' quella che PRIV-06 usava gia' per pulizia_conservazione,
-- e che qui era stata dimenticata: nominare anche anon e authenticated. Da
-- oggi, quando si scrive una funzione riservata al server, si revoca da
-- `public, anon, authenticated`, e poi si CONTROLLA con has_function_privilege
-- invece di fidarsi della revoca.

revoke execute on function public.battito_lanciatore(text, text, text)
  from public, anon, authenticated;

-- Le due funzioni sorelle erano gia' a posto (verificate oggi con
-- has_function_privilege): registra_battito e pulizia_conservazione rispondono
-- false sia ad anon sia ad authenticated. La revoca qui sotto e' ripetuta
-- apposta, per idempotenza: se un domani una di loro venisse ricreata da una
-- migrazione distratta, questa riga la richiude.
revoke execute on function public.registra_battito(text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.pulizia_conservazione()
  from public, anon, authenticated;
