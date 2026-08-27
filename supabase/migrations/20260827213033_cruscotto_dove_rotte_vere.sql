-- Brief "Cruscotto del direttivo" (27/8/2026 §6.1, verifica 7: "ogni riga
-- di coda porta alla pagina giusta con un clic"). Verificato l'elenco delle
-- rotte vere del sito (src/pages): /admin-domande e /admin-soci non
-- esistono — la revisione delle domande di tesseramento vive su
-- /tesseramento-curatela (stessa pagina per entrambe le voci: e' li' che si
-- collega un socio a un account), e /glossario non esiste, la console del
-- glossario e' /glossario-console. Senza questa correzione tre righe su
-- nove avrebbero portato a un 404, esattamente il tipo di "cruscotto che
-- non aiuta" che il brief vuole evitare.
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
  select 'Domande di tesseramento aperte'::text, 'domande'::text, '/tesseramento-curatela'::text,
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

create or replace view public.v_cruscotto_completezza
with (security_invoker = true) as
select indicatore, fatti, totale, dove from (
  values
    ('Lemmi con la voce agganciata'::text,
     (select count(*) from dizionario_lemma where stato = 'pubblicato' and audio_id is not null),
     (select count(*) from dizionario_lemma where stato = 'pubblicato'),
     '/glossario-console'::text),
    ('Luoghi con il nome ladino validato'::text,
     (select count(*) from luoghi_interesse where toponimo_validato_il is not null),
     (select count(*) from luoghi_interesse where stato = 'pubblicato'),
     '/mappa'::text),
    ('Soci in regola collegati a un account'::text,
     (select fatti from cruscotto_conta_soci_regola()),
     (select totale from cruscotto_conta_soci_regola()),
     '/tesseramento-curatela'::text),
    ('Sepolture con data di morte'::text,
     (select count(*) from memoria_persona where data_morte is not null),
     (select count(*) from memoria_persona),
     '/cimiteri-di-guerra'::text),
    ('Sigle di reparto sciolte'::text,
     (select count(*) from memoria_reparto where certezza <> 'da_verificare'),
     (select count(*) from memoria_reparto),
     '/cimiteri-di-guerra/male'::text)
) t(indicatore, fatti, totale, dove);

grant select on public.v_cruscotto_completezza to authenticated;
revoke select on public.v_cruscotto_completezza from anon;
