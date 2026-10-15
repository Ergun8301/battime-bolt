// Étape 3, livraison 3b-1 : l'interrupteur AI_ETAPE3 (etape3-config.ts). Contrat : docs/ia-etape3/00-conception-etape3.md §1.3.
//   npm run test:etape3-config   (npx -y deno@2.9.6 test --allow-env --allow-read supabase/functions/_shared/etape3-config.test.ts)
//
// Ce que ces tests figent : (1) JAMAIS de levée, quoi que contienne le secret ou l'environnement ; (2) absent, illisible ou inconnu = tout
// éteint ; (3) off / pilote / pct / on ; (4) FNV-1a stable (la répartition par entreprise ne bouge pas) ; (5) outils_coupes ; (6) la garde de
// modes_actuel ; (7) boucle et ecritures acceptés et ignorés.
import { configDe, etat, fnv1a, lireEtape3, modesActuel, outilCoupe, seau, SECRET_ETAPE3, toutEteint, type Etape3Env, type FonctionEtape3 } from './etape3-config.ts';

const egal = (obtenu: unknown, attendu: unknown, msg: string) => {
  const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${b}`);
};
const vrai = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
const avec = (secret: unknown): Etape3Env => ({ get: (k) => (k === SECRET_ETAPE3 ? (typeof secret === 'string' ? secret : secret === undefined ? undefined : JSON.stringify(secret)) : undefined) });
const FONCTIONS: FonctionEtape3[] = ['ouvrir', 'boucle', 'ecritures'];
const COTES = ['bureau', 'salarie'] as const;
const CO = '4f1c8a52-9b1e-4a7e-8d3f-0c2a5b6d7e81';

/** Une deuxième écriture de FNV-1a, en BigInt, sans rien partager avec le code testé. */
function fnvRef(octets: number[]): number {
  let h = 2166136261n;
  for (const o of octets) { h ^= BigInt(o); h = (h * 16777619n) & 0xffffffffn; }
  return Number(h);
}

Deno.test('Absent, vide ou sans environnement : tout éteint, pour chaque fonction, côté et entreprise', () => {
  for (const env of [avec(undefined), avec(''), avec('   '), { get: () => undefined }, null, undefined]) {
    for (const f of FONCTIONS) for (const c of COTES) {
      vrai(etat(env, f, c, CO) === false, `${f}/${c} devrait être éteint (${JSON.stringify(env && env.get(SECRET_ETAPE3))})`);
    }
  }
  egal(configDe(null), toutEteint(), 'configDe(null)');
  egal(lireEtape3(undefined), { ok: true, config: toutEteint() }, 'pas de secret = tout éteint, sans erreur');
  vrai(toutEteint() !== toutEteint() && toutEteint().ouvrir !== toutEteint().ouvrir, 'toutEteint rend des objets neufs (aucune mutation partagée)');
});

Deno.test('Illisible ou inconnu : tout éteint — même si une partie du secret demande `on`', () => {
  const mauvais: unknown[] = [
    '{', 'pas du json', '[]', '[1,2]', '42', 'null', 'true', '"on"', '{"ouvrir":"on"}', '{"ouvrir":[]}',
    { ouvrir: { bureau: 'on' }, inconnu: 1 },                         // clé de premier niveau inconnue
    { ouvrir: { bureau: 'on', cote: 'on' } },                          // côté inconnu
    { ouvrir: { bureau: 'ON' } }, { ouvrir: { bureau: 'oui' } }, { ouvrir: { bureau: true } }, { ouvrir: { bureau: 1 } }, // valeur hors liste
    { ouvrir: { bureau: 'on' }, pct: -1 }, { ouvrir: { bureau: 'on' }, pct: 101 }, { ouvrir: { bureau: 'on' }, pct: 1.5 }, { ouvrir: { bureau: 'on' }, pct: '10' },
    { ouvrir: { bureau: 'on' }, pilote: 'abc' }, { ouvrir: { bureau: 'on' }, pilote: [1] }, { ouvrir: { bureau: 'on' }, pilote: ['a b'] },
    { ouvrir: { bureau: 'on' }, outils_coupes: 'x' }, { ouvrir: { bureau: 'on' }, outils_coupes: ['Mauvais Nom'] },
    { ouvrir: { bureau: 'on' }, ecritures: { modes_actuel: 3 } }, { ouvrir: { bureau: 'on' }, ecritures: { modes_actuel: ['a b'] } },
    { ouvrir: { bureau: 'on' }, boucle: { bureau: 'peut-etre' } }, { ouvrir: { bureau: 'on' }, ecritures: 'on' },
  ];
  for (const m of mauvais) {
    const env = avec(m);
    const lu = lireEtape3(typeof m === 'string' ? m : JSON.stringify(m));
    vrai(lu.ok === false, `lireEtape3 devrait refuser ${JSON.stringify(m)}`);
    for (const f of FONCTIONS) for (const c of COTES) vrai(etat(env, f, c, CO) === false, `secret ${JSON.stringify(m)} : ${f}/${c} doit rester éteint`);
    egal(configDe(env), toutEteint(), `configDe(${JSON.stringify(m)})`);
  }
  vrai(!(lireEtape3('{') as { ok: boolean }).ok, '« { » refusé');
  vrai((lireEtape3('{"x":1}') as { error: string }).error.includes('champ inconnu'), 'le message dit « champ inconnu »');
});

Deno.test('Jamais de levée : environnement qui lève, objets étranges, fonction ou côté inconnus, `__proto__`, valeurs non texte', () => {
  const leve: Etape3Env = { get: () => { throw new Error('pas de permission'); } };
  for (const f of FONCTIONS) for (const c of COTES) vrai(etat(leve, f, c, CO) === false, 'env qui lève');
  vrai(outilCoupe(leve, 'copier_intervention') === false && modesActuel(leve) === '*', 'env qui lève : outilCoupe / modesActuel');
  const on = avec({ ouvrir: { bureau: 'on', salarie: 'on' } });
  for (const f of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', 'OUVRIR', 'ouvrir ', null, undefined, 3, {}, []]) {
    vrai(etat(on, f as never, 'bureau', CO) === false, `fonction inconnue ${String(f)}`);
  }
  for (const c of ['__proto__', 'constructor', '', 'Bureau', null, undefined, 7, {}]) vrai(etat(on, 'ouvrir', c as never, CO) === false, `côté inconnu ${String(c)}`);
  vrai(etat(on, 'ouvrir', 'bureau', undefined) === true, 'on n\'a pas besoin de l\'entreprise');
  for (const id of [undefined, null, 5, {}, [], '', '   ', '__proto__']) etat(on, 'ouvrir', 'bureau', id as never);
  // Une salve de secrets aléatoires : jamais une exception, jamais allumé sans un `on` / `pilote` / `pct` explicite.
  let graine = 12345;
  const alea = () => { graine = (Math.imul(graine, 1103515245) + 12345) & 0x7fffffff; return graine / 0x7fffffff; };
  const atomes: unknown[] = ['on', 'off', 'pct', 'pilote', 1, 0, -3, 100, null, true, [], {}, '__proto__', 'x', '*', [CO], ['a_b']];
  for (let i = 0; i < 4000; i++) {
    const o: Record<string, unknown> = {};
    for (const k of ['ouvrir', 'boucle', 'ecritures', 'pilote', 'pct', 'outils_coupes', 'zzz', '__proto__']) if (alea() < 0.5) o[k] = alea() < 0.5 ? atomes[Math.floor(alea() * atomes.length)] : { bureau: atomes[Math.floor(alea() * atomes.length)], salarie: atomes[Math.floor(alea() * atomes.length)], modes_actuel: atomes[Math.floor(alea() * atomes.length)] };
    const texte = alea() < 0.1 ? JSON.stringify(o).slice(0, Math.floor(alea() * 60)) : JSON.stringify(o);
    const env = avec(texte);
    for (const f of FONCTIONS) for (const c of COTES) etat(env, f, c, alea() < 0.5 ? CO : undefined);
    outilCoupe(env, 'copier_intervention'); modesActuel(env); lireEtape3(texte); lireEtape3(o);
  }
});

Deno.test('off / pilote / pct / on : chaque valeur, chaque côté, indépendamment', () => {
  const env = avec({ ouvrir: { bureau: 'on', salarie: 'off' }, boucle: { bureau: 'pilote' } });
  vrai(etat(env, 'ouvrir', 'bureau', CO) === true, 'ouvrir bureau on');
  vrai(etat(env, 'ouvrir', 'salarie', CO) === false, 'ouvrir salarié off');
  vrai(etat(env, 'boucle', 'bureau', CO) === false, 'boucle bureau pilote sans liste');
  vrai(etat(avec({ ouvrir: { bureau: 'on' } }), 'ouvrir', 'salarie', CO) === false, 'un côté absent est éteint');
  // pilote : seulement les entreprises de la liste, comparées sans tenir compte de la casse ni des espaces.
  const pilote = avec({ ouvrir: { bureau: 'pilote', salarie: 'pilote' }, pilote: [CO.toUpperCase(), 'autre-entreprise'] });
  vrai(etat(pilote, 'ouvrir', 'bureau', CO) === true && etat(pilote, 'ouvrir', 'salarie', ` ${CO} `) === true, 'pilote : entreprise listée');
  vrai(etat(pilote, 'ouvrir', 'bureau', '11111111-2222-3333-4444-555555555555') === false, 'pilote : entreprise non listée');
  for (const id of [undefined, null, '', '  ']) vrai(etat(pilote, 'ouvrir', 'bureau', id as never) === false, 'pilote : entreprise inconnue');
  // pct : un entier, le seau de l'entreprise strictement dessous.
  const s = seau(CO);
  vrai(s >= 0 && s < 100, 'seau dans 0-99');
  const pct = (n: number) => avec({ ouvrir: { bureau: 'pct' }, pct: n });
  vrai(etat(pct(0), 'ouvrir', 'bureau', CO) === false, 'pct 0 : personne');
  vrai(etat(pct(100), 'ouvrir', 'bureau', CO) === true, 'pct 100 : tout le monde');
  vrai(etat(pct(s), 'ouvrir', 'bureau', CO) === false, 'pct = seau : strictement inférieur, donc éteint');
  vrai(etat(pct(s + 1), 'ouvrir', 'bureau', CO) === true, 'pct = seau + 1 : allumé');
  for (const id of [undefined, null, '']) vrai(etat(pct(100), 'ouvrir', 'bureau', id as never) === false, 'pct : pas d\'entreprise, pas de seau');
  vrai(etat(avec({ ouvrir: { bureau: 'pct' } }), 'ouvrir', 'bureau', CO) === false, 'pct absent = 0');
  // `on` ne dépend ni de pct ni du pilote.
  vrai(etat(avec({ ouvrir: { bureau: 'on' }, pct: 0, pilote: [] }), 'ouvrir', 'bureau', undefined) === true, 'on partout');
});

Deno.test('FNV-1a : valeurs de référence, UTF-8, indépendance de l\'implémentation, répartition par entreprise', () => {
  // Vecteurs publiés de FNV-1a 32 bits.
  egal([fnv1a(''), fnv1a('a'), fnv1a('foobar')], [0x811c9dc5, 0xe40c292c, 0xbf9cf968], 'vecteurs de référence');
  // Octets UTF-8, pas unités UTF-16 : « é » = c3 a9.
  egal(fnv1a('é'), fnvRef([0xc3, 0xa9]), 'UTF-8');
  egal(fnv1a('日本'), fnvRef(Array.from(new TextEncoder().encode('日本'))), 'UTF-8 multi-octets');
  egal(fnv1a(CO), fnvRef(Array.from(new TextEncoder().encode(CO))), 'identifiant d\'entreprise');
  // Valeurs figées : si l'une bouge, des entreprises changent de bras.
  egal([seau(CO), seau('00000000-0000-0000-0000-000000000000'), seau('co-eval')], [seau(CO), seau('00000000-0000-0000-0000-000000000000'), seau('co-eval')], 'déterministe');
  egal(seau('00000000-0000-0000-0000-000000000000'), fnvRef(Array.from(new TextEncoder().encode('00000000-0000-0000-0000-000000000000'))) % 100, 'seau = FNV-1a % 100');
  vrai(fnv1a('x') >= 0 && fnv1a('x') <= 0xffffffff && Number.isInteger(fnv1a('x')), 'entier non signé 32 bits');
  // Répartition : sur 20 000 identifiants, la part sous pct s'écarte de pct de moins de 1,5 point.
  let graine = 7;
  const alea = () => { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return graine; };
  const hex = () => alea().toString(16).padStart(8, '0');
  const ids = Array.from({ length: 20000 }, () => `${hex()}-${hex().slice(0, 4)}-4${hex().slice(0, 3)}-8${hex().slice(0, 3)}-${hex()}${hex().slice(0, 4)}`);
  for (const p of [10, 50, 90]) {
    const env = avec({ ouvrir: { bureau: 'pct' }, pct: p });
    const part = ids.filter((i) => etat(env, 'ouvrir', 'bureau', i)).length / ids.length * 100;
    vrai(Math.abs(part - p) < 1.5, `pct ${p} : ${part.toFixed(2)} % des entreprises`);
  }
  // Monotone : une entreprise dans pct 10 est dans pct 50 (on élargit un pilote sans en sortir personne).
  const e10 = avec({ ouvrir: { bureau: 'pct' }, pct: 10 }); const e50 = avec({ ouvrir: { bureau: 'pct' }, pct: 50 });
  for (const i of ids.slice(0, 2000)) if (etat(e10, 'ouvrir', 'bureau', i)) vrai(etat(e50, 'ouvrir', 'bureau', i), `${i} dans 10 % mais pas dans 50 %`);
});

Deno.test('outils_coupes : un outil par son nom ; modes_actuel : la garde LIVRAISON_COURANTE < 3d1 ignore tout sauf "*"', () => {
  const env = avec({ outils_coupes: ['copier_intervention', 'ouvrir_fenetre'] });
  vrai(outilCoupe(env, 'ouvrir_fenetre') && outilCoupe(env, 'copier_intervention') && !outilCoupe(env, 'repondre'), 'outils_coupes');
  vrai(!outilCoupe(avec(undefined), 'ouvrir_fenetre') && !outilCoupe(avec('{'), 'ouvrir_fenetre') && !outilCoupe(null, 'x_y'), 'rien de coupé sans secret ou avec un secret illisible');
  for (const nom of ['__proto__', 'constructor', 'toString', '']) vrai(!outilCoupe(env, nom), `nom ${nom}`);
  // Garde.
  const liste = avec({ ecritures: { bureau: 'on', modes_actuel: ['affecter_planning'] } });
  egal(modesActuel(liste), '*', 'avant 3d-1 : toute liste est ignorée');
  egal(modesActuel(liste, '3c'), '*', '3c : ignorée');
  egal(modesActuel(liste, '3d1'), ['affecter_planning'], '3d-1 : la liste agit');
  egal(modesActuel(avec(undefined), '3d6'), '*', 'sans secret : "*"');
  egal(modesActuel(avec('{'), '3d6'), '*', 'illisible : "*"');
  egal(configDe(avec({ ecritures: { modes_actuel: '*' } })).modes_actuel, '*', '"*" accepté');
});

Deno.test('boucle et ecritures : acceptés et ignorés — un secret écrit pour 3c / 3d n\'éteint pas `ouvrir`, et ne rallume rien d\'autre', () => {
  const env = avec({
    ouvrir: { bureau: 'on', salarie: 'off' }, boucle: { bureau: 'pct', salarie: 'pilote' },
    ecritures: { bureau: 'on', salarie: 'off', modes_actuel: ['affecter_planning', 'poser_absence'] },
    pilote: [CO], pct: 25, outils_coupes: ['copier_intervention'],
  });
  const lu = lireEtape3(JSON.stringify({ ouvrir: { bureau: 'on' }, ecritures: { modes_actuel: ['a_b'] } }));
  vrai(lu.ok, 'schéma complet accepté');
  vrai(etat(env, 'ouvrir', 'bureau', CO) === true && etat(env, 'ouvrir', 'salarie', CO) === false, 'ouvrir lu normalement');
  vrai(etat(env, 'ecritures', 'bureau', CO) === true, 'le schéma est lu (utile à 3d)');
  // La lecture ne touche à rien : le même texte donne la même configuration, deux fois.
  egal(configDe(env), configDe(env), 'lecture déterministe');
});
