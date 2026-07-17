-- =====================================================================
-- Museo Grande Guerra · Fase A — upload dei SOCI (>=10).
-- Il socio inserisce SOLO pezzi propri e SOLO in stato 'in_attesa' -> coda di
-- validazione. La pubblicazione ('pubblicato') resta ESCLUSIVA admin (>=50):
-- garantita da RLS (with_check) E da trigger (blindatura). L'anon vede solo i
-- 'pubblicato'. Distinto dal flusso ospiti (donazione_materiale, brief donatore).
-- Le policy admin preesistenti (museo_gg_admin_write) NON si toccano.
-- =====================================================================

-- Il socio (>=10) INSERISCE solo pezzi propri, solo in_attesa.
drop policy if exists museo_gg_insert_socio on public.museo_gg_pezzo;
create policy museo_gg_insert_socio on public.museo_gg_pezzo
  for insert with check (
    public.has_ruolo_min(auth.uid(), 10)
    and caricato_da = auth.uid()
    and stato = 'in_attesa'
  );

-- Il socio LEGGE i propri pezzi (qualunque stato) + tutti i pubblicati.
drop policy if exists museo_gg_read_socio on public.museo_gg_pezzo;
create policy museo_gg_read_socio on public.museo_gg_pezzo
  for select using (
    stato = 'pubblicato'
    or (public.has_ruolo_min(auth.uid(), 10) and caricato_da = auth.uid())
  );

-- Il socio MODIFICA i propri pezzi finche' 'in_attesa' (mai dopo).
drop policy if exists museo_gg_update_socio on public.museo_gg_pezzo;
create policy museo_gg_update_socio on public.museo_gg_pezzo
  for update using (caricato_da = auth.uid() and stato = 'in_attesa')
             with check (caricato_da = auth.uid() and stato = 'in_attesa');

-- Il socio RITIRA (elimina) i propri pezzi 'in_attesa'.
drop policy if exists museo_gg_delete_socio on public.museo_gg_pezzo;
create policy museo_gg_delete_socio on public.museo_gg_pezzo
  for delete using (caricato_da = auth.uid() and stato = 'in_attesa');

-- --- BLINDATURA: un non-admin non pubblica ne' valida (oltre alla RLS) --------
-- Estende la guardia esistente: per un non-admin forza stato='in_attesa' e
-- azzera validato_*. Le verifiche di pubblicazione (fonte+immagine+consenso)
-- restano invariate e valgono quando l'admin pubblica.
create or replace function public.museo_gg_guardia_pubblicazione()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
begin
  new.updated_at := now();
  if not public.has_ruolo_min(auth.uid(), 50) then
    -- il socio non puo' pubblicare ne' auto-validare, qualunque input
    if new.stato is distinct from 'in_attesa' then new.stato := 'in_attesa'; end if;
    new.validato_da := null;
    new.validato_il := null;
  end if;
  if new.stato = 'pubblicato' then
    if coalesce(btrim(new.fonte), '') = '' then
      raise exception 'Impossibile pubblicare: la fonte/provenienza e'' obbligatoria (cartellino).';
    end if;
    if new.immagini_urls is null or array_length(new.immagini_urls, 1) is null then
      raise exception 'Impossibile pubblicare: serve almeno un''immagine.';
    end if;
    if new.consenso_dichiarato is not true then
      raise exception 'Impossibile pubblicare: manca la dichiarazione di consenso.';
    end if;
  end if;
  return new;
end $function$;
-- il trigger trg_museo_gg_guardia (before insert or update) resta invariato.

-- --- STORAGE: il socio (>=10) carica nel prefisso museo-gg/ -------------------
drop policy if exists assets_museo_gg_insert_soci on storage.objects;
create policy assets_museo_gg_insert_soci on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets-pubblici'
    and (storage.foldername(name))[1] = 'museo-gg'
    and public.has_ruolo_min(auth.uid(), 10)
  );
