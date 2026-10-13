// Lot 30 (borne robuste) — la VERSION de l'appli que la tablette fait tourner.
// Règles pures, sans navigateur : le même calcul sert à la page ouverte (ses
// <script> dans le DOM) et au HTML tout frais du serveur (rechargement de nuit).
//
// Le site est un export statique : chaque fichier de code porte dans son nom
// une empreinte de son contenu (« page-16b946fa55520278.js »). La version est
// donc une empreinte de ces noms-là : elle change si, et seulement si, le code
// de la borne change. Aucun numéro à tenir à la main, rien à ajouter au build.
//
// Seuls les fichiers qui font la borne comptent (le chargeur, l'amorçage, la
// mise en page et la page /borne) : un autre chargement différé, un script
// d'hébergeur ou un cookie ne changent pas la version.

/** Les fichiers dont les noms font la version. */
const VERSIONED = /^\/_next\/static\/chunks\/(?:webpack|main-app|app\/layout|app\/borne\/page)-[0-9a-f]{8,}\.js$/;

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
 * La version à partir des adresses des scripts de la page. `''` = inconnue
 * (aucun des fichiers attendus : serveur de développement, autre construction).
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

/** La version du HTML d'une page de la borne (rendu par le serveur). `''` = inconnue. */
export function versionFromHtml(html: string): string {
  return buildVersion(scriptSrcsFromHtml(html));
}
