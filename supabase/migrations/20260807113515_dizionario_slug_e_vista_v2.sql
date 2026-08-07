-- IL DIZIONARIO · base dati (7/8/2026)
--
-- Cinquantasette parole non sono piu' un elenco: sono un dizionario piccolo. E
-- siccome ha cominciato a guardarlo gente da fuori l'Associazione, deve
-- somigliare a una cosa che si consulta e si cita. Per citarla serve che ogni
-- parola abbia un indirizzo proprio.
alter table public.dizionario_lemma add column if not exists slug text;

create or replace function public.dizionario_slug_auto()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.slug is null or trim(new.slug) = '' then
    -- Si riusa lo slugify del museo: una regola sola per tutto il sito. Il
    -- suffisso dall'id tiene distinti i lemmi con la stessa grafia in parlate
    -- diverse, che e' esattamente il caso delle varianti.
    new.slug := public.museo_gg_slugify(new.lemma, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_dizionario_slug on public.dizionario_lemma;
create trigger trg_dizionario_slug before insert on public.dizionario_lemma
  for each row execute function public.dizionario_slug_auto();

update public.dizionario_lemma
set slug = public.museo_gg_slugify(lemma, id)
where slug is null or trim(slug) = '';

create unique index if not exists dizionario_lemma_slug_key on public.dizionario_lemma (slug);

-- I campi nuovi si aggiungono IN CODA: `create or replace view` non sa
-- riordinare le colonne, e distruggere la vista per rifarla significherebbe
-- portarsi dietro i suoi dipendenti per un capriccio di ordine alfabetico.
create or replace view public.glossario_pubblico as
  select l.id,
         l.lemma as termine,
         l.tipo,
         l.parlata as variante,
         l.comune,
         l.definizione as significato_it,
         l.esempi_uso as esempio_uso,
         a.file_url as audio_url,
         case when c.consenso_firma then c.nome else null end as contributore_firma,
         -- da qui in poi, aggiunte del 7/8: sono i campi che distinguono un
         -- dizionario da un elenco. Restano vuoti finche' nessuno li compila
         -- (oggi etimologia e proverbi sono a zero su 57) e la scheda li mostra
         -- solo quando ci sono: uno spazio vuoto sembra un difetto.
         l.slug,
         l.categoria_gramm,
         l.etimologia,
         l.proverbi,
         l.variante_italiana
  from dizionario_lemma l
  left join archivio_audio a on a.id = l.audio_id
  left join guardiani_contributori c on c.id = l.contributore_id
  where l.stato = 'pubblicato';;
