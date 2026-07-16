-- Tassonomia «Custodi della Memoria»: categorie tematiche + filtri trasversali.
-- Additivo su custodi_memoria (colonne nullable, non rompe righe/flussi esistenti).
-- Chiave STABILE = slug italiano; titolo_lenga è BOZZA da validare (Commissione
-- Linguistica): il sistema NON dipende dalla lenga. Curatela umana invariata
-- (visibile default false). Vedi brief 16/7.

-- 1) Vocabolario chiuso delle categorie tematiche.
create table if not exists public.custodi_categoria (
  slug         text primary key,          -- chiave STABILE (italiano-slug), non cambia mai
  titolo_it    text not null,             -- titolo canonico italiano (voce pubblica principale)
  titolo_lenga text,                       -- BOZZA in ladino anaunico, da validare
  descrizione  text,                       -- cosa contiene (intro/tooltip categoria)
  ordine       int  not null default 100,
  attiva       boolean not null default true,
  updated_at   timestamptz not null default now()
);
alter table public.custodi_categoria enable row level security;
drop policy if exists custodi_categoria_public_read on public.custodi_categoria;
create policy custodi_categoria_public_read on public.custodi_categoria
  for select using (true);   -- solo etichette, nessun dato personale
grant select on public.custodi_categoria to anon, authenticated;

-- 2) Classificazione sulla rubrica esistente (additivo, nullable).
alter table public.custodi_memoria
  add column if not exists categoria_slug text references public.custodi_categoria(slug),
  add column if not exists valle          text,   -- val_di_non|val_di_sole|val_di_rabbi|val_di_pejo|piu_valli
  add column if not exists epoca          text,   -- pre_ottocento|ottocento|tirolo_asburgico|tra_le_due_guerre|novecento|contemporaneo
  add column if not exists tipo_materiale text;   -- fotografia|documento|oggetto|audio|racconto_orale|video

-- 3) Seed categorie. titolo_it = canonico; titolo_lenga = BOZZA (validare in Commissione).
insert into public.custodi_categoria (slug, titolo_it, titolo_lenga, ordine) values
 ('terra-e-stagioni',   'La terra e le stagioni',   'La tèra e le stagión',     10),
 ('grande-guerra',      'La Grande Guerra',         'La Grant Gèra',            20),
 ('partire-e-restare',  'Partire e restare',        'Partìr e restàr',          30),
 ('mani-e-mestieri',    'Mani e mestieri',          'Man e mistèri',            40),
 ('fede-e-devozione',   'Fede e devozione',         'Fè e dovozion',            50),
 ('feste-e-filo',       'Feste, maschere e filò',   'Feste, màschere e filò',   60),
 ('la-nosa-lenga',      'La nostra lingua',         'La nosa lenga',            70),
 ('case-masi-paesi',    'Case, masi e paesi',       'Chjase, masi e paìsi',     80),
 ('signori-e-castelli', 'Signori e castelli',       'Signóri e castèi',         90),
 ('acque-boschi-monti', 'Acque, boschi e montagne', 'Aque, bòschi e montagne', 100),
 ('volti-e-famiglie',   'Volti e famiglie',         'Faze e famèè',            110),
 ('dal-tirolo-italia',  'Dal Tirolo all''Italia',   'Dal Tirol a la Talia',    120)
on conflict (slug) do nothing;

-- 4) Vista pubblica: aggiunge le nuove colonne + le etichette categoria (join),
--    sempre gated su visibile=true. La pagina legge SOLO la vista → nessun dato
--    personale/di contatto esposto, nessun problema di grant su tabella base.
create or replace view public.v_custodi_memoria as
  select c.nome_pubblico,
         c.paese,
         c.descrizione_contributo,
         c.anno,
         c.anonimo,
         c.categoria_slug,
         c.valle,
         c.epoca,
         c.tipo_materiale,
         cat.titolo_it    as categoria_titolo_it,
         cat.titolo_lenga as categoria_titolo_lenga,
         cat.ordine       as categoria_ordine
  from public.custodi_memoria c
  left join public.custodi_categoria cat on cat.slug = c.categoria_slug
  where c.visibile = true;
