-- Brief 24/8/2026, item 3: il collegamento automatico al login (23/8) copre
-- solo chi entra da adesso in avanti. Restano 24 domande approvate senza
-- account_id, di cui alcune hanno gia' un account (chi aveva gia' fatto
-- accesso prima del fix). Qui la funzione che il segretario usa a mano dalla
-- gestione soci: propone gli account con la stessa email, MAI collega da
-- sola. Nessuna colonna nuova: solo due funzioni, sullo stesso schema di
-- collega_tessera/otp-verify.

create or replace function public.soci_candidati_collegamento()
returns table(
  domanda_id uuid, numero_socio integer, dom_nome text, dom_cognome text, dom_email text,
  candidato_id uuid, cand_nome text, cand_cognome text, cand_email text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not has_ruolo_min(auth.uid(), 50) then
    raise exception 'non autorizzato';
  end if;
  return query
    select d.id, d.numero_socio, d.nome, d.cognome, d.email,
           u.id, u.nome, u.cognome, u.email
    from domande_tesseramento d
    join utente u on lower(u.email) = lower(d.email)
    where d.stato = 'approvata' and d.account_id is null
    order by d.numero_socio nulls last, d.nome;
end;
$function$;

revoke all on function public.soci_candidati_collegamento() from public, anon;
grant execute on function public.soci_candidati_collegamento() to authenticated;

create or replace function public.collega_domanda_account(p_domanda_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_dom domande_tesseramento; v_utente utente;
begin
  if not has_ruolo_min(auth.uid(), 50) then
    raise exception 'non autorizzato';
  end if;

  select * into v_dom from domande_tesseramento where id = p_domanda_id;
  if not found then raise exception 'domanda non trovata'; end if;
  if v_dom.stato <> 'approvata' then raise exception 'la domanda non e'' approvata'; end if;
  if v_dom.account_id is not null then raise exception 'questa domanda e'' gia'' collegata a un account'; end if;

  select * into v_utente from utente where id = p_account_id;
  if not found then raise exception 'account non trovato'; end if;

  -- Un account non deve rivendicare due domande: sarebbe la tessera di una
  -- persona sul profilo di un'altra, esattamente il rischio da evitare.
  if exists (select 1 from domande_tesseramento where account_id = p_account_id) then
    raise exception 'questo account risulta gia'' collegato a un''altra domanda';
  end if;

  update domande_tesseramento set account_id = p_account_id where id = p_domanda_id;

  -- Nome e cognome solo se vuoti: non si sovrascrive un dato che la persona
  -- ha gia' scritto di suo.
  update utente set
    nome = case when coalesce(btrim(nome), '') = '' then v_dom.nome else nome end,
    cognome = case when coalesce(btrim(cognome), '') = '' then v_dom.cognome else cognome end
  where id = p_account_id;

  -- Stesso provisioning del login automatico: un collegamento manuale non
  -- deve lasciare la persona senza i permessi che le spettano.
  insert into utente_ruolo (utente_id, ruolo_id)
  select p_account_id, r.id from ruolo r where r.nome = 'socio'
  on conflict do nothing;
end;
$function$;

revoke all on function public.collega_domanda_account(uuid, uuid) from public, anon;
grant execute on function public.collega_domanda_account(uuid, uuid) to authenticated;
