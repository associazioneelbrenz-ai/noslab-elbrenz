-- Riconciliazione (brief "La coda di ascolto", 26/8/2026). v_coda_ascolto,
-- conferma_ascolto e scarta_ascolto erano gia' vivi in produzione ("creato
-- via MCP il 26 agosto", dice il brief) ma senza nessuna voce nella
-- cronologia delle migrazioni: creati fuori da apply_migration. Questa
-- migrazione non cambia niente (CREATE OR REPLACE sulle stesse definizioni
-- gia' attive, verificate identiche), serve solo a portarli nella
-- cronologia tracciata, come tutto il resto del progetto.

create or replace view public.v_coda_ascolto as
SELECT a.id AS audio_id,
    a.bucket,
    a.file_path,
    a.formato_audio,
    a.mime_originale,
    COALESCE(a.durata_secondi, 0) AS durata_secondi,
    a.parlata,
    a.comune_parlante,
    a.eta_parlante,
    a.sesso_parlante,
    a.nome_parlante,
    a.anonimo,
    a.voce_di_altri,
    a.consenso_parlante,
    a.registrato_il,
    a.luogo_registrazione,
    a.created_at,
    l.id AS lemma_id,
    l.lemma,
    l.slug AS lemma_slug,
    l.categoria_gramm,
    l.definizione,
    l.comune AS lemma_comune,
    l.audio_id IS NOT NULL AS lemma_ha_gia_voce,
    row_number() OVER (ORDER BY a.created_at, a.id) AS posizione,
    count(*) OVER () AS totale,
    sum(COALESCE(a.durata_secondi, 0)) OVER () AS secondi_totali
   FROM archivio_audio a
     JOIN dizionario_lemma l ON l.id = a.lemma_id
  WHERE a.stato = 'in_attesa'::text AND a.ascoltato_il IS NULL;

alter view public.v_coda_ascolto set (security_invoker = true);
revoke all on public.v_coda_ascolto from anon, authenticated;
grant select on public.v_coda_ascolto to authenticated;

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

  update archivio_audio
     set stato = 'pubblicato', ascoltato_da = v_uid, ascoltato_il = now(), updated_at = now()
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

create or replace function public.scarta_ascolto(p_audio_id uuid, p_motivo text)
 returns TABLE(audio_id uuid, restanti bigint)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not has_ruolo_min(v_uid, 20) then
    raise exception 'Non autorizzato ad ascoltare la coda';
  end if;
  if coalesce(btrim(p_motivo),'') = '' then
    raise exception 'Il motivo del rifiuto e obbligatorio';
  end if;

  update archivio_audio
     set stato = 'rifiutato', motivo_rifiuto = btrim(p_motivo),
         ascoltato_da = v_uid, ascoltato_il = now(), updated_at = now()
   where id = p_audio_id and stato = 'in_attesa' and ascoltato_il is null;

  if not found then raise exception 'Registrazione non in coda o gia lavorata'; end if;

  return query select p_audio_id,
    (select count(*) from archivio_audio x where x.stato='in_attesa' and x.ascoltato_il is null);
end $function$;

revoke execute on function public.conferma_ascolto(uuid) from public, anon;
revoke execute on function public.scarta_ascolto(uuid, text) from public, anon;
grant execute on function public.conferma_ascolto(uuid) to authenticated;
grant execute on function public.scarta_ascolto(uuid, text) to authenticated;
