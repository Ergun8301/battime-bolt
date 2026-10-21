'use client';

// Design bureau · lot 3 A · les fenêtres d'admin-planning.tsx habillées v2 : « Chantiers » au téléphone (XM01), « Nouveau client » (CL03, CL04),
// « Fiche client » (CL05, CL07, XM02), « Salariés » (EQ01, EQ07, EQ08, XM03), « Nouveau salarié » (EQ02), « Invitations en attente » (EQ04 à EQ06).
// Les états et les gestionnaires restent dans admin-planning.tsx : ils arrivent ici TELS QUELS, en listes ordonnées (`Lot3Ctx`) pour ne presque
// rien ajouter au premier chargement de /admin (les noms de clés ne seraient pas raccourcis par le minificateur ; plafond de poids à 1 kB près).
// Rien n'est copié : chaque bouton appelle le gestionnaire d'avant. Chargé en différé, seulement avec ?ui=2.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import type { Invitation, User, Worksite } from '@/lib/types';
import { readSupportSession } from '@/lib/support';
import { canFinishWorksite, completionUi, hasCompletionColumn, termineLe } from '@/supabase/functions/_shared/chantier-statut';
import type { useInvitationsAttente } from '@/components/pending-invitations';
import type { TermineTarget } from '@/components/chantier-termine';
import { Alerte, Btn, Champ, ChampTexte, Champs, Coque, Etiquette, Lignes, Ligne, P, Recherche, Vide, fondAvatar, initiales } from './lot3a-ui';

type Fx<T> = (v: T) => void;
type Role = 'admin' | 'lead' | 'worker';

/** Ce qu'admin-planning.tsx passe, dans cet ordre exact (voir l'appel : même ordre, mêmes noms). */
export interface Lot3Ctx {
  /** Chantiers (téléphone) : ouvert, ouvrir, chantiers, filtrés, recherche, changer la recherche, ouvrir une fiche, ouvrir « Nouveau client », ouvrir « Importer ». */
  ch: [boolean, Fx<boolean>, Worksite[], Worksite[], string, Fx<string>, (w: Worksite) => void, Fx<boolean>, Fx<boolean>];
  /** Fiche client : chantier ouvert, le fermer, 9 champs et leurs changeurs (nom, produit, tél., e-mail, ville, adresse, description, heures, montant),
   *  Enregistrer, en cours, Archiver, Supprimer, occupé, Documents, Terminer / Rouvrir / Bilan, nombre de documents par chantier. */
  fi: [Worksite | null, Fx<Worksite | null>, string, Fx<string>, string, Fx<string>, string, Fx<string>, string, Fx<string>, string, Fx<string>, string, Fx<string>,
    string, Fx<string>, string, Fx<string>, string, Fx<string>, () => void, boolean, () => void, () => void, boolean,
    Fx<{ ws: Worksite; day: string | null }>, Fx<TermineTarget | null>, Map<string, number>,
    /** « la migration du lot 23 est-elle là ? » (lib/chantier-termine-ready) : passé tel quel, pour ne pas tirer ce module du premier chargement dans un morceau partagé. */
    () => boolean, () => Promise<boolean>];
  /** Nouveau client : ouvert, ouvrir/fermer, vider, effacer la note de l'assistant, note de l'assistant, créer, 7 champs + changeurs, en cours. */
  nc: [boolean, Fx<boolean>, () => void, Fx<string | null>, string | null, (e: FormEvent) => void, string, Fx<string>, string, Fx<string>, string, Fx<string>,
    string, Fx<string>, string, Fx<string>, string, Fx<string>, string, Fx<string>, boolean];
  /** Salariés : ouvert, ouvrir/fermer, ouvrir « Nouveau salarié », « Importer », « Demandes de congé », congés en attente, invitations, entreprise,
   *  relire (équipe + extras), bureau, moi, rôle en cours, changer le rôle, recherche, changer la recherche, salariés, filtrés, jours en attente,
   *  clôtures, relancer, relance en cours, ouvrir la fiche (mode, salarié). */
  sa: [boolean, Fx<boolean>, Fx<boolean>, Fx<boolean>, Fx<boolean>, number, Invitation[], string | undefined, () => void, User[], User | null | undefined,
    string | null, (u: User, r: Role, sansQuestion?: boolean) => void, string, Fx<string>, User[], User[], Map<string, string[]>, Map<string, string>,
    (u: User) => unknown, string | null, Fx<'hours' | 'manage'>, Fx<User | null>,
    /** La logique de la liste d'invitations (pending-invitations.tsx), passée telle quelle (même raison). */
    typeof useInvitationsAttente];
  /** Nouveau salarié : ouvert, ouvrir/fermer, vider, effacer la note, note, envoyer, prénom, nom, e-mail, téléphone (+ changeurs), en cours. */
  ns: [boolean, Fx<boolean>, () => void, Fx<string | null>, string | null, (e: FormEvent) => void, string, Fx<string>, string, Fx<string>, string, Fx<string>,
    string, Fx<string>, boolean];
}

// Même hachage que components/planning-bubble.tsx (copié : ce module ne tire rien du premier chargement).
const hashStr = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return Math.abs(h); };
const couleur = (ws: Worksite) => (ws.client_name === 'Autre' ? 'var(--dz-encre)' : `var(--dz-chantier-${(hashStr(ws.id) % 7) + 1})`);
const sousChantier = (ws: Worksite) => (ws.client_name === 'Autre' ? 'Lieu non listé : le salarié le précise' : [ws.product_type, ws.city].filter(Boolean).join(' · '));

export default function Lot3PlanningV2({ c }: { c: Lot3Ctx }) {
  return (<><ChantiersV2 c={c} /><FicheClientV2 c={c} /><NouveauClientV2 c={c} /><SalariesV2 c={c} /><NouveauSalarieV2 c={c} /></>);
}

// ───────────────────────── XM01 · Chantiers (téléphone) ─────────────────────────
function ChantiersV2({ c }: { c: Lot3Ctx }) {
  const [open, setOpen, worksites, filtres, q, setQ, ouvrirFiche, setClientOpen, setImportOpen] = c.ch;
  return (
    <Coque open={open} onOpenChange={setOpen} titre="Chantiers" testId="chantiers-v2" fermer="Retour"
      pied={<>
        <Btn onClick={() => { setOpen(false); setImportOpen(true); }} data-guide="bureau-clients.importer">Importer (CSV/Excel)</Btn>
        <Btn ton="principal" onClick={() => { setOpen(false); setClientOpen(true); }} data-guide="bureau-clients.nouveau">+ Nouveau client ou lieu</Btn>
      </>}>
      <Recherche value={q} onChange={setQ} placeholder="Rechercher un chantier…" testId="chantiers-recherche" />
      {worksites.length === 0 ? <Vide t="Aucun chantier pour le moment." s="Touchez « + Nouveau client ou lieu » ci-dessous." />
        : filtres.length === 0 ? <Vide t={`Aucun chantier « ${q} ».`} s="Vérifiez l’orthographe ou créez-le." action={<Btn onClick={() => { setOpen(false); setClientOpen(true); }}>+ Nouveau client « {q} »</Btn>} />
        : (
          <Lignes>
            {filtres.map((ws) => {
              const fin = termineLe(ws, true);
              return <Ligne key={ws.id} t={ws.client_name === 'Autre' ? 'Autre lieu / client' : ws.client_name} s={sousChantier(ws) || undefined} point={couleur(ws)} badge={fin ? fin.toUpperCase() : undefined} badgeTon="clos" chev
                onClick={() => { setOpen(false); ouvrirFiche(ws); }} guide="bureau-clients.crayon" />;
            })}
          </Lignes>
        )}
    </Coque>
  );
}

// ───────────────────────── CL05 · CL07 · XM02 · Fiche client ─────────────────────────
function FicheClientV2({ c }: { c: Lot3Ctx }) {
  const [ws, setWs, nom, setNom, produit, setProduit, tel, setTel, mail, setMail, ville, setVille, adresse, setAdresse, desc, setDesc, bh, setBh, be, setBe,
    enregistrer, enCours, archiver, supprimer, occupe, setDocs, setTermine, docsPar, completionKnownReady, completionReady] = c.fi;
  const [archiverAsk, setArchiverAsk] = useState(false);
  // Terminer / Rouvrir / Bilan : mêmes règles que le bloc d'avant (ChantierTermineBar) : rien avant la migration, pas d'écriture en mode support.
  const [pret, setPret] = useState(completionKnownReady());
  const colonne = hasCompletionColumn(ws);
  useEffect(() => { if (!colonne) return; let vivant = true; completionReady().then((r) => { if (vivant) setPret(r); }); return () => { vivant = false; }; }, [ws?.id, colonne]);
  useEffect(() => { if (!ws) setArchiverAsk(false); }, [ws]);
  const ui = completionUi({ ready: pret, hasColumn: colonne, supportMode: !!readSupportSession() });
  const fin = ws ? termineLe(ws) : null;
  const nDocs = ws ? docsPar.get(ws.id) || 0 : 0;
  return (
    <>
      <Coque open={!!ws} onOpenChange={(o) => { if (!o) setWs(null); }} forme="panneau" largeur={680} kicker="Fiche client" titre={nom.trim() || ws?.client_name || 'Client'}
        sous={fin || 'Chantier en cours'} testId="fiche-client-v2"
        pied={<>
          <Btn ton="danger-contour" onClick={supprimer} disabled={occupe} data-guide="bureau-clients.supprimer" title="Supprimer (seulement si aucune donnée rattachée)">Supprimer</Btn>
          <Btn pousse onClick={() => setArchiverAsk(true)} disabled={occupe} data-guide="bureau-clients.archiver">Archiver</Btn>
          <Btn ton="principal" onClick={enregistrer} disabled={enCours} busy={enCours} data-guide="bureau-clients.enregistrer">Enregistrer</Btn>
        </>}>
        {ws ? (<>
          <Champs cols={2}>
            <Champ nom="Nom du client" large value={nom} onChange={(e) => setNom(e.target.value)} />
            <Champ nom="Type de produit" value={produit} onChange={(e) => setProduit(e.target.value)} />
            <Champ nom="Téléphone" type="tel" mono value={tel} onChange={(e) => setTel(e.target.value)} />
            <Champ nom="Email" type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
            <Champ nom="Ville" value={ville} onChange={(e) => setVille(e.target.value)} />
            <Champ nom="Adresse" large value={adresse} onChange={(e) => setAdresse(e.target.value)} />
            <ChampTexte nom="Description" large rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Accès, digicode, interlocuteur…" />
          </Champs>
          <div data-guide="bureau-clients.budget" className="dz-l3-bloc">
            <Etiquette>Budget main-d’œuvre (facultatif)</Etiquette>
            <Champs cols={2}>
              <Champ nom="Heures prévues" mono inputMode="decimal" suffixe="h" value={bh} onChange={(e) => setBh(e.target.value)} placeholder="ex. 48" />
              <Champ nom="Montant prévu" mono inputMode="decimal" suffixe="€" value={be} onChange={(e) => setBe(e.target.value)} placeholder="ex. 1500" />
            </Champs>
          </div>
          <P ton="doux">Alertes e-mail à 70, 80 et 100 %. Hors matériaux et sous-traitance ; le montant n’est juste que si tous les salariés ont un taux horaire. Suivi détaillé dans Coût chantiers.</P>
          <Lignes>
            <Ligne t="Documents" icone="documents" droite={String(nDocs)} chev onClick={() => setDocs({ ws, day: null })} clicTestId="fiche-client-documents" />
            {ui.bilan ? <Ligne t="Bilan" icone="bilan" s="Lecture seule" chev onClick={() => setTermine({ ws, mode: 'bilan' })} clicTestId="ct-bilan" /> : null}
            {ui.bilan && ui.write ? (fin
              ? <Ligne t="Rouvrir le chantier" icone="rouvrir" s={fin} chev onClick={() => setTermine({ ws, mode: 'rouvrir' })} clicTestId="ct-rouvrir" />
              : canFinishWorksite(ws) ? <Ligne t="Terminer le chantier" icone="terminer" chev onClick={() => setTermine({ ws, mode: 'terminer' })} clicTestId="ct-terminer" /> : null) : null}
          </Lignes>
        </>) : null}
      </Coque>
      <Coque open={archiverAsk && !!ws} onOpenChange={setArchiverAsk} forme="fenetre" largeur={480} alerte titre={`Archiver ${ws?.client_name || 'ce client'} ?`} testId="archiver-client-ask"
        pied={<><Btn onClick={() => setArchiverAsk(false)}>Annuler</Btn><Btn ton="encre" disabled={occupe} busy={occupe} onClick={() => { setArchiverAsk(false); archiver(); }} data-testid="archiver-client-oui">Archiver</Btn></>}>
        <P>Il sort des listes Clients et du glisser-déposer. Interventions, heures et documents restent.</P>
      </Coque>
    </>
  );
}

// ───────────────────────── CL03 · CL04 · Nouveau client ─────────────────────────
function NouveauClientV2({ c }: { c: Lot3Ctx }) {
  const [open, setOpen, vider, setPre, pre, creer, nom, setNom, produit, setProduit, tel, setTel, mail, setMail, ville, setVille, adresse, setAdresse, desc, setDesc, enCours] = c.nc;
  const [touche, setTouche] = useState(false);
  useEffect(() => { if (!open) setTouche(false); }, [open]);
  const manque = !nom.trim();
  return (
    <Coque open={open} onOpenChange={(o) => { setOpen(o); if (!o) { vider(); setPre(null); } }} forme="fenetre" largeur={600} titre="Nouveau client" testId="nouveau-client-v2"
      pied={<><Btn onClick={() => { setOpen(false); vider(); setPre(null); }} disabled={enCours}>Annuler</Btn>
        <Btn ton="principal" type="submit" form="l3-nouveau-client" disabled={enCours || manque} busy={enCours} data-guide="bureau-clients.creer">Créer le client</Btn></>}>
      <form id="l3-nouveau-client" onSubmit={creer} onInput={() => setPre(null)}>
        {pre === 'client.nouveau' ? <P ton="doux" role="status" aria-live="polite" data-testid="pre-note">Pré-rempli par l’assistant : vérifiez avant d’enregistrer.</P> : null}
        <Champs cols={2}>
          <Champ nom="Nom du client" requis large autoFocus value={nom} disabled={enCours} onChange={(e) => setNom(e.target.value)} onBlur={() => setTouche(true)}
            erreur={touche && manque ? 'Indiquez le nom du client.' : undefined} />
          <Champ nom="Type de produit" placeholder="Stores, volets…" value={produit} disabled={enCours} onChange={(e) => setProduit(e.target.value)} />
          <Champ nom="Téléphone" type="tel" mono value={tel} disabled={enCours} onChange={(e) => setTel(e.target.value)} />
          <Champ nom="Email" type="email" value={mail} disabled={enCours} onChange={(e) => setMail(e.target.value)} />
          <Champ nom="Ville" value={ville} disabled={enCours} onChange={(e) => setVille(e.target.value)} />
          <Champ nom="Adresse" large value={adresse} disabled={enCours} onChange={(e) => setAdresse(e.target.value)} />
          <ChampTexte nom="Description" large rows={2} value={desc} disabled={enCours} onChange={(e) => setDesc(e.target.value)} placeholder="Accès, digicode, interlocuteur…" />
        </Champs>
      </form>
    </Coque>
  );
}

// ───────────────────────── EQ01 · EQ07 · EQ08 · XM03 · Salariés ─────────────────────────
const ROLE_LIB: Record<Role, string> = { worker: 'Salarié', lead: 'Chef d’équipe', admin: 'Bureau' };
function SalariesV2({ c }: { c: Lot3Ctx }) {
  const [open, setOpen, setWorkerOpen, setImportOpen, setLeaveOpen, conges, invitations, companyId, relire, bureau, moi, roleBusy, changerRole, q, setQ, salaries, filtres,
    attente, clotures, relancer, relanceId, setFicheMode, setFicheWorker, useInv] = c.sa;
  const [ask, setAsk] = useState<{ u: User; role: Role } | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const nInv = useMemo(() => new Set(invitations.map((i) => (i.email || '').trim().toLowerCase()).filter(Boolean)).size, [invitations]);
  const nom = (u: User) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'cette personne';
  return (
    <>
      <Coque open={open} onOpenChange={setOpen} forme="panneau" largeur={700} kicker={`Équipe · ${salaries.length} actif${salaries.length > 1 ? 's' : ''}`} titre="Salariés" testId="salaries-v2" fermer="Fermer">
        <div className="dz-l3-btns">
          <Btn ton="principal" onClick={() => { setOpen(false); setWorkerOpen(true); }} data-guide="bureau-salaries.nouveau"><span className="dz-hb-long">+ Nouveau salarié</span><span className="dz-hb-court">+ Nouveau</span></Btn>
          <Btn onClick={() => { setOpen(false); setImportOpen(true); }} data-guide="bureau-salaries.importer">Importer</Btn>
          <Btn onClick={() => { setOpen(false); setLeaveOpen(true); }} data-guide="bureau-salaries.conges">Demandes de congé{conges > 0 ? ` (${conges})` : ''}</Btn>
          {nInv > 0 && companyId ? <Btn onClick={() => setInvOpen(true)} data-testid="inv-toggle" data-guide="bureau-invit.voir"><span className="dz-hb-long">Invitations en attente ({nInv})</span><span className="dz-hb-court">Invitations ({nInv})</span></Btn> : null}
        </div>

        <Lignes>
          {bureau.map((o) => (
            <Ligne key={o.id} t={bureau.length <= 1 ? 'Bureau · accès complet' : nom(o)} ini={initiales(o.first_name, o.last_name)} avFond={fondAvatar(o.id)}
              s={bureau.length <= 1 ? `${nom(o)}${o.id === moi?.id ? ' (vous)' : ''} · Un seul accès bureau.` : `${o.id === moi?.id ? '(vous) · ' : ''}Bureau · accès complet`}
              titre={bureau.length <= 1 ? 'Si cette personne est indisponible, plus personne ne sort la paie : nommez un second « Bureau » dans la liste.' : undefined}
              actions={<Btn taille="ligne" busy={roleBusy === o.id} disabled={roleBusy === o.id || bureau.length <= 1}
                title={bureau.length <= 1 ? 'Dernier accès bureau : nommez quelqu’un d’autre avant de le retirer' : 'Retirer du bureau'} onClick={() => setAsk({ u: o, role: 'worker' })}>Retirer</Btn>} />
          ))}
        </Lignes>

        <Recherche value={q} onChange={setQ} placeholder="Rechercher un salarié…" testId="salaries-recherche" />
        {salaries.length === 0 ? <Vide t="Aucun salarié pour le moment." s="« + Nouveau salarié » envoie la première invitation." />
          : filtres.length === 0 ? <Vide t={`Aucun salarié « ${q} ».`} s="Vérifiez l’orthographe." />
          : (
            <Lignes guide="bureau-salaries.liste">
              {filtres.map((w) => {
                const miss = (attente.get(w.id) || []).length;
                const clos = clotures.get(w.id);
                const role: Role = w.role === 'lead' ? 'lead' : 'worker';
                const sous = clos ? `clôturé au ${format(parseISO(clos), 'dd/MM')}` : miss > 0 ? `${miss} jour${miss > 1 ? 's' : ''} en attente` : ROLE_LIB[role];
                const badge = clos ? `CLÔTURÉ AU ${format(parseISO(clos), 'dd/MM')}` : miss > 0 ? `${miss} J` : role === 'lead' ? 'CHEF' : undefined;
                return (
                  <Ligne key={w.id} t={nom(w)} s={sous} ini={initiales(w.first_name, w.last_name)} avFond={fondAvatar(w.id)}
                    badge={badge} badgeTon={clos ? 'clos' : miss > 0 ? 'erreur' : 'chef'}
                    onClick={() => { setOpen(false); setFicheMode('manage'); setFicheWorker(w); }} guide="bureau-salaries.nom" titre="Ouvrir sa fiche"
                    actions={<>
                      <Btn taille="ligne" onClick={() => { setOpen(false); setFicheMode('hours'); setFicheWorker(w); }} title="Voir et valider ses heures" data-testid="salarie-heures">Heures</Btn>
                      {miss > 0 ? <Btn taille="ligne" busy={relanceId === w.id} disabled={relanceId === w.id} onClick={() => relancer(w)} title="Envoyer un rappel">Relancer</Btn> : null}
                      <select className="dz-l3-select" aria-label={`Rôle de ${nom(w)}`} value={role} disabled={roleBusy === w.id}
                        onChange={(e) => setAsk({ u: w, role: e.target.value as Role })}>
                        <option value="worker">Salarié</option><option value="lead">Chef d’équipe</option><option value="admin">Bureau</option>
                      </select>
                    </>} />
                );
              })}
            </Lignes>
          )}
      </Coque>

      {/* EQ07 : la question d'avant (window.confirm) devient une fenêtre ; « Confirmer » appelle le MÊME changement de rôle, sans reposer la question. */}
      <Coque open={!!ask} onOpenChange={(o) => { if (!o) setAsk(null); }} forme="fenetre" largeur={580} alerte testId="role-ask"
        titre={ask ? (ask.role === 'lead' ? `Passer ${ask.u.first_name || nom(ask.u)} chef d’équipe ?` : ask.role === 'admin' ? `Donner l’accès bureau à ${ask.u.first_name || nom(ask.u)} ?` : `Repasser ${ask.u.first_name || nom(ask.u)} en salarié ?`) : ''}
        pied={<><Btn onClick={() => setAsk(null)}>Annuler</Btn>
          <Btn ton="encre" data-testid="role-ask-oui" onClick={() => { if (ask) { changerRole(ask.u, ask.role, true); setAsk(null); } }}>
            {ask?.role === 'lead' ? 'Passer chef d’équipe' : ask?.role === 'admin' ? 'Donner l’accès bureau' : 'Repasser salarié'}</Btn></>}>
        {ask?.role === 'lead' ? (<>
          <Etiquette>Il pourra</Etiquette>
          <P>Saisir et corriger les heures de tous les salariés de l’entreprise sur les 7 derniers jours (jamais une journée validée ou clôturée). Ses saisies sont envoyées au bureau et marquées « par le chef d’équipe » ; le salarié peut encore corriger tant que ce n’est pas validé.</P>
          <Etiquette>Il ne pourra pas</Etiquette>
          <P>Voir les taux horaires, le coût des chantiers, la paie ni les réglages.</P>
        </>) : ask?.role === 'admin' ? <P>Cette personne pourra voir les taux horaires, sortir la paie et modifier les réglages.</P>
          : <P>Il ne verra plus que ses propres heures.</P>}
      </Coque>

      {companyId ? <InvitationsV2 open={invOpen} onOpenChange={setInvOpen} companyId={companyId} invitations={invitations} onChanged={relire} useInv={useInv} /> : null}
    </>
  );
}

// ───────────────────────── EQ04 · EQ05 · EQ06 · Invitations en attente ─────────────────────────
// Même logique que la liste d'avant (useInvitationsAttente de pending-invitations.tsx : dates d'envoi, un envoi à la fois, arrêt à la première erreur) ;
// ses deux questions (window.confirm) s'ouvrent ici en fenêtres.
function InvitationsV2({ open, onOpenChange, companyId, invitations, onChanged, useInv }: { open: boolean; onOpenChange: Fx<boolean>; companyId: string; invitations: Invitation[]; onChanged: () => void; useInv: typeof useInvitationsAttente }) {
  const [question, setQuestion] = useState<{ titre: string; texte: string; oui: string; danger: boolean; fin: (ok: boolean) => void } | null>(null);
  const demander = (titre: string, texte: string, oui: string, danger: boolean) => new Promise<boolean>((fin) => setQuestion({ titre, texte, oui, danger, fin }));
  const h = useInv({ companyId, invitations, onChanged }, {
    ouvert: open,
    demander: (k, n) => (k.type === 'suppr'
      ? demander(`Supprimer l’invitation de ${n} ?`, 'Le compte, jamais connecté, est retiré. Vous pourrez l’inviter à nouveau plus tard.', 'Supprimer', true)
      : demander(`${k.verbe} ${k.total} e-mail${k.total > 1 ? 's' : ''} ?`, 'Chaque salarié reçoit un lien valable 24 h pour créer son mot de passe. Un envoi à la fois ; arrêt à la première erreur.', k.verbe, false)),
  });
  const repondre = (ok: boolean) => { question?.fin(ok); setQuestion(null); };
  useEffect(() => { if (open && h && h.n === 0) onOpenChange(false); }, [open, h, onOpenChange]);
  return (
    <>
      <Coque open={open && !!h && h.n > 0} onOpenChange={onOpenChange} forme="panneau" kicker="Salariés" titre="Invitations en attente" testId="pending-invitations"
        pied={h && h.n >= 2 ? <Btn ton="principal" plein onClick={h.sendAll} disabled={h.busy || !h.known || h.bulkTargets.length === 0} busy={!!h.bulk} data-testid="inv-send-all"
          title={!h.known ? 'Disponible quand les dates d’envoi sont connues' : undefined}>
          {h.bulk ? `Envoi ${Math.min(h.bulk.done + 1, h.bulk.total)}/${h.bulk.total}…` : h.bulkLabel}</Btn> : undefined}>
        {h ? (<>
          {h.simulate ? <Alerte ton="attention" testId="inv-sim">Préview : envois et suppressions simulés, aucun e-mail ne part.</Alerte> : null}
          {h.sent.kind === 'error' ? <Alerte ton="erreur" titre="Dates d’envoi indisponibles" testId="inv-dates-ko" boutons={<button type="button" onClick={h.retry}>Réessayer</button>}>
            Impossible de savoir qui a déjà reçu l’invitation : « Envoyer toutes » reste désactivé.</Alerte> : null}
          <Lignes guide="bureau-invit.liste">
            {h.list.map((inv) => {
              const when = h.sentOf(inv);
              const mine = h.busy1?.email === inv.email;
              return (
                <div key={inv.id} data-testid="inv-row" data-email={inv.email}>
                  <Ligne t={h.fullName(inv)}
                    s={`${inv.email} · ${when ? `Invitée le ${h.ddmm(when)}` : when === null ? 'jamais envoyée' : '…'}`}
                    actions={<>
                      <Btn taille="ligne" ton={when === null ? 'encre' : undefined} onClick={() => h.sendOne(inv)} disabled={h.busy || h.sent.kind === 'loading'} busy={mine && h.busy1?.kind === 'send'} data-testid="inv-send">
                        {h.sent.kind === 'loading' ? '…' : h.sent.kind === 'error' ? 'Envoyer / renvoyer' : when ? 'Renvoyer' : 'Envoyer'}</Btn>
                      <Btn taille="ligne" ton="danger-contour" onClick={() => h.removeOne(inv)} disabled={h.busy} busy={mine && h.busy1?.kind === 'remove'} aria-label={`Supprimer l’invitation de ${h.fullName(inv)}`} data-testid="inv-remove">Supprimer</Btn>
                    </>} />
                </div>
              );
            })}
          </Lignes>
          <P ton="doux">Renvoyer invalide l’ancien lien. Un envoi à la fois.</P>
          {h.echec ? <Alerte ton="erreur" titre={`Envoi arrêté à ${h.echec.nom}`} testId="inv-echec">{h.echec.texte}</Alerte> : null}
        </>) : null}
      </Coque>
      <Coque open={!!question} onOpenChange={(o) => { if (!o) repondre(false); }} forme="fenetre" largeur={480} alerte titre={question?.titre || ''} testId="inv-question"
        pied={<><Btn onClick={() => repondre(false)}>Annuler</Btn><Btn ton={question?.danger ? 'danger' : 'principal'} onClick={() => repondre(true)} data-testid="inv-question-oui">{question?.oui}</Btn></>}>
        <P>{question?.texte}</P>
      </Coque>
    </>
  );
}

// ───────────────────────── EQ02 · Nouveau salarié ─────────────────────────
const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function NouveauSalarieV2({ c }: { c: Lot3Ctx }) {
  const [open, setOpen, vider, setPre, pre, envoyer, prenom, setPrenom, nom, setNom, mail, setMail, tel, setTel, enCours] = c.ns;
  const [touche, setTouche] = useState(false);
  useEffect(() => { if (!open) setTouche(false); }, [open]);
  const mailErr = touche && mail.trim() && !MAIL_OK.test(mail.trim()) ? 'Adresse incomplète : il manque la fin (ex. « .fr »).' : undefined;
  const incomplet = !prenom.trim() || !nom.trim() || !MAIL_OK.test(mail.trim());
  return (
    <Coque open={open} onOpenChange={(o) => { setOpen(o); if (!o) { vider(); setPre(null); } }} forme="fenetre" largeur={540} titre="Nouveau salarié" testId="nouveau-salarie-v2"
      pied={<><Btn onClick={() => { setOpen(false); vider(); setPre(null); }} disabled={enCours}>Annuler</Btn>
        <Btn ton="principal" type="submit" form="l3-nouveau-salarie" disabled={enCours || incomplet} busy={enCours} data-guide="bureau-salaries.envoyer">Envoyer l’invitation</Btn></>}>
      <form id="l3-nouveau-salarie" onSubmit={envoyer} onInput={() => setPre(null)}>
        {pre === 'salarie.nouveau' ? <P ton="doux" role="status" aria-live="polite" data-testid="pre-note">Pré-rempli par l’assistant : vérifiez avant d’enregistrer.</P> : null}
        <Champs cols={2}>
          <Champ nom="Prénom" requis autoFocus value={prenom} disabled={enCours} required onChange={(e) => setPrenom(e.target.value)} />
          <Champ nom="Nom" requis value={nom} disabled={enCours} required onChange={(e) => setNom(e.target.value)} />
          <Champ nom="Email" requis large type="email" value={mail} disabled={enCours} required onChange={(e) => setMail(e.target.value)} onBlur={() => setTouche(true)} erreur={mailErr} />
          <Champ nom="Téléphone" large type="tel" mono placeholder="Facultatif" value={tel} disabled={enCours} onChange={(e) => setTel(e.target.value)} />
        </Champs>
      </form>
      <P ton="doux">Un compte est créé et une invitation part par e-mail.</P>
    </Coque>
  );
}
