-- 20260804181000 — un indirizzo, una riga
--
-- GIA' APPLICATA in produzione. Qui si versiona.
--
-- Trovato in collaudo subito dopo aver aggiunto il quarto gruppo: i soci
-- risultavano 30 ma gli indirizzi distinti erano 28. `select distinct
-- lower(email), nome` deduplica la COPPIA, non l'indirizzo, e due soci che
-- condividono una casella di famiglia si portavano dietro due righe: la stessa
-- comunicazione due volte nella stessa casella, che al destinatario sembra
-- sciatteria e a Resend sembra spam.
--
-- Si raggruppa per indirizzo e si tiene un nome solo. Il nome scelto e' il
-- primo in ordine alfabetico: arbitrario ma stabile, e meglio di un nome che
-- cambia a ogni invio.

-- Definizione effettivamente applicata: vedi il commento della vista a database.
create or replace view public.v_newsletter_destinatari as
with esclusi as (
  -- La volonta' della persona viene prima del rapporto associativo: chi si e'
  -- disiscritto, chi e' rimbalzato e chi ha un'iscrizione mai confermata non
  -- compare in NESSUN gruppo, socio o no.
  select lower(email) as email
  from public.newsletter_iscritto
  where stato in ('in_attesa','disiscritto','rimbalzato')
),
soci_tutti as (
  -- Tutti gli ammessi: senza l'account di servizio, che non e' una persona, e
  -- senza i cessati. Distinti per indirizzo, perche' due soci possono
  -- condividere una casella di famiglia e non vanno scritti due volte.
  select lower(v.email) as email, min(v.nome) as nome
  from public.v_soci_in_regola v
  join public.domande_tesseramento d on d.id = v.domanda_id
  where v.stato = 'approvata'
    and v.posizione <> 'account_di_sistema'
    and d.stato_socio is distinct from 'cessato'
    and v.email is not null and btrim(v.email) <> ''
),
soci_regola as (
  select lower(v.email) as email, min(v.nome) as nome
  from public.v_soci_in_regola v
  join public.domande_tesseramento d on d.id = v.domanda_id
  where v.posizione in ('in_regola','in_regola_per_deroga')
    and d.stato_socio is distinct from 'cessato'
    and v.email is not null and btrim(v.email) <> ''
),
confermati as (
  select lower(i.email) as email, min(i.nome) as nome
  from public.newsletter_iscritto i
  where i.stato = 'confermato'
)
select 'soci_tutti'::text as gruppo, s.email, s.nome
from soci_tutti s
where s.email not in (select email from esclusi)
union all
select 'soci_in_regola'::text, s.email, s.nome
from soci_regola s
where s.email not in (select email from esclusi)
union all
select 'non_soci'::text, c.email, c.nome
from confermati c
where c.email not in (select email from soci_tutti)
union all
-- «Tutti» resta l'unione dei gruppi che lo compongono, mai una lista a se':
-- cosi' non puo' succedere che qualcuno stia in «tutti» e in nessun altro, o
-- viceversa.
select 'tutti'::text, u.email, u.nome from (
  select s.email, s.nome from soci_tutti s where s.email not in (select email from esclusi)
  union
  select c.email, c.nome from confermati c where c.email not in (select email from soci_tutti)
) u;

comment on view public.v_newsletter_destinatari is
 'I quattro gruppi di destinatari. `soci_tutti` e `soci_in_regola` vengono da v_soci_in_regola (base giuridica: rapporto associativo); il secondo e'' piu'' stretto perche'' lo statuto riserva ai soci in regola l''esercizio dei diritti sociali. `non_soci` viene dai soli iscritti confermati (base: consenso). `tutti` e'' l''unione di soci_tutti e non_soci. Chi e'' in attesa, disiscritto, rimbalzato o cessato non compare da nessuna parte.';

revoke all on public.v_newsletter_destinatari from anon, authenticated;
