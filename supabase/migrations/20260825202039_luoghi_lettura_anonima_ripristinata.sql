-- v_luoghi_mappa e v_luoghi_pagina hanno security_invoker: leggono coi permessi del
-- chiamante. Ma luoghi_interesse non concedeva SELECT ad anon, quindi la mappa pubblica
-- e le schede dei luoghi rispondevano "permission denied" a ogni visitatore non
-- autenticato. La RLS gia' presente limita comunque anon ai soli luoghi pubblicati:
-- il grant apre la porta, la policy decide cosa si vede.
grant select on public.luoghi_interesse to anon;;
