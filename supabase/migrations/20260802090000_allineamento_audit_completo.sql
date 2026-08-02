-- Registrazione versionata dell'audit gia' applicato in produzione via MCP fra
-- il 31 luglio e il 1 agosto 2026. Idempotente: applicarla non cambia nulla.
-- Esiste per non ripetere l'errore di email_outbox, che vive in produzione dal
-- 21 luglio senza essere mai stata versionata.

-- 0.1 TRUNCATE non e' soggetto alla RLS: non agisce riga per riga, svuota la
-- tabella e le policy non lo intercettano. Il ruolo anon lo aveva su 68
-- tabelle, fra cui utente, andreas_kb, domande_tesseramento,
-- pagamenti_tesseramento, iscrizioni_gita, email_outbox, consenso, ricevuta.
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r'
  loop
    execute format('revoke truncate on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- 0.2 Viste auto-aggiornabili con security_invoker=false, di proprieta' di
-- postgres che e' anche proprietario delle tabelle e quindi scavalca la RLS:
-- con la chiave pubblica si poteva scrivere su utente, articolo,
-- luoghi_interesse, convenzioni, eventi_esterni.
revoke insert, update, delete, truncate, references, trigger
  on public.v_forum_autore, public.v_articoli_pubblici, public.v_articoli_seo,
     public.v_luoghi_mappa, public.v_luoghi_pagina, public.convenzioni_pubbliche,
     public.v_convenzioni_mappa, public.eventi_esterni_pubblici,
     public.glossario_pubblico, public.v_custodi_memoria, public.v_posti_gita,
     public.v_storia_pubblica, public.v_classifica
  from anon, authenticated;

-- 0.3 Residuo dell'importazione WordPress: 220 righe, RLS spenta, anon con
-- TRUNCATE. Nessuna FK, nessuna vista, nessuna funzione la referenziano.
revoke insert, update, delete, truncate, references, trigger
  on public._mappa_img_wp from anon, authenticated;
alter table public._mappa_img_wp enable row level security;

-- 0.4 Mutazione senza controllo di ruolo, invocabile da chiunque avesse la
-- chiave pubblica.
revoke execute on function public.scadi_ordini_creato_vecchi() from anon, authenticated;

-- 0.5 Grant senza motivo: senza sessione non restituiva nulla.
revoke execute on function public.get_mia_tessera() from anon;

-- 0.6 Controllo sul chiamante: un ospite non deve poter enumerare i soci via
-- RPC. La funzione e' language sql, dove raise exception non esiste: il
-- controllo sta nella WHERE e un ospite riceve elenco vuoto, preferibile a un
-- errore perche' non rivela che ci sia qualcosa da vedere.
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

-- 0.7 Dato corretto: Südtirol nei contenuti nuovi.
update public.evento
   set titolo = 'Giochi Medievali del Südtirol',
       luogo  = 'Sluderno, Val Venosta (Südtirol)'
 where id = '4c8f2d88-d01f-4e9f-a476-4bce61e8a7f1';
