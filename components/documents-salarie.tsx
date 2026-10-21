'use client';

// Les documents d'un salarié : fiche salarié › « Documents » (bureau) et « Mes documents » (appli salarié). Un seul composant, deux modes :
//   · « bureau » : déposer pour le salarié (il est prévenu), filtrer, ouvrir, retirer ;
//   · « salarie » : voir ses bulletins et son contrat, envoyer une photo ou un fichier au bureau, retirer ce qu'il a lui-même envoyé.
// Lectures et écritures : lib/worker-docs.ts (mêmes droits que la base). N'importe quel fichier ; la catégorie et le nom ne sont qu'un rangement.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Camera, Download, FileSignature, FileText, ImageIcon, Info, Loader2, ReceiptText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteWorkerDocument, listWorkerDocuments, uploadWorkerDocument, workerDocumentUrl, WORKER_DOC_CATEGORIES, WORKER_DOC_MAX_BYTES,
  type WorkerDoc, type WorkerDocCategory,
} from '@/lib/worker-docs';
import './documents-salarie.css';

const ko = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);
const typeCourt = (d: WorkerDoc) => (d.mime?.startsWith('image/') ? (d.mime.split('/')[1] || 'image').toUpperCase().replace('JPEG', 'JPG') : d.mime === 'application/pdf' ? 'PDF' : (d.path.split('.').pop() || '').toUpperCase());

/** L'icône d'un document : une photo se voit comme une photo, sinon l'icône de sa catégorie. */
function Icone({ d }: { d: WorkerDoc }) {
  const image = d.mime?.startsWith('image/');
  const k = image ? 'image' : d.category;
  const I = image ? ImageIcon : d.category === 'bulletin' ? ReceiptText : d.category === 'contrat' ? FileSignature : FileText;
  return <span className="ds-ico" data-k={k} aria-hidden="true"><I className="h-[22px] w-[22px]" strokeWidth={2} /></span>;
}

export default function DocumentsSalarie({ mode, companyId, userId, prenom, meId }: {
  mode: 'bureau' | 'salarie';
  companyId: string;
  /** Le salarié dont on voit les documents (soi-même en mode salarié). */
  userId: string;
  prenom: string;
  /** La personne connectée (dépose, et ne retire en mode salarié que ce qu'elle a déposé). */
  meId: string;
}) {
  const [docs, setDocs] = useState<WorkerDoc[] | null>(null);
  const [dispo, setDispo] = useState(true);
  const [filtre, setFiltre] = useState<WorkerDocCategory | 'tous'>('tous');
  const [cat, setCat] = useState<WorkerDocCategory>(mode === 'bureau' ? 'bulletin' : 'autre');
  const [nom, setNom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [ouvre, setOuvre] = useState<string | null>(null);
  const [aRetirer, setARetirer] = useState<WorkerDoc | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    const r = await listWorkerDocuments(userId);
    setDispo(r.available); setDocs(r.docs);
  }, [userId]);
  useEffect(() => { void charger(); }, [charger]);

  const compte = useMemo(() => {
    const m: Record<string, number> = { tous: docs?.length || 0, bulletin: 0, contrat: 0, autre: 0 };
    for (const d of docs || []) m[d.category] = (m[d.category] || 0) + 1;
    return m;
  }, [docs]);
  const visibles = (docs || []).filter((d) => filtre === 'tous' || d.category === filtre);

  const deposer = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > WORKER_DOC_MAX_BYTES) { toast.error('Fichier trop lourd (15 Mo max).'); return; }
    setEnvoi(true);
    try {
      await uploadWorkerDocument({ companyId, userId, uploadedBy: meId, file: f, category: cat, label: nom });
      toast.success(mode === 'bureau' ? `Document ajouté : ${prenom} est prévenu` : 'Document envoyé au bureau');
      setNom('');
      await charger();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Envoi impossible');
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = '';
      if (photo.current) photo.current.value = '';
    }
  };
  const ouvrir = async (d: WorkerDoc) => {
    setOuvre(d.id);
    try { window.open(await workerDocumentUrl(d, true), '_blank', 'noopener'); }
    catch { toast.error('Impossible d’ouvrir ce document'); }
    finally { setOuvre(null); }
  };
  const retirer = async (d: WorkerDoc) => {
    try {
      if (await deleteWorkerDocument(d)) { toast.success('Document retiré'); await charger(); }
      else toast.error('Vous ne pouvez retirer que les documents que vous avez ajoutés.');
    } catch (e) { toast.error((e as { message?: string })?.message || 'Retrait impossible'); }
    finally { setARetirer(null); }
  };
  const peutRetirer = (d: WorkerDoc) => mode === 'bureau' || d.uploaded_by === meId;
  const qui = (d: WorkerDoc) => (d.uploaded_by === d.user_id ? (mode === 'salarie' ? 'envoyé par vous' : `déposé par ${prenom}`) : (mode === 'salarie' ? 'ajouté par le bureau' : 'déposé par le bureau'));

  if (!dispo) {
    return <div className="ds" data-mode={mode} data-testid="docs-salarie"><p className="ds-aide"><Info className="h-4 w-4" aria-hidden /> Les documents arrivent bientôt : la mise à jour de la base est en attente.</p></div>;
  }

  return (
    <div className="ds" data-mode={mode} data-testid="docs-salarie">
      <div className="ds-depot">
        <div className="ds-depot__choix" role="group" aria-label="Type de document">
          {WORKER_DOC_CATEGORIES.map((c) => (
            <button key={c.k} type="button" className="ds-puce" aria-pressed={cat === c.k} onClick={() => setCat(c.k)}>{c.label}</button>
          ))}
        </div>
        <label className="ds-depot__nom">
          <span>Nom (facultatif)</span>
          <input type="text" value={nom} maxLength={200} onChange={(e) => setNom(e.target.value)} placeholder={cat === 'bulletin' ? 'Ex : Bulletin septembre 2026' : cat === 'contrat' ? 'Ex : Contrat CDI' : 'Ex : Arrêt maladie'} />
        </label>
        <div className="ds-depot__boutons">
          <button type="button" className="ds-depot__btn" disabled={envoi} onClick={() => champ.current?.click()} data-testid="docs-ajouter">
            {envoi ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
            {mode === 'bureau' ? 'Ajouter un document' : 'Envoyer un fichier'}
          </button>
          {mode === 'salarie' ? (
            <button type="button" className="ds-depot__btn" data-ton="photo" disabled={envoi} onClick={() => photo.current?.click()} data-testid="docs-photo">
              <Camera className="h-5 w-5" aria-hidden /> Prendre une photo
            </button>
          ) : null}
        </div>
        <span className="ds-depot__s">PDF, photo ou tout autre fichier · 15 Mo max.{mode === 'bureau' ? ` ${prenom} le retrouve dans son appli.` : ' Le bureau le reçoit tout de suite.'}</span>
        <input ref={champ} type="file" hidden onChange={(e) => deposer(e.target.files?.[0])} data-testid="docs-fichier" />
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => deposer(e.target.files?.[0])} />
      </div>

      {docs && docs.length > 0 ? (
        <div className="ds-filtres" role="group" aria-label="Filtrer">
          <button type="button" className="ds-puce" data-sombre="" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous · {compte.tous}</button>
          {WORKER_DOC_CATEGORIES.map((c) => compte[c.k] ? (
            <button key={c.k} type="button" className="ds-puce" data-sombre="" aria-pressed={filtre === c.k} onClick={() => setFiltre(c.k)}>{c.pluriel} · {compte[c.k]}</button>
          ) : null)}
        </div>
      ) : null}

      {docs === null ? <div className="ds-squelette" aria-hidden /> : docs.length === 0 ? (
        <p className="ds-vide" data-testid="docs-vide">{mode === 'bureau' ? `Aucun document pour ${prenom}. Ajoutez un bulletin, un contrat ou tout autre fichier.` : 'Aucun document pour l’instant. Vos bulletins et votre contrat apparaîtront ici.'}</p>
      ) : (
        <ul className="ds-liste" data-testid="docs-liste">
          {visibles.map((d) => (
            <li key={d.id} className="ds-doc">
              <Icone d={d} />
              <span className="ds-doc__txt">
                <span className="ds-doc__t">{d.label}</span>
                <span className="ds-doc__s">{[typeCourt(d), ko(d.size_bytes), `${qui(d)} le ${format(parseISO(d.created_at), 'dd/MM', { locale: fr })}`].filter(Boolean).join(' · ')}</span>
              </span>
              <button type="button" className="ds-rond" aria-label={`Ouvrir ${d.label}`} title="Ouvrir / télécharger" onClick={() => ouvrir(d)} disabled={ouvre === d.id}>
                {ouvre === d.id ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : <Download className="h-[18px] w-[18px]" aria-hidden />}
              </button>
              {peutRetirer(d) ? (
                <button type="button" className="ds-rond" data-ton="danger" aria-label={`Retirer ${d.label}`} title="Retirer" onClick={() => setARetirer(d)}>
                  <Trash2 className="h-[18px] w-[18px]" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {aRetirer ? (
        <div className="ds-confirme" role="alertdialog" aria-label="Retirer le document" data-testid="docs-confirme">
          <span>Retirer « {aRetirer.label} » ?{mode === 'bureau' ? ` ${prenom} ne le verra plus.` : ''}</span>
          <div>
            <button type="button" className="ds-depot__btn" data-ton="clair" onClick={() => setARetirer(null)}>Annuler</button>
            <button type="button" className="ds-depot__btn" data-ton="danger" onClick={() => retirer(aRetirer)} data-testid="docs-retirer-ok">Retirer</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
