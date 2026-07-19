/**
 * B1 — Immagini servite alla dimensione giusta.
 *
 * Le copertine storiche stanno su Supabase Storage a piena risoluzione (alcune
 * oltre 1 MB): servirle intere dentro una card da 300 px spreca banda, che in
 * valle su rete mobile e' esattamente cio' che non si puo' sprecare.
 * Le trasformazioni on-the-fly (render/image) sono incluse nel piano: verificato
 * il 19/7 (360 KB -> 40 KB a width=400).
 *
 * NB: l'ARCHIVIO non viene toccato. Questi sono URL derivati, generati al volo:
 * i file originali restano intatti su Storage, come da regola editoriale.
 */
const PUBBLICO = '/storage/v1/object/public/';
const RENDER = '/storage/v1/render/image/public/';

/** URL ridimensionato. Se non e' un'immagine di Storage, torna l'originale. */
export function imgRid(url: string | null | undefined, larghezza: number, qualita = 75): string | null {
  if (!url) return null;
  if (!url.includes(PUBBLICO)) return url;
  const u = url.replace(PUBBLICO, RENDER);
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}width=${larghezza}&quality=${qualita}`;
}

/** srcset a due densita' per le card: 1x e 2x. */
export function srcSetCard(url: string | null | undefined, base: number): string | null {
  if (!url || !url.includes(PUBBLICO)) return null;
  return `${imgRid(url, base)} ${base}w, ${imgRid(url, base * 2)} ${base * 2}w`;
}
