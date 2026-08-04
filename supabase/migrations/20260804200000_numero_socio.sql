-- 20260804200000 — il numero di SOCIO, che non e' il numero di tessera
--
-- IL LIBRO DEGLI ASSOCIATI NON PUO' USARE `numero_tessera`. L'Associazione
-- tiene dal 2009 un registro cartaceo con un proprio progressivo di iscrizione
-- che arriva a centodieci, e le due numerazioni non coincidono nemmeno da
-- lontano: Cristian Bresadola e' il socio 1 e ha la tessera 4, Diego Magnoni e'
-- il socio 11 e ha la tessera 1. Un funzionario che affianca i due registri
-- trova la stessa persona con due numeri diversi, ed e' il tipo di discrepanza
-- che fa mettere in dubbio anche cio' che e' corretto.
--
-- I VALORI NON STANNO QUI, di proposito. Le trenta assegnazioni le ha fatte la
-- chat, che ha in mano il registro cartaceo, e sono annotate in
-- docs/CHANGELOG_dati.md. Rieseguire quel caricamento su un database nuovo
-- inventerebbe dati: una migration deve poter girare mille volte e lasciare
-- sempre lo stesso schema, non gli stessi FATTI.
alter table public.domande_tesseramento
  add column if not exists numero_socio integer;

comment on column public.domande_tesseramento.numero_socio is
 'Numero progressivo di iscrizione nel libro degli associati, dal registro storico tenuto dal 2009. Identifica la persona per sempre: non cambia, non si riassegna quando un socio cessa. Da non confondere con numero_tessera, che e'' il numero stampato sulla tessera. Il libro degli associati usa questo.';

-- Parziale: l'account di servizio non e' un associato e resta senza numero.
create unique index if not exists uq_domande_numero_socio
  on public.domande_tesseramento (numero_socio)
  where numero_socio is not null;

-- =========================================================================
-- IL CONTATORE, E PERCHE' NON DEVE RIEMPIRE I BUCHI
-- =========================================================================
--
-- Nella sequenza storica ci sono voragini: 4, 5, 16, 40, 95 e decine di altri
-- appartengono a soci iscritti dal 2009 che non sono piu' attivi e che a
-- database non ci sono. Un contatore che assegnasse «il primo numero libero»
-- darebbe a un socio nuovo del 2027 il numero 4, che dal 2009 e' di Dapra'
-- Andrea: il registro racconterebbe una cosa falsa su DUE persone insieme.
--
-- Il numero di un socio resta suo anche quando esce, anche quando muore. Si
-- prende quindi sempre il massimo piu' uno, mai un buco.
--
-- IL PAVIMENTO A 123 non e' un doppione del massimo: e' la stessa difesa di
-- TESSERA_SEED. Se un domani questa tabella venisse ripopolata senza i numeri
-- storici, `max+1` ripartirebbe da 1 e andrebbe a sbattere contro il registro
-- cartaceo. Il pavimento fa sbagliare in avanti, che e' l'unica direzione in
-- cui un progressivo puo' sbagliare senza mentire.
create or replace function public.prossimo_numero_socio()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    123,
    coalesce((select max(numero_socio) from public.domande_tesseramento), 0) + 1
  );
$$;

comment on function public.prossimo_numero_socio() is
 'Il prossimo numero da assegnare nel libro degli associati: SEMPRE massimo piu'' uno, MAI il primo buco libero. I buchi appartengono a soci storici che non sono a database, e riassegnarli farebbe raccontare al registro una cosa falsa su due persone. Pavimento a 123 come rete se la tabella venisse ripopolata senza lo storico.';

revoke execute on function public.prossimo_numero_socio() from anon, authenticated, public;
