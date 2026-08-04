-- 20260804140000 — l'anagrafica che il registro cartaceo ha e il database no
--
-- PERCHE'. Il registro cartaceo tenuto dal 2009 contiene, per centodieci
-- persone, campi che a sistema non esistono affatto: il cognome separato dal
-- nome, la residenza, il telefono, la categoria di socio, lo stato, le note.
-- Finche' mancano, il libro soci digitale non puo' sostituire quello cartaceo
-- e l'Associazione continua a tenerne due.
--
-- SOLO AGGIUNTE. Nessuna colonna esistente viene toccata, e in particolare
-- `nome`, che oggi contiene nome e cognome insieme per trentacinque righe.
-- `cognome` gli si affianca e i due convivono: separare i dati esistenti lo fa
-- una persona che puo' controllare caso per caso, non uno script che spezza
-- sulla prima spaziatura e trasforma «Maria Luisa Battistini» in «Maria» piu'
-- «Luisa Battistini».
--
-- NIENTE E' OBBLIGATORIO. I soci storici verranno completati un po' per volta:
-- un vincolo di obbligatorieta' bloccherebbe il lavoro invece di aiutarlo.
--
-- IL VALORE PREDEFINITO VALE PER LE RIGHE NUOVE, NON PER QUELLE VECCHIE.
-- `add column ... default` in Postgres riempirebbe anche le trentacinque righe
-- esistenti. Per `categoria_socio` sarebbe una bugia: fra i soci del 2009 ci
-- sono dei fondatori, e scrivere «ordinario» su tutti significherebbe inventare
-- un dato e tacerlo, che e' la cosa da cui questo lavoro cerca di uscire.
-- Quindi si aggiunge la colonna SENZA valore predefinito e glielo si mette
-- dopo: le righe vecchie restano vuote e si vede che sono da completare, le
-- nuove partono con il valore giusto.

alter table public.domande_tesseramento
  add column if not exists cognome                text,
  add column if not exists residenza_via          text,
  add column if not exists residenza_civico       text,
  add column if not exists residenza_cap          text,
  add column if not exists residenza_comune       text,
  add column if not exists residenza_provincia    text,
  add column if not exists telefono               text,
  add column if not exists categoria_socio        text,
  add column if not exists stato_socio            text,
  add column if not exists cessazione_data        date,
  add column if not exists cessazione_motivo      text,
  add column if not exists note_segreteria        text,
  add column if not exists codice_fiscale         text,
  -- Chi ha completato la scheda e quando. Il dettaglio di cosa e' cambiato sta
  -- in anagrafica_modifica: qui resta il colpo d'occhio.
  add column if not exists anagrafica_aggiornata_il timestamptz,
  add column if not exists anagrafica_aggiornata_da uuid;

-- I valori predefiniti, che da qui in avanti valgono per le righe NUOVE.
alter table public.domande_tesseramento alter column categoria_socio set default 'ordinario';
alter table public.domande_tesseramento alter column stato_socio     set default 'attivo';

-- I vincoli accettano tutti il vuoto: un elenco chiuso serve a impedire i
-- valori sbagliati, non a pretendere che il dato ci sia gia'.
do $$ begin
  alter table public.domande_tesseramento add constraint domande_categoria_socio_valida
    check (categoria_socio is null or categoria_socio in ('ordinario','fondatore','onorario','sostenitore'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.domande_tesseramento add constraint domande_stato_socio_valido
    check (stato_socio is null or stato_socio in ('attivo','cessato'));
exception when duplicate_object then null; end $$;

-- I motivi sono quelli dello statuto, non un campo libero: il libro degli
-- associati deve registrare le uscite con la causa prevista, non con una frase.
do $$ begin
  alter table public.domande_tesseramento add constraint domande_cessazione_motivo_valido
    check (cessazione_motivo is null or cessazione_motivo in ('recesso','decadenza_morosita','esclusione','decesso'));
exception when duplicate_object then null; end $$;

-- Una cessazione senza data e senza motivo non e' una cessazione registrata:
-- e' un socio sparito dal registro senza che si sappia quando ne' perche'.
do $$ begin
  alter table public.domande_tesseramento add constraint domande_cessazione_coerente
    check (stato_socio is distinct from 'cessato'
           or (cessazione_data is not null and cessazione_motivo is not null));
exception when duplicate_object then null; end $$;

-- Controlli larghi, giusto per intercettare il campo sbagliato: un CAP di tre
-- cifre o un nome finito nella casella del codice fiscale.
do $$ begin
  alter table public.domande_tesseramento add constraint domande_residenza_cap_valido
    check (residenza_cap is null or residenza_cap ~ '^[0-9]{5}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.domande_tesseramento add constraint domande_residenza_provincia_valida
    check (residenza_provincia is null or residenza_provincia ~ '^[A-Za-z]{2}$');
exception when duplicate_object then null; end $$;

-- Il codice fiscale resta FACOLTATIVO e non deve diventare obbligatorio: il
-- libro degli associati non lo richiede, il registro cartaceo non ce l'ha in
-- centodieci schede, e ogni campo obbligatorio in piu' su un modulo pubblico
-- e' gente che abbandona a meta'.
do $$ begin
  alter table public.domande_tesseramento add constraint domande_codice_fiscale_plausibile
    check (codice_fiscale is null or codice_fiscale ~ '^[A-Za-z0-9]{11,16}$');
exception when duplicate_object then null; end $$;

comment on column public.domande_tesseramento.cognome is
 'Cognome separato. Convive con `nome`, che per le righe storiche contiene nome e cognome insieme e NON va svuotato da uno script: la separazione dei dati esistenti si fa a mano, controllando caso per caso.';
comment on column public.domande_tesseramento.categoria_socio is
 'ordinario | fondatore | onorario | sostenitore. Vuoto sulle righe storiche: e'' da completare dal registro cartaceo, non da presumere.';
comment on column public.domande_tesseramento.stato_socio is
 'attivo | cessato. Vuoto significa attivo per un socio ammesso: finche'' non si dichiara una cessazione, con la sua data e il suo motivo, il socio e'' dentro.';
comment on column public.domande_tesseramento.codice_fiscale is
 'FACOLTATIVO e da non rendere obbligatorio. Serve semmai a chi dona, non a chi si tessera.';
comment on column public.domande_tesseramento.note_segreteria is
 'Testo libero a uso interno della segreteria. Non compare mai in pagine pubbliche.';

-- Lo storico delle modifiche anagrafiche.
--
-- I dati anagrafici, al contrario degli incassi, SI CORREGGONO: un indirizzo
-- cambia, un cognome era scritto male. Proprio per questo serve sapere chi ha
-- cambiato cosa e quando, altrimenti una correzione sbagliata e' indistinguibile
-- da un dato sempre stato cosi'. Si tiene il prima e il dopo dei soli campi
-- toccati, non l'intera riga: cosi' la storia si legge invece di andare
-- confrontata a mano.
create table if not exists public.anagrafica_modifica (
  id            uuid primary key default gen_random_uuid(),
  domanda_id    uuid not null references public.domande_tesseramento(id) on delete cascade,
  modificato_da uuid,
  modificato_il timestamptz not null default now(),
  prima         jsonb not null default '{}'::jsonb,
  dopo          jsonb not null default '{}'::jsonb
);

create index if not exists idx_anagrafica_modifica_domanda
  on public.anagrafica_modifica(domanda_id, modificato_il desc);

comment on table public.anagrafica_modifica is
 'Storico delle modifiche ai dati anagrafici del socio: chi, quando, e i soli campi cambiati con il valore prima e dopo. Ci scrive solo l''edge scheda-domanda con la chiave di servizio.';

alter table public.anagrafica_modifica enable row level security;
-- Nessuna policy: la tabella non si legge ne' si scrive dall'API pubblica. Ci
-- arriva solo la chiave di servizio, che le policy non le guarda.
revoke all on public.anagrafica_modifica from anon, authenticated;
