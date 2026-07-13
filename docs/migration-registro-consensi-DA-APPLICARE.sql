-- Registro dei consensi (B.7) — migration ADDITIVA, non distruttiva.
--
-- STATO: DA APPLICARE al DB (project wacknihvdjxltiqvxtqr) da Cristian.
-- Disciplina repo: le migration in supabase/migrations/ sono gia applicate;
-- questa resta in docs/ finche non eseguita. Dopo l'applicazione, spostarla in
-- supabase/migrations/ con timestamp e collegare le edge (vedi audit B.7).
--
-- Cosa fa:
--   1) persiste il consenso privacy del tesseramento come colonna strutturata;
--   2) registra la versione dell'informativa vigente al momento del consenso
--      sulle tabelle che raccolgono consensi (registro consensi completo).
-- Nessuna riga esistente viene modificata nel contenuto: le colonne nuove
-- prendono i default; i valori reali si scrivono da qui in avanti via edge.

begin;

-- 1) tesseramento: colonna di consenso a registro (oggi validato ma non persistito)
alter table public.domande_tesseramento
  add column if not exists consenso_privacy boolean not null default false;

-- 2) versione dell'informativa privacy vigente al momento del consenso.
--    Default = data dell'informativa pubblicata il 13/7/2026.
alter table public.domande_tesseramento
  add column if not exists informativa_versione text not null default '2026-07-13';
alter table public.download_lead
  add column if not exists informativa_versione text not null default '2026-07-13';
alter table public.guardiani_contributori
  add column if not exists informativa_versione text not null default '2026-07-13';
alter table public.iscrizioni_gita
  add column if not exists informativa_versione text not null default '2026-07-13';
alter table public.convenzioni
  add column if not exists informativa_versione text not null default '2026-07-13';

commit;

-- NOTA sportello: la tabella delle richieste dello Sportello non e' nel repo
-- (migration vuota). Verificare in dashboard che registri il consenso e, se
-- del caso, aggiungere qui le stesse due colonne.
