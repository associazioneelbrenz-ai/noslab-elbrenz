-- 20260804210000 — il canale istituzionale
--
-- DUE COSE DIVERSE VIAGGIAVANO SULLO STESSO BINARIO, ed e' un problema
-- statutario prima che tecnico.
--
-- Lo statuto 2014: «la convocazione deve pervenire, per iscritto, ai soci
-- almeno quindici giorni prima della data dell'Assemblea». Ai SOCI. Tutti, non
-- solo quelli in regola: chi non e' in regola perde il diritto di VOTO, non il
-- diritto di essere CONVOCATO.
--
-- E c'e' il seguito, che e' la parte grave. Se la convocazione viaggia sul
-- sistema newsletter porta con se' il collegamento di disiscrizione. Un socio
-- che un giorno clicca «non voglio piu' ricevere» smette di ricevere ANCHE le
-- convocazioni, e un'assemblea a cui un socio non e' stato convocato e'
-- impugnabile. Sarebbe uno strumento che permette a una persona di
-- autoescludersi dalla vita associativa con un clic, senza capire cosa sta
-- facendo.
--
-- Quindi: comunicazioni istituzionali senza consenso e SENZA DISISCRIZIONE,
-- base giuridica il rapporto associativo. La newsletter divulgativa resta
-- com'e', con consenso e disiscrizione sempre disponibile. Un socio puo' essere
-- fuori dalla seconda e dentro la prima: e' normale ed e' giusto.

-- =========================================================================
-- 1. IL GRUPPO: tutti gli associati, letto dallo STATO DELLA DOMANDA
-- =========================================================================
--
-- Non dalla posizione contributiva. Non dal consenso. Non dalla lista della
-- newsletter. Chi ha una domanda approvata e non e' cessato: punto.
--
-- Una riga per PERSONA, non per indirizzo: e' la differenza che rende
-- dimostrabile una convocazione. Se domani qualcuno impugna un'assemblea, cio'
-- che conta e' poter dire che QUEL SOCIO e' stato convocato, non che quella
-- casella e' stata raggiunta.
create or replace view public.v_associati_istituzionale as
select
  d.id            as domanda_id,
  d.numero_socio,
  d.nome,
  d.cognome,
  lower(d.email)  as email,
  d.categoria_socio,
  d.numero_tessera
from public.domande_tesseramento d
where d.stato = 'approvata'
  and coalesce(d.numero_tessera, -1) <> 0          -- via l'account di servizio
  and coalesce(d.stato_socio, 'attivo') <> 'cessato'
  and d.email is not null and btrim(d.email) <> '';

comment on view public.v_associati_istituzionale is
 'Tutti gli associati raggiungibili per le comunicazioni dovute per statuto: domanda approvata, non cessati, escluso l''account di servizio. UNA RIGA PER PERSONA, non per indirizzo: una convocazione si dimostra sul socio, non sulla casella. Non guarda ne'' la quota ne'' il consenso alla newsletter.';

revoke all on public.v_associati_istituzionale from anon, authenticated;

-- =========================================================================
-- 2. LE CASELLE CONDIVISE
-- =========================================================================
--
-- Trenta soci, ventotto indirizzi: due coppie condividono la casella. Per una
-- newsletter non cambia niente. Per una convocazione si': se a quell'indirizzo
-- arriva un messaggio intestato a una sola delle due persone, l'altra
-- formalmente non e' stata convocata.
--
-- Quindi un messaggio solo per indirizzo, ma con dentro i NOMI DI TUTTI i soci
-- che ricevono li'. Due copie identiche alla stessa casella sembrano un errore
-- e fanno perdere fiducia; un messaggio che nomina entrambi vale per entrambi.
create or replace view public.v_associati_per_indirizzo as
select
  a.email,
  array_agg(a.domanda_id order by a.numero_socio nulls last)   as domande,
  array_agg(a.numero_socio order by a.numero_socio nulls last) as numeri_socio,
  array_agg(coalesce(a.nome, '') order by a.numero_socio nulls last) as nomi,
  count(*)                                                     as quanti_soci
from public.v_associati_istituzionale a
group by a.email;

comment on view public.v_associati_per_indirizzo is
 'Un indirizzo, una riga, con l''elenco dei soci che ricevono li''. Serve a mandare UN messaggio che nomina TUTTI: due soci che condividono la casella di famiglia devono risultare convocati entrambi.';

revoke all on public.v_associati_per_indirizzo from anon, authenticated;

-- =========================================================================
-- 3. IL REGISTRO DELLE COMUNICAZIONI ISTITUZIONALI
-- =========================================================================
--
-- Per una newsletter basta sapere quanti sono partiti. Per una convocazione
-- serve poter dimostrare, anche a distanza di anni, che QUEL SOCIO e' stato
-- convocato QUEL GIORNO con QUEL CONTENUTO.
--
-- Percio' qui si conserva il contenuto ESATTO inviato, non un riferimento a un
-- modello che un domani potrebbe essere cambiato: un registro che rimanda a un
-- modello modificabile non prova niente.
--
-- E le righe NON SI CANCELLANO. Se un socio cessa, la traccia delle
-- convocazioni che ha ricevuto resta: serve proprio quando quella persona non
-- c'e' piu' per confermarlo a voce.
create table if not exists public.comunicazione_istituzionale (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'comunicazione'
                 check (tipo in ('convocazione_assemblea','quota','tessera','rendiconto','comunicazione')),
  oggetto        text not null,
  corpo_html     text not null,
  -- Per le convocazioni: la data dell'assemblea, da cui si contano i 15 giorni.
  assemblea_il   date,
  stato          text not null default 'bozza'
                 check (stato in ('bozza','in_invio','inviata','annullata')),
  creata_da      uuid,
  creata_il      timestamptz not null default now(),
  provata_il     timestamptz,
  provata_da     uuid,
  invio_iniziato_il timestamptz,
  invio_finito_il   timestamptz,
  destinatari_count integer not null default 0
);

comment on table public.comunicazione_istituzionale is
 'Comunicazioni dovute per statuto: convocazioni, quote, tessere, rendiconti. Base giuridica il rapporto associativo, non il consenso. NON portano collegamento di disiscrizione: un socio che si disiscrivesse per sbaglio renderebbe impugnabile un''assemblea.';

alter table public.comunicazione_istituzionale enable row level security;
revoke all on public.comunicazione_istituzionale from anon, authenticated;

-- La prova, socio per socio. `domanda_id` e non solo l'indirizzo: e' questo che
-- rende dimostrabile una convocazione.
create table if not exists public.comunicazione_destinatario (
  id             uuid primary key default gen_random_uuid(),
  comunicazione_id uuid not null references public.comunicazione_istituzionale(id) on delete restrict,
  domanda_id     uuid not null references public.domande_tesseramento(id) on delete restrict,
  numero_socio   integer,
  nome           text,
  email          text not null,
  -- Il contenuto ESATTO ricevuto da questa persona, gia' personalizzato con i
  -- nomi di chi condivide la casella. Non un riferimento al modello.
  corpo_inviato  text not null,
  outbox_id      uuid references public.email_outbox(id) on delete set null,
  inviata_il     timestamptz,
  esito          text not null default 'accodata'
                 check (esito in ('accodata','inviata','errore')),
  errore         text,
  creata_il      timestamptz not null default now(),
  constraint comunicazione_destinatario_unico unique (comunicazione_id, domanda_id)
);

comment on table public.comunicazione_destinatario is
 'La prova che UN SOCIO e'' stato raggiunto da UNA comunicazione, con il contenuto esatto che ha ricevuto. Le righe non si cancellano nemmeno quando il socio cessa: `on delete restrict` sulle due chiavi esterne e'' li'' apposta.';

create index if not exists idx_com_dest_comunicazione on public.comunicazione_destinatario(comunicazione_id);
create index if not exists idx_com_dest_domanda on public.comunicazione_destinatario(domanda_id);

alter table public.comunicazione_destinatario enable row level security;
revoke all on public.comunicazione_destinatario from anon, authenticated;

-- =========================================================================
-- 4. I QUINDICI GIORNI
-- =========================================================================
--
-- Lo statuto dice che la convocazione deve PERVENIRE almeno quindici giorni
-- prima. Non che debba essere spedita.
--
-- Oggi trenta invii stanno in una giornata e non e' un problema. Ma quando i
-- soci cresceranno e servira' spalmare su piu' giorni, i quindici giorni si
-- contano DALL'ULTIMO CHE RICEVE, non dal primo. E' il tipo di conto che
-- nessuno fa a mente e che invalida un'assemblea.
create or replace function public.invio_da_concludere_entro(p_assemblea date)
returns date
language sql
immutable
as $$
  select case when p_assemblea is null then null
    else p_assemblea - interval '15 days' end::date;
$$;

comment on function public.invio_da_concludere_entro(date) is
 'La data entro cui l''invio di una convocazione deve essere CONCLUSO perche'' i quindici giorni dello statuto siano rispettati per tutti. Si conta dall''ultimo che riceve, non dal primo.';
