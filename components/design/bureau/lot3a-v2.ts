// Design bureau · lot 3 A : les vues du lot, réexportées par exporter-v2.tsx (morceau différé du lot 2, déjà connu du chargeur).
// Chaque NOUVEAU morceau différé ajoute quelques dizaines d'octets au chargeur partagé par TOUTES les pages (/poseur, /borne… sont au plafond) :
// les fenêtres du lot passent donc toutes par `import('@/components/design/bureau/exporter-v2').then((m) => ({ default: m.X }))`.
// Ces vues n'importent RIEN du premier chargement de /admin (ce qu'il leur faut arrive par leurs props) : sinon le module serait tiré dans un
// morceau partagé ajouté au premier chargement.
export { default as ReservesV2 } from './reserves-v2';
export { default as Lot3PlanningV2 } from './equipe-clients-v2';
export { TerminerV2, RouvrirV2, BilanV2 } from './termine-v2';
export { default as ImportV2 } from './import-v2';
export { default as DocumentsV2 } from './documents-v2';
export { default as GererV2, CoutReelV2 } from './gerer-v2';
export { Coque } from './lot3a-ui';
