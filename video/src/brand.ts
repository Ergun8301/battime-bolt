// Identité BEMEXO — strictement les couleurs et polices du site.
// Polices chargées en LOCAL (video/public/fonts) : rendu 100 % hors-réseau,
// déterministe, aucun aléa proxy/certificat au moment du rendu.
import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

const f = (family: string, file: string, weight: string) =>
  loadFont({ family, url: staticFile(`fonts/${file}`), weight });

export const fontsReady = Promise.all([
  f('Archivo', 'Archivo-500.ttf', '500'),
  f('Archivo', 'Archivo-700.ttf', '700'),
  f('Archivo', 'Archivo-800.ttf', '800'),
  f('Archivo', 'Archivo-900.ttf', '900'),
  f('JetBrains Mono', 'JetBrainsMono-400.ttf', '400'),
  f('JetBrains Mono', 'JetBrainsMono-700.ttf', '700'),
]);

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
