'use client';

// Lot 11 — LE formulaire « Lever la réserve », le même partout : registre du
// bureau, carte de la journée du salarié, bandeau « réserves à lever ».
//
//   Commentaire (facultatif)   ← une ligne ou deux, jamais obligatoire
//   📷 Photo (facultatif)      ← appareil photo du téléphone, aperçu + ✕
//   [ Lever la réserve ]  [ Annuler ]
//
// Rien n'est obligatoire : « Lever la réserve » seul suffit. Le formulaire ne
// fait AUCUN appel lui-même — il rend le commentaire et la photo à l'écran qui
// l'a ouvert (voir lib/reserve-lift.ts, un seul chemin pour les deux côtés).

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
// Sa feuille de style est components/reserve-lift-form.css, importée au niveau des ROUTES qui l'affichent (app/poseur/layout.tsx, app/admin/layout.tsx) :
// un import ici ferait une feuille chargée à part avec chaque morceau différé (et alourdirait le chargeur de TOUTES les pages).

interface Props {
  /** Lève la réserve. Rejeter (throw) garde le formulaire ouvert, tel quel. */
  onSubmit: (note: string, photo: File | null) => Promise<void>;
  onCancel: () => void;
  /** Côté salarié : tutoiement dans l'exemple. */
  tu?: boolean;
}

export default function ReserveLiftForm({ onSubmit, onCancel, tu = false }: Props) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const id = useId();

  useEffect(() => () => { alive.current = false; }, []);
  // L'aperçu est une adresse locale : on la libère dès qu'elle ne sert plus.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!(f.type || '').startsWith('image/')) { setBad(true); return; }
    setBad(false);
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };
  const clear = () => {
    setPhoto(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try { await onSubmit(note, photo); } catch { /* l'écran a déjà dit pourquoi ; on garde la saisie */ } finally { if (alive.current) setBusy(false); }
  };

  return (
    <div className="bt-rlf" data-testid="reserve-lift-form" onClick={(e) => e.stopPropagation()}>
      <label className="bt-rlf-l" htmlFor={id}>Commentaire (facultatif)</label>
      <textarea
        id={id} className="bt-rlf-ta" rows={2} maxLength={500} value={note} disabled={busy}
        onChange={(e) => setNote(e.target.value)}
        placeholder={tu ? 'Ex : joint refait, vis posée' : 'Ex : joint refait, vis posée le 22/09'}
      />
      <div className="bt-rlf-photo">
        {preview ? (
          <div className="bt-rlf-thumb" data-testid="reserve-lift-preview">
            <img src={preview} alt="Photo jointe" />
            <button type="button" className="bt-rlf-x" aria-label="Retirer la photo" onClick={clear} disabled={busy}>✕</button>
          </div>
        ) : (
          <button type="button" className="bt-rlf-pbtn" onClick={() => fileRef.current?.click()} disabled={busy}>
            📷 Photo (facultatif)
          </button>
        )}
        <input
          ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          data-testid="reserve-lift-file" onChange={(e) => pick(e.target.files?.[0])}
        />
        {bad && <span className="bt-rlf-bad">Photo uniquement (JPG, PNG…).</span>}
      </div>
      <div className="bt-rlf-acts">
        <button type="button" className="bt-rlf-go" onClick={submit} disabled={busy} data-testid="reserve-lift-submit" data-guide="reserves.valider">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden>✓</span>} Lever la réserve
        </button>
        <button type="button" className="bt-rlf-no" onClick={onCancel} disabled={busy}>Annuler</button>
      </div>
    </div>
  );
}

