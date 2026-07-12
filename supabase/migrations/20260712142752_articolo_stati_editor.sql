-- STEP 1 Editor: ciclo di vita dell'articolo (additivo, non tocca `pubblicato`).
alter table public.articolo add column if not exists stato text
  check (stato in ('bozza','in_revisione','in_approvazione','pubblicato','rifiutato')) default 'bozza';
alter table public.articolo add column if not exists motivo_rifiuto text;
alter table public.articolo add column if not exists inviato_at timestamptz;
alter table public.articolo add column if not exists revisionato_da uuid;
alter table public.articolo add column if not exists approvato_da uuid;

-- Backfill coerente: i 142 esistenti riflettono `pubblicato`.
update public.articolo set stato = 'pubblicato' where pubblicato = true and stato is distinct from 'pubblicato';
update public.articolo set stato = 'bozza' where pubblicato = false and stato is null;
