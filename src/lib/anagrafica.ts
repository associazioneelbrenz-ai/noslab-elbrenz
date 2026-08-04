// src/lib/anagrafica.ts — interruttore dei campi anagrafici nel modulo PUBBLICO
// di tesseramento (cognome separato, residenza, telefono).
//
// UNICA fonte di verità, valutata a BUILD TIME, come PAGAMENTI_LIVE:
//   false → i campi NON esistono nell'HTML della pagina. Non nascosti con il
//           CSS, non disabilitati: proprio assenti. Il modulo continua a
//           funzionare esattamente come prima.
//   true  → cognome e residenza obbligatori, telefono facoltativo.
//
// PERCHE' PARTE SPENTO, e non e' prudenza generica.
// L'informativa pubblicata su /privacy dichiara che il tesseramento NON
// raccoglie il numero di telefono. Era una scelta consapevole di
// minimizzazione fatta a luglio. Se il modulo comincia a chiedere telefono e
// residenza prima che l'informativa lo dica, l'informativa diventa falsa, e
// un'informativa falsa e' peggio di una scarna: la prima e' una violazione,
// la seconda solo una limitazione.
//
// COSA SERVE PER ACCENDERLO, nell'ordine:
//   1. la chat aggiorna il testo di /privacy con residenza e telefono, con la
//      finalita' e la base giuridica di ciascuno;
//   2. Cristian approva il testo e va online;
//   3. la chat conferma le etichette definitive e la riga che spiega a cosa
//      serve il telefono;
//   4. solo allora questo flag passa a true, poi build e deploy.
//
// Il pannello riservato al segretario usa gia' questi campi, e va bene: li'
// i dati li inserisce l'Associazione su persone che ha gia' nel registro
// cartaceo, non li raccoglie da un modulo pubblico.
//
// Stato al 4/8/2026: SPENTO, in attesa del punto 1.
export const ANAGRAFICA_PUBBLICA_LIVE = false;
