-- 20260804171000 — chi si puo' contattare per CHIEDERE il consenso
--
-- GIA' APPLICATA in produzione. Qui si versiona.
--
-- Ci sono trentanove indirizzi raccolti negli anni. Nessuno di loro ha mai
-- dato un consenso alla newsletter, perche' il consenso non esisteva come
-- campo. Non si importano e non si iscrivono d'ufficio: si chiede, una volta
-- sola. Chi risponde entra, chi tace resta fuori e non si ricontatta.
--
-- LA PROVENIENZA NON E' UN DI PIU'. La richiesta deve poter dire «abbiamo il
-- tuo indirizzo perche' hai scaricato il libro di Altmayer», e senza questo
-- dato quella frase non si puo' scrivere. Una richiesta di consenso che non sa
-- dire da dove viene l'indirizzo e' esattamente il genere di messaggio per cui
-- arriva una segnalazione al Garante.
--
-- CHI NON C'E' DENTRO: chiunque abbia gia' una riga in newsletter_iscritto, in
-- QUALUNQUE stato. Chi si e' disiscritto non si ricontatta per chiedergli se
-- e' sicuro, chi e' in attesa ha gia' ricevuto la sua richiesta, chi ha
-- confermato c'e' gia'.
create or replace view public.v_newsletter_candidati_consenso as
with fonti as (
  select lower(email) as email, max(nome) as nome, 'materiale scaricato dal sito' as fonte
  from public.download_lead where email is not null group by lower(email)
  union all
  select lower(email), max(nome), 'contributo al glossario dei Guardiani'
  from public.guardiani_contributori where email is not null group by lower(email)
  union all
  select lower(email), max(nome), 'iscrizione alla gita sociale'
  from public.iscrizioni_gita where email is not null group by lower(email)
  union all
  select lower(email), max(nome), 'domanda di adesione'
  from public.domande_tesseramento where email is not null group by lower(email)
)
select
  f.email,
  max(f.nome) as nome,
  array_agg(distinct f.fonte order by f.fonte) as fonti,
  exists (
    select 1 from public.v_soci_in_regola v
    where lower(v.email) = f.email and v.stato = 'approvata'
  ) as e_socio
from fonti f
where f.email not in (select lower(email) from public.newsletter_iscritto)
  and f.email not like '%esempio-invalido.test'
group by f.email;

comment on view public.v_newsletter_candidati_consenso is
 'Indirizzi noti all''Associazione che non hanno ancora una riga in newsletter_iscritto, con la PROVENIENZA di ciascuno. Serve alla richiesta di consenso una tantum: si chiede, non si presume.';

revoke all on public.v_newsletter_candidati_consenso from anon, authenticated;
