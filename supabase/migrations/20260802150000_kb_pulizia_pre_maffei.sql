-- Pulizia della KB di Andreas prima dell'ingestion di Maffei (IV.4.3).
-- Idempotente nei limiti del possibile: gia' applicata via MCP il 2/8.
-- «Riempire sopra un archivio mal classificato significa costruire sul falso.»
--
-- 1) Via le pagine di servizio del vecchio WordPress, giudicate una per una
--    sul contenuto e non sul titolo:
--    - «Contatti»: di servizio e DANNOSA (diceva «Presidente: Cristian
--      Bresadola»: una delle fonti della carica sbagliata).
--    - «Chi siamo»: testo promozionale del vecchio sito.
--    - «Portale Memoria»: pagina progetto del 2014, nominata dal brief.
--    - «Lo Statuto» (pagina WP): doppione dello Statuto 2014 gia' in KB come
--      documento_archivio, versione migliore (7 chunk contro 6).
--    «EUROPA» era candidata e RESTA: contenuto divulgativo vero.
--    Esito misurato: 316 -> 306 chunk. La FK e' ON DELETE CASCADE.
delete from public.andreas_kb_sorgente
 where titolo in ('Contatti', 'Chi siamo', 'Portale Memoria', 'Lo Statuto')
   and tipo_sorgente = 'articolo_rivista';

-- 2) L'etichetta onesta: i 109 post del vecchio sito erano «articolo_rivista»
--    ma articoli di rivista non sono. Il CHECK si estende con 'post_sito' e
--    con 'saggio_storico_sintesi' (default di ingest-chunks che il CHECK
--    avrebbe respinto).
alter table public.andreas_kb_sorgente drop constraint if exists andreas_kb_sorgente_tipo_sorgente_check;
alter table public.andreas_kb_sorgente add constraint andreas_kb_sorgente_tipo_sorgente_check
  check (tipo_sorgente = any (array[
    'libro', 'articolo_rivista', 'documento_archivio', 'pdf_digitalizzato',
    'trascrizione', 'nota_personale', 'manuale_linguistico', 'altro',
    'post_sito', 'saggio_storico_sintesi'
  ]));

update public.andreas_kb_sorgente
   set tipo_sorgente = 'post_sito'
 where tipo_sorgente = 'articolo_rivista';

-- NOTA a futura memoria: supabase/functions/ingest-articoli scrive ancora
-- tipo_sorgente='articolo_rivista'. Non si tocca ora (flusso funzionante,
-- non in uso), ma a un futuro rilancio andra' allineato a 'post_sito'.
