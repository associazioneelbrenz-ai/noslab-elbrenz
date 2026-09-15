-- Ondata 2 dell'audit del 13 settembre 2026 (AUDIT_2026-09-13.md), voce DB-07.
-- Reversibile, nessun dato e nessun file toccato. Solo due policy di storage.
--
-- IL PROBLEMA. Nel bucket pubblico `assets-pubblici` le policy di scrittura
-- (INSERT) e di sovrascrittura (UPDATE) chiedevano solo `has_ruolo_min(uid, 25)`
-- senza nessun vincolo sul percorso (pg_policies, schema storage, 15/9/2026):
--
--   assets_pubblici_write_editor_or_admin   INSERT  with_check:
--     ((bucket_id = 'assets-pubblici') AND has_ruolo_min(auth.uid(), 25))
--   assets_pubblici_update_editor_or_admin  UPDATE  qual:
--     ((bucket_id = 'assets-pubblici') AND has_ruolo_min(auth.uid(), 25))
--
-- Un collaboratore di livello 25 poteva quindi caricare o sovrascrivere un
-- file in `tessere/` (i QR e le tessere PDF/PNG dei soci, 43 oggetti) o in
-- `biblioteca/` (il PDF che il modulo download-lead consegna in cambio dei
-- dati, 1 oggetto). Sovrascrivere una tessera vuol dire mettere un file
-- qualunque dietro il QR stampato sul cartoncino di un socio.
--
-- PREFISSI OGGI NEL BUCKET (storage.objects, 15/9/2026):
--   biblioteca 1, cimiteri-di-guerra 4, community 1, convenzioni 10, corsi 22,
--   museo-gg 15, sportello 6, storie 56, tessere 43
--
-- CHI SCRIVE E CON CHE COSA (grep del 15/9/2026):
--   Con token utente, quindi SOGGETTI a queste policy:
--     src/pages/redazione.astro          -> articoli/{uid}/...
--     src/pages/museo-gg-curatela.astro  -> museo-gg/{uid}/...
--   Con SERVICE ROLE, che NON passa dalle policy e quindi continua a
--   funzionare identico:
--     _shared/tessera.ts, tessera-download, tessere-qr-orfani -> tessere/...
--     convenzioni-proposta -> convenzioni/...
--     carica-media (storie, museo-gg, community, luoghi, ...)
--     museo-donazioni-media
--   download-lead legge solo l'URL pubblico di biblioteca/, non scrive.
--   Nessun percorso client scrive in `tessere/` né in `biblioteca/`.
--
-- COSA CAMBIA. Le due policy vengono ricreate con lo stesso nome, gli stessi
-- ruoli (nessuna clausola `to`, cioè public, com'erano) e la stessa condizione,
-- più il vincolo che la prima cartella del percorso non sia `tessere` né
-- `biblioteca`. La policy di DELETE (livello >= 50) non cambia.
-- `storage.foldername(name)` restituisce l'array delle cartelle del percorso:
-- per 'tessere/qr/abc.png' il primo elemento è 'tessere'. Un file in radice
-- (senza cartella) ha array vuoto e `[1]` è NULL: `NULL <> 'tessere'` è NULL,
-- cioè falso, quindi i file in radice non passano più da qui. Oggi in radice
-- non c'è nulla e nessun client scrive in radice: se servisse, si aggiunge
-- `coalesce(..., '') not in (...)`.
--
-- RITORNO INDIETRO: ricreare le due policy con la sola condizione originale
-- riportata sopra.

drop policy if exists assets_pubblici_write_editor_or_admin on storage.objects;
create policy assets_pubblici_write_editor_or_admin on storage.objects
  for insert
  with check (
    (bucket_id = 'assets-pubblici'::text)
    and has_ruolo_min(auth.uid(), 25)
    and (storage.foldername(name))[1] <> 'tessere'
    and (storage.foldername(name))[1] <> 'biblioteca'
  );

drop policy if exists assets_pubblici_update_editor_or_admin on storage.objects;
create policy assets_pubblici_update_editor_or_admin on storage.objects
  for update
  using (
    (bucket_id = 'assets-pubblici'::text)
    and has_ruolo_min(auth.uid(), 25)
    and (storage.foldername(name))[1] <> 'tessere'
    and (storage.foldername(name))[1] <> 'biblioteca'
  );
