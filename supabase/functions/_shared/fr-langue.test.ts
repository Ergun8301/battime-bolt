// Lot 7 — le français parlé : dates relatives, heures, titres propres.
//   npm run test:fr-langue
import { calendarForPrompt, cleanName, cleanSpoken, cleanTitle, dateAVenir, dayPart, isNewRequest, looksLikeAction, low, parseDateFr, parseDateRangeFr, parseTimeFr, plageAVenir } from './fr-langue.ts';
import { norm, placeOf } from './worker-assistant-core.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
const T = '2026-10-01'; // jeudi

Deno.test('Dates relatives', () => {
  eq(parseDateFr('demain matin', T), '2026-10-02', 'demain');
  eq(parseDateFr('après-demain', T), '2026-10-03', 'après-demain');
  eq(parseDateFr('hier', T), '2026-09-30', 'hier');
  eq(parseDateFr('jeudi 14h', T), '2026-10-01', 'jeudi = aujourd’hui (on est jeudi)');
  eq(parseDateFr('jeudi prochain', T), '2026-10-08', 'jeudi prochain');
  eq(parseDateFr('lundi prochain', T), '2026-10-05', 'lundi prochain = ce lundi-là');
  eq(parseDateFr('vendredi prochain', T), '2026-10-09', 'vendredi prochain ≠ demain');
  eq(parseDateFr('vendredi', T), '2026-10-02', 'vendredi');
  eq(parseDateFr('lundi', T), '2026-10-05', 'lundi');
  eq(parseDateFr('mardi de la semaine prochaine', T), '2026-10-06', 'mardi semaine prochaine');
  eq(parseDateFr('le 12', T), '2026-10-12', 'le 12');
  eq(parseDateFr('15 mars 2027', T), '2027-03-15', 'date complète');
  eq(parseDateFr('le 12/10', T), '2026-10-12', '12/10');
  eq(parseDateFr('2026-11-03', T), '2026-11-03', 'ISO');
  eq(parseDateFr('rien du tout', T), '', 'rien');
  eq(parseDateRangeFr('du 20 au 24 octobre', T), { du: '2026-10-20', au: '2026-10-24' }, 'période');
  eq(parseDateRangeFr('malade aujourd’hui et demain', T), { du: '2026-10-01', au: '2026-10-02' }, 'aujourd’hui et demain');
  eq(parseDateRangeFr('du lundi au mercredi', T), { du: '2026-10-05', au: '2026-10-07' }, 'du lundi au mercredi');
});

Deno.test('Heures', () => {
  eq(parseTimeFr('à 14h'), '14:00', '14h');
  eq(parseTimeFr('8h30'), '08:30', '8h30');
  eq(parseTimeFr('vers 3h de l’après-midi'), '15:00', '3h de l’après-midi');
  eq(parseTimeFr('midi'), '12:00', 'midi');
  eq(parseTimeFr('cet après-midi'), '', 'après-midi seul : pas une heure');
  eq(dayPart('demain matin'), { debut: '08:00', fin: '12:00' }, 'matin');
  eq(dayPart('jeudi après-midi'), { debut: '13:30', fin: '17:00' }, 'après-midi');
});

Deno.test('Titres et noms propres', () => {
  eq(cleanSpoken('euh alors, remplacement du chauffe-eau.'), 'remplacement du chauffe-eau', 'hésitations retirées');
  eq(cleanTitle('euh alors le remplacement du chauffe-eau.'), 'Le remplacement du chauffe-eau', 'titre');
  eq(cleanTitle('une intervention pour réparer la fuite'), 'Réparer la fuite', 'pas de « une intervention pour »');
  eq(cleanName('maison garnier'), 'Maison Garnier', 'majuscules');
  eq(cleanName('résidence les lilas'), 'Résidence les Lilas', 'petits mots en minuscule');
  eq(cleanName('chez SARL BTP Rhône'), 'SARL BTP Rhône', 'sigles gardés');
  eq(placeOf('rajoute-moi une intervention à annecy'), 'Intervention à Annecy', 'lieu');
  if (!calendarForPrompt(T).includes('jeudi 8 octobre = 2026-10-08')) throw new Error('calendrier');
});

Deno.test('Action ou simple question', () => {
  eq(looksLikeAction('Rajoute-moi une intervention à Lyon'), true, 'action');
  eq(looksLikeAction('qui n’a pas pointé hier ?'), false, 'question');
  eq(looksLikeAction('combien d’heures cette semaine'), false, 'question chiffrée');
  eq(looksLikeAction('karim demain chez dupont 8h'), true, 'phrase courte avec heure');
  eq(looksLikeAction('x', true), true, 'fichier joint');
});

Deno.test('Question en attente : réponse courte ou nouvelle demande ?', () => {
  eq(isNewRequest('Karim'), false, 'pastille / prénom');
  eq(isNewRequest('Villa Dupont à Lyon de 8h à 12h'), false, 'complément sans verbe');
  eq(isNewRequest('demain'), false, 'date');
  eq(isNewRequest('Comment je corrige le pointage d’un salarié ?'), true, 'question d’aide');
  eq(isNewRequest('qui n’a pas pointé hier'), true, 'question chiffrée');
  eq(isNewRequest('mets Lucas sur Bureau Martin toute la semaine prochaine'), true, 'nouvelle action complète');
});

Deno.test('Jour passé donné par le modèle pour un nom de jour seul → la PROCHAINE occurrence (aujourd’hui compris)', () => {
  // On est jeudi 2026-10-01. Le modèle renvoie le lundi / mercredi de la semaine EN COURS (passés) pour « lundi », « mercredi ».
  eq(dateAVenir('2026-09-28', 'vide le planning de karim de lundi à mercredi', T), '2026-10-05', 'lundi passé → lundi prochain');
  eq(dateAVenir('2026-09-30', 'vide le planning de karim de lundi à mercredi', T), '2026-10-07', 'mercredi passé → mercredi prochain');
  eq(dateAVenir('2026-09-24', 'retire Marc du planning jeudi', T), '2026-10-01', 'jeudi passé, on est jeudi → aujourd’hui compris');
  eq(dateAVenir('2026-09-28', 'mets Kevin lundi prochain', T), '2026-10-05', '« lundi prochain »');
  eq(dateAVenir('2026-09-28', 'mets Kevin lundi de la semaine prochaine', T), '2026-10-05', 'lundi de la semaine prochaine');
  // Rien à corriger : date non passée, aujourd’hui, jour non nommé, aucune phrase.
  eq(dateAVenir('2026-10-05', 'de lundi à mercredi', T), '2026-10-05', 'date à venir : intacte');
  eq(dateAVenir('2026-10-01', 'jeudi', T), '2026-10-01', 'aujourd’hui : intact');
  eq(dateAVenir('2026-09-28', 'vide le planning de karim', T), '2026-09-28', 'la phrase ne nomme pas ce jour : intact');
  eq(dateAVenir('2026-09-28', 'mardi', T), '2026-09-28', 'la phrase nomme un AUTRE jour : intact');
  eq(dateAVenir('2026-09-28', undefined, T), '2026-09-28', 'pas de phrase : intact');
  eq(dateAVenir('', 'lundi', T), '', 'pas de date : intact');
  // Le passé est DIT, ou la date est écrite : jamais touchée.
  for (const p of ['lundi dernier', 'le lundi précédent', 'lundi passé', 'hier lundi', 'avant-hier lundi', 'il y a une semaine, lundi', 'depuis lundi', 'Kevin était malade lundi', 'lundi 28 septembre', 'lundi 28/09', 'le lundi 28', 'lundi 2026-09-28', 'lundi de cette semaine', 'lundi de la semaine en cours']) {
    eq(dateAVenir('2026-09-28', p, T), '2026-09-28', `« ${p} » : intact`);
  }
  // Une heure n’est pas une date écrite (« lundi le 14h » n’existe pas, « lundi à 14h » oui).
  eq(dateAVenir('2026-09-28', 'mets Kevin lundi à 14h', T), '2026-10-05', 'une heure n’est pas un marqueur');
  // Plage : l’ordre est gardé (du ≤ au).
  eq(plageAVenir('2026-09-28', '2026-09-30', 'de lundi à mercredi', T), { du: '2026-10-05', au: '2026-10-07' }, 'de lundi à mercredi');
  eq(plageAVenir('2026-09-28', '', 'lundi', T), { du: '2026-10-05', au: '' }, 'sans fin : la fin reste vide');
  eq(plageAVenir('2026-09-28', '2026-10-02', 'de lundi à vendredi', T), { du: '2026-10-05', au: '2026-10-09' }, 'fin à venir mais avant le début corrigé → vendredi après le début');
  eq(plageAVenir('2026-10-08', '2026-09-30', 'de jeudi à mercredi', T), { du: '2026-10-08', au: '2026-10-14' }, 'fin passée corrigée, avant le début → mercredi après le début');
  eq(plageAVenir('2026-10-06', '2026-10-02', 'de mardi à vendredi', T), { du: '2026-10-06', au: '2026-10-02' }, 'rien de passé : l’ordre du modèle n’est pas retouché');
  eq(plageAVenir('2026-09-28', '2026-09-30', 'de lundi à mercredi derniers', T), { du: '2026-09-28', au: '2026-09-30' }, 'passé dit : intact');
});

// Turc : « ı » (i sans point) n'est pas décomposé par NFD ; sans cette ligne « Işık » ne ressemblerait jamais à « isik ». Le français n'en a aucun.
Deno.test('Turc : « ı » est lu comme « i » (low et norm), le français ne change pas', () => {
  eq([low('Işık Çalıştım'), norm('Işık Çalıştım')], ['isik calistim', 'isik calistim'], 'ı → i');
  eq([low('Élève à l’Été'), norm('Élève à l’Été')], ["eleve a l'ete", "eleve a l'ete"], 'français inchangé');
  eq(parseDateFr('Dün', T), '', 'parseDateFr ne lit pas le turc (le modèle le lit)');
});
