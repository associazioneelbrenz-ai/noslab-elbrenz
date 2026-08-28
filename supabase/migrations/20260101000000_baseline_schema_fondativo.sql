-- ============================================================================
-- BASELINE DELLO SCHEMA FONDATIVO — schema `public`, produzione, 28/8/2026.
-- Brief "La baseline dello schema fondativo".
--
-- ============================================================================
-- PERICOLO PRINCIPALE — LEGGERE PRIMA DI TUTTO
-- ============================================================================
-- QUESTO FILE NON DEVE MAI ESSERE APPLICATO ALLA PRODUZIONE.
-- Nasce già applicata: ogni oggetto che descrive esiste già, dal vivo, sul
-- progetto Supabase wacknihvdjxltiqvxtqr. Eseguirla lì ricreerebbe o
-- sovrascriverebbe oggetti vivi. Il suo timestamp (20260101000000) precede
-- deliberatamente la prima migrazione registrata nel ledger
-- (20260421064913_enable_citext), così da collocarsi come punto zero: serve
-- a chi, un giorno, dovrà ricostruire un ambiente di prova identico alla
-- produzione, non a chi lavora sulla produzione stessa.
--
-- QUESTA BASELINE NON È MAI STATA APPLICATA A NESSUN DATABASE. Descrive lo
-- schema di produzione al 28 agosto 2026 secondo l'introspezione (non un
-- dump letterale — nessun ambiente con `pg_dump` privilegiato o Docker era
-- disponibile qui: vedi REPORT_baseline_schema_2026-08-28.md), ma che sia
-- eseguibile su un database vuoto, nell'ordine giusto e senza errori di
-- dipendenza, non è stato provato. Va provata alla prima occasione in cui
-- esista un ambiente locale.
--
-- ============================================================================
-- PERIMETRO
-- ============================================================================
-- Solo lo schema `public`. Esclusi per costruzione (mai scritti in nessuna
-- riga sotto):
--   - gli schemi auth, storage, realtime, vault, cron, extensions, net,
--     graphql, graphql_public, information_schema, supabase_migrations:
--     gestiti dalla piattaforma Supabase, non da questo progetto;
--   - le estensioni `vector` (118 funzioni) e `citext` (47 funzioni),
--     installate direttamente in `public`: sostituite dalle due CREATE
--     EXTENSION sotto — ricrearle a mano avrebbe reso la base inapplicabile;
--   - ogni oggetto (indice, tipo, operatore) che dipende da un'estensione
--     (pg_depend.deptype='e'): stesso motivo;
--   - riferimenti a proprietari e ruoli specifici dell'istanza: questa
--     introspezione non emette mai `OWNER TO`, a differenza di un dump
--     letterale — non essendoci nulla da rimuovere su questo fronte, non è
--     un'omissione fatta a mano ma una conseguenza del metodo;
--   - qualunque valore di segreto: le funzioni sotto leggono `vault.
--     decrypted_secrets` per nome, mai per valore.
--
-- Ordine di creazione (evita ogni dipendenza fra le sezioni, tranne quella
-- fra viste che si leggono a vicenda, risolta esplicitamente più sotto):
--   1. estensioni  2. sequenze autonome  3. tabelle (sole colonne)
--   4. vincoli (PK, UNIQUE, CHECK, FK)   5. indici autonomi
--   6. RLS abilitata  7. policy  8. viste  9. funzioni  10. trigger
--   11. grant e revoche (funzioni, poi tabelle/viste)
--
-- ============================================================================

-- Fissato esplicitamente: i corpi delle viste e alcune funzioni sotto
-- nominano le tabelle senza prefisso di schema (così le ha scritte
-- pg_get_viewdef/pg_get_functiondef, che non qualifica ciò che è già
-- risolvibile dal search_path attivo al momento della lettura). Senza
-- questa riga la risoluzione dipenderebbe dal search_path di default del
-- ruolo che applica il file, che in un database nuovo è normalmente
-- '"$user", public' — quasi sempre equivalente, ma "quasi" non è "sempre".
set search_path to public;

-- ---- 1. ESTENSIONI ---------------------------------------------------------
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;

-- ---- 2. SEQUENZE AUTONOME (non identity, "serial" classico) ---------------
create sequence if not exists public._import_gokollab_id_seq;
create sequence if not exists public.archivio_categoria_id_seq;
create sequence if not exists public.assoc_modifica_id_seq;
create sequence if not exists public.distintivo_id_seq;
create sequence if not exists public.forum_topic_id_seq;
create sequence if not exists public.guardiani_digest_invio_id_seq;
create sequence if not exists public.livello_id_seq;
create sequence if not exists public.modifica_contenuto_id_seq;
create sequence if not exists public.notifica_consegna_id_seq;
create sequence if not exists public.ruolo_id_seq;
create sequence if not exists public.sentinella_pagina_id_seq;
create sequence if not exists public.servizio_battito_id_seq;

-- ---- 3. TABELLE (sole colonne, i vincoli sono nella sezione 4) -----------
create table if not exists public._import_gokollab (
  id bigint default nextval('_import_gokollab_id_seq'::regclass) not null,
  token text not null,
  parte integer not null,
  payload text not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public._mappa_img_wp (
  rel text not null,
  storage_key text not null);

create table if not exists public.ai_config_ruolo (
  ruolo_nome text not null,
  limite_giornaliero integer not null,
  modello_preferito text default 'claude-haiku-4-5-20251001'::text,
  temperature numeric(3,2) default 0.7,
  max_tokens_output integer default 800,
  rag_abilitato boolean default true,
  note text);

create table if not exists public.ai_conversazione (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  titolo text,
  tipo text default 'generica'::text,
  archiviata boolean default false,
  ultima_attivita_at timestamp with time zone default now(),
  created_at timestamp with time zone default now());

create table if not exists public.ai_messaggio (
  id uuid default gen_random_uuid() not null,
  conversazione_id uuid not null,
  ruolo text not null,
  contenuto text not null,
  tokens_input integer,
  tokens_output integer,
  modello text,
  tempo_ms integer,
  errore text,
  metadata jsonb,
  created_at timestamp with time zone default now());

create table if not exists public.ai_rate_limit (
  utente_id uuid not null,
  giorno date default CURRENT_DATE not null,
  messaggi integer default 0,
  tokens_totali integer default 0,
  scope text,
  ip_hash text);

create table if not exists public.ai_rate_limit_pubblico (
  ip_hash text not null,
  giorno date default CURRENT_DATE not null,
  messaggi integer default 0 not null,
  tokens_totali integer default 0 not null,
  ultimo_uso timestamp with time zone default now() not null);

create table if not exists public.ai_sorgente_citata (
  id uuid default gen_random_uuid() not null,
  messaggio_id uuid not null,
  tipo_sorgente text not null,
  sorgente_id text not null,
  titolo text not null,
  snippet text,
  rilevanza numeric(4,3),
  created_at timestamp with time zone default now());

create table if not exists public.anagrafica_modifica (
  id uuid default gen_random_uuid() not null,
  domanda_id uuid not null,
  modificato_da uuid,
  modificato_il timestamp with time zone default now() not null,
  prima jsonb default '{}'::jsonb not null,
  dopo jsonb default '{}'::jsonb not null);

create table if not exists public.andreas_campagna (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  descrizione text,
  pilastro text,
  cadenza text default 'settimanale'::text,
  canali uuid[] default '{}'::uuid[],
  system_prompt_extra text,
  stato text default 'bozza'::text,
  inizio date,
  fine date,
  created_da uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.andreas_canale (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  nome text not null,
  piattaforma text not null,
  config jsonb,
  attivo boolean default true,
  note text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.andreas_kb (
  id uuid default gen_random_uuid() not null,
  sorgente_id uuid not null,
  chunk_index integer not null,
  pagina integer,
  titolo_sezione text,
  contenuto text not null,
  n_tokens integer,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamp with time zone default now());

create table if not exists public.andreas_kb_sorgente (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  autori text,
  anno integer,
  editore text,
  isbn text,
  tipo_sorgente text default 'libro'::text,
  lingua text default 'it'::text,
  pilastro text,
  descrizione text,
  file_origine_url text,
  n_chunks integer default 0,
  n_pagine integer,
  ingestato_il timestamp with time zone,
  ingestato_da uuid,
  visibile_ospiti boolean default false,
  note_interne text,
  metadata jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.andreas_pubblicazione (
  id uuid default gen_random_uuid() not null,
  campagna_id uuid,
  canale_id uuid not null,
  titolo text,
  contenuto_md text,
  immagine_url text,
  allegato_url text,
  pilastro text,
  sorgenti_usate uuid[] default '{}'::uuid[],
  generato_da_ai boolean default true,
  modello_usato text,
  tokens_consumati integer,
  stato text default 'bozza'::text,
  data_prevista timestamp with time zone,
  pubblicato_at timestamp with time zone,
  piattaforma_ref text,
  errore text,
  approvato_da uuid,
  approvato_at timestamp with time zone,
  note_approvatore text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.archivio_audio (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  termine_ladino text,
  categoria_audio text not null,
  parlata text,
  comune_parlante text,
  eta_parlante integer,
  sesso_parlante text,
  nome_parlante text,
  anonimo boolean default false,
  file_url text not null,
  durata_secondi integer,
  formato_audio text,
  trascrizione_ladina text,
  traduzione_italiana text,
  note_linguistiche text,
  registrato_il date,
  registrato_da uuid,
  luogo_registrazione text,
  lemma_id uuid,
  visibile_ospiti boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  stato text default 'in_attesa'::text not null,
  voce_di_altri boolean default false not null,
  consenso_parlante boolean default false not null,
  portato_da_nome text,
  portato_da_email text,
  contributore_id uuid,
  motivo_rifiuto text,
  mime_originale text,
  ascoltato_da uuid,
  ascoltato_il timestamp with time zone,
  bucket text,
  file_path text);

create table if not exists public.archivio_categoria (
  id integer default nextval('archivio_categoria_id_seq'::regclass) not null,
  nome text not null,
  parent_id integer,
  ordine integer default 0,
  created_at timestamp with time zone default now());

create table if not exists public.archivio_documento (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  descrizione text,
  tipo text not null,
  categoria_id integer,
  file_url text not null,
  file_nome text,
  file_dimensione_bytes bigint,
  file_mime text,
  anno integer,
  luogo text,
  autore text,
  caricato_da uuid,
  trascrizione text,
  tags text[] default ARRAY[]::text[],
  visibile_ospiti boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.articolo (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  slug text not null,
  sottotitolo text,
  corpo_html text not null,
  estratto text,
  immagine_copertina_url text,
  autore_id uuid,
  pilastro text,
  tags text[] default ARRAY[]::text[],
  pubblicato boolean default false,
  pubblicato_at timestamp with time zone,
  in_evidenza boolean default false,
  tempo_lettura_min integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  tipo_contenuto text default 'post'::text not null,
  wp_legacy_id integer,
  wp_autore_originale text,
  categorie_slug text[] default '{}'::text[],
  stato text default 'bozza'::text,
  motivo_rifiuto text,
  inviato_at timestamp with time zone,
  revisionato_da uuid,
  approvato_da uuid,
  meta_title text,
  meta_description text,
  immagine_alt text,
  noindex boolean default false not null,
  titolo_pre_riscrittura text,
  meta_description_pre_riscrittura text,
  archivio boolean default false not null,
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, immutable_unaccent(((((((COALESCE(titolo, ''::text) || ' '::text) || COALESCE(sottotitolo, ''::text)) || ' '::text) || COALESCE(estratto, ''::text)) || ' '::text) || regexp_replace(COALESCE(corpo_html, ''::text), '<[^>]+>'::text, ' '::text, 'g'::text))))) stored);

create table if not exists public.assoc_delega (
  id uuid default gen_random_uuid() not null,
  riunione_id uuid not null,
  delegante_domanda_id uuid not null,
  delegato_domanda_id uuid not null,
  file_path text,
  file_nome text,
  note text,
  registrata_da uuid,
  registrata_il timestamp with time zone default now() not null,
  revocata_il timestamp with time zone,
  revocata_motivo text);

create table if not exists public.assoc_delibera (
  id uuid default gen_random_uuid() not null,
  riunione_id uuid not null,
  numero integer not null,
  oggetto text not null,
  testo text,
  esito text default 'approvata_unanimita'::text not null,
  voti_favorevoli integer,
  voti_contrari integer,
  voti_astenuti integer,
  tag text[] default '{}'::text[] not null,
  socio_id uuid,
  creato_da uuid,
  created_at timestamp with time zone default now() not null,
  aggiornato_da uuid,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.assoc_documento (
  id uuid default gen_random_uuid() not null,
  anno integer not null,
  organo text,
  titolo text not null,
  descrizione text,
  file_path text not null,
  file_nome text not null,
  caricato_da uuid,
  caricato_il timestamp with time zone default now() not null);

create table if not exists public.assoc_modifica (
  id bigint default nextval('assoc_modifica_id_seq'::regclass) not null,
  tabella text not null,
  riga_id uuid not null,
  chi uuid,
  quando timestamp with time zone default now() not null,
  prima jsonb,
  dopo jsonb);

create table if not exists public.assoc_presenza (
  id uuid default gen_random_uuid() not null,
  riunione_id uuid not null,
  domanda_id uuid not null,
  registrata_da uuid,
  registrata_il timestamp with time zone default now() not null);

create table if not exists public.assoc_riunione (
  id uuid default gen_random_uuid() not null,
  organo text not null,
  anno integer not null,
  numero integer not null,
  data_riunione date not null,
  luogo text,
  ora_apertura time without time zone,
  ora_chiusura time without time zone,
  convocazione text,
  aventi_diritto integer,
  presenti_n integer,
  presenti text,
  assenti_giustificati text,
  presiede text,
  verbalizza text,
  ordine_del_giorno text,
  file_path text,
  file_nome text,
  note text,
  annullato_il timestamp with time zone,
  annullato_da uuid,
  annullato_motivo text,
  creato_da uuid,
  created_at timestamp with time zone default now() not null,
  aggiornato_da uuid,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.auth_otp (
  id uuid default gen_random_uuid() not null,
  email citext not null,
  codice_hash text not null,
  tentativi integer default 0 not null,
  max_tentativi integer default 3 not null,
  usato boolean default false not null,
  usato_at timestamp with time zone,
  scade_at timestamp with time zone not null,
  ip_request inet,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  scope text default 'login'::text not null);

create table if not exists public.comunicazione_destinatario (
  id uuid default gen_random_uuid() not null,
  comunicazione_id uuid not null,
  domanda_id uuid not null,
  numero_socio integer,
  nome text,
  email text not null,
  corpo_inviato text not null,
  outbox_id uuid,
  inviata_il timestamp with time zone,
  esito text default 'accodata'::text not null,
  errore text,
  creata_il timestamp with time zone default now() not null);

create table if not exists public.comunicazione_istituzionale (
  id uuid default gen_random_uuid() not null,
  tipo text default 'comunicazione'::text not null,
  oggetto text not null,
  corpo_html text not null,
  assemblea_il date,
  stato text default 'bozza'::text not null,
  creata_da uuid,
  creata_il timestamp with time zone default now() not null,
  provata_il timestamp with time zone,
  provata_da uuid,
  invio_iniziato_il timestamp with time zone,
  invio_finito_il timestamp with time zone,
  destinatari_count integer default 0 not null,
  luogo text,
  ora_prima time without time zone,
  ora_seconda time without time zone,
  ordine_del_giorno text,
  riunione_id uuid,
  termine_pervenire date);

create table if not exists public.config_app (
  chiave text not null,
  valore jsonb not null,
  descrizione text,
  categoria text,
  aggiornato_da uuid,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.consenso (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  tipo text not null,
  versione text not null,
  accettato_at timestamp with time zone default now() not null,
  contesto jsonb);

create table if not exists public.contatti_progressivo (
  anno integer not null,
  n integer default 0 not null);

create table if not exists public.convenzioni (
  id uuid default gen_random_uuid() not null,
  stato text default 'proposta'::text not null,
  nome_attivita text not null,
  categoria text not null,
  localita text,
  beneficio text not null,
  dettagli text,
  url text,
  logo_path text,
  referente_nome text not null,
  referente_email text not null,
  referente_telefono text,
  accettazione_schema_tipo boolean not null,
  accettazione_privacy boolean not null,
  approvata_il timestamp with time zone,
  note_interne text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone,
  logo_staging_path text,
  lat double precision,
  lng double precision,
  mostra_in_mappa boolean default false not null,
  indirizzo text,
  geo_stato text,
  informativa_versione text default '2026-07-13'::text not null,
  beneficio_sintetico text,
  punti_extra_grezzi text);

create table if not exists public.convenzioni_punti (
  id uuid default gen_random_uuid() not null,
  convenzione_id uuid,
  nome_punto text not null,
  indirizzo text,
  lat double precision not null,
  lng double precision not null,
  geo_stato text default 'manuale'::text not null,
  pubblicato boolean default false not null,
  note_interne text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.convenzioni_rate_limit (
  ip_hash text not null,
  finestra timestamp with time zone not null,
  count integer default 1 not null);

create table if not exists public.corso (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  slug text not null,
  sottotitolo text,
  descrizione text,
  immagine_copertina_url text,
  trailer_url text,
  autore_id uuid,
  livello_accesso text default 'socio'::text not null,
  pubblicato boolean default false,
  in_evidenza boolean default false,
  ordine integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.corso_vetrina (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  sottotitolo text,
  descrizione text,
  immagine_url text,
  url_noslab text,
  stato text default 'in_arrivo'::text not null,
  ordine integer default 100 not null,
  attivo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.custodi_categoria (
  slug text not null,
  titolo_it text not null,
  titolo_lenga text,
  descrizione text,
  ordine integer default 100 not null,
  attiva boolean default true not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.custodi_memoria (
  id uuid default gen_random_uuid() not null,
  nome_pubblico text not null,
  paese text,
  descrizione_contributo text not null,
  anno integer not null,
  anonimo boolean default false not null,
  visibile boolean default false not null,
  created_at timestamp with time zone default now() not null,
  categoria_slug text,
  valle text,
  epoca text,
  tipo_materiale text,
  sezione text default 'custodi'::text not null);

create table if not exists public.deroga_quota (
  id uuid default gen_random_uuid() not null,
  domanda_id uuid not null,
  anno integer not null,
  motivo text not null,
  deliberata_da uuid,
  deliberata_il timestamp with time zone default now() not null);

create table if not exists public.distintivo (
  id integer default nextval('distintivo_id_seq'::regclass) not null,
  codice text not null,
  nome text not null,
  descrizione text,
  criterio text,
  icona text);

create table if not exists public.dizionario_lemma (
  id uuid default gen_random_uuid() not null,
  lemma text not null,
  parlata text,
  categoria_gramm text,
  definizione text not null,
  etimologia text,
  esempi_uso text,
  proverbi text,
  variante_italiana text,
  fonte text,
  creato_da uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  tipo text,
  comune text,
  audio_id uuid,
  stato text default 'proposto'::text not null,
  contributore_id uuid,
  validato_da text,
  validato_il timestamp with time zone,
  motivo_rifiuto text,
  sorgente_utm jsonb,
  annunciato_il timestamp with time zone,
  slug text,
  motivo_ritiro text,
  ritirato_da uuid,
  ritirato_il timestamp with time zone,
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, immutable_unaccent(((((((COALESCE(lemma, ''::text) || ' '::text) || COALESCE(definizione, ''::text)) || ' '::text) || COALESCE(esempi_uso, ''::text)) || ' '::text) || COALESCE(variante_italiana, ''::text))))) stored);

create table if not exists public.documento_pubblico (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  descrizione text,
  file_url text not null,
  file_nome text not null,
  file_dimensione_bytes bigint,
  file_mime text default 'application/pdf'::text,
  categoria text,
  anno integer,
  visibile boolean default true,
  ordine integer default 0,
  caricato_da uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.domande_tesseramento (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  email text not null,
  messaggio text,
  data_nascita date,
  comune_nascita text,
  sesso text,
  anno integer default 2026 not null,
  stato text default 'in_attesa'::text not null,
  numero_tessera integer,
  approvata_da text,
  approvata_il timestamp with time zone,
  tessera_inviata boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone,
  scadenza date,
  codice_tessera text,
  sorgente_utm jsonb,
  motivo_rifiuto text,
  integrazione_richiesta_il timestamp with time zone,
  consenso_privacy boolean default false not null,
  informativa_versione text default '2026-07-13'::text not null,
  consenso_modalita text,
  sollecito_direttivo_il timestamp with time zone,
  metodo_scelto text,
  deroga_pagamento_motivo text,
  cognome text,
  residenza_via text,
  residenza_civico text,
  residenza_cap text,
  residenza_comune text,
  residenza_provincia text,
  telefono text,
  categoria_socio text default 'ordinario'::text,
  stato_socio text default 'attivo'::text,
  cessazione_data date,
  cessazione_motivo text,
  note_segreteria text,
  codice_fiscale text,
  anagrafica_aggiornata_il timestamp with time zone,
  anagrafica_aggiornata_da uuid,
  cessazione_deliberata_da uuid,
  cessazione_deliberata_il timestamp with time zone,
  recesso_comunicato_il date,
  numero_socio integer,
  cessazione_delibera text,
  account_id uuid);

create table if not exists public.donazione_materiale (
  id uuid default gen_random_uuid() not null,
  donatore_id uuid,
  tipo_donatore text default 'ospite'::text not null,
  titolo text not null,
  descrizione text not null,
  provenienza text,
  tipo text,
  file_urls text[] default '{}'::text[] not null,
  diritti_dichiarati boolean default false not null,
  stato text default 'in_attesa'::text not null,
  approvata_da uuid,
  approvata_il timestamp with time zone,
  note_interne text,
  created_at timestamp with time zone default now() not null,
  donatore_nome text,
  donatore_email text,
  donatore_telefono text,
  consenso_conservazione boolean default false not null,
  consenso_privacy boolean default false not null);

create table if not exists public.download_lead (
  id uuid default gen_random_uuid() not null,
  risorsa text not null,
  nome text not null,
  email text not null,
  telefono text,
  consenso_privacy boolean default false not null,
  consenso_newsletter boolean default false not null,
  sorgente jsonb,
  created_at timestamp with time zone default now() not null);

create table if not exists public.email_outbox (
  id uuid default gen_random_uuid() not null,
  destinatario text not null,
  oggetto text not null,
  html text not null,
  reply_to text,
  cc text[],
  bcc text[],
  tags jsonb,
  stato text default 'bozza'::text not null,
  tentativi integer default 0 not null,
  richiesta_id bigint,
  resend_id text,
  errore text,
  origine text default 'chat'::text not null,
  creato_da uuid default auth.uid(),
  inviata_il timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.eventi_esterni (
  id uuid default gen_random_uuid() not null,
  fonte text not null,
  fonte_id text,
  url_fonte text,
  titolo text not null,
  descrizione text,
  data_inizio date not null,
  data_fine date,
  ricorrenza text,
  ora_inizio time without time zone,
  ora_fine time without time zone,
  luogo text,
  comune text,
  valle text,
  organizzatore text,
  contatti text,
  prezzo text,
  punteggio integer,
  pilastro integer,
  motivo_punteggio jsonb,
  flag text[] default '{}'::text[] not null,
  stato text default 'grezzo'::text not null,
  note_curatore text,
  curato_da uuid,
  curato_il timestamp with time zone,
  hash_dedup text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  slug text,
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, immutable_unaccent(((COALESCE(titolo, ''::text) || ' '::text) || COALESCE(descrizione, ''::text))))) stored);

create table if not exists public.eventi_esterni_date (
  id uuid default gen_random_uuid() not null,
  evento_id uuid not null,
  data date not null,
  annullata boolean default false not null,
  nota text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.eventi_organizzatori_esclusi (
  id uuid default gen_random_uuid() not null,
  nome_pattern text not null,
  motivo text,
  attivo boolean default true not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.evento (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  descrizione text,
  tipo text,
  luogo text,
  inizio timestamp with time zone not null,
  fine timestamp with time zone,
  immagine_url text,
  capienza_max integer,
  iscrizione_richiesta boolean default false,
  pubblicato boolean default false,
  creato_da uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.evento_iscrizione (
  evento_id uuid not null,
  utente_id uuid not null,
  numero_partecipanti integer default 1,
  note text,
  created_at timestamp with time zone default now());

create table if not exists public.forum_media (
  id uuid default gen_random_uuid() not null,
  thread_id uuid,
  post_id uuid,
  tipo text default 'immagine'::text not null,
  url text not null,
  ordine integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  anteprima_url text);

create table if not exists public.forum_post (
  id uuid default gen_random_uuid() not null,
  thread_id uuid not null,
  autore_id uuid not null,
  contenuto text not null,
  modificato_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  menzioni uuid[] default '{}'::uuid[] not null);

create table if not exists public.forum_reazione (
  id uuid default gen_random_uuid() not null,
  thread_id uuid,
  post_id uuid,
  utente_id uuid not null,
  emoji text not null,
  created_at timestamp with time zone default now());

create table if not exists public.forum_thread (
  id uuid default gen_random_uuid() not null,
  topic_id integer not null,
  titolo text,
  autore_id uuid not null,
  fissato boolean default false,
  chiuso boolean default false,
  created_at timestamp with time zone default now(),
  ultimo_messaggio_at timestamp with time zone default now(),
  tipo text default 'discussione'::text not null,
  menzioni uuid[] default '{}'::uuid[] not null);

create table if not exists public.forum_topic (
  id integer default nextval('forum_topic_id_seq'::regclass) not null,
  nome text not null,
  descrizione text,
  ordine integer default 0,
  attivo boolean default true,
  created_at timestamp with time zone default now());

create table if not exists public.geocodifica_coda (
  id boolean default true not null,
  prossima_disponibile timestamp with time zone default now() not null);

create table if not exists public.glossario_operazione (
  id uuid default gen_random_uuid() not null,
  tipo text not null,
  campo text,
  valore_nuovo text,
  quanti integer default 0 not null,
  prima jsonb default '[]'::jsonb not null,
  esclusi jsonb default '[]'::jsonb not null,
  chi uuid,
  quando timestamp with time zone default now() not null,
  annullata_il timestamp with time zone,
  annullata_da uuid);

create table if not exists public.guardiani_contributori (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  email text not null,
  consenso_glossario boolean default false not null,
  consenso_marketing boolean default false not null,
  marketing_double_optin boolean default false not null,
  marketing_token text,
  marketing_confermato_il timestamp with time zone,
  consenso_firma boolean default false not null,
  licenza_accettata boolean default false not null,
  licenza_tipo text default 'CC BY 4.0'::text not null,
  punti integer default 0 not null,
  sorgente_utm jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.guardiani_digest_invio (
  id bigint default nextval('guardiani_digest_invio_id_seq'::regclass) not null,
  inviato_il timestamp with time zone default now() not null,
  quanti integer not null,
  motivo text not null,
  esito text default 'ok'::text not null);

create table if not exists public.import_log (
  id uuid default gen_random_uuid() not null,
  tipo text not null,
  file_nome text,
  righe_totali integer,
  righe_create integer,
  righe_aggiornate integer,
  righe_skip integer,
  righe_errore integer,
  durata_ms integer,
  errori jsonb,
  eseguito_da uuid,
  created_at timestamp with time zone default now());

create table if not exists public.invito_tesseramento (
  email text not null,
  nome text,
  contributore_id uuid,
  occasione text not null,
  contributi integer default 0 not null,
  preparato_il timestamp with time zone default now() not null,
  inviato_il timestamp with time zone,
  non_ricontattare boolean default false not null,
  nota text);

create table if not exists public.iscrizione_corso (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  corso_id uuid not null,
  iscritto_at timestamp with time zone default now(),
  completato boolean default false,
  completato_at timestamp with time zone);

create table if not exists public.iscrizioni_gita (
  id uuid default gen_random_uuid() not null,
  evento_slug text default 'gita-giochi-medievali-2026'::text not null,
  nome text not null,
  cognome text not null,
  email text not null,
  telefono text,
  posti integer default 1 not null,
  is_socio boolean default false not null,
  codice_tessera text,
  stato text default 'in_attesa'::text not null,
  importo_anticipo numeric(8,2),
  importo_saldo numeric(8,2),
  bonus_preorder numeric(8,2) default 0 not null,
  metodo text,
  paypal_order_id text,
  paypal_capture_id text,
  payer_email text,
  consenso_privacy boolean default false not null,
  note text,
  sorgente_utm jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  informativa_versione text default '2026-07-13'::text not null);

create table if not exists public.lemma_commento (
  id uuid default gen_random_uuid() not null,
  lemma_id uuid not null,
  testo text not null,
  nome text,
  email text,
  comune text,
  gettone text,
  utente_id uuid,
  stato text default 'in_attesa'::text not null,
  moderato_da uuid,
  moderato_il timestamp with time zone,
  created_at timestamp with time zone default now() not null);

create table if not exists public.lemma_correzione (
  id uuid default gen_random_uuid() not null,
  lemma_id uuid not null,
  campo text not null,
  proposta text not null,
  motivazione text,
  nome text,
  email text,
  gettone text,
  stato text default 'nuova'::text not null,
  esaminata_da uuid,
  esaminata_il timestamp with time zone,
  nota_curatore text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.lemma_relazione (
  id uuid default gen_random_uuid() not null,
  a_id uuid not null,
  b_id uuid not null,
  tipo text default 'variante'::text not null,
  nota text,
  creata_da uuid,
  created_at timestamp with time zone default now() not null);

create table if not exists public.lezione (
  id uuid default gen_random_uuid() not null,
  modulo_id uuid not null,
  corso_id uuid not null,
  titolo text not null,
  slug text not null,
  descrizione text,
  video_url text,
  durata_min integer,
  trascrizione text,
  allegati_urls text[],
  livello_accesso text default 'socio'::text not null,
  ordine integer default 0 not null,
  pubblicata boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  immagine_url text,
  fonte_esterna_id text,
  video_bunny_id text,
  video_url_originale text);

create table if not exists public.livello (
  id integer default nextval('livello_id_seq'::regclass) not null,
  codice text not null,
  nome text not null,
  soglia_punti integer not null,
  ordine integer not null,
  descrizione text,
  icona text);

create table if not exists public.luoghi_interesse (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  categoria text not null,
  valle text not null,
  lat double precision not null,
  lng double precision not null,
  descrizione_breve text,
  url_articolo text,
  fonte_immagine text,
  stato text default 'bozza'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  slug text,
  meta_description text,
  descrizione_estesa text,
  in_anteprima boolean default false not null,
  nome_ladino text,
  nome_tedesco text,
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, immutable_unaccent(((((((((COALESCE(nome, ''::text) || ' '::text) || COALESCE(nome_ladino, ''::text)) || ' '::text) || COALESCE(nome_tedesco, ''::text)) || ' '::text) || COALESCE(descrizione_breve, ''::text)) || ' '::text) || COALESCE(descrizione_estesa, ''::text))))) stored,
  indirizzo text,
  geo_stato text,
  creato_da uuid,
  proposto_il timestamp with time zone,
  pubblicato_da uuid,
  pubblicato_il timestamp with time zone,
  note_curatela text,
  parlata text,
  nome_ladino_varianti text[],
  pronuncia_ipa text,
  audio_id uuid,
  etimologia text,
  etimologia_strato text,
  etimologia_certezza text,
  toponimo_note text,
  toponimo_validato_da uuid,
  toponimo_validato_il timestamp with time zone,
  immagini_urls text[]);

create table if not exists public.memoria_evento (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  nome text not null,
  nome_originale text,
  data_da date,
  data_a date,
  luogo text,
  descrizione text,
  fonti text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.memoria_evento_reparto (
  id uuid default gen_random_uuid() not null,
  evento_id uuid not null,
  sigla text,
  denominazione_documento text not null,
  comando text,
  fonte text not null,
  citazione text,
  confidenza text default 'da_verificare'::text not null,
  note text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.memoria_fondo (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  titolo text not null,
  sottotitolo text,
  tipo text default 'cimitero_militare'::text not null,
  comune text not null,
  valle text,
  lat double precision,
  lng double precision,
  anno_da integer,
  anno_a integer,
  descrizione text,
  archivio text,
  segnatura text,
  ricercatore text,
  ricercatore_note text,
  licenza_immagini text,
  planimetria_url text,
  planimetria_geo jsonb,
  posti_censiti integer,
  stato text default 'bozza'::text not null,
  pubblicato_il timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  slug_breve text not null,
  racconto_html text,
  protocollo text,
  anno_pratica integer);

create table if not exists public.memoria_persona (
  id uuid default gen_random_uuid() not null,
  fondo_id uuid not null,
  settore text,
  numero integer,
  nome_completo text,
  cognome text,
  nome text,
  grado text,
  reparto text,
  data_morte_testo text,
  data_morte date,
  anno_nascita integer,
  luogo_nascita text,
  regione_nascita text,
  prigioniero_guerra boolean default false not null,
  ignoto boolean default false not null,
  note text,
  verificato boolean default false not null,
  created_at timestamp with time zone default now() not null,
  slug text,
  evento_id uuid,
  evento_certezza text,
  stessa_persona_di uuid,
  relazione_registrazione text,
  nota_registrazione text,
  evento_motivazione text);

create table if not exists public.memoria_reparto (
  id uuid default gen_random_uuid() not null,
  sigla text not null,
  slug text not null,
  scioglimento text,
  denominazione text,
  arma text,
  certezza text default 'da_verificare'::text not null,
  sigla_padre text,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.messaggio (
  id uuid default gen_random_uuid() not null,
  conversazione_id text not null,
  mittente_id uuid not null,
  destinatario_id uuid not null,
  testo text not null,
  allegato_url text,
  allegato_tipo text,
  letto boolean default false,
  letto_at timestamp with time zone,
  created_at timestamp with time zone default now());

create table if not exists public.modifica_contenuto (
  id bigint default nextval('modifica_contenuto_id_seq'::regclass) not null,
  tabella text not null,
  riga_id uuid not null,
  campo text not null,
  prima text,
  dopo text,
  chi uuid,
  quando timestamp with time zone default now() not null);

create table if not exists public.modulo_corso (
  id uuid default gen_random_uuid() not null,
  corso_id uuid not null,
  titolo text not null,
  descrizione text,
  ordine integer default 0 not null,
  created_at timestamp with time zone default now());

create table if not exists public.museo_gg_pezzo (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  descrizione text,
  tipo text default 'foto'::text not null,
  anno integer,
  periodo text,
  luogo text,
  valle text,
  fonte text not null,
  elaborazione text,
  donatore text,
  immagini_urls text[] default '{}'::text[] not null,
  consenso_dichiarato boolean default false not null,
  stato text default 'in_attesa'::text not null,
  caricato_da uuid,
  validato_da uuid,
  validato_il timestamp with time zone,
  ordine integer default 100 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  racconto text,
  slug text,
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, immutable_unaccent(((((COALESCE(titolo, ''::text) || ' '::text) || COALESCE(descrizione, ''::text)) || ' '::text) || COALESCE(racconto, ''::text))))) stored);

create table if not exists public.museo_gg_proposta (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  contatto text not null,
  tipo text,
  descrizione text not null,
  stato text default 'nuova'::text not null,
  note_interne text,
  gestita_da uuid,
  created_at timestamp with time zone default now() not null);

create table if not exists public.museo_gg_raccolta (
  id uuid default gen_random_uuid() not null,
  slug text,
  titolo text not null,
  occhiello text,
  sommario text,
  introduzione text,
  copertina_url text,
  stato text default 'bozza'::text not null,
  ordine integer default 100 not null,
  creata_da uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.museo_gg_raccolta_pezzo (
  raccolta_id uuid not null,
  pezzo_id uuid not null,
  ordine integer default 100 not null,
  nota text);

create table if not exists public.newsletter (
  id uuid default gen_random_uuid() not null,
  oggetto text not null,
  corpo_html text not null,
  destinatari_filtro jsonb,
  inviata boolean default false,
  inviata_at timestamp with time zone,
  destinatari_count integer,
  inviata_da uuid,
  created_at timestamp with time zone default now(),
  stato text default 'bozza'::text not null,
  gruppo text,
  invio_iniziato_il timestamp with time zone,
  invio_finito_il timestamp with time zone,
  consegnati integer default 0 not null,
  falliti integer default 0 not null,
  provata_il timestamp with time zone,
  provata_da uuid,
  creata_da uuid);

create table if not exists public.newsletter_invio (
  id uuid default gen_random_uuid() not null,
  campagna_id uuid not null,
  iscritto_id uuid,
  email text not null,
  outbox_id uuid,
  creato_il timestamp with time zone default now() not null);

create table if not exists public.newsletter_iscritto (
  id uuid default gen_random_uuid() not null,
  email text not null,
  nome text,
  stato text default 'in_attesa'::text not null,
  origine text default 'modulo_sito'::text not null,
  utente_id uuid,
  domanda_id uuid,
  iscritto_il timestamp with time zone default now() not null,
  confermato_il timestamp with time zone,
  confermato_ip text,
  disiscritto_il timestamp with time zone,
  disiscritto_ip text,
  disiscritto_da_campagna uuid,
  rimbalzato_il timestamp with time zone,
  rimbalzo_motivo text,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.notifica (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  tipo text not null,
  titolo text not null,
  corpo text,
  url text,
  letta boolean default false,
  letta_at timestamp with time zone,
  created_at timestamp with time zone default now());

create table if not exists public.notifica_consegna (
  id bigint default nextval('notifica_consegna_id_seq'::regclass) not null,
  notifica_id uuid,
  tipo text,
  utente_id uuid,
  destinatari_token integer default 0 not null,
  consegnati integer default 0 not null,
  falliti integer default 0 not null,
  esito text not null,
  dettaglio text,
  tentativi integer default 1 not null,
  quando timestamp with time zone default now() not null);

create table if not exists public.notifica_preferenza (
  utente_id uuid not null,
  tipo text not null,
  push boolean default true not null);

create table if not exists public.ocr_trascrizione (
  id uuid default gen_random_uuid() not null,
  oggetto_tipo text not null,
  oggetto_id uuid not null,
  immagine_url text not null,
  testo text,
  testo_grezzo text,
  stato text default 'da_rivedere'::text not null,
  errore text,
  modello text,
  token_in integer,
  token_out integer,
  chi uuid,
  confermata_da uuid,
  confermata_il timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, immutable_unaccent(COALESCE(testo, ''::text)))) stored);

create table if not exists public.pagamenti_tesseramento (
  id uuid default gen_random_uuid() not null,
  tipo text default 'quota'::text not null,
  anonimo boolean default false not null,
  nome text,
  cognome text,
  email text,
  anno integer default 2026 not null,
  order_id text,
  capture_id text,
  importo numeric(6,2),
  valuta text default 'EUR'::text not null,
  stato text default 'creato'::text not null,
  payer_email text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone,
  metodo text default 'paypal'::text not null,
  anomalia boolean default false not null,
  ricevuta_path text,
  ricevuta_dati jsonb,
  domanda_id uuid,
  notificato boolean default false not null,
  incassato_da uuid,
  incassato_da_nome text,
  incassato_il date,
  registrato_da uuid,
  consegnato_tesoriere boolean default false not null,
  consegnato_il date,
  note_incasso text,
  sorgente_utm jsonb,
  data_ricostruita boolean default false not null,
  annullato_il timestamp with time zone,
  annullato_da uuid,
  annullato_motivo text);

create table if not exists public.permesso_anon_lettura_attesa (
  tabella text not null,
  motivo text not null,
  deciso_il date default CURRENT_DATE not null);

create table if not exists public.prima_nota (
  id uuid default gen_random_uuid() not null,
  data date not null,
  verso text not null,
  categoria text not null,
  sezione text default 'A'::text not null,
  descrizione text not null,
  importo numeric(10,2) not null,
  metodo text,
  controparte text,
  documento_path text,
  documento_nome text,
  raccolta_fondi_id uuid,
  note text,
  registrato_da uuid,
  registrato_il timestamp with time zone default now() not null,
  annullato_il timestamp with time zone,
  annullato_da uuid,
  annullato_motivo text);

create table if not exists public.progresso_lezione (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  lezione_id uuid not null,
  completata boolean default false,
  completata_at timestamp with time zone,
  secondi_visti integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.pubblicazione (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  sottotitolo text,
  abstract text,
  autori text[] not null,
  anno_pubblicazione integer,
  tipo text,
  rivista_o_collana text,
  pagine text,
  isbn_issn text,
  file_url text,
  link_esterno text,
  pubblicato_da_associazione boolean default false,
  visibile_ospiti boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.punti_evento (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  tipo_azione text not null,
  punti integer not null,
  riferimento_tipo text,
  riferimento_id text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.push_invito (
  utente_id uuid not null,
  chiesto_il timestamp with time zone,
  rifiuti integer default 0 not null,
  accettato_il timestamp with time zone,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.push_token (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  token text not null,
  device_info jsonb,
  attivo boolean default true,
  created_at timestamp with time zone default now(),
  ultimo_uso timestamp with time zone default now());

create table if not exists public.raccolta_fondi (
  id uuid default gen_random_uuid() not null,
  anno integer not null,
  denominazione text not null,
  data_inizio date,
  data_fine date,
  descrizione text,
  evento_slug text,
  creata_da uuid,
  creata_il timestamp with time zone default now() not null);

create table if not exists public.reazione (
  id uuid default gen_random_uuid() not null,
  oggetto_tipo text not null,
  oggetto_id uuid not null,
  tipo text default 'conosco'::text not null,
  utente_id uuid,
  gettone text,
  comune text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.registro_curatela (
  id uuid default gen_random_uuid() not null,
  tabella text not null,
  record_id uuid not null,
  azione text not null,
  utente_id uuid,
  dati_prima jsonb,
  dati_dopo jsonb,
  created_at timestamp with time zone default now() not null);

create table if not exists public.reminder_super_admin (
  id uuid default gen_random_uuid() not null,
  categoria text not null,
  titolo text not null,
  descrizione text not null,
  priorita integer default 3 not null,
  stato text default 'da_fare'::text not null,
  scadenza date,
  bloccato_da text,
  link_riferimento text,
  note text,
  creato_il timestamp with time zone default now() not null,
  aggiornato_il timestamp with time zone default now() not null,
  fatto_il timestamp with time zone,
  origine_sessione text);

create table if not exists public.rendiconto (
  anno integer not null,
  stato text default 'redatto'::text not null,
  cassa_iniziale numeric(10,2) default 0 not null,
  banca_iniziale numeric(10,2) default 0 not null,
  redatto_da uuid,
  redatto_il timestamp with time zone default now() not null,
  delibera_consiglio_id uuid,
  approvato_consiglio_il timestamp with time zone,
  approvato_consiglio_da uuid,
  delibera_assemblea_id uuid,
  approvato_assemblea_il timestamp with time zone,
  approvato_assemblea_da uuid,
  depositato_il date,
  note text);

create table if not exists public.richieste_contatto (
  id uuid default gen_random_uuid() not null,
  codice_pratica text not null,
  tipo text not null,
  categoria text not null,
  nome text not null,
  email text not null,
  telefono text,
  paese text,
  messaggio text,
  payload jsonb default '{}'::jsonb not null,
  allegati text[] default '{}'::text[] not null,
  stato text default 'nuova'::text not null,
  consenso_privacy_at timestamp with time zone not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.ruolo (
  id integer default nextval('ruolo_id_seq'::regclass) not null,
  nome text not null,
  descrizione text,
  livello integer not null,
  created_at timestamp with time zone default now());

create table if not exists public.sala_canale (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  nome text not null,
  descrizione text,
  emoji text,
  privato boolean default false,
  ordine integer default 0,
  attivo boolean default true,
  created_at timestamp with time zone default now());

create table if not exists public.sala_messaggio (
  id uuid default gen_random_uuid() not null,
  canale_id uuid not null,
  autore_id uuid not null,
  risposta_a_id uuid,
  testo text not null,
  allegato_url text,
  allegato_nome text,
  modificato boolean default false,
  cancellato boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.sala_votazione (
  id uuid default gen_random_uuid() not null,
  titolo text not null,
  descrizione text,
  tipo text default 'semplice'::text,
  messaggio_id uuid,
  opzioni jsonb not null,
  stato text default 'aperta'::text,
  aperta_at timestamp with time zone default now(),
  chiusa_at timestamp with time zone,
  chiudere_at timestamp with time zone,
  creato_da uuid,
  risultato text,
  riepilogo text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.sala_voto (
  id uuid default gen_random_uuid() not null,
  votazione_id uuid not null,
  utente_id uuid not null,
  opzione_chiave text not null,
  motivazione text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.sentinella_pagina (
  id bigint default nextval('sentinella_pagina_id_seq'::regclass) not null,
  cosa text not null,
  slug text,
  url text not null,
  richiesta_id bigint,
  status_code integer,
  esito text default 'in_volo'::text not null,
  controllato_il timestamp with time zone default now() not null);

create table if not exists public.servizio (
  nome text not null,
  descrizione text not null,
  cadenza_massima_ore integer not null,
  attivo boolean default true not null,
  creato_il timestamp with time zone default now() not null);

create table if not exists public.servizio_battito (
  id bigint default nextval('servizio_battito_id_seq'::regclass) not null,
  servizio text not null,
  esito text not null,
  dettaglio jsonb,
  creato_il timestamp with time zone default now() not null);

create table if not exists public.solleciti_integrazione (
  id uuid default gen_random_uuid() not null,
  domanda_id uuid not null,
  tipo_sollecito integer not null,
  inviato_il timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.sollecito_quota (
  id uuid default gen_random_uuid() not null,
  domanda_id uuid not null,
  email text not null,
  numero smallint not null,
  inviato_il timestamp with time zone default now() not null,
  esito text default 'in_corso'::text not null,
  dettaglio text);

create table if not exists public.spunto_settimana (
  id uuid default gen_random_uuid() not null,
  testo text not null,
  attivo_dal date default CURRENT_DATE not null,
  creato_da uuid,
  created_at timestamp with time zone default now() not null);

create table if not exists public.storia (
  id uuid default gen_random_uuid() not null,
  autore_id uuid not null,
  titolo text not null,
  contenuto text not null,
  immagini_urls text[] default '{}'::text[] not null,
  copertina_url text,
  stato text default 'pubblicata'::text not null,
  pubblica boolean default false not null,
  diritti_dichiarati boolean default false not null,
  promossa_da uuid,
  promossa_il timestamp with time zone,
  moderata_da uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  search_vector tsvector generated always as (to_tsvector('italian'::regconfig, immutable_unaccent(((COALESCE(titolo, ''::text) || ' '::text) || COALESCE(contenuto, ''::text))))) stored);

create table if not exists public.telegram_config (
  chiave text not null,
  valore text not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.telegram_link (
  telegram_user_id bigint not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null,
  revoked_at timestamp with time zone);

create table if not exists public.telegram_link_token (
  token text not null,
  user_id uuid not null,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone default now() not null);

create table if not exists public.telegram_notifica (
  tipo text not null,
  categoria text not null,
  etichetta text not null,
  attivo boolean default true not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.telegram_rate_limit (
  chat_id_hash text not null,
  giorno date not null,
  messaggi integer default 0 not null,
  ultimo_uso timestamp with time zone default now() not null);

create table if not exists public.tesseramento (
  id uuid default gen_random_uuid() not null,
  utente_id uuid not null,
  anno integer not null,
  quota_eur numeric(8,2) not null,
  pagato boolean default false,
  metodo_pagamento text,
  data_pagamento date,
  scadenza date not null,
  ricevuta_numero text,
  note text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now());

create table if not exists public.tesseramento_anno (
  id uuid default gen_random_uuid() not null,
  domanda_id uuid not null,
  anno integer not null,
  codice_tessera text,
  emessa_il timestamp with time zone,
  inviata_il timestamp with time zone,
  creata_il timestamp with time zone default now() not null);

create table if not exists public.toponimo_attestazione (
  id uuid default gen_random_uuid() not null,
  luogo_id uuid not null,
  forma text not null,
  anno_da integer,
  anno_a integer,
  fonte text not null,
  collocazione_archivistica text,
  url_fonte text,
  immagine_url text,
  note text,
  inserito_da uuid,
  created_at timestamp with time zone default now() not null);

create table if not exists public.utente (
  id uuid not null,
  email citext not null,
  nome text not null,
  cognome text not null,
  telefono text,
  data_nascita date,
  luogo_nascita text,
  indirizzo text,
  cap text,
  citta text,
  provincia text,
  bio text,
  avatar_url text,
  preferenze jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  mostra_livello boolean default true not null);

create table if not exists public.utente_distintivo (
  utente_id uuid not null,
  distintivo_id integer not null,
  assegnato_il timestamp with time zone default now() not null,
  assegnato_da uuid);

create table if not exists public.utente_ruolo (
  utente_id uuid not null,
  ruolo_id integer not null,
  assegnato_da uuid,
  assegnato_at timestamp with time zone default now());

create table if not exists public.vocabolario_voce (
  id uuid default gen_random_uuid() not null,
  dominio text not null,
  valore text not null,
  etichetta text,
  gruppo text,
  ordine integer default 100 not null,
  stato text default 'attivo'::text not null,
  unito_in text,
  proposto_da text,
  nota text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

-- ---- 4. VINCOLI: chiave primaria, unique, check, chiave esterna -----------
alter table public._import_gokollab add constraint _import_gokollab_pkey PRIMARY KEY (id);
alter table public._mappa_img_wp add constraint _mappa_img_wp_pkey PRIMARY KEY (rel);
alter table public.ai_config_ruolo add constraint ai_config_ruolo_pkey PRIMARY KEY (ruolo_nome);
alter table public.ai_conversazione add constraint ai_conversazione_pkey PRIMARY KEY (id);
alter table public.ai_messaggio add constraint ai_messaggio_pkey PRIMARY KEY (id);
alter table public.ai_rate_limit add constraint ai_rate_limit_pkey PRIMARY KEY (utente_id, giorno);
alter table public.ai_rate_limit_pubblico add constraint ai_rate_limit_pubblico_pkey PRIMARY KEY (ip_hash, giorno);
alter table public.ai_sorgente_citata add constraint ai_sorgente_citata_pkey PRIMARY KEY (id);
alter table public.anagrafica_modifica add constraint anagrafica_modifica_pkey PRIMARY KEY (id);
alter table public.andreas_campagna add constraint andreas_campagna_pkey PRIMARY KEY (id);
alter table public.andreas_canale add constraint andreas_canale_pkey PRIMARY KEY (id);
alter table public.andreas_kb add constraint andreas_kb_pkey PRIMARY KEY (id);
alter table public.andreas_kb_sorgente add constraint andreas_kb_sorgente_pkey PRIMARY KEY (id);
alter table public.andreas_pubblicazione add constraint andreas_pubblicazione_pkey PRIMARY KEY (id);
alter table public.archivio_audio add constraint archivio_audio_pkey PRIMARY KEY (id);
alter table public.archivio_categoria add constraint archivio_categoria_pkey PRIMARY KEY (id);
alter table public.archivio_documento add constraint archivio_documento_pkey PRIMARY KEY (id);
alter table public.articolo add constraint articolo_pkey PRIMARY KEY (id);
alter table public.assoc_delega add constraint assoc_delega_pkey PRIMARY KEY (id);
alter table public.assoc_delibera add constraint assoc_delibera_pkey PRIMARY KEY (id);
alter table public.assoc_documento add constraint assoc_documento_pkey PRIMARY KEY (id);
alter table public.assoc_modifica add constraint assoc_modifica_pkey PRIMARY KEY (id);
alter table public.assoc_presenza add constraint assoc_presenza_pkey PRIMARY KEY (id);
alter table public.assoc_riunione add constraint assoc_riunione_pkey PRIMARY KEY (id);
alter table public.auth_otp add constraint auth_otp_pkey PRIMARY KEY (id);
alter table public.comunicazione_destinatario add constraint comunicazione_destinatario_pkey PRIMARY KEY (id);
alter table public.comunicazione_istituzionale add constraint comunicazione_istituzionale_pkey PRIMARY KEY (id);
alter table public.config_app add constraint config_app_pkey PRIMARY KEY (chiave);
alter table public.consenso add constraint consenso_pkey PRIMARY KEY (id);
alter table public.contatti_progressivo add constraint contatti_progressivo_pkey PRIMARY KEY (anno);
alter table public.convenzioni add constraint convenzioni_pkey PRIMARY KEY (id);
alter table public.convenzioni_punti add constraint convenzioni_punti_pkey PRIMARY KEY (id);
alter table public.convenzioni_rate_limit add constraint convenzioni_rate_limit_pkey PRIMARY KEY (ip_hash, finestra);
alter table public.corso add constraint corso_pkey PRIMARY KEY (id);
alter table public.corso_vetrina add constraint corso_vetrina_pkey PRIMARY KEY (id);
alter table public.custodi_categoria add constraint custodi_categoria_pkey PRIMARY KEY (slug);
alter table public.custodi_memoria add constraint custodi_memoria_pkey PRIMARY KEY (id);
alter table public.deroga_quota add constraint deroga_quota_pkey PRIMARY KEY (id);
alter table public.distintivo add constraint distintivo_pkey PRIMARY KEY (id);
alter table public.dizionario_lemma add constraint dizionario_lemma_pkey PRIMARY KEY (id);
alter table public.documento_pubblico add constraint documento_pubblico_pkey PRIMARY KEY (id);
alter table public.domande_tesseramento add constraint domande_tesseramento_pkey PRIMARY KEY (id);
alter table public.donazione_materiale add constraint donazione_materiale_pkey PRIMARY KEY (id);
alter table public.download_lead add constraint download_lead_pkey PRIMARY KEY (id);
alter table public.email_outbox add constraint email_outbox_pkey PRIMARY KEY (id);
alter table public.eventi_esterni add constraint eventi_esterni_pkey PRIMARY KEY (id);
alter table public.eventi_esterni_date add constraint eventi_esterni_date_pkey PRIMARY KEY (id);
alter table public.eventi_organizzatori_esclusi add constraint eventi_organizzatori_esclusi_pkey PRIMARY KEY (id);
alter table public.evento add constraint evento_pkey PRIMARY KEY (id);
alter table public.evento_iscrizione add constraint evento_iscrizione_pkey PRIMARY KEY (evento_id, utente_id);
alter table public.forum_media add constraint forum_media_pkey PRIMARY KEY (id);
alter table public.forum_post add constraint forum_post_pkey PRIMARY KEY (id);
alter table public.forum_reazione add constraint forum_reazione_pkey PRIMARY KEY (id);
alter table public.forum_thread add constraint forum_thread_pkey PRIMARY KEY (id);
alter table public.forum_topic add constraint forum_topic_pkey PRIMARY KEY (id);
alter table public.geocodifica_coda add constraint geocodifica_coda_pkey PRIMARY KEY (id);
alter table public.glossario_operazione add constraint glossario_operazione_pkey PRIMARY KEY (id);
alter table public.guardiani_contributori add constraint guardiani_contributori_pkey PRIMARY KEY (id);
alter table public.guardiani_digest_invio add constraint guardiani_digest_invio_pkey PRIMARY KEY (id);
alter table public.import_log add constraint import_log_pkey PRIMARY KEY (id);
alter table public.invito_tesseramento add constraint invito_tesseramento_pkey PRIMARY KEY (email);
alter table public.iscrizione_corso add constraint iscrizione_corso_pkey PRIMARY KEY (id);
alter table public.iscrizioni_gita add constraint iscrizioni_gita_pkey PRIMARY KEY (id);
alter table public.lemma_commento add constraint lemma_commento_pkey PRIMARY KEY (id);
alter table public.lemma_correzione add constraint lemma_correzione_pkey PRIMARY KEY (id);
alter table public.lemma_relazione add constraint lemma_relazione_pkey PRIMARY KEY (id);
alter table public.lezione add constraint lezione_pkey PRIMARY KEY (id);
alter table public.livello add constraint livello_pkey PRIMARY KEY (id);
alter table public.luoghi_interesse add constraint luoghi_interesse_pkey PRIMARY KEY (id);
alter table public.memoria_evento add constraint memoria_evento_pkey PRIMARY KEY (id);
alter table public.memoria_evento_reparto add constraint memoria_evento_reparto_pkey PRIMARY KEY (id);
alter table public.memoria_fondo add constraint memoria_fondo_pkey PRIMARY KEY (id);
alter table public.memoria_persona add constraint memoria_persona_pkey PRIMARY KEY (id);
alter table public.memoria_reparto add constraint memoria_reparto_pkey PRIMARY KEY (id);
alter table public.messaggio add constraint messaggio_pkey PRIMARY KEY (id);
alter table public.modifica_contenuto add constraint modifica_contenuto_pkey PRIMARY KEY (id);
alter table public.modulo_corso add constraint modulo_corso_pkey PRIMARY KEY (id);
alter table public.museo_gg_pezzo add constraint museo_gg_pezzo_pkey PRIMARY KEY (id);
alter table public.museo_gg_proposta add constraint museo_gg_proposta_pkey PRIMARY KEY (id);
alter table public.museo_gg_raccolta add constraint museo_gg_raccolta_pkey PRIMARY KEY (id);
alter table public.museo_gg_raccolta_pezzo add constraint museo_gg_raccolta_pezzo_pkey PRIMARY KEY (raccolta_id, pezzo_id);
alter table public.newsletter add constraint newsletter_pkey PRIMARY KEY (id);
alter table public.newsletter_invio add constraint newsletter_invio_pkey PRIMARY KEY (id);
alter table public.newsletter_iscritto add constraint newsletter_iscritto_pkey PRIMARY KEY (id);
alter table public.notifica add constraint notifica_pkey PRIMARY KEY (id);
alter table public.notifica_consegna add constraint notifica_consegna_pkey PRIMARY KEY (id);
alter table public.notifica_preferenza add constraint notifica_preferenza_pkey PRIMARY KEY (utente_id, tipo);
alter table public.ocr_trascrizione add constraint ocr_trascrizione_pkey PRIMARY KEY (id);
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_pkey PRIMARY KEY (id);
alter table public.permesso_anon_lettura_attesa add constraint permesso_anon_lettura_attesa_pkey PRIMARY KEY (tabella);
alter table public.prima_nota add constraint prima_nota_pkey PRIMARY KEY (id);
alter table public.progresso_lezione add constraint progresso_lezione_pkey PRIMARY KEY (id);
alter table public.pubblicazione add constraint pubblicazione_pkey PRIMARY KEY (id);
alter table public.punti_evento add constraint punti_evento_pkey PRIMARY KEY (id);
alter table public.push_invito add constraint push_invito_pkey PRIMARY KEY (utente_id);
alter table public.push_token add constraint push_token_pkey PRIMARY KEY (id);
alter table public.raccolta_fondi add constraint raccolta_fondi_pkey PRIMARY KEY (id);
alter table public.reazione add constraint reazione_pkey PRIMARY KEY (id);
alter table public.registro_curatela add constraint registro_curatela_pkey PRIMARY KEY (id);
alter table public.reminder_super_admin add constraint reminder_super_admin_pkey PRIMARY KEY (id);
alter table public.rendiconto add constraint rendiconto_pkey PRIMARY KEY (anno);
alter table public.richieste_contatto add constraint richieste_contatto_pkey PRIMARY KEY (id);
alter table public.ruolo add constraint ruolo_pkey PRIMARY KEY (id);
alter table public.sala_canale add constraint sala_canale_pkey PRIMARY KEY (id);
alter table public.sala_messaggio add constraint sala_messaggio_pkey PRIMARY KEY (id);
alter table public.sala_votazione add constraint sala_votazione_pkey PRIMARY KEY (id);
alter table public.sala_voto add constraint sala_voto_pkey PRIMARY KEY (id);
alter table public.sentinella_pagina add constraint sentinella_pagina_pkey PRIMARY KEY (id);
alter table public.servizio add constraint servizio_pkey PRIMARY KEY (nome);
alter table public.servizio_battito add constraint servizio_battito_pkey PRIMARY KEY (id);
alter table public.solleciti_integrazione add constraint solleciti_integrazione_pkey PRIMARY KEY (id);
alter table public.sollecito_quota add constraint sollecito_quota_pkey PRIMARY KEY (id);
alter table public.spunto_settimana add constraint spunto_settimana_pkey PRIMARY KEY (id);
alter table public.storia add constraint storia_pkey PRIMARY KEY (id);
alter table public.telegram_config add constraint telegram_config_pkey PRIMARY KEY (chiave);
alter table public.telegram_link add constraint telegram_link_pkey PRIMARY KEY (telegram_user_id);
alter table public.telegram_link_token add constraint telegram_link_token_pkey PRIMARY KEY (token);
alter table public.telegram_notifica add constraint telegram_notifica_pkey PRIMARY KEY (tipo);
alter table public.telegram_rate_limit add constraint telegram_rate_limit_pkey PRIMARY KEY (chat_id_hash, giorno);
alter table public.tesseramento add constraint tesseramento_pkey PRIMARY KEY (id);
alter table public.tesseramento_anno add constraint tesseramento_anno_pkey PRIMARY KEY (id);
alter table public.toponimo_attestazione add constraint toponimo_attestazione_pkey PRIMARY KEY (id);
alter table public.utente add constraint utente_pkey PRIMARY KEY (id);
alter table public.utente_distintivo add constraint utente_distintivo_pkey PRIMARY KEY (utente_id, distintivo_id);
alter table public.utente_ruolo add constraint utente_ruolo_pkey PRIMARY KEY (utente_id, ruolo_id);
alter table public.vocabolario_voce add constraint vocabolario_voce_pkey PRIMARY KEY (id);
alter table public.andreas_canale add constraint andreas_canale_slug_key UNIQUE (slug);
alter table public.archivio_categoria add constraint archivio_categoria_nome_key UNIQUE (nome);
alter table public.articolo add constraint articolo_slug_key UNIQUE (slug);
alter table public.assoc_delega add constraint assoc_delega_riunione_id_delegante_domanda_id_key UNIQUE (riunione_id, delegante_domanda_id);
alter table public.assoc_delibera add constraint assoc_delibera_riunione_id_numero_key UNIQUE (riunione_id, numero);
alter table public.assoc_presenza add constraint assoc_presenza_riunione_id_domanda_id_key UNIQUE (riunione_id, domanda_id);
alter table public.comunicazione_destinatario add constraint comunicazione_destinatario_unico UNIQUE (comunicazione_id, domanda_id);
alter table public.corso add constraint corso_slug_key UNIQUE (slug);
alter table public.deroga_quota add constraint deroga_quota_unica UNIQUE (domanda_id, anno);
alter table public.distintivo add constraint distintivo_codice_key UNIQUE (codice);
alter table public.domande_tesseramento add constraint domande_tesseramento_codice_tessera_key UNIQUE (codice_tessera);
alter table public.domande_tesseramento add constraint domande_tesseramento_numero_tessera_key UNIQUE (numero_tessera);
alter table public.eventi_esterni add constraint eventi_esterni_hash_dedup_key UNIQUE (hash_dedup);
alter table public.eventi_esterni_date add constraint eventi_esterni_date_evento_id_data_key UNIQUE (evento_id, data);
alter table public.forum_reazione add constraint forum_reazione_post_id_utente_id_emoji_key UNIQUE (post_id, utente_id, emoji);
alter table public.forum_reazione add constraint forum_reazione_thread_id_utente_id_emoji_key UNIQUE (thread_id, utente_id, emoji);
alter table public.forum_topic add constraint forum_topic_nome_key UNIQUE (nome);
alter table public.guardiani_contributori add constraint guardiani_contributori_email_key UNIQUE (email);
alter table public.iscrizione_corso add constraint iscrizione_corso_utente_id_corso_id_key UNIQUE (utente_id, corso_id);
alter table public.iscrizioni_gita add constraint iscrizioni_gita_paypal_capture_id_key UNIQUE (paypal_capture_id);
alter table public.lemma_relazione add constraint lemma_relazione_unica UNIQUE (a_id, b_id, tipo);
alter table public.lezione add constraint lezione_corso_id_slug_key UNIQUE (corso_id, slug);
alter table public.livello add constraint livello_codice_key UNIQUE (codice);
alter table public.memoria_evento add constraint memoria_evento_slug_key UNIQUE (slug);
alter table public.memoria_fondo add constraint memoria_fondo_slug_breve_key UNIQUE (slug_breve);
alter table public.memoria_fondo add constraint memoria_fondo_slug_key UNIQUE (slug);
alter table public.memoria_reparto add constraint memoria_reparto_sigla_key UNIQUE (sigla);
alter table public.memoria_reparto add constraint memoria_reparto_slug_key UNIQUE (slug);
alter table public.ocr_trascrizione add constraint ocr_trascrizione_oggetto_tipo_oggetto_id_immagine_url_key UNIQUE (oggetto_tipo, oggetto_id, immagine_url);
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_capture_id_key UNIQUE (capture_id);
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_order_id_key UNIQUE (order_id);
alter table public.progresso_lezione add constraint progresso_lezione_utente_id_lezione_id_key UNIQUE (utente_id, lezione_id);
alter table public.push_token add constraint push_token_token_key UNIQUE (token);
alter table public.richieste_contatto add constraint richieste_contatto_codice_pratica_key UNIQUE (codice_pratica);
alter table public.ruolo add constraint ruolo_nome_key UNIQUE (nome);
alter table public.sala_canale add constraint sala_canale_slug_key UNIQUE (slug);
alter table public.sala_voto add constraint sala_voto_votazione_id_utente_id_key UNIQUE (votazione_id, utente_id);
alter table public.solleciti_integrazione add constraint solleciti_integrazione_domanda_id_tipo_sollecito_key UNIQUE (domanda_id, tipo_sollecito);
alter table public.sollecito_quota add constraint sollecito_quota_una_volta UNIQUE (domanda_id, numero);
alter table public.tesseramento add constraint tesseramento_utente_id_anno_key UNIQUE (utente_id, anno);
alter table public.tesseramento_anno add constraint tesseramento_anno_codice_tessera_key UNIQUE (codice_tessera);
alter table public.tesseramento_anno add constraint tesseramento_anno_unico UNIQUE (domanda_id, anno);
alter table public.utente add constraint utente_email_key UNIQUE (email);
alter table public.vocabolario_voce add constraint vocabolario_unico UNIQUE (dominio, valore);
alter table public.ai_config_ruolo add constraint ai_config_ruolo_ruolo_nome_fkey FOREIGN KEY (ruolo_nome) REFERENCES ruolo(nome) ON UPDATE CASCADE;
alter table public.ai_conversazione add constraint ai_conversazione_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.ai_messaggio add constraint ai_messaggio_conversazione_id_fkey FOREIGN KEY (conversazione_id) REFERENCES ai_conversazione(id) ON DELETE CASCADE;
alter table public.ai_rate_limit add constraint ai_rate_limit_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.ai_sorgente_citata add constraint ai_sorgente_citata_messaggio_id_fkey FOREIGN KEY (messaggio_id) REFERENCES ai_messaggio(id) ON DELETE CASCADE;
alter table public.anagrafica_modifica add constraint anagrafica_modifica_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id) ON DELETE CASCADE;
alter table public.andreas_campagna add constraint andreas_campagna_created_da_fkey FOREIGN KEY (created_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.andreas_kb add constraint andreas_kb_sorgente_id_fkey FOREIGN KEY (sorgente_id) REFERENCES andreas_kb_sorgente(id) ON DELETE CASCADE;
alter table public.andreas_kb_sorgente add constraint andreas_kb_sorgente_ingestato_da_fkey FOREIGN KEY (ingestato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.andreas_pubblicazione add constraint andreas_pubblicazione_approvato_da_fkey FOREIGN KEY (approvato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.andreas_pubblicazione add constraint andreas_pubblicazione_campagna_id_fkey FOREIGN KEY (campagna_id) REFERENCES andreas_campagna(id) ON DELETE SET NULL;
alter table public.andreas_pubblicazione add constraint andreas_pubblicazione_canale_id_fkey FOREIGN KEY (canale_id) REFERENCES andreas_canale(id) ON DELETE RESTRICT;
alter table public.archivio_audio add constraint archivio_audio_lemma_id_fkey FOREIGN KEY (lemma_id) REFERENCES dizionario_lemma(id) ON DELETE SET NULL;
alter table public.archivio_audio add constraint archivio_audio_registrato_da_fkey FOREIGN KEY (registrato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.archivio_categoria add constraint archivio_categoria_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES archivio_categoria(id) ON DELETE SET NULL;
alter table public.archivio_documento add constraint archivio_documento_caricato_da_fkey FOREIGN KEY (caricato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.archivio_documento add constraint archivio_documento_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES archivio_categoria(id) ON DELETE SET NULL;
alter table public.articolo add constraint articolo_autore_id_fkey FOREIGN KEY (autore_id) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.assoc_delega add constraint assoc_delega_delegante_domanda_id_fkey FOREIGN KEY (delegante_domanda_id) REFERENCES domande_tesseramento(id) ON DELETE RESTRICT;
alter table public.assoc_delega add constraint assoc_delega_delegato_domanda_id_fkey FOREIGN KEY (delegato_domanda_id) REFERENCES domande_tesseramento(id) ON DELETE RESTRICT;
alter table public.assoc_delega add constraint assoc_delega_registrata_da_fkey FOREIGN KEY (registrata_da) REFERENCES auth.users(id);
alter table public.assoc_delega add constraint assoc_delega_riunione_id_fkey FOREIGN KEY (riunione_id) REFERENCES assoc_riunione(id) ON DELETE RESTRICT;
alter table public.assoc_delibera add constraint assoc_delibera_riunione_id_fkey FOREIGN KEY (riunione_id) REFERENCES assoc_riunione(id) ON DELETE RESTRICT;
alter table public.assoc_delibera add constraint assoc_delibera_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES domande_tesseramento(id) ON DELETE SET NULL;
alter table public.assoc_documento add constraint assoc_documento_caricato_da_fkey FOREIGN KEY (caricato_da) REFERENCES auth.users(id);
alter table public.assoc_presenza add constraint assoc_presenza_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id) ON DELETE RESTRICT;
alter table public.assoc_presenza add constraint assoc_presenza_registrata_da_fkey FOREIGN KEY (registrata_da) REFERENCES auth.users(id);
alter table public.assoc_presenza add constraint assoc_presenza_riunione_id_fkey FOREIGN KEY (riunione_id) REFERENCES assoc_riunione(id) ON DELETE RESTRICT;
alter table public.comunicazione_destinatario add constraint comunicazione_destinatario_comunicazione_id_fkey FOREIGN KEY (comunicazione_id) REFERENCES comunicazione_istituzionale(id) ON DELETE RESTRICT;
alter table public.comunicazione_destinatario add constraint comunicazione_destinatario_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id) ON DELETE RESTRICT;
alter table public.comunicazione_destinatario add constraint comunicazione_destinatario_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES email_outbox(id) ON DELETE SET NULL;
alter table public.comunicazione_istituzionale add constraint comunicazione_istituzionale_riunione_id_fkey FOREIGN KEY (riunione_id) REFERENCES assoc_riunione(id) ON DELETE SET NULL;
alter table public.config_app add constraint config_app_aggiornato_da_fkey FOREIGN KEY (aggiornato_da) REFERENCES utente(id);
alter table public.consenso add constraint consenso_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.convenzioni_punti add constraint convenzioni_punti_convenzione_id_fkey FOREIGN KEY (convenzione_id) REFERENCES convenzioni(id) ON DELETE CASCADE;
alter table public.corso add constraint corso_autore_id_fkey FOREIGN KEY (autore_id) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.custodi_memoria add constraint custodi_memoria_categoria_slug_fkey FOREIGN KEY (categoria_slug) REFERENCES custodi_categoria(slug);
alter table public.deroga_quota add constraint deroga_quota_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id) ON DELETE CASCADE;
alter table public.dizionario_lemma add constraint dizionario_lemma_audio_id_fkey FOREIGN KEY (audio_id) REFERENCES archivio_audio(id);
alter table public.dizionario_lemma add constraint dizionario_lemma_contributore_id_fkey FOREIGN KEY (contributore_id) REFERENCES guardiani_contributori(id);
alter table public.dizionario_lemma add constraint dizionario_lemma_creato_da_fkey FOREIGN KEY (creato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.documento_pubblico add constraint documento_pubblico_caricato_da_fkey FOREIGN KEY (caricato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.donazione_materiale add constraint donazione_materiale_donatore_id_fkey FOREIGN KEY (donatore_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.eventi_esterni add constraint eventi_esterni_curato_da_fkey FOREIGN KEY (curato_da) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.eventi_esterni_date add constraint eventi_esterni_date_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventi_esterni(id) ON DELETE CASCADE;
alter table public.evento add constraint evento_creato_da_fkey FOREIGN KEY (creato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.evento_iscrizione add constraint evento_iscrizione_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES evento(id) ON DELETE CASCADE;
alter table public.evento_iscrizione add constraint evento_iscrizione_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.forum_media add constraint forum_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES forum_post(id) ON DELETE CASCADE;
alter table public.forum_media add constraint forum_media_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES forum_thread(id) ON DELETE CASCADE;
alter table public.forum_post add constraint forum_post_autore_id_fkey FOREIGN KEY (autore_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.forum_post add constraint forum_post_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES forum_thread(id) ON DELETE CASCADE;
alter table public.forum_reazione add constraint forum_reazione_post_id_fkey FOREIGN KEY (post_id) REFERENCES forum_post(id) ON DELETE CASCADE;
alter table public.forum_reazione add constraint forum_reazione_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES forum_thread(id) ON DELETE CASCADE;
alter table public.forum_reazione add constraint forum_reazione_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.forum_thread add constraint forum_thread_autore_id_fkey FOREIGN KEY (autore_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.forum_thread add constraint forum_thread_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES forum_topic(id) ON DELETE CASCADE;
alter table public.import_log add constraint import_log_eseguito_da_fkey FOREIGN KEY (eseguito_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.iscrizione_corso add constraint iscrizione_corso_corso_id_fkey FOREIGN KEY (corso_id) REFERENCES corso(id) ON DELETE CASCADE;
alter table public.iscrizione_corso add constraint iscrizione_corso_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.lemma_commento add constraint lemma_commento_lemma_id_fkey FOREIGN KEY (lemma_id) REFERENCES dizionario_lemma(id) ON DELETE CASCADE;
alter table public.lemma_commento add constraint lemma_commento_moderato_da_fkey FOREIGN KEY (moderato_da) REFERENCES utente(id);
alter table public.lemma_commento add constraint lemma_commento_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.lemma_correzione add constraint lemma_correzione_esaminata_da_fkey FOREIGN KEY (esaminata_da) REFERENCES utente(id);
alter table public.lemma_correzione add constraint lemma_correzione_lemma_id_fkey FOREIGN KEY (lemma_id) REFERENCES dizionario_lemma(id) ON DELETE CASCADE;
alter table public.lemma_relazione add constraint lemma_relazione_a_id_fkey FOREIGN KEY (a_id) REFERENCES dizionario_lemma(id) ON DELETE CASCADE;
alter table public.lemma_relazione add constraint lemma_relazione_b_id_fkey FOREIGN KEY (b_id) REFERENCES dizionario_lemma(id) ON DELETE CASCADE;
alter table public.lezione add constraint lezione_corso_id_fkey FOREIGN KEY (corso_id) REFERENCES corso(id) ON DELETE CASCADE;
alter table public.lezione add constraint lezione_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES modulo_corso(id) ON DELETE CASCADE;
alter table public.luoghi_interesse add constraint luoghi_interesse_audio_id_fkey FOREIGN KEY (audio_id) REFERENCES archivio_audio(id);
alter table public.luoghi_interesse add constraint luoghi_interesse_creato_da_fkey FOREIGN KEY (creato_da) REFERENCES utente(id);
alter table public.luoghi_interesse add constraint luoghi_interesse_pubblicato_da_fkey FOREIGN KEY (pubblicato_da) REFERENCES utente(id);
alter table public.luoghi_interesse add constraint luoghi_interesse_toponimo_validato_da_fkey FOREIGN KEY (toponimo_validato_da) REFERENCES utente(id);
alter table public.memoria_evento_reparto add constraint memoria_evento_reparto_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES memoria_evento(id);
alter table public.memoria_persona add constraint memoria_persona_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES memoria_evento(id);
alter table public.memoria_persona add constraint memoria_persona_fondo_id_fkey FOREIGN KEY (fondo_id) REFERENCES memoria_fondo(id) ON DELETE CASCADE;
alter table public.memoria_persona add constraint memoria_persona_stessa_persona_di_fkey FOREIGN KEY (stessa_persona_di) REFERENCES memoria_persona(id);
alter table public.messaggio add constraint messaggio_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.messaggio add constraint messaggio_mittente_id_fkey FOREIGN KEY (mittente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.modifica_contenuto add constraint modifica_contenuto_chi_fkey FOREIGN KEY (chi) REFERENCES utente(id);
alter table public.modulo_corso add constraint modulo_corso_corso_id_fkey FOREIGN KEY (corso_id) REFERENCES corso(id) ON DELETE CASCADE;
alter table public.museo_gg_raccolta_pezzo add constraint museo_gg_raccolta_pezzo_pezzo_id_fkey FOREIGN KEY (pezzo_id) REFERENCES museo_gg_pezzo(id) ON DELETE CASCADE;
alter table public.museo_gg_raccolta_pezzo add constraint museo_gg_raccolta_pezzo_raccolta_id_fkey FOREIGN KEY (raccolta_id) REFERENCES museo_gg_raccolta(id) ON DELETE CASCADE;
alter table public.newsletter add constraint newsletter_inviata_da_fkey FOREIGN KEY (inviata_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.newsletter_invio add constraint newsletter_invio_campagna_id_fkey FOREIGN KEY (campagna_id) REFERENCES newsletter(id) ON DELETE CASCADE;
alter table public.newsletter_invio add constraint newsletter_invio_iscritto_id_fkey FOREIGN KEY (iscritto_id) REFERENCES newsletter_iscritto(id) ON DELETE SET NULL;
alter table public.newsletter_invio add constraint newsletter_invio_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES email_outbox(id) ON DELETE SET NULL;
alter table public.newsletter_iscritto add constraint newsletter_iscritto_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id) ON DELETE SET NULL;
alter table public.newsletter_iscritto add constraint newsletter_iscritto_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.notifica add constraint notifica_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.notifica_preferenza add constraint notifica_preferenza_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.ocr_trascrizione add constraint ocr_trascrizione_chi_fkey FOREIGN KEY (chi) REFERENCES utente(id);
alter table public.ocr_trascrizione add constraint ocr_trascrizione_confermata_da_fkey FOREIGN KEY (confermata_da) REFERENCES utente(id);
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id);
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_incassato_da_fkey FOREIGN KEY (incassato_da) REFERENCES utente(id);
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_registrato_da_fkey FOREIGN KEY (registrato_da) REFERENCES utente(id);
alter table public.prima_nota add constraint prima_nota_annullato_da_fkey FOREIGN KEY (annullato_da) REFERENCES auth.users(id);
alter table public.prima_nota add constraint prima_nota_raccolta_fondi_id_fkey FOREIGN KEY (raccolta_fondi_id) REFERENCES raccolta_fondi(id) ON DELETE SET NULL;
alter table public.prima_nota add constraint prima_nota_registrato_da_fkey FOREIGN KEY (registrato_da) REFERENCES auth.users(id);
alter table public.progresso_lezione add constraint progresso_lezione_lezione_id_fkey FOREIGN KEY (lezione_id) REFERENCES lezione(id) ON DELETE CASCADE;
alter table public.progresso_lezione add constraint progresso_lezione_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.punti_evento add constraint punti_evento_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.push_invito add constraint push_invito_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.push_token add constraint push_token_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.raccolta_fondi add constraint raccolta_fondi_creata_da_fkey FOREIGN KEY (creata_da) REFERENCES auth.users(id);
alter table public.reazione add constraint reazione_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.registro_curatela add constraint registro_curatela_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES auth.users(id);
alter table public.rendiconto add constraint rendiconto_approvato_assemblea_da_fkey FOREIGN KEY (approvato_assemblea_da) REFERENCES auth.users(id);
alter table public.rendiconto add constraint rendiconto_approvato_consiglio_da_fkey FOREIGN KEY (approvato_consiglio_da) REFERENCES auth.users(id);
alter table public.rendiconto add constraint rendiconto_delibera_assemblea_id_fkey FOREIGN KEY (delibera_assemblea_id) REFERENCES assoc_delibera(id) ON DELETE RESTRICT;
alter table public.rendiconto add constraint rendiconto_delibera_consiglio_id_fkey FOREIGN KEY (delibera_consiglio_id) REFERENCES assoc_delibera(id) ON DELETE RESTRICT;
alter table public.rendiconto add constraint rendiconto_redatto_da_fkey FOREIGN KEY (redatto_da) REFERENCES auth.users(id);
alter table public.sala_messaggio add constraint sala_messaggio_autore_id_fkey FOREIGN KEY (autore_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.sala_messaggio add constraint sala_messaggio_canale_id_fkey FOREIGN KEY (canale_id) REFERENCES sala_canale(id) ON DELETE RESTRICT;
alter table public.sala_messaggio add constraint sala_messaggio_risposta_a_id_fkey FOREIGN KEY (risposta_a_id) REFERENCES sala_messaggio(id) ON DELETE SET NULL;
alter table public.sala_votazione add constraint sala_votazione_creato_da_fkey FOREIGN KEY (creato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.sala_votazione add constraint sala_votazione_messaggio_id_fkey FOREIGN KEY (messaggio_id) REFERENCES sala_messaggio(id) ON DELETE SET NULL;
alter table public.sala_voto add constraint sala_voto_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.sala_voto add constraint sala_voto_votazione_id_fkey FOREIGN KEY (votazione_id) REFERENCES sala_votazione(id) ON DELETE CASCADE;
alter table public.servizio_battito add constraint servizio_battito_servizio_fkey FOREIGN KEY (servizio) REFERENCES servizio(nome) ON DELETE CASCADE;
alter table public.solleciti_integrazione add constraint solleciti_integrazione_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id);
alter table public.sollecito_quota add constraint sollecito_quota_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id) ON DELETE CASCADE;
alter table public.spunto_settimana add constraint spunto_settimana_creato_da_fkey FOREIGN KEY (creato_da) REFERENCES auth.users(id);
alter table public.storia add constraint storia_autore_id_fkey FOREIGN KEY (autore_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.telegram_link add constraint telegram_link_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.telegram_link_token add constraint telegram_link_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.tesseramento add constraint tesseramento_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.tesseramento_anno add constraint tesseramento_anno_domanda_id_fkey FOREIGN KEY (domanda_id) REFERENCES domande_tesseramento(id) ON DELETE CASCADE;
alter table public.toponimo_attestazione add constraint toponimo_attestazione_inserito_da_fkey FOREIGN KEY (inserito_da) REFERENCES utente(id);
alter table public.toponimo_attestazione add constraint toponimo_attestazione_luogo_id_fkey FOREIGN KEY (luogo_id) REFERENCES luoghi_interesse(id) ON DELETE CASCADE;
alter table public.utente add constraint utente_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.utente_distintivo add constraint utente_distintivo_distintivo_id_fkey FOREIGN KEY (distintivo_id) REFERENCES distintivo(id) ON DELETE CASCADE;
alter table public.utente_distintivo add constraint utente_distintivo_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.utente_ruolo add constraint utente_ruolo_assegnato_da_fkey FOREIGN KEY (assegnato_da) REFERENCES utente(id) ON DELETE SET NULL;
alter table public.utente_ruolo add constraint utente_ruolo_ruolo_id_fkey FOREIGN KEY (ruolo_id) REFERENCES ruolo(id) ON DELETE RESTRICT;
alter table public.utente_ruolo add constraint utente_ruolo_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES utente(id) ON DELETE CASCADE;
alter table public.ai_conversazione add constraint ai_conversazione_tipo_check CHECK ((tipo = ANY (ARRAY['generica'::text, 'storia'::text, 'lingua'::text, 'archivio'::text, 'biografie'::text, 'tirolo'::text, 'eventi'::text])));
alter table public.ai_messaggio add constraint ai_messaggio_ruolo_check CHECK ((ruolo = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])));
alter table public.ai_rate_limit add constraint ai_rate_limit_scope_check CHECK (((scope IS NULL) OR (scope = ANY (ARRAY['pubblico'::text, 'socio'::text, 'admin'::text]))));
alter table public.ai_sorgente_citata add constraint ai_sorgente_citata_tipo_sorgente_check CHECK ((tipo_sorgente = ANY (ARRAY['articolo'::text, 'lemma'::text, 'audio'::text, 'pubblicazione'::text, 'evento'::text, 'archivio'::text, 'kb'::text])));
alter table public.andreas_campagna add constraint andreas_campagna_cadenza_check CHECK ((cadenza = ANY (ARRAY['giornaliera'::text, 'tre_settimana'::text, 'settimanale'::text, 'quindicinale'::text, 'mensile'::text, 'irregolare'::text])));
alter table public.andreas_campagna add constraint andreas_campagna_stato_check CHECK ((stato = ANY (ARRAY['bozza'::text, 'attiva'::text, 'sospesa'::text, 'conclusa'::text])));
alter table public.andreas_canale add constraint andreas_canale_piattaforma_check CHECK ((piattaforma = ANY (ARRAY['forum_interno'::text, 'telegram'::text, 'facebook'::text, 'instagram'::text, 'newsletter'::text, 'email'::text])));
alter table public.andreas_kb_sorgente add constraint andreas_kb_sorgente_tipo_sorgente_check CHECK ((tipo_sorgente = ANY (ARRAY['libro'::text, 'articolo_rivista'::text, 'documento_archivio'::text, 'pdf_digitalizzato'::text, 'trascrizione'::text, 'nota_personale'::text, 'manuale_linguistico'::text, 'altro'::text, 'post_sito'::text, 'saggio_storico_sintesi'::text])));
alter table public.andreas_pubblicazione add constraint andreas_pubblicazione_stato_check CHECK ((stato = ANY (ARRAY['bozza'::text, 'in_revisione'::text, 'approvato'::text, 'programmato'::text, 'pubblicato'::text, 'annullato'::text, 'errore'::text])));
alter table public.archivio_audio add constraint archivio_audio_categoria_audio_check CHECK ((categoria_audio = ANY (ARRAY['parola'::text, 'toponimo'::text, 'proverbio'::text, 'racconto'::text, 'canto'::text, 'intervista'::text, 'cantilena'::text, 'preghiera'::text, 'altro'::text])));
alter table public.archivio_audio add constraint archivio_audio_parlata_check CHECK ((parlata = ANY (ARRAY['noneso'::text, 'solander'::text, 'rabies'::text, 'pegaes'::text, 'altra'::text])));
alter table public.archivio_audio add constraint archivio_audio_sesso_parlante_check CHECK ((sesso_parlante = ANY (ARRAY['m'::text, 'f'::text, 'altro'::text])));
alter table public.archivio_audio add constraint archivio_audio_stato_ammesso CHECK ((stato = ANY (ARRAY['in_attesa'::text, 'pubblicato'::text, 'rifiutato'::text])));
alter table public.articolo add constraint articolo_stato_check CHECK ((stato = ANY (ARRAY['bozza'::text, 'in_revisione'::text, 'in_approvazione'::text, 'pubblicato'::text, 'rifiutato'::text])));
alter table public.articolo add constraint articolo_tipo_contenuto_check CHECK ((tipo_contenuto = ANY (ARRAY['post'::text, 'pagina'::text])));
alter table public.assoc_delibera add constraint assoc_delibera_esito_check CHECK ((esito = ANY (ARRAY['approvata_unanimita'::text, 'approvata_maggioranza'::text, 'respinta'::text, 'rinviata'::text])));
alter table public.assoc_riunione add constraint assoc_riunione_convocazione_check CHECK ((convocazione = ANY (ARRAY['prima'::text, 'seconda'::text])));
alter table public.assoc_riunione add constraint assoc_riunione_organo_check CHECK ((organo = ANY (ARRAY['assemblea_ordinaria'::text, 'assemblea_straordinaria'::text, 'consiglio_direttivo'::text])));
alter table public.auth_otp add constraint auth_otp_scope_check CHECK ((scope = ANY (ARRAY['login'::text, 'signup'::text, 'recovery'::text, 'email_change'::text])));
alter table public.comunicazione_destinatario add constraint comunicazione_destinatario_esito_check CHECK ((esito = ANY (ARRAY['accodata'::text, 'inviata'::text, 'errore'::text])));
alter table public.comunicazione_istituzionale add constraint comunicazione_istituzionale_stato_check CHECK ((stato = ANY (ARRAY['bozza'::text, 'in_invio'::text, 'inviata'::text, 'inviata_con_errori'::text, 'annullata'::text])));
alter table public.comunicazione_istituzionale add constraint comunicazione_istituzionale_tipo_check CHECK ((tipo = ANY (ARRAY['convocazione_assemblea'::text, 'quota'::text, 'tessera'::text, 'rendiconto'::text, 'comunicazione'::text])));
alter table public.config_app add constraint config_app_categoria_check CHECK ((categoria = ANY (ARRAY['branding'::text, 'economia'::text, 'feature_flag'::text, 'integrazione'::text, 'editoriale'::text, 'sistema'::text])));
alter table public.consenso add constraint consenso_tipo_check CHECK ((tipo = ANY (ARRAY['termini'::text, 'privacy'::text, 'media'::text, 'donazione'::text, 'push'::text, 'telegram'::text])));
alter table public.convenzioni add constraint convenzioni_categoria_check CHECK ((categoria = ANY (ARRAY['rifugi'::text, 'locali'::text, 'servizi'::text, 'cultura'::text, 'benessere'::text, 'altro'::text])));
alter table public.convenzioni add constraint convenzioni_geo_stato_check CHECK ((geo_stato = ANY (ARRAY['auto'::text, 'manuale'::text, 'non_trovato'::text])));
alter table public.convenzioni add constraint convenzioni_stato_check CHECK ((stato = ANY (ARRAY['proposta'::text, 'attiva'::text, 'sospesa'::text, 'rifiutata'::text, 'cessata'::text])));
alter table public.convenzioni_punti add constraint convenzioni_punti_geo_stato_check CHECK ((geo_stato = ANY (ARRAY['auto'::text, 'manuale'::text, 'da_confermare'::text])));
alter table public.deroga_quota add constraint deroga_quota_motivo_non_vuoto CHECK ((btrim(motivo) <> ''::text));
alter table public.dizionario_lemma add constraint dizionario_lemma_parlata_check CHECK ((parlata = ANY (ARRAY['noneso'::text, 'solander'::text, 'rabies'::text, 'pegaes'::text, 'comune'::text, 'altra'::text])));
alter table public.dizionario_lemma add constraint dizionario_lemma_stato_check CHECK ((stato = ANY (ARRAY['proposto'::text, 'in_revisione'::text, 'validato'::text, 'pubblicato'::text, 'rifiutato'::text, 'ritirato'::text])));
alter table public.dizionario_lemma add constraint dizionario_lemma_tipo_check CHECK ((tipo = ANY (ARRAY['parola'::text, 'frase'::text, 'espressione'::text])));
alter table public.domande_tesseramento add constraint domande_categoria_socio_valida CHECK (((categoria_socio IS NULL) OR (categoria_socio = ANY (ARRAY['ordinario'::text, 'fondatore'::text, 'onorario'::text, 'sostenitore'::text]))));
alter table public.domande_tesseramento add constraint domande_cessazione_coerente CHECK (((stato_socio IS DISTINCT FROM 'cessato'::text) OR ((cessazione_data IS NOT NULL) AND (cessazione_motivo IS NOT NULL))));
alter table public.domande_tesseramento add constraint domande_cessazione_motivo_valido CHECK (((cessazione_motivo IS NULL) OR (cessazione_motivo = ANY (ARRAY['recesso'::text, 'decadenza_morosita'::text, 'esclusione'::text, 'decesso'::text]))));
alter table public.domande_tesseramento add constraint domande_codice_fiscale_plausibile CHECK (((codice_fiscale IS NULL) OR (codice_fiscale ~ '^[A-Za-z0-9]{11,16}$'::text)));
alter table public.domande_tesseramento add constraint domande_residenza_cap_valido CHECK (((residenza_cap IS NULL) OR (residenza_cap ~ '^[0-9]{5}$'::text)));
alter table public.domande_tesseramento add constraint domande_residenza_provincia_valida CHECK (((residenza_provincia IS NULL) OR (residenza_provincia ~ '^[A-Za-z]{2}$'::text)));
alter table public.domande_tesseramento add constraint domande_stato_socio_valido CHECK (((stato_socio IS NULL) OR (stato_socio = ANY (ARRAY['attivo'::text, 'cessato'::text]))));
alter table public.domande_tesseramento add constraint domande_tesseramento_consenso_modalita_check CHECK (((consenso_modalita IS NULL) OR (consenso_modalita = ANY (ARRAY['online'::text, 'cartaceo'::text, 'verbale'::text]))));
alter table public.domande_tesseramento add constraint domande_tesseramento_metodo_scelto_check CHECK (((metodo_scelto IS NULL) OR (metodo_scelto = ANY (ARRAY['paypal'::text, 'bonifico'::text, 'contanti'::text]))));
alter table public.domande_tesseramento add constraint domande_tesseramento_stato_check CHECK ((stato = ANY (ARRAY['in_attesa'::text, 'approvata'::text, 'respinta'::text, 'annullata'::text])));
alter table public.email_outbox add constraint email_outbox_origine_check CHECK ((origine = ANY (ARRAY['chat'::text, 'pannello'::text, 'sistema'::text, 'newsletter-conferma'::text, 'newsletter-prova'::text, 'newsletter-campagna'::text, 'newsletter-richiesta-consenso'::text])));
alter table public.email_outbox add constraint email_outbox_stato_check CHECK ((stato = ANY (ARRAY['bozza'::text, 'pronta'::text, 'in_invio'::text, 'inviata'::text, 'errore'::text, 'annullata'::text])));
alter table public.eventi_esterni add constraint eventi_esterni_fonte_check CHECK ((fonte = ANY (ARRAY['comunweb'::text, 'dati_trentino'::text, 'manuale'::text])));
alter table public.eventi_esterni add constraint eventi_esterni_pilastro_check CHECK (((pilastro IS NULL) OR ((pilastro >= 1) AND (pilastro <= 6))));
alter table public.eventi_esterni add constraint eventi_esterni_prezzo_check CHECK (((prezzo IS NULL) OR (prezzo = ANY (ARRAY['gratuito'::text, 'pagamento'::text, 'offerta'::text, 'nd'::text]))));
alter table public.eventi_esterni add constraint eventi_esterni_punteggio_check CHECK (((punteggio IS NULL) OR ((punteggio >= 0) AND (punteggio <= 100))));
alter table public.eventi_esterni add constraint eventi_esterni_stato_check CHECK ((stato = ANY (ARRAY['grezzo'::text, 'proposto'::text, 'approvato'::text, 'pubblicato'::text, 'scartato'::text, 'non_promuovibile'::text])));
alter table public.eventi_esterni add constraint eventi_esterni_valle_check CHECK (((valle IS NULL) OR (valle = ANY (ARRAY['non'::text, 'sole'::text, 'rabbi'::text, 'pejo'::text]))));
alter table public.forum_media add constraint forum_media_parent_ck CHECK (((thread_id IS NOT NULL) OR (post_id IS NOT NULL)));
alter table public.forum_reazione add constraint forum_reazione_check CHECK (((thread_id IS NULL) <> (post_id IS NULL)));
alter table public.forum_thread add constraint forum_thread_tipo_check CHECK ((tipo = ANY (ARRAY['bacheca'::text, 'discussione'::text])));
alter table public.geocodifica_coda add constraint geocodifica_coda_riga_unica CHECK (id);
alter table public.iscrizioni_gita add constraint iscrizioni_gita_metodo_check CHECK ((metodo = ANY (ARRAY['paypal'::text, 'carta'::text, 'bonifico'::text])));
alter table public.iscrizioni_gita add constraint iscrizioni_gita_posti_check CHECK (((posti >= 1) AND (posti <= 10)));
alter table public.iscrizioni_gita add constraint iscrizioni_gita_stato_check CHECK ((stato = ANY (ARRAY['in_attesa'::text, 'anticipo_pagato'::text, 'saldo_pagato'::text, 'annullato'::text])));
alter table public.lemma_commento add constraint lemma_commento_stato_check CHECK ((stato = ANY (ARRAY['in_attesa'::text, 'pubblicato'::text, 'respinto'::text])));
alter table public.lemma_commento add constraint lemma_commento_testo_check CHECK (((length(btrim(testo)) >= 2) AND (length(btrim(testo)) <= 1500)));
alter table public.lemma_correzione add constraint lemma_correzione_campo_check CHECK ((campo = ANY (ARRAY['definizione'::text, 'esempio'::text, 'grafia_accento'::text, 'comune'::text, 'parlata'::text, 'etimologia'::text, 'altro'::text])));
alter table public.lemma_correzione add constraint lemma_correzione_motivazione_check CHECK ((length(motivazione) <= 1200));
alter table public.lemma_correzione add constraint lemma_correzione_proposta_check CHECK (((length(btrim(proposta)) >= 2) AND (length(btrim(proposta)) <= 1200)));
alter table public.lemma_correzione add constraint lemma_correzione_stato_check CHECK ((stato = ANY (ARRAY['nuova'::text, 'accolta'::text, 'respinta'::text, 'archiviata'::text])));
alter table public.lemma_relazione add constraint lemma_relazione_canonica CHECK ((a_id < b_id));
alter table public.lemma_relazione add constraint lemma_relazione_non_riflessiva CHECK ((a_id <> b_id));
alter table public.lemma_relazione add constraint lemma_relazione_tipo_ammesso CHECK ((tipo = ANY (ARRAY['variante'::text, 'vedi_anche'::text])));
alter table public.luoghi_interesse add constraint luoghi_etim_certezza_check CHECK (((etimologia_certezza IS NULL) OR (etimologia_certezza = ANY (ARRAY['documentata'::text, 'probabile'::text, 'ipotesi'::text, 'incerta'::text]))));
alter table public.luoghi_interesse add constraint luoghi_etim_strato_check CHECK (((etimologia_strato IS NULL) OR (etimologia_strato = ANY (ARRAY['prelatino_retico'::text, 'latino'::text, 'germanico'::text, 'romanzo_alpino'::text, 'incerto'::text]))));
alter table public.luoghi_interesse add constraint luoghi_interesse_geo_stato_check CHECK (((geo_stato IS NULL) OR (geo_stato = ANY (ARRAY['auto'::text, 'manuale'::text, 'non_trovato'::text]))));
alter table public.luoghi_interesse add constraint luoghi_interesse_stato_check CHECK ((stato = ANY (ARRAY['bozza'::text, 'pubblicato'::text])));
alter table public.luoghi_interesse add constraint luoghi_interesse_valle_check CHECK ((valle = ANY (ARRAY['val_di_non'::text, 'val_di_sole'::text, 'val_di_rabbi'::text, 'val_di_pejo'::text, 'fuori_valle'::text])));
alter table public.luoghi_interesse add constraint luoghi_parlata_check CHECK (((parlata IS NULL) OR (parlata = ANY (ARRAY['noneso'::text, 'solander'::text, 'rabies'::text, 'pegaes'::text]))));
alter table public.memoria_evento_reparto add constraint memoria_evento_reparto_confidenza_check CHECK ((confidenza = ANY (ARRAY['certa'::text, 'alta'::text, 'media'::text, 'da_verificare'::text])));
alter table public.memoria_fondo add constraint memoria_fondo_stato_check CHECK ((stato = ANY (ARRAY['bozza'::text, 'pubblicato'::text])));
alter table public.memoria_fondo add constraint memoria_fondo_tipo_check CHECK ((tipo = ANY (ARRAY['cimitero_militare'::text, 'cimitero_civile'::text, 'ospedale'::text, 'elenco_nominativo'::text, 'altro'::text])));
alter table public.memoria_fondo add constraint memoria_fondo_valle_check CHECK ((valle = ANY (ARRAY['val_di_non'::text, 'val_di_sole'::text, 'val_di_rabbi'::text, 'val_di_pejo'::text, 'fuori_valle'::text])));
alter table public.memoria_persona add constraint memoria_persona_evento_certezza_check CHECK (((evento_certezza IS NULL) OR (evento_certezza = ANY (ARRAY['attestato'::text, 'sostenuto'::text, 'probabile'::text, 'non_sostenuto'::text]))));
alter table public.memoria_persona add constraint memoria_persona_relazione_reg_chk CHECK (((relazione_registrazione IS NULL) OR (relazione_registrazione = ANY (ARRAY['doppia_registrazione'::text, 'doppia_sepoltura'::text, 'da_verificare'::text]))));
alter table public.memoria_reparto add constraint memoria_reparto_certezza_check CHECK ((certezza = ANY (ARRAY['certa'::text, 'alta'::text, 'da_verificare'::text])));
alter table public.newsletter add constraint newsletter_gruppo_valido CHECK (((gruppo IS NULL) OR (gruppo = ANY (ARRAY['tutti'::text, 'soci_tutti'::text, 'soci_in_regola'::text, 'non_soci'::text]))));
alter table public.newsletter add constraint newsletter_stato_valido CHECK ((stato = ANY (ARRAY['bozza'::text, 'in_invio'::text, 'inviata'::text, 'annullata'::text])));
alter table public.newsletter_iscritto add constraint newsletter_iscritto_date_coerenti CHECK ((((stato <> 'confermato'::text) OR (confermato_il IS NOT NULL)) AND ((stato <> 'disiscritto'::text) OR (disiscritto_il IS NOT NULL)) AND ((stato <> 'rimbalzato'::text) OR (rimbalzato_il IS NOT NULL))));
alter table public.newsletter_iscritto add constraint newsletter_iscritto_stato_check CHECK ((stato = ANY (ARRAY['in_attesa'::text, 'confermato'::text, 'disiscritto'::text, 'rimbalzato'::text])));
alter table public.ocr_trascrizione add constraint ocr_trascrizione_oggetto_tipo_check CHECK ((oggetto_tipo = ANY (ARRAY['storia'::text, 'museo_pezzo'::text, 'archivio'::text])));
alter table public.ocr_trascrizione add constraint ocr_trascrizione_stato_check CHECK ((stato = ANY (ARRAY['da_rivedere'::text, 'confermata'::text, 'scartata'::text, 'fallita'::text])));
alter table public.pagamenti_tesseramento add constraint pagamenti_contanti_coerenza CHECK (((metodo <> 'contanti'::text) OR ((incassato_da IS NOT NULL) AND (incassato_il IS NOT NULL) AND (importo IS NOT NULL))));
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_metodo_check CHECK ((metodo = ANY (ARRAY['paypal'::text, 'bonifico'::text, 'contanti'::text])));
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_stato_check CHECK ((stato = ANY (ARRAY['creato'::text, 'completato'::text, 'rimborsato'::text, 'negato'::text, 'in_verifica'::text, 'scaduto'::text])));
alter table public.pagamenti_tesseramento add constraint pagamenti_tesseramento_tipo_check CHECK ((tipo = ANY (ARRAY['quota'::text, 'donazione'::text, 'integrazione'::text, 'anticipo_gita'::text])));
alter table public.prima_nota add constraint prima_nota_categoria_non_riservata CHECK ((categoria <> ALL (ARRAY['quote_associative'::text, 'integrazioni'::text, 'anticipi_gita'::text])));
alter table public.prima_nota add constraint prima_nota_importo_check CHECK ((importo > (0)::numeric));
alter table public.prima_nota add constraint prima_nota_metodo_check CHECK ((metodo = ANY (ARRAY['contanti'::text, 'banca'::text, 'paypal'::text, 'altro'::text])));
alter table public.prima_nota add constraint prima_nota_sezione_check CHECK ((sezione = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text])));
alter table public.prima_nota add constraint prima_nota_verso_check CHECK ((verso = ANY (ARRAY['entrata'::text, 'uscita'::text])));
alter table public.reazione add constraint reazione_ha_un_autore CHECK (((utente_id IS NOT NULL) OR (gettone IS NOT NULL)));
alter table public.reazione add constraint reazione_oggetto_tipo_check CHECK ((oggetto_tipo = ANY (ARRAY['lemma'::text, 'storia'::text, 'museo_pezzo'::text, 'post'::text, 'articolo'::text])));
alter table public.reazione add constraint reazione_tipo_check CHECK ((tipo = ANY (ARRAY['conosco'::text, 'mi_piace'::text, 'ricordo'::text])));
alter table public.registro_curatela add constraint registro_curatela_azione_check CHECK ((azione = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])));
alter table public.reminder_super_admin add constraint reminder_super_admin_categoria_check CHECK ((categoria = ANY (ARRAY['fiscale'::text, 'tecnico'::text, 'editoriale'::text, 'istituzionale'::text, 'sviluppo'::text, 'configurazione'::text, 'contatto_esterno'::text])));
alter table public.reminder_super_admin add constraint reminder_super_admin_priorita_check CHECK (((priorita >= 1) AND (priorita <= 5)));
alter table public.reminder_super_admin add constraint reminder_super_admin_stato_check CHECK ((stato = ANY (ARRAY['da_fare'::text, 'in_corso'::text, 'fatto'::text, 'bloccato'::text, 'archiviato'::text])));
alter table public.rendiconto add constraint rendiconto_stato_check CHECK ((stato = ANY (ARRAY['redatto'::text, 'approvato_consiglio'::text, 'approvato_assemblea'::text])));
alter table public.richieste_contatto add constraint richieste_contatto_stato_check CHECK ((stato = ANY (ARRAY['nuova'::text, 'in_lavorazione'::text, 'chiusa'::text])));
alter table public.richieste_contatto add constraint richieste_contatto_tipo_check CHECK ((tipo = ANY (ARRAY['richiesta'::text, 'offerta'::text])));
alter table public.sala_votazione add constraint sala_votazione_stato_check CHECK ((stato = ANY (ARRAY['aperta'::text, 'chiusa'::text, 'annullata'::text])));
alter table public.sala_votazione add constraint sala_votazione_tipo_check CHECK ((tipo = ANY (ARRAY['semplice'::text, 'scelta_multipla'::text, 'secca_si_no'::text])));
alter table public.sentinella_pagina add constraint sentinella_esito_ammesso CHECK ((esito = ANY (ARRAY['in_volo'::text, 'ok'::text, 'rotta'::text, 'senza_risposta'::text])));
alter table public.servizio_battito add constraint servizio_battito_esito_check CHECK ((esito = ANY (ARRAY['ok'::text, 'errore'::text, 'niente_da_fare'::text])));
alter table public.solleciti_integrazione add constraint solleciti_integrazione_tipo_sollecito_check CHECK ((tipo_sollecito = ANY (ARRAY[1, 2])));
alter table public.sollecito_quota add constraint sollecito_quota_esito_check CHECK ((esito = ANY (ARRAY['in_corso'::text, 'inviato'::text, 'fallito'::text])));
alter table public.sollecito_quota add constraint sollecito_quota_numero_check CHECK ((numero = ANY (ARRAY[1, 2])));
alter table public.spunto_settimana add constraint spunto_settimana_testo_check CHECK (((length(btrim(testo)) >= 5) AND (length(btrim(testo)) <= 300)));
alter table public.tesseramento_anno add constraint tesseramento_anno_plausibile CHECK (((anno >= 2009) AND (anno <= 2100)));
alter table public.vocabolario_voce add constraint vocabolario_dominio_ammesso CHECK ((dominio = ANY (ARRAY['parlata'::text, 'comune'::text, 'categoria_gramm'::text])));
alter table public.vocabolario_voce add constraint vocabolario_stato_ammesso CHECK ((stato = ANY (ARRAY['attivo'::text, 'proposto'::text, 'unito'::text, 'ritirato'::text])));

-- ---- 5. INDICI AUTONOMI (esclusi quelli impliciti di PK/UNIQUE, gia'
-- creati dai vincoli sopra: 126 + 44 + questi 220 fanno i 390 verificati) --
CREATE INDEX idx_ai_conv_attivita ON public.ai_conversazione USING btree (utente_id, ultima_attivita_at DESC) WHERE (archiviata = false);
CREATE INDEX idx_ai_conv_utente ON public.ai_conversazione USING btree (utente_id);
CREATE INDEX idx_ai_msg_conv ON public.ai_messaggio USING btree (conversazione_id, created_at);
CREATE INDEX idx_ai_rate_giorno ON public.ai_rate_limit USING btree (giorno);
CREATE INDEX idx_ai_rate_limit_ip_giorno ON public.ai_rate_limit USING btree (ip_hash, giorno) WHERE (ip_hash IS NOT NULL);
CREATE INDEX idx_ai_rate_limit_pubblico_giorno ON public.ai_rate_limit_pubblico USING btree (giorno);
CREATE INDEX idx_ai_sorg_msg ON public.ai_sorgente_citata USING btree (messaggio_id);
CREATE INDEX idx_anagrafica_modifica_domanda ON public.anagrafica_modifica USING btree (domanda_id, modificato_il DESC);
CREATE INDEX idx_andreas_campagna_created_da ON public.andreas_campagna USING btree (created_da);
CREATE INDEX idx_kb_embedding ON public.andreas_kb USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX idx_kb_fulltext ON public.andreas_kb USING gin (to_tsvector('italian'::regconfig, ((COALESCE(titolo_sezione, ''::text) || ' '::text) || COALESCE(contenuto, ''::text))));
CREATE INDEX idx_kb_sorgente ON public.andreas_kb USING btree (sorgente_id, chunk_index);
CREATE INDEX idx_andreas_kb_sorgente_ingestato_da ON public.andreas_kb_sorgente USING btree (ingestato_da);
CREATE INDEX idx_kb_sorg_pilastro ON public.andreas_kb_sorgente USING btree (pilastro);
CREATE INDEX idx_kb_sorg_tipo ON public.andreas_kb_sorgente USING btree (tipo_sorgente);
CREATE INDEX idx_andreas_pub_data ON public.andreas_pubblicazione USING btree (data_prevista) WHERE (stato = ANY (ARRAY['programmato'::text, 'approvato'::text]));
CREATE INDEX idx_andreas_pub_stato ON public.andreas_pubblicazione USING btree (stato);
CREATE INDEX idx_andreas_pubblicazione_approvato_da ON public.andreas_pubblicazione USING btree (approvato_da);
CREATE INDEX idx_andreas_pubblicazione_campagna_id ON public.andreas_pubblicazione USING btree (campagna_id);
CREATE INDEX idx_andreas_pubblicazione_canale_id ON public.andreas_pubblicazione USING btree (canale_id);
CREATE INDEX idx_archivio_audio_lemma_id ON public.archivio_audio USING btree (lemma_id);
CREATE INDEX idx_archivio_audio_registrato_da ON public.archivio_audio USING btree (registrato_da);
CREATE INDEX idx_audio_categoria ON public.archivio_audio USING btree (categoria_audio);
CREATE INDEX idx_audio_parlata ON public.archivio_audio USING btree (parlata);
CREATE INDEX idx_audio_termine ON public.archivio_audio USING btree (termine_ladino);
CREATE INDEX idx_audio_visibile ON public.archivio_audio USING btree (visibile_ospiti) WHERE (visibile_ospiti = true);
CREATE INDEX idx_archivio_categoria_parent_id ON public.archivio_categoria USING btree (parent_id);
CREATE INDEX idx_archivio_anno ON public.archivio_documento USING btree (anno) WHERE (anno IS NOT NULL);
CREATE INDEX idx_archivio_documento_caricato_da ON public.archivio_documento USING btree (caricato_da);
CREATE INDEX idx_archivio_documento_categoria_id ON public.archivio_documento USING btree (categoria_id);
CREATE INDEX idx_archivio_fts ON public.archivio_documento USING gin (to_tsvector('italian'::regconfig, ((((titolo || ' '::text) || COALESCE(descrizione, ''::text)) || ' '::text) || COALESCE(trascrizione, ''::text))));
CREATE INDEX idx_archivio_tipo ON public.archivio_documento USING btree (tipo);
CREATE INDEX articolo_search_idx ON public.articolo USING gin (search_vector);
CREATE INDEX idx_articolo_autore_id ON public.articolo USING btree (autore_id);
CREATE INDEX idx_articolo_fts ON public.articolo USING gin (to_tsvector('italian'::regconfig, ((((titolo || ' '::text) || COALESCE(estratto, ''::text)) || ' '::text) || COALESCE(sottotitolo, ''::text))));
CREATE INDEX idx_articolo_pubblicato ON public.articolo USING btree (pubblicato_at DESC) WHERE (pubblicato = true);
CREATE INDEX idx_articolo_slug ON public.articolo USING btree (slug);
CREATE INDEX idx_articolo_tipo_pubbl ON public.articolo USING btree (tipo_contenuto, pubblicato) WHERE (pubblicato = true);
CREATE UNIQUE INDEX uniq_articolo_wp_legacy ON public.articolo USING btree (wp_legacy_id) WHERE (wp_legacy_id IS NOT NULL);
CREATE INDEX assoc_delega_delegato ON public.assoc_delega USING btree (riunione_id, delegato_domanda_id);
CREATE INDEX assoc_delega_riunione ON public.assoc_delega USING btree (riunione_id);
CREATE INDEX idx_assoc_delega_delegante_domanda_id ON public.assoc_delega USING btree (delegante_domanda_id);
CREATE INDEX idx_assoc_delega_delegato_domanda_id ON public.assoc_delega USING btree (delegato_domanda_id);
CREATE INDEX idx_assoc_delega_registrata_da ON public.assoc_delega USING btree (registrata_da);
CREATE INDEX assoc_delibera_ricerca ON public.assoc_delibera USING gin (to_tsvector('italian'::regconfig, ((COALESCE(oggetto, ''::text) || ' '::text) || COALESCE(testo, ''::text))));
CREATE INDEX assoc_delibera_socio_idx ON public.assoc_delibera USING btree (socio_id);
CREATE INDEX assoc_delibera_tag ON public.assoc_delibera USING gin (tag);
CREATE INDEX assoc_documento_anno ON public.assoc_documento USING btree (anno DESC, organo);
CREATE INDEX idx_assoc_documento_caricato_da ON public.assoc_documento USING btree (caricato_da);
CREATE INDEX idx_assoc_presenza_domanda_id ON public.assoc_presenza USING btree (domanda_id);
CREATE INDEX idx_assoc_presenza_registrata_da ON public.assoc_presenza USING btree (registrata_da);
CREATE UNIQUE INDEX assoc_riunione_numero_unico ON public.assoc_riunione USING btree (organo, anno, numero);
CREATE INDEX auth_otp_email_idx ON public.auth_otp USING btree (email, created_at DESC);
CREATE INDEX auth_otp_scade_at_idx ON public.auth_otp USING btree (scade_at) WHERE (NOT usato);
CREATE INDEX idx_auth_otp_cleanup ON public.auth_otp USING btree (created_at) WHERE (usato = false);
CREATE INDEX idx_auth_otp_email_attivi ON public.auth_otp USING btree (email, scade_at) WHERE (usato = false);
CREATE INDEX comunicazione_destinatario_outbox_idx ON public.comunicazione_destinatario USING btree (outbox_id);
CREATE INDEX idx_com_dest_comunicazione ON public.comunicazione_destinatario USING btree (comunicazione_id);
CREATE INDEX idx_com_dest_domanda ON public.comunicazione_destinatario USING btree (domanda_id);
CREATE INDEX idx_comunicazione_istituzionale_riunione_id ON public.comunicazione_istituzionale USING btree (riunione_id);
CREATE INDEX idx_config_app_aggiornato_da ON public.config_app USING btree (aggiornato_da);
CREATE INDEX consenso_utente_tipo_idx ON public.consenso USING btree (utente_id, tipo, accettato_at DESC);
CREATE INDEX convenzioni_categoria_idx ON public.convenzioni USING btree (categoria);
CREATE INDEX convenzioni_email_idx ON public.convenzioni USING btree (lower(referente_email));
CREATE INDEX convenzioni_stato_idx ON public.convenzioni USING btree (stato);
CREATE INDEX convenzioni_punti_convenzione_idx ON public.convenzioni_punti USING btree (convenzione_id);
CREATE INDEX idx_corso_autore_id ON public.corso USING btree (autore_id);
CREATE INDEX idx_corso_slug ON public.corso USING btree (slug);
CREATE INDEX idx_custodi_memoria_categoria ON public.custodi_memoria USING btree (categoria_slug);
CREATE INDEX dizionario_lemma_search_idx ON public.dizionario_lemma USING gin (search_vector);
CREATE UNIQUE INDEX dizionario_lemma_slug_key ON public.dizionario_lemma USING btree (slug);
CREATE INDEX idx_dizio_fulltext ON public.dizionario_lemma USING gin (to_tsvector('italian'::regconfig, ((((COALESCE(lemma, ''::text) || ' '::text) || COALESCE(definizione, ''::text)) || ' '::text) || COALESCE(etimologia, ''::text))));
CREATE INDEX idx_dizio_lemma ON public.dizionario_lemma USING btree (lemma);
CREATE INDEX idx_dizio_parlata ON public.dizionario_lemma USING btree (parlata);
CREATE INDEX idx_dizionario_lemma_audio ON public.dizionario_lemma USING btree (audio_id);
CREATE INDEX idx_dizionario_lemma_contributore ON public.dizionario_lemma USING btree (contributore_id);
CREATE INDEX idx_dizionario_lemma_creato_da ON public.dizionario_lemma USING btree (creato_da);
CREATE INDEX idx_doc_pub_categoria ON public.documento_pubblico USING btree (categoria, ordine);
CREATE INDEX idx_documento_pubblico_caricato_da ON public.documento_pubblico USING btree (caricato_da);
CREATE UNIQUE INDEX domande_account_unico ON public.domande_tesseramento USING btree (account_id) WHERE (account_id IS NOT NULL);
CREATE INDEX domande_tesseramento_email_idx ON public.domande_tesseramento USING btree (lower(email));
CREATE INDEX domande_tesseramento_stato_idx ON public.domande_tesseramento USING btree (stato);
CREATE UNIQUE INDEX uq_domande_numero_socio ON public.domande_tesseramento USING btree (numero_socio) WHERE (numero_socio IS NOT NULL);
CREATE INDEX idx_donazione_materiale_donatore ON public.donazione_materiale USING btree (donatore_id);
CREATE INDEX download_lead_newsletter_idx ON public.download_lead USING btree (consenso_newsletter) WHERE (consenso_newsletter = true);
CREATE INDEX download_lead_risorsa_idx ON public.download_lead USING btree (risorsa, created_at DESC);
CREATE INDEX idx_email_outbox_da_processare ON public.email_outbox USING btree (stato, created_at) WHERE (stato = ANY (ARRAY['pronta'::text, 'in_invio'::text]));
CREATE INDEX eventi_esterni_curato_da_idx ON public.eventi_esterni USING btree (curato_da);
CREATE INDEX eventi_esterni_data_idx ON public.eventi_esterni USING btree (data_inizio);
CREATE INDEX eventi_esterni_search_idx ON public.eventi_esterni USING gin (search_vector);
CREATE UNIQUE INDEX eventi_esterni_slug_key ON public.eventi_esterni USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX eventi_esterni_stato_punteggio_idx ON public.eventi_esterni USING btree (stato, punteggio DESC NULLS LAST);
CREATE INDEX eventi_esterni_valle_idx ON public.eventi_esterni USING btree (valle);
CREATE INDEX eventi_esterni_date_evento_idx ON public.eventi_esterni_date USING btree (evento_id);
CREATE INDEX idx_evento_creato_da ON public.evento USING btree (creato_da);
CREATE INDEX idx_evento_inizio ON public.evento USING btree (inizio) WHERE (pubblicato = true);
CREATE INDEX idx_evento_iscrizione_utente_id ON public.evento_iscrizione USING btree (utente_id);
CREATE INDEX forum_media_post_idx ON public.forum_media USING btree (post_id);
CREATE INDEX forum_media_thread_idx ON public.forum_media USING btree (thread_id);
CREATE INDEX idx_forum_post_autore_id ON public.forum_post USING btree (autore_id);
CREATE INDEX idx_forum_post_thread ON public.forum_post USING btree (thread_id, created_at);
CREATE INDEX idx_forum_reazione_post ON public.forum_reazione USING btree (post_id);
CREATE INDEX idx_forum_reazione_thread ON public.forum_reazione USING btree (thread_id);
CREATE INDEX idx_forum_reazione_utente_id ON public.forum_reazione USING btree (utente_id);
CREATE INDEX idx_forum_thread_autore_id ON public.forum_thread USING btree (autore_id);
CREATE INDEX idx_forum_thread_topic_attivita ON public.forum_thread USING btree (topic_id, ultimo_messaggio_at DESC);
CREATE INDEX glossario_operazione_quando_idx ON public.glossario_operazione USING btree (quando DESC);
CREATE INDEX idx_import_log_eseguito_da ON public.import_log USING btree (eseguito_da);
CREATE INDEX idx_iscrizione_corso_corso_id ON public.iscrizione_corso USING btree (corso_id);
CREATE INDEX idx_iscrizione_corso_utente ON public.iscrizione_corso USING btree (utente_id);
CREATE INDEX iscrizioni_gita_evento_stato_idx ON public.iscrizioni_gita USING btree (evento_slug, stato);
CREATE INDEX iscrizioni_gita_order_idx ON public.iscrizioni_gita USING btree (paypal_order_id);
CREATE INDEX lemma_commento_da_moderare ON public.lemma_commento USING btree (created_at DESC) WHERE (stato = 'in_attesa'::text);
CREATE INDEX lemma_commento_moderato_da_idx ON public.lemma_commento USING btree (moderato_da);
CREATE INDEX lemma_commento_pubblici ON public.lemma_commento USING btree (lemma_id, created_at) WHERE (stato = 'pubblicato'::text);
CREATE INDEX lemma_commento_utente_idx ON public.lemma_commento USING btree (utente_id);
CREATE INDEX lemma_correzione_da_esaminare ON public.lemma_correzione USING btree (stato, created_at DESC) WHERE (stato = 'nuova'::text);
CREATE INDEX lemma_correzione_esaminata_da_idx ON public.lemma_correzione USING btree (esaminata_da);
CREATE INDEX lemma_correzione_per_lemma ON public.lemma_correzione USING btree (lemma_id);
CREATE INDEX lemma_relazione_a_idx ON public.lemma_relazione USING btree (a_id);
CREATE INDEX lemma_relazione_b_idx ON public.lemma_relazione USING btree (b_id);
CREATE INDEX idx_lezione_corso ON public.lezione USING btree (corso_id, ordine);
CREATE INDEX idx_lezione_fts ON public.lezione USING gin (to_tsvector('italian'::regconfig, ((((titolo || ' '::text) || COALESCE(descrizione, ''::text)) || ' '::text) || COALESCE(trascrizione, ''::text))));
CREATE INDEX idx_lezione_modulo_id ON public.lezione USING btree (modulo_id);
CREATE INDEX idx_luoghi_interesse_audio_id ON public.luoghi_interesse USING btree (audio_id);
CREATE INDEX idx_luoghi_interesse_creato_da ON public.luoghi_interesse USING btree (creato_da);
CREATE INDEX idx_luoghi_interesse_pubblicato_da ON public.luoghi_interesse USING btree (pubblicato_da);
CREATE INDEX idx_luoghi_interesse_toponimo_validato_da ON public.luoghi_interesse USING btree (toponimo_validato_da);
CREATE UNIQUE INDEX idx_luoghi_slug ON public.luoghi_interesse USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX luoghi_interesse_search_idx ON public.luoghi_interesse USING gin (search_vector);
CREATE INDEX idx_memoria_fondo_valle ON public.memoria_fondo USING btree (valle);
CREATE INDEX idx_memoria_persona_cognome ON public.memoria_persona USING btree (lower(COALESCE(cognome, nome_completo)));
CREATE INDEX idx_memoria_persona_evento ON public.memoria_persona USING btree (evento_id);
CREATE INDEX idx_memoria_persona_fondo ON public.memoria_persona USING btree (fondo_id);
CREATE INDEX idx_memoria_persona_regione ON public.memoria_persona USING btree (regione_nascita);
CREATE UNIQUE INDEX idx_memoria_persona_slug ON public.memoria_persona USING btree (fondo_id, slug) WHERE (slug IS NOT NULL);
CREATE INDEX idx_messaggio_conversazione ON public.messaggio USING btree (conversazione_id, created_at);
CREATE INDEX idx_messaggio_destinatario_non_letto ON public.messaggio USING btree (destinatario_id) WHERE (letto = false);
CREATE INDEX idx_messaggio_mittente_id ON public.messaggio USING btree (mittente_id);
CREATE INDEX modifica_contenuto_chi_idx ON public.modifica_contenuto USING btree (chi);
CREATE INDEX modifica_contenuto_per_riga ON public.modifica_contenuto USING btree (tabella, riga_id, quando DESC);
CREATE INDEX modifica_contenuto_recenti ON public.modifica_contenuto USING btree (quando DESC);
CREATE INDEX idx_modulo_corso_ordine ON public.modulo_corso USING btree (corso_id, ordine);
CREATE INDEX museo_gg_pezzo_search_idx ON public.museo_gg_pezzo USING gin (search_vector);
CREATE UNIQUE INDEX museo_gg_pezzo_slug_key ON public.museo_gg_pezzo USING btree (slug);
CREATE INDEX museo_gg_raccolta_pezzo_ord ON public.museo_gg_raccolta_pezzo USING btree (raccolta_id, ordine);
CREATE INDEX museo_gg_raccolta_pezzo_pezzo_idx ON public.museo_gg_raccolta_pezzo USING btree (pezzo_id);
CREATE INDEX idx_newsletter_inviata_da ON public.newsletter USING btree (inviata_da);
CREATE UNIQUE INDEX idx_newsletter_invio_unico ON public.newsletter_invio USING btree (campagna_id, lower(email));
CREATE INDEX newsletter_invio_iscritto_idx ON public.newsletter_invio USING btree (iscritto_id);
CREATE INDEX newsletter_invio_outbox_idx ON public.newsletter_invio USING btree (outbox_id);
CREATE UNIQUE INDEX idx_newsletter_iscritto_email ON public.newsletter_iscritto USING btree (lower(email));
CREATE INDEX idx_newsletter_iscritto_stato ON public.newsletter_iscritto USING btree (stato);
CREATE INDEX newsletter_iscritto_domanda_idx ON public.newsletter_iscritto USING btree (domanda_id);
CREATE INDEX newsletter_iscritto_utente_idx ON public.newsletter_iscritto USING btree (utente_id);
CREATE INDEX idx_notifica_utente_non_letta ON public.notifica USING btree (utente_id, created_at DESC) WHERE (letta = false);
CREATE INDEX notifica_consegna_quando ON public.notifica_consegna USING btree (quando DESC);
CREATE INDEX notifica_consegna_tipo ON public.notifica_consegna USING btree (tipo, quando DESC);
CREATE INDEX ocr_da_rivedere ON public.ocr_trascrizione USING btree (created_at DESC) WHERE (stato = 'da_rivedere'::text);
CREATE INDEX ocr_trascrizione_chi_idx ON public.ocr_trascrizione USING btree (chi);
CREATE INDEX ocr_trascrizione_confermata_da_idx ON public.ocr_trascrizione USING btree (confermata_da);
CREATE INDEX ocr_trascrizione_search_idx ON public.ocr_trascrizione USING gin (search_vector);
CREATE INDEX idx_pagamenti_domanda ON public.pagamenti_tesseramento USING btree (domanda_id);
CREATE INDEX idx_pagamenti_incassato_da ON public.pagamenti_tesseramento USING btree (incassato_da);
CREATE INDEX idx_pagamenti_registrato_da ON public.pagamenti_tesseramento USING btree (registrato_da);
CREATE UNIQUE INDEX pagamenti_contanti_non_ripetibile ON public.pagamenti_tesseramento USING btree (COALESCE((domanda_id)::text, lower(email)), tipo, importo, incassato_il, metodo) WHERE ((metodo = 'contanti'::text) AND (stato = 'completato'::text) AND (annullato_il IS NULL));
CREATE INDEX pagamenti_tesseramento_created_idx ON public.pagamenti_tesseramento USING btree (created_at DESC);
CREATE INDEX pagamenti_tesseramento_stato_idx ON public.pagamenti_tesseramento USING btree (stato);
CREATE INDEX idx_prima_nota_annullato_da ON public.prima_nota USING btree (annullato_da);
CREATE INDEX idx_prima_nota_registrato_da ON public.prima_nota USING btree (registrato_da);
CREATE INDEX prima_nota_anno_verso ON public.prima_nota USING btree (((EXTRACT(year FROM data))::integer), verso);
CREATE INDEX prima_nota_data ON public.prima_nota USING btree (data DESC);
CREATE INDEX prima_nota_raccolta ON public.prima_nota USING btree (raccolta_fondi_id);
CREATE INDEX idx_progresso_lezione_lezione_id ON public.progresso_lezione USING btree (lezione_id);
CREATE INDEX idx_progresso_utente ON public.progresso_lezione USING btree (utente_id);
CREATE INDEX idx_pubblicazione_anno ON public.pubblicazione USING btree (anno_pubblicazione DESC);
CREATE INDEX idx_pubblicazione_fts ON public.pubblicazione USING gin (to_tsvector('italian'::regconfig, ((titolo || ' '::text) || COALESCE(abstract, ''::text))));
CREATE INDEX idx_punti_evento_giorno ON public.punti_evento USING btree (utente_id, created_at);
CREATE INDEX idx_punti_evento_utente ON public.punti_evento USING btree (utente_id);
CREATE INDEX idx_push_token_utente ON public.push_token USING btree (utente_id) WHERE (attivo = true);
CREATE INDEX idx_raccolta_fondi_creata_da ON public.raccolta_fondi USING btree (creata_da);
CREATE INDEX raccolta_fondi_anno ON public.raccolta_fondi USING btree (anno DESC);
CREATE INDEX reazione_per_oggetto ON public.reazione USING btree (oggetto_tipo, oggetto_id);
CREATE UNIQUE INDEX reazione_unica_gettone ON public.reazione USING btree (oggetto_tipo, oggetto_id, gettone) WHERE (gettone IS NOT NULL);
CREATE UNIQUE INDEX reazione_unica_utente ON public.reazione USING btree (oggetto_tipo, oggetto_id, utente_id) WHERE (utente_id IS NOT NULL);
CREATE INDEX reazione_utente_idx ON public.reazione USING btree (utente_id);
CREATE INDEX registro_curatela_tabella_idx ON public.registro_curatela USING btree (tabella, created_at DESC);
CREATE INDEX registro_curatela_utente_idx ON public.registro_curatela USING btree (utente_id, created_at DESC);
CREATE INDEX reminder_super_admin_categoria ON public.reminder_super_admin USING btree (categoria);
CREATE INDEX reminder_super_admin_stato_priorita ON public.reminder_super_admin USING btree (stato, priorita DESC, scadenza);
CREATE INDEX idx_rendiconto_approvato_assemblea_da ON public.rendiconto USING btree (approvato_assemblea_da);
CREATE INDEX idx_rendiconto_approvato_consiglio_da ON public.rendiconto USING btree (approvato_consiglio_da);
CREATE INDEX idx_rendiconto_delibera_assemblea_id ON public.rendiconto USING btree (delibera_assemblea_id);
CREATE INDEX idx_rendiconto_delibera_consiglio_id ON public.rendiconto USING btree (delibera_consiglio_id);
CREATE INDEX idx_rendiconto_redatto_da ON public.rendiconto USING btree (redatto_da);
CREATE INDEX idx_sala_messaggio_risposta_a_id ON public.sala_messaggio USING btree (risposta_a_id);
CREATE INDEX idx_sala_msg_autore ON public.sala_messaggio USING btree (autore_id);
CREATE INDEX idx_sala_msg_canale ON public.sala_messaggio USING btree (canale_id, created_at DESC);
CREATE INDEX idx_sala_votazione_creato_da ON public.sala_votazione USING btree (creato_da);
CREATE INDEX idx_sala_votazione_messaggio_id ON public.sala_votazione USING btree (messaggio_id);
CREATE INDEX idx_sala_voto_stato ON public.sala_votazione USING btree (stato);
CREATE INDEX idx_sala_voto_utente_id ON public.sala_voto USING btree (utente_id);
CREATE INDEX sentinella_pagina_quando_idx ON public.sentinella_pagina USING btree (cosa, controllato_il DESC);
CREATE INDEX idx_battito_servizio_tempo ON public.servizio_battito USING btree (servizio, creato_il DESC);
CREATE INDEX sollecito_quota_domanda_idx ON public.sollecito_quota USING btree (domanda_id);
CREATE INDEX spunto_settimana_attivo_dal_idx ON public.spunto_settimana USING btree (attivo_dal DESC);
CREATE INDEX spunto_settimana_creato_da_idx ON public.spunto_settimana USING btree (creato_da);
CREATE INDEX idx_storia_autore ON public.storia USING btree (autore_id);
CREATE INDEX storia_search_idx ON public.storia USING gin (search_vector);
CREATE INDEX idx_telegram_link_user ON public.telegram_link USING btree (user_id);
CREATE INDEX idx_telegram_link_token_user ON public.telegram_link_token USING btree (user_id);
CREATE INDEX idx_tesseramento_anno ON public.tesseramento USING btree (anno);
CREATE INDEX idx_tesseramento_scadenza ON public.tesseramento USING btree (scadenza);
CREATE INDEX idx_tesseramento_anno_anno ON public.tesseramento_anno USING btree (anno);
CREATE INDEX idx_toponimo_attestazione_inserito_da ON public.toponimo_attestazione USING btree (inserito_da);
CREATE INDEX idx_toponimo_attestazione_luogo ON public.toponimo_attestazione USING btree (luogo_id);
CREATE INDEX idx_utente_email ON public.utente USING btree (email);
CREATE INDEX idx_utente_distintivo_distintivo ON public.utente_distintivo USING btree (distintivo_id);
CREATE INDEX idx_utente_ruolo_assegnato_da ON public.utente_ruolo USING btree (assegnato_da);
CREATE INDEX idx_utente_ruolo_ruolo_id ON public.utente_ruolo USING btree (ruolo_id);

-- ---- 6. RIGA SICUREZZA: RLS abilitata su tutte le 126 tabelle -------------
alter table public._import_gokollab enable row level security;
alter table public._mappa_img_wp enable row level security;
alter table public.ai_config_ruolo enable row level security;
alter table public.ai_conversazione enable row level security;
alter table public.ai_messaggio enable row level security;
alter table public.ai_rate_limit enable row level security;
alter table public.ai_rate_limit_pubblico enable row level security;
alter table public.ai_sorgente_citata enable row level security;
alter table public.anagrafica_modifica enable row level security;
alter table public.andreas_campagna enable row level security;
alter table public.andreas_canale enable row level security;
alter table public.andreas_kb enable row level security;
alter table public.andreas_kb_sorgente enable row level security;
alter table public.andreas_pubblicazione enable row level security;
alter table public.archivio_audio enable row level security;
alter table public.archivio_categoria enable row level security;
alter table public.archivio_documento enable row level security;
alter table public.articolo enable row level security;
alter table public.assoc_delega enable row level security;
alter table public.assoc_delibera enable row level security;
alter table public.assoc_documento enable row level security;
alter table public.assoc_modifica enable row level security;
alter table public.assoc_presenza enable row level security;
alter table public.assoc_riunione enable row level security;
alter table public.auth_otp enable row level security;
alter table public.comunicazione_destinatario enable row level security;
alter table public.comunicazione_istituzionale enable row level security;
alter table public.config_app enable row level security;
alter table public.consenso enable row level security;
alter table public.contatti_progressivo enable row level security;
alter table public.convenzioni enable row level security;
alter table public.convenzioni_punti enable row level security;
alter table public.convenzioni_rate_limit enable row level security;
alter table public.corso enable row level security;
alter table public.corso_vetrina enable row level security;
alter table public.custodi_categoria enable row level security;
alter table public.custodi_memoria enable row level security;
alter table public.deroga_quota enable row level security;
alter table public.distintivo enable row level security;
alter table public.dizionario_lemma enable row level security;
alter table public.documento_pubblico enable row level security;
alter table public.domande_tesseramento enable row level security;
alter table public.donazione_materiale enable row level security;
alter table public.download_lead enable row level security;
alter table public.email_outbox enable row level security;
alter table public.eventi_esterni enable row level security;
alter table public.eventi_esterni_date enable row level security;
alter table public.eventi_organizzatori_esclusi enable row level security;
alter table public.evento enable row level security;
alter table public.evento_iscrizione enable row level security;
alter table public.forum_media enable row level security;
alter table public.forum_post enable row level security;
alter table public.forum_reazione enable row level security;
alter table public.forum_thread enable row level security;
alter table public.forum_topic enable row level security;
alter table public.geocodifica_coda enable row level security;
alter table public.glossario_operazione enable row level security;
alter table public.guardiani_contributori enable row level security;
alter table public.guardiani_digest_invio enable row level security;
alter table public.import_log enable row level security;
alter table public.invito_tesseramento enable row level security;
alter table public.iscrizione_corso enable row level security;
alter table public.iscrizioni_gita enable row level security;
alter table public.lemma_commento enable row level security;
alter table public.lemma_correzione enable row level security;
alter table public.lemma_relazione enable row level security;
alter table public.lezione enable row level security;
alter table public.livello enable row level security;
alter table public.luoghi_interesse enable row level security;
alter table public.memoria_evento enable row level security;
alter table public.memoria_evento_reparto enable row level security;
alter table public.memoria_fondo enable row level security;
alter table public.memoria_persona enable row level security;
alter table public.memoria_reparto enable row level security;
alter table public.messaggio enable row level security;
alter table public.modifica_contenuto enable row level security;
alter table public.modulo_corso enable row level security;
alter table public.museo_gg_pezzo enable row level security;
alter table public.museo_gg_proposta enable row level security;
alter table public.museo_gg_raccolta enable row level security;
alter table public.museo_gg_raccolta_pezzo enable row level security;
alter table public.newsletter enable row level security;
alter table public.newsletter_invio enable row level security;
alter table public.newsletter_iscritto enable row level security;
alter table public.notifica enable row level security;
alter table public.notifica_consegna enable row level security;
alter table public.notifica_preferenza enable row level security;
alter table public.ocr_trascrizione enable row level security;
alter table public.pagamenti_tesseramento enable row level security;
alter table public.permesso_anon_lettura_attesa enable row level security;
alter table public.prima_nota enable row level security;
alter table public.progresso_lezione enable row level security;
alter table public.pubblicazione enable row level security;
alter table public.punti_evento enable row level security;
alter table public.push_invito enable row level security;
alter table public.push_token enable row level security;
alter table public.raccolta_fondi enable row level security;
alter table public.reazione enable row level security;
alter table public.registro_curatela enable row level security;
alter table public.reminder_super_admin enable row level security;
alter table public.rendiconto enable row level security;
alter table public.richieste_contatto enable row level security;
alter table public.ruolo enable row level security;
alter table public.sala_canale enable row level security;
alter table public.sala_messaggio enable row level security;
alter table public.sala_votazione enable row level security;
alter table public.sala_voto enable row level security;
alter table public.sentinella_pagina enable row level security;
alter table public.servizio enable row level security;
alter table public.servizio_battito enable row level security;
alter table public.solleciti_integrazione enable row level security;
alter table public.sollecito_quota enable row level security;
alter table public.spunto_settimana enable row level security;
alter table public.storia enable row level security;
alter table public.telegram_config enable row level security;
alter table public.telegram_link enable row level security;
alter table public.telegram_link_token enable row level security;
alter table public.telegram_notifica enable row level security;
alter table public.telegram_rate_limit enable row level security;
alter table public.tesseramento enable row level security;
alter table public.tesseramento_anno enable row level security;
alter table public.toponimo_attestazione enable row level security;
alter table public.utente enable row level security;
alter table public.utente_distintivo enable row level security;
alter table public.utente_ruolo enable row level security;
alter table public.vocabolario_voce enable row level security;

-- ---- 7. POLICY RLS (238) ---------------------------------------------------
create policy aicr_select_tutti on public.ai_config_ruolo as PERMISSIVE for SELECT to public using (true);
create policy aicr_write_super on public.ai_config_ruolo as PERMISSIVE for ALL to public using (has_ruolo_min(99)) with check (has_ruolo_min(99));
create policy aic_delete_proprie on public.ai_conversazione as PERMISSIVE for DELETE to public using (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(50)));
create policy aic_insert_proprie on public.ai_conversazione as PERMISSIVE for INSERT to public with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy aic_proprie_o_admin on public.ai_conversazione as PERMISSIVE for SELECT to public using (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(50)));
create policy aic_update_proprie on public.ai_conversazione as PERMISSIVE for UPDATE to public using (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(50))) with check (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(50)));
create policy aim_select_proprietario on public.ai_messaggio as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM ai_conversazione c
  WHERE ((c.id = ai_messaggio.conversazione_id) AND ((c.utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(50))))));
create policy airl_select_proprio on public.ai_rate_limit as PERMISSIVE for SELECT to public using (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(50)));
create policy ais_select_proprietario on public.ai_sorgente_citata as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM (ai_messaggio m
     JOIN ai_conversazione c ON ((c.id = m.conversazione_id)))
  WHERE ((m.id = ai_sorgente_citata.messaggio_id) AND ((c.utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(50))))));
create policy acamp_admin_all on public.andreas_campagna as PERMISSIVE for ALL to public using (has_ruolo_min(50)) with check (has_ruolo_min(50));
create policy ac_admin_all on public.andreas_canale as PERMISSIVE for ALL to public using (has_ruolo_min(50)) with check (has_ruolo_min(50));
create policy kb_select_admin on public.andreas_kb as PERMISSIVE for SELECT to public using (has_ruolo_min(50));
create policy kb_write_admin on public.andreas_kb as PERMISSIVE for ALL to public using (has_ruolo_min(50)) with check (has_ruolo_min(50));
create policy kbs_select_visibile on public.andreas_kb_sorgente as PERMISSIVE for SELECT to public using (((visibile_ospiti = true) OR has_ruolo_min(10)));
create policy kbs_write_admin on public.andreas_kb_sorgente as PERMISSIVE for ALL to public using (has_ruolo_min(50)) with check (has_ruolo_min(50));
create policy apub_admin_all on public.andreas_pubblicazione as PERMISSIVE for ALL to public using (has_ruolo_min(50)) with check (has_ruolo_min(50));
create policy aa_select_curatore_lingua on public.archivio_audio as PERMISSIVE for SELECT to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text));
create policy aa_select_per_visibilita on public.archivio_audio as PERMISSIVE for SELECT to public using (((visibile_ospiti = true) OR has_ruolo_min(10)));
create policy aa_update_curatore_lingua on public.archivio_audio as PERMISSIVE for UPDATE to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)) with check (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text));
create policy aa_write_collab on public.archivio_audio as PERMISSIVE for ALL to public using (has_ruolo_min(25)) with check (has_ruolo_min(25));
create policy archivio_categoria_select_all on public.archivio_categoria as PERMISSIVE for SELECT to public using (true);
create policy archivio_select_visibilita on public.archivio_documento as PERMISSIVE for SELECT to public using (((visibile_ospiti = true) OR has_ruolo_min(( SELECT auth.uid() AS uid), 10)));
create policy articolo_insert_collab on public.articolo as PERMISSIVE for INSERT to authenticated with check (((autore_id = ( SELECT auth.uid() AS uid)) AND has_ruolo_min(( SELECT auth.uid() AS uid), 25)));
create policy articolo_lettura_pubblica on public.articolo as PERMISSIVE for SELECT to anon, authenticated using (((pubblicato = true) AND (stato = 'pubblicato'::text)));
create policy articolo_select_own_or_admin on public.articolo as PERMISSIVE for SELECT to authenticated using (((autore_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy articolo_update_collab on public.articolo as PERMISSIVE for UPDATE to public using (((autore_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50))) with check ((((autore_id = ( SELECT auth.uid() AS uid)) AND (stato = ANY (ARRAY['bozza'::text, 'rifiutato'::text]))) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy assoc_delega_lettura on public.assoc_delega as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_delega_revoca on public.assoc_delega as PERMISSIVE for UPDATE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid))) with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_delega_scrittura on public.assoc_delega as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_delibera_correzione on public.assoc_delibera as PERMISSIVE for UPDATE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid))) with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_delibera_lettura on public.assoc_delibera as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_delibera_scrittura on public.assoc_delibera as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_documento_lettura on public.assoc_documento as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_documento_rimozione on public.assoc_documento as PERMISSIVE for DELETE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_documento_scrittura on public.assoc_documento as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_modifica_lettura on public.assoc_modifica as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_presenza_lettura on public.assoc_presenza as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_presenza_rimozione on public.assoc_presenza as PERMISSIVE for DELETE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_presenza_scrittura on public.assoc_presenza as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_riunione_correzione on public.assoc_riunione as PERMISSIVE for UPDATE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid))) with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_riunione_lettura on public.assoc_riunione as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy assoc_riunione_scrittura on public.assoc_riunione as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy comunicazione_destinatario_lettura on public.comunicazione_destinatario as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy comunicazione_istituzionale_lettura on public.comunicazione_istituzionale as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy config_app_manage_super_admin on public.config_app as PERMISSIVE for ALL to public using (has_ruolo(( SELECT auth.uid() AS uid), 'super_admin'::text)) with check (has_ruolo(( SELECT auth.uid() AS uid), 'super_admin'::text));
create policy config_app_select_admin on public.config_app as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy config_app_select_branding_pubblico on public.config_app as PERMISSIVE for SELECT to public using ((categoria = ANY (ARRAY['branding'::text, 'editoriale'::text])));
create policy config_app_select_chiavi_pubbliche on public.config_app as PERMISSIVE for SELECT to public using ((chiave = ANY (config_app_chiavi_pubbliche())));
create policy consenso_insert_own on public.consenso as PERMISSIVE for INSERT to authenticated with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy consenso_select_own on public.consenso as PERMISSIVE for SELECT to authenticated using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy convenzioni_lettura_pubblica on public.convenzioni as PERMISSIVE for SELECT to anon, authenticated using ((stato = 'attiva'::text));
create policy convenzioni_punti_admin on public.convenzioni_punti as PERMISSIVE for ALL to authenticated using (( SELECT has_ruolo_min(50) AS has_ruolo_min)) with check (( SELECT has_ruolo_min(50) AS has_ruolo_min));
create policy convenzioni_punti_pubblici on public.convenzioni_punti as PERMISSIVE for SELECT to public using (((pubblicato = true) AND (convenzione_id IS NOT NULL) AND convenzione_in_mappa(convenzione_id)));
create policy corso_insert_collab on public.corso as PERMISSIVE for INSERT to public with check (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy corso_select on public.corso as PERMISSIVE for SELECT to public using ((((pubblicato = true) AND ((livello_accesso = 'pubblico'::text) OR ((livello_accesso = 'ospite'::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL)) OR ((livello_accesso = 'socio'::text) AND has_ruolo_min(( SELECT auth.uid() AS uid), 10)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50))) OR has_ruolo_min(( SELECT auth.uid() AS uid), 25)));
create policy corso_update_collab on public.corso as PERMISSIVE for UPDATE to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy corso_vetrina_admin_write on public.corso_vetrina as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy corso_vetrina_public_read on public.corso_vetrina as PERMISSIVE for SELECT to public using ((attivo = true));
create policy custodi_categoria_public_read on public.custodi_categoria as PERMISSIVE for SELECT to public using (true);
create policy custodi_memoria_admin_insert on public.custodi_memoria as PERMISSIVE for INSERT to authenticated with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy custodi_memoria_admin_select on public.custodi_memoria as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy custodi_memoria_admin_update on public.custodi_memoria as PERMISSIVE for UPDATE to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy custodi_memoria_lettura_pubblica on public.custodi_memoria as PERMISSIVE for SELECT to anon, authenticated using ((visibile = true));
create policy distintivo_admin_write on public.distintivo as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy distintivo_read_all on public.distintivo as PERMISSIVE for SELECT to public using (true);
create policy dizionario_lettura_pubblica on public.dizionario_lemma as PERMISSIVE for SELECT to anon, authenticated using ((stato = 'pubblicato'::text));
create policy dz_non_i_propri on public.dizionario_lemma as RESTRICTIVE for UPDATE to authenticated using ((NOT glossario_lemma_e_mio(contributore_id)));
create policy dz_select_curatore_lingua on public.dizionario_lemma as PERMISSIVE for SELECT to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text));
create policy dz_select_soci on public.dizionario_lemma as PERMISSIVE for SELECT to public using (has_ruolo_min(10));
create policy dz_update_curatore_lingua on public.dizionario_lemma as PERMISSIVE for UPDATE to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)) with check (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text));
create policy dz_write_collab on public.dizionario_lemma as PERMISSIVE for ALL to public using (has_ruolo_min(25)) with check (has_ruolo_min(25));
create policy doc_pub_insert_collab on public.documento_pubblico as PERMISSIVE for INSERT to public with check (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy doc_pub_select_visibili on public.documento_pubblico as PERMISSIVE for SELECT to public using (((visibile = true) OR has_ruolo_min(( SELECT auth.uid() AS uid), 25)));
create policy doc_pub_update_collab on public.documento_pubblico as PERMISSIVE for UPDATE to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy domande_tess_admin_read on public.domande_tesseramento as PERMISSIVE for SELECT to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) AND (COALESCE((( SELECT auth.jwt() AS jwt) ->> 'aal'::text), 'aal1'::text) = 'aal2'::text)));
create policy domande_tess_self_read on public.domande_tesseramento as PERMISSIVE for SELECT to authenticated using ((lower(email) = lower(COALESCE((( SELECT auth.jwt() AS jwt) ->> 'email'::text), ''::text))));
create policy donazione_admin_all on public.donazione_materiale as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy donazione_curatore_select on public.donazione_materiale as PERMISSIVE for SELECT to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text));
create policy donazione_curatore_update on public.donazione_materiale as PERMISSIVE for UPDATE to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text)) with check (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text));
create policy donazione_insert_self on public.donazione_materiale as PERMISSIVE for INSERT to public with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 1) AND (donatore_id = ( SELECT auth.uid() AS uid))));
create policy donazione_read_self on public.donazione_materiale as PERMISSIVE for SELECT to public using ((donatore_id = ( SELECT auth.uid() AS uid)));
create policy donazione_update_self on public.donazione_materiale as PERMISSIVE for UPDATE to public using (((donatore_id = ( SELECT auth.uid() AS uid)) AND (stato = 'in_attesa'::text))) with check (((donatore_id = ( SELECT auth.uid() AS uid)) AND (stato = 'in_attesa'::text)));
create policy email_outbox_admin_insert on public.email_outbox as PERMISSIVE for INSERT to authenticated with check (( SELECT has_ruolo_min(50) AS has_ruolo_min));
create policy email_outbox_admin_select on public.email_outbox as PERMISSIVE for SELECT to authenticated using (( SELECT has_ruolo_min(50) AS has_ruolo_min));
create policy email_outbox_admin_update on public.email_outbox as PERMISSIVE for UPDATE to authenticated using (( SELECT has_ruolo_min(50) AS has_ruolo_min)) with check (( SELECT has_ruolo_min(50) AS has_ruolo_min));
create policy eventi_esterni_insert_curatori on public.eventi_esterni as PERMISSIVE for INSERT to public with check (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy eventi_esterni_read_curatori on public.eventi_esterni as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy eventi_esterni_read_pubblicati on public.eventi_esterni as PERMISSIVE for SELECT to anon, authenticated using ((stato = 'pubblicato'::text));
create policy eventi_esterni_write_curatori on public.eventi_esterni as PERMISSIVE for UPDATE to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy eventi_date_read_curatori on public.eventi_esterni_date as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy eventi_date_write_curatori on public.eventi_esterni_date as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy eventi_esclusi_admin_all on public.eventi_organizzatori_esclusi as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy eventi_esclusi_read_curatori on public.eventi_organizzatori_esclusi as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy evento_insert_admin on public.evento as PERMISSIVE for INSERT to public with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy evento_select_pubblicati on public.evento as PERMISSIVE for SELECT to public using (((pubblicato = true) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy evento_iscrizione_delete_own_or_admin on public.evento_iscrizione as PERMISSIVE for DELETE to public using (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy evento_iscrizione_insert_own on public.evento_iscrizione as PERMISSIVE for INSERT to public with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy evento_iscrizione_select_own_or_admin on public.evento_iscrizione as PERMISSIVE for SELECT to public using (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy evento_iscrizione_update_own on public.evento_iscrizione as PERMISSIVE for UPDATE to public using ((utente_id = ( SELECT auth.uid() AS uid))) with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy forum_media_delete on public.forum_media as PERMISSIVE for DELETE to public using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR ((thread_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM forum_thread th
  WHERE ((th.id = forum_media.thread_id) AND (th.autore_id = ( SELECT auth.uid() AS uid)))))) OR ((post_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM forum_post p
  WHERE ((p.id = forum_media.post_id) AND (p.autore_id = ( SELECT auth.uid() AS uid))))))));
create policy forum_media_insert_own on public.forum_media as PERMISSIVE for INSERT to public with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (((thread_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM forum_thread th
  WHERE ((th.id = forum_media.thread_id) AND (th.autore_id = ( SELECT auth.uid() AS uid)))))) OR ((post_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM forum_post p
  WHERE ((p.id = forum_media.post_id) AND (p.autore_id = ( SELECT auth.uid() AS uid)))))))));
create policy forum_media_read on public.forum_media as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 10));
create policy forum_post_delete_own_or_mod on public.forum_post as PERMISSIVE for DELETE to public using (((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (( SELECT auth.uid() AS uid) = autore_id)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy forum_post_insert_soci on public.forum_post as PERMISSIVE for INSERT to public with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (( SELECT auth.uid() AS uid) = autore_id)));
create policy forum_post_select_soci on public.forum_post as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 10));
create policy forum_post_update_own on public.forum_post as PERMISSIVE for UPDATE to public using ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (( SELECT auth.uid() AS uid) = autore_id))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (( SELECT auth.uid() AS uid) = autore_id)));
create policy fr_mod_delete on public.forum_reazione as PERMISSIVE for DELETE to public using (has_ruolo_min(25));
create policy fr_proprio_write on public.forum_reazione as PERMISSIVE for ALL to public using (((utente_id = ( SELECT auth.uid() AS uid)) AND has_ruolo_min(10))) with check (((utente_id = ( SELECT auth.uid() AS uid)) AND has_ruolo_min(10)));
create policy fr_select_soci on public.forum_reazione as PERMISSIVE for SELECT to public using (has_ruolo_min(10));
create policy forum_thread_delete_mod on public.forum_thread as PERMISSIVE for DELETE to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy forum_thread_insert_soci on public.forum_thread as PERMISSIVE for INSERT to public with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (( SELECT auth.uid() AS uid) = autore_id)));
create policy forum_thread_select_soci on public.forum_thread as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 10));
create policy forum_thread_update_mod on public.forum_thread as PERMISSIVE for UPDATE to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy forum_topic_select_soci on public.forum_topic as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 10));
create policy op_select_curatori on public.glossario_operazione as PERMISSIVE for SELECT to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy guardiani_digest_invio_direttivo on public.guardiani_digest_invio as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy import_log_select_admin on public.import_log as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy invito_tess_select on public.invito_tesseramento as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy iscrizione_insert_own on public.iscrizione_corso as PERMISSIVE for INSERT to public with check (((( SELECT auth.uid() AS uid) = utente_id) AND has_ruolo_min(( SELECT auth.uid() AS uid), 10)));
create policy iscrizione_select_own on public.iscrizione_corso as PERMISSIVE for SELECT to public using (((( SELECT auth.uid() AS uid) = utente_id) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy commento_select_curatori on public.lemma_commento as PERMISSIVE for SELECT to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy commento_update_curatori on public.lemma_commento as PERMISSIVE for UPDATE to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy correzione_select_curatori on public.lemma_correzione as PERMISSIVE for SELECT to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy correzione_update_curatori on public.lemma_correzione as PERMISSIVE for UPDATE to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy lemma_relazione_lettura_pubblica on public.lemma_relazione as PERMISSIVE for SELECT to anon, authenticated using (((EXISTS ( SELECT 1
   FROM dizionario_lemma la
  WHERE ((la.id = lemma_relazione.a_id) AND (la.stato = 'pubblicato'::text)))) AND (EXISTS ( SELECT 1
   FROM dizionario_lemma lb
  WHERE ((lb.id = lemma_relazione.b_id) AND (lb.stato = 'pubblicato'::text))))));
create policy rel_select_curatori on public.lemma_relazione as PERMISSIVE for SELECT to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy rel_write_curatori on public.lemma_relazione as PERMISSIVE for ALL to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy lezione_select on public.lezione as PERMISSIVE for SELECT to public using ((((pubblicata = true) AND ((livello_accesso = 'pubblico'::text) OR ((livello_accesso = ANY (ARRAY['ospite'::text, 'socio'::text])) AND has_ruolo_min(( SELECT auth.uid() AS uid), 10)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50))) OR has_ruolo_min(( SELECT auth.uid() AS uid), 25)));
create policy lezione_write_collab on public.lezione as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy livello_admin_write on public.livello as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy livello_read_all on public.livello as PERMISSIVE for SELECT to public using (true);
create policy luoghi_admin_all on public.luoghi_interesse as PERMISSIVE for ALL to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_contenuti'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_contenuti'::text)));
create policy luoghi_lettura_pubblica on public.luoghi_interesse as PERMISSIVE for SELECT to anon, authenticated using ((stato = 'pubblicato'::text));
create policy memoria_evento_lettura on public.memoria_evento as PERMISSIVE for SELECT to public using (true);
create policy memoria_evento_scrittura on public.memoria_evento as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy mer_lettura on public.memoria_evento_reparto as PERMISSIVE for SELECT to public using (true);
create policy mer_scrittura on public.memoria_evento_reparto as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy memoria_fondo_lettura on public.memoria_fondo as PERMISSIVE for SELECT to public using (((stato = 'pubblicato'::text) OR has_ruolo_min(( SELECT auth.uid() AS uid), 20)));
create policy memoria_fondo_scrittura on public.memoria_fondo as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy memoria_persona_lettura on public.memoria_persona as PERMISSIVE for SELECT to public using ((memoria_fondo_pubblico(fondo_id) OR has_ruolo_min(( SELECT auth.uid() AS uid), 20)));
create policy memoria_persona_scrittura on public.memoria_persona as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy memoria_reparto_lettura on public.memoria_reparto as PERMISSIVE for SELECT to public using (true);
create policy memoria_reparto_scrittura on public.memoria_reparto as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 20));
create policy messaggio_insert_proprio on public.messaggio as PERMISSIVE for INSERT to public with check ((( SELECT auth.uid() AS uid) = mittente_id));
create policy messaggio_select_propri on public.messaggio as PERMISSIVE for SELECT to public using (((( SELECT auth.uid() AS uid) = mittente_id) OR (( SELECT auth.uid() AS uid) = destinatario_id)));
create policy modifica_select_curatori on public.modifica_contenuto as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy modulo_select on public.modulo_corso as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM corso c
  WHERE ((c.id = modulo_corso.corso_id) AND (((c.pubblicato = true) AND has_ruolo_min(( SELECT auth.uid() AS uid), 10)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 25))))));
create policy modulo_write_collab on public.modulo_corso as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy museo_gg_admin_write on public.museo_gg_pezzo as PERMISSIVE for ALL to public using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_contenuti'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_contenuti'::text)));
create policy museo_gg_delete_socio on public.museo_gg_pezzo as PERMISSIVE for DELETE to public using (((caricato_da = ( SELECT auth.uid() AS uid)) AND (stato = 'in_attesa'::text)));
create policy museo_gg_insert_socio on public.museo_gg_pezzo as PERMISSIVE for INSERT to public with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (caricato_da = ( SELECT auth.uid() AS uid)) AND (stato = 'in_attesa'::text)));
create policy museo_gg_pezzo_curatore_insert on public.museo_gg_pezzo as PERMISSIVE for INSERT to authenticated with check (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text));
create policy museo_gg_pezzo_curatore_select on public.museo_gg_pezzo as PERMISSIVE for SELECT to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text));
create policy museo_gg_pezzo_curatore_update on public.museo_gg_pezzo as PERMISSIVE for UPDATE to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text)) with check (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text));
create policy museo_gg_public_read on public.museo_gg_pezzo as PERMISSIVE for SELECT to public using ((stato = 'pubblicato'::text));
create policy museo_gg_read_socio on public.museo_gg_pezzo as PERMISSIVE for SELECT to public using (((stato = 'pubblicato'::text) OR (has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (caricato_da = ( SELECT auth.uid() AS uid)))));
create policy museo_gg_update_socio on public.museo_gg_pezzo as PERMISSIVE for UPDATE to public using (((caricato_da = ( SELECT auth.uid() AS uid)) AND (stato = 'in_attesa'::text))) with check (((caricato_da = ( SELECT auth.uid() AS uid)) AND (stato = 'in_attesa'::text)));
create policy museo_gg_proposta_admin on public.museo_gg_proposta as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy museo_gg_proposta_curatore_select on public.museo_gg_proposta as PERMISSIVE for SELECT to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text));
create policy museo_gg_proposta_curatore_update on public.museo_gg_proposta as PERMISSIVE for UPDATE to authenticated using (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text)) with check (has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text));
create policy raccolta_curatore_all on public.museo_gg_raccolta as PERMISSIVE for ALL to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text)));
create policy raccolta_public_read on public.museo_gg_raccolta as PERMISSIVE for SELECT to public using ((stato = 'pubblicata'::text));
create policy raccolta_pezzo_curatore_all on public.museo_gg_raccolta_pezzo as PERMISSIVE for ALL to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_museo_gg'::text)));
create policy raccolta_pezzo_public_read on public.museo_gg_raccolta_pezzo as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM museo_gg_raccolta r
  WHERE ((r.id = museo_gg_raccolta_pezzo.raccolta_id) AND (r.stato = 'pubblicata'::text)))));
create policy newsletter_select_authenticated on public.newsletter as PERMISSIVE for SELECT to public using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy notifica_delete_own on public.notifica as PERMISSIVE for DELETE to public using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy notifica_select_own on public.notifica as PERMISSIVE for SELECT to public using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy notifica_update_own on public.notifica as PERMISSIVE for UPDATE to public using ((utente_id = ( SELECT auth.uid() AS uid))) with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy notifica_consegna_direttivo on public.notifica_consegna as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy notif_pref_self on public.notifica_preferenza as PERMISSIVE for ALL to public using ((utente_id = ( SELECT auth.uid() AS uid))) with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy ocr_select_curatori on public.ocr_trascrizione as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy ocr_select_pubblico_confermate on public.ocr_trascrizione as PERMISSIVE for SELECT to anon, authenticated using (((stato = 'confermata'::text) AND (testo IS NOT NULL) AND ocr_oggetto_pubblico(oggetto_tipo, oggetto_id)));
create policy ocr_select_soci_storia on public.ocr_trascrizione as PERMISSIVE for SELECT to authenticated using (((oggetto_tipo = 'storia'::text) AND (stato = 'confermata'::text) AND (testo IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM storia s
  WHERE ((s.id = ocr_trascrizione.oggetto_id) AND (((s.stato = 'pubblicata'::text) AND has_ruolo_min(( SELECT auth.uid() AS uid), 10)) OR (s.autore_id = ( SELECT auth.uid() AS uid))))))));
create policy ocr_update_curatori on public.ocr_trascrizione as PERMISSIVE for UPDATE to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 25));
create policy pagamenti_tess_admin_read on public.pagamenti_tesseramento as PERMISSIVE for SELECT to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) AND (COALESCE((( SELECT auth.jwt() AS jwt) ->> 'aal'::text), 'aal1'::text) = 'aal2'::text)));
create policy palla_select on public.permesso_anon_lettura_attesa as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy prima_nota_correzione on public.prima_nota as PERMISSIVE for UPDATE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid))) with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy prima_nota_lettura on public.prima_nota as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy prima_nota_scrittura on public.prima_nota as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy progresso_select_own on public.progresso_lezione as PERMISSIVE for SELECT to public using ((( SELECT auth.uid() AS uid) = utente_id));
create policy progresso_upsert_own on public.progresso_lezione as PERMISSIVE for ALL to public using ((( SELECT auth.uid() AS uid) = utente_id));
create policy pubblicazione_manage_admin on public.pubblicazione as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy pubblicazione_select_ospiti on public.pubblicazione as PERMISSIVE for SELECT to public using ((visibile_ospiti = true));
create policy pubblicazione_select_soci on public.pubblicazione as PERMISSIVE for SELECT to public using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy punti_admin_all on public.punti_evento as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy punti_read_self on public.punti_evento as PERMISSIVE for SELECT to public using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy push_invito_self on public.push_invito as PERMISSIVE for ALL to authenticated using ((utente_id = ( SELECT auth.uid() AS uid))) with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy push_token_delete_own on public.push_token as PERMISSIVE for DELETE to public using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy push_token_insert_own on public.push_token as PERMISSIVE for INSERT to public with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy push_token_select_own on public.push_token as PERMISSIVE for SELECT to public using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy push_token_update_own on public.push_token as PERMISSIVE for UPDATE to public using ((utente_id = ( SELECT auth.uid() AS uid))) with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy raccolta_fondi_correzione on public.raccolta_fondi as PERMISSIVE for UPDATE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid))) with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy raccolta_fondi_lettura on public.raccolta_fondi as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy raccolta_fondi_scrittura on public.raccolta_fondi as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy reazione_delete_propria on public.reazione as PERMISSIVE for DELETE to authenticated using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy reazione_insert_propria on public.reazione as PERMISSIVE for INSERT to authenticated with check ((utente_id = ( SELECT auth.uid() AS uid)));
create policy reazione_select_propria on public.reazione as PERMISSIVE for SELECT to authenticated using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy registro_curatela_select_admin on public.registro_curatela as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy reminder_super_admin_manage on public.reminder_super_admin as PERMISSIVE for ALL to public using (has_ruolo(( SELECT auth.uid() AS uid), 'super_admin'::text)) with check (has_ruolo(( SELECT auth.uid() AS uid), 'super_admin'::text));
create policy rendiconto_correzione on public.rendiconto as PERMISSIVE for UPDATE to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid))) with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy rendiconto_lettura on public.rendiconto as PERMISSIVE for SELECT to authenticated using (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy rendiconto_scrittura on public.rendiconto as PERMISSIVE for INSERT to authenticated with check (puo_gestione_associativa(( SELECT auth.uid() AS uid)));
create policy ruolo_select_all on public.ruolo as PERMISSIVE for SELECT to public using (true);
create policy sc_admin_select on public.sala_canale as PERMISSIVE for SELECT to public using (has_ruolo_min(50));
create policy sc_super_write on public.sala_canale as PERMISSIVE for ALL to public using (has_ruolo_min(99)) with check (has_ruolo_min(99));
create policy sm_admin_insert on public.sala_messaggio as PERMISSIVE for INSERT to public with check ((has_ruolo_min(50) AND (autore_id = ( SELECT auth.uid() AS uid))));
create policy sm_admin_select on public.sala_messaggio as PERMISSIVE for SELECT to public using (has_ruolo_min(50));
create policy sm_autore_update on public.sala_messaggio as PERMISSIVE for UPDATE to public using (((autore_id = ( SELECT auth.uid() AS uid)) AND has_ruolo_min(50))) with check (((autore_id = ( SELECT auth.uid() AS uid)) AND has_ruolo_min(50)));
create policy sm_super_delete on public.sala_messaggio as PERMISSIVE for DELETE to public using (has_ruolo_min(99));
create policy sv_admin_select on public.sala_votazione as PERMISSIVE for SELECT to public using (has_ruolo_min(50));
create policy sv_admin_write on public.sala_votazione as PERMISSIVE for ALL to public using (has_ruolo_min(50)) with check (has_ruolo_min(50));
create policy svi_admin_select on public.sala_voto as PERMISSIVE for SELECT to public using (has_ruolo_min(50));
create policy svi_proprio_write on public.sala_voto as PERMISSIVE for ALL to public using (((utente_id = ( SELECT auth.uid() AS uid)) AND has_ruolo_min(50))) with check (((utente_id = ( SELECT auth.uid() AS uid)) AND has_ruolo_min(50)));
create policy sentinella_select_direttivo on public.sentinella_pagina as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy spunto_select_soci on public.spunto_settimana as PERMISSIVE for SELECT to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 10));
create policy spunto_write_admin on public.spunto_settimana as PERMISSIVE for ALL to authenticated using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy storia_admin_all on public.storia as PERMISSIVE for ALL to public using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_contenuti'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_contenuti'::text)));
create policy storia_delete_socio on public.storia as PERMISSIVE for DELETE to public using ((autore_id = ( SELECT auth.uid() AS uid)));
create policy storia_insert_socio on public.storia as PERMISSIVE for INSERT to public with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (autore_id = ( SELECT auth.uid() AS uid))));
create policy storia_read_own on public.storia as PERMISSIVE for SELECT to public using ((autore_id = ( SELECT auth.uid() AS uid)));
create policy storia_read_public on public.storia as PERMISSIVE for SELECT to public using (((pubblica = true) AND (stato = 'pubblicata'::text)));
create policy storia_read_soci on public.storia as PERMISSIVE for SELECT to public using ((has_ruolo_min(( SELECT auth.uid() AS uid), 10) AND (stato = 'pubblicata'::text)));
create policy storia_update_socio on public.storia as PERMISSIVE for UPDATE to public using ((autore_id = ( SELECT auth.uid() AS uid))) with check ((autore_id = ( SELECT auth.uid() AS uid)));
create policy tesseramento_manage_admin on public.tesseramento as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy tesseramento_select_admin on public.tesseramento as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy tesseramento_select_own on public.tesseramento as PERMISSIVE for SELECT to public using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy topon_lettura_pubblica on public.toponimo_attestazione as PERMISSIVE for SELECT to public using (luogo_e_pubblico(luogo_id));
create policy topon_scrittura_curatori on public.toponimo_attestazione as PERMISSIVE for ALL to public using ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 50) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy utente_select_autori_pubblici on public.utente as PERMISSIVE for SELECT to anon, authenticated using ((EXISTS ( SELECT 1
   FROM storia s
  WHERE ((s.autore_id = utente.id) AND (s.pubblica = true) AND (s.stato = 'pubblicata'::text)))));
create policy utente_select_own on public.utente as PERMISSIVE for SELECT to public using ((( SELECT auth.uid() AS uid) = id));
create policy utente_select_soci on public.utente as PERMISSIVE for SELECT to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 10));
create policy utente_update_own on public.utente as PERMISSIVE for UPDATE to public using ((( SELECT auth.uid() AS uid) = id));
create policy udist_admin_all on public.utente_distintivo as PERMISSIVE for ALL to public using (has_ruolo_min(( SELECT auth.uid() AS uid), 50)) with check (has_ruolo_min(( SELECT auth.uid() AS uid), 50));
create policy udist_read_self on public.utente_distintivo as PERMISSIVE for SELECT to public using ((utente_id = ( SELECT auth.uid() AS uid)));
create policy utente_ruolo_select_own_or_admin on public.utente_ruolo as PERMISSIVE for SELECT to public using (((utente_id = ( SELECT auth.uid() AS uid)) OR has_ruolo_min(( SELECT auth.uid() AS uid), 50)));
create policy voc_select_tutti on public.vocabolario_voce as PERMISSIVE for SELECT to authenticated using (true);
create policy voc_write_curatori on public.vocabolario_voce as PERMISSIVE for ALL to authenticated using ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text))) with check ((has_ruolo_min(( SELECT auth.uid() AS uid), 25) OR has_ruolo(( SELECT auth.uid() AS uid), 'curatore_linguistico'::text)));
create policy vocabolario_lettura_pubblica on public.vocabolario_voce as PERMISSIVE for SELECT to anon using ((stato = 'attivo'::text));

-- ---- 8. VISTE (43) — v_forum_autore, v_soci_in_regola e
-- v_associati_istituzionale per prime: altre viste le leggono ---------------
create or replace view public.v_associati_istituzionale as SELECT id AS domanda_id,
    numero_socio,
    nome,
    cognome,
    lower(email) AS email,
    categoria_socio,
    numero_tessera
   FROM domande_tesseramento d
  WHERE stato = 'approvata'::text AND numero_socio IS NOT NULL AND COALESCE(numero_tessera, '-1'::integer) <> 0 AND COALESCE(stato_socio, 'attivo'::text) <> 'cessato'::text;

create or replace view public.v_forum_autore as SELECT id,
    COALESCE(NULLIF(btrim(nome), ''::text), 'Socio'::text) ||
        CASE
            WHEN NULLIF(btrim(cognome), ''::text) IS NOT NULL THEN (' '::text || "left"(btrim(cognome), 1)) || '.'::text
            ELSE ''::text
        END AS nome_visualizzato,
    avatar_url
   FROM utente u;
alter view public.v_forum_autore set (security_invoker = true);

create or replace view public.v_soci_in_regola as SELECT d.id AS domanda_id,
    d.nome,
    d.email,
    d.anno,
    d.numero_tessera,
    d.codice_tessera,
    d.stato,
    d.approvata_il,
    d.approvata_da,
    d.tessera_inviata,
    d.metodo_scelto,
    d.deroga_pagamento_motivo,
    d.motivo_rifiuto,
    quota_anno(COALESCE(d.anno, EXTRACT(year FROM now())::integer)) AS quota_dovuta,
    COALESCE(p.totale_incassato, 0::numeric) AS totale_incassato,
    GREATEST(quota_anno(COALESCE(d.anno, EXTRACT(year FROM now())::integer)) - COALESCE(p.totale_incassato, 0::numeric), 0::numeric) AS manca,
    p.ultimo_incasso_il,
    p.metodi_incasso,
    COALESCE(p.pagamenti_completati, 0::bigint) AS pagamenti_completati,
    COALESCE(t.tentativi_non_riusciti, 0::bigint) AS tentativi_non_riusciti,
    COALESCE(v.in_verifica, 0::bigint) AS pagamenti_in_verifica,
    COALESCE(p.totale_incassato, 0::numeric) >= quota_anno(COALESCE(d.anno, EXTRACT(year FROM now())::integer)) AS quota_incassata,
    d.deroga_pagamento_motivo IS NOT NULL AND btrim(d.deroga_pagamento_motivo) <> ''::text AS in_deroga,
    d.approvata_da = 'Import registro segretario 07/07/2026'::text AS socio_storico,
        CASE
            WHEN d.stato = 'annullata'::text THEN 'annullata'::text
            WHEN d.stato = 'respinta'::text THEN 'respinta'::text
            WHEN d.stato <> 'approvata'::text THEN 'in_coda'::text
            WHEN d.numero_tessera = 0 THEN 'account_di_sistema'::text
            WHEN d.deroga_pagamento_motivo IS NOT NULL AND btrim(d.deroga_pagamento_motivo) <> ''::text THEN 'in_regola_per_deroga'::text
            WHEN COALESCE(p.totale_incassato, 0::numeric) >= quota_anno(COALESCE(d.anno, EXTRACT(year FROM now())::integer)) THEN 'in_regola'::text
            WHEN COALESCE(p.totale_incassato, 0::numeric) > 0::numeric THEN 'parziale'::text
            WHEN d.approvata_da = 'Import registro segretario 07/07/2026'::text THEN 'da_regolarizzare'::text
            ELSE 'ammesso_senza_incasso'::text
        END AS posizione
   FROM domande_tesseramento d
     LEFT JOIN LATERAL ( SELECT count(*) AS pagamenti_completati,
            sum(pt.importo) AS totale_incassato,
            max(pt.created_at) AS ultimo_incasso_il,
            string_agg(DISTINCT pt.metodo, ', '::text) AS metodi_incasso
           FROM pagamenti_tesseramento pt
          WHERE pt.domanda_id = d.id AND pt.stato = 'completato'::text AND (pt.tipo = ANY (ARRAY['quota'::text, 'integrazione'::text])) AND pt.annullato_il IS NULL) p ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS tentativi_non_riusciti
           FROM pagamenti_tesseramento pt
          WHERE pt.domanda_id = d.id AND (pt.tipo = ANY (ARRAY['quota'::text, 'integrazione'::text])) AND (pt.stato <> ALL (ARRAY['completato'::text, 'in_verifica'::text])) AND pt.annullato_il IS NULL) t ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS in_verifica
           FROM pagamenti_tesseramento pt
          WHERE pt.domanda_id = d.id AND (pt.tipo = ANY (ARRAY['quota'::text, 'integrazione'::text])) AND pt.stato = 'in_verifica'::text AND pt.annullato_il IS NULL) v ON true;

create or replace view public.convenzioni_pubbliche as SELECT id,
    nome_attivita,
    categoria,
    localita,
    beneficio,
    dettagli,
    url,
    logo_path,
    beneficio_sintetico
   FROM convenzioni
  WHERE stato = 'attiva'::text;

create or replace view public.eventi_esterni_pubblici as SELECT id,
    titolo,
    descrizione,
    data_inizio,
    data_fine,
    ricorrenza,
    ora_inizio,
    ora_fine,
    luogo,
    comune,
    valle,
    organizzatore,
    url_fonte,
    prezzo,
    pilastro,
    fonte,
    slug
   FROM eventi_esterni
  WHERE stato = 'pubblicato'::text;

create or replace view public.glossario_pubblico as SELECT l.id,
    l.lemma AS termine,
    l.tipo,
    l.parlata AS variante,
    l.comune,
    l.definizione AS significato_it,
    l.esempi_uso AS esempio_uso,
        CASE
            WHEN a.id IS NOT NULL THEN (('https://wacknihvdjxltiqvxtqr.supabase.co/storage/v1/object/public/'::text || a.bucket) || '/'::text) || a.file_path
            ELSE NULL::text
        END AS audio_url,
        CASE
            WHEN c.consenso_firma THEN c.nome
            ELSE NULL::text
        END AS contributore_firma,
    l.slug,
    l.categoria_gramm,
    l.etimologia,
    l.proverbi,
    l.variante_italiana,
        CASE
            WHEN a.anonimo THEN NULL::text
            ELSE a.nome_parlante
        END AS audio_voce_di
   FROM dizionario_lemma l
     LEFT JOIN archivio_audio a ON a.id = l.audio_id AND a.stato = 'pubblicato'::text
     LEFT JOIN guardiani_contributori c ON c.id = l.contributore_id
  WHERE l.stato = 'pubblicato'::text;

create or replace view public.v_articoli_pubblici as SELECT id,
    titolo,
    slug,
    sottotitolo,
    estratto,
    corpo_html,
    immagine_copertina_url,
    pilastro,
    tags,
    categorie_slug,
    tipo_contenuto,
    in_evidenza,
    tempo_lettura_min,
    pubblicato_at,
    meta_title,
    meta_description,
    immagine_alt,
    noindex,
    wp_autore_originale,
    wp_legacy_id,
    archivio
   FROM articolo
  WHERE pubblicato = true AND stato = 'pubblicato'::text AND tipo_contenuto = 'post'::text;

create or replace view public.v_articoli_seo as SELECT wp_legacy_id,
    meta_title,
    meta_description,
    immagine_alt,
    COALESCE(noindex, false) AS noindex,
    immagine_copertina_url,
    pubblicato_at
   FROM articolo
  WHERE wp_legacy_id IS NOT NULL;

create or replace view public.v_associati_per_indirizzo as SELECT email,
    array_agg(domanda_id ORDER BY numero_socio) AS domande,
    array_agg(numero_socio ORDER BY numero_socio) AS numeri_socio,
    array_agg(COALESCE(nome, ''::text) ORDER BY numero_socio) AS nomi,
    count(*) AS quanti_soci
   FROM v_associati_istituzionale a
  WHERE email IS NOT NULL AND btrim(email) <> ''::text
  GROUP BY email;

create or replace view public.v_classifica as SELECT u.id AS utente_id,
    COALESCE(fa.nome_visualizzato, u.nome) AS nome_visualizzato,
    COALESCE(fa.avatar_url, u.avatar_url) AS avatar_url,
    COALESCE(pt.punti, 0) AS punti,
    liv.nome AS livello_nome,
    liv.ordine AS livello_ordine,
    rank() OVER (ORDER BY (COALESCE(pt.punti, 0)) DESC) AS posizione
   FROM utente u
     LEFT JOIN v_forum_autore fa ON fa.id = u.id
     LEFT JOIN ( SELECT punti_evento.utente_id,
            sum(punti_evento.punti)::integer AS punti
           FROM punti_evento
          GROUP BY punti_evento.utente_id) pt ON pt.utente_id = u.id
     LEFT JOIN LATERAL ( SELECT livello.nome,
            livello.ordine
           FROM livello
          WHERE livello.soglia_punti <= COALESCE(pt.punti, 0)
          ORDER BY livello.soglia_punti DESC
         LIMIT 1) liv ON true
  WHERE has_ruolo_min(u.id, 10) AND COALESCE(u.mostra_livello, true) = true;

create or replace view public.v_coda_ascolto as SELECT a.id AS audio_id,
    a.bucket,
    a.file_path,
    a.formato_audio,
    a.mime_originale,
    COALESCE(a.durata_secondi, 0) AS durata_secondi,
    a.parlata,
    a.comune_parlante,
    a.eta_parlante,
    a.sesso_parlante,
    a.nome_parlante,
    a.anonimo,
    a.voce_di_altri,
    a.consenso_parlante,
    a.registrato_il,
    a.luogo_registrazione,
    a.created_at,
    l.id AS lemma_id,
    l.lemma,
    l.slug AS lemma_slug,
    l.categoria_gramm,
    l.definizione,
    l.comune AS lemma_comune,
    l.audio_id IS NOT NULL AS lemma_ha_gia_voce,
    row_number() OVER (ORDER BY a.created_at, a.id) AS posizione,
    count(*) OVER () AS totale,
    sum(COALESCE(a.durata_secondi, 0)) OVER () AS secondi_totali
   FROM archivio_audio a
     JOIN dizionario_lemma l ON l.id = a.lemma_id
  WHERE a.stato = 'in_attesa'::text AND a.ascoltato_il IS NULL;
alter view public.v_coda_ascolto set (security_invoker = true);

create or replace view public.v_contanti_da_riconciliare as SELECT p.id,
    p.anno,
    p.importo,
    COALESCE((p.nome || ' '::text) || COALESCE(p.cognome, ''::text), p.email) AS socio,
    p.incassato_da,
    COALESCE(p.incassato_da_nome, u.nome) AS incassato_da_nome,
    p.incassato_il,
    CURRENT_DATE - p.incassato_il AS giorni_in_sospeso,
    p.note_incasso
   FROM pagamenti_tesseramento p
     LEFT JOIN utente u ON u.id = p.incassato_da
  WHERE p.metodo = 'contanti'::text AND p.stato = 'completato'::text AND p.consegnato_tesoriere = false
  ORDER BY p.incassato_il;

create or replace view public.v_convenzioni_mappa as SELECT id,
    nome_attivita,
    categoria,
    localita,
    beneficio,
    lat,
    lng
   FROM convenzioni
  WHERE stato = 'attiva'::text AND mostra_in_mappa = true AND lat IS NOT NULL AND lng IS NOT NULL;

create or replace view public.v_cruscotto_code as WITH q AS (
         SELECT 'Registrazioni da ascoltare'::text AS coda,
            'ascolta'::text AS chiave,
            '/ascolta'::text AS dove,
            count(*)::integer AS in_attesa,
            min(archivio_audio.created_at) AS piu_vecchia,
            7 AS soglia_giorni
           FROM archivio_audio
          WHERE archivio_audio.stato = 'in_attesa'::text AND archivio_audio.ascoltato_il IS NULL
        UNION ALL
         SELECT 'Eventi del radar da curare'::text AS text,
            'radar'::text AS text,
            '/radar-eventi'::text AS text,
            count(*)::integer AS count,
            min(eventi_esterni.created_at) AS min,
            14
           FROM eventi_esterni
          WHERE eventi_esterni.stato = 'proposto'::text
        UNION ALL
         SELECT 'Lemmi in attesa di validazione'::text AS text,
            'guardiani'::text AS text,
            '/guardiani-curatela'::text AS text,
            count(*)::integer AS count,
            min(dizionario_lemma.created_at) AS min,
            7
           FROM dizionario_lemma
          WHERE dizionario_lemma.stato <> 'pubblicato'::text
        UNION ALL
         SELECT 'Domande di tesseramento aperte'::text AS text,
            'domande'::text AS text,
            '/tesseramento-curatela'::text AS text,
            cd.in_attesa,
            cd.piu_vecchia,
            5
           FROM cruscotto_conta_domande() cd(in_attesa, piu_vecchia)
        )
 SELECT coda,
    chiave,
    dove,
    in_attesa,
    piu_vecchia,
        CASE
            WHEN piu_vecchia IS NULL THEN 0
            ELSE EXTRACT(day FROM now() - piu_vecchia)::integer
        END AS giorni_ferma,
    soglia_giorni,
    in_attesa > 0 AND piu_vecchia < (now() - make_interval(days => soglia_giorni)) AS in_allarme
   FROM q;
alter view public.v_cruscotto_code set (security_invoker = true);

create or replace view public.v_cruscotto_completezza as SELECT indicatore,
    fatti,
    totale,
    dove
   FROM ( VALUES ('Lemmi con la voce agganciata'::text,( SELECT count(*) AS count
                   FROM dizionario_lemma
                  WHERE dizionario_lemma.stato = 'pubblicato'::text AND dizionario_lemma.audio_id IS NOT NULL),( SELECT count(*) AS count
                   FROM dizionario_lemma
                  WHERE dizionario_lemma.stato = 'pubblicato'::text),'/glossario-console'::text), ('Luoghi con il nome ladino validato'::text,( SELECT count(*) AS count
                   FROM luoghi_interesse
                  WHERE luoghi_interesse.toponimo_validato_il IS NOT NULL),( SELECT count(*) AS count
                   FROM luoghi_interesse
                  WHERE luoghi_interesse.stato = 'pubblicato'::text),'/mappa'::text), ('Soci in regola collegati a un account'::text,(( SELECT cruscotto_conta_soci_regola.fatti
                   FROM cruscotto_conta_soci_regola() cruscotto_conta_soci_regola(fatti, totale))),(( SELECT cruscotto_conta_soci_regola.totale
                   FROM cruscotto_conta_soci_regola() cruscotto_conta_soci_regola(fatti, totale))),'/tesseramento-curatela'::text), ('Sepolture con data di morte'::text,( SELECT count(*) AS count
                   FROM memoria_persona
                  WHERE memoria_persona.data_morte IS NOT NULL),( SELECT count(*) AS count
                   FROM memoria_persona),'/cimiteri-di-guerra'::text), ('Sigle di reparto sciolte'::text,( SELECT count(*) AS count
                   FROM memoria_reparto
                  WHERE memoria_reparto.certezza <> 'da_verificare'::text),( SELECT count(*) AS count
                   FROM memoria_reparto),'/cimiteri-di-guerra/male'::text)) t(indicatore, fatti, totale, dove);
alter view public.v_cruscotto_completezza set (security_invoker = true);

create or replace view public.v_custodi_memoria as SELECT c.nome_pubblico,
    c.paese,
    c.descrizione_contributo,
    c.anno,
    c.anonimo,
    c.categoria_slug,
    c.valle,
    c.epoca,
    c.tipo_materiale,
    cat.titolo_it AS categoria_titolo_it,
    cat.titolo_lenga AS categoria_titolo_lenga,
    cat.ordine AS categoria_ordine,
    c.sezione
   FROM custodi_memoria c
     LEFT JOIN custodi_categoria cat ON cat.slug = c.categoria_slug
  WHERE c.visibile = true;

create or replace view public.v_glossario_fuori_vocabolario as WITH usati AS (
         SELECT 'parlata'::text AS dominio,
            dizionario_lemma.parlata AS valore,
            count(*) AS quanti
           FROM dizionario_lemma
          WHERE dizionario_lemma.stato = 'pubblicato'::text AND COALESCE(dizionario_lemma.parlata, ''::text) <> ''::text
          GROUP BY dizionario_lemma.parlata
        UNION ALL
         SELECT 'comune'::text,
            dizionario_lemma.comune,
            count(*) AS count
           FROM dizionario_lemma
          WHERE dizionario_lemma.stato = 'pubblicato'::text AND COALESCE(dizionario_lemma.comune, ''::text) <> ''::text
          GROUP BY dizionario_lemma.comune
        UNION ALL
         SELECT 'categoria_gramm'::text,
            dizionario_lemma.categoria_gramm,
            count(*) AS count
           FROM dizionario_lemma
          WHERE dizionario_lemma.stato = 'pubblicato'::text AND COALESCE(dizionario_lemma.categoria_gramm, ''::text) <> ''::text
          GROUP BY dizionario_lemma.categoria_gramm
        )
 SELECT dominio,
    valore,
    quanti,
    ( SELECT v.valore
           FROM vocabolario_voce v
          WHERE v.dominio = u.dominio AND v.stato = 'attivo'::text AND glossario_norm(v.valore) = glossario_norm(u.valore)
         LIMIT 1) AS forse_e,
    ( SELECT v.valore
           FROM vocabolario_voce v
          WHERE v.dominio = u.dominio AND v.stato = 'attivo'::text
          ORDER BY (similarity(glossario_norm(v.valore), glossario_norm(u.valore))) DESC
         LIMIT 1) AS il_piu_simile
   FROM usati u
  WHERE NOT (EXISTS ( SELECT 1
           FROM vocabolario_voce v
          WHERE v.dominio = u.dominio AND v.stato = 'attivo'::text AND v.valore = u.valore));

create or replace view public.v_glossario_qualita as WITH p AS (
         SELECT dizionario_lemma.id,
            dizionario_lemma.lemma,
            dizionario_lemma.parlata,
            dizionario_lemma.categoria_gramm,
            dizionario_lemma.definizione,
            dizionario_lemma.etimologia,
            dizionario_lemma.esempi_uso,
            dizionario_lemma.proverbi,
            dizionario_lemma.variante_italiana,
            dizionario_lemma.fonte,
            dizionario_lemma.creato_da,
            dizionario_lemma.created_at,
            dizionario_lemma.updated_at,
            dizionario_lemma.tipo,
            dizionario_lemma.comune,
            dizionario_lemma.audio_id,
            dizionario_lemma.stato,
            dizionario_lemma.contributore_id,
            dizionario_lemma.validato_da,
            dizionario_lemma.validato_il,
            dizionario_lemma.motivo_rifiuto,
            dizionario_lemma.sorgente_utm,
            dizionario_lemma.annunciato_il,
            dizionario_lemma.slug,
            dizionario_lemma.motivo_ritiro,
            dizionario_lemma.ritirato_da,
            dizionario_lemma.ritirato_il
           FROM dizionario_lemma
          WHERE dizionario_lemma.stato = 'pubblicato'::text
        )
 SELECT 'senza_categoria'::text AS chiave,
    'Senza categoria grammaticale'::text AS etichetta,
    10 AS ordine,
    'Che parte del discorso e'': sostantivo, verbo, aggettivo, avverbio, modo di dire.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE COALESCE(p.categoria_gramm, ''::text) = ''::text) AS quanti
UNION ALL
 SELECT 'senza_comune'::text AS chiave,
    'Senza paese'::text AS etichetta,
    20 AS ordine,
    'Una parola senza il luogo perde meta'' del suo valore: non si sa fin dove arriva.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE COALESCE(p.comune, ''::text) = ''::text) AS quanti
UNION ALL
 SELECT 'non_spiegata'::text AS chiave,
    'Che non si capiscono'::text AS etichetta,
    25 AS ordine,
    'Definizione corta E nessun esempio: qui manca davvero qualcosa. Basta una delle due cose, non servono tutte e due.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE NOT glossario_definizione_sufficiente(p.definizione, p.esempi_uso)) AS quanti
UNION ALL
 SELECT 'def_breve'::text AS chiave,
    'Con definizione breve'::text AS etichetta,
    30 AS ordine,
    'Sotto i quindici caratteri. Non sono tutte da correggere: per «abbastanza» o «ruvida» la definizione corta e'' quella giusta, e a spiegare ci pensa l''esempio.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE length(COALESCE(p.definizione, ''::text)) < 15) AS quanti
UNION ALL
 SELECT 'senza_esempio'::text AS chiave,
    'Senza esempio d''uso'::text AS etichetta,
    40 AS ordine,
    'La frase in cui la parola compare: e'' quello che insegna a usarla.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE COALESCE(p.esempi_uso, ''::text) = ''::text) AS quanti
UNION ALL
 SELECT 'senza_etimologia'::text AS chiave,
    'Senza etimologia'::text AS etichetta,
    50 AS ordine,
    'Da dove viene la parola. Facoltativa, ma quando c''e'' vale doppio.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE COALESCE(p.etimologia, ''::text) = ''::text) AS quanti
UNION ALL
 SELECT 'senza_proverbi'::text AS chiave,
    'Senza proverbi o detti'::text AS etichetta,
    60 AS ordine,
    'Un modo di dire in cui la parola compare.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE COALESCE(p.proverbi, ''::text) = ''::text) AS quanti
UNION ALL
 SELECT 'senza_audio'::text AS chiave,
    'Senza voce registrata'::text AS etichetta,
    5 AS ordine,
    'L''unica cosa in tutto l''archivio che ha una scadenza biologica: quella parola detta da quella persona non torna.'::text AS spiega,
    ( SELECT count(*) AS count
           FROM p
          WHERE p.audio_id IS NULL) AS quanti;

create or replace view public.v_incassi as SELECT 'pagamenti_tesseramento'::text AS tabella,
    p.id,
    p.tipo,
    p.nome,
    p.email,
    p.anno,
    p.importo,
        CASE
            WHEN p.annullato_il IS NOT NULL THEN 'annullato'::text
            ELSE p.stato
        END AS stato,
    p.metodo,
    p.capture_id,
    p.created_at AS quando,
    p.domanda_id,
    NULL::uuid AS iscrizione_id,
    p.incassato_il,
    p.data_ricostruita,
    p.annullato_motivo,
    p.note_incasso
   FROM pagamenti_tesseramento p
UNION ALL
 SELECT 'iscrizioni_gita'::text AS tabella,
    g.id,
    'anticipo_gita'::text AS tipo,
    TRIM(BOTH FROM (COALESCE(g.nome, ''::text) || ' '::text) || COALESCE(g.cognome, ''::text)) AS nome,
    g.email,
    EXTRACT(year FROM g.created_at)::integer AS anno,
    g.importo_anticipo AS importo,
        CASE g.stato
            WHEN 'anticipo_pagato'::text THEN 'completato'::text
            WHEN 'saldo_pagato'::text THEN 'completato'::text
            WHEN 'annullato'::text THEN 'annullato'::text
            ELSE 'creato'::text
        END AS stato,
    g.metodo,
    g.paypal_capture_id AS capture_id,
    g.created_at AS quando,
    NULL::uuid AS domanda_id,
    g.id AS iscrizione_id,
    g.created_at::date AS incassato_il,
    false AS data_ricostruita,
    NULL::text AS annullato_motivo,
    NULL::text AS note_incasso
   FROM iscrizioni_gita g
  WHERE g.paypal_capture_id IS NOT NULL;

create or replace view public.v_lemma_commento_pubblico as SELECT id,
    lemma_id,
    testo,
    NULLIF(btrim(nome), ''::text) AS firma,
    NULLIF(btrim(comune), ''::text) AS comune,
    created_at
   FROM lemma_commento c
  WHERE stato = 'pubblicato'::text;

create or replace view public.v_lemma_relazione_pubblica as SELECT r.tipo,
    r.a_id AS da_id,
    lb.id AS verso_id,
    lb.slug AS verso_slug,
    lb.lemma AS verso_lemma,
    lb.parlata AS verso_parlata,
    lb.comune AS verso_comune,
    lb.definizione AS verso_definizione
   FROM lemma_relazione r
     JOIN dizionario_lemma la ON la.id = r.a_id AND la.stato = 'pubblicato'::text
     JOIN dizionario_lemma lb ON lb.id = r.b_id AND lb.stato = 'pubblicato'::text
UNION ALL
 SELECT r.tipo,
    r.b_id AS da_id,
    la.id AS verso_id,
    la.slug AS verso_slug,
    la.lemma AS verso_lemma,
    la.parlata AS verso_parlata,
    la.comune AS verso_comune,
    la.definizione AS verso_definizione
   FROM lemma_relazione r
     JOIN dizionario_lemma la ON la.id = r.a_id AND la.stato = 'pubblicato'::text
     JOIN dizionario_lemma lb ON lb.id = r.b_id AND lb.stato = 'pubblicato'::text;

create or replace view public.v_luoghi_mappa as SELECT id,
    nome,
    categoria,
    valle,
    lat,
    lng,
    descrizione_breve,
    url_articolo,
    slug,
    in_anteprima,
        CASE
            WHEN toponimo_validato_il IS NOT NULL THEN nome_ladino
            ELSE NULL::text
        END AS nome_ladino,
    immagini_urls[1] AS immagine_copertina
   FROM luoghi_interesse l
  WHERE stato = 'pubblicato'::text;
alter view public.v_luoghi_mappa set (security_invoker = true);

create or replace view public.v_luoghi_pagina as SELECT l.id,
    l.slug,
    l.nome,
    l.categoria,
    l.valle,
    l.lat,
    l.lng,
    l.descrizione_breve,
    l.descrizione_estesa,
    l.meta_description,
    l.url_articolo,
    l.fonte_immagine,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL THEN l.nome_ladino
            ELSE NULL::text
        END AS nome_ladino,
    l.nome_tedesco,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL THEN l.parlata
            ELSE NULL::text
        END AS parlata,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL THEN l.nome_ladino_varianti
            ELSE NULL::text[]
        END AS nome_ladino_varianti,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL THEN l.pronuncia_ipa
            ELSE NULL::text
        END AS pronuncia_ipa,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL AND a.stato = 'pubblicato'::text THEN a.file_url
            ELSE NULL::text
        END AS audio_url,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL THEN l.etimologia
            ELSE NULL::text
        END AS etimologia,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL THEN l.etimologia_strato
            ELSE NULL::text
        END AS etimologia_strato,
        CASE
            WHEN l.toponimo_validato_il IS NOT NULL THEN l.etimologia_certezza
            ELSE NULL::text
        END AS etimologia_certezza,
    l.toponimo_validato_il IS NOT NULL AS toponimo_validato,
    COALESCE(btrim(l.nome_ladino), ''::text) <> ''::text AND l.toponimo_validato_il IS NULL AS toponimo_in_verifica,
    l.immagini_urls
   FROM luoghi_interesse l
     LEFT JOIN archivio_audio a ON a.id = l.audio_id
  WHERE l.stato = 'pubblicato'::text AND l.slug IS NOT NULL AND l.slug <> ''::text;
alter view public.v_luoghi_pagina set (security_invoker = true);

create or replace view public.v_memoria_conteggi as SELECT count(*) FILTER (WHERE settore = 'militare'::text AND relazione_registrazione IS DISTINCT FROM 'doppia_registrazione'::text) AS sepolture_militari,
    count(*) FILTER (WHERE settore = 'civile'::text AND relazione_registrazione IS DISTINCT FROM 'doppia_registrazione'::text) AS sepolture_civili,
    count(*) FILTER (WHERE relazione_registrazione IS DISTINCT FROM 'doppia_registrazione'::text) AS sepolture_totali,
    count(*) FILTER (WHERE relazione_registrazione IS NULL OR relazione_registrazione = 'da_verificare'::text) AS uomini_distinti,
    count(*) FILTER (WHERE relazione_registrazione = 'doppia_sepoltura'::text) AS uomini_in_entrambi_i_cimiteri,
    count(*) FILTER (WHERE ignoto) AS senza_nome,
    count(*) FILTER (WHERE relazione_registrazione = 'da_verificare'::text) AS coppie_aperte,
    count(*) FILTER (WHERE data_morte IS NOT NULL) AS con_data_di_morte
   FROM memoria_persona;
alter view public.v_memoria_conteggi set (security_invoker = true);

create or replace view public.v_memoria_evento_pubblico as SELECT id,
    slug,
    nome,
    nome_originale,
    data_da,
    data_a,
    luogo,
    descrizione,
    fonti
   FROM memoria_evento;
alter view public.v_memoria_evento_pubblico set (security_invoker = true);

create or replace view public.v_memoria_evento_reparto_pubblico as SELECT e.slug AS evento_slug,
    mer.denominazione_documento,
    mer.comando,
    mer.sigla,
    r.slug AS reparto_slug,
    r.denominazione AS reparto_denominazione,
    mer.confidenza,
    mer.fonte,
    mer.citazione,
    mer.note,
    ( SELECT count(*) AS count
           FROM memoria_persona p
          WHERE p.reparto = mer.sigla AND p.relazione_registrazione IS DISTINCT FROM 'doppia_registrazione'::text) AS sepolture_a_male
   FROM memoria_evento_reparto mer
     JOIN memoria_evento e ON e.id = mer.evento_id
     LEFT JOIN memoria_reparto r ON r.sigla = mer.sigla;
alter view public.v_memoria_evento_reparto_pubblico set (security_invoker = true);

create or replace view public.v_memoria_fondo_pubblico as SELECT id,
    slug,
    slug_breve,
    titolo,
    sottotitolo,
    tipo,
    comune,
    valle,
    lat,
    lng,
    anno_da,
    anno_a,
    descrizione,
    archivio,
    segnatura,
    ricercatore,
    ricercatore_note,
    licenza_immagini,
    planimetria_url,
    planimetria_geo,
    racconto_html,
    posti_censiti,
    ( SELECT count(*) AS count
           FROM memoria_persona p
          WHERE p.fondo_id = f.id) AS nomi_noti,
    posti_censiti - (( SELECT count(*) AS count
           FROM memoria_persona p
          WHERE p.fondo_id = f.id)) AS senza_nome,
    protocollo,
    anno_pratica
   FROM memoria_fondo f
  WHERE stato = 'pubblicato'::text;
alter view public.v_memoria_fondo_pubblico set (security_invoker = true);

create or replace view public.v_memoria_persona_pubblica as SELECT p.id,
    p.slug,
    f.slug AS fondo_slug,
    f.slug_breve AS fondo_slug_breve,
    f.titolo AS fondo_titolo,
    f.comune,
    f.valle,
    p.settore,
    p.numero,
    p.nome_completo,
    p.grado,
    p.reparto,
    p.data_morte_testo,
    p.data_morte,
    p.anno_nascita,
    p.luogo_nascita,
    p.regione_nascita,
    p.prigioniero_guerra,
    p.ignoto,
    p.note,
    e.slug AS evento_slug,
    e.nome AS evento_nome,
    p.evento_certezza,
    p.relazione_registrazione,
    p.relazione_registrazione IS DISTINCT FROM 'doppia_registrazione'::text AS conta_nei_totali,
    p.nota_registrazione,
    a.settore AS altra_settore,
    a.numero AS altra_numero,
    a.slug AS altra_slug,
    r.denominazione AS reparto_denominazione,
    r.scioglimento AS reparto_scioglimento,
    r.slug AS reparto_slug,
    r.certezza AS reparto_certezza,
    p.evento_motivazione
   FROM memoria_persona p
     JOIN memoria_fondo f ON f.id = p.fondo_id
     LEFT JOIN memoria_evento e ON e.id = p.evento_id
     LEFT JOIN memoria_persona a ON a.id = p.stessa_persona_di
     LEFT JOIN memoria_reparto r ON r.sigla = p.reparto
  WHERE f.stato = 'pubblicato'::text;
alter view public.v_memoria_persona_pubblica set (security_invoker = true);

create or replace view public.v_memoria_reparto_pubblico as SELECT r.sigla,
    r.slug,
    r.scioglimento,
    r.denominazione,
    r.arma,
    r.certezza,
    r.sigla_padre,
    r.note,
    count(p.id) AS caduti,
    count(p.id) FILTER (WHERE p.settore = 'militare'::text) AS caduti_militare,
    count(p.id) FILTER (WHERE p.settore = 'civile'::text) AS caduti_civile
   FROM memoria_reparto r
     LEFT JOIN memoria_persona p ON p.reparto = r.sigla
  GROUP BY r.sigla, r.slug, r.scioglimento, r.denominazione, r.arma, r.certezza, r.sigla_padre, r.note;
alter view public.v_memoria_reparto_pubblico set (security_invoker = true);

create or replace view public.v_modifiche_recenti as SELECT m.id,
    m.tabella,
    m.riga_id,
    m.campo,
    m.prima,
    m.dopo,
    m.quando,
    COALESCE(NULLIF(btrim(u.nome), ''::text), 'Qualcuno'::text) ||
        CASE
            WHEN NULLIF(btrim(u.cognome), ''::text) IS NOT NULL THEN (' '::text || "left"(btrim(u.cognome), 1)) || '.'::text
            ELSE ''::text
        END AS chi,
        CASE m.tabella
            WHEN 'dizionario_lemma'::text THEN ( SELECT l.lemma
               FROM dizionario_lemma l
              WHERE l.id = m.riga_id)
            WHEN 'museo_gg_pezzo'::text THEN ( SELECT p.titolo
               FROM museo_gg_pezzo p
              WHERE p.id = m.riga_id)
            WHEN 'storia'::text THEN ( SELECT s.titolo
               FROM storia s
              WHERE s.id = m.riga_id)
            WHEN 'articolo'::text THEN ( SELECT a.titolo
               FROM articolo a
              WHERE a.id = m.riga_id)
            ELSE NULL::text
        END AS cosa,
        CASE m.tabella
            WHEN 'dizionario_lemma'::text THEN 'Glossario'::text
            WHEN 'museo_gg_pezzo'::text THEN 'Museo'::text
            WHEN 'storia'::text THEN 'Storie'::text
            WHEN 'articolo'::text THEN 'Articoli'::text
            ELSE m.tabella
        END AS dove
   FROM modifica_contenuto m
     LEFT JOIN utente u ON u.id = m.chi;
alter view public.v_modifiche_recenti set (security_invoker = true);

create or replace view public.v_movimenti_cassa as SELECT 'pagamenti'::text AS fonte,
    p.id::text AS riga,
    COALESCE(p.incassato_il, p.created_at::date) AS data,
    'entrata'::text AS verso,
        CASE p.tipo
            WHEN 'quota'::text THEN 'quote_associative'::text
            WHEN 'integrazione'::text THEN 'integrazioni'::text
            ELSE 'donazioni'::text
        END AS categoria,
    'A'::text AS sezione,
    p.importo,
    NULL::uuid AS raccolta_fondi_id,
        CASE p.tipo
            WHEN 'quota'::text THEN 'Quota associativa'::text
            WHEN 'integrazione'::text THEN 'Integrazione quota'::text
            ELSE 'Donazione'::text
        END || COALESCE(' · '::text || p.nome, ''::text) AS descrizione
   FROM pagamenti_tesseramento p
  WHERE p.stato = 'completato'::text AND p.annullato_il IS NULL AND (p.tipo = ANY (ARRAY['quota'::text, 'integrazione'::text, 'donazione'::text]))
UNION ALL
 SELECT 'gite'::text AS fonte,
    g.id::text AS riga,
    g.created_at::date AS data,
    'entrata'::text AS verso,
    'anticipi_gita'::text AS categoria,
    'C'::text AS sezione,
    COALESCE(g.importo_anticipo, 0::numeric) + COALESCE(g.importo_saldo, 0::numeric) AS importo,
    ( SELECT rf.id
           FROM raccolta_fondi rf
          WHERE rf.evento_slug = g.evento_slug
         LIMIT 1) AS raccolta_fondi_id,
    ('Iscrizione '::text || COALESCE(g.evento_slug, 'gita'::text)) || COALESCE(' · '::text || g.nome, ''::text) AS descrizione
   FROM iscrizioni_gita g
  WHERE g.paypal_capture_id IS NOT NULL AND (COALESCE(g.importo_anticipo, 0::numeric) + COALESCE(g.importo_saldo, 0::numeric)) > 0::numeric
UNION ALL
 SELECT 'prima_nota'::text AS fonte,
    n.id::text AS riga,
    n.data,
    n.verso,
    n.categoria,
    n.sezione,
    n.importo,
    n.raccolta_fondi_id,
    n.descrizione
   FROM prima_nota n
  WHERE n.annullato_il IS NULL;
alter view public.v_movimenti_cassa set (security_invoker = true);

create or replace view public.v_newsletter_candidati_consenso as WITH fonti AS (
         SELECT lower(download_lead.email) AS email,
            max(download_lead.nome) AS nome,
            'materiale scaricato dal sito'::text AS fonte
           FROM download_lead
          WHERE download_lead.email IS NOT NULL
          GROUP BY (lower(download_lead.email))
        UNION ALL
         SELECT lower(guardiani_contributori.email) AS lower,
            max(guardiani_contributori.nome) AS max,
            'contributo al glossario dei Guardiani'::text
           FROM guardiani_contributori
          WHERE guardiani_contributori.email IS NOT NULL
          GROUP BY (lower(guardiani_contributori.email))
        UNION ALL
         SELECT lower(iscrizioni_gita.email) AS lower,
            max(iscrizioni_gita.nome) AS max,
            'iscrizione alla gita sociale'::text
           FROM iscrizioni_gita
          WHERE iscrizioni_gita.email IS NOT NULL
          GROUP BY (lower(iscrizioni_gita.email))
        UNION ALL
         SELECT lower(domande_tesseramento.email) AS lower,
            max(domande_tesseramento.nome) AS max,
            'domanda di adesione'::text
           FROM domande_tesseramento
          WHERE domande_tesseramento.email IS NOT NULL AND (domande_tesseramento.stato <> ALL (ARRAY['annullata'::text, 'respinta'::text]))
          GROUP BY (lower(domande_tesseramento.email))
        )
 SELECT email,
    max(nome) AS nome,
    array_agg(DISTINCT fonte ORDER BY fonte) AS fonti,
    (EXISTS ( SELECT 1
           FROM v_soci_in_regola v
          WHERE lower(v.email) = f.email AND v.stato = 'approvata'::text)) AS e_socio,
    'materiale scaricato dal sito'::text = ANY (array_agg(DISTINCT fonte)) AS da_download
   FROM fonti f
  WHERE NOT (email IN ( SELECT lower(newsletter_iscritto.email) AS lower
           FROM newsletter_iscritto)) AND email !~~ '%esempio-invalido.test'::text AND email <> 'da-completare@elbrenz.eu'::text AND email !~~ '%@elbrenz.eu'::text
  GROUP BY email;

create or replace view public.v_newsletter_destinatari as WITH esclusi AS (
         SELECT lower(newsletter_iscritto.email) AS email
           FROM newsletter_iscritto
          WHERE newsletter_iscritto.stato = ANY (ARRAY['in_attesa'::text, 'disiscritto'::text, 'rimbalzato'::text])
        ), soci_tutti AS (
         SELECT lower(v.email) AS email,
            min(v.nome) AS nome
           FROM v_soci_in_regola v
             JOIN domande_tesseramento d ON d.id = v.domanda_id
          WHERE v.stato = 'approvata'::text AND v.posizione <> 'account_di_sistema'::text AND d.stato_socio IS DISTINCT FROM 'cessato'::text AND v.email IS NOT NULL AND btrim(v.email) <> ''::text
          GROUP BY (lower(v.email))
        ), soci_regola AS (
         SELECT lower(v.email) AS email,
            min(v.nome) AS nome
           FROM v_soci_in_regola v
             JOIN domande_tesseramento d ON d.id = v.domanda_id
          WHERE (v.posizione = ANY (ARRAY['in_regola'::text, 'in_regola_per_deroga'::text])) AND d.stato_socio IS DISTINCT FROM 'cessato'::text AND v.email IS NOT NULL AND btrim(v.email) <> ''::text
          GROUP BY (lower(v.email))
        ), confermati AS (
         SELECT lower(i.email) AS email,
            min(i.nome) AS nome
           FROM newsletter_iscritto i
          WHERE i.stato = 'confermato'::text
          GROUP BY (lower(i.email))
        )
 SELECT 'soci_tutti'::text AS gruppo,
    s.email,
    s.nome
   FROM soci_tutti s
  WHERE NOT (s.email IN ( SELECT esclusi.email
           FROM esclusi))
UNION ALL
 SELECT 'soci_in_regola'::text AS gruppo,
    s.email,
    s.nome
   FROM soci_regola s
  WHERE NOT (s.email IN ( SELECT esclusi.email
           FROM esclusi))
UNION ALL
 SELECT 'non_soci'::text AS gruppo,
    c.email,
    c.nome
   FROM confermati c
  WHERE NOT (c.email IN ( SELECT soci_tutti.email
           FROM soci_tutti))
UNION ALL
 SELECT 'tutti'::text AS gruppo,
    u.email,
    min(u.nome) AS nome
   FROM ( SELECT s.email,
            s.nome
           FROM soci_tutti s
          WHERE NOT (s.email IN ( SELECT esclusi.email
                   FROM esclusi))
        UNION ALL
         SELECT c.email,
            c.nome
           FROM confermati c
          WHERE NOT (c.email IN ( SELECT soci_tutti.email
                   FROM soci_tutti))) u
  GROUP BY u.email;

create or replace view public.v_ocr_consumo as SELECT date_trunc('month'::text, created_at)::date AS mese,
    count(*)::integer AS estrazioni,
    count(*) FILTER (WHERE stato = 'confermata'::text)::integer AS confermate,
    count(*) FILTER (WHERE stato = 'fallita'::text)::integer AS fallite,
    COALESCE(sum(token_in), 0::bigint) AS token_in,
    COALESCE(sum(token_out), 0::bigint) AS token_out
   FROM ocr_trascrizione
  GROUP BY (date_trunc('month'::text, created_at)::date)
  ORDER BY (date_trunc('month'::text, created_at)::date) DESC;
alter view public.v_ocr_consumo set (security_invoker = true);

create or replace view public.v_posti_gita as SELECT 'gita-giochi-medievali-2026'::text AS evento_slug,
    54 AS posti_totali,
    COALESCE(( SELECT sum(iscrizioni_gita.posti) AS sum
           FROM iscrizioni_gita
          WHERE iscrizioni_gita.evento_slug = 'gita-giochi-medievali-2026'::text AND (iscrizioni_gita.stato = ANY (ARRAY['anticipo_pagato'::text, 'saldo_pagato'::text]))), 0::bigint)::integer AS posti_occupati;

create or replace view public.v_reazioni_conteggio as SELECT oggetto_tipo,
    oggetto_id,
    tipo,
    count(*)::integer AS quante,
    array_remove(array_agg(DISTINCT comune), NULL::text) AS comuni
   FROM reazione r
  GROUP BY oggetto_tipo, oggetto_id, tipo;

create or replace view public.v_sentinella_rotte as WITH ultime AS (
         SELECT s.id,
            s.cosa,
            s.slug,
            s.url,
            s.richiesta_id,
            s.status_code,
            s.esito,
            s.controllato_il,
            row_number() OVER (PARTITION BY s.cosa ORDER BY s.controllato_il DESC) AS n
           FROM sentinella_pagina s
          WHERE s.esito = ANY (ARRAY['ok'::text, 'rotta'::text])
        )
 SELECT cosa,
    max(slug) FILTER (WHERE n = 1) AS slug,
    max(url) FILTER (WHERE n = 1) AS url,
    max(status_code) FILTER (WHERE n = 1) AS status_code,
    max(controllato_il) FILTER (WHERE n = 1) AS controllato_il
   FROM ultime
  WHERE n <= 2
  GROUP BY cosa
 HAVING count(*) FILTER (WHERE esito = 'rotta'::text) = 2;

create or replace view public.v_servizi_stato as SELECT s.nome,
    s.descrizione,
    s.cadenza_massima_ore,
    s.attivo,
    b.creato_il AS ultimo_battito,
    b.esito AS ultimo_esito,
    round(EXTRACT(epoch FROM now() - b.creato_il) / 3600.0, 1) AS ore_fa,
    s.attivo AND (b.creato_il IS NULL OR b.creato_il < (now() - make_interval(hours => s.cadenza_massima_ore)) OR b.esito = 'errore'::text) AS in_allarme,
        CASE
            WHEN b.creato_il IS NULL THEN 'mai battuto'::text
            WHEN b.esito = 'errore'::text THEN 'ultimo esito in errore'::text
            WHEN b.creato_il < (now() - make_interval(hours => s.cadenza_massima_ore)) THEN 'silenzioso'::text
            ELSE 'sano'::text
        END AS diagnosi
   FROM servizio s
     LEFT JOIN LATERAL ( SELECT x.creato_il,
            x.esito
           FROM servizio_battito x
          WHERE x.servizio = s.nome
          ORDER BY x.creato_il DESC
         LIMIT 1) b ON true;

create or replace view public.v_storia_pubblica as SELECT s.id,
    s.titolo,
    s.contenuto,
    s.immagini_urls,
    s.copertina_url,
    s.created_at,
    COALESCE(NULLIF(btrim(u.nome), ''::text), 'Socio'::text) ||
        CASE
            WHEN NULLIF(btrim(u.cognome), ''::text) IS NOT NULL THEN (' '::text || "left"(btrim(u.cognome), 1)) || '.'::text
            ELSE ''::text
        END AS autore_nome
   FROM storia s
     LEFT JOIN utente u ON u.id = s.autore_id
  WHERE s.pubblica = true AND s.stato = 'pubblicata'::text;

create or replace view public.v_trascrizione_pubblica as SELECT oggetto_tipo,
    oggetto_id,
    immagine_url,
    testo
   FROM ocr_trascrizione t
  WHERE stato = 'confermata'::text AND COALESCE(btrim(testo), ''::text) <> ''::text;

create or replace view public.v_variante_candidate as WITH p AS (
         SELECT dizionario_lemma.id,
            dizionario_lemma.lemma,
            dizionario_lemma.parlata,
            dizionario_lemma.comune,
            dizionario_lemma.slug,
            dizionario_lemma.definizione,
            dizionario_lemma.variante_italiana,
            glossario_norm(dizionario_lemma.definizione) AS def_n,
            glossario_norm(dizionario_lemma.variante_italiana) AS vit_n,
            glossario_norm(dizionario_lemma.lemma) AS lem_n
           FROM dizionario_lemma
          WHERE dizionario_lemma.stato = 'pubblicato'::text
        ), coppie AS (
         SELECT a_1.id AS a_id,
            b_1.id AS b_id,
            'traduzione'::text AS motivo,
            1.0::real AS forza,
            COALESCE(a_1.def_n, a_1.vit_n) AS perche
           FROM p a_1
             JOIN p b_1 ON a_1.id < b_1.id AND (a_1.def_n IS NOT NULL AND a_1.def_n = b_1.def_n OR a_1.vit_n IS NOT NULL AND a_1.vit_n = b_1.vit_n OR a_1.def_n IS NOT NULL AND a_1.def_n = b_1.vit_n OR a_1.vit_n IS NOT NULL AND a_1.vit_n = b_1.def_n)
        UNION ALL
         SELECT a_1.id,
            b_1.id,
            'grafia'::text,
            similarity(a_1.lem_n, b_1.lem_n) AS similarity,
            (a_1.lemma || ' / '::text) || b_1.lemma
           FROM p a_1
             JOIN p b_1 ON a_1.id < b_1.id AND a_1.lem_n IS NOT NULL AND b_1.lem_n IS NOT NULL AND a_1.lem_n <> b_1.lem_n AND similarity(a_1.lem_n, b_1.lem_n) >= 0.6::double precision
        )
 SELECT c.a_id,
    c.b_id,
    c.motivo,
    c.forza,
    c.perche,
    a.lemma AS a_lemma,
    a.parlata AS a_parlata,
    a.comune AS a_comune,
    a.slug AS a_slug,
    a.definizione AS a_definizione,
    b.lemma AS b_lemma,
    b.parlata AS b_parlata,
    b.comune AS b_comune,
    b.slug AS b_slug,
    b.definizione AS b_definizione,
    COALESCE(a.parlata, ''::text) = COALESCE(b.parlata, ''::text) AS stessa_parlata
   FROM coppie c
     JOIN p a ON a.id = c.a_id
     JOIN p b ON b.id = c.b_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM lemma_relazione r
          WHERE r.a_id = c.a_id AND r.b_id = c.b_id));

create or replace view public.vista_ai_statistiche as SELECT date_trunc('day'::text, m.created_at)::date AS giorno,
    count(*) FILTER (WHERE m.ruolo = 'user'::text) AS domande,
    count(*) FILTER (WHERE m.ruolo = 'assistant'::text AND m.errore IS NULL) AS risposte_ok,
    count(*) FILTER (WHERE m.ruolo = 'assistant'::text AND m.errore IS NOT NULL) AS errori,
    sum(m.tokens_input) AS tokens_in,
    sum(m.tokens_output) AS tokens_out,
    count(DISTINCT c.utente_id) AS utenti_distinti
   FROM ai_messaggio m
     JOIN ai_conversazione c ON c.id = m.conversazione_id
  WHERE m.created_at > (now() - '60 days'::interval)
  GROUP BY (date_trunc('day'::text, m.created_at)::date)
  ORDER BY (date_trunc('day'::text, m.created_at)::date) DESC;

create or replace view public.vocabolario_pubblico as SELECT dominio,
    valore,
    COALESCE(etichetta, valore) AS etichetta,
    gruppo,
    ordine
   FROM vocabolario_voce
  WHERE stato = 'attivo'::text;

-- ---- 9. FUNZIONI NOSTRE (162, escluse le 165 di vector/citext) -----------
CREATE OR REPLACE FUNCTION public._process_wp_import()
 RETURNS TABLE(inserted_or_updated integer, total_in_db bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inserted int := 0;
  v_total bigint;
begin
  insert into public.articolo (
    wp_legacy_id, titolo, slug, corpo_html, estratto, immagine_copertina_url,
    autore_id, wp_autore_originale, pilastro, categorie_slug, tags,
    pubblicato, pubblicato_at, tempo_lettura_min, tipo_contenuto
  )
  select
    (r->>'wp_legacy_id')::int,
    r->>'titolo',
    r->>'slug',
    coalesce(r->>'corpo_html', ''),
    r->>'estratto',
    r->>'immagine_copertina_url',
    (r->>'autore_id')::uuid,
    r->>'wp_autore_originale',
    r->>'pilastro',
    coalesce(array(select jsonb_array_elements_text(r->'categorie_slug')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(r->'tags')), '{}'::text[]),
    (r->>'pubblicato')::boolean,
    nullif(r->>'pubblicato_at', '')::timestamptz,
    (r->>'tempo_lettura_min')::int,
    r->>'tipo_contenuto'
  from public._tmp_wp_import t,
       jsonb_array_elements(t.payload) as r
  on conflict (wp_legacy_id) where wp_legacy_id is not null do update set
    titolo=excluded.titolo, slug=excluded.slug, corpo_html=excluded.corpo_html,
    estratto=excluded.estratto, immagine_copertina_url=excluded.immagine_copertina_url,
    wp_autore_originale=excluded.wp_autore_originale, pilastro=excluded.pilastro,
    categorie_slug=excluded.categorie_slug, tags=excluded.tags,
    pubblicato=excluded.pubblicato, pubblicato_at=excluded.pubblicato_at,
    tempo_lettura_min=excluded.tempo_lettura_min, tipo_contenuto=excluded.tipo_contenuto;

  get diagnostics v_inserted = row_count;
  select count(*) into v_total from public.articolo where wp_legacy_id is not null;
  return query select v_inserted, v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aggiorna_ultimo_messaggio_thread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.forum_thread SET ultimo_messaggio_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.ai_consuma_quota(p_utente_id uuid, p_ip_hash text, p_limite integer)
 RETURNS TABLE(concesso boolean, messaggi integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- Bot fidato o chiamata malformata: nessun conteggio qui.
    return query select true, 0;
    return;
  end if;

  if v_msg is null then
    -- Il WHERE dell'upsert non e' passato: limite raggiunto. Si legge il
    -- conteggio vero per riferirlo al client.
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
end $function$
;

CREATE OR REPLACE FUNCTION public.ai_incrementa_rate_limit(p_utente_id uuid, p_tokens_totali integer DEFAULT 0)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.ai_rate_limit (utente_id, giorno, messaggi, tokens_totali)
  values (p_utente_id, current_date, 1, coalesce(p_tokens_totali, 0))
  on conflict (utente_id, giorno)
    do update set
      messaggi = public.ai_rate_limit.messaggi + 1,
      tokens_totali = public.ai_rate_limit.tokens_totali + excluded.tokens_totali;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_messaggi_rimanenti_oggi(p_utente_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user       uuid := coalesce(p_utente_id, auth.uid());
  v_limite     integer;
  v_usati      integer;
  v_ruolo_nome text;
begin
  select r.nome into v_ruolo_nome
  from public.utente_ruolo ur
  join public.ruolo r on r.id = ur.ruolo_id
  where ur.utente_id = v_user
  order by r.livello desc
  limit 1;

  if v_ruolo_nome is null then return 0; end if;

  select limite_giornaliero into v_limite
  from public.ai_config_ruolo where ruolo_nome = v_ruolo_nome;

  if v_limite is null then return 0; end if;
  if v_limite = -1 then return 999999; end if;

  select coalesce(messaggi, 0) into v_usati
  from public.ai_rate_limit
  where utente_id = v_user and giorno = current_date;

  return greatest(v_limite - coalesce(v_usati, 0), 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_somma_token(p_utente_id uuid, p_ip_hash text, p_tokens integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.annuncia_lemmi_pubblicati()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n integer; v_primo uuid; v_elenco text; v_titolo text; v_corpo text;
begin
  select count(*) into v_n
  from dizionario_lemma where stato = 'pubblicato' and annunciato_il is null;

  if coalesce(v_n, 0) = 0 then return 'niente da annunciare'; end if;

  select id into v_primo
  from dizionario_lemma where stato = 'pubblicato' and annunciato_il is null
  order by lemma limit 1;

  select string_agg(lemma, ', ' order by lemma) into v_elenco from (
    select lemma from dizionario_lemma
    where stato = 'pubblicato' and annunciato_il is null
    order by lemma limit 6
  ) s;

  if v_n = 1 then
    v_titolo := 'Una parola nuova nel glossario';
    v_corpo  := v_elenco;
  else
    v_titolo := v_n || ' parole nuove nel glossario';
    v_corpo  := v_elenco || case when v_n > 6 then ' e altre ' || (v_n - 6) else '' end;
  end if;

  perform notifica_broadcast(
    'glossario', v_titolo, v_corpo,
    'https://elbrenz.eu/guardiani-de-la-lenga#lemma-' || v_primo::text
  );

  update dizionario_lemma set annunciato_il = now()
  where stato = 'pubblicato' and annunciato_il is null;

  return format('annunciate %s parole', v_n);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assemblea_quorum(p_riunione uuid)
 RETURNS TABLE(data_riunione date, aventi_diritto integer, presenti_persona integer, rappresentati integer, intervenuti integer, soglia_prima integer, quorum_prima_ok boolean, deleghe_senza_delegato_presente integer, iscritti_da_meno_di_tre_mesi integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (select id, data_riunione from public.assoc_riunione where id = p_riunione),
  elenco as (
    select a.domanda_id, a.vota, a.approvata_il
    from public.associati_alla_data((select data_riunione from r)) a
  ),
  presenti as (
    select p.domanda_id from public.assoc_presenza p
    join elenco e on e.domanda_id = p.domanda_id and e.vota
    where p.riunione_id = p_riunione
  ),
  rappr as (
    select d.delegante_domanda_id from public.assoc_delega d
    join elenco e on e.domanda_id = d.delegante_domanda_id and e.vota
    where d.riunione_id = p_riunione
      and d.revocata_il is null
      and d.delegato_domanda_id in (select domanda_id from presenti)
  ),
  orfane as (
    select d.id from public.assoc_delega d
    where d.riunione_id = p_riunione
      and d.revocata_il is null
      and d.delegato_domanda_id not in (select domanda_id from presenti)
  ),
  conti as (
    select
      (select count(*)::int from elenco where vota) as av,
      (select count(*)::int from presenti)          as pp,
      (select count(*)::int from rappr)             as rp,
      (select count(*)::int from orfane)            as orf,
      (select count(*)::int from elenco e
        where e.vota and e.approvata_il is not null
          and e.approvata_il::date > ((select data_riunione from r) - interval '3 months')::date) as giovani
  )
  select
    (select data_riunione from r),
    c.av,
    c.pp,
    c.rp,
    c.pp + c.rp,
    -- «almeno 1/2 dei soci»: la meta' esatta, arrotondata per eccesso.
    ceil(c.av::numeric / 2)::int,
    (c.pp + c.rp) >= ceil(c.av::numeric / 2)::int,
    c.orf,
    c.giovani
  from conti c
  where public.puo_gestione_associativa(auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.assoc_cerca_delibere(p_termine text DEFAULT NULL::text, p_anno integer DEFAULT NULL::integer, p_organo text DEFAULT NULL::text, p_tag text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, riunione_id uuid, numero integer, oggetto text, testo text, esito text, voti_favorevoli integer, voti_contrari integer, voti_astenuti integer, tag text[], socio_id uuid, organo text, anno integer, riunione_numero integer, data_riunione date, riunione_annullata boolean, rilevanza real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    d.id, d.riunione_id, d.numero, d.oggetto, d.testo,
    d.esito, d.voti_favorevoli, d.voti_contrari, d.voti_astenuti,
    d.tag, d.socio_id,
    r.organo, r.anno, r.numero as riunione_numero, r.data_riunione,
    (r.annullato_il is not null) as riunione_annullata,
    case
      when p_termine is null or btrim(p_termine) = '' then 0::real
      else ts_rank(
        to_tsvector('italian', coalesce(d.oggetto,'') || ' ' || coalesce(d.testo,'')),
        plainto_tsquery('italian', p_termine))
    end as rilevanza
  from public.assoc_delibera d
  join public.assoc_riunione r on r.id = d.riunione_id
  where public.puo_gestione_associativa(auth.uid())
    and (p_termine is null or btrim(p_termine) = '' or
         to_tsvector('italian', coalesce(d.oggetto,'') || ' ' || coalesce(d.testo,''))
           @@ plainto_tsquery('italian', p_termine))
    and (p_anno is null or r.anno = p_anno)
    and (p_organo is null or btrim(p_organo) = '' or r.organo = p_organo)
    and (p_tag is null or btrim(p_tag) = '' or d.tag @> array[p_tag])
  order by rilevanza desc, r.anno desc, r.data_riunione desc, d.numero desc;
$function$
;

CREATE OR REPLACE FUNCTION public.assoc_delega_controlla()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_data    date;
  v_quante  integer;
  v_delegante_vota boolean;
  v_delegato_vota  boolean;
  v_nome    text;
begin
  if new.delegante_domanda_id = new.delegato_domanda_id then
    raise exception 'Un socio non puo'' delegare se stesso.';
  end if;

  select data_riunione into v_data from public.assoc_riunione where id = new.riunione_id;
  if v_data is null then
    raise exception 'La riunione non esiste: la delega non si registra al buio.';
  end if;

  -- Diritto di voto ALLA DATA dell'assemblea, non a oggi: chi si mette in
  -- regola il giorno prima vota, e chi cessa dopo ha comunque votato.
  select a.vota into v_delegante_vota
  from public.associati_alla_data(v_data) a where a.domanda_id = new.delegante_domanda_id;
  select a.vota into v_delegato_vota
  from public.associati_alla_data(v_data) a where a.domanda_id = new.delegato_domanda_id;

  if coalesce(v_delegante_vota, false) = false then
    select coalesce(nome,'') || ' ' || coalesce(cognome,'') into v_nome
    from public.domande_tesseramento where id = new.delegante_domanda_id;
    raise exception 'Delega rifiutata: % non e'' in regola con la quota alla data dell''assemblea, e chi non ha diritto di voto non puo'' delegarlo.', btrim(coalesce(v_nome,'il socio'));
  end if;

  if coalesce(v_delegato_vota, false) = false then
    select coalesce(nome,'') || ' ' || coalesce(cognome,'') into v_nome
    from public.domande_tesseramento where id = new.delegato_domanda_id;
    raise exception 'Delega rifiutata: % non e'' in regola con la quota alla data dell''assemblea, e chi non ha diritto di voto non puo'' rappresentare nessuno.', btrim(coalesce(v_nome,'il socio'));
  end if;

  -- IL MASSIMO DI DUE. Si contano solo le deleghe non revocate, e in update non
  -- si conta la riga che si sta modificando.
  select count(*) into v_quante
  from public.assoc_delega d
  where d.riunione_id = new.riunione_id
    and d.delegato_domanda_id = new.delegato_domanda_id
    and d.revocata_il is null
    and d.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if new.revocata_il is null and v_quante >= 2 then
    select coalesce(nome,'') || ' ' || coalesce(cognome,'') into v_nome
    from public.domande_tesseramento where id = new.delegato_domanda_id;
    raise exception 'Delega rifiutata: % ha gia'' due deleghe per questa assemblea, e lo statuto non ne ammette una terza.', btrim(coalesce(v_nome,'il socio'));
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assoc_delibera_controlla_voti()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_intervenuti integer;
  v_espressi    integer;
  v_dichiarati  integer;
begin
  v_espressi := coalesce(new.voti_favorevoli,0) + coalesce(new.voti_contrari,0) + coalesce(new.voti_astenuti,0);
  if v_espressi = 0 then return new; end if;

  -- Prima si prova a contare dai dati (presenze + deleghe). Se nessuno ha
  -- registrato le presenze si ripiega su presenti_n del verbale: meglio un
  -- controllo sul numero dichiarato che nessun controllo.
  select q.intervenuti into v_intervenuti from public.assemblea_quorum(new.riunione_id) q;
  if coalesce(v_intervenuti, 0) = 0 then
    select presenti_n into v_dichiarati from public.assoc_riunione where id = new.riunione_id;
    v_intervenuti := coalesce(v_dichiarati, 0);
  end if;

  if v_intervenuti > 0 and v_espressi > v_intervenuti then
    raise exception 'Conteggio rifiutato: % voti espressi su % intervenuti. Correggi i voti, oppure registra le presenze e le deleghe che mancano.', v_espressi, v_intervenuti;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assoc_prossimo_numero(p_organo text, p_anno integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(max(numero), 0) + 1
  from assoc_riunione where organo = p_organo and anno = p_anno;
$function$
;

CREATE OR REPLACE FUNCTION public.assoc_prossimo_numero_delibera(p_riunione uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(max(numero), 0) + 1
  from public.assoc_delibera where riunione_id = p_riunione;
$function$
;

CREATE OR REPLACE FUNCTION public.assoc_traccia_modifica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  new.aggiornato_da := coalesce(auth.uid(), new.aggiornato_da);
  insert into assoc_modifica (tabella, riga_id, chi, prima, dopo)
  values (tg_table_name, new.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assoc_vieta_cancellazione()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'Un verbale registrato non si cancella: si corregge, oppure si annulla con motivo.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.associati_alla_data(p_data date)
 RETURNS TABLE(domanda_id uuid, numero_socio integer, nome text, cognome text, email text, categoria_socio text, approvata_il timestamp with time zone, numero_tessera integer, cessato boolean, cessazione_data date, cessazione_motivo text, cessazione_delibera text, posizione text, convocato boolean, vota boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with anno as (select extract(year from p_data)::int as a),
  pos as (
    select s.domanda_id, s.posizione from public.soci_al_anno((select a from anno)) s
  )
  select
    d.id, d.numero_socio, d.nome, d.cognome, lower(d.email), d.categoria_socio,
    d.approvata_il, d.numero_tessera,
    -- Cessato A QUELLA DATA: una cessazione deliberata dopo non toglie a
    -- nessuno il diritto di essere stato convocato prima.
    (d.stato_socio = 'cessato' and d.cessazione_data is not null and d.cessazione_data <= p_data) as cessato,
    d.cessazione_data, d.cessazione_motivo, d.cessazione_delibera,
    coalesce(p.posizione, 'ammesso_senza_incasso') as posizione,
    -- CONVOCATO: associato e non ancora cessato. La quota non c'entra.
    (d.stato_socio is distinct from 'cessato'
      or d.cessazione_data is null or d.cessazione_data > p_data) as convocato,
    -- VOTA: solo chi e' in regola, e solo se e' ancora associato.
    ((d.stato_socio is distinct from 'cessato'
      or d.cessazione_data is null or d.cessazione_data > p_data)
     and coalesce(p.posizione, '') in ('in_regola', 'in_regola_per_deroga')) as vota
  from public.domande_tesseramento d
  left join pos p on p.domanda_id = d.id
  where d.stato = 'approvata'
    and coalesce(d.numero_tessera, -1) <> 0            -- via l'account di servizio
    -- Chi e' stato ammesso DOPO quella data non era ancora associato.
    and (d.approvata_il is null or d.approvata_il::date <= p_data)
  order by d.numero_socio nulls last, d.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.auth_otp_crea(p_email text, p_codice_hash text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  -- Invalida OTP precedenti ancora validi per questa email
  update public.auth_otp
  set usato = true, usato_at = now()
  where email = p_email and not usato and scade_at > now();

  -- Crea nuovo OTP valido 10 minuti
  insert into public.auth_otp (email, codice_hash, scade_at, ip_request, user_agent)
  values (p_email, p_codice_hash, now() + interval '10 minutes', p_ip, p_user_agent)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auth_otp_pulizia()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_deleted int;
begin
  delete from public.auth_otp
  where (usato and usato_at < now() - interval '1 day')
     or (scade_at < now() - interval '1 day');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auth_otp_verifica(p_email text, p_codice_hash text)
 RETURNS TABLE(valido boolean, messaggio text, otp_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_otp record;
begin
  -- Prendi OTP più recente non usato e non scaduto
  select * into v_otp
  from public.auth_otp
  where email = p_email and not usato
  order by created_at desc
  limit 1;

  if v_otp is null then
    return query select false, 'Nessun codice valido. Richiedi un nuovo codice.', null::uuid;
    return;
  end if;

  if v_otp.scade_at < now() then
    return query select false, 'Codice scaduto. Richiedi un nuovo codice.', v_otp.id;
    return;
  end if;

  if v_otp.tentativi >= v_otp.max_tentativi then
    -- Blocca OTP dopo 3 tentativi falliti
    update public.auth_otp set usato = true, usato_at = now() where id = v_otp.id;
    return query select false, 'Troppi tentativi errati. Richiedi un nuovo codice.', v_otp.id;
    return;
  end if;

  if v_otp.codice_hash = p_codice_hash then
    -- Successo: marca come usato
    update public.auth_otp
    set usato = true, usato_at = now()
    where id = v_otp.id;
    return query select true, 'Codice valido', v_otp.id;
  else
    -- Incrementa tentativi
    update public.auth_otp
    set tentativi = tentativi + 1
    where id = v_otp.id;
    return query select false,
      ('Codice errato. Tentativi rimasti: ' || (v_otp.max_tentativi - v_otp.tentativi - 1))::text,
      v_otp.id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aventi_diritto_voto(p_anno integer)
 RETURNS TABLE(domanda_id uuid, nome text, cognome text, numero_tessera integer, posizione text, vota boolean, perche text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.domanda_id, s.nome, s.cognome, s.numero_tessera, s.posizione,
         s.posizione in ('in_regola','in_regola_per_deroga') as vota,
         case s.posizione
           when 'in_regola' then 'quota ' || p_anno || ' versata'
           when 'in_regola_per_deroga' then 'in regola per deroga deliberata: ' || coalesce(s.deroga_motivo, 'motivo non registrato')
           when 'parziale' then 'versamento parziale: mancano ' || to_char(s.manca, 'FM999990.00') || ' euro'
           when 'da_rinnovare' then 'quota ' || p_anno || ' non ancora versata'
           when 'da_regolarizzare' then 'quota versata prima del sistema informatico, registrazione da completare'
           when 'cessato' then 'socio cessato il ' || coalesce(to_char(s.cessazione_data, 'DD/MM/YYYY'), 'data non registrata')
           else 'quota non pervenuta'
         end as perche
  from public.soci_al_anno(p_anno) s
  order by s.numero_tessera nulls last, s.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.blocca_approvazione_senza_incasso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pagamenti int;
begin
  if new.stato = 'approvata' and coalesce(old.stato,'') is distinct from 'approvata' then

    if new.deroga_pagamento_motivo is not null and btrim(new.deroga_pagamento_motivo) <> '' then
      return new;
    end if;

    select count(*) into v_pagamenti
    from public.pagamenti_tesseramento p
    where p.domanda_id = new.id
      and p.stato = 'completato'
      and p.tipo in ('quota','integrazione');

    if v_pagamenti = 0 then
      raise exception
        'Approvazione bloccata: per % non risulta nessuna quota incassata. Registra prima il pagamento, oppure indica il motivo della deroga nel campo deroga_pagamento_motivo (esempio: contanti gia raccolti).',
        new.nome
        using errcode = 'check_violation';
    end if;

  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cerca_archivio(p_query text, p_limite integer DEFAULT 30)
 RETURNS TABLE(tipo text, titolo text, estratto text, url text, rango real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (
    select websearch_to_tsquery('italian', public.immutable_unaccent(p_query)) as tsq
  )
  select * from (
    select 'glossario'::text as tipo, l.lemma as titolo,
      left(coalesce(l.definizione,''), 220) as estratto,
      '/guardiani-de-la-lenga/'||l.slug as url,
      ts_rank(l.search_vector, q.tsq) as rango
    from dizionario_lemma l, q
    where l.stato = 'pubblicato' and l.slug is not null and l.search_vector @@ q.tsq

    union all
    select 'storia', s.titolo,
      left(regexp_replace(coalesce(s.contenuto,''), '\s+', ' ', 'g'), 220),
      '/storie/'||s.id::text,
      ts_rank(s.search_vector, q.tsq)
    from storia s, q
    where s.pubblica is true and s.stato = 'pubblicata' and s.search_vector @@ q.tsq

    union all
    select 'museo', m.titolo,
      left(coalesce(m.descrizione, m.racconto, ''), 220),
      '/non-e-sole-grande-guerra/'||m.slug,
      ts_rank(m.search_vector, q.tsq)
    from museo_gg_pezzo m, q
    where m.stato = 'pubblicato' and m.slug is not null and m.search_vector @@ q.tsq

    union all
    select 'articolo', a.titolo,
      left(coalesce(a.estratto,''), 220),
      '/articoli/'||a.slug,
      ts_rank(a.search_vector, q.tsq)
    from articolo a, q
    where a.pubblicato is true and a.slug is not null and a.search_vector @@ q.tsq

    union all
    select 'luogo', coalesce(lo.nome,''),
      left(coalesce(lo.descrizione_breve,''), 220),
      '/luoghi/'||lo.slug,
      ts_rank(lo.search_vector, q.tsq)
    from luoghi_interesse lo, q
    where lo.stato = 'pubblicato' and lo.slug is not null and lo.search_vector @@ q.tsq

    union all
    select 'evento', e.titolo,
      left(coalesce(e.descrizione,''), 220),
      '/eventi/'||e.slug,
      ts_rank(e.search_vector, q.tsq)
    from eventi_esterni e, q
    where e.stato = 'pubblicato' and e.slug is not null and e.search_vector @@ q.tsq

    union all
    select 'trascrizione', s.titolo,
      left(regexp_replace(o.testo, '\s+', ' ', 'g'), 220),
      '/storie/'||s.id::text,
      ts_rank(o.search_vector, q.tsq)
    from ocr_trascrizione o
    join storia s on s.id = o.oggetto_id and o.oggetto_tipo = 'storia'
    cross join q
    where o.stato = 'confermata' and s.pubblica is true and s.stato = 'pubblicata' and o.search_vector @@ q.tsq

    union all
    select 'trascrizione', m.titolo,
      left(regexp_replace(o.testo, '\s+', ' ', 'g'), 220),
      '/non-e-sole-grande-guerra/'||m.slug,
      ts_rank(o.search_vector, q.tsq)
    from ocr_trascrizione o
    join museo_gg_pezzo m on m.id = o.oggetto_id and o.oggetto_tipo = 'museo_pezzo'
    cross join q
    where o.stato = 'confermata' and m.stato = 'pubblicato' and m.slug is not null and o.search_vector @@ q.tsq
  ) risultati
  where rango > 0
  order by rango desc
  limit greatest(1, least(p_limite, 100));
$function$
;

CREATE OR REPLACE FUNCTION public.cerca_soci(termine text)
 RETURNS TABLE(id uuid, nome text, avatar_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id,
    coalesce(nullif(btrim(u.nome), ''), 'Socio') ||
      case when nullif(btrim(u.cognome), '') is not null
           then ' ' || left(btrim(u.cognome), 1) || '.' else '' end as nome,
    u.avatar_url
  from public.utente u
  where public.has_ruolo_min(auth.uid(), 10)
    and public.has_ruolo_min(u.id, 10)
    and (u.nome ilike '%' || termine || '%' or u.cognome ilike '%' || termine || '%')
  order by u.nome
  limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.classifica_pilastro(p_titolo text, p_corpo text, p_categorie text[])
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_titolo_low text := lower(coalesce(p_titolo, ''));
  v_corpo_low text := lower(coalesce(p_corpo, ''));
  v_cats text[] := coalesce(p_categorie, '{}'::text[]);
begin
  -- LINGUA: categoria esplicita o pattern forti
  if 'lingua-delle-valli-del-noce-ladino-anaunico' = any(v_cats)
     or v_titolo_low ~ '(fioi dal nos|fi.?i dal nos|os dal nos|ladin|nones|anaunic|solander|rabies|pegaes|proverb|etimolog|lemma|parlat|dizionar)'
  then
    return 'lingua';
  end if;

  -- STORIA: pattern storico allargato
  if 'storia-e-cultura' = any(v_cats)
     or v_titolo_low ~ '(guerra rustica|1525|gaismair|andreas hofer|1809|asburgo|clesio|maria teresa|tirolo storico|tavolar|catast|urbar|feudale|thun|spaur|baldassare|grande guerra|kaiserj|standsch|beato carlo)'
     -- Grande Guerra
     or v_titolo_low ~ '(prima guerra|grande guerra|aeroplani|aeroplano|reggimento|fanteria|sch.tzen|trincea|fronte alpino|piave|carso|isonzo|dolomiti di sesto|torre vanga|figli di praga)'
     -- Musei e luoghi storici
     or v_titolo_low ~ '(ferdinandeum|museo storico|museo regionale|san romedio|reliquie)'
     -- Date storiche
     or v_titolo_low ~ '(16[0-9]{2}|17[0-9]{2}|18[0-9]{2}|19[01][0-9])'
  then
    return 'storia';
  end if;

  -- CULTURA MATERIALE
  if v_titolo_low ~ '(stua|mulino|mulin |fucina|fucine|malga|maso|stube|casere|utensil|architettura|carro|slitta|cucina tradiz)'
     or v_titolo_low like '%fil%'
     or v_corpo_low ~ '(mulino ruatti|stua ladina|fucina antica)'
  then
    return 'cultura-materiale';
  end if;

  -- IDENTITÀ
  if 'euregio' = any(v_cats)
     or v_titolo_low ~ '(euregio|tirol moderno|catalani|occitani|ladini dolomitici|diaspora|gemellaggio|minoranza lingu|innsbruck|bolzano|sudtirol|alto adige|cortina)'
  then
    return 'identita';
  end if;

  -- REIEVOCAZIONI
  if 'eventi-e-manifestazioni' = any(v_cats)
     or v_titolo_low ~ '(gita|gite|serata|cena|concorso|presentazione|commemora|rievoca|conferenza|visita|escursione|festa|manifestazione|incontro)'
  then
    return 'rievocazioni';
  end if;

  -- VITA ASSOCIATIVA
  if v_titolo_low ~ '(tesseramento|iscrizione|quota soc|statuto|direttivo|presidente|assemblea|consiglio|socio |soci |ringraz|auguri|lunari|calendario|bilanci|verbale|community|inizi.* cos)'
  then
    return 'vita-associativa';
  end if;

  return 'vita-associativa';
end
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_otp()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with d as (
    delete from public.auth_otp
    where (usato = true and usato_at < now() - interval '24 hours')
       or (usato = false and scade_at < now() - interval '1 hour')
    returning 1
  )
  select count(*)::int from d;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  delete from public.convenzioni_rate_limit where finestra < now() - interval '2 hours';
  get diagnostics n = row_count;
  return format('potate %s righe scadute', n);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.collega_domanda_account(p_domanda_id uuid, p_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.collega_tessera(p_codice text)
 RETURNS TABLE(esito text, messaggio text, numero_socio integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.conferma_ascolto(p_audio_id uuid)
 RETURNS TABLE(audio_id uuid, lemma_id uuid, lemma text, restanti bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_lemma uuid;
begin
  if v_uid is null or not has_ruolo_min(v_uid, 20) then
    raise exception 'Non autorizzato ad ascoltare la coda';
  end if;

  select a.lemma_id into v_lemma from archivio_audio a
   where a.id = p_audio_id and a.stato = 'in_attesa' and a.ascoltato_il is null;
  if v_lemma is null then
    raise exception 'Registrazione non in coda o gia lavorata';
  end if;

  -- Il file va gia' copiato sul bucket pubblico dal chiamante prima di
  -- arrivare qui (supabase.storage.copy); questa funzione registra il
  -- risultato, non lo esegue: una funzione SQL non puo' chiamare la
  -- Storage API.
  update archivio_audio
     set stato = 'pubblicato', ascoltato_da = v_uid, ascoltato_il = now(), updated_at = now(),
         bucket = 'glossario-audio'
   where id = p_audio_id;

  update dizionario_lemma
     set audio_id = p_audio_id, updated_at = now()
   where id = v_lemma;

  return query
    select p_audio_id, v_lemma, l.lemma,
           (select count(*) from archivio_audio x
             where x.stato='in_attesa' and x.ascoltato_il is null)
      from dizionario_lemma l where l.id = v_lemma;
end $function$
;

CREATE OR REPLACE FUNCTION public.config_app_chiavi_pubbliche()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array['gita_giochi_medievali_2026_stato', 'ddl_1539_stato']::text[];
$function$
;

CREATE OR REPLACE FUNCTION public.contante_consegnato(p_pagamento uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_ruolo_min(auth.uid(), 50) then
    raise exception 'non autorizzato';
  end if;
  update public.pagamenti_tesseramento
     set consegnato_tesoriere = true, consegnato_il = now()
   where id = p_pagamento and metodo = 'contanti';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.contanti_cerca_socio(p_query text)
 RETURNS TABLE(domanda_id uuid, numero_socio integer, nome text, cognome text, email text, data_nascita date, comune_nascita text, sesso text, quota_pagata boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_anno integer := extract(year from now())::int;
begin
  if not has_ruolo_min(auth.uid(), 50) then
    raise exception 'non autorizzato';
  end if;
  if length(v_query) < 2 then
    return;
  end if;

  return query
    select
      d.id, d.numero_socio, d.nome, d.cognome, d.email, d.data_nascita, d.comune_nascita, d.sesso,
      exists (
        select 1 from pagamenti_tesseramento p
        where p.domanda_id = d.id and p.tipo = 'quota' and p.anno = v_anno
          and p.stato = 'completato' and p.annullato_il is null
      ) as quota_pagata
    from domande_tesseramento d
    where d.stato = 'approvata'
      and (
        d.nome ilike '%'||v_query||'%'
        or coalesce(d.cognome,'') ilike '%'||v_query||'%'
        or d.email ilike '%'||v_query||'%'
        or (d.numero_socio is not null and d.numero_socio::text ilike '%'||v_query||'%')
      )
    order by quota_pagata asc, d.numero_socio asc nulls last
    limit 20;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.contanti_da_riconciliare()
 RETURNS TABLE(id uuid, anno integer, importo numeric, socio text, incassato_da_nome text, incassato_il date, giorni_in_sospeso integer, note_incasso text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_ruolo_min(auth.uid(), 50) then
    raise exception 'non autorizzato';
  end if;
  return query
    select v.id, v.anno, v.importo, v.socio, v.incassato_da_nome,
           v.incassato_il, v.giorni_in_sospeso, v.note_incasso
    from public.v_contanti_da_riconciliare v
    order by v.incassato_il asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.controlla_radar_eventi()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ultima timestamptz; v_giorni int; v_token text; v_req bigint; v_msg text;
begin
  select max(created_at) into v_ultima
    from eventi_esterni where fonte in ('comunweb','dati_trentino');

  v_giorni := coalesce(extract(day from now() - v_ultima)::int, 999);
  if v_giorni < 4 then
    return format('OK: ultima raccolta %s giorni fa (%s)', v_giorni, v_ultima);
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then return 'ALLARME NON INVIATO: ingest_token assente dal Vault.'; end if;

  v_msg := format(
    'Il Radar eventi non porta niente di nuovo da %s giorni. Ultima raccolta: %s. Controlla i lavori pg_cron radar-eventi-harvest e radar-eventi-classifica.',
    v_giorni, coalesce(v_ultima::text, 'mai'));

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object('Content-Type','application/json','X-Send-Email-Secret',
                 (select decrypted_secret from vault.decrypted_secrets where name='send_email_shared_secret')),
    body := jsonb_build_object(
      'to','info@elbrenz.eu',
      'subject','Radar eventi fermo da ' || v_giorni || ' giorni',
      'html','<p>' || v_msg || '</p>'),
    timeout_milliseconds := 20000);

  return format('ALLARME inviato (richiesta %s): %s', v_req, v_msg);
end $function$
;

CREATE OR REPLACE FUNCTION public.controllo_permessi_anon()
 RETURNS TABLE(tabella text, permesso text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Una scrittura anonima e' sempre un difetto: nessun flusso pubblico ne ha bisogno,
  -- passano tutti da una edge function con il service role.
  select g.table_name::text, g.privilege_type::text
  from information_schema.role_table_grants g
  where g.grantee = 'anon' and g.table_schema = 'public'
    and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    and has_ruolo_min(auth.uid(), 50)
  union all
  -- Una lettura non dichiarata non e' per forza un errore: e' una tabella nuova
  -- di cui nessuno ha ancora deciso se il pubblico debba vederla. Il controllo
  -- chiede la decisione, non la prende.
  select g.table_name::text, 'SELECT non dichiarata'
  from information_schema.role_table_grants g
  where g.grantee = 'anon' and g.table_schema = 'public'
    and g.privilege_type = 'SELECT'
    and not exists (select 1 from permesso_anon_lettura_attesa a where a.tabella = g.table_name)
    and has_ruolo_min(auth.uid(), 50)
  order by 2, 1;
$function$
;

CREATE OR REPLACE FUNCTION public.convenzione_in_mappa(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM convenzioni c
    WHERE c.id = p_id AND c.stato = 'attiva' AND c.mostra_in_mappa = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.convenzioni_rl_hit(p_ip_hash text, p_max integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c int;
begin
  insert into public.convenzioni_rate_limit (ip_hash, finestra, count)
  values (p_ip_hash, date_trunc('hour', now()), 1)
  on conflict (ip_hash, finestra) do update set count = convenzioni_rate_limit.count + 1
  returning count into c;
  return c <= p_max;
end $function$
;

CREATE OR REPLACE FUNCTION public.convocazione_termine(p_assemblea date, p_giorni_invio integer DEFAULT 1)
 RETURNS TABLE(assemblea_il date, termine_pervenire date, invio_entro date, giorni_di_margine integer, in_tempo boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select
    p_assemblea,
    (p_assemblea - interval '15 days')::date,
    ((p_assemblea - interval '15 days')::date - (greatest(p_giorni_invio, 1) - 1)),
    (((p_assemblea - interval '15 days')::date - (greatest(p_giorni_invio, 1) - 1)) - current_date)::int,
    (((p_assemblea - interval '15 days')::date - (greatest(p_giorni_invio, 1) - 1)) >= current_date);
$function$
;

CREATE OR REPLACE FUNCTION public.cruscotto_conta_domande()
 RETURNS TABLE(in_attesa integer, piu_vecchia timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Solo le domande davvero in lavorazione. 'annullata' e 'rifiutata' sono
  -- esiti finali: nessuno le sta aspettando.
  return query
  select count(*)::int, min(created_at)
  from domande_tesseramento
  where stato not in ('approvata','rifiutata','annullata');
end $function$
;

CREATE OR REPLACE FUNCTION public.cruscotto_conta_soci_regola()
 RETURNS TABLE(fatti integer, totale integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_ruolo_min((select auth.uid()), 50) then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select
    (select count(*)::integer from v_soci_in_regola v join domande_tesseramento d on d.id = v.domanda_id
      where v.anno = 2026 and v.quota_incassata and d.account_id is not null),
    (select count(*)::integer from v_soci_in_regola where anno = 2026 and quota_incassata);
end $function$
;

CREATE OR REPLACE FUNCTION public.cruscotto_funzioni()
 RETURNS TABLE(funzione text, chiamate_30gg bigint, ultima timestamp with time zone, ultimo_stato integer, giorni_fa numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_ruolo_min((select auth.uid()), 50) then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select 'Dato non disponibile da Postgres — vedi il Logs Explorer di Supabase'::text,
         0::bigint, null::timestamptz, null::integer, null::numeric;
end $function$
;

CREATE OR REPLACE FUNCTION public.cruscotto_lavori()
 RETURNS TABLE(lavoro text, pianificazione text, attivo boolean, ultima_esecuzione timestamp with time zone, esito text, ore_fa numeric, in_allarme boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select j.jobname::text,
         j.schedule::text,
         j.active,
         u.start_time,
         coalesce(u.status, 'mai eseguito')::text,
         round(extract(epoch from now() - u.start_time)/3600.0, 1),
         (u.start_time is null or u.status is distinct from 'succeeded' or u.start_time < now() - interval '8 days')
  from cron.job j
  left join lateral (
    select r.status, r.start_time from cron.job_run_details r
    where r.jobid = j.jobid order by r.start_time desc limit 1
  ) u on true
  where j.active
  order by j.jobname;
end $function$
;

CREATE OR REPLACE FUNCTION public.cruscotto_segna_controllo(p_controllo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := (select auth.uid()); v_valore jsonb;
begin
  if not has_ruolo_min(v_uid, 50) then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  if p_controllo is null or btrim(p_controllo) = '' then
    raise exception 'Nome del controllo mancante';
  end if;

  insert into config_app (chiave, valore, descrizione, categoria, aggiornato_da, updated_at)
  values ('cruscotto_controlli', jsonb_build_object(p_controllo, to_char(now(), 'YYYY-MM-DD')),
          'Date dell''ultima verifica umana dei controlli di sicurezza del cruscotto', 'sistema', v_uid, now())
  on conflict (chiave) do update
    set valore = config_app.valore || jsonb_build_object(p_controllo, to_char(now(), 'YYYY-MM-DD')),
        aggiornato_da = v_uid, updated_at = now()
  returning valore into v_valore;

  return v_valore;
end $function$
;

CREATE OR REPLACE FUNCTION public.cruscotto_servizi()
 RETURNS TABLE(servizio text, descrizione text, ultimo_battito timestamp with time zone, ultimo_esito text, ore_fa numeric, cadenza_massima_ore integer, in_allarme boolean, diagnosi text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_ruolo_min((select auth.uid()), 50) or (select auth.role()) = 'service_role') then
    raise exception 'Il cruscotto e riservato al direttivo';
  end if;
  return query
  select v.nome, v.descrizione, v.ultimo_battito, v.ultimo_esito, v.ore_fa,
         v.cadenza_massima_ore, v.in_allarme, v.diagnosi
  from v_servizi_stato v
  order by v.in_allarme desc, v.ore_fa desc nulls first, v.nome;
end $function$
;

CREATE OR REPLACE FUNCTION public.dizionario_slug_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.slug is null or trim(new.slug) = '' then
    -- Si riusa lo slugify del museo: una regola sola per tutto il sito. Il
    -- suffisso dall'id tiene distinti i lemmi con la stessa grafia in parlate
    -- diverse, che e' esattamente il caso delle varianti.
    new.slug := public.museo_gg_slugify(new.lemma, new.id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.donazione_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  admin boolean := public.has_ruolo_min(auth.uid(), 50);
  chi   text := case when auth.uid() is null
                     then 'La scrittura arriva da un canale senza sessione (service role, editor SQL o edge function): li'' auth.uid() e'' nullo e nessuno risulta amministratore, nemmeno il super admin. Usa la sessione di una persona, oppure il pannello.'
                     else 'Serve un ruolo di livello 50 o superiore.' end;
begin
  if tg_op = 'INSERT' then
    if not admin then
      new.stato := 'in_attesa';
      new.approvata_da := null; new.approvata_il := null;
      if new.diritti_dichiarati is not true then
        raise exception 'Serve la dichiarazione dei diritti per donare il materiale.';
      end if;
      if (select count(*) from public.donazione_materiale
            where donatore_id = new.donatore_id and created_at > now() - interval '1 day') >= 5 then
        raise exception 'Hai raggiunto il limite di donazioni per oggi. Riprova domani.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if not admin then
      if new.stato        is distinct from old.stato
      or new.approvata_da is distinct from old.approvata_da
      or new.approvata_il is distinct from old.approvata_il
      or new.note_interne is distinct from old.note_interne then
        raise exception
          'Non puoi cambiare lo stato, l''approvazione o le note interne di una donazione. %', chi
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.e_socio_in_regola(p_utente_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.domande_tesseramento d
      join public.v_soci_in_regola v on v.domanda_id = d.id
     where d.account_id = coalesce(p_utente_id, auth.uid())
       and d.stato = 'approvata'
       and v.anno = extract(year from now())::int
       and v.quota_incassata
  );
$function$
;

CREATE OR REPLACE FUNCTION public.email_residuo_giornaliero(p_tetto integer DEFAULT 100)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select greatest(0, p_tetto - (
    select count(*)::int from public.email_outbox
    where stato in ('pronta','in_invio','inviata')
      and created_at >= date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'
  ));
$function$
;

CREATE OR REPLACE FUNCTION public.eventi_esterni_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  direttivo boolean := public.has_ruolo_min(auth.uid(), 50);
begin
  new.updated_at := now();

  if new.stato = 'pubblicato' and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicato') then
    if not direttivo then
      raise exception 'La pubblicazione di un evento e'' riservata al direttivo.';
    end if;
    if tg_op = 'UPDATE' and old.stato <> 'approvato' then
      raise exception 'Un evento si pubblica solo dopo essere stato approvato.';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.stato = 'non_promuovibile'
     and new.stato in ('approvato', 'pubblicato') and not direttivo then
    raise exception 'Questo organizzatore e'' escluso: serve il direttivo per riammetterlo.';
  end if;

  if tg_op = 'UPDATE' and new.stato is distinct from old.stato and auth.uid() is not null then
    new.curato_da := auth.uid();
    new.curato_il := now();
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.eventi_esterni_slug_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  base text;
  tentativo text;
  i int := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  base := public.slugifica(new.titolo);
  if base = '' then
    base := 'evento';
  end if;
  tentativo := base;
  while exists (select 1 from public.eventi_esterni where slug = tentativo) loop
    i := i + 1;
    tentativo := base || '-' || i;
  end loop;
  new.slug := tentativo;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.gam_add(p_utente uuid, p_tipo text, p_punti integer, p_riftipo text, p_rifid text, p_idemp boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_utente is null then return; end if;
  if p_idemp and p_rifid is not null and exists (select 1 from public.punti_evento where utente_id=p_utente and tipo_azione=p_tipo and riferimento_id=p_rifid) then return; end if;
  insert into public.punti_evento(utente_id,tipo_azione,punti,riferimento_tipo,riferimento_id) values (p_utente,p_tipo,p_punti,p_riftipo,p_rifid);
end $function$
;

CREATE OR REPLACE FUNCTION public.gam_distintivo(p_utente uuid, p_codice text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare did int;
begin
  if p_utente is null then return; end if;
  select id into did from public.distintivo where codice=p_codice;
  if did is null then return; end if;
  insert into public.utente_distintivo(utente_id,distintivo_id) values (p_utente,did) on conflict do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.genera_otp(p_email text, p_scope text DEFAULT 'login'::text, p_ttl_min integer DEFAULT 10, p_max_tentativi integer DEFAULT 3, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(otp_id uuid, codice_chiaro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_codice text;
  v_hash text;
  v_id uuid;
begin
  update public.auth_otp
  set usato = true, usato_at = now()
  where email = p_email::citext and scope = p_scope and usato = false;

  -- Codice 6 cifre da fonte CRITTOGRAFICA (audit 14/7: era random()).
  v_codice := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');

  v_hash := extensions.crypt(v_codice, extensions.gen_salt('bf', 6));

  insert into public.auth_otp (email, codice_hash, scope, scade_at, max_tentativi, ip_request, user_agent)
  values (p_email::citext, v_hash, p_scope, now() + (p_ttl_min || ' minutes')::interval, p_max_tentativi, p_ip, p_user_agent)
  returning id into v_id;

  return query select v_id, v_codice;
end
$function$
;

CREATE OR REPLACE FUNCTION public.geocodifica_prenota_slot()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prossima timestamptz;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'curatore_contenuti')) then
    raise exception 'non autorizzato';
  end if;

  select prossima_disponibile into v_prossima from public.geocodifica_coda where id = true for update;
  v_prossima := greatest(v_prossima, now());
  update public.geocodifica_coda
     set prossima_disponibile = v_prossima + interval '1100 milliseconds'
   where id = true;

  return v_prossima;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_mia_tessera()
 RETURNS TABLE(numero_tessera integer, anno integer, scadenza date, codice_tessera text, stato text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.numero_tessera, d.anno, d.scadenza, d.codice_tessera, d.stato
  from public.domande_tesseramento d
  where lower(d.email) = lower(coalesce(
          nullif(auth.jwt() ->> 'email', ''),
          (select u.email from auth.users u where u.id = auth.uid())
        ))
    and d.stato = 'approvata'
  order by d.anno desc nulls last, d.numero_tessera asc
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_annulla_operazione(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_op public.glossario_operazione;
  v jsonb;
  v_rimessi integer := 0;
begin
  if not (
    public.has_ruolo_min(auth.uid(), 25)
    or public.has_ruolo(auth.uid(), 'curatore_linguistico')
  ) then
    raise exception 'Serve il ruolo di curatore.';
  end if;

  select * into v_op from public.glossario_operazione where id = p_id;
  if v_op.id is null then
    return jsonb_build_object('ok', false, 'messaggio', 'Operazione non trovata.');
  end if;
  if v_op.annullata_il is not null then
    return jsonb_build_object('ok', false, 'messaggio', 'Questa operazione era gia'' stata annullata.');
  end if;

  for v in select * from jsonb_array_elements(v_op.prima) loop
    if v_op.campo = 'comune' then
      update public.dizionario_lemma set comune = v ->> 'prima' where id = (v ->> 'id')::uuid;
    elsif v_op.campo = 'parlata' then
      update public.dizionario_lemma set parlata = v ->> 'prima' where id = (v ->> 'id')::uuid;
    elsif v_op.campo = 'categoria_gramm' then
      update public.dizionario_lemma set categoria_gramm = v ->> 'prima' where id = (v ->> 'id')::uuid;
    elsif v_op.campo = 'tipo' then
      update public.dizionario_lemma set tipo = v ->> 'prima' where id = (v ->> 'id')::uuid;
    elsif v_op.campo = 'stato' then
      update public.dizionario_lemma set stato = v ->> 'prima', validato_il = null
       where id = (v ->> 'id')::uuid;
    end if;
    v_rimessi := v_rimessi + 1;
  end loop;

  update public.glossario_operazione
     set annullata_il = now(), annullata_da = auth.uid()
   where id = p_id;

  return jsonb_build_object('ok', true, 'rimessi', v_rimessi);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_contributori_doppi()
 RETURNS TABLE(a_id uuid, a_nome text, a_email text, a_lemmi bigint, b_id uuid, b_nome text, b_email text, b_lemmi bigint, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with g as (
    select c.id, c.nome, c.email,
           (select count(*) from public.dizionario_lemma l where l.contributore_id = c.id) as lemmi,
           public.glossario_norm(c.nome) as nome_n,
           public.glossario_norm(split_part(c.email, '@', 1)) as local_n
    from public.guardiani_contributori c
  )
  select a.id, a.nome, a.email, a.lemmi,
         b.id, b.nome, b.email, b.lemmi,
         case when a.nome_n = b.nome_n then 'stesso nome' else 'indirizzo simile' end
  from g a join g b on a.id < b.id
  where (
    public.has_ruolo_min(auth.uid(), 25)
    or public.has_ruolo(auth.uid(), 'curatore_linguistico')
  )
  and a.email <> b.email
  and (
    (a.nome_n is not null and a.nome_n = b.nome_n)
    or extensions.similarity(a.local_n, b.local_n) >= 0.6
  );
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_correzione_blocco(p_ids uuid[], p_campo text, p_valore text, p_prova boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prima jsonb := '[]'::jsonb;
  v_esclusi jsonb := '[]'::jsonb;
  v_tocco uuid[] := array[]::uuid[];
  r record;
  v_op uuid;
  v_val text := nullif(btrim(coalesce(p_valore, '')), '');
begin
  if not (
    public.has_ruolo_min(auth.uid(), 25)
    or public.has_ruolo(auth.uid(), 'curatore_linguistico')
  ) then
    raise exception 'Serve il ruolo di curatore.';
  end if;
  if p_campo not in ('comune', 'parlata', 'categoria_gramm', 'tipo') then
    raise exception 'In blocco si cambiano solo paese, parlata, categoria grammaticale e tipo. Il resto e'' lavoro da scheda.';
  end if;
  if v_val is null then
    raise exception 'Serve un valore da assegnare.';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Nessun lemma selezionato.';
  end if;

  for r in
    select l.id, l.lemma, l.contributore_id,
           case p_campo
             when 'comune' then l.comune
             when 'parlata' then l.parlata
             when 'categoria_gramm' then l.categoria_gramm
             else l.tipo
           end as vecchio
    from public.dizionario_lemma l
    where l.id = any(p_ids)
    order by l.lemma
  loop
    if public.glossario_lemma_e_mio(r.contributore_id) then
      v_esclusi := v_esclusi || jsonb_build_object(
        'id', r.id, 'lemma', r.lemma, 'perche', 'l''hai proposto tu');
    elsif r.vecchio is not distinct from v_val then
      v_esclusi := v_esclusi || jsonb_build_object(
        'id', r.id, 'lemma', r.lemma, 'perche', 'ha gia'' questo valore');
    else
      v_prima := v_prima || jsonb_build_object('id', r.id, 'lemma', r.lemma, 'prima', r.vecchio);
      v_tocco := v_tocco || r.id;
    end if;
  end loop;

  if p_prova then
    return jsonb_build_object(
      'prova', true, 'campo', p_campo, 'valore', v_val,
      'quanti', coalesce(array_length(v_tocco, 1), 0),
      'quali', v_prima, 'esclusi', v_esclusi);
  end if;

  if coalesce(array_length(v_tocco, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'quanti', 0, 'esclusi', v_esclusi,
                              'messaggio', 'Non c''era niente da cambiare.');
  end if;

  if p_campo = 'comune' then
    update public.dizionario_lemma set comune = v_val where id = any(v_tocco);
  elsif p_campo = 'parlata' then
    update public.dizionario_lemma set parlata = v_val where id = any(v_tocco);
  elsif p_campo = 'categoria_gramm' then
    update public.dizionario_lemma set categoria_gramm = v_val where id = any(v_tocco);
  else
    update public.dizionario_lemma set tipo = v_val where id = any(v_tocco);
  end if;

  insert into public.glossario_operazione (tipo, campo, valore_nuovo, quanti, prima, esclusi, chi)
  values ('correzione_blocco', p_campo, v_val, coalesce(array_length(v_tocco, 1), 0),
          v_prima, v_esclusi, auth.uid())
  returning id into v_op;

  return jsonb_build_object('ok', true, 'operazione', v_op,
                            'quanti', coalesce(array_length(v_tocco, 1), 0),
                            'quali', v_prima, 'esclusi', v_esclusi);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_definizione_sufficiente(p_definizione text, p_esempio text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select length(coalesce(btrim(p_definizione), '')) >= 15
      or (length(coalesce(btrim(p_definizione), '')) >= 2
          and length(coalesce(btrim(p_esempio), '')) >= 5);
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_lemma_completo(p_definizione text, p_esempi text, p_comune text, p_categoria text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select public.glossario_definizione_sufficiente(p_definizione, p_esempi)
     and coalesce(btrim(p_esempi), '') <> ''
     and coalesce(btrim(p_comune), '') <> ''
     and coalesce(btrim(p_categoria), '') <> '';
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_lemma_e_mio(p_contributore_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.guardiani_contributori g
    join public.utente u on lower(u.email) = lower(g.email)
    where g.id = p_contributore_id
      and u.id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_miei_lemmi()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select l.id
  from public.dizionario_lemma l
  join public.guardiani_contributori g on g.id = l.contributore_id
  join public.utente u on lower(u.email) = lower(g.email)
  where u.id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(
        lower(translate(coalesce(p, ''),
          'àáâäãèéêëìíîïòóôöõùúûüçñÀÁÂÄÃÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑ',
          'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
        '^(il|lo|la|i|gli|le|un|uno|una|l|el)[ '']+', '', 'g'),
      '[^a-z0-9]+', ' ', 'g')),
    '');
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_pubblica_blocco(p_ids uuid[], p_prova boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ok jsonb := '[]'::jsonb;
  v_esclusi jsonb := '[]'::jsonb;
  v_tocco uuid[] := array[]::uuid[];
  r record;
  v_op uuid;
  v_manca text;
  v_chi text;
begin
  if not (
    public.has_ruolo_min(auth.uid(), 25)
    or public.has_ruolo(auth.uid(), 'curatore_linguistico')
  ) then
    raise exception 'Serve il ruolo di curatore.';
  end if;

  select coalesce(nullif(btrim(u.nome || ' ' || coalesce(u.cognome, '')), ''), u.email)
    into v_chi from public.utente u where u.id = auth.uid();

  for r in
    select l.* from public.dizionario_lemma l
    where l.id = any(p_ids) order by l.lemma
  loop
    v_manca := null;
    if r.stato = 'pubblicato' then
      v_manca := 'e'' gia'' pubblicato';
    elsif public.glossario_lemma_e_mio(r.contributore_id) then
      v_manca := 'l''hai proposto tu';
    elsif not public.glossario_definizione_sufficiente(r.definizione, r.esempi_uso)
          and coalesce(btrim(r.comune), '') = '' then
      v_manca := 'mancano la spiegazione (definizione estesa o esempio) e il paese';
    elsif not public.glossario_definizione_sufficiente(r.definizione, r.esempi_uso) then
      v_manca := 'manca la spiegazione: definizione estesa oppure esempio d''uso';
    elsif coalesce(btrim(r.comune), '') = '' then
      v_manca := 'manca il paese';
    end if;

    if v_manca is not null then
      v_esclusi := v_esclusi || jsonb_build_object('id', r.id, 'lemma', r.lemma, 'perche', v_manca);
    else
      v_ok := v_ok || jsonb_build_object('id', r.id, 'lemma', r.lemma, 'prima', r.stato);
      v_tocco := v_tocco || r.id;
    end if;
  end loop;

  if p_prova then
    return jsonb_build_object('prova', true, 'quanti', coalesce(array_length(v_tocco, 1), 0),
                              'quali', v_ok, 'esclusi', v_esclusi);
  end if;

  if coalesce(array_length(v_tocco, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'quanti', 0, 'esclusi', v_esclusi,
                              'messaggio', 'Nessuno dei selezionati era pubblicabile.');
  end if;

  update public.dizionario_lemma
     set stato = 'pubblicato',
         validato_da = coalesce(v_chi, 'Curatela glossario'),
         validato_il = now()
   where id = any(v_tocco);

  insert into public.glossario_operazione (tipo, campo, valore_nuovo, quanti, prima, esclusi, chi)
  values ('pubblicazione_blocco', 'stato', 'pubblicato',
          coalesce(array_length(v_tocco, 1), 0), v_ok, v_esclusi, auth.uid())
  returning id into v_op;

  return jsonb_build_object('ok', true, 'operazione', v_op,
                            'quanti', coalesce(array_length(v_tocco, 1), 0),
                            'quali', v_ok, 'esclusi', v_esclusi);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.glossario_punti(p_chiave text, p_default numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select (valore -> p_chiave)::text::numeric
       from public.config_app where chiave = 'glossario_punti'),
    p_default
  );
$function$
;

CREATE OR REPLACE FUNCTION public.guardiani_digest_da_inviare()
 RETURNS TABLE(inviare boolean, quanti integer, motivo text, ore_dall_ultimo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quanti int; v_nuovi int; v_ultimo timestamptz; v_ore numeric;
  v_soglia_ore numeric; v_soglia_quanti int; v_minimo numeric;
  v_promemoria numeric;
begin
  select count(*) into v_quanti from dizionario_lemma where stato = 'in_revisione';
  select max(inviato_il) into v_ultimo from guardiani_digest_invio;
  v_ore := extract(epoch from (now() - coalesce(v_ultimo, now() - interval '99 hours'))) / 3600.0;

  -- Quante ne sono arrivate DA QUANDO abbiamo parlato l'ultima volta. E' il
  -- numero che decide se c'e' qualcosa da dire; l'altro dice solo quanto lavoro
  -- resta.
  select count(*) into v_nuovi
  from dizionario_lemma
  where stato = 'in_revisione'
    and created_at > coalesce(v_ultimo, now() - interval '99 hours');

  select (valore#>>'{}')::numeric into v_soglia_ore    from config_app where chiave='guardiani_digest_ore';
  select (valore#>>'{}')::int     into v_soglia_quanti from config_app where chiave='guardiani_digest_quanti';
  select (valore#>>'{}')::numeric into v_minimo        from config_app where chiave='guardiani_digest_minimo_ore';
  select (valore#>>'{}')::numeric into v_promemoria    from config_app where chiave='guardiani_digest_promemoria_ore';
  v_soglia_ore := coalesce(v_soglia_ore, 6);
  v_soglia_quanti := coalesce(v_soglia_quanti, 10);
  v_minimo := coalesce(v_minimo, 2);
  v_promemoria := coalesce(v_promemoria, 24);

  if v_quanti = 0 then
    return query select false, v_quanti, 'coda vuota'::text, v_ore; return;
  end if;
  -- Il tetto vince su tutto, anche sulla quantita: due riepiloghi a venti minuti
  -- di distanza sono rumore, per quanti lemmi siano arrivati.
  if v_ore < v_minimo then
    return query select false, v_quanti, 'troppo presto'::text, v_ore; return;
  end if;

  -- Una raffica di arrivi merita un riepilogo subito.
  if v_nuovi >= v_soglia_quanti then
    return query select true, v_quanti, 'quantita'::text, v_ore; return;
  end if;
  -- Passate le ore, si parla solo se e' arrivato qualcosa.
  if v_ore >= v_soglia_ore and v_nuovi > 0 then
    return query select true, v_quanti, 'ore'::text, v_ore; return;
  end if;
  -- Una coda ferma da un giorno intero merita un richiamo, e uno solo.
  if v_ore >= v_promemoria then
    return query select true, v_quanti, 'coda ferma'::text, v_ore; return;
  end if;

  return query select false, v_quanti,
    case when v_nuovi = 0 then 'niente di nuovo' else 'in attesa' end, v_ore;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_ruolo(p_utente_id uuid, p_ruolo_nome text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.utente_ruolo ur
    JOIN public.ruolo r ON r.id = ur.ruolo_id
    WHERE ur.utente_id = p_utente_id AND r.nome = p_ruolo_nome
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_ruolo(p_ruolo_nome text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_ruolo(auth.uid(), p_ruolo_nome);
$function$
;

CREATE OR REPLACE FUNCTION public.has_ruolo_min(p_utente_id uuid, p_livello_min integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.utente_ruolo ur
    JOIN public.ruolo r ON r.id = ur.ruolo_id
    WHERE ur.utente_id = p_utente_id AND r.livello >= p_livello_min
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_ruolo_min(p_livello_min integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_ruolo_min(auth.uid(), p_livello_min);
$function$
;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions'
AS $function$ select extensions.unaccent($1) $function$
;

CREATE OR REPLACE FUNCTION public.invia_comunicazione_direttivo(p_titolo text, p_corpo text, p_url text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if not has_ruolo_min(auth.uid(), 50) then
    raise exception 'Solo il direttivo puo inviare comunicazioni';
  end if;
  insert into notifica(utente_id, tipo, titolo, corpo, url)
  select u.id, 'direttivo', p_titolo, p_corpo, coalesce(p_url,'/comunicazioni')
  from utente u where has_ruolo_min(u.id,10);
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.invio_da_concludere_entro(p_assemblea date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p_assemblea is null then null
    else p_assemblea - interval '15 days' end::date;
$function$
;

CREATE OR REPLACE FUNCTION public.lancia_coda_ascolto_promemoria(p_esegui boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text; v_req bigint;
  v_n int; v_secondi int; v_piu_vecchia timestamptz;
begin
  select count(*), coalesce(sum(durata_secondi), 0), min(created_at)
    into v_n, v_secondi, v_piu_vecchia
  from v_coda_ascolto;

  if v_n = 0 or v_piu_vecchia is null or v_piu_vecchia > now() - interval '7 days' then
    return format('SOSPESO: coda vuota o non ferma da 7 giorni (n=%s, piu_vecchia=%s)', v_n, v_piu_vecchia);
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun promemoria inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/coda-ascolto-promemoria'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return format('richiesta %s inviata (n=%s, secondi=%s, piu_vecchia=%s)', v_req, v_n, v_secondi, v_piu_vecchia);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lancia_cruscotto_digest(p_esegui boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_token text; v_req bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun promemoria inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/cruscotto-digest'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return format('richiesta %s inviata', v_req);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lancia_guardiani_digest(p_esegui boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_token text; v_req bigint; d record;
begin
  select * into d from guardiani_digest_da_inviare();
  if not d.inviare then
    return format('non invio: %s (in coda %s, ore dall ultimo %s)',
                  d.motivo, d.quanti, round(d.ore_dall_ultimo, 1));
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e nel Vault. Nessun riepilogo inviato.';
  end if;

  if not p_esegui then
    return format('giro a vuoto: avrei inviato per %s, %s lemmi in coda', d.motivo, d.quanti);
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/guardiani-digest?esegui=1&tutti=1',
    headers := jsonb_build_object('Content-Type','application/json','x-ingest-token', v_token),
    body := '{}'::jsonb, timeout_milliseconds := 20000);

  insert into guardiani_digest_invio (quanti, motivo) values (d.quanti, d.motivo);
  return format('inviato per %s: %s lemmi (richiesta %s)', d.motivo, d.quanti, v_req);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lancia_radar_classifica(p_esegui boolean DEFAULT true, p_digest boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_token text; v_req bigint; v_url text; v_grezzi int;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then return 'SOSPESO: ingest_token assente dal Vault.'; end if;

  if not p_digest then
    select count(*) into v_grezzi from eventi_esterni where stato = 'grezzo';
    if v_grezzi = 0 then return 'NIENTE DA FARE: nessun evento in stato grezzo.'; end if;
  end if;

  v_url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/radar-eventi-classifica';
  if p_digest then v_url := v_url || '?digest=1' || case when p_esegui then '' else '&dryrun=1' end;
  elsif not p_esegui then v_url := v_url || '?dryrun=1';
  end if;

  v_req := net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  return format('richiesta %s inviata (grezzi in coda: %s)', v_req, coalesce(v_grezzi::text,'n/d'));
end $function$
;

CREATE OR REPLACE FUNCTION public.lancia_radar_eventi(p_esegui boolean DEFAULT true, p_solo text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text; v_req bigint; v_url text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessuna raccolta avviata.';
  end if;

  v_url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/radar-eventi-harvest';
  if not p_esegui then
    v_url := v_url || '?dryrun=1';
    if p_solo is not null then v_url := v_url || '&solo=' || p_solo; end if;
  elsif p_solo is not null then
    v_url := v_url || '?solo=' || p_solo;
  end if;

  v_req := net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  return format('richiesta %s inviata a %s', v_req, v_url);
end $function$
;

CREATE OR REPLACE FUNCTION public.lancia_solleciti_quota(p_esegui boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text;
  v_req bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'ingest_token';

  -- Meglio un lavoro che sta fermo spiegando perche' di uno che parte a meta'.
  if v_token is null then
    return 'SOSPESO: il segreto ingest_token non e'' nel Vault. Nessun promemoria inviato.';
  end if;

  v_req := net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/solleciti-quota'
           || case when p_esegui then '?esegui=1' else '' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );

  return case when p_esegui
    then format('INVIO VERO: richiesta %s inviata a solleciti-quota con esegui=1', v_req)
    else format('giro a vuoto: richiesta %s inviata a solleciti-quota senza esegui. Nessuna email, nessuna riga scritta. Per spedire davvero: lancia_solleciti_quota(p_esegui => true)', v_req)
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.livello_utente(u uuid)
 RETURNS TABLE(utente_id uuid, punti_totali bigint, livello_codice text, livello_nome text, livello_ordine integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with vis as (select mostra_livello from public.utente where id=u),
  tot as (select coalesce(sum(punti),0)::bigint as p from public.punti_evento where utente_id=u)
  select u, (select p from tot), l.codice, l.nome, l.ordine
  from public.livello l
  where (select mostra_livello from vis) is true and l.soglia_punti <= (select p from tot)
  order by l.soglia_punti desc limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.luoghi_solo_direttivo_pubblica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.stato = 'pubblicato'
     and coalesce(old.stato,'') <> 'pubblicato'
     and auth.uid() is not null
     and not has_ruolo_min(auth.uid(), 50) then
    raise exception 'Solo il direttivo puo pubblicare un luogo sulla mappa. La scheda resta in bozza.';
  end if;
  if new.stato = 'pubblicato' and coalesce(old.stato,'') <> 'pubblicato' then
    new.pubblicato_il := now();
    new.pubblicato_da := coalesce(new.pubblicato_da, auth.uid());
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.luogo_e_pubblico(p_luogo uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.luoghi_interesse l where l.id = p_luogo and l.stato = 'pubblicato');
$function$
;

CREATE OR REPLACE FUNCTION public.match_kb_fulltext(q text, match_count integer DEFAULT 6)
 RETURNS TABLE(id uuid, sorgente_id uuid, titolo_sorgente text, titolo_sezione text, pagina integer, contenuto text, rank real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    k.id,
    k.sorgente_id,
    s.titolo as titolo_sorgente,
    k.titolo_sezione,
    k.pagina,
    k.contenuto,
    ts_rank(
      to_tsvector('italian', coalesce(k.titolo_sezione,'') || ' ' || k.contenuto),
      plainto_tsquery('italian', q)
    ) as rank
  from public.andreas_kb k
  join public.andreas_kb_sorgente s on s.id = k.sorgente_id
  where to_tsvector('italian', coalesce(k.titolo_sezione,'') || ' ' || k.contenuto)
        @@ plainto_tsquery('italian', q)
  order by rank desc
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_kb_fulltext(q text, match_count integer DEFAULT 6, solo_pubblici boolean DEFAULT false)
 RETURNS TABLE(id uuid, sorgente_id uuid, titolo_sorgente text, titolo_sezione text, pagina integer, contenuto text, rank real, visibile_ospiti boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    k.id,
    k.sorgente_id,
    s.titolo as titolo_sorgente,
    k.titolo_sezione,
    k.pagina,
    k.contenuto,
    ts_rank(
      to_tsvector('italian', coalesce(k.titolo_sezione,'') || ' ' || k.contenuto),
      plainto_tsquery('italian', q)
    ) as rank,
    s.visibile_ospiti
  FROM public.andreas_kb k
  JOIN public.andreas_kb_sorgente s ON s.id = k.sorgente_id
  WHERE to_tsvector('italian', coalesce(k.titolo_sezione,'') || ' ' || k.contenuto)
        @@ plainto_tsquery('italian', q)
    AND (solo_pubblici = false OR s.visibile_ospiti = true)
  ORDER BY rank DESC
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_kb_semantic(query_embedding vector, match_count integer DEFAULT 6, min_similarity numeric DEFAULT 0.3)
 RETURNS TABLE(id uuid, sorgente_id uuid, titolo_sorgente text, titolo_sezione text, pagina integer, contenuto text, similarity numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    k.id,
    k.sorgente_id,
    s.titolo as titolo_sorgente,
    k.titolo_sezione,
    k.pagina,
    k.contenuto,
    (1 - (k.embedding <=> query_embedding))::numeric as similarity
  from public.andreas_kb k
  join public.andreas_kb_sorgente s on s.id = k.sorgente_id
  where k.embedding is not null
    and (1 - (k.embedding <=> query_embedding)) > min_similarity
  order by k.embedding <=> query_embedding
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_kb_semantic(query_embedding vector, match_count integer DEFAULT 6, min_similarity numeric DEFAULT 0.3, solo_pubblici boolean DEFAULT false)
 RETURNS TABLE(id uuid, sorgente_id uuid, titolo_sorgente text, titolo_sezione text, pagina integer, contenuto text, similarity numeric, visibile_ospiti boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    k.id,
    k.sorgente_id,
    s.titolo as titolo_sorgente,
    k.titolo_sezione,
    k.pagina,
    k.contenuto,
    (1 - (k.embedding <=> query_embedding))::numeric as similarity,
    s.visibile_ospiti
  FROM public.andreas_kb k
  JOIN public.andreas_kb_sorgente s ON s.id = k.sorgente_id
  WHERE k.embedding IS NOT NULL
    AND (1 - (k.embedding <=> query_embedding)) > min_similarity
    AND (solo_pubblici = false OR s.visibile_ospiti = true)
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.memoria_fondo_bozza_lettura(p_slug text)
 RETURNS TABLE(id uuid, slug text, titolo text, sottotitolo text, tipo text, comune text, valle text, lat double precision, lng double precision, anno_da integer, anno_a integer, descrizione text, archivio text, segnatura text, ricercatore text, ricercatore_note text, licenza_immagini text, planimetria_url text, planimetria_geo jsonb, posti_censiti integer, stato text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.id, f.slug, f.titolo, f.sottotitolo, f.tipo, f.comune, f.valle, f.lat, f.lng,
         f.anno_da, f.anno_a, f.descrizione, f.archivio, f.segnatura, f.ricercatore,
         f.ricercatore_note, f.licenza_immagini, f.planimetria_url, f.planimetria_geo,
         f.posti_censiti, f.stato
  from public.memoria_fondo f
  where f.slug = p_slug;
$function$
;

CREATE OR REPLACE FUNCTION public.memoria_fondo_pubblico(p_fondo uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.memoria_fondo f where f.id = p_fondo and f.stato = 'pubblicato');
$function$
;

CREATE OR REPLACE FUNCTION public.memoria_persone_bozza_lettura(p_fondo_slug text)
 RETURNS TABLE(id uuid, fondo_id uuid, settore text, numero integer, nome_completo text, grado text, reparto text, data_morte_testo text, data_morte date, anno_nascita integer, luogo_nascita text, regione_nascita text, prigioniero_guerra boolean, ignoto boolean, note text, slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.fondo_id, p.settore, p.numero, p.nome_completo, p.grado, p.reparto,
         p.data_morte_testo, p.data_morte, p.anno_nascita, p.luogo_nascita, p.regione_nascita,
         p.prigioniero_guerra, p.ignoto, p.note, p.slug
  from public.memoria_persona p
  join public.memoria_fondo f on f.id = p.fondo_id
  where f.slug = p_fondo_slug;
$function$
;

CREATE OR REPLACE FUNCTION public.museo_gg_guardia_pubblicazione()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  -- Chi ha titolo a curare il Museo: il direttivo, oppure il curatore incaricato.
  puo_curare boolean := public.has_ruolo_min(auth.uid(), 50)
                        or public.has_ruolo(auth.uid(), 'curatore_museo_gg');
begin
  new.updated_at := now();

  if not puo_curare then
    if new.stato is distinct from 'in_attesa' then new.stato := 'in_attesa'; end if;
    new.validato_da := null;
    new.validato_il := null;
  end if;

  if new.stato = 'pubblicato' then
    if coalesce(btrim(new.fonte), '') = '' then
      raise exception 'Impossibile pubblicare: la fonte/provenienza e'' obbligatoria (cartellino).';
    end if;
    if new.immagini_urls is null or array_length(new.immagini_urls, 1) is null then
      raise exception 'Impossibile pubblicare: serve almeno un''immagine.';
    end if;
    if new.consenso_dichiarato is not true then
      raise exception 'Impossibile pubblicare: manca la dichiarazione di consenso.';
    end if;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.museo_gg_raccolta_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  puo_curare boolean := public.has_ruolo_min(auth.uid(), 50)
                        or public.has_ruolo(auth.uid(), 'curatore_museo_gg');
begin
  new.updated_at := now();
  if not puo_curare and new.stato is distinct from 'bozza' then
    new.stato := 'bozza';
  end if;
  if new.stato = 'pubblicata' then
    if coalesce(btrim(new.introduzione), '') = '' then
      raise exception 'Impossibile pubblicare: la raccolta ha bisogno di un''introduzione.';
    end if;
    if not exists (select 1 from museo_gg_raccolta_pezzo rp where rp.raccolta_id = new.id) then
      raise exception 'Impossibile pubblicare: la raccolta non contiene nessun pezzo.';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.museo_gg_raccolta_slug_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.slug is null or trim(new.slug) = '' then
    new.slug := public.museo_gg_slugify(new.titolo, new.id);
  end if;
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.museo_gg_slug_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.slug is null or trim(new.slug) = '' then
    new.slug := public.museo_gg_slugify(new.titolo, new.id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.museo_gg_slugify(p_titolo text, p_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(nullif(trim(p_titolo), ''), 'pezzo'),
                    'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', '-', 'g'
  )) || '-' || left(replace(p_id::text, '-', ''), 6);
$function$
;

CREATE OR REPLACE FUNCTION public.next_codice_pratica()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  a int := extract(year from now())::int;
  prog int;
BEGIN
  INSERT INTO contatti_progressivo (anno, n) VALUES (a, 1)
  ON CONFLICT (anno) DO UPDATE SET n = contatti_progressivo.n + 1
  RETURNING n INTO prog;
  RETURN format('EB-%s-%s', a, lpad(prog::text, 3, '0'));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_articolo_pubblicato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_broadcast(p_tipo text, p_titolo text, p_corpo text, p_url text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_evento_pubblicato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_lemma_pubblicato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.stato = 'pubblicato'
     and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicato') then
    perform notifica_broadcast(
      'glossario',
      'Una parola nuova nel glossario',
      new.lemma || coalesce(' · ' || nullif(btrim(new.definizione), ''), ''),
      'https://elbrenz.eu/guardiani-de-la-lenga#lemma-' || new.id::text
    );
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_lemmi_pubblicati()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n integer; v_primo uuid; v_elenco text; v_titolo text; v_corpo text;
begin
  if tg_op = 'INSERT' then
    select count(*), min(id::text)::uuid,
           string_agg(lemma, ', ' order by lemma)
      into v_n, v_primo, v_elenco
    from (select id, lemma from nuovi where stato = 'pubblicato' order by lemma limit 6) s;
    select count(*) into v_n from nuovi where stato = 'pubblicato';
    select id into v_primo from nuovi where stato = 'pubblicato' limit 1;
  else
    select count(*) into v_n
    from nuovi n join vecchi v on v.id = n.id
    where n.stato = 'pubblicato' and v.stato is distinct from 'pubblicato';

    select n.id into v_primo
    from nuovi n join vecchi v on v.id = n.id
    where n.stato = 'pubblicato' and v.stato is distinct from 'pubblicato'
    limit 1;

    select string_agg(lemma, ', ' order by lemma) into v_elenco from (
      select n.lemma from nuovi n join vecchi v on v.id = n.id
      where n.stato = 'pubblicato' and v.stato is distinct from 'pubblicato'
      order by n.lemma limit 6
    ) s;
  end if;

  if coalesce(v_n, 0) = 0 then return null; end if;

  if v_n = 1 then
    v_titolo := 'Una parola nuova nel glossario';
    v_corpo  := v_elenco;
  else
    v_titolo := v_n || ' parole nuove nel glossario';
    v_corpo  := v_elenco || case when v_n > 6 then ' e altre ' || (v_n - 6) else '' end;
  end if;

  -- L'ancora del primo lemma fa da chiave di idempotenza: il glossario vive
  -- tutto in una pagina, e senza ancora la seconda pubblicazione verrebbe
  -- scartata come doppione della prima.
  perform notifica_broadcast(
    'glossario', v_titolo, v_corpo,
    'https://elbrenz.eu/guardiani-de-la-lenga#lemma-' || v_primo::text
  );
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_museo_pubblicato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_push_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform net.http_post(
    url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/invia-push',
    body := jsonb_build_object('type', 'INSERT', 'table', 'notifica', 'record', to_jsonb(NEW)),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhY2tuaWh2ZGp4bHRpcXZ4dHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjI1NjEsImV4cCI6MjA5MjI5ODU2MX0.ScOp5xQ7Qma1NBGh6satfja7AsoGHC67G-V_NlHdMoc'
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notifica_raccolta_pubblicata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.stato = 'pubblicata'
     and (tg_op = 'INSERT' or old.stato is distinct from 'pubblicata')
     and new.slug is not null then
    perform notifica_broadcast(
      'museo',
      'Una raccolta nuova nel Museo',
      new.titolo,
      'https://elbrenz.eu/non-e-sole-grande-guerra/raccolte/' || new.slug
    );
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ocr_oggetto_pubblico(p_tipo text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case p_tipo
    when 'museo_pezzo' then exists (
      select 1 from public.museo_gg_pezzo p where p.id = p_id and p.stato = 'pubblicato')
    when 'storia' then exists (
      select 1 from public.storia s where s.id = p_id and s.pubblica is true)
    else false
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.peso_ruolo(p_utente_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(max(r.livello), 0)
  from public.utente_ruolo ur
  join public.ruolo r on r.id = ur.ruolo_id
  where ur.utente_id = coalesce(p_utente_id, auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.plancia_avvisi()
 RETURNS TABLE(chiave text, etichetta text, gruppo text, quanti integer, giorni integer, livello text, destinazione text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ritardo int; v_pag int;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;

  select coalesce((c.valore#>>'{}')::int, 3) into v_ritardo
    from config_app c where c.chiave = 'plancia_giorni_ritardo';
  select coalesce((c.valore#>>'{}')::int, 7) into v_pag
    from config_app c where c.chiave = 'plancia_giorni_pagamento';
  v_ritardo := coalesce(v_ritardo, 3); v_pag := coalesce(v_pag, 7);

  return query
  with code as (
    select 'lemmi'::text k, 'Lemmi da validare'::text e, 'curatela'::text g,
           count(*)::int n, coalesce(max(extract(day from now()-created_at))::int,0) d,
           'https://elbrenz.eu/glossario-console'::text u
      from dizionario_lemma where stato='in_revisione'
    union all
    select 'voci_lemma', 'Voci da approvare sotto le parole', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0),
           'https://elbrenz.eu/guardiani-correzioni'
      from lemma_commento where stato = 'in_attesa'
    union all
    select 'correzioni', 'Correzioni proposte sui lemmi', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0),
           'https://elbrenz.eu/guardiani-correzioni'
      from lemma_correzione where stato = 'nuova'
    union all
    select 'eventi', 'Eventi da curare', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0),
           'https://elbrenz.eu/radar-eventi'
      from eventi_esterni where stato in ('proposto','da_valutare','in_attesa')
    union all
    select 'storie', 'Storie da promuovere', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/storie'
      from storia where stato='pubblicata' and coalesce(pubblica,false)=false
    union all
    select 'museo_proposte', 'Proposte per il Museo', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/museo-curatela'
      from museo_gg_proposta where stato='nuova'
    union all
    select 'donazioni', 'Donazioni di materiale', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/museo-curatela'
      from donazione_materiale where stato='in_attesa'
    union all
    select 'domande', 'Domande di tesseramento', 'soci', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/amministrazione'
      from domande_tesseramento where stato='in_attesa'
    union all
    select 'convenzioni', 'Proposte di convenzione', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0),
           'https://elbrenz.eu/convenzioni-curatela'
      from convenzioni where stato='proposta'
    union all
    select 'pagamenti_verifica', 'Pagamenti da riscontrare', 'denaro', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/amministrazione'
      from pagamenti_tesseramento where stato='in_verifica' and annullato_il is null
    union all
    select 'senza_incasso', 'Soci ammessi senza incasso', 'denaro',
           (select count(*)::int from v_soci_in_regola where posizione='ammesso_senza_incasso'),
           0, '/app/amministrazione'
    union all
    select 'contanti_non_consegnati', 'Contanti non consegnati al tesoriere', 'denaro',
           count(*)::int, coalesce(max(extract(day from now()-incassato_il))::int,0), '/app/contanti'
      from pagamenti_tesseramento
      where metodo='contanti' and stato='completato' and annullato_il is null
        and coalesce(consegnato_tesoriere,false)=false
    union all
    select 'email_ferme', 'Email in errore, mai partite', 'rotto', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/amministrazione'
      from email_outbox where stato = 'errore'
    union all
    select 'email_bozze', 'Email pronte, in attesa di autorizzazione', 'curatela', count(*)::int,
           coalesce(max(extract(day from now()-created_at))::int,0), '/app/amministrazione'
      from email_outbox where stato = 'bozza'
    union all
    select 'push_fallite', 'Notifiche non consegnate', 'rotto', count(*)::int,
           coalesce(max(extract(day from now()-quando))::int,0), '/app/notifiche'
      from notifica_consegna where esito='fallita' and quando > now() - interval '14 days'
  )
  select c.k, c.e, c.g, c.n, c.d,
         case
           when c.g = 'rotto' then 'rotto'
           when c.k = 'pagamenti_verifica' and c.d >= v_pag then 'in_ritardo'
           when c.g <> 'denaro' and c.d >= v_ritardo then 'in_ritardo'
           else 'da_fare'
         end,
         c.u
  from code c
  where c.n > 0
  order by case when c.g='rotto' then 0 when c.d >= v_ritardo then 1 else 2 end, c.d desc, c.n desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.plancia_integrita()
 RETURNS TABLE(chiave text, etichetta text, quanti integer, dettaglio text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;

  -- 0) LE PAGINE PUBBLICHE CHE NON RISPONDONO. In cima perche' e' l'unica voce
  -- che riguarda cio' che vedono gli altri: le altre sono disordine interno,
  -- questa e' una porta chiusa in faccia a chi arriva dal motore di ricerca.
  return query
  select 'pagine_rotte'::text, 'Pagine pubbliche che non rispondono'::text,
         count(*)::int,
         coalesce(string_agg(
           r.cosa || ' · ' || coalesce(r.status_code::text, 'nessuna risposta') || ' · ' || r.url,
           '; '), '')
  from v_sentinella_rotte r
  having count(*) > 0;

  -- 1) Permessi di scrittura riaperti al ruolo anonimo.
  return query
  select 'permessi_anon'::text, 'Permessi di scrittura aperti al pubblico'::text,
         count(*)::int,
         coalesce(string_agg(g.table_name || ' (' || g.privilege_type || ')', ', '), '')
  from information_schema.role_table_grants g
  where g.grantee='anon' and g.table_schema='public'
    and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  having count(*) > 0;

  -- 2) Soci con numero duplicato: in un libro sociale il numero e' l'identita'.
  return query
  select 'numeri_socio_doppi', 'Numeri di socio duplicati', count(*)::int,
         coalesce(string_agg(x.numero_socio::text, ', '), '')
  from (select numero_socio from domande_tesseramento
         where numero_socio is not null group by numero_socio having count(*) > 1) x
  having count(*) > 0;

  -- 3) Schede del museo che citano immagini non presenti nell'archivio.
  return query
  select 'immagini_mancanti', 'Pezzi del museo con immagini assenti', count(*)::int,
         coalesce(string_agg(p.titolo, '; '), '')
  from museo_gg_pezzo p
  where p.stato = 'pubblicato'
    and exists (
      select 1 from unnest(p.immagini_urls) u
      where u like '%/assets-pubblici/%'
        and not exists (
          select 1 from storage.objects o
          where o.bucket_id = 'assets-pubblici'
            and u like '%' || o.name)
    )
  having count(*) > 0;

  -- 4) Lemmi pubblicati senza contributore: si perde chi ringraziare.
  return query
  select 'lemmi_orfani', 'Lemmi senza contributore', count(*)::int, ''
  from dizionario_lemma
  where stato='pubblicato' and contributore_id is null
  having count(*) > 0;

  -- 5) Pagamenti scollegati da una domanda: un euro senza una persona.
  return query
  select 'pagamenti_orfani', 'Pagamenti senza domanda collegata', count(*)::int, ''
  from pagamenti_tesseramento
  where domanda_id is null and annullato_il is null and stato='completato'
  having count(*) > 0;

  -- 7) La stessa persona con due account.
  return query
  select 'account_doppi', 'Persone con due account', count(*)::int,
         coalesce(string_agg(x.chi, '; '), '')
  from (select trim(coalesce(u.nome,'')||' '||coalesce(u.cognome,'')) as chi
          from utente u
         where coalesce(trim(u.nome),'') <> ''
         group by 1 having count(*) > 1) x
  having count(*) > 0;

  -- 6) Tabelle leggibili dal pubblico su cui nessuno ha deciso niente.
  return query
  select 'letture_anon_nuove', 'Tabelle leggibili dal pubblico non dichiarate', count(*)::int,
         coalesce(string_agg(g.table_name, ', '), '')
  from information_schema.role_table_grants g
  where g.grantee='anon' and g.table_schema='public' and g.privilege_type='SELECT'
    and not exists (select 1 from permesso_anon_lettura_attesa a where a.tabella = g.table_name)
  having count(*) > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.plancia_numeri()
 RETURNS TABLE(gruppo text, voce text, valore text, dettaglio text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_anno int := extract(year from now())::int;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;

  -- ---- SOCI ----------------------------------------------------------------
  return query
  select 'Soci'::text, 'Compagine sociale',
         (select count(*)::text from v_associati_istituzionale),
         format('%s entrati negli ultimi 30 giorni',
                (select count(*) from domande_tesseramento d
                  where d.stato='approvata' and d.numero_socio is not null
                    and d.approvata_il > now() - interval '30 days'));

  return query
  select 'Soci', 'In regola',
         (select count(*)::text from v_soci_in_regola where posizione in ('in_regola','in_regola_per_deroga')),
         'quota versata o in deroga';

  return query
  select 'Soci', 'Posizione parziale',
         (select count(*)::text from v_soci_in_regola where posizione='parziale'),
         'hanno versato una parte';

  return query
  select 'Soci', 'Da regolarizzare',
         (select count(*)::text from v_soci_in_regola where posizione='da_regolarizzare'),
         'sono i soci del registro cartaceo: NON sono morosi, manca solo il versamento a sistema';

  return query
  select 'Soci', 'Ammessi senza incasso',
         (select count(*)::text from v_soci_in_regola where posizione='ammesso_senza_incasso'),
         'approvati ma senza nessun pagamento registrato';

  -- ---- DENARO --------------------------------------------------------------
  -- Letto da v_incassi, che unisce le fonti senza duplicare righe: quote e
  -- integrazioni da pagamenti_tesseramento, anticipi dalle iscrizioni gita.
  -- Ogni euro ha una sola casa, e questa vista e' la casa comune.
  return query
  select 'Denaro', format('Quote e integrazioni %s', v_anno),
         (select coalesce(sum(importo), 0)::text || ' euro' from v_incassi
           where anno = v_anno and stato='completato' and tipo in ('quota','integrazione')),
         (select format('%s versamenti', count(*)) from v_incassi
           where anno = v_anno and stato='completato' and tipo in ('quota','integrazione'));

  return query
  select 'Denaro', format('Anticipi gita %s', v_anno),
         (select coalesce(sum(importo), 0)::text || ' euro' from v_incassi
           where anno = v_anno and stato='completato' and tipo='anticipo_gita'),
         (select format('%s iscrizioni', count(*)) from v_incassi
           where anno = v_anno and stato='completato' and tipo='anticipo_gita');

  return query
  select 'Denaro', 'Contanti da consegnare',
         (select coalesce(sum(importo), 0)::text || ' euro' from pagamenti_tesseramento
           where metodo='contanti' and stato='completato' and annullato_il is null
             and coalesce(consegnato_tesoriere,false)=false),
         'raccolti a mano e non ancora passati al tesoriere';

  -- Cio' che non c'e': si dichiara.
  return query
  select 'Denaro', 'Uscite e saldi', 'non ancora tracciati',
         'La prima nota non esiste ancora: uscite, saldo di cassa e saldo di conto non sono calcolabili. Il saldo al 31/12/2025 era 512,70 euro.';

  -- ---- CONTENUTI -----------------------------------------------------------
  -- Per ciascuno QUANDO E' STATO PUBBLICATO L'ULTIMO: un archivio che non cresce
  -- da tre settimane e' un'informazione, e il totale da solo non la dice.
  return query
  select 'Contenuti', 'Articoli', (select count(*)::text from articolo where stato='pubblicato'),
         (select coalesce('ultimo il ' || to_char(max(pubblicato_at), 'DD/MM/YYYY'), 'nessuno')
            from articolo where stato='pubblicato');

  return query
  select 'Contenuti', 'Lemmi del glossario', (select count(*)::text from dizionario_lemma where stato='pubblicato'),
         (select string_agg(parlata || ': ' || n, ' · ' order by n desc)
            from (select parlata, count(*) n from dizionario_lemma where stato='pubblicato' group by parlata) x);

  return query
  select 'Contenuti', 'Pezzi del Museo', (select count(*)::text from museo_gg_pezzo where stato='pubblicato'),
         (select coalesce('ultimo il ' || to_char(max(updated_at), 'DD/MM/YYYY'), 'nessuno')
            from museo_gg_pezzo where stato='pubblicato');

  return query
  select 'Contenuti', 'Storie', (select count(*)::text from storia where stato='pubblicata'),
         (select coalesce('ultima il ' || to_char(max(created_at), 'DD/MM/YYYY'), 'nessuna')
            from storia where stato='pubblicata');

  return query
  select 'Contenuti', 'Registrazioni audio', (select count(*)::text from archivio_audio),
         'le voci di chi parla il nos: e la cosa che manca di piu, e ha fretta';

  -- ---- CONTRIBUTI ----------------------------------------------------------
  -- SENZA CLASSIFICA, come stabilito: e' un elenco per sapere chi ringraziare,
  -- non per stabilire chi vale di piu'. Ordinato per nome, non per quantita'.
  return query
  select 'Contributi', 'Chi ha portato qualcosa (30 giorni)',
         (select count(distinct g.nome)::text
            from dizionario_lemma l join guardiani_contributori g on g.id = l.contributore_id
           where l.created_at > now() - interval '30 days'),
         (select string_agg(x.nome || ' (' || x.n || ')', ' · ' order by x.nome)
            from (select g.nome, count(*) n
                    from dizionario_lemma l join guardiani_contributori g on g.id = l.contributore_id
                   where l.created_at > now() - interval '30 days'
                   group by g.nome) x);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.plancia_salute()
 RETURNS TABLE(gruppo text, voce text, valore text, dettaglio text, allarme boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_muto int;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;
  select coalesce((c.valore#>>'{}')::int, 7) into v_muto
    from config_app c where c.chiave = 'plancia_giorni_canale_muto';
  v_muto := coalesce(v_muto, 7);

  return query
  select 'Notifiche'::text, t.tipo,
         coalesce(to_char(max(n.created_at), 'DD/MM HH24:MI'), 'mai'),
         format('%s negli ultimi 7 giorni', count(distinct n.url) filter (where n.created_at > now() - interval '7 days')),
         coalesce(max(n.created_at) < now() - make_interval(days => v_muto), true)
  from (values ('museo'),('articolo'),('evento'),('glossario'),('direttivo'),('comunita')) as t(tipo)
  left join notifica n on n.tipo = t.tipo
  group by t.tipo;

  return query
  select 'Notifiche', 'Dispositivi attivi',
         (select count(*)::text from push_token where attivo),
         (select format('%s disattivati in tutto', count(*)) from push_token where not attivo),
         (select count(*) from push_token where attivo) = 0;

  return query
  select 'Notifiche', 'Consegne fallite (14 giorni)',
         (select count(*)::text from notifica_consegna nc where nc.esito='fallita' and nc.quando > now() - interval '14 days'),
         (select coalesce(string_agg(distinct nc.dettaglio, '; '), 'nessun dettaglio')
            from notifica_consegna nc where nc.esito='fallita' and nc.quando > now() - interval '14 days'),
         (select count(*) from notifica_consegna nc where nc.esito='fallita' and nc.quando > now() - interval '14 days') > 0;

  return query
  select 'Notifiche', 'Annunci che non hanno raggiunto nessuno (14 giorni)',
         (select count(*)::text from (
            select n.url from notifica n
            join notifica_consegna nc on nc.notifica_id = n.id
            where nc.quando > now() - interval '14 days' and coalesce(n.url,'') <> ''
            group by n.url
            having count(*) filter (where nc.esito = 'consegnata') = 0) x),
         'Contati per annuncio, non per persona: chi non ha il telefono registrato non e un fallimento',
         (select count(*) from (
        select n.url from notifica n
        join notifica_consegna nc on nc.notifica_id = n.id
        where nc.quando > now() - interval '14 days' and coalesce(n.url,'') <> ''
        group by n.url
        having count(*) filter (where nc.esito = 'consegnata') = 0) x) > 0;

  return query
  select 'Posta', 'In coda',
         (select count(*)::text from email_outbox e where e.stato <> 'inviata'),
         (select coalesce(string_agg(distinct e.stato, ', '), '') from email_outbox e where e.stato <> 'inviata'),
         (select count(*) from email_outbox e where e.stato <> 'inviata') > 0;

  return query
  select 'Posta', 'Inviate oggi',
         (select count(*)::text from email_outbox e where e.inviata_il::date = current_date),
         format('ne restano %s sulle 100 del piano',
                100 - (select count(*) from email_outbox e where e.inviata_il::date = current_date)),
         (select count(*) from email_outbox e where e.inviata_il::date = current_date) >= 90;

  return query
  select 'Posta', 'Fallite',
         (select count(*)::text from email_outbox e where e.stato = 'errore'),
         (select coalesce(string_agg(distinct e.errore, '; '), 'nessuna') from email_outbox e where e.stato = 'errore'),
         (select count(*) from email_outbox e where e.stato = 'errore') > 0;

  return query
  select 'Lavori pianificati', j.jobname,
         coalesce((select to_char(max(r.start_time), 'DD/MM HH24:MI') from cron.job_run_details r
                    where r.jobid = j.jobid and r.status = 'succeeded'), 'mai riuscito'),
         coalesce((select r.status || ' · ' || left(coalesce(r.return_message,''), 90) from cron.job_run_details r
                    where r.jobid = j.jobid order by r.start_time desc limit 1), j.schedule),
         coalesce((select r.status <> 'succeeded' from cron.job_run_details r
                    where r.jobid = j.jobid order by r.start_time desc limit 1), false)
  from cron.job j where j.active;

  return query
  select 'Andreas', 'Conversazioni (7 giorni)',
         (select count(*)::text from ai_conversazione a where a.created_at > now() - interval '7 days'),
         (select format('%s in tutto', count(*)) from ai_conversazione), false;

  return query
  select 'Andreas', 'Biblioteca',
         (select coalesce(sum(k.n_chunks), 0)::text || ' frammenti' from andreas_kb_sorgente k),
         (select coalesce('ultimo aggiornamento ' || to_char(max(k.ingestato_il), 'DD/MM/YYYY'), 'mai ingerita')
            from andreas_kb_sorgente k), false;

  -- Il consumo Netlify NON e leggibile dal database. Dirlo e meglio che lasciare
  -- un riquadro vuoto, che si scambia per «tutto a posto».
  return query
  select 'Piattaforme', 'Consumo Netlify', 'non leggibile da qui',
         'Le invocazioni si vedono solo nel pannello Netlify. La soglia del piano gratuito e stata superata una volta il 6 agosto.',
         false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.plancia_scadenze()
 RETURNS TABLE(chiave text, titolo text, dettaglio text, scadenza date, giorni integer, stato text, destinazione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with esercizi as (
    -- L'esercizio chiuso e quello in corso: oltre non serve guardare.
    select generate_series(extract(year from current_date)::int - 1,
                           extract(year from current_date)::int) as anno
  ),
  righe as (
    -- 1. L'assemblea che approva, entro il 30 aprile dell'anno dopo.
    select
      'assemblea_' || e.anno                                as chiave,
      'Assemblea di approvazione del rendiconto ' || e.anno as titolo,
      'Quattro mesi dalla chiusura dell''esercizio: lo statuto vuole l''assemblea entro il 30 aprile.' as dettaglio,
      make_date(e.anno + 1, 4, 30)                          as scadenza,
      -- Compare dal 1° gennaio: quattro mesi di anticipo, non quattro giorni.
      make_date(e.anno + 1, 1, 1)                           as visibile_dal,
      (select r.stato from public.rendiconto r where r.anno = e.anno) as stato_rendiconto,
      case when (select r.stato from public.rendiconto r where r.anno = e.anno) = 'approvato_assemblea'
           then 'fatto' else 'da_fare' end                  as esito
    from esercizi e

    union all

    -- 2. Il rendiconto depositato in sede, quindici giorni prima dell'assemblea.
    --    Lo statuto dice che ogni associato puo' prenderne visione: senza
    --    deposito, l'approvazione e' contestabile.
    select
      'deposito_' || e.anno,
      'Rendiconto ' || e.anno || ' depositato in sede',
      'Nei quindici giorni che precedono l''assemblea, a disposizione di ogni associato.',
      make_date(e.anno + 1, 4, 30) - 15,
      make_date(e.anno + 1, 1, 1),
      (select r.stato from public.rendiconto r where r.anno = e.anno),
      case when (select r.depositato_il from public.rendiconto r where r.anno = e.anno) is not null
           then 'fatto' else 'da_fare' end
    from esercizi e

    union all

    -- 3. L'approvazione preventiva del Consiglio, che deve stare PRIMA delle
    --    altre due. Senza, l'assemblea non puo' approvare (e il database lo
    --    impedisce): meglio saperlo a febbraio.
    select
      'consiglio_' || e.anno,
      'Consiglio Direttivo: approvazione preventiva del rendiconto ' || e.anno,
      'Il Segretario/Tesoriere lo redige, il Consiglio lo approva in via preventiva, poi va in assemblea. Nessuno dei tre passaggi si salta.',
      make_date(e.anno + 1, 3, 31),
      make_date(e.anno + 1, 1, 1),
      (select r.stato from public.rendiconto r where r.anno = e.anno),
      case when (select r.stato from public.rendiconto r where r.anno = e.anno)
                in ('approvato_consiglio','approvato_assemblea')
           then 'fatto' else 'da_fare' end
    from esercizi e

    union all

    -- 4. Il deposito al RUNTS entro il 30 giugno. Compare solo quando
    --    l'Associazione sara' iscritta: annunciare oggi una scadenza che non
    --    esiste ancora e' il modo migliore per far ignorare anche le altre.
    select
      'runts_' || e.anno,
      'Deposito del bilancio al RUNTS · esercizio ' || e.anno,
      'Obbligo che nasce con l''iscrizione al RUNTS. Il prerequisito resta l''adeguamento dello statuto al Codice del Terzo settore.',
      make_date(e.anno + 1, 6, 30),
      make_date(e.anno + 1, 1, 1),
      (select r.stato from public.rendiconto r where r.anno = e.anno),
      'da_fare'
    from esercizi e
    where coalesce((select (valore->>'iscritta')::boolean from public.config_app where chiave = 'runts'), false)
  )
  select
    r.chiave, r.titolo, r.dettaglio, r.scadenza,
    (r.scadenza - current_date)::int as giorni,
    case
      when r.esito = 'fatto' then 'fatto'
      when r.scadenza < current_date then 'scaduta'
      when (r.scadenza - current_date) <= 30 then 'urgente'
      else 'in_arrivo'
    end,
    '/app/libri-sociali'
  from righe r
  where public.puo_gestione_associativa(auth.uid())
    and current_date >= r.visibile_dal
    -- Una scadenza fatta sparisce dopo un mese: resta il tempo di vederla
    -- spuntata, poi smette di occupare spazio.
    and not (r.esito = 'fatto' and r.scadenza < current_date - 30)
  order by
    case when r.esito = 'fatto' then 2 else 1 end,
    r.scadenza;
$function$
;

CREATE OR REPLACE FUNCTION public.prepara_inviti_tesseramento(p_esegui boolean DEFAULT false)
 RETURNS TABLE(email text, nome text, contributi integer, azione text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_soglia int;
  v_attivo boolean;
  r record;
  v_stato text;
begin
  select coalesce((c.valore#>>'{}')::int, 3) into v_soglia
    from config_app c where c.chiave = 'inviti_soglia_contributi';
  v_soglia := coalesce(v_soglia, 3);

  select coalesce((c.valore#>>'{}')::boolean, false) into v_attivo
    from config_app c where c.chiave = 'inviti_tesseramento_attivi';
  v_attivo := coalesce(v_attivo, false);

  -- Se l'interruttore generale e' giu', si prepara comunque l'elenco ma non si
  -- scrive niente: serve a guardare chi verrebbe invitato prima di accendere.
  for r in
    with cand as (
      select c.id, c.nome,
             lower(trim(c.email)) as email,
             count(l.id) filter (where l.stato = 'pubblicato')::int as pubblicati
      from guardiani_contributori c
      join dizionario_lemma l on l.contributore_id = c.id
      where coalesce(trim(c.email), '') <> '' and c.email like '%@%'
      group by 1, 2, 3
    )
    select cand.* from cand
    where cand.pubblicati >= v_soglia
      -- porta 2a: l'indirizzo non e' quello di un socio
      and not exists (
        select 1 from domande_tesseramento d
         where lower(trim(d.email)) = cand.email)
      -- porta 2b: e nemmeno il nome somiglia a quello di un socio. Grossolana
      -- di proposito: qui un falso positivo costa un invito mancato, un falso
      -- negativo costa una figura con una persona che e' gia' dei nostri.
      and not exists (
        select 1 from domande_tesseramento d
         where d.stato = 'approvata'
           and (d.nome ilike '%' || split_part(cand.nome, ' ', 1) || '%'
                or cand.nome ilike '%' || split_part(d.nome, ' ', 1) || '%'))
      -- porta 2c: non ha un account nell'app
      and not exists (
        select 1 from utente u where lower(trim(u.email)) = cand.email)
      -- porta 3: non gia' invitato, non da lasciare in pace
      and not exists (
        select 1 from invito_tesseramento i
         where i.email = cand.email)
    order by cand.pubblicati desc
  loop
    if not v_attivo then
      v_stato := 'candidato (interruttore spento)';
    elsif not p_esegui then
      v_stato := 'candidato (giro a vuoto)';
    else
      insert into email_outbox (destinatario, oggetto, html, reply_to, stato, origine, tags)
      values (
        r.email,
        'Grazie ' || coalesce(split_part(r.nome, ' ', 1), '') || ' · le tue parole sono nel glossario',
        '<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#1E2E26;max-width:560px;margin:0 auto;padding:24px">'
        || '<p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a6215;font-family:Arial,sans-serif;margin:0 0 14px">El Brenz &middot; Val del Nos</p>'
        || '<h1 style="font-size:24px;line-height:1.3;font-weight:500;margin:0 0 18px">Grazie, ' || coalesce(split_part(r.nome,' ',1),'') || '</h1>'
        || '<p style="margin:0 0 16px">le parole che ci hai mandato sono state pubblicate nel glossario dei <strong>Guardiani de la lenga</strong>: sono ' || r.pubblicati || ', e restano li'' con la loro scheda per chi le cerca e per chi non le ha mai sentite.</p>'
        || '<p style="margin:0 0 24px"><a href="https://elbrenz.eu/guardiani-de-la-lenga" style="color:#8a6215;font-weight:bold">Guardale nel glossario &rarr;</a></p>'
        || '<h2 style="font-size:18px;font-weight:500;margin:26px 0 12px">Se ti va di fare un passo in pi&ugrave;</h2>'
        || '<p style="margin:0 0 16px">Chi si tessera entra nella <em>nosa Sociazion</em>: la community dei soci, le convenzioni, le uscite e le rievocazioni, e la possibilit&agrave; di raccontare le storie di famiglia perch&eacute; non si perdano. La quota per il 2026 &egrave; di <strong>20 euro</strong> l''anno.</p>'
        || '<p style="margin:0 0 24px"><a href="https://elbrenz.eu/tesseramento" style="display:inline-block;background:#C8923E;color:#1E2E26;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;text-decoration:none;padding:12px 24px;border-radius:5px">Scopri come tesserarsi</a></p>'
        || '<p style="margin:0 0 16px">E se preferisci restare come sei, va benissimo lo stesso: le tue parole sono gi&agrave; nostre, e la porta resta aperta. Questo messaggio non si ripete: lo riceverai una volta sola. Per qualunque cosa scrivici a <a href="mailto:info@elbrenz.eu" style="color:#8a6215">info@elbrenz.eu</a>.</p>'
        || '<p style="margin:28px 0 0;font-style:italic;color:#8a6215">Ra&iacute;s fonde no le ''nglacia</p>'
        || '<p style="margin:6px 0 0;font-size:13px;color:#6B6B6B;font-family:Arial,sans-serif">Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce<br>elbrenz.eu &middot; info@elbrenz.eu</p>'
        || '</div>',
        'info@elbrenz.eu', 'bozza', 'sistema',
        '[{"name": "source", "value": "inviti-automatici"}, {"name": "tipo", "value": "invito-tesseramento"}]'::jsonb
      );

      insert into invito_tesseramento (email, nome, contributore_id, occasione, contributi, nota)
      values (r.email, r.nome, r.id, 'guardiani', r.pubblicati,
              'Preparato in bozza: l''invio lo autorizza una persona.')
      on conflict (email) do nothing;

      v_stato := 'email preparata in bozza';
    end if;

    email := r.email; nome := r.nome; contributi := r.pubblicati; azione := v_stato;
    return next;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prima_nota_traccia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.assoc_modifica (tabella, riga_id, chi, prima, dopo)
  values (tg_table_name, new.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.processa_email_outbox()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  r record;
  v_req bigint;
  v_resend text;
  n_inviate int := 0;
  n_esiti int := 0;
BEGIN
  -- 1. Riconcilia le richieste in volo con le risposte di pg_net
  FOR r IN
    SELECT o.id, resp.status_code, resp.content, resp.error_msg
    FROM email_outbox o
    JOIN net._http_response resp ON resp.id = o.richiesta_id
    WHERE o.stato = 'in_invio'
  LOOP
    IF r.status_code = 200 THEN
      v_resend := CASE WHEN r.content ~ '^\s*\{' THEN (r.content::jsonb)->>'id' ELSE NULL END;
      UPDATE email_outbox
        SET stato='inviata', inviata_il=now(), resend_id=v_resend, errore=NULL, updated_at=now()
      WHERE id = r.id;
    ELSE
      UPDATE email_outbox
        SET stato='errore',
            errore = coalesce('HTTP '||r.status_code||': '||left(r.content,500), r.error_msg, 'errore sconosciuto'),
            updated_at=now()
      WHERE id = r.id;
    END IF;
    n_esiti := n_esiti + 1;
  END LOOP;

  -- in_invio senza risposta da oltre 10 minuti (risposta scaduta/prunata): errore
  UPDATE email_outbox
    SET stato='errore', errore='nessuna risposta registrata entro 10 minuti', updated_at=now()
  WHERE stato='in_invio' AND updated_at < now() - interval '10 minutes';

  -- 2. Shared secret dal Vault (mai in chiaro fuori da qui)
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'send_email_shared_secret';
  IF v_secret IS NULL THEN
    RETURN format('esiti=%s; INVIO SOSPESO: secret send_email_shared_secret assente nel Vault', n_esiti);
  END IF;

  -- 3. Invia le 'pronte' (max 10 per giro, una al minuto basta e avanza)
  FOR r IN
    SELECT * FROM email_outbox
    WHERE stato='pronta'
    ORDER BY created_at
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  LOOP
    v_req := net.http_post(
      url := 'https://wacknihvdjxltiqvxtqr.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-Send-Email-Secret', v_secret),
      body := jsonb_strip_nulls(jsonb_build_object(
        'to', r.destinatario,
        'subject', r.oggetto,
        'html', r.html,
        'reply_to', r.reply_to,
        'cc', to_jsonb(r.cc),
        'bcc', to_jsonb(r.bcc),
        'tags', r.tags)),
      timeout_milliseconds := 15000
    );
    UPDATE email_outbox
      SET stato='in_invio', richiesta_id=v_req, tentativi=tentativi+1, updated_at=now()
    WHERE id = r.id;
    n_inviate := n_inviate + 1;
  END LOOP;

  RETURN format('esiti=%s, inviate=%s', n_esiti, n_inviate);
END $function$
;

CREATE OR REPLACE FUNCTION public.proposta_decadenza(p_anno integer)
 RETURNS TABLE(domanda_id uuid, numero_socio integer, nome text, email text, ultimo_anno_versato integer, anni_senza_versare integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id, d.numero_socio, d.nome, lower(d.email),
         u.ultimo_anno,
         case when u.ultimo_anno is null then null else p_anno - u.ultimo_anno end
  from public.domande_tesseramento d
  left join lateral (
    select max(pt.anno) as ultimo_anno
    from public.pagamenti_tesseramento pt
    where pt.domanda_id = d.id and pt.stato = 'completato'
      and pt.tipo in ('quota','integrazione') and pt.annullato_il is null
  ) u on true
  where d.stato = 'approvata'
    and coalesce(d.numero_tessera, -1) <> 0
    and coalesce(d.stato_socio, 'attivo') <> 'cessato'
    and (u.ultimo_anno is null or u.ultimo_anno < p_anno)
  order by u.ultimo_anno nulls first, d.numero_socio nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.prossimo_numero_socio()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select greatest(
    123,
    coalesce((select max(numero_socio) from public.domande_tesseramento), 0) + 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.puo_gestione_associativa(p_utente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    has_ruolo(p_utente, 'gestione_associativa') or has_ruolo_min(p_utente, 50),
    false);
$function$
;

CREATE OR REPLACE FUNCTION public.push_dispositivi_attivi()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when has_ruolo_min(auth.uid(), 50) then (select count(*)::int from push_token where attivo)
    else null
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.push_invito_da_mostrare()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when auth.uid() is null then false
    else coalesce((
      select r.accettato_il is null
             and r.rifiuti < 2
             and (r.chiesto_il is null or r.chiesto_il < now() - interval '30 days')
      from push_invito r where r.utente_id = auth.uid()
    ), true)  -- nessuna riga = non gli e' mai stato chiesto
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.push_invito_esito(p_accettato boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return; end if;
  insert into push_invito (utente_id, chiesto_il, rifiuti, accettato_il, updated_at)
  values (auth.uid(), now(), case when p_accettato then 0 else 1 end,
          case when p_accettato then now() else null end, now())
  on conflict (utente_id) do update set
    chiesto_il = now(),
    rifiuti = push_invito.rifiuti + case when p_accettato then 0 else 1 end,
    accettato_il = case when p_accettato then now() else push_invito.accettato_il end,
    updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.quadro_attivita(p_anno integer)
 RETURNS TABLE(verso text, categoria text, importo numeric, movimenti integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.verso, v.categoria, sum(v.importo)::numeric, count(*)::int
  from public.v_movimenti_cassa v
  where extract(year from v.data)::int = p_anno
    and public.puo_gestione_associativa(auth.uid())
  group by v.verso, v.categoria
  order by v.verso desc, sum(v.importo) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.quota_anno(p_anno integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select (valore ->> p_anno::text)::numeric
       from public.config_app where chiave = 'quota_sociale_per_anno'),
    20
  );
$function$
;

CREATE OR REPLACE FUNCTION public.recesso_efficace_dal(p_comunicato date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p_comunicato is null then null
    else (date_trunc('month', p_comunicato::timestamp) + interval '2 months')::date
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.registra_battito(p_servizio text, p_esito text DEFAULT 'ok'::text, p_dettaglio jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  if not exists (select 1 from servizio where nome = p_servizio) then
    raise exception 'Servizio sconosciuto: %. Va prima registrato nella tabella servizio.', p_servizio;
  end if;
  insert into servizio_battito (servizio, esito, dettaglio)
  values (p_servizio, p_esito, p_dettaglio) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.rendiconto_cassa(p_anno integer)
 RETURNS TABLE(sezione text, sezione_titolo text, verso text, importo numeric, movimenti integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with sezioni(sezione, titolo_entrata, titolo_uscita) as (values
    ('A', 'Entrate da attivita'' di interesse generale',      'Uscite da attivita'' di interesse generale'),
    ('B', 'Entrate da attivita'' diverse',                    'Uscite da attivita'' diverse'),
    ('C', 'Entrate per raccolta fondi',                       'Uscite per raccolta fondi'),
    ('D', 'Entrate da attivita'' finanziarie e patrimoniali', 'Uscite da attivita'' finanziarie e patrimoniali'),
    ('E', 'Entrate di supporto generale',                     'Uscite di supporto generale')
  ),
  versi(verso) as (values ('entrata'), ('uscita')),
  m as (
    select v.sezione, v.verso, sum(v.importo) as tot, count(*)::int as n
    from public.v_movimenti_cassa v
    where extract(year from v.data)::int = p_anno
    group by 1, 2
  )
  select
    s.sezione,
    case when w.verso = 'entrata' then s.titolo_entrata else s.titolo_uscita end,
    w.verso,
    coalesce(m.tot, 0)::numeric,
    coalesce(m.n, 0)
  from sezioni s
  cross join versi w
  left join m on m.sezione = s.sezione and m.verso = w.verso
  where public.puo_gestione_associativa(auth.uid())
  order by s.sezione, w.verso desc;
$function$
;

CREATE OR REPLACE FUNCTION public.rendiconto_controlla_stato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_organo text;
begin
  if new.stato = 'approvato_consiglio' or new.delibera_consiglio_id is not null then
    if new.delibera_consiglio_id is null then
      raise exception 'Il Consiglio non puo'' approvare senza delibera: collega la delibera del Consiglio Direttivo.';
    end if;
    select r.organo into v_organo
    from public.assoc_delibera d join public.assoc_riunione r on r.id = d.riunione_id
    where d.id = new.delibera_consiglio_id;
    if v_organo is distinct from 'consiglio_direttivo' then
      raise exception 'La delibera collegata all''approvazione preventiva non e'' del Consiglio Direttivo (organo: %).', coalesce(v_organo,'sconosciuto');
    end if;
  end if;

  if new.stato = 'approvato_assemblea' then
    if new.delibera_consiglio_id is null or new.approvato_consiglio_il is null then
      raise exception 'L''Assemblea non puo'' approvare un rendiconto che il Consiglio non ha approvato in via preventiva: lo statuto vuole prima il Consiglio. Nessuno dei tre passaggi si salta.';
    end if;
    if new.delibera_assemblea_id is null then
      raise exception 'L''approvazione dell''Assemblea vuole la delibera collegata: senza, il rendiconto non porta il riferimento che deve portare.';
    end if;
    select r.organo into v_organo
    from public.assoc_delibera d join public.assoc_riunione r on r.id = d.riunione_id
    where d.id = new.delibera_assemblea_id;
    if v_organo not in ('assemblea_ordinaria','assemblea_straordinaria') then
      raise exception 'La delibera collegata all''approvazione finale non e'' di un''assemblea (organo: %).', coalesce(v_organo,'sconosciuto');
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rendiconto_raccolte(p_anno integer)
 RETURNS TABLE(id uuid, denominazione text, data_inizio date, data_fine date, entrate numeric, uscite numeric, saldo numeric, movimenti integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    r.id, r.denominazione, r.data_inizio, r.data_fine,
    coalesce(sum(m.importo) filter (where m.verso = 'entrata'), 0)::numeric,
    coalesce(sum(m.importo) filter (where m.verso = 'uscita'), 0)::numeric,
    (coalesce(sum(m.importo) filter (where m.verso = 'entrata'), 0)
     - coalesce(sum(m.importo) filter (where m.verso = 'uscita'), 0))::numeric,
    count(m.riga)::int
  from public.raccolta_fondi r
  left join public.v_movimenti_cassa m
    on m.raccolta_fondi_id = r.id and extract(year from m.data)::int = p_anno
  where r.anno = p_anno
    and public.puo_gestione_associativa(auth.uid())
  group by r.id, r.denominazione, r.data_inizio, r.data_fine
  order by r.data_inizio nulls last, r.denominazione;
$function$
;

CREATE OR REPLACE FUNCTION public.rinnovo_sollecitabile(p_anno integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select (now() at time zone 'Europe/Rome')::date >= make_date(p_anno, 1, 1);
$function$
;

CREATE OR REPLACE FUNCTION public.salute_notifiche(p_giorni integer DEFAULT 7)
 RETURNS TABLE(voce text, valore text, allarme boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with finestra as (select now() - make_interval(days => p_giorni) as da)
  select 'Dispositivi con notifiche accese',
         (select count(*)::text from push_token where attivo),
         (select count(*) from push_token where attivo) = 0
  union all
  select 'Notifiche create negli ultimi ' || p_giorni || ' giorni',
         (select count(distinct url)::text from notifica, finestra where created_at >= finestra.da),
         false
  union all
  -- Il difetto che ha tenuto le push ferme dal 29 luglio senza che nessuno se ne
  -- accorgesse: un tipo che dovrebbe esserci e non c'e.
  select 'Ultimo avviso di contenuto (museo, articolo, evento, glossario)',
         coalesce((select to_char(max(created_at), 'DD/MM HH24:MI') from notifica
                   where tipo in ('museo','articolo','evento','glossario')), 'MAI'),
         coalesce((select max(created_at) from notifica
                   where tipo in ('museo','articolo','evento','glossario'))
                  < now() - interval '7 days', true)
  union all
  select 'Consegne a zero destinatari negli ultimi ' || p_giorni || ' giorni',
         (select count(*)::text from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'nessun_destinatario'),
         (select count(*) from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'nessun_destinatario') > 0
  union all
  select 'Consegne fallite negli ultimi ' || p_giorni || ' giorni',
         (select count(*)::text from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'fallita'),
         (select count(*) from notifica_consegna, finestra
          where quando >= finestra.da and esito = 'fallita') > 0
  union all
  select 'Riepilogo Guardiani: ultimo invio',
         coalesce((select to_char(max(inviato_il), 'DD/MM HH24:MI') from guardiani_digest_invio), 'MAI'),
         false;
$function$
;

CREATE OR REPLACE FUNCTION public.scadi_ordini_creato_vecchi()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  update public.pagamenti_tesseramento
    set stato = 'scaduto', updated_at = now()
    where stato = 'creato'
      and created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.scarta_ascolto(p_audio_id uuid, p_motivo text)
 RETURNS TABLE(audio_id uuid, restanti bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not has_ruolo_min(v_uid, 20) then
    raise exception 'Non autorizzato ad ascoltare la coda';
  end if;
  if coalesce(btrim(p_motivo),'') = '' then
    raise exception 'Il motivo del rifiuto e obbligatorio';
  end if;

  update archivio_audio
     set stato = 'rifiutato', motivo_rifiuto = btrim(p_motivo),
         ascoltato_da = v_uid, ascoltato_il = now(), updated_at = now()
   where id = p_audio_id and stato = 'in_attesa' and ascoltato_il is null;

  if not found then raise exception 'Registrazione non in coda o gia lavorata'; end if;

  return query select p_audio_id,
    (select count(*) from archivio_audio x where x.stato='in_attesa' and x.ascoltato_il is null);
end $function$
;

CREATE OR REPLACE FUNCTION public.sentinella_pagine(p_esegui boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  SITO constant text := 'https://elbrenz.eu';
  r record;
  v_req bigint;
  n_chiuse int := 0;
  n_aperte int := 0;
  n_rotte int := 0;
  n_senza_risposta int := 0;
  v_da_controllare jsonb := '[]'::jsonb;
  v jsonb;
begin
  for r in
    select s.id, resp.status_code
    from sentinella_pagina s
    join net._http_response resp on resp.id = s.richiesta_id
    where s.esito = 'in_volo'
  loop
    update sentinella_pagina
       set status_code = r.status_code,
           esito = case when r.status_code = 200 then 'ok' else 'rotta' end
     where id = r.id;
    n_chiuse := n_chiuse + 1;
    if r.status_code is distinct from 200 then n_rotte := n_rotte + 1; end if;
  end loop;

  update sentinella_pagina
     set esito = 'senza_risposta'
   where esito = 'in_volo' and controllato_il < now() - interval '10 minutes';
  get diagnostics n_senza_risposta = row_count;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_da_controllare from (
    (select 'lemma'::text as cosa, l.slug as slug,
            SITO || '/guardiani-de-la-lenga/' || l.slug as url
       from dizionario_lemma l
      where l.stato = 'pubblicato' and coalesce(l.slug, '') <> ''
      order by coalesce(l.validato_il, l.created_at) desc limit 1)
    union all
    (select 'museo'::text, p.slug, SITO || '/non-e-sole-grande-guerra/' || p.slug
       from museo_gg_pezzo p
      where p.stato = 'pubblicato' and coalesce(p.slug, '') <> ''
      order by p.created_at desc limit 1)
    union all
    (select 'articolo'::text, a.slug, SITO || '/articoli/' || a.slug
       from v_articoli_pubblici a
      where coalesce(a.slug, '') <> ''
      limit 1)
    union all
    (select 'evento'::text, e.slug, SITO || '/eventi/' || e.slug
       from eventi_esterni_pubblici e
      where coalesce(e.slug, '') <> ''
      limit 1)
    union all
    (select 'memoria'::text as cosa, rm.chiave as slug, SITO || rm.url as url
       from (
         with rotte_memoria as (
           select 'indice-'||mf.slug_breve as chiave, '/cimiteri-di-guerra' as url
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'fondo-'||mf.slug_breve, '/cimiteri-di-guerra/'||mf.slug_breve
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'mappa-'||mf.slug_breve, '/cimiteri-di-guerra/'||mf.slug_breve||'/mappa'
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'senza-nome-'||mf.slug_breve, '/cimiteri-di-guerra/'||mf.slug_breve||'/senza-nome'
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'persona-'||mp.id::text, '/cimiteri-di-guerra/'||mf.slug_breve||'/'||mp.slug
             from memoria_persona mp join memoria_fondo mf on mf.id = mp.fondo_id
            where mf.stato = 'pubblicato' and mp.slug is not null
              and mp.nome_completo is not null and mp.nome_completo <> 'sconosciuto'
           union all
           select 'evento-'||e.slug, '/cimiteri-di-guerra/'||e.slug
             from v_memoria_evento_pubblico e
           union all
           select 'reparto-indice', '/cimiteri-di-guerra/reparto'
           union all
           select 'reparto-'||rg.reparto_slug, '/cimiteri-di-guerra/reparto/'||rg.reparto_slug
             from (
               select regexp_replace(lower(mp.reparto), '[^a-z0-9]+', '-', 'g') as reparto_slug, count(*) as n
                 from memoria_persona mp join memoria_fondo mf on mf.id = mp.fondo_id
                where mf.stato = 'pubblicato' and mp.reparto is not null
                  and mp.nome_completo is not null and mp.nome_completo <> 'sconosciuto'
                group by 1
             ) rg where rg.n >= 3
           union all
           select 'provenienza-indice', '/cimiteri-di-guerra/provenienza'
           union all
           select 'provenienza-'||pv.reg_slug, '/cimiteri-di-guerra/provenienza/'||pv.reg_slug
             from (
               select regexp_replace(lower(mp.regione_nascita), '[^a-z0-9]+', '-', 'g') as reg_slug, count(*) as n
                 from memoria_persona mp join memoria_fondo mf on mf.id = mp.fondo_id
                where mf.stato = 'pubblicato' and mp.regione_nascita is not null
                  and mp.nome_completo is not null and mp.nome_completo <> 'sconosciuto'
                group by 1
             ) pv where pv.n >= 3
         )
         select * from rotte_memoria order by random() limit 1
       ) rm)
  ) x;

  if not p_esegui then
    return format('giro a vuoto: chiuse %s, controllerei %s indirizzi',
                  n_chiuse, jsonb_array_length(v_da_controllare));
  end if;

  for v in select * from jsonb_array_elements(v_da_controllare) loop
    v_req := net.http_get(url := v ->> 'url', timeout_milliseconds := 15000);
    insert into sentinella_pagina (cosa, slug, url, richiesta_id)
    values (v ->> 'cosa', v ->> 'slug', v ->> 'url', v_req);
    n_aperte := n_aperte + 1;
  end loop;

  delete from sentinella_pagina where controllato_il < now() - interval '30 days';

  begin
    perform registra_battito('sentinella-pagine',
      case when n_rotte > 0 or n_senza_risposta > 0 then 'errore' else 'ok' end,
      jsonb_build_object('chiuse', n_chiuse, 'aperte', n_aperte, 'rotte', n_rotte, 'senza_risposta', n_senza_risposta));
  exception when others then null; -- il battito non deve mai rompere il lavoro
  end;

  return format('chiuse %s, chieste %s', n_chiuse, n_aperte);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.slugifica(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(public.unaccent_semplice(coalesce(t, ''))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.soci_al_anno(p_anno integer)
 RETURNS TABLE(domanda_id uuid, nome text, cognome text, email text, numero_tessera integer, anno_ammissione integer, approvata_il timestamp with time zone, quota_dovuta numeric, versato numeric, manca numeric, in_deroga boolean, deroga_motivo text, cessato boolean, cessazione_data date, posizione text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select d.id, d.nome, d.cognome, d.email, d.numero_tessera, d.anno, d.approvata_il,
           d.deroga_pagamento_motivo, d.approvata_da,
           d.stato_socio, d.cessazione_data, d.recesso_comunicato_il
    from public.domande_tesseramento d
    where d.stato = 'approvata'
      and coalesce(d.numero_tessera, -1) <> 0
  ),
  versamenti as (
    select pt.domanda_id, sum(pt.importo) as versato
    from public.pagamenti_tesseramento pt
    where pt.stato = 'completato'
      and pt.tipo in ('quota','integrazione')
      and pt.annullato_il is null
      and pt.anno = p_anno
    group by pt.domanda_id
  ),
  deroghe as (
    select dq.domanda_id, dq.motivo from public.deroga_quota dq where dq.anno = p_anno
  )
  select
    b.id, b.nome, b.cognome, b.email, b.numero_tessera, b.anno, b.approvata_il,
    public.quota_anno(p_anno) as quota_dovuta,
    coalesce(v.versato, 0) as versato,
    greatest(public.quota_anno(p_anno) - coalesce(v.versato, 0), 0) as manca,
    (dg.motivo is not null
      or (b.anno = p_anno and b.deroga_pagamento_motivo is not null and btrim(b.deroga_pagamento_motivo) <> '')) as in_deroga,
    coalesce(dg.motivo, case when b.anno = p_anno then b.deroga_pagamento_motivo end) as deroga_motivo,
    (b.stato_socio = 'cessato' and coalesce(extract(year from b.cessazione_data)::int, p_anno) <= p_anno) as cessato,
    b.cessazione_data,
    case
      when b.stato_socio = 'cessato' and coalesce(extract(year from b.cessazione_data)::int, p_anno) <= p_anno then 'cessato'
      when dg.motivo is not null then 'in_regola_per_deroga'
      when b.anno = p_anno and b.deroga_pagamento_motivo is not null and btrim(b.deroga_pagamento_motivo) <> '' then 'in_regola_per_deroga'
      when coalesce(v.versato, 0) >= public.quota_anno(p_anno) then 'in_regola'
      when coalesce(v.versato, 0) > 0 then 'parziale'
      when b.anno = p_anno and b.approvata_da = 'Import registro segretario 07/07/2026' then 'da_regolarizzare'
      when p_anno > b.anno then 'da_rinnovare'
      else 'ammesso_senza_incasso'
    end as posizione
  from base b
  left join versamenti v on v.domanda_id = b.id
  left join deroghe dg on dg.domanda_id = b.id
  where b.anno <= p_anno;
$function$
;

CREATE OR REPLACE FUNCTION public.soci_candidati_collegamento()
 RETURNS TABLE(domanda_id uuid, numero_socio integer, dom_nome text, dom_cognome text, dom_email text, candidato_id uuid, cand_nome text, cand_cognome text, cand_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.soci_senza_ruolo()
 RETURNS TABLE(numero_socio integer, nome text, email text, livello_attuale integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.numero_socio, d.nome, lower(u.email),
         coalesce((select max(r.livello) from utente_ruolo ur
                   join ruolo r on r.id = ur.ruolo_id
                   where ur.utente_id = u.id), 0)
  from domande_tesseramento d
  join auth.users u on lower(u.email) = lower(d.email)
  where has_ruolo_min(auth.uid(), 50)          -- solo direttivo: e' un elenco di persone
    and d.stato = 'approvata'
    and d.numero_socio is not null
    and coalesce(d.numero_tessera, -1) <> 0
    and coalesce(d.stato_socio, 'attivo') <> 'cessato'
    and coalesce((select max(r.livello) from utente_ruolo ur
                  join ruolo r on r.id = ur.ruolo_id
                  where ur.utente_id = u.id), 0) < 10
  order by d.numero_socio;
$function$
;

CREATE OR REPLACE FUNCTION public.storia_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  admin boolean := public.has_ruolo_min(auth.uid(), 50);
  chi   text := case when auth.uid() is null
                     then 'La scrittura arriva da un canale senza sessione (service role, editor SQL o edge function): li'' auth.uid() e'' nullo e nessuno risulta amministratore, nemmeno il super admin. Usa la sessione di una persona, oppure il pannello.'
                     else 'Serve un ruolo di livello 50 o superiore.' end;
begin
  if tg_op = 'INSERT' then
    new.updated_at := now();
    if not admin then
      new.pubblica := false;
      new.stato := 'pubblicata';
      new.promossa_da := null; new.promossa_il := null; new.moderata_da := null;
      if new.diritti_dichiarati is not true then
        raise exception 'Per condividere una storia devi dichiarare di avere il diritto sulle immagini.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    if not admin then
      -- Si protesta SOLO se si e' provato a toccare i campi riservati: chi
      -- corregge il testo della propria storia non deve vedere niente.
      if new.pubblica    is distinct from old.pubblica
      or new.stato       is distinct from old.stato
      or new.promossa_da is distinct from old.promossa_da
      or new.promossa_il is distinct from old.promossa_il
      or new.moderata_da is distinct from old.moderata_da then
        raise exception
          'Non puoi cambiare la pubblicazione o la promozione di una storia. %', chi
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.tessera_verifica(codice text)
 RETURNS TABLE(nome text, numero_tessera integer, anno integer, stato text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(nullif(split_part(regexp_replace(btrim(d.nome), '\s+', ' ', 'g'), ' ', 1), ''), 'Socio')
      || case when regexp_replace(btrim(d.nome), '\s+', ' ', 'g') like '% %'
              then ' ' || upper(left(split_part(regexp_replace(btrim(d.nome), '\s+', ' ', 'g'), ' ', -1), 1)) || '.'
              else '' end,
    d.numero_tessera,
    d.anno,
    d.stato
  from public.domande_tesseramento d
  where d.codice_tessera = codice
    and d.codice_tessera is not null
    and d.stato = 'approvata'
    and d.cessazione_data is null
    and coalesce(d.stato_socio, 'attivo') <> 'cessato'
    and (d.scadenza is null or d.scadenza >= current_date)
$function$
;

CREATE OR REPLACE FUNCTION public.tg_allinea_nome_autenticazione()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nome text := nullif(btrim(NEW.nome), '');
begin
  if v_nome is null then return NEW; end if;
  if TG_OP = 'UPDATE'
     and btrim(coalesce(OLD.nome, '')) = btrim(coalesce(NEW.nome, ''))
     and btrim(coalesce(OLD.cognome, '')) = btrim(coalesce(NEW.cognome, '')) then
    return NEW;
  end if;

  update auth.users u
  set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
           'nome', v_nome,
           'cognome', nullif(btrim(NEW.cognome), ''),
           'nome_completo', btrim(v_nome || ' ' || coalesce(NEW.cognome, ''))
         )
  where u.id = NEW.id;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_convenzioni_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.tg_lemma_guardia_pubblicazione()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_manca text[] := array[]::text[];
begin
  if NEW.stato <> 'pubblicato' then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.stato = 'pubblicato' then return NEW; end if;

  if not public.glossario_definizione_sufficiente(NEW.definizione, NEW.esempi_uso) then
    v_manca := v_manca || 'la spiegazione: o una definizione estesa, o una frase d''esempio in cui la parola compare';
  end if;
  if coalesce(btrim(NEW.comune), '') = '' then
    v_manca := v_manca || 'il paese';
  end if;

  if array_length(v_manca, 1) > 0 then
    raise exception 'Non posso pubblicare «%»: manca %', NEW.lemma, array_to_string(v_manca, ' e manca ')
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_lemma_relazione_canonica()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v uuid;
begin
  if NEW.a_id > NEW.b_id then
    v := NEW.a_id; NEW.a_id := NEW.b_id; NEW.b_id := v;
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_notifica_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.pubblicato = true and (TG_OP='INSERT' or OLD.pubblicato is distinct from true) then
    insert into notifica(utente_id, tipo, titolo, corpo, url)
    select u.id, 'evento', 'Nuovo evento', NEW.titolo, '/eventi/'||NEW.id
    from utente u where has_ruolo_min(u.id,10);
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_notifica_livello()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare tot_dopo bigint; tot_prima bigint; ord_prima int; ord_dopo int; nome_dopo text;
begin
  select coalesce(sum(punti),0) into tot_dopo from punti_evento where utente_id = NEW.utente_id;
  tot_prima := tot_dopo - NEW.punti;
  select ordine into ord_prima from livello where soglia_punti <= tot_prima order by soglia_punti desc limit 1;
  select ordine, nome into ord_dopo, nome_dopo from livello where soglia_punti <= tot_dopo order by soglia_punti desc limit 1;
  if ord_dopo is not null and ord_dopo > coalesce(ord_prima,-1) then
    insert into notifica(utente_id, tipo, titolo, corpo, url)
    values (NEW.utente_id, 'livello', 'Sei salito di livello!', 'Ora sei '||nome_dopo||'.', '/profilo/cammino');
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_notifica_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare autore_thread uuid;
begin
  select autore_id into autore_thread from forum_thread where id = NEW.thread_id;
  if autore_thread is not null and autore_thread <> NEW.autore_id
     and not (autore_thread = any(coalesce(NEW.menzioni,'{}'::uuid[]))) then
    insert into notifica(utente_id, tipo, titolo, corpo, url)
    values (autore_thread, 'risposta', 'Nuova risposta', 'Qualcuno ha risposto in una discussione.', '/comunita/thread/'||NEW.thread_id);
  end if;
  insert into notifica(utente_id, tipo, titolo, corpo, url)
  select m, 'menzione', 'Sei stato menzionato', 'Qualcuno ti ha menzionato in un commento.', '/comunita/thread/'||NEW.thread_id
  from unnest(coalesce(NEW.menzioni,'{}'::uuid[])) as m
  where m <> NEW.autore_id;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_notifica_thread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.tipo = 'bacheca' then
    -- fan-out "nuovo post in Comunità" a tutti i soci, esclusi autore e menzionati
    insert into notifica(utente_id, tipo, titolo, corpo, url)
    select u.id, 'comunita', 'Nuovo post nella Comunità',
           coalesce(NEW.titolo, 'C''è un nuovo post da leggere.'), '/comunita/thread/'||NEW.id
    from utente u
    where has_ruolo_min(u.id,10) and u.id <> NEW.autore_id
      and not (u.id = any(coalesce(NEW.menzioni,'{}'::uuid[])));
  end if;
  -- menzioni
  insert into notifica(utente_id, tipo, titolo, corpo, url)
  select m, 'menzione', 'Sei stato menzionato', 'Qualcuno ti ha menzionato in un post.', '/comunita/thread/'||NEW.id
  from unnest(coalesce(NEW.menzioni,'{}'::uuid[])) as m
  where m <> NEW.autore_id;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_arretrati_al_primo_accesso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in
    select l.id
    from guardiani_contributori c
    join dizionario_lemma l on l.contributore_id = c.id
    where lower(c.email) = lower(NEW.email)
      and l.stato in ('validato', 'pubblicato')
  loop
    perform gam_add(NEW.id, 'lemma_validato', 25, 'dizionario_lemma', r.id::text, true);
    n := n + 1;
  end loop;
  if n > 0 then
    perform gam_distintivo(NEW.id, 'parola_nostra');
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_lemma()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_utente uuid;
  v_secco numeric;
  v_completo numeric;
  v_molt numeric := 1;
  v_quanti integer;
  v_pubblico boolean := NEW.stato in ('validato', 'pubblicato');
  v_era_pubblico boolean := OLD.stato is not null and OLD.stato in ('validato', 'pubblicato');
begin
  if not v_pubblico then
    return NEW;
  end if;

  -- Il contributore e' un utente dell'app? Si cerca per email, che e' l'unica
  -- cosa che le due anagrafiche hanno in comune. (Invariato dal 12/7.)
  select u.id into v_utente
  from guardiani_contributori g
  join utente u on lower(u.email) = lower(g.email)
  where g.id = NEW.contributore_id
  limit 1;

  if v_utente is null then
    select u.id into v_utente from utente u where u.id = NEW.contributore_id;
  end if;

  if v_utente is null then
    return NEW;
  end if;

  v_secco := public.glossario_punti('lemma_secco', 5);
  v_completo := public.glossario_punti('lemma_completo', 22);

  -- I moltiplicatori: una parola in rabies o in pegaes vale piu' di una in
  -- noneso, e un paese da cui non e' ancora arrivato quasi niente vale piu'
  -- del quinto contributo da Male'. Restano come progettati; ora vivono in
  -- configurazione e si correggono senza un deploy.
  v_molt := coalesce((
    select (valore -> 'parlata' -> NEW.parlata)::text::numeric
    from config_app where chiave = 'glossario_punti'
  ), 1);

  if coalesce(btrim(NEW.comune), '') <> '' then
    select count(*) into v_quanti
    from dizionario_lemma
    where stato in ('validato', 'pubblicato') and comune = NEW.comune and id <> NEW.id;
    if v_quanti < public.glossario_punti('paese_scoperto_sotto', 3) then
      v_molt := v_molt * public.glossario_punti('paese_scoperto_moltiplicatore', 1.5);
    end if;
  end if;

  -- LA PAROLA. Si assegna una volta sola, alla prima pubblicazione.
  if not v_era_pubblico then
    perform public.gam_add(v_utente, 'lemma_validato', round(v_secco * v_molt)::int,
                           'dizionario_lemma', NEW.id::text, true);
    perform public.gam_distintivo(v_utente, 'parola_nostra');
  end if;

  -- LA PAROLA FATTA BENE. Non si riscrive il punteggio gia' dato: si aggiunge
  -- la differenza, e si aggiunge anche mesi dopo, quando un curatore completa
  -- la scheda. Cosi' chi ha mandato una parola e poi si e' ricordato il detto
  -- vede il suo lavoro contato davvero.
  if public.glossario_lemma_completo(NEW.definizione, NEW.esempi_uso, NEW.comune, NEW.categoria_gramm) then
    perform public.gam_add(v_utente, 'lemma_completato',
                           greatest(round((v_completo - v_secco) * v_molt)::int, 0),
                           'dizionario_lemma', NEW.id::text, true);
  end if;

  -- LA VOCE. Il valore piu' alto di tutto l'archivio, e non e' una
  -- proporzione: e' l'unica cosa che ha una scadenza biologica. Nessun
  -- moltiplicatore, perche' una voce di Male' e una di Rabbi si perdono
  -- allo stesso modo.
  if NEW.audio_id is not null then
    perform public.gam_add(v_utente, 'lemma_audio',
                           round(public.glossario_punti('lemma_audio', 150))::int,
                           'dizionario_lemma', NEW.id::text, true);
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_museo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.stato = 'pubblicato' and OLD.stato is distinct from 'pubblicato' then
    perform public.gam_add(NEW.caricato_da, 'museo_approvato',
                           round(public.glossario_punti('museo_pezzo', 20))::int,
                           'museo_gg_pezzo', NEW.id::text, true);
    perform public.gam_distintivo(NEW.caricato_da, 'custode');
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_post_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.punti_evento where tipo_azione='commento' and riferimento_id=OLD.id::text and utente_id=OLD.autore_id) then
    perform public.gam_add(OLD.autore_id,'rettifica',-1,'forum_post',OLD.id::text,false); end if;
  return OLD;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_post_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare oggi int;
begin
  select coalesce(sum(punti),0) into oggi from public.punti_evento where utente_id=NEW.autore_id and tipo_azione in ('post_creato','commento') and created_at::date = now()::date;
  if oggi < 10 then perform public.gam_add(NEW.autore_id,'commento',1,'forum_post',NEW.id::text,true); end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_profilo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.avatar_url is not null and btrim(coalesce(NEW.bio,'')) <> '' then
    perform public.gam_add(NEW.id,'profilo_completo',5,'utente',NEW.id::text,true); end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_reazione_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare autore uuid;
begin
  if OLD.thread_id is not null then select autore_id into autore from public.forum_thread where id=OLD.thread_id;
  elsif OLD.post_id is not null then select autore_id into autore from public.forum_post where id=OLD.post_id; end if;
  if autore is not null and autore <> OLD.utente_id then perform public.gam_add(autore,'rettifica',-2,'forum_reazione',OLD.id::text,false); end if;
  return OLD;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_reazione_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare autore uuid; n int;
begin
  if NEW.thread_id is not null then select autore_id into autore from public.forum_thread where id=NEW.thread_id;
  elsif NEW.post_id is not null then select autore_id into autore from public.forum_post where id=NEW.post_id; end if;
  if autore is not null and autore <> NEW.utente_id then
    perform public.gam_add(autore,'reazione_ricevuta',2,'forum_reazione',NEW.id::text,true);
    select count(*) into n from public.punti_evento where utente_id=autore and tipo_azione='reazione_ricevuta' and punti>0;
    if n >= 50 then perform public.gam_distintivo(autore,'cuore_valli'); end if;
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_storia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.pubblica is true and OLD.pubblica is distinct from true then
    perform public.gam_add(NEW.autore_id, 'storia_pubblicata',
                           round(public.glossario_punti('storia', 15))::int,
                           'storia', NEW.id::text, true);
    perform public.gam_distintivo(NEW.autore_id, 'memoria_condivisa');
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_thread_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.punti_evento where tipo_azione='post_creato' and riferimento_id=OLD.id::text and utente_id=OLD.autore_id) then
    perform public.gam_add(OLD.autore_id,'rettifica',-2,'forum_thread',OLD.id::text,false); end if;
  return OLD;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_punti_thread_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare oggi int; nthread int;
begin
  if NEW.tipo <> 'bacheca' then return NEW; end if;
  select coalesce(sum(punti),0) into oggi from public.punti_evento where utente_id=NEW.autore_id and tipo_azione in ('post_creato','commento') and created_at::date = now()::date;
  if oggi < 10 then perform public.gam_add(NEW.autore_id,'post_creato',2,'forum_thread',NEW.id::text,true); end if;
  select count(*) into nthread from public.forum_thread where autore_id=NEW.autore_id and tipo='bacheca';
  if nthread = 1 then perform public.gam_distintivo(NEW.autore_id,'prima_voce'); end if;
  if nthread >= 10 then perform public.gam_distintivo(NEW.autore_id,'cronista'); end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_registro_curatela()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.registro_curatela (tabella, record_id, azione, utente_id, dati_prima, dati_dopo)
  values (
    TG_TABLE_NAME,
    coalesce((case when TG_OP = 'DELETE' then OLD.id else NEW.id end), gen_random_uuid()),
    lower(TG_OP),
    auth.uid(),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('UPDATE','INSERT') then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_traccia_modifica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
  k text;
  -- Campi di servizio: cambiano a ogni salvataggio e non raccontano niente.
  ignora text[] := array['updated_at','created_at','slug','annunciato_il','validato_il','validato_da'];
begin
  for k in select jsonb_object_keys(v_new) loop
    if not (k = any(ignora)) and (v_old -> k) is distinct from (v_new -> k) then
      insert into modifica_contenuto (tabella, riga_id, campo, prima, dopo, chi)
      values (
        TG_TABLE_NAME,
        (v_new ->> 'id')::uuid,
        k,
        -- Si conserva il testo intero, non un riassunto: serve a tornare
        -- indietro, e un troncamento renderebbe la traccia inutile proprio
        -- quando serve.
        left(v_old ->> k, 20000),
        left(v_new ->> k, 20000),
        auth.uid()
      );
    end if;
  end loop;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unaccent_semplice(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select translate(
    coalesce(t, ''),
    'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
    'aaaaaaeeeeiiiiooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYNC'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.verifica_otp(p_email text, p_codice text, p_scope text DEFAULT 'login'::text)
 RETURNS TABLE(valido boolean, motivo text, otp_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rec public.auth_otp%rowtype;
begin
  select * into v_rec
  from public.auth_otp
  where email = p_email::citext and scope = p_scope and usato = false and scade_at > now()
  order by created_at desc limit 1;

  if not found then
    return query select false, 'nessun_codice_attivo', null::uuid; return;
  end if;

  if v_rec.tentativi >= v_rec.max_tentativi then
    update public.auth_otp set usato = true, usato_at = now() where id = v_rec.id;
    return query select false, 'troppi_tentativi', v_rec.id; return;
  end if;

  if extensions.crypt(p_codice, v_rec.codice_hash) = v_rec.codice_hash then
    update public.auth_otp set usato = true, usato_at = now() where id = v_rec.id;
    return query select true, 'ok'::text, v_rec.id;
  else
    update public.auth_otp set tentativi = tentativi + 1 where id = v_rec.id;
    return query select false, 'codice_errato', v_rec.id;
  end if;
end
$function$
;

CREATE OR REPLACE FUNCTION public.vocabolario_unisci(p_dominio text, p_da text, p_a text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_spostati integer := 0;
begin
  if not (
    public.has_ruolo_min(auth.uid(), 25)
    or public.has_ruolo(auth.uid(), 'curatore_linguistico')
  ) then
    raise exception 'Serve il ruolo di curatore per unire due valori.';
  end if;
  if p_dominio not in ('parlata', 'comune', 'categoria_gramm') then
    raise exception 'Dominio non ammesso: %', p_dominio;
  end if;
  if p_da is null or p_a is null or p_da = p_a then
    raise exception 'Servono due valori diversi.';
  end if;

  if p_dominio = 'parlata' then
    update public.dizionario_lemma set parlata = p_a where parlata = p_da;
  elsif p_dominio = 'comune' then
    update public.dizionario_lemma set comune = p_a where comune = p_da;
  else
    update public.dizionario_lemma set categoria_gramm = p_a where categoria_gramm = p_da;
  end if;
  get diagnostics v_spostati = row_count;

  insert into public.vocabolario_voce (dominio, valore, stato, unito_in)
  values (p_dominio, p_da, 'unito', p_a)
  on conflict (dominio, valore)
  do update set stato = 'unito', unito_in = p_a, updated_at = now();

  return v_spostati;
end;
$function$
;

-- ---- 10. TRIGGER NON INTERNI (68) ------------------------------------------
CREATE TRIGGER trg_andreas_campagna_updated BEFORE UPDATE ON public.andreas_campagna FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_andreas_canale_updated BEFORE UPDATE ON public.andreas_canale FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kb_sorg_updated BEFORE UPDATE ON public.andreas_kb_sorgente FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_andreas_pub_updated BEFORE UPDATE ON public.andreas_pubblicazione FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audio_updated BEFORE UPDATE ON public.archivio_audio FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_archivio_documento_updated_at BEFORE UPDATE ON public.archivio_documento FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notifica_articolo AFTER INSERT OR UPDATE OF stato ON public.articolo FOR EACH ROW EXECUTE FUNCTION notifica_articolo_pubblicato();
CREATE TRIGGER trg_traccia_articolo AFTER UPDATE ON public.articolo FOR EACH ROW WHEN ((old.stato = 'pubblicato'::text)) EXECUTE FUNCTION tg_traccia_modifica();
CREATE TRIGGER assoc_delega_no_delete BEFORE DELETE ON public.assoc_delega FOR EACH ROW EXECUTE FUNCTION assoc_vieta_cancellazione();
CREATE TRIGGER assoc_delega_vincoli BEFORE INSERT OR UPDATE ON public.assoc_delega FOR EACH ROW EXECUTE FUNCTION assoc_delega_controlla();
CREATE TRIGGER assoc_delibera_voti BEFORE INSERT OR UPDATE ON public.assoc_delibera FOR EACH ROW EXECUTE FUNCTION assoc_delibera_controlla_voti();
CREATE TRIGGER trg_assoc_delibera_modifica BEFORE UPDATE ON public.assoc_delibera FOR EACH ROW EXECUTE FUNCTION assoc_traccia_modifica();
CREATE TRIGGER trg_assoc_delibera_no_delete BEFORE DELETE ON public.assoc_delibera FOR EACH ROW EXECUTE FUNCTION assoc_vieta_cancellazione();
CREATE TRIGGER trg_assoc_riunione_modifica BEFORE UPDATE ON public.assoc_riunione FOR EACH ROW EXECUTE FUNCTION assoc_traccia_modifica();
CREATE TRIGGER trg_assoc_riunione_no_delete BEFORE DELETE ON public.assoc_riunione FOR EACH ROW EXECUTE FUNCTION assoc_vieta_cancellazione();
CREATE TRIGGER convenzioni_updated_at BEFORE UPDATE ON public.convenzioni FOR EACH ROW EXECUTE FUNCTION tg_convenzioni_updated_at();
CREATE TRIGGER trg_dizio_updated BEFORE UPDATE ON public.dizionario_lemma FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_dizionario_slug BEFORE INSERT ON public.dizionario_lemma FOR EACH ROW EXECUTE FUNCTION dizionario_slug_auto();
CREATE TRIGGER trg_lemma_guardia_pubblicazione BEFORE INSERT OR UPDATE ON public.dizionario_lemma FOR EACH ROW EXECUTE FUNCTION tg_lemma_guardia_pubblicazione();
CREATE TRIGGER trg_punti_lemma AFTER INSERT OR UPDATE ON public.dizionario_lemma FOR EACH ROW EXECUTE FUNCTION tg_punti_lemma();
CREATE TRIGGER trg_traccia_lemma AFTER UPDATE ON public.dizionario_lemma FOR EACH ROW WHEN ((old.stato = ANY (ARRAY['pubblicato'::text, 'validato'::text, 'ritirato'::text]))) EXECUTE FUNCTION tg_traccia_modifica();
CREATE TRIGGER trg_blocca_approvazione_senza_incasso BEFORE UPDATE ON public.domande_tesseramento FOR EACH ROW EXECUTE FUNCTION blocca_approvazione_senza_incasso();
CREATE TRIGGER trg_donazione_guardia BEFORE INSERT OR UPDATE ON public.donazione_materiale FOR EACH ROW EXECUTE FUNCTION donazione_guardia();
CREATE TRIGGER trg_eventi_esterni_guardia BEFORE INSERT OR UPDATE ON public.eventi_esterni FOR EACH ROW EXECUTE FUNCTION eventi_esterni_guardia();
CREATE TRIGGER trg_eventi_esterni_slug BEFORE INSERT ON public.eventi_esterni FOR EACH ROW EXECUTE FUNCTION eventi_esterni_slug_auto();
CREATE TRIGGER trg_notifica_evento AFTER INSERT OR UPDATE OF stato ON public.eventi_esterni FOR EACH ROW EXECUTE FUNCTION notifica_evento_pubblicato();
CREATE TRIGGER trg_evento_updated_at BEFORE UPDATE ON public.evento FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notifica_evento AFTER INSERT OR UPDATE ON public.evento FOR EACH ROW EXECUTE FUNCTION tg_notifica_evento();
CREATE TRIGGER trg_forum_post_aggiorna_thread AFTER INSERT ON public.forum_post FOR EACH ROW EXECUTE FUNCTION aggiorna_ultimo_messaggio_thread();
CREATE TRIGGER trg_notifica_post AFTER INSERT ON public.forum_post FOR EACH ROW EXECUTE FUNCTION tg_notifica_post();
CREATE TRIGGER trg_punti_post_del AFTER DELETE ON public.forum_post FOR EACH ROW EXECUTE FUNCTION tg_punti_post_del();
CREATE TRIGGER trg_punti_post_ins AFTER INSERT ON public.forum_post FOR EACH ROW EXECUTE FUNCTION tg_punti_post_ins();
CREATE TRIGGER trg_punti_reazione_del AFTER DELETE ON public.forum_reazione FOR EACH ROW EXECUTE FUNCTION tg_punti_reazione_del();
CREATE TRIGGER trg_punti_reazione_ins AFTER INSERT ON public.forum_reazione FOR EACH ROW EXECUTE FUNCTION tg_punti_reazione_ins();
CREATE TRIGGER trg_notifica_thread AFTER INSERT ON public.forum_thread FOR EACH ROW EXECUTE FUNCTION tg_notifica_thread();
CREATE TRIGGER trg_punti_thread_del AFTER DELETE ON public.forum_thread FOR EACH ROW EXECUTE FUNCTION tg_punti_thread_del();
CREATE TRIGGER trg_punti_thread_ins AFTER INSERT ON public.forum_thread FOR EACH ROW EXECUTE FUNCTION tg_punti_thread_ins();
CREATE TRIGGER trg_lemma_relazione_canonica BEFORE INSERT OR UPDATE ON public.lemma_relazione FOR EACH ROW EXECUTE FUNCTION tg_lemma_relazione_canonica();
CREATE TRIGGER trg_luoghi_solo_direttivo_pubblica BEFORE INSERT OR UPDATE ON public.luoghi_interesse FOR EACH ROW EXECUTE FUNCTION luoghi_solo_direttivo_pubblica();
CREATE TRIGGER trg_registro_luoghi AFTER INSERT OR DELETE OR UPDATE ON public.luoghi_interesse FOR EACH ROW EXECUTE FUNCTION tg_registro_curatela();
CREATE TRIGGER trg_museo_gg_guardia BEFORE INSERT OR UPDATE ON public.museo_gg_pezzo FOR EACH ROW EXECUTE FUNCTION museo_gg_guardia_pubblicazione();
CREATE TRIGGER trg_museo_gg_slug BEFORE INSERT ON public.museo_gg_pezzo FOR EACH ROW EXECUTE FUNCTION museo_gg_slug_auto();
CREATE TRIGGER trg_notifica_museo AFTER INSERT OR UPDATE OF stato ON public.museo_gg_pezzo FOR EACH ROW EXECUTE FUNCTION notifica_museo_pubblicato();
CREATE TRIGGER trg_punti_museo AFTER UPDATE ON public.museo_gg_pezzo FOR EACH ROW EXECUTE FUNCTION tg_punti_museo();
CREATE TRIGGER trg_registro_museo AFTER INSERT OR DELETE OR UPDATE ON public.museo_gg_pezzo FOR EACH ROW EXECUTE FUNCTION tg_registro_curatela();
CREATE TRIGGER trg_traccia_museo AFTER UPDATE ON public.museo_gg_pezzo FOR EACH ROW WHEN ((old.stato = 'pubblicato'::text)) EXECUTE FUNCTION tg_traccia_modifica();
CREATE TRIGGER trg_museo_gg_raccolta_guardia BEFORE INSERT OR UPDATE ON public.museo_gg_raccolta FOR EACH ROW EXECUTE FUNCTION museo_gg_raccolta_guardia();
CREATE TRIGGER trg_museo_gg_raccolta_slug BEFORE INSERT ON public.museo_gg_raccolta FOR EACH ROW EXECUTE FUNCTION museo_gg_raccolta_slug_auto();
CREATE TRIGGER trg_notifica_raccolta AFTER INSERT OR UPDATE OF stato ON public.museo_gg_raccolta FOR EACH ROW EXECUTE FUNCTION notifica_raccolta_pubblicata();
CREATE TRIGGER notifica_push_ai AFTER INSERT ON public.notifica FOR EACH ROW EXECUTE FUNCTION notifica_push_webhook();
CREATE TRIGGER prima_nota_no_delete BEFORE DELETE ON public.prima_nota FOR EACH ROW EXECUTE FUNCTION assoc_vieta_cancellazione();
CREATE TRIGGER prima_nota_storico BEFORE UPDATE ON public.prima_nota FOR EACH ROW EXECUTE FUNCTION prima_nota_traccia();
CREATE TRIGGER trg_pubblicazione_updated_at BEFORE UPDATE ON public.pubblicazione FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notifica_livello AFTER INSERT ON public.punti_evento FOR EACH ROW EXECUTE FUNCTION tg_notifica_livello();
CREATE TRIGGER rendiconto_stato BEFORE INSERT OR UPDATE ON public.rendiconto FOR EACH ROW EXECUTE FUNCTION rendiconto_controlla_stato();
CREATE TRIGGER trg_sala_msg_updated BEFORE UPDATE ON public.sala_messaggio FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sala_voto_updated BEFORE UPDATE ON public.sala_votazione FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sala_voto_singolo_updated BEFORE UPDATE ON public.sala_voto FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_punti_storia AFTER UPDATE ON public.storia FOR EACH ROW EXECUTE FUNCTION tg_punti_storia();
CREATE TRIGGER trg_registro_storia AFTER INSERT OR DELETE OR UPDATE ON public.storia FOR EACH ROW EXECUTE FUNCTION tg_registro_curatela();
CREATE TRIGGER trg_storia_guardia BEFORE INSERT OR UPDATE ON public.storia FOR EACH ROW EXECUTE FUNCTION storia_guardia();
CREATE TRIGGER trg_traccia_storia AFTER UPDATE ON public.storia FOR EACH ROW WHEN ((old.pubblica IS TRUE)) EXECUTE FUNCTION tg_traccia_modifica();
CREATE TRIGGER trg_tesseramento_updated_at BEFORE UPDATE ON public.tesseramento FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_allinea_nome AFTER INSERT OR UPDATE OF nome, cognome ON public.utente FOR EACH ROW EXECUTE FUNCTION tg_allinea_nome_autenticazione();
CREATE TRIGGER trg_punti_arretrati_al_primo_accesso AFTER INSERT ON public.utente FOR EACH ROW EXECUTE FUNCTION tg_punti_arretrati_al_primo_accesso();
CREATE TRIGGER trg_punti_profilo AFTER UPDATE ON public.utente FOR EACH ROW WHEN (((new.avatar_url IS NOT NULL) AND (btrim(COALESCE(new.bio, ''::text)) <> ''::text))) EXECUTE FUNCTION tg_punti_profilo();
CREATE TRIGGER trg_utente_updated_at BEFORE UPDATE ON public.utente FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vocabolario_updated BEFORE UPDATE ON public.vocabolario_voce FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- 11a. GRANT E REVOCHE SULLE FUNZIONI (162) ----------------------------
-- Postgres concede EXECUTE a PUBLIC per ogni funzione appena creata: sotto,
-- la revoca esplicita dove il progetto l'ha tolta, e il grant a chi resta.
revoke execute on function public._process_wp_import() from public;
grant execute on function public._process_wp_import() to service_role;
revoke execute on function public.aggiorna_ultimo_messaggio_thread() from public;
grant execute on function public.aggiorna_ultimo_messaggio_thread() to service_role;
revoke execute on function public.ai_consuma_quota(p_utente_id uuid, p_ip_hash text, p_limite integer) from public;
grant execute on function public.ai_consuma_quota(p_utente_id uuid, p_ip_hash text, p_limite integer) to service_role;
revoke execute on function public.ai_incrementa_rate_limit(p_utente_id uuid, p_tokens_totali integer) from public;
grant execute on function public.ai_incrementa_rate_limit(p_utente_id uuid, p_tokens_totali integer) to service_role;
revoke execute on function public.ai_messaggi_rimanenti_oggi(p_utente_id uuid) from public;
grant execute on function public.ai_messaggi_rimanenti_oggi(p_utente_id uuid) to authenticated, service_role;
revoke execute on function public.ai_somma_token(p_utente_id uuid, p_ip_hash text, p_tokens integer) from public;
grant execute on function public.ai_somma_token(p_utente_id uuid, p_ip_hash text, p_tokens integer) to service_role;
grant execute on function public.annuncia_lemmi_pubblicati() to authenticated, service_role;
grant execute on function public.assemblea_quorum(p_riunione uuid) to anon, authenticated, service_role;
revoke execute on function public.assoc_cerca_delibere(p_termine text, p_anno integer, p_organo text, p_tag text) from public;
grant execute on function public.assoc_cerca_delibere(p_termine text, p_anno integer, p_organo text, p_tag text) to authenticated, service_role;
grant execute on function public.assoc_delega_controlla() to anon, authenticated, service_role;
grant execute on function public.assoc_delibera_controlla_voti() to anon, authenticated, service_role;
grant execute on function public.assoc_prossimo_numero(p_organo text, p_anno integer) to authenticated, service_role;
grant execute on function public.assoc_prossimo_numero_delibera(p_riunione uuid) to anon, authenticated, service_role;
grant execute on function public.assoc_traccia_modifica() to authenticated, service_role;
grant execute on function public.assoc_vieta_cancellazione() to anon, authenticated, service_role;
revoke execute on function public.associati_alla_data(p_data date) from public;
grant execute on function public.associati_alla_data(p_data date) to service_role;
revoke execute on function public.auth_otp_crea(p_email text, p_codice_hash text, p_ip inet, p_user_agent text) from public;
grant execute on function public.auth_otp_crea(p_email text, p_codice_hash text, p_ip inet, p_user_agent text) to service_role;
revoke execute on function public.auth_otp_pulizia() from public;
grant execute on function public.auth_otp_pulizia() to service_role;
revoke execute on function public.auth_otp_verifica(p_email text, p_codice_hash text) from public;
grant execute on function public.auth_otp_verifica(p_email text, p_codice_hash text) to service_role;
revoke execute on function public.aventi_diritto_voto(p_anno integer) from public;
grant execute on function public.aventi_diritto_voto(p_anno integer) to service_role;
revoke execute on function public.blocca_approvazione_senza_incasso() from public;
grant execute on function public.blocca_approvazione_senza_incasso() to service_role;
grant execute on function public.cerca_archivio(p_query text, p_limite integer) to anon, authenticated, service_role;
revoke execute on function public.cerca_soci(termine text) from public;
grant execute on function public.cerca_soci(termine text) to authenticated, service_role;
grant execute on function public.classifica_pilastro(p_titolo text, p_corpo text, p_categorie text[]) to anon, authenticated, service_role;
revoke execute on function public.cleanup_otp() from public;
grant execute on function public.cleanup_otp() to service_role;
revoke execute on function public.cleanup_rate_limit() from public;
grant execute on function public.cleanup_rate_limit() to service_role;
revoke execute on function public.collega_domanda_account(p_domanda_id uuid, p_account_id uuid) from public;
grant execute on function public.collega_domanda_account(p_domanda_id uuid, p_account_id uuid) to authenticated, service_role;
revoke execute on function public.collega_tessera(p_codice text) from public;
grant execute on function public.collega_tessera(p_codice text) to authenticated, service_role;
revoke execute on function public.conferma_ascolto(p_audio_id uuid) from public;
grant execute on function public.conferma_ascolto(p_audio_id uuid) to authenticated, service_role;
grant execute on function public.config_app_chiavi_pubbliche() to anon, authenticated, service_role;
revoke execute on function public.contante_consegnato(p_pagamento uuid) from public;
grant execute on function public.contante_consegnato(p_pagamento uuid) to authenticated, service_role;
revoke execute on function public.contanti_cerca_socio(p_query text) from public;
grant execute on function public.contanti_cerca_socio(p_query text) to authenticated, service_role;
revoke execute on function public.contanti_da_riconciliare() from public;
grant execute on function public.contanti_da_riconciliare() to authenticated, service_role;
revoke execute on function public.controlla_radar_eventi() from public;
grant execute on function public.controlla_radar_eventi() to service_role;
grant execute on function public.controllo_permessi_anon() to authenticated, service_role;
revoke execute on function public.convenzione_in_mappa(p_id uuid) from public;
grant execute on function public.convenzione_in_mappa(p_id uuid) to anon, authenticated, service_role;
revoke execute on function public.convenzioni_rl_hit(p_ip_hash text, p_max integer) from public;
grant execute on function public.convenzioni_rl_hit(p_ip_hash text, p_max integer) to service_role;
grant execute on function public.convocazione_termine(p_assemblea date, p_giorni_invio integer) to anon, authenticated, service_role;
revoke execute on function public.cruscotto_conta_domande() from public;
grant execute on function public.cruscotto_conta_domande() to authenticated, service_role;
revoke execute on function public.cruscotto_conta_soci_regola() from public;
grant execute on function public.cruscotto_conta_soci_regola() to authenticated, service_role;
revoke execute on function public.cruscotto_funzioni() from public;
grant execute on function public.cruscotto_funzioni() to authenticated, service_role;
revoke execute on function public.cruscotto_lavori() from public;
grant execute on function public.cruscotto_lavori() to authenticated, service_role;
revoke execute on function public.cruscotto_segna_controllo(p_controllo text) from public;
grant execute on function public.cruscotto_segna_controllo(p_controllo text) to authenticated, service_role;
revoke execute on function public.cruscotto_servizi() from public;
grant execute on function public.cruscotto_servizi() to authenticated, service_role;
grant execute on function public.dizionario_slug_auto() to anon, authenticated, service_role;
grant execute on function public.donazione_guardia() to anon, authenticated, service_role;
revoke execute on function public.e_socio_in_regola(p_utente_id uuid) from public;
grant execute on function public.e_socio_in_regola(p_utente_id uuid) to authenticated, service_role;
revoke execute on function public.email_residuo_giornaliero(p_tetto integer) from public;
grant execute on function public.email_residuo_giornaliero(p_tetto integer) to service_role;
grant execute on function public.eventi_esterni_guardia() to anon, authenticated, service_role;
grant execute on function public.eventi_esterni_slug_auto() to anon, authenticated, service_role;
revoke execute on function public.gam_add(p_utente uuid, p_tipo text, p_punti integer, p_riftipo text, p_rifid text, p_idemp boolean) from public;
grant execute on function public.gam_add(p_utente uuid, p_tipo text, p_punti integer, p_riftipo text, p_rifid text, p_idemp boolean) to service_role;
revoke execute on function public.gam_distintivo(p_utente uuid, p_codice text) from public;
grant execute on function public.gam_distintivo(p_utente uuid, p_codice text) to service_role;
revoke execute on function public.genera_otp(p_email text, p_scope text, p_ttl_min integer, p_max_tentativi integer, p_ip inet, p_user_agent text) from public;
grant execute on function public.genera_otp(p_email text, p_scope text, p_ttl_min integer, p_max_tentativi integer, p_ip inet, p_user_agent text) to service_role;
revoke execute on function public.geocodifica_prenota_slot() from public;
grant execute on function public.geocodifica_prenota_slot() to authenticated, service_role;
revoke execute on function public.get_mia_tessera() from public;
grant execute on function public.get_mia_tessera() to authenticated, service_role;
grant execute on function public.glossario_annulla_operazione(p_id uuid) to authenticated, service_role;
grant execute on function public.glossario_contributori_doppi() to authenticated, service_role;
grant execute on function public.glossario_correzione_blocco(p_ids uuid[], p_campo text, p_valore text, p_prova boolean) to authenticated, service_role;
grant execute on function public.glossario_definizione_sufficiente(p_definizione text, p_esempio text) to anon, authenticated, service_role;
grant execute on function public.glossario_lemma_completo(p_definizione text, p_esempi text, p_comune text, p_categoria text) to anon, authenticated, service_role;
grant execute on function public.glossario_lemma_e_mio(p_contributore_id uuid) to authenticated, service_role;
grant execute on function public.glossario_miei_lemmi() to authenticated, service_role;
grant execute on function public.glossario_norm(p text) to anon, authenticated, service_role;
grant execute on function public.glossario_pubblica_blocco(p_ids uuid[], p_prova boolean) to authenticated, service_role;
grant execute on function public.glossario_punti(p_chiave text, p_default numeric) to authenticated, service_role;
grant execute on function public.guardiani_digest_da_inviare() to authenticated, service_role;
grant execute on function public.has_ruolo(p_utente_id uuid, p_ruolo_nome text) to anon, authenticated, service_role;
grant execute on function public.has_ruolo(p_ruolo_nome text) to anon, authenticated, service_role;
grant execute on function public.has_ruolo_min(p_utente_id uuid, p_livello_min integer) to anon, authenticated, service_role;
grant execute on function public.has_ruolo_min(p_livello_min integer) to anon, authenticated, service_role;
grant execute on function public.immutable_unaccent(text) to anon, authenticated, service_role;
revoke execute on function public.invia_comunicazione_direttivo(p_titolo text, p_corpo text, p_url text) from public;
grant execute on function public.invia_comunicazione_direttivo(p_titolo text, p_corpo text, p_url text) to authenticated, service_role;
grant execute on function public.invio_da_concludere_entro(p_assemblea date) to anon, authenticated, service_role;
revoke execute on function public.lancia_coda_ascolto_promemoria(p_esegui boolean) from public;
grant execute on function public.lancia_coda_ascolto_promemoria(p_esegui boolean) to service_role;
revoke execute on function public.lancia_cruscotto_digest(p_esegui boolean) from public;
grant execute on function public.lancia_cruscotto_digest(p_esegui boolean) to service_role;
revoke execute on function public.lancia_guardiani_digest(p_esegui boolean) from public;
grant execute on function public.lancia_guardiani_digest(p_esegui boolean) to service_role;
revoke execute on function public.lancia_radar_classifica(p_esegui boolean, p_digest boolean) from public;
grant execute on function public.lancia_radar_classifica(p_esegui boolean, p_digest boolean) to service_role;
revoke execute on function public.lancia_radar_eventi(p_esegui boolean, p_solo text) from public;
grant execute on function public.lancia_radar_eventi(p_esegui boolean, p_solo text) to service_role;
revoke execute on function public.lancia_solleciti_quota(p_esegui boolean) from public;
grant execute on function public.lancia_solleciti_quota(p_esegui boolean) to service_role;
revoke execute on function public.livello_utente(u uuid) from public;
grant execute on function public.livello_utente(u uuid) to authenticated, service_role;
revoke execute on function public.luoghi_solo_direttivo_pubblica() from public;
grant execute on function public.luoghi_solo_direttivo_pubblica() to service_role;
revoke execute on function public.luogo_e_pubblico(p_luogo uuid) from public;
grant execute on function public.luogo_e_pubblico(p_luogo uuid) to anon, authenticated, service_role;
revoke execute on function public.match_kb_fulltext(q text, match_count integer) from public;
grant execute on function public.match_kb_fulltext(q text, match_count integer) to service_role;
revoke execute on function public.match_kb_fulltext(q text, match_count integer, solo_pubblici boolean) from public;
grant execute on function public.match_kb_fulltext(q text, match_count integer, solo_pubblici boolean) to service_role;
revoke execute on function public.match_kb_semantic(query_embedding vector, match_count integer, min_similarity numeric) from public;
grant execute on function public.match_kb_semantic(query_embedding vector, match_count integer, min_similarity numeric) to service_role;
revoke execute on function public.match_kb_semantic(query_embedding vector, match_count integer, min_similarity numeric, solo_pubblici boolean) from public;
grant execute on function public.match_kb_semantic(query_embedding vector, match_count integer, min_similarity numeric, solo_pubblici boolean) to service_role;
revoke execute on function public.memoria_fondo_bozza_lettura(p_slug text) from public;
grant execute on function public.memoria_fondo_bozza_lettura(p_slug text) to anon, authenticated, service_role;
revoke execute on function public.memoria_fondo_pubblico(p_fondo uuid) from public;
grant execute on function public.memoria_fondo_pubblico(p_fondo uuid) to anon, authenticated, service_role;
revoke execute on function public.memoria_persone_bozza_lettura(p_fondo_slug text) from public;
grant execute on function public.memoria_persone_bozza_lettura(p_fondo_slug text) to anon, authenticated, service_role;
grant execute on function public.museo_gg_guardia_pubblicazione() to anon, authenticated, service_role;
grant execute on function public.museo_gg_raccolta_guardia() to anon, authenticated, service_role;
grant execute on function public.museo_gg_raccolta_slug_auto() to anon, authenticated, service_role;
grant execute on function public.museo_gg_slug_auto() to anon, authenticated, service_role;
grant execute on function public.museo_gg_slugify(p_titolo text, p_id uuid) to anon, authenticated, service_role;
revoke execute on function public.next_codice_pratica() from public;
grant execute on function public.next_codice_pratica() to service_role;
grant execute on function public.notifica_articolo_pubblicato() to authenticated, service_role;
revoke execute on function public.notifica_broadcast(p_tipo text, p_titolo text, p_corpo text, p_url text) from public;
grant execute on function public.notifica_broadcast(p_tipo text, p_titolo text, p_corpo text, p_url text) to service_role;
grant execute on function public.notifica_evento_pubblicato() to authenticated, service_role;
grant execute on function public.notifica_lemma_pubblicato() to authenticated, service_role;
grant execute on function public.notifica_lemmi_pubblicati() to authenticated, service_role;
grant execute on function public.notifica_museo_pubblicato() to authenticated, service_role;
revoke execute on function public.notifica_push_webhook() from public;
grant execute on function public.notifica_push_webhook() to service_role;
grant execute on function public.notifica_raccolta_pubblicata() to authenticated, service_role;
grant execute on function public.ocr_oggetto_pubblico(p_tipo text, p_id uuid) to anon, authenticated, service_role;
grant execute on function public.peso_ruolo(p_utente_id uuid) to anon, authenticated, service_role;
grant execute on function public.plancia_avvisi() to authenticated, service_role;
grant execute on function public.plancia_integrita() to authenticated, service_role;
revoke execute on function public.plancia_numeri() from public;
grant execute on function public.plancia_numeri() to authenticated, service_role;
revoke execute on function public.plancia_salute() from public;
grant execute on function public.plancia_salute() to authenticated, service_role;
grant execute on function public.plancia_scadenze() to anon, authenticated, service_role;
revoke execute on function public.prepara_inviti_tesseramento(p_esegui boolean) from public;
grant execute on function public.prepara_inviti_tesseramento(p_esegui boolean) to authenticated, service_role;
grant execute on function public.prima_nota_traccia() to anon, authenticated, service_role;
revoke execute on function public.processa_email_outbox() from public;
grant execute on function public.processa_email_outbox() to service_role;
revoke execute on function public.proposta_decadenza(p_anno integer) from public;
grant execute on function public.proposta_decadenza(p_anno integer) to service_role;
revoke execute on function public.prossimo_numero_socio() from public;
grant execute on function public.prossimo_numero_socio() to service_role;
grant execute on function public.puo_gestione_associativa(p_utente uuid) to anon, authenticated, service_role;
grant execute on function public.push_dispositivi_attivi() to authenticated, service_role;
grant execute on function public.push_invito_da_mostrare() to authenticated, service_role;
grant execute on function public.push_invito_esito(p_accettato boolean) to authenticated, service_role;
revoke execute on function public.quadro_attivita(p_anno integer) from public;
grant execute on function public.quadro_attivita(p_anno integer) to authenticated, service_role;
revoke execute on function public.quota_anno(p_anno integer) from public;
grant execute on function public.quota_anno(p_anno integer) to service_role;
grant execute on function public.recesso_efficace_dal(p_comunicato date) to anon, authenticated, service_role;
revoke execute on function public.registra_battito(p_servizio text, p_esito text, p_dettaglio jsonb) from public;
grant execute on function public.registra_battito(p_servizio text, p_esito text, p_dettaglio jsonb) to service_role;
revoke execute on function public.rendiconto_cassa(p_anno integer) from public;
grant execute on function public.rendiconto_cassa(p_anno integer) to authenticated, service_role;
grant execute on function public.rendiconto_controlla_stato() to anon, authenticated, service_role;
revoke execute on function public.rendiconto_raccolte(p_anno integer) from public;
grant execute on function public.rendiconto_raccolte(p_anno integer) to authenticated, service_role;
grant execute on function public.rinnovo_sollecitabile(p_anno integer) to anon, authenticated, service_role;
grant execute on function public.salute_notifiche(p_giorni integer) to authenticated, service_role;
revoke execute on function public.scadi_ordini_creato_vecchi() from public;
grant execute on function public.scadi_ordini_creato_vecchi() to service_role;
revoke execute on function public.scarta_ascolto(p_audio_id uuid, p_motivo text) from public;
grant execute on function public.scarta_ascolto(p_audio_id uuid, p_motivo text) to authenticated, service_role;
revoke execute on function public.sentinella_pagine(p_esegui boolean) from public;
grant execute on function public.sentinella_pagine(p_esegui boolean) to service_role;
grant execute on function public.set_updated_at() to anon, authenticated, service_role;
grant execute on function public.slugifica(t text) to anon, authenticated, service_role;
revoke execute on function public.soci_al_anno(p_anno integer) from public;
grant execute on function public.soci_al_anno(p_anno integer) to service_role;
revoke execute on function public.soci_candidati_collegamento() from public;
grant execute on function public.soci_candidati_collegamento() to authenticated, service_role;
revoke execute on function public.soci_senza_ruolo() from public;
grant execute on function public.soci_senza_ruolo() to authenticated, service_role;
grant execute on function public.storia_guardia() to anon, authenticated, service_role;
revoke execute on function public.tessera_verifica(codice text) from public;
grant execute on function public.tessera_verifica(codice text) to anon, authenticated, service_role;
grant execute on function public.tg_allinea_nome_autenticazione() to anon, authenticated, service_role;
revoke execute on function public.tg_convenzioni_updated_at() from public;
grant execute on function public.tg_convenzioni_updated_at() to service_role;
grant execute on function public.tg_lemma_guardia_pubblicazione() to service_role;
grant execute on function public.tg_lemma_relazione_canonica() to service_role;
revoke execute on function public.tg_notifica_evento() from public;
grant execute on function public.tg_notifica_evento() to service_role;
revoke execute on function public.tg_notifica_livello() from public;
grant execute on function public.tg_notifica_livello() to service_role;
revoke execute on function public.tg_notifica_post() from public;
grant execute on function public.tg_notifica_post() to service_role;
revoke execute on function public.tg_notifica_thread() from public;
grant execute on function public.tg_notifica_thread() to service_role;
grant execute on function public.tg_punti_arretrati_al_primo_accesso() to authenticated, service_role;
revoke execute on function public.tg_punti_lemma() from public;
grant execute on function public.tg_punti_lemma() to service_role;
revoke execute on function public.tg_punti_museo() from public;
grant execute on function public.tg_punti_museo() to service_role;
revoke execute on function public.tg_punti_post_del() from public;
grant execute on function public.tg_punti_post_del() to service_role;
revoke execute on function public.tg_punti_post_ins() from public;
grant execute on function public.tg_punti_post_ins() to service_role;
revoke execute on function public.tg_punti_profilo() from public;
grant execute on function public.tg_punti_profilo() to service_role;
revoke execute on function public.tg_punti_reazione_del() from public;
grant execute on function public.tg_punti_reazione_del() to service_role;
revoke execute on function public.tg_punti_reazione_ins() from public;
grant execute on function public.tg_punti_reazione_ins() to service_role;
revoke execute on function public.tg_punti_storia() from public;
grant execute on function public.tg_punti_storia() to service_role;
revoke execute on function public.tg_punti_thread_del() from public;
grant execute on function public.tg_punti_thread_del() to service_role;
revoke execute on function public.tg_punti_thread_ins() from public;
grant execute on function public.tg_punti_thread_ins() to service_role;
grant execute on function public.tg_registro_curatela() to service_role;
grant execute on function public.tg_traccia_modifica() to authenticated, service_role;
grant execute on function public.unaccent_semplice(t text) to anon, authenticated, service_role;
revoke execute on function public.verifica_otp(p_email text, p_codice text, p_scope text) from public;
grant execute on function public.verifica_otp(p_email text, p_codice text, p_scope text) to service_role;
grant execute on function public.vocabolario_unisci(p_dominio text, p_da text, p_a text) to authenticated, service_role;

-- ---- 11b. GRANT E REVOCHE SU TABELLE E VISTE --------------------------------
-- Il default di schema (sotto, per riferimento, non eseguito qui: e' gia'
-- attivo in produzione e non appartiene a questo progetto) concede ad anon
-- select/references/trigger e ad authenticated tutti i privilegi su ogni
-- nuova tabella. Le righe seguenti sono gli scostamenti da quel default,
-- verificati oggetto per oggetto contro lo stato dal vivo.
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT SELECT, REFERENCES, TRIGGER ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO authenticated, service_role;
revoke select on public._mappa_img_wp from anon;
revoke all on public._mappa_img_wp from authenticated;
grant SELECT on public._mappa_img_wp to authenticated;
revoke select on public.ai_config_ruolo from anon;
revoke select on public.ai_rate_limit from anon;
revoke select on public.ai_rate_limit_pubblico from anon;
revoke select on public.anagrafica_modifica from anon;
revoke select on public.andreas_campagna from anon;
revoke select on public.andreas_canale from anon;
revoke select on public.andreas_kb from anon;
revoke select on public.andreas_kb_sorgente from anon;
revoke select on public.andreas_pubblicazione from anon;
revoke select on public.archivio_categoria from anon;
revoke select on public.archivio_documento from anon;
revoke select on public.articolo from anon;
revoke select on public.assoc_delega from anon;
revoke select on public.assoc_delibera from anon;
revoke select on public.assoc_documento from anon;
revoke select on public.assoc_modifica from anon;
revoke all on public.assoc_modifica from authenticated;
grant REFERENCES, SELECT, TRIGGER on public.assoc_modifica to authenticated;
revoke select on public.assoc_presenza from anon;
revoke select on public.assoc_riunione from anon;
revoke select on public.auth_otp from anon;
revoke select on public.comunicazione_destinatario from anon;
revoke all on public.comunicazione_destinatario from authenticated;
grant SELECT on public.comunicazione_destinatario to authenticated;
revoke select on public.comunicazione_istituzionale from anon;
revoke all on public.comunicazione_istituzionale from authenticated;
grant SELECT on public.comunicazione_istituzionale to authenticated;
revoke select on public.consenso from anon;
revoke select on public.contatti_progressivo from anon;
revoke select on public.convenzioni from anon;
revoke all on public.convenzioni_pubbliche from authenticated;
grant SELECT on public.convenzioni_pubbliche to authenticated;
revoke select on public.convenzioni_rate_limit from anon;
revoke select on public.corso from anon;
revoke select on public.corso_vetrina from anon;
revoke select on public.custodi_memoria from anon;
revoke select on public.deroga_quota from anon;
revoke select on public.distintivo from anon;
revoke select on public.dizionario_lemma from anon;
revoke select on public.documento_pubblico from anon;
revoke select on public.domande_tesseramento from anon;
revoke select on public.donazione_materiale from anon;
revoke select on public.download_lead from anon;
revoke select on public.email_outbox from anon;
revoke all on public.eventi_esterni_pubblici from authenticated;
grant SELECT on public.eventi_esterni_pubblici to authenticated;
revoke select on public.eventi_organizzatori_esclusi from anon;
revoke select on public.evento_iscrizione from anon;
revoke select on public.forum_media from anon;
revoke select on public.forum_post from anon;
revoke select on public.forum_reazione from anon;
revoke select on public.forum_thread from anon;
revoke select on public.forum_topic from anon;
revoke select on public.geocodifica_coda from anon;
revoke select on public.glossario_operazione from anon;
revoke all on public.glossario_pubblico from authenticated;
grant SELECT on public.glossario_pubblico to authenticated;
revoke select on public.guardiani_contributori from anon;
revoke select on public.guardiani_digest_invio from anon;
revoke select on public.import_log from anon;
revoke select on public.invito_tesseramento from anon;
revoke select on public.iscrizione_corso from anon;
revoke select on public.iscrizioni_gita from anon;
revoke select on public.lemma_commento from anon;
revoke select on public.lemma_correzione from anon;
revoke select on public.lemma_relazione from anon;
revoke select on public.lezione from anon;
revoke select on public.livello from anon;
revoke select on public.messaggio from anon;
revoke select on public.modifica_contenuto from anon;
revoke select on public.modulo_corso from anon;
revoke select on public.museo_gg_proposta from anon;
revoke select on public.newsletter from anon;
revoke select on public.newsletter_invio from anon;
revoke select on public.newsletter_iscritto from anon;
revoke select on public.notifica from anon;
revoke select on public.notifica_consegna from anon;
revoke select on public.notifica_preferenza from anon;
revoke select on public.pagamenti_tesseramento from anon;
revoke select on public.permesso_anon_lettura_attesa from anon;
revoke select on public.prima_nota from anon;
revoke select on public.progresso_lezione from anon;
revoke select on public.pubblicazione from anon;
revoke select on public.punti_evento from anon;
revoke select on public.push_invito from anon;
revoke select on public.push_token from anon;
revoke select on public.raccolta_fondi from anon;
revoke select on public.reazione from anon;
revoke select on public.reminder_super_admin from anon;
revoke select on public.rendiconto from anon;
revoke select on public.richieste_contatto from anon;
revoke select on public.ruolo from anon;
revoke select on public.sala_canale from anon;
revoke select on public.sala_messaggio from anon;
revoke select on public.sala_votazione from anon;
revoke select on public.sala_voto from anon;
revoke select on public.sentinella_pagina from anon;
revoke select on public.servizio from anon;
revoke select on public.servizio_battito from anon;
revoke select on public.solleciti_integrazione from anon;
revoke select on public.sollecito_quota from anon;
revoke select on public.spunto_settimana from anon;
revoke select on public.storia from anon;
revoke select on public.telegram_config from anon;
revoke select on public.telegram_link from anon;
revoke select on public.telegram_link_token from anon;
revoke select on public.telegram_notifica from anon;
revoke select on public.telegram_rate_limit from anon;
revoke select on public.tesseramento from anon;
revoke select on public.tesseramento_anno from anon;
revoke select on public.utente from anon;
revoke select on public.utente_distintivo from anon;
revoke select on public.utente_ruolo from anon;
revoke all on public.v_articoli_pubblici from authenticated;
grant SELECT on public.v_articoli_pubblici to authenticated;
revoke all on public.v_articoli_seo from authenticated;
grant SELECT on public.v_articoli_seo to authenticated;
revoke select on public.v_associati_istituzionale from anon;
revoke select on public.v_associati_per_indirizzo from anon;
revoke select on public.v_classifica from anon;
revoke all on public.v_classifica from authenticated;
grant SELECT on public.v_classifica to authenticated;
revoke select on public.v_coda_ascolto from anon;
revoke all on public.v_coda_ascolto from authenticated;
grant SELECT on public.v_coda_ascolto to authenticated;
revoke select on public.v_contanti_da_riconciliare from anon;
revoke all on public.v_convenzioni_mappa from authenticated;
grant SELECT on public.v_convenzioni_mappa to authenticated;
revoke select on public.v_cruscotto_code from anon;
revoke select on public.v_cruscotto_completezza from anon;
revoke all on public.v_custodi_memoria from authenticated;
grant SELECT on public.v_custodi_memoria to authenticated;
revoke select on public.v_forum_autore from anon;
revoke all on public.v_forum_autore from authenticated;
grant SELECT on public.v_forum_autore to authenticated;
revoke select on public.v_glossario_fuori_vocabolario from anon;
revoke select on public.v_glossario_qualita from anon;
revoke select on public.v_incassi from anon;
revoke all on public.v_luoghi_mappa from authenticated;
grant SELECT on public.v_luoghi_mappa to authenticated;
revoke all on public.v_luoghi_pagina from authenticated;
grant SELECT on public.v_luoghi_pagina to authenticated;
revoke all on public.v_memoria_fondo_pubblico from authenticated;
grant SELECT on public.v_memoria_fondo_pubblico to authenticated;
revoke select on public.v_modifiche_recenti from anon;
revoke select on public.v_newsletter_candidati_consenso from anon;
revoke select on public.v_newsletter_destinatari from anon;
revoke select on public.v_ocr_consumo from anon;
revoke all on public.v_posti_gita from authenticated;
grant SELECT on public.v_posti_gita to authenticated;
revoke select on public.v_sentinella_rotte from anon;
revoke select on public.v_servizi_stato from anon;
revoke select on public.v_soci_in_regola from anon;
revoke all on public.v_storia_pubblica from authenticated;
grant SELECT on public.v_storia_pubblica to authenticated;
revoke select on public.v_variante_candidate from anon;
revoke select on public.vista_ai_statistiche from anon;
revoke all on public.vista_ai_statistiche from authenticated;
grant SELECT on public.vista_ai_statistiche to authenticated;
revoke select on public.vocabolario_voce from anon;

-- Le 16 righe seguenti (tabelle/viste con ZERO grant ad authenticated,
-- verificate con NOT EXISTS anziche' con bool_or, che su un insieme vuoto
-- restituisce NULL e avrebbe fatto sparire in silenzio proprio questi 16)
-- azzerano anche il resto del default, non solo la select ad anon sopra.
revoke all on public.anagrafica_modifica from authenticated;
revoke all on public.deroga_quota from authenticated;
revoke all on public.geocodifica_coda from authenticated;
revoke all on public.newsletter_invio from authenticated;
revoke all on public.newsletter_iscritto from authenticated;
revoke all on public.servizio from authenticated;
revoke all on public.servizio_battito from authenticated;
revoke all on public.tesseramento_anno from authenticated;
revoke all on public.v_associati_istituzionale from authenticated;
revoke all on public.v_associati_per_indirizzo from authenticated;
revoke all on public.v_contanti_da_riconciliare from authenticated;
revoke all on public.v_incassi from authenticated;
revoke all on public.v_newsletter_candidati_consenso from authenticated;
revoke all on public.v_newsletter_destinatari from authenticated;
revoke all on public.v_servizi_stato from authenticated;
revoke all on public.v_soci_in_regola from authenticated;
