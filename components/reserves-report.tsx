'use client';

// Registre des réserves (Étape 11).
//
// Le salarié déclare déjà, sur son intervention, une réception « avec réserve ».
// Jusqu'ici cette information vivait une journée : passé le lendemain, il fallait
// rouvrir la bonne case du bon jour pour la retrouver. Une réserve de trois
// semaines n'existait plus pour personne.
//
// Ici, elles sont toutes réunies, groupées par chantier, et elles se LÈVENT :
// le bureau écrit ce qui a été fait, et la réserve passe dans « Levées ». Rien
// n'est effacé — on garde la date de déclaration d'origine et l'auteur.
//
// CE QUI N'EST PAS AFFICHÉ, ET POURQUOI :
//   - les brouillons : le salarié n'a pas encore envoyé sa journée, ce n'est pas
//     une réserve pour le bureau ;
//   - les interventions RETIRÉES ('cancelled') : l'intervention n'existe plus,
//     courir après sa réserve serait courir après rien.
// Même règle que partout ailleurs — voir lib/status.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle, CheckCircle2, Building2, FileText, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { COUNTED_STATUSES } from '@/lib/status';
import { fetchAllPaged } from '@/lib/fetch-all';
import { toast } from 'sonner';

export interface ReserveRow {
  id: string;
  work_date: string;
  observation: string | null;
  worksite_id: string | null;
  worksite_name: string;
  worksite_city: string | null;
  worker: string;
  resolved_at: string | null;
  resolution: string | null;
  resolved_by_name: string | null;
  /** Le salarié a déclaré avoir corrigé. N'a PAS levé la réserve. */
  fixed_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  /** Ouvre le module Documents du chantier (photos de la réserve). */
  onOpenDocs?: (worksiteId: string, worksiteName: string) => void;
  /** Prévient le planning que le nombre de réserves ouvertes a changé. */
  onChanged?: () => void;
}

const RR_CSS = `
.bt-rr-tabs{display:flex;gap:7px;padding-top:2px}
.bt-rr-tab{flex:1;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:11px;padding:9px 10px;font-family:inherit;font-weight:800;font-size:13px;color:#6E6A63;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px}
.bt-rr-tab.on{background:#15120F;border-color:#15120F;color:#F2EDE3}
.bt-rr-tabn{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:800;background:rgba(21,18,15,.08);border-radius:99px;padding:1px 7px}
.bt-rr-tab.on .bt-rr-tabn{background:rgba(255,194,26,.9);color:#15120F}
.bt-rr-site{margin-top:12px}
.bt-rr-sitehead{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.bt-rr-sitename{font-weight:900;font-size:14px;letter-spacing:-.01em;color:#15120F;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-rr-sitecity{font-family:'JetBrains Mono',monospace;font-size:11px;color:#9a948a;font-weight:600;flex:none}
.bt-rr-docs{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:800;color:#a87c1e;text-decoration:underline}
.bt-rr-card{background:#fff;border:1px solid rgba(21,18,15,.1);border-left:3px solid #C0461F;border-radius:12px;padding:11px 13px;margin-bottom:7px}
.bt-rr-card.done{border-left-color:#1F7A4D;background:#FBFAF7}
.bt-rr-card.fixed{border-left-color:#1F7A4D}
.bt-rr-fixed{margin-top:6px;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;color:#1F7A4D;background:#EAF6EF;border:1px solid #BBE0CC;border-radius:7px;padding:3px 9px}
.bt-rr-meta{display:flex;align-items:baseline;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#8a8378}
.bt-rr-date{color:#15120F}
.bt-rr-obs{font-size:13.5px;color:#15120F;font-weight:600;margin-top:5px;line-height:1.45;white-space:pre-wrap}
.bt-rr-noobs{font-size:13px;color:#9a948a;font-weight:600;font-style:italic;margin-top:5px}
.bt-rr-done{margin-top:7px;padding-top:7px;border-top:1px solid rgba(21,18,15,.08);font-size:12.5px;color:#1F7A4D;font-weight:700;display:flex;align-items:flex-start;gap:6px}
.bt-rr-donetxt{color:#3a352f;font-weight:600}
.bt-rr-acts{display:flex;gap:7px;margin-top:9px}
.bt-rr-empty{text-align:center;color:#9a948a;font-weight:600;padding:30px 10px;font-size:13.5px;line-height:1.5}
`;

type Tab = 'open' | 'done';

/** PostgREST renvoie l'imbrication tantôt en objet, tantôt en tableau d'un élément. */
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

const fullName = (u?: { first_name?: string | null; last_name?: string | null } | null) =>
  `${u?.first_name || ''} ${u?.last_name || ''}`.trim();

export default function ReservesReport({ open, onOpenChange, companyId, onOpenDocs, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('open');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReserveRow[]>([]);
  // Réserve en cours de levée : l'identifiant de la ligne, et le compte rendu.
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    // Lecture PAGINÉE. Le registre couvre toute la vie de l'entreprise, pas une
    // période : une requête simple s'arrêterait au plafond PostgREST (1000
    // lignes par défaut) SANS erreur. Les réserves les plus anciennes
    // disparaîtraient en silence, et la pastille compterait une réserve
    // introuvable dans la liste. `id` départage les ex æquo de date, sinon deux
    // pages peuvent se recouvrir ou sauter une ligne.
    let raw: Record<string, unknown>[];
    try {
      raw = await fetchAllPaged<Record<string, unknown>>((f, t) => supabase
        .from('time_entries')
        .select('id, work_date, observation, worksite_id, reserve_resolved_at, reserve_resolved_by, reserve_resolution, reserve_fixed_at, '
          + 'worksite:worksites(client_name, city), '
          + 'owner:users!time_entries_user_id_fkey(first_name, last_name)')
        .eq('company_id', companyId)
        .eq('reception', 'avec')
        .in('status', COUNTED_STATUSES as unknown as string[])
        .order('work_date', { ascending: false }).order('id')
        .range(f, t) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>);
    } catch {
      // Une liste vide voudrait dire « aucune réserve » : c'est le mensonge à
      // éviter ici. On le dit, et on ne montre rien plutôt que rien à tort.
      toast.error('Réserves illisibles pour le moment. Réessayez.');
      setLoading(false);
      return;
    }

    // Le nom de celui qui a levé la réserve est cherché à part, PAS en
    // imbriquant la clé étrangère : le nom manquant n'a alors aucun moyen de
    // faire échouer la lecture des réserves elles-mêmes.
    const resolverIds = Array.from(new Set(
      raw.map((e) => (e.reserve_resolved_by as string) || '').filter(Boolean),
    ));
    const names = new Map<string, string>();
    if (resolverIds.length) {
      const { data: people } = await supabase.from('users')
        .select('id, first_name, last_name').in('id', resolverIds);
      for (const p of (people || []) as { id: string; first_name?: string; last_name?: string }[]) {
        const n = fullName(p);
        if (n) names.set(p.id, n);
      }
    }

    setRows(raw.map((e): ReserveRow => {
      const ws = one(e.worksite as { client_name?: string; city?: string } | null);
      return {
        id: String(e.id),
        work_date: String(e.work_date),
        observation: (e.observation as string) || null,
        worksite_id: (e.worksite_id as string) || null,
        worksite_name: ws?.client_name || 'Chantier',
        worksite_city: ws?.city || null,
        worker: fullName(one(e.owner as { first_name?: string; last_name?: string } | null)) || 'Salarié',
        resolved_at: (e.reserve_resolved_at as string) || null,
        resolution: (e.reserve_resolution as string) || null,
        resolved_by_name: names.get((e.reserve_resolved_by as string) || '') || null,
        fixed_at: (e.reserve_fixed_at as string) || null,
      };
    }));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (open) { setResolving(null); setNote(''); load(); } }, [open, load]);

  const openRows = useMemo(() => rows.filter((r) => !r.resolved_at), [rows]);
  const doneRows = useMemo(() => rows.filter((r) => r.resolved_at), [rows]);
  const shown = tab === 'open' ? openRows : doneRows;

  // Groupées par chantier : le bureau traite un chantier, pas une date.
  const bySite = useMemo(() => {
    const m = new Map<string, { name: string; city: string | null; worksiteId: string | null; items: ReserveRow[] }>();
    for (const r of shown) {
      const key = r.worksite_id || r.worksite_name;
      if (!m.has(key)) m.set(key, { name: r.worksite_name, city: r.worksite_city, worksiteId: r.worksite_id, items: [] });
      m.get(key)!.items.push(r);
    }
    return Array.from(m.values()).sort((a, b) => b.items.length - a.items.length);
  }, [shown]);

  const apply = async (id: string, resolved: boolean, text?: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('set_reserve_resolution', {
        p_entry_id: id, p_resolved: resolved, p_note: text ?? null,
      });
      if (error) throw error;
      setResolving(null); setNote('');
      await load();
      onChanged?.();
      toast.success(resolved ? 'Réserve levée' : 'Réserve rouverte');
    } catch (e) {
      toast.error((e as { message?: string })?.message || "L'enregistrement a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-lg max-h-[86vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: RR_CSS }} />
        <DialogHeader><DialogTitle>Réserves de chantier</DialogTitle></DialogHeader>

        <div className="bt-rr-tabs">
          <button className={`bt-rr-tab${tab === 'open' ? ' on' : ''}`} onClick={() => setTab('open')}>
            <AlertTriangle className="h-4 w-4" /> À traiter <span className="bt-rr-tabn">{openRows.length}</span>
          </button>
          <button className={`bt-rr-tab${tab === 'done' ? ' on' : ''}`} onClick={() => setTab('done')}>
            <CheckCircle2 className="h-4 w-4" /> Levées <span className="bt-rr-tabn">{doneRows.length}</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement…</div>
        ) : bySite.length === 0 ? (
          <div className="bt-rr-empty">
            {tab === 'open'
              ? 'Aucune réserve à traiter. Les réceptions avec réserve déclarées par vos salariés apparaissent ici.'
              : 'Aucune réserve levée pour le moment.'}
          </div>
        ) : (
          bySite.map((site) => (
            <div key={site.worksiteId || site.name} className="bt-rr-site">
              <div className="bt-rr-sitehead">
                <Building2 className="h-4 w-4 shrink-0" style={{ color: '#9a948a' }} />
                <span className="bt-rr-sitename">{site.name}</span>
                {site.city && <span className="bt-rr-sitecity">{site.city}</span>}
                {site.worksiteId && onOpenDocs && (
                  <button className="bt-rr-docs" onClick={() => onOpenDocs(site.worksiteId!, site.name)}>
                    <FileText className="h-3.5 w-3.5" /> Photos
                  </button>
                )}
              </div>

              {site.items.map((r) => (
                <div key={r.id} className={`bt-rr-card${r.resolved_at ? ' done' : r.fixed_at ? ' fixed' : ''}`}>
                  <div className="bt-rr-meta">
                    <span className="bt-rr-date">{format(parseISO(r.work_date), 'EEE d MMM yyyy', { locale: fr })}</span>
                    <span>· {r.worker}</span>
                  </div>

                  {r.observation
                    ? <div className="bt-rr-obs">{r.observation}</div>
                    : <div className="bt-rr-noobs">Réserve signalée sans détail écrit — voir les photos du chantier.</div>}

                  {/* Le salarié dit avoir corrigé : le bureau sait quoi aller
                      vérifier avant de lever. Ce n'est PAS une levée. */}
                  {!r.resolved_at && r.fixed_at && (
                    <div className="bt-rr-fixed">
                      ✓ Le salarié a corrigé sur place le {format(parseISO(r.fixed_at), 'd MMM', { locale: fr })} — à vérifier
                    </div>
                  )}

                  {r.resolved_at && (
                    <div className="bt-rr-done">
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-[1px]" />
                      <span>
                        Levée le {format(parseISO(r.resolved_at), 'd MMM yyyy', { locale: fr })}
                        {r.resolved_by_name ? ` par ${r.resolved_by_name}` : ''}
                        {r.resolution ? <><br /><span className="bt-rr-donetxt">« {r.resolution} »</span></> : null}
                      </span>
                    </div>
                  )}

                  {resolving === r.id ? (
                    <div className="mt-2">
                      <Textarea
                        rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder={r.fixed_at
                          ? 'Ce que vous avez constaté (facultatif)'
                          : 'Ce qui a été fait (facultatif) — ex : vis posée le 22/09'}
                      />
                      <div className="bt-rr-acts">
                        <Button size="sm" className="flex-1" disabled={busy} onClick={() => apply(r.id, true, note)}>
                          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirmer la levée
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setResolving(null); setNote(''); }}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bt-rr-acts">
                      {r.resolved_at ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => apply(r.id, false)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Rouvrir
                        </Button>
                      ) : (
                        <Button size="sm" disabled={busy} onClick={() => { setResolving(r.id); setNote(''); }}>
                          <CheckCircle2 className="h-4 w-4 mr-1.5" /> Lever la réserve
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </DialogContent>
    </Dialog>
  );
}
