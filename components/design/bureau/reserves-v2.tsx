'use client';

// Design bureau · lot 3 A · « Réserves de chantier » (CL16 à CL18, téléphone XM04). Panneau 480 px, onglets « À traiter (n) » / « Levées »,
// une ligne par réserve avec « Lever » ; « Lever la réserve » s'ouvre en fenêtre (note + photo facultatives) ; « Rouvrir… » demande d'abord.
// Les états, la lecture paginée, la levée et la réouverture restent dans components/reserves-report.tsx : cette vue reçoit ses gestes tels quels.
import { useEffect, useId, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ReserveRow } from '@/components/reserves-report';
import { Alerte, Btn, Coque, Lignes, Ligne, Onglets, P, Squelettes, Vide, ChampTexte } from './lot3a-ui';

export interface ReservesV2Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tab: 'open' | 'done';
  setTab: (t: 'open' | 'done') => void;
  loading: boolean;
  erreur: boolean;
  openRows: ReserveRow[];
  doneRows: ReserveRow[];
  photos: Map<string, { id: string; url: string }[]>;
  resolving: string | null;
  setResolving: (id: string | null) => void;
  busy: boolean;
  lift: (r: ReserveRow, note: string, photo: File | null) => Promise<void>;
  /** Premier appel : demande ; second appel (même ligne) : rouvre. */
  reopen: (r: ReserveRow) => void;
  confirmReopen: string | null;
  setConfirmReopen: (id: string | null) => void;
  onOpenDocs?: (worksiteId: string, worksiteName: string) => void;
  recharger: () => void;
}

const jour = (d: string) => format(parseISO(d), 'EEE d', { locale: fr });
const resume = (r: ReserveRow) => (r.observation ? r.observation.replace(/\s+/g, ' ').slice(0, 60) + (r.observation.length > 60 ? '…' : '') : 'sans détail écrit');

export default function ReservesV2(p: ReservesV2Props) {
  const enLevee = p.openRows.find((r) => r.id === p.resolving) || null;
  const aRouvrir = p.doneRows.find((r) => r.id === p.confirmReopen) || null;
  return (
    <>
      <Coque
        open={p.open} onOpenChange={p.onOpenChange} forme="panneau" kicker="Réserves de chantier" titre="Réserves" testId="reserves-report"
        onglets={<Onglets nom="Réserves" valeur={p.tab} onChange={p.setTab} options={[
          { v: 'open', l: `À traiter (${p.openRows.length})`, testId: 'rr-tab-open', guide: 'bureau-reserves.a-traiter' },
          { v: 'done', l: 'Levées', testId: 'rr-tab-done' },
        ]} />}
      >
        {p.loading ? <Squelettes n={3} />
          : p.erreur ? <Alerte ton="erreur" titre="Réserves illisibles pour le moment" boutons={<button type="button" onClick={p.recharger}>Réessayer</button>}>Rien n’est affiché plutôt qu’une liste fausse.</Alerte>
          : p.tab === 'open' ? (
            p.openRows.length === 0 ? <Vide t="Aucune réserve à traiter." s="Les réserves déclarées par les salariés à la réception arrivent ici." testId="rr-vide-open" /> : (
              <Lignes guide="bureau-reserves.liste">
                {p.openRows.map((r) => (
                  <Ligne key={r.id} testId="rr-open-card"
                    t={`${r.worksite_name} · ${resume(r)}`}
                    s={`${r.worker} · ${jour(r.work_date)}${r.worksite_city ? ` · ${r.worksite_city}` : ''}`}
                    actions={<>
                      {r.worksite_id && p.onOpenDocs ? <Btn taille="ligne" onClick={() => p.onOpenDocs!(r.worksite_id!, r.worksite_name)}>Photos</Btn> : null}
                      <Btn taille="ligne" ton="principal" disabled={p.busy} onClick={() => p.setResolving(r.id)} data-testid="rr-lever">Lever</Btn>
                    </>}
                  />
                ))}
              </Lignes>
            )
          ) : p.doneRows.length === 0 ? <Vide t="Aucune réserve levée pour le moment." testId="rr-vide-done" /> : (
            <Lignes>
              {p.doneRows.map((r) => {
                const ph = p.photos.get(r.id) || [];
                const qui = r.lifted_by_name ? ` par ${r.lifted_by_name}` : r.lifted_by === 'salarie' ? ' par le salarié' : ' par le bureau';
                return (
                  <Ligne key={r.id} testId="rr-done-card"
                    t={`${r.worksite_name} · ${resume(r)}`}
                    s={<>Levée le {format(parseISO(r.lifted_at!), 'dd/MM', { locale: fr })}{qui}{r.lifted_note ? ` · « ${r.lifted_note} »` : ''}{ph.length ? <> · {ph.map((x, i) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="dz-l3-lien" data-testid="rr-lift-photo">photo{ph.length > 1 ? ` ${i + 1}` : ''}</a>)}</> : null}</>}
                    actions={<>
                      {r.worksite_id && p.onOpenDocs ? <Btn taille="ligne" onClick={() => p.onOpenDocs!(r.worksite_id!, r.worksite_name)} data-testid="rr-done-docs">Photos</Btn> : null}
                      <Btn taille="ligne" disabled={p.busy} onClick={() => p.reopen(r)} data-testid="rr-rouvrir">Rouvrir…</Btn>
                    </>}
                  />
                );
              })}
            </Lignes>
          )}
        {p.tab === 'open' && !p.loading && !p.erreur ? <P ton="doux">Le bureau ou le salarié lève une réserve. Une réserve levée passe dans « Levées » ; rien n’est effacé.</P> : null}
      </Coque>

      {enLevee ? <LeverV2 r={enLevee} onClose={() => p.setResolving(null)} lift={p.lift} /> : null}

      <Coque open={!!aRouvrir} onOpenChange={(o) => { if (!o) p.setConfirmReopen(null); }} forme="fenetre" largeur={460} alerte titre="Rouvrir la réserve ?" testId="rr-rouvrir-ask"
        pied={<><Btn onClick={() => p.setConfirmReopen(null)} disabled={p.busy}>Annuler</Btn><Btn ton="encre" busy={p.busy} disabled={p.busy} onClick={() => aRouvrir && p.reopen(aRouvrir)} data-testid="rr-reopen-yes">Rouvrir</Btn></>}>
        <P>Elle repasse « à traiter » et réapparaît sur la carte du chantier.</P>
      </Coque>
    </>
  );
}

/** CL17 : « Lever la réserve ». Mêmes champs que le formulaire d'avant (commentaire de 500 caractères, une photo, facultatifs) ; même geste `lift`. */
function LeverV2({ r, onClose, lift }: { r: ReserveRow; onClose: () => void; lift: ReservesV2Props['lift'] }) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mauvais, setMauvais] = useState(false);
  const vivant = useRef(true);
  const id = useId();
  useEffect(() => () => { vivant.current = false; }, []);
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);
  const choisir = (f?: File | null) => {
    if (!f) return;
    if (!(f.type || '').startsWith('image/')) { setMauvais(true); return; }
    setMauvais(false); setPhoto(f); setApercu(URL.createObjectURL(f));
  };
  const valider = async () => {
    if (busy) return;
    setBusy(true);
    try { await lift(r, note, photo); } catch { /* le message est déjà affiché ; la saisie reste */ } finally { if (vivant.current) setBusy(false); }
  };
  return (
    <Coque open onOpenChange={(o) => { if (!o && !busy) onClose(); }} forme="fenetre" largeur={520} titre="Lever la réserve" sous={`${r.worksite_name} · ${resume(r)}`} testId="reserve-lift-form"
      pied={<><Btn onClick={onClose} disabled={busy}>Annuler</Btn><Btn ton="principal" busy={busy} disabled={busy} onClick={valider} data-testid="reserve-lift-submit" data-guide="reserves.valider">Lever la réserve</Btn></>}>
      <ChampTexte nom="Note (facultatif)" id={id} rows={3} maxLength={500} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} placeholder="Ex : joint refait, vis posée le 22/09" />
      {apercu ? (
        <div className="dz-l3-photos" style={{ ['--l3-cols' as string]: 3 }}>
          <div className="dz-l3-photo" data-testid="reserve-lift-preview">
            <span className="dz-l3-photo__img"><img src={apercu} alt="Photo jointe" /></span>
            <Btn taille="ligne" onClick={() => { setPhoto(null); setApercu(null); }} disabled={busy}>Retirer la photo</Btn>
          </div>
        </div>
      ) : (
        <label className="dz-l3-depot">
          <b>Photo (facultatif)</b><span>Touchez pour prendre ou choisir</span>
          <input type="file" accept="image/*" capture="environment" data-testid="reserve-lift-file" disabled={busy} onChange={(e) => choisir(e.target.files?.[0])} />
        </label>
      )}
      {mauvais ? <P ton="erreur">Photo uniquement (JPG, PNG…).</P> : null}
    </Coque>
  );
}
