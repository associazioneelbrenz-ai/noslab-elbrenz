-- 20260803213000 — v_soci_in_regola: distinguere «approvato» da «in regola»
--
-- Finora le due cose coincidevano, e non coincidono. Una domanda approvata dice
-- che il Direttivo ha ammesso la persona; «in regola per il 2026» dice che la
-- quota di quell'anno e' stata incassata. Il 3 agosto la differenza e' costata
-- due tessere emesse senza versamento, e al RUNTS il libro soci va esibito con
-- la seconda risposta, non con la prima.
--
-- Non e' un rapporto: e' una lettura. Nessun numero cablato, nessuna riga
-- riscritta, nessun giudizio. Chi legge decide.
--
-- La condizione di «incassata» e' la STESSA che applica il trigger
-- blocca_approvazione_senza_incasso: pagamento completato, di tipo quota o
-- integrazione, agganciato alla domanda. Se le due divergessero, la pagina e il
-- database direbbero cose diverse sulla stessa persona, ed e' esattamente il
-- guaio da cui veniamo.

create or replace view public.v_soci_in_regola as
select
  d.id                        as domanda_id,
  d.nome,
  d.email,
  d.anno,
  d.numero_tessera,
  d.codice_tessera,
  d.stato,
  d.approvata_il,
  d.tessera_inviata,
  d.metodo_scelto,
  d.deroga_pagamento_motivo,

  -- Quanto risulta incassato per questa domanda, e come.
  coalesce(p.totale_incassato, 0)                       as totale_incassato,
  p.ultimo_incasso_il,
  p.metodi_incasso,
  coalesce(p.pagamenti_completati, 0)                   as pagamenti_completati,
  -- Tentativi che NON sono andati a buon fine: dicono che la persona ci ha
  -- provato, ed e' un'informazione diversa dal non aver fatto nulla.
  coalesce(t.tentativi_non_riusciti, 0)                 as tentativi_non_riusciti,

  (coalesce(p.pagamenti_completati, 0) > 0)             as quota_incassata,
  (d.deroga_pagamento_motivo is not null
     and btrim(d.deroga_pagamento_motivo) <> '')        as in_deroga,

  -- La colonna che serve davvero, in tre parole invece che in tre condizioni.
  case
    when d.stato <> 'approvata'                         then 'non_ammesso'
    when coalesce(p.pagamenti_completati, 0) > 0        then 'in_regola'
    when d.deroga_pagamento_motivo is not null
     and btrim(d.deroga_pagamento_motivo) <> ''         then 'in_regola_per_deroga'
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
    and pt.stato <> 'completato'
) t on true;

comment on view public.v_soci_in_regola is
 'Libro soci leggibile: unisce la domanda approvata alla quota effettivamente incassata per l''anno, ed esplicita i casi in deroga. La colonna posizione vale non_ammesso, in_regola, in_regola_per_deroga oppure ammesso_senza_incasso.';

-- Riservata: contiene nome, email e posizione contributiva di persone fisiche.
-- create or replace view azzera le grant, quindi la revoca va ripetuta ogni
-- volta che la vista si ridefinisce (lezione gia' pagata altrove).
revoke all on public.v_soci_in_regola from anon, authenticated;
