-- DECISIONE 1 del 2/8/2026: il socio ha 100 domande al giorno, come dice la
-- policy in config_app (andreas_soci.rate_limit.domande_per_giorno).
--
-- Nota su cosa NON era rotto: il brief diceva "oggi il socio ne ha 5", ma 5 e'
-- soltanto il fallback scritto nella edge (`config?.limite_giornaliero ?? 5`),
-- che non entra mai in gioco perche' la riga in ai_config_ruolo esiste. Il
-- valore vero era 50. La struttura «limite letto da configurazione e non
-- cablato» c'era gia': qui si corregge il dato, non il codice.
update public.ai_config_ruolo
   set limite_giornaliero = 100
 where ruolo_nome = 'socio' and limite_giornaliero <> 100;

-- Registrazione versionata della revisione della policy applicata dalla chat
-- il 2/8: quota a 20 euro in un posto solo, e il messaggio di limite raggiunto
-- riscritto senza la parola "illimitato". Cento al giorno e' generoso ma e' un
-- tetto: prometterne l'assenza e fermare qualcuno alla centounesima e' una
-- piccola bugia che si paga proprio col socio piu' appassionato.
-- Idempotente: jsonb_set riscrive gli stessi valori.
update public.config_app
   set valore = jsonb_set(
         jsonb_set(
           valore,
           '{quota_associativa_annua_eur}',
           '20'::jsonb,
           true
         ),
         '{andreas_pubblico,dopo_raggiunto_limite}',
         to_jsonb('Hai usato le 3 domande gratuite di oggi. Registrati gratis come ospite per continuare, oppure diventa socio con €20/anno: i soci hanno 100 domande al giorno, l''archivio delle proprie ricerche e l''accesso alle fonti riservate.'::text),
         true
       )
 where chiave = 'andreas_access_policy';
