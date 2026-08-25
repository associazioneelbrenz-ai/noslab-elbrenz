-- La RLS di memoria_persona chiama memoria_fondo_pubblico(fondo_id) per
-- decidere se una riga e' leggibile da anonimo. Mancava l'EXECUTE per anon:
-- la sezione pubblica falliva in silenzio (0 righe, nessun errore visibile
-- lato client se non nei log del build) per qualunque visitatore reale, non
-- solo in fase di generazione statica. Scoperto costruendo le pagine di
-- reparto/provenienza, che leggono TUTTE le persone come anonimo.
grant execute on function public.memoria_fondo_pubblico(uuid) to anon;
