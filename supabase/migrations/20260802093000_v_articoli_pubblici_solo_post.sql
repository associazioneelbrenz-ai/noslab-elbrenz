-- v_articoli_pubblici restituiva anche 27 righe con tipo_contenuto = 'pagina':
-- le vecchie pagine WordPress migrate (Contatti, Lo Statuto, Chi siamo,
-- Photogallery, «Anno 2010»…«Anno 2014», glossary). Quindici hanno il corpo
-- COMPLETAMENTE VUOTO. Finivano nel carosello articoli dell'app come se
-- fossero pezzi veri, e facevano sembrare che i due corpus (markdown del sito
-- e tabella articolo) divergessero di 27 pezzi quando non divergevano affatto.
--
-- Con il filtro, vista e file markdown coincidono. Le pagine restano nella
-- tabella `articolo`: non si cancella nulla, semplicemente non sono articoli e
-- non entrano in una vista che si chiama «articoli pubblici».
--
-- Nota: il filtro era gia' stato messo il 2/8 nelle due query di
-- src/lib/home.ts dell'app, come rimedio immediato senza toccare un oggetto
-- condiviso. Ora che sta alla fonte quello resta ridondante ma innocuo, ed e'
-- bene che ci sia: protegge se un domani la vista cambia di nuovo.
create or replace view public.v_articoli_pubblici as
  select id, titolo, slug, sottotitolo, estratto, corpo_html,
         immagine_copertina_url, pilastro, tags, categorie_slug,
         tipo_contenuto, in_evidenza, tempo_lettura_min, pubblicato_at
  from public.articolo
  where pubblicato = true
    and stato = 'pubblicato'
    and tipo_contenuto = 'post';

-- La vista e' auto-aggiornabile e di proprieta' di postgres: senza questa
-- revoca si potrebbe scrivere sulla tabella sottostante con la chiave
-- pubblica, scavalcando la RLS. Stessa ragione del punto 0.2 dell'audit: il
-- create or replace ricrea l'oggetto e i grant vanno riapplicati.
revoke insert, update, delete, truncate, references, trigger
  on public.v_articoli_pubblici from anon, authenticated;
