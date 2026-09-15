-- Ondata 2 dell'audit del 13 settembre 2026 (AUDIT_2026-09-13.md), voce PRIV-06.
-- Questa migrazione NON tocca dati: crea una funzione e un lavoro pianificato.
-- I dati li toccherà il lavoro, ogni notte alle 3:30 UTC, secondo i termini
-- promessi dall'informativa. Non eseguire la funzione a mano prima di aver
-- letto i conteggi qui sotto.
--
-- IL PROBLEMA. L'informativa promette 12 mesi di conservazione per i contatti
-- e per il materiale non accolto, ma le uniche pulizie in essere (15/9/2026,
-- cron.job) sono cleanup_otp (codici OTP), cleanup_rate_limit (solo
-- convenzioni_rate_limit) e scadi_ordini_creato_vecchi (ordini PayPal). Tutto
-- il resto si accumula senza scadenza: le email inviate con l'HTML completo,
-- gli hash dei rate limit, i contatti della biblioteca, le richieste chiuse,
-- le donazioni respinte, le domande di tesseramento annullate.
--
-- COLONNE E STATI VERIFICATI (information_schema.columns, pg_constraint,
-- group by stato, 15/9/2026), un blocco per tabella:
--
--   email_outbox: html text NOT NULL, stato check in (bozza, pronta, in_invio,
--     inviata, errore, annullata), inviata_il nullable, updated_at.
--     Oggi: 62 inviate, 2 annullate. Nessuna pagina in src/ legge la tabella;
--     processa_email_outbox() legge solo in_invio/pronta; salvataggio-settimanale
--     esporta solo le righe NON inviate/annullate. Svuotare l'html delle
--     inviate non toglie nulla a nessuno. La colonna è NOT NULL: si scrive ''
--     e la riga resta, con destinatario, oggetto, stato, resend_id e date.
--
--   ai_rate_limit_pubblico: ip_hash, giorno date NOT NULL default current_date.
--   telegram_rate_limit: chat_id_hash, giorno date NOT NULL.
--     Sono contatori giornalieri: dopo 30 giorni non servono a nessuna finestra.
--
--   download_lead: consenso_newsletter boolean NOT NULL default false,
--     created_at. Chi ha detto sì alla newsletter resta (è un iscritto), chi ha
--     solo scaricato il PDF se ne va dopo 12 mesi.
--
--   donazione_materiale: stato text default 'in_attesa', senza CHECK; i valori
--     previsti dalla migrazione 20260718000000 sono in_attesa | presa_in_carico
--     | catalogata | respinta. "Non accolta" = 'respinta'. Oggi 0 righe.
--     I file in file_urls (bucket privato) NON vengono cancellati da qui.
--
--   richieste_contatto: stato check in (nuova, in_lavorazione, chiusa).
--     "Chiusa/archiviata" = 'chiusa' (non esiste 'archiviata'). Oggi 0 righe.
--     Gli allegati su storage NON vengono cancellati da qui.
--
--   domande_tesseramento: stato check in (in_attesa, approvata, respinta,
--     annullata). Oggi 4 annullate, di cui 1 con pagamenti collegati.
--     FK verso domande_tesseramento (information_schema, 15/9/2026):
--       pagamenti_tesseramento.domanda_id     NO ACTION  <- la condizione chiesta
--       solleciti_integrazione.domanda_id     NO ACTION
--       comunicazione_destinatario.domanda_id RESTRICT
--       assoc_presenza.domanda_id             RESTRICT
--       assoc_delega.delegante/delegato_domanda_id RESTRICT
--       deroga_quota, sollecito_quota, anagrafica_modifica, tesseramento_anno
--                                             CASCADE (seguono la domanda)
--       newsletter_iscritto.domanda_id, assoc_delibera.socio_id  SET NULL
--     Una domanda annullata o respinta che avesse anche una sola riga in una
--     tabella NO ACTION / RESTRICT farebbe fallire il DELETE e con esso tutta
--     la funzione: il blocco le esclude tutte, non solo i pagamenti.
--
-- CONTEGGI DI OGGI, 15/9/2026 (SELECT preliminari, righe che verrebbero
-- toccate alla prima esecuzione):
--   email_outbox html da svuotare (inviate da > 90 gg, html non vuoto) ...  0 su 62
--   ai_rate_limit_pubblico (giorno < oggi - 30) ......................... 61 su 69
--   telegram_rate_limit (giorno < oggi - 30) .............................  2 su 4
--   download_lead senza consenso newsletter da > 12 mesi .................  0 su 26
--   donazione_materiale respinte da > 12 mesi ............................  0 su 0
--   richieste_contatto chiuse da > 12 mesi ...............................  0 su 0
--   domande_tesseramento annullate/respinte da > 12 mesi senza vincoli ...  0 su 4
-- Cioè: oggi cancellerebbe 63 contatori di rate limit e nient'altro.
--
-- `reazione` (citata nell'audit) non ha un blocco: la tabella tiene utente_id
-- o gettone anonimo con un solo record oggi, e nessun termine dell'informativa
-- la riguarda direttamente. Da decidere a parte, non da inventare qui.
--
-- SICUREZZA. SECURITY DEFINER con search_path fissato; nessun grant a anon o
-- authenticated (revoca esplicita anche da public). La esegue pg_cron come
-- `postgres`, proprietario della funzione. Ogni blocco scrive quante righe ha
-- toccato con raise notice, e la funzione restituisce lo stesso riepilogo.
--
-- RITORNO INDIETRO: `select cron.unschedule('pulizia-conservazione');`
-- e `drop function public.pulizia_conservazione();`.

create or replace function public.pulizia_conservazione()
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  n_email    integer := 0;
  n_ai       integer := 0;
  n_telegram integer := 0;
  n_lead     integer := 0;
  n_donaz    integer := 0;
  n_contatti integer := 0;
  n_domande  integer := 0;
begin
  -- 1. email_outbox: svuota l'html delle email inviate da più di 90 giorni.
  --    La riga resta (destinatario, oggetto, stato, resend_id, date).
  update public.email_outbox
     set html = ''
   where stato = 'inviata'
     and coalesce(inviata_il, updated_at) < now() - interval '90 days'
     and html <> '';
  get diagnostics n_email = row_count;
  raise notice 'pulizia_conservazione: email_outbox html svuotati = %', n_email;

  -- 2. ai_rate_limit_pubblico: contatori giornalieri più vecchi di 30 giorni.
  delete from public.ai_rate_limit_pubblico
   where giorno < current_date - 30;
  get diagnostics n_ai = row_count;
  raise notice 'pulizia_conservazione: ai_rate_limit_pubblico cancellati = %', n_ai;

  -- 3. telegram_rate_limit: contatori giornalieri più vecchi di 30 giorni.
  delete from public.telegram_rate_limit
   where giorno < current_date - 30;
  get diagnostics n_telegram = row_count;
  raise notice 'pulizia_conservazione: telegram_rate_limit cancellati = %', n_telegram;

  -- 4. download_lead: contatti senza consenso newsletter più vecchi di 12 mesi.
  delete from public.download_lead
   where consenso_newsletter = false
     and created_at < now() - interval '12 months';
  get diagnostics n_lead = row_count;
  raise notice 'pulizia_conservazione: download_lead cancellati = %', n_lead;

  -- 5. donazione_materiale: proposte respinte più vecchie di 12 mesi.
  delete from public.donazione_materiale
   where stato = 'respinta'
     and created_at < now() - interval '12 months';
  get diagnostics n_donaz = row_count;
  raise notice 'pulizia_conservazione: donazione_materiale cancellate = %', n_donaz;

  -- 6. richieste_contatto: pratiche chiuse più vecchie di 12 mesi.
  delete from public.richieste_contatto
   where stato = 'chiusa'
     and created_at < now() - interval '12 months';
  get diagnostics n_contatti = row_count;
  raise notice 'pulizia_conservazione: richieste_contatto cancellate = %', n_contatti;

  -- 7. domande_tesseramento: annullate o respinte più vecchie di 12 mesi,
  --    SOLO se nessuna tabella con FK NO ACTION / RESTRICT le trattiene.
  delete from public.domande_tesseramento d
   where d.stato in ('annullata', 'respinta')
     and d.created_at < now() - interval '12 months'
     and not exists (select 1 from public.pagamenti_tesseramento p
                      where p.domanda_id = d.id)
     and not exists (select 1 from public.solleciti_integrazione s
                      where s.domanda_id = d.id)
     and not exists (select 1 from public.comunicazione_destinatario c
                      where c.domanda_id = d.id)
     and not exists (select 1 from public.assoc_presenza a
                      where a.domanda_id = d.id)
     and not exists (select 1 from public.assoc_delega g
                      where g.delegante_domanda_id = d.id
                         or g.delegato_domanda_id = d.id);
  get diagnostics n_domande = row_count;
  raise notice 'pulizia_conservazione: domande_tesseramento cancellate = %', n_domande;

  return format(
    'email_html=%s ai_rate=%s telegram_rate=%s download_lead=%s donazioni=%s contatti=%s domande=%s',
    n_email, n_ai, n_telegram, n_lead, n_donaz, n_contatti, n_domande
  );
end;
$function$;

comment on function public.pulizia_conservazione() is
  'Pulizia notturna secondo i termini dell''informativa (PRIV-06, 15/9/2026): '
  'html delle email inviate > 90 gg, rate limit > 30 gg, contatti e materiale '
  'non accolto > 12 mesi. Solo pg_cron come postgres.';

revoke execute on function public.pulizia_conservazione() from public, anon, authenticated;

-- Lavoro pianificato, idempotente: stessa forma delle altre migrazioni cron.
do $$ begin perform cron.unschedule('pulizia-conservazione'); exception when others then null; end $$;
select cron.schedule('pulizia-conservazione', '30 3 * * *',
  $$select public.pulizia_conservazione()$$);
