-- [6/8/2026] L'aggregazione per istruzione non basta.
--
-- Il trigger di prima univa le parole pubblicate nello STESSO update: perfetto
-- per l'approvazione in blocco del pannello, inutile per come si lavora oggi,
-- cioe' cliccando un link alla volta dalla mail. Il segretario ne ha validate
-- tre alle 11:15 e sono partiti tre avvisi; con i 29 in coda ne partirebbero
-- ventinove, sui tre telefoni registrati. La valanga rientrava dalla finestra.
--
-- Ora la pubblicazione non annuncia: SEGNA. Un lavoro ogni quarto d'ora
-- raccoglie tutte le parole pubblicate e non ancora annunciate e manda UN
-- messaggio solo. Uno che clicca venti link in venti minuti fa suonare il
-- telefono una volta, forse due.

alter table public.dizionario_lemma add column if not exists annunciato_il timestamptz;

-- Le parole gia' pubblicate prima d'ora sono acqua passata: si marcano come
-- annunciate, altrimenti il primo giro le ripescherebbe tutte e undici.
update public.dizionario_lemma
set annunciato_il = coalesce(validato_il, updated_at, now())
where stato = 'pubblicato' and annunciato_il is null;

-- Il trigger non manda piu' niente: la marcatura la fa il lavoro periodico.
drop trigger if exists trg_notifica_lemmi_ins on public.dizionario_lemma;
drop trigger if exists trg_notifica_lemmi_upd on public.dizionario_lemma;

create or replace function public.annuncia_lemmi_pubblicati()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer; v_primo uuid; v_elenco text; v_titolo text; v_corpo text;
begin
  select count(*), min(id) into v_n, v_primo
  from dizionario_lemma where stato = 'pubblicato' and annunciato_il is null;

  if coalesce(v_n, 0) = 0 then return 'niente da annunciare'; end if;

  select string_agg(lemma, ', ' order by lemma) into v_elenco from (
    select lemma from dizionario_lemma
    where stato = 'pubblicato' and annunciato_il is null
    order by lemma limit 6
  ) s;

  if v_n = 1 then
    v_titolo := 'Una parola nuova nel glossario';
    v_corpo  := v_elenco;
  else
    v_titolo := v_n || ' parole nuove nel glossario';
    v_corpo  := v_elenco || case when v_n > 6 then ' e altre ' || (v_n - 6) else '' end;
  end if;

  perform notifica_broadcast(
    'glossario', v_titolo, v_corpo,
    'https://elbrenz.eu/guardiani-de-la-lenga#lemma-' || v_primo::text
  );

  update dizionario_lemma set annunciato_il = now()
  where stato = 'pubblicato' and annunciato_il is null;

  return format('annunciate %s parole', v_n);
end;
$$;

select cron.schedule('glossario-annuncio', '*/15 * * * *',
                     'select public.annuncia_lemmi_pubblicati()');;
