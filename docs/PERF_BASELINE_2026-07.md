# Performance — misura di riferimento (Blocco B0)

**19 luglio 2026** · Lighthouse 12, profilo **mobile** (rete lenta simulata), sito live.

## Metodo (leggere prima dei numeri)

La prima misura era a **esecuzione singola** e si e' rivelata inaffidabile: tre giri
consecutivi sulla stessa pagina, nello stesso momento, hanno dato **76, 93, 91**
di punteggio e un TBT da **640 ms a 30 ms**. Su un sito live dietro CDN la varianza
di Lighthouse e' enorme, soprattutto su TBT e punteggio complessivo.

Quindi: **mediana di 3 esecuzioni**, con min-max riportato. Un confronto
prima/dopo che non superi l'ampiezza min-max non e' un miglioramento: e' rumore.

**LCP e CLS sono i valori affidabili** (variano poco tra i giri). Il punteggio
complessivo e il TBT vanno letti come indicativi.

## Riferimento

| pagina | perf (mediana) | min-max | LCP | CLS | TBT |
|---|---|---|---|---|---|
| home | 59 | 55-63 | 4,4 s | 0.000 | 1.258 ms |
| articolo (festaval-sole-2013) | 87 | 82-89 | 3,5 s | 0.000 | 216 ms |
| mappa | 85 | 82-92 | 3,0 s | 0.001 | 462 ms |
| luogo (castel-valer) | 82 | 75-87 | 3,2 s | 0.000 | 452 ms |

## Obiettivi di chiusura del blocco
- Performance >= 90 mobile su articolo e luoghi · >= 80 sulla mappa
- CLS < 0,1 ovunque · LCP < 2,5 s

## Lettura
- **CLS gia' in obiettivo ovunque** (0.000-0.001): le dimensioni dichiarate sulle
  immagini funzionano. Su questo non serve intervenire.
- **Mappa gia' in obiettivo** (85 >= 80).
- **Articolo 87 e luogo 82**: sotto il 90 richiesto, ma dentro la fascia di rumore.
- **LCP fuori obiettivo ovunque** (3,0-4,4 s contro 2,5 s): e' il vero lavoro che resta,
  ed e' anche la metrica piu' affidabile.
- **La home resta il caso serio**: 59, con TBT oltre il secondo. Il collo di bottiglia
  non e' JavaScript (script evaluation 224 ms) ma **Style & Layout: 3,3 s** su una
  pagina molto lunga e ricca di sezioni.

## Interventi gia' applicati (B1, B3)
- Copertine in home servite ridimensionate via trasformazioni Storage
  (360 KB -> 40 KB a width=400) con srcset e sizes. Archivio non toccato.
- preconnect + dns-prefetch verso Storage.
- Font, branding, leaflet: da `max-age=0` ad anno pieno immutable.

Il guadagno di questi interventi **non e' distinguibile dal rumore** nel punteggio
complessivo: si giustificano sui numeri assoluti (byte trasferiti, richieste
rivalidate), non sul punteggio Lighthouse.
