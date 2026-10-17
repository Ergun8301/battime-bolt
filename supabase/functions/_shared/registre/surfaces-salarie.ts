// Surfaces du SALARIÉ : capacité (S1…) → clés de code qui la portent (rpc:, table:, fenetre:, ancre:…).
// Couche volatile du registre : un redesign ne touche que ce fichier et son pendant bureau.
//
// RÈGLES DE LECTURE
//   · Une clé peut figurer sous PLUSIEURS capacités : ce qu'elle désigne sert chacune (`table:time_entries:update`
//     est écrite par la fiche d'une ligne, la pause, le panier, l'envoi…). Les mêmes clés sont aussi reprises côté
//     bureau quand le bureau s'en sert (`surfaces-bureau.ts`) : aucune n'est exclusive.
//   · Les ancres `data-guide` sont rattachées à la capacité que le guide pas à pas fait faire, pas à S93 (le guide
//     lui-même) : c'est ce que dit la fiche d'aide qui les cite (supabase/functions/_shared/worker-tours.ts).
//   · Aucun numéro de ligne n'est écrit ici, sauf dans l'unique clé `ancre-dynamique:` (S77) : le scanner la nomme d'après
//     la ligne du fichier, donc T2 la signalera au premier remaniement de app/poseur/page.tsx au-dessus de cette ligne.
//   · Établi le 15/10/2026 en lisant le code des écrans et des modules de lib/, à partir des clés que rend `registre-surfaces.ts`.
export const SURFACES_SALARIE: Record<string, string[]> = {
  // Les titres O1…O13 sont ceux du cahier docs/design-brief/fonctions-salarie.md.
  // ── O1 · Savoir ce qu'on attend de moi ────────────────────────────────────
  // Noter ses heures sur un créneau prévu : la carte « prévu » ouvre l'éditeur, qui crée la ligne.
  S3: ['ancre:journee.chantier', 'table:time_entries:insert'],
  // Cocher une tâche du jour (réseau requis) : `set_day_task_done`, sur MA tâche seulement.
  S8: ['rpc:set_day_task_done', 'ecriture:lib/missions#setTaskDone'],

  // ── O2 · Pointer ──────────────────────────────────────────────────────────
  // Le pointage se fait en scannant le QR de la tablette : /pointer reçoit le scan, la fonction `kiosk` décide arrivée ou départ.
  S10: ['route:/pointer', 'fn:kiosk'],
  // Le lecteur de QR intégré n'est offert que si une tablette est reliée (`company_has_kiosk`).
  S11: ['fenetre:qr-scanner', 'ancre:entete.scanner', 'rpc:company_has_kiosk'],
  // « Terminer ma journée » ferme le chrono côté serveur (repli `stop_active_session` si la migration manque) ; l'« Annuler » de
  // l'assistant relance le chrono (insertion dans `active_sessions`) puis retire la ligne créée (suppression dans `time_entries`).
  S13: [
    'ancre:journee.terminer', 'rpc:finish_active_session', 'rpc:stop_active_session',
    'ecriture:lib/live-session#finishLiveSession', 'ecriture:lib/live-session#cancelLiveSession',
    'table:active_sessions:delete', 'table:active_sessions:insert', 'table:time_entries:delete',
  ],
  // Même bouton et même fonction serveur, avec l'heure de fin donnée par le salarié (pointage resté ouvert).
  S14: ['ancre:journee.terminer', 'rpc:finish_active_session'],
  S15: ['ancre:journee.sortie-oubliee'],

  // ── O3 · Saisir, corriger, retirer ses heures ─────────────────────────────
  S17: ['ancre:journee.plus', 'ancre:editeur.chantier', 'ecriture:lib/worker-entry#insertWorkerEntry', 'table:time_entries:insert'],
  // « Autre chantier » est toujours proposé ; s'il manque, `ensure_other_worksite` le recrée (l'heure n'est jamais bloquée par le client).
  S18: ['ancre:editeur.chantier', 'ancre:editeur.autre', 'rpc:ensure_other_worksite'],
  // Créer un vrai chantier depuis l'éditeur ; `createWorksite` est le même code que la création d'un client au bureau.
  S19: ['ancre:editeur.autre', 'ancre:editeur.ajouter-chantier', 'table:worksites:insert', 'ecriture:lib/planning-writes#createWorksite'],
  S20: ['ancre:editeur.horaires', 'ecriture:lib/worker-entry#updateEntryTimes', 'table:time_entries:update'],
  S23: ['ancre:editeur.reserve', 'ecriture:lib/worker-entry#markEntryReserve', 'table:time_entries:update'],
  S24: ['ancre:editeur.note'],
  S25: ['ancre:editeur.documents'],
  S26: ['ancre:editeur.ok', 'ecriture:lib/worker-entry#insertWorkerEntry', 'table:time_entries:insert', 'table:time_entries:update'],
  S27: ['ancre:journee.chantier', 'ecriture:lib/worker-entry#updateEntryTimes', 'table:time_entries:update'],
  // Retirer : brouillon supprimé, ligne envoyée annulée (« Retiré ») ; l'« Annuler » de l'assistant réinsère les brouillons effacés.
  S28: [
    'dialogue:components/poseur-day#!!confirmDel', 'ancre:confirmer.retirer', 'ancre:editeur.retirer',
    'table:time_entries:delete', 'table:time_entries:insert', 'table:time_entries:update',
  ],
  // L'intervention recouvre le pointage en cours : la fenêtre propose de le terminer à l'heure où elle commence.
  S30: ['dialogue:components/poseur-day#!!liveAsk', 'ecriture:lib/live-end-at#finishLiveAt', 'rpc:finish_active_session'],
  S31: ['ancre:journee.trou', 'table:time_entries:update'],
  S32: ['ancre:journee.panier', 'ecriture:lib/worker-day#setDayMealOnline', 'table:time_entries:update'],
  // Copier / dupliquer : insère des brouillons ; « Annuler » de l'assistant ne retire que les copies restées telles quelles.
  S33: ['ancre:journee.copier', 'ecriture:lib/worker-day#copyLinesTo', 'table:time_entries:insert', 'table:time_entries:delete'],
  S34: [
    'dialogue:components/poseur-day#repeatOpen', 'fenetre:ui/calendar', 'ancre:copier.valider', 'ancre:journee.copier',
    'ecriture:lib/worker-day#copyLinesTo', 'table:time_entries:insert', 'table:time_entries:delete',
  ],
  // La carte d'une ligne montre son état (brouillon, envoyée, chez le comptable, retirée) : c'est aussi ce que touche le guide.
  S37: ['ancre:journee.chantier'],
  // Lever ou remettre « à lever » une réserve passe toujours par `mark_reserve_fixed`.
  S38: ['rpc:mark_reserve_fixed'],

  // ── O4 · Envoyer sa journée ───────────────────────────────────────────────
  S39: ['ancre:journee.envoyer', 'ecriture:lib/worker-day#sendWorkerDay', 'ecriture:lib/worker-day#submitDrafts', 'table:time_entries:update'],
  // Le prévu du bureau ne part qu'après un « oui » : il devient alors des brouillons (matérialisation) avant d'être envoyé.
  S40: ['dialogue:components/poseur-day#plannedAsk', 'ecriture:lib/worker-day#materialisePlanned', 'table:time_entries:insert'],
  S41: ['dialogue:components/poseur-day#!!pauseAsk', 'table:time_entries:update'],
  S42: ['dialogue:components/poseur-day#confirmOpen'],
  S44: ['dialogue:components/poseur-day#confirmCorrectOpen', 'table:time_entries:update'],
  S46: ['dialogue:components/poseur-day#lateOpen'],
  S47: ['dialogue:app/poseur/page#pendingOpen'],
  // « Envoyer ma journée » venu du raccourci de /pointer : une question de confirmation, rien ne part sans le « oui ».
  S48: ['dialogue:components/poseur-day#sendAsk'],

  // ── O5 · Semaine, mois, historique ────────────────────────────────────────
  S49: ['fenetre:poseur-week', 'ancre:semaine.jour'],
  S50: ['fenetre:poseur-month'],
  S51: ['fenetre:poseur-history', 'ancre:historique.jour', 'ancre:menu.historique'],
  S53: ['fenetre:traces-dialog'],
  S54: ['ancre:semaine.jour'],

  // ── O6 · Congés ───────────────────────────────────────────────────────────
  // « Mes congés » : une fenêtre pour faire, lire et annuler ; les trois capacités la partagent.
  S55: [
    'fenetre:leave-request-dialog', 'ancre:menu.conges', 'ancre:conges.faire', 'ancre:conges.type', 'ancre:conges.envoyer',
    'rpc:request_leave', 'ecriture:lib/leave#requestLeave', 'table:leave_requests:delete',
  ],
  S56: ['fenetre:leave-request-dialog'],
  // Annuler = supprimer la demande tant qu'elle attend ; changer les dates renvoie une demande neuve (`request_leave`) avant de retirer l'ancienne.
  S57: ['ancre:menu.conges', 'ancre:conges.annuler', 'rpc:request_leave', 'ecriture:lib/leave#requestLeave', 'table:leave_requests:delete'],

  // ── O7 · Réserves ─────────────────────────────────────────────────────────
  S59: ['dialogue:components/worker-reserves#open', 'ancre:reserves.bandeau'],
  S60: ['ancre:reserves.lever', 'ancre:reserves.valider', 'fenetre:reserve-lift-form', 'rpc:mark_reserve_fixed', 'ecriture:lib/reserve-lift#liftReserve'],
  S61: ['rpc:mark_reserve_fixed', 'ecriture:lib/reserve-lift#undoWorkerLift'],

  // ── O8 · Formations ───────────────────────────────────────────────────────
  // Les `ecriture:` de lecture (`fetchMy*`) y figurent parce que le scanner compte tout export de lib/ qui appelle `.rpc(` (même en lecture).
  S62: ['fenetre:poseur-trainings-list', 'rpc:my_trainings', 'rpc:my_training_videos', 'ecriture:lib/trainings#fetchMyTrainings', 'ecriture:lib/training-videos#fetchMyVideos'],
  S63: ['fenetre:training-video-player'],
  S64: ['rpc:set_training_seen', 'rpc:set_training_video_seen', 'ecriture:lib/trainings#setTrainingSeen', 'ecriture:lib/training-videos#setVideoSeen'],

  // ── O9 · Documents du chantier ────────────────────────────────────────────
  // `document_category_ready` dit si la migration des catégories est là : l'assistant s'en sert avant de ranger une pièce avec une catégorie.
  S65: [
    'ancre:docs.photo', 'ecriture:lib/chantier-docs#uploadWorksiteDocument', 'table:documents:insert',
    'rpc:document_category_ready', 'ecriture:lib/doc-category#docCategoryReady',
  ],
  // Supprimer = ligne puis fichier ; l'« Annuler » de l'assistant réinsère la ligne.
  S66: ['ecriture:lib/chantier-docs#removeWorksiteDocument', 'table:documents:delete', 'table:documents:insert'],
  S67: [
    'dialogue:components/document-category#!!doc', 'rpc:document_category_ready',
    'ecriture:lib/doc-category#docCategoryReady', 'ecriture:lib/doc-category#setDocumentCategory', 'table:documents:update',
  ],
  // L'adresse du client s'enregistre par `set_worksite_client_email` (cloisonnée par entreprise : le salarié ne peut pas écrire dans `worksites`).
  S68: ['ancre:docs.envoyer', 'rpc:set_worksite_client_email'],

  // ── O10 · Chef d'équipe ───────────────────────────────────────────────────
  S69: ['fenetre:team-day', 'ancre:equipe.jour', 'ancre:equipe.salarie'],
  // Corriger du déjà envoyé : journal + heures dans une transaction (`correct_time_entry`), puis notification du salarié (`send-push`).
  S70: [
    'ancre:equipe.corriger', 'ancre:equipe.ok', 'rpc:correct_time_entry', 'rpc:lead_send_entries',
    'ecriture:lib/corrections#corrigerHeures', 'table:time_entry_corrections:update', 'table:time_entries:update', 'fn:send-push',
  ],
  S71: ['ancre:equipe.ajouter', 'ancre:equipe.ok', 'rpc:lead_send_entries', 'table:time_entries:insert'],

  // ── O11 · Compte, notifications, informations ─────────────────────────────
  S72: ['dialogue:app/poseur/page#menuOpen', 'ancre:menu.compte'],
  S73: ['ancre:menu.photo', 'rpc:update_my_photo'],
  S74: [
    'ancre:menu.notifications', 'rpc:save_push_subscription', 'table:push_subscriptions:delete',
    'ecriture:lib/push#enablePush', 'ecriture:lib/push#disablePush',
  ],
  S75: ['ancre:menu.infos', 'ancre:infos.fermer'],
  // Navigation (octobre 2026) : Journée · Semaine · Mois sont dans la barre du bas (l'onglet Semaine porte l'ancre barre.semaine) ; le menu « Mon compte » ne répète plus ces trois-là.
  // L'entrée « Historique » du menu porte un `data-guide` calculé (MENU_GUIDE[t.value]) : le scanner n'en voit
  // qu'une expression, clé `ancre-dynamique:<fichier>:<ligne>` (la ligne bougera si le fichier est remanié au-dessus : T2 le signalera).
  S77: ['ancre-dynamique:app/poseur/page.tsx:686', 'ancre:barre.semaine', 'route:/poseur'],

  // ── O12 · Sans réseau ─────────────────────────────────────────────────────
  // Le transfert des saisies gardées sur le téléphone, automatique au retour du réseau : insère les lignes, puis les bascule (S105 : le bouton).
  S80: ['ecriture:lib/offline-sync#syncAllPending', 'table:time_entries:insert', 'table:time_entries:update'],
  S81: ['ancre:journee.panier'],

  // ── O13 · Assistant BEMEXO ────────────────────────────────────────────────
  S82: ['fenetre:worker-assistant', 'ancre:journee.assistant'],
  // `fn:?` : la question part par `invokeAssistant(name)` (lib/assistant.ts), dont le nom (assistant ou worker-assistant) est une variable.
  // Rattachée ici faute de mieux ; la vraie réponse est de la DÉCLARER dans le code (`// registre:fn=assistant,worker-assistant` juste avant l'appel).
  S83: ['fn:?'],
  // Une pièce jointe se range par `ranger_photo` ; avec « réserve » dite, la ligne du chantier passe « avec réserve » (et l'« Annuler » la remet).
  S84: ['ecriture:lib/chantier-docs#uploadWorksiteDocument', 'ecriture:lib/worker-entry#markEntryReserve', 'table:documents:insert', 'table:time_entries:update'],
  S86: [
    'ecriture:lib/worker-assistant#makeWorkerSaver', 'ecriture:lib/worker-entry#insertWorkerEntry',
    'table:time_entries:insert', 'table:time_entries:delete', 'rpc:assistant_journal_log',
  ],
  // L'exécuteur de toutes les actions de l'assistant salarié (une par outil) et leur trace au journal.
  S87: ['ecriture:lib/worker-actions#makeWorkerExecutor', 'rpc:assistant_journal_log'],
  S88: ['ecriture:lib/worker-multi#makeMultiDeps', 'rpc:assistant_journal_log'],
  // Les conversations sont gardées en base, privées par utilisateur (l'écriture ne passe que par ces deux fonctions SQL).
  S92: ['rpc:assistant_chat_append', 'rpc:assistant_chat_clear', 'table:assistant_chats:delete', 'ecriture:lib/assistant-chats#supabaseChatStore'],

  // ── §7 · Page /pointer : là où atterrit le scan ──────────────────────────
  // « Vérifier le QR » = l'action `ticket` de la fonction `kiosk` ; la connexion sur place est l'authentification, sans RPC.
  S94: ['route:/pointer', 'fn:kiosk'],

  // ── Capacité réelle absente de l'annexe (S105) ───────────────────────────
  // « Envoyer ce qui reste (N) » : même transfert que S80, déclenché à la main.
  S105: ['ecriture:lib/offline-sync#syncAllPending', 'table:time_entries:insert', 'table:time_entries:update'],
};
