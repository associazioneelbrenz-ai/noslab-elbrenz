-- §5 Fase 3: menzioni a esposizione minima.
-- Cattura anche a livello thread (oltre a forum_post).
alter table public.forum_thread add column if not exists menzioni uuid[] not null default '{}';

-- Ricerca soci per l'autocomplete delle menzioni: ritorna SOLO id + nome
-- visualizzato (nome + iniziale cognome, come v_forum_autore) + avatar dei SOCI
-- (>=10). Nessuna PII (email/telefono). security definer così il client non
-- legge la tabella utente; execute solo agli authenticated, revocato ad anon.
create or replace function public.cerca_soci(termine text)
returns table (id uuid, nome text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  select u.id,
    coalesce(nullif(btrim(u.nome), ''), 'Socio') ||
      case when nullif(btrim(u.cognome), '') is not null
           then ' ' || left(btrim(u.cognome), 1) || '.' else '' end as nome,
    u.avatar_url
  from public.utente u
  where public.has_ruolo_min(u.id, 10)
    and (u.nome ilike '%' || termine || '%' or u.cognome ilike '%' || termine || '%')
  order by u.nome
  limit 8;
$$;
revoke all on function public.cerca_soci(text) from anon, public;
grant execute on function public.cerca_soci(text) to authenticated;
