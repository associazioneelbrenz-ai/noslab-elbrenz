-- Correzione di un errore storico segnalato dal segretario: il registro di
-- Malè non contiene nomi delle Valli del Noce non perché gli italofoni
-- fossero stati "tolti" dai reggimenti tirolesi e allontanati dal fronte
-- italiano (falso: solandri e nonesi c'erano eccome, negli Standschützen dal
-- 1915, nei Kaiserjäger/Kaiserschützen e nel Landsturm, a difendere il
-- confine di casa). La spiegazione vera è un'altra: chi era del posto,
-- quando moriva, veniva restituito alla propria famiglia e sepolto nel
-- camposanto del paese; il cimitero militare raccoglieva chi non aveva
-- nessuno a portata di carro a cui essere restituito.
update public.memoria_fondo
set racconto_html = replace(
  racconto_html,
  $vecchio$<p class="rilievo">Nessun trentino, però. Non uno. E non è un caso: quando nel 1916 Kaiserjäger e
Kaiserschützen furono riportati sul fronte italiano, <b>gli italofoni ne vennero tolti</b> e
riuniti nei battaglioni del sud-ovest, mandati a combattere sul fronte orientale. Non li si
voleva davanti al Regno d'Italia.</p>

<p>È il rovesciamento di tutta questa storia. Nel cimitero militare del loro paese, i nostri
bisnonni non ci sono, perché li avevano mandati a milleduecento chilometri da casa. E al loro
posto, sotto il campanile di Malè, riposano i ragazzi che erano partiti da quei milleduecento
chilometri.</p>$vecchio$,
  $nuovo$<p>Nell'elenco dei centodiciotto, però, non compare nessun uomo delle nostre valli. E qui conviene fermarsi, perché la spiegazione più semplice è anche quella che si dimentica per prima.</p>

<p>Sul Tonale i solandri e i nonesi c'erano eccome. Erano negli Standschützen, i bersaglieri immatricolati mobilitati nel 1915, che a quel confine arrivarono per primi; erano nei Kaiserjäger e nei Kaiserschützen; erano nel Landsturm. Difendevano il confine di casa, a un giorno di cammino dal proprio paese.</p>

<p>Ed è proprio per questo che nel cimitero militare non ci sono. Chi era di qui, quando moriva, tornava dai suoi: sepolto nel camposanto del paese, nella tomba di famiglia, con un funerale. Il cimitero militare serviva per gli altri, per quelli che una famiglia a portata di carro non ce l'avevano.</p>

<p>Quelle centodiciotto righe, allora, sono l'elenco di chi era lontano. Non racconta chi combatteva sul Tonale: racconta chi, fra quelli che ci combattevano, non aveva nessuno a cui essere restituito.</p>$nuovo$
)
where slug = 'cimitero-militare-male';
