-- Coda di ascolto (brief "La coda di ascolto", 26/8/2026, verifica 6): il
-- pulsante Conferma segnava stato='pubblicato' ma il file restava nel
-- bucket privato glossario-audio-attesa. Due bug scoperti insieme:
--
-- 1. glossario_pubblico.audio_url leggeva a.file_url, la colonna deprecata
--    dalla migrazione archivio_audio_percorso_invece_di_url del 26/8. Per
--    le 64 registrazioni in coda file_url punta ancora a un indirizzo
--    "/object/public/glossario-audio-attesa/..." — verificato con un fetch
--    anonimo vero: risponde 400, perche' quel bucket e' privato. La vista
--    ora costruisce l'indirizzo da bucket+file_path, mai da file_url.
-- 2. Nessuna colonna cambiava bucket alla conferma: il file confermato
--    restava nel bucket privato per sempre. Da qui in avanti
--    conferma_ascolto sposta la riga sul bucket pubblico glossario-audio
--    (il file va copiato la' PRIMA di chiamare la funzione — la copia è
--    un'operazione di storage, non una scrittura su archivio_audio o
--    dizionario_lemma, quindi non viola la regola "solo dalle due
--    funzioni"; il client la fa con supabase.storage.copy()).
--
-- Aggiunta anche la policy che mancava per scrivere nel bucket pubblico:
-- senza, la copia lato client sarebbe comunque fallita.

create policy "glossario_audio_scrittura_curatori" on storage.objects
for insert
to authenticated
with check (bucket_id = 'glossario-audio' and has_ruolo_min(auth.uid(), 20));

create or replace function public.conferma_ascolto(p_audio_id uuid)
 returns TABLE(audio_id uuid, lemma_id uuid, lemma text, restanti bigint)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_lemma uuid;
begin
  if v_uid is null or not has_ruolo_min(v_uid, 20) then
    raise exception 'Non autorizzato ad ascoltare la coda';
  end if;

  select a.lemma_id into v_lemma from archivio_audio a
   where a.id = p_audio_id and a.stato = 'in_attesa' and a.ascoltato_il is null;
  if v_lemma is null then
    raise exception 'Registrazione non in coda o gia lavorata';
  end if;

  -- Il file va gia' copiato sul bucket pubblico dal chiamante prima di
  -- arrivare qui (supabase.storage.copy); questa funzione registra il
  -- risultato, non lo esegue: una funzione SQL non puo' chiamare la
  -- Storage API.
  update archivio_audio
     set stato = 'pubblicato', ascoltato_da = v_uid, ascoltato_il = now(), updated_at = now(),
         bucket = 'glossario-audio'
   where id = p_audio_id;

  update dizionario_lemma
     set audio_id = p_audio_id, updated_at = now()
   where id = v_lemma;

  return query
    select p_audio_id, v_lemma, l.lemma,
           (select count(*) from archivio_audio x
             where x.stato='in_attesa' and x.ascoltato_il is null)
      from dizionario_lemma l where l.id = v_lemma;
end $function$;

create or replace view public.glossario_pubblico as
 SELECT l.id,
    l.lemma AS termine,
    l.tipo,
    l.parlata AS variante,
    l.comune,
    l.definizione AS significato_it,
    l.esempi_uso AS esempio_uso,
    CASE WHEN a.id IS NOT NULL
      THEN 'https://wacknihvdjxltiqvxtqr.supabase.co/storage/v1/object/public/' || a.bucket || '/' || a.file_path
      ELSE NULL::text END AS audio_url,
    CASE
        WHEN c.consenso_firma THEN c.nome
        ELSE NULL::text
    END AS contributore_firma,
    l.slug,
    l.categoria_gramm,
    l.etimologia,
    l.proverbi,
    l.variante_italiana,
    CASE
        WHEN a.anonimo THEN NULL::text
        ELSE a.nome_parlante
    END AS audio_voce_di
   FROM dizionario_lemma l
     LEFT JOIN archivio_audio a ON a.id = l.audio_id AND a.stato = 'pubblicato'::text
     LEFT JOIN guardiani_contributori c ON c.id = l.contributore_id
  WHERE l.stato = 'pubblicato'::text;
