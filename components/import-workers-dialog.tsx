'use client';

// Assistant d'import de salariés depuis un fichier CSV ou Excel (.xlsx).
// Contrairement à l'import clients/chantiers (insert direct en base), chaque
// ligne ici déclenche un VRAI compte + un VRAI email d'invitation via la
// fonction edge `invite-worker` existante (même chemin que le formulaire
// « Nouveau salarié » un par un). Fichier volontairement autonome (parsing
// dupliqué depuis import-dialog.tsx plutôt que factorisé) pour ne pas toucher
// à l'import clients déjà en prod. Nécessite un SMTP custom (Resend) branché
// sur le projet Supabase pour tenir sur un lot de plus de quelques salariés —
// l'envoi natif Supabase est limité à quelques emails/heure.

import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UploadCloud, FileSpreadsheet, CheckCircle2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingEmails?: string[]; // emails déjà salariés ou déjà invités (dédup)
  onImported?: () => void;
}

type FieldKey = 'first_name' | 'last_name' | 'email' | 'phone';
const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'first_name', label: 'Prénom', required: true },
  { key: 'last_name', label: 'Nom', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Téléphone' },
];

const SYN: Record<FieldKey, string[]> = {
  first_name: ['prenom', 'first name', 'firstname', 'given name'],
  last_name: ['nom', 'nom de famille', 'last name', 'lastname', 'surname', 'family name'],
  email: ['email', 'mail', 'e mail', 'courriel', 'adresse email'],
  phone: ['telephone', 'tel', 'phone', 'portable', 'mobile', 'gsm'],
};

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function autoMap(headers: string[]): Record<FieldKey, number> {
  const used = new Set<number>();
  const m = {} as Record<FieldKey, number>;
  for (const f of FIELDS) {
    let found = -1;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const nh = norm(headers[i]);
      if (!nh) continue;
      if (SYN[f.key].some((s) => { const ns = norm(s); return nh === ns || nh.includes(ns); })) { found = i; break; }
    }
    m[f.key] = found;
    if (found >= 0) used.add(found);
  }
  return m;
}

// Lecture texte robuste : UTF-8 (avec BOM) sinon repli Windows-1252 (Excel FR).
async function readText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

function detectDelim(line: string): string {
  const c: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch in c) c[ch]++; }
  let best = ',', n = -1;
  for (const d of [';', ',', '\t']) if (c[d] > n) { n = c[d]; best = d; }
  return best;
}

// Parseur CSV minimal mais correct : guillemets, guillemets échappés (""),
// délimiteur ; , ou tabulation, BOM, CRLF. Tout reste en TEXTE.
function parseCSV(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const delim = detectDelim((text.split(/\r?\n/, 1)[0]) || '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') { inQ = true; }
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') { field += ch; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

type Prepared = { first_name: string; last_name: string; email: string; phone: string };
type Failure = { email: string; reason: string };

const CONCURRENCY = 3; // invitations en parallèle (ménage l'API Resend/edge function)

const IMPW_CSS = `
.bt-impw-drop{border:2px dashed rgba(21,18,15,.28);border-radius:16px;padding:34px 20px;text-align:center;cursor:pointer;transition:border-color .15s ease,background .15s ease;background:#FBF8F2}
.bt-impw-drop.on{border-color:#FFC21A;background:#FCF3DC}
.bt-impw-drop-ic{width:46px;height:46px;border-radius:12px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
.bt-impw-drop-t{font-size:15px;font-weight:800;color:#15120F}
.bt-impw-drop-s{font-family:'JetBrains Mono',monospace;font-size:12px;color:#8a8378;font-weight:600;margin-top:6px}
.bt-impw-row{display:grid;grid-template-columns:130px 1fr;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(21,18,15,.07)}
.bt-impw-flabel{font-size:13px;font-weight:800;color:#15120F}
.bt-impw-flabel .req{color:#B5472E;margin-left:2px}
.bt-impw-sample{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8378;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-impw-recap{background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:12px;padding:11px 13px;font-size:13px;font-weight:600;color:#3a352f;margin-top:14px}
.bt-impw-recap b{color:#15120F;font-weight:800}
.bt-impw-dupe{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;font-weight:600;color:#3a352f;cursor:pointer}
.bt-impw-warn{display:flex;gap:8px;align-items:flex-start;background:#FCF3DC;border:1px solid rgba(255,194,26,.4);border-radius:12px;padding:10px 12px;font-size:12.5px;font-weight:600;color:#5c4a1a;margin-top:12px}
.bt-impw-warn svg{flex:none;margin-top:1px;color:#B5472E}
.bt-impw-done{text-align:center;padding:14px 0}
.bt-impw-done-ic{width:56px;height:56px;border-radius:50%;background:#E4F2E9;color:#1F7A4D;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.bt-impw-bar{height:8px;border-radius:99px;background:rgba(21,18,15,.08);overflow:hidden;margin-top:16px}
.bt-impw-bar-fill{height:100%;background:#FFC21A;transition:width .2s ease}
.bt-impw-prog-t{text-align:center;font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;color:#3a352f;margin-top:10px}
.bt-impw-faillist{margin-top:12px;max-height:160px;overflow-y:auto;border:1px solid rgba(181,71,46,.25);border-radius:10px}
.bt-impw-failrow{padding:8px 11px;font-size:12px;border-bottom:1px solid rgba(181,71,46,.15)}
.bt-impw-failrow:last-child{border-bottom:none}
.bt-impw-failrow b{font-weight:800;color:#15120F}
.bt-impw-failrow span{display:block;color:#8a8378;margin-top:1px}
`;

export default function ImportWorkersDialog({ open, onOpenChange, existingEmails = [], onImported }: Props) {
  const [step, setStep] = useState<'file' | 'map' | 'sending' | 'done'>('file');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [skipDupes, setSkipDupes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ sent: number; skipped: number; failures: Failure[] } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('file'); setFileName(''); setHeaders([]); setRows([]);
    setMapping({} as Record<FieldKey, number>); setResult(null); setBusy(false); setDrag(false);
    setProgress({ done: 0, total: 0 });
  };

  const parseFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Fichier trop lourd (8 Mo max).'); return; }
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      let hdr: string[]; let data: string[][];
      if (isCsv) {
        const grid = parseCSV(await readText(file)).filter((r) => r.some((c) => (c || '').trim() !== ''));
        if (!grid.length) { toast.error('Le fichier semble vide.'); return; }
        hdr = grid[0].map((h) => String(h ?? '').trim());
        data = grid.slice(1).map((r) => hdr.map((_, i) => String(r[i] ?? '').trim()));
      } else {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) { toast.error('Aucune feuille trouvée dans le fichier.'); return; }
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false, raw: false });
        if (!aoa.length) { toast.error('Le fichier semble vide.'); return; }
        hdr = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim());
        data = (aoa.slice(1) as unknown[][]).map((r) => hdr.map((_, i) => String(r[i] ?? '').trim()));
      }
      if (!hdr.some(Boolean)) { toast.error('Première ligne (en-têtes) vide.'); return; }
      setFileName(file.name);
      setHeaders(hdr);
      setRows(data);
      setMapping(autoMap(hdr));
      setStep('map');
    } catch {
      toast.error('Impossible de lire ce fichier. Formats acceptés : CSV ou Excel (.xlsx).');
    }
  };

  const prepared = useMemo(() => {
    const emailCol = mapping.email, firstCol = mapping.first_name, lastCol = mapping.last_name, phoneCol = mapping.phone;
    const seen = new Set(existingEmails.map((e) => e.toLowerCase()));
    const inFile = new Set<string>();
    const valid: Prepared[] = [];
    let invalid = 0, dupes = 0;
    if (emailCol == null || emailCol < 0 || firstCol == null || firstCol < 0 || lastCol == null || lastCol < 0) {
      return { valid, invalid: rows.length, dupes };
    }
    for (const r of rows) {
      const email = (r[emailCol] || '').trim().toLowerCase();
      const first_name = (r[firstCol] || '').trim();
      const last_name = (r[lastCol] || '').trim();
      if (!email || !email.includes('@') || !first_name || !last_name) { invalid++; continue; }
      const isDupe = seen.has(email) || inFile.has(email);
      inFile.add(email);
      if (isDupe) { dupes++; if (skipDupes) continue; }
      const phone = phoneCol != null && phoneCol >= 0 ? (r[phoneCol] || '').trim() : '';
      valid.push({ first_name, last_name, email, phone });
    }
    return { valid, invalid, dupes };
  }, [rows, mapping, skipDupes, existingEmails]);

  const extractErrorMessage = async (e: unknown): Promise<string> => {
    const err = e as { context?: Response; message?: string };
    if (err?.context && typeof err.context.json === 'function') {
      try { const body = await err.context.json(); if (body?.error) return String(body.error); } catch { /* body illisible, on retombe sur message générique */ }
    }
    return err?.message || 'Échec de l’invitation';
  };

  const doImport = async () => {
    if (!prepared.valid.length) { toast.error('Aucune ligne à importer.'); return; }
    setBusy(true);
    setStep('sending');
    setProgress({ done: 0, total: prepared.valid.length });
    const failures: Failure[] = [];
    let sent = 0;
    let idx = 0;
    const list = prepared.valid;

    const worker = async () => {
      while (idx < list.length) {
        const row = list[idx++];
        try {
          const { error } = await supabase.functions.invoke('invite-worker', {
            body: { email: row.email, first_name: row.first_name, last_name: row.last_name, phone: row.phone || null },
          });
          if (error) throw error;
          sent++;
        } catch (e) {
          failures.push({ email: row.email, reason: await extractErrorMessage(e) });
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

    setResult({ sent, skipped: prepared.invalid + prepared.dupes, failures });
    setStep('done');
    onImported?.();
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="bt-skin max-w-xl max-h-[88vh] overflow-y-auto" onInteractOutside={(e) => { if (busy) e.preventDefault(); }}>
        <style dangerouslySetInnerHTML={{ __html: IMPW_CSS }} />
        <DialogHeader><DialogTitle>Importer des salariés</DialogTitle></DialogHeader>

        {/* ÉTAPE 1 — fichier */}
        {step === 'file' && (
          <div className="pt-1">
            <div
              className={`bt-impw-drop${drag ? ' on' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); parseFile(e.dataTransfer.files?.[0]); }}
            >
              <div className="bt-impw-drop-ic"><UploadCloud className="h-5 w-5" /></div>
              <div className="bt-impw-drop-t">Glissez votre fichier ici, ou cliquez pour choisir</div>
              <div className="bt-impw-drop-s">CSV ou Excel (.xlsx) · 8 Mo max</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
              onChange={(e) => parseFile(e.target.files?.[0])} />
            <p className="text-xs text-muted-foreground mt-3">
              Une ligne = un salarié. La première ligne doit contenir les <strong>titres de colonnes</strong> (Nom, Prénom, Email, Téléphone…). Chaque salarié recevra un vrai email d&apos;invitation pour créer son mot de passe.
            </p>
          </div>
        )}

        {/* ÉTAPE 2 — correspondance */}
        {step === 'map' && (
          <div className="pt-1">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0" /> <span className="truncate">{fileName}</span> · {rows.length} ligne{rows.length > 1 ? 's' : ''}
            </p>
            <p className="text-sm font-medium mb-1">Faites correspondre vos colonnes :</p>
            <div>
              {FIELDS.map((f) => {
                const col = mapping[f.key];
                const sample = col != null && col >= 0 ? (rows.find((r) => (r[col] || '').trim())?.[col] || '') : '';
                return (
                  <div key={f.key} className="bt-impw-row">
                    <div>
                      <span className="bt-impw-flabel">{f.label}{f.required && <span className="req">*</span>}</span>
                      {sample && <div className="bt-impw-sample">ex. {sample}</div>}
                    </div>
                    <Select value={String(col ?? -1)} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: parseInt(v, 10) }))}>
                      <SelectTrigger><SelectValue placeholder="— ignorer —" /></SelectTrigger>
                      <SelectContent className="bt-skin">
                        <SelectItem value="-1">— ignorer —</SelectItem>
                        {headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>{h || `Colonne ${i + 1}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            <label className="bt-impw-dupe">
              <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
              Ignorer les salariés déjà actifs ou déjà invités (même email)
            </label>

            <div className="bt-impw-recap">
              <b>{prepared.valid.length}</b> salarié{prepared.valid.length > 1 ? 's' : ''} à inviter
              {prepared.invalid > 0 && <> · {prepared.invalid} ligne{prepared.invalid > 1 ? 's' : ''} incomplète{prepared.invalid > 1 ? 's' : ''} (ignorée{prepared.invalid > 1 ? 's' : ''})</>}
              {prepared.dupes > 0 && <> · {prepared.dupes} doublon{prepared.dupes > 1 ? 's' : ''} {skipDupes ? '(ignoré' + (prepared.dupes > 1 ? 's' : '') + ')' : '(tenté' + (prepared.dupes > 1 ? 's' : '') + ')'}</>}
            </div>

            <div className="bt-impw-warn">
              <AlertTriangle className="h-4 w-4" />
              <span>Chaque ligne envoie un email réel. Vérifie le mapping avant de lancer l&apos;import — {prepared.valid.length > 1 ? 'ça ne se rattrape pas en un clic une fois parti' : "l'invitation part dès que tu cliques"}.</span>
            </div>

            <div className="flex gap-2 pt-3">
              <Button variant="outline" onClick={() => { reset(); }} disabled={busy}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Changer de fichier
              </Button>
              <Button className="flex-1 font-bold" onClick={doImport} disabled={busy || !prepared.valid.length}>
                Inviter {prepared.valid.length} salarié{prepared.valid.length > 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 — envoi en cours */}
        {step === 'sending' && (
          <div className="py-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm font-semibold mt-3">Envoi des invitations…</p>
            <div className="bt-impw-bar">
              <div className="bt-impw-bar-fill" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
            <div className="bt-impw-prog-t">{progress.done} / {progress.total}</div>
          </div>
        )}

        {/* ÉTAPE 4 — résultat */}
        {step === 'done' && result && (
          <div className="bt-impw-done">
            <div className="bt-impw-done-ic"><CheckCircle2 className="h-7 w-7" /></div>
            <p className="text-lg font-black">Import terminé</p>
            <p className="text-sm text-muted-foreground mt-1">
              <b className="text-foreground">{result.sent}</b> invitation{result.sent > 1 ? 's' : ''} envoyée{result.sent > 1 ? 's' : ''}
              {result.skipped > 0 && <> · {result.skipped} ignorée{result.skipped > 1 ? 's' : ''}</>}
              {result.failures.length > 0 && <> · {result.failures.length} échec{result.failures.length > 1 ? 's' : ''}</>}
            </p>
            {result.failures.length > 0 && (
              <div className="bt-impw-faillist text-left">
                {result.failures.map((f, i) => (
                  <div key={i} className="bt-impw-failrow">
                    <b>{f.email}</b>
                    <span>{f.reason}</span>
                  </div>
                ))}
              </div>
            )}
            <Button className="mt-5 w-full font-bold" onClick={() => onOpenChange(false)}>Terminer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
