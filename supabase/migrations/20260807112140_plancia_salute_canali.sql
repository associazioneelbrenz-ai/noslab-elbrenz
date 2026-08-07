-- LA PLANCIA · blocco 3, la salute dei canali (7/8/2026)
--
-- E' la parte che avrebbe evitato tre incidenti su tre: le push mute per nove
-- giorni, la posta ferma senza che nessuno lo sapesse, i lavori pianificati che
-- fallivano ogni quarto d'ora in silenzio. Nessuno dei tre si e' fatto notare:
-- li abbiamo trovati guardando, e guardare non e' un metodo.
--
-- Una regola sopra tutte: quando un dato NON e' ottenibile, si dice. Un riquadro
-- vuoto e un riquadro che non sa sono cose diverse, e confonderle e' il difetto
-- che stiamo togliendo da tutto l'ecosistema.

create or replace function public.plancia_salute()
returns table (
  gruppo text, voce text, valore text, dettaglio text, allarme boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_muto int;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;

  select coalesce((c.valore#>>'{}')::int, 7) into v_muto
    from config_app c where c.chiave = 'plancia_giorni_canale_muto';
  v_muto := coalesce(v_muto, 7);

  -- ---- NOTIFICHE, un tipo per riga ----------------------------------------
  -- Il campanello vero: un tipo che TACE DA TROPPO. E' il difetto che ha tenuto
  -- le push ferme dal 29 luglio al 6 agosto senza che nessuno lo sapesse.
  return query
  select 'Notifiche'::text, t.tipo,
         coalesce(to_char(max(n.created_at), 'DD/MM HH24:MI'), 'mai'),
         format('%s negli ultimi 7 giorni', count(distinct n.url) filter (where n.created_at > now() - interval '7 days')),
         coalesce(max(n.created_at) < now() - make_interval(days => v_muto), true)
  from (values ('museo'),('articolo'),('evento'),('glossario'),('direttivo'),('comunita')) as t(tipo)
  left join notifica n on n.tipo = t.tipo
  group by t.tipo;

  -- Dispositivi: se scende, qualcuno le ha spente e vale la pena chiedersi perche'.
  return query
  select 'Notifiche', 'Dispositivi attivi',
         (select count(*)::text from push_token where attivo),
         (select format('%s disattivati in tutto', count(*)) from push_token where not attivo),
         (select count(*) from push_token where attivo) = 0;

  return query
  select 'Notifiche', 'Consegne fallite (14 giorni)',
         (select count(*)::text from notifica_consegna where esito='fallita' and quando > now() - interval '14 days'),
         (select coalesce(string_agg(distinct dettaglio, '; '), 'nessun dettaglio')
            from notifica_consegna where esito='fallita' and quando > now() - interval '14 days'),
         (select count(*) from notifica_consegna where esito='fallita' and quando > now() - interval '14 days') > 0;

  return query
  select 'Notifiche', 'Annunci a zero destinatari (14 giorni)',
         (select count(*)::text from notifica_consegna where esito='nessun_destinatario' and quando > now() - interval '14 days'),
         'Un annuncio che non raggiunge nessuno non e un successo',
         (select count(*) from notifica_consegna where esito='nessun_destinatario' and quando > now() - interval '14 days') > 0;

  -- ---- POSTA ---------------------------------------------------------------
  return query
  select 'Posta', 'In coda',
         (select count(*)::text from email_outbox where stato <> 'inviata'),
         (select coalesce(string_agg(distinct stato, ', '), '') from email_outbox where stato <> 'inviata'),
         (select count(*) from email_outbox where stato <> 'inviata') > 0;

  return query
  select 'Posta', 'Inviate oggi',
         (select count(*)::text from email_outbox where inviata_il::date = current_date),
         -- Il limite giornaliero del piano Resend attuale e cento: e il numero
         -- che dice se una convocazione all assemblea entra in una giornata.
         format('ne restano %s sulle 100 del piano',
                100 - (select count(*) from email_outbox where inviata_il::date = current_date)),
         (select count(*) from email_outbox where inviata_il::date = current_date) >= 90;

  return query
  select 'Posta', 'Fallite',
         (select count(*)::text from email_outbox where stato = 'errore'),
         (select coalesce(string_agg(distinct errore, '; '), 'nessuna')
            from email_outbox where stato = 'errore'),
         (select count(*) from email_outbox where stato = 'errore') > 0;

  -- ---- LAVORI PIANIFICATI --------------------------------------------------
  -- Un lavoro che non gira da giorni deve saltare all'occhio: e' esattamente il
  -- caso dell'annuncio del glossario, che falliva ogni quarto d'ora per un
  -- `min(uuid)` e nessuno lo sapeva.
  return query
  select 'Lavori pianificati', j.jobname,
         coalesce((select to_char(max(r.start_time), 'DD/MM HH24:MI')
                     from cron.job_run_details r
                    where r.jobid = j.jobid and r.status = 'succeeded'), 'mai riuscito'),
         coalesce((select r.status || ' · ' || left(coalesce(r.return_message,''), 90)
                     from cron.job_run_details r
                    where r.jobid = j.jobid order by r.start_time desc limit 1), j.schedule),
         coalesce((select r.status <> 'succeeded'
                     from cron.job_run_details r
                    where r.jobid = j.jobid order by r.start_time desc limit 1), false)
  from cron.job j where j.active;

  -- ---- ANDREAS -------------------------------------------------------------
  return query
  select 'Andreas', 'Conversazioni (7 giorni)',
         (select count(*)::text from ai_conversazione where created_at > now() - interval '7 days'),
         (select format('%s in tutto', count(*)) from ai_conversazione), false;

  return query
  select 'Andreas', 'Biblioteca',
         (select coalesce(sum(n_chunks), 0)::text || ' frammenti' from andreas_kb_sorgente),
         (select coalesce('ultimo aggiornamento ' || to_char(max(ingestato_il), 'DD/MM/YYYY'), 'mai ingerita')
            from andreas_kb_sorgente), false;

  -- ---- PIATTAFORME ---------------------------------------------------------
  -- Il consumo Netlify NON e leggibile dal database: dirlo e meglio che lasciare
  -- un riquadro vuoto, che si scambia per «tutto a posto».
  return query
  select 'Piattaforme', 'Consumo Netlify', 'non leggibile da qui',
         'Le invocazioni si vedono solo nel pannello Netlify. La soglia del piano gratuito e stata superata una volta il 6 agosto.',
         false;
end;
$$;

grant execute on function public.plancia_salute() to authenticated;;
