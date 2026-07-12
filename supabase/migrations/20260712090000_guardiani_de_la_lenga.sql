-- Guardiani de la lenga (12/07/2026): motore del glossario del ladino
-- anaunico crowdsourced. Estende dizionario_lemma (0 righe), aggiunge la
-- tabella contributori/lead e la vista pubblica SENZA PII. GIA' APPLICATO
-- a DB; a registro (disciplina D1). CHECK collaudati con insert reali.

create table if not exists public.guardiani_contributori (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  consenso_glossario boolean not null default false,
  consenso_marketing boolean not null default false,
  marketing_double_optin boolean not null default false,
  marketing_token text,
  marketing_confermato_il timestamptz,
  consenso_firma boolean not null default false,   -- display-name pubblico opzionale
  licenza_accettata boolean not null default false,
  licenza_tipo text not null default 'CC BY 4.0',
  punti int not null default 0,                     -- V2: solo predisposizione, mai usato in V1
  sorgente_utm jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.guardiani_contributori enable row level security;

alter table public.dizionario_lemma
  add column if not exists tipo text check (tipo in ('parola','frase','espressione')),
  add column if not exists comune text,
  add column if not exists audio_id uuid references public.archivio_audio(id),
  add column if not exists stato text not null default 'proposto' check (stato in ('proposto','in_revisione','validato','pubblicato','rifiutato')),
  add column if not exists contributore_id uuid references public.guardiani_contributori(id),
  add column if not exists validato_da text,
  add column if not exists validato_il timestamptz,
  add column if not exists motivo_rifiuto text,
  add column if not exists sorgente_utm jsonb;

-- variante = colonna esistente `parlata` (text), validata in edge function
-- sui 4 valori canonici: noneso|solander|rabies|pegaes.

create or replace view public.glossario_pubblico as
  select l.id, l.lemma as termine, l.tipo, l.parlata as variante, l.comune,
         l.definizione as significato_it, l.esempi_uso as esempio_uso,
         a.file_url as audio_url,
         case when c.consenso_firma then c.nome else null end as contributore_firma
  from public.dizionario_lemma l
  left join public.archivio_audio a on a.id = l.audio_id
  left join public.guardiani_contributori c on c.id = l.contributore_id
  where l.stato = 'pubblicato';
grant select on public.glossario_pubblico to anon, authenticated;
