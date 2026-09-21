'use client';

// L'écran d'information préalable (étape 27).
//
// POURQUOI IL EXISTE. Avant qu'une position soit enregistrée sur un salarié, il
// doit avoir été informé — individuellement, et avant la collecte
// (art. L1222-4 du code du travail). Sans cette information, la donnée est
// inutilisable comme preuve, ce qui est le vrai argument : la fonction ne sert
// alors plus à rien.
//
// La note papier est abandonnée. L'information se fait ici, et la BASE vérifie
// qu'elle a eu lieu : sans ligne dans `position_notice_ack`, ni le trigger de
// départ ni `stop_active_session` n'écrivent de position. Cet écran n'est donc
// pas la garantie — il est ce que la garantie donne à lire.
//
// CE QUE CE N'EST PAS : UN CONSENTEMENT. Dans une relation de travail le
// consentement n'est pas libre, et la base légale reste l'intérêt légitime.
// « J'ai compris » atteste qu'on a été informé, rien de plus. D'où l'absence de
// bouton « je refuse » : le refus se fait sur la question que pose le téléphone
// juste après, et il ne laisse aucune trace ici. Un bouton « je refuse »
// fabriquerait la liste de ceux qui ont dit non — exactement ce que l'étape 26
// s'est interdit.

import { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface Props {
  /** Ce que fait « J'ai compris ». Ne doit jamais rejeter : voir `valider`. */
  onAck: () => Promise<{ ok: boolean }>;
  /** Fermer l'écran. Appelé dans TOUS les cas, réussite ou échec. */
  onClose: () => void;
}

const PN_CSS = `
.bt-pn{position:fixed;inset:0;z-index:70;background:#15120F;color:#F2EDE3;display:flex;flex-direction:column;justify-content:center;padding:26px 22px;overflow-y:auto}
.bt-pn-k{display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#a59c86;font-weight:700}
.bt-pn-t{font-size:25px;font-weight:900;letter-spacing:-.02em;line-height:1.15;margin:12px 0 20px}
.bt-pn-l{display:flex;gap:11px;align-items:flex-start;padding:13px 0;border-top:1px solid rgba(242,237,227,.14);font-size:16px;font-weight:700;line-height:1.35}
.bt-pn-l:last-of-type{border-bottom:1px solid rgba(242,237,227,.14)}
.bt-pn-n{flex:none;width:23px;height:23px;border-radius:50%;background:#FFC21A;color:#15120F;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px}
.bt-pn-btn{width:100%;margin-top:22px;border:none;border-radius:13px;padding:15px;background:#FFC21A;color:#15120F;font-family:inherit;font-weight:900;font-size:17px;cursor:pointer;box-shadow:0 3px 0 #C99300}
.bt-pn-btn:active{transform:translateY(2px);box-shadow:none}
.bt-pn-btn:disabled{opacity:.6}
.bt-pn-note{font-size:12.5px;color:#a59c86;font-weight:600;margin-top:13px;line-height:1.45;text-align:center}
`;

/**
 * LES QUATRE LIGNES.
 *
 * Quatre, parce que ce sont les quatre questions qu'un salarié se pose : quoi,
 * quand, qui le voit, et qu'est-ce que ça me coûte. Onze mots au plus chacune —
 * une ligne qu'on ne lit pas n'informe personne, et une information qu'on
 * n'a pas lue n'est pas une information.
 *
 * Vocabulaire de l'étape 20 : aucun des mots du bureau (saisir, déclarer,
 * brouillon, valider, intervention, en attente), et pas de « géolocalisation »
 * là où « l'endroit » suffit.
 */
const LIGNES = [
  'Où tu es quand tu démarres et quand tu fermes.',
  'Deux fois par journée. Jamais entre, jamais quand BEMEXO est fermé.',
  'Le bureau le voit. Ton chef d’équipe, non.',
  'Si tu refuses, ton pointage et ta paie ne changent pas.',
];

export default function PositionNotice({ onAck, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);

  /**
   * « J'AI COMPRIS » FERME TOUJOURS L'ÉCRAN.
   *
   * Même si l'écriture échoue. `/poseur` marche hors réseau — c'est tout
   * l'intérêt d'une application de chantier — et un écran dont la sortie exige
   * une requête enfermerait un salarié en sous-sol derrière une information.
   * La règle du dépôt est plus forte que cet écran : l'heure n'est jamais
   * bloquée par le client.
   *
   * ET ÇA NE COÛTE RIEN. Sans ligne d'accusé, la base refuse la position des
   * deux côtés. Laisser passer quelqu'un dont l'accusé n'est pas encore parti,
   * c'est le laisser pointer sans que rien ne soit enregistré sur lui : le
   * plus prudent des deux états. L'écriture repart toute seule au retour du
   * réseau.
   */
  const valider = async () => {
    setBusy(true);
    try {
      const r = await onAck();
      if (!r.ok) {
        // On le DIT, au lieu de faire comme si c'était parti. Une seconde
        // d'affichage, puis on sort : il est venu pointer, pas lire un écran.
        setHorsLigne(true);
        setTimeout(onClose, 2200);
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bt-pn">
      <style dangerouslySetInnerHTML={{ __html: PN_CSS }} />
      <div className="bt-pn-k"><MapPin className="h-3.5 w-3.5" /> À lire une fois</div>
      <div className="bt-pn-t">Ton entreprise note l’endroit où tu pointes.</div>

      {LIGNES.map((l, i) => (
        <div key={l} className="bt-pn-l">
          <span className="bt-pn-n">{i + 1}</span>
          <span>{l}</span>
        </div>
      ))}

      <button type="button" className="bt-pn-btn" disabled={busy} onClick={valider}>
        {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'J’ai compris'}
      </button>

      {horsLigne && (
        <div className="bt-pn-note">
          Pas de réseau. Tu peux pointer&nbsp;: l’endroit ne sera pas noté tant que ça n’est pas parti.
        </div>
      )}
    </div>
  );
}
