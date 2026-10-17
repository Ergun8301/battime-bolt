// BEMEXO · bureau · LOT 2 · HEURES + PAIE
(function () {
const X = window.BX; const { B, btn, ov, scrim, D, M, toast, T, C } = X;
const S = [];
const tg = {
  env:T('ENVOYÉ',C.green,'#FFFFFF'), br:T('BROUILLON',C.aeBg,C.aeT), ren:T('RENVOYÉE',C.yp,C.yt), ret:T('RETIRÉE',C.sand,C.note), ajt:T('AJOUTÉE PAR LE SALARIÉ',C.ink,C.y),
  mod:T('MODIFIÉE APRÈS ENVOI','#EAE6F5','#56408E'), cor:T('CORRIGÉE PAR LE BUREAU','#DFE9F3','#1B4C82'), chef:T('PAR LE CHEF D\u2019ÉQUIPE','#DFE9F3','#1B4C82'), qr:T('POINTAGE QR',C.lock,C.t2),
  oubli:T('SORTIE OUBLIÉE',C.errBg,C.errT), res:T('RÉSERVE',C.errBg,C.errT), compta:T('CHEZ LE COMPTABLE',C.lock,C.note), lock:T('VERROUILLÉE',C.lock,C.note) };
const L = (date, client, de, dur, pan, pau, rou, tags, obs, o) => ({ cells:[ { v:date, mono:true, b:true }, { v:client, b:true, s:obs }, { v:de, mono:true, strike:o && o.strike }, { v:dur, mono:true, b:true }, pan, { v:pau, mono:true }, { v:rou, mono:true }, { v:'', tag:tags } ], bg:(o && o.bg) || 'transparent', bl:(o && o.bl) || 'none' });
const COLS = [['DATE','70px'],['CLIENT','1.5fr'],['DÉBUT–FIN','104px'],['DURÉE','58px'],['PANIER','56px'],['PAUSE','52px'],['ROUTE','78px'],['ÉTAT','1.1fr']];
const sheetRows = (sel) => [
  L('Lun 12','Villa Exemple','07:30–11:45','4:15','Oui','0:30','0:20 payée',tg.env,'',{}),
  L('Lun 12','Maison Démo','13:00–17:00','4:00','—','—','—',tg.env,'« Volet salon posé »'),
  L('Mar 13','Villa Exemple','07:30–16:30','8:00','Oui','1:00','—',tg.cor,'Avant : 07:30–16:00. Motif : oubli du rangement', sel === 1 ? { bg:C.yp, bl:'inset 4px 0 0 '+C.ink } : {}),
  L('Mer 14','Maison Démo','07:30–16:00','8:00','Oui','0:30','0:15 payée',tg.qr,''),
  L('Jeu 15','Villa Exemple','07:45– …','en cours','—','—','—',T('EN DIRECT',C.green,'#FFFFFF'),'Pointage depuis 07:45'),
  L('Jeu 15','Résidence Test','—','—','—','—','—',T('PRÉVUE',C.lock,C.t2),'') ];
const ficheHead = (tab) => ({ kicker:'FICHE SALARIÉ', title:'Alex Test', sub:'Salarié · alex.test@exemple.fr · taux 32,00 € / h chargé', tabs:{ list:['Gérer','Feuille d\u2019heures'], on:tab } });
const fiche = (body, o) => ov('wide', Object.assign(ficheHead(1), { body, foot:[btn('ghost','Relancer'), btn('ghost','Exporter ce salarié (sans verrou)')] }, o || {}));
const sheetBody = (o) => { o = o || {}; return [ B.seg(['Aujourd\u2019hui','Cette semaine','Créneau'], o.per === undefined ? 1 : o.per), ...(o.range || []),
  B.stats([{ k:'TOTAL ENVOYÉ', v:'28:15', u:'h', s:'+ 7:00 prévues' }, { k:'HEURES SUP', v:'0:00', u:'h', s:'base 35 h' }, { k:'PANIERS', v:'3' }, { k:'ROUTE', v:'0:35', u:'h', s:'payée' }], 4),
  B.lab('SEMAINE S-42 · 12 – 18 OCTOBRE', '28:15 h'), B.table(COLS, sheetRows(o.sel)), ...(o.extra || []) ]; };
const g1 = { title:'Feuille d\u2019heures', screens:[] };
g1.screens.push(D({ id:'HP01', name:'Feuille d\u2019heures · cette semaine', keep:true, covers:'B39 B3 B4 B5', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody())],
  note:'Ouverte par le nom du salarié › Feuille d\u2019heures, ou depuis Salariés. « Cette semaine » = semaine courante. Chaque ligne porte ses états ; un clic ouvre son détail.' }));
g1.screens.push(D({ id:'HP02', name:'Feuille d\u2019heures · créneau', keep:true, covers:'B39', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ per:2, range:[B.fields([B.f('Du','01/10/2026', { suf:'▾' }), B.f('Au','15/10/2026', { suf:'▾' })], 2)],
  extra:[B.lab('SEMAINE S-41 · 5 – 11 OCTOBRE','36:30 h · 1:30 sup'), B.table(COLS, [L('Lun 05','Garage Démo','07:30–16:00','8:00','Oui','0:30','—',tg.compta,''), L('Mer 07','Autre · Dépannage','08:00–10:00','2:00','—','—','—',tg.ajt,'Nommé par le salarié')])] }))],
  note:'Semaine par semaine, avec heures sup. Les lignes déjà chez le comptable portent leur verrou.' }));
const lineOv = (body, foot) => ov('panel', { kicker:'ALEX TEST · MARDI 13 OCTOBRE', title:'Villa Exemple · 8:00', sub:'07:30 → 16:30 · pause 1:00 · panier', body, foot, z:'55' });
g1.screens.push(D({ id:'HP03', name:'Ligne · détail et historique', keep:true, covers:'B39 B40', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ sel:2 })), scrim({ bg:'rgba(21,18,15,.2)', z:'54' }), lineOv([
  B.kv([['Début','07:30',true],['Fin','16:30',true],['Pause','1:00',true],['Panier','Oui'],['Route','—'],['Observation','« Joint du bas à reprendre »'],['Pointage','QR à la borne']]),
  B.lab('HISTORIQUE'), B.hist([['14/10 09:12','Sam Patron (bureau)','Fin 16:00 → 16:30','Motif : oubli du rangement. Alex prévenu.'], ['13/10 16:41','Alex Test','Envoyée',''], ['13/10 16:40','Alex Test','Pause 0:30 → 1:00','Pas prévenu']]) ],
  [btn('ghost','Renvoyer au salarié'), btn('pri','Corriger')])] }));
S.push(g1);

const g2 = { title:'Corriger, renvoyer, relancer', screens:[] };
const corrBody = (o) => { o = o || {}; return [ B.fields([B.f('Début','07:30', { mono:true, suf:'▾' }), B.f('Fin','16:30', { mono:true, suf:'▾', focus:true }), B.f('Pause','1:00', { mono:true, suf:'▾' })], 3),
  B.toggles([{ l:'Panier', on:true }]), B.seg(['Route payée','Route non payée','Pause avant'], 0, { label:'Temps entre deux chantiers' }), ...(o.pre || []),
  B.fields([B.f('Motif (lu par le salarié)', o.motif === undefined ? 'Oubli du quart d\u2019heure de rangement' : o.motif, { area:true, req:true, count:(o.motif === undefined ? '37' : String(o.motif.length)) + '/500', err:o.err })]) ]; };
const corr = (o, foot) => ov('dialog', { kicker:'CORRIGER · ALEX TEST · MAR. 13', title:'Villa Exemple', w:'560px', body:corrBody(o), foot: foot || [btn('ghost','Annuler'), btn('ghost','Corriger'), btn('pri','Corriger et prévenir')] });
g2.screens.push(D({ id:'HP04', name:'Corriger des heures', keep:true, covers:'B40', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ sel:2 })), scrim({ z:'54' }), Object.assign(corr(), { z:'56' })],
  note:'Lignes envoyées seulement. Mois ou salarié clôturé ne bloquent pas : le bureau garde la main. « Corriger et prévenir » envoie une notification.' }));
g2.screens.push(D({ id:'HP05', name:'Corriger · motif trop court', keep:true, covers:'B40', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ sel:2 })), scrim({ z:'54' }), Object.assign(corr({ motif:'ok', err:'Écrivez au moins 3 caractères : le salarié lira ce motif.' }, [btn('ghost','Annuler'), btn('dis','Corriger'), btn('dis','Corriger et prévenir')]), { z:'56' })] }));
g2.screens.push(D({ id:'HP06', name:'Corriger · journée chez le comptable', keep:true, covers:'B40 B44', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ sel:2 })), scrim({ z:'54' }), Object.assign(corr({ pre:[B.alert('warn','Cette journée est déjà chez le comptable','Envoyée le 12/10 à 09:14. Vous pouvez corriger ; pensez à le prévenir.')] }), { z:'56' })],
  note:'Signalé, jamais bloquant.' }));
g2.screens.push(D({ id:'HP07', name:'Correction enregistrée', keep:true, covers:'B40', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ sel:2 }))], toasts:[toast('Correction enregistrée. Alex est prévenu.', { sub:'Mardi 13 · fin 16:00 → 16:30' })] }));
const renvoi = (o) => ov('dialog', { kicker:'RENVOYER AU SALARIÉ', title:'Renvoyer la journée du mardi 13 à Alex ?', w:'540px', z:'56', body:[ B.p('Elle repasse en brouillon et ne compte plus tant qu\u2019Alex ne l\u2019a pas renvoyée.'), ...(o.pre || []),
  B.fields([B.f('Motif (3 à 500 caractères)', o.motif || 'Il manque l\u2019après-midi chez Maison Démo.', { area:true, req:true, count:'43/500' })]) ], foot:o.foot || [btn('ghost','Annuler'), btn('dark','Renvoyer')] });
g2.screens.push(D({ id:'HP08', name:'Renvoyer une journée', keep:true, covers:'B40', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ sel:2 })), scrim({ z:'54' }), renvoi({})] }));
g2.screens.push(D({ id:'HP09', name:'Renvoyer · refusé', keep:true, covers:'B40 B21', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody({ sel:2 })), scrim({ z:'54' }), renvoi({ pre:[B.alert('err','Renvoi impossible','La journée est déjà chez le comptable (envoyée le 12/10). Seul « Corriger » reste possible.')], foot:[btn('ghost','Fermer'), btn('pri','Corriger')] })],
  note:'Message du serveur affiché tel quel. Même refus si le mois ou les heures du salarié sont clôturés.' }));
g2.screens.push(D({ id:'HP10', name:'Brouillon vide supprimé', keep:true, covers:'B40 B23', fh:'1000px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), fiche(sheetBody())], toasts:[toast('Brouillon vide supprimé : jeudi 15, Résidence Test.', { act:'Annuler' })] }));
g2.screens.push(D({ id:'HP11', name:'Relancer · sans notification', keep:true, covers:'B41', ovs:[scrim(), ov('dialog', { title:'Relancer Bruno par e-mail', w:'540px', body:[ B.p('Bruno n\u2019a pas activé les notifications. L\u2019e-mail est prêt.'),
  B.fields([B.f('À','bruno.exemple@exemple.fr'), B.f('Message','Bonjour Bruno, il manque vos heures du lundi 12 et du mardi 13 octobre. Merci de les envoyer depuis BEMEXO.', { area:true })]) ],
  foot:[btn('ghost','Copier'), btn('pri','Ouvrir l\u2019e-mail')] })],
  note:'Avec notification : pas de fenêtre, message « Bruno est relancé ». La relance automatique se règle dans Réglages › Notifications & support.' }));
S.push(g2);

const g3 = { title:'Demandes de congé', screens:[] };
const congeOv = (tab, body, o) => ov('panel', Object.assign({ kicker:'SALARIÉS', title:'Demandes de congé', tabs:{ list:['En attente (2)','Traitées'], on:tab }, body }, o || {}));
const pend = [{ t:'Fanny Essai', s:'Du lun. 2 au ven. 6 novembre · 5 jours · « Vacances scolaires »', ini:'FE', avBg:'#FCE3CF', btn:btn('ghost','Refuser'), btn2:btn('pri','Accepter') },
  { t:'Hugo Modèle', s:'Ven. 23 octobre · 1 jour', ini:'HM', avBg:'#EFEADB', btn:btn('ghost','Refuser'), btn2:btn('pri','Accepter') }];
g3.screens.push(D({ id:'HP12', name:'Congés · en attente', keep:true, covers:'B42 B70', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), congeOv(0, [B.rows(pend)])],
  note:'Ouvert depuis Salariés (badge). Accepter pose l\u2019absence et notifie.' }));
g3.screens.push(D({ id:'HP13', name:'Refuser un congé', keep:true, covers:'B42', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), congeOv(0, [B.rows(pend)]), scrim({ z:'54' }), ov('dialog', { title:'Refuser le congé de Fanny ?', w:'500px', z:'56', body:[B.p('Du lundi 2 au vendredi 6 novembre.'), B.fields([B.f('Motif (facultatif)','', { area:true, ph:'Ex. chantier Villa Exemple à finir cette semaine-là' })])],
  foot:[btn('ghost','Annuler'), btn('dark','Refuser')] })] }));
g3.screens.push(D({ id:'HP14', name:'Congé accepté', keep:true, covers:'B42 B25', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), congeOv(0, [B.rows([pend[1]])])], toasts:[toast('Congé de Fanny accepté et posé au planning (2 → 6 novembre). Fanny est prévenue.')] }));
g3.screens.push(D({ id:'HP15', name:'Congés · traitées', keep:true, covers:'B42', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), congeOv(1, [B.rows([{ t:'Fanny Essai', s:'2 → 6 novembre', ini:'FE', avBg:'#FCE3CF', badge:T('ACCEPTÉE',C.liveBg,C.liveT) },
  { t:'Gabriel Témoin', s:'19 → 23 octobre · « Chantier Villa à finir »', ini:'GT', avBg:'#E2EBEC', badge:T('REFUSÉE',C.errBg,C.errT) }])])] }));
g3.screens.push(D({ id:'HP16', name:'Congés · aucune demande', keep:true, covers:'B42 B71', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), congeOv(0, [B.empty('Aucune demande en attente.','Les demandes des salariés arrivent ici.')])] }));
S.push(g3);

const g4 = { title:'Exporter, comptable, verrou', screens:[] };
const expBody = (o) => { o = o || {}; return [ B.seg(['Aujourd\u2019hui','Cette semaine','Créneau'], o.per === undefined ? -1 : o.per, { label:'Période' }), ...(o.range || []),
  ...(o.per === undefined ? [B.alert('info','Choisissez une période.','')] : [B.kv([['Période', o.perL || 'S-42 · 12 – 18 octobre', false], ['Heures envoyées','142:15 h', true], ['Salariés','7', true]])]),
  B.p('Seules les heures envoyées sortent.', { c:C.t2, fs:'13px' }),
  B.lab('FICHIER'), B.btns([btn(o.per === undefined ? 'dis' : 'dark','PDF'), btn(o.per === undefined ? 'dis' : 'dark','Excel'), btn(o.per === undefined ? 'dis' : 'dark','CSV paie')]),
  B.lab('COMPTABLE'), ...(o.compta || [B.rows([{ t:'Envoyer à Cabinet Exemple', s:'compta@cabinet-exemple.fr · Excel en pièce jointe, copie à vous', btn:btn(o.per === undefined ? 'dis' : 'pri','Envoyer') }])]),
  B.alert('lock','Exporter verrouille les heures de la période','Le salarié ne peut plus les modifier ; le bureau le peut encore.'),
  B.lab('CLÔTURE DU MOIS'), B.rows(o.clos || [{ t:'Septembre 2026', s:'2 journées en brouillon', btn:btn('dark','Clôturer…') }, { t:'Octobre 2026', s:'en cours', btn:btn('ghost','Clôturer…') }]),
  B.rows([{ t:'Un seul salarié ?', s:'Exportez-le depuis sa fiche, sans verrou.', chev:true }]) ]; };
const expOv = (o, extra) => ov('wide', Object.assign({ kicker:'PAIE', title:'Exporter l\u2019équipe', w:'620px', body:expBody(o) }, extra || {}));
g4.screens.push(D({ id:'HP17', name:'Exporter · sans période', covers:'B43 B44', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv()],
  note:'Aucune période par défaut : tout est désactivé tant qu\u2019on n\u2019a pas choisi. « Cette semaine » = la semaine affichée au planning.' }));
g4.screens.push(D({ id:'HP18', name:'Exporter · période choisie', covers:'B43 B44 B46 B47', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 })] }));
g4.screens.push(D({ id:'HP19', name:'Exporter · comptable non réglé', covers:'B44', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1, compta:[B.rows([{ t:'Envoyer au comptable', s:'Aucune adresse enregistrée.', btn:btn('dis','Envoyer') }]), B.alert('info','','Ajoutez l\u2019adresse du comptable dans Réglages de l\u2019entreprise › Heures & paie.', { btn:'Ouvrir les réglages' })] })] }));
const lockAlert = (body, foot) => ov('dialog', { kicker:'AVANT L\u2019EXPORT', title:'Cet export va verrouiller 42 lignes d\u2019heures de 7 salariés', w:'580px', z:'56', body, foot });
g4.screens.push(D({ id:'HP20', name:'Alerte de verrouillage', covers:'B45', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 }), scrim({ z:'54' }), lockAlert([
  B.p('+ 6 lignes déjà verrouillées par un export précédent. Les salariés ne pourront plus modifier ces heures ; le bureau le pourra encore.'),
  B.kv([['Période','S-42 · 12 – 18 octobre'],['Fichier','Excel']]) ], [btn('ghost','Annuler'), btn('ghost','Exporter sans verrouiller'), btn('pri','Exporter et verrouiller')])] }));
g4.screens.push(D({ id:'HP21', name:'Alerte · envoi au comptable, période déjà partie', covers:'B44 B45', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 }), scrim({ z:'54' }), lockAlert([
  B.alert('warn','Une partie de cette période est déjà partie','Lundi 12 et mardi 13 ont été envoyés le 14/10 à 09:14.'),
  B.p('L\u2019envoi verrouille toujours : pas d\u2019option « sans verrouiller ».') ], [btn('ghost','Annuler'), btn('pri','Envoyer et verrouiller')])] }));
g4.screens.push(D({ id:'HP22', name:'Alerte · chiffres changés', covers:'B45 B71', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 }), scrim({ z:'54' }), Object.assign(lockAlert([
  B.alert('warn','Les chiffres ont changé depuis l\u2019ouverture','Alex a envoyé 2 lignes. Rien n\u2019est parti.'), B.p('+ 6 lignes déjà verrouillées.') ], [btn('ghost','Annuler'), btn('ghost','Exporter sans verrouiller'), btn('pri','Exporter et verrouiller')]), { title:'Cet export va verrouiller 44 lignes d\u2019heures de 7 salariés' })] }));
g4.screens.push(D({ id:'HP23', name:'Export fait', covers:'B43 B45', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 })], toasts:[toast('Export Excel prêt. 42 lignes verrouillées.', { sub:'Heures-S42-Entreprise-Test.xlsx' })] }));
g4.screens.push(D({ id:'HP24', name:'Verrou en échec après le fichier', covers:'B45 B71', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 })],
  toasts:[toast('Le fichier est sorti, mais le verrou a échoué.', { tone:'err', sub:'Les 42 lignes restent modifiables par les salariés. Relancez l\u2019export pour verrouiller.' })], note:'Message affiché 12 secondes.' }));
g4.screens.push(D({ id:'HP25', name:'Envoi · déjà envoyé', covers:'B44', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 })],
  toasts:[toast('Déjà envoyé le 14/10 à 09:14 — non renvoyé.', { tone:'info', sub:'Rien n\u2019est reparti. Les heures sont verrouillées comme prévu.' })] }));
g4.screens.push(D({ id:'HP26', name:'Envoi réussi', covers:'B44', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 })], toasts:[toast('Envoyé à Cabinet Exemple. Copie à sam@entreprise-test.fr.', { sub:'42 lignes verrouillées.' })] }));
g4.screens.push(D({ id:'HP27', name:'Envoi échoué · comptage illisible', covers:'B44 B71', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 })],
  toasts:[toast('Envoi impossible : rien n\u2019a été verrouillé.', { tone:'err', sub:'Réessayez dans un instant.' }), toast('Impossible de compter les lignes : rien n\u2019a été exporté.', { tone:'err' })], note:'Deux échecs distincts, montrés ensemble ici.' }));
S.push(g4);

const g5 = { title:'Clôture du mois, un seul salarié', screens:[] };
g5.screens.push(D({ id:'HP28', name:'Clôturer septembre ?', covers:'B46', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 }), scrim({ z:'54' }), ov('dialog', { title:'Clôturer septembre 2026 ?', w:'560px', z:'56', body:[
  B.alert('warn','2 journées en brouillon resteront bloquées','Bruno, mar. 29 · Fanny, mer. 30.'),
  B.p('Ensuite : plus de saisie ni d\u2019envoi par les salariés ; interventions du mois ni supprimables ni déplaçables ; rien ne peut y être copié. Elles restent copiables vers un jour ouvert. Ces jours sortent de « à relancer ».') ],
  foot:[btn('ghost','Annuler'), btn('dark','Clôturer septembre')] })] }));
g5.screens.push(D({ id:'HP29', name:'Mois clos', covers:'B46', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1, clos:[{ t:'Septembre 2026', s:'Clôturé le 15/10 par Sam Patron', badge:T('CLOS','#655B50','#FFFFFF'), btn:btn('ghost','Rouvrir…') }, { t:'Octobre 2026', s:'en cours', btn:btn('ghost','Clôturer…') }] })],
  toasts:[toast('Septembre est clôturé.', { act:'Annuler' })] }));
g5.screens.push(D({ id:'HP30', name:'Rouvrir septembre ?', covers:'B46', fh:'1100px', ovs:[scrim({ bg:'rgba(21,18,15,.32)' }), expOv({ per:1 }), scrim({ z:'54' }), ov('dialog', { title:'Rouvrir septembre 2026 ?', w:'520px', z:'56', body:[B.p('Les salariés pourront de nouveau saisir et envoyer leurs heures de septembre. Rien n\u2019est supprimé.')], foot:[btn('ghost','Annuler'), btn('dark','Rouvrir')] })] }));
g5.screens.push(D({ id:'HP31', name:'Exporter un salarié', covers:'B47', ovs:[scrim(), ov('dialog', { title:'Exporter un salarié', w:'520px', body:[ B.search('Rechercher un salarié…'),
  B.rows([{ t:'Alex Test', ini:'AT', avBg:C.y, chev:true }, { t:'Bruno Exemple', ini:'BE', avBg:'#DDEBFA', chev:true }, { t:'Camille Démo', s:'Chef d\u2019équipe', ini:'CD', avBg:'#E0ECE6', chev:true }, { t:'Dina Fictive', ini:'DF', avBg:'#F1E2E2', chev:true }]),
  B.p('Ouvre sa fiche en « Feuille d\u2019heures » : l\u2019export d\u2019un seul salarié ne verrouille rien.', { c:C.t2, fs:'13px' }) ] })] }));
S.push(g5);

const g6 = { title:'Téléphone', screens:[] };
g6.screens.push(M({ id:'HM01', name:'Feuille d\u2019heures', keep:true, covers:'B39', ovs:[ov('mfull', { back:true, kicker:'FICHE SALARIÉ', title:'Alex Test', tabs:{ list:['Gérer','Feuille d\u2019heures'], on:1 }, body:[
  B.seg(['Aujourd\u2019hui','Semaine','Créneau'], 1), B.stats([{ k:'TOTAL', v:'28:15', u:'h' }, { k:'HEURES SUP', v:'0:00', u:'h' }], 2),
  B.rows([{ t:'Lun 12 · Villa Exemple', s:'07:30–11:45 · panier · route 0:20', r:'4:15', badge:tg.env }, { t:'Mar 13 · Villa Exemple', s:'07:30–16:30 · corrigée par le bureau', r:'8:00', badge:tg.cor, chev:true },
    { t:'Mer 14 · Maison Démo', s:'07:30–16:00 · pointage QR', r:'8:00', badge:tg.env }, { t:'Jeu 15 · Villa Exemple', s:'depuis 07:45', r:'…', badge:T('EN DIRECT',C.green,'#FFFFFF') }]) ], foot:[btn('ghost','Relancer', { grow:true }), btn('ghost','Exporter', { grow:true })] })] }));
g6.screens.push(M({ id:'HM02', name:'Corriger', keep:true, covers:'B40', ovs:[scrim(), ov('sheet', { kicker:'CORRIGER · MAR. 13', title:'Villa Exemple', body:corrBody(), foot:[btn('ghost','Corriger', { grow:true }), btn('pri','Corriger et prévenir', { grow:true })] })] }));
g6.screens.push(M({ id:'HM03', name:'Renvoyer', keep:true, covers:'B40', ovs:[scrim(), ov('sheet', { title:'Renvoyer la journée du mardi 13 ?', body:[B.p('Elle repasse en brouillon et ne compte plus.'), B.fields([B.f('Motif (3 à 500 caractères)','Il manque l\u2019après-midi.', { area:true, req:true, count:'26/500' })])], foot:[btn('dark','Renvoyer', { grow:true })] })] }));
g6.screens.push(M({ id:'HM04', name:'Demandes de congé', keep:true, covers:'B42', ovs:[ov('mfull', { back:true, title:'Demandes de congé', tabs:{ list:['En attente (2)','Traitées'], on:0 }, body:[
  B.rows([{ t:'Fanny Essai', s:'2 → 6 novembre · 5 jours' }, { t:'Hugo Modèle', s:'Ven. 23 octobre' }]), B.btns([btn('ghost','Refuser', { grow:true }), btn('pri','Accepter', { grow:true })]) ] })],
  note:'Toucher une demande la sélectionne ; les deux boutons agissent sur elle (44 px).' }));
g6.screens.push(M({ id:'HM05', name:'Exporter', covers:'B43 B44 B46', ovs:[ov('mfull', { back:true, kicker:'PAIE', title:'Exporter l\u2019équipe', body:[ B.seg(['Aujourd\u2019hui','Semaine','Créneau'], 1),
  B.kv([['Heures envoyées','142:15 h',true],['Salariés','7',true]]), B.btns([btn('dark','PDF', { grow:true }), btn('dark','Excel', { grow:true }), btn('dark','CSV', { grow:true })]),
  B.rows([{ t:'Envoyer à Cabinet Exemple', s:'Excel, copie à vous', btn:btn('pri','Envoyer') }]), B.alert('lock','','Exporter verrouille les heures de la période.'), B.rows([{ t:'Clôture du mois', chev:true }]) ] })] }));
g6.screens.push(M({ id:'HM06', name:'Alerte de verrouillage', covers:'B45', ovs:[scrim(), ov('malert', { title:'Cet export va verrouiller 42 lignes d\u2019heures de 7 salariés', titleFs:'20px', body:[B.p('+ 6 lignes déjà verrouillées.')],
  foot:[btn('pri','Exporter et verrouiller', { grow:true }), btn('ghost','Exporter sans verrouiller', { grow:true }), btn('ghost','Annuler', { grow:true })] })] }));
g6.screens.push(M({ id:'HM07', name:'Clôturer le mois', covers:'B46', ovs:[scrim(), ov('malert', { title:'Clôturer septembre 2026 ?', titleFs:'20px', body:[B.alert('warn','2 journées en brouillon resteront bloquées','')], foot:[btn('ghost','Annuler', { grow:true }), btn('dark','Clôturer', { grow:true })] })] }));
S.push(g6);

X.lots.push({ id:'lot2', kicker:'LOT 2 · PRIORITÉS 2 ET 3', title:'Heures et paie', sub:'Pas d\u2019étape « Valider » : les heures envoyées comptent aussitôt. Le bureau lit, corrige, renvoie, relance ; puis exporte, envoie au comptable, verrouille et clôture.', groups:S });
})();
