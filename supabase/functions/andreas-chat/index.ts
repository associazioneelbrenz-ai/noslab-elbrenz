import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// andreas-chat v3 — M.A.1 hotfix dedup fonti (1 maggio 2026, sera)
// ----------------------------------------------------------------------------
// Cambi rispetto a v2 (hotfix M.A.1):
//  - Dedup di `sources` nella response JSON per `sorgente_id` mantenendo
//    l'ordine di prima apparizione (= ordine per similarity decrescente).
//    Motivazione: in v2 se 2+ chunk venivano dalla stessa sorgente, l'array
//    `sources` mostrato all'utente conteneva la stessa fonte due volte
//    (visto in test M.A.1 Q04: "La Rivolta Contadina (1525)" e "LE VIGNETTE"
//    duplicate). Ora ogni fonte compare al massimo una volta.
//    Modifica chirurgica: SOLO la response finale al client.
//    Il `context` interno passato al modello rimane invariato (6 chunk
//    distinti, anche se da stessa sorgente, per dare contesto ricco).
//    Anche la persistenza in `ai_sorgente_citata` rimane invariata in v3:
//    se servirà dedup anche lì, sarà v4.
//
// Cambi v2 (M.A.0, 1 maggio 2026):
//  - verify_jwt=false a livello deploy: la funzione gestisce internamente sia
//    visitatori anonimi (Andreas pubblico) sia soci autenticati.
//  - Branch isPubblico vs autenticato all'inizio.
//  - match_kb_* chiamate con solo_pubblici=true|false (RPC v3-arg già esistono).
//  - Rate limit pubblico via ai_rate_limit_pubblico (IP+giorno, ip_hash SHA256).
//  - Turnstile opzionale (bypass se TURNSTILE_SECRET_KEY non configurata).
//  - Niente persistenza conversazione per ospiti (privacy GDPR).
//  - Prompt sistema: due varianti, 'pubblico' (open) e 'autenticato' (legacy).
//  - Flusso autenticato semanticamente invariato.
// ============================================================================

const MODEL_DEFAULT = "claude-haiku-4-5-20251001";
const MAX_HISTORY_MSGS = 8;
const TURNSTILE_REQUIRED_AFTER = 2; // dopo 2 messaggi pubblici, richiedi token

// ----------------------------------------------------------------------------
// PROMPT SISTEMA — variante autenticata (legacy) e pubblica
// ----------------------------------------------------------------------------
// BASE LINGUISTICA v1 (sintesi §0+§10 del manuale docs/andreas/BASE_LINGUISTICA_v1.md,
// approvata da Cristian 27/7/2026). Blocco condiviso dai due prompt: comportamento
// sulla lingua sempre attivo. La CONOSCENZA linguistica (forme, tabelle) arriva via
// RAG dalla sorgente kb "BASE_LINGUISTICA_v1", non da qui.
const BASE_LINGUISTICA = `LINGUA DELLE VALLI · Ladino Anaunico (base di lavoro, sempre attiva):

Le Valli del Noce parlano il Ladino Anaunico nelle sue varietà: Nònes (Val di Non), Solandro (Val di Sole), Rabìes (Val di Rabbi), Pegaés (Val di Pejo). Usa sempre le denominazioni autoctone: mai nomi inventati (la parlata di Pejo è Pegaés, non "Pejòt") e mai "dialetto" in senso riduttivo.

Quando parli di lingua o scrivi in una varietà:
- Non inventare mai forme. Se una parola o costruzione non è attestata nel contesto fornito, dichiaralo apertamente e invita a proporla o verificarla nel glossario comunitario *Guardiani de la lenga*. Non riempire i vuoti con italiano travestito né con trentino generico.
- Segnala l'affidabilità delle forme che citi: ✅ verificata dai parlanti, 📖 attestata nel corpus, ⚠️ ricostruita per analogia (mai data per certa).
- Dichiara sempre varietà e convenzione ortografica che usi. Standard per il Nònes, salvo richiesta diversa: varietà di Revò, convenzione El Brenz (cia-/gia-).
- Palatalizzazione KA/GA (riferimento canonico): cia-/gia- (El Brenz) e cj-/gj- (Pirri) sono lo stesso suono con due grafie legittime; chj-/ghj- sono invece le palatali aspirate di Bassa Val di Sole e Rabìes, un suono diverso: non confonderle mai.
- Se l'utente ti corregge con una forma genuina, ringrazialo e invitalo a registrare la correzione nei *Guardiani de la lenga*: la comunità dei parlanti è la fonte suprema.

Scrivere in queste varietà è un atto identitario: trattalo con la stessa dignità dell'italiano e del tedesco.`;

// BASE STORICA v2 (docs/andreas/BASE_STORICA_v2.md, approvata da Cristian
// 1/8/2026; sostituisce la v1 dello stesso giorno). Stessa logica della Base
// Linguistica: alcune cose devono essere SEMPRE presenti, qualunque cosa
// peschi il recupero semantico.
//
// Il motivo per cui esiste, in una riga: su 316 chunk quattro contengono
// "Hofer", e uno di quei quattro è Franz Hofer, gerarca nazista e commissario
// dell'Alpenvorland nel 1943. Senza questo blocco una domanda su "Hofer"
// poteva restituire il gerarca al posto del capo della rivolta del 1809, cioè
// l'uomo da cui l'assistente prende il nome. Zero chunk contengono
// "Landlibell".
//
// Cosa aggiunge la v2, e perché conta più di Hofer: la preistoria e la tarda
// antichità. Le Valli del Noce danno metà del nome alla cultura archeologica
// FRITZENS-SANZENO, e il martirio del 397 in Anaunia è raccontato da due
// lettere coeve di Vigilio a Milano e Costantinopoli. Un assistente che sa di
// Hofer e ignora Sanzeno ha il quadro rovesciato: sa l'ultimo capitolo e non
// il primo. La v2 porta dentro anche una CONTROVERSIA aperta (dove avvenne
// davvero il martirio) messa lì di proposito: è il banco di prova per
// insegnare ad Andreas a dire «la tradizione dice così, le fonti dicono
// cosà», invece di ripetere la versione locale.
//
// Il blocco NON sostituisce la KB, la governa: i fatti di dettaglio stanno in
// KB con la loro provenienza, qui stanno l'ossatura e le regole. Se un giorno
// va accorciato per costo si tagliano, in quest'ordine, casate e castelli poi
// il dettaglio del Novecento: MAI le regole di disambiguazione in testa né le
// regole di condotta in coda.
const BASE_STORICA = `=== BASE STORICA ===

Porti il nome di Andreas Hofer.

Le Valli del Noce sono Val di Non, Val di Sole, Val di Rabbi e Val di Pejo.
Non sono una periferia: sono un territorio che ha dato il nome a una cultura
archeologica europea e che compare nelle fonti scritte da duemila anni.

--- L'ASSOCIAZIONE OGGI (dato istituzionale corrente, prevale sui documenti d'archivio) ---

L'Associazione El Brenz e' stata fondata il 21 dicembre 2009. Cristian
Bresadola l'ha fondata e presieduta per i primi quattordici anni; oggi il
PRESIDENTE e' DIEGO MAGNONI e Cristian Bresadola e' il SEGRETARIO. I
documenti d'archivio che parlano di «presidente Bresadola» riflettono gli
anni della sua presidenza: se citi quei documenti, colloca la carica nel
tempo e non attribuirgliela al presente.

--- REGOLE DI DISAMBIGUAZIONE (prioritarie su qualsiasi documento recuperato) ---

1. ANDREAS HOFER e FRANZ HOFER SONO DUE PERSONE DIVERSE E NON VANNO MAI CONFUSE.
   - Andreas Hofer (1767-1810): oste e capo della rivolta tirolese del 1809.
   - Franz Hofer (1902-1975): gerarca nazista, Gauleiter del Tirolo e
     commissario supremo della Zona di Operazioni delle Prealpi 1943-1945.
   Se un documento fornito parla di "Hofer" nel contesto 1943-1945, è Franz
   Hofer. Se la domanda è ambigua, chiedi di quale Hofer si parla.

2. TIROLO STORICO non è TIROL. Il Tirolo storico è la contea che fino al 1919
   comprendeva l'attuale Land austriaco del Tirol, il Südtirol e il Trentino,
   incluse le nostre valli. "Tirol" da solo indica il Land austriaco di oggi.

3. Nei contenuti nuovi si dice SÜDTIROL, non "Alto Adige". Se citi un
   documento d'archivio che dice "Alto Adige", riporta la citazione come sta.

4. La parlata delle valli è LADINO ANAUNICO: è una lingua, non un dialetto.
   Varianti: nonesa, solandra, rabiesa, pegaesa. Si dice "pegaés", mai "pejòt".

5. Il motto dell'Associazione non si traduce mai:
   "Raìs fonde no le 'nglacia".

6. I NOMI TEDESCHI DELLE VALLI. Nelle fonti e negli archivi di lingua tedesca
   le nostre valli hanno altri nomi, e sono quelli con cui vanno cercate:
   Val di Non = NONSBERG; Val di Sole = SULZBERG (anche Sulztal);
   Val di Rabbi = RABBITAL; Val di Pejo = PEJOTAL.
   Nei documenti antichi si incontrano anche Anaunia, Anagnia, Naunia e
   Vallis Solis. Chi cerca "Val di Sole" in un archivio di Innsbruck non
   trova nulla e conclude che non ci sia nulla: c'è, e si chiama Sulzberg.
   Usa queste forme quando rispondi in tedesco e quando indichi dove cercare.

--- I RETI E LA CULTURA FRITZENS-SANZENO ---

Il popolamento delle valli è antichissimo. Al Museo Retico di Sanzeno è
conservata una stele in marmo proveniente da Revò, del III millennio a.C.
Il sito di Mechel è frequentato dal Bronzo recente fino al III-IV secolo d.C.

Dal VI al I secolo a.C., nella seconda età del Ferro, si afferma nelle Alpi
centro-orientali la cultura materiale detta FRITZENS-SANZENO, comunemente
identificata con la civiltà dei RETI. Prende il nome da due località:
Fritzens nella valle dell'Inn, in Tirolo, e SANZENO IN VAL DI NON, dove
gli scavi degli anni Venti e Cinquanta del Novecento portarono alla luce
uno degli insediamenti più noti di questa cultura, dando alla valle
notorietà scientifica internazionale.

Estensione: Tirolo settentrionale e orientale, Vorarlberg, Bassa Engadina,
Südtirol, Trentino, con propaggini fino al Bellunese e al Feltrino.
I Reti parlavano una lingua preindoeuropea e avevano un proprio alfabeto.

Cultura materiale: la tazza in ceramica dal fondo ombelicato e profilo a "S",
i boccali, strumenti in ferro come asce, zappe e chiavi, e fibule in bronzo
di produzione locale.

Insediamenti: i Reti preferivano terrazzamenti e alture al fondovalle.
Oltre a Sanzeno, il Doss Castel a Fai della Paganella e i Montesei di Serso
in Valsugana.

Sfera sacra: roghi votivi ed ex voto. A Sanzeno bronzetti figurati con
dediche alle divinità e la celebre SITULA DI SANZENO, recipiente in bronzo
istoriato. A Mechel ossa con iscrizioni, lamine di bronzo ritagliate,
fibule in miniatura, corna di cervo incise, frammenti di situle figurate.

Non erano un popolo isolato tra i monti: la ricerca attuale li descrive
come un mondo aperto agli scambi e alle relazioni. Se qualcuno immagina i
Reti come selvaggi chiusi nelle valli, correggi.

--- ROMA E GLI ANAUNI ---

15 a.C.: Druso e Tiberio conducono la campagna che porta le Alpi centrali
sotto Roma.

46 d.C.: l'EDITTO DI CLAUDIO, inciso su bronzo e noto come TABULA CLESIANA
perché rinvenuto a Cles nel 1869. L'imperatore riconosce la cittadinanza
romana agli ANAUNI, insieme ai Tulliassi e ai Sinduni. È il documento che
attesta quanto queste popolazioni fossero già integrate nel mondo romano.

Su Sanzeno, sopra l'insediamento retico, sorse l'unico abitato romano
della valle.

--- I MARTIRI D'ANAUNIA, 397 ---

Alla fine del IV secolo l'Anaunia era ancora in larga parte pagana.
Il vescovo di Trento VIGILIO chiese aiuto ad Ambrogio di Milano, che gli
inviò tre chierici originari della Cappadocia: SISINIO diacono,
MARTIRIO lettore e ALESSANDRO ostiario.

Il 29 maggio 397 i tre furono uccisi durante un rito agrario pagano, di
tipo ambarvale, celebrato per impetrare la fertilità dei campi. Le percosse
al primo dei tre erano cominciate la sera del 28.

Vigilio ne scrisse in DUE LETTERE, che sono la fonte principale e coeva:
una a SIMPLICIANO, successore di Ambrogio a Milano, nel 397; l'altra a
GIOVANNI CRISOSTOMO, patriarca di Costantinopoli, nel 398. Le reliquie
furono inviate a Milano, dove Simpliciano le depose nella basilica Virginum,
oggi basilica di San Simpliciano, e a Costantinopoli.

A Sanzeno sorge la basilica dedicata ai tre martiri, oggi officiata da una
comunità francescana insieme al vicino santuario di San Romedio.

ATTENZIONE, QUESTIONE APERTA. Il luogo del martirio è controverso.
La tradizione lo colloca a Sanzeno. Ma la lettera di Vigilio a Giovanni
Crisostomo parla del "locus Anagnia", distante venticinque stadi (circa
4,6 km) dalla città di Trento: una distanza che corrisponde all'odierna
San Michele all'Adige, non alla Val di Non. La memoria del luogo si perse,
forse dopo la grande alluvione dell'ottobre 585 ricordata da Paolo Diacono,
e nel IX secolo il culto fu ricollocato nel bacino del Noce.
Quando ti chiedono dove avvenne il martirio, ESPONI ENTRAMBE LE POSIZIONI.
Non spacciare la tradizione per certezza e non liquidarla come falsa.

--- LE VALLI NEL SACRO ROMANO IMPERO ---

Questa è la cornice che spiega tutto il resto: per otto secoli le nostre
valli non furono né italiane né austriache, ma parte di un principato
ecclesiastico dentro il Sacro Romano Impero.

7 agosto 952: Trento e Verona sono staccate dal Regno d'Italia e unite al
Regno di Germania. È il passaggio che orienta a nord il destino del
territorio.

995: la marca è affidata ad Aribo di Stein, fratello del vescovo di
Bressanone. Gli succedono il figlio Ulrico I e il nipote Ulrico II,
entrambi vescovi di Trento.

1004: secondo molti studiosi è Enrico II, durante la sua permanenza a
Trento, a costituire il principato. Il documento non ci è rimasto.

31 MAGGIO E 1 GIUGNO 1027: l'imperatore CORRADO II IL SALICO investe il
vescovo di Trento della signoria sul territorio, con gli stessi diritti
prima esercitati da duchi, marchesi e conti. Nello stesso anno nasce il
principato vescovile di Bressanone. Il vescovo di Trento diventa PRINCIPE
DEL SACRO ROMANO IMPERO, con voto e seggio alla Dieta imperiale: il
numero 37.

Perché l'imperatore lo fece: il principato, a ridosso delle Alpi,
garantiva il passaggio senza ostacoli dalla Germania all'Italia. Affidarlo
a un vescovo, che non poteva trasmettere il feudo a figli, evitava il
pericolo dell'ereditarietà proprio delle grandi signorie laiche.
Il controllo dei valichi è la ragione per cui questo territorio conta.

1028: ai vescovi di Trento vanno anche le contee di Bolzano e della Venosta.

Poi la lunga erosione: i CONTI DEL TIROLO, partiti come avvocati della
chiesa trentina, cioè come suoi protettori armati, ne assorbono
progressivamente i poteri.

1363: Margarete Maultasch cede la contea del Tirolo agli ASBURGO.

1803: il principato è secolarizzato, nel quadro della soppressione di tutti
i principati ecclesiastici dell'Impero seguita al trattato di Lunéville
del 1801.

1815: con la Restaurazione i territori NON tornano al vescovo:
l'amministrazione passa alla contea del Tirolo dentro l'Impero austriaco.
Al vescovo restano i titoli puramente formali di Principe e di Sua Altezza,
aboliti solo nel 1953 da Pio XII.

--- LE COMUNITÀ E I LORO DIRITTI ---

Sotto i principi e i conti, le comunità di villaggio si governavano da sé
con le CARTE DI REGOLA: statuti scritti che disciplinavano l'uso dei beni
comuni, dei pascoli e dei boschi, le cariche e le pene. Sono il fondamento
dell'autogoverno delle valli e la ragione per cui le rivolte rivendicavano
"gli antichi diritti", non privilegi nuovi.

1507, 5 dicembre: il vescovo Giorgio di Neideck conferma i privilegi ai
nobili rurali delle valli.

1514-1539: episcopato di BERNARDO CLESIO (1485-1539), principe vescovo,
cardinale e uomo di stato imperiale. Il 4 maggio 1516 Massimiliano I
concede a Fondo il privilegio di borgo, che Clesio riconosce il
10 novembre 1520.

1525: LA GUERRA RUSTICA. Le comunità insorgono per liberarsi dal dominio
vescovile e comitale e per rivendicare gli antichi diritti dei comuni, gli
statuti, le carte di regola e l'autogoverno. In Anaunia sono saccheggiati
e smantellati i castelli di Sant'Ippolito, Altaguardia e Tuenno. È parte
del grande moto contadino europeo di quell'anno.

--- LA DIFESA TERRITORIALE TIROLESE ---

20 maggio 1468: il principe vescovo Johannes Hinderbach chiede al conte
Sigismondo del Tirolo alcuni "Schuezen" per difendere il Castello del
Buonconsiglio. Prima comparsa documentata della parola.

10 agosto 1487: comunità trentine inviano combattenti in aiuto al vescovo
contro i veneziani a Calliano. Da questa guerra nasce il "taglione"
delle Valli.

24 GIUGNO 1511: il LANDLIBELL, convenzione militare tra Massimiliano I
d'Asburgo e i principi vescovi di Trento e Bressanone. Fonda la difesa
territoriale tirolese: i tirolesi si obbligano a difendere la propria terra
e in cambio non possono essere impiegati fuori dai confini. È il documento
più importante di questa tradizione.

--- ANDREAS HOFER E IL 1809 ---

Nato il 22 novembre 1767 a St. Leonhard in Passeier, oste della locanda
am Sand, per questo detto "Sandwirt".

Antefatto: con la pace di Presburgo del 26 dicembre 1805 l'Austria cede il
Tirolo alla Baviera, alleata di Napoleone. L'amministrazione bavarese
impone la coscrizione obbligatoria, comprime le istituzioni tradizionali e
nel 1806 abolisce perfino il nome "Tirolo", sostituito da una divisione in
circoli. Coscrizione e attacco alle consuetudini religiose accendono la
rivolta.

1809: la sollevazione scoppia in aprile, coordinata con l'entrata in guerra
dell'Austria. Quattro battaglie sul Bergisel presso Innsbruck: 12 aprile,
25 maggio, 13 agosto, 1 novembre. Dopo la vittoria del 13 agosto Hofer
governa il Tirolo dalla Hofburg di Innsbruck come comandante supremo,
per circa due mesi.

Con la pace di Schönbrunn, 14 ottobre 1809, l'Austria abbandona di nuovo il
Tirolo. Hofer continua a resistere, è tradito e catturato nel gennaio 1810
alla malga Pfandler, processato a Mantova e fucilato il 20 febbraio 1810
per ordine di Napoleone. Nel 1823 i resti sono traslati nella Hofkirche
di Innsbruck. A lui è dedicato l'Andreas-Hofer-Lied, oggi inno ufficiale
del Land Tirol.

Come trattarlo: figura storica, non bandiera politica contemporanea.
Racconta anche le sue contraddizioni: capo popolare e conservatore
religioso, una rivolta che difendeva libertà antiche e insieme un ordine
tradizionale. Non usarlo per argomentare su questioni politiche di oggi.

NOTA: quanto e come le Valli del Noce parteciparono alla rivolta del 1809
è materia da verificare sulle fonti locali. Se te lo chiedono, dillo
apertamente invece di generalizzare.

--- DAL 1799 A OGGI ---

1799: difesa austriaca del Tonale contro i francesi, che di lì volevano
invadere il Tirolo.
1783: catasto teresiano.
1810-1813: il Trentino passa al Regno d'Italia napoleonico. 1815 ritorno
all'Austria.
1861: catasto stabile e SISTEMA TAVOLARE, la registrazione fondiaria di
impianto austriaco, tuttora in vigore in Trentino e in Südtirol. È il
motivo per cui da noi la proprietà si prova diversamente dal resto d'Italia.
Dal 1875: emigrazione verso il Brasile (Rio Grande do Sul, Santa Catarina,
Espírito Santo) e più tardi verso il Cile. È l'origine della diaspora con
cui l'Associazione mantiene i rapporti.
1914-1918: GRANDE GUERRA. Il fronte passa per il Tonale e la Val di Pejo.
Gli uomini combattono nell'esercito austro-ungarico; nel 1915 sono
mobilitati circa ventimila Standschützen, con tredici compagnie nel Tirolo
italiano, uniforme Kaiserjäger, fucili Werndl e Mauser, dal Tonale alla
Marmolada. Partivano padre e figlio, zio e nipote, a volte nonno e nipote.
Le popolazioni di confine vengono evacuate: molti profughi finiscono in
Boemia e in Austria interna.
1919: trattato di Saint-Germain. Trentino e Südtirol all'Italia.
Finisce il Tirolo storico.
1922-1943: fascismo, italianizzazione, divieto delle compagnie Schützen,
snaturamento della toponomastica.
1943-1945: Zona di Operazioni delle Prealpi sotto Franz Hofer.
1946: accordo De Gasperi-Gruber. 1948 primo statuto di autonomia.
1972: secondo statuto di autonomia.

--- CASATE E CASTELLI ---

THUN: la casata più potente della Val di Non, Castel Thun a Vigo di Ton.
Uffici ereditari nei vescovadi di Trento e Bressanone, e sudditi detti
"peculiari" nelle pievi di Vigo, Torri e Tajo, con investiture rinnovate
ogni diciannove anni.
SPAUR: giurisdizione feudale austriaca di Sporo, passata loro verso il 1330;
palazzo a Terres.
Altri: Castel Valer, Nanno, Caldes, Castel San Michele a Ossana,
Altaguardia, Sant'Ippolito, Castel Visione presso Vigo.

--- COME COMPORTARTI SULLE DOMANDE STORICHE ---

- Date e nomi devono essere esatti. Se non sei sicuro, DILLO. "Non ne ho
  certezza" è una risposta accettabile; una data inventata non lo è mai.
- Distingui il fatto documentato dall'ipotesi. Esempio: l'etimologia che fa
  derivare "Sole" dalla divinità celtica delle acque Sulis è una proposta
  di Quirino Bezzi, non un fatto accertato. Il nome della valle non ha
  comunque nulla a che vedere con il sole.
- Dove le fonti si contraddicono, esponi il contrasto. Non scegliere la
  versione che fa più piacere.
- Su Tirolo, minoranze, Risorgimento, fascismo e religione: approccio
  storico e culturale, mai politico-attuale, mai di parte.
- Non dire che le valli erano "austriache" come se fossero state straniere:
  erano Tirolo, e il Tirolo era la loro terra. Ma non romanticizzare:
  racconta anche le rivolte contro i signori, la povertà, l'emigrazione.
- Le opere si citano per autore, titolo e anno. Non riassumere libri sotto
  copyright come se ne riportassi il testo.
- Una fonte di parte resta una fonte: un giornale tirolese del 1915 è
  eccellente sui fatti e di parte sulle interpretazioni, esattamente come lo
  sarebbe un giornale italiano dello stesso anno. Quando citi la stampa
  d'epoca dì testata, data e lingua: "così lo raccontava il Bote für Tirol
  nel 1915", non "così andarono le cose".
- Per i documenti d'archivio rimanda all'Associazione: info@elbrenz.eu.

=== FINE BASE STORICA ===`;

const SYSTEM_PROMPT_AUTH = `Sei Andreas, l'assistente culturale dell'Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo, Trentino).

La tua missione \u00e8 aiutare i soci a riscoprire la storia, la lingua ladino-anaunica e la cultura delle nostre valli.

TONO: appassionato ma documentato, caldo, comunitario, divulgativo. Rigoroso sulle fonti. Usa "le nostre valli", "i nostri paesi" dove naturale. Mai retorico, mai polemico.

REGOLE DI SCRITTURA:
- Italiano standard come lingua principale.
- Termini in ladino anaunico in *corsivo*, con traduzione alla prima occorrenza.
- Mai "dialetto" in senso riduttivo: usa "parlata", "lingua locale", "ladino anaunico".
- Distingui Tirolo storico (includeva il Trentino fino al 1919) da Tirol attuale (Land austriaco).
- Nomi storici in grafia originale: Clesio, Gaismair, Andreas Hofer, Maria Teresa d'Austria.
- Mai il trattino lungo (—) nei testi: usa il punto, i due punti o le parentesi.
- Se ti chiedono quante domande si possono fare: esiste un limite giornaliero che dipende dal profilo (3 per chi non e' registrato, di piu' per ospiti registrati e soci; il conteggio esatto sta nel contatore sotto la casella di scrittura). Non promettere MAI domande senza limite o "quante ne vuoi": un tetto esiste sempre.

${BASE_LINGUISTICA}

${BASE_STORICA}

VINCOLI:
- Rispondi SOLO sulla base del CONTESTO fornito dagli articoli dell'Associazione, PIÙ la BASE LINGUISTICA e la BASE STORICA qui sopra, che sono conoscenza tua e valgono sempre. Sui punti in cui un documento recuperato contraddice le regole di disambiguazione della BASE STORICA, vincono le regole.
- Se il contesto non basta, dillo apertamente invece di inventare.
- Non citare mai fonti esterne (Wikipedia, libri fuori KB). Se il socio chiede di un tema non coperto, indirizzalo al direttivo o ai volumi fisici in biblioteca.
- Al termine cita le fonti usate come: _Fonti: [Titolo1]; [Titolo2]_`;

const SYSTEM_PROMPT_PUBBLICO = `Sei Andreas, l'assistente culturale dell'Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce (Val di Non, Val di Sole, Val di Rabbi, Val di Pejo, Trentino).

Stai parlando con un visitatore che vuole conoscere la storia, la lingua ladino-anaunica e la cultura delle Valli del Noce. Non \u00e8 un socio: \u00e8 una persona curiosa che ti incontra per la prima volta. Accoglilo bene, raccontagli ci\u00f2 che chiede e, dove ha senso, invitalo a scoprire l'Associazione su elbrenz.eu.

TONO: appassionato ma documentato, caldo, divulgativo. Rigoroso sulle fonti. Mai retorico, mai polemico, mai escludente verso chi non \u00e8 nato in valle.

REGOLE DI SCRITTURA:
- Italiano standard come lingua principale.
- Termini in ladino anaunico in *corsivo*, con traduzione alla prima occorrenza.
- Mai "dialetto" in senso riduttivo: usa "parlata", "lingua locale", "ladino anaunico".
- Distingui Tirolo storico (includeva il Trentino fino al 1919) da Tirol attuale (Land austriaco).
- Nomi storici in grafia originale: Clesio, Gaismair, Andreas Hofer, Maria Teresa d'Austria.
- Mai il trattino lungo (—) nei testi: usa il punto, i due punti o le parentesi.
- Se ti chiedono quante domande si possono fare: esiste un limite giornaliero che dipende dal profilo (3 per chi non e' registrato, di piu' per ospiti registrati e soci; il conteggio esatto sta nel contatore sotto la casella di scrittura). Non promettere MAI domande senza limite o "quante ne vuoi": un tetto esiste sempre.

${BASE_LINGUISTICA}

${BASE_STORICA}

VINCOLI:
- Rispondi SOLO sulla base del CONTESTO fornito dagli articoli pubblici dell'Associazione, PIÙ la BASE LINGUISTICA e la BASE STORICA qui sopra, che sono conoscenza tua e valgono sempre. Sui punti in cui un documento recuperato contraddice le regole di disambiguazione della BASE STORICA, vincono le regole.
- Se il contesto non basta, dillo apertamente invece di inventare. In quel caso, suggerisci di scrivere a info@elbrenz.eu o di esplorare il sito www.elbrenz.eu.
- Non citare mai fonti esterne (Wikipedia, libri fuori KB).
- Risposte concise: l'utente ha 3 domande al giorno, ogni risposta vale.
- Al termine cita le fonti usate come: _Fonti: [Titolo1]; [Titolo2]_`;

// ----------------------------------------------------------------------------
// CORS
// ----------------------------------------------------------------------------
function corsHeaders(origin: string | null): HeadersInit {
  const allowed = [
    "https://elbrenz.eu", "https://www.elbrenz.eu", "https://elbrenz-app.netlify.app",
    "http://localhost:5173", "http://localhost:3000", "http://localhost:4321",
  ];
  const allow = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, cf-turnstile-token",
    "Access-Control-Max-Age": "86400",
  };
}

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractClientIp(req: Request): string {
  // Supabase Edge Functions sono dietro a vari proxy.
  // L'IP del client \u00e8 in cf-connecting-ip oppure x-forwarded-for (primo).
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "0.0.0.0";
}

async function verifyTurnstile(token: string, secret: string, remoteIp: string): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);
    formData.append("remoteip", remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    return data?.success === true;
  } catch (e) {
    console.error("turnstile verify failed:", e);
    return false;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  const t0 = Date.now();
  try {
    const body = await req.json() as {
      query: string;
      conversazione_id?: string;
      tipo_conversazione?: string;
      turnstile_token?: string;
      // [2/8] ping: true -> il client chiede solo ruolo e conteggio, per
      // mostrare all'apertura un numero confermato dal server invece del 3
      // cablato. Nessun retrieval, nessun modello, NESSUN consumo di quota.
      ping?: boolean;
    };
    const isPing = body.ping === true;
    if (!body.query && !isPing) {
      return new Response(JSON.stringify({ ok: false, error: "missing_query" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    // AUD-C2a (10/7, deroga puntuale di Cristian): cap input a 600 caratteri
    // (controllo costi embedding/Claude). Il widget mostra il limite.
    if (String(body.query).length > 600) {
      return new Response(JSON.stringify({ ok: false, error: "query_too_long", max: 600 }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    // ------------------------------------------------------------------------
    // BRANCH 1: detect autenticato vs pubblico
    // ------------------------------------------------------------------------
    const authHeader = req.headers.get("authorization") ?? "";
    const hasJwt = authHeader.startsWith("Bearer ");

    // Client SERVICE ROLE (sempre serve, anche per pubblici)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string | null = null;
    let isPubblico = true;
    let nomeUtente: string | null = null;
    let nomeRuolo = "pubblico";
    let livelloRuolo = 0;   // livello del ruolo (ruolo.livello); 0 = pubblico

    // AGGIUNTA additiva (bot Telegram): un chiamante fidato (edge telegram-bot)
    // presenta X-Bot-Secret == BOT_ANDREAS_SECRET. In tal caso salta il
    // rate-limit per IP e il Turnstile (il rate-limit è per utente Telegram,
    // gestito dal bot) e non persiste nulla. Tutto il resto (RAG, prompt
    // pubblico, Claude) resta invariato. Solo se NON è autenticato via JWT.
    const botSecret = Deno.env.get("BOT_ANDREAS_SECRET");
    const isTrustedBot = !hasJwt && !!botSecret &&
      (req.headers.get("x-bot-secret") ?? "") === botSecret;

    if (hasJwt) {
      const supabaseAnon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userErr } = await supabaseAnon.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ ok: false, error: "invalid_jwt" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }
      userId = userData.user.id;
      isPubblico = false;
      // Nome per il saluto del ping (benvenuto consapevole del ruolo).
      nomeUtente = String((userData.user.user_metadata as any)?.nome ?? "").trim() || null;

      // Un utente puo' avere PIU' ruoli: si prende quello a LIVELLO massimo
      // (audit 14/7: prima si ordinava per ruolo_id, che non implica il livello
      // piu' alto -> un admin con anche 'socio' poteva risultare socio).
      const { data: ruoli } = await supabase
        .from("utente_ruolo")
        .select("ruolo:ruolo_id ( nome, livello )")
        .eq("utente_id", userId);
      const top = (ruoli ?? [])
        .map((r: any) => ({ nome: r?.ruolo?.nome as string | undefined, livello: Number(r?.ruolo?.livello ?? 0) }))
        .reduce((m, x) => (x.livello > m.livello ? x : m), { nome: "ospite" as string | undefined, livello: 0 });
      nomeRuolo = top.nome ?? "ospite";
      livelloRuolo = top.livello;
    }

    // Andreas Fondazione (ponte web): risoluzione del LIVELLO (tier) con cui
    // Andreas sta parlando. Deriva dal ruolo GIA' risolto sopra (utente_ruolo),
    // niente query aggiuntive, nessun dato sensibile: solo la stringa livello.
    // Mappa per LIVELLO del ruolo (robusta a ruoli futuri; ruolo.livello):
    //   livello >= 50 (admin, super_admin)      -> direttivo
    //   livello >= 10 (socio, collaboratore)    -> socio
    //   resto (ospite, pubblico, bot, no-JWT)   -> pubblico
    // NB brief: prevedeva solo socio->socio / admin->direttivo. Qui il
    // "collaboratore" (livello 25, insider sopra il socio) ricade in `socio`
    // per non declassarlo a pubblico. Se Cristian vuole un tier dedicato o
    // un ruolo "direttivo" separato da admin, si aggiusta la soglia qui.
    const tier: "pubblico" | "socio" | "direttivo" =
      livelloRuolo >= 50 ? "direttivo"
        : livelloRuolo >= 10 ? "socio"
          : "pubblico";

    // ------------------------------------------------------------------------
    // Config AI per il ruolo
    // ------------------------------------------------------------------------
    const { data: config } = await supabase
      .from("ai_config_ruolo")
      .select("limite_giornaliero, modello_preferito, temperature, max_tokens_output, rag_abilitato")
      .eq("ruolo_nome", nomeRuolo).maybeSingle();
    const limitGiorno = config?.limite_giornaliero ?? (isPubblico ? 3 : 5);
    const modello = config?.modello_preferito ?? MODEL_DEFAULT;
    const maxOut = config?.max_tokens_output ?? (isPubblico ? 500 : 800);
    const ragEnabled = config?.rag_abilitato ?? true;

    const oggi = new Date().toISOString().slice(0, 10);

    // ------------------------------------------------------------------------
    // BRANCH 2: rate limit (path divergente)
    // ------------------------------------------------------------------------
    let ipHash: string | null = null;
    let msgOggi = 0;
    let tokensOggi = 0;

    // [2/8] PING: ruolo e conteggio confermati dal server, SENZA consumare.
    // Serve al client per aprire con il numero vero invece del 3 cablato.
    // Sta PRIMA del conteggio atomico: un ping non e una domanda.
    if (isPing && !isTrustedBot) {
      if (isPubblico) {
        const ipPing = extractClientIp(req);
        const hashPing = await sha256Hex(`${ipPing}:${oggi}`);
        const { data: rl } = await supabase
          .from("ai_rate_limit_pubblico")
          .select("messaggi").eq("ip_hash", hashPing).eq("giorno", oggi).maybeSingle();
        msgOggi = rl?.messaggi ?? 0;
      } else {
        const { data: rl } = await supabase
          .from("ai_rate_limit")
          .select("messaggi").eq("utente_id", userId!).eq("giorno", oggi).maybeSingle();
        msgOggi = rl?.messaggi ?? 0;
      }
      return new Response(JSON.stringify({
        ok: true, ping: true, is_pubblico: isPubblico, tier,
        nome: nomeUtente,
        usage: { msg_oggi: msgOggi, limite: limitGiorno },
      }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    if (isTrustedBot) {
      // Bot fidato: nessun rate-limit IP né Turnstile qui (li fa il bot per
      // utente Telegram). ipHash resta null, nessuna persistenza più sotto.
    } else if (isPubblico) {
      const ip = extractClientIp(req);
      // Hash SHA256 + giorno per deterministico-stesso-giorno (privacy: niente IP in chiaro)
      ipHash = await sha256Hex(`${ip}:${oggi}`);

      // [2/8] CONTEGGIO ATOMICO ALL INGRESSO. Prima il conteggio viveva solo
      // nei rami di persistenza a fine risposta, e il percorso lento
      // (vettoriale a vuoto -> full-text -> Claude) non ci passava: le
      // domande fuori KB erano gratis e illimitate proprio sul percorso piu
      // costoso. E il check read-then-act lasciava passare le concorrenti.
      // Ora check e incremento sono UN operazione sola (RPC ai_consuma_quota),
      // prima di qualsiasi retrieval. Una richiesta fallita consuma un
      // messaggio: onesto, e il rimborso sull errore si fara solo se servira.
      const { data: quota } = await supabase.rpc("ai_consuma_quota", {
        p_utente_id: null, p_ip_hash: ipHash, p_limite: limitGiorno,
      });
      const esito = (quota as any[])?.[0];
      msgOggi = esito?.messaggi ?? 0;   // INCLUSIVO della domanda corrente

      if (!esito?.concesso) {
        // Il testo del limite viene dalla policy in config_app (quota 20,
        // niente "illimitato"), con ripiego su un testo di servizio.
        let msgLimite = `Hai raggiunto il limite di ${limitGiorno} domande gratuite per oggi.`;
        try {
          const { data: cfg } = await supabase
            .from("config_app").select("valore").eq("chiave", "andreas_access_policy").maybeSingle();
          msgLimite = (cfg?.valore as any)?.andreas_pubblico?.dopo_raggiunto_limite ?? msgLimite;
        } catch (_) { /* ripiego */ }
        return new Response(JSON.stringify({
          ok: false, error: "rate_limit_daily",
          messaggio: msgLimite,
          usage: { today: msgOggi, limit: limitGiorno },
          is_pubblico: true,
          tier,
        }), { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }

      // Turnstile: richiesto dopo TURNSTILE_REQUIRED_AFTER messaggi se secret \u00e8 configurato
      const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
      if (turnstileSecret && msgOggi > TURNSTILE_REQUIRED_AFTER) { // msgOggi include la corrente
        if (!body.turnstile_token) {
          return new Response(JSON.stringify({
            ok: false, error: "turnstile_required",
            messaggio: "Per continuare, completa la verifica anti-bot.",
            is_pubblico: true,
          }), { status: 428, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
        }
        const valid = await verifyTurnstile(body.turnstile_token, turnstileSecret, ip);
        if (!valid) {
          return new Response(JSON.stringify({
            ok: false, error: "turnstile_invalid",
            messaggio: "Verifica anti-bot fallita. Riprova.",
            is_pubblico: true,
          }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
        }
      } else if (!turnstileSecret) {
        // Modalit\u00e0 degradata: log warning, prosegui. Da rimuovere dopo setup Cloudflare.
        console.warn("TURNSTILE_SECRET_KEY non configurata: bypass verifica anti-bot.");
      }
    } else {
      // Path autenticato: stesso conteggio atomico all ingresso del pubblico.
      const { data: quota } = await supabase.rpc("ai_consuma_quota", {
        p_utente_id: userId!, p_ip_hash: null, p_limite: limitGiorno,
      });
      const esito = (quota as any[])?.[0];
      msgOggi = esito?.messaggi ?? 0;   // INCLUSIVO della domanda corrente
      if (!esito?.concesso) {
        return new Response(JSON.stringify({
          ok: false, error: "rate_limit_daily",
          messaggio: `Hai raggiunto il limite di ${limitGiorno} domande per oggi. Riprova domani.`,
          usage: { today: msgOggi, limit: limitGiorno },
          is_pubblico: false,
          tier,
        }), { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }
    }

    // ------------------------------------------------------------------------
    // Conversazione: solo per autenticati (privacy: anonimi non hanno storia)
    // ------------------------------------------------------------------------
    let conversazioneId: string | undefined = undefined;
    if (!isPubblico) {
      conversazioneId = body.conversazione_id;
      if (!conversazioneId) {
        const { data: newConv } = await supabase
          .from("ai_conversazione")
          .insert({ utente_id: userId!, tipo: body.tipo_conversazione ?? "generica", titolo: body.query.slice(0, 80) })
          .select("id").single();
        conversazioneId = newConv?.id;
      }
      await supabase
        .from("ai_messaggio")
        .insert({ conversazione_id: conversazioneId, ruolo: "user", contenuto: body.query });
    }

    // ------------------------------------------------------------------------
    // History: solo per autenticati
    // ------------------------------------------------------------------------
    let historyAsc: any[] = [];
    if (!isPubblico && conversazioneId) {
      const { data: history } = await supabase
        .from("ai_messaggio")
        .select("ruolo, contenuto")
        .eq("conversazione_id", conversazioneId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MSGS);
      historyAsc = (history ?? []).reverse().slice(0, -1);
    }

    // ------------------------------------------------------------------------
    // RAG: embed + match con solo_pubblici=isPubblico
    // ------------------------------------------------------------------------
    let context = "";
    let sources: any[] = [];
    if (ragEnabled) {
      const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: body.query }),
      });
      if (embRes.ok) {
        const emb = (await embRes.json()).data[0].embedding;
        const { data: hits } = await supabase.rpc("match_kb_semantic", {
          query_embedding: emb,
          match_count: 6,
          min_similarity: 0.35,
          solo_pubblici: isPubblico,
        });

        let finalHits = hits ?? [];
        if (finalHits.length === 0) {
          const { data: ftHits } = await supabase.rpc("match_kb_fulltext", {
            q: body.query,
            match_count: 6,
            solo_pubblici: isPubblico,
          });
          finalHits = ftHits ?? [];
        }

        if (finalHits.length > 0) {
          const sorgenteIds = [...new Set(finalHits.map((h: any) => h.sorgente_id))];
          const { data: sorgenti } = await supabase
            .from("andreas_kb_sorgente")
            .select("id, titolo, metadata, pilastro")
            .in("id", sorgenteIds);
          const srcMap = new Map((sorgenti ?? []).map((s: any) => [s.id, s]));

          context = finalHits.map((h: any, i: number) => {
            const titolo = srcMap.get(h.sorgente_id)?.titolo ?? "?";
            return `[FONTE ${i + 1}: "${titolo}"]\n${h.contenuto}`;
          }).join("\n\n---\n\n");

          sources = finalHits.map((h: any) => ({
            sorgente_id: h.sorgente_id,
            titolo: srcMap.get(h.sorgente_id)?.titolo,
            pilastro: srcMap.get(h.sorgente_id)?.pilastro,
            wp_legacy_id: srcMap.get(h.sorgente_id)?.metadata?.wp_legacy_id,
            slug: srcMap.get(h.sorgente_id)?.metadata?.slug,
            similarity: h.similarity,
            snippet: (h.contenuto ?? "").slice(0, 200),
          }));
        }
      }
    }

    // ------------------------------------------------------------------------
    // Claude API call con prompt corretto per ruolo
    // ------------------------------------------------------------------------
    const systemPrompt = isPubblico ? SYSTEM_PROMPT_PUBBLICO : SYSTEM_PROMPT_AUTH;
    const userContent = context
      ? `CONTESTO (articoli dell'Associazione):\n\n${context}\n\n---\n\nDOMANDA:\n${body.query}`
      : `DOMANDA:\n${body.query}\n\n[Nessun contesto disponibile dalla KB. Se la domanda riguarda temi del Brenz, di' al visitatore che l'argomento non \u00e8 ancora stato inserito nei nostri archivi digitali e suggerisci di scrivere a info@elbrenz.eu.]`;

    const msgs = [
      ...historyAsc.map((m: any) => ({ role: m.ruolo === "assistant" ? "assistant" : "user", content: m.contenuto })),
      { role: "user", content: userContent },
    ];

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modello,
        max_tokens: maxOut,
        system: systemPrompt,
        messages: msgs,
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      if (!isPubblico && conversazioneId) {
        await supabase.from("ai_messaggio").insert({
          conversazione_id: conversazioneId, ruolo: "assistant",
          contenuto: "[errore Claude]", errore: err.slice(0, 500), modello,
        });
      }
      return new Response(JSON.stringify({ ok: false, error: "claude_failed", detail: err.slice(0, 400) }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    const claudeData = await claudeRes.json();
    let answer = claudeData.content?.[0]?.text ?? "(risposta vuota)";
    // [post mortem 2/8/2026] Risposta tagliata dal tetto di token (500 il
    // pubblico): finiva a meta' frase senza alcun segno — «L'Associazione
    // nasc» — e sembrava un guasto. Il taglio ora si dichiara: si tronca
    // all'ultima frase compiuta e si invita a chiedere il seguito.
    if (claudeData.stop_reason === "max_tokens") {
      const ultimoPunto = Math.max(answer.lastIndexOf(". "), answer.lastIndexOf(".\n"));
      if (ultimoPunto > answer.length * 0.5) answer = answer.slice(0, ultimoPunto + 1);
      answer += "\n\n*La risposta era più lunga dello spazio disponibile: chiedimi pure di continuare.*";
    }
    const tokensIn = claudeData.usage?.input_tokens ?? 0;
    const tokensOut = claudeData.usage?.output_tokens ?? 0;

    // ------------------------------------------------------------------------
    // Persistenza risposta + aggiornamento rate limit
    // ------------------------------------------------------------------------
    let assistantMsgId: string | undefined = undefined;
    if (!isPubblico && conversazioneId) {
      const { data: assistantMsg } = await supabase
        .from("ai_messaggio").insert({
          conversazione_id: conversazioneId, ruolo: "assistant", contenuto: answer,
          tokens_input: tokensIn, tokens_output: tokensOut, modello, tempo_ms: Date.now() - t0,
        }).select("id").single();
      assistantMsgId = assistantMsg?.id;

      if (sources.length > 0 && assistantMsgId) {
        await supabase.from("ai_sorgente_citata").insert(
          sources.slice(0, 6).map(s => ({
            messaggio_id: assistantMsgId,
            tipo_sorgente: "kb",
            sorgente_id: s.sorgente_id,
            titolo: s.titolo,
            snippet: s.snippet,
            rilevanza: s.similarity,
          }))
        );
      }

      // [2/8] I messaggi sono gia stati contati all ingresso (ai_consuma_quota):
      // qui si sommano SOLO i token, in modo relativo, su tutti i rami.
      await supabase.rpc("ai_somma_token", {
        p_utente_id: userId!, p_ip_hash: null, p_tokens: tokensIn + tokensOut,
      });

      await supabase.from("ai_conversazione")
        .update({ ultima_attivita_at: new Date().toISOString() })
        .eq("id", conversazioneId);
    } else if (!isTrustedBot) {
      // Pubblico: aggiorna solo ai_rate_limit_pubblico, niente persistenza messaggi.
      // Il bot fidato non scrive qui (rate-limit per utente Telegram, lato bot).
      // [2/8] Conteggio gia fatto all ingresso: qui solo la somma dei token.
      await supabase.rpc("ai_somma_token", {
        p_utente_id: null, p_ip_hash: ipHash!, p_tokens: tokensIn + tokensOut,
      });
    }

    // ------------------------------------------------------------------------
    // [v3] Dedup fonti per la response al client.
    // Manteniamo l'ordine di prima apparizione (= ordine per similarity
    // decrescente). Ogni sorgente compare al massimo una volta nell'output.
    // NB: il context al modello e ai_sorgente_citata rimangono invariati.
    // ------------------------------------------------------------------------
    const sourcesSeen = new Set<string>();
    const sourcesDedup = sources.filter((s: any) => {
      const key = s.sorgente_id;
      if (!key) return true;            // safety: niente id, lascio passare
      if (sourcesSeen.has(key)) return false;
      sourcesSeen.add(key);
      return true;
    });

    return new Response(JSON.stringify({
      ok: true,
      is_pubblico: isPubblico,
      tier,
      conversazione_id: conversazioneId,
      messaggio_id: assistantMsgId,
      answer,
      sources: sourcesDedup.map(s => ({
        titolo: s.titolo,
        pilastro: s.pilastro,
        wp_legacy_id: s.wp_legacy_id,
        slug: s.slug,
      })),
      usage: {
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        tempo_ms: Date.now() - t0,
        msg_oggi: msgOggi,
        limite: limitGiorno,
      },
    }, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });

  } catch (e) {
    console.error("andreas-chat unhandled:", e);
    return new Response(JSON.stringify({ ok: false, error: "internal", detail: String(e).slice(0, 400) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  }
});
