// Lot 30 (borne robuste) — la VERSION de l'appli que la tablette fait tourner.
// Règles pures, sans navigateur : le même calcul sert à la page ouverte (ses
// fichiers chargés) et au HTML tout frais du serveur (rechargement de nuit).
//
// Le site est un export statique : chaque fichier de code porte dans son nom
// une empreinte de son contenu (« page-16b946fa55520278.js »). La version est
// donc une empreinte de ces noms-là : elle change dès que l'un des fichiers
// que la page charge au démarrage change — le code de la page, mais aussi les
// morceaux PARTAGÉS (supabase-js, react-dom, le fournisseur de session…) et la
// feuille de style. Aucun numéro à tenir à la main, rien à ajouter au build.
//
// Comptent : les fichiers de code INITIAUX (nom « <morceau>-<empreinte>.js »,
// ceux que le HTML cite) et la feuille de style. Ne comptent pas : les
// chargements différés (leur nom a un point : « 1283.0d33….js », ils ne sont
// pas dans le HTML), les polyfills des navigateurs anciens (la page ne les
// charge pas dans un navigateur récent : le HTML les cite, pas la page), les
// polices, les scripts d'hébergeur ou de cookies. Un déploiement qui ne change
// aucun de ces fichiers (texte du HTML seul) ne change pas la version : le
// rechargement de nuit n'a alors rien à récupérer.

/** Les fichiers dont les noms font la version. */
const VERSIONED = /^\/_next\/static\/(?:chunks\/(?:[\w()[\]-]+\/)*(?!polyfills-)[\w-]+-[0-9a-f]{8,}\.js|css\/[0-9a-f]{8,}\.css)$/;

/** FNV-1a 32 bits, en 8 signes hexadécimaux. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Le chemin d'une adresse de script (sans l'hôte ni la requête), ou `''`. */
function pathOf(src: string): string {
  const m = /^(?:https?:\/\/[^/]+)?(\/[^?#]*)/.exec(src.trim());
  return m ? m[1] : '';
}

/**
 * La version à partir des adresses des fichiers de la page (scripts et feuille
 * de style). `''` = inconnue (aucun des fichiers attendus : serveur de
 * développement, autre construction).
 * L'ordre et les doublons n'ont aucune importance.
 */
export function buildVersion(scriptSrcs: readonly string[]): string {
  const names = Array.from(new Set(scriptSrcs.map(pathOf).filter((p) => VERSIONED.test(p)))).sort();
  return names.length ? fnv1a(names.join('|')) : '';
}

/** Les adresses des <script src="…"> d'un document HTML. */
export function scriptSrcsFromHtml(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/** Les adresses des feuilles de style (<link rel="stylesheet" href="…">, attributs dans n'importe quel ordre). */
export function stylesheetHrefsFromHtml(html: string): string[] {
  const out: string[] = [];
  const re = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(m[0])) continue;
    const h = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (h) out.push(h[1]);
  }
  return out;
}

/** La version du HTML d'une page de la borne (rendu par le serveur). `''` = inconnue. */
export function versionFromHtml(html: string): string {
  return buildVersion([...scriptSrcsFromHtml(html), ...stylesheetHrefsFromHtml(html)]);
}
