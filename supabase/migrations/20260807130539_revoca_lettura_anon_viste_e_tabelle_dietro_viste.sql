-- [7/8/2026] Le letture pubbliche rimaste: la vista degli autori e le tabelle
-- che si raggiungono solo attraverso una vista.
--
-- CORREZIONE A QUANTO SCRITTO NELLA MIGRAZIONE DELLE 12:51. Li' e' scritto che
-- «nessuna delle viste pubbliche e' security_invoker». Non e' esatto: ne erano
-- state controllate undici su dodici, e la dodicesima e' proprio l'eccezione.
-- v_forum_autore E' security_invoker, quindi la revoca di utente l'ha gia'
-- spenta per l'anonimo. Non si e' rotto niente perche' nessun flusso pubblico
-- la usa: il sito la chiama solo nella curatela del museo e l'app nel forum e
-- nelle storie, sempre dopo il login, e authenticated conserva la lettura su
-- utente. Qui si toglie anche il permesso, cosi' lo stato dichiarato e quello
-- reale coincidono.
revoke select on table v_forum_autore from anon;
delete from permesso_anon_lettura_attesa where tabella = 'v_forum_autore';

-- LE TABELLE DIETRO LE VISTE.
-- Erano rimaste aperte per prudenza, non per necessita': il sito non le
-- interroga mai direttamente, ci arriva sempre passando da una vista, e le
-- viste sono definer. Il censimento delle chiamate del sito e dell'app lo
-- conferma una per una. Chiuderle non toglie niente a nessuno e restringe di
-- sedici tabelle la superficie che un domani una politica sbagliata potrebbe
-- aprire.
revoke select on table
  dizionario_lemma,        -- ci si arriva da glossario_pubblico
  archivio_audio,          -- la voce dei lemmi, dentro la stessa vista
  archivio_categoria,
  archivio_documento,
  documento_pubblico,
  pubblicazione,
  storia,                  -- ci si arriva da v_storia_pubblica
  luoghi_interesse,        -- da v_luoghi_mappa e v_luoghi_pagina
  convenzioni,             -- da convenzioni_pubbliche e v_convenzioni_mappa
  corso, corso_vetrina, modulo_corso, lezione,
  distintivo, livello,     -- cataloghi letti dall'app, dopo il login
  spunto_settimana
from anon;

delete from permesso_anon_lettura_attesa where tabella in (
  'dizionario_lemma','archivio_audio','archivio_categoria','archivio_documento',
  'documento_pubblico','pubblicazione','storia','luoghi_interesse','convenzioni',
  'corso','corso_vetrina','modulo_corso','lezione','distintivo','livello',
  'spunto_settimana');

-- Cosa resta leggibile dall'anonimo, e perche' non si tocca:
--   le undici viste pubbliche (sono la facciata, e sono definer);
--   museo_gg_pezzo / raccolta / raccolta_pezzo, articolo, evento, eventi_esterni,
--   eventi_esterni_date, custodi_memoria, custodi_categoria, convenzioni_punti
--     -> il sito le interroga direttamente, in costruzione o in SSR;
--   config_app -> solo le chiavi pubbliche e il branding, per politica RLS;
--   ai_conversazione / ai_messaggio / ai_sorgente_citata
--     -> la chat di Andreas, che il visitatore non registrato usa dal browser.
