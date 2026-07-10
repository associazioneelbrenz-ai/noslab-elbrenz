-- M5.5 Tessere QR + upload logo convenzioni (10/07/2026).
-- DDL GIÀ APPLICATO a DB nella sessione del 10/7 (via db query; messa a
-- registro con la verifica generale, difformità D1). Idempotente.

-- Tessera QR: codice di verifica pubblico (HMAC troncato, non enumerabile)
alter table public.domande_tesseramento
  add column if not exists codice_tessera text unique;

-- Verifica pubblica della tessera: lookup SOLO per codice esatto — nessun
-- elenco soci esposto. SECURITY DEFINER intenzionale (la tabella è RLS
-- deny-by-default); search_path bloccato.
create or replace function public.tessera_verifica(codice text)
returns table (nome text, numero_tessera integer, anno integer, stato text)
language sql
stable
security definer
set search_path = public
as $$
  select d.nome, d.numero_tessera, d.anno, d.stato
  from public.domande_tesseramento d
  where d.codice_tessera = codice
    and d.codice_tessera is not null
    and d.stato = 'approvata'
$$;

revoke all on function public.tessera_verifica(text) from public;
grant execute on function public.tessera_verifica(text) to anon, authenticated;

-- Upload logo self-service nelle proposte di convenzione: il file resta in
-- staging PRIVATO finché il Direttivo non approva.
alter table public.convenzioni
  add column if not exists logo_staging_path text;

insert into storage.buckets (id, name, public)
values ('convenzioni-staging', 'convenzioni-staging', false)
on conflict (id) do nothing;
