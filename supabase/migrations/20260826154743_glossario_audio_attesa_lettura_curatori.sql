-- Coda di ascolto (brief "La coda di ascolto", 26/8/2026 §3.4). Il bucket
-- glossario-audio-attesa e' privato e non aveva NESSUNA policy su
-- storage.objects: nessun ruolo, nemmeno un curatore, poteva firmare o
-- leggere un file da li'. E' il blocco che la verifica 3 doveva scoprire
-- prima di costruire il resto — trovato, ed e' un fix additivo standard,
-- stesso pattern gia' in uso per donazioni_curatore_read.
create policy "glossario_audio_attesa_lettura_curatori" on storage.objects
for select
to authenticated
using (bucket_id = 'glossario-audio-attesa' and has_ruolo_min(auth.uid(), 20));
