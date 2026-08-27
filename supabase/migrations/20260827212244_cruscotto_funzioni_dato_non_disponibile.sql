-- Brief "Cruscotto del direttivo" (27/8/2026 §9: non toccare le viste/
-- funzioni del brief, ma questa e' una verifica-non-rifacimento, come la
-- migrazione cruscotto_domande_bypass_aal2 prima di questa).
--
-- cruscotto_funzioni() come depositata falliva SEMPRE con un errore SQL:
-- "column r.url does not exist" su net._http_response, che non ha mai avuto
-- quella colonna. Non e' un refuso di nome: net._http_response non registra
-- affatto quale URL e' stato chiamato (solo status_code/headers/content), e
-- la sua tabella gemella net.http_request_queue — che la url ce l'ha — e'
-- una coda di lavoro transitoria: 0 righe in questo momento, sempre svuotata
-- appena il lavoro e' processato. In piu' i pochi minuti di net._http_response
-- rimasti si sono rivelati un registro condiviso e non distinguibile fra
-- sentinella-pagine (che chiama pagine Netlify), radar-eventi (che chiama
-- API esterne dietro Cloudflare) e le eventuali chiamate a funzioni edge
-- nostre — nessun campo separa le tre cose.
--
-- Il vero registro delle chiamate alle edge function vive nei log di
-- Supabase (Logs Explorer, backend ClickHouse), leggibile solo via API a
-- finestre di 24 ore, mai da SQL dentro Postgres. Nessuna funzione
-- SECURITY DEFINER puo' raggiungerlo: non e' un dato che Postgres possiede.
--
-- Segue lo stesso principio gia' scritto in plancia_salute() (7/8/2026, la
-- riga "Consumo Netlify"): "quando un dato NON e' ottenibile, si dice. Un
-- riquadro vuoto e un riquadro che non sa sono cose diverse". Restituisce
-- una riga sola, onesta, invece di un errore o di un elenco silenziosamente
-- vuoto che si legge come "nessuna funzione chiamata" quando in realta' e'
-- "non lo sappiamo".
create or replace function public.cruscotto_funzioni()
returns table(funzione text, chiamate_30gg bigint, ultima timestamptz, ultimo_stato integer, giorni_fa numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not has_ruolo_min((select auth.uid()), 50) then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select 'Dato non disponibile da Postgres — vedi il Logs Explorer di Supabase'::text,
         0::bigint, null::timestamptz, null::integer, null::numeric;
end $function$;
