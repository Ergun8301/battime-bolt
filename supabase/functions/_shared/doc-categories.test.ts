// Catégories des documents (lot 24, oct. 2026) : règles pures.
//   npm run test:documents
import {
  AUTHOR_CATEGORIES, canEditCategory, categoryChangeNotice, categoryChoices, categoryErrorMessage, categoryText, DOC_CATEGORY_NAMES, DOC_CATEGORY_TEXT,
  GONE_TEXT, INVOICE_CATEGORIES, isInvoiceCategory, NO_CATEGORY_TEXT, OFFLINE_TEXT, REFUSED_TEXT, WORKER_INVOICE_TEXT, workerInvoiceRefusal,
} from './doc-categories.ts';
import { DOC_CATEGORIES, DOC_CATEGORY_LABEL as WORKER_LABEL } from './worker-assistant-core.ts';
import { DOC_CATEGORY_LABEL as OFFICE_LABEL } from './assistant-actions-core.ts';
import { DOC_EXCLUDED_CATEGORIES } from './trainings.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

/** La migration, trouvée par son suffixe (l'horodatage peut encore changer). */
function migration(): string {
  const dir = new URL('../../migrations/', import.meta.url);
  for (const e of Deno.readDirSync(dir)) if (e.name.endsWith('_lot24_documents_factures_categorie.sql')) return Deno.readTextFileSync(new URL(e.name, dir));
  throw new Error('migration *_lot24_documents_factures_categorie.sql introuvable');
}

Deno.test('les 8 catégories sont celles du reste du projet, avec les mêmes libellés', () => {
  eq(DOC_CATEGORY_NAMES.length, 8, '8 catégories');
  eq(new Set(DOC_CATEGORY_NAMES).size, 8, 'sans doublon');
  eq([...DOC_CATEGORY_NAMES].sort(), [...DOC_CATEGORIES].sort(), 'même ensemble que DOC_CATEGORIES (assistant salarié)');
  eq([...DOC_CATEGORY_NAMES].sort(), Object.keys(WORKER_LABEL).sort(), 'mêmes clés que le libellé de l’assistant salarié');
  eq([...DOC_CATEGORY_NAMES].sort(), Object.keys(OFFICE_LABEL).sort(), 'mêmes clés que le libellé de l’assistant bureau');
  for (const c of DOC_CATEGORY_NAMES) {
    eq(DOC_CATEGORY_TEXT[c], WORKER_LABEL[c], `${c} : même libellé que l’assistant salarié`);
    eq(DOC_CATEGORY_TEXT[c], OFFICE_LABEL[c], `${c} : même libellé que l’assistant bureau`);
  }
  eq(Object.keys(DOC_CATEGORY_TEXT).sort(), [...DOC_CATEGORY_NAMES].sort(), 'un libellé par catégorie, pas un de plus');
});

Deno.test('les listes jumelles de la migration : factures et ensemble léger', () => {
  const sql = migration();
  eq(INVOICE_CATEGORIES, ['facture', 'facture_payee'], 'les deux factures');
  const inList = (cats: readonly string[]) => `(${cats.map((c) => `'${c}'`).join(', ')})`;
  // « IN ('facture', 'facture_payee') » dans la règle de lecture, le garde, la fonction du stockage et l'index.
  ok((sql.match(new RegExp(`IN ${inList(INVOICE_CATEGORIES).replace(/[()]/g, '\\$&')}`, 'g')) || []).length >= 5, 'la liste des factures est écrite dans les règles, le garde, le stockage, l’index et my_trainings');
  const light = /v_light\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/.exec(sql);
  ok(!!light, 'v_light trouvé dans la migration');
  eq((light![1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1)), [...AUTHOR_CATEGORIES], 'AUTHOR_CATEGORIES = v_light de la migration, dans le même ordre');
  ok(!(AUTHOR_CATEGORIES as readonly string[]).includes('reserve'), 'la réserve n’est pas dans l’ensemble léger');
  for (const c of INVOICE_CATEGORIES) ok(!(AUTHOR_CATEGORIES as readonly string[]).includes(c), `${c} n’est pas dans l’ensemble léger`);
  // Les formations ne proposent pas non plus une facture comme pièce jointe (lot 6).
  for (const c of INVOICE_CATEGORIES) ok((DOC_EXCLUDED_CATEGORIES as readonly string[]).includes(c), `${c} exclue des pièces de formation`);
  // Les messages que l'écran sait afficher sont ceux que la base lève.
  for (const m of ['Les factures sont réservées au bureau.', 'Vous ne pouvez corriger que vos propres documents.', 'Seule la catégorie d\'\'un document peut être modifiée.', 'Cette catégorie est réservée au bureau.']) {
    ok(sql.includes(`'${m}'`), `la migration lève « ${m} »`);
  }
});

Deno.test('isInvoiceCategory', () => {
  eq(isInvoiceCategory('facture'), true, 'facture');
  eq(isInvoiceCategory('facture_payee'), true, 'facture_payee');
  eq(isInvoiceCategory(null), false, 'NULL');
  eq(isInvoiceCategory(undefined), false, 'undefined');
  eq(isInvoiceCategory(''), false, 'vide');
  eq(isInvoiceCategory('devis'), false, 'devis');
  eq(isInvoiceCategory('Facture'), false, 'la base est sensible à la casse : « Facture » n’est pas une facture');
  eq(isInvoiceCategory('facture '), false, 'espace en trop');
});

Deno.test('categoryText', () => {
  eq(categoryText(null), 'Sans catégorie', 'NULL');
  eq(categoryText(undefined), 'Sans catégorie', 'undefined');
  eq(categoryText(''), NO_CATEGORY_TEXT, 'vide');
  eq(categoryText('pv_reception'), 'PV de réception', 'PV');
  eq(categoryText('facture_payee'), 'Facture payée', 'facture payée');
  eq(categoryText('inconnue'), 'inconnue', 'inconnue → valeur brute');
});

Deno.test('categoryChoices : le bureau a tout, l’auteur l’ensemble léger', () => {
  const office = categoryChoices(true);
  eq(office.length, 9, 'bureau : 8 + sans catégorie');
  eq(office, ['devis', 'plan', 'pv_reception', 'photo', 'reserve', 'facture', 'facture_payee', 'autre', null], 'bureau : ordre d’affichage');
  ok(office.includes('facture') && office.includes('facture_payee'), 'bureau : les deux factures');
  const worker = categoryChoices(false);
  eq(worker.length, 6, 'salarié : 5 + sans catégorie');
  eq(worker, ['photo', 'plan', 'devis', 'pv_reception', 'autre', null], 'salarié : l’ensemble léger');
  ok(!worker.includes('facture') && !worker.includes('facture_payee') && !worker.includes('reserve'), 'salarié : ni facture ni réserve');
  ok(categoryChoices(false).every((c) => c === null || !isInvoiceCategory(c)), 'salarié : jamais une facture');
  eq(categoryChoices(true).filter((c) => c === null).length, 1, 'une seule entrée « sans catégorie »');
});

Deno.test('canEditCategory', () => {
  const ME = 'u-sam'; const OTHER = 'u-alex';
  eq(canEditCategory({ office: true, userId: 'u-admin', uploadedBy: OTHER, current: 'facture' }), true, 'bureau : facture d’un salarié');
  eq(canEditCategory({ office: true, userId: 'u-admin', uploadedBy: null, current: null }), true, 'bureau : document sans auteur');
  eq(canEditCategory({ office: true }), true, 'bureau : toujours');
  for (const cur of [null, undefined, 'photo', 'plan', 'devis', 'pv_reception', 'autre']) {
    eq(canEditCategory({ office: false, userId: ME, uploadedBy: ME, current: cur }), true, `auteur sur SON document « ${cur} »`);
  }
  eq(canEditCategory({ office: false, userId: ME, uploadedBy: OTHER, current: null }), false, 'document d’un collègue');
  eq(canEditCategory({ office: false, userId: ME, uploadedBy: null, current: null }), false, 'document sans auteur');
  eq(canEditCategory({ office: false, userId: ME, uploadedBy: ME, current: 'reserve' }), false, 'auteur sur sa réserve');
  eq(canEditCategory({ office: false, userId: ME, uploadedBy: ME, current: 'facture' }), false, 'auteur sur sa facture');
  eq(canEditCategory({ office: false, userId: ME, uploadedBy: ME, current: 'facture_payee' }), false, 'auteur sur sa facture payée');
  eq(canEditCategory({ office: false, userId: ME, uploadedBy: ME, current: 'inconnue' }), false, 'auteur sur une catégorie inconnue');
  eq(canEditCategory({ office: false, userId: null, uploadedBy: null, current: null }), false, 'personne de connecté');
  eq(canEditCategory({ office: false, userId: undefined, uploadedBy: undefined, current: null }), false, 'utilisateur absent');
});

Deno.test('categoryChangeNotice', () => {
  eq(categoryChangeNotice('devis', 'facture', true), 'Les salariés ne verront plus ce document.', 'devis → facture');
  eq(categoryChangeNotice(null, 'facture_payee', true), 'Les salariés ne verront plus ce document.', 'sans catégorie → facture payée');
  eq(categoryChangeNotice('facture', 'autre', true), 'Les salariés pourront voir ce document.', 'facture → autre');
  eq(categoryChangeNotice('facture_payee', null, true), 'Les salariés pourront voir ce document.', 'facture payée → sans catégorie');
  eq(categoryChangeNotice('facture', 'facture_payee', true), null, 'facture → facture payée : rien ne change pour les salariés');
  eq(categoryChangeNotice('reserve', 'autre', true), 'Ce document ne sera plus classé dans les réserves.', 'réserve → autre (bureau)');
  eq(categoryChangeNotice('reserve', 'facture', true), 'Les salariés ne verront plus ce document. Il ne sera plus classé dans les réserves.', 'réserve → facture : les DEUX avertissements (invisible des salariés ET sort du rapport de réserves)');
  eq(categoryChangeNotice('reserve', 'facture_payee', true), 'Les salariés ne verront plus ce document. Il ne sera plus classé dans les réserves.', 'réserve → facture payée : idem');
  eq(categoryChangeNotice('facture', 'reserve', true), 'Les salariés pourront voir ce document.', 'facture → réserve : visible de nouveau, il entre dans les réserves (pas d’avertissement de sortie)');
  eq(categoryChangeNotice('reserve', null, false), 'Ce document ne sera plus classé dans les réserves.', 'réserve → rien (hors bureau)');
  eq(categoryChangeNotice('devis', 'plan', true), null, 'devis → plan');
  eq(categoryChangeNotice('devis', 'facture', false), null, 'hors bureau : pas d’avertissement facture');
  eq(categoryChangeNotice('reserve', 'reserve', true), null, 'réserve → réserve');
  eq(categoryChangeNotice(null, null, true), null, 'rien → rien');
});

Deno.test('categoryErrorMessage', () => {
  eq(categoryErrorMessage({ code: '42501', message: 'x' }, false), 'Pas de connexion : rien n’a été changé. Réessayez.', 'hors ligne, quelle que soit l’erreur');
  eq(OFFLINE_TEXT, 'Pas de connexion : rien n’a été changé. Réessayez.', 'texte hors ligne');
  eq(categoryErrorMessage(new TypeError('Failed to fetch')), OFFLINE_TEXT, 'TypeError réseau');
  eq(categoryErrorMessage(new TypeError('boom')), OFFLINE_TEXT, 'TypeError quelconque (fetch du navigateur)');
  eq(categoryErrorMessage({ message: 'NetworkError when attempting to fetch resource.' }), OFFLINE_TEXT, 'Firefox');
  eq(categoryErrorMessage({ message: 'Load failed' }), OFFLINE_TEXT, 'Safari');
  eq(categoryErrorMessage({ code: '23514', message: 'violates check constraint' }), 'Catégorie inconnue : rien n’a été changé.', '23514');
  for (const m of ['Les factures sont réservées au bureau.', 'Vous ne pouvez corriger que vos propres documents.', 'Seule la catégorie d\'un document peut être modifiée.', 'Cette catégorie est réservée au bureau.']) {
    eq(categoryErrorMessage({ code: '42501', message: m }), m, `42501 : « ${m} » tel quel`);
  }
  eq(categoryErrorMessage({ code: '42501', message: 'permission denied for table documents' }), 'Changement refusé : vous ne pouvez pas modifier ce document.', '42501 sans message connu');
  eq(categoryErrorMessage({ code: '42501' }), REFUSED_TEXT, '42501 sans message');
  eq(categoryErrorMessage(Object.assign(new Error(GONE_TEXT), { code: 'GONE' })), GONE_TEXT, 'aucune ligne rendue (code GONE de lib/doc-category.ts)');
  eq(categoryErrorMessage({ code: 'PGRST116', message: 'The result contains 0 rows' }), GONE_TEXT, 'PGRST116 (ligne introuvable) : même texte, pas « réessayez »');
  eq(GONE_TEXT, 'Ce document n’est plus disponible ou a été modifié par le bureau.', 'texte du document disparu');
  eq(REFUSED_TEXT, 'Changement refusé : vous ne pouvez pas modifier ce document.', 'texte du refus');
  eq(categoryErrorMessage({ code: 'PGRST301', message: 'JWT expired', status: 401 }), 'Changement impossible pour le moment. Réessayez dans un instant.', 'autre code : défaut, même en 401');
  eq(categoryErrorMessage({ code: '42501', message: 'x', status: 403 }), REFUSED_TEXT, 'jamais le statut HTTP : 403 sans texte connu');
  eq(categoryErrorMessage({}), 'Changement impossible pour le moment. Réessayez dans un instant.', 'objet vide');
  eq(categoryErrorMessage(undefined), 'Changement impossible pour le moment. Réessayez dans un instant.', 'undefined');
  eq(categoryErrorMessage(null), 'Changement impossible pour le moment. Réessayez dans un instant.', 'null');
  eq(categoryErrorMessage('texte'), 'Changement impossible pour le moment. Réessayez dans un instant.', 'chaîne');
});

Deno.test('workerInvoiceRefusal : l’assistant salarié ne range pas une facture (sans catégorie = visible de tous), mais rien ne change avant la migration', () => {
  eq(workerInvoiceRefusal('facture', true), WORKER_INVOICE_TEXT, 'facture, migration là : refusé');
  eq(workerInvoiceRefusal('facture_payee', true), WORKER_INVOICE_TEXT, 'facture payée, migration là : refusé');
  eq(workerInvoiceRefusal('facture', false), null, 'facture, migration absente : comportement d’avant (la base accepte encore)');
  eq(workerInvoiceRefusal('facture_payee'), null, 'migration inconnue : comportement d’avant');
  for (const c of ['devis', 'plan', 'pv_reception', 'photo', 'reserve', 'autre', null, undefined, '']) eq(workerInvoiceRefusal(c as string | null | undefined, true), null, `${String(c)} : rangé comme d’habitude`);
  ok(/bureau/.test(WORKER_INVOICE_TEXT) && /pas été rangé/.test(WORKER_INVOICE_TEXT), 'le message dit où donner le fichier et que rien n’est rangé');
});
