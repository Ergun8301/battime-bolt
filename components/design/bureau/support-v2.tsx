'use client';

// Design du bureau · lot 3 B · RG16 : « Support BEMEXO » dans Réglages › Notifications & support, et sa fenêtre « Autoriser le support BEMEXO ».
// Habillage seulement : l'état (accès en cours, journal), la durée choisie et les appels (source.grant, source.revoke) restent dans
// components/support-access.tsx, qui les passe ici. La durée, qui était une liste déroulante, devient trois pastilles dans la fenêtre ; même valeur envoyée.
// Écart assumé à la planche : le journal des accès reste sous la ligne (il y était), pas seulement dans la fenêtre. Chargée en différé, avec `?ui=2`.
import { useEffect, useState } from 'react';
import { FenetreL3 as FenetreBureau, BoutonL3 as BoutonBureau } from './coque-l3';
import type { SupportHours, SupportState } from '@/lib/support';
import './lot3b-v2.css';

export interface SupportV2Props {
  state: SupportState | null; hours: SupportHours; setHours: (h: SupportHours) => void; busy: boolean; err: string | null;
  onGrant: () => void; onRevoke: () => void;
  /** Mise en forme de lib/support.ts, passée par support-access.tsx (ce morceau n'importe rien de partagé). */
  durees: { hours: SupportHours; label: string }[]; fmtDateTime: (iso: string) => string; decrire: (r: SupportState['log'][number]) => string;
}

export default function SupportV2({ state, hours, setHours, busy, err, onGrant, onRevoke, durees: SUPPORT_DURATIONS, fmtDateTime, decrire: describeEvent }: SupportV2Props) {
  const [ouvert, setOuvert] = useState(false);
  const accorde = !!state?.grant;
  // L'accès vient d'être accordé : la fenêtre se ferme d'elle-même (la ligne dit « Autorisé jusqu'au … »).
  useEffect(() => { if (accorde) setOuvert(false); }, [accorde]);
  const libelle = SUPPORT_DURATIONS.find((d) => d.hours === hours)?.label ?? '';
  return (
    <div className="dz-l3-support" data-testid="support-access">
      <div className="dz-l3-ligne">
        <div className="dz-l3-ligne__txt">
          <b>Support BEMEXO</b>
          {!state ? <span><span className="dz-l3-attente" aria-hidden="true" /> Chargement…</span>
            : accorde ? <span data-ton="ok">Autorisé jusqu’au {fmtDateTime(state.grant!.expires_at)}</span>
              : <span>Lecture seule, l’accès s’arrête tout seul.</span>}
        </div>
        {state && (accorde ? (
          <BoutonBureau ton="destructif-doux" disabled={busy} onClick={onRevoke} data-testid="support-revoke" data-guide="bureau-reglages.support">
            {busy && <span className="dz-l3-attente" aria-hidden="true" />} Retirer l’accès
          </BoutonBureau>
        ) : (
          <BoutonBureau ton="sombre" onClick={() => setOuvert(true)} data-testid="support-autoriser" data-guide="bureau-reglages.support">Autoriser…</BoutonBureau>
        ))}
      </div>
      {err && !ouvert && <p className="dz-l3-support__err" role="alert">{err}</p>}
      {state && (
        <div className="dz-l3-ligne" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <p className="dz-l3-etiquette">Journal des accès</p>
          {state.log.length === 0 ? <p className="dz-l3-note">Aucun accès pour l’instant.</p> : (
            <ul className="dz-l3-journal" data-testid="support-log">
              {state.log.map((r) => <li key={r.id}><time dateTime={r.at}>{fmtDateTime(r.at)}</time><span>{describeEvent(r)}</span></li>)}
            </ul>
          )}
        </div>
      )}

      <FenetreBureau
        open={ouvert} onOpenChange={(o) => { if (!busy) setOuvert(o); }} titre="Autoriser le support BEMEXO" testId="support-fenetre" className="dz-l3"
        pied={(
          <>
            <BoutonBureau disabled={busy} onClick={() => setOuvert(false)}>Annuler</BoutonBureau>
            <BoutonBureau ton="principal" disabled={busy} onClick={onGrant} data-testid="support-grant">
              {busy && <span className="dz-l3-attente" aria-hidden="true" />} Autoriser {libelle}
            </BoutonBureau>
          </>
        )}
      >
        <div className="dz-l3-champ">
          <span>Durée</span>
          <div className="dz-l3-seg" role="group" aria-label="Durée de l’accès">
            {SUPPORT_DURATIONS.map((d) => (
              <button key={d.hours} type="button" aria-pressed={hours === d.hours} onClick={() => setHours(d.hours)}>{d.label}</button>
            ))}
          </div>
        </div>
        <p className="dz-l3-note">L’équipe BEMEXO consulte votre espace pour vous aider, sans rien pouvoir modifier. Vous pouvez retirer l’accès à tout moment.</p>
        {err && <div className="dz-l3-alerte" data-ton="err" role="alert"><b>Accès non accordé</b><span>{err}</span></div>}
      </FenetreBureau>
    </div>
  );
}
