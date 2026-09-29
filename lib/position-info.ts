// Information sur l'endroit noté au pointage (CNIL) — lot 6.
//
// L'INFORMATION N'EST PAS SUPPRIMÉE, ELLE EST DÉPLACÉE. Elle était affichée en
// permanence sous « Je commence ». Elle vit maintenant :
//   1. dans le menu → « ℹ️ Informations », à tout moment ;
//   2. dans une petite fenêtre, UNE fois, au premier pointage en direct quand
//      l'entreprise a allumé l'enregistrement de l'endroit (« J'ai compris »),
//      AVANT toute collecte. Le « vu » est mémorisé sur l'appareil, par salarié.
export const GEO_INFO_TITLE = 'L’endroit au pointage';
export const GEO_INFO_TEXT =
  'Ton entreprise note l’endroit au départ et à la fin d’un pointage en direct — rien entre les deux. ' +
  'Tu peux refuser la demande du téléphone : tu pointes quand même, exactement pareil.';
export const GEO_INFO_LINK = '/confidentialite#endroit';

const key = (userId: string) => `bemexo-geo-info-v1:${userId}`;

export function geoInfoSeen(userId: string): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(key(userId)) === '1'; } catch { return false; }
}
export function markGeoInfoSeen(userId: string) {
  try { window.localStorage.setItem(key(userId), '1'); } catch { /* stockage indisponible : on redemandera, c'est sans risque */ }
}
