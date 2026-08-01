-- Il curatore del Museo puo' davvero curare.
--
-- IL BUG, verificato l'1/8/2026 simulando la sessione di Michele Corradini:
-- la guardia riportava a 'in_attesa' chiunque non fosse livello >= 50. Corradini
-- e' `curatore_museo_gg`, livello 20. Risultato: il suo pannello gli mostrava i
-- bottoni Valida e Pubblica, lui li premeva, l'update andava a buon fine e lo
-- stato tornava indietro da solo. Nessun errore a schermo, nessun pezzo mai
-- pubblicato. Il museo pubblico e' vuoto anche per questo.
--
-- Le policy RLS `museo_gg_pezzo_curatore_select/insert/update` (21/7, col
-- pannello) gia' riconoscevano il ruolo; la guardia (16/7, Fase B) e' rimasta
-- indietro. Le due si contraddicevano. Qui si allineano.
--
-- Cosa NON cambia: i requisiti di pubblicazione valgono per tutti, curatore
-- compreso. Niente fonte, niente immagine o niente consenso, niente pubblicazione.
-- E chi non e' ne' curatore ne' direttivo (i soci della Fase A) resta a
-- 'in_attesa', che e' esattamente il comportamento voluto.

create or replace function public.museo_gg_guardia_pubblicazione()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
declare
  -- Chi ha titolo a curare il Museo: il direttivo, oppure il curatore incaricato.
  puo_curare boolean := public.has_ruolo_min(auth.uid(), 50)
                        or public.has_ruolo(auth.uid(), 'curatore_museo_gg');
begin
  new.updated_at := now();

  if not puo_curare then
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
