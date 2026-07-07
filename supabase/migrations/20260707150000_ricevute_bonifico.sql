-- M2.6-bis — Bonifico con ricevuta + OCR (7 luglio 2026)
--
-- metodo:   'paypal' (default, righe esistenti) | 'bonifico'
-- stato:    aggiunto 'in_verifica' — le ricevute bonifico entrano SEMPRE in
--           verifica manuale: MAI approvazione o rifiuto automatici.
-- anomalia: true se l'OCR estrae importo/causale non coerenti (per la quota)
--           o non riesce a leggere i campi — flag per il verificatore umano.
-- ricevuta_path: path del file nel bucket privato 'ricevute'.
-- ricevuta_dati: JSON estratto dall'OCR {importo, valuta, data, ordinante,
--                causale, cro_trn} con null sui campi non leggibili.
--
-- Retention ricevute (documentata): file cancellato dopo conferma del
-- pagamento o comunque entro 12 mesi; cancellazione anticipata su richiesta.

alter table public.pagamenti_tesseramento
  add column if not exists metodo text not null default 'paypal'
    check (metodo in ('paypal', 'bonifico')),
  add column if not exists anomalia boolean not null default false,
  add column if not exists ricevuta_path text,
  add column if not exists ricevuta_dati jsonb;

alter table public.pagamenti_tesseramento
  drop constraint if exists pagamenti_tesseramento_stato_check;
alter table public.pagamenti_tesseramento
  add constraint pagamenti_tesseramento_stato_check
    check (stato in ('creato', 'completato', 'rimborsato', 'negato', 'in_verifica'));

-- Bucket PRIVATO per le ricevute: nessuna policy su storage.objects per
-- questo bucket → accesso solo via service role (upload dalla edge function,
-- lettura via dashboard/signed URL).
insert into storage.buckets (id, name, public)
values ('ricevute', 'ricevute', false)
on conflict (id) do nothing;
