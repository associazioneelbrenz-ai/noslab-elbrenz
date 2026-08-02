-- Colonna additiva per contare gli esiti del funnel (brief 2/8 §3.3): gli UTM
-- di Andreas sono gia' nei link verso /dona, ma le donazioni in denaro non
-- avevano dove atterrare. La valorizzazione dal flusso PayPal si fara' di
-- giorno, con la possibilita' di collaudare un pagamento vero: questa
-- migration intanto prepara la colonna senza cambiare nulla di esistente.
alter table public.pagamenti_tesseramento
  add column if not exists sorgente_utm text;
