# Bozza · richiesta al Servizio catasto per le mappe d'impianto di Malè

**Da approvare e inviare da Cristian.** Non è stata spedita: una lettera a un
ufficio pubblico la firma il segretario, non il sistema.

- **A:** `servizio.catasto@provincia.tn.it`
- **Da:** `info@elbrenz.eu`
- **Oggetto:** Richiesta mappe d'impianto del Comune catastale di Malè

---

## Testo

Spettabile Servizio catasto,

vi scriviamo dall'**Associazione Storico Culturale Linguistica El Brenz delle
Valli del Noce**, associazione di promozione sociale con sede a Malè, in via
Trento 40, attiva dal dicembre 2009 nella ricerca e nella divulgazione della
storia, della lingua e della cultura materiale delle Valli del Noce.

Vorremmo chiedervi come ottenere le **mappe d'impianto del Comune catastale di
Malè**: il quadro d'unione e i fogli, nella forma con i file di
georeferenziazione, così come li distribuite per comune catastale.

**A che cosa ci servono.** Stiamo costruendo una mappa dei luoghi storici delle
nostre valli, pubblica e gratuita, sul sito dell'Associazione. Vorremmo
aggiungere il catasto d'impianto come sfondo che il visitatore può accendere e
regolare in trasparenza, per confrontare il paese di oggi con quello
dell'Ottocento. Per un'associazione come la nostra è il modo più diretto di far
vedere a chi ci vive quanto è cambiato il territorio, e di farlo su una fonte
d'archivio invece che su un racconto.

Cominceremmo da Malè, che è anche il comune dove l'Associazione ha sede, per
capire come funziona prima di estendere agli altri comuni delle valli.

**Sull'uso.** Abbiamo verificato che il dataset «Mappe storiche d'impianto» è
pubblicato su dati.trentino.it con licenza **Creative Commons Attribuzione 4.0**
e titolarità della Provincia autonoma di Trento. Ci atterremo a quanto la
licenza richiede: l'attribuzione sarà visibile sulla mappa quando lo sfondo
storico è attivo, nella forma

> Mappe storiche d'impianto, Provincia autonoma di Trento, Servizio catasto,
> CC BY 4.0, riquadri derivati dai fogli originali

e indicheremo che le immagini sono state trasformate in riquadri per la
visualizzazione sul web, senza alterarne il contenuto. Se preferite una
diversa formula di citazione, ce lo dite e la adottiamo.

Nessun uso commerciale: il sito è senza pubblicità e la consultazione è libera.

Restiamo a disposizione per qualunque chiarimento sull'uso che ne faremo, e vi
ringraziamo per il lavoro di pubblicazione di questo patrimonio.

Cordiali saluti,

**Cristian Bresadola**
Segretario
Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce
Via Trento 40, 38027 Malè (TN)
info@elbrenz.eu · +39 347 107 7636 · elbrenz.eu

*Raìs fonde no le 'nglacia*

---

## Quando arriva la risposta

Se mandano i fogli, il lavoro lato sito è già pronto e serve solo:

1. generare i riquadri (**attenzione: GDAL non è installato sulla macchina**, va
   messo prima);
2. decidere dove ospitarli, repository o Supabase Storage, sui numeri veri;
3. aggiungere **una voce** in `COPERTURE` dentro `src/lib/catastoStorico.ts`.

Il pannello sulla mappa, la trasparenza, l'avviso fuori area e l'attribuzione
si accendono da soli. Vedi la voce in `docs/REGISTRO_LAVORI.md`, sezione D.
