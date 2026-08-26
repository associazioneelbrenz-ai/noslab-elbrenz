-- Stesso difetto trovato su memoria_fondo_pubblico: luogo_e_pubblico() e' il guardiano
-- della lettura pubblica di toponimo_attestazione, ma anon non poteva eseguirla.
-- Una policy di SELECT pubblica che chiama una funzione non eseguibile da chi legge
-- fallisce in silenzio: la tabella risulta vuota invece di dare errore.
-- La funzione non espone nulla: risponde solo se un luogo gia' pubblico e' pubblico.
grant execute on function public.luogo_e_pubblico(uuid) to anon;;
