-- v_variante_candidate: la parlata e il paese entrano nel confronto
-- (BRIEF CD 1/9/2026, punto 3).
--
-- Il Consiglio ha segnalato che l'algoritmo di accorpamento dei doppioni
-- "non tiene conto della parlata ne' del paese". Guardando la vista (non
-- deducendo, come chiede la regola 0 del brief) si vede il motivo preciso:
--
-- 1) Il ramo 'traduzione' (stessa definizione) e il ramo 'grafia' (lemma
--    simile) non filtravano MAI sulla parlata: due lemmi con la stessa
--    definizione ma parlate diverse venivano proposti come doppioni, anche
--    se sono "due attestazioni distinte" per regola del Consiglio.
--
-- 2) Il ramo 'grafia' esclude ESPLICITAMENTE i lemmi con grafia IDENTICA
--    (`a.lem_n <> b.lem_n`), perche' e' pensato per i quasi-uguali (refusi,
--    varianti di trascrizione). Il caso "stesso termine, grafia identica" -
--    esattamente 'Sores' a Croviana e a Male', o i due 'Becar' - non veniva
--    MAI intercettato da nessuno dei due rami: non dal 'grafia' (escluso per
--    costruzione) e non dal 'traduzione' (le definizioni non coincidono
--    affatto, ne' per Sores che ha due paesi ne' per Becar che ha due
--    significati). Il buco non era nella logica di parlata/paese: era che
--    il caso piu' ovvio, la grafia identica, non veniva proposto affatto.
--
-- La correzione, additiva (nessun ramo esistente viene tolto):
--   a) 'traduzione' e 'grafia' guadagnano il filtro `a.parlata = b.parlata`:
--      parlate diverse non vengono piu' proposte come doppioni.
--   b) nuovo ramo 'stesso_termine' (grafia IDENTICA dopo normalizzazione),
--      anch'esso filtrato per parlata uguale: e' quello che ora intercetta
--      Sores e Becar.
--   c) nuova colonna `stesso_comune`, sullo stesso principio di
--      `stessa_parlata` gia' presente: il curatore vede a colpo d'occhio se
--      i due lemmi vengono dallo stesso paese o da paesi diversi.
--
-- Il "controllo sulla definizione prima di proporre" per l'omografo (Becar =
-- macellaio / Becar = pungere) NON e' un test automatico: una similarita' di
-- stringa fra due definizioni brevi in italiano castiga ALLO STESSO MODO due
-- omografi veri e due sinonimi scritti con parole diverse (verificato:
-- similarity('macellaio','pungere')=0, ma anche
-- similarity('abbastanza','a sufficienza')=0.14 - un sinonimo legittimo
-- scorerebbe peggio di un omografo scritto piu' lungo). Un tale filtro
-- escluderebbe fusioni vere tanto quanto quelle sbagliate: PEGGIO di niente.
-- Il controllo resta quello che la console gia' fa bene: le due definizioni
-- sono scritte per intero sulla card (v. glossario-console.astro, `lato()`),
-- e la fusione ('sono la stessa cosa') resta SEMPRE un click umano, mai
-- automatico. Nessun lemma si accorpa da solo qui dentro: si accorpano solo
-- quelli su cui un curatore ha guardato le due definizioni e ha deciso.
--
-- La fusione stessa continua a passare da lemma_relazione (tipo='variante'),
-- non da vocabolario_voce.unito_in: quel campo esiste per i doppioni del
-- vocabolario di riferimento (comune, categoria_gramm, parlata - guardare
-- `dominio` in vocabolario_voce, non contiene lemmi), un meccanismo diverso
-- per un dato diverso. lemma_relazione rispetta gia' la stessa regola che il
-- Consiglio chiede per vocabolario_voce.unito_in: la voce assorbita non si
-- cancella mai, resta e compare affiancata alla scheda pubblica dell'altra.

create or replace view public.v_variante_candidate as WITH p AS (
         SELECT dizionario_lemma.id,
            dizionario_lemma.lemma,
            dizionario_lemma.parlata,
            dizionario_lemma.comune,
            dizionario_lemma.slug,
            dizionario_lemma.definizione,
            dizionario_lemma.variante_italiana,
            glossario_norm(dizionario_lemma.definizione) AS def_n,
            glossario_norm(dizionario_lemma.variante_italiana) AS vit_n,
            glossario_norm(dizionario_lemma.lemma) AS lem_n
           FROM dizionario_lemma
          WHERE dizionario_lemma.stato = 'pubblicato'::text
        ), coppie AS (
         SELECT a_1.id AS a_id,
            b_1.id AS b_id,
            'traduzione'::text AS motivo,
            1.0::real AS forza,
            COALESCE(a_1.def_n, a_1.vit_n) AS perche
           FROM p a_1
             JOIN p b_1 ON a_1.id < b_1.id AND a_1.parlata = b_1.parlata
               AND a_1.lem_n IS DISTINCT FROM b_1.lem_n
               AND (a_1.def_n IS NOT NULL AND a_1.def_n = b_1.def_n OR a_1.vit_n IS NOT NULL AND a_1.vit_n = b_1.vit_n OR a_1.def_n IS NOT NULL AND a_1.def_n = b_1.vit_n OR a_1.vit_n IS NOT NULL AND a_1.vit_n = b_1.def_n)
        UNION ALL
         SELECT a_1.id,
            b_1.id,
            'grafia'::text,
            similarity(a_1.lem_n, b_1.lem_n) AS similarity,
            (a_1.lemma || ' / '::text) || b_1.lemma
           FROM p a_1
             JOIN p b_1 ON a_1.id < b_1.id AND a_1.parlata = b_1.parlata
               AND a_1.lem_n IS NOT NULL AND b_1.lem_n IS NOT NULL AND a_1.lem_n <> b_1.lem_n AND similarity(a_1.lem_n, b_1.lem_n) >= 0.6::double precision
        UNION ALL
         SELECT a_1.id,
            b_1.id,
            'stesso_termine'::text,
            1.0::real,
            a_1.lemma
           FROM p a_1
             JOIN p b_1 ON a_1.id < b_1.id AND a_1.parlata = b_1.parlata
               AND a_1.lem_n IS NOT NULL AND b_1.lem_n IS NOT NULL AND a_1.lem_n = b_1.lem_n
        )
 SELECT c.a_id,
    c.b_id,
    c.motivo,
    c.forza,
    c.perche,
    a.lemma AS a_lemma,
    a.parlata AS a_parlata,
    a.comune AS a_comune,
    a.slug AS a_slug,
    a.definizione AS a_definizione,
    b.lemma AS b_lemma,
    b.parlata AS b_parlata,
    b.comune AS b_comune,
    b.slug AS b_slug,
    b.definizione AS b_definizione,
    COALESCE(a.parlata, ''::text) = COALESCE(b.parlata, ''::text) AS stessa_parlata,
    COALESCE(glossario_norm(a.comune), ''::text) = COALESCE(glossario_norm(b.comune), ''::text) AS stesso_comune
   FROM coppie c
     JOIN p a ON a.id = c.a_id
     JOIN p b ON b.id = c.b_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM lemma_relazione r
          WHERE r.a_id = c.a_id AND r.b_id = c.b_id));

revoke select on public.v_variante_candidate from anon;
