// Étape 3, livraison 3b-1 : le registre des OUVREURS (registre/ouvreurs.ts), l'outil `ouvrir_fenetre` qu'on en tire et les modules légers générés.
//   npm run test:ouvreurs   (npx -y deno@2.9.6 test --allow-env --allow-read supabase/functions/_shared/registre-ouvreurs.test.ts)
//
// Ce que ce test fige : (1) la forme de chaque ouvreur ; (2) les modules légers sont EXACTEMENT ce que `scripts/registre-ouvreurs-gen.ts` écrirait, et
// n'ont ni import ni texte lu par le modèle ; (3) l'outil est généré (enum = ids, une ligne par écran), servi seulement si l'interrupteur est allumé, jamais
// avec un fichier joint, coupable par `outils_coupes` ; (4) les autres outils sont ceux d'avant, à l'octet.
// L'existence des composants, états et ancres dans le code est vérifiée par T1 (registre-couverture.test.ts).
import { OUVREURS, OUVREURS_BUREAU, OUVREURS_REPORTES, OUVREURS_SALARIE, ALIAS_SANS_OUVREUR } from './registre/ouvreurs.ts';
import { texteOuvreursLeger } from './registre/ouvreurs-gen.ts';
import { descriptionOuvrir, outilOuvrir, parametresOuvrir, VALEURS_MAX } from './registre/outil-ouvrir.ts';
import { outilsPour } from './registre/outils-pour.ts';
import { OUTILS_BUREAU } from './registre/outils-bureau.ts';
import { OUTILS_SALARIE } from './registre/outils-salarie.ts';
import { OUVREURS_LEGER_BUREAU } from './registre/ouvreurs-leger-bureau.ts';
import { OUVREURS_LEGER_SALARIE } from './registre/ouvreurs-leger-salarie.ts';
import { ASSISTANT_FUNCTIONS } from './assistant-outils.ts';
import { WORKER_FUNCTIONS } from './worker-outils.ts';

const egal = (obtenu: unknown, attendu: unknown, msg: string) => {
  const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${b}`);
};
const vrai = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
const lire = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

Deno.test('Forme : 26 ouvreurs du bureau + 2 du salarié, ids stables, rôles du bon côté, paramètres typés, niveau 3 déclenché', () => {
  egal([OUVREURS_BUREAU.length, OUVREURS_SALARIE.length], [26, 2], 'comptes');
  const ids = OUVREURS.map((o) => o.id);
  egal(new Set(ids).size, ids.length, 'id en double');
  for (const o of OUVREURS) {
    vrai(/^[a-z_]+\.[a-z_]+$/.test(o.id), `${o.id} : forme de l'id`);
    vrai(o.titre.length >= 3 && o.titre.length <= 40 && o.decrit.length >= 20, `${o.id} : titre / décrit`);
    egal(o.roles, o.cote === 'bureau' ? ['admin'] : ['worker', 'lead'], `${o.id} : rôles du côté`);
    vrai(Object.keys(o.params).length <= VALEURS_MAX, `${o.id} : au plus ${VALEURS_MAX} paramètres`);
    for (const [nom, p] of Object.entries(o.params)) {
      vrai(/^[a-z]+$/.test(nom) && nom !== 'constructor' && nom !== 'prototype', `${o.id}.${nom} : nom de paramètre`);
      vrai(p.aide.length >= 3, `${o.id}.${nom} : aide`);
      vrai(p.kind === 'enum' ? (p.valeurs ?? []).length >= 2 : !p.valeurs, `${o.id}.${nom} : valeurs seulement pour un enum`);
    }
    vrai(!Object.keys(o.params).some((n) => /secu|nir|taux|salaire|bulletin|matricule|iban|mot_?de_?passe|password/i.test(n)), `${o.id} : aucun champ de paie ni secret`);
    if (o.niveau === 3) vrai(!!o.declencheur && o.declencheur.length > 3, `${o.id} : un niveau 3 a un déclencheur`);
    vrai(!o.formulaire || o.niveau === 1, `${o.id} : un formulaire est de niveau 1`);
  }
  // Alias uniques par côté (une action de lien = un ouvreur) ; ils ne recoupent ni un id ni une entrée « sans ouvreur ».
  for (const cote of ['bureau', 'salarie'] as const) {
    const alias = [...OUVREURS.filter((o) => o.cote === cote).flatMap((o) => o.alias ?? []), ...ALIAS_SANS_OUVREUR.filter((a) => a.cote === cote).map((a) => a.alias)];
    egal(new Set(alias).size, alias.length, `${cote} : alias en double`);
    vrai(alias.every((a) => !ids.includes(a)), `${cote} : un alias ne ressemble pas à un id`);
  }
  // Les reportés ne sont pas livrés.
  vrai(OUVREURS_REPORTES.every((r) => !ids.includes(r.id)), 'un ouvreur reporté est aussi livré');
  vrai(OUVREURS_REPORTES.every((r) => r.raison.length >= 30), 'chaque report dit pourquoi');
});

Deno.test('Modules légers : exactement ce que le générateur écrit, sans import, sans texte lu par le modèle, sans nom d\'état', async () => {
  for (const [cote, fichier] of [['bureau', './registre/ouvreurs-leger-bureau.ts'], ['salarie', './registre/ouvreurs-leger-salarie.ts']] as const) {
    const ecrit = await lire(fichier);
    vrai(ecrit === texteOuvreursLeger(cote, OUVREURS), `${fichier} n'est pas celui que le registre produit : relancer  npx -y deno@2 run --allow-read --allow-write scripts/registre-ouvreurs-gen.ts`);
    const code = ecrit.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    vrai(!/^\s*import\b/m.test(code) && !/\bimport\s*\(/.test(code) && !/\bexport\s+\*/.test(code), `${fichier} : un module que le navigateur importe n'importe rien`);
    for (const o of OUVREURS.filter((x) => x.cote === cote)) {
      vrai(!code.includes(o.titre) && !code.includes(o.decrit), `${fichier} : texte lu par le modèle (${o.id})`);
      for (const e of o.etats ?? []) vrai(!new RegExp(`['"\\s:]${e}['"\\s,]`).test(code), `${fichier} : un nom d'état (${e})`);
      for (const [nom, p] of Object.entries(o.params)) vrai(p.aide.length < 12 || !code.includes(p.aide), `${fichier} : l'aide de ${o.id}.${nom}`);
    }
  }
  egal(OUVREURS_LEGER_BUREAU.map((o) => o.id), OUVREURS_BUREAU.map((o) => o.id), 'ids légers du bureau');
  egal(OUVREURS_LEGER_SALARIE.map((o) => o.id), OUVREURS_SALARIE.map((o) => o.id), 'ids légers du salarié');
  // Le salarié n'embarque aucun id du bureau (et inversement) : le chunk de /poseur n'a rien du bureau (T8).
  vrai(!JSON.stringify(OUVREURS_LEGER_SALARIE).includes('planning.') && !JSON.stringify(OUVREURS_LEGER_BUREAU).includes('jour.date'), 'ids de l\'autre côté dans un module léger');
});

Deno.test('Outil `ouvrir_fenetre` : généré depuis les ouvreurs (enum = ids, une ligne par écran, valeurs bornées), par côté', () => {
  for (const [cote, ouvreurs] of [['bureau', OUVREURS_BUREAU], ['salarie', OUVREURS_SALARIE]] as const) {
    const o = outilOuvrir(cote);
    const p = parametresOuvrir(cote) as { properties: { id: { enum: string[] }; valeurs: { properties: Record<string, { type: string; description: string }> } }; required: string[] };
    egal(p.properties.id.enum, ouvreurs.map((x) => x.id), `${cote} : enum de l'outil = ids des ouvreurs`);
    egal(p.required, ['id'], `${cote} : seul id est obligatoire`);
    const noms = new Set(ouvreurs.flatMap((x) => Object.keys(x.params)));
    egal(Object.keys(p.properties.valeurs.properties).sort(), [...noms].sort(), `${cote} : valeurs porte l'union des noms de paramètres`);
    for (const v of Object.values(p.properties.valeurs.properties)) vrai(v.type === 'string' && v.description.length > 3, `${cote} : chaque valeur est une chaîne décrite`);
    const d = descriptionOuvrir(cote);
    for (const x of ouvreurs) vrai(d.includes(`- ${x.id}`), `${cote} : ${x.id} dans la description`);
    vrai(d.includes('N’enregistre, n’envoie et ne clôture RIEN') && d.includes('repondre'), `${cote} : la description dit ce que l'outil ne fait pas`);
    vrai(d.length < 6500, `${cote} : description de ${d.length} caractères (≈ ${Math.round(d.length / 3.7)} jetons ; la conception vise ≈ 1,2 k)`);
    egal([o.kind, o.niveau, o.interrupteur, o.livraison, o.id], ['ouverture', 1, 'ouvrir', '3b', 'ouvrir_fenetre'], `${cote} : l'entrée du registre`);
    console.log(`${cote} : ${ouvreurs.length} écrans, description de ${d.length} caractères`);
  }
  const lignes = descriptionOuvrir('bureau').split('\n').filter((l) => l.startsWith('- '));
  vrai(lignes.some((l) => l.startsWith('- salarie.fiche(salarie*, mode=hours|manage)')), `ligne de salarie.fiche : ${lignes.find((l) => l.includes('salarie.fiche'))}`);
  vrai(lignes.some((l) => l.startsWith('- export.equipe(du, au) [la personne clique elle-même]')), 'niveau 3 annoncé');
});

Deno.test('Servi seulement si l\'interrupteur est allumé, jamais avec un fichier joint, coupable par `outils_coupes` — et les autres outils sont ceux d\'avant, à l\'octet', () => {
  for (const [cote, base, registre] of [['bureau', ASSISTANT_FUNCTIONS, OUTILS_BUREAU], ['salarie', WORKER_FUNCTIONS, OUTILS_SALARIE]] as const) {
    const noms = (l: readonly { name: string }[]) => l.map((f) => f.name);
    egal(outilsPour(cote), base, `${cote} : éteint = la liste d'avant`);
    egal(outilsPour(cote, { etat: {} }), base, `${cote} : état vide = éteint`);
    egal(outilsPour(cote, { etat: { ouvrir: false } }), base, `${cote} : ouvrir à faux = éteint`);
    egal(outilsPour(cote, { livraison: '3d6' }).filter((f) => f.name === 'ouvrir_fenetre'), [], `${cote} : une livraison avancée ne le sert pas : seul l'interrupteur le fait`);
    const on = outilsPour(cote, { etat: { ouvrir: true } });
    egal(noms(on), [...noms(base), 'ouvrir_fenetre'], `${cote} : allumé = les outils d'avant + ouvrir_fenetre (en dernier)`);
    egal(on.slice(0, base.length), base, `${cote} : les outils d'avant sont identiques à l'octet`);
    egal(noms(outilsPour(cote, { fichier: true, etat: { ouvrir: true } })).includes('ouvrir_fenetre'), false, `${cote} : jamais avec un fichier joint`);
    egal(outilsPour(cote, { fichier: true, etat: { ouvrir: true } }), outilsPour(cote, { fichier: true }), `${cote} : la liste « documents » ne change pas`);
    egal(noms(outilsPour(cote, { etat: { ouvrir: true }, coupes: ['ouvrir_fenetre'] })), noms(base), `${cote} : outils_coupes retire l'outil`);
    egal(noms(outilsPour(cote, { coupes: ['repondre'] })).includes('repondre'), true, `${cote} : repondre ne se coupe pas`);
    egal(noms(outilsPour(cote, { coupes: ['__proto__', 'constructor'] })), noms(base), `${cote} : un nom étranger ne coupe rien`);
    vrai(registre.filter((o) => o.livraison === '3a').length === base.length, `${cote} : les outils 3a sont les outils d'avant`);
  }
});
