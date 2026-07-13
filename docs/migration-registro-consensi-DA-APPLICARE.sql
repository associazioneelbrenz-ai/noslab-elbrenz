-- Registro dei consensi (B.7) — migration ADDITIVA, non distruttiva.
--
-- STATO: DA APPLICARE al DB (project wacknihvdjxltiqvxtqr) da Cristian.
-- Disciplina repo: le migration in supabase/migrations/ sono gia applicate;
-- questa resta in docs/ finche non eseguita. Dopo l'applicazione, spostarla in
-- supabase/migrations/ con timestamp.
--
-- CONTESTO: la versione dell'informativa e' GIA' registrata LIVE (via jsonb di
-- provenienza) per i due flussi newsletter: download_lead.sorgente e
-- guardiani_contributori.sorgente_utm portano {informativa_versione:'2026-07-13'}
-- da edge (commit del 13/7). Questa migration copre le tabelle SENZA jsonb.
--
-- Cosa fa:
--   1) persiste il consenso privacy del tesseramento come colonna strutturata
--      (oggi validato server-side ma non salvato);
--   2) registra la versione dell'informativa su tesseramento, gita e convenzioni
--      (default = data dell'informativa vigente, 13/7/2026).

begin;

-- 1) tesseramento: consenso a registro (oggi validato ma non persistito)
alter table public.domande_tesseramento
  add column if not exists consenso_privacy boolean not null default false;

-- 2) versione informativa sulle tabelle SENZA jsonb di provenienza
alter table public.domande_tesseramento
  add column if not exists informativa_versione text not null default '2026-07-13';
alter table public.iscrizioni_gita
  add column if not exists informativa_versione text not null default '2026-07-13';
alter table public.convenzioni
  add column if not exists informativa_versione text not null default '2026-07-13';

commit;

-- DOPO l'applicazione (follow-up di Code, ~15 min):
--   * contact-form: scrivere `consenso_privacy: true` nell'insert su
--     domande_tesseramento (altrimenti tutte le righe restano false di default).
--   * aggiornare il default di informativa_versione (o wirare le edge con la
--     costante INFORMATIVA_VERSIONE) alla PROSSIMA revisione dell'informativa,
--     per non registrare una versione stantia.
--
-- NOTA sportello: la tabella delle richieste dello Sportello non e' nel repo
-- (migration vuota). Verificare in dashboard che registri il consenso e, se
-- del caso, aggiungere qui le stesse colonne.
