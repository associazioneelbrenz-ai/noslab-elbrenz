-- =====================================================================
-- Selezione eventi · programma APT Val di Sole, agosto 2026
-- Fatta l'1/8/2026 sul pieghevole completo (52 pagine, ~300 voci).
--
-- COME E' STATA FATTA. Il testo del PDF e' stato letto in ordine di lettura
-- reale (le prime estrazioni davano le colonne mescolate e le date sballate:
-- un evento finiva 22.000 caratteri dopo la sua intestazione di giornata).
-- Poi si sono applicati i criteri del Radar: segnali forti di cultura
-- materiale e storia locale, esclusione dei segnali negativi, e la lista degli
-- organizzatori esclusi per delibera del direttivo del 13/7/2026.
--
-- ESITO: 12 voci proponibili, 3 non promuovibili.
--
-- LE DESCRIZIONI SONO RISCRITTE, non copiate dal pieghevole. Le informazioni
-- pratiche (orari, prenotazioni, telefoni) restano dell'ente: chi va
-- all'appuntamento deve comunque verificare sulla fonte.
--
-- ⚠️ QUESTO FILE NON PUBBLICA NIENTE. Inserisce in stato 'proposto'.
-- Il percorso resta proposto -> approvato -> pubblicato, e l'ultimo passaggio
-- lo puo' fare solo il direttivo (livello 50) dal pannello /radar-eventi: lo
-- impone il trigger eventi_esterni_guardia, non la buona volonta'.
--
-- NB: nessuna data e' stata inventata. Dove il pieghevole dice "ogni lunedi'"
-- la voce e' ricorrente, con la cadenza in chiaro e le date che delimitano il
-- mese; dove dice un giorno preciso, c'e' quel giorno.
-- =====================================================================

-- --------------------------------------------------------------
-- 1. LE 12 PROPONIBILI
-- --------------------------------------------------------------
insert into public.eventi_esterni
  (fonte, titolo, descrizione, data_inizio, data_fine, ricorrenza, ora_inizio,
   luogo, comune, valle, organizzatore, url_fonte, prezzo, punteggio, pilastro,
   stato, flag, motivo_punteggio, hash_dedup)
values
-- ---- Cultura materiale: gli opifici e i mestieri ----
('manuale', 'Pan de na volta: si riaccende l''antico forno di Strombiano',
 'L''antico forno di Casa Grazioli torna ad accendersi per cuocere i paneti de segala come si faceva una volta. Nel pomeriggio visite guidate, poi la degustazione.',
 '2026-08-21', null, null, '16:00',
 'Strombiano, Casa Grazioli', 'Peio', 'pejo', null,
 'https://www.visitvaldisole.it', 'pagamento', 95, 3, 'proposto', '{}',
 '{"forti":["forno","paneti","pan de na volta"],"nota":"forno comunitario ancora funzionante, cottura tradizionale della segale"}'::jsonb,
 encode(digest('pan de na volta strombiano|2026-08-21|peio','sha256'),'hex')),

('manuale', 'En giro al Casel de Péj, l''ultimo caseificio turnario del Trentino',
 'Visita guidata al Casel de Péj per capire come funzionava un caseificio turnario, dove le famiglie del paese si davano il turno per lavorare il latte. E'' l''ultimo rimasto in Trentino.',
 '2026-08-05', '2026-08-26', 'ogni mercoledì', null,
 'Casel de Péj', 'Peio', 'pejo', null,
 'https://www.visitvaldisole.it', 'pagamento', 92, 3, 'proposto', '{}',
 '{"forti":["casel","caseificio turnario"],"nota":"turnario: istituto comunitario, non solo tecnica casearia"}'::jsonb,
 encode(digest('en giro al casel de pej|2026-08-05|peio','sha256'),'hex')),

('manuale', 'Filatura e tessitura: l''antica arte, in visita guidata',
 'Visita guidata alla sezione dedicata all''antica arte della filatura e della tessitura.',
 '2026-08-20', null, null, null,
 null, 'Peio', 'pejo', null,
 'https://www.visitvaldisole.it', 'nd', 88, 3, 'proposto', '{}',
 '{"forti":["filatura","tessitura"]}'::jsonb,
 encode(digest('filatura e tessitura|2026-08-20|peio','sha256'),'hex')),

('manuale', 'Ecomuseo in piazza: la lavorazione del lino',
 'Un pomeriggio sulle radici del paese, con la dimostrazione della lavorazione del lino a cura delle donne dell''associazione Linum, laboratori ed esposizione di artigiani.',
 '2026-08-14', null, null, null,
 null, 'Peio', 'pejo', 'Associazione Linum',
 'https://www.visitvaldisole.it', 'offerta', 86, 3, 'proposto', '{}',
 '{"forti":["ecomuseo","lino"],"nota":"lavorazione del lino tenuta viva da un gruppo del posto"}'::jsonb,
 encode(digest('ecomuseo in piazza lino|2026-08-14|peio','sha256'),'hex')),

('manuale', 'Il tempo ritrovato: alla scoperta del museo contadino',
 'Camminata fra i masi storici fino al museo contadino, per vedere com''era la vita alpina di un tempo. Merenda inclusa.',
 '2026-08-09', null, null, null,
 null, 'Peio', 'pejo', null,
 'https://www.visitvaldisole.it', 'pagamento', 85, 3, 'proposto', '{}',
 '{"forti":["museo contadino","masi"]}'::jsonb,
 encode(digest('il tempo ritrovato museo contadino|2026-08-09|peio','sha256'),'hex')),

('manuale', 'Utensili obliati: la mostra degli attrezzi dimenticati',
 'Mostra dedicata agli utensili del lavoro di una volta, quelli che non si usano più e di cui si sta perdendo anche il nome.',
 '2026-08-01', '2026-08-31', null, null,
 'Peio Fonti', 'Peio', 'pejo', null,
 'https://www.visitvaldisole.it', 'nd', 84, 3, 'proposto', '{}',
 '{"forti":["utensili"],"nota":"il titolo stesso e'' un tema di cultura materiale"}'::jsonb,
 encode(digest('utensili obliati|2026-08-01|peio','sha256'),'hex')),

-- ---- La Segheria Veneziana di Malé e l'Om dele Storie ----
('manuale', 'Le storie di legno alla Segheria Veneziana',
 'Alla Segheria Veneziana, le narrazioni dell''Om dele Storie. A seguire i bambini costruiscono il protagonista del racconto con legno d''abete locale e chiodi di faggio.',
 '2026-08-03', '2026-08-31', 'ogni lunedì', null,
 'Malé, loc. Molini, Segheria Veneziana', 'Malé', 'sole', null,
 'https://www.visitvaldisole.it', 'gratuito', 82, 3, 'proposto', '{}',
 '{"forti":["segheria","om dele storie"],"nota":"segheria veneziana ancora in opera"}'::jsonb,
 encode(digest('le storie di legno segheria veneziana|2026-08-03|male','sha256'),'hex')),

('manuale', 'L''arte del balocco: la tornitura manuale e a pedale',
 'L''Om dele storie mostra come si tornisce a mano e a pedale, trasformando un pezzo di legno dei boschi della valle in un giocattolo, con la lavorazione di una volta.',
 '2026-08-03', '2026-08-31', 'ogni lunedì', '09:30',
 'Malé, loc. Molini, Segheria Veneziana', 'Malé', 'sole', null,
 'https://www.visitvaldisole.it', 'gratuito', 80, 3, 'proposto', '{}',
 '{"forti":["tornitura","om dele storie","segheria"]}'::jsonb,
 encode(digest('arte del balocco tornitura|2026-08-03|male','sha256'),'hex')),

('manuale', 'Ricordi dal passato: il Mulino dalla Torre',
 'Passeggiata nel centro storico di Mezzana fino al Mulino dalla Torre, un piccolo opificio nascosto fra le case.',
 '2026-08-03', '2026-08-31', 'ogni lunedì', null,
 'Mezzana, centro storico', 'Mezzana', 'sole', null,
 'https://www.visitvaldisole.it', 'pagamento', 78, 3, 'proposto', '{}',
 '{"forti":["mulino","opificio"]}'::jsonb,
 encode(digest('ricordi dal passato mulino dalla torre|2026-08-03|mezzana','sha256'),'hex')),

('manuale', 'Racconti dell''antica corte: fiabe, leggende e strumenti d''epoca',
 'Un viaggio fra fiabe, leggende e musica tradizionale con strumenti d''epoca, in compagnia dell''Om dele Storie.',
 '2026-08-05', '2026-08-26', 'ogni mercoledì', null,
 null, 'Malé', 'sole', null,
 'https://www.visitvaldisole.it', 'gratuito', 76, 2, 'proposto', '{"nota_lingua"}',
 '{"forti":["leggende","musica tradizionale"],"nota":"la fonte parla di tradizioni orali: in fase editoriale usare ladino anaunico, non correggere l''APT in pubblico"}'::jsonb,
 encode(digest('racconti dell antica corte|2026-08-05|male','sha256'),'hex')),

-- ---- Storia: Asburgo e Schützen ----
('manuale', 'L''Arciduchessa all''Antica Fonte di Rabbi',
 'La valle accoglie l''Arciduchessa Maria Elisabetta d''Austria all''Antica Fonte. Sfilata con arrivo in carrozza, sparo a salve del gruppo Schützen Val di Sole, monologo sulla vita della donna nel Settecento fra nobiltà e popolo, balli del 1700 e Gran Ballo in serata.',
 '2026-08-13', null, null, '17:00',
 'Rabbi Fonti, Antica Fonte', 'Rabbi', 'rabbi', 'Schützen Val di Sole',
 'https://www.valdirabbi.com', 'gratuito', 94, 1, 'proposto', '{}',
 '{"forti":["arciduchessa","schutzen","asburgico"],"nota":"memoria asburgica messa in scena in valle, con gli Schützen locali"}'::jsonb,
 encode(digest('arciduchessa antica fonte rabbi|2026-08-13|rabbi','sha256'),'hex')),

-- ---- Rievocazione: segnalazione in agenda, non storia certificata ----
('manuale', 'Ossana Medievale: sfilata e matrimonio nel castello',
 'Sfilata in costume dal centro storico al castello, con tamburini e cavalli, e rievocazione di un rito nuziale in stile medievale.',
 '2026-08-08', null, null, null,
 'Ossana, centro storico e castello', 'Ossana', 'sole', null,
 'https://www.visitvaldisole.it', 'pagamento', 62, 4, 'proposto', '{"accuratezza_da_verificare"}',
 '{"forti":["rievocazione storica"],"nota":"vale come segnalazione in agenda, non come contenuto storico certificato"}'::jsonb,
 encode(digest('ossana medievale sfilata matrimonio castello|2026-08-08|ossana','sha256'),'hex'))

on conflict (hash_dedup) do nothing;

-- --------------------------------------------------------------
-- 2. LE 3 NON PROMUOVIBILI
-- --------------------------------------------------------------
-- Contenuto in tema, ma l'organizzatore e' fra gli esclusi (delibera del
-- direttivo 13/7/2026). Entrano lo stesso, cosi' il curatore le vede e non se
-- le ritrova riproposte ogni mese. Non escono MAI in pubblico: la vista
-- eventi_esterni_pubblici filtra su stato = 'pubblicato'.
insert into public.eventi_esterni
  (fonte, titolo, descrizione, data_inizio, data_fine, ricorrenza,
   luogo, comune, valle, organizzatore, prezzo, punteggio, pilastro,
   stato, flag, motivo_punteggio, hash_dedup)
values
('manuale', 'Molino Ruatti fra storia e natura',
 'Visita al Molino Ruatti con laboratorio sulla tradizione alimentare del territorio.',
 '2026-08-06', '2026-08-27', 'ogni giovedì',
 'Pracorno', 'Rabbi', 'rabbi', 'Associazione di promozione sociale Molino Ruatti',
 'pagamento', 0, 3, 'non_promuovibile', '{"organizzatore_escluso"}',
 '{"organizzatore_escluso":"Associazione Mulino Ruatti","delibera":"direttivo 13/7/2026"}'::jsonb,
 encode(digest('molino ruatti tra storia e natura|2026-08-06|rabbi','sha256'),'hex')),

('manuale', 'Le vie dell''acqua: gli antichi canali irrigui fino al mulino',
 'Escursione lungo gli antichi canali irrigui, i lec, fra Magras e Pracorno, con arrivo al Molino Ruatti.',
 '2026-08-07', '2026-08-28', 'ogni venerdì',
 'fra Magras e Pracorno', 'Rabbi', 'rabbi', 'Associazione di promozione sociale Molino Ruatti',
 'gratuito', 0, 3, 'non_promuovibile', '{"organizzatore_escluso"}',
 '{"organizzatore_escluso":"Associazione Mulino Ruatti","nota":"il tema dei lec sarebbe ottimo: se il rapporto cambia, e'' la prima da recuperare"}'::jsonb,
 encode(digest('le vie dell acqua lec molino ruatti|2026-08-07|rabbi','sha256'),'hex')),

('manuale', 'Visita guidata alle vicende urbanistiche del borgo',
 'Passeggiata sulle vicende urbanistiche del borgo, a cura di Salvatore Ferrari.',
 '2026-08-27', null, null,
 null, 'Ossana', 'sole', 'Centro Studi per la Val di Sole',
 'gratuito', 0, 1, 'non_promuovibile', '{"organizzatore_escluso"}',
 '{"organizzatore_escluso":"Centro Studi per la Val di Sole","delibera":"direttivo 13/7/2026"}'::jsonb,
 encode(digest('visita guidata vicende urbanistiche borgo|2026-08-27|ossana','sha256'),'hex'))

on conflict (hash_dedup) do nothing;

-- --------------------------------------------------------------
-- 3. Verifica dopo il caricamento
-- --------------------------------------------------------------
select stato, count(*), min(punteggio) as min_punti, max(punteggio) as max_punti
from public.eventi_esterni where fonte = 'manuale'
group by stato order by stato;
