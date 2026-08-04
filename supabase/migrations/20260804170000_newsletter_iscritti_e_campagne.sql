-- 20260804170000 — la voce dell'Associazione
--
-- PERCHE'. L'Associazione ha trenta soci, un sito, un bot, un assistente, e
-- nessun modo di rivolgersi a tutti insieme. `newsletter` non e' la lista degli
-- iscritti: e' la tabella delle CAMPAGNE, ed e' vuota. `consenso` ha diciotto
-- righe, tutte `privacy` e `termini`: nessun consenso alla newsletter esiste.
-- Ogni comunicazione finora e' stata scritta a mano, una persona per volta.
--
-- Non e' uno strumento di marketing. E' la possibilita', per un'associazione
-- culturale, di dire ai propri soci cosa sta facendo.

-- =========================================================================
-- 1. GLI ISCRITTI, che oggi non esistono
-- =========================================================================
--
-- I quattro stati non sono sfumature della stessa cosa: descrivono situazioni
-- giuridicamente diverse, e tenerli distinti e' la differenza fra poter
-- dimostrare una cosa e doverla giurare.
--
-- Nessuno si CANCELLA da questa tabella, nemmeno chi si disiscrive: la riga
-- con lo stato `disiscritto` e la sua data e' la prova che la disiscrizione e'
-- stata rispettata. Cancellarla vorrebbe dire non poterlo piu' dimostrare, e
-- riscrivere quella persona alla prima importazione distratta.
create table if not exists public.newsletter_iscritto (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  nome            text,

  stato           text not null default 'in_attesa'
                  check (stato in ('in_attesa','confermato','disiscritto','rimbalzato')),

  -- Da dove arriva: il modulo del sito, la richiesta ai contatti storici, un
  -- materiale scaricato. Serve a sapere, fra due anni, perche' abbiamo questo
  -- indirizzo. E' la domanda che fa un'autorita' di controllo.
  origine         text not null default 'modulo_sito',

  -- Il collegamento al socio, quando c'e'. Nullo per chi socio non e': la
  -- lista non e' un sottoinsieme del libro soci ne' viceversa.
  utente_id       uuid references auth.users(id) on delete set null,
  domanda_id      uuid references public.domande_tesseramento(id) on delete set null,

  iscritto_il     timestamptz not null default now(),

  -- DOPPIO OPT-IN. Data e indirizzo IP della conferma: senza questi due, un
  -- consenso e' un'affermazione senza prova.
  confermato_il   timestamptz,
  confermato_ip   text,

  disiscritto_il  timestamptz,
  disiscritto_ip  text,
  -- Da quale campagna si e' disiscritto: le disiscrizioni sono la misura piu'
  -- onesta della qualita' di cio' che si scrive.
  disiscritto_da_campagna uuid,

  rimbalzato_il   timestamptz,
  rimbalzo_motivo text,

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Un indirizzo, una riga. Senza questo, due iscrizioni della stessa persona
-- diventano due email identiche nella stessa casella.
create unique index if not exists idx_newsletter_iscritto_email
  on public.newsletter_iscritto (lower(email));
create index if not exists idx_newsletter_iscritto_stato
  on public.newsletter_iscritto (stato);

-- Gli stati devono essere coerenti con le loro date: uno stato `confermato`
-- senza data di conferma e' un consenso che non si puo' dimostrare, ed e'
-- esattamente cio' che questa tabella esiste per evitare.
do $$ begin
  alter table public.newsletter_iscritto add constraint newsletter_iscritto_date_coerenti
    check (
      (stato <> 'confermato'  or confermato_il  is not null) and
      (stato <> 'disiscritto' or disiscritto_il is not null) and
      (stato <> 'rimbalzato'  or rimbalzato_il  is not null)
    );
exception when duplicate_object then null; end $$;

comment on table public.newsletter_iscritto is
 'Iscritti alla newsletter, distinti dalle campagne (tabella `newsletter`). Doppio opt-in obbligatorio: solo `confermato` riceve. Le righe NON si cancellano: `disiscritto` con la sua data e'' la prova che la revoca e'' stata rispettata.';

alter table public.newsletter_iscritto enable row level security;
-- Nessuna policy: ci si arriva solo dalle edge con la chiave di servizio. Una
-- lista di indirizzi email non si espone all'API pubblica.
revoke all on public.newsletter_iscritto from anon, authenticated;

-- =========================================================================
-- 2. LE CAMPAGNE: si estende `newsletter`, non se ne fa un'altra
-- =========================================================================
alter table public.newsletter
  add column if not exists stato              text not null default 'bozza',
  add column if not exists gruppo             text,
  add column if not exists invio_iniziato_il  timestamptz,
  add column if not exists invio_finito_il    timestamptz,
  add column if not exists consegnati         integer not null default 0,
  add column if not exists falliti            integer not null default 0,
  -- LA PROVA A SE STESSI. Finche' questa data e' vuota, la campagna non parte.
  -- E' la regola che in questa casa ha gia' evitato dei guai.
  add column if not exists provata_il         timestamptz,
  add column if not exists provata_da         uuid,
  add column if not exists creata_da          uuid;

do $$ begin
  alter table public.newsletter add constraint newsletter_stato_valido
    check (stato in ('bozza','in_invio','inviata','annullata'));
exception when duplicate_object then null; end $$;

-- Il destinatario si sceglie per GRUPPO, mai a mano: un elenco compilato a
-- mano e' un elenco in cui prima o poi entra qualcuno che non doveva.
do $$ begin
  alter table public.newsletter add constraint newsletter_gruppo_valido
    check (gruppo is null or gruppo in ('tutti','soci_in_regola','non_soci'));
exception when duplicate_object then null; end $$;

comment on column public.newsletter.stato is
 'bozza | in_invio | inviata | annullata. Una campagna gia'' inviata NON si rimanda: si duplica in una bozza nuova.';
comment on column public.newsletter.provata_il is
 'Quando la campagna e'' stata provata su un indirizzo dell''Associazione. Finche'' e'' vuota l''invio vero e'' rifiutato.';

-- =========================================================================
-- 3. IL REGISTRO DEGLI INVII: una riga per campagna e destinatario
-- =========================================================================
--
-- Il vincolo unico e' il cuore di tutto. Se un invio si interrompe a meta' e
-- qualcuno lo rilancia, la seconda esecuzione sbatte sul vincolo per chi e'
-- gia' stato servito e riparte da dove era arrivata, invece di rimandare tutto
-- a tutti. E' la stessa difesa dei promemoria della quota, e nasce dallo
-- stesso principio: la riga si scrive PRIMA di spedire, e se il registro non
-- si scrive l'email non parte.
create table if not exists public.newsletter_invio (
  id           uuid primary key default gen_random_uuid(),
  campagna_id  uuid not null references public.newsletter(id) on delete cascade,
  iscritto_id  uuid references public.newsletter_iscritto(id) on delete set null,
  email        text not null,
  outbox_id    uuid references public.email_outbox(id) on delete set null,
  creato_il    timestamptz not null default now()
);

create unique index if not exists idx_newsletter_invio_unico
  on public.newsletter_invio (campagna_id, lower(email));

comment on table public.newsletter_invio is
 'Una riga per campagna e destinatario, con vincolo unico: impedisce il doppio invio e permette a un invio interrotto di riprendere da dove era arrivato.';

alter table public.newsletter_invio enable row level security;
revoke all on public.newsletter_invio from anon, authenticated;

-- =========================================================================
-- 4. I GRUPPI, letti dalle viste che gia' decidono chi e' cosa
-- =========================================================================
--
-- DUE BASI GIURIDICHE DIVERSE, e per questo due strade diverse.
--
-- Ai SOCI l'Associazione si rivolge in forza del rapporto associativo: una
-- comunicazione sociale non e' marketing e non richiede un consenso alla
-- newsletter. Il gruppo `soci_in_regola` percio' si legge da
-- `v_soci_in_regola`, non dalla lista.
--
-- A CHI SOCIO NON E' si scrive solo con il consenso, confermato col doppio
-- opt-in. Il gruppo `non_soci` si legge dalla lista e solo dai confermati.
--
-- MA LA VOLONTA' DELLA PERSONA VIENE PRIMA DI TUTTO. Chi si e' disiscritto,
-- chi e' rimbalzato e chi ha un'iscrizione in attesa non compare in NESSUN
-- gruppo, socio o no: un socio che ha detto «non scrivetemi» ha detto
-- «non scrivetemi», e il rapporto associativo non e' un lasciapassare.
create or replace view public.v_newsletter_destinatari as
with esclusi as (
  select lower(email) as email
  from public.newsletter_iscritto
  where stato in ('in_attesa','disiscritto','rimbalzato')
),
soci as (
  select distinct lower(v.email) as email, v.nome
  from public.v_soci_in_regola v
  where v.posizione in ('in_regola','in_regola_per_deroga')
    and v.email is not null
),
confermati as (
  select lower(i.email) as email, i.nome
  from public.newsletter_iscritto i
  where i.stato = 'confermato'
)
select 'soci_in_regola'::text as gruppo, s.email, s.nome
from soci s
where s.email not in (select email from esclusi)
union all
select 'non_soci'::text, c.email, c.nome
from confermati c
where c.email not in (select email from soci)
union all
-- «Tutti» e' l'unione dei due, non una terza lista: cosi' non puo' succedere
-- che qualcuno stia in «tutti» e in nessuno dei due gruppi che lo compongono.
select 'tutti'::text, u.email, u.nome from (
  select s.email, s.nome from soci s where s.email not in (select email from esclusi)
  union
  select c.email, c.nome from confermati c where c.email not in (select email from soci)
) u;

comment on view public.v_newsletter_destinatari is
 'I tre gruppi di destinatari. `soci_in_regola` viene da v_soci_in_regola (base giuridica: rapporto associativo), `non_soci` dai soli iscritti confermati (base: consenso). Chi e'' in attesa, disiscritto o rimbalzato e'' escluso da tutti e tre.';

revoke all on public.v_newsletter_destinatari from anon, authenticated;

-- =========================================================================
-- 5. IL TETTO GIORNALIERO DI RESEND
-- =========================================================================
--
-- Il piano attuale consente cento email al giorno. Una campagna che sfonda il
-- limite non deve fallire a meta': meta' dei soci informati e meta' no e' il
-- risultato peggiore possibile, perche' nessuno sa quale meta' e'.
create or replace function public.email_residuo_giornaliero(p_tetto integer default 100)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, p_tetto - (
    select count(*)::int from public.email_outbox
    where stato in ('pronta','in_invio','inviata')
      and created_at >= date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'
  ));
$$;

comment on function public.email_residuo_giornaliero(integer) is
 'Quante email si possono ancora accodare oggi senza sfondare il tetto di Resend. Conta le righe di email_outbox gia'' pronte, in volo o inviate: una riga accodata e'' gia'' impegnata anche se non e'' ancora partita.';

revoke execute on function public.email_residuo_giornaliero(integer) from anon, authenticated, public;
