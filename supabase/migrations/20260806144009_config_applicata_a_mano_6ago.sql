-- [6/8/2026] Le modifiche di oggi che erano state applicate a mano.
--
-- Perche' questo file esiste: alcune cose sono state fatte con una query diretta
-- invece che con una migrazione, quindi vivevano solo nel database e non nel
-- repo. Chi rileggesse il progetto fra sei mesi, o chi ricostruisse l'ambiente
-- da zero, non le troverebbe. Tutto idempotente: rilanciarlo non fa danno.

-- 1) I MIME che lo sniffer di carica-media promette e il bucket rifiutava.
--    Il commento nell'edge dice «le heic sono le foto degli iPhone», ma
--    assets-pubblici non le aveva in elenco: le foto scattate col telefono
--    venivano respinte a valle, dopo essere passate da tutti i controlli.
update storage.buckets
set allowed_mime_types = allowed_mime_types || array['image/heic','image/heif','image/gif']
where id = 'assets-pubblici'
  and not (allowed_mime_types @> array['image/heic','image/heif','image/gif']);

-- 2) Il contenitore PRIVATO dei libri sociali. Verbali e allegati non hanno
--    indirizzo permanente: si leggono con collegamenti generati al momento.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('libri-sociali', 'libri-sociali', false, 26214400,
        array['application/pdf','application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg','image/png'])
on conflict (id) do nothing;

drop policy if exists libri_sociali_lettura on storage.objects;
create policy libri_sociali_lettura on storage.objects for select to authenticated
  using (bucket_id = 'libri-sociali' and public.puo_gestione_associativa((select auth.uid())));

drop policy if exists libri_sociali_scrittura on storage.objects;
create policy libri_sociali_scrittura on storage.objects for insert to authenticated
  with check (bucket_id = 'libri-sociali' and public.puo_gestione_associativa((select auth.uid())));

-- 3) Gli avvisi Telegram dei Guardiani: spento quello per singolo lemma, acceso
--    il riepilogo giornaliero. Il toggle e' un dato, non codice: si cambia con
--    un UPDATE e senza deploy, ed e' il motivo per cui la vecchia strada resta
--    percorribile se un giorno i contributi tornassero rari.
update telegram_notifica set attivo = false where tipo = 'guardiani_lemma';

insert into telegram_notifica (tipo, categoria, etichetta, attivo)
values ('guardiani_digest', 'Guardiani', 'Riepilogo del glossario', true)
on conflict (tipo) do update
  set attivo = true, categoria = 'Guardiani', etichetta = 'Riepilogo del glossario';
