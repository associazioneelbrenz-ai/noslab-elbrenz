-- [6/8/2026] Una notifica per PUBBLICAZIONE, non per parola.
--
-- Il trigger di stamattina era per riga: approvando i 32 termini in coda
-- sarebbero uscite 32 notifiche per 10 destinatari, oltre trecento messaggi, con
-- trenta avvisi di fila sui telefoni. Il modo perfetto per far spegnere le
-- notifiche il giorno dopo averle accese.
--
-- Trigger DI ISTRUZIONE con tabella di transizione: una curatela in blocco e' un
-- solo UPDATE, quindi un solo avviso. Il testo si adatta: una parola sola si
-- nomina, molte si contano.
--
-- Nota: le tabelle di transizione non convivono con `UPDATE OF colonna`, quindi
-- il trigger ascolta tutti gli UPDATE e filtra la transizione nel corpo.

drop trigger if exists trg_notifica_lemma on public.dizionario_lemma;
drop trigger if exists trg_notifica_lemmi_ins on public.dizionario_lemma;
drop trigger if exists trg_notifica_lemmi_upd on public.dizionario_lemma;

create or replace function public.notifica_lemmi_pubblicati()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer; v_primo uuid; v_elenco text; v_titolo text; v_corpo text;
begin
  if tg_op = 'INSERT' then
    select count(*), min(id::text)::uuid,
           string_agg(lemma, ', ' order by lemma)
      into v_n, v_primo, v_elenco
    from (select id, lemma from nuovi where stato = 'pubblicato' order by lemma limit 6) s;
    select count(*) into v_n from nuovi where stato = 'pubblicato';
    select id into v_primo from nuovi where stato = 'pubblicato' limit 1;
  else
    select count(*) into v_n
    from nuovi n join vecchi v on v.id = n.id
    where n.stato = 'pubblicato' and v.stato is distinct from 'pubblicato';

    select n.id into v_primo
    from nuovi n join vecchi v on v.id = n.id
    where n.stato = 'pubblicato' and v.stato is distinct from 'pubblicato'
    limit 1;

    select string_agg(lemma, ', ' order by lemma) into v_elenco from (
      select n.lemma from nuovi n join vecchi v on v.id = n.id
      where n.stato = 'pubblicato' and v.stato is distinct from 'pubblicato'
      order by n.lemma limit 6
    ) s;
  end if;

  if coalesce(v_n, 0) = 0 then return null; end if;

  if v_n = 1 then
    v_titolo := 'Una parola nuova nel glossario';
    v_corpo  := v_elenco;
  else
    v_titolo := v_n || ' parole nuove nel glossario';
    v_corpo  := v_elenco || case when v_n > 6 then ' e altre ' || (v_n - 6) else '' end;
  end if;

  -- L'ancora del primo lemma fa da chiave di idempotenza: il glossario vive
  -- tutto in una pagina, e senza ancora la seconda pubblicazione verrebbe
  -- scartata come doppione della prima.
  perform notifica_broadcast(
    'glossario', v_titolo, v_corpo,
    'https://elbrenz.eu/guardiani-de-la-lenga#lemma-' || v_primo::text
  );
  return null;
end;
$$;

create trigger trg_notifica_lemmi_ins
  after insert on public.dizionario_lemma
  referencing new table as nuovi
  for each statement execute function public.notifica_lemmi_pubblicati();

create trigger trg_notifica_lemmi_upd
  after update on public.dizionario_lemma
  referencing old table as vecchi new table as nuovi
  for each statement execute function public.notifica_lemmi_pubblicati();;
