// BEMEXO · bureau · LOT 1 · PLANNING
(function () {
const X = window.BX; const { B, btn, ov, scrim, D, M, toast, bub, abs, target, rows, days, C, MENU_PLUS, MENU_ACCT, MNAV, mcards } = X;
const FOOT_CANCEL = (l, v) => [btn('ghost','Annuler'), btn(v || 'pri', l)];
const S = [];

// ---------- semaine ----------
const g1 = { title: 'Semaine, bandeau, navigation', screens: [] };
g1.screens.push(D({ id:'PL01', name:'Semaine · chiffres dépliés', covers:'B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B12 · total d\u2019heures (NOUVEAU)', isNew:true, fh:'1180px',
  note:'Écran d\u2019arrivée. Bandeau de chiffres déplié : heures envoyées de la semaine avec leurs 7 barres (nouveau total d\u2019heures), à relancer, en direct, absents, pièces. Chaque salarié porte son total « envoyées · prévues » et son état (« N jours en attente » / « À jour »). Chaque en-tête de jour porte le total du jour.' }));
g1.screens.push(D({ id:'PL02', name:'Semaine · chiffres repliés, légende ouverte', covers:'B11 · bandeau replié en une ligne de 40 px', chrome:'closed', legend:true, fh:'1180px',
  note:'« Replier ▴ » réduit le bandeau à une ligne ; le choix est gardé par utilisateur. La légende s\u2019ouvre sous la grille (« Légende ▾ ») ; à partir de 1 600 px elle reste ouverte.' }));
g1.screens.push(D({ id:'PL03', name:'Plein écran', covers:'B1 · ⤢ / Échap', chrome:'focus', fh:'900px',
  note:'⤢ masque barre noire, barre de semaine et bandeau. Restent : semaine, flèches, ✦ assistant, « Quitter · Échap ».' }));
g1.screens.push(D({ id:'PL04', name:'Autre semaine · mois clôturé', covers:'B12 B21 · repère « mois clôturé » (NOUVEAU)', isNew:true, cur:false, wk:'S-40', range:'28 septembre – 4 octobre 2026',
  dayOpts:{ list:[['Lun',28,'CLOS'],['Mar',29,'CLOS'],['Mer',30,'CLOS'],['Jeu',1,'34:00 h'],['Ven',2,'31:30 h'],['Sam',3,'—'],['Dim',4,'—']], today:-1, clos:[0,1,2] },
  rowOpts:{ today:-1, clos:[0,1,2] }, kpi:{ sent:'198:30', planned:'Semaine passée', rel:'5', bars:[['L',36],['M',35],['M',33],['J',34],['V',31.5],['S',0],['D',0]] }, fh:'1180px',
  note:'Septembre est clôturé : les trois jours portent « CLOS » dans l\u2019en-tête et un fond grisé. Plus de « + » ni de dépôt dans ces cases ; on l\u2019apprend avant d\u2019essayer. « Aujourd\u2019hui » redevient actif.' }));
g1.screens.push(D({ id:'PL05', name:'Plus ⋯ ouvert', covers:'B49 B50 B52 B57 B58 (accès) · Échap ferme (NOUVEAU)', isNew:true, plusBg:C.yp, ovs:[MENU_PLUS('auto','124px')].map(o => Object.assign(o, { r:'72px', l:'auto' })),
  note:'Seul accès à Coût chantiers, Versions du planning, Interventions supprimées ou décalées, Formations, Envoyer par e-mail. Échap ou un clic à côté le ferme.' }));
g1.screens.push(D({ id:'PL06', name:'Menu du compte', covers:'B59 (accès) B65', ovs:[Object.assign(MENU_ACCT(), { r:'24px', l:'auto', t:'56px' })],
  note:'Ouvert par « Entreprise Test ▾ ». Seul accès à Réglages de l\u2019entreprise. Formations et e-mail n\u2019y sont plus (un seul accès : Plus ⋯).' }));
S.push(g1);

// ---------- états ----------
const g2 = { title: 'États de l\u2019écran', screens: [] };
g2.screens.push(D({ id:'PL07', name:'Chargement', covers:'B71', chrome:'none', center:{ spin:true, title:'Chargement du planning…', sub:'Salariés et clients en cours de lecture.' },
  note:'Tant que salariés et clients ne sont pas lus, ce message remplace tout l\u2019écran.' }));
g2.screens.push(D({ id:'PL08', name:'Échec de lecture', covers:'B71', rows:[], kpi:{ relS:'Dernier relevé à 15:02' },
  ovs:[ov('pop', { x:'24px', y:'330px', w:'1392px', body:[B.alert('err','Impossible de charger les données','Les salariés et les clients n\u2019ont pas pu être lus. Rien n\u2019a été modifié. Vérifiez la connexion puis réessayez.',{ btn:'Réessayer' })] })],
  note:'Grille vide, raison visible. Un compteur en échec garde son dernier chiffre (jamais 0).' }));
g2.screens.push(D({ id:'PL09', name:'Entreprise vide · aide de démarrage', covers:'B69 B71', rows:[], kpi:{ sent:'0:00', planned:'Aucun salarié', rel:'0', relS:'Rien à relancer', live:'0', liveS:'Personne ne pointe', abs:'0', absS:'—', pcs:'0', pcsS:'Aucune pièce jointe', bars:[['L',0],['M',0],['M',0],['J',0],['V',0],['S',0],['D',0]] },
  ovs:[ov('pop', { x:'24px', y:'330px', w:'560px', body:[B.lab('POUR DÉMARRER · DEUX ÉTAPES','✕ Fermer'), B.steps([{ t:'Ajoutez un salarié', s:'Il reçoit une invitation par e-mail.', btn:'Nouveau salarié' }, { t:'Créez un client', s:'Un client est un chantier.', btn:'Nouveau client' }]),
    B.p('L\u2019impression est désactivée tant qu\u2019il n\u2019y a personne au planning.', { c:C.t2, fs:'13px' })] })],
  note:'Chaque étape se coche seule quand elle est faite ; l\u2019aide se ferme.' }));
g2.screens.push(D({ id:'PL10', name:'Semaine vide', covers:'B71', wk:'S-44', range:'26 octobre – 1er novembre 2026', cur:false, rowOpts:{ empty:true, today:-1 },
  dayOpts:{ list:[['Lun',26,'—'],['Mar',27,'—'],['Mer',28,'—'],['Jeu',29,'—'],['Ven',30,'—'],['Sam',31,'—'],['Dim',1,'—']], today:-1 },
  kpi:{ sent:'0:00', planned:'Rien de prévu', bars:[['L',0],['M',0],['M',0],['J',0],['V',0],['S',0],['D',0]] }, fh:'1180px',
  note:'Cases qui invitent à ajouter. « À relancer » reste à 5 : il compte les journées passées.' }));
g2.screens.push(D({ id:'PL11', name:'Échec d\u2019enregistrement', covers:'B71', toasts:[toast('Impossible d\u2019enregistrer.', { sub:'Rien n\u2019a été effacé. Vérifiez la connexion puis recommencez.', tone:'err' })],
  note:'Seule trace du hors-ligne côté bureau : l\u2019échec de l\u2019écriture (pas de bannière, conforme au cahier).' }));
g2.screens.push(D({ id:'PL12', name:'Astuce « Copier une case »', covers:'B69', ovs:[ov('pop', { x:'760px', y:'500px', w:'340px', body:[B.lab('ASTUCE','✕'), B.p('Pour copier une case, glissez-la en maintenant Ctrl (Alt ou ⌘ sur Mac). Sans touche, elle se déplace.', { fs:'14px' })] })],
  note:'Affichée une fois, fermable, ne revient pas.' }));
S.push(g2);

// ---------- ajouter ----------
const g3 = { title: 'Ajouter', screens: [] };
const addHead = { kicker:'AJOUTER · HUGO MODÈLE · LUNDI 12 OCTOBRE', w:'560px' };
g3.screens.push(D({ id:'PL13', name:'Ajouter · Intervention', covers:'B15 B2', ovs:[scrim(), ov('dialog', Object.assign({}, addHead, { title:'Ajouter une intervention', body:[
  B.seg(['Intervention','Tâche','Réunion'], 0), B.fields([B.f('Client','Villa Exemple', { sel:true, req:true, hint:'Pré-choisi : le dernier créé dans la session.' })]),
  B.fields([B.f('Début','08:00', { mono:true, suf:'▾' }), B.f('Fin','12:00', { mono:true, suf:'▾' })], 2), B.chips([{ l:'Matin 08:00–12:00', on:true }, 'Après-midi 13:30–17:00', 'Journée 08:00–17:00', 'Effacer']),
  B.p('Horaire facultatif. Pour un rendez-vous à heure fixe, mettez une fin : sinon le salarié ne voit pas l\u2019heure.', { c:C.t2, fs:'13px' }),
  B.fields([B.f('Note pour le poseur','', { area:true, ph:'Ex. clé chez la gardienne' })]) ], foot:FOOT_CANCEL('Ajouter au planning') }))],
  note:'Ouvert par un clic sur une case vide. Saisie d\u2019heure : « 14h », « 14:30 » ou liste au quart d\u2019heure ; Entrée valide.' }));
g3.screens.push(D({ id:'PL14', name:'Ajouter · horaire refusé', covers:'B15 B69', ovs:[scrim(), ov('dialog', Object.assign({}, addHead, { title:'Ajouter une intervention', body:[
  B.seg(['Intervention','Tâche','Réunion'], 0), B.fields([B.f('Client','Villa Exemple', { sel:true, req:true })]),
  B.fields([B.f('Début','14:00', { mono:true, suf:'▾' }), B.f('Fin','11:30', { mono:true, suf:'▾', err:'La fin doit être après le début.' })], 2),
  B.alert('err','Impossible d\u2019ajouter','La fin (11:30) est avant le début (14:00). Corrigez la fin ou touchez « Effacer ».'),
  B.fields([B.f('Note pour le poseur','', { area:true, ph:'Ex. clé chez la gardienne' })]) ], foot:[btn('ghost','Annuler'), btn('dis','Ajouter au planning')] }))],
  note:'Une fin seule donne « Indiquez d\u2019abord un début. » au même endroit. Le bouton reste désactivé tant que la raison est affichée.' }));
g3.screens.push(D({ id:'PL15', name:'Ajouter · Tâche', covers:'B27', ovs:[scrim(), ov('dialog', Object.assign({}, addHead, { title:'Ajouter une tâche', body:[
  B.seg(['Intervention','Tâche','Réunion'], 1), B.fields([B.f('Tâche','Rendre la clé', { focus:true, count:'13/120' })]),
  B.chips(['Ranger le dépôt','Photos avant pose','Rendre la clé','Charger le camion'], 'Tâches habituelles'),
  B.seg(['Sans moment','Matin','Après-midi','Soir','De … à …'], 4, { label:'Moment (facultatif)' }), B.fields([B.f('De','19:00', { mono:true, suf:'▾' }), B.f('À','19:30', { mono:true, suf:'▾' })], 2),
  B.alert('warn','Hors des créneaux de Hugo ce jour-là','Il travaille de 08:00 à 17:00. Ajouter quand même ?') ], foot:FOOT_CANCEL('Ajouter quand même') }))],
  note:'L\u2019avertissement ne bloque pas. Une tâche ne compte jamais dans les heures. Pas d\u2019ajout un jour d\u2019absence.' }));
g3.screens.push(D({ id:'PL16', name:'Ajouter · Réunion', covers:'B27', ovs:[scrim(), ov('dialog', { kicker:'AJOUTER · JEUDI 15 OCTOBRE', title:'Ajouter une réunion', w:'600px', body:[
  B.seg(['Intervention','Tâche','Réunion'], 2), B.fields([B.f('Titre','Réunion sécurité', { req:true, span:2 }), B.f('Date','Jeu. 15/10/2026', { suf:'▾' }), B.f('Heure','17:15', { mono:true, suf:'▾', req:true }), B.f('Fin (facultatif)','', { ph:'—', mono:true, suf:'▾' }), B.f('Lieu (facultatif)','Dépôt')], 2),
  B.seg(['Toute l\u2019équipe','Certains participants'], 1, { label:'Participants' }),
  B.checks([{ l:'Alex Test', on:true }, { l:'Camille Démo', on:true }, { l:'Gabriel Témoin', on:true }, { l:'Hugo Modèle', on:true }, { l:'Dina Fictive', s:'Arrêt maladie ce jour', dis:true }]),
  B.toggles([{ l:'Prévenir par notification', s:'Les participants reçoivent la réunion sur leur téléphone.', on:true }]) ], foot:FOOT_CANCEL('Ajouter la réunion') })],
  note:'La réunion ne compte jamais dans les heures et s\u2019imprime toujours.' }));
S.push(g3);

// ---------- intervention ----------
const g4 = { title: 'Intervention : lire, modifier, copier', screens: [] };
const ivBody = (o) => [ B.btns([btn('ghost','Fiche client'), btn('ghost','Documents (3)')]),
  B.fields([B.f('Début', o.d || '13:30', { mono:true, suf:'▾', focus:o.f }), B.f('Fin', o.e || '17:00', { mono:true, suf:'▾' })], 2), B.chips(['Matin','Après-midi','Journée','Effacer']),
  B.fields([B.f('Note pour le poseur', o.n || '', { area:true, ph:'Ex. clé chez la gardienne' })]),
  B.kv(o.kv || [['Heures déclarées','Pas encore']], { title:'HEURES DÉCLARÉES (LECTURE SEULE)' }) ];
const ivActs = (dis) => B.rows([{ t:'Copier vers un autre jour…', chev:!dis, dim:dis }, { t:'Dupliquer au lendemain', chev:!dis, dim:dis }, { t:'Ajouter une tâche à ce créneau', chev:!dis, dim:dis }], { title:'AUTRES ACTIONS' });
g4.screens.push(D({ id:'PL17', name:'Intervention prévue', covers:'B17 B2 B20 (accès) B27', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), ov('panel', { kicker:'INTERVENTION · ALEX TEST · JEU. 15 OCT.', title:'Résidence Test', sub:'Portes de garage · 12 rue de l\u2019Exemple, Villeurbanne', body:[
  B.bub(bub('RT','a','prev',{ t:'13:30–17:00' })), ...ivBody({}), ivActs(false) ], foot:[btn('danGhost','Supprimer', { right:true }), btn('pri','Enregistrer')] })] }));
g4.screens.push(D({ id:'PL18', name:'Intervention · changements non enregistrés', covers:'B17 B20', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), ov('panel', { kicker:'INTERVENTION · ALEX TEST · JEU. 15 OCT.', title:'Résidence Test', sub:'Portes de garage · 12 rue de l\u2019Exemple, Villeurbanne', body:[
  ...ivBody({ d:'14:00', f:true, n:'Arriver par la cour' }), B.alert('lock','Enregistrez d\u2019abord vos changements','Copier, Dupliquer et Ajouter une tâche reviennent ensuite.'), ivActs(true) ], foot:[btn('danGhost','Supprimer', { right:true }), btn('pri','Enregistrer')] })] }));
g4.screens.push(D({ id:'PL19', name:'Intervention avec heures envoyées', covers:'B17 B21 B22 B4 B5 B6', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), ov('panel', { kicker:'INTERVENTION · ALEX TEST · MAR. 13 OCT.', title:'Villa Exemple', sub:'Menuiseries · 4 place du Modèle, Lyon', body:[
  B.bub(bub('VE','j','env',{ t:'07:30–16:30 · 8:00', rec:'res' })),
  B.kv([['Envoyées','07:30 → 16:30 · 8:00', true], ['Pause','1:00', true], ['Panier','Oui'], ['Route','0:30 payée', true], ['Pointage','QR à la borne']], { title:'HEURES DÉCLARÉES (LECTURE SEULE)' }),
  B.p('« Joint du bas à reprendre, le client est prévenu. »', { fs:'14px' }), B.photos([['Avant pose','07:42'],['Joint','15:10','RÉSERVE'],['Fin','16:20']], 3),
  B.alert('lock','Suppression et déplacement impossibles','Des heures sont envoyées sur cette intervention. Pour les modifier : Feuille d\u2019heures › Corriger. Copier reste possible.'),
  ivActs(false) ], foot:[btn('dis','Supprimer', { right:true }), btn('pri','Enregistrer')] })],
  note:'Même refus, même texte, pour : heures notées (brouillon non vide), sortie oubliée à compléter, pointage en cours, mois ou salarié clôturé.' }));
const copyBody = [ B.bub(bub('VE','m','prev',{ t:'08:00–12:00' }), { label:'CASE COPIÉE · GABRIEL · JEU. 15' }),
  B.fields([B.f('Pour qui ?','Gabriel Témoin', { sel:true })]), B.seg(['‹ S-41','S-42 · 12 – 18 oct.','S-43 ›'], 1, { label:'Semaine (de S-38 à S-68)' }),
  B.days([['L','12',''],['M','13',''],['M','14','no','Repos'],['J','15','no','Doublon'],['V','16','on'],['S','17','on'],['D','18','']], { title:'Jours' }),
  B.p('Reprend client, horaire prévu et note. Jamais les heures.', { c:C.t2, fs:'13px' }) ];
g4.screens.push(D({ id:'PL20', name:'Copier vers un autre jour', covers:'B20 B21', ovs:[scrim(), ov('dialog', { title:'Copier vers un autre jour', w:'600px', body:copyBody, foot:FOOT_CANCEL('Copier sur ces 2 jours') })],
  note:'Chaque jour refusé dit sa raison sous la case : absence, doublon (même client, mêmes heures), chevauchement, mois ou salarié clôturé.' }));
g4.screens.push(D({ id:'PL21', name:'Copie faite', covers:'B20', toasts:[toast('Copiée sur 2 jours : vendredi 16 et samedi 17.')],
  note:'« Copier vers… » et « Dupliquer au lendemain » répondent par un message, sans Annuler.' }));
S.push(g4);

// ---------- glisser ----------
const g5 = { title: 'Glisser-déposer (ordinateur)', screens: [] };
const dragRows = (kind, label, tr, td, src) => { const r = rows(); const s = src || [6,3,0]; r[s[0]].cells[s[1]].items[s[2]] = Object.assign({}, r[s[0]].cells[s[1]].items[s[2]], { op:'.45', ol:'2px dashed '+C.ink }); target(r[tr], td, kind, label); return r; };
g5.screens.push(D({ id:'PL22', name:'Déplacer', covers:'B18', chrome:'closed', rows:dragRows('ok','Déposer ici',7,1), ovs:[X.ghost(470, 870, 'Villa Exemple', '08:00–12:00 · déplacer')], fh:'1060px',
  note:'Après 8 px de glisser. Source en pointillés, case visée nommée « Déposer ici ». Déposer sur une intervention l\u2019insère avant elle. Échap annule.' }));
g5.screens.push(D({ id:'PL23', name:'Copier (Ctrl, Alt ou ⌘)', covers:'B19', chrome:'closed', rows:dragRows('copy','Copier ici',7,1), ovs:[X.ghost(470, 870, 'Villa Exemple', '08:00–12:00 · copier', '+')], fh:'1060px',
  note:'La touche compte au moment du dépôt. Après une copie par glisser, le message propose « Annuler ».' }));
g5.screens.push(D({ id:'PL24', name:'Dépôt refusé · absence', covers:'B21', chrome:'closed', rows:dragRows('ko','Refusé : arrêt maladie',3,1), ovs:[X.ghost(470, 520, 'Villa Exemple', '08:00–12:00 · déplacer')], fh:'1060px',
  toasts:[toast('Déplacement refusé : Dina Fictive est en arrêt maladie le mardi 13.', { tone:'err', sub:'L\u2019intervention reste chez Gabriel, jeudi 15.' })],
  note:'La case refusée le dit pendant le survol ; au lâcher, le message répète la raison.' }));
g5.screens.push(D({ id:'PL25', name:'Départ refusé · heures envoyées', covers:'B21', chrome:'closed', fh:'1060px', toasts:[toast('Impossible de déplacer : des heures sont envoyées sur cette intervention.', { tone:'err', sub:'Pour la reproduire ailleurs, glissez-la avec Ctrl : elle sera copiée.' })],
  note:'Réordonner dans la même case reste toujours permis, même avec heures envoyées ou mois clôturé.' }));
const clientsDrawer = (search) => ov('drawer', { title:'Clients', body:[ B.search('Rechercher un client…', search), B.lab('GLISSEZ UN CLIENT SUR LE PLANNING'),
  B.rows([{ t:'Autre', s:'Chantier non listé — le salarié le nomme', grab:true, dot:C.ink }, { t:'Villa Exemple', s:'Menuiseries · Lyon', grab:true, dot:X.PAL[0], chev:true }, { t:'Maison Démo', s:'Volets roulants · Bron', grab:true, dot:X.PAL[1], chev:true },
    { t:'Résidence Test', s:'Portes de garage · Villeurbanne', grab:true, dot:X.PAL[2], chev:true }, { t:'Atelier Fictif', s:'Stores · Vénissieux', grab:true, dot:X.PAL[3], chev:true }, { t:'Garage Démo', s:'Portail · Caluire · Terminé le 02/10', grab:true, dot:X.PAL[4], chev:true }]) ],
  foot:[btn('pri','+ Nouveau client', { grow:true }), btn('ghost','Importer (CSV/Excel)', { grow:true })] });
const dragClient = (kind, label, tr, td) => { const r = rows(); target(r[tr], td, kind, label); return r; };
g5.screens.push(D({ id:'PL26', name:'Glisser un client', covers:'B16 B14', chrome:'closed', clientsBg:C.yp, rows:dragClient('ok','Déposer ici · sans horaire',7,1), ovs:[clientsDrawer(), X.ghost(560, 880, 'Maison Démo', 'nouvelle intervention')], fh:'1060px',
  note:'La liste Clients reste ouverte à gauche ; l\u2019intervention créée n\u2019a pas d\u2019horaire.' }));
g5.screens.push(D({ id:'PL27', name:'Client refusé · absence', covers:'B16 B21 · refus clair (NOUVEAU)', isNew:true, chrome:'closed', clientsBg:C.yp, rows:dragClient('ko','Refusé : congé',4,4), ovs:[clientsDrawer(), X.ghost(1180, 720, 'Maison Démo', 'nouvelle intervention')], fh:'1060px',
  toasts:[toast('Rien n\u2019a été ajouté : Eli est en congé le vendredi 16.', { tone:'err', sub:'Remettez-le « Présent » ce jour-là pour planifier.' })],
  note:'Aujourd\u2019hui ce dépôt est accepté. Désormais refusé, avec la même raison que pour une intervention.' }));
g5.screens.push(D({ id:'PL28', name:'Client refusé · mois clôturé', covers:'B16 B21 B46 · refus clair (NOUVEAU)', isNew:true, chrome:'closed', clientsBg:C.yp, cur:false, wk:'S-40', range:'28 septembre – 4 octobre 2026',
  dayOpts:{ list:[['Lun',28,'CLOS'],['Mar',29,'CLOS'],['Mer',30,'CLOS'],['Jeu',1,'34:00 h'],['Ven',2,'31:30 h'],['Sam',3,'—'],['Dim',4,'—']], today:-1, clos:[0,1,2] },
  rows:(() => { const r = rows({ today:-1, clos:[0,1,2] }); target(r[7], 1, 'ko', 'Refusé : septembre clôturé'); return r; })(), ovs:[clientsDrawer(), X.ghost(560, 880, 'Maison Démo', 'nouvelle intervention')], fh:'1060px',
  toasts:[toast('Rien n\u2019a été ajouté : septembre est clôturé.', { tone:'err', sub:'Rouvrez le mois depuis Exporter › Clôture du mois pour planifier.' })],
  note:'Même refus chez un salarié clôturé (« heures de Hugo clôturées au 30/09 »).' }));
S.push(g5);

// ---------- supprimer, sélectionner ----------
const g6 = { title: 'Supprimer, sélectionner', screens: [] };
g6.screens.push(D({ id:'PL29', name:'Supprimer ? · heures retirées', covers:'B22', ovs:[scrim(), ov('dialog', { title:'Supprimer l\u2019intervention ?', w:'480px', body:[
  B.bub(bub('RT','a','ret',{ t:'14:00–16:00 · 2:00' })), B.p('Eli a retiré 2:00 h de cette case. Elles restent dans sa feuille d\u2019heures.') ], foot:[btn('ghost','Garder'), btn('dan','Supprimer')] })],
  note:'Sans heures retirées, pas de question : la suppression est immédiate, avec Annuler.' }));
g6.screens.push(D({ id:'PL30', name:'Supprimée · Annuler', covers:'B23', toasts:[toast('1 intervention supprimée.', { act:'Annuler' })],
  note:'Le message reste jusqu\u2019à fermeture ; Annuler remet à l\u2019identique. Même message après une copie par glisser (refusé si des heures y ont été notées depuis, ou mois clôturé).' }));
const selRows = () => { const r = rows({ sel:true, selRows:[] }); r[7].cells[3].items[0] = Object.assign({}, r[7].cells[3].items[0], { chkBg:C.y, chkMark:'✓', ol:'2.5px solid '+C.ink });
  r[7].cells[4].items[0] = Object.assign({}, r[7].cells[4].items[0], { chkBg:C.y, chkMark:'✓', ol:'2.5px solid '+C.ink });
  r[6].cells[4].items[0] = Object.assign({}, r[6].cells[4].items[0], { chkBg:C.y, chkMark:'✓', ol:'2.5px solid '+C.ink }); return r; };
g6.screens.push(D({ id:'PL31', name:'Mode « Sélectionner »', covers:'B24', chrome:'closed', rows:selRows(), dayOpts:{ sel:true }, sel:{ count:'3 sélectionnées', del:btn('dan','Supprimer (3)') }, fh:'1060px',
  note:'Cocher : une intervention ; son nom = sa semaine ; un en-tête de jour = la journée ; « Tout sélectionner » = la semaine. Verrouillées (–) : heures envoyées ou notées, pointage, absences, ajoutées par le salarié, réunions, tâches. Pas d\u2019ajout ni de glisser pendant le mode ; changer de semaine vide la sélection.' }));
g6.screens.push(D({ id:'PL32', name:'Sélection · raison du verrou', covers:'B24 B21', chrome:'closed', rows:selRows(), dayOpts:{ sel:true }, sel:{ count:'3 sélectionnées', del:btn('dan','Supprimer (3)') }, fh:'1060px',
  ovs:[ov('pop', { x:'560px', y:'360px', w:'320px', body:[B.lab('VERROUILLÉE'), B.p('Villa Exemple · lundi 12 : des heures sont envoyées. Elle ne se supprime pas d\u2019ici.', { fs:'14px' })] })],
  note:'Un clic sur un élément verrouillé donne sa raison. Absence : « à changer avec Présent ».' }));
g6.screens.push(D({ id:'PL33', name:'Supprimer (3) ?', covers:'B24', chrome:'closed', rows:selRows(), dayOpts:{ sel:true }, fh:'1060px', ovs:[scrim(), ov('dialog', { title:'Supprimer 3 interventions ?', w:'500px', body:[
  B.rows([{ t:'Résidence Test', s:'Hugo Modèle · jeudi 15 · 08:00–17:00' }, { t:'Résidence Test', s:'Hugo Modèle · vendredi 16 · sans horaire' }, { t:'Villa Exemple', s:'Gabriel Témoin · vendredi 16 · sans horaire' }]),
  B.p('Aucune heure n\u2019y est notée. Vous pourrez annuler.', { c:C.t2, fs:'13px' }) ], foot:[btn('ghost','Garder'), btn('dan','Supprimer (3)')] })] }));
S.push(g6);

// ---------- absences, tâches, réunions ----------
const g7 = { title: 'Statut, absences, tâches, réunions', screens: [] };
g7.screens.push(D({ id:'PL34', name:'Statut du salarié', covers:'B25 B26 B39 (accès)', ovs:[ov('pop', { x:'24px', y:'790px', w:'340px', body:[ B.lab('STATUT DE GABRIEL À PARTIR D\u2019AUJOURD\u2019HUI'),
  B.rows([{ t:'Présent', badge:X.T('ACTUEL',C.liveBg,C.liveT) }, { t:'Congé', chev:true }, { t:'Arrêt maladie', chev:true }, { t:'Intempérie', chev:true }]), B.rows([{ t:'Feuille d\u2019heures', s:'Ouvre sa fiche', chev:true }]) ] })],
  note:'Clic sur le nom ou sur une absence. Sur une absence, le titre devient « à partir du {jour} ». « Repos » s\u2019affiche, ne se crée pas.' }));
g7.screens.push(D({ id:'PL35', name:'Poser une absence', covers:'B25', ovs:[scrim(), ov('dialog', { kicker:'GABRIEL TÉMOIN', title:'Congé', w:'520px', back:true, closeToo:true, body:[
  B.seg(['Du … au …','Jusqu\u2019au retour'], 0), B.cal('Octobre 2026', 3, 31, { 15:'today', 19:'end', 20:'in', 21:'in', 22:'in', 23:'end' }, { note:'Du lundi 19 au vendredi 23 octobre · 5 jours. Remplace les absences déjà posées sur la période.' }) ],
  foot:[btn('ghost','Retour'), btn('pri','Enregistrer')] })],
  note:'« Jusqu\u2019au retour » : l\u2019absence dure jusqu\u2019au « Présent » (90 jours au plus).' }));
g7.screens.push(D({ id:'PL36', name:'Remettre « Présent »', covers:'B26', ovs:[scrim(), ov('dialog', { title:'Remettre Dina présente dès aujourd\u2019hui ?', w:'520px', body:[
  B.p('L\u2019arrêt maladie en cours (12 → 16 octobre) s\u2019arrête au mercredi 14. Jeudi 15 et vendredi 16 redeviennent ouvrables.'),
  B.alert('info','Une absence posée plus tard reste','Congé du 2 au 6 novembre : inchangé.') ], foot:[btn('ghost','Annuler'), btn('pri','Remettre présente')] })],
  note:'Confirmation seulement si plusieurs jours sont touchés ; ensuite message avec Annuler.' }));
g7.screens.push(D({ id:'PL37', name:'Tâches de la case', covers:'B27 B10', ovs:[ov('pop', { x:'760px', y:'560px', w:'360px', body:[ B.lab('TÂCHES · CAMILLE · JEU. 15','1/3'),
  B.checks([{ l:'Ranger le dépôt', s:'Matin', on:true, r:'Fait 09:12', rc:C.liveT }, { l:'Photos avant pose', s:'Sans moment', r:'Pas fait', rc:C.errT }, { l:'Rendre la clé', s:'17:00', r:'—' }]),
  B.btns([btn('ghost','+ Tâche', { grow:true }), btn('danGhost','Retirer…')]) ] })],
  note:'Coché par le salarié. Retirer demande confirmation. Les tâches se voient même un jour d\u2019absence.' }));
g7.screens.push(D({ id:'PL38', name:'Réunion', covers:'B27', ovs:[scrim(), ov('dialog', { kicker:'RÉUNION · JEUDI 15 OCTOBRE', title:'Réunion sécurité', w:'560px', body:[
  B.fields([B.f('Titre','Réunion sécurité', { span:2 }), B.f('Heure','17:15', { mono:true, suf:'▾' }), B.f('Fin','17:45', { mono:true, suf:'▾' }), B.f('Lieu','Dépôt', { span:2 })], 2),
  B.chips([{ l:'Alex Test', on:true }, { l:'Camille Démo', on:true }, { l:'Gabriel Témoin', on:true }, { l:'Hugo Modèle', on:true }, '+ Participant'], 'Participants · 4'), B.toggles([{ l:'Prévenir par notification', on:true }]) ],
  foot:[btn('danGhost','Retirer la réunion', { right:true }), btn('pri','Enregistrer')] })] }));
g7.screens.push(D({ id:'PL39', name:'Heures ajoutées par le salarié · attribuer', covers:'B28 B4', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), ov('panel', { kicker:'HEURES AJOUTÉES PAR LE SALARIÉ', title:'+1:30 h · Gabriel Témoin', sub:'Mardi 13 octobre · déclarées sur Maison Démo, non prévue ce jour', body:[
  B.kv([['Durée','13:30 → 15:00 · 1:30', true], ['Observation','« Reprise du volet cassé »'], ['Documents','1 photo']]), B.lab('ATTRIBUER UN CLIENT'), B.search('Rechercher un client…'),
  B.rows([{ t:'Autre', s:'Laisser sur « Autre »', dot:C.ink }, { t:'Maison Démo', s:'Volets roulants · Bron', dot:X.PAL[1], on:true, chk:true }, { t:'Villa Exemple', s:'Menuiseries · Lyon', dot:X.PAL[0], chk:false }, { t:'Créer un nouveau client…', chev:true }]) ],
  foot:[btn('ghost','Annuler'), btn('pri','Attribuer')] })],
  note:'Une fois envoyées sur un client précis, ces heures créent une intervention « ajoutée par le salarié ».' }));
S.push(g7);

// ---------- imprimer, compteurs ----------
const g8 = { title: 'Imprimer, compteurs', screens: [] };
const printBody = (extra) => [ B.seg(['Semaine','Jour','Mois'], 0, { label:'Période' }), B.seg(['‹','S-42 · 12 – 18 octobre','›'], 1), B.seg(['Toute l\u2019équipe','Un salarié'], 0, { label:'Pour' }),
  B.checks([{ l:'Avec colonne signature', on:true }, { l:'Avec les tâches', on:false }], { label:'Options (mémorisées)' }), ...(extra || []), B.p('A4 paysage. Ctrl/Cmd+P imprime la semaine affichée, sans ce menu.', { c:C.t2, fs:'13px' }) ];
g8.screens.push(D({ id:'PL40', name:'Imprimer le planning', covers:'B48', ovs:[ov('pop', { rx:'230px', x:'auto', y:'124px', w:'380px', body:[B.lab('IMPRIMER LE PLANNING'), ...printBody()], foot:[btn('pri','Imprimer', { grow:true })] })].map(o => Object.assign(o, { r:'230px' })),
  note:'Jour : Aujourd\u2019hui, Demain ou une date. Mois : sans détail horaire, un code par chantier. Arrêt maladie imprimé « Absent ».' }));
g8.screens.push(D({ id:'PL41', name:'Imprimer · préparation, échec', covers:'B48 B71', ovs:[ov('pop', { x:'auto', y:'124px', w:'380px', body:[B.lab('IMPRIMER LE PLANNING'), B.seg(['Semaine','Jour','Mois'], 2, { label:'Période' }), B.seg(['‹','Novembre 2026','›'], 1),
  B.alert('err','Impression impossible','Novembre n\u2019a pas pu être lu. Rien n\u2019a été imprimé.', { btn:'Réessayer' })], foot:[btn('dis','Préparation…', { grow:true })] })].map(o => Object.assign(o, { r:'230px' })),
  note:'« Préparation… » s\u2019affiche quand une autre période doit être lue ; en cas d\u2019échec, la raison remplace le bouton.' }));
const relPop = (body) => ov('pop', { x:'auto', y:'252px', w:'400px', body }); 
g8.screens.push(D({ id:'PL42', name:'À relancer · détail', covers:'B41 B70', ovs:[Object.assign(relPop([B.lab('À RELANCER · OCTOBRE','5 journées'),
  B.rows([{ t:'Bruno Exemple', s:'Lun. 12, mar. 13', r:'2 j', rFg:C.errT, btn:btn('dark','Relancer') }, { t:'Fanny Essai', s:'Lun. 12 · mer. 14 sortie oubliée', r:'2 j', rFg:C.errT, btn:btn('ghost','Relancé') },
    { t:'Eli Martin-Lefebvre-Dubois…', s:'Mar. 13', r:'1 j', rFg:C.errT, btn:btn('dark','Relancer') }]),
  B.p('Journées passées avec une intervention prévue et aucune heure envoyée, plus les sorties oubliées. Hors absences, interventions retirées, mois et périodes clôturés.', { c:C.t2, fs:'12.5px' })]), { l:'540px' })],
  note:'Le nom ouvre la fiche. « Relancer » envoie une notification, sinon prépare un e-mail ; il devient « Relancé » pour la session.' }));
g8.screens.push(D({ id:'PL43', name:'À relancer · à jour', covers:'B41', kpi:{ rel:'0', relS:'Tout est envoyé en octobre' }, ovs:[Object.assign(relPop([B.lab('À RELANCER · OCTOBRE','0'), B.empty('Tout le monde est à jour.', 'Tout est envoyé en octobre.')]), { l:'540px' })] }));
g8.screens.push(D({ id:'PL44', name:'Pièces · détail', covers:'B53 B6', ovs:[Object.assign(relPop([B.lab('PIÈCES · PAR CHANTIER','14'),
  B.rows([{ t:'Villa Exemple', r:'5', chev:true, dot:X.PAL[0] }, { t:'Maison Démo', r:'4', chev:true, dot:X.PAL[1] }, { t:'Immeuble Modèle', r:'3', chev:true, dot:X.PAL[5] }, { t:'Garage Démo', r:'2', chev:true, dot:X.PAL[4] }, { t:'Résidence Test', s:'Aucune pièce jointe', dim:true, dot:X.PAL[2] }]),
  B.alert('err','', 'Atelier Fictif : lecture impossible.', { btn:'Réessayer' })]), { r:'24px', l:'auto' })],
  note:'Un chantier ouvre ses documents.' }));
S.push(g8);

// ---------- téléphone ----------
const g9 = { title: 'Téléphone et tablette (sous 1 024 px)', screens: [] };
g9.screens.push(M({ id:'PM01', name:'Jour · aujourd\u2019hui', covers:'B13 B1–B10 B12 B70', note:'Un jour à la fois, une carte par salarié. Le choix du jour est gardé en changeant de semaine.' }));
g9.screens.push(M({ id:'PM02', name:'Jour · lundi', covers:'B13 B9', day:0 }));
g9.screens.push(M({ id:'PM03', name:'Menu ☰', covers:'B72 B65 B64', ovs:[scrim(), ov('sheet', { title:'Menu', body:[
  B.rows(MNAV.map(l => ({ t:l, chev:true, r: l === 'Salariés' ? '3' : (l === 'Demandes de congé' ? '1' : (l === 'Réserves de chantier' ? '2' : '')), rFg:C.errT }))), B.rows([{ t:'Entreprise Test', s:'Sam Patron · essai 12 jours', ini:'ET', avBg:C.y, btn:btn('pri','S\u2019abonner') }, { t:'Déconnexion' }]) ] })],
  note:'Point d\u2019entrée unique, appelé « menu ☰ » par le guide. Intitulés du cahier ; « Légende » ajoutée.' }));
g9.screens.push(M({ id:'PM04', name:'Légende', covers:'B11 · légende sur téléphone (NOUVEAU)', isNew:true, ovs:[scrim(), ov('sheet', { title:'Légende', body:[B.legend({ cols:'minmax(0,1fr)' })] })] }));
g9.screens.push(M({ id:'PM05', name:'Intervention', covers:'B17 B20 B22 B27', ovs:[scrim(), ov('sheet', { kicker:'ALEX TEST · JEU. 15', title:'Résidence Test', sub:'Portes de garage · Villeurbanne', body:[
  B.fields([B.f('Début','13:30', { mono:true, suf:'▾' }), B.f('Fin','17:00', { mono:true, suf:'▾' })], 2), B.fields([B.f('Note pour le poseur','', { area:true, ph:'Ex. clé chez la gardienne' })]),
  B.rows([{ t:'Copier vers un autre jour…', chev:true }, { t:'Dupliquer au lendemain', chev:true }, { t:'Ajouter une tâche à ce créneau', chev:true }, { t:'Supprimer', tc:C.errT, chev:false }]) ], foot:[btn('pri','Enregistrer', { grow:true })] })],
  note:'Pas de glisser au téléphone : pour déplacer, copier puis supprimer.' }));
g9.screens.push(M({ id:'PM06', name:'Ajouter un chantier', covers:'B15', ovs:[scrim(), ov('sheet', { kicker:'HUGO MODÈLE · JEU. 15', title:'Ajouter un chantier', body:[
  B.fields([B.f('Client','Villa Exemple', { sel:true })]), B.fields([B.f('Début','', { ph:'—', mono:true, suf:'▾' }), B.f('Fin','', { ph:'—', mono:true, suf:'▾' })], 2), B.chips(['Matin','Après-midi','Journée']),
  B.fields([B.f('Note pour le poseur','', { area:true, ph:'Ex. clé chez la gardienne' })]) ], foot:[btn('pri','Ajouter au planning', { grow:true })] })] }));
g9.screens.push(M({ id:'PM07', name:'Copier vers un autre jour', covers:'B20 B21', ovs:[scrim(), ov('sheet', { title:'Copier vers un autre jour', body:copyBody.slice(1), foot:[btn('pri','Copier sur ces 2 jours', { grow:true })] })] }));
g9.screens.push(M({ id:'PM08', name:'Statut du salarié', covers:'B25 B26', ovs:[scrim(), ov('sheet', { title:'Statut de Gabriel à partir d\u2019aujourd\u2019hui', body:[
  B.rows([{ t:'Présent', badge:X.T('ACTUEL',C.liveBg,C.liveT) }, { t:'Congé', chev:true }, { t:'Arrêt maladie', chev:true }, { t:'Intempérie', chev:true }, { t:'Feuille d\u2019heures', chev:true }]) ] })] }));
g9.screens.push(M({ id:'PM09', name:'Sélectionner des interventions', covers:'B24', cardOpts:{ day:4, sel:true, selRows:[] }, day:4, mSel:{ count:'2 sélectionnées', del:btn('dan','Supprimer (2)') },
  mCards:(() => { const c = mcards({ day:4, sel:true }); c[7].items[0] = Object.assign({}, c[7].items[0], { chkBg:C.y, chkMark:'✓', ol:'2.5px solid '+C.ink }); c[6].items[0] = Object.assign({}, c[6].items[0], { chkBg:C.y, chkMark:'✓', ol:'2.5px solid '+C.ink }); return c; })(),
  note:'Toucher un nom coche ses interventions du jour ; « Tout sélectionner » = le jour affiché.' }));
g9.screens.push(M({ id:'PM10', name:'Sélection · verrou', covers:'B24 B21', day:4, mCards:mcards({ day:4, sel:true }), mSel:{ count:'0 sélectionnée', del:btn('dis','Supprimer') },
  toasts:[toast('Verrouillée : Eli est en congé ce jour.', { sub:'Une absence se change avec « Présent ».', tone:'info' })] }));
g9.screens.push(M({ id:'PM11', name:'Chargement', covers:'B71', mCenter:{ spin:true, title:'Chargement du planning…' } }));
g9.screens.push(M({ id:'PM12', name:'Échec de lecture', covers:'B71', mCenter:{ title:'Impossible de charger les données', sub:'Rien n\u2019a été modifié. Vérifiez la connexion.', btn:'Réessayer' } }));
g9.screens.push(M({ id:'PM13', name:'Entreprise vide', covers:'B69 B71', mCards:[], ovs:[ov('pop', { x:'14px', y:'360px', w:'calc(100% - 28px)', body:[B.lab('POUR DÉMARRER · DEUX ÉTAPES'), B.steps([{ t:'Ajoutez un salarié', btn:'Ajouter' }, { t:'Créez un client', btn:'Créer' }])] })] }));
g9.screens.push(M({ id:'PM14', name:'À relancer', covers:'B41', ovs:[scrim(), ov('sheet', { title:'À relancer · 5 journées', body:[
  B.rows([{ t:'Bruno Exemple', s:'Lun. 12, mar. 13', btn:btn('dark','Relancer') }, { t:'Fanny Essai', s:'Lun. 12 · mer. 14', btn:btn('ghost','Relancé') }, { t:'Eli Martin-Lefebvre-Dubois de la Roche-Valmont', s:'Mar. 13', btn:btn('dark','Relancer') }]) ] })] }));
g9.screens.push(M({ id:'PM15', name:'Supprimée · Annuler', covers:'B22 B23', toasts:[toast('1 intervention supprimée.', { act:'Annuler' })] }));
g9.screens.push(M({ id:'PM16', name:'Tablette portrait (834 px)', covers:'B13 · même disposition, cartes sur deux colonnes', tablet:true,
  note:'Sous 1 024 px la tablette prend la disposition téléphone. À partir de 640 px les cartes passent sur deux colonnes. « Touchez » dans les guides.' }));
S.push(g9);

X.lots.push({ id:'lot1', kicker:'LOT 1 · PRIORITÉ 1', title:'Planning', sub:'Semaine, glisser-déposer, copier, sélectionner, absences, tâches, réunions, imprimer, compteurs. Ordinateur puis téléphone.', groups:S });
})();
