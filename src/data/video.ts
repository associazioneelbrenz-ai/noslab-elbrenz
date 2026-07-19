/**
 * VIDEO DEL SITO — sorgente unica.
 *
 * NUOVO VIDEO: caricalo su YouTube, aggiungilo alla playlist della serie,
 * poi aggiungi una riga qui e fai il deploy. Le pagine si aggiornano da sole.
 *
 * Perche' un file e non una tabella: il sito e' statico e si ricostruisce solo
 * al push, quindi un database non darebbe aggiornamenti senza deploy. Un file
 * versionato e' anche la storia di cosa e' stato pubblicato e quando.
 *
 * NOTE SUI DATI (19/7/2026)
 * - Os dal Nos, Quinta edizione: la playlist YouTube ne dichiara 25, uno risulta
 *   "non disponibile / nascosto" lato YouTube, quindi ne restano 24; di questi,
 *   tre sono FUORI TEMA (mantra, frequenze, interviste) e restano commentati:
 *   pubblicati sono 21. Se un domani si includono, basta togliere il commento.
 * - Prima, Terza e Sesta edizione: playlist non ancora caricate.
 */

export type Video = {
  id_youtube: string;
  titolo: string;
  /** Solo per le serie divise per edizione. */
  edizione?: number;
  ordine: number;
  pubblicato: boolean;
};

export type Edizione = {
  n: number;
  anno: number;
  titolo: string;
  stato: 'pubblicata' | 'in-arrivo';
  /** Slug dell'articolo dell'edizione sul sito, quando esiste. */
  articolo?: string;
  video: Video[];
};

const v = (id: string, titolo: string, ordine: number, edizione?: number): Video =>
  ({ id_youtube: id, titolo, ordine, edizione, pubblicato: true });

/** Rubrica video breve, verticale (nata per i social). Ordine: dal piu' recente. */
export const MIGOLE = {
  titolo: 'Migole de storia',
  playlist: 'https://www.youtube.com/playlist?list=PLvZBASsUlIlcGKqVmut_V2Ezyha90neyQ',
  video: [
    v('GmywN-oqx6Y', 'Il Castello dei Pezzen di Croviana', 1),
    v('3mrBa1m47BQ', 'El Sant del Chjatar', 2),
    v('IGGTaFLgxrg', 'Roghi votivi del solstizio', 3),
    v('BwmdUa46ZXo', 'I Vichinghi nelle Valli del Noce', 4),
    v('oj_bwqbsldo', 'La cooperazione trentina', 5),
    v('3u2cpwmcT4M', 'Standschützen delle Valli del Noce', 6),
    v('VtURNFgsGZE', 'La tradizione dei Krampus', 7),
  ] as Video[],
};

/** Concorso poetico e musicale, video orizzontali, divisi per edizione. */
export const OS_DAL_NOS = {
  titolo: 'Os dal Nos',
  edizioni: [
    {
      n: 1, anno: 2014, titolo: 'Prima edizione', stato: 'in-arrivo',
      articolo: '1-concorso-poetico-musicale-os-dal-nos', video: [],
    },
    {
      n: 2, anno: 2015, titolo: 'Seconda edizione', stato: 'pubblicata',
      articolo: '2-edizione-del-concorso-musicale-e-poetico-os-dal-nos',
      video: [
        v('LGAayIHNtpk', 'Armonici Cantori Solandri – «Menegina»', 1, 2),
        v('iOZSllUjrSI', 'Felix Lalù – «La Parola del Amor»', 2, 2),
        v('UNwUjvRim2M', "Felix Lalù – «No che no ai vist l'ors»", 3, 2),
        v('_xZUNlNfG9U', "Sflantugem – «L'Ha fat nar le bece»", 4, 2),
        v('Hndz1bKkb0g', 'Nicola Costanzi – «Uei no, di de sì»', 5, 2),
        v('_v69q0P2YVU', 'Dina Larcher – «La Bancia»', 6, 2),
        v('nRqXO5PISGM', 'Paolo Bertagnolli – «La Vacia Nonesa»', 7, 2),
        v('LIaDF_-JUOE', 'Paolo Bertagnolli – «La cianzon del talian»', 8, 2),
      ],
    },
    {
      n: 3, anno: 2016, titolo: 'Terza edizione', stato: 'in-arrivo',
      articolo: '3-edizione-del-concorso-poetico-musicale-os-dal-nos', video: [],
    },
    {
      n: 4, anno: 2017, titolo: 'Quarta edizione', stato: 'pubblicata',
      articolo: '4-edizione-del-concorso-poetico-musicale-os-dal-nos',
      video: [
        v('YqjSNZn1Zbw', 'After Movie Os dal Nos 2017 – 4ª edizione', 1, 4),
        v('oenKDybUvUk', 'Cogni pousar – cover di Paolo Bertagnolli', 2, 4),
        v('FePoZT5eWGU', "No no no che no ai vist l'ors – cover Felix Lalù", 3, 4),
        v('5wS3CkoQaKs', 'Val di Non 2050 – cover Felix Lalù', 4, 4),
        v('UOG_AWjnaYM', 'Arent a ti', 5, 4),
        v('M4MKDHVO0cc', 'Vei – originale del Cola (Nicola Costanzi)', 6, 4),
        v('BimC3YWBgcw', 'Stele Alpine (Stelutis Alpinis)', 7, 4),
        v('qvFkxyGBZiY', 'La Zostra de la vita – Giordano Cova', 8, 4),
        v('Ge1zWvawBUo', 'Dame en bicer – Vagabonds & Travelling Band', 9, 4),
        v('WXGyahu94VE', 'I Monti del Paradis – Dolores Keller', 10, 4),
        v('w7RxessBpMY', "El foch de Sant'Antoni – Vagabonds & Travelling Band", 11, 4),
        v('q2mCtRvtaUs', 'Senza titol – Fabio Widman', 12, 4),
        v('IJaPR7wEJ8Y', 'Ancoi come ieri – poesia di Renata Zanini', 13, 4),
        v('q6pEeI8bP60', 'Stele porete', 14, 4),
      ],
    },
    {
      n: 5, anno: 2018, titolo: 'Quinta edizione', stato: 'pubblicata',
      articolo: 'os-dal-nos-2018-5-edizione',
      video: [
        v('Xkl_ERT9Se0', 'After Movie Os dal Nos 2018 – 5ª edizione', 1, 5),
        v('DpL40yDfTQg', 'Meti el trei', 2, 5),
        v('wqlsrhL_yxc', 'Fret', 3, 5),
        v('Wu2Obd78Ffo', 'Le Parti', 4, 5),
        v('aOwKzcB5lGc', 'En dopodisnar', 5, 5),
        v('JrqnT3QSvZ8', 'Cole Me Doi Man – Felix Lalù e le Lova Lova Lovarìe', 6, 5),
        v('V_Jt00ML0nk', "L'amor", 7, 5),
        v('t4Y3iqOeZ9A', 'La chjazon del foch', 8, 5),
        v('W6dY0F8CnbY', 'La vacia nonesa', 9, 5),
        v('9ohh-k2DmgM', 'La me val', 10, 5),
        v('6uWEdHHkKMk', 'Storia di vita nonesa leggermente romanzata', 11, 5),
        v('vJE5SACeAIU', 'El progresso', 12, 5),
        v('CcA157SbMHw', 'La noela', 13, 5),
        v('goS2L3Zsynk', "Ngot l'è come empar", 14, 5),
        v('tQImb_Tj3IY', 'Pan de levà', 15, 5),
        v('vzcndd7U7oQ', 'Cento ani fa', 16, 5),
        v('l7jmHM2VzT4', 'Semper pu soli', 17, 5),
        v('UeKJgdGlHl0', 'Mesda i crauti', 18, 5),
        v('UefVwxH_D1k', 'Ent el seitan', 19, 5),
        v('Lkuks5Uhc9c', 'La neu – Felix Lalù e La Discoteca de Falive', 20, 5),
        v('vDPrCCV7tSg', 'Benedizione Celtica – Celtic Blessing', 21, 5),
        // FUORI TEMA, non pubblicati (vedi nota in testa al file):
        // v('RMIm3e-5_B4', "Mantra Ho'oponopono 108 volte", 22, 5),
        // v('e5jprOVMieA', 'Musica 417 Hz campane tibetane', 23, 5),
        // v('Ok-9UblYVkg', 'IPPOCRATE – Le interviste impossibili', 24, 5),
      ],
    },
    {
      n: 6, anno: 2019, titolo: 'Sesta edizione', stato: 'in-arrivo',
      articolo: 'os-dal-nos-2019-iscrizioni-aperte', video: [],
    },
  ] as Edizione[],
};

/** Miniatura statica di YouTube: nessun iframe, nessuna richiesta a Google al load. */
export const miniatura = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
/** Embed senza cookie di profilazione, coerente con la gestione cookie del sito. */
export const embed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;
