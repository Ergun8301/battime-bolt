'use client';

// Design bureau · lot 2 · HP12 à HP16, HM04 : « Demandes de congé » (panneau). HABILLAGE SEULEMENT : la liste, « Accepter », « Refuser » (avec motif facultatif)
// sont ceux de components/leave-admin-dialog.tsx (inchangé), qui passe ses états et ses gestes en propriétés. Chargé en différé quand `useBureauUi2()` est vrai.
//
// Ce que la planche dessine et que le code ne permet pas (donc PAS ajouté) : rien de plus ; « Refuser » ouvre la saisie du motif dans la ligne, comme avant.
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { LeaveRequest, LeaveType } from '@/lib/types';
import { FenetreB, PanneauB } from './heures-fenetre';

export interface CongesV2Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: LeaveRequest[];
  nom: (userId: string) => string;
  periode: (r: LeaveRequest) => string;
  typeLabel: Record<LeaveType, string>;
  busyId: string | null;
  rejectingId: string | null;
  setRejectingId: (id: string | null) => void;
  rejectNote: string;
  setRejectNote: (v: string) => void;
  approve: (r: LeaveRequest) => void | Promise<void>;
  reject: (r: LeaveRequest) => void | Promise<void>;
}

const initiales = (nom: string) => nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase();

export default function CongesV2(p: CongesV2Props) {
  const [onglet, setOnglet] = useState<'attente' | 'traitees'>('attente');
  const attente = p.rows.filter((r) => r.status === 'pending');
  const traitees = p.rows.filter((r) => r.status !== 'pending');
  const liste = onglet === 'attente' ? attente : traitees;
  const refusant = p.rows.find((r) => r.id === p.rejectingId) || null;
  const prenomRefusant = refusant ? p.nom(refusant.user_id).split(' ')[0] : '';
  return (
    <PanneauB open={p.open} onOpenChange={p.onOpenChange} kicker="Salariés" titre="Demandes de congé" testId="leave-admin"
      sousTete={(
        <div className="dz-hb-onglets" role="tablist" aria-label="Demandes de congé">
          <button type="button" role="tab" aria-selected={onglet === 'attente'} onClick={() => setOnglet('attente')}>En attente ({attente.length})</button>
          <button type="button" role="tab" aria-selected={onglet === 'traitees'} onClick={() => setOnglet('traitees')}>Traitées</button>
        </div>
      )}>
      {p.rows.length === 0 ? (
        <div className="dz-hb-carte"><p className="dz-hb-vide">Aucune demande pour le moment.</p></div>
      ) : liste.length === 0 ? (
        <div className="dz-hb-carte"><p className="dz-hb-vide">{onglet === 'attente' ? 'Aucune demande en attente.' : 'Aucune demande traitée.'}</p></div>
      ) : (
        <ul className="dz-hb-demandes" data-guide={onglet === 'attente' ? 'bureau-conges.liste' : undefined}>
          {liste.map((r) => {
            const nom = p.nom(r.user_id);
            return (
              <li key={r.id} className="dz-hb-demande">
                <span className="dz-hb-initiales" aria-hidden="true">{initiales(nom)}</span>
                <div>
                  <b>{nom}</b>
                  <small>{p.typeLabel[r.type]} · {p.periode(r)}</small>
                  {r.note ? <small>« {r.note} »</small> : null}
                  {r.decision_note ? <small>« {r.decision_note} »</small> : null}
                </div>
                {r.status === 'pending' ? (
                  (
                    <div className="dz-hb-actions">
                      <button type="button" className="dz-hb-btn" title="Refuser" disabled={p.busyId === r.id}
                        onClick={() => { p.setRejectingId(r.id); p.setRejectNote(''); }}>Refuser</button>
                      <button type="button" className="dz-hb-btn" data-ton="principal" title="Accepter" disabled={p.busyId === r.id}
                        onClick={() => { void p.approve(r); }}>
                        {p.busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Accepter
                      </button>
                    </div>
                  )
                ) : (
                  <span className="dz-hb-chip" data-etat={r.status === 'approved' ? 'envoye' : 'alerte'}>{r.status === 'approved' ? 'Acceptée' : 'Refusée'}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FenetreB open={!!refusant} onOpenChange={(o) => { if (!o) p.setRejectingId(null); }} testId="leave-refuse" titre={`Refuser le congé de ${prenomRefusant} ?`}
        pied={(
          <>
            <button type="button" className="dz-hb-btn" onClick={() => p.setRejectingId(null)}>Annuler</button>
            <button type="button" className="dz-hb-btn" data-ton="encre" disabled={!refusant || p.busyId === refusant.id} onClick={() => { if (refusant) void p.reject(refusant); }}>
              {refusant && p.busyId === refusant.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Refuser
            </button>
          </>
        )}>
        {refusant ? <p>{p.periode(refusant)}</p> : null}
        <div className="dz-hb-champ">
          <label htmlFor="dz-hb-refus-motif">Motif (facultatif)</label>
          <textarea id="dz-hb-refus-motif" placeholder="Ex. chantier Villa Exemple à finir cette semaine-là" value={p.rejectNote} onChange={(e) => p.setRejectNote(e.target.value)} />
        </div>
      </FenetreB>
    </PanneauB>
  );
}
