-- Vetrina pubblica delle Storie promosse (elbrenz.eu/storie): espone SOLO le
-- storie pubblica=true e pubblicata, col nome visualizzato dell'autore (mai
-- email/PII). Vista non security_invoker (gira come owner) -> l'anon legge senza
-- toccare la RLS di utente; il WHERE limita alle sole storie destinate al pubblico.
-- Applicata via MCP.
create or replace view public.v_storia_pubblica as
  select
    s.id, s.titolo, s.contenuto, s.immagini_urls, s.copertina_url, s.created_at,
    coalesce(nullif(btrim(u.nome), ''), 'Socio')
      || case when nullif(btrim(u.cognome), '') is not null
              then ' ' || left(btrim(u.cognome), 1) || '.' else '' end as autore_nome
  from public.storia s
  left join public.utente u on u.id = s.autore_id
  where s.pubblica = true and s.stato = 'pubblicata';

grant select on public.v_storia_pubblica to anon, authenticated;
