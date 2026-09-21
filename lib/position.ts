// Demander au téléphone où il est, sans jamais bloquer le pointage.
//
// CE FICHIER EXISTE POUR UNE SEULE RAISON : `navigator.geolocation` est une API
// qui peut ne jamais répondre. L'utilisateur laisse la demande d'autorisation
// ouverte et range son téléphone ; le navigateur attend. Si le pointage attend
// avec lui, le salarié se retrouve devant un bouton qui tourne dans le vide, au
// moment précis où il veut commencer à travailler.
//
// LA RÈGLE, DONC : cette fonction rend TOUJOURS la main, et elle rend `null`
// plutôt qu'une erreur. Pas de position n'est pas une panne — c'est un des
// résultats normaux, au même titre qu'une position.

/** Ce que le navigateur a bien voulu dire, quand il a dit quelque chose. */
export interface PositionCaptee {
  lat: number;
  lng: number;
  /** La précision ANNONCÉE, en mètres. Jamais séparée des coordonnées. */
  accuracy: number | null;
}

/**
 * Au-delà de ce rayon, on garde la valeur mais on refuse de la présenter comme
 * une position.
 *
 * POURQUOI 500 MÈTRES. Un point GPS en extérieur annonce 5 à 30 m. Un point
 * calculé sur le Wi-Fi ou l'antenne — c'est-à-dire un salarié à l'intérieur
 * d'un bâtiment, donc le cas le plus fréquent sur un chantier — annonce
 * couramment 1 000 à 3 000 m, avec six décimales qui ont l'air d'une adresse.
 * À 500 m on couvre déjà plusieurs rues : ça ne dit plus « il était sur ce
 * chantier », ça dit « il était dans ce quartier ».
 *
 * On ne jette pas la donnée pour autant : la présenter honnêtement vaut mieux
 * que l'effacer, et le seuil pourra bouger sans perdre l'historique.
 */
export const PRECISION_UTILE_M = 500;

export function positionUtile(accuracy: number | null | undefined): boolean {
  return accuracy != null && accuracy <= PRECISION_UTILE_M;
}

/**
 * Au-delà de cette durée depuis le démarrage, on ne demande PLUS l'endroit à la
 * fermeture.
 *
 * LE SCÉNARIO : le salarié oublie de fermer son pointage, s'en aperçoit le soir
 * chez lui, et ferme à 22 h. Sans ce test, le téléphone demande l'autorisation
 * et envoie les coordonnées de son DOMICILE au serveur.
 *
 * LE SERVEUR REFUSE DÉJÀ DE LES ENREGISTRER — mais il les a reçues, et les
 * avoir reçues est déjà un traitement. Le seul endroit où une donnée ne fuit
 * pas est celui où on ne l'a pas demandée. D'où ce second test, du côté où la
 * demande est faite.
 *
 * LES DEUX TESTS RESTENT, ET C'EST VOULU. Celui-ci évite la demande inutile
 * dans le cas normal ; celui du serveur est la garantie, parce qu'une horloge
 * de téléphone peut mentir et qu'un test côté navigateur n'engage personne.
 * Même valeur des deux côtés : quatorze heures.
 */
export const FENETRE_POSITION_MS = 14 * 60 * 60 * 1000;

/**
 * Coordonnées lisibles par un humain. Six décimales, c'est environ dix
 * centimètres — bien au-delà de ce que le meilleur GPS de téléphone sait
 * faire, mais c'est la valeur brute et on ne la maquille pas.
 */
export function fmtCoord(lat: number | string, lng: number | string): string {
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

/** « ± 25 m », ou « précision inconnue » quand le navigateur n'a rien dit. */
export function fmtPrecision(accuracy: number | null | undefined): string {
  if (accuracy == null) return 'précision inconnue';
  return accuracy >= 1000
    ? `± ${(accuracy / 1000).toFixed(1)} km`
    : `± ${Math.round(accuracy)} m`;
}

/**
 * Demande la position une fois, et rend la main quoi qu'il arrive.
 *
 * TROIS SORTIES, ET AUCUNE N'EST UNE ERREUR :
 *   · une position ;
 *   · `null` parce que le salarié a refusé — c'est son droit, et rien dans
 *     cette application ne doit le lui reprocher ;
 *   · `null` parce que le téléphone n'a pas trouvé : sous-sol, cave, immeuble,
 *     vieux appareil. Le quotidien d'un chantier.
 *
 * LE DOUBLE DÉLAI N'EST PAS UNE CEINTURE ET DES BRETELLES. L'option `timeout`
 * du navigateur ne court, sur plusieurs implémentations, qu'À PARTIR du moment
 * où l'autorisation est accordée : tant que la fenêtre de permission est
 * ouverte, elle n'expire jamais. C'est exactement le cas qui bloque le
 * pointage. D'où un second délai, tenu par nous, qui lui ne dépend de personne.
 */
export async function demanderPosition(delaiMs = 8000): Promise<PositionCaptee | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise<PositionCaptee | null>((resolve) => {
    let fini = false;
    const rendre = (v: PositionCaptee | null) => {
      if (fini) return;
      fini = true;
      resolve(v);
    };

    // Le délai qui ne dépend que de nous.
    const minuteur = setTimeout(() => rendre(null), delaiMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(minuteur);
        rendre({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      () => {
        // Refus, indisponibilité, expiration : même conséquence, pas de
        // position. On ne distingue pas les causes, parce qu'on n'en fait rien
        // — et surtout parce que savoir QUI a refusé n'est pas une information
        // que cette application a une raison de garder.
        clearTimeout(minuteur);
        rendre(null);
      },
      { enableHighAccuracy: true, timeout: delaiMs, maximumAge: 0 },
    );
  });
}
