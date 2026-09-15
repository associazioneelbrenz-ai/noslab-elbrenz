-- [15/9/2026, audit PRIV-05] Registro consensi: museo_gg_proposta era l'unica
-- tabella dei moduli pubblici senza `consenso_privacy` ne' `informativa_versione`.
-- Il consenso era gia' obbligatorio nel modulo (accettazione_privacy validata
-- server-side dalla edge museo-gg-proposta), ma non restava scritto, e non si
-- sapeva quale versione dell'informativa fosse in vigore al momento.
--
-- Da oggi la edge museo-gg-proposta scrive entrambe le colonne a ogni insert:
-- questa migrazione va applicata PRIMA del deploy della edge, altrimenti
-- l'insert fallisce (colonna inesistente) e le proposte del museo si perdono.
--
-- Additiva e idempotente. Le righe gia' presenti restano consenso_privacy=false
-- e informativa_versione null: il consenso c'era (il modulo non passava senza),
-- ma non si inventa a posteriori una data che nessuno ha registrato.
--
-- Le altre tre tabelle toccate da PRIV-05 (domande_tesseramento, iscrizioni_gita,
-- convenzioni) hanno gia' `informativa_versione` (verificato su
-- information_schema.columns il 15/9/2026): per loro cambia solo la edge.

alter table public.museo_gg_proposta
  add column if not exists consenso_privacy boolean not null default false;

alter table public.museo_gg_proposta
  add column if not exists informativa_versione text;

comment on column public.museo_gg_proposta.consenso_privacy is
  'Consenso al trattamento dato nel modulo pubblico (validato server-side dalla edge museo-gg-proposta).';
comment on column public.museo_gg_proposta.informativa_versione is
  'Versione dell''informativa privacy in vigore al momento del consenso (_shared/consenso.ts, INFORMATIVA_VERSIONE).';
