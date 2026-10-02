'use client';

// Registre des réserves (Étape 11, simplifié au lot 11).
//
// Le salarié déclare, sur son intervention, une réception « avec réserve ».
// Ici, elles sont toutes réunies et elles se LÈVENT — par le bureau ici, ou par
// le salarié depuis son téléphone (même formulaire : commentaire et photo
// facultatifs). Une réserve levée passe dans « Levées », avec qui, quand, le
// commentaire et la photo. Rien n'est effacé ; « Rouvrir » la remet à traiter.
//
// « Levée » a UNE définition, partagée par tous les écrans : lib/reserves.ts.
//
// CE QUI N'EST PAS AFFICHÉ, ET POURQUOI :
//   - les brouillons : le salarié n'a pas encore envoyé sa journée, ce n'est pas
//     une réserve pour le bureau ;
//   - les interventions RETIRÉES ('cancelled') : l'intervention n'existe plus,
//     courir après sa réserve serait courir après rien.
// Même règle que partout ailleurs — voir lib/status.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ReserveLiftForm from '@/components/reserve-lift-form';
import { Loader2, AlertTriangle, CheckCircle2, Building2, FileText, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { COUNTED_STATUSES } from '@/lib/status';
import { fetchAllPaged } from '@/lib/fetch-all';
import { isReserveLifted, liftedAt, liftedBy, liftedNote, RESERVE_LIFT_LABEL } from '@/lib/reserves';
import { liftReserve, reopenReserve, liftErrorMessage } from '@/lib/reserve-lift';
import { toast } from 'sonner';

export interface ReserveRow {
  id: string;
  work_date: string;
  observation: string | null;
  worksite_id: string | null;
  worksite_name: string;
  worksite_city: string | null;
  worker: string;
  /** Levée (bureau OU salarié) — null tant qu'elle est à traiter. */
  lifted_at: string | null;
  lifted_by: 'bureau' | 'salarie' | null;
  lifted_by_name: string | null;
  lifted_note: string | null;
}

interface LiftPhoto { id: string; url: string }

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
.bt-rr-tabs{display:flex;gap:7px;padding-top:2px;min-width:0}
.bt-rr-tab{flex:1;min-width:0;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:11px;padding:9px 10px;font-family:inherit;font-weight:800;font-size:13px;color:#6E6A63;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px}
.bt-rr-tab.on{background:#15120F;border-color:#15120F;color:#F2EDE3}
.bt-rr-tabn{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:800;background:rgba(21,18,15,.08);border-radius:99px;padding:1px 7px}
.bt-rr-tab.on .bt-rr-tabn{background:rgba(255,194,26,.9);color:#15120F}
.bt-rr-site{margin-top:12px;min-width:0}
.bt-rr-sitehead{display:flex;align-items:center;gap:8px;margin-bottom:6px;min-width:0}
.bt-rr-sitename{font-weight:900;font-size:14px;letter-spacing:-.01em;color:#15120F;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-rr-sitecity{font-family:'JetBrains Mono',monospace;font-size:11px;color:#9a948a;font-weight:600;flex:none}
.bt-rr-docs{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:800;color:#a87c1e;text-decoration:underline}
.bt-rr-list{margin-top:12px;min-width:0}
.bt-rr-card{background:#fff;border:1px solid rgba(21,18,15,.1);border-left:3px solid #C0461F;border-radius:12px;padding:11px 13px;margin-bottom:7px;min-width:0}
.bt-rr-card.done{border-left-color:#1F7A4D;background:#FBFAF7}
.bt-rr-meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#8a8378;min-width:0}
.bt-rr-date{color:#15120F}
.bt-rr-where{font-weight:900;font-size:13.5px;color:#15120F;margin-top:3px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-rr-obs{font-size:13.5px;color:#15120F;font-weight:600;margin-top:5px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.bt-rr-noobs{font-size:13px;color:#9a948a;font-weight:600;font-style:italic;margin-top:5px}
.bt-rr-done{margin-top:7px;padding-top:7px;border-top:1px solid rgba(21,18,15,.08);font-size:12.5px;color:#1F7A4D;font-weight:700;display:flex;align-items:flex-start;gap:6px;min-width:0}
.bt-rr-done>span{min-width:0;overflow-wrap:anywhere}
.bt-rr-donetxt{color:#3a352f;font-weight:600}
.bt-rr-chip{display:inline-block;margin-left:6px;font-size:11px;font-weight:800;color:#5c574f;background:#EFEDE8;border:1px solid #D6D1C6;border-radius:99px;padding:0 8px;vertical-align:1px;white-space:nowrap}
.bt-rr-photos{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.bt-rr-ph{display:block;width:72px;height:72px;border-radius:9px;overflow:hidden;border:1px solid rgba(21,18,15,.15);background:#ECE6D9}
.bt-rr-ph img{width:100%;height:100%;object-fit:cover;display:block}
.bt-rr-acts{display:flex;gap:7px;margin-top:9px}
.bt-rr-empty{text-align:center;color:#9a948a;font-weight:600;padding:30px 10px;font-size:13.5px;line-height:1.5}
`;

type Tab = 'open' | 'done';

/** PostgREST renvoie l'imbrication tantôt en objet, tantôt en tableau d'un élément. */
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

const fullName = (u?: { first_name?: string | null; last_name?: string | null } | null) =>
  `${u?.first_name || ''} ${u?.last_name || ''}`.trim();

/**
 * La photo appartient-elle à CETTE levée ? Elle part juste avant la levée
 * (même horloge : celle du serveur). Après un « Rouvrir » puis une nouvelle
 * levée, l'ancienne photo reste dans les documents mais n'est plus montrée ici.
 */
const photoOfLift = (createdAt: string | null | undefined, lifted: string | null) => {
  if (!createdAt || !lifted) return true;
  const d = Date.parse(lifted) - Date.parse(createdAt);
  return Number.isNaN(d) || (d >= -5 * 60_000 && d <= 30 * 60_000);
};

export default function ReservesReport({ open, onOpenChange, companyId, onOpenDocs, onChanged }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReserveRow[]>([]);
  const [photos, setPhotos] = useState<Map<string, LiftPhoto[]>>(new Map());
  // Réserve dont le formulaire « Lever la réserve » est ouvert.
  const [resolving, setResolving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (!companyId) return;
    // « Chargement… » à l'ouverture seulement : après un geste, la liste se met
    // à jour en place (pas de clignotement, règle du lot 10).
    if (initial) setLoading(true);
    // Lecture PAGINÉE. Le registre couvre toute la vie de l'entreprise, pas une
    // période : une requête simple s'arrêterait au plafond PostgREST (1000
    // lignes par défaut) SANS erreur. `id` départage les ex æquo de date.
    let raw: Record<string, unknown>[];
    try {
      raw = await fetchAllPaged<Record<string, unknown>>((f, t) => supabase
        .from('time_entries')
        .select('id, work_date, observation, worksite_id, '
          + 'reserve_resolved_at, reserve_resolved_by, reserve_resolution, '
          + 'reserve_fixed_at, reserve_fixed_by, reserve_fix_note, '
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

    // Le nom de celui qui a levé est cherché à part, PAS en imbriquant la clé
    // étrangère : un nom manquant ne doit pas faire échouer la liste.
    const ids = Array.from(new Set(
      raw.flatMap((e) => [(e.reserve_resolved_by as string) || '', (e.reserve_fixed_by as string) || '']).filter(Boolean),
    ));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: people } = await supabase.from('users')
        .select('id, first_name, last_name').in('id', ids);
      for (const p of (people || []) as { id: string; first_name?: string; last_name?: string }[]) {
        const n = fullName(p);
        if (n) names.set(p.id, n);
      }
    }

    const next = raw.map((e): ReserveRow => {
      const ws = one(e.worksite as { client_name?: string; city?: string } | null);
      const worker = fullName(one(e.owner as { first_name?: string; last_name?: string } | null)) || 'Salarié';
      const r = e as { reserve_resolved_at?: string | null; reserve_resolution?: string | null; reserve_fixed_at?: string | null; reserve_fix_note?: string | null };
      const by = liftedBy(r);
      return {
        id: String(e.id),
        work_date: String(e.work_date),
        observation: (e.observation as string) || null,
        worksite_id: (e.worksite_id as string) || null,
        worksite_name: ws?.client_name || 'Chantier',
        worksite_city: ws?.city || null,
        worker,
        lifted_at: isReserveLifted(r) ? liftedAt(r) : null,
        lifted_by: by,
        // Bureau : la personne du bureau qui a levé. Salarié : la fonction
        // serveur n'accepte que le salarié de la ligne — son nom, donc.
        lifted_by_name: by === 'bureau'
          ? names.get((e.reserve_resolved_by as string) || '') || null
          : by === 'salarie' ? names.get((e.reserve_fixed_by as string) || '') || worker : null,
        lifted_note: isReserveLifted(r) ? liftedNote(r) : null,
      };
    });
    setRows(next);
    setLoading(false);

    // Photos prises à la levée : documents « réserve » nommés « Réserve
    // levée — … », rattachés à l'intervention. Lecture à part : une photo
    // illisible ne doit jamais cacher la liste.
    const lifted = new Map(next.filter((r) => r.lifted_at).map((r) => [r.id, r.lifted_at]));
    if (!lifted.size) { setPhotos(new Map()); return; }
    try {
      const docs = await fetchAllPaged<{ id: string; time_entry_id: string | null; file_path: string; created_at?: string | null }>((f, t) => supabase
        .from('documents')
        .select('id, time_entry_id, file_path, created_at')
        .eq('company_id', companyId)
        .eq('category', 'reserve')
        .like('label', `${RESERVE_LIFT_LABEL}%`)
        .order('created_at', { ascending: false }).order('id')
        .range(f, t) as unknown as PromiseLike<{ data: { id: string; time_entry_id: string | null; file_path: string; created_at?: string | null }[] | null; error: { message: string } | null }>);
      const mine = docs.filter((d) => d.time_entry_id && lifted.has(d.time_entry_id) && photoOfLift(d.created_at, lifted.get(d.time_entry_id) ?? null));
      if (!mine.length) { setPhotos(new Map()); return; }
      const { data: signed } = await supabase.storage.from('chantier-docs').createSignedUrls(mine.map((d) => d.file_path), 3600);
      const url = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
      const m = new Map<string, LiftPhoto[]>();
      for (const d of mine) {
        const u = url.get(d.file_path);
        if (!u || !d.time_entry_id) continue;
        m.set(d.time_entry_id, [...(m.get(d.time_entry_id) || []), { id: d.id, url: u }]);
      }
      setPhotos(m);
    } catch {
      setPhotos(new Map());
    }
  }, [companyId]);

  useEffect(() => { if (open) { setResolving(null); load(true); } }, [open, load]);

  const openRows = useMemo(() => rows.filter((r) => !r.lifted_at), [rows]);
  // « Levées » : les plus récentes d'abord, toutes ensemble (on y cherche « ce
  // qui vient d'être fait », pas un chantier).
  const doneRows = useMemo(
    () => rows.filter((r) => r.lifted_at).sort((a, b) => (b.lifted_at || '').localeCompare(a.lifted_at || '')),
    [rows],
  );

  // « À traiter » : groupées par chantier — le bureau traite un chantier, pas une date.
  const bySite = useMemo(() => {
    const m = new Map<string, { name: string; city: string | null; worksiteId: string | null; items: ReserveRow[] }>();
    for (const r of openRows) {
      const key = r.worksite_id || r.worksite_name;
      if (!m.has(key)) m.set(key, { name: r.worksite_name, city: r.worksite_city, worksiteId: r.worksite_id, items: [] });
      m.get(key)!.items.push(r);
    }
    return Array.from(m.values()).sort((a, b) => b.items.length - a.items.length);
  }, [openRows]);

  const lift = async (r: ReserveRow, note: string, photo: File | null) => {
    if (!companyId || !user?.id) return;
    setBusy(true);
    try {
      await liftReserve({ role: 'admin', companyId, userId: user.id, entryId: r.id, worksiteId: r.worksite_id, note, photo });
      setResolving(null);
      toast.success('Réserve levée — elle est dans « Levées »');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(liftErrorMessage(e));
      throw e; // le formulaire reste ouvert, avec la saisie
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (r: ReserveRow) => {
    setBusy(true);
    try {
      await reopenReserve(r.id);
      toast.success('Réserve rouverte — elle est dans « À traiter »');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(liftErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const fmtDay = (d: string) => format(parseISO(d), 'EEE d MMM yyyy', { locale: fr });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-lg max-h-[86vh] overflow-y-auto overflow-x-hidden" data-testid="reserves-report">
        <style dangerouslySetInnerHTML={RR_CSS_HTML} />
        <DialogHeader><DialogTitle>Réserves de chantier</DialogTitle></DialogHeader>

        <div className="bt-rr-tabs">
          <button className={`bt-rr-tab${tab === 'open' ? ' on' : ''}`} onClick={() => setTab('open')} data-testid="rr-tab-open">
            <AlertTriangle className="h-4 w-4 shrink-0" /> À traiter <span className="bt-rr-tabn">{openRows.length}</span>
          </button>
          <button className={`bt-rr-tab${tab === 'done' ? ' on' : ''}`} onClick={() => setTab('done')} data-testid="rr-tab-done">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Levées <span className="bt-rr-tabn">{doneRows.length}</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement…</div>
        ) : tab === 'open' ? (
          bySite.length === 0 ? (
            <div className="bt-rr-empty">Aucune réserve à traiter.</div>
          ) : bySite.map((site) => (
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
                <div key={r.id} className="bt-rr-card" data-testid="rr-open-card">
                  <div className="bt-rr-meta">
                    <span className="bt-rr-date">{fmtDay(r.work_date)}</span>
                    <span>· {r.worker}</span>
                  </div>
                  {r.observation
                    ? <div className="bt-rr-obs">{r.observation}</div>
                    : <div className="bt-rr-noobs">Sans détail écrit — voir les photos du chantier.</div>}

                  {resolving === r.id ? (
                    <ReserveLiftForm
                      onSubmit={(note, photo) => lift(r, note, photo)}
                      onCancel={() => setResolving(null)}
                    />
                  ) : (
                    <div className="bt-rr-acts">
                      <Button size="sm" disabled={busy} onClick={() => setResolving(r.id)}>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Lever la réserve
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        ) : doneRows.length === 0 ? (
          <div className="bt-rr-empty">Aucune réserve levée pour le moment.</div>
        ) : (
          <div className="bt-rr-list">
            {doneRows.map((r) => (
              <div key={r.id} className="bt-rr-card done" data-testid="rr-done-card">
                <div className="bt-rr-meta">
                  <span className="bt-rr-date">{fmtDay(r.work_date)}</span>
                  <span>· {r.worker}</span>
                </div>
                <div className="bt-rr-where">{r.worksite_name}{r.worksite_city ? ` · ${r.worksite_city}` : ''}</div>
                {r.observation
                  ? <div className="bt-rr-obs">{r.observation}</div>
                  : <div className="bt-rr-noobs">Sans détail écrit.</div>}
                <div className="bt-rr-done">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-[1px]" />
                  <span>
                    Levée le {format(parseISO(r.lifted_at!), 'd MMM yyyy', { locale: fr })}
                    {r.lifted_by_name ? ` par ${r.lifted_by_name}` : ''}
                    <span className="bt-rr-chip">{r.lifted_by === 'salarie' ? 'par le salarié' : 'par le bureau'}</span>
                    {r.lifted_note ? <><br /><span className="bt-rr-donetxt">« {r.lifted_note} »</span></> : null}
                  </span>
                </div>
                {(photos.get(r.id) || []).length > 0 && (
                  <div className="bt-rr-photos">
                    {(photos.get(r.id) || []).map((ph) => (
                      <a key={ph.id} className="bt-rr-ph" href={ph.url} target="_blank" rel="noreferrer" aria-label="Voir la photo de la levée">
                        <img src={ph.url} alt="Photo de la levée" data-testid="rr-lift-photo" />
                      </a>
                    ))}
                  </div>
                )}
                <div className="bt-rr-acts">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => reopen(r)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Rouvrir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Objet FIXE : un `{ __html }` neuf à chaque rendu fait réécrire la feuille
// de style par React (re-calcul de la page, polices rechargées → flash).
const RR_CSS_HTML = { __html: RR_CSS };
