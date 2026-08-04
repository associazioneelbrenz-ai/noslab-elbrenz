-- 20260804190000 — il passaggio d'anno
--
-- IL 31 DICEMBRE SCADONO TUTTE LE TESSERE INSIEME, perche' valgono per anno
-- solare. Il 1 gennaio l'Associazione si sveglia con trenta persone da
-- rinnovare, e oggi non esiste nessun meccanismo.
--
-- IL GUAIO DI FONDO, che si vede solo guardando la vista. `v_soci_in_regola`
-- usa l'anno della DOMANDA e somma TUTTI i pagamenti di quella domanda, senza
-- guardare a che anno si riferiscono. Il 1 gennaio 2027 quindi:
--   - la quota dovuta resterebbe quella del 2026,
--   - i versamenti del 2026 continuerebbero a contare,
--   - e tutti risulterebbero in regola per sempre.
-- Non e' un difetto della vista: e' che la vista risponde a «com'e' andato
-- l'anno di ammissione», che era la domanda giusta finche' di anni ce n'era
-- uno solo. Adesso la domanda e' un'altra e vuole una funzione sua.
--
-- LO STATUTO NON E' UN DETTAGLIO (testo 2014):
--   - la qualita' di socio si perde per mancato pagamento, ma il TERMINE lo
--     delibera il Consiglio Direttivo. Nessuna decadenza automatica scritta
--     nel codice: sarebbe il codice a espellere un socio, e non ne ha il
--     potere. Qui si REGISTRA una decisione presa altrove.
--   - il recesso ha effetto dal SECONDO MESE SUCCESSIVO a quello in cui il
--     Consiglio riceve la comunicazione. Non e' immediato, e il registro deve
--     dirlo.
--   - «l'esercizio dei diritti sociali spetta ai soci in regola con il
--     versamento della quota»: l'elenco di chi e' in regola non e' un
--     abbellimento gestionale, e' l'elenco di chi VOTA in assemblea.

-- =========================================================================
-- 1. LA TESSERA DELL'ANNO
-- =========================================================================
--
-- Il NUMERO di tessera resta quello per sempre (decisione di Cristian, 4/8) e
-- percio' continua a vivere sulla domanda, uno per persona. Cio' che cambia
-- ogni anno e' il CODICE, che porta l'anno e serve alla verifica pubblica.
create table if not exists public.tesseramento_anno (
  id              uuid primary key default gen_random_uuid(),
  domanda_id      uuid not null references public.domande_tesseramento(id) on delete cascade,
  anno            integer not null,
  codice_tessera  text unique,
  emessa_il       timestamptz,
  inviata_il      timestamptz,
  creata_il       timestamptz not null default now(),
  constraint tesseramento_anno_unico unique (domanda_id, anno),
  constraint tesseramento_anno_plausibile check (anno between 2009 and 2100)
);

comment on table public.tesseramento_anno is
 'La tessera di UN anno per UN socio. Il NUMERO di tessera non sta qui: resta sulla domanda perche'' e'' stabile per sempre. Qui sta cio'' che cambia ogni anno, cioe'' il codice della tessera e le date di emissione e invio.';

create index if not exists idx_tesseramento_anno_anno on public.tesseramento_anno(anno);
alter table public.tesseramento_anno enable row level security;
revoke all on public.tesseramento_anno from anon, authenticated;

-- =========================================================================
-- 2. LE DEROGHE, anno per anno
-- =========================================================================
--
-- `domande_tesseramento.deroga_pagamento_motivo` vale per l'anno di ammissione
-- e resta dov'e': non si tocca cio' che funziona. Ma una deroga per il 2027 e'
-- un'altra decisione, presa in un'altra riunione, e vuole una riga sua con
-- scritto chi l'ha decisa.
create table if not exists public.deroga_quota (
  id             uuid primary key default gen_random_uuid(),
  domanda_id     uuid not null references public.domande_tesseramento(id) on delete cascade,
  anno           integer not null,
  motivo         text not null,
  deliberata_da  uuid,
  deliberata_il  timestamptz not null default now(),
  constraint deroga_quota_unica unique (domanda_id, anno),
  constraint deroga_quota_motivo_non_vuoto check (btrim(motivo) <> '')
);

comment on table public.deroga_quota is
 'Deroga al versamento della quota per UN anno, con il motivo scritto e chi l''ha deliberata. Serve al RUNTS per spiegare come mai un socio risulta in regola senza versamento.';

alter table public.deroga_quota enable row level security;
revoke all on public.deroga_quota from anon, authenticated;

-- =========================================================================
-- 3. LA CESSAZIONE: chi l'ha decisa, e quando ha effetto
-- =========================================================================
alter table public.domande_tesseramento
  add column if not exists cessazione_deliberata_da uuid,
  add column if not exists cessazione_deliberata_il timestamptz,
  -- Per il recesso serve la data in cui il Consiglio ha RICEVUTO la
  -- comunicazione: e' da quella che si contano i due mesi, non dalla data in
  -- cui qualcuno la registra a sistema.
  add column if not exists recesso_comunicato_il date;

comment on column public.domande_tesseramento.recesso_comunicato_il is
 'Data in cui il Consiglio ha ricevuto la comunicazione di recesso. Lo statuto 2014 fa decorrere il recesso dal SECONDO mese successivo a questa data: vedi recesso_efficace_dal().';

-- Il conto dei due mesi, scritto una volta sola perche' nessuno lo rifaccia a
-- mente. Comunicazione il 10 marzo -> effetto dal 1 maggio.
create or replace function public.recesso_efficace_dal(p_comunicato date)
returns date
language sql
immutable
as $$
  select case when p_comunicato is null then null
    else (date_trunc('month', p_comunicato::timestamp) + interval '2 months')::date
  end;
$$;

comment on function public.recesso_efficace_dal(date) is
 'Statuto 2014: il recesso ha effetto dal secondo mese successivo a quello in cui il Consiglio riceve la comunicazione. Comunicazione il 10 marzo, effetto dal 1 maggio.';

-- =========================================================================
-- 4. LA POSIZIONE DI UN SOCIO IN UN ANNO QUALSIASI
-- =========================================================================
--
-- E' la funzione che mancava. A differenza della vista guarda SOLO i pagamenti
-- riferiti a quell'anno, e la quota di quell'anno.
create or replace function public.soci_al_anno(p_anno integer)
returns table (
  domanda_id      uuid,
  nome            text,
  cognome         text,
  email           text,
  numero_tessera  integer,
  anno_ammissione integer,
  approvata_il    timestamptz,
  quota_dovuta    numeric,
  versato         numeric,
  manca           numeric,
  in_deroga       boolean,
  deroga_motivo   text,
  cessato         boolean,
  cessazione_data date,
  posizione       text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select d.id, d.nome, d.cognome, d.email, d.numero_tessera, d.anno, d.approvata_il,
           d.deroga_pagamento_motivo, d.approvata_da,
           d.stato_socio, d.cessazione_data, d.recesso_comunicato_il
    from public.domande_tesseramento d
    where d.stato = 'approvata'
      and coalesce(d.numero_tessera, -1) <> 0        -- via l'account di servizio
  ),
  versamenti as (
    select pt.domanda_id, sum(pt.importo) as versato
    from public.pagamenti_tesseramento pt
    where pt.stato = 'completato'
      and pt.tipo in ('quota','integrazione')
      and pt.annullato_il is null
      and pt.anno = p_anno                            -- SOLO l'anno chiesto
    group by pt.domanda_id
  ),
  deroghe as (
    select dq.domanda_id, dq.motivo from public.deroga_quota dq where dq.anno = p_anno
  )
  select
    b.id, b.nome, b.cognome, b.email, b.numero_tessera, b.anno, b.approvata_il,
    public.quota_anno(p_anno) as quota_dovuta,
    coalesce(v.versato, 0) as versato,
    greatest(public.quota_anno(p_anno) - coalesce(v.versato, 0), 0) as manca,
    (dg.motivo is not null
      or (b.anno = p_anno and b.deroga_pagamento_motivo is not null and btrim(b.deroga_pagamento_motivo) <> '')) as in_deroga,
    coalesce(dg.motivo, case when b.anno = p_anno then b.deroga_pagamento_motivo end) as deroga_motivo,
    -- Cessato PER QUELL'ANNO: una cessazione del 2028 non toglie il diritto di
    -- voto nell'assemblea del 2027.
    (b.stato_socio = 'cessato' and coalesce(extract(year from b.cessazione_data)::int, p_anno) <= p_anno) as cessato,
    b.cessazione_data,
    case
      when b.stato_socio = 'cessato' and coalesce(extract(year from b.cessazione_data)::int, p_anno) <= p_anno then 'cessato'
      when dg.motivo is not null then 'in_regola_per_deroga'
      when b.anno = p_anno and b.deroga_pagamento_motivo is not null and btrim(b.deroga_pagamento_motivo) <> '' then 'in_regola_per_deroga'
      when coalesce(v.versato, 0) >= public.quota_anno(p_anno) then 'in_regola'
      when coalesce(v.versato, 0) > 0 then 'parziale'
      -- I tredici del registro cartaceo: vale solo per il loro anno di
      -- ammissione. Dall'anno dopo sono soci come tutti gli altri.
      when b.anno = p_anno and b.approvata_da = 'Import registro segretario 07/07/2026' then 'da_regolarizzare'
      when p_anno > b.anno then 'da_rinnovare'
      else 'ammesso_senza_incasso'
    end as posizione
  from base b
  left join versamenti v on v.domanda_id = b.id
  left join deroghe dg on dg.domanda_id = b.id
  where b.anno <= p_anno;                              -- non era ancora socio
$$;

comment on function public.soci_al_anno(integer) is
 'La posizione di ogni socio per UN anno preciso: guarda solo i versamenti riferiti a quell''anno e la quota di quell''anno. E'' la funzione che permette il passaggio d''anno, che v_soci_in_regola da sola non vede perche'' e'' legata all''anno della domanda.';

revoke execute on function public.soci_al_anno(integer) from anon, authenticated, public;

-- =========================================================================
-- 5. GLI AVENTI DIRITTO AL VOTO
-- =========================================================================
--
-- Statuto 2014: «l'esercizio dei diritti sociali spetta ai soci regolarmente
-- iscritti e in regola con il versamento della quota». Questo elenco e' il
-- documento che si porta in assemblea, e dice anche chi NON vota e perche',
-- perche' un elenco che nasconde le esclusioni non regge una contestazione.
create or replace function public.aventi_diritto_voto(p_anno integer)
returns table (
  domanda_id     uuid,
  nome           text,
  cognome        text,
  numero_tessera integer,
  posizione      text,
  vota           boolean,
  perche         text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.domanda_id, s.nome, s.cognome, s.numero_tessera, s.posizione,
         s.posizione in ('in_regola','in_regola_per_deroga') as vota,
         case s.posizione
           when 'in_regola' then 'quota ' || p_anno || ' versata'
           when 'in_regola_per_deroga' then 'in regola per deroga deliberata: ' || coalesce(s.deroga_motivo, 'motivo non registrato')
           when 'parziale' then 'versamento parziale: mancano ' || to_char(s.manca, 'FM999990.00') || ' euro'
           when 'da_rinnovare' then 'quota ' || p_anno || ' non ancora versata'
           when 'da_regolarizzare' then 'quota versata prima del sistema informatico, registrazione da completare'
           when 'cessato' then 'socio cessato il ' || coalesce(to_char(s.cessazione_data, 'DD/MM/YYYY'), 'data non registrata')
           else 'quota non pervenuta'
         end as perche
  from public.soci_al_anno(p_anno) s
  order by s.numero_tessera nulls last, s.nome;
$$;

comment on function public.aventi_diritto_voto(integer) is
 'Elenco da portare in assemblea: chi vota, chi no, e perche''. Statuto 2014: votano i soci in regola con il versamento della quota.';

revoke execute on function public.aventi_diritto_voto(integer) from anon, authenticated, public;

-- =========================================================================
-- 6. I SOLLECITI DI RINNOVO NON PARTONO PRIMA DEL 1 GENNAIO
-- =========================================================================
--
-- Non e' una regola tecnica, e' una regola di educazione: chiedere a novembre
-- la quota dell'anno dopo e' il modo piu' rapido per far sentire una persona
-- un abbonamento invece che un socio.
--
-- E' scritta come funzione perche' una regola scritta solo in un commento e'
-- una regola che qualcuno, prima o poi, non legge.
create or replace function public.rinnovo_sollecitabile(p_anno integer)
returns boolean
language sql
stable
as $$
  select (now() at time zone 'Europe/Rome')::date >= make_date(p_anno, 1, 1);
$$;

comment on function public.rinnovo_sollecitabile(integer) is
 'False finche'' non e'' cominciato l''anno di cui si chiede la quota. I solleciti di rinnovo partono DOPO il 31 dicembre, mai prima.';
