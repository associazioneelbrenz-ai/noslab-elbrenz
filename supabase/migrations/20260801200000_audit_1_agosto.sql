-- Allineamento repo <-> produzione dopo l'audit del 1 agosto 2026.
--
-- Tutto quanto segue e' GIA' STATO APPLICATO in produzione via MCP durante
-- l'audit. Questa migration e' la registrazione versionata, ed e' idempotente:
-- serve perche' il repo non resti indietro rispetto al database. E' lo stesso
-- errore di email_outbox, creata via MCP il 21 luglio e mai versionata: se un
-- giorno il progetto Supabase andasse ricreato, questi permessi non ci sarebbero.

-- 4a. Revoca delle scritture ad anon/authenticated sulle viste auto-aggiornabili.
-- Il motivo e' sottile: erano viste con security_invoker=false, di proprieta' di
-- postgres, che e' anche proprietario delle tabelle sottostanti e quindi ne
-- scavalca la RLS. Con la sola chiave pubblica si poteva scrivere su utente,
-- articolo, luoghi_interesse, convenzioni ed eventi_esterni passando dalla vista.
-- Verificato prima della revoca che nessuna scrittura del frontend passi di li':
-- controllate tutte e dieci le viste nei due repo, sono tutte in sola lettura.
revoke insert, update, delete, truncate, references, trigger
  on public.v_forum_autore, public.v_articoli_pubblici, public.v_articoli_seo,
     public.v_luoghi_mappa, public.v_luoghi_pagina, public.convenzioni_pubbliche,
     public.v_convenzioni_mappa, public.eventi_esterni_pubblici
  from anon, authenticated;

-- 4b. Residuo dell'importazione WordPress: 220 righe con anon che aveva TRUNCATE,
-- cioe' chiunque avesse la chiave pubblica poteva svuotarla. Nessuna chiave
-- esterna la punta, nessuna vista la usa, nessuna funzione la cita, e il grep
-- sui due repo non trova un solo riferimento: RLS deny-by-default, zero policy.
-- Se qualcosa dovesse rompersi, la causa e' questa e va segnalata, non annullata.
revoke insert, update, delete, truncate, references, trigger
  on public._mappa_img_wp from anon, authenticated;
alter table public._mappa_img_wp enable row level security;

-- 4c. Mutazione sui pagamenti senza controllo di ruolo, invocabile da chiunque
-- avesse la chiave pubblica: marcava 'scaduto' gli ordini in stato 'creato' piu'
-- vecchi di sette giorni. Il cron continua a funzionare, gira con altri privilegi.
revoke execute on function public.scadi_ordini_creato_vecchi() from anon, authenticated;

-- 4d. Grant senza motivo: senza sessione non restituiva nulla, ma non doveva esserci.
revoke execute on function public.get_mia_tessera() from anon;

-- 4e. Controllo sul CHIAMANTE, non solo sui risultati. Prima la funzione filtrava
-- i risultati ai soli soci ma non guardava chi stesse chiedendo: un ospite appena
-- registrato poteva enumerare la base sociale per tentativi. Il controllo va a
-- livello di API perche' l'interfaccia non ferma chi chiama l'RPC col proprio
-- token: il compositore delle menzioni sta sotto /app, protetto da RequireTier,
-- ma l'RPC e' raggiungibile lo stesso.
-- NB: la funzione e' `language sql`, dove `raise exception` non esiste. Il
-- controllo sta nella WHERE, quindi un ospite riceve un elenco VUOTO invece di
-- un errore: meglio anche cosi', un errore confermerebbe che c'e' qualcosa da vedere.
create or replace function public.cerca_soci(termine text)
 returns table(id uuid, nome text, avatar_url text)
 language sql security definer set search_path to 'public'
as $function$
  select u.id,
    coalesce(nullif(btrim(u.nome), ''), 'Socio') ||
      case when nullif(btrim(u.cognome), '') is not null
           then ' ' || left(btrim(u.cognome), 1) || '.' else '' end as nome,
    u.avatar_url
  from public.utente u
  where public.has_ruolo_min(auth.uid(), 10)
    and public.has_ruolo_min(u.id, 10)
    and (u.nome ilike '%' || termine || '%' or u.cognome ilike '%' || termine || '%')
  order by u.nome
  limit 8;
$function$;

comment on function public.cerca_soci(text) is
  'Ricerca soci per le menzioni nel forum. Riservata a chi ha ruolo minimo socio (10): un ospite riceve un elenco vuoto anche chiamando l''RPC col proprio token.';

-- 4f. Il dato della gita: Südtirol, mai Alto Adige. Sito e app erano stati
-- corretti il 27/7, questo record no, e nessuno se n'era accorto perche' finora
-- non veniva mostrato da nessuna parte. La pagina /eventi sarebbe stata la prima
-- a pubblicarlo: la guardia temporanea che stava in quella pagina e' stata
-- rimossa contestualmente a questa correzione.
update public.evento
   set titolo = 'Giochi Medievali del Südtirol',
       luogo  = 'Sluderno, Val Venosta (Südtirol)'
 where id = '4c8f2d88-d01f-4e9f-a476-4bce61e8a7f1';
