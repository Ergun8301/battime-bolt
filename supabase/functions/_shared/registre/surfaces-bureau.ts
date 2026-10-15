// Surfaces du BUREAU : capacité (B1…) → clés de code qui la portent (rpc:, fn:, table:, fenetre:, dialogue:, ecriture:, ancre:, route:).
// Couche volatile du registre : un redesign ne touche que ce fichier et son pendant salarié.
//
// Règles de lecture (rattachement fait en lisant le code autour de chaque clé, jamais à partir du seul nom) :
//   · une clé peut figurer dans PLUSIEURS capacités : un RPC, une fenêtre ou une ancre sert souvent plusieurs gestes du cahier
//     (`fenetre:worker-detail` héberge la fiche salarié entière) ;
//   · une clé PARTAGÉE avec le salarié (`fn:kiosk`, `rpc:assistant_journal_log`, `ecriture:lib/chantier-docs#…`) est listée ici
//     pour ce que le BUREAU en fait ; le pendant salarié la référence de son côté, pour le sien ;
//   · une écriture sans bouton à l'écran (`modifier_depense`, `modifier_habilitation`) est rattachée à la capacité de son domaine
//     et marquée dans le commentaire : le cahier n'a pas de capacité pour elle ;
//   · les clés à nom calculé (`fn:?`, `table:?:…`) n'apparaissent PAS ici : T1 les refuse, elles se déclarent dans le code
//     (`// registre:tables=a,b`, `// registre:fn=a,b`).
export const SURFACES_BUREAU: Record<string, string[]> = {
  // B1 · Voir la semaine, salarié par jour
  // La page /admin EST le planning de la semaine : toutes les fenêtres du bureau s'y ouvrent.
  B1: [
    'route:/admin',
  ],
  // B4 · Voir « retirée », « ajoutée par le salarié », heures hors planning
  // ensure_planning_slot crée la case des heures déclarées sur un chantier sans créneau : c'est la bulle « ajouté par
  // le salarié ».
  B4: [
    'dialogue:components/admin-planning#!!extraTarget',
    'rpc:ensure_planning_slot',
  ],
  // B9 · Voir « N jours en attente » / « À jour » par salarié
  B9: [
    'ancre:bureau-stat.relance',
  ],
  // B12 · Changer de semaine, revenir à l'actuelle, lire S-NN
  B12: [
    'ancre:bureau-semaine.nav',
  ],
  // B13 · Téléphone : voir et agir sur la journée de son choix pour chaque salarié (aujourd'hui : un jour à la …
  // Sur téléphone, le bouton « + » de la carte d'un salarié est le seul moyen d'ajouter à la journée choisie.
  B13: [
    'ancre:bureau-planning.ajouter',
  ],
  // B14 · Rechercher un client, un salarié
  B14: [
    'dialogue:components/admin-planning#mobileChantiersOpen',
    'dialogue:components/admin-planning#salariesOpen',
    'ancre:bureau-nav.clients',
    'ancre:bureau-nav.salaries',
  ],
  // B15 · Créer une intervention (case, téléphone)
  B15: [
    'dialogue:components/admin-planning#addOpen',
    'table:planning:insert',
    'ecriture:lib/planning-writes#addPlanningSlot',
    'ancre:bureau-planning.ajouter',
    'ancre:bureau-planning.ajouter-valider',
    'ancre:bureau-planning.case',
  ],
  // B16 · Créer une intervention en glissant un client
  B16: [
    'table:planning:insert',
    'ecriture:lib/planning-writes#addPlanningSlot',
  ],
  // B17 · Modifier horaire et note ; lire heures déclarées, photos
  // ancre-dynamique : le ScheduleRow relaie la prop `guide` ; l'appelant de la fenêtre Intervention y pose
  // bureau-edit.horaire.
  B17: [
    'dialogue:components/admin-planning#!!editing',
    'table:planning:update',
    'ecriture:lib/admin-writes#updatePlanningSlot',
    'ancre:bureau-edit.enregistrer',
    'ancre:bureau-edit.horaire',
    'ancre:bureau-planning.bulle',
    'ancre-dynamique:components/admin-planning.tsx:403',
  ],
  // B18 · Déplacer, réordonner par glisser
  // prepareMove défait ce qui bloque un déplacement (brouillon vide effacé, ligne retirée détachée) avant que la case
  // change de jour ou de salarié.
  B18: [
    'table:planning:update',
    'table:time_entries:delete',
    'table:time_entries:update',
    'ecriture:lib/admin-writes#updatePlanningSlot',
    'ecriture:lib/erase#prepareMove',
    'ecriture:lib/erase#undoMovePrep',
    'ancre:bureau-planning.bulle',
    'ancre:bureau-planning.case',
  ],
  // B19 · Copier par glisser (Ctrl / Alt / Option / ⌘)
  B19: [
    'table:planning:insert',
    'ecriture:lib/planning-writes#addPlanningSlot',
  ],
  // B20 · Copier vers d'autres jours ; dupliquer au lendemain
  B20: [
    'fenetre:planning-copy-dialog',
    'dialogue:components/admin-planning#!!editing',
    'table:planning:insert',
    'ecriture:lib/planning-writes#addPlanningSlot',
  ],
  // B22 · Supprimer une intervention (confirmation si heures retirées)
  B22: [
    'dialogue:components/admin-planning#!!editing',
    'dialogue:components/admin-planning#!!eraseAsk',
    'table:planning:delete',
    'table:time_entries:delete',
    'table:time_entries:update',
    'ecriture:lib/erase#erasePlanning',
    'ancre:bureau-edit.supprimer',
    'ancre:bureau-planning.bulle',
  ],
  // B23 · Annuler une suppression ou une copie par glisser
  // table:planning:delete d'admin-planning (l'« Annuler » de copySlot) retire la copie qu'on vient de poser par
  // glisser.
  B23: [
    'table:planning:delete',
    'ecriture:lib/erase#restoreRows',
    'ecriture:lib/erase#undoErase',
  ],
  // B24 · Sélectionner plusieurs interventions (jour au téléphone) et les supprimer
  B24: [
    'dialogue:components/admin-planning#!!eraseAsk',
    'table:planning:delete',
    'table:time_entries:delete',
    'table:time_entries:update',
    'ecriture:lib/erase#erasePlanning',
    'ancre:bureau-nav.selection',
    'ancre:bureau-planning.bulle',
    'ancre:bureau-selection.supprimer',
    'ancre:bureau-selection.tout',
  ],
  // B25 · Poser une absence (plage ou jusqu'au retour)
  B25: [
    'dialogue:components/admin-planning#!!pendingAbsence',
    'dialogue:components/admin-planning#!!statusTarget',
    'table:planning:delete',
    'table:planning:insert',
    'ecriture:lib/planning-writes#setAbsence',
    'ecriture:lib/planning-writes#undoAbsence',
    'ancre:bureau-absence.enregistrer',
    'ancre:bureau-planning.nom',
    'ancre:bureau-statut.absences',
  ],
  // B26 · Remettre « Présent »
  B26: [
    'dialogue:components/admin-planning#!!eraseAsk',
    'dialogue:components/admin-planning#!!statusTarget',
    'table:planning:delete',
    'ecriture:lib/erase#erasePlanning',
    'ecriture:lib/planning-writes#undoAbsence',
    'ancre:bureau-planning.nom',
    'ancre:bureau-statut.present',
  ],
  // B27 · Gérer les tâches du jour et les réunions
  B27: [
    'dialogue:components/admin-planning#addOpen',
  ],
  // B28 · Attribuer un client à des heures « ajoutées par le salarié » ou sur « Autre »
  // La fiche salarié sait aussi attribuer une ligne « Autre » à un client, et créer le client à la volée
  // (worksites:insert de worker-detail).
  B28: [
    'fenetre:worker-detail',
    'dialogue:components/admin-planning#!!attributeTarget && !clientOpen',
    'dialogue:components/admin-planning#!!extraTarget',
    'table:time_entries:update',
    'table:worksites:insert',
    'ecriture:lib/admin-writes#attributeEntries',
    'ancre:bureau-planning.attribuer',
    'ancre:bureau-planning.autre',
  ],
  // B29 · Inviter un salarié ; en importer par CSV/Excel
  B29: [
    'fenetre:import-workers-dialog',
    'dialogue:components/admin-planning#salariesOpen',
    'dialogue:components/admin-planning#workerOpen',
    'fn:invite-worker',
    'ancre:bureau-nav.salaries',
    'ancre:bureau-salaries.envoyer',
    'ancre:bureau-salaries.importer',
    'ancre:bureau-salaries.nouveau',
  ],
  // B30 · Gérer les invitations en attente
  B30: [
    'rpc:pending_invitations_sent_at',
    'fn:invite-worker',
    'ecriture:lib/admin-writes#fetchInvitationsSentAt',
    'ancre:bureau-invit.liste',
    'ancre:bureau-invit.voir',
  ],
  // B31 · Changer un rôle (confirmation des droits)
  B31: [
    'dialogue:components/admin-planning#salariesOpen',
    'rpc:set_user_role',
    'ecriture:lib/admin-writes#setUserRole',
    'ancre:bureau-nav.salaries',
    'ancre:bureau-salaries.liste',
  ],
  // B32 · Modifier la fiche salarié (identité, paie)
  B32: [
    'fenetre:worker-detail',
    'table:user_payroll:upsert',
    'table:users:update',
    'ecriture:lib/admin-writes#updateWorkerIdentity',
    'ecriture:lib/planning-writes#savePayrollBasics',
    'ancre:bureau-fiche.enregistrer',
  ],
  // B33 · Gérer les habilitations ; valider un bulletin pour le coût réel (si IA)
  // table:certifications:update n'a qu'un site, lib/assistant-actions.ts (modifier_habilitation) : la fiche salarié
  // n'a pas de bouton « modifier ». L'assistant fait ici ce que l'écran ne fait pas, contre la règle « jamais sa
  // propre version d'un geste » : à revoir.
  B33: [
    'fenetre:worker-detail',
    'table:certifications:insert',
    'table:certifications:update',
    'ecriture:lib/admin-writes#addCertification',
    'ancre:bureau-fiche.habilitations',
  ],
  // B34 · Archiver, réactiver, supprimer un salarié ; clôturer (et archiver) / rouvrir ses heures
  B34: [
    'fenetre:worker-detail',
    'table:users:update',
    'ecriture:lib/admin-writes#setWorkerActive',
    'ancre:bureau-fiche.archiver',
  ],
  // B35 · Créer un client ; en importer par CSV/Excel
  // table:worksites:delete d'assistant-actions (creer_chantier) est l'« Annuler » de la création d'un client par
  // l'assistant.
  B35: [
    'fenetre:import-dialog',
    'dialogue:components/admin-planning#clientOpen',
    'dialogue:components/admin-planning#mobileChantiersOpen',
    'table:worksites:delete',
    'table:worksites:insert',
    'ecriture:lib/planning-writes#createWorksite',
    'ancre:bureau-clients.creer',
    'ancre:bureau-clients.nouveau',
    'ancre:bureau-nav.clients',
  ],
  // B36 · Modifier la fiche client et son budget ; l'archiver ou la supprimer
  B36: [
    'dialogue:components/admin-planning#!!clientFiche',
    'table:worksites:update',
    'ecriture:lib/admin-writes#setWorksiteActive',
    'ecriture:lib/admin-writes#updateWorksite',
    'ecriture:lib/planning-writes#setWorksiteBudget',
    'ancre:bureau-clients.budget',
    'ancre:bureau-clients.crayon',
    'ancre:bureau-clients.enregistrer',
  ],
  // B37 · Gérer les documents d'un chantier (catégories, droits) ; les envoyer au client
  B37: [
    'fenetre:chantier-documents',
    'table:documents:insert',
    'ecriture:lib/chantier-docs#uploadWorksiteDocument',
    'ancre:bureau-edit.documents',
    'ancre:docs.photo',
  ],
  // B38 · Terminer, rouvrir un chantier ; lire son bilan
  B38: [
    'fenetre:chantier-termine',
    'dialogue:components/admin-planning#!!clientFiche',
    'rpc:set_worksite_completed',
    'rpc:worksite_completion_ready',
    'ecriture:lib/chantier-termine#setWorksiteCompleted',
    'ecriture:lib/chantier-termine-ready#completionReady',
  ],
  // B39 · Lire la feuille d'heures d'un salarié
  B39: [
    'fenetre:worker-detail',
    'ancre:bureau-planning.nom',
    'ancre:bureau-statut.feuille',
  ],
  // B40 · Corriger des heures (motif, salarié prévenu) ; renvoyer une journée ; supprimer un brouillon vide
  // corrigerHeures (correct_time_entry) reste le chemin de la fiche tant que la migration des corrections tracées
  // manque, et celui du chef d'équipe.
  B40: [
    'fenetre:worker-detail',
    'rpc:correct_time_entry',
    'rpc:office_correct_entry',
    'rpc:office_edit_mark_notified',
    'fn:send-push',
    'table:time_entry_corrections:update',
    'ecriture:lib/corrections#corrigerHeures',
    'ecriture:lib/office-edits#correctOfficeEntry',
    'ancre:bureau-fiche.corriger',
    'ancre:bureau-fiche.corriger-valider',
  ],
  // B41 · Relancer (à la main ou automatiquement) ; détail de « à relancer »
  B41: [
    'dialogue:components/admin-planning#relanceOpen',
    'rpc:log_hours_reminder',
    'fn:send-push',
    'ecriture:lib/admin-writes#logHoursReminder',
    'ancre:bureau-stat.liste',
    'ancre:bureau-stat.relance',
  ],
  // B42 · Accepter ou refuser un congé
  // Accepter un congé pose les absences au planning (setAbsence) avant de changer le statut de la demande, puis
  // prévient le salarié.
  B42: [
    'fenetre:leave-admin-dialog',
    'dialogue:components/admin-planning#salariesOpen',
    'fn:send-push',
    'table:leave_requests:update',
    'table:planning:delete',
    'table:planning:insert',
    'ecriture:lib/admin-writes#approveLeave',
    'ecriture:lib/admin-writes#rejectLeave',
    'ecriture:lib/planning-writes#setAbsence',
    'ancre:bureau-conges.liste',
    'ancre:bureau-salaries.conges',
  ],
  // B43 · Exporter l'équipe (PDF, Excel, CSV)
  // time_entries:update d'admin-planning (runExport) pose exported_at et locked : c'est le verrou de l'export
  // d'équipe.
  B43: [
    'dialogue:components/admin-planning#exportOpen',
    'table:time_entries:update',
    'ancre:bureau-export.menu',
    'ancre:bureau-export.un-salarie',
    'ancre:bureau-nav.exporter',
    'ancre-dynamique:components/export-menu.tsx:41',
  ],
  // B44 · Envoyer l'export au comptable sans doublon
  B44: [
    'dialogue:components/admin-planning#exportOpen',
    'fn:send-payroll-export',
    'ancre:bureau-export.comptable',
  ],
  // B45 · Choisir le verrou avant l'export
  B45: [
    'fenetre:export-verrou-dialog',
    'dialogue:components/admin-planning#exportOpen',
    'table:time_entries:update',
  ],
  // B46 · Clôturer / rouvrir un mois
  B46: [
    'dialogue:components/admin-planning#!!closureTarget',
    'dialogue:components/admin-planning#exportOpen',
    'table:month_closures:delete',
    'table:month_closures:insert',
    'ecriture:lib/admin-writes#closeMonth',
    'ancre:bureau-export.mois',
  ],
  // B47 · Exporter un seul salarié, sans verrou
  B47: [
    'dialogue:components/admin-planning#exportWorkerOpen',
    'ancre:bureau-export.menu',
    'ancre:bureau-export.un-salarie',
    'ancre:bureau-fiche.exporter',
    'ancre-dynamique:components/export-menu.tsx:41',
  ],
  // B49 · Versions d'une semaine : voir, revenir, annuler, garder
  // recordBefore/AfterAssistant écrivent les versions « essais de l'assistant » que la fenêtre Versions liste.
  B49: [
    'fenetre:planning-versions-dialog',
    'table:planning_versions:insert',
    'ecriture:lib/planning-versions#recordAfterAssistant',
    'ecriture:lib/planning-versions#recordBeforeAssistant',
    'ancre:bureau-nav.versions',
    'ancre:bureau-versions.liste',
    'ancre:bureau-versions.voir',
  ],
  // B50 · Lire l'historique des suppressions et décalages
  B50: [
    'fenetre:traces-dialog',
  ],
  // B51 · Statistiques (heures, heures sup, absences, oublis, coût)
  B51: [
    'fenetre:team-stats',
    'rpc:my_worksite_labour',
    'ecriture:lib/team-stats#loadTeamStats',
  ],
  // B52 · Coût par chantier et dépenses
  B52: [
    'fenetre:cost-report',
    'rpc:my_worksite_labour',
    'ancre:bureau-cout.periodes',
    'ancre:bureau-nav.couts',
  ],
  // B54 · Registre des réserves : lever, rouvrir
  // La levée avec photo (liftReserve) dépose la photo comme document du chantier puis la retire si la levée est
  // refusée ; le bureau passe par set_reserve_resolution (mark_reserve_fixed est le chemin du salarié).
  B54: [
    'fenetre:reserves-report',
    'rpc:set_reserve_resolution',
    'table:documents:delete',
    'table:documents:insert',
    'table:time_entries:update',
    'ecriture:lib/admin-writes#setReserveResolution',
    'ecriture:lib/chantier-docs#removeWorksiteDocument',
    'ecriture:lib/chantier-docs#uploadWorksiteDocument',
    'ecriture:lib/reserve-lift#liftReserve',
    'ecriture:lib/reserve-lift#reopenReserve',
    'ancre:bureau-nav.reserves',
    'ancre:bureau-reserves.a-traiter',
    'ancre:bureau-reserves.liste',
    'ancre:reserves.valider',
  ],
  // B55 · Relier une tablette (QR ou code), la remplacer, la déconnecter ; régler ses horaires, lire son état
  B55: [
    'fenetre:kiosk-admin',
    'fenetre:kiosk-pair-confirm',
    'fn:kiosk',
    'ancre:bureau-borne.code',
    'ancre:bureau-nav.borne',
  ],
  // B56 · Gérer le QR fixe imprimable
  B56: [
    'fenetre:kiosk-admin',
    'fenetre:kiosk-fixed-qr',
    'fn:kiosk',
  ],
  // B57 · Gérer les formations (ajouter, suivre qui a vu quoi, retirer / remettre, quota vidéo)
  B57: [
    'fenetre:training-video-player',
    'fenetre:trainings-admin',
    'dialogue:components/admin-planning#salariesOpen',
    'rpc:training_video_leftovers',
    'rpc:training_video_limits',
    'ecriture:lib/training-videos#fetchOfficeVideos',
    'ecriture:lib/training-videos#fetchVideoLimits',
  ],
  // B58 · Envoyer planning PDF ou message aux salariés
  B58: [
    'fenetre:staff-email-dialog',
    'fn:send-staff-email',
  ],
  // B59 · Régler l'entreprise (logo, coordonnées)
  B59: [
    'fenetre:company-settings',
    'rpc:update_company_info',
    'ecriture:lib/admin-writes#saveCompanySettings',
    'ancre:bureau-nav.reglages',
    'ancre:bureau-reglages.enregistrer',
  ],
  // B60 · Régler heures & paie
  // ancre-dynamique : le titre de rubrique relaie la prop `guide` (rub-heures, rub-borne, rub-notif sont posés par
  // l'appelant).
  B60: [
    'fenetre:company-settings',
    'rpc:update_company_info',
    'ecriture:lib/admin-writes#saveCompanySettings',
    'ancre:bureau-reglages.enregistrer',
    'ancre:bureau-reglages.rub-heures',
    'ancre-dynamique:components/company-settings.tsx:137',
  ],
  // B61 · Régler borne & pointage
  B61: [
    'fenetre:company-settings',
    'rpc:set_colleagues_planning',
    'rpc:set_position_tracking',
    'ancre:bureau-reglages.collegues',
    'ancre:bureau-reglages.rub-borne',
    'ancre-dynamique:components/company-settings.tsx:137',
  ],
  // B62 · Régler notifications et alertes
  B62: [
    'fenetre:company-settings',
    'rpc:update_company_info',
    'ecriture:lib/admin-writes#saveCompanySettings',
    'ancre:bureau-reglages.rub-notif',
    'ancre-dynamique:components/company-settings.tsx:137',
  ],
  // B63 · Autoriser ou retirer le support BEMEXO ; lire son journal ; voir le mode support
  B63: [
    'fenetre:company-settings',
    'rpc:support_grant',
    'rpc:support_revoke',
    'ecriture:lib/support#supabaseSupportSource',
    'ancre:bureau-reglages.rub-notif',
    'ancre:bureau-reglages.support',
  ],
  // B64 · Voir l'essai, s'abonner, gérer l'abonnement ; subir le blocage d'essai
  B64: [
    'fenetre:company-settings',
    'dialogue:app/admin/page#subOpen',
    'fn:stripe-checkout',
    'fn:stripe-portal',
    'ancre:bureau-nav.abonner',
    'ancre:bureau-reglages.abonnement',
  ],
  // B65 · Ouvrir le menu du compte ; se déconnecter
  B65: [
    'ancre:bureau-nav.compte',
    'ancre:bureau-nav.reglages',
  ],
  // B66 · Dialoguer avec l'assistant (écrit, voix, pièce jointe)
  B66: [
    'fenetre:assistant-bureau',
    'rpc:assistant_chat_append',
    'ecriture:lib/assistant-chats#supabaseChatStore',
    'ancre:bureau-nav.assistant',
  ],
  // B67 · Faire agir l'assistant (Annuler / Modifier, confirmations)
  // assistant_journal_log trace chaque action proposée / exécutée / annulée : c'est le journal de « Faire agir
  // l'assistant ».
  B67: [
    'rpc:assistant_journal_log',
    'ecriture:lib/assistant-actions#makeActionExecutor',
  ],
  // B68 · Guide pas à pas ; nouveau chat, historique (à venir, non fusionné)
  // « Nouveau chat » et l'historique : effacer une conversation (remove) ou tout l'historique (clear).
  B68: [
    'rpc:assistant_chat_clear',
    'table:assistant_chats:delete',
    'ecriture:lib/assistant-chats#supabaseChatStore',
  ],
  // B72 · Téléphone : atteindre depuis un point d'entrée unique toutes les fonctions de la barre du bureau, avec …
  B72: [
    'dialogue:components/admin-mobile-menu#open',
    'ancre:bureau-nav.borne',
    'ancre:bureau-nav.clients',
    'ancre:bureau-nav.couts',
    'ancre:bureau-nav.exporter',
    'ancre:bureau-nav.menu',
    'ancre:bureau-nav.reglages',
    'ancre:bureau-nav.reserves',
    'ancre:bureau-nav.salaries',
    'ancre:bureau-nav.selection',
    'ancre:bureau-nav.versions',
  ],
  // B73 · Ouvrir le statut d'un salarié (Présent, Congé, Arrêt maladie, Intempérie, Feuille d'heures) (fenêtre …
  B73: [
    'dialogue:components/admin-planning#!!statusTarget',
    'ancre:bureau-planning.nom',
  ],
  // B74 · Ouvrir une intervention pour la modifier (fenêtre Intervention : client, adresse, Fiche, Documents …
  B74: [
    'dialogue:components/admin-planning#!!editing',
    'ancre:bureau-planning.bulle',
  ],
  // B75 · Ouvrir « Ajouter » pré-rempli sur une case (salarié, jour, client, horaire, note)
  B75: [
    'dialogue:components/admin-planning#addOpen',
    'ancre:bureau-planning.ajouter',
    'ancre:bureau-planning.case',
  ],
  // B76 · Ouvrir la fiche d'un client (nom, produit, téléphone, e-mail, ville, adresse, description, budget …
  B76: [
    'dialogue:components/admin-planning#!!clientFiche',
    'dialogue:components/admin-planning#mobileChantiersOpen',
    'ancre:bureau-clients.crayon',
    'ancre:bureau-nav.clients',
  ],
  // B77 · Ouvrir la fiche d'un salarié (Gérer le salarié, ou Feuille d'heures)
  B77: [
    'fenetre:worker-detail',
    'ancre:bureau-planning.nom',
    'ancre:bureau-salaries.nom',
  ],
  // B78 · Ouvrir les documents d'un chantier (onglets Photos / Fichiers par jour)
  B78: [
    'fenetre:chantier-documents',
    'dialogue:components/admin-planning#!!editing',
    'ancre:bureau-edit.documents',
    'ancre:bureau-planning.bulle',
    'ancre:docs.photo',
  ],
  // B79 · Réordonner les interventions d'une même case (détail de B18)
  // persistOrder (admin-planning) écrit `position` : l'ordre des interventions d'une même case.
  B79: [
    'table:planning:update',
  ],
  // B80 · Rouvrir un mois clôturé (détail de B46)
  // reopenMonth supprime la ligne de clôture du mois.
  B80: [
    'table:month_closures:delete',
    'ancre:bureau-export.mois',
  ],
  // B81 · Clôturer les heures d'un salarié jusqu'à une date, avec archivage en un geste pour une fin de contrat …
  B81: [
    'fenetre:worker-detail',
    'table:user_closures:upsert',
    'ecriture:lib/worker-closure#closeWorkerUntil',
    'ancre:bureau-fiche.cloturer',
    'ancre:bureau-fiche.exporter',
  ],
  // B82 · Rouvrir les heures d'un salarié clôturées (détail de B34)
  B82: [
    'fenetre:worker-detail',
    'table:user_closures:update',
    'ecriture:lib/worker-closure#reopenWorker',
  ],
  // B83 · Renvoyer une journée au salarié : elle repasse en brouillon, avec un motif (détail de B40)
  B83: [
    'fenetre:worker-detail',
    'rpc:office_edit_mark_notified',
    'rpc:office_return_day',
    'fn:send-push',
    'table:time_entry_corrections:update',
    'ecriture:lib/office-edits#returnDayToWorker',
  ],
  // B84 · Corriger la pause, le panier ou la route d'une journée envoyée (détail de B40)
  B84: [
    'fenetre:worker-detail',
    'rpc:correct_time_entry',
    'rpc:office_correct_entry',
    'rpc:office_edit_mark_notified',
    'fn:send-push',
    'table:time_entry_corrections:update',
    'ecriture:lib/office-edits#correctOfficeEntry',
  ],
  // B85 · Supprimer un brouillon vide (0 minute) du salarié (détail de B40)
  B85: [
    'fenetre:worker-detail',
    'table:time_entries:delete',
    'ecriture:lib/erase#eraseEmptyDraft',
    'ecriture:lib/erase#restoreDrafts',
  ],
  // B86 · Lire la liste des invitations en attente (nom, e-mail, « Invitée le JJ/MM ») (détail de B30)
  B86: [
    'rpc:pending_invitations_sent_at',
    'ecriture:lib/admin-writes#fetchInvitationsSentAt',
    'ancre:bureau-invit.liste',
    'ancre:bureau-invit.voir',
  ],
  // B87 · Supprimer une invitation en attente : retire le compte jamais connecté (détail de B30)
  // annuler_invitation (assistant-actions) et la croix ✕ passent par invite-worker { action: 'revoke' }.
  B87: [
    'fn:invite-worker',
    'ancre:bureau-invit.liste',
  ],
  // B88 · Envoyer toutes les invitations non envoyées d'un coup (envoi groupé) (détail de B30)
  // « Envoyer toutes les invitations » appelle resendInvitation en boucle (invite-worker).
  B88: [
    'fn:invite-worker',
  ],
  // B89 · Importer des salariés par fichier CSV/Excel : un compte et un e-mail d'invitation par ligne (détail de …
  B89: [
    'fenetre:import-workers-dialog',
    'dialogue:components/admin-planning#salariesOpen',
    'fn:invite-worker',
    'ancre:bureau-salaries.importer',
  ],
  // B90 · Modifier les infos de paie d'un salarié : taux horaire, horaire hebdomadaire propre, date d'embauche …
  B90: [
    'table:user_payroll:upsert',
    'ecriture:lib/planning-writes#savePayrollBasics',
  ],
  // B91 · Saisir ou modifier le n° de sécurité sociale d'un salarié (détail de B32)
  // worker-detail est le seul endroit qui écrit social_security_number : jamais l'assistant (planning-writes
  // l'exclut).
  B91: [
    'table:user_payroll:upsert',
  ],
  // B92 · Réactiver un salarié archivé (détail de B34)
  B92: [
    'table:users:update',
    'ecriture:lib/admin-writes#setWorkerActive',
  ],
  // B93 · Supprimer un salarié qui n'a aucune donnée (détail de B34)
  B93: [
    'table:users:delete',
  ],
  // B94 · Supprimer une habilitation d'un salarié (détail de B33)
  B94: [
    'table:certifications:delete',
    'ecriture:lib/erase#eraseOne',
  ],
  // B95 · Lire les habilitations d'un salarié et leurs échéances (« expire dans N j ») (détail de B33)
  B95: [
    'fenetre:worker-detail',
    'ancre:bureau-fiche.habilitations',
  ],
  // B96 · Vérifier les habilitations maintenant : e-mail d'alerte tout de suite (détail de B62)
  B96: [
    'fn:cert-expiry-alerts',
  ],
  // B97 · Lire les demandes de congé, en attente et traitées (détail de B42)
  B97: [
    'fenetre:leave-admin-dialog',
    'ancre:bureau-conges.liste',
  ],
  // B98 · Archiver un client (il sort des listes, ses heures et documents restent) (détail de B36)
  B98: [
    'dialogue:components/admin-planning#!!clientFiche',
    'table:worksites:update',
    'ecriture:lib/admin-writes#setWorksiteActive',
    'ancre:bureau-clients.archiver',
  ],
  // B99 · Supprimer un client qui n'a aucune donnée liée (détail de B36)
  B99: [
    'dialogue:components/admin-planning#!!clientFiche',
    'table:worksites:delete',
    'ancre:bureau-clients.supprimer',
  ],
  // B100 · Importer des clients par fichier CSV/Excel (détail de B35)
  B100: [
    'fenetre:import-dialog',
    'dialogue:components/admin-planning#mobileChantiersOpen',
    'table:worksites:insert',
    'ancre:bureau-clients.importer',
    'ancre:bureau-nav.clients',
  ],
  // B101 · Rouvrir un chantier terminé (détail de B38)
  B101: [
    'fenetre:chantier-termine',
    'dialogue:components/admin-planning#!!clientFiche',
    'rpc:set_worksite_completed',
    'ecriture:lib/chantier-termine#setWorksiteCompleted',
  ],
  // B102 · Lire le bilan d'un chantier (lecture seule) (détail de B38)
  B102: [
    'fenetre:chantier-termine',
    'dialogue:components/admin-planning#!!clientFiche',
    'rpc:my_worksite_labour',
    'ecriture:lib/chantier-termine#loadBilan',
  ],
  // B103 · Changer la catégorie ou le nom d'un document de chantier (Devis, Plan, PV de réception, Photo, Réserve …
  B103: [
    'fenetre:chantier-documents',
    'dialogue:components/document-category#!!doc',
    'rpc:document_category_ready',
    'table:documents:update',
    'ecriture:lib/doc-category#docCategoryReady',
    'ecriture:lib/doc-category#setDocumentCategory',
  ],
  // B104 · Supprimer un document ou une photo de chantier (détail de B37)
  // documents:insert d'assistant-actions (supprimer_document) est son « Annuler » : la ligne et le fichier sont remis
  // tels quels.
  B104: [
    'fenetre:chantier-documents',
    'table:documents:delete',
    'table:documents:insert',
    'ecriture:lib/chantier-docs#removeWorksiteDocument',
  ],
  // B105 · Envoyer les documents d'un chantier au client : adresse enregistrée une fois, e-mail préparé avec des …
  B105: [
    'fenetre:chantier-documents',
    'rpc:set_worksite_client_email',
    'ancre:bureau-docs.email',
    'ancre:bureau-edit.documents',
    'ancre:docs.envoyer',
  ],
  // B106 · Ajouter une dépense à un chantier : chantier, catégorie, montant, date, libellé (détail de B52)
  // table:worksite_expenses:update n'a qu'un site, lib/assistant-actions.ts (modifier_depense) : la fenêtre Coût par
  // chantier n'a pas de bouton « modifier ». L'assistant fait ici ce que l'écran ne fait pas, contre la règle «
  // jamais sa propre version d'un geste » : à revoir.
  B106: [
    'fenetre:cost-report',
    'table:worksite_expenses:insert',
    'table:worksite_expenses:update',
    'ecriture:lib/admin-writes#addExpense',
    'ancre:bureau-cout.depense',
  ],
  // B107 · Supprimer une dépense (détail de B52)
  B107: [
    'fenetre:cost-report',
    'table:worksite_expenses:delete',
    'ecriture:lib/erase#eraseOne',
  ],
  // B108 · Rouvrir une réserve levée : elle repasse « À traiter » (détail de B54)
  // reopenReserve efface les dates de levée du bureau ET du salarié sur time_entries (écriture directe permise à
  // l'admin).
  B108: [
    'fenetre:reserves-report',
    'table:time_entries:update',
    'ecriture:lib/reserve-lift#reopenReserve',
  ],
  // B109 · Lire les réserves de chantier, à traiter et levées, groupées par chantier (détail de B54)
  B109: [
    'fenetre:reserves-report',
    'ancre:bureau-nav.reserves',
    'ancre:bureau-reserves.a-traiter',
  ],
  // B110 · Prévenir par notification les participants d'une réunion (option « Prévenir par notification ») (détail …
  // notifyMeeting (missions) envoie le push « Prévenir par notification ».
  B110: [
    'dialogue:components/admin-planning#addOpen',
    'fn:send-push',
  ],
  // B111 · Ajouter une tâche au jour d'un salarié : texte, moment ou heures de…à… (détail de B27)
  B111: [
    'dialogue:components/admin-planning#addOpen',
    'table:day_tasks:insert',
    'ecriture:lib/missions#addDayTask',
  ],
  // B112 · Retirer une tâche (retrait confirmé) (détail de B27)
  B112: [
    'dialogue:components/admin-planning#addOpen',
    'table:day_tasks:delete',
    'ecriture:lib/missions#deleteDayTask',
  ],
  // B113 · Ajouter une tâche habituelle (modèle réutilisable) (détail de B27)
  B113: [
    'dialogue:components/admin-planning#addOpen',
    'table:task_templates:insert',
    'ecriture:lib/missions#addTemplate',
  ],
  // B114 · Retirer une tâche habituelle (détail de B27)
  B114: [
    'dialogue:components/admin-planning#addOpen',
    'table:task_templates:delete',
    'ecriture:lib/missions#deleteTemplate',
  ],
  // B115 · Créer ou modifier une réunion : titre, date, heure, fin et lieu facultatifs, toute l'équipe ou …
  B115: [
    'dialogue:components/admin-planning#addOpen',
    'rpc:office_save_meeting',
    'ecriture:lib/missions#saveMeeting',
  ],
  // B116 · Retirer une réunion (confirmé) (détail de B27)
  B116: [
    'dialogue:components/admin-planning#addOpen',
    'rpc:office_delete_meeting',
    'ecriture:lib/missions#deleteMeeting',
  ],
  // B117 · Régler le nom de l'entreprise, le SIRET, la TVA intracom. et le logo (détail de B59)
  B117: [
    'fenetre:company-settings',
    'rpc:update_company_info',
    'ecriture:lib/admin-writes#saveCompanySettings',
  ],
  // B118 · Activer ou couper le panier repas (détail de B60)
  B118: [
    'fenetre:company-settings',
    'rpc:set_meal_enabled',
    'ecriture:lib/admin-writes#saveMealEnabled',
  ],
  // B119 · Régler la caisse de congés BTP (taux ajouté au coût réel) (détail de B60)
  // ancre-dynamique : le bloc LeaveFundSetting relaie la prop `guide` (bureau-reglages.caisse posé par Réglages).
  B119: [
    'fenetre:company-settings',
    'table:company_cost_settings:upsert',
    'ecriture:lib/real-cost#supabaseCostSource',
    'ancre:bureau-reglages.caisse',
    'ancre:bureau-reglages.rub-heures',
    'ancre-dynamique:components/leave-fund-setting.tsx:34',
  ],
  // B120 · Désactiver l'endroit au pointage (on ne peut que le désactiver) (détail de B61)
  B120: [
    'fenetre:company-settings',
    'rpc:set_position_tracking',
  ],
  // B121 · Envoyer le récap hebdomadaire maintenant, par e-mail (détail de B62)
  B121: [
    'fenetre:company-settings',
    'fn:weekly-digest',
    'ancre:bureau-reglages.recap',
  ],
  // B122 · Changer l'adresse e-mail du comptable, destinataire de l'export de paie (détail de B60)
  B122: [
    'fenetre:company-settings',
    'rpc:update_company_info',
    'ecriture:lib/admin-writes#saveCompanySettings',
  ],
  // B123 · Lire le journal des accès du support BEMEXO (détail de B63)
  B123: [
    'ecriture:lib/support#supabaseSupportSource',
  ],
  // B124 · Déconnecter la tablette de pointage : ses QR ne fonctionnent plus (détail de B55)
  B124: [
    'fenetre:kiosk-admin',
    'fn:kiosk',
    'ancre:bureau-borne.deconnecter',
  ],
  // B125 · Régler les horaires d'ouverture de la borne (détail de B55)
  B125: [
    'fenetre:kiosk-admin',
    'fn:kiosk',
  ],
  // B126 · Lire l'état de la borne : tablette reliée, vue il y a… (détail de B55)
  B126: [
    'fenetre:kiosk-admin',
    'fn:kiosk',
  ],
  // B127 · Ajouter une formation par lien ou par document, pour l'équipe entière ou certains salariés (détail de …
  B127: [
    'fenetre:trainings-admin',
    'fn:send-push',
    'table:trainings:insert',
    'ecriture:lib/trainings#createTraining',
  ],
  // B128 · Ajouter une formation en vidéo : filmer ou déposer un fichier de 50 Mo au plus (quota vidéo de …
  B128: [
    'fenetre:training-video-recorder',
    'fenetre:training-video-upload',
    'rpc:publish_training_video',
    'rpc:start_training_video',
    'rpc:training_video_limits',
    'fn:send-push',
    'ecriture:lib/training-videos#fetchVideoLimits',
    'ecriture:lib/training-videos#publishVideo',
    'ecriture:lib/training-videos#startVideoUpload',
  ],
  // B129 · Retirer ou remettre une formation ou une vidéo (détail de B57)
  B129: [
    'fenetre:trainings-admin',
    'rpc:set_training_video_archived',
    'table:trainings:update',
    'ecriture:lib/training-videos#setVideoArchived',
    'ecriture:lib/trainings#setTrainingArchived',
  ],
  // B130 · Revenir à une version d'avant du planning d'une semaine : « Revenir à la V{n} » après aperçu (détail de …
  // restoreVersion remet les cases (insert / update) et garde d'abord l'état d'avant dans une version d'avant retour.
  B130: [
    'fenetre:planning-versions-dialog',
    'table:planning:insert',
    'table:planning:update',
    'table:planning_versions:insert',
    'ecriture:lib/admin-writes#updatePlanningSlot',
    'ecriture:lib/planning-versions#restoreVersion',
    'ecriture:lib/planning-versions#saveVersion',
    'ancre:bureau-versions.voir',
  ],
  // B131 · Garder la version actuelle du planning d'une semaine (« Garder cette version ») (détail de B49)
  B131: [
    'fenetre:planning-versions-dialog',
    'table:planning_versions:insert',
    'ecriture:lib/planning-versions#saveVersion',
  ],
  // B132 · Lire l'état de l'abonnement : essai (jours restants), terminé, actif (détail de B64)
  B132: [
    'fenetre:company-settings',
    'ancre:bureau-nav.abonner',
    'ancre:bureau-reglages.abonnement',
  ],
  // B133 · Gérer mon abonnement : portail Stripe (résilier, factures, moyen de paiement) (détail de B64)
  B133: [
    'fenetre:company-settings',
    'fn:stripe-portal',
    'ancre:bureau-reglages.abonnement',
  ],
  // B135 · Lire ce qu'un export d'équipe va verrouiller : N lignes d'heures de M salariés sur la période (détail de …
  B135: [
    'fenetre:export-verrou-dialog',
    'dialogue:components/admin-planning#exportOpen',
  ],
  // B136 · Renseigner le coût réel d'un salarié à partir d'un bulletin de paie, chiffres vérifiés puis « Valider » …
  B136: [
    'fenetre:worker-detail',
    'fn:payslip-read',
    'table:payslip_figures:delete',
    'table:payslip_figures:upsert',
    'ecriture:lib/real-cost#supabaseCostSource',
    'ancre:bureau-fiche.cout-bulletin',
  ],
  // B137 · Lire le détail de « à relancer » : qui, quels jours, mois précédent et mois en cours (détail de B41)
  B137: [
    'dialogue:components/admin-planning#relanceOpen',
    'ancre:bureau-stat.liste',
  ],
  // B138 · Lire le journal « Derniers envois » des e-mails aux salariés (détail de B58)
  B138: [
    'fenetre:staff-email-dialog',
  ],
  // B139 · Console du support BEMEXO : un agent se connecte (double vérification), entre chez une entreprise …
  // Console de l'AGENT du support (/support) et bandeau « Mode support » : absents des cahiers du bureau, qui ne
  // décrivent que le côté du patron (B63).
  B139: [
    'rpc:support_enter',
    'rpc:support_exit',
    'rpc:support_is_staff',
    'rpc:support_my_companies',
    'ecriture:lib/support#supportEnter',
    'ecriture:lib/support#supportExit',
    'ecriture:lib/support#supportIsStaff',
    'ecriture:lib/support#supportMyCompanies',
    'ecriture:lib/support#supportStillValid',
    'ancre:support-console.code',
    'ancre:support-console.connexion',
    'ancre:support-console.entreprises',
    'ancre:support-console.qr',
    'ancre:support-console.quitter',
    'ancre:support-console.valider',
    'route:/support',
  ],
  // B140 · Voir les fichiers vidéo à vérifier : fichiers sans formation, formations dont le fichier manque (détail …
  // Volet « fichiers à vérifier » de la fenêtre Formations (lecture seule) : absent des cahiers.
  B140: [
    'fenetre:training-video-orphans',
    'rpc:video_files_audit',
    'ecriture:lib/training-videos#fetchVideoFilesAudit',
  ],
};
