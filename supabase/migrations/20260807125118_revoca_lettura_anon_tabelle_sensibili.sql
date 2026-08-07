-- [7/8/2026] Chiusura delle LETTURE anonime sulle tabelle sensibili.
--
-- Il seguito della revoca delle scritture. La RLS gia' fermava queste letture:
-- nessun dato stava uscendo. Ma la RLS e' una serratura, il permesso e' la porta,
-- e una politica scritta male domani apre tutto quello che oggi tiene chiuso.
-- Chi non deve leggere non deve nemmeno avere il permesso di provarci.
--
-- PERCHE' E' SICURO, ed e' la ragione per cui si puo' fare senza rompere il sito:
-- nessuna delle viste pubbliche e' security_invoker. Girano coi privilegi del
-- proprietario, quindi glossario_pubblico continua a leggere dizionario_lemma
-- anche se anon su quella tabella non ha piu' nulla. Se un giorno una vista
-- venisse ricreata con security_invoker=true, si spegnerebbe: e' l'unica
-- controindicazione, ed e' scritta qui perche' non venga scoperta a sito rotto.
--
-- COSA RESTA APERTO e perche': le dodici viste pubbliche, i contenuti che il
-- sito legge davvero con la chiave anonima (museo, articoli, eventi, luoghi,
-- convenzioni, custodi) e le tre tabelle della chat di Andreas, che il
-- visitatore non registrato interroga dal browser. Toglierle spegnerebbe
-- Andreas per chi non e' socio, cioe' per quasi tutti.
--
-- LE EDGE FUNCTION NON SONO TOCCATE: quelle che usano la chiave anonima la
-- passano insieme al token dell'utente (ruolo authenticated) oppure come solo
-- lasciapassare del gateway verso un'altra funzione. Verificate una per una.

-- 1) DENARO E ADESIONI
revoke select on table
  pagamenti_tesseramento, domande_tesseramento, tesseramento, iscrizioni_gita,
  evento_iscrizione, sollecito_quota, solleciti_integrazione, iscrizione_corso,
  progresso_lezione, punti_evento
from anon;

-- 2) PERSONE, CONTATTI, CONSENSI
revoke select on table
  utente, utente_ruolo, ruolo, consenso, richieste_contatto, download_lead,
  newsletter, guardiani_contributori, donazione_materiale, telegram_link,
  telegram_link_token, auth_otp, utente_distintivo, messaggio
from anon;

-- 3) CANALI E RECAPITI DI SERVIZIO
revoke select on table
  telegram_config, telegram_notifica, telegram_rate_limit, email_outbox,
  notifica, notifica_consegna, notifica_preferenza, push_token, push_invito,
  reminder_super_admin
from anon;

-- 4) REGISTRI INTERNI E CONTATORI
revoke select on table
  assoc_riunione, assoc_delibera, assoc_modifica, import_log,
  sala_canale, sala_messaggio, sala_votazione, sala_voto,
  guardiani_digest_invio, ai_rate_limit, ai_rate_limit_pubblico,
  convenzioni_rate_limit, contatti_progressivo, eventi_organizzatori_esclusi,
  _mappa_img_wp, museo_gg_proposta
from anon;

-- 5) IL FORUM: e' la conversazione fra soci, non una bacheca pubblica.
revoke select on table
  forum_post, forum_thread, forum_media, forum_reazione, forum_topic
from anon;

-- 6) LE STANZE INTERNE DI ANDREAS. La chat pubblica NON passa di qui:
--    andreas-chat legge la conoscenza col service role, dentro la funzione.
revoke select on table
  andreas_campagna, andreas_canale, andreas_pubblicazione,
  ai_config_ruolo, andreas_kb, andreas_kb_sorgente
from anon;

-- 7) L'ELENCO DI CIO' CHE PUO' RESTARE LEGGIBILE.
--    Senza questo, un controllo sulle letture non saprebbe distinguere una
--    tabella pubblica per scelta da una riaperta per distrazione: segnalerebbe
--    tutto, e un allarme che suona sempre non e' un allarme.
create table if not exists permesso_anon_lettura_attesa (
  tabella text primary key,
  motivo  text not null,
  deciso_il date not null default current_date
);
comment on table permesso_anon_lettura_attesa is
  'Le tabelle e viste che il visitatore non registrato PUO'' leggere, con il motivo. Aggiungere una riga qui e'' una decisione, non una formalita''.';

alter table permesso_anon_lettura_attesa enable row level security;
drop policy if exists palla_select on permesso_anon_lettura_attesa;
create policy palla_select on permesso_anon_lettura_attesa
  for select to authenticated using (has_ruolo_min((select auth.uid()), 50));

insert into permesso_anon_lettura_attesa (tabella, motivo) values
  ('glossario_pubblico',      'vista, il glossario dei Guardiani'),
  ('v_articoli_pubblici',     'vista, gli articoli pubblicati'),
  ('v_articoli_seo',          'vista, la mappa del sito'),
  ('v_storia_pubblica',       'vista, le storie'),
  ('v_luoghi_mappa',          'vista, la mappa dei luoghi'),
  ('v_luoghi_pagina',         'vista, la scheda di un luogo'),
  ('v_custodi_memoria',       'vista, i Custodi della memoria'),
  ('v_convenzioni_mappa',     'vista, la mappa delle convenzioni'),
  ('convenzioni_pubbliche',   'vista, le convenzioni attive'),
  ('eventi_esterni_pubblici', 'vista, il radar degli eventi'),
  ('v_posti_gita',            'vista, i posti liberi della gita'),
  ('v_forum_autore',          'vista, il solo nome visualizzato di chi scrive'),
  ('museo_gg_pezzo',          'la vetrina della Grande Guerra, letta dal sito'),
  ('museo_gg_raccolta',       'le raccolte tematiche del museo'),
  ('museo_gg_raccolta_pezzo', 'il legame fra raccolta e pezzo'),
  ('articolo',                'gli articoli, letti in costruzione'),
  ('storia',                  'le storie raccolte'),
  ('luoghi_interesse',        'i luoghi sulla mappa'),
  ('custodi_memoria',         'i Custodi della memoria'),
  ('custodi_categoria',       'le categorie dei Custodi'),
  ('evento',                  'gli eventi dell''Associazione'),
  ('eventi_esterni',          'gli eventi del radar'),
  ('eventi_esterni_date',     'le date degli eventi del radar'),
  ('convenzioni',             'le convenzioni'),
  ('convenzioni_punti',       'i punti fisici delle convenzioni'),
  ('dizionario_lemma',        'i lemmi, dietro la vista del glossario'),
  ('archivio_audio',          'la voce che accompagna i lemmi'),
  ('archivio_documento',      'i documenti d''archivio pubblici'),
  ('archivio_categoria',      'le categorie dell''archivio'),
  ('documento_pubblico',      'i documenti istituzionali'),
  ('pubblicazione',           'le pubblicazioni dell''Associazione'),
  ('corso',                   'i corsi'),
  ('corso_vetrina',           'la vetrina dei corsi'),
  ('modulo_corso',            'i moduli dei corsi'),
  ('lezione',                 'le lezioni dei corsi'),
  ('distintivo',              'il catalogo dei riconoscimenti'),
  ('livello',                 'il catalogo dei livelli'),
  ('spunto_settimana',        'lo spunto della settimana'),
  ('config_app',              'solo le chiavi pubbliche e il branding, per politica'),
  ('ai_conversazione',        'la chat di Andreas, usata da chi non e'' registrato'),
  ('ai_messaggio',            'i messaggi della chat di Andreas'),
  ('ai_sorgente_citata',      'le fonti che Andreas cita in fondo alla risposta')
on conflict (tabella) do nothing;

-- 8) IL CONTROLLO, ora su due fronti: le scritture (che non devono esistere)
--    e le letture non dichiarate (che vanno guardate, non necessariamente tolte).
create or replace function public.controllo_permessi_anon()
returns table(tabella text, permesso text)
language sql stable security definer set search_path to 'public'
as $function$
  -- Una scrittura anonima e' sempre un difetto: nessun flusso pubblico ne ha bisogno,
  -- passano tutti da una edge function con il service role.
  select g.table_name::text, g.privilege_type::text
  from information_schema.role_table_grants g
  where g.grantee = 'anon' and g.table_schema = 'public'
    and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    and has_ruolo_min(auth.uid(), 50)
  union all
  -- Una lettura non dichiarata non e' per forza un errore: e' una tabella nuova
  -- di cui nessuno ha ancora deciso se il pubblico debba vederla. Il controllo
  -- chiede la decisione, non la prende.
  select g.table_name::text, 'SELECT non dichiarata'
  from information_schema.role_table_grants g
  where g.grantee = 'anon' and g.table_schema = 'public'
    and g.privilege_type = 'SELECT'
    and not exists (select 1 from permesso_anon_lettura_attesa a where a.tabella = g.table_name)
    and has_ruolo_min(auth.uid(), 50)
  order by 2, 1;
$function$;
