-- =====================================================================
-- Museo della Grande Guerra — proposte materiale dal pubblico (V1, senza upload).
-- Segnalazione pubblica (senza login): chi ha foto/cartoline/lettere/oggetti
-- lascia un contatto, la curatela ricontatta e cataloga. NON e' un pezzo del
-- museo: e' una segnalazione. Insert SOLO via edge (service-role); nessuna
-- policy di insert pubblico. Dati personali del proponente -> nessuna lettura
-- pubblica, solo admin (>=50).
-- =====================================================================
create table if not exists public.museo_gg_proposta (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  contatto     text not null,                 -- email o telefono del proponente
  tipo         text,                           -- foto|cartolina|lettera|documento|oggetto|altro
  descrizione  text not null,                  -- cosa ha + provenienza
  stato        text not null default 'nuova',  -- nuova | gestita | archiviata
  note_interne text,
  gestita_da   uuid,
  created_at   timestamptz not null default now()
);

alter table public.museo_gg_proposta enable row level security;

-- Nessuna lettura pubblica (dati personali). Lettura/gestione solo admin (>=50).
drop policy if exists museo_gg_proposta_admin on public.museo_gg_proposta;
create policy museo_gg_proposta_admin on public.museo_gg_proposta
  for all
  using ( public.has_ruolo_min(auth.uid(), 50) )
  with check ( public.has_ruolo_min(auth.uid(), 50) );

-- NIENTE grant/policy per anon: l'insert pubblico passa dall'edge in
-- service-role (museo-gg-proposta), che bypassa la RLS.
grant select, insert, update, delete on public.museo_gg_proposta to authenticated;

-- Toggle notifica direttivo (config-driven, come gli altri tipi):
-- si spegne con un UPDATE su telegram_notifica, senza deploy.
insert into public.telegram_notifica (tipo, categoria, etichetta, attivo)
values ('museo_gg_proposta', 'Museo', 'Proposta materiale Grande Guerra', true)
on conflict (tipo) do nothing;
