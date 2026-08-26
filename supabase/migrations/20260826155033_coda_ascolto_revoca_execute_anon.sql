-- Il revoke da PUBLIC non bastava: le due funzioni avevano anche una grant
-- ESPLICITA ad anon (default del progetto per ogni nuova funzione, non
-- specifico di questa). La funzione si difende comunque da sola
-- (has_ruolo_min interno), ma anon non deve poter nemmeno provare a
-- chiamarla.
revoke execute on function public.conferma_ascolto(uuid) from anon;
revoke execute on function public.scarta_ascolto(uuid, text) from anon;
