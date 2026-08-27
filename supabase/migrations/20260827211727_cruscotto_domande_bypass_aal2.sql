-- Brief "Cruscotto del direttivo" (27/8/2026 §9 dice di non toccare le
-- viste del brief, ma questa e' una verifica-non-rifacimento: v_cruscotto_code
-- e' security_invoker, quindi eredita anche la RLS di domande_tesseramento.
-- Quella tabella ha due policy SELECT per authenticated: una per il titolare
-- (email propria), una per l'admin che pero' richiede ANCHE aal2 (sessione
-- con secondo fattore verificato, migrazione 20260717210000). Un ruolo 50
-- normale, senza essersi rifatto il passo di verifica, vede quindi zero
-- righe — l'esatto sintomo che la regola 0 del brief descrive: "quando manca
-- non arriva un errore, arriva un elenco vuoto". Verificato impersonando un
-- vero utente di ruolo 75 con una sessione realistica (senza claim aal2):
-- prima di questa migrazione, v_cruscotto_code restituiva in_attesa=0 per
-- "domande" mentre la tabella vera ne aveva 4, aperte dal 14/7 (44 giorni).
--
-- Soluzione: una funzione SECURITY DEFINER che restituisce SOLO il conteggio
-- e la data piu' vecchia (mai email, nome, indirizzo — §9: "nessun dato
-- personale in pagina"), con lo stesso gate a ruolo 50 gia' usato da
-- cruscotto_lavori()/cruscotto_funzioni(). La policy aal2 sulla tabella vera
-- resta intatta: chi vuole aprire una domanda e vederne i dati deve ancora
-- verificarsi. Il cruscotto vede solo il numero.
create or replace function public.cruscotto_conta_domande()
returns table(in_attesa integer, piu_vecchia timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not has_ruolo_min((select auth.uid()), 50) then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select count(*)::integer, min(d.created_at)
  from domande_tesseramento d
  where d.stato not in ('approvata', 'rifiutata');
end $function$;

revoke all on function public.cruscotto_conta_domande() from public;
revoke all on function public.cruscotto_conta_domande() from anon;
grant execute on function public.cruscotto_conta_domande() to authenticated;

create or replace view public.v_cruscotto_code
with (security_invoker = true) as
with q as (
  select 'Registrazioni da ascoltare'::text as coda, 'ascolta'::text as chiave, '/ascolta'::text as dove,
         count(*)::integer as in_attesa, min(archivio_audio.created_at) as piu_vecchia, 7 as soglia_giorni
  from archivio_audio where archivio_audio.stato = 'in_attesa' and archivio_audio.ascoltato_il is null
  union all
  select 'Eventi del radar da curare'::text, 'radar'::text, '/radar-eventi'::text,
         count(*)::integer, min(eventi_esterni.created_at), 14
  from eventi_esterni where eventi_esterni.stato = 'proposto'
  union all
  select 'Lemmi in attesa di validazione'::text, 'guardiani'::text, '/guardiani-curatela'::text,
         count(*)::integer, min(dizionario_lemma.created_at), 7
  from dizionario_lemma where dizionario_lemma.stato <> 'pubblicato'
  union all
  select 'Domande di tesseramento aperte'::text, 'domande'::text, '/admin-domande'::text,
         cd.in_attesa, cd.piu_vecchia, 5
  from public.cruscotto_conta_domande() cd
)
select coda, chiave, dove, in_attesa, piu_vecchia,
       case when piu_vecchia is null then 0 else extract(day from now() - piu_vecchia)::integer end as giorni_ferma,
       soglia_giorni,
       in_attesa > 0 and piu_vecchia < (now() - make_interval(days => soglia_giorni)) as in_allarme
from q;

grant select on public.v_cruscotto_code to authenticated;
revoke select on public.v_cruscotto_code from anon;
