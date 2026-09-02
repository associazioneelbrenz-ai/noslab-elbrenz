-- guardiani_contributori: traccia l'ultimo invito di doppio opt-in marketing
-- (BRIEF CODE 2/9/2026, punto 1 — guasto vivo: la mail di conferma ripartiva
-- a ogni lemma inviato dallo stesso contributore). Con questa colonna la
-- edge function guardiani-contributo puo' evitare di reinviare l'email prima
-- di trenta giorni dall'ultimo invito, e smette del tutto una volta che
-- marketing_double_optin e' vero.

alter table public.guardiani_contributori
  add column if not exists marketing_invitato_il timestamptz;

comment on column public.guardiani_contributori.marketing_invitato_il is
  'Data ultimo invio della mail di doppio opt-in marketing. Non reinviare prima di 30 giorni; mai se marketing_double_optin=true.';
