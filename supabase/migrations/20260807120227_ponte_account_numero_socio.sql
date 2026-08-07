-- IL PONTE FRA ACCOUNT E NUMERO DI SOCIO (7/8/2026)
--
-- Il caso che lo rende necessario: Diego Magnoni si e' registrato nell'app con
-- diegomagnoni9@gmail.com, mentre a registro ha diegomagnoni@live.it, che e' poi
-- la casella che CONDIVIDE con Nadia Pangrazzi. Per il sistema e' una persona
-- nuova: livello ospite, niente tessera, niente Comunita', niente Museo.
--
-- L'email non puo' fare da identita' qui, e i motivi sono tre e tutti reali:
-- due soci su una casella (Diego e Nadia, Monica e Maria Luisa), una persona su
-- due caselle (Simone, Diego), e un indirizzo che cambia restando la persona.
--
-- Il ponte e' il CODICE DELLA TESSERA: ce l'ha solo chi l'ha ricevuta, e' unico,
-- e non cambia. Chi si registra con un altro indirizzo lo inserisce una volta e
-- il suo account viene legato al suo numero di socio, per sempre e a prescindere
-- dalla casella.

alter table public.domande_tesseramento add column if not exists account_id uuid;

-- Un account e' di UNA persona sola: senza questo, due account potrebbero
-- rivendicare la stessa tessera, o un account rivendicarne due.
create unique index if not exists domande_account_unico
  on public.domande_tesseramento (account_id) where account_id is not null;

-- Legatura gia' certa: dove email dell'account e email a registro coincidono e
-- non ci sono ambiguita', il ponte esiste gia' di fatto e si scrive.
update public.domande_tesseramento d
set account_id = u.id
from auth.users u
where d.account_id is null
  and d.numero_socio is not null
  and lower(u.email) = lower(d.email)
  and not exists (  -- mai su una casella condivisa: li' serve il codice
    select 1 from domande_tesseramento d2
    where lower(d2.email) = lower(d.email) and d2.numero_socio is not null and d2.id <> d.id)
  and not exists (select 1 from domande_tesseramento d3 where d3.account_id = u.id);

/**
 * Collega il proprio account a una tessera, col codice ricevuto per email.
 *
 * Si assegna anche il ruolo socio: senza, il ponte sarebbe formale e la persona
 * continuerebbe a non vedere niente. E' il caso di Dimitri Melli, che era socio
 * a registro e ospite nell'app.
 *
 * Rifiuta e SPIEGA in tre casi: codice sconosciuto, tessera gia' rivendicata da
 * un altro account, account gia' legato a un'altra tessera. Su un'identita' non
 * si indovina.
 */
create or replace function public.collega_tessera(p_codice text)
returns table (esito text, messaggio text, numero_socio integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); d record; v_ruolo int;
begin
  if v_uid is null then
    return query select 'no_sessione'::text, 'Devi essere entrato per collegare la tessera.'::text, null::int; return;
  end if;

  if exists (select 1 from domande_tesseramento x where x.account_id = v_uid) then
    return query select 'gia_collegato'::text,
      'Questo account risulta gia collegato a una tessera. Se e un errore, scrivi a info@elbrenz.eu.'::text,
      (select x.numero_socio from domande_tesseramento x where x.account_id = v_uid); return;
  end if;

  select * into d from domande_tesseramento t
   where lower(t.codice_tessera) = lower(btrim(p_codice)) and t.stato = 'approvata';
  if not found then
    return query select 'non_trovato'::text,
      'Non riconosco questo codice. Lo trovi nella email della tua tessera digitale.'::text, null::int; return;
  end if;

  if d.account_id is not null then
    return query select 'gia_rivendicata'::text,
      'Questa tessera risulta gia collegata a un altro account.'::text, d.numero_socio; return;
  end if;

  update domande_tesseramento set account_id = v_uid where id = d.id;

  select max(r.livello) into v_ruolo from utente_ruolo ur join ruolo r on r.id = ur.ruolo_id
   where ur.utente_id = v_uid;
  if coalesce(v_ruolo, 0) < 10 then
    insert into utente_ruolo (utente_id, ruolo_id)
    select v_uid, r.id from ruolo r where r.nome = 'socio'
    on conflict do nothing;
  end if;

  return query select 'ok'::text,
    format('Collegata: sei il socio numero %s.', d.numero_socio), d.numero_socio;
end;
$$;

grant execute on function public.collega_tessera(text) to authenticated;;
