'use client';

// Assistant d'import de clients / chantiers (table worksites) depuis un fichier
// CSV ou Excel (.xlsx). On réutilise la lib `xlsx` (SheetJS) déjà présente pour
// l'export — aucune dépendance ajoutée, et elle lit le CSV (y compris ';' des
// Excel français) comme le .xlsx. Purement additif : insertion `worksites`
// identique à celle du formulaire « Nouveau client », scopée à l'entreprise par
// la RLS. Prévu pour resservir aux salariés plus tard (avec Resend).

import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UploadCloud, FileSpreadsheet, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  existingNames?: string[]; // noms de clients déjà en base (pour la déduplication)
  onImported?: () => void;
}

type FieldKey = 'client_name' | 'city' | 'postal_code' | 'product_type' | 'client_phone' | 'client_email' | 'address' | 'description';
const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'client_name', label: 'Nom du client', required: true },
  { key: 'city', label: 'Ville' },
  { key: 'postal_code', label: 'Code postal' },
  { key: 'product_type', label: 'Type de produit' },
  { key: 'client_phone', label: 'Téléphone' },
  { key: 'client_email', label: 'Email' },
  { key: 'address', label: 'Adresse' },
  { key: 'description', label: 'Description' },
];

// Synonymes d'en-têtes → détection automatique de la correspondance.
const SYN: Record<FieldKey, string[]> = {
  client_name: ['nom du client', 'nom', 'client', 'raison sociale', 'societe', 'name', 'chantier'],
  city: ['ville', 'commune', 'city'],
  postal_code: ['code postal', 'cp', 'postal', 'zip'],
  product_type: ['type de produit', 'type', 'produit', 'prestation'],
  client_phone: ['telephone', 'tel', 'phone', 'portable', 'mobile', 'gsm'],
  client_email: ['email', 'mail', 'e mail', 'courriel'],
  address: ['adresse', 'address', 'rue', 'voie'],
  description: ['description', 'notes', 'note', 'commentaire', 'remarque', 'observation'],
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
// délimiteur ; , ou tabulation, BOM, CRLF. Tout reste en TEXTE → aucun zéro
// initial perdu sur les téléphones / codes postaux (contrairement à une lecture
// "nombre" qui transforme 0612… en 612…).
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

const IMP_CSS = `
.bt-imp-drop{border:2px dashed rgba(21,18,15,.28);border-radius:16px;padding:34px 20px;text-align:center;cursor:pointer;transition:border-color .15s ease,background .15s ease;background:#FBF8F2}
.bt-imp-drop.on{border-color:#FFC21A;background:#FCF3DC}
.bt-imp-drop-ic{width:46px;height:46px;border-radius:12px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
.bt-imp-drop-t{font-size:15px;font-weight:800;color:#15120F}
.bt-imp-drop-s{font-family:'JetBrains Mono',monospace;font-size:12px;color:#8a8378;font-weight:600;margin-top:6px}
.bt-imp-row{display:grid;grid-template-columns:130px 1fr;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(21,18,15,.07)}
.bt-imp-flabel{font-size:13px;font-weight:800;color:#15120F}
.bt-imp-flabel .req{color:#B5472E;margin-left:2px}
.bt-imp-sample{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8378;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-imp-recap{background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:12px;padding:11px 13px;font-size:13px;font-weight:600;color:#3a352f;margin-top:14px}
.bt-imp-recap b{color:#15120F;font-weight:800}
.bt-imp-dupe{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;font-weight:600;color:#3a352f;cursor:pointer}
.bt-imp-done{text-align:center;padding:14px 0}
.bt-imp-done-ic{width:56px;height:56px;border-radius:50%;background:#E4F2E9;color:#1F7A4D;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
`;

export default function ImportDialog({ open, onOpenChange, companyId, existingNames = [], onImported }: Props) {
  const [step, setStep] = useState<'file' | 'map' | 'done'>('file');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [skipDupes, setSkipDupes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('file'); setFileName(''); setHeaders([]); setRows([]);
    setMapping({} as Record<FieldKey, number>); setResult(null); setBusy(false); setDrag(false);
  };

  const parseFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Fichier trop lourd (8 Mo max).'); return; }
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      let hdr: string[]; let data: string[][];
      if (isCsv) {
        // CSV : lecture texte (encodage géré) + parseur qui garde tout en texte.
        const grid = parseCSV(await readText(file)).filter((r) => r.some((c) => (c || '').trim() !== ''));
        if (!grid.length) { toast.error('Le fichier semble vide.'); return; }
        hdr = grid[0].map((h) => String(h ?? '').trim());
        data = grid.slice(1).map((r) => hdr.map((_, i) => String(r[i] ?? '').trim()));
      } else {
        // Excel (.xlsx/.xls) : SheetJS, chargé À LA DEMANDE (hors du bundle admin initial).
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
    const nameCol = mapping.client_name;
    const seen = new Set(existingNames.map((n) => n.toLowerCase()));
    const inFile = new Set<string>();
    const valid: Record<string, string>[] = [];
    let empty = 0, dupes = 0;
    if (nameCol == null || nameCol < 0) return { valid, empty: rows.length, dupes };
    for (const r of rows) {
      const name = (r[nameCol] || '').trim();
      if (!name) { empty++; continue; }
      const key = name.toLowerCase();
      const isDupe = seen.has(key) || inFile.has(key);
      inFile.add(key);
      if (isDupe) { dupes++; if (skipDupes) continue; }
      const obj: Record<string, string> = {};
      for (const f of FIELDS) { const c = mapping[f.key]; obj[f.key] = c != null && c >= 0 ? (r[c] || '').trim() : ''; }
      valid.push(obj);
    }
    return { valid, empty, dupes };
  }, [rows, mapping, skipDupes, existingNames]);

  const doImport = async () => {
    if (!companyId) { toast.error('Session invalide.'); return; }
    if (mapping.client_name == null || mapping.client_name < 0) { toast.error('Choisissez la colonne « Nom du client ».'); return; }
    if (!prepared.valid.length) { toast.error('Aucune ligne à importer.'); return; }
    setBusy(true);
    try {
      const payload = prepared.valid.map((o) => ({
        company_id: companyId,
        client_name: o.client_name,
        city: o.city || '', // NOT NULL en base → chaîne vide par défaut
        postal_code: o.postal_code || null,
        product_type: o.product_type || null,
        client_phone: o.client_phone || null,
        client_email: o.client_email || null,
        address: o.address || null,
        description: o.description || null,
        is_active: true,
      }));
      let imported = 0;
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200);
        const { error } = await supabase.from('worksites').insert(chunk);
        if (error) throw error;
        imported += chunk.length;
      }
      setResult({ imported, skipped: prepared.empty + prepared.dupes });
      setStep('done');
      onImported?.();
    } catch (e) {
      toast.error((e as Error)?.message || "L'import a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="bt-skin max-w-xl max-h-[88vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: IMP_CSS }} />
        <DialogHeader><DialogTitle>Importer des clients / chantiers</DialogTitle></DialogHeader>

        {/* ÉTAPE 1 — fichier */}
        {step === 'file' && (
          <div className="pt-1">
            <div
              className={`bt-imp-drop${drag ? ' on' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); parseFile(e.dataTransfer.files?.[0]); }}
            >
              <div className="bt-imp-drop-ic"><UploadCloud className="h-5 w-5" /></div>
              <div className="bt-imp-drop-t">Glissez votre fichier ici, ou cliquez pour choisir</div>
              <div className="bt-imp-drop-s">CSV ou Excel (.xlsx) · 8 Mo max</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
              onChange={(e) => parseFile(e.target.files?.[0])} />
            <p className="text-xs text-muted-foreground mt-3">
              Une ligne = un client. La première ligne doit contenir les <strong>titres de colonnes</strong> (Nom, Ville, Téléphone…). On vous demandera de confirmer la correspondance avant d&apos;importer.
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
                  <div key={f.key} className="bt-imp-row">
                    <div>
                      <span className="bt-imp-flabel">{f.label}{f.required && <span className="req">*</span>}</span>
                      {sample && <div className="bt-imp-sample">ex. {sample}</div>}
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

            <label className="bt-imp-dupe">
              <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
              Ignorer les clients déjà présents (même nom)
            </label>

            <div className="bt-imp-recap">
              <b>{prepared.valid.length}</b> client{prepared.valid.length > 1 ? 's' : ''} à importer
              {prepared.empty > 0 && <> · {prepared.empty} sans nom (ignoré{prepared.empty > 1 ? 's' : ''})</>}
              {prepared.dupes > 0 && <> · {prepared.dupes} doublon{prepared.dupes > 1 ? 's' : ''} {skipDupes ? '(ignoré' + (prepared.dupes > 1 ? 's' : '') + ')' : '(importé' + (prepared.dupes > 1 ? 's' : '') + ')'}</>}
            </div>

            <div className="flex gap-2 pt-3">
              <Button variant="outline" onClick={() => { reset(); }} disabled={busy}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Changer de fichier
              </Button>
              <Button className="flex-1 font-bold" onClick={doImport} disabled={busy || !prepared.valid.length}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Importer {prepared.valid.length} client{prepared.valid.length > 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 — résultat */}
        {step === 'done' && result && (
          <div className="bt-imp-done">
            <div className="bt-imp-done-ic"><CheckCircle2 className="h-7 w-7" /></div>
            <p className="text-lg font-black">Import terminé</p>
            <p className="text-sm text-muted-foreground mt-1">
              <b className="text-foreground">{result.imported}</b> client{result.imported > 1 ? 's' : ''} importé{result.imported > 1 ? 's' : ''}
              {result.skipped > 0 && <> · {result.skipped} ignoré{result.skipped > 1 ? 's' : ''}</>}
            </p>
            <Button className="mt-5 w-full font-bold" onClick={() => onOpenChange(false)}>Terminer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
