-- Notifiche (e quindi push) alla pubblicazione di un contenuto.
--
-- Finora `notifica` la riempivano solo il direttivo e la comunita': museo,
-- articoli ed eventi uscivano in silenzio, e la Web Push non partiva perche'
-- nessuno inseriva la riga che la innesca (trigger notifica_push_ai).
--
-- Tipi DISTINTI per contenuto (scelta di Cristian, 5/8/2026): 'museo',
-- 'articolo', 'evento'. Cosi' ognuno si spegne per conto suo dalle preferenze;
-- l'assenza di una riga in notifica_preferenza vale «attiva», come gia' fa
-- invia-push, quindi i tipi nuovi funzionano senza dover popolare nulla.
--
-- SECURITY DEFINER: la fan-out scrive righe INTESTATE AD ALTRI, cosa che la RLS
-- di `notifica` giustamente vieta al chiamante.

create or replace function public.notifica_broadcast(
  p_tipo text, p_titolo text, p_corpo text, p_url text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_url is null or trim(p_url) = '' then
    return 0;
  end if;

  -- Chiave di idempotenza: l'indirizzo del contenuto. Un pezzo ritirato e
  -- ripubblicato, o un salvataggio ripetuto, non devono suonare due volte.
  if exists (select 1 from notifica where url = p_url) then
    return 0;
  end if;

  -- Destinatari: i soci (livello >= 10). Gli ospiti non ricevono avvisi che non
  -- hanno chiesto; la push vera parte comunque solo a chi ha un push_token.
  insert into notifica (utente_id, tipo, titolo, corpo, url)
  select distinct ur.utente_id, p_tipo, p_titolo, p_corpo, p_url
  from utente_ruolo ur
  join ruolo r on r.id = ur.ruolo_id
  where r.livello >= 10;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.notifica_broadcast(text, text, text, text) from public, anon, authenticated;

-- ---- Museo Grande Guerra ----------------------------------------------------
create or replace function public.notifica_museo_pubblicato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'pubblicato'
     and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicato')
     and new.slug is not null then
    perform notifica_broadcast(
      'museo',
      'Un pezzo nuovo nel Museo',
      new.titolo,
      'https://elbrenz.eu/non-e-sole-grande-guerra/' || new.slug
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifica_museo on public.museo_gg_pezzo;
create trigger trg_notifica_museo
  after insert or update of stato on public.museo_gg_pezzo
  for each row execute function public.notifica_museo_pubblicato();

-- ---- Articoli ---------------------------------------------------------------
create or replace function public.notifica_articolo_pubblicato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'pubblicato'
     and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicato')
     and new.slug is not null then
    perform notifica_broadcast(
      'articolo',
      'Un articolo nuovo',
      new.titolo,
      'https://elbrenz.eu/articoli/' || new.slug
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifica_articolo on public.articolo;
create trigger trg_notifica_articolo
  after insert or update of stato on public.articolo
  for each row execute function public.notifica_articolo_pubblicato();

-- ---- Eventi del Radar -------------------------------------------------------
create or replace function public.notifica_evento_pubblicato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'pubblicato'
     and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicato')
     and new.slug is not null then
    perform notifica_broadcast(
      'evento',
      'Un appuntamento nelle valli',
      new.titolo || coalesce(' · ' || to_char(new.data_inizio, 'DD/MM/YYYY'), ''),
      'https://elbrenz.eu/eventi/' || new.slug
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifica_evento on public.eventi_esterni;
create trigger trg_notifica_evento
  after insert or update of stato on public.eventi_esterni
  for each row execute function public.notifica_evento_pubblicato();;
