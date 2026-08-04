-- 20260804160000 — l'interruttore della gita non era collegato a niente
--
-- IL GUAIO. `getStatoGita()` legge `config_app` con la chiave anonima e, se non
-- ci riesce, risponde «annullata» per prudenza. La policy pubblica di
-- `config_app` pero' consente ad anon di leggere SOLO le categorie `branding` e
-- `editoriale`, e la chiave della gita e' `feature_flag`. Quindi la lettura non
-- e' mai riuscita, e la funzione ha sempre risposto «annullata» qualunque cosa
-- dicesse la configurazione.
--
-- PERCHE' NESSUNO SE N'E' ACCORTO. La funzione e' nata il 3 agosto proprio per
-- annullare la gita: il ramo di errore produceva esattamente il risultato che
-- si voleva vedere. Un interruttore rotto nella posizione giusta sembra un
-- interruttore che funziona. Se n'e' avuta la prova il 4 agosto, quando la gita
-- e' stata riaperta in `config_app` e le tre pagine hanno continuato a dire che
-- era annullata.
--
-- E' la lezione del fail-closed: proteggere e' giusto, ma un ramo di sicurezza
-- che non si distingue dal funzionamento normale non e' una rete, e' una benda
-- sugli occhi. Qui la si toglie facendo funzionare la lettura; il fail-closed
-- resta, perche' fra invitare a pagare per un viaggio che non si fa e nascondere
-- per errore un invito legittimo, il danno recuperabile e' il secondo.
--
-- LA CORREZIONE. Un elenco ESPLICITO di chiavi che il sito pubblico deve poter
-- leggere. Non si apre la categoria `feature_flag` in blocco: un domani ci
-- finirebbe dentro un interruttore che pubblico non e', e nessuno andrebbe a
-- ricontrollare questa policy. Aggiungere una chiave qui deve restare un atto
-- deliberato, che si legge in una migrazione.

create or replace function public.config_app_chiavi_pubbliche()
returns text[]
language sql
immutable
as $$
  select array[
    -- Stato della gita sociale: lo leggono la landing italiana, tedesca e
    -- inglese, la home e la pagina di iscrizione. E' informazione che il
    -- visitatore vede comunque a schermo: tenerla chiusa non protegge niente
    -- e rompe le pagine.
    'gita_giochi_medievali_2026_stato'
  ]::text[];
$$;

comment on function public.config_app_chiavi_pubbliche() is
 'Elenco esplicito delle chiavi di config_app che il sito pubblico puo'' leggere con la chiave anonima. Aggiungerne una e'' un atto deliberato: NON aprire categorie intere.';

do $$ begin
  create policy config_app_select_chiavi_pubbliche on public.config_app
    for select
    using (chiave = any (public.config_app_chiavi_pubbliche()));
exception when duplicate_object then null; end $$;
