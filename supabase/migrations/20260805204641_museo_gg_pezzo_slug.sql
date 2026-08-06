-- Slug per la scheda pubblica di ogni pezzo del Museo Grande Guerra.
-- Finora i pezzi vivevano solo dentro la griglia: nessun URL proprio, quindi
-- non condivisibili e non indicizzabili uno per uno. Additivo: nessuna colonna
-- esistente viene toccata.

alter table public.museo_gg_pezzo add column if not exists slug text;

-- Slugify essenziale: minuscole, accenti italiani appianati, tutto il resto
-- diventa trattino. Il suffisso dall'id garantisce l'unicita' senza cicli di
-- ritentativi, anche quando due pezzi si chiamano uguale (il caricamento in
-- blocco propone i titoli dai nomi dei file, le omonimie sono la norma).
create or replace function public.museo_gg_slugify(p_titolo text, p_id uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(nullif(trim(p_titolo), ''), 'pezzo'),
                    'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', '-', 'g'
  )) || '-' || left(replace(p_id::text, '-', ''), 6);
$$;

-- Solo all'inserimento: uno slug gia' pubblicato non deve cambiare perche' il
-- curatore ha corretto un refuso nel titolo, altrimenti si rompono i link
-- condivisi e quel che i motori hanno gia' indicizzato.
create or replace function public.museo_gg_slug_auto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is null or trim(new.slug) = '' then
    new.slug := public.museo_gg_slugify(new.titolo, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_museo_gg_slug on public.museo_gg_pezzo;
create trigger trg_museo_gg_slug
  before insert on public.museo_gg_pezzo
  for each row execute function public.museo_gg_slug_auto();

-- Riempimento dei pezzi gia' esistenti.
update public.museo_gg_pezzo
set slug = public.museo_gg_slugify(titolo, id)
where slug is null or trim(slug) = '';

create unique index if not exists museo_gg_pezzo_slug_key on public.museo_gg_pezzo (slug);;
