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
      <style dangerouslySetInnerHTML={RLF_CSS_HTML} />
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
        <button type="button" className="bt-rlf-go" onClick={submit} disabled={busy} data-testid="reserve-lift-submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden>✓</span>} Lever la réserve
        </button>
        <button type="button" className="bt-rlf-no" onClick={onCancel} disabled={busy}>Annuler</button>
      </div>
    </div>
  );
}

const RLF_CSS = `
.bt-rlf{margin-top:9px;padding:10px 11px;background:#FBFAF7;border:1px solid rgba(21,18,15,.12);border-radius:11px;max-width:100%;min-width:0;box-sizing:border-box;cursor:default;text-align:left}
.bt-rlf *{box-sizing:border-box}
.bt-rlf-l{display:block;font-size:12px;font-weight:800;color:#3a352f;margin:0 0 5px}
.bt-rlf-ta{display:block;width:100%;max-width:100%;min-height:54px;resize:vertical;border:1.5px solid rgba(21,18,15,.18);border-radius:9px;background:#fff;padding:8px 10px;font-family:inherit;font-size:16px;line-height:1.35;color:#15120F;outline:none}
.bt-rlf-ta:focus{border-color:#15120F}
.bt-rlf-photo{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px;min-width:0}
.bt-rlf-pbtn{display:inline-flex;align-items:center;gap:6px;border:1.5px dashed rgba(21,18,15,.3);background:#fff;color:#15120F;border-radius:9px;padding:8px 12px;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;max-width:100%}
.bt-rlf-thumb{position:relative;width:86px;height:86px;border-radius:10px;overflow:hidden;border:1px solid rgba(21,18,15,.15);background:#ECE6D9;flex:none}
.bt-rlf-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.bt-rlf-x{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(21,18,15,.78);color:#fff;font-size:13px;font-weight:900;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.bt-rlf-bad{font-size:12px;font-weight:700;color:#C0461F}
.bt-rlf-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.bt-rlf-go{flex:1 1 160px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;background:#15120F;color:#F2EDE3;border-radius:10px;padding:10px 14px;font-family:inherit;font-size:14px;font-weight:900;cursor:pointer;min-height:42px}
.bt-rlf-no{flex:0 1 auto;border:1.5px solid rgba(21,18,15,.18);background:#fff;color:#15120F;border-radius:10px;padding:10px 14px;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;min-height:42px}
.bt-rlf button:disabled{opacity:.55;cursor:default}
`;
// Objet FIXE (règle du lot 10) : un `{ __html }` neuf à chaque rendu ferait
// réécrire la feuille de style par React.
const RLF_CSS_HTML = { __html: RLF_CSS };
