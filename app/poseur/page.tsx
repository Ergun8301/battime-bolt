'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useOfflineSync } from '@/lib/use-offline-sync';
import { supabase } from '@/lib/supabase';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CalendarDays, CalendarRange, History, LogOut, Check, ArrowLeft, Camera, Loader2, Palmtree, Bell, BellOff, Sparkles, Info, ScanLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { PoigneesSalarie } from '@/lib/openers-salarie';
import { useAiEnabled } from '@/lib/real-cost';
import { useCompanySettings } from '@/lib/company-settings';
import { useVisiblePoll } from '@/lib/use-visible-poll';
import { GEO_INFO_LINK, GEO_INFO_TEXT, GEO_INFO_TITLE } from '@/lib/position-info';
import { toast } from 'sonner';
import { format, subDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { computeMissingDays } from '@/lib/work-status';
import PoseurDay from '@/components/poseur-day';
import { pushSupported, currentPushState, enablePush, disablePush } from '@/lib/push';
import WorkerReserves, { type WorkerReserve } from '@/components/worker-reserves';
import GuideTour, { type GuideStep } from '@/components/guide-tour';
import { findWorkerTour, tourIdOf, type WorkerTour } from '@/supabase/functions/_shared/worker-tours';
import { COUNTED_STATUSES } from '@/lib/status';
import { keep } from '@/lib/same';
import { lazyWindow, warmAll } from '@/lib/lazy-window';
import { isPreviewHost } from '@/lib/hosting';
import { RESERVES_CHANGED_EVENT } from '@/lib/reserve-lift';
// Formations (lot 6, oct. 2026) : rien ne s'affiche tant que la migration n'est pas passée.
import { TrainingsBanner, useMyTrainings } from '@/components/poseur-trainings';
import { GraduationCap } from 'lucide-react';
// Design salarié, étape 3 : la coque v2 (visible seulement avec ?ui=2 sur un aperçu, voir components/design/salarie/shell-v2.tsx).
import { BandeJours, BoutonAssistant, Kicker, NoteEntete, OngletsBas, useUi2, type OngletBas } from '@/components/design/salarie/shell-v2';
import type { BarreJour } from '@/components/design/salarie/carte-total';
import { bandeJours, etatJour, minutesDe, type JourBrut } from '@/supabase/functions/_shared/salarie-vue';

// Lot 5 « site rapide 1 » : les onglets Semaine / Mois / Historique et les fenêtres fermées ne pèsent plus
// dans le premier chargement. Ils arrivent au repos (file de préchauffage, lib/lazy-window.tsx) ou à
// l'ouverture ; le JSX plus bas n'a pas changé. Tant que le code d'un onglet n'est pas là (économie de
// données, iPhone dans la première seconde), il montre les mêmes blocs gris que l'onglet lui-même pendant
// qu'il charge ses données : aucun écran blanc. Hors ligne, un écran jamais chargé affiche le message.
type DayPickProps = { onSelectDay?: (date: string) => void };
const NON_CHARGE = <p role="status" style={{ padding: 16, textAlign: 'center', fontSize: 14 }}>Cet écran n'a pas pu se charger. Vérifiez votre connexion puis rechargez la page.</p>;
const PoseurWeek = lazyWindow<DayPickProps>(() => import('@/components/poseur-week'), { isOpen: () => true, priority: 1, errorFallback: NON_CHARGE,
  loadingFallback: <div className="space-y-4"><Skeleton className="h-10 w-full" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div> });
const PoseurHistory = lazyWindow(() => import('@/components/poseur-history'), { isOpen: () => true, priority: 2, errorFallback: NON_CHARGE,
  loadingFallback: <div className="space-y-4"><Skeleton className="h-12 w-48" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div> });
const PoseurMonth = lazyWindow<DayPickProps>(() => import('@/components/poseur-month'), { isOpen: () => true, priority: 3, errorFallback: NON_CHARGE,
  loadingFallback: <div className="space-y-4"><Skeleton className="h-10 w-full" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div> });
// Formations : la liste (components/poseur-trainings-list.tsx) se charge à l'ouverture de l'onglet ; le hook et le bandeau restent dans la page.
const PoseurTrainings = lazyWindow(() => import('@/components/poseur-trainings-list'), { isOpen: () => true, priority: 6, errorFallback: NON_CHARGE,
  loadingFallback: <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div> });
const LeaveRequestDialog = lazyWindow(() => import('@/components/leave-request-dialog'), { isOpen: (p) => p.open, priority: 4 });
// Assistant : monté dès que son code est là, même fermé (il garde la mémoire de la conversation).
const WorkerAssistant = lazyWindow(() => import('@/components/worker-assistant'), { isOpen: (p) => !!p.open, priority: 5, warm: 'mounted', mount: 'warm' });
// Le lecteur de QR ne se préchauffe pas et n'est jamais « collant » : démonté à la fermeture, la caméra s'éteint.
const QrScanner = lazyWindow(() => import('@/components/qr-scanner'), { isOpen: () => true, close: (p) => p.onClose(), warm: 'never' });

const TABS = [
  { value: 'day', label: 'Ma journée', icon: Clock },
  { value: 'week', label: 'Ma semaine', icon: CalendarDays },
  { value: 'month', label: 'Mon mois', icon: CalendarRange },
  { value: 'history', label: 'Historique', icon: History },
];
// Formations : une entrée du menu seulement quand il y en a au moins une.
const FORMATIONS_TAB = { value: 'formations', label: 'Formations', icon: GraduationCap };
const ALL_TABS = [...TABS, FORMATIONS_TAB];
// Lot 7 : les ancres des guides pas à pas (components/guide-tour.tsx) sur les entrées du menu.
const MENU_GUIDE: Record<string, string> = { day: 'menu.journee', week: 'menu.semaine', month: 'menu.mois', history: 'menu.historique' };

/** Même liste qu'avant ? On garde l'ancienne (aucun rendu pour rien, toutes les minutes). */
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function PoseurPage() {
  const { user, signOut } = useAuth();
  // Assistant BEMEXO (lot 4) : après un enregistrement, la journée se recharge.
  const [dayKey, setDayKey] = useState(0);
  // Envoi différé des saisies faites sans réseau : tourne pour TOUS les jours en
  // attente, dès que l'application est ouverte et qu'il y a du réseau.
  const { pendingCount: offlineCount, blockedCount: offlineBlocked, syncing: offlineSyncing, syncNow } = useOfflineSync(user?.id);
  const [view, setView] = useState('day');
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // declare a specific day
  const [pending, setPending] = useState<string[]>([]); // jours planifiés sans heures envoyées
  // Coque v2 (?ui=2, aperçus seulement) : de quoi dessiner la bande des 7 jours, lu dans les MÊMES requêtes que les bandeaux (aucune requête de plus).
  const ui2 = useUi2();
  const ui2Ref = useRef(false);
  ui2Ref.current = ui2;
  const [joursBrut, setJoursBrut] = useState<Record<string, Omit<JourBrut, 'date'>>>({});
  const [prevuMin, setPrevuMin] = useState<Record<string, number>>({});
  // Jours qui portent des heures jamais parties. Le travail est fait, il manque
  // le geste d'envoi. C'est le piège le plus fréquent — celui qui a fait
  // disparaître 11 h un dimanche. Fusionné avec `pending` dans un seul bandeau.
  const [unsentDays, setUnsentDays] = useState<string[]>([]);
  const [pendingOpen, setPendingOpen] = useState(false); // liste « journées à envoyer »
  // Lot 11 : mes réserves encore à lever (tous jours confondus) → bandeau.
  const [reserves, setReserves] = useState<WorkerReserve[]>([]);
  // Formations : mes formations (my_trainings), relues toutes les minutes et au retour sur l'appli.
  const trainings = useMyTrainings(user?.id);
  const trainingsMenu = trainings.available && trainings.items.length > 0;
  const [photoUrl, setPhotoUrl] = useState(''); // photo de profil du salarié (facultatif)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [leaveOpen, setLeaveOpen] = useState(false); // demandes de congé
  // Lot 6 : assistant ouvert par ✨ (barre du bas / menu), scanner 📷 (en-tête),
  // « ℹ️ Informations » (menu). Chacun n'existe que si l'interrupteur de
  // l'entreprise est allumé (ai_enabled / kiosk_enabled).
  const router = useRouter();
  const aiOn = useAiEnabled(user?.company_id);
  // Démo des préviews (?demo=salarie) : l'assistant se monte même sans IA, comme dans worker-assistant.tsx.
  const demoSalarie = typeof window !== 'undefined' && isPreviewHost() && new URLSearchParams(window.location.search).get('demo') === 'salarie';
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [kioskOn, setKioskOn] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Lot 7 : guide pas à pas (components/guide-tour.tsx), lancé par « Me guider pas à pas » de l'assistant.
  // Le menu du compte est piloté d'ici pour que le guide puisse l'ouvrir à l'étape qui le demande.
  const [tour, setTour] = useState<WorkerTour | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const tourEnd = useRef(0); // quand le dernier guide s'est arrêté (le menu met un instant à se démonter)
  // Lot 12 : l'icône du scanner ne s'affiche que si une tablette est VRAIMENT
  // reliée (company_has_kiosk : borne allumée ET une tablette non retirée).
  // Un QR fixe imprimé actif compte aussi (c'est une ligne « fixe » de kiosks).
  // Fonction absente (migration du lot 12 pas encore passée) ou lecture en
  // échec : comportement d'avant, l'interrupteur de l'entreprise seul.
  // Lot 29 : l'interrupteur vient de la lecture commune des réglages (lib/company-settings).
  const kioskEnabled = useCompanySettings(user?.company_id)?.kioskEnabled;
  useEffect(() => {
    if (!kioskEnabled) { setKioskOn(false); return; }
    let stale = false;
    supabase.rpc('company_has_kiosk').then((r) => {
      if (!stale) setKioskOn(r.error || typeof r.data !== 'boolean' ? true : r.data);
    });
    return () => { stale = true; };
  }, [kioskEnabled]);
  // Notifications push : 'unsupported' (navigateur/iOS non compatible), 'denied'
  // (refusé au niveau navigateur), 'on'/'off'. On n'affiche l'item que si utile.
  const [pushState, setPushState] = useState<'unsupported' | 'denied' | 'on' | 'off'>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  // Smart header (mobile) : refs + état de rétraction. Purement visuel.
  const phoneRef = useRef<HTMLDivElement>(null);
  const hdrRef = useRef<HTMLElement>(null);
  const [hdrHidden, setHdrHidden] = useState(false);

  const fetchPending = useCallback(async () => {
    if (!user) return;
    // Look back far enough to catch any planned-but-not-declared day still open.
    const windowStart = format(subDays(new Date(), 60), 'yyyy-MM-dd');
    // Lot 29 : UN seul saut. Les heures déjà envoyées/validées ET les brouillons viennent de la
    // même lecture (triés ensuite ici) ; les réserves ne dépendent d'aucune des deux.
    // Lot 11 : réserves à lever — envoyées (comme le registre du bureau), ni
    // levées par le bureau ni par moi (définition partagée : lib/reserves.ts).
    // Une lecture en échec garde le bandeau tel quel (pas de « 0 » à tort).
    const [planRes, entRes, { data: res, error: resErr }] = await Promise.all([
      supabase.from('planning').select(ui2Ref.current ? 'work_date, absence_type, estimated_start, estimated_end' : 'work_date, absence_type').eq('user_id', user.id).gte('work_date', windowStart),
      supabase.from('time_entries').select(ui2Ref.current ? 'work_date, status, submitted_at, locked, exported_at, exit_forgotten, start_time, end_time, total_minutes' : 'work_date, status').eq('user_id', user.id).in('status', ['draft', 'submitted', 'validated']).gte('work_date', windowStart),
      supabase.from('time_entries')
        .select('id, work_date, observation, worksite_id, worksite:worksites(client_name, city)')
        .eq('user_id', user.id).eq('reception', 'avec')
        .in('status', COUNTED_STATUSES as unknown as string[])
        .is('reserve_resolved_at', null).is('reserve_fixed_at', null)
        .order('work_date', { ascending: false }).limit(50),
    ]);
    const rows = (planRes.data || []) as unknown as { work_date: string; absence_type: string | null; estimated_start?: string | null; estimated_end?: string | null }[];
    const absenceDays = new Set(rows.filter((p) => p.absence_type).map((p) => p.work_date));
    const planned = rows.filter((p) => !p.absence_type && !absenceDays.has(p.work_date)).map((p) => p.work_date);
    const entries = (entRes.data || []) as unknown as { work_date: string; status: string; submitted_at?: string | null; locked?: boolean | null; exported_at?: string | null; exit_forgotten?: boolean | null; start_time?: string | null; end_time?: string | null; total_minutes?: number | null }[];
    const declared = new Set<string>(entries.filter((e) => e.status !== 'draft').map((e) => e.work_date));
    const missing = computeMissingDays(planned, declared);
    setPending((prev) => (sameList(prev, missing) ? prev : missing));

    // Heures saisies, jamais envoyées. On les cherche sur toute la fenêtre :
    // un brouillon d'avant-hier est aussi perdu que celui d'aujourd'hui.
    // Borné à aujourd'hui : « Dupliquer cette journée » prépare des brouillons
    // sur des jours à venir, ce n'est pas un oubli et ça n'a rien à faire ici.
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (ui2Ref.current) {
      const brut: Record<string, Omit<JourBrut, 'date'>> = {};
      const jour = (d: string) => (brut[d] ??= { lignes: [] });
      for (const r of rows) { const j = jour(r.work_date); if (r.absence_type) j.absence = r.absence_type; else j.prevu = true; }
      for (const e of entries) jour(e.work_date).lignes.push(e);
      setJoursBrut((prev) => (JSON.stringify(prev) === JSON.stringify(brut) ? prev : brut));
      // Heures prévues par jour (barres des jours à venir) : de l'heure de début à l'heure de fin du planning, sans pause.
      const prevus: Record<string, number> = {};
      for (const r of rows) {
        const d = minutesDe(r.estimated_start), f = minutesDe(r.estimated_end);
        if (!r.absence_type && d !== null && f !== null && f > d) prevus[r.work_date] = (prevus[r.work_date] ?? 0) + (f - d);
      }
      setPrevuMin((prev) => (JSON.stringify(prev) === JSON.stringify(prevus) ? prev : prevus));
    }
    const unsent = Array.from(new Set(entries.filter((e) => e.status === 'draft' && e.work_date <= todayStr).map((e) => e.work_date)))
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // plus récent d'abord, comme avant
    setUnsentDays((prev) => (sameList(prev, unsent) ? prev : unsent));

    if (!resErr) {
      const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
      const next = ((res || []) as { id: string; work_date: string; observation: string | null; worksite_id: string | null; worksite?: unknown }[])
        .map((r): WorkerReserve => {
          const ws = one(r.worksite as { client_name?: string; city?: string } | null);
          return { id: r.id, work_date: r.work_date, observation: r.observation || null, worksite_id: r.worksite_id, chantier: ws?.client_name || 'Chantier', city: ws?.city || null };
        });
      // keep() : même liste → même objet, aucun redessin (relu toutes les minutes).
      setReserves((prev) => keep(prev, next));
    }
  }, [user]);

  // Lot 29 : en pause quand l'onglet est caché, relu au retour (après 30 s au moins).
  useVisiblePoll(fetchPending, 60000, { key: user?.id });
  // Une réserve levée depuis une carte de « Ma journée » : le bandeau suit.
  useEffect(() => {
    window.addEventListener(RESERVES_CHANGED_EVENT, fetchPending);
    return () => window.removeEventListener(RESERVES_CHANGED_EVENT, fetchPending);
  }, [fetchPending]);

  // La coque v2 vient d'être allumée : la bande des jours se remplit tout de suite (pas dans la minute).
  useEffect(() => { if (ui2) fetchPending(); }, [ui2, fetchPending]);

  // Photo de profil du salarié (depuis users.photo_url).
  useEffect(() => { setPhotoUrl(user?.photo_url || ''); }, [user?.photo_url]);

  // État des notifications push à l'ouverture (ne demande AUCUNE permission ici :
  // la demande du navigateur ne doit surgir qu'après un geste explicite).
  useEffect(() => { if (pushSupported()) currentPushState().then(setPushState); }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushState === 'on') {
        const err = await disablePush();
        if (err) toast.error(err); else { setPushState('off'); toast.success('Notifications désactivées'); }
      } else {
        const err = await enablePush();
        if (err) { toast.error(err); setPushState(await currentPushState()); }
        else { setPushState('on'); toast.success('Notifications activées'); }
      }
    } finally {
      setPushBusy(false);
    }
  };

  // ===== Smart header : se rétracte quand on descend, revient quand on remonte =====
  // Purement cosmétique. Écoute le scroll en phase capture → couvre TOUS les scrollers
  // internes (Ma journée, semaine, mois, historique) sans toucher à leur code.
  useEffect(() => {
    const phone = phoneRef.current;
    const hdr = hdrRef.current;
    if (!phone || !hdr) return;
    let phdrH = hdr.offsetHeight;
    // Réécrit seulement si la hauteur a vraiment changé (pas de mutation pour rien).
    const measure = () => {
      phdrH = hdr.offsetHeight;
      if (phone.style.getPropertyValue('--phdr-h') !== `${phdrH}px`) phone.style.setProperty('--phdr-h', `${phdrH}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hdr);
    // Détection robuste : accumulateur de distance (immunise contre l'inertie /
    // le micro-jitter tactile) + fenêtre d'ignorance après chaque bascule (casse la
    // boucle « rétraction → reflow → nouvel event scroll → re-bascule » = le clignotement)
    // + rAF (au plus une fois par frame) + clamp du rebond iOS (scrollTop négatif).
    let lastY = 0;      // dernière position lue
    let acc = 0;        // distance cumulée dans le sens courant
    let lockUntil = 0;  // horodatage jusqu'auquel on ignore le scroll (post-bascule)
    let hidden = false; // miroir local de l'état (évite les setState redondants)
    let target: HTMLElement | null = null;
    let ticking = false;

    const setHidden = (v: boolean) => { if (v !== hidden) { hidden = v; setHdrHidden(v); } };

    const process = (el: HTMLElement) => {
      ticking = false;
      const y = el.scrollTop < 0 ? 0 : el.scrollTop;                 // rebond iOS → 0
      if (el !== target) { target = el; lastY = y; acc = 0; return; } // changement de vue
      const dy = y - lastY;
      lastY = y;
      if (y <= 8) { acc = 0; setHidden(false); return; }             // tout en haut → toujours visible (prioritaire)
      if (performance.now() < lockUntil) return;                     // on laisse la transition finir
      if (el.scrollHeight - el.clientHeight < 160) return;           // petits scrollers internes : on ignore
      // On ne cumule que le geste UTILE : visible → on guette la descente ; caché → la
      // remontée. Les à-coups dans l'autre sens remettent juste le compteur à zéro (pas
      // de « dette » à rembourser — c'est elle qui rendait la réapparition lente). Et on
      // compte TOUS les deltas, même < 1 px, sinon un scroll très lent ne déclenche rien.
      acc += dy;
      if (hidden ? acc > 0 : acc < 0) acc = 0;
      if (!hidden) {
        if (acc >= 30 && y >= phdrH) { setHidden(true); acc = 0; lockUntil = performance.now() + 340; } // cache dès un petit geste, une fois le contenu passé SOUS l'en-tête (jamais de trou)
      } else {
        const nearBottom = y >= el.scrollHeight - el.clientHeight - 4; // rebond bas iOS : pas de réapparition parasite
        if (acc <= -16 && !nearBottom) { setHidden(false); acc = 0; lockUntil = performance.now() + 340; } // la moindre remontée volontaire → montrer
      }
    };

    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || typeof el.scrollTop !== 'number' || ticking) return;
      ticking = true;
      requestAnimationFrame(() => process(el));
    };
    phone.addEventListener('scroll', onScroll, true); // capture : les events scroll ne remontent pas
    return () => { phone.removeEventListener('scroll', onScroll, true); ro.disconnect(); };
  }, []);

  // À chaque navigation, l'en-tête repart visible.
  useEffect(() => { setHdrHidden(false); }, [view, selectedDate]);
  // Formations : la fonction a disparu (base restaurée…) → retour à « Ma journée ».
  useEffect(() => { if (view === 'formations' && !trainings.available) setView('day'); }, [view, trainings.available]);

  // Le salarié change SA propre photo (appareil photo ou galerie sur mobile). Upload
  // dans SON dossier, puis enregistrement de l'URL via update_my_photo (il ne touche
  // que sa propre ligne).
  const onPickPhoto = async (file?: File) => {
    if (!file || !user?.id) return;
    if (!file.type.startsWith('image/')) { toast.error('Photo uniquement (JPG ou PNG).'); return; }
    if (file.size > 6 * 1024 * 1024) { toast.error('Photo trop lourde (6 Mo max).'); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const uid = user.id;
      await supabase.storage.from('worker-photos').remove([`${uid}/photo.png`, `${uid}/photo.jpg`]);
      const path = `${uid}/photo.${ext}`;
      const { error } = await supabase.storage.from('worker-photos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('worker-photos').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: rpcErr } = await supabase.rpc('update_my_photo', { p_url: url });
      if (rpcErr) throw rpcErr;
      setPhotoUrl(url);
      toast.success('Photo mise à jour');
    } catch {
      toast.error("Échec de l'envoi de la photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openDay = (d: string) => { setSelectedDate(d); setPendingOpen(false); };
  const goHome = () => { setSelectedDate(null); setView('day'); fetchPending(); };
  const goTo = (v: string) => { setSelectedDate(null); setView(v); };

  // Étape 3 (3b-1) : « ouvrir un écran » depuis l'assistant (lib/openers-salarie.ts, chargé à la demande). La page prête ses poignées dans une ref, lue au moment d'ouvrir.
  // Une couche de la journée ouverte (fiche d'heures, documents…) pose `btLayer` dans l'historique : on n'ouvre rien par-dessus.
  const ouvH = useRef<PoigneesSalarie | null>(null);
  ouvH.current = {
    role: user?.role ?? 'worker', formations: trainingsMenu,
    occupe: () => leaveOpen || !!(typeof window !== 'undefined' && window.history.state && (window.history.state as { btLayer?: boolean }).btLayer),
    fermer: () => { setMenuOpen(false); setInfoOpen(false); setScanOpen(false); setPendingOpen(false); },
    jour: openDay, voirFormations: () => goTo('formations'),
  };
  useEffect(() => {
    if (!user) return;
    let off: (() => void) | undefined; let fin = false;
    import('@/lib/openers-salarie').then((m) => { if (!fin) off = m.registerSalarie(ouvH); }, () => { /* hors ligne : rien */ });
    return () => { fin = true; if (off) off(); };
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lot 7 : l'écran que demande une étape du guide. De la NAVIGATION seulement (menu, page, fenêtre
  // « Mes congés » / « Informations ») : jamais un geste qui agit (notifications, photo, scanner).
  const here = useRef({ view, selectedDate });
  here.current = { view, selectedDate };
  const tourStep = (s: GuideStep) => {
    warmAll(); // le guide ne cherche sa cible que 1,5 s : les écrans différés doivent déjà être là
    setMenuOpen(s.ecran === 'menu');
    setHdrHidden(false); // l'en-tête peut porter la cible (votre nom, le scanner)
    const on = (v: string) => here.current.view === v && !here.current.selectedDate;
    if (s.ecran === 'journee') { if (!on('day')) goHome(); }
    else if (s.ecran === 'semaine') { if (!on('week')) goTo('week'); }
    else if (s.ecran === 'mois') { if (!on('month')) goTo('month'); }
    else if (s.ecran === 'historique') { if (!on('history')) goTo('history'); }
    else if (s.ecran === 'conges') setLeaveOpen(true);
    else if (s.ecran === 'infos') setInfoOpen(true);
  };
  const closeTour = () => { tourEnd.current = Date.now(); setTour(null); setMenuOpen(false); };
  // L'assistant s'ouvre : le guide s'arrête (les deux se gêneraient).
  useEffect(() => { if (assistantOpen && tour) closeTour(); }, [assistantOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayLabel = format(new Date(), 'EEEE d MMMM', { locale: fr });
  const isToday = view === 'day' && !selectedDate;
  // « Ma journée » garde le format téléphone ; les écrans hérités (semaine/mois/
  // historique) restent larges sur ordinateur — on ne les bride pas à 480 px.
  const wide = !selectedDate && view !== 'day' && view !== 'formations';
  const headerTitle = selectedDate
    ? format(parseISO(selectedDate), 'EEEE d MMMM', { locale: fr })
    : (ALL_TABS.find((t) => t.value === view)?.label || 'Ma journée');

  /**
   * UN SEUL BANDEAU : « à envoyer ».
   *
   * Il y en avait deux, et un même jour pouvait être dans les DEUX : une journée
   * planifiée portant des heures non envoyées était comptée une fois comme
   * « saisie mais pas envoyée » et une fois comme « oubliée à déclarer », parce
   * que `computeMissingDays` ne considère « déclaré » que `submitted` /
   * `validated`. Vérifié en base avant d'y toucher : pour un salarié réel,
   * 4 journées d'un côté, 1 de l'autre, et le 18/09 dans les deux.
   *
   * Pour le salarié la distinction n'existait pas de toute façon : dans les deux
   * cas il lui reste le même geste à faire, et c'est celui écrit sur le bouton.
   * Le bandeau emploie donc EXACTEMENT le mot du bouton — envoyer — et l'union
   * des deux ensembles, dédoublonnée par date.
   *
   * Les plus récentes d'abord : c'est aujourd'hui et hier qu'on rattrape, pas un
   * jour d'il y a six semaines.
   */
  const toSend = Array.from(new Set([...unsentDays, ...pending])).sort((a, b) => b.localeCompare(a));

  /**
   * UNE SEULE JOURNÉE → on l'ouvre. Pas de liste.
   *
   * Une liste d'un seul élément demande deux gestes pour arriver au même
   * endroit, et c'est exactement le geste que cette étape supprime. La date est
   * nommée dans le bandeau, donc il n'y a rien à découvrir en l'ouvrant : le
   * salarié sait déjà de quel jour on parle avant de toucher l'écran.
   *
   * La forme au singulier n'est pas nouvelle — l'ancien bandeau disait déjà
   * « journée du 18 septembre saisie mais pas envoyée ». On garde la phrase,
   * on change le vocabulaire.
   */
  // Coque v2 : la note de l'en-tête (« Mardi 13 à envoyer · Ouvrir › ») montre les AUTRES jours à envoyer (le jour affiché a déjà son bouton « Envoyer ma journée »).
  const jourNote = selectedDate || format(new Date(), 'yyyy-MM-dd');
  const toSendShown = ui2 ? toSend.filter((d) => d !== jourNote) : toSend;
  const jourCourt = (d: string) => { const t = format(parseISO(d), 'EEEE d', { locale: fr }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const toSendBanner = toSendShown.length === 1 ? (
    ui2 ? (
      <NoteEntete texte={`${jourCourt(toSendShown[0])} à envoyer`} label={`Journée du ${format(parseISO(toSendShown[0]), 'd MMMM', { locale: fr })} à envoyer`} onClick={() => openDay(toSendShown[0])} />
    ) : (
    <button
      className="bt-alert"
      onClick={() => openDay(toSendShown[0])}
      aria-label={`Journée du ${format(parseISO(toSendShown[0]), 'd MMMM', { locale: fr })} à envoyer`}
    >
      <span className="bt-alert-badge">1</span>
      <span className="bt-alert-txt">
        journée du {format(parseISO(toSendShown[0]), 'd MMMM', { locale: fr })} à envoyer
      </span>
      <span className="bt-alert-chev">›</span>
    </button>
    )
  ) : toSendShown.length > 1 ? (
    <Popover open={pendingOpen} onOpenChange={setPendingOpen}>
      <PopoverTrigger asChild>
        {ui2 ? (
          <NoteEntete texte={`${toSendShown.length} journées à envoyer`} label="Journées à envoyer" />
        ) : (
        <button className="bt-alert" aria-label="Journées à envoyer">
          <span className="bt-alert-badge">{toSendShown.length}</span>
          <span className="bt-alert-txt">journées à envoyer</span>
          <span className="bt-alert-chev">›</span>
        </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 bt-skin">
        <p className="text-sm font-medium mb-2">Journées à envoyer</p>
        <div className="space-y-1.5">
          {toSendShown.map((d) => (
            <button
              key={d}
              onClick={() => openDay(d)}
              className="w-full truncate rounded-md border px-3 py-2.5 text-left text-sm font-medium capitalize hover:bg-muted/50 transition-colors"
            >
              {format(parseISO(d), 'EEEE d MMMM', { locale: fr })}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  ) : null;

  // Lot 11 : « ⚠ N réserves à lever › » — même habillage, liste + formulaire.
  // (Rien à l'écran tant qu'il n'y en a pas : le composant ne rend rien.)
  const reservesBanner = <WorkerReserves items={reserves} onChanged={fetchPending} />;
  // Formations : « 2 formations à voir › » tant qu'il en reste à cocher « Vue ».
  const trainingsBanner = <TrainingsBanner count={trainings.unseen} onOpen={() => goTo('formations')} />;

  // Lignes qui n'ont pas encore atteint le serveur (réseau coupé au moment de
  // l'ajout). Même habillage que le bandeau « à envoyer ».
  const offlineBanner = offlineCount > 0 ? (
    <button
      className="bt-alert"
      onClick={() => syncNow(true)}
      disabled={offlineSyncing}
      aria-label="Chantiers pas encore partis"
    >
      <span className="bt-alert-badge">{offlineCount}</span>
      <span className="bt-alert-txt">
        {offlineSyncing
          ? 'Envoi en cours…'
          : offlineBlocked > 0
            ? `chantier${offlineCount > 1 ? 's' : ''} qui ne part${offlineCount > 1 ? 'ent' : ''} pas — appuyer pour réessayer`
            : `chantier${offlineCount > 1 ? 's' : ''} pas encore parti${offlineCount > 1 ? 's' : ''} — appuyer pour envoyer`}
      </span>
      <span className="bt-alert-chev">↻</span>
    </button>
  ) : null;

  // Coque v2 : la bande de la semaine du jour affiché, et les repères de l'en-tête et de la barre du bas.
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const bande = ui2 ? bandeJours(selectedDate || todayIso, todayIso, new Map(Object.entries(joursBrut))) : [];
  const jourAffiche = selectedDate || todayIso;
  const etatAffiche = ui2 ? etatJour({ date: jourAffiche, ...(joursBrut[jourAffiche] ?? { lignes: [] }) }) : 'vide';
  const ongletActif: OngletBas | null = selectedDate || view === 'day' ? 'day' : view === 'week' ? 'week' : view === 'month' ? 'month' : 'plus';
  // Les 7 barres de la carte Total : les minutes notées de chaque jour de la semaine affichée (les mêmes lectures que la bande).
  const barres: BarreJour[] | undefined = ui2 ? bande.map((c) => ({
    date: c.date, jour: c.jour, etat: c.etat, aujourdhui: c.aujourdhui, affiche: c.affiche, prevu: prevuMin[c.date],
    minutes: (joursBrut[c.date]?.lignes ?? []).reduce((t, l) => t + (Number((l as { total_minutes?: number | null }).total_minutes) || 0), 0),
  })) : undefined;
  const allerOnglet = (o: OngletBas) => { if (o === 'day') goHome(); else if (o === 'plus') setMenuOpen(true); else goTo(o); };

  return (
    <div className={`bt-poseur${ui2 ? ' bt-ui2' : ''}`}>
      <div ref={phoneRef} className={`bt-phone${wide ? ' wide' : ''}`}>

        {/* ===== EN-TÊTE NOIR ===== */}
        <header ref={hdrRef} className={`bt-phdr${hdrHidden ? ' is-hidden' : ''}`}>
          <div className="bt-phdr-row">
            <div className="bt-phdr-left">
              <img src="/favicon.svg" alt="BEMEXO" className="bt-phdr-logo" />
              {isToday ? (
                <div>
                  {ui2 && <Kicker date={todayIso} aujourdhui etat={etatAffiche} />}
                  <div className="bt-phdr-date">{todayLabel}</div>
                </div>
              ) : (
                <button onClick={goHome} className="bt-phdr-back" aria-label="Retour à ma journée">
                  <ArrowLeft className="h-5 w-5 shrink-0" />
                  <span className="bt-phdr-date truncate">{headerTitle}</span>
                </button>
              )}
            </div>

            {kioskOn && !ui2 && (
              <button type="button" className="bt-phdr-scan" onPointerDown={() => QrScanner.preload()} onClick={() => setScanOpen(true)} aria-label="Scanner la borne" data-testid="scan-open" data-guide="entete.scanner">
                <ScanLine className="h-5 w-5" />
              </button>
            )}
            {/* Coque v2 : le ✦ jaune rond, à gauche de l'avatar, ouvre l'assistant existant en un seul geste (même `setAssistantOpen` que l'ancien bouton de la barre du bas). */}
            {ui2 && (aiOn || demoSalarie) && <BoutonAssistant onClick={() => setAssistantOpen(true)} />}
            {/* Identité du salarié = déclencheur du menu (nom + rond photo/initiales). */}
            <input type="file" accept="image/*" hidden ref={photoInputRef} onChange={(e) => onPickPhoto(e.target.files?.[0])} />
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button className="bt-phdr-id" aria-label="Mon compte et menu" data-guide="menu.compte">
                  <span className="bt-phdr-id-name">{user?.first_name}<span className="bt-phdr-id-last">{user?.last_name ? ` ${user.last_name}` : ''}</span></span>
                  <span className="bt-phdr-id-av">
                    {photoUrl ? <img src={photoUrl} alt="" /> : <span className="bt-phdr-id-ini">{(user?.first_name?.[0] || '')}{(user?.last_name?.[0] || '')}</span>}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 bt-skin"
                // Lot 7 : pendant un guide, la fermeture du menu ne rend pas le focus au bouton du nom (il quitterait la carte du guide).
                onCloseAutoFocus={(e) => { if (tour || Date.now() - tourEnd.current < 800) e.preventDefault(); }}>
                <div className="bt-phdr-menuhead">
                  <span className="bt-phdr-menuhead-av">
                    {photoUrl ? <img src={photoUrl} alt="" /> : <span className="bt-phdr-id-ini">{(user?.first_name?.[0] || '')}{(user?.last_name?.[0] || '')}</span>}
                  </span>
                  <span className="bt-phdr-menuhead-name">{user?.first_name} {user?.last_name}</span>
                </div>
                <DropdownMenuItem data-guide="menu.photo" onSelect={(e) => { e.preventDefault(); photoInputRef.current?.click(); }}>
                  {uploadingPhoto ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />} Changer ma photo
                </DropdownMenuItem>
                <DropdownMenuItem data-guide="menu.conges" onClick={() => setLeaveOpen(true)}>
                  <Palmtree className="h-4 w-4 mr-2" /> Mes congés
                </DropdownMenuItem>
                {aiOn && (
                  <DropdownMenuItem onClick={() => setAssistantOpen(true)}>
                    <Sparkles className="h-4 w-4 mr-2" /> Assistant BEMEXO
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem data-guide="menu.infos" onClick={() => setInfoOpen(true)}>
                  <Info className="h-4 w-4 mr-2" /> Informations
                </DropdownMenuItem>
                {/* Masqué si l'appareil ne gère pas le push (iOS hors écran d'accueil,
                    navigateur ancien) : inutile d'afficher un bouton qui ne peut rien faire. */}
                {pushState !== 'unsupported' && (
                  <DropdownMenuItem data-guide="menu.notifications" onSelect={(e) => { e.preventDefault(); if (!pushBusy) togglePush(); }}>
                    {pushBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : pushState === 'on' ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
                    {pushState === 'on' ? 'Couper les notifications'
                      : pushState === 'denied' ? 'Notifications bloquées' : 'Activer les notifications'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {TABS.map((t) => (
                  <DropdownMenuItem key={t.value} data-guide={MENU_GUIDE[t.value]} onClick={() => goTo(t.value)}>
                    <t.icon className="h-4 w-4 mr-2" /> {t.label}
                    {!selectedDate && view === t.value && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
                {trainingsMenu && (
                  <DropdownMenuItem onClick={() => goTo('formations')} data-testid="menu-formations">
                    <GraduationCap className="h-4 w-4 mr-2" /> Formations
                    {trainings.unseen > 0 && <span className="ml-auto rounded-full bg-[#B5472E] px-1.5 text-[10.5px] font-extrabold leading-[17px] text-white" data-testid="menu-formations-badge">{trainings.unseen}</span>}
                    {!selectedDate && view === 'formations' && <Check className={`h-4 w-4 ${trainings.unseen > 0 ? 'ml-1.5' : 'ml-auto'}`} />}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Déconnexion</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {ui2 && (isToday || selectedDate) && <BandeJours jours={bande} onSelect={openDay} />}
          {ui2 && (isToday || selectedDate) && toSendBanner}
        </header>

        {/* ===== CORPS ===== */}
        <div className="bt-phbody">
          {selectedDate ? (
            <PoseurDay key={dayKey} date={selectedDate} topBanner={ui2 ? <>{offlineBanner}<div className="dz-rappels">{reservesBanner}{trainingsBanner}</div></> : offlineBanner} onAssistant={aiOn && !ui2 ? () => setAssistantOpen(true) : undefined} semaine={barres} onScan={ui2 && kioskOn ? () => setScanOpen(true) : undefined} onScanWarm={() => QrScanner.preload()} />
          ) : view === 'day' ? (
            <PoseurDay key={dayKey} topBanner={ui2 ? <>{offlineBanner}<div className="dz-rappels">{reservesBanner}{trainingsBanner}</div></> : <>{offlineBanner}{toSendBanner}{reservesBanner}{trainingsBanner}</>} onAssistant={aiOn && !ui2 ? () => setAssistantOpen(true) : undefined} semaine={barres} onScan={ui2 && kioskOn ? () => setScanOpen(true) : undefined} onScanWarm={() => QrScanner.preload()} />
          ) : (
            <div className="bt-phscroll bt-skin">
              {view === 'formations' ? (
                <PoseurTrainings items={trainings.items} companyId={user?.company_id} onPatch={trainings.patch} />
              ) : view === 'week' ? (
                <PoseurWeek onSelectDay={openDay} />
              ) : view === 'month' ? (
                <PoseurMonth onSelectDay={openDay} />
              ) : (
                <PoseurHistory />
              )}
            </div>
          )}
        </div>

        {ui2 && <OngletsBas actif={ongletActif} onGo={allerOnglet} badgePlus={(reserves.length > 0 ? 1 : 0) + (trainings.unseen > 0 ? 1 : 0)} />}

        <LeaveRequestDialog open={leaveOpen} onOpenChange={setLeaveOpen} userId={user?.id} />
        {/* Lot 12 : un QR fixe (/pointer#f=…) s'ouvre par une vraie navigation, pour que la page lise le fragment. */}
        {scanOpen && <QrScanner onClose={() => setScanOpen(false)} onPath={(path) => { setScanOpen(false); if (path.includes('#')) window.location.assign(path); else router.push(path); }} />}
        {infoOpen && (
          <div className="bt-info-bg" role="dialog" aria-modal="true" aria-label="Informations" onClick={() => setInfoOpen(false)}>
            <div className="bt-info" onClick={(e) => e.stopPropagation()}>
              <h2><Info className="h-4 w-4" /> Informations</h2>
              <h3>{GEO_INFO_TITLE}</h3>
              <p>{GEO_INFO_TEXT}</p>
              <a href={GEO_INFO_LINK}>Politique de confidentialité</a>
              <button type="button" onClick={() => setInfoOpen(false)} data-guide="infos.fermer">Fermer</button>
            </div>
          </div>
        )}
        {(aiOn || demoSalarie) && <WorkerAssistant
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          onSaved={() => { setDayKey((k) => k + 1); fetchPending(); }}
          onNavigate={(a) => {
            if (a === 'journee') goHome();
            else if (a === 'semaine') goTo('week');
            else if (a === 'mois') goTo('month');
            else if (a === 'historique') goTo('history');
            else if (a === 'conges') setLeaveOpen(true);
            else if (a === 'notifications') { if (pushState !== 'on' && pushState !== 'unsupported' && !pushBusy) togglePush(); }
            else if (a === 'photo') photoInputRef.current?.click();
            else if (a === 'borne') setScanOpen(true);
            else if (a === 'infos') setInfoOpen(true);
            // Lot 7 : « Me guider pas à pas » — l'assistant se replie, le guide entoure le vrai bouton. Fiche inconnue : rien.
            else if (tourIdOf(a)) { const t = findWorkerTour(tourIdOf(a)!); if (t) { setAssistantOpen(false); setTour(t); } }
          }}
        />}
        {tour && (
          <GuideTour
            key={tour.id}
            steps={tour.etapes}
            onStepEnter={tourStep}
            onClose={closeTour}
            returnFocus={() => document.querySelector<HTMLElement>('[data-guide="journee.assistant"]')}
          />
        )}
      </div>
    </div>
  );
}
