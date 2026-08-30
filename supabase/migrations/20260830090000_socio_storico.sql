-- 20260830090000 — il libro soci storico
-- Brief "Il libro soci storico" (30/8/2026).
--
-- SOLO SCHEMA. Questo file non contiene, e non deve mai contenere, nessun
-- nome, cognome, indirizzo, data di nascita, telefono o email: sono dati
-- personali di persone che non sono socie e non hanno dato consenso alla
-- pubblicazione, e questo repository e' pubblico. I sedici record delle
-- schede cartacee del 2021 si caricano via MCP, fuori da git.
--
-- PERCHE' UNA TABELLA A PARTE E NON domande_tesseramento: quella tabella
-- vive nel 2026, ha consenso_privacy e informativa_versione obbligatori (le
-- schede del 2021 citano il D.Lgs. 196/2003 e "segnalazione inoltrata": un
-- consenso che non esiste, e inventarlo scriverebbe il falso proprio nel
-- campo che registra quale informativa e' stata firmata), e attorno a
-- domande_tesseramento girano solleciti-quota/invito_tesseramento/
-- pagamenti_tesseramento/tesseramento_anno: il giorno che i solleciti si
-- accendessero, sedici persone del 2021 riceverebbero un avviso di quota
-- non versata per un anno in cui non erano socie. E' un archivio, non una
-- pipeline: vite diverse, tabelle separate.
create table public.socio_storico (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cognome         text not null,
  data_nascita    date,
  indirizzo       text,
  cap             text,
  comune          text,
  provincia       text,
  telefono        text,
  email           citext,
  tipologia       text check (tipologia in ('ordinario','sostenitore')),
  anno_adesione   int not null,
  data_firma      date,
  fonte           text not null default 'scheda cartacea',
  -- quali campi non si leggono con certezza dalla scansione
  lettura_incerta text,
  -- il contatto e' UNO SOLO, non ripetibile: niente colonna "quante volte".
  contattato_il   timestamptz,
  esito_contatto  text check (esito_contatto in ('tornato','rifiutato','cancellazione_richiesta','nessuna_risposta','indirizzo_non_valido')),
  note            text,
  created_at      timestamptz not null default now()
);

comment on table public.socio_storico is
 'Ex soci: schede cartacee firmate prima del tesseramento attuale, archiviate come memoria. Non sono soci oggi, non entrano in nessun conteggio o sollecito del tesseramento vivo. Nessun grant diretto: si legge solo con soci_storici(), si cancella solo con rimuovi_socio_storico().';

-- Ordinabile per cognome/nome, come chiede la schermata.
create index socio_storico_cognome_nome_idx on public.socio_storico (cognome, nome);

-- RLS attiva, senza nessuna policy: anche se un domani qualcuno concedesse
-- per errore un grant sulla tabella, RLS senza policy permissive nega tutto
-- lo stesso. Le due funzioni sotto sono SECURITY DEFINER e bypassano la RLS
-- per costruzione (girano con i privilegi di chi le ha create), quindi
-- restano l'unica porta.
alter table public.socio_storico enable row level security;

-- Le tabelle nuove in questo progetto ereditano di default SELECT/REFERENCES/
-- TRIGGER per anon e ALL per authenticated (ALTER DEFAULT PRIVILEGES della
-- piattaforma): qui si toglie tutto, per entrambi. Nessuna delle due
-- interfaccia questa tabella direttamente, mai.
revoke all on public.socio_storico from anon, authenticated;

-- ---------------------------------------------------------------------------
-- soci_storici() — l'unica lettura. Gate a ruolo 50 dentro il corpo, come
-- cruscotto_lavori/cruscotto_conta_domande, con lo stesso varco per
-- service_role (auth.uid() e' null sotto service_role: senza questo varco
-- la funzione si nega anche al chiamante fidato — il difetto gia' trovato e
-- corretto due volte questa settimana su cruscotto_lavori/cruscotto_servizi,
-- chiuso qui in partenza).
-- ---------------------------------------------------------------------------
create or replace function public.soci_storici()
returns setof public.socio_storico
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il libro soci storico e riservato al direttivo';
  end if;
  return query select * from public.socio_storico order by cognome, nome;
end
$function$;

comment on function public.soci_storici() is
 'Elenco completo del libro soci storico (ex soci, schede cartacee). Solo direttivo (ruolo >= 50) o service_role. Dati personali di persone che non sono socie: non leggibile da soci ne'' da curatori.';

-- `revoke ... from public` da solo NON basta: le funzioni nuove in questo
-- progetto ereditano un grant EXECUTE esplicito e separato per anon (oltre
-- a quello di PUBLIC) dalla stessa ALTER DEFAULT PRIVILEGES della
-- piattaforma vista sopra per le tabelle. Trovato eseguendo davvero la
-- funzione come anon (non dedotto): senza questa riga rispondeva con zero
-- righe invece di rifiutarsi.
revoke execute on function public.soci_storici() from public, anon;
grant execute on function public.soci_storici() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- aggiorna_esito_socio_storico(p_id, p_esito) — non nel brief per nome, ma
-- richiesta dalla schermata (§6: "un solo campo modificabile: esito_contatto"):
-- senza un varco di scrittura quel campo non si potrebbe mai valorizzare, dato
-- che la tabella non ha nessun grant diretto (§4). Stessa forma delle altre
-- due: gate a ruolo 50 o service_role dentro il corpo. contattato_il si
-- valorizza alla PRIMA volta soltanto (coalesce): registra quando e' avvenuto
-- il contatto reale, che e' uno solo — correggere l'esito scritto in un
-- secondo momento non e' un secondo contatto.
-- ---------------------------------------------------------------------------
create or replace function public.aggiorna_esito_socio_storico(p_id uuid, p_esito text)
returns public.socio_storico
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_riga public.socio_storico;
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il libro soci storico e riservato al direttivo';
  end if;
  if p_esito is not null and p_esito not in ('tornato','rifiutato','cancellazione_richiesta','nessuna_risposta','indirizzo_non_valido') then
    raise exception 'Esito di contatto non valido: %', p_esito;
  end if;

  update public.socio_storico
     set esito_contatto = p_esito,
         contattato_il = coalesce(contattato_il, now())
   where id = p_id
   returning * into v_riga;

  if not found then
    raise exception 'Riga non trovata nel libro soci storico';
  end if;
  return v_riga;
end
$function$;

comment on function public.aggiorna_esito_socio_storico(uuid, text) is
 'Segna l''esito dell''unico contatto con un ex socio del libro storico. Solo direttivo (ruolo >= 50) o service_role.';

revoke execute on function public.aggiorna_esito_socio_storico(uuid, text) from public, anon;
grant execute on function public.aggiorna_esito_socio_storico(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rimuovi_socio_storico(p_id, p_motivo) — cancellazione REALE, non un flag.
-- La lettera che questi ex soci ricevono promette che chi scrive
-- "cancellatemi" viene tolto dai contatti: un record marcato ma conservato
-- non manterrebbe quella promessa. p_motivo e' obbligatorio (si scrive
-- perche' si cancella) ma non viene conservato da nessuna parte: non esiste
-- in questo progetto un registro generico per le cancellazioni del
-- direttivo, e crearne uno non era chiesto da questo brief.
-- ---------------------------------------------------------------------------
create or replace function public.rimuovi_socio_storico(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il libro soci storico e riservato al direttivo';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Il motivo della cancellazione e obbligatorio';
  end if;

  delete from public.socio_storico where id = p_id;
  if not found then
    raise exception 'Riga non trovata nel libro soci storico';
  end if;
end
$function$;

comment on function public.rimuovi_socio_storico(uuid, text) is
 'Cancella davvero una riga del libro soci storico (non un flag): mantiene la promessa fatta nella lettera a chi chiede la cancellazione. Solo direttivo (ruolo >= 50) o service_role.';

revoke execute on function public.rimuovi_socio_storico(uuid, text) from public, anon;
grant execute on function public.rimuovi_socio_storico(uuid, text) to authenticated, service_role;
