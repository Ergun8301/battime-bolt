// Étape 3, livraison 3b-1 : `ouvrirDepuisAppel` (ouvrir.ts) — résolution, ambiguïtés, côté et rôle, `__proto__`, longueurs, niveau 3, `auto`, aucun écrit.
//   npm run test:ouvrir   (npx -y deno@2.9.6 test --allow-env --allow-read supabase/functions/_shared/ouvrir.test.ts)
import { aplatir, evoque, lienOuvrir, LIEN_MAX, LIENS_MAX, moisClotures, ouvrirDepuisAppel, REPONSE_MAX, TEXTE_MAX, verbeOuverture, type CtxOuvrir } from './ouvrir.ts';
import { OUVREURS, OUVREURS_BUREAU, OUVREURS_SALARIE, trouverOuvreur } from './registre/ouvreurs.ts';

const egal = (obtenu: unknown, attendu: unknown, msg: string) => {
  const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${b}`);
};
const vrai = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
const profond = <T>(o: T): T => { if (o && typeof o === 'object') { for (const v of Object.values(o)) profond(v); Object.freeze(o); } return o; };

const CTX = (o: Partial<CtxOuvrir> = {}): CtxOuvrir => ({
  today: '2026-10-01', demande: 'ouvre la fiche de Karim',
  salaries: [
    { id: 'u-karim', prenom: 'Karim', nom: 'Benali', role: 'worker' }, { id: 'u-sofiane', prenom: 'Sofiane', nom: 'Merabet', role: 'lead' },
    { id: 'u-kevin', prenom: 'Kevin', nom: 'Roussel', role: 'worker' }, { id: 'u-ergun', prenom: 'Ergun', nom: 'Kilic', role: 'admin' },
  ],
  chantiers: [
    { id: 'w-dupont', nom: 'Villa Dupont', ville: 'Lyon' }, { id: 'w-martin', nom: 'Bureau Martin', ville: 'Villeurbanne' },
    { id: 'w-macon', nom: 'Pizzeria Exemple', ville: 'Mâcon' }, { id: 'w-bourg', nom: 'Pizzeria Exemple', ville: 'Bourg-en-Bresse' },
  ],
  ...o,
});
const ouvre = (args: Record<string, unknown>, ctx = CTX(), cote: 'bureau' | 'salarie' = 'bureau', role: 'admin' | 'worker' | 'lead' = 'admin') => ouvrirDepuisAppel(args, ctx, cote, role);

Deno.test('Résolution : un nom dit devient l\'identifiant de SON entreprise, les dates et heures sont normalisées', () => {
  const r = ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Karim', mode: 'hours' } });
  egal(r.links, [{ label: 'Fiche du salarié · Karim Benali', action: 'ouvrir:salarie.fiche?salarie=u-karim&mode=hours' }], 'fiche de Karim');
  vrai(r.auto === true, 'ouvre → auto');
  vrai(r.answer.includes('Karim Benali'), 'la réponse dit ce qui est pré-rempli');
  const a = ouvre({ id: 'planning.ajouter', valeurs: { salarie: 'sofiane', date: 'demain', chantier: 'dupont', debut: '8h30', fin: '12h', note: 'prévoir l’échafaudage', type: 'Tache' } }, CTX({ demande: 'ouvre le formulaire pour Sofiane demain' }));
  egal(a.links[0].action, 'ouvrir:planning.ajouter?salarie=u-sofiane&date=2026-10-02&chantier=w-dupont&debut=08%3A30&fin=12%3A00&note=pr%C3%A9voir%20l%E2%80%99%C3%A9chafaudage&type=tache', 'planning.ajouter');
  const v = ouvre({ id: 'planning.versions', valeurs: { lundi: '2026-10-07' } });
  egal(v.links[0].action, 'ouvrir:planning.versions?lundi=2026-10-05', 'lundi = le lundi de la semaine');
  const s = ouvre({ id: 'planning.semaine', valeurs: { lundi: 'lundi prochain', jour: '2026-10-08' } });
  egal(s.links[0].action, 'ouvrir:planning.semaine?lundi=2026-10-05&jour=2026-10-08', 'lundi prochain');
  const x = ouvre({ id: 'export.equipe', valeurs: { du: '2026-09-01', au: '2026-09-30' } }, CTX({ demande: 'prépare l’export de septembre' }));
  egal(x.links[0].action, 'ouvrir:export.equipe?du=2026-09-01&au=2026-09-30', 'export septembre');
  const ab = ouvre({ id: 'absence.poser', valeurs: { salarie: 'Sofiane', type: 'conge', du: '2026-10-12', au: '2026-10-16' } }, CTX({ demande: 'ouvre le formulaire d’absence pour Sofiane du 12 au 16' }));
  egal(ab.links[0].action, 'ouvrir:absence.poser?salarie=u-sofiane&type=conge&du=2026-10-12&au=2026-10-16', 'absence du 12 au 16');
  // Sans valeur : l'écran seul.
  egal(ouvre({ id: 'reserves.registre' }, CTX({ demande: 'montre-moi les réserves' })).links, [{ label: 'Réserves', action: 'ouvrir:reserves.registre' }], 'sans valeur');
  // Une valeur hors liste ou hors forme reste VIDE (jamais devinée).
  egal(ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Karim', mode: 'paie' } }).links[0].action, 'ouvrir:salarie.fiche?salarie=u-karim', 'mode inconnu ignoré');
  egal(ouvre({ id: 'planning.versions', valeurs: { lundi: 'n’importe quoi' } }).links[0].action, 'ouvrir:planning.versions', 'date illisible ignorée');
  egal(ouvre({ id: 'planning.versions', valeurs: { lundi: '2026-02-31' } }).links[0].action, 'ouvrir:planning.versions', 'date impossible ignorée');
});

Deno.test('Nom inconnu ou ambigu : UNE question avec choix (3 liens au plus), jamais un identifiant deviné', () => {
  const c = CTX({ salaries: [
    { id: 'u-k1', prenom: 'Karim', nom: 'Benali' }, { id: 'u-k2', prenom: 'Karim', nom: 'Dupuis' }, { id: 'u-k3', prenom: 'Karim', nom: 'Morel' },
    { id: 'u-k4', prenom: 'Karim', nom: 'Petit' }, { id: 'u-s', prenom: 'Sofiane', nom: 'Merabet' },
  ] });
  const r = ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Karim', mode: 'hours' } }, c);
  vrai(!r.auto, 'une question n\'ouvre jamais seule');
  vrai(r.answer.includes('lequel') && r.answer.includes('4') && r.answer.includes('précisez'), `la question dit combien : ${r.answer}`);
  egal(r.links.length, LIENS_MAX, '3 liens au plus (4 candidats)');
  egal(r.links.map((l) => l.action), ['u-k1', 'u-k2', 'u-k3'].map((id) => `ouvrir:salarie.fiche?salarie=${id}&mode=hours`), 'un choix par candidat, avec les autres valeurs');
  vrai(r.links.every((l) => !l.action.includes('u-s')), 'Sofiane n\'est pas un candidat');
  // Deux chantiers du même client : la ville les départage.
  const p = ouvre({ id: 'client.fiche', valeurs: { chantier: 'Pizzeria Exemple' } });
  egal(p.links.map((l) => l.action), ['ouvrir:client.fiche?chantier=w-macon', 'ouvrir:client.fiche?chantier=w-bourg'], 'deux Pizzeria → deux choix');
  egal(ouvre({ id: 'client.fiche', valeurs: { chantier: 'Pizzeria Exemple Mâcon' } }).links[0].action, 'ouvrir:client.fiche?chantier=w-macon', 'avec la ville : un seul');
  // Inconnu, obligatoire : une question, pas de lien. Inconnu, facultatif : l'écran sans la valeur.
  const inconnu = ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Zoubida' } });
  egal(inconnu.links, [], 'salarié inconnu et obligatoire : aucun lien');
  vrai(inconnu.answer.includes('Je ne trouve pas'), 'le dit');
  egal(ouvre({ id: 'export.salarie', valeurs: { salarie: 'Zoubida' } }).links.map((l) => l.action), ['ouvrir:export.salarie'], 'salarié inconnu et facultatif : l\'écran sans lui');
  // Valeur obligatoire absente : une question.
  const m = ouvre({ id: 'salarie.fiche' });
  vrai(m.links.length === 0 && m.answer.startsWith('Pour quel salarié'), `question : ${m.answer}`);
  vrai(ouvre({ id: 'absence.poser', valeurs: { salarie: 'Karim' } }).answer.startsWith('Pour quel jour'), 'absence sans date');
});

Deno.test('Côté et rôle : égalité dans un tableau, jamais OUVREURS[id] — `__proto__`, `constructor`, un id d\'un autre côté, un rôle qui ne convient pas', () => {
  const refus = (args: Record<string, unknown>, cote: 'bureau' | 'salarie' = 'bureau', role: 'admin' | 'worker' | 'lead' = 'admin') => {
    const r = ouvre(args, CTX({ demande: 'comment j\'ajoute un salarié' }), cote, role);
    vrai(r.links.every((l) => !l.action.startsWith('ouvrir:')) && r.answer.startsWith('Je ne peux pas ouvrir'), `refus attendu pour ${JSON.stringify(args)} (${cote}/${role}) : ${JSON.stringify(r)}`);
  };
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype', '', ' salaries.liste', 'salaries.liste ', 'SALARIES.LISTE', 'guide:constructor', 'ouvrir:__proto__', 'inconnu.ecran', 'salaries.liste?x=1']) refus({ id });
  for (const id of [undefined, null, 3, true, {}, [], ['salaries.liste'], { toString: () => 'salaries.liste' }]) refus({ id });
  refus({});
  // Côté : le salarié ne connaît aucun écran du bureau, même en forgeant l'id ; et inversement.
  for (const o of OUVREURS_BUREAU) refus({ id: o.id }, 'salarie', 'worker');
  for (const o of OUVREURS_SALARIE) refus({ id: o.id }, 'bureau', 'admin');
  // Rôle : un salarié ne se fait pas passer pour le bureau, un bureau pas pour un salarié.
  refus({ id: 'salaries.liste' }, 'bureau', 'worker'); refus({ id: 'salaries.liste' }, 'bureau', 'lead'); refus({ id: 'jour.date', valeurs: { date: 'hier' } }, 'salarie', 'admin');
  vrai(ouvre({ id: 'jour.date', valeurs: { date: 'hier' } }, CTX({ demande: 'ouvre ma journée d’hier' }), 'salarie', 'worker').links.length === 1, 'le salarié ouvre ses écrans');
  vrai(ouvre({ id: 'jour.date', valeurs: { date: 'hier' } }, CTX({ demande: 'ouvre ma journée d’hier' }), 'salarie', 'lead').links.length === 1, 'le chef d\'équipe aussi');
  egal(trouverOuvreur('__proto__', 'bureau'), null, 'trouverOuvreur(__proto__)'); egal(trouverOuvreur('constructor', 'salarie'), null, 'trouverOuvreur(constructor)');
  egal(trouverOuvreur('salaries.liste', 'salarie'), null, 'un id du bureau n\'existe pas côté salarié');
  // `valeurs` : clés dangereuses, JSON sérialisé, tableaux — jamais d'exception, jamais de clé inventée.
  const piege = JSON.parse('{"__proto__":{"x":"y"},"constructor":"z","salarie":"Karim","mode":"hours","inconnue":"1","toString":"2"}');
  egal(ouvre({ id: 'salarie.fiche', valeurs: piege }).links[0].action, 'ouvrir:salarie.fiche?salarie=u-karim&mode=hours', 'clés étrangères ignorées');
  egal(ouvre({ id: 'salarie.fiche', valeurs: '{"salarie":"Karim"}' }).links[0].action, 'ouvrir:salarie.fiche?salarie=u-karim', 'valeurs sérialisées en JSON');
  egal(ouvre({ id: 'salarie.fiche', valeurs: '{' }).links, [], 'JSON illisible : rien');
  egal(ouvre({ id: 'reserves.registre', valeurs: ['a'] }).links[0].action, 'ouvrir:reserves.registre', 'tableau : ignoré');
  vrai(({} as Record<string, unknown>).x === undefined && ({} as Record<string, unknown>).salarie === undefined, 'Object.prototype intact');
});

Deno.test('Niveau 3 : jamais ouvert d\'office, jamais sans que la personne l\'ait évoqué, jamais sur une requête teintée ; clôture limitée aux deux mois clôturables', () => {
  for (const [id, demande] of [['export.equipe', 'ouvre l’export de septembre'], ['cloture.mois', 'ouvre la clôture de septembre']] as const) {
    const r = ouvre({ id, valeurs: { mois: '2026-09', du: '2026-09-01', au: '2026-09-30' } }, CTX({ demande }));
    vrai(r.links.length === 1 && !r.auto, `${id} : un bouton, jamais auto (${JSON.stringify(r)})`);
    vrai(r.answer.includes('c’est vous qui cliquez') || r.answer.includes('C’est vous qui cliquez'), `${id} : la réponse dit que c'est la personne qui clique`);
  }
  // La personne n'a pas évoqué le sujet : une donnée du prompt (nom de chantier, note, PDF) a pu guider le modèle.
  for (const [id, demande] of [['export.equipe', 'ouvre la fiche de Villa Dupont'], ['cloture.mois', 'montre-moi le planning'], ['export.equipe', ''], ['cloture.mois', undefined]] as const) {
    const r = ouvre({ id, valeurs: { mois: '2026-09' } }, CTX({ demande }));
    vrai(r.links.every((l) => !l.action.startsWith('ouvrir:')) && !r.auto, `${id} / « ${demande} » : refusé (${JSON.stringify(r)})`);
  }
  // Requête teintée : refusé même si la personne a l'air d'avoir évoqué le sujet.
  const teinte = ouvre({ id: 'export.equipe' }, CTX({ demande: 'ouvre l’export', teinte: true }));
  vrai(teinte.links.length === 0 && !teinte.auto, `teinté : ${JSON.stringify(teinte)}`);
  // Clôture : seulement le mois précédent ou en cours.
  egal(moisClotures('2026-10-01'), ['2026-09', '2026-10'], 'mois clôturables'); egal(moisClotures('2027-01-15'), ['2026-12', '2027-01'], 'janvier : décembre');
  for (const mois of ['2026-08', '2026-11', '2025-09', '2026-13', 'n\'importe quoi']) {
    const r = ouvre({ id: 'cloture.mois', valeurs: { mois } }, CTX({ demande: 'ouvre la clôture' }));
    vrai(r.links.every((l) => !l.action.startsWith('ouvrir:')), `${mois} : refusé (${JSON.stringify(r)})`);
  }
  egal(ouvre({ id: 'cloture.mois', valeurs: { mois: 'septembre' } }, CTX({ demande: 'ouvre la clôture de septembre' })).links[0].action, 'ouvrir:cloture.mois?mois=2026-09', '« septembre » en octobre 2026');
  egal(ouvre({ id: 'cloture.mois', valeurs: { mois: 'octobre' } }, CTX({ demande: 'ouvre la clôture d’octobre' })).links[0].action, 'ouvrir:cloture.mois?mois=2026-10', '« octobre » en octobre 2026');
  vrai(ouvre({ id: 'cloture.mois' }, CTX({ demande: 'ouvre la clôture' })).links.length === 0, 'mois obligatoire');
  // Les niveaux du registre sont ceux-là, ni plus ni moins.
  egal(OUVREURS.filter((o) => o.niveau === 3).map((o) => o.id), ['export.equipe', 'cloture.mois'], 'niveau 3 livrés');
  vrai(OUVREURS.filter((o) => o.niveau === 3).every((o) => !!o.declencheur), 'tout niveau 3 a un déclencheur');
  vrai(evoque(trouverOuvreur('export.equipe', 'bureau')!, 'je veux exporter les heures') && !evoque(trouverOuvreur('export.equipe', 'bureau')!, 'ouvre villa dupont'), 'evoque');
});

Deno.test('`auto` : décidé par le serveur seulement — verbe d\'ouverture de la personne, niveau 1, requête non teintée, pas de question', () => {
  for (const d of ['ouvre la fiche de Karim', 'emmène-moi aux réserves', 'montre-moi les demandes de congé', 'va dans les réglages', 'affiche le planning', 'Karim’in kartını aç', 'ayarları göster', 'Ouvre-moi ça']) vrai(verbeOuverture(d), `verbe : ${d}`);
  for (const d of ['comment j’ouvre la fiche de Karim ?', 'où est la fiche de Karim', 'explique-moi la fiche', 'la fiche de Karim', 'je veux remplir un nouveau client', '', undefined]) vrai(!verbeOuverture(d), `pas de verbe : ${d}`);
  vrai(ouvre({ id: 'reserves.registre' }, CTX({ demande: 'montre-moi les réserves' })).auto === true, 'montre-moi → auto');
  vrai(!ouvre({ id: 'reserves.registre' }, CTX({ demande: 'je veux voir les réserves' })).auto, 'sans verbe d\'ouverture : un bouton');
  vrai(!ouvre({ id: 'reserves.registre' }, CTX({ demande: 'ouvre les réserves', teinte: true })).auto, 'teinté : jamais auto');
  vrai(!ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Zoubida' } }).auto, 'une question : jamais auto');
  // Le serveur ne lit jamais un `auto` venu du modèle.
  vrai(!ouvre({ id: 'reserves.registre', auto: true }, CTX({ demande: 'les réserves' })).auto && !ouvre({ id: 'reserves.registre', valeurs: { auto: 'true' } }, CTX({ demande: 'les réserves' })).auto, 'auto du modèle ignoré');
});

Deno.test('Longueurs : lien ≤ 200, réponse ≤ 700, texte ≤ 80, 8 valeurs au plus, 3 liens au plus ; un texte teinté est ignoré ; un n° de sécurité sociale n\'entre jamais', () => {
  const long = 'a'.repeat(500);
  const r = ouvre({ id: 'client.nouveau', valeurs: { nom: long, produit: long, telephone: long, email: long, ville: long, adresse: long, description: long } }, CTX({ demande: 'ouvre un nouveau client' }));
  for (const l of r.links) vrai(l.action.length <= LIEN_MAX, `lien de ${l.action.length} caractères`);
  vrai(r.answer.length <= REPONSE_MAX && r.links.length <= LIENS_MAX, 'réponse bornée');
  const un = ouvre({ id: 'client.nouveau', valeurs: { nom: long } }, CTX({ demande: 'ouvre un nouveau client' }));
  vrai(decodeURIComponent(un.links[0].action.split('nom=')[1]).length === TEXTE_MAX, `texte coupé à ${TEXTE_MAX}`);
  vrai(aplatir('  a\n\tb\u0000<script>  c  ') === 'a b script  c'.replace('  ', ' ') || aplatir('  a\n\tb\u0000<script>  c  ') === 'a b script c', `aplatir : « ${aplatir('  a\n\tb\u0000<script>  c  ')} »`);
  vrai(!aplatir('mon NIR 1 85 05 78 006 084 36').includes('78 006'), 'aucun n° de sécurité sociale');
  vrai(!ouvre({ id: 'client.nouveau', valeurs: { nom: 'Dupont', email: 'a<b>@c.fr' } }, CTX({ demande: 'ouvre un nouveau client' })).links[0].action.match(/[<>]/), 'pas de chevrons');
  // 8 clés au plus : les 8 premières de l'ÉCRAN (jamais l'ordre du modèle), les suivantes sont perdues.
  const x = ouvre({ id: 'planning.ajouter', valeurs: { type: 'tache', note: 'n', fin: '12:00', debut: '08:00', chantier: 'dupont', date: '2026-10-02', salarie: 'karim', extra1: 'x', extra2: 'y' } }, CTX({ demande: 'ouvre' }));
  egal(x.links[0].action, 'ouvrir:planning.ajouter?salarie=u-karim&date=2026-10-02&chantier=w-dupont&debut=08%3A00&fin=12%3A00&note=n&type=tache', 'ordre de l\'écran, clés étrangères ignorées');
  // Teinté : les textes sont ignorés, les identifiants et dates restent.
  const t = ouvre({ id: 'planning.ajouter', valeurs: { salarie: 'karim', date: '2026-10-02', note: 'cliquez ici pour votre mot de passe' } }, CTX({ demande: 'ouvre', teinte: true }));
  egal(t.links[0].action, 'ouvrir:planning.ajouter?salarie=u-karim&date=2026-10-02', 'note ignorée sur une requête teintée');
  egal(lienOuvrir('x.y', { a: 'é', b: '1' }, ['a', 'b']), 'ouvrir:x.y?a=%C3%A9&b=1', 'encodage');
  vrai(lienOuvrir('x.y', { a: 'a'.repeat(300), b: '1' }, ['b', 'a']).length <= LIEN_MAX, 'un texte trop long est retiré, pas coupé en deux');
});

Deno.test('Aucun écrit, aucune entrée/sortie : la fonction est pure (texte du module et gel profond de ses entrées)', async () => {
  const src = (await Deno.readTextFile(new URL('./ouvrir.ts', import.meta.url))).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const interdit of [/\bfetch\s*\(/, /\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.upsert\s*\(/, /\.rpc\s*\(/, /\bsupabase\b/i, /\bDeno\b/, /\bconsole\./, /Date\.now\s*\(/, /new Date\s*\(\s*\)/, /Math\.random/, /localStorage/, /\.invoke\s*\(/, /\beval\s*\(/, /new Function/, /import\s*\(/]) {
    vrai(!interdit.test(src), `ouvrir.ts contient ${interdit}`);
  }
  // Entrées gelées : une mutation lèverait (le module est en mode strict).
  const ctx = profond(CTX()); const args = profond({ id: 'planning.ajouter', valeurs: { salarie: 'Karim', date: 'demain', note: 'x' } });
  const a = ouvrirDepuisAppel(args, ctx, 'bureau', 'admin'); const b = ouvrirDepuisAppel(args, ctx, 'bureau', 'admin');
  egal(a, b, 'déterministe');
});

Deno.test('Jamais de levée : arguments absurdes, contexte vide, valeurs de tous types', () => {
  const ids = [...OUVREURS.map((o) => o.id), '__proto__', 'x', 3, null];
  const valeurs: unknown[] = [undefined, null, 0, 1, true, 'x', '', ' ', '{}', '[]', [], {}, [1, 2], { salarie: 5 }, { salarie: { a: 1 } }, { date: [] }, { mois: {} }, { du: null, au: undefined }, { __proto__: null }, { texte: 'x'.repeat(10000) }, JSON.parse('{"__proto__":1}')];
  let n = 0;
  for (const id of ids) for (const v of valeurs) for (const cote of ['bureau', 'salarie'] as const) for (const role of ['admin', 'worker', 'lead'] as const) {
    for (const ctx of [CTX(), { today: '2026-10-01' } as CtxOuvrir, CTX({ salaries: [], chantiers: [], demande: undefined }), CTX({ teinte: true, demande: 'ouvre l’export' })]) {
      const r = ouvrirDepuisAppel({ id, valeurs: v } as never, ctx, cote, role);
      vrai(typeof r.answer === 'string' && r.answer.length <= REPONSE_MAX && Array.isArray(r.links) && r.links.length <= LIENS_MAX && r.links.every((l) => l.action.length <= LIEN_MAX), `forme : ${JSON.stringify([id, v, cote, role])}`);
      n++;
    }
  }
  for (const a of [undefined, null, 5, 'x', [], () => 1]) ouvrirDepuisAppel(a as never, CTX(), 'bureau', 'admin');
  console.log(`${n} appels, 0 exception`);
});

Deno.test('Salarié : jour.date (date obligatoire) et formations.ouvrir ; la journée d\'aujourd\'hui reste le lien « journee » existant', () => {
  const c = CTX({ demande: 'ouvre ma journée du 28 septembre' });
  egal(ouvre({ id: 'jour.date', valeurs: { date: '2026-09-28' } }, c, 'salarie', 'worker').links, [{ label: 'Une autre journée', action: 'ouvrir:jour.date?date=2026-09-28' }], 'jour.date');
  egal(ouvre({ id: 'jour.date', valeurs: { date: 'lundi' } }, c, 'salarie', 'worker').links[0].action, 'ouvrir:jour.date?date=2026-10-05', '« lundi » = le prochain lundi');
  vrai(ouvre({ id: 'jour.date' }, c, 'salarie', 'worker').answer.startsWith('Pour quel jour'), 'date obligatoire');
  egal(ouvre({ id: 'formations.ouvrir' }, CTX({ demande: 'montre-moi mes formations' }), 'salarie', 'worker').links.map((l) => l.action), ['ouvrir:formations.ouvrir'], 'formations');
  egal(ouvre({ id: 'formations.ouvrir', valeurs: { salarie: 'Karim' } }, c, 'salarie', 'worker').links.map((l) => l.action), ['ouvrir:formations.ouvrir'], 'aucune clé inconnue');
});

// ── 3b-1bis : le texte construit par le serveur suit la langue de la demande ────────────────────────────────────────────────────────────────
const MOTS_FR_REPONSE = /\b(ouvre|voici|pr[ée]-?rempli|v[ée]rifiez|enregistrer|salari[ée]s?|client|chantier|semaine|pr[ée]cisez|lequel|dites|rien n)\b|[«»]/i;
const turc = (s: string) => /[ğşıİĞŞ]/.test(s);

Deno.test('Turc : jour.date et formations.ouvrir répondent en turc (titre traduit, date « 30 Eylül Çarşamba »), en français sinon, sans point doublé', () => {
  const ctx = (demande: string) => CTX({ today: '2026-10-01', demande });
  const jt = ouvre({ id: 'jour.date', valeurs: { date: '2026-09-30' } }, ctx('Dünkü günümü aç lütfen, saatlerime bakacağım.'), 'salarie', 'worker');
  egal(jt.answer, 'Başka bir gün açılıyor. Önceden dolduruldu: 30 Eylül Çarşamba.', 'jour.date TR');
  egal(jt.links, [{ label: 'Başka bir gün', action: 'ouvrir:jour.date?date=2026-09-30' }], 'le lien (action) ne change pas');
  vrai(jt.auto === true, 'auto inchangé');
  const ft = ouvre({ id: 'formations.ouvrir' }, ctx('Eğitimlerimi aç lütfen.'), 'salarie', 'worker');
  egal(ft.answer, 'Eğitimlerim açılıyor.', 'formations TR');
  egal(ft.links[0].action, 'ouvrir:formations.ouvrir', 'lien formations');
  // Sans verbe d'ouverture (pas d'auto) : « İşte … ».
  egal(ouvre({ id: 'formations.ouvrir' }, ctx('Bana eğitimlerimi göster lütfen, izlemem gereken video var mı?'), 'salarie', 'worker').answer, 'Eğitimlerim açılıyor.', 'göster = verbe d’ouverture');
  egal(ouvre({ id: 'formations.ouvrir' }, ctx('eğitimlerim nerede lütfen'), 'salarie', 'worker').answer, 'İşte Eğitimlerim.', 'sans verbe');
  for (const r of [jt, ft]) vrai(!MOTS_FR_REPONSE.test(r.answer), `mot français dans « ${r.answer} »`);
  // Français : même texte qu'avant, sans le second point.
  const jf = ouvre({ id: 'jour.date', valeurs: { date: '2026-09-30' } }, ctx('ouvre le 30 septembre'), 'salarie', 'worker');
  egal(jf.answer, 'J’ouvre « Une autre journée ». Pré-rempli : mer. 30 sept.', 'jour.date FR : un seul point');
  egal(ouvre({ id: 'formations.ouvrir' }, ctx('ouvre mes formations'), 'salarie', 'worker').answer, 'J’ouvre « Mes formations ».', 'formations FR');
  vrai(!/\.\./.test(jf.answer), 'pas de point doublé');
  // Dates : plusieurs jours de la semaine et mois.
  for (const [iso, tr] of [['2026-09-28', '28 Eylül Pazartesi'], ['2026-10-02', '2 Ekim Cuma'], ['2026-12-27', '27 Aralık Pazar'], ['2026-02-03', '3 Şubat Salı'], ['2026-08-15', '15 Ağustos Cumartesi']]) {
    vrai(ouvre({ id: 'jour.date', valeurs: { date: iso } }, ctx('günümü aç lütfen'), 'salarie', 'worker').answer.endsWith(`Önceden dolduruldu: ${tr}.`), `date ${iso} → ${tr}`);
  }
});

Deno.test('Turc : tous les ouvreurs ont un titre turc, et chaque ouvreur répond en turc (sans mot français) quand la demande est turque', () => {
  for (const o of OUVREURS) {
    const cote = o.cote; const role = o.roles[0];
    const valeurs: Record<string, string> = {};
    for (const [n, p] of Object.entries(o.params)) {
      if (p.kind === 'salarie') valeurs[n] = 'Karim'; else if (p.kind === 'chantier') valeurs[n] = 'dupont'; else if (p.kind === 'date' || p.kind === 'lundi') valeurs[n] = '2026-09-30'; else if (p.kind === 'mois') valeurs[n] = '2026-09';
    }
    const fr = ouvre({ id: o.id, valeurs }, CTX({ demande: 'ouvre ' + o.titre.toLowerCase() }), cote, role);
    const tr = ouvre({ id: o.id, valeurs }, CTX({ demande: o.niveau === 3 ? `lütfen ${(o.declencheur ? 'dışa aktar kapat' : '')}` : 'lütfen şunu aç, göster' }), cote, role);
    vrai(fr.links.length >= 1 || fr.answer.length > 0, `${o.id} FR répond`);
    if (o.niveau === 3) continue; // refus turc testé à part
    vrai(tr.links.length === 1, `${o.id} TR : un lien`);
    vrai(turc(tr.answer) || /açılıyor|İşte/.test(tr.answer), `${o.id} TR : réponse en turc (« ${tr.answer} »)`);
    vrai(!MOTS_FR_REPONSE.test(tr.answer), `${o.id} TR : mot français dans « ${tr.answer} »`);
    egal(tr.links[0].action, ouvre({ id: o.id, valeurs }, CTX({ demande: 'ouvre' }), cote, role).links[0].action, `${o.id} : le lien est identique quelle que soit la langue`);
    vrai(tr.auto === true && fr.auto === true, `${o.id} : auto identique`);
  }
});

Deno.test('Turc, bureau : questions, refus, niveau 3 et clôture en turc ; une demande française reste française', () => {
  const t = (demande: string) => CTX({ demande });
  const ok = (s: string) => vrai(!MOTS_FR_REPONSE.test(s) && /[a-zçğıöşü]/i.test(s), `mot français dans « ${s} »`);
  // 1. Fiche d'un salarié : titre traduit, nom propre conservé.
  const k = ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Karim' } }, t('Karim’in kartını aç'));
  egal(k.answer, 'Çalışan kartı açılıyor. Önceden dolduruldu: Karim Benali. Kaydetmeden önce kontrol edin.', 'ot01');
  egal(k.links[0].label, 'Çalışan kartı · Karim Benali', 'étiquette TR');
  // 2. Sans paramètre.
  egal(ouvre({ id: 'client.nouveau' }, t('yeni müşteri formunu aç')).answer, 'Yeni müşteri açılıyor. Kaydetmeden önce kontrol edin.', 'ot02');
  egal(ouvre({ id: 'salaries.liste' }, t('çalışanların listesini aç')).answer, 'Çalışanlar açılıyor.', 'ot04');
  egal(ouvre({ id: 'reserves.registre' }, t('rezervleri göster')).answer, 'Çekinceler açılıyor.', 'ot05 (demande courte)');
  egal(ouvre({ id: 'conges.demandes' }, t('izin taleplerini göster')).answer, 'İzin talepleri açılıyor.', 'ot06');
  egal(ouvre({ id: 'planning.versions' }, t('planlamanın sürümlerini aç')).answer, 'Planlama sürümleri açılıyor.', 'ot10 (une seule lettre turque)');
  egal(ouvre({ id: 'stats.equipe' }, t('ekibin istatistiklerini göster')).answer, 'Ekip istatistikleri açılıyor.', 'ot12');
  // 3. Date et plage.
  const a = ouvre({ id: 'absence.poser', valeurs: { salarie: 'Sofiane', du: '2026-10-12', au: '2026-10-16' } }, t('Sofiane için 12’den 16’ya izin formunu aç'));
  egal(a.answer, 'Devamsızlık girişi açılıyor. Önceden dolduruldu: Sofiane Merabet, başlangıç 12 Ekim Pazartesi, bitiş 16 Ekim Cuma. Kaydetmeden önce kontrol edin.', 'ot08');
  egal(ouvre({ id: 'planning.semaine', valeurs: { lundi: '2026-10-07' } }, t('gelecek haftanın planlamasını göster')).answer, 'Haftalık planlama açılıyor. Önceden dolduruldu: 5 Ekim Pazartesi haftası.', 'ot09');
  // 4. Question : nom inconnu / ambigu / valeur manquante.
  const q = ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Zzz' } }, t('Zzz’nin kartını aç lütfen'));
  egal(q.answer, '“Zzz” adlı bir çalışan bulamıyorum. Adı belirtin.', 'inconnu TR'); ok(q.answer);
  const amb = ouvre({ id: 'chantier.documents', valeurs: { chantier: 'Pizzeria' } }, t('Pizzeria şantiyesinin belgelerini aç lütfen'));
  vrai(amb.answer.endsWith('hangisi?') && amb.links.length === 2, 'ambigu TR'); ok(amb.answer);
  const m = ouvre({ id: 'salarie.fiche' }, t('çalışan kartını aç lütfen'));
  egal(m.answer, 'Hangi çalışan için? Öğrenir öğrenmez “Çalışan kartı” ekranını açarım.', 'manque TR'); ok(m.answer);
  // 5. Refus : écran inconnu, niveau 3 sans évocation, teinté, clôture hors mois.
  ok(ouvre({ id: 'nimporte.quoi' }, t('şunu aç lütfen')).answer);
  egal(ouvre({ id: 'nimporte.quoi' }, CTX({ demande: 'ouvre autre chose' })).answer, 'Je ne peux pas ouvrir cet écran.', 'refus FR inchangé');
  const e = ouvre({ id: 'export.equipe', valeurs: {} }, t('çalışanlar için bir şey aç lütfen'));
  egal(e.answer, '“Ekibi dışa aktarma” ekranını açmam için açıkça söyleyin (örneğin “Ekibi dışa aktarma aç”).', 'niveau 3 non évoqué TR'); ok(e.answer);
  const e2 = ouvre({ id: 'export.equipe', valeurs: { du: '2026-09-01', au: '2026-09-30' } }, t('eylül ayı export dosyasını hazırla lütfen'));
  egal(e2.answer, 'İşte “Ekibi dışa aktarma”. Onaylamak için siz tıklarsınız: o zamana kadar hiçbir şey yapılmaz. Önceden dolduruldu: başlangıç 1 Eylül Salı, bitiş 30 Eylül Çarşamba.', 'ot03'); ok(e2.answer);
  vrai(e2.auto === undefined, 'niveau 3 : pas d’auto');
  const c = ouvre({ id: 'cloture.mois', valeurs: { mois: '2026-03' } }, t('mart ayını clôture lütfen'));
  egal(c.answer, 'Mart 2026 ayı burada kapatılamaz: yalnızca önceki ay (Eylül 2026) ya da içinde bulunulan ay (Ekim 2026).', 'clôture TR'); ok(c.answer);
  const t3 = ouvre({ id: 'export.equipe' }, CTX({ demande: 'şunu aç lütfen', teinte: true }));
  egal(t3.answer, 'Bu istekte bu ekranı açmıyorum. Doğrudan, kendi sözlerinizle söyleyin.', 'teinté TR');
  // 6. Français : jamais de turc.
  for (const r of [ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Karim' } }, t('ouvre la fiche de Karim')), ouvre({ id: 'absence.poser', valeurs: { salarie: 'Sofiane', du: '2026-10-12' } }, t('ouvre une absence pour Sofiane le 12')), ouvre({ id: 'salarie.fiche', valeurs: { salarie: 'Yılmaz' } }, t('ouvre la fiche de Yılmaz'))]) {
    vrai(!/açılıyor|Önceden|İşte|başlangıç/.test(r.answer), `turc dans une réponse française : « ${r.answer} »`);
  }
  egal(ouvre({ id: 'absence.poser', valeurs: { salarie: 'Sofiane', du: '2026-10-12', au: '2026-10-16' } }, t('ouvre le formulaire d’absence pour Sofiane du 12 au 16')).answer,
    'J’ouvre « Poser une absence ». Pré-rempli : Sofiane Merabet, du lun. 12 oct., au ven. 16 oct. Vérifiez avant d’enregistrer.', 'FR stable');
});

Deno.test('Ouvrir niveau 3 : les mots turcs de l’export et de la clôture sont reconnus, une demande sans rapport ne l’est pas', () => {
  const exp = trouverOuvreur('export.equipe', 'bureau')!;
  const clo = trouverOuvreur('cloture.mois', 'bureau')!;
  for (const p of ['eylül ayı için dışa aktarımı hazırla', 'ekibin saatlerini dışa aktar', 'bordro için ihracat ekranını aç', 'muhasebe için hazırla']) vrai(evoque(exp, p), `export non reconnu : ${p}`);
  for (const p of ['eylül ayını kapat', 'ay kapanışını aç', 'ayı kilitle']) vrai(evoque(clo, p), `clôture non reconnue : ${p}`);
  for (const p of ['Karim’in kartını aç', 'rezervleri göster', 'planlamanın sürümlerini aç']) vrai(!evoque(exp, p) && !evoque(clo, p), `faux positif : ${p}`);
});
