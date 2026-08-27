-- Brief "Sezione cimiteri, chiusura completa" (27/8/2026 §2): il secondo
-- numero del sottotitolo era sbagliato (118 nomi, non 117 sepolture), il
-- primo dipendeva da una questione aperta con l'archivio ora chiusa
-- (236 vs 238, risolta a monte di questo brief). Formula definitiva.
update memoria_fondo set sottotitolo = 'Centodiciassette sepolture, centoquattordici uomini' where slug_breve = 'male';
