-- Un indirizzo memorizzato e' la fotografia di un momento: se il file cambia bucket,
-- o il bucket cambia visibilita', l'indirizzo muore in silenzio. E' successo con lo
-- spostamento delle registrazioni nel bucket riservato: gli url sono stati riscritti
-- sostituendo il nome del bucket ma lasciando l'endpoint "public", che per un bucket
-- privato non esiste. Da qui in avanti si conservano bucket e percorso, e l'indirizzo
-- si costruisce al momento dell'uso, firmandolo quando serve.
alter table public.archivio_audio add column if not exists bucket text;
alter table public.archivio_audio add column if not exists file_path text;

update public.archivio_audio
   set bucket = case
         when file_url ilike '%/glossario-audio-attesa/%' then 'glossario-audio-attesa'
         when file_url ilike '%/glossario-audio/%' then 'glossario-audio'
         else bucket end,
       file_path = case
         when file_url ilike '%/glossario-audio-attesa/%'
           then split_part(file_url, '/glossario-audio-attesa/', 2)
         when file_url ilike '%/glossario-audio/%'
           then split_part(file_url, '/glossario-audio/', 2)
         else file_path end
 where file_url is not null and (bucket is null or file_path is null);

select count(*) filter (where bucket='glossario-audio-attesa') as riservate,
       count(*) filter (where bucket='glossario-audio') as pubbliche,
       count(*) filter (where file_path is null) as senza_percorso,
       count(*) as totali
from public.archivio_audio;;
