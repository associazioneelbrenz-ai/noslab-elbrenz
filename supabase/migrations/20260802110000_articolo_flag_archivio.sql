-- Il flag `archivio` esisteva SOLO nel frontmatter markdown, e distingue la
-- sala di lettura storica (/archivio-storico) dagli articoli di produzione.
-- Passando il sito a leggere dal database quel dato sarebbe andato perso e
-- /archivio-storico sarebbe rimasto l'ultimo consumatore di una sorgente
-- congelata. Qui il flag entra nel database e si travasa dai file.
--
-- Perche' NON si usa wp_legacy_id come criterio, che sarebbe stato comodo:
-- ce l'hanno 107 righe su 108 (tutte tranne l'articolo nuovo), mentre gli
-- articoli marcati archivio nel markdown sono 56. Non e' un sinonimo di
-- «legacy»: e' una scelta editoriale su cosa mostrare in produzione e cosa
-- mettere in sala di lettura, e va portata a mano.
--
-- Esito verificato dopo il travaso: 56 in archivio, 52 in produzione, gli
-- stessi numeri che dava il markdown.
alter table public.articolo add column if not exists archivio boolean not null default false;

update public.articolo
   set archivio = true
 where slug = any (array[
  '24-maggio-1915-il-baule-della-memoria','303','535',
  'aeroplani-nemici-trento-la-mostra-torre-vanga',
  'arcadia-musica-e-sapori-22-e-23-giugno-2013',
  'archeologia-numismatica-val-sole-nuova-pubblicazione-del-centro-studi-la-val-sole',
  'assemblea-annuale-el-brenz','avanti-tutta','bentornati',
  'buon-compleanno-maria-teresa-revo-casa-campia-12-maggio-2017','buon-viaggio-amico',
  'cavalcata-oswald-von-wolkenstein-ritt-2013',
  'concorso-di-poesia-nuove-parole-comune-di-vermiglio',
  'concorso-fotografico-e-stage-il-bosco-luomo-la-biodiversita-convivenze-e-conoscenze-tras-parenti',
  'conferenza-in-diretta-el-brenz-rezia-e-union-ladin-nonesa-insieme-per-il-censimento',
  'esn-euregio-meeting-dal-16-al-19-maggio-2013',
  'esperienza-scambio-docenti-trentino-tirolo-s-201314',
  'euregio-economia-agricoltura-e-turismo','euregio-energia-ambiente-e-risorse-naturali',
  'euregio-luogo-del-mese','euregio-news-dalleuropa','euregio-news',
  'euregio-prosegue-lexport-talenti-musicali-uploadsounds','euregio-summer-camp-2013',
  'europa','european-cooperation-day-2013','festival-gioventu-2014',
  'giornata-dellautonomia-il-5-settembre',
  'giovani-ricercatori-cercansi-lanciata-nuova-edizione-del-concorso','gita-a-innsbruck',
  'grande-esempio-di-collaborazione-ed-amicizia',
  'i-raduno-multiepocale-gruppi-storici-in-trentino',
  'i-suoni-delle-dolomiti-in-cammino-verso-la-musica-sulle-montagne-del-trentino',
  'il-torggelen-nella-val-disarco','incontro-dibattito-e-cena-dellalleanza-dei-cuochi',
  'innsbruck-ci-chiama-un-viaggio-tra-storia-tirolese-e-grandi-emozioni',
  'la-nosa-storia-n-piaza','la-regione-di-pilsen-si-presenta-al-castello-del-buonconsiglio',
  'le-donne-internate-italia-la-grande-guerra-esperienze-scritture-memorie',
  'le-lacrime-delle-dolomiti-di-sesto','le-reliquie-di-san-romedio-saranno-esposte-al-pubblico',
  'libera-circolazione-dei-lavoratori','mostra-conoscere-vicino-realta-vecchia-piu-secolo',
  'natale-2013-buone-feste-tutti','passeggiata-tra-i-sapori-dalta-quota-val-di-rabbi',
  'plurilingue-e-transfrontaliero-workshop-euregio-su-capitale-della-cultura-2019',
  'presentazione-del-libro-hande-auf-tirol-le-mani-sul-tirolo-di-giuseppe-matuella',
  'progetti-culturali-euregio','ritorno-al-padre-presentazione-del-libro-di-loretta-zanella',
  'storie-emigrati-guerrieri-dalla-val-rabbi','sui-fronti-di-galizia-centenario-della-grande-guerra',
  'suns-2013-2',
  'termine-delle-iscrizioni-al-premio-giovani-ricercatori-delleuregio-2013-esteso-fino-al-15-giugno-2013',
  'un-regalo-speciale-per-il-nostro-compleanno-nasce-la-nuova-community-online-di-el-brenz',
  'uploadsounds-2013-musica-senza-confini','viviamo-lacqua'
]);

-- Il flag entra nella vista, appeso in coda come le altre aggiunte del 2/8.
create or replace view public.v_articoli_pubblici as
  select id, titolo, slug, sottotitolo, estratto, corpo_html,
         immagine_copertina_url, pilastro, tags, categorie_slug,
         tipo_contenuto, in_evidenza, tempo_lettura_min, pubblicato_at,
         meta_title, meta_description, immagine_alt, noindex,
         wp_autore_originale, wp_legacy_id, archivio
  from public.articolo
  where pubblicato = true
    and stato = 'pubblicato'
    and tipo_contenuto = 'post';

revoke insert, update, delete, truncate, references, trigger
  on public.v_articoli_pubblici from anon, authenticated;
