// OUVRIR : la langue de la réponse (étape 3, livraison 3b-1bis). Quand la demande est écrite en TURC, le texte construit par le serveur
// (phrase de réponse, questions, refus, intitulé du lien) l'est aussi : titres d'écran traduits, date « 30 Eylül Çarşamba ».
// Le détecteur est celui du salarié (saisie-profil.ts `detecteTurc`), complété pour les demandes COURTES du bureau (« rezervleri göster »)
// que 2 points ne suffisent pas à reconnaître : une lettre propre au turc (ğ ş ı İ) ou un verbe d'ouverture turc, et aucun mot français courant.
// FONCTIONS PURES. Ne touche qu'au texte des liens `ouvrir:` (donc au chemin allumé) ; sans appel à `ouvrir_fenetre`, rien ne change.
import { detecteTurc } from './saisie-profil.ts';
import { low } from './fr-langue.ts';

const MOTS_FR = /\b(le|la|les|un|une|des|du|de|je|j|mon|ma|mes|pour|avec|sur|dans|chez|ouvre|ouvrez|ouvrir|montre|affiche|va|vas|emmene|moi|est|et)\b/;
const VERBES_TR = /\b(ac|acin|acar misin|goster|gosterir misin)\b/;

/** La demande est-elle écrite en turc ? (jamais vrai sur une demande vide ou française). */
export function demandeTurque(demande: string | undefined): boolean {
  const t = demande ?? '';
  if (!t.trim()) return false;
  if (detecteTurc(t)) return true;
  if (MOTS_FR.test(low(t))) return false;
  return /[ğĞşŞıİ]/.test(t) || VERBES_TR.test(low(t));
}

/** Les intitulés d'écran en turc (les ids viennent de registre/ouvreurs.ts ; un id absent garde son titre français). */
export const TITRES_TR: Readonly<Record<string, string>> = {
  'salaries.liste': 'Çalışanlar',
  'salaries.importer': 'Çalışanları içe aktarma',
  'clients.importer': 'Müşterileri içe aktarma',
  'reserves.registre': 'Çekinceler',
  'conges.demandes': 'İzin talepleri',
  'stats.equipe': 'Ekip istatistikleri',
  'planning.supprimees': 'Silinen müdahaleler',
  'planning.versions': 'Planlama sürümleri',
  'formations.gestion': 'Eğitimler',
  'abonnement.choisir': 'Abonelik seçimi',
  'relances.liste': 'Takip edilecekler',
  'planning.selection': 'Müdahale seçimi',
  'clients.liste': 'Müşteriler',
  'planning.semaine': 'Haftalık planlama',
  'salarie.fiche': 'Çalışan kartı',
  'client.fiche': 'Müşteri kartı',
  'chantier.documents': 'Şantiye belgeleri',
  'client.nouveau': 'Yeni müşteri',
  'salarie.nouveau': 'Yeni çalışan',
  'export.equipe': 'Ekibi dışa aktarma',
  'cloture.mois': 'Ay kapanışı',
  'planning.ajouter': 'Müdahale ekleme',
  'salarie.statut': 'Çalışan durumu',
  'absence.poser': 'Devamsızlık girişi',
  'export.salarie': 'Çalışanı dışa aktarma',
  'jour.date': 'Başka bir gün',
  'formations.ouvrir': 'Eğitimlerim',
};

const MOIS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const JOURS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** « 30 Eylül Çarşamba » (jour, mois, jour de la semaine ; sans l'année, comme `frDate`). */
export function dateTr(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MOIS_TR[d.getUTCMonth()]} ${JOURS_TR[d.getUTCDay()]}`;
}
/** « Eylül 2026 » pour `aaaa-mm`. */
export function moisTr(m: string): string {
  return `${MOIS_TR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
}
