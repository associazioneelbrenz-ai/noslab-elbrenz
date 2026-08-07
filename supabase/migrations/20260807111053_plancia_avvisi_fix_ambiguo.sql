-- Il nome della colonna in uscita `chiave` collideva con config_app.chiave:
-- si qualifica la tabella. (Le variabili si leggono in un blocco a parte, cosi
-- il corpo resta leggibile.)
create or replace function public.plancia_avvisi()
returns table (
  chiave text, etichetta text, gruppo text,
  quanti integer, giorni integer, livello text, destinazione text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ritardo int; v_pag int;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;

  select coalesce((c.valore#>>'{}')::int, 3) into v_ritardo
    from config_app c where c.chiave = 'plancia_giorni_ritardo';
  select coalesce((c.valore#>>'{}')::int, 7) into v_pag
    from config_app c where c.chiave = 'plancia_giorni_pagamento';
  v_ritardo := coalesce(v_ritardo, 3); v_pag := coalesce(v_pag, 7);

  return query
  with code as (
    select 'lemmi'::text k, 'Lemmi da validare'::text e, 'curatela'::text g,
           count(*)::int n, coalesce(max(extract(day from now()-created_at))::int,0) d,
           'https://elbrenz.eu/guardiani-curatela'::text u
      from dizionario_lemma where stato='in_revisione'
    union all
    select 'eventi', 'Eventi da curare', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0),
           'https://elbrenz.eu/radar-eventi'
      from eventi_esterni where stato in ('proposto','da_valutare','in_attesa')
    union all
    select 'storie', 'Storie da promuovere', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/storie'
      from storia where stato='pubblicata' and coalesce(pubblica,false)=false
    union all
    select 'museo_proposte', 'Proposte per il Museo', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/museo-curatela'
      from museo_gg_proposta where stato='nuova'
    union all
    select 'donazioni', 'Donazioni di materiale', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/museo-curatela'
      from donazione_materiale where stato='in_attesa'
    union all
    select 'domande', 'Domande di tesseramento', 'soci', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/amministrazione'
      from domande_tesseramento where stato='in_attesa'
    union all
    select 'convenzioni', 'Proposte di convenzione', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0),
           'https://elbrenz.eu/convenzioni-curatela'
      from convenzioni where stato='proposta'
    union all
    select 'pagamenti_verifica', 'Pagamenti da riscontrare', 'denaro', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/amministrazione'
      from pagamenti_tesseramento where stato='in_verifica' and annullato_il is null
    union all
    select 'senza_incasso', 'Soci ammessi senza incasso', 'denaro',
           (select count(*)::int from v_soci_in_regola where posizione='ammesso_senza_incasso'),
           0, '/app/amministrazione'
    union all
    select 'contanti_non_consegnati', 'Contanti non consegnati al tesoriere', 'denaro',
           count(*)::int, coalesce(max(extract(day from now()-incassato_il))::int,0), '/app/contanti'
      from pagamenti_tesseramento
      where metodo='contanti' and stato='completato' and annullato_il is null
        and coalesce(consegnato_tesoriere,false)=false
    union all
    select 'email_ferme', 'Email preparate e mai partite', 'rotto', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/amministrazione'
      from email_outbox where stato <> 'inviata'
    union all
    select 'push_fallite', 'Notifiche non consegnate', 'rotto', count(*)::int,
           coalesce(max(extract(day from now()-quando))::int,0), '/app/notifiche'
      from notifica_consegna where esito='fallita' and quando > now() - interval '14 days'
  )
  select c.k, c.e, c.g, c.n, c.d,
         case
           when c.g = 'rotto' then 'rotto'
           when c.k = 'pagamenti_verifica' and c.d >= v_pag then 'in_ritardo'
           when c.g <> 'denaro' and c.d >= v_ritardo then 'in_ritardo'
           else 'da_fare'
         end,
         c.u
  from code c
  where c.n > 0
  order by case when c.g='rotto' then 0 when c.d >= v_ritardo then 1 else 2 end, c.d desc, c.n desc;
end;
$$;

grant execute on function public.plancia_avvisi() to authenticated;;
