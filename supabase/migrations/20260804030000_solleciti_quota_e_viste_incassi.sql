-- 20260804030000 — promemoria della quota, e i due modi di guardare i conti
--
-- Tre cose che stanno insieme perche' si reggono a vicenda: il registro dei
-- promemoria, la vista di tutti gli incassi, e la vista che distingue
-- «ammesso» da «in regola».

-- ---------------------------------------------------------------------------
-- 1. REGISTRO DEI PROMEMORIA
-- ---------------------------------------------------------------------------
-- Perche' una tabella e non una colonna sulla domanda: servono la data di
-- OGNI invio, non solo dell'ultimo, e serve poter dire «il secondo promemoria
-- e' gia' partito» senza dedurlo da un conteggio.
--
-- Il vincolo unico su (domanda_id, numero) e' la parte che conta davvero: la
-- riga si scrive PRIMA di spedire, quindi se due esecuzioni del lavoro
-- pianificato si accavallano, la seconda sbatte sul vincolo e salta la persona
-- invece di scriverle due volte nello stesso pomeriggio. Se il registro non si
-- scrive, l'email non parte: meglio un promemoria in ritardo che due insieme.
create table if not exists public.sollecito_quota (
  id           uuid primary key default gen_random_uuid(),
  domanda_id   uuid not null references public.domande_tesseramento(id) on delete cascade,
  email        text not null,
  numero       smallint not null check (numero in (1, 2)),  -- primo a 7 giorni, secondo a 21
  inviato_il   timestamptz not null default now(),
  esito        text not null default 'in_corso'
               check (esito in ('in_corso', 'inviato', 'fallito')),
  dettaglio    text,
  constraint sollecito_quota_una_volta unique (domanda_id, numero)
);

comment on table public.sollecito_quota is
 'Registro dei promemoria della quota inviati al socio. La riga si scrive PRIMA dell''invio: il vincolo unico su (domanda_id, numero) impedisce che due esecuzioni ravvicinate del lavoro pianificato mandino due email alla stessa persona.';

create index if not exists sollecito_quota_domanda_idx on public.sollecito_quota (domanda_id);

alter table public.sollecito_quota enable row level security;
-- Nessuna policy: ci accede solo il service role dalle edge function. Una
-- tabella senza policy e con RLS attiva e' invisibile a chiunque altro, ed e'
-- esattamente quello che serve.

-- ---------------------------------------------------------------------------
-- 2. v_incassi — tutto il denaro, ogni riga a casa sua
-- ---------------------------------------------------------------------------
-- Gli anticipi della gita non stanno piu' fra le quote, e hanno fatto bene ad
-- andarsene: erano lo stesso incasso contato in due tabelle. Ma il rendiconto
-- e la domanda «quanto e' entrato quest'anno» hanno bisogno di vederli
-- insieme. Si uniscono in lettura, senza duplicare una riga.
create or replace view public.v_incassi as
select
  'pagamenti_tesseramento'::text as tabella,
  p.id,
  p.tipo                          as tipo,
  p.nome,
  p.email,
  p.anno,
  p.importo,
  p.stato,
  p.metodo,
  p.capture_id,
  p.created_at                    as quando,
  p.domanda_id,
  null::uuid                      as iscrizione_id
from public.pagamenti_tesseramento p
union all
select
  'iscrizioni_gita'::text,
  g.id,
  'anticipo_gita'::text,
  trim(coalesce(g.nome, '') || ' ' || coalesce(g.cognome, '')),
  g.email,
  extract(year from g.created_at)::int,
  g.importo_anticipo,
  -- Gli stati della gita parlano un'altra lingua: qui si traducono in quella
  -- dei pagamenti, altrimenti sommare le due meta' vorrebbe dire ricordarsi
  -- ogni volta due vocabolari.
  case g.stato
    when 'anticipo_pagato' then 'completato'
    when 'saldo_pagato'    then 'completato'
    when 'annullato'       then 'annullato'
    else 'creato'
  end,
  g.metodo,
  g.paypal_capture_id,
  g.created_at,
  null::uuid,
  g.id
from public.iscrizioni_gita g
where g.paypal_capture_id is not null;

comment on view public.v_incassi is
 'Tutti gli incassi in un posto solo, senza duplicare righe: quote e integrazioni da pagamenti_tesseramento, anticipi delle gite da iscrizioni_gita. La colonna tabella dice da dove viene ciascuna riga. Sola lettura.';

revoke all on public.v_incassi from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. v_soci_in_regola — «ammesso» non vuol dire «in regola»
-- ---------------------------------------------------------------------------
-- Rispetto alla prima versione cambia una cosa sola, ed e' quella che conta:
-- i tredici soci caricati in blocco il 7 luglio dal registro del segretario
-- hanno pagato davvero, manca solo il dato a sistema. Chiamarli morosi
-- metterebbe il segretario nella condizione di sollecitare tredici persone che
-- non devono niente. Adesso hanno una posizione loro, `da_regolarizzare`.
--
-- Il marcatore non e' una data indovinata: e' il testo che il segretario stesso
-- ha lasciato in approvata_da al momento dell'import.
-- create or replace non sa inserire colonne in mezzo: la vista ha un giorno di
-- vita e nessuno la legge ancora, quindi si rifa' da capo invece di appiccicare
-- le colonne nuove in fondo per aggirare il limite.
drop view if exists public.v_soci_in_regola;

create view public.v_soci_in_regola as
select
  d.id                        as domanda_id,
  d.nome,
  d.email,
  d.anno,
  d.numero_tessera,
  d.codice_tessera,
  d.stato,
  d.approvata_il,
  d.approvata_da,
  d.tessera_inviata,
  d.metodo_scelto,
  d.deroga_pagamento_motivo,
  coalesce(p.totale_incassato, 0)                       as totale_incassato,
  p.ultimo_incasso_il,
  p.metodi_incasso,
  coalesce(p.pagamenti_completati, 0)                   as pagamenti_completati,
  coalesce(t.tentativi_non_riusciti, 0)                 as tentativi_non_riusciti,
  coalesce(v.in_verifica, 0)                            as pagamenti_in_verifica,
  (coalesce(p.pagamenti_completati, 0) > 0)             as quota_incassata,
  (d.deroga_pagamento_motivo is not null
     and btrim(d.deroga_pagamento_motivo) <> '')        as in_deroga,
  (d.approvata_da = 'Import registro segretario 07/07/2026') as socio_storico,

  case
    when d.stato <> 'approvata'                         then 'non_ammesso'
    -- L'account di servizio del founder porta la tessera 0 e non e' una
    -- persona da sollecitare: si dice, invece di nasconderlo con un filtro.
    when d.numero_tessera = 0                           then 'account_di_sistema'
    when coalesce(p.pagamenti_completati, 0) > 0        then 'in_regola'
    when d.deroga_pagamento_motivo is not null
     and btrim(d.deroga_pagamento_motivo) <> ''         then 'in_regola_per_deroga'
    when d.approvata_da = 'Import registro segretario 07/07/2026'
                                                        then 'da_regolarizzare'
    else                                                     'ammesso_senza_incasso'
  end                                                   as posizione

from public.domande_tesseramento d
left join lateral (
  select
    count(*)                                  as pagamenti_completati,
    sum(pt.importo)                           as totale_incassato,
    max(pt.created_at)                        as ultimo_incasso_il,
    string_agg(distinct pt.metodo, ', ')      as metodi_incasso
  from public.pagamenti_tesseramento pt
  where pt.domanda_id = d.id
    and pt.stato = 'completato'
    and pt.tipo in ('quota', 'integrazione')
) p on true
left join lateral (
  select count(*) as tentativi_non_riusciti
  from public.pagamenti_tesseramento pt
  where pt.domanda_id = d.id
    and pt.tipo in ('quota', 'integrazione')
    and pt.stato not in ('completato', 'in_verifica')
) t on true
left join lateral (
  select count(*) as in_verifica
  from public.pagamenti_tesseramento pt
  where pt.domanda_id = d.id
    and pt.tipo in ('quota', 'integrazione')
    and pt.stato = 'in_verifica'
) v on true;

comment on view public.v_soci_in_regola is
 'Libro soci leggibile. posizione vale: in_regola, in_regola_per_deroga, da_regolarizzare (i tredici del registro cartaceo: hanno pagato, manca il dato), ammesso_senza_incasso, account_di_sistema, non_ammesso.';

-- create or replace view azzera le grant: la revoca va ripetuta ogni volta.
revoke all on public.v_soci_in_regola from anon, authenticated;
