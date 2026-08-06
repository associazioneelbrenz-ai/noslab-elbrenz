-- [6/8/2026] `min(uuid)` non esiste in Postgres: non c'e' un ordinamento
-- aggregabile per gli uuid. Il lavoro dell'annuncio falliva ogni quarto d'ora
-- dalle 11:30, mentre il segretario svuotava la coda: le 29 parole sono state
-- pubblicate correttamente e nessuno lo ha saputo.
--
-- Serviva solo un id qualunque del gruppo, per l'ancora che fa da chiave di
-- idempotenza: si prende il primo in ordine di lemma, che e' anche piu' sensato
-- di un uuid minimo.
create or replace function public.annuncia_lemmi_pubblicati()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer; v_primo uuid; v_elenco text; v_titolo text; v_corpo text;
begin
  select count(*) into v_n
  from dizionario_lemma where stato = 'pubblicato' and annunciato_il is null;

  if coalesce(v_n, 0) = 0 then return 'niente da annunciare'; end if;

  select id into v_primo
  from dizionario_lemma where stato = 'pubblicato' and annunciato_il is null
  order by lemma limit 1;

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
$$;;
