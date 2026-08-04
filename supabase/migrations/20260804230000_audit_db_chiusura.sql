-- 20260804230000 — chiusura della parte database dell'audit
--
-- GIA' APPLICATA in produzione. Qui si versiona.
--
-- 1. UNA SCRITTURA ESPOSTA A CHIUNQUE.
--
-- `scadi_ordini_creato_vecchi()` e' SECURITY DEFINER e aveva EXECUTE su
-- PUBLIC: chiunque con la chiave anonima poteva chiamarla via RPC e far
-- scadere in blocco i pagamenti in stato `creato`. Il danno sarebbe stato
-- limitato, perche' tocca solo righe piu' vecchie di sette giorni e fa quello
-- che il cron fa comunque, ma una funzione che SCRIVE non si lascia aperta.
--
-- E' la stessa lezione del 4 agosto sui promemoria della quota: revocare da
-- anon e authenticated non basta, PUBLIC eredita EXECUTE per difetto e va
-- revocato per nome. Verificato dopo: anon riceve «permission denied».
--
-- Il cron (jobid 2) gira come postgres, che ha il suo grant esplicito.
revoke execute on function public.scadi_ordini_creato_vecchi() from public, anon, authenticated;

-- 2. IL search_path MUTABILE su quattro funzioni.
--
-- Senza `search_path` fissato una funzione risolve i nomi con quello di chi la
-- chiama: se qualcuno mettesse una tabella omonima in uno schema che viene
-- prima, la funzione lavorerebbe su quella.
--
-- ATTENZIONE a `config_app_chiavi_pubbliche`: vive dentro una policy RLS
-- valutata come `anon`, quindi anon DEVE poterla eseguire. Qui si aggiunge
-- solo il search_path, i permessi NON si toccano: revocarli rimetterebbe le
-- pagine della gita nello stato «non verificabile» corretto poche ore prima.
create or replace function public.config_app_chiavi_pubbliche()
returns text[] language sql immutable set search_path = public
as $$ select array['gita_giochi_medievali_2026_stato']::text[]; $$;

create or replace function public.recesso_efficace_dal(p_comunicato date)
returns date language sql immutable set search_path = public
as $$ select case when p_comunicato is null then null
       else (date_trunc('month', p_comunicato::timestamp) + interval '2 months')::date end; $$;

create or replace function public.rinnovo_sollecitabile(p_anno integer)
returns boolean language sql stable set search_path = public
as $$ select (now() at time zone 'Europe/Rome')::date >= make_date(p_anno, 1, 1); $$;

create or replace function public.invio_da_concludere_entro(p_assemblea date)
returns date language sql immutable set search_path = public
as $$ select case when p_assemblea is null then null
       else p_assemblea - interval '15 days' end::date; $$;

comment on function public.config_app_chiavi_pubbliche() is
 'Elenco esplicito delle chiavi di config_app che il sito pubblico puo'' leggere con la chiave anonima. Aggiungerne una e'' un atto deliberato: NON aprire categorie intere.';
comment on function public.recesso_efficace_dal(date) is
 'Statuto 2014: il recesso ha effetto dal secondo mese successivo a quello in cui il Consiglio riceve la comunicazione. Comunicazione il 10 marzo, effetto dal 1 maggio.';
comment on function public.rinnovo_sollecitabile(integer) is
 'False finche'' non e'' cominciato l''anno di cui si chiede la quota. I solleciti di rinnovo partono DOPO il 31 dicembre, mai prima.';
comment on function public.invio_da_concludere_entro(date) is
 'La data entro cui l''invio di una convocazione deve essere CONCLUSO perche'' i quindici giorni dello statuto siano rispettati per tutti. Si conta dall''ultimo che riceve, non dal primo.';

-- 3. COSA RESTA APERTO, e perche' NON si e' toccato.
--
-- Dodici viste SECURITY DEFINER (livello ERROR nell'advisor). Sono le finestre
-- pubbliche del sito: girano come il proprietario proprio per poter mostrare ad
-- anon il sottoinsieme pubblicato di tabelle che anon non legge. Verificato una
-- per una il 4/8: nessuna espone colonne di dati personali (email, telefono,
-- codice fiscale, indirizzi, IP, token), e i filtri funzionano
-- (eventi_esterni_pubblici mostra 20 righe su 24, esattamente i pubblicati;
-- v_articoli_pubblici 108 su 143). Passarle a `security_invoker` le
-- spegnerebbe tutte e con esse il sito pubblico: non si fa senza riscrivere
-- prima le RLS delle tabelle sottostanti.
--
-- Sette funzioni SECURITY DEFINER chiamabili da anon: `has_ruolo`,
-- `has_ruolo_min` e `peso_ruolo` vivono DENTRO le policy RLS e devono essere
-- eseguibili dal ruolo che la policy valuta; `tessera_verifica` e' la verifica
-- pubblica della tessera, che deve funzionare senza login. Sedici chiamabili da
-- utente autenticato: quelle che scrivono hanno la guardia di ruolo DENTRO
-- (verificato su `contante_consegnato` e `invia_comunicazione_direttivo`:
-- entrambe alzano eccezione sotto il livello 50).
--
-- Venticinque tabelle con RLS accesa e nessuna policy: e' la chiusura
-- voluta. Nessuna policy vuol dire che dall'API non le legge nessuno, e ci
-- arriva solo la chiave di servizio dalle edge.
--
-- `_mappa_img_wp`, residuo WordPress con 220 righe: RLS accesa, zero policy,
-- anon riceve un elenco vuoto. Non si cancella (regola ferrea), resta chiusa.
--
-- Fuori portata perche' servono permessi che non abbiamo: `citext` e `vector`
-- nello schema public (DEBT-010, serve superuser) e la protezione contro le
-- password trapelate (DEBT-009, funzione del piano Pro).
