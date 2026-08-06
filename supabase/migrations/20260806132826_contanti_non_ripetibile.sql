-- [6/8/2026] Due invii ravvicinati dello stesso versamento devono produrre UNA
-- riga sola, comunque vada la risposta e per quante volte si prema.
--
-- Il caso reale: la risposta della funzione non arriva al telefono, chi ha
-- incassato non sa se e' passato, riprova. Su una registrazione di cassa il
-- doppione non e' un fastidio: e' un errore contabile che poi qualcuno deve
-- trovare e stornare.
--
-- Il vincolo sta sul DATABASE e non nel modulo, perche' e' l'unico posto che
-- vale per tutti i chiamanti e per tutte le condizioni di rete. Chiave:
-- stessa persona, stesso tipo, stesso importo, stesso giorno, stesso metodo.
-- Si escludono gli annullati, altrimenti uno storno impedirebbe per sempre di
-- registrare di nuovo lo stesso versamento (che e' proprio cio' che si fa dopo
-- uno storno).
create unique index if not exists pagamenti_contanti_non_ripetibile
  on public.pagamenti_tesseramento (lower(email), tipo, importo, incassato_il, metodo)
  where metodo = 'contanti' and stato = 'completato' and annullato_il is null;;
