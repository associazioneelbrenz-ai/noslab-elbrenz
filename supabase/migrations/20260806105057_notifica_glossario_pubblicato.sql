-- Il glossario non suonava: collegando i contenuti (6/8/2026) avevo agganciato
-- museo, articoli, eventi e raccolte, e lasciato fuori i lemmi. Omissione, non
-- scelta: una parola nuova nel dizionario e' un contenuto come gli altri.
--
-- Tipo distinto 'glossario', coerente con la decisione sui tipi separati: chi
-- segue la lingua non e' detto che segua il museo, e viceversa.
--
-- ATTENZIONE all'idempotenza: notifica_broadcast usa l'url come chiave, e il
-- glossario vive tutto in UNA pagina. Senza ancora per lemma, la prima parola
-- pubblicata avrebbe consumato la chiave e tutte le successive sarebbero state
-- scartate come doppioni. Per questo l'url porta #lemma-<id>.

create or replace function public.notifica_lemma_pubblicato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'pubblicato'
     and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicato') then
    perform notifica_broadcast(
      'glossario',
      'Una parola nuova nel glossario',
      new.lemma || coalesce(' · ' || nullif(btrim(new.definizione), ''), ''),
      'https://elbrenz.eu/guardiani-de-la-lenga#lemma-' || new.id::text
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifica_lemma on public.dizionario_lemma;
create trigger trg_notifica_lemma
  after insert or update of stato on public.dizionario_lemma
  for each row execute function public.notifica_lemma_pubblicato();;
