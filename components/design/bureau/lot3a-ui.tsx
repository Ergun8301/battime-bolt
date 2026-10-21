'use client';

// Design bureau · lot 3, partie A : briques d'affichage (les blocs du moteur de la planche, bureau-base.js : B.rows, B.f, B.alert, B.search, B.empty,
// B.gauge, B.drop, B.checks, B.chips, B.seg, onglets, B.kv, B.stats) et la coque des fenêtres (celle du lot 2 : voile, liseré jaune, ✕, Échap).
// CONTENU SEULEMENT : aucune requête, aucun état métier. Chargé en différé, seulement avec ?ui=2.
import './bureau-jetons.css';
import './heures-v2.css';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { BarChart3, CircleCheck, Euro, FileText, Loader2, Plus, QrCode, RotateCcw, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type Style = CSSProperties & Record<`--${string}`, string | number>;

// ───────────────────────── Coque ─────────────────────────
interface CoqueProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** `panneau` : latéral (480 px par défaut) ; `fenetre` : centrée (520 px par défaut). Sous 1 024 px : page plein écran avec « ‹ » / fenêtre centrée à 16 px. */
  forme?: 'panneau' | 'fenetre';
  /** Largeur au pointeur (px), celle de la planche. */
  largeur?: number;
  kicker?: ReactNode;
  titre: ReactNode;
  sous?: ReactNode;
  /** Onglets (sous le titre, hors du corps qui défile). */
  onglets?: ReactNode;
  pied?: ReactNode;
  notePied?: ReactNode;
  testId?: string;
  /** Rôle `alertdialog` (question qui engage) : Échap ou un clic sur le voile valent « Annuler ». */
  alerte?: boolean;
  children?: ReactNode;
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  onInteractOutside?: (e: Event) => void;
  onOpenAutoFocus?: (e: Event) => void;
  onCloseAutoFocus?: (e: Event) => void;
  fermer?: string;
}

function Croix({ nom }: { nom: string }) {
  return (<><span className="dz-hb-croix" aria-hidden="true">✕</span><span className="dz-hb-retour" aria-hidden="true">‹</span><span className="sr-only">{nom}</span></>);
}

export function Coque({ open, onOpenChange, forme = 'panneau', largeur, kicker, titre, sous, onglets, pied, notePied, testId, alerte, children, fermer = 'Fermer',
  onEscapeKeyDown, onInteractOutside, onOpenAutoFocus, onCloseAutoFocus }: CoqueProps) {
  const P = (alerte ? AlertPrimitive : DialogPrimitive) as unknown as typeof DialogPrimitive;
  const Ferme = (alerte ? AlertPrimitive.Cancel : DialogPrimitive.Close) as unknown as typeof DialogPrimitive.Close;
  const style: Style | undefined = largeur ? { '--l3-w': `${largeur}px` } : undefined;
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Portal>
        <P.Overlay className="dz-portail dz-hb-voile" data-ton={forme === 'fenetre' ? 'fenetre' : undefined} onClick={alerte ? () => { if (!document.querySelector('[role=alertdialog] .animate-spin')) onOpenChange(false); } : undefined} />
        <P.Content
          className={`bt-skin dz-portail ${forme === 'fenetre' ? 'dz-hb-fenetre' : 'dz-hb-panneau'} dz-l3-coque`}
          style={style} data-testid={testId} aria-describedby={undefined}
          onEscapeKeyDown={onEscapeKeyDown} onOpenAutoFocus={onOpenAutoFocus} onCloseAutoFocus={onCloseAutoFocus}
          {...(alerte ? {} : { onInteractOutside })}
        >
          <header className="dz-hb-tete">
            {kicker ? <p className="dz-hb-kicker">{kicker}</p> : null}
            <P.Title className="dz-hb-titre">{titre}</P.Title>
            {sous ? <p className="dz-hb-sous">{sous}</p> : null}
            <Ferme className="dz-hb-fermer" data-testid={testId ? `${testId}-fermer` : undefined}><Croix nom={fermer} /></Ferme>
          </header>
          {onglets}
          <div className="dz-hb-corps">{children}</div>
          {notePied ? <div className="dz-l3-note-pied">{notePied}</div> : null}
          {pied ? <div className="dz-hb-pied">{pied}</div> : null}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

// ───────────────────────── Boutons ─────────────────────────
export type Ton = 'principal' | 'encre' | 'danger' | 'danger-contour';
export function Btn({ ton, taille, plein, pousse, busy, children, className, ...rest }: {
  ton?: Ton; taille?: 'ligne'; plein?: boolean; pousse?: boolean; busy?: boolean; children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`dz-l3-btn${pousse ? ' dz-l3-pousse' : ''}${className ? ` ${className}` : ''}`} data-ton={ton} data-taille={taille} data-plein={plein ? 'oui' : undefined} {...rest}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{children}
    </button>
  );
}

// ───────────────────────── Textes ─────────────────────────
export function P({ ton, children, ...rest }: { ton?: 'doux' | 'erreur' | 'ok'; children: ReactNode } & React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className="dz-l3-p" data-ton={ton} {...rest}>{children}</p>;
}
export function Etiquette({ children, droite }: { children: ReactNode; droite?: ReactNode }) {
  return <p className="dz-l3-etiquette"><span>{children}</span>{droite ? <b>{droite}</b> : null}</p>;
}

// ───────────────────────── Lignes ─────────────────────────
/** L'icône d'une ligne de fiche (Documents, Coût, Bilan…) : un pictogramme connu de tous, sur une pastille teintée, pour repérer la ligne d'un coup d'œil. */
export type IconeLigne = 'documents' | 'cout' | 'bilan' | 'terminer' | 'rouvrir' | 'ajouter' | 'habilitation' | 'qr';
const ICONES: Record<IconeLigne, LucideIcon> = { documents: FileText, cout: Euro, bilan: BarChart3, terminer: CircleCheck, rouvrir: RotateCcw, ajouter: Plus, habilitation: ShieldCheck, qr: QrCode };

export interface LigneProps {
  t: ReactNode;
  icone?: IconeLigne;
  s?: ReactNode;
  pourquoi?: ReactNode;
  ini?: string;
  avFond?: string;
  point?: string;
  prise?: boolean;
  badge?: ReactNode;
  badgeTon?: 'erreur' | 'chef' | 'jaune' | 'ok' | 'encre' | 'clos';
  droite?: ReactNode;
  droiteTon?: 'ok' | 'erreur';
  droiteUi?: boolean;
  actions?: ReactNode;
  chev?: boolean;
  actif?: boolean;
  doux?: boolean;
  /** Toute la ligne (texte) est un bouton. */
  onClick?: () => void;
  testId?: string;
  clicTestId?: string;
  guide?: string;
  titre?: string;
}
export function Ligne({ t, icone, s, pourquoi, ini, avFond, point, prise, badge, badgeTon, droite, droiteTon, droiteUi, actions, chev, actif, doux, onClick, testId, clicTestId, guide, titre }: LigneProps) {
  const debut = (
    <>
      {prise ? <span className="dz-l3-prise" aria-hidden="true">⠿</span> : null}
      {point ? <span className="dz-l3-point" style={{ background: point }} aria-hidden="true" /> : null}
      {icone ? (() => { const Ico = ICONES[icone]; return <span className="dz-l3-ico" data-icone={icone} aria-hidden="true"><Ico className="h-5 w-5" strokeWidth={2} /></span>; })() : null}
      {ini ? <span className="dz-l3-av" style={avFond ? { background: avFond } : undefined} aria-hidden="true">{ini}</span> : null}
      <span className="dz-l3-ligne__txt">
        <span className="dz-l3-ligne__t">{t}</span>
        {s ? <span className="dz-l3-ligne__s">{s}</span> : null}
        {pourquoi ? <span className="dz-l3-ligne__pourquoi">{pourquoi}</span> : null}
      </span>
    </>
  );
  const fin = (
    <>
      {badge ? <span className="dz-l3-badge" data-ton={badgeTon}>{badge}</span> : null}
      {droite ? <span className="dz-l3-ligne__d" data-ton={droiteTon} data-texte={droiteUi ? 'ui' : undefined}>{droite}</span> : null}
    </>
  );
  return (
    <div className="dz-l3-ligne" data-actif={actif ? 'oui' : undefined} data-doux={doux ? 'oui' : undefined} data-testid={testId}>
      {onClick ? (
        <button type="button" className="dz-l3-ligne__clic" onClick={onClick} data-testid={clicTestId} data-guide={guide} title={titre}>
          {debut}{fin}{chev && !actions ? <span className="dz-l3-ligne__chev" aria-hidden="true">›</span> : null}
        </button>
      ) : (<>{debut}{fin}</>)}
      {actions ? <span className="dz-l3-ligne__actions">{actions}</span> : null}
      {chev && (!onClick || actions) ? <span className="dz-l3-ligne__chev" aria-hidden="true">›</span> : null}
    </div>
  );
}
export function Lignes({ titre, children, testId, guide }: { titre?: ReactNode; children: ReactNode; testId?: string; guide?: string }) {
  return (
    <div className="dz-l3-bloc">
      {titre ? <Etiquette>{titre}</Etiquette> : null}
      <div className="dz-l3-lignes" data-testid={testId} data-guide={guide}>{children}</div>
    </div>
  );
}

// ───────────────────────── Recherche, vide, alerte ─────────────────────────
export function Recherche({ value, onChange, placeholder, testId, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; testId?: string; autoFocus?: boolean }) {
  return (
    <label className="dz-l3-recherche">
      <span aria-hidden="true">⌕</span>
      <input type="search" value={value} placeholder={placeholder} aria-label={placeholder.replace(/…$/, '')} onChange={(e) => onChange(e.target.value)} data-testid={testId} autoFocus={autoFocus} />
    </label>
  );
}
export function Vide({ t, s, action, testId }: { t: ReactNode; s?: ReactNode; action?: ReactNode; testId?: string }) {
  return <div className="dz-l3-vide" data-testid={testId}><b>{t}</b>{s ? <span>{s}</span> : null}{action}</div>;
}
export function Alerte({ ton, titre, children, boutons, testId }: { ton?: 'erreur' | 'attention' | 'ok' | 'verrou'; titre?: ReactNode; children?: ReactNode; boutons?: ReactNode; testId?: string }) {
  return (
    <div className="dz-l3-alerte" data-ton={ton} role={ton === 'erreur' ? 'alert' : 'status'} data-testid={testId}>
      {titre ? <b>{titre}</b> : null}
      {children ? <div className="dz-l3-alerte__t">{children}</div> : null}
      {boutons ? <div className="dz-l3-alerte__btns">{boutons}</div> : null}
    </div>
  );
}

// ───────────────────────── Champs ─────────────────────────
export function Champs({ cols = 1, children }: { cols?: number; children: ReactNode }) {
  return <div className="dz-l3-champs" style={{ '--l3-cols': cols } as Style}>{children}</div>;
}
interface ChampCommun { nom: ReactNode; requis?: boolean; large?: boolean; erreur?: ReactNode; aide?: ReactNode; suffixe?: ReactNode; mono?: boolean; compteur?: ReactNode; inactif?: boolean; guide?: string; id?: string }
export function Champ({ nom, requis, large, erreur, aide, suffixe, mono, compteur, inactif, guide, id, ...input }: ChampCommun & InputHTMLAttributes<HTMLInputElement>) {
  const idf = id || (typeof nom === 'string' ? `l3-${nom.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);
  return (
    <div className="dz-l3-champ" data-large={large ? 'oui' : undefined} data-guide={guide}>
      <label className="dz-l3-champ__nom" htmlFor={idf}><span>{nom}{requis ? ' *' : ''}</span>{compteur ? <small>{compteur}</small> : null}</label>
      <span className="dz-l3-champ__boite" data-mono={mono ? 'oui' : undefined} data-inactif={inactif ? 'oui' : undefined} data-erreur={erreur ? 'oui' : undefined}>
        <input id={idf} aria-invalid={erreur ? true : undefined} readOnly={inactif || input.readOnly} {...input} />
        {suffixe ? <span className="dz-l3-champ__suf">{suffixe}</span> : null}
      </span>
      {erreur ? <span className="dz-l3-champ__aide" data-ton="erreur" role="alert">{erreur}</span> : aide ? <span className="dz-l3-champ__aide">{aide}</span> : null}
    </div>
  );
}
export function ChampTexte({ nom, requis, large, erreur, aide, compteur, guide, id, ...area }: ChampCommun & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const idf = id || (typeof nom === 'string' ? `l3-${nom.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);
  return (
    <div className="dz-l3-champ" data-large={large ? 'oui' : undefined} data-guide={guide}>
      <label className="dz-l3-champ__nom" htmlFor={idf}><span>{nom}{requis ? ' *' : ''}</span>{compteur ? <small>{compteur}</small> : null}</label>
      <span className="dz-l3-champ__boite" data-erreur={erreur ? 'oui' : undefined}><textarea id={idf} {...area} /></span>
      {erreur ? <span className="dz-l3-champ__aide" data-ton="erreur" role="alert">{erreur}</span> : aide ? <span className="dz-l3-champ__aide">{aide}</span> : null}
    </div>
  );
}
/** Un champ dont la saisie est un composant d'avant (liste Radix, date…) : seulement le nom et l'aide. */
export function ChampLibre({ nom, large, aide, erreur, children }: { nom: ReactNode; large?: boolean; aide?: ReactNode; erreur?: ReactNode; children: ReactNode }) {
  return (
    <div className="dz-l3-champ" data-large={large ? 'oui' : undefined}>
      <span className="dz-l3-champ__nom"><span>{nom}</span></span>
      {children}
      {erreur ? <span className="dz-l3-champ__aide" data-ton="erreur" role="alert">{erreur}</span> : aide ? <span className="dz-l3-champ__aide">{aide}</span> : null}
    </div>
  );
}

// ───────────────────────── Jauge, dépôt, coches, pastilles, segments, onglets ─────────────────────────
export function Jauge({ nom, pct, texte, ton }: { nom: ReactNode; pct: number; texte: ReactNode; ton?: 'attention' | 'erreur' }) {
  return (
    <div className="dz-l3-jauge" data-ton={ton}>
      <div><span>{nom}</span><span>{texte}</span></div>
      <div className="dz-l3-jauge__barre" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
    </div>
  );
}
export function Depot({ t, s, accept, onFichier, multiple, testId, disabled }: { t: ReactNode; s?: ReactNode; accept?: string; onFichier: (f: FileList) => void; multiple?: boolean; testId?: string; disabled?: boolean }) {
  return (
    <label className="dz-l3-depot" data-testid={testId}>
      <b>{t}</b>{s ? <span>{s}</span> : null}
      <input type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={(e) => { if (e.target.files?.length) onFichier(e.target.files); e.target.value = ''; }} />
    </label>
  );
}
export function Coche({ l, s, checked, onChange, inactif, raison, testId }: { l: ReactNode; s?: ReactNode; checked: boolean; onChange?: (v: boolean) => void; inactif?: boolean; raison?: ReactNode; testId?: string }) {
  return (
    <label className="dz-l3-coche" data-inactif={inactif ? 'oui' : undefined} data-testid={testId}>
      <input type="checkbox" checked={checked} disabled={inactif} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="dz-l3-coche__boite" aria-hidden="true">{inactif ? '–' : checked ? '✓' : ''}</span>
      <span className="dz-l3-coche__txt"><span>{l}</span>{s ? <small>{s}</small> : null}</span>
      {raison ? <span className="dz-l3-coche__raison">{raison}</span> : null}
    </label>
  );
}
export function Seg<T extends string>({ nom, options, valeur, onChange, disabled }: { nom?: ReactNode; options: { v: T; l: ReactNode; testId?: string }[]; valeur: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="dz-l3-seg">
      {nom ? <span>{nom}</span> : null}
      <div role="group">
        {options.map((o) => <button key={o.v} type="button" aria-pressed={o.v === valeur} onClick={() => onChange(o.v)} disabled={disabled} data-testid={o.testId}>{o.l}</button>)}
      </div>
    </div>
  );
}
export function Onglets<T extends string>({ options, valeur, onChange, nom }: { options: { v: T; l: ReactNode; testId?: string; guide?: string }[]; valeur: T; onChange: (v: T) => void; nom: string }) {
  return (
    <div className="dz-l3-onglets" role="tablist" aria-label={nom}>
      {options.map((o) => <button key={o.v} type="button" role="tab" aria-selected={o.v === valeur} onClick={() => onChange(o.v)} data-testid={o.testId} data-guide={o.guide}>{o.l}</button>)}
    </div>
  );
}

// ───────────────────────── Clé / valeur, chiffres ─────────────────────────
export function Kv({ titre, lignes }: { titre?: ReactNode; lignes: [ReactNode, ReactNode, boolean?][] }) {
  return (
    <div className="dz-l3-bloc">
      {titre ? <Etiquette>{titre}</Etiquette> : null}
      <ul className="dz-l3-kv">{lignes.map(([k, v, mono], i) => <li key={i}><span>{k}</span><b data-mono={mono ? 'oui' : undefined}>{v}</b></li>)}</ul>
    </div>
  );
}
export function Chiffres({ items }: { items: { k: ReactNode; v: ReactNode; u?: ReactNode; s?: ReactNode; ton?: 'erreur'; testId?: string }[] }) {
  return (
    <div className="dz-l3-chiffres" style={{ '--l3-cols': items.length } as Style}>
      {items.map((t, i) => <div key={i} className="dz-l3-chiffre" data-ton={t.ton} data-testid={t.testId}><span>{t.k}</span><b>{t.v}{t.u ? <small>{t.u}</small> : null}</b>{t.s ? <small>{t.s}</small> : null}</div>)}
    </div>
  );
}

export function Squelettes({ n = 3 }: { n?: number }) {
  return <div className="dz-l3-bloc" aria-busy="true" aria-label="Chargement">{Array.from({ length: n }, (_, i) => <div key={i} className="dz-l3-squelette" />)}</div>;
}

/** Initiales « AT » d'un nom. */
export const initiales = (prenom?: string | null, nom?: string | null) => `${(prenom || '?')[0] || '?'}${(nom || '')[0] || ''}`.toUpperCase();
/** Fond d'avatar (pastels de la planche), stable par identifiant. */
const AV = ['#FFC21A', '#DDEBFA', '#E0ECE6', '#F1E2E2', '#EAD6F4', '#FCE3CF', '#E2EBEC', '#EFEADB'];
export const fondAvatar = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0; return AV[Math.abs(h) % AV.length]; };
