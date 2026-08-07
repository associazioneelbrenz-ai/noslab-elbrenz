-- [7/8/2026] La plancia impara a guardare anche le LETTURE non dichiarate.
-- I cinque controlli esistenti non si toccano: si aggiunge il sesto.
--
-- Perche' e' separato da quello delle scritture e con un tono diverso: una
-- scrittura anonima e' sempre un difetto, una lettura nuova e' una domanda.
-- Quando nasce una tabella eredita la lettura pubblica dai privilegi
-- predefiniti, e qualcuno deve decidere se il pubblico debba vederla. Il
-- controllo porta la decisione in superficie invece di prenderla al posto nostro.
create or replace function public.plancia_integrita()
returns table(chiave text, etichetta text, quanti integer, dettaglio text)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;

  -- 1) Permessi di scrittura riaperti al ruolo anonimo.
  return query
  select 'permessi_anon'::text, 'Permessi di scrittura aperti al pubblico'::text,
         count(*)::int,
         coalesce(string_agg(g.table_name || ' (' || g.privilege_type || ')', ', '), '')
  from information_schema.role_table_grants g
  where g.grantee='anon' and g.table_schema='public'
    and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  having count(*) > 0;

  -- 2) Soci con numero duplicato: in un libro sociale il numero e' l'identita'.
  return query
  select 'numeri_socio_doppi', 'Numeri di socio duplicati', count(*)::int,
         coalesce(string_agg(x.numero_socio::text, ', '), '')
  from (select numero_socio from domande_tesseramento
         where numero_socio is not null group by numero_socio having count(*) > 1) x
  having count(*) > 0;

  -- 3) Schede del museo che citano immagini non presenti nell'archivio: e' il
  -- controllo che l'audit esterno non poteva fare, e che avrebbe visto il mese
  -- in cui le fotografie dei soci si perdevano in silenzio.
  return query
  select 'immagini_mancanti', 'Pezzi del museo con immagini assenti', count(*)::int,
         coalesce(string_agg(p.titolo, '; '), '')
  from museo_gg_pezzo p
  where p.stato = 'pubblicato'
    and exists (
      select 1 from unnest(p.immagini_urls) u
      where u like '%/assets-pubblici/%'
        and not exists (
          select 1 from storage.objects o
          where o.bucket_id = 'assets-pubblici'
            and u like '%' || o.name)
    )
  having count(*) > 0;

  -- 4) Lemmi pubblicati senza contributore: si perde chi ringraziare.
  return query
  select 'lemmi_orfani', 'Lemmi senza contributore', count(*)::int, ''
  from dizionario_lemma
  where stato='pubblicato' and contributore_id is null
  having count(*) > 0;

  -- 5) Pagamenti scollegati da una domanda: un euro senza una persona.
  return query
  select 'pagamenti_orfani', 'Pagamenti senza domanda collegata', count(*)::int, ''
  from pagamenti_tesseramento
  where domanda_id is null and annullato_il is null and stato='completato'
  having count(*) > 0;

  -- 6) Tabelle leggibili dal pubblico su cui nessuno ha deciso niente.
  return query
  select 'letture_anon_nuove', 'Tabelle leggibili dal pubblico non dichiarate', count(*)::int,
         coalesce(string_agg(g.table_name, ', '), '')
  from information_schema.role_table_grants g
  where g.grantee='anon' and g.table_schema='public' and g.privilege_type='SELECT'
    and not exists (select 1 from permesso_anon_lettura_attesa a where a.tabella = g.table_name)
  having count(*) > 0;
end;
$function$;
