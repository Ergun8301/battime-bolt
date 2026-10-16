// Design salarié · étape 2 : les règles pures de l'écran du salarié (salarie-vue.ts).
//   npm run test:salarie-vue   (npx -y deno@2.9.6 test supabase/functions/_shared/salarie-vue.test.ts)
import {
  aideEnvoi, bandeJours, etatJour, etatLigne, friseAxe, hm, kicker, lettreAbsence, lundiDe, raisonEchec, semaineIso, titreSemaine, type JourBrut,
} from './salarie-vue.ts';

const egal = (a: unknown, b: unknown, msg: string) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${msg}\n  obtenu  : ${x}\n  attendu : ${y}`); };
const h = (axe: { debut: number; fin: number }) => [Math.floor(axe.debut / 60), Math.floor(axe.fin / 60)];

Deno.test('etatLigne : la priorité (retirée > comptable > fin à compléter > sortie oubliée > renvoyée > à envoyer > envoyée)', () => {
  egal(etatLigne({ status: 'cancelled', locked: true }), 'retiree', 'retirée');
  egal(etatLigne({ status: 'submitted', locked: true }), 'comptable', 'verrouillée');
  egal(etatLigne({ status: 'submitted', exported_at: '2026-10-01T00:00:00Z' }), 'comptable', 'exportée');
  egal(etatLigne({ status: 'draft', exit_forgotten: true, start_time: '08:00:00', end_time: '08:00:00' }), 'fin-a-completer', 'fin = début');
  egal(etatLigne({ status: 'draft', exit_forgotten: true, start_time: '08:00:00', end_time: '16:30:00' }), 'sortie-oubliee', 'fin proposée');
  egal(etatLigne({ status: 'draft', submitted_at: '2026-10-02T10:00:00Z' }), 'renvoyee', 'renvoyée par le bureau');
  egal(etatLigne({ status: 'draft' }), 'a-envoyer', 'brouillon');
  egal(etatLigne({ status: 'submitted' }), 'envoyee', 'envoyée');
  egal(etatLigne({ status: 'validated' }), 'envoyee', 'validée = envoyée côté salarié');
  egal(etatLigne({ status: 'submitted', exit_forgotten: true, start_time: '08:00', end_time: '08:00' }), 'envoyee', 'une sortie oubliée déjà envoyée n’est plus « à compléter »');
});

const jour = (o: Partial<JourBrut>): JourBrut => ({ date: '2026-10-01', lignes: [], ...o });
Deno.test('etatJour : clôturé > absence > renvoyé > oublié > à envoyer > envoyé > prévu > vide', () => {
  egal(etatJour(jour({})), 'vide', 'vide');
  egal(etatJour(jour({ prevu: true })), 'prevu', 'prévu');
  egal(etatJour(jour({ lignes: [{ status: 'submitted' }] })), 'envoye', 'envoyé');
  egal(etatJour(jour({ lignes: [{ status: 'submitted' }, { status: 'draft' }] })), 'a-envoyer', 'un brouillon suffit');
  egal(etatJour(jour({ lignes: [{ status: 'draft' }, { status: 'draft', exit_forgotten: true, start_time: '08:00', end_time: '08:00' }] })), 'oublie', 'oubli avant à envoyer');
  egal(etatJour(jour({ lignes: [{ status: 'draft', exit_forgotten: true, start_time: '08:00', end_time: '08:00' }, { status: 'draft', submitted_at: 'x' }] })), 'renvoye', 'renvoyé avant oublié');
  egal(etatJour(jour({ absence: 'conge', lignes: [{ status: 'draft' }] })), 'absence', 'absence avant les lignes');
  egal(etatJour(jour({ cloture: true, absence: 'conge', lignes: [{ status: 'draft' }] })), 'cloture', 'clôturé avant tout');
  egal(etatJour(jour({ lignes: [{ status: 'cancelled' }] })), 'vide', 'une ligne retirée ne compte pas');
  egal(etatJour(jour({ prevu: true, lignes: [{ status: 'cancelled' }] })), 'prevu', 'retirée + prévu = prévu');
});

Deno.test('bandeJours : lundi → dimanche, « aujourd’hui » et « affiché » sont des axes à part, lettres d’absence', () => {
  const parDate = new Map<string, Omit<JourBrut, 'date'>>([
    ['2026-10-01', { lignes: [{ status: 'submitted' }], cloture: true }],
    ['2026-10-02', { lignes: [], absence: 'maladie' }],
    ['2026-10-03', { lignes: [{ status: 'draft' }] }],
  ]);
  const b = bandeJours('2026-10-03', '2026-10-01', parDate);
  egal(b.map((c) => c.date), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], '7 jours, lundi d’abord');
  egal(b.map((c) => c.jour).join(''), 'LMMJVSD', 'initiales');
  egal(b[3], { date: '2026-10-01', jour: 'J', numero: 1, etat: 'cloture', aujourdhui: true, affiche: false, lettre: null }, 'aujourd’hui ET clôturé');
  egal([b[4].etat, b[4].lettre], ['absence', 'M'], 'absence maladie → M');
  egal([b[5].etat, b[5].affiche], ['a-envoyer', true], 'jour affiché');
  egal(['conge', 'intemperie', 'repos'].map(lettreAbsence).join(''), 'CIR', 'lettres');
  egal(lundiDe('2026-10-04'), '2026-09-28', 'le dimanche appartient à la semaine qui finit');
});

Deno.test('Semaine ISO, kicker, durées', () => {
  egal(semaineIso('2026-10-15'), 42, 'jeudi 15 octobre 2026 = semaine 42');
  egal(semaineIso('2026-01-01'), 1, '1er janvier 2026 (jeudi) = semaine 1');
  egal(semaineIso('2027-01-01'), 53, '1er janvier 2027 (vendredi) = semaine 53 de 2026');
  egal(semaineIso('2024-12-30'), 1, 'lundi 30 décembre 2024 = semaine 1 de 2025');
  egal(titreSemaine('2026-10-15'), 'Semaine 42', 'titre');
  egal(kicker({ date: '2026-10-15', aujourdhui: true, etat: 'envoye' }), 'AUJOURD’HUI', 'aujourd’hui');
  egal(kicker({ date: '2026-10-14', aujourdhui: false, etat: 'renvoye' }), 'RENVOYÉE', 'renvoyée');
  egal(kicker({ date: '2026-10-14', aujourdhui: false, etat: 'vide' }), 'MERCREDI', 'jour de la semaine');
  egal(kicker({ date: '2026-10-14', aujourdhui: true, etat: 'envoye', erreurEnvoi: true }), 'ERREUR', 'erreur gagne');
  egal([hm(450), hm(0), hm(1890), hm(-5)], ['7:30', '0:00', '31:30', '0:00'], 'minutes → h:mm');
});

Deno.test('aideEnvoi : une phrase vraie selon l’état, jamais « le pointage en cours ne part pas » à tort', () => {
  const c = { pointageEnCours: false, brouillons: 2, enAttente: 0, finACompleter: false, cloture: false };
  egal(aideEnvoi('pret', c), null, 'prêt sans chrono : pas d’aide');
  egal(aideEnvoi('pret', { ...c, pointageEnCours: true }), 'Le pointage en cours ne part pas', 'chrono ouvert : une seule courte phrase');
  egal(aideEnvoi('envoye', { ...c, pointageEnCours: true }), 'Envoyé. Le pointage reste ouvert.', 'envoyé avec un chrono ouvert : cohérent et court');
  for (const e of ['pret', 'envoye'] as const) egal((aideEnvoi(e, { ...c, pointageEnCours: true }) ?? '').length <= 34, true, `${e} : tient sur une ligne à 360 px`);
  egal(aideEnvoi('envoi', c), 'Envoi en cours…', 'envoi');
  egal(aideEnvoi('hors-ligne', { ...c, enAttente: 1 }), 'Pas de réseau : 1 ligne partira toute seule au retour du réseau.', 'hors ligne, singulier');
  egal(aideEnvoi('hors-ligne', { ...c, enAttente: 3 }), 'Pas de réseau : 3 lignes partiront toutes seules au retour du réseau.', 'hors ligne, pluriel');
  egal(aideEnvoi('echec', c), 'L’envoi a échoué : touche pour réessayer.', 'échec');
  egal(aideEnvoi('envoye', c), null, 'envoyé, rien à dire');
  egal(aideEnvoi('pret', { ...c, finACompleter: true }), 'Une sortie oubliée n’a pas d’heure de fin : mets-la avant d’envoyer.', 'fin à compléter');
  egal(aideEnvoi('pret', { ...c, cloture: true, finACompleter: true }), 'Ces heures sont clôturées : rapproche-toi de la secrétaire.', 'clôture gagne');
});

Deno.test('raisonEchec : les refus connus en clair, jamais le détail technique', () => {
  egal(raisonEchec({ lastError: 'Heures clôturées par le bureau jusqu\'au 2026-10-15' }), 'Refusé : tes heures sont clôturées à cette date.', 'clôture du salarié');
  egal(raisonEchec({ lastError: 'mois clôturé' }), 'Refusé : le mois est clôturé.', 'mois');
  egal(raisonEchec({ lastError: 'ne redevient pas brouillon' }), 'Refusé : journée déjà envoyée.', 'déjà envoyée');
  egal(raisonEchec({ lastError: 'chantier hors de votre entreprise' }), 'Refusé : ce chantier n’existe plus dans ton entreprise.', 'chantier');
  egal(raisonEchec({ lastError: 'duplicate key value violates unique constraint "x"', attempts: 5 }), '5 essais sans réussite : préviens le bureau.', '5 essais');
  const t = raisonEchec({ lastError: 'duplicate key value violates unique constraint "x"', attempts: 2 });
  egal(t, 'Pas encore envoyé : nouvel essai automatique.', 'nouvel essai');
  egal(/duplicate|constraint/.test(t), false, 'pas de détail technique');
});

// ── La règle de la mini-frise : les 7 cas de l'audit (03-plan-integration.md §1.5) ─────────────────────────────
Deno.test('friseAxe : cas ordinaire 07:30–11:30, 12:30–15:12, prévu 15:12–17:00 → 06 h → 18 h (12 h)', () => {
  const a = friseAxe([{ debut: '07:30', fin: '11:30' }, { debut: '12:30', fin: '15:12' }, { debut: '15:12', fin: '17:00' }]);
  egal(h(a), [6, 18], 'axe'); egal(a.largeur, 720, 'largeur'); egal(a.minuit, null, 'pas de minuit'); egal(a.ticks.length, 13, 'une graduation par heure');
});
Deno.test('friseAxe : un seul créneau 12:00–13:00 → 08 h → 16 h (largeur minimale 8 h)', () => {
  const a = friseAxe([{ debut: '12:00', fin: '13:00' }]);
  egal(h(a), [8, 16], 'axe'); egal(a.largeur, 480, 'largeur minimale');
});
Deno.test('friseAxe : nuit 21:00–01:00 puis 01:30–05:30 → 20 h → 07 h, « minuit » au milieu', () => {
  const a = friseAxe([{ debut: '21:00', fin: '01:00' }, { debut: '01:30', fin: '05:30' }]);
  egal(h(a), [20, 31], 'axe (07 h du lendemain = 31)'); egal(a.minuit, 1440, 'minuit à 24 h');
  egal(a.ticks.find((t) => t.min === 1440)?.label, 'minuit', 'graduation « minuit »');
  egal(a.segments.map((s) => [s.debut, s.fin]), [[1260, 1500], [1530, 1770]], 'le 2e segment reste dans la même nuit');
});
Deno.test('friseAxe : nuit 20:00–07:00 → 19 h → 08 h', () => {
  egal(h(friseAxe([{ debut: '20:00', fin: '07:00' }])), [19, 32], 'axe');
});
Deno.test('friseAxe : aucune ligne → l’horaire de base (08:00–17:00 par défaut)', () => {
  const a = friseAxe([]);
  egal(h(a), [7, 18], 'axe de base : 07 h → 18 h');
  egal(h(friseAxe([], { debut: '06:00', fin: '14:00' })), [5, 15], 'base de l’entreprise');
});
Deno.test('friseAxe : sortie oubliée 08:00 → 08:00 = un POINT, jamais un segment de 24 h', () => {
  const seul = friseAxe([{ debut: '08:00', fin: '08:00' }]);
  egal(seul.segments[0].point, true, 'point'); egal(seul.largeur, 480, 'largeur minimale, pas 26 h');
  const avec = friseAxe([{ debut: '07:30', fin: '11:30' }, { debut: '08:00', fin: '08:00' }]);
  egal(avec.largeur <= 12 * 60, true, 'ne rallonge pas l’axe (le cas qui cassait l’ancienne règle : axe de 27 h)');
  egal(h(avec), [5, 13], 'axe 05 h → 13 h (7 h < 8 h : largeur minimale, centrée)');
});
Deno.test('friseAxe : heures pile — 08:00 reste 08:00 (la graduation avant est 07 h) ; 17:00 pile → 18 h', () => {
  egal(h(friseAxe([{ debut: '08:00', fin: '17:00' }])), [7, 18], 'axe');
});
Deno.test('friseAxe : segments illisibles ignorés, jamais d’exception', () => {
  egal(h(friseAxe([{ debut: 'x', fin: 'y' }, { debut: '09:00', fin: '12:00' }])), [6, 14], 'seul le lisible compte (09 h → 12 h, élargi à 8 h)');
  egal(h(friseAxe([{ debut: 'x', fin: 'y' }])), [7, 18], 'rien de lisible : la base');
});
