'use client';

// Design bureau · lot 3 A · « Importer des clients » (CL08, CL09) et « Importer des salariés » (EQ03). Une seule vue pour les deux imports :
// la lecture du fichier (CSV, Excel), la correspondance des colonnes, les doublons, l'envoi et le résultat restent dans import-dialog.tsx et
// import-workers-dialog.tsx ; cette vue reçoit leurs états et leurs gestes.
import type { ReactNode } from 'react';
import { Alerte, Btn, Coche, Coque, Depot, Lignes, Ligne, P, Vide } from './lot3a-ui';

export interface ImportV2Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titre: string;
  step: 'file' | 'map' | 'sending' | 'done';
  busy: boolean;
  depotS: string;
  colonnes: string;
  fileName: string;
  headers: string[];
  rows: string[][];
  fields: { key: string; label: string; required?: boolean }[];
  mapping: Record<string, number>;
  setMapping: (f: (m: Record<string, number>) => Record<string, number>) => void;
  skipDupes: boolean;
  setSkipDupes: (v: boolean) => void;
  skipLabel: string;
  parseFile: (f?: File | null) => void;
  reset: () => void;
  recap: ReactNode;
  /** Ligne sans nom (clients) / incomplète (salariés) : nombre. */
  manquants: number;
  avertissement?: ReactNode;
  apercu?: { ligne: number; nom: string; ville: string; etat: 'creer' | 'deja' | 'manque' }[];
  importLabel: string;
  importDisabled: boolean;
  doImport: () => void;
  progress?: { done: number; total: number };
  resultat?: { titre: ReactNode; echecs?: { email: string; reason: string }[] } | null;
}

const ETAT = { creer: ['À CRÉER', 'ok'], deja: ['DÉJÀ PRÉSENT', 'clos'], manque: ['NOM MANQUANT', 'erreur'] } as const;

export default function ImportV2(p: ImportV2Props) {
  const fermer = () => p.onOpenChange(false);
  const pied = p.step === 'file' ? <><Btn onClick={fermer}>Annuler</Btn><Btn ton="principal" disabled>Importer</Btn></>
    : p.step === 'map' ? <><Btn onClick={fermer} disabled={p.busy}>Annuler</Btn><Btn ton="principal" onClick={p.doImport} disabled={p.busy || p.importDisabled} busy={p.busy} data-testid="import-go">{p.importLabel}</Btn></>
    : p.step === 'done' ? <Btn ton="principal" plein onClick={fermer}>Terminer</Btn> : undefined;
  return (
    <Coque open={p.open} onOpenChange={(o) => { if (!p.busy) p.onOpenChange(o); }} forme="fenetre" largeur={p.step === 'map' ? 640 : 600} titre={p.titre} testId="import-v2"
      onInteractOutside={(e) => { if (p.busy) e.preventDefault(); }} pied={pied}>
      {p.step === 'file' ? (<>
        <Depot t="Déposez un fichier CSV ou Excel" s="ou choisissez-le · 8 Mo au plus" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onFichier={(f) => p.parseFile(f[0])} testId="import-depot" />
        <P>{p.colonnes}</P>
        <P ton="doux">La première ligne contient les titres des colonnes ; vous confirmez la correspondance avant d’importer.</P>
      </>) : null}

      {p.step === 'map' ? (<>
        <Lignes>
          <Ligne t={p.fileName} s={`${p.rows.length} ligne${p.rows.length > 1 ? 's' : ''} lue${p.rows.length > 1 ? 's' : ''}`} actions={<Btn taille="ligne" onClick={p.reset} disabled={p.busy}>Changer</Btn>} />
        </Lignes>
        <Lignes titre="Correspondance des colonnes">
          {p.fields.map((f) => {
            const col = p.mapping[f.key];
            const ex = col != null && col >= 0 ? (p.rows.find((r) => (r[col] || '').trim())?.[col] || '') : '';
            return (
              <Ligne key={f.key} t={`${f.label}${f.required ? ' *' : ''}`} s={ex ? `ex. ${ex}` : undefined}
                actions={<select className="dz-l3-select" aria-label={`Colonne pour « ${f.label} »`} value={String(col ?? -1)} onChange={(e) => p.setMapping((m) => ({ ...m, [f.key]: parseInt(e.target.value, 10) }))}>
                  <option value="-1">— ignorer —</option>
                  {p.headers.map((h, i) => <option key={i} value={String(i)}>{h || `Colonne ${i + 1}`}</option>)}
                </select>} />
            );
          })}
        </Lignes>
        <Coche l={p.skipLabel} checked={p.skipDupes} onChange={p.setSkipDupes} />
        {p.apercu && p.apercu.length ? (
          <div className="dz-l3-tableau" data-testid="import-apercu">
            <table>
              <thead><tr><th>Ligne</th><th>Nom du client</th><th>Ville</th><th>Résultat</th></tr></thead>
              <tbody>{p.apercu.map((a) => (
                <tr key={a.ligne}><td data-mono="oui">{a.ligne}</td><td style={a.nom ? undefined : { color: 'var(--dz-erreur-texte)' }}>{a.nom || '—'}</td><td>{a.ville}</td>
                  <td><span className="dz-l3-badge" data-ton={ETAT[a.etat][1]}>{a.etat === 'deja' ? `${ETAT.deja[0]} · ${p.skipDupes ? 'IGNORÉ' : 'IMPORTÉ'}` : ETAT[a.etat][0]}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        <P data-testid="import-recap">{p.recap}</P>
        {p.manquants > 0 ? <Alerte ton="attention" titre={`${p.manquants} ligne${p.manquants > 1 ? 's' : ''} ne ser${p.manquants > 1 ? 'ont' : 'a'} pas importée${p.manquants > 1 ? 's' : ''}`}>Il manque une donnée obligatoire. Les autres lignes sont prêtes.</Alerte> : null}
        {p.avertissement ? <Alerte ton="attention">{p.avertissement}</Alerte> : null}
      </>) : null}

      {p.step === 'sending' && p.progress ? (
        <div className="dz-l3-bloc" aria-live="polite">
          <P>Envoi des invitations…</P>
          <div className="dz-l3-jauge"><div><span>Invitations</span><span>{p.progress.done} / {p.progress.total}</span></div>
            <div className="dz-l3-jauge__barre"><i style={{ width: `${p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : 0}%` }} /></div></div>
        </div>
      ) : null}

      {p.step === 'done' && p.resultat ? (<>
        <Vide t="Import terminé" s={p.resultat.titre} testId="import-fini" />
        {p.resultat.echecs && p.resultat.echecs.length ? (
          <Lignes titre="Échecs">{p.resultat.echecs.map((f, i) => <Ligne key={i} t={f.email} pourquoi={f.reason} />)}</Lignes>
        ) : null}
      </>) : null}
    </Coque>
  );
}
