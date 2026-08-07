-- I PERMESSI CHE NESSUN AUDIT HA VISTO (7/8/2026)
--
-- Il ruolo `anon`, cioe' chiunque apra il sito senza autenticarsi, aveva
-- INSERT, UPDATE e DELETE su tutte e novanta le tabelle dello schema pubblico,
-- piu' TRUNCATE su nove. Comprese pagamenti_tesseramento, domande_tesseramento,
-- utente_ruolo, config_app, telegram_config, email_outbox e i libri sociali.
--
-- NON ERA SFRUTTABILE: sulle tabelle sensibili non esiste nessuna policy che
-- consenta la scrittura, quindi la RLS respingeva tutto. Il secondo strato
-- teneva.
--
-- Ma i due strati dicevano cose opposte, e a fermare tutto era soltanto
-- l'ASSENZA di una regola. Il giorno che qualcuno aggiunge una policy
-- permissiva per aprire una tabella in lettura, la apre anche in scrittura
-- senza volerlo, perche' il permesso sottostante e' gia' concesso. In questo
-- progetto e' gia' successo qualcosa di simile: la regola di rieseguire le
-- revoche dopo ogni `create or replace view` esiste proprio perche' i permessi
-- tornano da soli ai valori predefiniti.
--
-- VERIFICATO PRIMA DI REVOCARE: nessuna pagina pubblica scrive col client
-- anonimo. Tutti i flussi pubblici (lemmi, contatti, tesseramento, newsletter,
-- gita, donazioni, proposte museo) passano gia' da una edge function con
-- service role. Le scritture dirette che esistono stanno nelle pagine di
-- curatela, che richiedono una sessione e scrivono come `authenticated`.

revoke insert, update, delete, truncate on all tables in schema public from anon;

-- E per le tabelle FUTURE: senza questo, la prossima tabella nasce di nuovo
-- scrivibile dall'anonimo, e fra sei mesi si riparte da capo.
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;

-- Il registro interno del riepilogo Guardiani non aveva la RLS: e' l'unica
-- tabella senza, e non contiene dati di persone. Si attiva per coerenza, con
-- lettura al solo direttivo.
alter table if exists public.guardiani_digest_invio enable row level security;
drop policy if exists guardiani_digest_invio_direttivo on public.guardiani_digest_invio;
create policy guardiani_digest_invio_direttivo on public.guardiani_digest_invio
  for select to authenticated using (has_ruolo_min((select auth.uid()), 50));

/**
 * IL CONTROLLO CHE IMPEDISCE IL RITORNO.
 *
 * Il problema vero non e' chiudere: e' che non si riapra da solo. Questo
 * segnala, e NON corregge: un sistema che si riaggiusta da solo nasconde il
 * momento in cui qualcuno ha sbagliato, ed e' quello il momento da vedere.
 */
create or replace function public.controllo_permessi_anon()
returns table (tabella text, permesso text)
language sql stable security definer set search_path = public as $$
  select g.table_name::text, g.privilege_type::text
  from information_schema.role_table_grants g
  where g.grantee = 'anon'
    and g.table_schema = 'public'
    and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    and has_ruolo_min(auth.uid(), 50)
  order by 1, 2;
$$;

grant execute on function public.controllo_permessi_anon() to authenticated;;
