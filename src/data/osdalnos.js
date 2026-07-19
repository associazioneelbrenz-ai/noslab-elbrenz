/**
 * Os dal Nos — concorso poetico e musicale delle parlate retoromanze delle
 * Valli del Noce. Sorgente unica dei video per la pagina /os-dal-nos: per
 * aggiungere un'edizione o un brano si tocca solo questo file.
 *
 * NOTE SUI DATI (19/7/2026)
 * - Quinta edizione: la playlist YouTube ne dichiara 25 ma uno risulta
 *   "non disponibile / nascosto" lato YouTube, quindi qui ce ne sono 24.
 *   Non e' un'omissione: quel video non e' recuperabile senza intervento
 *   sul canale.
 * - Sempre nella Quinta, la playlist contiene tre video FUORI TEMA (mantra,
 *   frequenze, interviste): restano commentati qui sotto, non pubblicati.
 *   Se un domani si decide di includerli, basta togliere il commento.
 */
export const osDalNos = {
  titolo: 'Os dal Nos',
  descrizione:
    'Il concorso poetico e musicale delle parlate retoromanze delle Valli del Noce.',
  edizioni: [
    { n: 1, anno: 2014, stato: 'in-arrivo', titolo: 'Prima edizione', video: [] },
    {
      n: 2, anno: 2015, stato: 'pubblicata', titolo: 'Seconda edizione',
      video: [
        { t: 'Armonici Cantori Solandri – «Menegina»', yt: 'LGAayIHNtpk' },
        { t: 'Felix Lalù – «La Parola del Amor»', yt: 'iOZSllUjrSI' },
        { t: "Felix Lalù – «No che no ai vist l'ors»", yt: 'UNwUjvRim2M' },
        { t: "Sflantugem – «L'Ha fat nar le bece»", yt: '_xZUNlNfG9U' },
        { t: 'Nicola Costanzi – «Uei no, di de sì»', yt: 'Hndz1bKkb0g' },
        { t: 'Dina Larcher – «La Bancia»', yt: '_v69q0P2YVU' },
        { t: 'Paolo Bertagnolli – «La Vacia Nonesa»', yt: 'nRqXO5PISGM' },
        { t: 'Paolo Bertagnolli – «La cianzon del talian»', yt: 'LIaDF_-JUOE' },
      ],
    },
    { n: 3, anno: 2016, stato: 'in-arrivo', titolo: 'Terza edizione', video: [] },
    {
      n: 4, anno: 2017, stato: 'pubblicata', titolo: 'Quarta edizione',
      video: [
        { t: 'After Movie Os dal Nos 2017 – 4ª edizione', yt: 'YqjSNZn1Zbw' },
        { t: 'Cogni pousar – cover di Paolo Bertagnolli', yt: 'oenKDybUvUk' },
        { t: "No no no che no ai vist l'ors – cover Felix Lalù", yt: 'FePoZT5eWGU' },
        { t: 'Val di Non 2050 – cover Felix Lalù', yt: '5wS3CkoQaKs' },
        { t: 'Arent a ti', yt: 'UOG_AWjnaYM' },
        { t: 'Vei – originale del Cola (Nicola Costanzi)', yt: 'M4MKDHVO0cc' },
        { t: 'Stele Alpine (Stelutis Alpinis)', yt: 'BimC3YWBgcw' },
        { t: 'La Zostra de la vita – Giordano Cova', yt: 'qvFkxyGBZiY' },
        { t: 'Dame en bicer – Vagabonds & Travelling Band', yt: 'Ge1zWvawBUo' },
        { t: 'I Monti del Paradis – Dolores Keller', yt: 'WXGyahu94VE' },
        { t: "El foch de Sant'Antoni – Vagabonds & Travelling Band", yt: 'w7RxessBpMY' },
        { t: 'Senza titol – Fabio Widman', yt: 'q2mCtRvtaUs' },
        { t: 'Ancoi come ieri – poesia di Renata Zanini', yt: 'IJaPR7wEJ8Y' },
        { t: 'Stele porete', yt: 'q6pEeI8bP60' },
      ],
    },
    {
      n: 5, anno: 2018, stato: 'pubblicata', titolo: 'Quinta edizione',
      video: [
        { t: 'After Movie Os dal Nos 2018 – 5ª edizione', yt: 'Xkl_ERT9Se0' },
        { t: 'Meti el trei', yt: 'DpL40yDfTQg' },
        { t: 'Fret', yt: 'wqlsrhL_yxc' },
        { t: 'le Parti', yt: 'Wu2Obd78Ffo' },
        { t: 'En dopodisnar', yt: 'aOwKzcB5lGc' },
        { t: 'Cole Me Doi Man – Felix Lalù e le Lova Lova Lovarìe', yt: 'JrqnT3QSvZ8' },
        { t: "L'amor", yt: 'V_Jt00ML0nk' },
        { t: 'La chjazon del foch', yt: 't4Y3iqOeZ9A' },
        { t: 'la vacia nonesa', yt: 'W6dY0F8CnbY' },
        { t: 'La me val', yt: '9ohh-k2DmgM' },
        { t: 'Storia di vita nonesa leggermente romanzata', yt: '6uWEdHHkKMk' },
        { t: 'El progresso', yt: 'vJE5SACeAIU' },
        { t: 'La noela', yt: 'CcA157SbMHw' },
        { t: "Ngot l'è come empar", yt: 'goS2L3Zsynk' },
        { t: 'Pan de levà', yt: 'tQImb_Tj3IY' },
        { t: 'Cento ani fa', yt: 'vzcndd7U7oQ' },
        { t: 'Semper pu soli', yt: 'l7jmHM2VzT4' },
        { t: 'Mesda i crauti', yt: 'UeKJgdGlHl0' },
        { t: 'Ent el seitan', yt: 'UefVwxH_D1k' },
        { t: 'La neu – Felix Lalù e La Discoteca de Falive', yt: 'Lkuks5Uhc9c' },
        { t: 'Benedizione Celtica – Celtic Blessing', yt: 'vDPrCCV7tSg' },
        // FUORI TEMA, non pubblicati (vedi nota in testa al file):
        // { t: "Mantra Ho'oponopono 108 volte", yt: 'RMIm3e-5_B4' },
        // { t: 'Musica 417 Hz campane tibetane', yt: 'e5jprOVMieA' },
        // { t: 'IPPOCRATE – Le interviste impossibili', yt: 'Ok-9UblYVkg' },
      ],
    },
    { n: 6, anno: 2019, stato: 'in-arrivo', titolo: 'Sesta edizione', video: [] },
  ],
};
