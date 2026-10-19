// L'INTERRUPTEUR UNIQUE des guides du BUREAU pour le nouveau design (v2) : voir admin-tours-v2.ts et docs/design-brief/integration/guides-bureau-v2.md.
// `true` depuis la BASCULE du bureau (BUREAU_UI2_PAR_DEFAUT = true dans lib/use-bureau-ui2.ts, accord d'Ergun) : les guides pas à pas décrivent le bureau v2.
// Le bureau d'avant reste joignable par `?ui=1` (porte de secours) : il garde ses fiches d'avant (ADMIN_TOURS, admin-tours.ts ; celles du v2 : ADMIN_TOURS_V2, admin-tours-v2.ts).
// `false` = les guides d'avant partout, octet pour octet.
export const GUIDES_BUREAU_UI2 = true;
