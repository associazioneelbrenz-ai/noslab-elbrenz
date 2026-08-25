-- Archivio dei nomi, fondo cimitero-militare-male: geometria della
-- planimetria (brief 25/8/2026, §3.3). Ricostruzione a serpentina dalla
-- cianografia (dott. Mariotti): nove file da ventiquattro nel cimitero
-- militare, posizioni approssimate per le ventuno tombe militari nel
-- cimitero civile. Da verificare sul documento originale prima di
-- considerarla definitiva — vedi anche l'avvertenza nella pagina del fondo.
update public.memoria_fondo
set planimetria_geo = '{
  "righe": [
    [24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
    [25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48],
    [72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49],
    [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96],
    [120,119,118,117,116,115,114,113,112,111,110,109,108,107,106,105,104,103,102,101,100,99,98,97],
    [121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144],
    [168,167,166,165,164,163,162,161,160,159,158,157,156,155,154,153,152,151,150,149,148,147,146,145],
    [169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192],
    [217,216,215,214,213,212,211,210,209,208,207,206,205,204,203,202,201,200,199,198,197,196,195,194]
  ],
  "civpos": {
    "1": [71,4], "2": [62,4], "3": [31,17], "4": [40,17], "5": [49,17], "6": [58,17],
    "7": [62,30], "8": [30,30], "9": [21,30], "10": [30,41], "11": [60,41], "12": [45,52],
    "13": [21,64], "14": [30,64], "15": [66,64], "16": [66,75], "17": [30,75],
    "18": [30,86], "19": [21,86], "20": [21,96], "21": [30,96]
  },
  "nota": "Ricostruzione a serpentina dalla cianografia, dott. Mariotti: nove file da ventiquattro nel militare, da verificare sul documento prima di considerarla definitiva. Civile: posizioni approssimate."
}'::jsonb
where slug = 'cimitero-militare-male';
