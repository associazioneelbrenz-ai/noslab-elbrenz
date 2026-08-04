-- 20260804172000 — le origini delle email in coda
--
-- GIA' APPLICATA in produzione. Qui si versiona.
--
-- `origine` ammetteva tre valori: chat, pannello, sistema. Le comunicazioni
-- della newsletter sono una cosa diversa da tutte e tre, e vanno distinte:
-- quando fra sei mesi si guardera' perche' il tetto giornaliero di Resend e'
-- stato consumato, «sistema» non dira' niente mentre «newsletter-campagna»
-- dira' tutto.
--
-- Trovato in collaudo il 4/8: l'inserimento in coda falliva su questo vincolo
-- e la funzione, che non ne guardava l'errore, rispondeva «ti abbiamo scritto»
-- a chi non aveva ricevuto niente. Corretto anche quello.
alter table public.email_outbox drop constraint if exists email_outbox_origine_check;
alter table public.email_outbox add constraint email_outbox_origine_check
  check (origine in (
    'chat', 'pannello', 'sistema',
    'newsletter-conferma',            -- doppio opt-in, primo passo
    'newsletter-prova',               -- la prova a se stessi prima di spedire
    'newsletter-campagna',            -- l'invio vero di una campagna
    'newsletter-richiesta-consenso'   -- la richiesta una tantum ai contatti storici
  ));

comment on column public.email_outbox.origine is
 'Da dove viene questa email. Le origini newsletter-* servono a distinguere le comunicazioni di massa dalle transazionali quando si guarda il consumo del tetto giornaliero.';
