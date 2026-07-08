// src/lib/pagamenti.ts — flag GO-LIVE dei pagamenti online (M2.6).
//
// UNICA fonte di verità, valutata a BUILD TIME:
//   false → il box "Sostieni El Brenz" in home NON esiste in pagina, il
//           riquadro PayPal su /tesseramento resta nascosto (attivabile
//           solo con ?paypal=1 per i test di Cristian) e /dona resta
//           non linkata.
//   true  → tutto visibile e linkato (dopo il test reale di Cristian:
//           quota 20€ + donazione anonima 1€ + rimborsi verificati).
//
// Flip deliberato da Cristian, poi build + deploy.
// GO-LIVE 8/7/2026: test reale completato (quota 20€ + donazione anonima 1€
// + rimborsi riconciliati via webhook, verifica 4/4) e OK di Cristian.
export const PAGAMENTI_LIVE = true;
