'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock, CalendarDays, CalendarRange, History, LogOut, Check, ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { computeMissingDays } from '@/lib/work-status';
import PoseurDay from '@/components/poseur-day';
import PoseurWeek from '@/components/poseur-week';
import PoseurMonth from '@/components/poseur-month';
import PoseurHistory from '@/components/poseur-history';

const TABS = [
  { value: 'day', label: 'Ma journée', icon: Clock },
  { value: 'week', label: 'Ma semaine', icon: CalendarDays },
  { value: 'month', label: 'Mon mois', icon: CalendarRange },
  { value: 'history', label: 'Historique', icon: History },
];

const POSEUR_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');

.bt-poseur{font-family:'Archivo',sans-serif;color:#15120F;-webkit-font-smoothing:antialiased;background:#e7e0d2;display:flex;justify-content:center;height:100vh;height:100svh;height:100dvh;overflow:hidden}
.bt-poseur *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.bt-poseur .mono{font-family:'JetBrains Mono',monospace}
.bt-phone{width:100%;max-width:480px;height:100%;display:flex;flex-direction:column;background:#F2EDE3;overflow:hidden;position:relative}
.bt-phone.wide{max-width:920px}

/* ===== EN-TÊTE NOIR ===== */
.bt-phdr{background:#15120F;color:#F2EDE3;flex:none;padding:calc(env(safe-area-inset-top) + 12px) 16px 12px;position:relative;z-index:30;margin-bottom:calc(-1 * var(--phdr-h, 132px));transition:transform .3s cubic-bezier(.33,.72,0,1);will-change:transform}
.bt-phdr.is-hidden{transform:translateY(-100%)}
@media (prefers-reduced-motion:reduce){.bt-phdr{transition:none}}
.bt-phdr-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.bt-phdr-left{display:flex;align-items:center;gap:10px;min-width:0}
.bt-phdr-logo{width:32px;height:32px;flex:none;display:block}
.bt-phdr-date{font-size:22px;font-weight:900;letter-spacing:-.02em;line-height:1.1;text-transform:capitalize;min-width:0}
.bt-phdr-back{display:flex;align-items:center;gap:10px;background:transparent;border:none;color:#F2EDE3;cursor:pointer;padding:0;text-align:left;min-width:0}
/* Bouton identité (nom + rond photo/initiales) = déclencheur du menu */
.bt-phdr-id{display:inline-flex;align-items:center;gap:9px;flex:none;max-width:62%;background:transparent;border:none;cursor:pointer;font-family:inherit;padding:3px 3px 3px 11px;border-radius:999px;transition:background .14s ease}
.bt-phdr-id:hover{background:rgba(242,237,227,.08)}
.bt-phdr-id:active{background:rgba(242,237,227,.15)}
.bt-phdr-id-name{font-size:14px;font-weight:800;color:#F2EDE3;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.bt-phdr-id-last{display:none}
.bt-phdr-id-av{width:32px;height:32px;border-radius:50%;flex:none;overflow:hidden;background:#2a2620;border:1.5px solid rgba(242,237,227,.4);display:flex;align-items:center;justify-content:center}
.bt-phdr-id-av img{width:100%;height:100%;object-fit:cover;display:block}
.bt-phdr-id-ini{font-family:'Archivo',sans-serif;font-weight:800;font-size:13px;color:#FFC21A;line-height:1}
@media (min-width:768px){.bt-phdr-id-last{display:inline}}
/* En-tête du menu : photo/initiales + nom complet */
.bt-phdr-menuhead{display:flex;align-items:center;gap:10px;padding:9px 8px 11px}
.bt-phdr-menuhead-av{width:38px;height:38px;border-radius:50%;flex:none;overflow:hidden;background:#15120F;display:flex;align-items:center;justify-content:center}
.bt-phdr-menuhead-av img{width:100%;height:100%;object-fit:cover;display:block}
.bt-phdr-menuhead-name{font-size:14.5px;font-weight:800;color:#15120F;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.bt-alert{display:flex;align-items:center;gap:9px;margin-top:14px;width:100%;background:rgba(255,194,26,.13);border:1px solid rgba(255,194,26,.4);border-radius:11px;padding:10px 13px;cursor:pointer;text-align:left}
.bt-alert-badge{width:22px;height:22px;flex:none;background:#FFC21A;color:#15120F;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;font-family:'JetBrains Mono',monospace}
.bt-alert-txt{font-size:13.5px;font-weight:700;color:#FFC21A;flex:1}
.bt-alert-chev{font-size:16px;color:#FFC21A}

/* ===== CORPS ===== */
.bt-phbody{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.bt-phscroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(var(--phdr-h, 132px) + 16px) 16px 16px}

/* ============================================================
   .bt-skin — même thème noir/jaune que le reste du produit (admin,
   fenêtres). Appliqué aux écrans hérités semaine/mois/historique et aux
   menus déroulants (portails Radix) : on surcharge les variables shadcn
   pour que Card/Button/Badge et les couleurs « primaires » deviennent
   crème + jaune + noir, au lieu du thème bleu par défaut.
   ============================================================ */
.bt-skin{
  --background:40 33% 95%;
  --foreground:36 16% 7%;
  --card:0 0% 100%;
  --card-foreground:36 16% 7%;
  --popover:40 33% 96%;
  --popover-foreground:36 16% 7%;
  --primary:43 100% 55%;
  --primary-foreground:36 16% 7%;
  --secondary:40 24% 90%;
  --secondary-foreground:36 16% 12%;
  --muted:40 22% 91%;
  --muted-foreground:40 6% 42%;
  --accent:42 58% 88%;
  --accent-foreground:36 16% 12%;
  --destructive:14 72% 44%;
  --destructive-foreground:40 33% 97%;
  --border:38 16% 82%;
  --input:38 16% 80%;
  --ring:43 100% 55%;
  font-family:'Archivo',sans-serif;
}
.bt-skin .mono,.bt-skin .tabular{font-variant-numeric:tabular-nums}
`;

export default function PoseurPage() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState('day');
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // declare a specific day
  const [pending, setPending] = useState<string[]>([]); // days "en attente"
  const [pendingOpen, setPendingOpen] = useState(false); // "jours à déclarer" popover
  const [photoUrl, setPhotoUrl] = useState(''); // photo de profil du salarié (facultatif)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Smart header (mobile) : refs + état de rétraction. Purement visuel.
  const phoneRef = useRef<HTMLDivElement>(null);
  const hdrRef = useRef<HTMLElement>(null);
  const [hdrHidden, setHdrHidden] = useState(false);

  const fetchPending = useCallback(async () => {
    if (!user) return;
    // Look back far enough to catch any planned-but-not-declared day still open.
    const windowStart = format(subDays(new Date(), 60), 'yyyy-MM-dd');
    const [planRes, entRes] = await Promise.all([
      supabase.from('planning').select('work_date, absence_type').eq('user_id', user.id).gte('work_date', windowStart),
      supabase.from('time_entries').select('work_date').eq('user_id', user.id).in('status', ['submitted', 'validated']).gte('work_date', windowStart),
    ]);
    const rows = (planRes.data || []) as { work_date: string; absence_type: string | null }[];
    const absenceDays = new Set(rows.filter((p) => p.absence_type).map((p) => p.work_date));
    const planned = rows.filter((p) => !p.absence_type && !absenceDays.has(p.work_date)).map((p) => p.work_date);
    const declared = new Set<string>((entRes.data || []).map((e: { work_date: string }) => e.work_date));
    setPending(computeMissingDays(planned, declared));
  }, [user]);

  useEffect(() => {
    fetchPending();
    const id = setInterval(fetchPending, 60000);
    return () => clearInterval(id);
  }, [fetchPending]);

  // Photo de profil du salarié (depuis users.photo_url).
  useEffect(() => { setPhotoUrl(user?.photo_url || ''); }, [user?.photo_url]);

  // ===== Smart header : se rétracte quand on descend, revient quand on remonte =====
  // Purement cosmétique. Écoute le scroll en phase capture → couvre TOUS les scrollers
  // internes (Ma journée, semaine, mois, historique) sans toucher à leur code.
  useEffect(() => {
    const phone = phoneRef.current;
    const hdr = hdrRef.current;
    if (!phone || !hdr) return;
    let phdrH = hdr.offsetHeight;
    const measure = () => { phdrH = hdr.offsetHeight; phone.style.setProperty('--phdr-h', `${phdrH}px`); };
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
        if (acc >= 56 && y >= phdrH) { setHidden(true); acc = 0; lockUntil = performance.now() + 340; } // cache une fois le contenu descendu SOUS l'en-tête (superposition GPU : jamais de trou)
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

  const todayLabel = format(new Date(), 'EEEE d MMMM', { locale: fr });
  const isToday = view === 'day' && !selectedDate;
  // « Ma journée » garde le format téléphone ; les écrans hérités (semaine/mois/
  // historique) restent larges sur ordinateur — on ne les bride pas à 480 px.
  const wide = !selectedDate && view !== 'day';
  const headerTitle = selectedDate
    ? format(parseISO(selectedDate), 'EEEE d MMMM', { locale: fr })
    : (TABS.find((t) => t.value === view)?.label || 'Ma journée');

  return (
    <div className="bt-poseur">
      <style dangerouslySetInnerHTML={{ __html: POSEUR_CSS }} />
      <div ref={phoneRef} className={`bt-phone${wide ? ' wide' : ''}`}>

        {/* ===== EN-TÊTE NOIR ===== */}
        <header ref={hdrRef} className={`bt-phdr${hdrHidden ? ' is-hidden' : ''}`}>
          <div className="bt-phdr-row">
            <div className="bt-phdr-left">
              <img src="/favicon.svg" alt="BEMEXO" className="bt-phdr-logo" />
              {isToday ? (
                <div className="bt-phdr-date">{todayLabel}</div>
              ) : (
                <button onClick={goHome} className="bt-phdr-back" aria-label="Retour à ma journée">
                  <ArrowLeft className="h-5 w-5 shrink-0" />
                  <span className="bt-phdr-date truncate">{headerTitle}</span>
                </button>
              )}
            </div>

            {/* Identité du salarié = déclencheur du menu (nom + rond photo/initiales). */}
            <input type="file" accept="image/*" hidden ref={photoInputRef} onChange={(e) => onPickPhoto(e.target.files?.[0])} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="bt-phdr-id" aria-label="Mon compte et menu">
                  <span className="bt-phdr-id-name">{user?.first_name}<span className="bt-phdr-id-last">{user?.last_name ? ` ${user.last_name}` : ''}</span></span>
                  <span className="bt-phdr-id-av">
                    {photoUrl ? <img src={photoUrl} alt="" /> : <span className="bt-phdr-id-ini">{(user?.first_name?.[0] || '')}{(user?.last_name?.[0] || '')}</span>}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 bt-skin">
                <div className="bt-phdr-menuhead">
                  <span className="bt-phdr-menuhead-av">
                    {photoUrl ? <img src={photoUrl} alt="" /> : <span className="bt-phdr-id-ini">{(user?.first_name?.[0] || '')}{(user?.last_name?.[0] || '')}</span>}
                  </span>
                  <span className="bt-phdr-menuhead-name">{user?.first_name} {user?.last_name}</span>
                </div>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); photoInputRef.current?.click(); }}>
                  {uploadingPhoto ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />} Changer ma photo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {TABS.map((t) => (
                  <DropdownMenuItem key={t.value} onClick={() => goTo(t.value)}>
                    <t.icon className="h-4 w-4 mr-2" /> {t.label}
                    {!selectedDate && view === t.value && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Déconnexion</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* alerte discrète : jours à déclarer (uniquement sur « Ma journée » du jour) */}
          {isToday && pending.length > 0 && (
            <Popover open={pendingOpen} onOpenChange={setPendingOpen}>
              <PopoverTrigger asChild>
                <button className="bt-alert" aria-label="Jours à déclarer">
                  <span className="bt-alert-badge">{pending.length}</span>
                  <span className="bt-alert-txt">jour{pending.length > 1 ? 's' : ''} oublié{pending.length > 1 ? 's' : ''} à déclarer</span>
                  <span className="bt-alert-chev">›</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-72 bt-skin">
                <p className="text-sm font-medium mb-2">Jours à déclarer</p>
                <div className="space-y-1.5">
                  {pending.map((d) => (
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
          )}
        </header>

        {/* ===== CORPS ===== */}
        <div className="bt-phbody">
          {selectedDate ? (
            <PoseurDay date={selectedDate} />
          ) : view === 'day' ? (
            <PoseurDay />
          ) : (
            <div className="bt-phscroll bt-skin">
              {view === 'week' ? (
                <PoseurWeek onSelectDay={openDay} />
              ) : view === 'month' ? (
                <PoseurMonth onSelectDay={openDay} />
              ) : (
                <PoseurHistory />
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
