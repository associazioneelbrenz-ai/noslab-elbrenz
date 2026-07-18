// Luoghi delle Valli del Noce: etichette, colori e sigilli di categoria.
// UNICO punto di verita' condiviso da /luoghi, /luoghi/{slug} e (a tendere) /mappa.
export const CATEGORIE_LUOGHI: Record<string, string> = {
  castelli_e_residenze: 'Castelli e residenze',
  chiese_e_santuari: 'Chiese e santuari',
  grande_guerra: 'Grande Guerra',
  cultura_materiale: 'Cultura materiale',
  musei_e_collezioni: 'Musei e collezioni',
  // storiche (compatibilita')
  luoghi_sacri: 'Luoghi sacri',
  memoria_e_comunita: 'Memoria e comunità',
};

export const COLORI_LUOGHI: Record<string, string> = {
  castelli_e_residenze: '#8a5a2b',
  chiese_e_santuari: '#5b6ea8',
  grande_guerra: '#8a3a3a',
  cultura_materiale: '#6b8e23',
  musei_e_collezioni: '#b0872f',
  luoghi_sacri: '#5b6ea8',
  memoria_e_comunita: '#b0872f',
};

export const VALLI_LUOGHI: Record<string, string> = {
  val_di_non: 'Val di Non',
  val_di_sole: 'Val di Sole',
  val_di_rabbi: 'Val di Rabbi',
  val_di_pejo: 'Val di Pejo',
  fuori_valle: 'Fuori valle',
};

// Sigilli a tratto (mai emoji di sistema): un simbolo per categoria.
const TRATTI: Record<string, string> = {
  castelli_e_residenze: '<path d="M4 20V9l3 2 3-4 3 4 3-2v11z"/><path d="M4 20h16"/>',
  chiese_e_santuari: '<path d="M12 3v6"/><path d="M9 6h6"/><path d="M6 21V12l6-4 6 4v9"/><path d="M10 21v-4h4v4"/>',
  grande_guerra: '<path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7z"/>',
  cultura_materiale: '<path d="M14 4 20 10"/><path d="M17 7 7 17l-3 3 3-3"/><path d="M4 20l3-3"/><path d="M11 7 7 3 3 7l4 4"/>',
  musei_e_collezioni: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8"/><path d="M3 21h18"/>',
  luoghi_sacri: '<path d="M12 3v6"/><path d="M9 6h6"/><path d="M6 21V12l6-4 6 4v9"/>',
  memoria_e_comunita: '<circle cx="12" cy="8" r="3.2"/><path d="M5 21v-1.5A5.5 5.5 0 0 1 10.5 14h3A5.5 5.5 0 0 1 19 19.5V21"/>',
};

export function sigilloCategoria(categoria: string, colore = '#C8923E', dim = 26): string {
  const tratti = TRATTI[categoria] ?? '<circle cx="12" cy="12" r="8"/>';
  return `<svg viewBox="0 0 24 24" width="${dim}" height="${dim}" fill="none" stroke="${colore}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tratti}</svg>`;
}
