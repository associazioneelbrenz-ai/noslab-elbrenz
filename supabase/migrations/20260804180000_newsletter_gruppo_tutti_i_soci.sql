-- 20260804180000 — il quarto gruppo: TUTTI i soci, non solo quelli in regola
--
-- PERCHE'. I gruppi erano tre e nessuno raggiungeva i ventuno soci ammessi che
-- non sono in regola con la quota. Per una convocazione d'assemblea e' un
-- guaio serio: la convocazione va a TUTTI gli associati, non ai soli in regola,
-- e ventuno persone non l'avrebbero ricevuta senza che nessuno se ne accorgesse.
--
-- E `tutti` CAMBIA SIGNIFICATO, di proposito. Prima valeva «soci in regola piu'
-- iscritti confermati», cioe' nove persone su trenta: un gruppo che si chiama
-- «tutti» e ne esclude ventuno e' esattamente il genere di trappola che sembra
-- giusta finche' non fa danno. Adesso `tutti` e' l'unione di soci_tutti e degli
-- iscritti confermati non soci.
--
-- RESTANO DUE GRUPPI DI SOCI, e servono entrambi:
--   soci_tutti      -> comunicazioni sociali che spettano a ogni associato:
--                      convocazioni, verbali, notizie dell'Associazione.
--   soci_in_regola  -> lo statuto del 2014 dice che «l'esercizio dei diritti
--                      sociali spetta ai soci in regola con il versamento della
--                      quota». Quando una comunicazione riguarda un diritto che
--                      solo loro esercitano, il gruppo giusto e' questo.
-- Non e' una ridondanza: e' la differenza fra essere socio e poter votare.
--
-- CHI RESTA FUORI DA ENTRAMBI: i cessati. Un socio che se n'e' andato non
-- riceve le comunicazioni sociali, e la sua riga resta nel libro degli
-- associati con le sue date.

alter table public.newsletter drop constraint if exists newsletter_gruppo_valido;
alter table public.newsletter add constraint newsletter_gruppo_valido
  check (gruppo is null or gruppo in ('tutti','soci_tutti','soci_in_regola','non_soci'));

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
  select distinct lower(v.email) as email, v.nome
  from public.v_soci_in_regola v
  join public.domande_tesseramento d on d.id = v.domanda_id
  where v.stato = 'approvata'
    and v.posizione <> 'account_di_sistema'
    and d.stato_socio is distinct from 'cessato'
    and v.email is not null and btrim(v.email) <> ''
),
soci_regola as (
  select distinct lower(v.email) as email, v.nome
  from public.v_soci_in_regola v
  join public.domande_tesseramento d on d.id = v.domanda_id
  where v.posizione in ('in_regola','in_regola_per_deroga')
    and d.stato_socio is distinct from 'cessato'
    and v.email is not null and btrim(v.email) <> ''
),
confermati as (
  select lower(i.email) as email, i.nome
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
