'use client';
/* eslint-disable @next/next/no-img-element -- la feuille n'a que de petites images d'une page imprimée (logos, photos) : une balise <img>, jamais next/image */

// « Imprimer comme à l'écran » — la FEUILLE imprimée du planning (voir planning-print.tsx pour le menu).
// Ce fichier est chargé À PART du premier affichage (admin-planning : import() au repos, ou à l'ouverture
// du menu 🖨) : la feuille ne pèse rien tant qu'on n'imprime pas, et Ctrl+P la trouve déjà là.
//
// En haut le bandeau noir de l'écran (logo BEMEXO à gauche, la période au centre, la pastille de
// l'entreprise à droite), la légende des couleurs sur une ligne, puis LE tableau de l'écran (mêmes
// cartes, mêmes couleurs, mêmes espacements ; la photo du salarié quand l'écran en montre une) dans
// un cadre noir franc. Aucune hauteur n'est imposée au tableau : chaque ligne a la hauteur de son
// contenu, avec le même minimum pour toutes (comme à l'écran) — jamais une ligne énorme à côté d'une
// ligne vide.
// UNE page quand elle tient : la feuille est mesurée (fitSheet) et réduite proportionnellement
// (jamais sous 0,75 : le nom d'une carte reste à 7 pt) ; sinon plusieurs pages, l'en-tête des colonnes
// répété et une ligne jamais coupée. PLANCHER DE LISIBILITÉ : AUCUN texte sous 7 pt sur le papier — les petits textes de
// l'écran (heures, sous-titres, annotations, légende, mois) sont relevés à 7 pt (max(taille de l'écran, 7 pt / échelle)) ;
// tout texte déjà assez grand garde exactement la taille de l'écran.
// MARGES : @page margin:0 — Chrome n'a alors aucune marge où écrire sa date, son titre, l'adresse et
// « 1/1 » (ils disparaissent sans que le patron ait à décocher « En-têtes et pieds de page »). Les 10 mm
// de marge sont ceux de la FEUILLE : 277 mm de large centrés, et deux lignes vides de 10 mm, l'une en tête de
// <thead>, l'autre en pied de <tfoot> — répétés sur CHAQUE page, donc des marges aussi sur les pages 2 et
// suivantes (avec margin:0 sans cela, elles n'auraient plus aucune marge). Les COULEURS,
// motifs (rayures des congés), pointillés et fonds des cartes sont ceux de l'écran, jamais modifiés ici.
// IMAGES : Ctrl+P monte la feuille et imprime aussitôt, sans rien attendre. Le logo BEMEXO est donc
// un data: URI (une image data: se charge sur-le-champ), tiré du fichier de /public ; une photo ou le
// logo de l'entreprise ne remplace les initiales / le nom qu'une fois CHARGÉS : jamais un rond vide.
// Elles sont donc préparées à l'avance (preloadPrintImages : au repos, à l'ouverture du menu) en petites images data: :
// montées par Ctrl+P, elles sont déjà là à la création de la balise et s'impriment comme à l'écran (même photo, réduite).
// Le bouton « Imprimer », lui, attend les images (settlePrintSheet) avant window.print().
//
// Rien ici n'écrit en base : imprimer ne change aucune donnée.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { format, getISOWeek, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { DAY_PARTS } from '@/supabase/functions/_shared/day-part';
import { MEETING_TINT } from '@/supabase/functions/_shared/missions';
import { periodDays, type PeriodKind } from '@/supabase/functions/_shared/print-period';
import { cap, type PrintJob, type PrintRow } from '@/components/planning-print';

const dayFull = (d: Date) => cap(format(d, 'EEEE', { locale: fr }));
/** « 19 – 25 octobre 2026 », « 26 octobre – 1 novembre 2026 », « 28 décembre 2026 – 3 janvier 2027 ». */
function rangeLabel(days: Date[]): string {
  const a = days[0], b = days[days.length - 1];
  if (a.getFullYear() !== b.getFullYear()) return `${format(a, 'd MMMM yyyy', { locale: fr })} – ${format(b, 'd MMMM yyyy', { locale: fr })}`;
  if (a.getMonth() !== b.getMonth()) return `${format(a, 'd MMMM', { locale: fr })} – ${format(b, 'd MMMM yyyy', { locale: fr })}`;
  return `${format(a, 'd')} – ${format(b, 'd MMMM yyyy', { locale: fr })}`;
}

// La feuille n'existe qu'à l'impression : cachée à l'écran, seule visible sur papier.
// Ses règles de mise en page valent pour tous les médias (la feuille est cachée à l'écran) :
// c'est ainsi qu'on peut la MESURER hors de la vue (.bt-measuring) exactement comme elle sera
// imprimée. Le @page n'existe que tant qu'elle est montée : Ctrl+P ailleurs reste inchangé.
// Les règles de grille (PL_GRID_CSS) viennent de la page, qui reste montée.
export const PRINT_SHEET_CSS = `
@media screen{.bt-print:not(.bt-measuring){display:none!important}}
/* Mesure : la feuille à sa largeur de papier (277 mm), hors de la vue, invisible. */
.bt-print.bt-measuring{display:block!important;position:fixed!important;left:-30000px;top:0;margin:0!important;visibility:hidden}
@media print{
  @page{size:A4 landscape;margin:0}
  html,body{background:#fff!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:visible!important}
  /* L'appli, les fenêtres (portails Radix) et les petits messages : rien d'autre que la feuille. */
  body>*:not(.bt-print){display:none!important}
  .bt-print{display:block!important}
}
/* Navigateur qui ignore @page (Firefox, Safari) et imprime en portrait : la feuille reste dans la page. */
@media print and (orientation:portrait){.bt-print{max-width:calc(100% - 20mm)}.bt-print--month .bt-print-z{zoom:.67}}
/* 277 mm = A4 paysage moins 10 mm de chaque côté (@page margin:0 : les marges sont celles de la feuille). */
.bt-print{box-sizing:border-box;width:277mm;max-width:100%;margin:0 auto;font-family:'Archivo',sans-serif;color:#15120F;background:#fff}
/* Sans « graphiques d'arrière-plan », Chrome efface les fonds : les bulles noires
   (heures envoyées) deviendraient du texte pâle sur blanc, les hachures disparaîtraient. */
.bt-print,.bt-print *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Réduction proportionnelle (fitSheet) : tout rétrécit ensemble, le tableau garde la largeur du papier. */
.bt-print-z{zoom:var(--bt-z,1)}
.bt-print .bt-pl-table{min-width:0;width:100%;max-width:100%;box-sizing:border-box}
.bt-print thead{display:table-header-group}
.bt-print tr{break-inside:avoid;page-break-inside:avoid}
/* Marges haut et bas de CHAQUE page : une ligne vide de 10 mm en tête de <thead> et une en pied de <tfoot>
   (le navigateur les répète sur toutes les pages). Divisées par l'échelle : elles font 10 mm sur le papier. */
.bt-print .bt-print-pad>*{height:calc(10mm / var(--bt-z,1));padding:0;border:0!important;line-height:0;font-size:0;background:#fff}
/* CADRE extérieur : un trait noir franc (4 px sur la semaine, réduite à ~.8, soit ~3 px ; 3,5 px sur le
   jour ; 3 px sur le mois) à gauche, à droite, en haut (sous le bandeau et la légende) et en bas — plus épais que les
   traits internes (1 px), donc visible même en noir et blanc. Le pied vide (tfoot) referme le cadre en
   bas de CHAQUE page quand le tableau en compte plusieurs. */
.bt-print{--bt-frame:3px}
.bt-print--week{--bt-frame:4px}
.bt-print--day{--bt-frame:3.5px}
.bt-print table{border-collapse:collapse}
.bt-print table thead tr:not(.bt-print-title)>*{border-top:var(--bt-frame) solid #15120F}
.bt-print table thead tr:not(.bt-print-title)>:first-child,.bt-print table tbody tr>:first-child{border-left:var(--bt-frame) solid #15120F}
.bt-print table thead tr:not(.bt-print-title)>:last-child,.bt-print table tbody tr>:last-child{border-right:var(--bt-frame) solid #15120F}
.bt-print table tbody:last-of-type tr:last-child>td{border-bottom:var(--bt-frame) solid #15120F}
.bt-print tfoot{display:table-footer-group}
.bt-print tfoot td{height:0;padding:0;border:0;border-top:var(--bt-frame) solid #15120F;line-height:0;font-size:0}
/* AUCUNE hauteur imposée au tableau : chaque ligne prend la hauteur de son contenu, avec le MÊME minimum
   pour toutes (celui de l'écran : 88 px de case + 2 × 8 px de marge). Un tableau qui reçoit une hauteur
   la répartit entre ses lignes au prorata de leur contenu — la ligne la plus chargée prenait presque tout. */
/* Coin « S-43 / Salarié » : ses deux étiquettes sont placées en absolu dans la case. */
.bt-print .bt-pl-th-name{position:relative;width:auto}
.bt-print .bt-pl-namecell{position:static}
.bt-print .bt-pl-namebtn{cursor:default}
.bt-print .bt-pl-namebtn:hover{background:transparent}
/* Le nom ENTIER sur la feuille (elle se signe) : il passe à la ligne, jamais « … ». */
.bt-print .bt-pl-name{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;line-height:1.15}
/* La photo du salarié couvre la pastille (les initiales, dessous, ne sont retirées qu'une fois la photo chargée). */
.bt-print .bt-pl-avatar{position:relative}
.bt-print .bt-pl-avatar-img{position:absolute;inset:0}
.bt-print .bt-pl-cellfill{cursor:default}
.bt-print .bt-pl-cellfill:hover{background:transparent}
/* BANDEAU : la barre noire de l'écran (fond, couleurs, typo), logo à gauche, période au centre,
   pastille de l'entreprise à droite (celle de l'écran, sans menu ni flèche). */
.bt-print-title>th{border:0;padding:0 0 6px;text-align:left;font-weight:400;background:#fff}
.bt-print-bar{display:grid;grid-template-columns:minmax(max-content,1fr) auto minmax(max-content,1fr);align-items:center;gap:14px;background:#15120F;color:#F2EDE3;padding:5px 14px 5px 18px;min-height:44px;border-radius:14px}
.bt-print-logo{display:block;height:18px;width:auto;justify-self:start}
.bt-print-what{font-size:14px;font-weight:800;text-align:center;color:#F2EDE3}
.bt-print-co{justify-self:end;display:inline-flex;align-items:center;gap:8px;max-width:340px;padding:4px 12px;border:1.5px solid rgba(242,237,227,.22);border-radius:10px;font-size:13px;font-weight:800;line-height:1.15;color:#F2EDE3}
.bt-print-co.has-logo{padding-left:4px}
.bt-print-co-av{width:24px;height:24px;border-radius:50%;background:#FFC21A;overflow:hidden;flex:none}
.bt-print-co-av img{width:100%;height:100%;object-fit:cover;display:block}
.bt-print-leg{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin-top:6px;font-size:max(10px,var(--bt-fs));font-weight:600;color:#57524A}
.bt-print-at{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:max(9px,var(--bt-fs));color:#6E6A63;white-space:nowrap}
.bt-print-sw{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px dashed;margin-right:4px;vertical-align:-1px}
.bt-print-sig{border-left:2px solid #15120F}
th.bt-print-sig .bt-pl-th-day{font-size:13px}
td.bt-print-sig{height:56px}
.bt-print--day .bt-pl-cellfill{flex-direction:row;flex-wrap:wrap;align-items:flex-start}
.bt-print--day .bt-pl-cellfill>*{flex:0 0 230px}
/* Lot 3bis — le MOIS : une ligne par salarié, une colonne par jour, sur 1047 px
   utiles (A4 paysage). Dans une case : un petit bloc par intervention, le code du
   chantier (clé en tête de chaque page), la couleur du créneau, noir = envoyé.
   Toutes les lignes ont la même hauteur minimale (--bt-rowmin, agrandie par fitSheet quand
   il reste de la place), sans hauteur imposée au tableau. */
.bt-print--month .bt-print-title>th{padding-bottom:4px}
.bt-print--month .bt-print-bar{gap:12px}
.bt-print--month .bt-print-leg{gap:3px 10px;margin-top:4px;font-size:max(8.5px,var(--bt-fs))}
.bt-print--month .bt-print-at{font-size:max(8px,var(--bt-fs))}
.bt-print--month .bt-print-sw{width:9px;height:9px;border-radius:2px;margin-right:3px}
.bt-print-m-key{margin-top:3px;font-size:max(8.5px,var(--bt-fs));font-weight:600;color:#57524A;line-height:1.35}
.bt-print-m-key b{font-weight:900;color:#15120F}
.bt-print-m{width:100%;border-collapse:collapse;table-layout:fixed}
.bt-print-m tbody tr{height:var(--bt-rowmin,7mm)}
.bt-print-m.with-sig tbody tr{height:var(--bt-rowmin,7.5mm)}
.bt-print-m col.n{width:30mm}
.bt-print-m col.sig{width:16mm}
.bt-print-m th.d{padding:2px 0 3px;text-align:center;border:1px solid rgba(21,18,15,.25);border-bottom:1.5px solid #15120F;line-height:1;font-weight:400}
.bt-print-m .wd{display:block;font-size:max(7px,var(--bt-fs));font-weight:700;color:#6E6A63;text-transform:uppercase}
.bt-print-m .dn{display:block;font-size:9.5px;font-weight:900;margin-top:1px}
.bt-print-m th.sig .dn{font-size:max(7.5px,var(--bt-fs))}
.bt-print-m th.n{text-align:left;padding:2px 5px;font-size:max(9px,var(--bt-fs));font-weight:900;border:1px solid rgba(21,18,15,.25);border-right:1.5px solid #15120F;border-bottom:1.5px solid #15120F}
.bt-print-m .we{background:#F4F1EA}
.bt-print-m .mon{border-left:1.5px solid #15120F}
.bt-print-m td{border:1px solid rgba(21,18,15,.22);padding:1px;vertical-align:top}
.bt-print-m td.n{padding:3px 5px;font-size:max(9px,var(--bt-fs));font-weight:800;line-height:1.12;overflow-wrap:anywhere;border-right:1.5px solid #15120F;vertical-align:middle}
.bt-print-m .sig{border-left:1.5px solid #15120F}
.bt-print-m-b{display:block;height:12px;line-height:12px;margin-bottom:1px;border-radius:2px;border-left:2px solid;font-size:max(7.5px,var(--bt-fs));font-weight:800;text-align:center;white-space:nowrap;overflow:hidden;color:#15120F;letter-spacing:-.03em}
.bt-print-m-b:last-child{margin-bottom:0}
.bt-print-m-b.is-real{background:#15120F;color:#F2EDE3}
.bt-print-m-b.is-white{border:1px dashed;border-left-width:2px}
.bt-print-m-b.is-off{opacity:.55;text-decoration:line-through}
.bt-print-m-abs{display:flex;align-items:center;justify-content:center;min-height:14px;height:100%;font-size:max(8.5px,var(--bt-fs));font-weight:900;border-radius:2px}
/* PLANCHER DE LISIBILITÉ : sur le papier, AUCUN texte sous 7 pt (9,35 px effectifs, soit 9,35 / échelle dans la feuille réduite).
   Les textes plus grands restent EXACTEMENT à la taille de l'écran (max() ne change rien pour eux) ; seuls les petits textes de
   l'écran (heures, sous-titres, annotations : 8,5 à 11 px) sont relevés jusqu'à 7 pt — à l'écran ils sont lus de près, sur une
   feuille réduite et lue à bout de bras, non. */
.bt-print-z{--bt-fs:calc(9.35px / var(--bt-z,1))}
.bt-print .bt-pl-bub-sub,.bt-print .bt-pl-bub-draft,.bt-print .bt-print-tasks{font-size:max(10.5px,var(--bt-fs))}
.bt-print .bt-pl-hour{font-size:max(10px,var(--bt-fs))}
.bt-print .bt-pl-real-txt,.bt-print .bt-pl-abs-lbl{font-size:max(11px,var(--bt-fs))}
.bt-print .bt-pl-bub-docs,.bt-print .bt-pl-check,.bt-print .bt-print-tasks .k{font-size:max(9px,var(--bt-fs))}
.bt-print .bt-pl-tag,.bt-print .bt-pl-extra-by{font-size:max(8.5px,var(--bt-fs))}
.bt-print .bt-pl-extra-name{font-size:max(12px,var(--bt-fs))}
.bt-print .bt-pl-meet{font-size:max(11.5px,var(--bt-fs))}
.bt-print .bt-pl-meet.big{font-size:max(12.5px,var(--bt-fs))}
.bt-print .bt-pl-meet .h{font-size:max(10.5px,var(--bt-fs))}
.bt-print .bt-print-tasks .tm{font-size:max(9.5px,var(--bt-fs))}
`;
// Objet FIXE, comme PL_STYLE (admin-planning) : un nouvel objet à chaque rendu
// ferait réécrire la feuille de style par React.
const PRINT_SHEET_STYLE = { __html: PRINT_SHEET_CSS };
// Permet à un enfant `height:100%` de suivre la hauteur de la ligne (comme à l'écran).
const CELL_HEIGHT_HACK = { height: '1px' } as const;

// Le logo BEMEXO (version claire, pour fond sombre) : celui de /public, relu une fois et gardé en data: URI —
// une image data: est prête sur-le-champ, même montée à la dernière seconde par Ctrl+P. Si la lecture échoue,
// l'adresse du fichier : le bouton « Imprimer » l'attend de toute façon (settlePrintSheet).
const LOGO_FILE = '/bemexo-wordmark-light.svg';
let logoSrc = LOGO_FILE;
export async function warmPrintLogo(): Promise<void> {
  if (logoSrc !== LOGO_FILE) return;
  try {
    const r = await fetch(LOGO_FILE);
    if (r.ok) logoSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await r.text())}`;
  } catch { /* hors ligne : l'adresse du fichier */ }
}

// ── Une page quand elle tient ──────────────────────────────────────────────────────
// Échelle de la feuille [la plus petite, la plus grande]. Semaine : 0,8 = les proportions de
// l'écran (grille de ~1300 px de large sur 277 mm), jamais sous 0,75 (le nom d'une carte, 12,5 px,
// reste à 7 pt). Jour : jusqu'à 1. Mois : sa grille compacte ne rétrécit pas (son texte est déjà petit).
const ZOOMS: Record<PeriodKind, [number, number]> = { week: [0.75, 0.8], day: [0.75, 1], month: [1, 1] };
const MM = 96 / 25.4;
// Hauteur d'une page A4 paysage moins 1,5 mm de sécurité (les marges de 10 mm haut et bas font partie de la feuille).
const ROOM = (210 - 1.5) * MM;
interface Fit { z: number; one: boolean; rowmin?: number }

/**
 * Mesure la feuille telle qu'elle sera imprimée (à sa largeur de papier, hors de la vue) et choisit :
 * la plus grande échelle qui tient sur UNE page, sinon l'échelle maximale sur plusieurs pages.
 */
function fitSheet(root: HTMLElement, kind: PeriodKind): Fit {
  const zw = root.querySelector<HTMLElement>('.bt-print-z');
  const [zmin, zmax] = ZOOMS[kind];
  if (!zw) return { z: zmax, one: false };
  root.classList.add('bt-measuring');
  try {
    const high = (z: number) => { zw.style.setProperty('--bt-z', String(z)); return zw.getBoundingClientRect().height; };
    let z = zmax, one = high(zmax) <= ROOM;
    if (!one && zmin < zmax && high(zmin) <= ROOM) {
      let lo = zmin, hi = zmax;
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (high(mid) <= ROOM) lo = mid; else hi = mid; }
      z = lo; one = true;
    }
    const h = high(z);
    // Mois, une page : il reste de la place → toutes les lignes grandissent ENSEMBLE (même minimum), jusqu'à 13 mm.
    if (one && kind === 'month') {
      const n = root.querySelectorAll('tbody tr').length || 1;
      const base = (root.querySelector('.with-sig') ? 7.5 : 7) * MM;
      return { z, one, rowmin: Math.min(13 * MM, base + Math.max(0, ROOM - h) / n) };
    }
    return { z, one };
  } finally {
    root.classList.remove('bt-measuring');
  }
}

/**
 * À appeler juste avant window.print() : attend que les images de la feuille (photos des salariés,
 * logo de l'entreprise) soient décodées — jamais un rond vide sur le papier — 2 s au plus, puis
 * remesure la feuille (les polices sont chargées). Une image qui ne vient pas est abandonnée
 * (initiales à la place d'une photo) : on imprime quand même.
 */
export async function settlePrintSheet(): Promise<void> {
  const root = document.querySelector('.bt-print');
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll('img'));
  if (imgs.length) await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => undefined))), new Promise((r) => setTimeout(r, 2000))]);
  root.dispatchEvent(new Event('bt-refit'));
}

// Images demandées à l'avance (photos des salariés, logo de l'entreprise), gardées sous forme de PETITES images data: —
// seule une image data: est prête à la création de la balise : Ctrl+P monte la feuille et imprime aussitôt, et une
// image « http » même déjà vue à l'écran n'est chargée qu'après coup (jamais à temps : le PDF aurait les initiales).
const warmImages = new Map<string, string>();
const warmAsked = new Set<string>();
/** Réduit une image (photo ou logo) à ~128 px sur son petit côté, en data: URI ; null si elle ne se lit pas (autre site sans CORS, SVG…). */
async function shrinkImage(url: string): Promise<string | null> {
  const r = await fetch(url, { credentials: 'omit', signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined });
  if (!r.ok) return null;
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);
  try {
    const k = Math.min(1, 128 / Math.min(bmp.width, bmp.height), 512 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    const g = cv.getContext('2d');
    if (!g) return null;
    g.drawImage(bmp, 0, 0, cv.width, cv.height);
    // JPEG pour une photo ; PNG si l'image peut être transparente (logo, pastille jaune derrière).
    return /jpe?g/.test(blob.type) ? cv.toDataURL('image/jpeg', 0.88) : cv.toDataURL('image/png');
  } finally { bmp.close(); }
}
/**
 * Prépare à l'avance (au repos, ou à l'ouverture du menu 🖨) les photos des salariés et le logo de l'entreprise — ceux de
 * l'écran — en petites images data: : la feuille montée par Ctrl+P (beforeprint, sans attente) les trouve prêtes et les
 * imprime comme l'écran. Une image qui ne se lit pas est laissée telle quelle : initiales / nom seul sur Ctrl+P, et le
 * bouton « Imprimer » (settlePrintSheet) attend l'image d'origine.
 */
export async function preloadPrintImages(urls: (string | null | undefined)[]): Promise<void> {
  const queue = Array.from(new Set(urls)).filter((u): u is string => !!u && !u.startsWith('data:') && !warmAsked.has(u));
  queue.forEach((u) => warmAsked.add(u));
  // Quatre à la fois au plus : jamais une rafale au repos, et une image qui traîne ne bloque pas les autres.
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const small = await shrinkImage(url);
        if (small) warmImages.set(url, small);
      } catch { /* l'image d'origine sera utilisée */ }
    }
  }));
}
const printSrc = (url: string) => warmImages.get(url) ?? url;

/**
 * Une image de la feuille : `ready` devient vrai quand elle est chargée — tout de suite pour une image préparée (data:),
 * ou déjà complète à la pose de la balise. `bad` : elle ne vient pas (on garde les initiales / le nom seul).
 */
function useSheetImage(src: string | null | undefined) {
  const [ready, setReady] = useState(() => !!src && src.startsWith('data:'));
  const [bad, setBad] = useState(false);
  const ref = useCallback((el: HTMLImageElement | null) => { if (el && el.complete && el.naturalWidth > 0) setReady(true); }, []);
  return { ready, bad, ref, onLoad: () => setReady(true), onError: () => setBad(true) };
}

/**
 * La photo du salarié si l'écran en montre une (même image), sinon ses initiales. La photo se pose PAR-DESSUS
 * les initiales, qui ne disparaissent qu'une fois la photo chargée : une photo pas encore arrivée (Ctrl+P
 * n'attend rien) ou qui ne vient pas laisse les initiales, jamais un rond vide.
 */
function PrintAvatar({ r }: { r: PrintRow }) {
  const src = r.photo ? printSrc(r.photo) : null;
  const img = useSheetImage(src);
  const photo = src && !img.bad ? src : null;
  return (
    <span className="bt-pl-avatar" style={r.tint}>
      {photo && <img ref={img.ref} className="bt-pl-avatar-img" src={photo} alt="" onLoad={img.onLoad} onError={img.onError} />}
      {!(photo && img.ready) && r.initials}
    </span>
  );
}

/** La pastille de l'entreprise du bandeau : son logo (une fois chargé) et son nom, sinon son nom seul. */
function CompanyPill({ name, logo }: { name: string; logo?: string }) {
  const src = logo ? printSrc(logo) : null;
  const img = useSheetImage(src);
  const has = !!src && !img.bad;
  return (
    <span className={`bt-print-co${has && img.ready ? ' has-logo' : ''}`} data-testid="print-company">
      {has && <span className="bt-print-co-av" hidden={!img.ready}><img ref={img.ref} src={src!} alt="" onLoad={img.onLoad} onError={img.onError} /></span>}
      <span>{name}</span>
    </span>
  );
}

/** La grille imprimée. Uniquement des div/span : aucun bouton, rien de cliquable. */
export function PlanningPrintSheet({ job, company, companyLogo, rows, renderCell, codes, hasMeetings = false }: {
  job: PrintJob;
  company: string;
  /** Le logo de l'entreprise (celui de la pastille de l'écran), s'il en a un. */
  companyLogo?: string;
  rows: PrintRow[];
  renderCell: (workerId: string, iso: string) => ReactNode;
  /** Mois : code de chaque chantier imprimé (titre → code), pour la clé « Chantiers : ». */
  codes?: Map<string, string>;
  /** Lot 4 : au moins une réunion sur la feuille → « 👥 Réunion » dans la légende. */
  hasMeetings?: boolean;
}) {
  const kind = job.period.kind;
  const days = periodDays(job.period).map((d) => parseISO(d));
  const weekNo = getISOWeek(days[0]);
  const one = job.who !== 'all' ? rows[0]?.name : null;
  const cols = 1 + days.length + (job.signature ? 1 : 0);
  // Échelle et nombre de pages : mesurés dès le montage (Ctrl+P n'attend pas), puis à nouveau
  // une fois les images et les polices là (settlePrintSheet, bouton).
  const rootRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ z: ZOOMS[kind][1], one: false });
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el) setFit(fitSheet(el, kind));
  }, [job, rows.length, kind]);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const again = () => flushSync(() => setFit(fitSheet(el, kind)));
    el.addEventListener('bt-refit', again);
    return () => el.removeEventListener('bt-refit', again);
  }, [kind]);
  const sheetStyle = (fit.rowmin ? { '--bt-rowmin': `${fit.rowmin}px` } : undefined) as CSSProperties | undefined;
  const zoomStyle = { '--bt-z': fit.z } as CSSProperties;
  // Pied vide : referme le cadre en bas de chaque page (ne contient rien, ne s'imprime que comme un trait).
  const frameEnd = <tfoot className="bt-print-end"><tr><td colSpan={cols} /></tr><tr className="bt-print-pad"><td colSpan={cols} /></tr></tfoot>;
  // Marge du haut de chaque page (avec la ligne vide du pied) : voir PRINT_SHEET_CSS.
  const padTop = <tr className="bt-print-title bt-print-pad"><th colSpan={cols} /></tr>;
  // Le bandeau (logo · période · entreprise) et la légende : dans <thead>, donc répétés en haut de chaque page.
  const head = (what: string, extra?: ReactNode) => (
    <tr className="bt-print-title">
      <th colSpan={cols}>
        <div className="bt-print-bar">
          <img className="bt-print-logo" src={logoSrc} alt="BEMEXO" />
          <span className="bt-print-what" data-testid="print-what">{what}{one ? ` · ${one}` : ''}</span>
          <CompanyPill name={company} logo={companyLogo} />
        </div>
        <div className="bt-print-leg">
          {DAY_PARTS.map((d) => (
            <span key={d.key}><span className="bt-print-sw" style={{ background: d.bg, borderColor: d.edge }} />{d.label} · {d.hint}</span>
          ))}
          <span>Blanc : journée entière ou sans horaire · Noir : heures envoyées{kind === 'month' ? ' · C congé · I intempérie · A absent · R repos' : ''}</span>
          {hasMeetings && kind !== 'month' && (
            <span data-testid="print-leg-meeting"><span className="bt-print-sw" style={{ background: MEETING_TINT.bg, borderColor: MEETING_TINT.edge, borderStyle: 'solid' }} />👥 Réunion · ne compte pas dans les heures</span>
          )}
          <span className="bt-print-at">Imprimé le {format(job.printedAt, "d MMM yyyy 'à' HH:mm", { locale: fr })}</span>
        </div>
        {extra}
      </th>
    </tr>
  );
  const cls = `bt-print bt-print--${kind}`;
  if (kind === 'month') {
    // La clé et l'en-tête des jours sont dans <thead> : Chrome les répète en haut de
    // chaque page, et une ligne (tr) n'est jamais coupée entre deux pages.
    const key = Array.from((codes || new Map<string, string>()).entries()).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
    return (
      <div className={cls} data-testid="print-sheet" data-pages={fit.one ? 1 : undefined} style={sheetStyle} ref={rootRef}>
        <style dangerouslySetInnerHTML={PRINT_SHEET_STYLE} />
        <div className="bt-print-z" style={zoomStyle}>
          <table className={`bt-print-m${job.signature ? ' with-sig' : ''}`} data-testid="print-month">
            <colgroup>
              <col className="n" />
              {days.map((d) => <col key={d.toISOString()} />)}
              {job.signature && <col className="sig" />}
            </colgroup>
            <thead>
              {padTop}
              {head(`Planning · ${format(days[0], 'MMMM yyyy', { locale: fr })}`, key.length > 0 && (
                <div className="bt-print-m-key" data-testid="print-m-key">
                  Chantiers :{' '}
                  {key.map(([title, code], i) => <span key={code} data-code={code}>{i ? ' · ' : ''}<b>{code}</b> {title}</span>)}
                </div>
              ))}
              <tr>
                <th className="n">Salarié</th>
                {days.map((d) => {
                  const wd = (d.getDay() + 6) % 7;
                  return (
                    <th key={d.toISOString()} className={`d${wd >= 5 ? ' we' : ''}${wd === 0 ? ' mon' : ''}`} data-testid="print-m-day">
                      <span className="wd">{format(d, 'EEEEE', { locale: fr })}</span><span className="dn">{format(d, 'd')}</span>
                    </th>
                  );
                })}
                {job.signature && <th className="d sig"><span className="dn">Signature</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="print-m-row">
                  <td className="n">{r.name}</td>
                  {days.map((d) => {
                    const iso = format(d, 'yyyy-MM-dd');
                    const wd = (d.getDay() + 6) % 7;
                    return (
                      <td key={iso} className={`${wd >= 5 ? 'we' : ''}${wd === 0 ? ' mon' : ''}`.trim() || undefined} data-day={iso} style={CELL_HEIGHT_HACK}>
                        {renderCell(r.id, iso)}
                      </td>
                    );
                  })}
                  {job.signature && <td className="sig" />}
                </tr>
              ))}
            </tbody>
            {frameEnd}
          </table>
        </div>
      </div>
    );
  }
  const week = kind === 'week';
  const what = week
    ? `Planning · semaine ${weekNo} · ${rangeLabel(days)}`
    : `${cap(format(days[0], 'EEEE d MMMM yyyy', { locale: fr }))} · semaine ${weekNo}`;
  return (
    <div className={cls} data-testid="print-sheet" data-pages={fit.one ? 1 : undefined} style={sheetStyle} ref={rootRef}>
      <style dangerouslySetInnerHTML={PRINT_SHEET_STYLE} />
      <div className="bt-print-z" style={zoomStyle}>
        <table className="bt-pl-table">
          {/* Largeurs explicites : en table-layout:fixed, la ligne de titre (colspan) en
              premier rendrait toutes les colonnes égales et couperait les noms. 200 px = la colonne des noms de l'écran. */}
          <colgroup>
            <col style={{ width: 200 }} />
            {days.map((d) => <col key={d.toISOString()} />)}
            {job.signature && <col style={{ width: week ? 110 : 180 }} />}
          </colgroup>
          <thead>
            {padTop}
            {head(what)}
            <tr>
              <th className="bt-pl-th-name">
                <span className="bt-pl-corner-wk">S-{weekNo}</span>
                <span className="bt-pl-corner-sal">Salarié</span>
              </th>
              {days.map((d) => (
                <th key={d.toISOString()} className="bt-pl-th">
                  <div className="bt-pl-th-cell">
                    <span className="bt-pl-th-day">{dayFull(d)}</span>
                    <span className="bt-pl-th-num">{format(d, 'd')}</span>
                  </div>
                </th>
              ))}
              {job.signature && <th className="bt-pl-th bt-print-sig"><span className="bt-pl-th-day">Signature</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="bt-pl-namecell" style={CELL_HEIGHT_HACK}>
                  <div className="bt-pl-namebtn">
                    <span className="bt-pl-nametop">
                      <PrintAvatar r={r} />
                      <span className="bt-pl-name">{r.name}</span>
                    </span>
                  </div>
                </td>
                {days.map((d) => {
                  const iso = format(d, 'yyyy-MM-dd');
                  return (
                    <td key={iso} className="bt-pl-cell" style={CELL_HEIGHT_HACK}>
                      <div className="bt-pl-cellinner">{renderCell(r.id, iso)}</div>
                    </td>
                  );
                })}
                {job.signature && <td className="bt-pl-cell bt-print-sig" />}
              </tr>
            ))}
          </tbody>
          {frameEnd}
        </table>
      </div>
    </div>
  );
}
