// src/lib/catastoStorico.ts — il catasto asburgico d'impianto come sfondo
// storico della mappa delle Valli.
//
// [4/8/2026] PERCHE' QUESTO FILE ESISTE VUOTO.
//
// Il livello non c'e' ancora, e non per una scelta: i fogli non sono
// raggiungibili. La licenza, quella si', e' a posto e permissiva (vedi in
// fondo). E' la fonte a essersi spostata:
//
//   - il dataset «Mappe storiche d'impianto» su dati.trentino.it ha UNA sola
//     risorsa, `catastotn.it/mappeStoriche.html`, che oggi risponde 301 verso
//     `openkat.it`, un portale autenticato del Libro Fondiario. Il servizio di
//     download aperto non esiste piu' a quell'indirizzo;
//   - il GeoServer provinciale (siat.provincia.tn.it) ha un solo workspace e
//     centonove livelli, e fra questi il catasto storico NON c'e': verificato
//     leggendo le capacita' per intero il 4/8/2026.
//
// Quindi qui c'e' il posto, non il contenuto. Il giorno che i fogli arrivano,
// accendere il livello e' UNA VOCE in `COPERTURE` e nient'altro: la mappa
// legge da qui e si comporta di conseguenza da sola.
//
// LA REGOLA CHE GOVERNA QUESTO FILE: finche' `COPERTURE` e' vuoto la mappa
// NON mostra un riquadro vuoto, dice che per quella zona la carta storica non
// c'e' ancora. Un'assenza spiegata e' informazione; un'assenza muta sembra un
// guasto, ed e' la lezione della giornata.

/** Un'area coperta dalla carta storica, con i suoi riquadri gia' generati. */
export type CoperturaStorica = {
  /** Comune catastale, come lo chiama il catasto: «Malè», non «Male'». */
  comuneCatastale: string;
  /** Modello dell'indirizzo dei riquadri, con {z}/{x}/{y}. */
  urlRiquadri: string;
  /** Confini dell'area coperta: [[sud, ovest], [nord, est]]. Fuori da qui il
   *  livello non si chiede nemmeno, cosi' non si bussa a vuoto. */
  confini: [[number, number], [number, number]];
  /** Ingrandimenti che hanno senso. Sotto il minimo il dettaglio non c'e' e i
   *  riquadri peserebbero senza aggiungere niente; sopra il massimo si vede
   *  solo la grana della scansione. */
  zoomMin: number;
  zoomMax: number;
  /** Anno o intervallo del rilievo, per la didascalia. */
  rilievo: string;
};

/**
 * LE AREE COPERTE. Vuoto di proposito: vedi in testa.
 *
 * Quando i fogli di Malè saranno disponibili, la voce sara' di questa forma
 * (confini da restringere su quelli veri del comune catastale):
 *
 *   {
 *     comuneCatastale: 'Malè',
 *     urlRiquadri: 'https://…/catasto-impianto/male/{z}/{x}/{y}.png',
 *     confini: [[46.33, 10.88], [46.38, 10.94]],
 *     zoomMin: 13,
 *     zoomMax: 18,
 *     rilievo: '1817-1855',
 *   }
 */
export const COPERTURE: CoperturaStorica[] = [];

/** C'e' almeno un'area coperta? */
export const catastoDisponibile = (): boolean => COPERTURE.length > 0;

/** L'area che copre un punto, se c'e'. */
export function coperturaPer(lat: number, lng: number): CoperturaStorica | null {
  return COPERTURE.find(({ confini: [[s, o], [n, e]] }) =>
    lat >= s && lat <= n && lng >= o && lng <= e) ?? null;
}

/** I comuni catastali coperti, per dirlo a chi guarda. */
export const comuniCoperti = (): string[] => COPERTURE.map((c) => c.comuneCatastale);

/**
 * L'ATTRIBUZIONE, che va mostrata SULLA MAPPA quando il livello e' acceso, non
 * nascosta in una pagina di crediti.
 *
 * La Provincia non impone una dicitura testuale: la pagina dei termini del
 * portale non esiste piu' (404 il 4/8/2026). Vale quindi il minimo che la
 * CC BY 4.0 chiede, costruito dai metadati del dataset stesso: autore,
 * titolare, licenza con collegamento, e l'indicazione che il materiale e'
 * stato modificato (i riquadri sono un'opera derivata dai fogli originali).
 */
export const ATTRIBUZIONE_CATASTO =
  'Mappe storiche d\'impianto © <a href="https://dati.trentino.it/dataset/mappe-storiche-d-impianto">'
  + 'Provincia Autonoma di Trento, Servizio catasto</a> · '
  + '<a href="https://creativecommons.org/licenses/by/4.0/deed.it">CC BY 4.0</a> · '
  + 'riquadri derivati dai fogli originali';

/**
 * La datazione. ATTENZIONE, e' un punto su cui non improvvisare: il dataset
 * della Provincia data le proprie mappe d'impianto al **1817-1855**. Altre
 * fonti parlano del rilievo tirolese completato nel 1861, che e' una fase
 * diversa dello stesso catasto francescano. Sulla pagina va la datazione della
 * fonte che stiamo effettivamente mostrando, non quella generale.
 *
 * Il testo divulgativo lo scrive la chat: qui c'e' solo il dato verificabile.
 */
export const DATAZIONE_FONTE = '1817-1855';
