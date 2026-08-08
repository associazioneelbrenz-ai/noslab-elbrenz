-- [8/8/2026] «Nel momento in cui Roberta diventa socia si attivano i punti.»
--
-- Detto da Cristian come un fatto, quindi reso un fatto: finora sarebbe stato un
-- buon proposito, perche' il riconoscimento degli arretrati era una passata a
-- mano, e a mano si dimentica.
--
-- I punti vivono sull'account, i lemmi sull'anagrafica del contributore, e le
-- due cose si incontrano solo per email. Chi contribuisce prima di avere un
-- account lascia quindi del lavoro in sospeso, NON perso: il trigger lo
-- raccoglie nel momento esatto in cui l'account nasce.
--
-- Vale per Roberta con i suoi 5 lemmi, e per Marco Bertagnolli, socio n. 117 dal
-- 14 luglio con 2 lemmi pubblicati e nessun accesso mai fatto: il giorno che
-- entra, i punti lo aspettano gia'.
--
-- Idempotente: gam_add salta se il punto per quel lemma esiste gia'.
--
-- COLLAUDO (transazione annullata): simulata l'iscrizione di Roberta ->
-- 125 punti da 5 lemmi e 1 distintivo, immediati.
create or replace function public.tg_punti_arretrati_al_primo_accesso()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  for r in
    select l.id
    from guardiani_contributori c
    join dizionario_lemma l on l.contributore_id = c.id
    where lower(c.email) = lower(NEW.email)
      and l.stato in ('validato', 'pubblicato')
  loop
    perform gam_add(NEW.id, 'lemma_validato', 25, 'dizionario_lemma', r.id::text, true);
    n := n + 1;
  end loop;
  if n > 0 then
    perform gam_distintivo(NEW.id, 'parola_nostra');
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_punti_arretrati_al_primo_accesso on utente;
create trigger trg_punti_arretrati_al_primo_accesso
  after insert on utente
  for each row execute function tg_punti_arretrati_al_primo_accesso();
