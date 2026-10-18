'use client';

// Design bureau · lot 3 A · « Fiche salarié · Gérer » (EQ09 à EQ12, EQ14) : panneau 760 px, onglets Gérer | Feuille d'heures (lot 2),
// identité et paie, habilitations, coût réel (EQ13, panneau à part), clôture des heures, archivage. Tous les états et tous les gestes restent
// dans components/worker-detail.tsx (saveWorker, addCert, deleteCert, askCloseUntil, confirmCloseUntil, doReopen, onArchiveClick,
// toggleArchive, deleteWorker) : cette vue les reçoit tels quels.
import { useEffect, useState, type ReactNode } from 'react';
import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Certification, CertificationType, User } from '@/lib/types';
import { Alerte, Btn, Champ, ChampLibre, Champs, Coche, Coque, Etiquette, Lignes, Ligne, Onglets, P } from './lot3a-ui';

type Fx<T> = (v: T) => void;
export interface GererV2Ctx {
  worker: User; onOpenChange: Fx<boolean>; allerHeures: () => void;
  mFirst: string; setMFirst: Fx<string>; mLast: string; setMLast: Fx<string>; mPhone: string; setMPhone: Fx<string>;
  mRate: string; setMRate: Fx<string>; mWeekly: string; setMWeekly: Fx<string>; companyWeeklyHours: number;
  mNir: string; setMNir: Fx<string>; mHireDate: string; setMHireDate: Fx<string>; mContract: string; setMContract: Fx<string>;
  matriculeDispo: boolean; mMatricule: string; setMMatricule: Fx<string>;
  certs: Certification[]; certLabels: Record<CertificationType, string>; certTypes: { key: CertificationType; label: string }[];
  certAdding: boolean; setCertAdding: Fx<boolean>; certType: CertificationType; setCertType: Fx<CertificationType>; certLabel: string; setCertLabel: Fx<string>;
  certExpiry: string; setCertExpiry: Fx<string>; certSaving: boolean; addCert: () => void; deleteCert: (id: string) => void;
  saveWorker: () => void; mSaving: boolean; mBusy: boolean; onArchiveClick: () => void; toggleArchive: () => void; deleteWorker: () => void;
  closureDispo: boolean; closedUntil: string | null; closeBusy: boolean; doReopen: () => void;
  askCloseUntil: (d: Date, thenArchive?: boolean) => void; closeTarget: { date: Date; drafts: number; thenArchive: boolean } | null; setCloseTarget: Fx<null>;
  confirmCloseUntil: () => void; closeErr: string | null;
  archiveAsk: boolean; setArchiveAsk: Fx<boolean>;
  missingOpen: string[];
  /** Le coût réel (EQ13) : la ligne et son panneau, rendus par real-cost-card (ou rien sans l'IA). */
  coutReel: ReactNode;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export default function GererV2({ c }: { c: GererV2Ctx }) {
  const w = c.worker;
  const nom = `${w.first_name} ${w.last_name}`.trim();
  const role = w.role === 'lead' ? 'Chef d’équipe' : w.role === 'admin' ? 'Bureau' : 'Salarié';
  const archive = !w.is_active;
  // EQ10 : la fenêtre « Clôturer les heures » est ouverte tant qu'une demande existe (askCloseUntil compte les brouillons puis pose closeTarget) ;
  // `attente` couvre ce comptage. Choisir « Clôturer » ou « Clôturer et archiver » repose la demande avec le bon choix, puis confirme (mêmes gestes).
  const [attente, setAttente] = useState(false);
  const [enchaine, setEnchaine] = useState<null | 'simple' | 'archive'>(null);
  const [avantArchiver, setAvantArchiver] = useState(true);
  const aujourdhui = iso(startOfDay(new Date()));
  const ouverte = attente || !!c.closeTarget;
  const dateChoisie = c.closeTarget ? iso(c.closeTarget.date) : aujourdhui;
  useEffect(() => { if (c.closeTarget) setAttente(false); }, [c.closeTarget]);
  useEffect(() => {
    if (!enchaine || !c.closeTarget || c.closeTarget.thenArchive !== (enchaine === 'archive')) return;
    setEnchaine(null); c.confirmCloseUntil();
  }, [enchaine, c.closeTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  const demander = (d: Date, archiver = false) => { setAttente(true); c.askCloseUntil(d, archiver); };
  const ouvrirCloture = () => demander(startOfDay(new Date()));
  const fermerCloture = () => { setAttente(false); setEnchaine(null); c.setCloseTarget(null); };
  const choisir = (archiver: boolean) => { if (!c.closeTarget) return; setEnchaine(archiver ? 'archive' : 'simple'); c.askCloseUntil(c.closeTarget.date, archiver); };
  const dateFuture = dateChoisie > aujourdhui;
  return (
    <>
      <Coque open onOpenChange={c.onOpenChange} forme="panneau" largeur={760} kicker={archive ? 'Fiche salarié · archivé' : 'Fiche salarié'} titre={nom || 'Salarié'}
        sous={[role, c.closedUntil ? `clôturé au ${format(parseISO(c.closedUntil), 'dd/MM')}` : ''].filter(Boolean).join(' · ')} testId="fiche-gerer-v2"
        onglets={<Onglets nom="Fiche salarié" valeur="gerer" onChange={(v) => { if (v === 'heures') c.allerHeures(); }} options={[{ v: 'gerer', l: 'Gérer' }, { v: 'heures', l: 'Feuille d’heures', testId: 'onglet-heures' }]} />}
        pied={<>
          <Btn ton="danger-contour" onClick={c.deleteWorker} disabled={c.mBusy} title="Supprimer (seulement sans donnée)">Supprimer</Btn>
          <Btn pousse onClick={c.onArchiveClick} disabled={c.mBusy} data-testid="worker-archive" data-guide="bureau-fiche.archiver">{archive ? 'Réactiver' : 'Archiver'}</Btn>
          {c.closureDispo && !c.closedUntil ? <Btn onClick={ouvrirCloture} disabled={c.closeBusy} data-testid="closure-open" data-guide="bureau-fiche.cloturer">Clôturer jusqu’au…</Btn> : null}
          <Btn ton="principal" onClick={c.saveWorker} disabled={c.mSaving} busy={c.mSaving} data-guide="bureau-fiche.enregistrer">Enregistrer</Btn>
        </>}>
        {archive ? <Alerte ton="verrou" titre="Compte archivé">Il ne peut plus se connecter et n’apparaît plus au planning. Ses heures et documents restent. « Réactiver » le remet comme avant.</Alerte> : null}
        {c.missingOpen.length > 0 ? <Alerte ton="erreur" testId="fiche-missing" titre={`${c.missingOpen.length} jour${c.missingOpen.length > 1 ? 's' : ''} en attente`}>
          {c.missingOpen.map((d) => format(parseISO(d), 'EEE d MMM', { locale: fr })).join(', ')}</Alerte> : null}
        <Champs cols={2}>
          <Champ nom="Prénom" value={c.mFirst} onChange={(e) => c.setMFirst(e.target.value)} />
          <Champ nom="Nom" value={c.mLast} onChange={(e) => c.setMLast(e.target.value)} />
          <Champ nom="Téléphone" mono value={c.mPhone} onChange={(e) => c.setMPhone(e.target.value)} />
          <Champ nom="E-mail" inactif value={w.email || ''} title="Identifiant de connexion" onChange={() => undefined} />
          <Champ nom="Taux horaire (coût chargé)" mono inputMode="decimal" suffixe="€/h" placeholder="ex. 28,50" value={c.mRate} onChange={(e) => c.setMRate(e.target.value)} />
          <Champ nom="Horaire hebdomadaire propre" mono inputMode="decimal" suffixe="h" placeholder={`par défaut ${c.companyWeeklyHours}`} value={c.mWeekly} onChange={(e) => c.setMWeekly(e.target.value)}
            title={`Vide : celui de l’entreprise (${c.companyWeeklyHours} h). Sert aux heures supplémentaires.`} />
          <Champ nom="N° de sécurité sociale" mono placeholder="1 23 45…" value={c.mNir} onChange={(e) => c.setMNir(e.target.value)} />
          <Champ nom="Date d’embauche" type="date" value={c.mHireDate} onChange={(e) => c.setMHireDate(e.target.value)} />
          <Champ nom="Type de contrat" placeholder="CDI, CDD, Intérim…" value={c.mContract} onChange={(e) => c.setMContract(e.target.value)} />
          {c.matriculeDispo ? <Champ nom="Matricule de paie" mono placeholder="ex. 00042" maxLength={32} value={c.mMatricule} onChange={(e) => c.setMMatricule(e.target.value)}
            title="Le numéro du cabinet comptable, recopié tel quel, zéros compris" /> : null}
        </Champs>

        <div className="dz-l3-bloc" data-guide="bureau-fiche.habilitations">
          <Etiquette>Habilitations</Etiquette>
          <div className="dz-l3-lignes">
            {c.certs.length === 0 && !c.certAdding ? <Ligne t="Aucune habilitation enregistrée." doux /> : null}
            {c.certs.map((ct) => {
              const j = differenceInCalendarDays(parseISO(ct.expiry_date), new Date());
              return <Ligne key={ct.id} t={`${c.certLabels[ct.type]}${ct.label ? ` — ${ct.label}` : ''}`} s={`Expire le ${format(parseISO(ct.expiry_date), 'dd/MM/yyyy')}`}
                badge={j <= 30 ? (j < 0 ? `EXPIRÉE DEPUIS ${-j} J` : j === 0 ? 'EXPIRE AUJOURD’HUI' : `DANS ${j} J`) : undefined} badgeTon={j <= 7 ? 'erreur' : 'jaune'}
                actions={<Btn taille="ligne" ton="danger-contour" onClick={() => c.deleteCert(ct.id)} aria-label={`Supprimer ${c.certLabels[ct.type]}`}>Supprimer</Btn>} />;
            })}
            {c.certAdding ? (
              <div className="dz-l3-ligne" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <ChampLibre nom="Type">
                  <select className="dz-l3-select" style={{ maxWidth: 'none' }} value={c.certType} onChange={(e) => c.setCertType(e.target.value as CertificationType)} aria-label="Type d’habilitation">
                    {c.certTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </ChampLibre>
                {c.certType === 'autre' ? <Champ nom="Libellé" placeholder="ex. Permis B" value={c.certLabel} onChange={(e) => c.setCertLabel(e.target.value)} /> : null}
                <Champ nom="Expire le" type="date" value={c.certExpiry} onChange={(e) => c.setCertExpiry(e.target.value)} />
                <span className="dz-l3-btns"><Btn taille="ligne" onClick={() => c.setCertAdding(false)}>Annuler</Btn><Btn taille="ligne" ton="encre" onClick={c.addCert} disabled={c.certSaving} busy={c.certSaving}>Ajouter</Btn></span>
              </div>
            ) : <Ligne t="+ Ajouter une habilitation" chev onClick={() => c.setCertAdding(true)} clicTestId="cert-ajouter" />}
          </div>
          <P ton="doux">Alertes e-mail à 30 et 7 jours avant l’expiration.</P>
        </div>

        {c.coutReel || c.closedUntil ? (
          <Lignes>
            {c.coutReel}
            {c.closedUntil ? <Ligne t={`Heures clôturées jusqu’au ${format(parseISO(c.closedUntil), 'dd/MM')}`} testId="closure-chip"
              actions={<>
                <Btn taille="ligne" onClick={ouvrirCloture} disabled={c.closeBusy} title="Changer la date">Changer</Btn>
                <Btn taille="ligne" onClick={c.doReopen} disabled={c.closeBusy} data-testid="closure-reopen">Rouvrir</Btn>
              </>} /> : null}
          </Lignes>
        ) : null}
      </Coque>

      {/* EQ10 · EQ11 : clôturer les heures (date au plus tard aujourd'hui, brouillons qui resteront bloqués, refus du serveur). */}
      <Coque open={ouverte} onOpenChange={(o) => { if (!o && !c.closeBusy) fermerCloture(); }} forme="fenetre" largeur={560} alerte titre={`Clôturer les heures de ${w.first_name}`} testId="closure-confirm"
        pied={<><Btn onClick={fermerCloture} disabled={c.closeBusy}>Annuler</Btn>
          <Btn ton={c.closeTarget?.thenArchive ? 'encre' : undefined} onClick={() => choisir(true)} disabled={c.closeBusy || !c.closeTarget || dateFuture} data-testid="closure-archive-btn">Clôturer et archiver</Btn>
          <Btn ton={c.closeTarget?.thenArchive ? undefined : 'encre'} onClick={() => choisir(false)} disabled={c.closeBusy || !c.closeTarget || dateFuture}
            busy={c.closeBusy} data-testid="closure-confirm-btn">Clôturer</Btn></>}>
        <Champ nom="Jusqu’au" type="date" max={aujourdhui} value={dateChoisie} data-testid="closure-date"
          onChange={(e) => { if (e.target.value) c.askCloseUntil(parseISO(e.target.value), !!c.closeTarget?.thenArchive); }}
          aide={`Son dernier jour travaillé, aujourd’hui au plus tard.${c.closedUntil ? ` Remplace le ${format(parseISO(c.closedUntil), 'dd/MM')}.` : ''}`}
          erreur={dateFuture ? 'Pas de date dans le futur : clôturez le jour de son départ ou après.' : undefined} />
        {c.closeTarget && c.closeTarget.drafts > 0 ? (
          <Alerte ton="attention" testId="closure-drafts" titre={`${c.closeTarget.drafts} brouillon${c.closeTarget.drafts > 1 ? 's' : ''} resteront bloqués`}>
            Pas envoyé{c.closeTarget.drafts > 1 ? 's' : ''} jusqu’à cette date, donc pas dans l’export ; il ne pourra plus les envoyer.</Alerte>
        ) : null}
        {c.closeErr ? <Alerte ton="erreur" titre="Clôture refusée" testId="closure-refus">{c.closeErr}</Alerte> : null}
        <P>Il ne pourra plus rien saisir ni envoyer jusqu’à cette date ; vous gardez la main. « Clôturer et archiver » fait les deux d’un geste (fin de contrat). Rouvrir ne supprime rien.</P>
      </Coque>

      {/* EQ12 : archiver un salarié dont les heures ne sont pas clôturées. */}
      <Coque open={c.archiveAsk} onOpenChange={c.setArchiveAsk} forme="fenetre" largeur={520} alerte titre={`Archiver ${w.first_name} ?`} testId="archive-ask"
        pied={<><Btn onClick={() => c.setArchiveAsk(false)}>Annuler</Btn>
          <Btn ton="encre" disabled={c.mBusy} onClick={() => { if (avantArchiver) demander(startOfDay(new Date()), true); else c.toggleArchive(); }}
            data-testid="archive-ask-oui">Archiver</Btn></>}>
        <P>Il disparaît du planning et ne peut plus se connecter. Ses heures et documents restent.</P>
        <Coche l={`Clôturer d’abord ses heures au ${format(new Date(), 'dd/MM')}`} s="Conseillé pour un départ : vous pourrez changer la date." checked={avantArchiver} onChange={setAvantArchiver} />
      </Coque>
    </>
  );
}

// ───────────────────────── EQ13 · Coût réel · bulletin ─────────────────────────
// La ligne « Coût réel » de la fiche, et son panneau (au-dessus de la fiche) : bulletins validés, dépôt (lecture par l'IA) ou saisie à la main,
// chiffres à vérifier. Lecture, contrôles et enregistrement : components/real-cost-card.tsx (RealCostCard), inchangés.
export interface CoutReelV2Props {
  prenom?: string;
  horaire: string | null;
  detail: string;
  bulletins: { id: string; mois: string; ligne: string; taux: string }[] | null;
  remove: (id: string) => void;
  reading: boolean;
  draft: { month: string; gross: string; employer_total: string; paid_hours: string } | null;
  setChamp: (k: 'month' | 'gross' | 'employer_total' | 'paid_hours', v: string) => void;
  draftSource: 'ai' | 'manual';
  doubts: string[];
  notice: string | null;
  saving: boolean;
  validate: () => void;
  annuler: () => void;
  deposer: (f: File | undefined) => void;
  saisir: () => void;
}
export function CoutReelV2(p: CoutReelV2Props) {
  const [open, setOpen] = useState(false);
  const champ = (k: 'month' | 'gross' | 'employer_total' | 'paid_hours', nom: string, extra: Record<string, string>) => (
    <Champ nom={nom} mono value={p.draft?.[k] ?? ''} onChange={(e) => p.setChamp(k, e.target.value)} {...extra}
      aide={p.doubts.includes(k) ? 'À vérifier.' : undefined} erreur={p.draft && !p.draft[k] ? 'À compléter.' : undefined} />
  );
  return (
    <>
      <Ligne t="Coût réel" s={p.horaire ? `${p.horaire} / heure · ${p.detail}` : `Déposez un bulletin${p.prenom ? ` de ${p.prenom}` : ''} pour connaître son vrai coût horaire.`} chev
        onClick={() => setOpen(true)} clicTestId="real-cost" guide="bureau-fiche.cout-bulletin" />
      <Coque open={open} onOpenChange={(o) => { if (!o && !p.saving) { setOpen(false); p.annuler(); } }} forme="panneau" kicker="Coût réel · si IA" titre={p.draft ? (p.draftSource === 'ai' ? 'Vérifiez les chiffres lus' : 'Chiffres du bulletin') : 'Coût réel'} testId="real-cost-v2"
        pied={p.draft ? <><Btn onClick={p.annuler} disabled={p.saving}>Annuler</Btn><Btn ton="principal" onClick={p.validate} disabled={p.saving} busy={p.saving}>Valider</Btn></> : undefined}>
        {p.reading ? <Alerte titre="Lecture du bulletin…">Les chiffres arrivent dans quelques secondes.</Alerte>
          : p.draft ? (<>
            {p.notice ? <Alerte ton="attention">{p.notice}</Alerte> : null}
            <Etiquette>Chiffres lus · vérifiez</Etiquette>
            <Champs cols={2}>
              {champ('month', 'Mois du bulletin', { type: 'month' })}
              {champ('paid_hours', 'Heures payées', { inputMode: 'decimal', placeholder: 'ex. 151,67' })}
              {champ('gross', 'Salaire brut (€)', { inputMode: 'decimal', placeholder: 'ex. 2 450,00' })}
              {champ('employer_total', 'Total versé par l’employeur (€)', { inputMode: 'decimal', placeholder: 'ex. 3 528,40' })}
            </Champs>
            <P ton="doux">Le bulletin n’est pas conservé : seuls ces 4 chiffres le seront, après validation. Ils remplacent le taux saisi pour le coût de ce mois.</P>
          </>) : (<>
            {p.horaire ? <Alerte ton="ok" titre={`${p.horaire} / heure`}>{p.detail}</Alerte> : <P>Déposez un bulletin{p.prenom ? ` de ${p.prenom}` : ''} pour connaître son vrai coût horaire.</P>}
            {p.bulletins === null ? <div className="dz-l3-squelette" /> : p.bulletins.length ? (
              <Lignes titre="Bulletins validés">{p.bulletins.map((b) => <Ligne key={b.id} t={b.mois} s={b.ligne} droite={b.taux}
                actions={<Btn taille="ligne" ton="danger-contour" onClick={() => p.remove(b.id)} aria-label="Supprimer ce bulletin">Supprimer</Btn>} />)}</Lignes>
            ) : null}
            <label className="dz-l3-depot" data-testid="payslip-depot">
              <b>Déposer un bulletin</b><span>PDF ou photo · 10 Mo au plus · visible par le bureau uniquement</span>
              <input type="file" accept="application/pdf,image/*" data-testid="payslip-file" onChange={(e) => p.deposer(e.target.files?.[0])} />
            </label>
            <div className="dz-l3-btns"><Btn onClick={p.saisir}>Saisir à la main</Btn></div>
          </>)}
      </Coque>
    </>
  );
}
