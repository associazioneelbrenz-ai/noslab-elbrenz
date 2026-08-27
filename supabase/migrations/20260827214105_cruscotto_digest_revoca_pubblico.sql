-- Stesso difetto di default gia' visto piu' volte in questo progetto:
-- lancia_cruscotto_digest() nasceva eseguibile da anon e authenticated via
-- REST. Va chiamata solo da pg_cron (ruolo postgres).
revoke execute on function public.lancia_cruscotto_digest(boolean) from public;
revoke execute on function public.lancia_cruscotto_digest(boolean) from anon;
revoke execute on function public.lancia_cruscotto_digest(boolean) from authenticated;
