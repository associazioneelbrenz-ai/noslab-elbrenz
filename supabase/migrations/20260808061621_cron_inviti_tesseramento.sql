-- [8/8/2026] L'innesco settimanale degli inviti. Lunedi' alle 8:20.
--
-- Parte con p_esegui => true, ma NON manda nulla: dentro la funzione c'e'
-- l'interruttore `inviti_tesseramento_attivi`, spento per difetto. Finche' e'
-- giu' il cron gira a vuoto e non scrive una riga. Il giorno che Cristian lo
-- alza, la catena e' gia' in piedi e collaudata: si cambia un dato, non il
-- codice, e non serve un deploy.
--
-- Una volta a settimana e non ogni giorno perche' l'invito e' un gesto raro per
-- costruzione: chi ha superato la soglia oggi la superera' anche lunedi'.
select cron.schedule(
  'inviti-tesseramento-settimanale',
  '20 8 * * 1',
  $$select public.prepara_inviti_tesseramento(p_esegui => true)$$
);
