-- La pagina articolo passa a leggere dal database (decisione del 2/8/2026):
-- servono anche i campi SEO e l'autore, che finora la pagina prendeva dal
-- frontmatter markdown e dal ponte legacy_wp_id -> v_articoli_seo.
-- Stanno tutti sulla stessa riga di `articolo`, quindi il ponte sparisce.
--
-- Le colonne nuove sono APPESE IN CODA: create or replace view non consente di
-- riordinare quelle esistenti.
--
-- noindex e' esposto di proposito: serve alla pagina per decidere il meta
-- robots, e non e' un'informazione riservata (dice solo che non vogliamo un
-- pezzo nei motori).
create or replace view public.v_articoli_pubblici as
  select id, titolo, slug, sottotitolo, estratto, corpo_html,
         immagine_copertina_url, pilastro, tags, categorie_slug,
         tipo_contenuto, in_evidenza, tempo_lettura_min, pubblicato_at,
         meta_title, meta_description, immagine_alt, noindex,
         wp_autore_originale, wp_legacy_id
  from public.articolo
  where pubblicato = true
    and stato = 'pubblicato'
    and tipo_contenuto = 'post';

revoke insert, update, delete, truncate, references, trigger
  on public.v_articoli_pubblici from anon, authenticated;
