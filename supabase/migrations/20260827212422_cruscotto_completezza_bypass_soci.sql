-- Brief "Cruscotto del direttivo" (27/8/2026 §9: leggi e basta — ma questa
-- e' la stessa classe di verifica-non-rifacimento delle due migrazioni
-- precedenti). v_cruscotto_completezza e' security_invoker e il suo terzo
-- indicatore ("Soci in regola collegati a un account") attraversa
-- v_soci_in_regola, che non ha NESSUN grant select per authenticated (dato
-- giusto: nome, email, importi incassati, motivi di deroga — dati personali
-- e finanziari veri, non solo un numero). Risultato verificato impersonando
-- un utente di ruolo 75: "permission denied for view v_soci_in_regola",
-- errore secco, non un elenco vuoto — ma comunque un blocco non previsto.
--
-- Non si concede un grant largo su v_soci_in_regola (esporrebbe quei dati a
-- chiunque sia autenticato, non solo al direttivo): stessa soluzione delle
-- domande di tesseramento, una funzione SECURITY DEFINER che restituisce
-- SOLO i due conteggi, con lo stesso gate a ruolo 50. v_soci_in_regola resta
-- esattamente come era.
create or replace function public.cruscotto_conta_soci_regola()
returns table(fatti integer, totale integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not has_ruolo_min((select auth.uid()), 50) then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select
    (select count(*)::integer from v_soci_in_regola v join domande_tesseramento d on d.id = v.domanda_id
      where v.anno = 2026 and v.quota_incassata and d.account_id is not null),
    (select count(*)::integer from v_soci_in_regola where anno = 2026 and quota_incassata);
end $function$;

revoke all on function public.cruscotto_conta_soci_regola() from public;
revoke all on function public.cruscotto_conta_soci_regola() from anon;
grant execute on function public.cruscotto_conta_soci_regola() to authenticated;

create or replace view public.v_cruscotto_completezza
with (security_invoker = true) as
select indicatore, fatti, totale, dove from (
  values
    ('Lemmi con la voce agganciata'::text,
     (select count(*) from dizionario_lemma where stato = 'pubblicato' and audio_id is not null),
     (select count(*) from dizionario_lemma where stato = 'pubblicato'),
     '/glossario'::text),
    ('Luoghi con il nome ladino validato'::text,
     (select count(*) from luoghi_interesse where toponimo_validato_il is not null),
     (select count(*) from luoghi_interesse where stato = 'pubblicato'),
     '/mappa'::text),
    ('Soci in regola collegati a un account'::text,
     (select fatti from cruscotto_conta_soci_regola()),
     (select totale from cruscotto_conta_soci_regola()),
     '/admin-soci'::text),
    ('Sepolture con data di morte'::text,
     (select count(*) from memoria_persona where data_morte is not null),
     (select count(*) from memoria_persona),
     '/cimiteri-di-guerra'::text),
    ('Sigle di reparto sciolte'::text,
     (select count(*) from memoria_reparto where certezza <> 'da_verificare'),
     (select count(*) from memoria_reparto),
     '/cimiteri-di-guerra/male'::text)
) t(indicatore, fatti, totale, dove);

grant select on public.v_cruscotto_completezza to authenticated;
revoke select on public.v_cruscotto_completezza from anon;
