'use client';

// Design du bureau (v2, `?ui=2`) · « Statistiques » : la page plein écran (niveau 1) et la fiche du salarié (niveau 2), d'après la planche
// docs/design-brief/designer-statistiques (README = la spécification). LECTURE SEULE : rien ne s'écrit d'ici. Deux niveaux au plus ; le seul
// panneau superposé est le détail d'un pilier (tiroir latéral, feuille du bas au téléphone). Ouverte par le même interrupteur que l'ancien popup
// (`statsOpen` d'admin-planning) : barre noire « Statistiques », menu ☰, « Plus ⋯ ». Chargée à la demande (import différé), jamais avec /admin.
// Les chiffres : lib/statistiques-v2.ts (les mêmes lectures et fonctions que le popup du lot 5, le CSV de paie et le cockpit).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  calculerStatsV2, contratTheorique, dowLun, joursSalarie, lireStatsV2, LIB_ABSENCE, MS, periodeV2, somme,
  type Cellule, type JourV2, type Periode, type SalarieV2, type StatsV2, type Vue,
} from '@/lib/statistiques-v2';
import './statistiques-v2.css';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; companyId?: string; initiales?: string }

// ─── Formats (fr-FR) ─────────────────────────────────────────────────────────
const fN = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
/** Heures décimales au centième (pas d'arrondi à la demi-heure : les chiffres restent ceux du planning et de l'export). */
const hN = (min: number) => fN(Math.round((min / 60) * 100) / 100, 2);
const fH = (min: number) => `${hN(min)} h`;
const fJ = (j: number) => `${fN(j, 1)} j`;
const fE = (e: number) => `${fN(Math.round(e))} €`;
const heure = (t: string) => { const [h, m] = t.split(':'); return `${Number(h)} h ${m}`; };
const minDe = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const duree = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);
const DS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const dLab = (iso: string) => `${DS[dowLun(iso)]} ${Number(iso.slice(8, 10))} ${MS[Number(iso.slice(5, 7)) - 1]}`;
const pl = (n: number) => (n > 1 ? 's' : '');
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const H_ABS = 7 * 60; // README §4 : 7 h = 1 jour d'absence (hauteur du segment rayé)
const AV = ['#FFC21A', '#F2EDE3', '#E6D3A8', '#FFE6A3'];
const CH = ['#FFC21A', '#FFE9A8', '#D98E04', '#E9E3D7', '#8C7A5E'];
const SW = { n: 'linear-gradient(180deg,#6C8DFF,#7B4DFF)', s: 'linear-gradient(180deg,#FFB547,#FF4F8B)', a: 'repeating-linear-gradient(135deg,#12A67F 0 2px,rgba(18,166,127,.3) 2px 4px)', o: '#E53935' };
const GOOD = '#1B7F47', BAD = '#B3261E', NEU = '#5B534A';

function niceTop(v: number) { if (v <= 0) return 10; const raw = (v * 1.08) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); const st = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= raw) as number; return st * 4; }
function spark(vals: number[]) {
  if (vals.length < 2) return null;
  const mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * 100, 30 - ((v - mn) / rg) * 26]);
  const line = `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')}`;
  return { line, area: `${line} L100,34 L0,34 Z` };
}
const dPct = (c: number, p: number, upGood: boolean) => { if (!p) return null; const v = ((c - p) / p) * 100; if (Math.abs(v) < 0.5) return { t: '= stable', c: NEU }; return { t: `${v > 0 ? '▲ ' : '▼ '}${fN(Math.abs(v), 1)} %`, c: (v > 0) === upGood ? GOOD : BAD }; };
const dAbs = (c: number, p: number, unit: string) => { const v = c - p; if (Math.abs(v) < 0.5) return { t: '= stable', c: NEU }; return { t: `${v > 0 ? '▲ ' : '▼ '}${fN(Math.abs(v), 1)} ${unit}`, c: v > 0 ? BAD : GOOD }; };
const principal = (m: Map<string, number>) => { let best: string | null = null, v = -1; m.forEach((x, k) => { if (x > v) { v = x; best = k; } }); return best as string | null; };
const fusion = (l: Map<string, number>[]) => { const out = new Map<string, number>(); for (const m of l) m.forEach((v, k) => out.set(k, (out.get(k) || 0) + v)); return out; };

type Etat = 'loading' | 'ok' | 'ko';

export default function StatistiquesV2({ open, onOpenChange, companyId, initiales }: Props) {
  const [today] = useState(todayISO);
  const [vue, setVue] = useState<Vue>('semaine');
  const [off, setOff] = useState(0);
  const [salId, setSalId] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [panel, setPanel] = useState<number | null>(null);
  const [lastPanel, setLastPanel] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [grown, setGrown] = useState(false);
  const [w, setW] = useState(1280);
  const [etat, setEtat] = useState<Etat>('loading');
  const [lu, setData] = useState<StatsV2 | null>(null);
  const [syncAt, setSyncAt] = useState<Date | null>(null);
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, StatsV2>());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Le salarié de la fiche, gardé même sur une période sans données (en-tête).
  const ficheRef = useRef<SalarieV2 | null>(null);

  const per: Periode = useMemo(() => periodeV2(vue, off, today), [vue, off, today]);

  // Largeur du CONTENEUR (README §7).
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback((el: HTMLDivElement | null) => { rootRef.current = el; setRootEl(el); }, []);
  useLayoutEffect(() => {
    if (!rootEl) return;
    setW(rootEl.getBoundingClientRect().width || 1280);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => { const x = es[0].contentRect.width; setW((cur) => (Math.abs(cur - x) > 1 ? x : cur)); });
    ro.observe(rootEl);
    return () => ro.disconnect();
  }, [rootEl]);

  // Lecture : une par période pendant une ouverture ; une période à venir n'a rien à lire.
  useEffect(() => {
    if (!companyId) return;
    const key = `${vue}|${off}`;
    const hit = cache.current.get(key);
    if (hit) { setData(hit); setEtat('ok'); return; }
    if (per.future) { setData(null); setEtat('ok'); return; }
    let stale = false;
    setEtat('loading'); setData(null);
    lireStatsV2(companyId, per).then(
      (brut) => { if (stale) return; const st = calculerStatsV2(brut, per, today); cache.current.set(key, st); setData(st); setSyncAt(new Date()); setEtat('ok'); },
      (err) => { if (stale) return; console.error('Statistiques illisibles :', err); setData(null); setEtat('ko'); },
    );
    return () => { stale = true; };
  }, [companyId, vue, off, per, today, retry]);

  // Montée des piliers à chaque changement de vue, de période ou d'écran.
  useEffect(() => {
    if (etat !== 'ok') { setGrown(false); return; }
    setGrown(false);
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, [etat, vue, off, salId]);

  const reset = () => { setPanel(null); setFocus(null); setOpenDay(null); setHover(null); };
  const go = (p: { vue?: Vue; off?: number; sal?: string | null }) => {
    reset();
    if (p.vue !== undefined) setVue(p.vue);
    if (p.off !== undefined) setOff(p.off);
    if (p.sal !== undefined) { setSalId(p.sal); scrollRef.current?.scrollTo({ top: 0 }); }
  };

  const mob = w < 720, wide = w >= 1080, nav = w >= 900;
  const t = mob ? 'm' : wide ? 'd' : 't';
  // Les chiffres lus valent pour LEUR période : entre deux périodes (rendu avant la nouvelle lecture), on montre le chargement.
  const data = lu && lu.per.vue === vue && lu.per.off === off ? lu : null;
  const loading = etat === 'loading' || (etat === 'ok' && !data && !per.future);
  const sal = data && salId ? data.salaries.find((s) => s.id === salId) || null : null;
  if (sal) ficheRef.current = sal;
  const fiche = salId != null;
  const fm = fiche ? (sal || ficheRef.current) : null;
  const scope: SalarieV2[] = useMemo(() => (data ? (salId ? data.salaries.filter((s) => s.id === salId) : data.salaries) : []), [data, salId]);
  const B: Cellule[] = useMemo(() => per.piliers.map((_, i) => somme(scope.map((s) => s.cells[i]))), [per, scope]);
  const T = useMemo(() => somme(B), [B]);
  const Tp = useMemo(() => somme(scope.map((s) => s.prev)), [scope]);
  const has = etat === 'ok' && !!data && (T.m + T.abs + T.oub) > 0;
  const cout = !!data && data.coutActif;
  const pricedScope = scope.filter((s) => s.cost != null);
  const coutVisible = cout && pricedScope.length > 0;
  const partiel = coutVisible && scope.some((s) => s.cost == null && s.tot.m > 0);
  const past = per.piliers.map((b, i) => (!b.future ? i : -1)).filter((i) => i >= 0);
  const nAbs = scope.filter((s) => s.tot.abs > 0).length, nOub = scope.filter((s) => s.tot.oub > 0).length;

  const kpis = [
    { id: 'heures', label: 'HEURES TOTALES', value: hN(T.m), unit: 'h', sw: SW.n, swR: '4px', color: '#5B5BFF', vals: past.map((i) => B[i].m), d: dPct(T.m, Tp.m, true), sub: `sur ${hN(T.con)} h prévues · ${per.cmp}`, cost: coutVisible ? `${fE(pricedScope.reduce((x, s) => x + (s.cost || 0), 0))}${partiel ? ' · partiel' : ''}` : null },
    { id: 'sup', label: 'HEURES SUP.', value: hN(T.s), unit: 'h', sw: SW.s, swR: '4px', color: '#E0306F', vals: past.map((i) => B[i].s), d: dPct(T.s, Tp.s, false), sub: `${T.m ? fN((T.s / T.m) * 100, 1) : 0} % des heures`, cost: null },
    { id: 'absences', label: 'ABSENCES', value: fN(T.abs, 1), unit: 'j', sw: SW.a, swR: '4px', color: '#12A67F', vals: past.map((i) => B[i].abs), d: dAbs(T.abs, Tp.abs, 'j'), sub: `${nAbs} salarié${pl(nAbs)} concerné${pl(nAbs)}`, cost: null },
    { id: 'oublis', label: 'OUBLIS DE POINTAGE', value: fN(T.oub), unit: 'j à relancer', sw: SW.o, swR: '50%', color: '#E53935', vals: past.map((i) => B[i].oub), d: dAbs(T.oub, Tp.oub, 'j'), sub: T.oub ? `chez ${nOub} salarié${pl(nOub)}` : 'Tout est à jour', cost: null },
  ];

  // Échelle du graphique (heures).
  const ghostOf = (i: number) => contratTheorique(per.piliers[i], scope);
  const mx = Math.max(0, ...per.piliers.map((b, i) => { const x = B[i]; return Math.max(x.n + x.s + x.abs * H_ABS, x.con, b.future ? ghostOf(i) : 0) / 60; }));
  const top = niceTop(mx);
  const pct = (min: number) => `${(min / 60 / top) * 100}%`;
  const activeIdx = hover != null ? hover : fiche ? focus : panel;

  // Classement.
  const qq = sansAccent(q.trim());
  const R = useMemo(() => [...(data?.salaries || [])].sort((a, b) => (b.tot.m - a.tot.m) || a.name.localeCompare(b.name, 'fr')), [data]);
  const avOf = useMemo(() => new Map((data?.salaries || []).map((s, i) => [s.id, AV[i % 4]])), [data]);
  const rmax = Math.max(1, ...R.map((s) => s.tot.n + s.tot.s + s.tot.abs * H_ABS));
  const Rf = R.filter((s) => !qq || sansAccent(s.name).includes(qq));
  const lim = mob ? 5 : 8;
  const shown = showAll || qq ? Rf : Rf.slice(0, lim);
  const N = R.length;

  // Anneau « Où vont les heures ».
  const chMap = useMemo(() => fusion(scope.flatMap((s) => s.chantiers)), [scope]);
  const chSum = Array.from(chMap.values()).reduce((a, b) => a + b, 0);
  const chs = useMemo(() => {
    const l = Array.from(chMap.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ name: data?.worksites.get(id) || 'Chantier', v }));
    const out = l.length > 5 ? [...l.slice(0, 4), { name: `Autres chantiers (${l.length - 4})`, v: l.slice(4).reduce((x, c) => x + c.v, 0) }] : l;
    return out.map((c, i) => ({ ...c, color: CH[i] }));
  }, [chMap, data]);
  const conic = useMemo(() => {
    let acc = 0; const stops: string[] = [];
    chs.forEach((c) => { const a = (acc / chSum) * 100, b = ((acc + c.v) / chSum) * 100; stops.push(`${c.color} ${a.toFixed(2)}% ${Math.max(a, b - 0.8).toFixed(2)}%`, `#1B1713 ${Math.max(a, b - 0.8).toFixed(2)}% ${b.toFixed(2)}%`); acc += c.v; });
    return chSum > 0 ? `conic-gradient(${stops.join(',')})` : '#2A241E';
  }, [chs, chSum]);

  // Fiche : jours.
  const jours: JourV2[] = useMemo(() => (data && sal && has ? joursSalarie(data, sal, per.from, per.to) : []), [data, sal, has, per]);

  const close = () => onOpenChange(false);
  const tab = (id: Vue, label: string) => (
    <button key={id} type="button" aria-pressed={vue === id} data-testid={`sx-vue-${id}`} onClick={() => { if (vue !== id) go({ vue: id, off: 0 }); }}>{label}</button>
  );
  const sync = syncAt ? `DONNÉES AU ${syncAt.getDate()} ${MS[syncAt.getMonth()].toUpperCase()} · ${String(syncAt.getHours()).padStart(2, '0')}:${String(syncAt.getMinutes()).padStart(2, '0')}` : '';

  const onEsc = (e: KeyboardEvent) => {
    if (panel != null) { e.preventDefault(); setPanel(null); return; }
    if (fiche) { e.preventDefault(); go({ sal: null }); }
  };

  const rootStyle = { '--plot-h': mob ? '220px' : '320px' } as CSSProperties;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={setRoot} className="sx" data-t={t} data-vue={vue} style={rootStyle} data-testid="stats-v2"
          data-niveau={fiche ? '2' : '1'} data-etat={loading ? 'loading' : etat} data-periode={`${per.from}|${per.to}`} aria-describedby={undefined}
          onEscapeKeyDown={onEsc} onOpenAutoFocus={(e) => { e.preventDefault(); rootRef.current?.focus(); }}
        >
          <DialogPrimitive.Title className="sx-sr">{fiche && fm ? `Statistiques · ${fm.name}` : 'Statistiques'}</DialogPrimitive.Title>
          <div className="sx-scroll" ref={scrollRef} data-testid="sx-scroll">
            <header className="sx-head">
              <div className="sx-head__g">
                <button type="button" className="sx-logo" onClick={close} aria-label="Revenir au planning">BEME<span>X</span>O</button>
                {nav && (
                  <nav className="sx-nav" aria-label="Bureau">
                    <button type="button" onClick={close} data-testid="sx-planning">Planning</button>
                    <button type="button" aria-current="page">Statistiques</button>
                  </nav>
                )}
              </div>
              <div className="sx-head__d">
                {!mob && <span className="sx-sync sx-mono" data-testid="sx-sync">{sync}</span>}
                {initiales && <span className="sx-av" aria-hidden>{initiales}</span>}
                {!nav && <button type="button" className="sx-close" onClick={close} aria-label="Fermer les statistiques" data-testid="sx-fermer">✕</button>}
              </div>
            </header>

            <div className="sx-main">
              <div className="sx-top">
                {!fiche ? (
                  <div className="sx-ctitle">
                    <span className="sx-kick sx-mono">TABLEAU DE BORD · LECTURE SEULE</span>
                    <h1 className="sx-h1">Statistiques</h1>
                  </div>
                ) : (
                  <div className="sx-fh">
                    <button type="button" className="sx-back" onClick={() => go({ sal: null })} data-testid="sx-retour"><span aria-hidden>←</span>Retour aux statistiques</button>
                    {fm && (
                      <div className="sx-fid">
                        <span className="sx-fav" style={{ background: avOf.get(fm.id) || '#FFC21A' }} aria-hidden>{fm.ini}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                          <h1 className="sx-fname" data-testid="sx-fiche-nom">{fm.name}</h1>
                          <div className="sx-frole">
                            <span>{fm.role}</span>
                            {has && (
                              <span className="sx-chip" style={{ background: T.oub ? '#FCE4E1' : '#E2F3EA', color: T.oub ? '#8E1B14' : '#14613A' }}>
                                <i style={{ background: T.oub ? '#E53935' : '#1B7F47' }} />{T.oub ? `${T.oub} j en attente` : 'À jour'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="sx-ctrl">
                  <div className="sx-seg" role="group" aria-label="Période">{tab('semaine', 'Semaine')}{tab('mois', 'Mois')}{tab('annee', 'Année')}</div>
                  <div className="sx-navp">
                    <button type="button" className="sx-rond" aria-label="Période précédente" data-testid="sx-prec" onClick={() => go({ off: off - 1 })}>←</button>
                    <button type="button" className="sx-rond" aria-label="Période suivante" data-testid="sx-suiv" onClick={() => go({ off: off + 1 })}>→</button>
                    <button type="button" className="sx-auj" aria-disabled={off === 0} data-testid="sx-auj" onClick={() => { if (off !== 0) go({ off: 0 }); }}>Aujourd&apos;hui</button>
                  </div>
                </div>
              </div>

              <div className="sx-per">
                <span className="sx-per__t" data-testid="sx-titre">{per.title}</span>
                <span className="sx-per__s sx-mono">{per.sub}</span>
              </div>

              {loading ? (
                <>
                  <div className="sx-kpis" data-testid="sx-chargement">
                    {[1, 2, 3, 4].map((x) => <div key={x} className="sx-sk" style={{ height: mob ? 150 : 190, borderRadius: 18 }} />)}
                  </div>
                  <div className="sx-card" style={{ gap: 18 }}>
                    <div className="sx-skd" style={{ width: 220, maxWidth: '100%', height: 14, borderRadius: 7 }} />
                    <div style={{ height: 'var(--plot-h)', display: 'flex', alignItems: 'flex-end', gap: '6%', padding: '0 4%' }}>
                      {per.piliers.map((_, i) => <div key={i} className="sx-skd" style={{ flex: 1, height: `${35 + ((i * 37) % 55)}%`, borderRadius: '10px 10px 4px 4px' }} />)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1, 2, 3, 4].map((x) => <div key={x} className="sx-sk" style={{ height: 56, borderRadius: 14 }} />)}
                  </div>
                </>
              ) : (
                <>
                  {fiche && fm && has && T.oub > 0 && (
                    <div className="sx-ban" data-testid="sx-bandeau">
                      <span className="sx-ban__i" aria-hidden>!</span>
                      <div className="sx-ban__c">
                        <span className="sx-ban__t">{T.oub} jour{pl(T.oub)} à relancer</span>
                        <span className="sx-ban__x">Aucune heure reçue ces jours-là. Relancez {fm.first} depuis le planning (« À relancer »).</span>
                      </div>
                      <span className="sx-ban__d sx-mono">{(fm.oublis.length > 8 ? `${fm.oublis.slice(0, 8).reverse().map(dLab).join(' · ')} …` : [...fm.oublis].reverse().map(dLab).join(' · ')).toUpperCase()}</span>
                    </div>
                  )}

                  <div className="sx-kpis" data-testid="sx-tuiles">
                    {kpis.map((k) => {
                      const sp = has ? spark(k.vals) : null;
                      return (
                        <div key={k.id} className="sx-kpi" data-testid={`sx-tuile-${k.id}`}>
                          <div className="sx-kpi__h">
                            <span className="sx-kpi__l sx-mono">{k.label}</span>
                            <span className="sx-kpi__sw" style={{ background: k.sw, borderRadius: k.swR }} aria-hidden />
                          </div>
                          <div className="sx-kpi__v"><b>{has ? k.value : '—'}</b>{has && <span>{k.unit}</span>}</div>
                          {sp && (
                            <svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden>
                              <path d={sp.area} fill={k.color} fillOpacity={0.13} />
                              <path d={sp.line} fill="none" stroke={k.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                            </svg>
                          )}
                          <div className="sx-kpi__s">
                            {has && k.d && <b style={{ color: k.d.c }}>{k.d.t}</b>}
                            <span>{has ? k.sub : etat === 'ko' ? 'Chiffres indisponibles' : 'Aucune donnée sur la période'}</span>
                          </div>
                          {has && k.cost && (
                            <div className="sx-kpi__c" data-testid="sx-cout"><span>Coût main-d&apos;œuvre</span><b>{k.cost}</b></div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {etat === 'ko' ? (
                    <div className="sx-card sx-empty" data-testid="sx-erreur">
                      <div className="sx-empty__p" aria-hidden>{[40, 65, 100, 55, 80].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>
                      <span className="sx-empty__k sx-mono">ERREUR DE LECTURE</span>
                      <h2 className="sx-empty__t">Impossible de charger les statistiques</h2>
                      <span className="sx-empty__x">La lecture a échoué. Aucun chiffre partiel n&apos;est affiché : mieux vaut rien qu&apos;un chiffre faux.</span>
                      <button type="button" className="sx-btn-amb" onClick={() => setRetry((n) => n + 1)}>Réessayer</button>
                    </div>
                  ) : !has ? (
                    <div className="sx-card sx-empty" data-testid="sx-vide">
                      <div className="sx-empty__p" aria-hidden>{[40, 65, 100, 55, 80].map((h, i) => <span key={i} className={i === 2 ? 'on' : ''} style={{ height: `${h}%` }} />)}</div>
                      <span className="sx-empty__k sx-mono">0 H · AUCUNE DONNÉE</span>
                      <h2 className="sx-empty__t">Aucun pointage sur cette période</h2>
                      <span className="sx-empty__x">Les heures apparaîtront ici dès que l&apos;équipe aura pointé. Il n&apos;y a rien à corriger.</span>
                      <button type="button" className="sx-btn-amb" onClick={() => go({ off: 0 })} data-testid="sx-revenir">Revenir à aujourd&apos;hui</button>
                    </div>
                  ) : (
                    <>
                      <section className="sx-card" data-testid="sx-graphique">
                        <div className="sx-ch__h">
                          <div className="sx-ctitle">
                            <span className="sx-ckick sx-mono">HEURES {fiche && fm ? `· ${fm.name.toUpperCase()}` : "DE L'ÉQUIPE"} · PAR {per.unit}</span>
                            <h2 className="sx-ctt">{fH(T.m)} travaillées · {fH(T.con)} prévues</h2>
                          </div>
                          <div className="sx-leg">
                            <span><i className="sw-n" />Normales</span>
                            <span><i className="sw-s" />Supplémentaires</span>
                            <span><i className="sw-a" />Absences</span>
                            <span><i className="o" />Oubli de pointage</span>
                            <span><i className="c" />Contrat</span>
                          </div>
                        </div>
                        <div className="sx-plot">
                          {[0, 1, 2, 3, 4].map((k) => (
                            <div key={k} className="sx-tick" style={{ bottom: `${k * 25}%` }}><span className="sx-mono">{fN((top * k) / 4)}{k === 4 ? ' h' : ''}</span></div>
                          ))}
                          <div className="sx-slots">
                            {per.piliers.map((b, i) => {
                              const x = B[i], ah = x.abs * H_ABS, tot = x.n + x.s + ah, on = activeIdx === i, fut = b.future;
                              const label = `${b.full} : ${fH(x.m)} travaillées (${fH(x.n)} normales, ${fH(x.s)} sup), absences ${fJ(x.abs)}, contrat ${fH(x.con)}${x.oub ? `, ${x.oub} oubli${pl(x.oub)} de pointage` : ''}`;
                              return (
                                <div
                                  key={b.from} className="sx-slot" role={fut ? undefined : 'button'} tabIndex={fut ? -1 : 0} aria-label={fut ? `${b.full} : à venir` : label}
                                  data-on={on ? '1' : '0'} data-futur={fut ? '1' : '0'} data-testid="sx-pilier" data-from={b.from} data-to={b.to}
                                  data-minutes={x.m} data-normales={x.n} data-sup={x.s} data-absences={x.abs} data-oublis={x.oub} data-contrat={x.con}
                                  onMouseEnter={() => { if (!mob && !fut) setHover(i); }} onMouseLeave={() => setHover(null)}
                                  onClick={() => {
                                    if (fut) return;
                                    if (fiche) { const again = focus === i; setFocus(again ? null : i); setHover(null); setOpenDay(again ? null : vue === 'semaine' ? b.from : vue === 'annee' ? `m${i}` : null); }
                                    else { setPanel(i); setLastPanel(i); setHover(null); }
                                  }}
                                  onKeyDown={(e) => { if (!fut && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
                                >
                                  {fut && <div className="sx-ghost" style={{ height: grown ? pct(ghostOf(i)) : '0%', maxWidth: vue === 'semaine' ? 68 : vue === 'mois' ? 92 : 46 }} />}
                                  <div className="sx-pil" style={{
                                    height: grown ? pct(tot) : '0%', maxWidth: vue === 'semaine' ? 68 : vue === 'mois' ? 92 : 46,
                                    opacity: activeIdx == null || on ? 1 : 0.38, boxShadow: on ? '0 0 0 2px #FFC21A, 0 12px 34px rgba(123,77,255,.5)' : 'none',
                                    transitionDelay: `${i * 45}ms, 0ms, 0ms`,
                                  }}>
                                    <i style={{ height: tot ? `${(x.n / tot) * 100}%` : '0%', background: SW.n }} />
                                    <i className="a" style={{ height: tot ? `${(ah / tot) * 100}%` : '0%' }} />
                                    <i className="s" style={{ height: tot ? `${(x.s / tot) * 100}%` : '0%', background: SW.s }} />
                                  </div>
                                  {x.con > 0 && <div className="sx-con" style={{ bottom: pct(x.con) }} />}
                                  {!mob && hover === i && !fut && (
                                    <div className="sx-tip" style={i < per.piliers.length / 2 ? { left: 'calc(50% + 30px)' } : { right: 'calc(50% + 30px)' }} data-testid="sx-infobulle">
                                      <b>{b.full}</b>
                                      <span className="sx-tip__r"><i style={{ background: SW.n }} /><span>Normales</span><b>{fH(x.n)}</b></span>
                                      <span className="sx-tip__r"><i style={{ background: SW.s }} /><span>Supplémentaires</span><b>{fH(x.s)}</b></span>
                                      <span className="sx-tip__r"><i style={{ background: SW.a }} /><span>Absences</span><b>{fH(ah)} · {fJ(x.abs)}</b></span>
                                      <span className="sx-tip__r"><i className="c" /><span>Contrat</span><b>{fH(x.con)}</b></span>
                                      {x.oub > 0 && <span className="sx-tip__o"><i />{x.oub} oubli{pl(x.oub)} de pointage</span>}
                                      <span className="sx-tip__t"><span>Total travaillé</span><span>{fH(x.m)}</span></span>
                                      <span className="sx-tip__h sx-mono">{fiche ? 'CLIQUER POUR FILTRER LES JOURS' : 'CLIQUER POUR LE DÉTAIL'}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="sx-xl">
                          {per.piliers.map((b, i) => (
                            <div key={b.from}>
                              <b style={{ color: b.today ? '#FFC21A' : b.future ? 'rgba(242,237,227,.4)' : '#F2EDE3' }}>{b.label}</b>
                              {b.sub && <small className="sx-mono">{b.sub}</small>}
                              {B[i].oub > 0 && <em className="sx-mono"><i />{B[i].oub}</em>}
                            </div>
                          ))}
                        </div>
                      </section>

                      <div className="sx-low">
                        {fiche && fm && (
                          <ListeJours
                            per={per} vue={vue} mob={mob} jours={jours} sal={fm} focus={focus} openDay={openDay} setOpenDay={setOpenDay}
                            clearFocus={() => { setFocus(null); setOpenDay(null); }} worksites={data?.worksites || new Map()} cout={cout} today={today}
                          />
                        )}
                        {!fiche && (
                          <section className="sx-card sx-rk" data-testid="sx-classement">
                            <div className="sx-rk__h">
                              <div className="sx-ctitle">
                                <span className="sx-ckick sx-mono">CLASSEMENT PAR SALARIÉ</span>
                                <h2 className="sx-ctt">{N} salarié{pl(N)} · {showAll || qq ? 'tous' : `top ${Math.min(lim, N)}`}</h2>
                              </div>
                              <input className="sx-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un salarié" aria-label="Rechercher un salarié" data-testid="sx-recherche" />
                            </div>
                            <span className="sx-hint">Cliquez sur un salarié pour ouvrir sa fiche.</span>
                            {!mob && (
                              <div className={`sx-rkg sx-rkhd sx-mono${coutVisible ? ' cout' : ''}`} aria-hidden>
                                <span>SALARIÉ</span><span>RÉPARTITION</span><span className="r">TOTAL</span><span>ÉTAT</span>
                                {coutVisible && <span className="r">COÛT</span>}
                              </div>
                            )}
                            <div className="sx-rows" style={mob ? { gap: 8 } : undefined}>
                              {shown.map((s) => {
                                const x = s.tot, rank = R.indexOf(s) + 1;
                                const bar = (
                                  <div className="sx-bar" aria-hidden>
                                    <i className="n" style={{ width: `${(x.n / rmax) * 100}%` }} />
                                    <i className="a" style={{ width: `${((x.abs * H_ABS) / rmax) * 100}%` }} />
                                    <i className="s" style={{ width: `${(x.s / rmax) * 100}%` }} />
                                  </div>
                                );
                                const tot = <div className="sx-tot"><b>{fH(x.m)}</b><small>{x.s ? `+${fH(x.s)} sup` : ''}</small></div>;
                                const st = <span className={`sx-st${x.oub ? ' ko' : ''}`}><i />{x.oub ? `${x.oub} j en attente` : 'À jour'}</span>;
                                const cost = coutVisible ? <span className="sx-cost">{s.cost != null ? fE(s.cost) : '—'}</span> : null;
                                const attrs = { 'data-testid': 'sx-ligne', 'data-uid': s.id, 'data-minutes': x.m, 'data-sup': x.s, 'data-oublis': x.oub, 'data-absences': x.abs, onClick: () => go({ sal: s.id }), 'aria-label': `Ouvrir la fiche de ${s.name}` };
                                return mob ? (
                                  <button key={s.id} type="button" className="sx-rowm" {...attrs}>
                                    <div className="sx-rowm__h">
                                      <span className="sx-who__a" style={{ background: avOf.get(s.id) }}>{s.ini}</span>
                                      <span className="sx-who__n"><b>{s.name}</b><small>{s.role}</small></span>
                                      {tot}
                                    </div>
                                    {bar}
                                    <div className="sx-rowm__f">{st}{cost}</div>
                                  </button>
                                ) : (
                                  <button key={s.id} type="button" className={`sx-row sx-rkg${coutVisible ? ' cout' : ''}`} {...attrs}>
                                    <div className="sx-who">
                                      <span className="sx-who__r sx-mono">{rank}</span>
                                      <span className="sx-who__a" style={{ background: avOf.get(s.id) }}>{s.ini}</span>
                                      <span className="sx-who__n"><b>{s.name}</b><small>{s.role}</small></span>
                                    </div>
                                    {bar}{tot}{st}{cost}
                                  </button>
                                );
                              })}
                            </div>
                            {Rf.length === 0 && <span className="sx-none" data-testid="sx-aucun">Aucun salarié ne correspond à « {q} ».</span>}
                            {!qq && Rf.length > lim && (
                              <button type="button" className="sx-more" onClick={() => setShowAll((v) => !v)} data-testid="sx-voir-tous">{showAll ? 'Réduire la liste' : `Voir les ${N} salariés`}</button>
                            )}
                          </section>
                        )}
                        {chSum > 0 && (
                          <section className="sx-card" data-testid="sx-anneau" data-minutes={chSum}>
                            <div className="sx-ctitle">
                              <span className="sx-ckick sx-mono">RÉPARTITION PAR CHANTIER</span>
                              <h2 className="sx-ctt">Où vont les heures</h2>
                            </div>
                            <div className="sx-ring" style={{ background: conic }} aria-hidden>
                              <div className="sx-ring__c"><b>{fN(Math.round(chSum / 60))}</b><small className="sx-mono">HEURES</small></div>
                            </div>
                            <div className="sx-chl">
                              {chs.map((c) => (
                                <div key={c.name}><i style={{ background: c.color }} /><span>{c.name}</span><b>{fH(c.v)}</b><small className="sx-mono">{Math.round((c.v / chSum) * 100)} %</small></div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
              <div style={{ height: 8 }} />
            </div>
          </div>

          {!fiche && (
            <Tiroir
              per={per} B={B} scope={scope} panel={panel} lastPanel={lastPanel} mob={mob} cout={cout}
              worksites={data?.worksites || new Map()} onClose={() => setPanel(null)}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Tiroir : détail d'un pilier (niveau 1) ─────────────────────────────────
function Tiroir({ per, B, scope, panel, lastPanel, mob, cout, worksites, onClose }: {
  per: Periode; B: Cellule[]; scope: SalarieV2[]; panel: number | null; lastPanel: number | null; mob: boolean; cout: boolean;
  worksites: Map<string, string>; onClose: () => void;
}) {
  const pi = panel != null ? panel : lastPanel;
  const ouvert = panel != null;
  const b = pi != null ? per.piliers[pi] : null;
  const x = pi != null && b ? B[pi] : null;
  const rows = useMemo(() => (pi == null ? [] : scope.map((s) => ({ s, c: s.cells[pi] }))
    .sort((a, z) => (z.c.oub - a.c.oub) || (z.c.m - a.c.m) || a.s.name.localeCompare(z.s.name, 'fr'))), [pi, scope]);
  const estime = pi == null ? 0 : scope.reduce((t, s) => t + (s.rate != null ? (s.cells[pi].m / 60) * s.rate : 0), 0);
  const montrerCout = cout && scope.some((s) => s.rate != null);
  return (
    <>
      <div className="sx-bd" data-open={ouvert ? '1' : '0'} onClick={onClose} aria-hidden />
      <div className="sx-pn" data-open={ouvert ? '1' : '0'} role="region" aria-label={b ? `Détail : ${b.full}` : 'Détail'} aria-hidden={!ouvert} data-testid="sx-tiroir">
        {mob && <div className="sx-pn__g" aria-hidden />}
        <div className="sx-pn__h">
          <div>
            <span className="sx-kick sx-mono">{per.kick}</span>
            <h2 className="sx-pn__t">{b?.full}</h2>
            <span className="sx-pn__s">{scope.length} salarié{pl(scope.length)}</span>
          </div>
          <button type="button" className="sx-pn__x" onClick={onClose} aria-label="Fermer" data-testid="sx-tiroir-fermer" tabIndex={ouvert ? 0 : -1}>✕</button>
        </div>
        {x && (
          <div className="sx-pn__b">
            <div className="sx-pt">
              <div><span><i style={{ background: SW.n }} />Normales</span><b>{fH(x.n)}</b></div>
              <div><span><i style={{ background: SW.s }} />Supplémentaires</span><b>{fH(x.s)}</b></div>
              <div><span><i style={{ background: SW.a }} />Absences</span><b>{fJ(x.abs)}</b></div>
              <div><span><i className="o" style={{ background: SW.o }} />Oublis</span><b>{x.oub} j</b></div>
            </div>
            {montrerCout && <div className="sx-pc"><span>Coût main-d&apos;œuvre estimé</span><b>{fE(estime)}</b></div>}
            <div className="sx-pr">
              {rows.map(({ s, c }) => {
                const ch = principal(s.chantiers[pi as number]);
                const sub = c.m > 0 ? (ch ? worksites.get(ch) || 'Chantier' : 'Hors chantier') : c.abs ? 'Absent·e' : c.oub ? 'Pointage manquant' : 'Rien de prévu';
                return (
                  <div key={s.id} data-testid="sx-tiroir-ligne">
                    <span className="sx-pr__a">{s.ini}</span>
                    <div className="sx-pr__m">
                      <b>{s.name}</b>
                      <span>{sub}</span>
                      {(c.abs > 0 || c.oub > 0) && (
                        <div className="sx-pr__p">
                          {c.abs > 0 && <span className="a"><i style={{ background: SW.a }} />{fJ(c.abs)} d&apos;absence</span>}
                          {c.oub > 0 && <span className="o"><i />{c.oub} j à relancer</span>}
                        </div>
                      )}
                    </div>
                    <div className="sx-pr__h"><b>{fH(c.m)}</b><small>{c.s ? `+${fH(c.s)} sup` : ''}</small></div>
                  </div>
                );
              })}
            </div>
            <span className="sx-foot sx-mono">LECTURE SEULE · LES CORRECTIONS SE FONT DANS LE PLANNING</span>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Fiche : liste jour par jour (ou mois par mois) ─────────────────────────
interface Ligne { key: string; date: string; pills: (keyof typeof SW)[]; label: string; lc: string; lw: number; h: string; sup: string; oubli: boolean; det: { k: string; v: string }[] }

function ListeJours({ per, vue, mob, jours, sal, focus, openDay, setOpenDay, clearFocus, worksites, cout, today }: {
  today: string; per: Periode; vue: Vue; mob: boolean; jours: JourV2[]; sal: SalarieV2; focus: number | null; openDay: string | null;
  setOpenDay: (k: string | null) => void; clearFocus: () => void; worksites: Map<string, string>; cout: boolean;
}) {
  const nomCh = (id: string | null) => (id ? worksites.get(id) || 'Chantier' : '—');
  const coutDe = (m: number) => (cout && sal.rate != null ? fE((m / 60) * sal.rate) : null);
  const lignes: Ligne[] = useMemo(() => {
    const out: Ligne[] = [];
    if (vue !== 'annee') {
      for (const j of jours) {
        const i = per.piliers.findIndex((b) => j.date >= b.from && j.date <= b.to);
        if (focus != null && focus !== i) continue;
        const we = dowLun(j.date) >= 5;
        if (we && !(j.m || j.absence || j.oubli)) continue;
        const pills: Ligne['pills'] = []; if (j.n) pills.push('n'); if (j.s) pills.push('s'); if (j.absence) pills.push('a'); if (j.oubli) pills.push('o');
        let label = '', lc = '#5B534A', h = '', det: Ligne['det'] = [];
        if (!j.m && !j.oubli && !j.absence) {
          label = j.date === today ? 'Journée en cours · rien d’envoyé' : 'Aucune heure envoyée'; h = '—';
          det = [{ k: 'STATUT', v: j.date === today ? 'Journée en cours' : j.prevu ? 'Rien d’envoyé' : 'Rien de prévu' }, { k: 'CHANTIER PRÉVU', v: j.prevu || '—' }];
        } else if (j.oubli && !j.m) {
          label = 'Oubli de pointage · à relancer'; lc = '#B3261E'; h = '—';
          det = [{ k: 'STATUT', v: 'Aucune heure reçue' }, { k: 'ACTION', v: 'À relancer depuis le planning' }, { k: 'CHANTIER PRÉVU', v: j.prevu || '—' }];
        } else if (j.absence && !j.m) {
          label = LIB_ABSENCE[j.absence] || 'Absence'; lc = '#0E7A5E'; h = 'Absent·e';
          det = [{ k: 'MOTIF', v: LIB_ABSENCE[j.absence] || j.absence }, { k: 'DURÉE', v: '1 jour' }];
        } else {
          const chIds = Array.from(j.chantiers.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id);
          label = chIds.length ? chIds.map(nomCh).join(' · ') : 'Hors chantier'; h = fH(j.m);
          const c = j.creneaux;
          if (c.length === 2) {
            const gap = Math.max(0, minDe(c[1].debut) - minDe(c[0].fin));
            det.push({ k: 'MATIN', v: `${heure(c[0].debut)} – ${heure(c[0].fin)}` }, { k: c[1].gap === 'route' ? 'ROUTE' : 'PAUSE', v: gap ? duree(gap) : 'Aucune' }, { k: 'APRÈS-MIDI', v: `${heure(c[1].debut)} – ${heure(c[1].fin)}` });
          } else if (c.length === 1) {
            det.push({ k: 'CRÉNEAU', v: `${heure(c[0].debut)} – ${heure(c[0].fin)}` }, { k: 'PAUSE', v: c[0].pause ? duree(c[0].pause) : 'Aucune' });
          } else if (c.length > 2) {
            det.push({ k: 'CRÉNEAUX', v: c.map((x) => `${heure(x.debut)} – ${heure(x.fin)}`).join(' · ') });
          }
          det.push({ k: 'CHANTIER', v: chIds.length ? chIds.map(nomCh).join(' · ') : '—' });
          if (j.s) det.push({ k: 'HEURES SUP.', v: `+${fH(j.s)}` });
          if (j.route) det.push({ k: 'ROUTE PAYÉE', v: fH(j.route) });
          if (j.absence) det.push({ k: 'ABSENCE', v: LIB_ABSENCE[j.absence] || j.absence });
          if (j.oubli) det.push({ k: 'À COMPLÉTER', v: 'Journée à relancer' });
          const cc = coutDe(j.m); if (cc) det.push({ k: 'COÛT', v: cc });
        }
        out.push({ key: j.date, date: dLab(j.date), pills, label, lc, lw: j.oubli ? 800 : 500, h, sup: j.s && j.n ? `+${fH(j.s)} sup` : j.s && !j.n ? 'sup' : '', oubli: j.oubli, det });
      }
    } else {
      per.piliers.forEach((b, i) => {
        if (b.future) return;
        if (focus != null && focus !== i) return;
        const js = jours.filter((j) => j.date >= b.from && j.date <= b.to);
        const x = sal.cells[i];
        const oD = js.filter((j) => j.oubli).map((j) => Number(j.date.slice(8, 10)));
        const aD = js.filter((j) => j.absence).map((j) => Number(j.date.slice(8, 10)));
        const wd = js.filter((j) => j.m > 0).length;
        const ch = principal(sal.chantiers[i]);
        const pills: Ligne['pills'] = []; if (x.n) pills.push('n'); if (x.s) pills.push('s'); if (x.abs) pills.push('a'); if (x.oub) pills.push('o');
        const det = [
          { k: 'JOURS TRAVAILLÉS', v: `${wd} j` }, { k: 'HEURES SUP.', v: fH(x.s) },
          { k: 'ABSENCES', v: aD.length ? `${aD.length} j · le ${aD.join(', ')}` : 'Aucune' },
          { k: 'OUBLIS', v: oD.length ? `${oD.length} j · le ${oD.join(', ')}` : 'Aucun' },
          { k: 'CHANTIER PRINCIPAL', v: x.m && ch ? nomCh(ch) : '—' },
        ];
        const cc = coutDe(x.m); if (cc) det.push({ k: 'COÛT', v: cc });
        out.push({
          key: `m${i}`, date: b.full, pills, label: x.oub ? `${x.oub} j à relancer` : x.abs ? `${fJ(x.abs)} d’absence` : ch ? nomCh(ch) : '—',
          lc: x.oub ? '#B3261E' : '#5B534A', lw: x.oub ? 800 : 500, h: fH(x.m), sup: x.s && x.n ? `+${fH(x.s)} sup` : '', oubli: x.oub > 0, det,
        });
      });
    }
    return out.reverse();
  }, [jours, per, vue, focus, sal, worksites, cout, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const fb = focus != null ? per.piliers[focus] : null;
  return (
    <section className="sx-card sx-card--light" data-testid="sx-jours">
      <div className="sx-lh">
        <div className="sx-ctitle">
          <span className="sx-ckick sx-mono">{vue === 'annee' ? 'MOIS PAR MOIS' : 'JOUR PAR JOUR'}</span>
          <h2 className="sx-ctt">{vue === 'annee' ? `${lignes.length} mois` : `${lignes.length} jour${pl(lignes.length)} sur la période`}</h2>
        </div>
        {fb && <button type="button" className="sx-flt" onClick={clearFocus} data-testid="sx-filtre">{fb.full}<span aria-hidden>✕</span></button>}
      </div>
      <div className="sx-ll">
        <span><i className="sw-n" />Normal</span>
        <span><i className="sw-s" />Heures sup</span>
        <span><i className="sw-al" />Absence</span>
        <span><i className="o sw-o" />Oubli</span>
        {!mob && <span className="sx-ll__h">Cliquez sur une ligne pour le détail</span>}
      </div>
      <div className="sx-days">
        {lignes.map((d) => {
          const ouvert = openDay === d.key;
          return (
            <div key={d.key} className="sx-day" data-testid="sx-jour" data-date={d.key}>
              <button type="button" className="sx-day__b" aria-expanded={ouvert} data-oubli={d.oubli && !ouvert ? '1' : '0'} onClick={() => setOpenDay(ouvert ? null : d.key)}>
                <span className="sx-day__d">{d.date}</span>
                <span className="sx-day__p" aria-hidden>{d.pills.map((p) => <i key={p} className={p === 'o' ? 'o' : ''} style={{ background: SW[p] }} />)}</span>
                <span className="sx-day__l" style={{ color: d.lc, fontWeight: d.lw }}>{d.label}</span>
                <span className="sx-day__h"><b>{d.h}</b><small>{d.sup}</small></span>
                <span className="sx-day__c" aria-hidden>{ouvert ? '▴' : '▾'}</span>
              </button>
              {ouvert && (
                <div className="sx-det" data-testid="sx-jour-detail">
                  {d.det.map((x) => <div key={x.k}><span className="sx-mono">{x.k}</span><b>{x.v}</b></div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="sx-foot sx-mono">LECTURE SEULE · LES CORRECTIONS SE FONT DANS LE PLANNING</span>
    </section>
  );
}
