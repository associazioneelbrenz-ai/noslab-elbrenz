-- Conteggio atomico all'ingresso per Andreas (brief 2/8 mezzogiorno).
-- Idempotente: gia' applicata in produzione via MCP, qui versionata.
--
-- Il bug che chiude: il conteggio viveva solo nei rami di persistenza a fine
-- risposta, e il percorso lento (vettoriale a vuoto -> full-text -> Claude)
-- non passava di li': le domande fuori KB erano gratis e illimitate proprio
-- sul percorso piu' costoso. In piu' il check read-then-act lasciava passare
-- le richieste concorrenti. Evidenza a database del 2/8: due domande veloci
-- contate, la domanda lenta sui martiri servita e mai contata.
--
-- ai_consuma_quota: check e incremento in UNA operazione. L'upsert incrementa
-- solo se sotto il limite; chi non ottiene la riga e' respinto. p_limite < 0 =
-- nessun tetto (admin): si conta comunque, serve ai totali.
create or replace function public.ai_consuma_quota(
  p_utente_id uuid,
  p_ip_hash text,
  p_limite int
)
returns table (concesso boolean, messaggi int)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_oggi date := current_date;
  v_msg int;
begin
  if p_utente_id is not null then
    insert into public.ai_rate_limit as t (utente_id, giorno, messaggi, tokens_totali)
    values (p_utente_id, v_oggi, 1, 0)
    on conflict (utente_id, giorno) do update
      set messaggi = t.messaggi + 1
      where p_limite < 0 or t.messaggi < p_limite
    returning t.messaggi into v_msg;
  elsif p_ip_hash is not null then
    insert into public.ai_rate_limit_pubblico as t (ip_hash, giorno, messaggi, tokens_totali, ultimo_uso)
    values (p_ip_hash, v_oggi, 1, 0, now())
    on conflict (ip_hash, giorno) do update
      set messaggi = t.messaggi + 1, ultimo_uso = now()
      where p_limite < 0 or t.messaggi < p_limite
    returning t.messaggi into v_msg;
  else
    return query select true, 0;
    return;
  end if;

  if v_msg is null then
    if p_utente_id is not null then
      select t.messaggi into v_msg from public.ai_rate_limit t
       where t.utente_id = p_utente_id and t.giorno = v_oggi;
    else
      select t.messaggi into v_msg from public.ai_rate_limit_pubblico t
       where t.ip_hash = p_ip_hash and t.giorno = v_oggi;
    end if;
    return query select false, coalesce(v_msg, p_limite);
    return;
  end if;

  return query select true, v_msg;
end $$;

revoke execute on function public.ai_consuma_quota(uuid, text, int) from anon, authenticated, public;

-- ai_somma_token: a fine risposta si sommano i token della domanda servita.
-- Incremento RELATIVO, non sovrascrittura: con il conteggio all'ingresso,
-- l'upsert assoluto di prima avrebbe raddoppiato i messaggi e azzerato i
-- token accumulati dalle richieste concorrenti.
create or replace function public.ai_somma_token(
  p_utente_id uuid,
  p_ip_hash text,
  p_tokens int
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_utente_id is not null then
    update public.ai_rate_limit
       set tokens_totali = coalesce(tokens_totali, 0) + greatest(p_tokens, 0)
     where utente_id = p_utente_id and giorno = current_date;
  elsif p_ip_hash is not null then
    update public.ai_rate_limit_pubblico
       set tokens_totali = coalesce(tokens_totali, 0) + greatest(p_tokens, 0),
           ultimo_uso = now()
     where ip_hash = p_ip_hash and giorno = current_date;
  end if;
end $$;

revoke execute on function public.ai_somma_token(uuid, text, int) from anon, authenticated, public;
