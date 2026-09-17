-- La pulizia notturna non perde sei blocchi per colpa del settimo
-- 17 settembre 2026. Seguito di PRIV-06
-- (20260915142333_priv06_pulizia_conservazione.sql), che resta valida: qui
-- non cambia una sola condizione di cancellazione, cambia cosa succede
-- quando una di quelle sette istruzioni fallisce.
--
-- IL PROBLEMA, che oggi non si vede perche' non e' ancora successo. I sette
-- blocchi stanno in una transazione sola, quella della funzione. Il settimo
-- e' anche il piu' fragile: cancella da domande_tesseramento, che ha nove
-- chiavi esterne puntate contro, di cui cinque NO ACTION o RESTRICT. Il
-- blocco le esclude tutte e cinque, una per una, con altrettanti
-- `not exists`. Basta pero' che un domani qualcuno aggiunga una tabella con
-- una FK NO ACTION verso domande_tesseramento e si dimentichi questa
-- funzione: il DELETE fallira', e con lui l'intera transazione. I sei
-- blocchi precedenti, che avevano gia' lavorato bene, verrebbero annullati.
--
-- Nessuno se ne accorgerebbe. E' la stessa forma di guasto scritta tre volte
-- in CLAUDE.md: cron.job_run_details segna il lavoro, non l'esito del lavoro,
-- e questa funzione non lascia nessun battito. Sarebbe un lavoro di pulizia
-- che da mesi non pulisce piu' niente, con l'informativa che nel frattempo
-- promette dodici mesi di conservazione.
--
-- LA CURA, due pezzi, entrambi in aggiunta.
--
-- 1. Ogni blocco ha il suo `begin ... exception`, cioe' la sua sottoscrizione
--    di transazione. Il blocco che fallisce annulla se stesso e basta, gli
--    altri sei restano fatti, e il motivo del guasto viene raccolto e
--    restituito invece di sparire nel rollback. Un giro che salva sei tabelle
--    su sette e dice quale ha perso vale piu' di un giro che non salva niente
--    e tace.
-- 2. La pulizia entra nel battito dei servizi. Fino a ieri era l'unico lavoro
--    notturno che tocca dati personali senza nessuna sentinella sopra: se
--    smetteva di girare, a dirlo non c'era nessuno. Adesso scrive un battito
--    a ogni giro, 'ok' quando fila tutto, 'errore' quando almeno un blocco e'
--    caduto, e il cruscotto del direttivo lo vede insieme agli altri nove.
--
-- NON CAMBIA: le sette condizioni di cancellazione, parola per parola; i
-- raise notice; il testo restituito (in coda, solo quando qualcosa e'
-- andato storto, si aggiunge la lista dei guasti); il lavoro pianificato
-- delle 3:30, che non viene toccato; i permessi.

-- ---------------------------------------------------------------------------
-- 1. Il servizio, perche' possa avere un battito.
-- ---------------------------------------------------------------------------
-- Cadenza 30 ore: gira ogni notte, e trenta ore lasciano il margine di un
-- giro saltato senza gridare al lupo. Stessa scelta dei due lavori del radar.
insert into public.servizio (nome, descrizione, cadenza_massima_ore, attivo)
values ('pulizia-conservazione',
        'Pulizia notturna secondo i termini dell''informativa', 30, true)
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------------
-- 2. La funzione, un blocco per volta.
-- ---------------------------------------------------------------------------
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
  guasti     text[] := '{}';
  v_testo    text;
begin
  -- 1. email_outbox: svuota l'html delle email inviate da più di 90 giorni.
  --    La riga resta (destinatario, oggetto, stato, resend_id, date).
  begin
    update public.email_outbox
       set html = ''
     where stato = 'inviata'
       and coalesce(inviata_il, updated_at) < now() - interval '90 days'
       and html <> '';
    get diagnostics n_email = row_count;
    raise notice 'pulizia_conservazione: email_outbox html svuotati = %', n_email;
  exception when others then
    guasti := guasti || ('email_outbox: ' || sqlerrm);
    raise notice 'pulizia_conservazione: email_outbox FALLITO, %', sqlerrm;
  end;

  -- 2. ai_rate_limit_pubblico: contatori giornalieri più vecchi di 30 giorni.
  begin
    delete from public.ai_rate_limit_pubblico
     where giorno < current_date - 30;
    get diagnostics n_ai = row_count;
    raise notice 'pulizia_conservazione: ai_rate_limit_pubblico cancellati = %', n_ai;
  exception when others then
    guasti := guasti || ('ai_rate_limit_pubblico: ' || sqlerrm);
    raise notice 'pulizia_conservazione: ai_rate_limit_pubblico FALLITO, %', sqlerrm;
  end;

  -- 3. telegram_rate_limit: contatori giornalieri più vecchi di 30 giorni.
  begin
    delete from public.telegram_rate_limit
     where giorno < current_date - 30;
    get diagnostics n_telegram = row_count;
    raise notice 'pulizia_conservazione: telegram_rate_limit cancellati = %', n_telegram;
  exception when others then
    guasti := guasti || ('telegram_rate_limit: ' || sqlerrm);
    raise notice 'pulizia_conservazione: telegram_rate_limit FALLITO, %', sqlerrm;
  end;

  -- 4. download_lead: contatti senza consenso newsletter più vecchi di 12 mesi.
  begin
    delete from public.download_lead
     where consenso_newsletter = false
       and created_at < now() - interval '12 months';
    get diagnostics n_lead = row_count;
    raise notice 'pulizia_conservazione: download_lead cancellati = %', n_lead;
  exception when others then
    guasti := guasti || ('download_lead: ' || sqlerrm);
    raise notice 'pulizia_conservazione: download_lead FALLITO, %', sqlerrm;
  end;

  -- 5. donazione_materiale: proposte respinte più vecchie di 12 mesi.
  begin
    delete from public.donazione_materiale
     where stato = 'respinta'
       and created_at < now() - interval '12 months';
    get diagnostics n_donaz = row_count;
    raise notice 'pulizia_conservazione: donazione_materiale cancellate = %', n_donaz;
  exception when others then
    guasti := guasti || ('donazione_materiale: ' || sqlerrm);
    raise notice 'pulizia_conservazione: donazione_materiale FALLITO, %', sqlerrm;
  end;

  -- 6. richieste_contatto: pratiche chiuse più vecchie di 12 mesi.
  begin
    delete from public.richieste_contatto
     where stato = 'chiusa'
       and created_at < now() - interval '12 months';
    get diagnostics n_contatti = row_count;
    raise notice 'pulizia_conservazione: richieste_contatto cancellate = %', n_contatti;
  exception when others then
    guasti := guasti || ('richieste_contatto: ' || sqlerrm);
    raise notice 'pulizia_conservazione: richieste_contatto FALLITO, %', sqlerrm;
  end;

  -- 7. domande_tesseramento: annullate o respinte più vecchie di 12 mesi,
  --    SOLO se nessuna tabella con FK NO ACTION / RESTRICT le trattiene.
  --    E' il blocco per cui esiste questa migrazione: se un giorno una FK
  --    nuova lo fa cadere, cade solo lui.
  begin
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
  exception when others then
    guasti := guasti || ('domande_tesseramento: ' || sqlerrm);
    raise notice 'pulizia_conservazione: domande_tesseramento FALLITO, %', sqlerrm;
  end;

  v_testo := format(
    'email_html=%s ai_rate=%s telegram_rate=%s download_lead=%s donazioni=%s contatti=%s domande=%s',
    n_email, n_ai, n_telegram, n_lead, n_donaz, n_contatti, n_domande
  );

  -- Il battito, dentro la sua rete: annotare non e' il lavoro, e non deve
  -- poterlo far fallire. Stessa promessa che si fanno le edge function.
  begin
    perform registra_battito(
      'pulizia-conservazione',
      case when array_length(guasti, 1) is null then 'ok' else 'errore' end,
      jsonb_build_object(
        'email_html_svuotati', n_email,
        'ai_rate_limit', n_ai,
        'telegram_rate_limit', n_telegram,
        'download_lead', n_lead,
        'donazioni_respinte', n_donaz,
        'richieste_chiuse', n_contatti,
        'domande_annullate', n_domande,
        'guasti', to_jsonb(guasti)
      )
    );
  exception when others then
    null;
  end;

  if array_length(guasti, 1) is not null then
    v_testo := v_testo || ' | GUASTI: ' || array_to_string(guasti, '; ');
  end if;
  return v_testo;
end;
$function$;

comment on function public.pulizia_conservazione() is
  'Pulizia notturna secondo i termini dell''informativa (PRIV-06, 15/9/2026): '
  'html delle email inviate > 90 gg, rate limit > 30 gg, contatti e materiale '
  'non accolto > 12 mesi. Solo pg_cron come postgres. Dal 17/9/2026 ogni blocco '
  'ha la sua sottotransazione (uno che cade non annulla gli altri sei) e il giro '
  'lascia un battito in servizio_battito.';

revoke execute on function public.pulizia_conservazione() from public, anon, authenticated;

-- Il lavoro pianificato delle 3:30 non si tocca: gira gia' e chiama questa
-- stessa funzione per nome.
