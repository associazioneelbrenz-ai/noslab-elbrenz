-- [6/8/2026] LA CODA DEL GLOSSARIO ERA BLOCCATA, e non per disattenzione.
--
-- tg_punti_lemma passava `contributore_id` a gam_add come se fosse un utente
-- dell'app. Ma contributore_id punta a guardiani_contributori, che raccoglie
-- CHIUNQUE proponga dal modulo pubblico, anche chi non ha un account. La chiave
-- esterna punti_evento.utente_id -> utente allora rifiutava l'inserimento, e
-- l'eccezione faceva fallire l'INTERO update: approvare un lemma era
-- IMPOSSIBILE. Tutti e 32 i lemmi in coda ricadevano in questo caso, e l'ultima
-- pubblicazione risale al 16 luglio.
--
-- La correzione fa due cose. Primo: il ponte giusto, contributore -> utente per
-- email, cosi' il socio che propone dal modulo pubblico i punti li prende
-- davvero (prima non li avrebbe presi nemmeno lui). Secondo: se il contributore
-- non ha un account, i punti semplicemente non si assegnano e la validazione
-- prosegue. Un riconoscimento che non si puo' dare non deve impedire il lavoro.

create or replace function public.tg_punti_lemma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_utente uuid;
begin
  if NEW.stato in ('validato','pubblicato')
     and (OLD.stato is null or OLD.stato not in ('validato','pubblicato')) then

    -- Il contributore e' un utente dell'app? Si cerca per email, che e' l'unica
    -- cosa che le due anagrafiche hanno in comune.
    select u.id into v_utente
    from guardiani_contributori g
    join utente u on lower(u.email) = lower(g.email)
    where g.id = NEW.contributore_id
    limit 1;

    -- Ripiego: in certi flussi contributore_id E' gia' un utente.
    if v_utente is null then
      select u.id into v_utente from utente u where u.id = NEW.contributore_id;
    end if;

    if v_utente is not null then
      perform public.gam_add(v_utente, 'lemma_validato', 25, 'dizionario_lemma', NEW.id::text, true);
      perform public.gam_distintivo(v_utente, 'parola_nostra');
    end if;
  end if;
  return NEW;
end;
$$;;
