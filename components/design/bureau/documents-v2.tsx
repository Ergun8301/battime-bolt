'use client';

// Design bureau · lot 3 A · « Documents du chantier » (CL10 à CL13). Panneau 760 px, onglets Photos / Fichiers, pièces rangées par jour,
// « Envoyer au client » en fenêtre, refus d'un fichier trop lourd dans le panneau. Lecture, envoi, suppression, catégorie, e-mail du client :
// components/chantier-documents.tsx (inchangés) ; la fenêtre « Catégorie du document » (annulation 20 s, avertissements) est reprise telle quelle.
import { useRef, useState, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Alerte, Btn, Champ, Coque, Etiquette, Kv, Lignes, Ligne, Onglets, P, Squelettes, Vide } from './lot3a-ui';

export interface DocV2 {
  id: string; nom: string; url?: string; photo: boolean; qui: string; quand: string; jour: string | null; ici: boolean; categorie: string | null; taille: number | null;
  /** Bouton « catégorie » d'avant (ou null quand la personne ne peut pas la changer). */
  cat: ReactNode;
}
export interface DocumentsV2Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chantier?: string;
  tab: 'photos' | 'files';
  setTab: (t: 'photos' | 'files') => void;
  nPhotos: number;
  nFichiers: number;
  chargement: boolean;
  groupes: [string, DocV2[]][];
  rattache: ReactNode;
  uploading: boolean;
  refus: string | null;
  onPick: (f: File | undefined) => void;
  supprimer: (id: string) => void;
  // Envoyer au client
  nDocs: number;
  clientEmail: string | null;
  editingEmail: boolean;
  setEditingEmail: (v: boolean) => void;
  emailInput: string;
  setEmailInput: (v: string) => void;
  savingEmail: boolean;
  saveClientEmail: () => void;
  sending: boolean;
  openMail: () => void;
  copyMessage: () => void;
  /** La fenêtre « Catégorie du document » d'avant (montée ici pour rester au-dessus du panneau). */
  feuilleCategorie: ReactNode;
}

const titreJour = (iso: string | null) => (iso ? format(parseISO(iso), 'EEEE d MMMM yyyy', { locale: fr }).toUpperCase() : 'PIÈCES DU CHANTIER (SANS JOUR)');
const ko = (n: number | null) => (n == null ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

export default function DocumentsV2(p: DocumentsV2Props) {
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  return (
    <>
      <Coque open={p.open} onOpenChange={p.onOpenChange} forme="panneau" largeur={760} kicker="Documents du chantier" titre={p.chantier || 'Documents'} testId="documents-v2"
        onglets={<Onglets nom="Documents" valeur={p.tab} onChange={p.setTab} options={[{ v: 'photos', l: `Photos (${p.nPhotos})`, testId: 'doc-tab-photos' }, { v: 'files', l: `Fichiers (${p.nFichiers})`, testId: 'doc-tab-files' }]} />}
        pied={<>
          <Btn pousse onClick={() => setEnvoi(true)} data-testid="doc-envoyer" data-guide="bureau-docs.envoyer-client">Envoyer au client</Btn>
          <Btn onClick={() => fileRef.current?.click()} disabled={p.uploading}>+ Fichier</Btn>
          <Btn ton="principal" onClick={() => photoRef.current?.click()} disabled={p.uploading} busy={p.uploading} data-guide="docs.photo">+ Photo</Btn>
        </>}>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => p.onPick(e.target.files?.[0])} data-testid="doc-photo-input" />
        <input ref={fileRef} type="file" hidden onChange={(e) => p.onPick(e.target.files?.[0])} data-testid="doc-file-input" />
        {p.refus ? <Alerte ton="erreur" titre="Fichier refusé" testId="doc-refus">{p.refus}</Alerte> : null}
        <P ton="doux">{p.rattache} 15 Mo au plus par pièce ; une photo est nommée automatiquement, un fichier garde son nom.</P>
        {p.chargement ? <Squelettes n={3} />
          : p.groupes.length === 0 ? <Vide t={p.tab === 'photos' ? 'Aucune photo pour ce chantier.' : 'Aucun fichier pour ce chantier.'}
            s={p.tab === 'photos' ? '« + Photo » ouvre directement l’appareil.' : 'Devis, plan, PV de réception… : « + Fichier ».'} testId="doc-vide" />
          : p.groupes.map(([jour, items]) => (
            <div key={jour || 'sans-jour'} className="dz-l3-bloc">
              <Etiquette>{titreJour(jour || null)}</Etiquette>
              {p.tab === 'photos' ? (
                <div className="dz-l3-photos">
                  {items.map((d) => (
                    <div key={d.id} className="dz-l3-photo" data-testid="doc-photo">
                      <a className="dz-l3-photo__img" href={d.url} target="_blank" rel="noopener noreferrer" title={`Ouvrir ${d.nom}`}>
                        {d.url ? <img src={d.url} alt="" /> : 'PDF'}
                        {d.ici ? <span className="dz-l3-photo__tag">ICI</span> : null}
                      </a>
                      <b title={d.nom}>{d.nom}</b>
                      <small>{[d.qui, d.quand].filter(Boolean).join(' · ')}</small>
                      <span className="dz-l3-btns">{d.cat}<Btn taille="ligne" ton="danger-contour" onClick={() => p.supprimer(d.id)} aria-label={`Supprimer ${d.nom}`}>Supprimer</Btn></span>
                    </div>
                  ))}
                </div>
              ) : (
                <Lignes>
                  {items.map((d) => (
                    <div key={d.id} data-testid="doc-fichier">
                      <Ligne t={d.nom} s={<>{[d.ici ? 'cette intervention' : '', d.qui, d.quand, ko(d.taille)].filter(Boolean).join(' · ')}{d.cat ? <span style={{ display: 'block', marginTop: 4 }}>{d.cat}</span> : null}</>}
                        actions={<>
                          {d.url ? <a className="dz-l3-btn" data-taille="ligne" href={d.url} target="_blank" rel="noopener noreferrer">Ouvrir</a> : null}
                          <Btn taille="ligne" ton="danger-contour" onClick={() => p.supprimer(d.id)} aria-label={`Supprimer ${d.nom}`}>Supprimer</Btn>
                        </>} />
                    </div>
                  ))}
                </Lignes>
              )}
            </div>
          ))}
        {p.feuilleCategorie}
      </Coque>

      {/* CL12 : « Envoyer au client » (mêmes gestes : e-mail du client enregistré, message prêt dans la messagerie, ou copié). */}
      <Coque open={envoi && p.open} onOpenChange={setEnvoi} forme="fenetre" largeur={540} titre="Envoyer au client" testId="doc-envoi"
        pied={<><Btn onClick={p.copyMessage} disabled={p.sending || p.nDocs === 0}>Copier</Btn>
          <Btn ton="principal" onClick={p.openMail} disabled={p.sending || !p.clientEmail || p.nDocs === 0} busy={p.sending} data-guide="docs.envoyer">Ouvrir l’e-mail</Btn></>}>
        {p.clientEmail && !p.editingEmail ? (
          <Kv lignes={[['Adresse', <span key="a">{p.clientEmail} <button type="button" className="dz-l3-lien" onClick={() => { p.setEmailInput(p.clientEmail || ''); p.setEditingEmail(true); }}>modifier</button></span>]]} />
        ) : (
          <div className="dz-l3-bloc">
            <Champ nom="Adresse" type="email" inputMode="email" placeholder="E-mail du client" value={p.emailInput} onChange={(e) => p.setEmailInput(e.target.value)} guide="bureau-docs.email" />
            <div className="dz-l3-btns"><Btn taille="ligne" ton="encre" onClick={p.saveClientEmail} disabled={p.savingEmail || !p.emailInput.trim()} busy={p.savingEmail}>Enregistrer l’adresse</Btn></div>
          </div>
        )}
        <P ton="doux">{p.nDocs === 0 ? 'Ajoutez au moins un document à envoyer.' : `Le message reprendra les ${p.nDocs} pièces du chantier, photos et fichiers. Un e-mail prêt s’ouvre dans votre messagerie ; les liens restent valables 7 jours.`}</P>
      </Coque>
    </>
  );
}
