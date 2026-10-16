// Guides pas à pas du SALARIÉ pour le NOUVEAU design (v2) — SERVIS depuis la bascule (étape 11).
//
// L'interrupteur UNIQUE est `GUIDES_UI2` (supabase/functions/_shared/guides-ui2.ts, ré-exporté ici). Il vaut `true` : les guides pas à pas ET les fiches d'aide de l'Assistant décrivent la v2
// (voir ci-dessous). À `false`, ce fichier n'a AUCUN effet : worker-tours.ts sert ses fiches d'avant (même objets, mêmes octets) et
// worker-assistant-core.ts sert WORKER_GUIDE tel qu'avant (même tableau). Description de la v2
// (bouton « QR » en bas, ✦ jaune en haut, page « Plus », « Mon équipe » rangé dans « Plus », congés et informations en feuilles).
//
// Chaque phrase existe en FRANÇAIS (`texte`, `etapes`) et en TURC (`texteTr`, `etapesTr`, `titreTr`).
// Les mêmes règles que worker-tours.ts s'appliquent (140 caractères au plus, une phrase, « Touchez », vouvoiement,
// libellé exact entre « ») ; worker-tours-v2.test.ts les vérifie sur ce tableau, plus l'existence de chaque ancre dans le code v2.
//
// Table d'audit (cible par cible, v1 / v2 / écarts) : docs/design-brief/integration/guides-v2.md.
import type { TourStep, WorkerTour } from './worker-tours.ts';

import { GUIDES_UI2 } from './guides-ui2.ts';
/** Interrupteur UNIQUE de la bascule : il vit dans guides-ui2.ts. `true` = les textes de la v2 (bascule faite) ; `false` = les textes d'avant (v1). */
export { GUIDES_UI2 };

export type Langue = 'fr' | 'tr';
export interface TourStepV2 extends TourStep { texteTr: string }
export interface WorkerTourV2 extends WorkerTour { etapes: TourStepV2[] }

// Le nom, en haut à droite : en v2 il ouvre la page « Plus » (et non plus un menu déroulant).
const MENU: TourStepV2 = { cible: 'menu.compte', texte: 'Touchez votre nom, en haut à droite : la page « Plus » apparaît.', texteTr: 'Sağ üstteki adınıza dokunun: « Plus » sayfası açılır.' };
const CHANTIER: TourStepV2 = { ecran: 'journee', cible: 'journee.chantier', texte: 'Dans « Chantiers du jour », touchez le chantier concerné.', texteTr: '« Chantiers du jour » bölümünde ilgili şantiyeye dokunun.' };

export const WORKER_TOURS_V2: WorkerTourV2[] = [
  { id: 'reserve', etapes: [
    CHANTIER,
    { cible: 'editeur.reserve', texte: 'Dans la fiche du chantier, touchez « Avec réserve ».', texteTr: 'Şantiyenin kartında « Avec réserve » düğmesine dokunun.' },
    { cible: 'editeur.note', texte: 'Dans la même fiche, écrivez un détail si vous voulez (facultatif).', texteTr: 'Aynı kartta isterseniz bir not yazın (isteğe bağlı).' },
    { cible: 'editeur.documents', texte: 'Pour joindre une photo, touchez « Documents » (facultatif).', texteTr: 'Fotoğraf eklemek için « Documents » düğmesine dokunun (isteğe bağlı).' },
    { cible: 'editeur.ok', texte: 'Touchez « OK » pour enregistrer.', texteTr: 'Kaydetmek için « OK » düğmesine dokunun.' },
  ] },
  { id: 'photo-document', etapes: [
    CHANTIER,
    { cible: 'editeur.documents', texte: 'Dans la fiche, touchez « Documents ».', texteTr: 'Kartta « Documents » düğmesine dokunun.' },
    { cible: 'docs.photo', texte: 'Dans « Documents », touchez « Photo » pour l’appareil photo, ou « Fichier » pour un document.', texteTr: '« Documents » içinde kamera için « Photo », belge için « Fichier » düğmesine dokunun.' },
  ] },
  { id: 'conge', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.conges', texte: 'Dans « Plus », touchez « Mes congés ». Une feuille monte par le bas.', texteTr: '« Plus » sayfasında « Mes congés » satırına dokunun. Alttan bir sayfa açılır.' },
    { ecran: 'conges', cible: 'conges.faire', texte: 'Dans la feuille « Mes congés », touchez « Faire une demande ».', texteTr: '« Mes congés » sayfasında « Faire une demande » düğmesine dokunun.' },
    { cible: 'conges.type', texte: 'Dans la feuille, choisissez le type, puis les dates « Du » et « Au ».', texteTr: 'Sayfada türü seçin, sonra « Du » ve « Au » tarihlerini girin.' },
    { cible: 'conges.envoyer', texte: 'Touchez « Envoyer la demande ». Le bureau vous répond.', texteTr: '« Envoyer la demande » düğmesine dokunun. Büro size cevap verir.' },
  ] },
  { id: 'pointer', etapes: [
    { ecran: 'journee', cible: 'entete.scanner', texte: 'En arrivant, touchez le bouton « QR », en bas de l’écran, et visez le QR code de la tablette.', texteTr: 'Geldiğinizde, ekranın altındaki « QR » düğmesine dokunun ve tabletteki QR koduna doğrultun.' },
    { cible: 'journee.terminer', texte: 'En partant, scannez à nouveau. Ou, s’il y a un pointage en cours, touchez « Terminer ma journée ».', texteTr: 'Giderken yeniden tarayın. Ya da devam eden bir kayıt varsa « Terminer ma journée » düğmesine dokunun.' },
    { cible: 'journee.plus', texte: 'Pas de tablette ? Notez vos heures avec le bouton « + », en bas.', texteTr: 'Tablet yok mu? Saatlerinizi alttaki « + » düğmesiyle girin.' },
  ] },
  { id: 'envoyer-journee', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: 'Vérifiez chaque chantier et ses horaires. Touchez-en un pour le corriger.', texteTr: 'Her şantiyeyi ve saatlerini kontrol edin. Düzeltmek için birine dokunun.' },
    { cible: 'journee.envoyer', texte: 'Puis touchez « Envoyer ma journée ». Le bureau la reçoit.', texteTr: 'Sonra « Envoyer ma journée » düğmesine dokunun. Büro günü alır.' },
  ] },
  { id: 'noter-heures', etapes: [
    { ecran: 'journee', cible: 'journee.plus', texte: 'Touchez le bouton « + ».', texteTr: '« + » düğmesine dokunun.' },
    { cible: 'editeur.chantier', texte: 'Dans la fiche, touchez le chantier où vous avez travaillé.', texteTr: 'Kartta çalıştığınız şantiyeye dokunun.' },
    { cible: 'editeur.horaires', texte: 'Touchez « Début » puis « Fin » pour régler les heures.', texteTr: 'Saatleri ayarlamak için önce « Début », sonra « Fin » düğmesine dokunun.' },
    { cible: 'editeur.ok', texte: 'Touchez « OK ».', texteTr: '« OK » düğmesine dokunun.' },
    { cible: 'journee.envoyer', texte: 'Puis touchez « Envoyer ma journée » pour la donner au bureau.', texteTr: 'Sonra günü büroya vermek için « Envoyer ma journée » düğmesine dokunun.' },
  ] },
  { id: 'planning', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.semaine', texte: 'Dans « Plus », touchez « Ma semaine » (ou « Mon mois »). Elles sont aussi dans la barre du bas.', texteTr: '« Plus » sayfasında « Ma semaine » (ya da « Mon mois ») satırına dokunun. Alt çubukta da var.' },
    { ecran: 'semaine', cible: 'semaine.jour', texte: 'Touchez un jour pour voir son détail.', texteTr: 'Ayrıntısını görmek için bir güne dokunun.' },
  ] },
  { id: 'historique', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.historique', texte: 'Dans « Plus », touchez « Historique ».', texteTr: '« Plus » sayfasında « Historique » satırına dokunun.' },
    { ecran: 'historique', cible: 'historique.jour', texte: 'Vos anciennes heures, jour par jour. Faites défiler pour remonter dans le temps.', texteTr: 'Eski saatleriniz gün gün listelenir. Geçmişe gitmek için kaydırın.' },
  ] },
  { id: 'copier-journee', etapes: [
    { ecran: 'journee', cible: 'journee.copier', texte: 'Touchez « Copier la journée d’hier » (journée vide) ou « Dupliquer cette journée » (autres jours).', texteTr: '« Copier la journée d’hier » (boş gün) ya da « Dupliquer cette journée » (diğer günler) düğmesine dokunun.' },
    { cible: 'copier.valider', texte: 'Pour dupliquer : choisissez les jours sur le calendrier, puis touchez « Copier ».', texteTr: 'Çoğaltmak için: takvimde günleri seçin, sonra « Copier » düğmesine dokunun.' },
  ] },
  { id: 'notifications', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.notifications', texte: 'Dans « Plus », touchez « Activer les notifications », puis autorisez quand le téléphone le demande.', texteTr: '« Plus » sayfasında « Activer les notifications » satırına dokunun, telefon sorunca izin verin.' },
  ] },
  { id: 'photo-profil', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.photo', texte: 'Dans « Plus », touchez « Changer ma photo », puis choisissez une photo.', texteTr: '« Plus » sayfasında « Changer ma photo » satırına dokunun, sonra bir fotoğraf seçin.' },
  ] },
  { id: 'panier', etapes: [
    { ecran: 'journee', cible: 'journee.panier', texte: 'Touchez la tuile « Panier » de la carte « Total aujourd’hui » : un appui pour « Pris », un autre pour « Non pris ».', texteTr: '« Total aujourd’hui » kartındaki « Panier » kutusuna dokunun: bir dokunuş « Pris » (yemek yendi), bir daha « Non pris » (yenmedi).' },
  ] },
  { id: 'modifier-heures', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: 'Dans « Chantiers du jour », touchez la ligne à corriger.', texteTr: '« Chantiers du jour » bölümünde düzeltilecek satıra dokunun.' },
    { cible: 'editeur.horaires', texte: 'Dans la fiche, touchez « Début » ou « Fin » et réglez l’heure.', texteTr: 'Kartta « Début » ya da « Fin » düğmesine dokunun ve saati ayarlayın.' },
    { cible: 'editeur.ok', texte: 'Touchez « OK ». Si la journée est déjà envoyée, le bureau est prévenu.', texteTr: '« OK » düğmesine dokunun. Gün zaten gönderildiyse büro haberdar edilir.' },
  ] },
  { id: 'retirer-ligne', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: 'Dans « Chantiers du jour », touchez la ligne à retirer.', texteTr: '« Chantiers du jour » bölümünde kaldırılacak satıra dokunun.' },
    { cible: 'editeur.retirer', texte: 'Dans la fiche, touchez la corbeille (« Retirer ce chantier »).', texteTr: 'Kartta çöp kutusuna (« Retirer ce chantier ») dokunun.' },
    { cible: 'confirmer.retirer', texte: 'Confirmez avec « Oui, retirer ».', texteTr: '« Oui, retirer » ile onaylayın.' },
  ] },
  { id: 'route-pause', etapes: [
    { ecran: 'journee', cible: 'journee.trou', texte: 'Entre deux chantiers, l’appli demande « c’était quoi ? » : touchez « Route » ou « Pause ».', texteTr: 'İki şantiye arasında uygulama « c’était quoi ? » diye sorar: « Route » (yol) ya da « Pause » (mola) düğmesine dokunun.' },
  ] },
  { id: 'lever-reserve', etapes: [
    // Bascule (étape 11) : la ligne « Réserves à lever » de « Plus » (ancre menu.reserves) remplace la pastille de « Ma journée », qui disparaît pendant un pointage.
    { ecran: 'menu', cible: 'menu.reserves', texte: 'Touchez votre nom, en haut à droite, puis « Réserves à lever » dans « Plus ».', texteTr: 'Sağ üstteki adınıza dokunun, sonra « Plus » sayfasında « Réserves à lever » satırına dokunun.' },
    { cible: 'reserves.lever', texte: 'Sous le bon chantier, touchez « Lever la réserve ».', texteTr: 'Doğru şantiyenin altında « Lever la réserve » düğmesine dokunun.' },
    { cible: 'reserves.valider', texte: 'Écrivez un commentaire si vous voulez, puis touchez « Lever la réserve ».', texteTr: 'İsterseniz bir yorum yazın, sonra « Lever la réserve » düğmesine dokunun.' },
  ] },
  { id: 'annuler-conge', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.conges', texte: 'Dans « Plus », touchez « Mes congés ».', texteTr: '« Plus » sayfasında « Mes congés » satırına dokunun.' },
    { ecran: 'conges', cible: 'conges.annuler', texte: 'Sur une demande « En attente », touchez la petite corbeille à droite.', texteTr: '« En attente » durumundaki bir talepte sağdaki küçük çöp kutusuna dokunun.' },
  ] },
  { id: 'sortie-oubliee', etapes: [
    { ecran: 'journee', cible: 'journee.terminer', texte: 'S’il y a un pointage en cours, touchez « Terminer ma journée ».', texteTr: 'Devam eden bir kayıt varsa « Terminer ma journée » düğmesine dokunun.' },
    { cible: 'journee.sortie-oubliee', texte: 'Le lendemain, touchez la ligne « Sortie oubliée » : elle attend votre heure de fin.', texteTr: 'Ertesi gün « Sortie oubliée » satırına dokunun: bitiş saatinizi bekliyor.' },
    { cible: 'editeur.horaires', texte: 'Dans la fiche, touchez « Fin », puis réglez l’heure à laquelle vous avez fini.', texteTr: 'Kartta « Fin » düğmesine dokunun, sonra bitirdiğiniz saati ayarlayın.' },
    { cible: 'editeur.ok', texte: 'Touchez « OK ».', texteTr: '« OK » düğmesine dokunun.' },
    { cible: 'journee.envoyer', texte: 'Puis touchez « Envoyer ma journée ».', texteTr: 'Sonra « Envoyer ma journée » düğmesine dokunun.' },
  ] },
  { id: 'autre-chantier', etapes: [
    { ecran: 'journee', cible: 'journee.plus', texte: 'Touchez le bouton « + ».', texteTr: '« + » düğmesine dokunun.' },
    { cible: 'editeur.autre', texte: 'Dans la fiche, touchez « Autre chantier ».', texteTr: 'Kartta « Autre chantier » düğmesine dokunun.' },
    { cible: 'editeur.ajouter-chantier', texte: 'Écrivez le nom du chantier, puis touchez « Ajouter ce chantier ». Le bureau le verra.', texteTr: 'Şantiyenin adını yazın, sonra « Ajouter ce chantier » düğmesine dokunun. Büro görecek.' },
    { cible: 'editeur.ok', texte: 'Réglez les heures, puis touchez « OK ».', texteTr: 'Saatleri ayarlayın, sonra « OK » düğmesine dokunun.' },
  ] },
  { id: 'envoyer-client', etapes: [
    CHANTIER,
    { cible: 'editeur.documents', texte: 'Dans la fiche, touchez « Documents ».', texteTr: 'Kartta « Documents » düğmesine dokunun.' },
    { cible: 'docs.envoyer', texte: 'Dans « Documents », touchez « Ouvrir l’e-mail ». La première fois, écrivez d’abord l’e-mail du client.', texteTr: '« Documents » içinde « Ouvrir l’e-mail » düğmesine dokunun. İlk seferde önce müşterinin e-postasını yazın.' },
  ] },
  { id: 'borne', etapes: [
    { ecran: 'journee', cible: 'entete.scanner', texte: 'Touchez le bouton « QR », en bas de l’écran, puis visez le QR code de la borne.', texteTr: 'Ekranın altındaki « QR » düğmesine dokunun, sonra istasyonun QR koduna doğrultun.' },
  ] },
  { id: 'equipe', etapes: [
    // Bascule (étape 11) : la ligne « Mon équipe » de « Plus » (ancre menu.equipe) ouvre le guide ; les étapes suivantes ouvrent la page elles-mêmes (app/poseur/page.tsx, tourStep).
    // Cinq étapes au plus : le choix du jour est dit avec celui du salarié (la liste est entourée, le jour est juste au-dessus).
    { ecran: 'menu', cible: 'menu.equipe', texte: 'Chef d’équipe seulement. Touchez votre nom, en haut à droite, puis « Mon équipe » dans « Plus ».', texteTr: 'Yalnızca ekip şefi. Sağ üstteki adınıza dokunun, sonra « Plus » sayfasında « Mon équipe » satırına dokunun.' },
    { cible: 'equipe.salarie', texte: 'Choisissez le jour (7 derniers jours), puis le salarié dans la liste.', texteTr: 'Günü seçin (son 7 gün), sonra listeden çalışanı seçin.' },
    { cible: 'equipe.corriger', texte: 'S’il a déjà une ligne, touchez « Corriger ».', texteTr: 'Zaten bir satırı varsa « Corriger » düğmesine dokunun.' },
    { cible: 'equipe.ajouter', texte: 'Sinon, touchez « Ajouter des heures » (chantier, début, fin).', texteTr: 'Yoksa « Ajouter des heures » düğmesine dokunun (şantiye, başlangıç, bitiş).' },
    { cible: 'equipe.ok', texte: 'Touchez « OK — envoyer au bureau ». C’est marqué « par le chef d’équipe ».', texteTr: '« OK — envoyer au bureau » düğmesine dokunun. « par le chef d’équipe » olarak işaretlenir.' },
  ] },
  { id: 'infos', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.infos', texte: 'Dans « Plus », touchez « Informations ».', texteTr: '« Plus » sayfasında « Informations » satırına dokunun.' },
    { ecran: 'infos', cible: 'infos.fermer', texte: 'Une feuille apparaît : lisez le texte, puis touchez « Fermer ».', texteTr: 'Alttan bir sayfa açılır: metni okuyun, sonra « Fermer » düğmesine dokunun.' },
  ] },
];

// ── Fiches d'aide de l'Assistant (WORKER_GUIDE) : seulement ce qui change de texte ──────────────────────────────────────
// Le `mots`, le `lien` et l'`id` ne bougent pas (le raccourci mène au même écran). worker-assistant-core.ts remplace `titre` et `etapes`.
export interface FicheV2 { id: string; etapes: string[]; titreTr: string; etapesTr: string[] }

export const WORKER_GUIDE_V2: FicheV2[] = [
  { id: 'reserve', titreTr: 'Bir réserve (çekince) bildirmek',
    etapes: ['Ouvrez le chantier du jour (« Mes heures ›»).', 'Statut du chantier : « Avec réserve ».', 'Un détail si vous voulez (facultatif), des photos via « Documents », puis « OK ».'],
    etapesTr: ['Günün şantiyesini açın (« Mes heures ›»).', 'Şantiyenin durumu: « Avec réserve ».', 'İsterseniz bir ayrıntı (isteğe bağlı), « Documents » ile fotoğraflar, sonra « OK ».'] },
  { id: 'photo-document', titreTr: 'Fotoğraf ya da belge eklemek',
    etapes: ['Ouvrez le chantier du jour.', 'Bouton « Documents ».', '« Photo » ou « Fichier ».'],
    etapesTr: ['Günün şantiyesini açın.', '« Documents » düğmesi.', '« Photo » ya da « Fichier ».'] },
  { id: 'conge', titreTr: 'İzin talep etmek',
    etapes: ['« Plus » (votre nom, en haut à droite) → « Mes congés ».', 'Dans la feuille : « Faire une demande », type et dates.', '« Envoyer la demande » : le bureau répond.'],
    etapesTr: ['« Plus » (sağ üstte adınız) → « Mes congés ».', 'Açılan sayfada: « Faire une demande », tür ve tarihler.', '« Envoyer la demande »: büro cevap verir.'] },
  { id: 'pointer', titreTr: 'Giriş ve çıkışı işaretlemek',
    etapes: ['En arrivant : scannez le QR de la tablette (bouton « QR », en bas).', 'En partant : scannez à nouveau (ou « Terminer ma journée » sur la carte du pointage).', 'Pas de tablette : notez vos heures avec « + ».'],
    etapesTr: ['Gelince: tabletteki QR’ı tarayın (altta « QR » düğmesi).', 'Giderken: yeniden tarayın (ya da kayıt kartında « Terminer ma journée »).', 'Tablet yoksa: saatlerinizi « + » ile girin.'] },
  { id: 'envoyer-journee', titreTr: 'Gününüzü göndermek',
    etapes: ['Barre du bas : « Journée ».', 'Vérifiez vos chantiers et horaires.', '« Envoyer ma journée → ».'],
    etapesTr: ['Alt çubuk: « Journée ».', 'Şantiyelerinizi ve saatlerinizi kontrol edin.', '« Envoyer ma journée → ».'] },
  { id: 'noter-heures', titreTr: 'Saatlerinizi elle girmek',
    etapes: ['Barre du bas : « Journée » → bouton « + ».', 'Chantier, puis horaires.', '« OK », puis « Envoyer ma journée ».'],
    etapesTr: ['Alt çubuk: « Journée » → « + » düğmesi.', 'Şantiye, sonra saatler.', '« OK », sonra « Envoyer ma journée ».'] },
  { id: 'planning', titreTr: 'Planlamanızı görmek',
    etapes: ['Barre du bas : « Semaine » ou « Mois ».', 'Touchez un jour pour le détail.'],
    etapesTr: ['Alt çubuk: « Semaine » ya da « Mois ».', 'Ayrıntı için bir güne dokunun.'] },
  { id: 'historique', titreTr: 'Eski saatlerinizi bulmak',
    etapes: ['« Plus » → « Historique ».', 'Faites défiler : un bloc par jour. « PDF » enregistre vos heures envoyées.'],
    etapesTr: ['« Plus » → « Historique ».', 'Kaydırın: her gün için bir blok. « PDF » gönderdiğiniz saatleri kaydeder.'] },
  { id: 'copier-journee', titreTr: 'Bir günü kopyalamak',
    etapes: ['Barre du bas : « Journée ».', '« Copier la journée d’hier » ou « Dupliquer cette journée ».'],
    etapesTr: ['Alt çubuk: « Journée ».', '« Copier la journée d’hier » ya da « Dupliquer cette journée ».'] },
  { id: 'notifications', titreTr: 'Bildirimleri açmak',
    etapes: ['« Plus » (votre nom, en haut à droite).', '« Activer les notifications ».'],
    etapesTr: ['« Plus » (sağ üstte adınız).', '« Activer les notifications ».'] },
  { id: 'photo-profil', titreTr: 'Fotoğrafınızı değiştirmek',
    etapes: ['« Plus » (votre nom, en haut à droite).', '« Changer ma photo ».'],
    etapesTr: ['« Plus » (sağ üstte adınız).', '« Changer ma photo ».'] },
  { id: 'panier', titreTr: 'Yemek sepetini (panier) işaretlemek',
    etapes: ['Barre du bas : « Journée ».', 'Touchez la tuile « Panier » de la carte « Total aujourd’hui » (pris / non pris).', 'Un seul panier par jour.'],
    etapesTr: ['Alt çubuk: « Journée ».', '« Total aujourd’hui » kartındaki « Panier » kutusuna dokunun (yendi / yenmedi).', 'Günde yalnızca bir panier.'] },
  { id: 'modifier-heures', titreTr: 'Saatlerinizi değiştirmek',
    etapes: ['« Journée » → touchez la ligne.', 'Changez début et fin.', 'Validez ; si la journée est envoyée, le bureau est prévenu.'],
    etapesTr: ['« Journée » → satıra dokunun.', 'Başlangıç ve bitişi değiştirin.', 'Onaylayın; gün gönderilmişse büro haberdar edilir.'] },
  { id: 'retirer-ligne', titreTr: 'Gününüzden bir şantiyeyi kaldırmak',
    etapes: ['« Journée » → touchez la ligne.', '« Retirer ».', 'Confirmez.'],
    etapesTr: ['« Journée » → satıra dokunun.', '« Retirer ».', 'Onaylayın.'] },
  { id: 'route-pause', titreTr: 'Bir boşluğun yol mu mola mı olduğunu söylemek',
    etapes: ['« Journée » : la question apparaît entre deux chantiers.', '« Route » ou « Pause ».'],
    etapesTr: ['« Journée »: soru iki şantiye arasında görünür.', '« Route » ya da « Pause ».'] },
  { id: 'lever-reserve', titreTr: 'Bir réserve’i (çekince) kaldırmak',
    etapes: ['« Journée » → le chantier avec la réserve (ou la pastille « Réserves à lever » sous la bande des jours ; pendant un pointage : « Plus » → « Réserves à lever »).', '« Lever la réserve » : commentaire et photo facultatifs.', 'Le bureau la voit dans « Levées ».'],
    etapesTr: ['« Journée » → réserve’li şantiye (ya da günler şeridinin altındaki « Réserves à lever » kutusu; kayıt sürerken: « Plus » → « Réserves à lever »).', '« Lever la réserve »: yorum ve fotoğraf isteğe bağlı.', 'Büro bunu « Levées » içinde görür.'] },
  { id: 'annuler-conge', titreTr: 'Bir izin talebini iptal etmek',
    etapes: ['« Plus » → « Mes congés ».', '« Annuler ma demande » : la petite corbeille, tant qu’elle attend.'],
    etapesTr: ['« Plus » → « Mes congés ».', '« Annuler ma demande »: talep beklerken küçük çöp kutusu.'] },
  { id: 'sortie-oubliee', titreTr: 'Unutulan çıkış',
    etapes: ['« Journée » : « Terminer ma journée » sur la carte du pointage.', 'Le lendemain : la ligne « Sortie oubliée » attend votre heure de fin.', 'Touchez-la, mettez l’heure, puis « Envoyer ma journée ».'],
    etapesTr: ['« Journée »: kayıt kartında « Terminer ma journée ».', 'Ertesi gün: « Sortie oubliée » satırı bitiş saatinizi bekler.', 'Satıra dokunun, saati girin, sonra « Envoyer ma journée ».'] },
  { id: 'autre-chantier', titreTr: 'Listede olmayan bir şantiyede çalışmak',
    etapes: ['« Journée » → « + » → « Autre ».', 'Écrivez le nom : « Ajouter ce chantier ».', 'Le bureau le verra.'],
    etapesTr: ['« Journée » → « + » → « Autre ».', 'Adı yazın: « Ajouter ce chantier ».', 'Büro görecek.'] },
  { id: 'envoyer-client', titreTr: 'Fotoğrafları müşteriye göndermek',
    etapes: ['« Documents » du chantier.', '« Envoyer au client » (son email la première fois).', 'Un email s’ouvre avec les liens.'],
    etapesTr: ['Şantiyenin « Documents » bölümü.', '« Envoyer au client » (ilk seferde e-postası).', 'Bağlantılarla bir e-posta açılır.'] },
  { id: 'borne', titreTr: 'İstasyonla (QR kod) giriş yapmak',
    etapes: ['Bouton « QR » en bas de l’écran.', 'Visez le QR code de la borne.', 'Le pointage démarre (ou s’arrête).'],
    etapesTr: ['Ekranın altındaki « QR » düğmesi.', 'İstasyonun QR koduna doğrultun.', 'Kayıt başlar (ya da durur).'] },
  { id: 'equipe', titreTr: 'Ekip şefi: ekibin saatlerini girmek',
    etapes: ['« Plus » → « Mon équipe » (chef d’équipe seulement) : choisissez le jour (7 derniers jours) et le salarié.', '« Corriger » sa ligne, ou « Ajouter des heures » (chantier, début, fin).', '« OK — envoyer au bureau » : c’est envoyé, marqué « par le chef d’équipe ».'],
    etapesTr: ['« Plus » → « Mon équipe » (yalnızca ekip şefi): günü (son 7 gün) ve çalışanı seçin.', 'Satırını « Corriger » ile düzeltin ya da « Ajouter des heures » (şantiye, başlangıç, bitiş).', '« OK — envoyer au bureau »: gönderilir, « par le chef d’équipe » olarak işaretlenir.'] },
  { id: 'infos', titreTr: 'Verileriniz hakkında bilgi',
    etapes: ['« Plus » (votre nom, en haut à droite).', '« Informations ».'],
    etapesTr: ['« Plus » (sağ üstte adınız).', '« Informations ».'] },
  { id: 'collegues', titreTr: 'Meslektaşlarınızın nerede olduğunu öğrenmek',
    etapes: ['Bouton ✦ jaune, en haut à côté de votre nom.', 'Demandez « Où sont mes collègues ? » ou « Où est Paul demain ? ».', 'Prénom, chantier et horaires (si le bureau l’a autorisé).'],
    etapesTr: ['Adınızın yanındaki, üstteki sarı ✦ düğmesi.', '« Où sont mes collègues ? » ya da « Où est Paul demain ? » diye sorun.', 'Ad, şantiye ve saatler (büro izin verdiyse).'] },
  { id: 'assistant', titreTr: 'Asistanı kullanmak',
    etapes: ['Bouton ✦ jaune, en haut à côté de votre nom.', '🎤 pour dicter (appui = démarre, appui = arrête), 📎 pour une photo.', 'C’est fait tout de suite, avec « Annuler » ; pour effacer, vous confirmez d’abord.'],
    etapesTr: ['Adınızın yanındaki, üstteki sarı ✦ düğmesi.', '🎤 ile dikte edin (dokunuş = başlar, dokunuş = durur), 📎 ile fotoğraf ekleyin.', 'Hemen yapılır, « Annuler » ile geri alınır; silmek için önce onaylarsınız.'] },
];

/** Le texte d'une étape dans la langue demandée (le français si le turc manque). */
export const texteEtape = (e: TourStep & { texteTr?: string }, langue: Langue = 'fr'): string => (langue === 'tr' && e.texteTr ? e.texteTr : e.texte);
