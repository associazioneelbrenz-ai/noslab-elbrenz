-- [8/8/2026] I punti dei lemmi si perdevano quando il lemma nasceva gia' pubblicato.
--
-- IL DIFETTO. trg_punti_lemma era dichiarato solo su UPDATE. La funzione dentro
-- gestiva gia' il caso della nascita (`OLD.stato is null`), quindi il codice era
-- pronto: mancava l'evento. Un lemma inserito direttamente come 'pubblicato' -
-- cosa che succede negli inserimenti in blocco e in certi flussi di curatela -
-- non ha mai fruttato niente a nessuno.
--
-- Chi ne ha fatto le spese: @LADIN NONES 4 lemmi, Cristian 2, Marco Bertagnolli
-- 2, Roberta 5. Non un errore di calcolo: un lavoro fatto e non riconosciuto.
--
-- E' la stessa famiglia dei difetti di questi giorni: la macchina c'era, non era
-- collegata al momento giusto.
drop trigger if exists trg_punti_lemma on dizionario_lemma;
create trigger trg_punti_lemma
  after insert or update on dizionario_lemma
  for each row execute function tg_punti_lemma();

-- Gli arretrati sono stati riconosciuti con lo stesso meccanismo e la stessa
-- idempotenza del trigger (gam_add con p_idemp), quindi chi aveva gia' avuto il
-- punto non lo ha ricevuto due volte. Chi non ha un account non riceve nulla e
-- non e' un errore: i punti vivono sull'account, e il giorno che si iscrive la
-- stessa passata glieli riconoscera'.
