// Salarié — « profil » d'une saisie (courte → lecteur local ; longue → IA en réflexion « medium »).
// Les 80 phrases de mesure existantes ne doivent JAMAIS devenir « longues » (elles gardent leur chemin,
// leur prompt et leurs outils) ; les phrases libres du salarié (français, turc) le sont toutes.
//   npm run test:saisie-profil
import { compteHeures, detecteTurc, LONG_MIN_CHARS, nouvelleDemandeSalarie, plagesDuTexte, profilSaisie, WORKER_TEXT_MAX } from './saisie-profil.ts';
import { WORKER_ACTION_SUGGESTIONS, WORKER_SUGGESTIONS } from './worker-assistant-core.ts';
import { CASES } from '../assistant-eval/cases.ts';

const long = (s: string) => profilSaisie(s).long;
const plages = (s: string) => plagesDuTexte(s).map((p) => `${p.start}-${p.end}`).join(' ');

// Les 11 phrases du diagnostic (retour d'Ergun et variantes mesurées sur le vrai modèle).
const DIAG = [
  'Ajoute-moi une intervention. J’ai travaillé aujourd’hui de 8h à midi, puis pause d’1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d’un store banne.',
  'Alors aujourd’hui j’ai commencé à 7h30 chez Dupont jusqu’à midi, ensuite une pause d’une heure, et l’après-midi de 13h à 16h30 sur un nouveau chantier, c’est madame Claire Martin, 12 rue des Lilas à Bourg-en-Bresse 01000, pour la rénovation d’une salle de bain. Et coche aussi le panier repas.',
  'Hier j’ai bossé de 8h à 12h et de 13h à 17h chez Dupont, j’ai oublié de cocher le panier. Et je voudrais poser un congé du lundi au mercredi de la semaine prochaine.',
  'euh alors ce matin 7h 12h chez dupont, midi pause de 45 minutes, après-midi 12h45 16h30 pareil chez dupont, et j’ai vu une fissure sur le mur, mets une réserve.',
  'Bugün sabah 8’den 12’ye kadar çalıştım, sonra bir saat mola verdim, sonra öğleden sonra 13’ten 17’ye kadar yeni bir şantiyede çalıştım: müşteri Pierrick Dupont, adres Montagna 01250, kollu tente montajı için.',
  'Dün sabah 7:30’dan 12’ye kadar Dupont villasında, öğleden sonra 13’ten 16:30’a kadar Martin ofisinde çalıştım, yarım saat de mola verdim.',
  'Gelecek pazartesiden çarşambaya kadar izin almak istiyorum, bürodan onay gelince haber verin.',
  'Bugünkü yemek sepetini işaretle ve günümü büroya gönder.',
  'Bu hafta toplam kaç saat çalıştım ve geçen haftadan farkım ne?',
  'Şey, bugün... yani sabah erkenden 7’de Dupont’ta başladım, öğlen 12’de bıraktım, bir saat yemek molası verdim, sonra 13’ten 17’ye kadar Montagna’da yeni bir müşteri için çalıştım, adı Ayşe Kaya, posta kodu 01250, çatı tamiri yaptık.',
  'Dupont şantiyesinde duvarda bir çatlak buldum, rezerv olarak not et.',
];

Deno.test('Limites : 1500 caractères côté salarié, 120 pour parler de message « long »', () => {
  if (WORKER_TEXT_MAX !== 1500 || LONG_MIN_CHARS !== 120) throw new Error(`${WORKER_TEXT_MAX} ${LONG_MIN_CHARS}`);
});

Deno.test('(a) Les 80 phrases de mesure existantes restent « courtes » (aucune ne change de chemin)', () => {
  const anciens = CASES.filter((c) => /^(b|s)\d\d$/.test(c.id));
  if (anciens.length !== 80) throw new Error(`${anciens.length} cas anciens`);
  const longs = anciens.filter((c) => long(c.phrase)).map((c) => `${c.id} (${profilSaisie(c.phrase).signaux.join(',')})`);
  if (longs.length) throw new Error(`devenues « longues » : ${longs.join(' ; ')}`);
});

Deno.test('(b) Les phrases libres (français, turc) sont « longues » : les cas sl…/st…, les 11 phrases du diagnostic, le turc sans accents', () => {
  const nouveaux = CASES.filter((c) => !c.etape3 && /^(sl|st)\d\d$/.test(c.id));
  if (nouveaux.length < 27) throw new Error(`${nouveaux.length} cas sl…/st… (27 attendus)`);
  const pas = nouveaux.filter((c) => !long(c.phrase)).map((c) => c.id);
  if (pas.length) throw new Error(`pas « longues » : ${pas.join(', ')}`);
  const pasDiag = DIAG.filter((s) => !long(s));
  if (pasDiag.length) throw new Error(`diagnostic pas « long » : ${pasDiag.join(' | ')}`);
  if (!long('bugun 8 den 12 ye kadar calistim')) throw new Error('turc sans diacritiques');
  if (profilSaisie('Bugün 8’den 12’ye kadar çalıştım').langue !== 'tr') throw new Error('langue turque');
  // La phrase d'Ergun : plusieurs signaux, pas un seul.
  const p = profilSaisie(DIAG[0]);
  if (p.plages !== 2 || !p.signaux.includes('longueur') || !p.signaux.includes('deux_plages_et_pause') || !p.familles.includes('nouveau_chantier')) throw new Error(JSON.stringify(p));
});

Deno.test('(c) Courtes : un nom turc dans une phrase française, une aide, une phrase simple restent au lecteur local', () => {
  const courtes = [
    '7h30-12h chez Yılmaz à Lyon', 'chez Şahin', 'chez Çelik', 'Kılıç, Işık et İbrahim', 'enlève la réserve sur bureau martin', // « enlève » contient « ve »
    'où je note ma pause ?', 'de 8h à 17h avec 1h de pause', 'hier j’ai bossé de 8h à 17h avec 1h de pause chez dupont',
    'Ce matin 7h30-12h, après-midi 13h-16h30', '7h30-12h Villa Dupont, 13h-16h30 Bureau Martin', 'envoie ma journée', 'mets moi le panier',
    ...WORKER_SUGGESTIONS, ...WORKER_ACTION_SUGGESTIONS,
  ];
  const trop = courtes.filter((s) => long(s));
  if (trop.length) throw new Error(`devenues « longues » : ${trop.map((s) => `« ${s} » (${profilSaisie(s).signaux.join(',')})`).join(' ; ')}`);
  if (detecteTurc('enlève la réserve sur bureau martin') || detecteTurc('chez Yılmaz')) throw new Error('un nom turc seul n’est pas du turc');
});

Deno.test('(d) compteHeures : « après-midi » n’est pas « midi », une durée n’est pas une heure, une plage lue autrement compte pour 2', () => {
  const n = (s: string) => compteHeures(s);
  if (n('cet après-midi chez Dupont') !== 0) throw new Error('après-midi');
  if (n('pause d’1h') !== 0 || n('une pause de 30 min') !== 0 || n('1h de pause') !== 0) throw new Error('une durée de pause n’est pas une heure');
  if (n('de 8h à midi') !== 2 || n('de 8 à 12 et de 13 à 17') !== 4 || n('08.00-12.00') !== 2 || n('8h/12h') !== 2) throw new Error('plages');
  if (n('à 7h30 chez Dupont') !== 1) throw new Error('une heure seule');
});

Deno.test('(e) nouvelleDemandeSalarie : une phrase longue, plusieurs actions ou turque est une NOUVELLE demande ; une réponse courte reste une suite', () => {
  for (const s of [DIAG[0], DIAG[4], DIAG[8], 'Bu hafta toplam kaç saat çalıştım?', 'mets le panier et envoie ma journée']) {
    if (!nouvelleDemandeSalarie(s)) throw new Error(`« ${s} » devrait être une nouvelle demande`);
  }
  for (const s of ['Villa Dupont', 'Dupont şantiyesinde', 'Bureau Martin à Villeurbanne', '', '   ']) {
    if (nouvelleDemandeSalarie(s)) throw new Error(`« ${s} » est une réponse à la question en attente`);
  }
});

Deno.test('(f) plagesDuTexte : les formes françaises et turques lues, les durées et les nombres exclus', () => {
  const table: [string, string][] = [
    ['de 8h à midi, puis pause d’1h, puis de 13h à 17h', '08:00-12:00 13:00-17:00'],
    ['de 8 à midi puis de 13 à 17', '08:00-12:00 13:00-17:00'],
    ['08.00-12.00 et 13.00-17.00', '08:00-12:00 13:00-17:00'],
    ['8h/12h 13h/17h', '08:00-12:00 13:00-17:00'],
    ['huit heures à midi puis treize heures à dix-sept heures', '08:00-12:00 13:00-17:00'],
    ['7h30-12h, 13h-16h30', '07:30-12:00 13:00-16:30'],
    ['entre 8h et 12h', '08:00-12:00'],
    ['de 12h à 13h pause', ''],
    ['pause de 12h à 13h, puis 8h-11h', '08:00-11:00'],
    ['8h-12h pause 1h 13h-17h', '08:00-12:00 13:00-17:00'],
    ['8h-12h pause puis 13h-17h', '08:00-12:00 13:00-17:00'],
    ['Bugün sabah 8’den 12’ye kadar çalıştım, sonra 13’ten 17’ye kadar', '08:00-12:00 13:00-17:00'],
    ['8’den 12’ye kadar ve 13’ten 17’ye kadar', '08:00-12:00 13:00-17:00'],
    ['7:30’dan 12’ye kadar', '07:30-12:00'],
    ['08.00’dan 12.00’ye ve 13.00’dan 17.00’ye', '08:00-12:00 13:00-17:00'],
    ['8 ile 12 arası ve 13 ile 17 arası', '08:00-12:00 13:00-17:00'],
    ['il y a 2 et 3 personnes', ''],
    ['de 2 à 3 personnes', ''],
    ['pour 12.50 euros et 13.00', ''],
    ['7h non plutôt 7h30 jusqu’à midi', '07:30-12:00'],
  ];
  const ko = table.filter(([s, attendu]) => plages(s) !== attendu).map(([s, attendu]) => `« ${s} » → « ${plages(s)} » (attendu « ${attendu} »)`);
  if (ko.length) throw new Error(ko.join('\n'));
});

Deno.test('(g) Pause dite en toutes lettres et autocorrection : le lecteur local ne les lit pas, donc profil long', () => {
  for (const s of ['de 8h à 17h chez Martin avec une demi-heure de pause', 'de 8h à 17h chez Martin avec une heure de pause', 'de 8h à 17h chez Martin avec une pause d’une heure']) {
    if (!profilSaisie(s).signaux.includes('pause_en_lettres')) throw new Error(`pause en lettres : ${s}`);
  }
  if (!profilSaisie('7h non plutôt 7h30 jusqu’à midi chez Dupont').signaux.includes('autocorrection')) throw new Error('autocorrection');
  if (long('de 8h à 17h avec 1h de pause')) throw new Error('une pause chiffrée reste au lecteur local');
});

Deno.test('(g bis) Turc : « mola » fléchi (molası, molaya), « öğle arası », « ara verdim » : la pause est reconnue, et la plage collée à ce mot n’en est pas une', () => {
  for (const milieu of ['bir saat yemek molası verdim', 'molaya çıktım', 'öğle arası bir saat', 'ara verdim']) {
    const p = profilSaisie(`8’den 12’ye kadar çalıştım, ${milieu}, 13’ten 17’ye kadar çalıştım`);
    if (!p.signaux.includes('deux_plages_et_pause') || !p.signaux.includes('pause_en_lettres')) throw new Error(`pause turque non reconnue : « ${milieu} » (${p.signaux.join(',')})`);
    if (p.plages !== 2) throw new Error(`deux plages attendues : « ${milieu} » (${p.plages})`);
  }
  // Une plage SUIVIE du mot (avec un mot intercalaire) ou PRÉCÉDÉE de « molası » est la pause, pas du travail.
  const apres = plagesDuTexte('8’den 12’ye kadar çalıştım, 12’den 13’e kadar yemek molası, 13’ten 17’ye kadar çalıştım').map((x) => `${x.start}-${x.end}`);
  if (apres.join() !== '08:00-12:00,13:00-17:00') throw new Error(`plage de pause (suffixe) : ${apres.join()}`);
  const avant = plagesDuTexte('8’den 12’ye kadar çalıştım, molası 12’den 13’e, 13’ten 17’ye kadar çalıştım').map((x) => `${x.start}-${x.end}`);
  if (avant.join() !== '08:00-12:00,13:00-17:00') throw new Error(`plage de pause (préfixe) : ${avant.join()}`);
});

// ── Règle navigateur : aucun fichier importé par le navigateur ne contient d'assertion arrière ──
const RACINE = new URL('../../../', import.meta.url);
const NAVIGATEUR = [
  'supabase/functions/_shared/saisie-profil.ts', 'supabase/functions/_shared/worker-multi.ts', 'supabase/functions/_shared/worker-multi-run.ts',
  'lib/worker-multi.ts', 'lib/worker-assistant.ts', 'components/worker-multi-card.tsx', 'components/assistant-panel.tsx',
];
const sansCommentaires = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
async function lire(rel: string): Promise<string | null> {
  try { return await Deno.readTextFile(new URL(rel, RACINE)); } catch { return null; }
}

Deno.test('(h) Règle navigateur : ni assertion arrière (Safari < 16.4), ni .at() ni structuredClone (Safari < 15.4) dans les fichiers importés par le navigateur', async () => {
  let lus = 0;
  for (const rel of NAVIGATEUR) {
    const src = await lire(rel);
    if (src === null) continue; // fichier pas (encore) dans ce dépôt
    lus++;
    const code = sansCommentaires(src);
    if (/\(\?<[=!]/.test(code)) throw new Error(`${rel} : assertion arrière « lookbehind » (casse le chunk sur Safari < 16.4)`);
    if (/\.at\(/.test(code)) throw new Error(`${rel} : Array.prototype.at (Safari < 15.4)`);
    if (/structuredClone/.test(code)) throw new Error(`${rel} : structuredClone (Safari < 15.4)`);
  }
  if (lus < 2) throw new Error('saisie-profil.ts et worker-multi.ts doivent être lus');
});

Deno.test('(h) Confidentialité : aucun console.* dans le tour partagé, la fiche et les consignes (noms et adresses de particuliers)', async () => {
  let lus = 0;
  for (const f of ['worker-turn.ts', 'worker-multi.ts', 'worker-multi-run.ts', 'worker-multi-prompt.ts', 'saisie-profil.ts']) {
    const src = await lire(`supabase/functions/_shared/${f}`);
    if (src === null) continue;
    lus++;
    if (/\bconsole\./.test(sansCommentaires(src))) throw new Error(`${f} : console.* interdit (le texte et les arguments du modèle contiennent des données de particuliers)`);
  }
  if (lus < 4) throw new Error(`${lus} fichiers lus`);
});
