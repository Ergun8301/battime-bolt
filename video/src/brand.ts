// Identité BEMEXO — strictement les couleurs et polices du site.
// Polices : installées au NIVEAU SYSTÈME de la machine de rendu (les .ttf
// sources restent dans video/public/fonts ; installation :
//   cp video/public/fonts/*.ttf /usr/local/share/fonts/bemexo/ && fc-cache -f).
// Pourquoi pas @remotion/fonts/loadFont ? Son delayRender se figeait
// aléatoirement dans certains onglets de rendu (blocage à 178 s constaté),
// faisant échouer le rendu complet. En polices système : zéro chargement
// asynchrone, zéro risque de blocage, typographie identique.

export const NOIR = '#15120F';
export const NOIR_CARD = '#211D19';
export const JAUNE = '#FFC21A';
export const JAUNE_OMBRE = '#C99300';
export const JAUNE_FONCE = '#9a7c14';
export const CREME = '#F2EDE3';
export const CREME_TXT_DIM = '#a59c86';
export const GRIS_TXT = '#6E6A63';
export const VERT_OK = '#2FA36B';
export const ROUILLE = '#C0461F';

export const ARCHIVO = 'Archivo, sans-serif';
export const MONO = "'JetBrains Mono', monospace";

// Texture "chantier" discrète des panneaux noirs du site.
export const TEXTURE_CHANTIER =
  'repeating-linear-gradient(45deg, rgba(255,255,255,.014) 0 32px, transparent 32px 64px)';

// Ruban de chantier jaune/noir (liseré signature).
export const RUBAN =
  `repeating-linear-gradient(45deg, ${NOIR} 0 14px, ${JAUNE} 14px 28px)`;
