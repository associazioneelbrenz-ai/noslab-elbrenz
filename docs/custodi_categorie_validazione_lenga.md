# Custodi della Memoria — categorie: validazione dei titoli in lenga

**Per la Commissione Linguistica di El Brenz** (portavoce Cristian Bresadola) ed
eventualmente **Union Ladin Nonesa** (Massimo), come per «Guardiani de la lenga».

I titoli in **ladino anaunico** qui sotto sono **bozze**: alcune validate a voce da
Cristian, altre proposte. Il sistema **non dipende dalla lenga**: online la voce
principale è il titolo italiano; la lenga compare come sottotitolo in corsivo. La
correzione di un titolo è un semplice `UPDATE` su `custodi_categoria` (chiave = slug
italiano), **senza toccare il codice**.

## Tabella da validare (12 categorie)

| # | slug (stabile) | Titolo italiano (canonico) | Titolo in lenga (BOZZA) | Note |
|---|---|---|---|---|
| 1 | `terra-e-stagioni` | La terra e le stagioni | La tèra e le stagión | |
| 2 | `grande-guerra` | La Grande Guerra | La Grant Gèra | ✅ validato Cristian 16/7 (era «La Gran Guèra») |
| 3 | `partire-e-restare` | Partire e restare | Partìr e restàr | |
| 4 | `mani-e-mestieri` | Mani e mestieri | Man e mistèri | |
| 5 | `fede-e-devozione` | Fede e devozione | Fè e dovozion | |
| 6 | `feste-e-filo` | Feste, maschere e filò | Feste, màschere e filò | |
| 7 | `la-nosa-lenga` | La nostra lingua | La nosa lenga | |
| 8 | `case-masi-paesi` | Case, masi e paesi | Chjase, masi e paìsi | ✅ sciolto Cristian 16/7: **Chjase** (non Ciase) |
| 9 | `signori-e-castelli` | Signori e castelli | Signóri e castèi | |
| 10 | `acque-boschi-monti` | Acque, boschi e montagne | Aque, bòschi e montagne | |
| 11 | `volti-e-famiglie` | Volti e famiglie | Faze e famèè | |
| 12 | `dal-tirolo-italia` | Dal Tirolo all'Italia | Dal Tirol a la Talia | |

## Come applicare le correzioni (dopo la validazione)
Per ogni titolo corretto, un UPDATE sul DB (il codice non cambia). Esempio per il #8:
```sql
update public.custodi_categoria set titolo_lenga = 'Chjase, masi e paìsi', updated_at = now()
where slug = 'case-masi-paesi';
```
Fino alla validazione, l'italiano resta la voce pubblica principale.

## Descrizioni suggerite (campo `descrizione`, opzionale, tono divulgativo)
1. melicoltura, masi, allevamento, il ciclo agricolo. 2. il Tirolo asburgico al fronte
e i profughi. 3. emigrazione e diaspora (Brasile, Americhe). 4. fucine, mulini, segherie
e la fluitazione sul Noce. 5. San Romedio, capitèi, processioni. 6. carnevali, canti, il
filò, la leva. 7. proverbi, scutmài, toponimi, «Os dal Nos». 8. masi, portali, affreschi,
meridiane. 9. Thun/Spaur/Nanno, castelli, catasto tavolare, Regole. 10. il Noce, Tovel,
malghe e alpeggi. 11. ritratti e storie di famiglia (con consenso per persone
identificabili). 12. i passaggi del Novecento in chiave storico-culturale.

*Preparata il 16/7/2026. Chiave stabile = slug italiano; sistema indipendente dalla lenga.*
