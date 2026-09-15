-- Ondata 2 dell'audit del 13 settembre 2026 (AUDIT_2026-09-13.md), voce DB-04.
-- Reversibile, nessun dato toccato. Solo grant di colonna sul ruolo `anon`.
--
-- IL PROBLEMA. La tabella `eventi_esterni` (radar degli eventi) ha una policy
-- di lettura per anon e authenticated sulle righe pubblicate
-- (`eventi_esterni_read_pubblicati`, qual: stato = 'pubblicato'), e il ruolo
-- `anon` aveva SELECT su TUTTE le 30 colonne (verificato il 15/9/2026 su
-- information_schema.column_privileges). Il sito legge il radar dalla vista
-- `eventi_esterni_pubblici` (security_invoker=on, 17 colonne), che esclude di
-- proposito le colonne di lavorazione: `note_curatore`, `contatti`,
-- `punteggio`, `motivo_punteggio`, `flag`, `curato_da`, `curato_il`,
-- `hash_dedup`, `fonte_id`, `search_vector`, `created_at`, `updated_at`,
-- `stato`. Ma la tabella resta raggiungibile da PostgREST con la chiave anon:
-- bastava chiederla per nome per leggere le annotazioni interne dei curatori
-- e i recapiti degli organizzatori di ogni evento pubblicato.
--
-- CHI LEGGE COSA (grep del 15/9/2026 in src/ e supabase/functions/):
--   - src/pages/index.astro, eventi.astro, eventi/[slug].astro leggono SOLO
--     la vista `eventi_esterni_pubblici` (ruolo anon, build/SSR).
--   - src/pages/radar-eventi.astro (console curatori) legge la TABELLA con
--     `select('*')`, ma con la sessione dell'utente: ruolo `authenticated`,
--     filtrato dalla policy `eventi_esterni_read_curatori` (livello >= 20).
--   - Le edge radar-eventi-harvest / -classifica / -azione usano il service
--     role, che non passa dai grant di colonna.
--   - Le funzioni che toccano la tabella (cerca_archivio, sentinella_pagine,
--     lancia_radar_classifica, controlla_radar_eventi, plancia_avvisi) sono
--     SECURITY DEFINER; eventi_esterni_slug_auto è un trigger. Nessuna dipende
--     dai grant di anon.
--
-- PERCHÉ LA VISTA HA BISOGNO DI `stato`. La vista è security_invoker: la sua
-- query gira con i privilegi di chi la interroga, e il `where stato =
-- 'pubblicato'` richiede SELECT sulla colonna `stato`. Per questo `stato`
-- resta concessa ad anon anche se non compare fra le colonne della vista.
-- Le policy RLS invece non hanno bisogno di grant di colonna.
--
-- COSA CAMBIA. `anon` passa da 30 a 18 colonne: le 17 della vista più `stato`.
-- `authenticated` NON viene toccato: la console legge le colonne riservate con
-- quel ruolo e la RLS (livello >= 20 per le righe non pubblicate) filtra già.
-- Resta però vero che un qualunque account autenticato, anche ospite, legge
-- le 30 colonne delle righe pubblicate (policy `eventi_esterni_read_pubblicati`
-- vale anche per authenticated): fuori dal perimetro di questa voce, segnalato
-- nel report.
--
-- COLONNE PUBBLICHE (dalla definizione della vista, pg_views, 15/9/2026):
--   id, titolo, descrizione, data_inizio, data_fine, ricorrenza, ora_inizio,
--   ora_fine, luogo, comune, valle, organizzatore, url_fonte, prezzo,
--   pilastro, fonte, slug   (+ stato per il where della vista)
--
-- RITORNO INDIETRO: `grant select on public.eventi_esterni to anon;`

revoke select on public.eventi_esterni from anon;

grant select (
  id,
  titolo,
  descrizione,
  data_inizio,
  data_fine,
  ricorrenza,
  ora_inizio,
  ora_fine,
  luogo,
  comune,
  valle,
  organizzatore,
  url_fonte,
  prezzo,
  pilastro,
  fonte,
  slug,
  stato
) on public.eventi_esterni to anon;

-- La vista resta concessa com'è (anon e authenticated hanno già SELECT su
-- eventi_esterni_pubblici, verificato su role_table_grants): nessun cambiamento.
