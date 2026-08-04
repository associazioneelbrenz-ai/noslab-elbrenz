-- 20260804220000 — la compagine sociale
--
-- GIA' APPLICATA in produzione. Qui si versiona.
--
-- IL CONSIGLIO DIRETTIVO DEVE STABILIRE CHI E' SOCIO, e oggi non puo': non
-- esiste nessuno strumento per registrare una cessazione ne' per estrarre
-- l'elenco degli associati a una data.
--
-- Il registro cartaceo dal 2009 riporta centotto persone come attive e due
-- uscite, per nessuna con una data. Il database ne conosce trenta. Chi si e'
-- iscritto nel 2011 e non versa la quota dal 2013 risulta formalmente socio
-- ancora oggi.
--
-- Non e' un'irregolarita' davanti a un ufficio, perche' l'Associazione non e'
-- ancora iscritta al RUNTS. Ma riguarda una cosa immediata: A CHI VA MANDATA
-- LA CONVOCAZIONE. Un socio che non riceve l'avviso e scopre poi che si e'
-- deliberato puo' contestare, e la seconda convocazione non protegge da
-- questo: sana il numero dei presenti, non la mancata convocazione di chi ne
-- aveva diritto.
alter table public.domande_tesseramento
  add column if not exists cessazione_delibera text;

comment on column public.domande_tesseramento.cessazione_delibera is
 'Riferimento alla delibera del Consiglio che ha deciso la cessazione (es. «CD 3/2026 del 12 settembre»). Il sistema puo'' PROPORRE chi non ha versato, mai decidere: espellere un socio e'' un atto del Consiglio e un programma non ne ha il potere.';

-- L'ELENCO A UNA DATA. Due usi diversi, entrambi necessari, che si stampano
-- insieme:
--   CONVOCATI      = tutti gli associati non cessati a quella data, in regola
--                    o no. Chi non e' in regola perde il diritto di VOTO, non
--                    quello di essere CONVOCATO.
--   AVENTI DIRITTO = i soli in regola, perche' lo statuto 2014 riserva a loro
--                    «l'esercizio dei diritti sociali».
-- Il primo dimostra che tutti sono stati chiamati, il secondo stabilisce chi
-- vota.
create or replace function public.associati_alla_data(p_data date)
returns table (
  domanda_id       uuid,
  numero_socio     integer,
  nome             text,
  cognome          text,
  email            text,
  categoria_socio  text,
  approvata_il     timestamptz,
  numero_tessera   integer,
  cessato          boolean,
  cessazione_data  date,
  cessazione_motivo text,
  cessazione_delibera text,
  posizione        text,
  convocato        boolean,
  vota             boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with anno as (select extract(year from p_data)::int as a),
  pos as (
    select s.domanda_id, s.posizione from public.soci_al_anno((select a from anno)) s
  )
  select
    d.id, d.numero_socio, d.nome, d.cognome, lower(d.email), d.categoria_socio,
    d.approvata_il, d.numero_tessera,
    (d.stato_socio = 'cessato' and d.cessazione_data is not null and d.cessazione_data <= p_data) as cessato,
    d.cessazione_data, d.cessazione_motivo, d.cessazione_delibera,
    coalesce(p.posizione, 'ammesso_senza_incasso') as posizione,
    (d.stato_socio is distinct from 'cessato'
      or d.cessazione_data is null or d.cessazione_data > p_data) as convocato,
    ((d.stato_socio is distinct from 'cessato'
      or d.cessazione_data is null or d.cessazione_data > p_data)
     and coalesce(p.posizione, '') in ('in_regola', 'in_regola_per_deroga')) as vota
  from public.domande_tesseramento d
  left join pos p on p.domanda_id = d.id
  where d.stato = 'approvata'
    and coalesce(d.numero_tessera, -1) <> 0
    and (d.approvata_il is null or d.approvata_il::date <= p_data)
  order by d.numero_socio nulls last, d.nome;
$$;

comment on function public.associati_alla_data(date) is
 'La compagine sociale a una data: chi era associato, chi andava convocato e chi aveva diritto di voto. `convocato` non guarda la quota, `vota` si'': lo statuto 2014 riserva ai soci in regola l''esercizio dei diritti sociali, non il diritto di essere convocati.';

revoke execute on function public.associati_alla_data(date) from anon, authenticated, public;

-- CHI IL SISTEMA PUO' PROPORRE, e non decidere. Questa funzione non scrive
-- niente, non cambia nessuno stato, non ha nessun effetto: la decisione e la
-- delibera sono altrove e devono restarci.
create or replace function public.proposta_decadenza(p_anno integer)
returns table (
  domanda_id     uuid,
  numero_socio   integer,
  nome           text,
  email          text,
  ultimo_anno_versato integer,
  anni_senza_versare  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.numero_socio, d.nome, lower(d.email),
         u.ultimo_anno,
         case when u.ultimo_anno is null then null else p_anno - u.ultimo_anno end
  from public.domande_tesseramento d
  left join lateral (
    select max(pt.anno) as ultimo_anno
    from public.pagamenti_tesseramento pt
    where pt.domanda_id = d.id and pt.stato = 'completato'
      and pt.tipo in ('quota','integrazione') and pt.annullato_il is null
  ) u on true
  where d.stato = 'approvata'
    and coalesce(d.numero_tessera, -1) <> 0
    and coalesce(d.stato_socio, 'attivo') <> 'cessato'
    and (u.ultimo_anno is null or u.ultimo_anno < p_anno)
  order by u.ultimo_anno nulls first, d.numero_socio nulls last;
$$;

comment on function public.proposta_decadenza(integer) is
 'PROPONE al Consiglio chi non risulta aver versato per l''anno indicato, e da quanto. Non scrive niente e non decide niente: nessuna cessazione automatica, mai. Espellere un socio e'' un atto del Consiglio.';

revoke execute on function public.proposta_decadenza(integer) from anon, authenticated, public;

-- LA DATA DI PASSAGGIO DI SUPPORTO non sta qui e non sta nel codice: la
-- stabilisce il Consiglio insieme alla delibera sulla compagine, e vive in
-- config_app alla chiave `registro_soci_supporto_digitale`, nella forma
-- {"dal": "AAAA-MM-GG"}. Finche' non c'e', il documento NON porta la dicitura:
-- inventarla, o usare la data di oggi come ripiego, vorrebbe dire far dire a un
-- registro una cosa che nessuno ha deliberato.
