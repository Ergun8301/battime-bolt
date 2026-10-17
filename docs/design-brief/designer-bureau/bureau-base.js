// BEMEXO · bureau · moteur de la planche : couleurs, données d'exemple, constructeurs d'écrans.
(function () {
const C = { ink:'#15120F', ink2:'#1B1713', ink3:'#25201B', cream:'#F2EDE3', card:'#FFFDF8', sand:'#E6DDCD', line:'#E3DACB', line2:'#D6CBB7',
  t2:'#5B534A', t3:'#655B50', note:'#3A332B', y:'#FFC21A', yd:'#D9A200', yp:'#FFF3CC', yt:'#5C4300', lbl:'#755800', green:'#1F7A4D',
  liveBg:'#E7F6EE', live:'#2FA36B', liveT:'#17663F', errBg:'#FCE4E1', err:'#C62828', errT:'#8E1B14', errBd:'#F0B8AE', soft:'#EFE7D9', lock:'#EFE9DE',
  todayH:'#FFF3CC', todayC:'#FFF6DB', aeBg:'#FFE4A8', aeT:'#7A3A00', aeBd:'#C98500', prevBd:'#9C907E', meet:'#FFE2EC', meetBd:'#B7366A' };
const CR = { m:{f:'#DDEBFA',s:'#4A8FE0',l:'Matin'}, a:{f:'#FCE3CF',s:'#EE8A43',l:'Après-midi'}, s:{f:'#EAD6F4',s:'#9A6FD6',l:'Soir'}, j:{f:'#FFFFFF',s:'#15120F',l:'Journée'} };
const PAL = ['#1D5FA8','#1F7A4D','#B4471F','#6B4FB8','#8A6A00','#2E6E78','#7A3E1D'];
const CL = {
  VE:{n:'Villa Exemple',p:'Menuiseries',v:'Lyon',c:0,code:'VE'}, MD:{n:'Maison Démo',p:'Volets roulants',v:'Bron',c:1,code:'MD'},
  RT:{n:'Résidence Test',p:'Portes de garage',v:'Villeurbanne',c:2,code:'RT'}, AF:{n:'Atelier Fictif',p:'Stores',v:'Vénissieux',c:3,code:'AF'},
  GD:{n:'Garage Démo',p:'Portail',v:'Caluire',c:4,code:'GD'}, IM:{n:'Immeuble Modèle',p:'Fenêtres PVC',v:'Lyon 3e',c:5,code:'IM'},
  BT:{n:'Bureaux Témoin',p:'Pergola',v:'Écully',c:6,code:'BT'}, AU:{n:'Autre',p:'Chantier non listé',v:'',c:-1,code:'AU'} };
const ABS = { conge:{l:'CONGÉ',a:'#EFE6D2',b:'#E4D6B8'}, maladie:{l:'ARRÊT MALADIE',a:'#F1E2E2',b:'#E7D2D2'}, intemp:{l:'INTEMPÉRIE',a:'#DCE6EE',b:'#CBD9E4'},
  repos:{l:'REPOS',a:'#E7E5DD',b:'#D8D5CA'}, absent:{l:'ABSENT',a:'#E7E5DD',b:'#D8D5CA'} };
const T = (l, bg, fg) => ({ l, bg, fg });
const REC = { res:T('RÉSERVE À TRAITER',C.errBg,C.errT), lev:T('RÉSERVE LEVÉE','#E0ECE6','#1C603D'), sans:T('SANS RÉSERVE',C.lock,C.t2), cours:T('CHANTIER EN COURS',C.yp,C.yt) };

// ---------- bulles ----------
const B0 = { isCard:false,isAbs:false,isMeet:false,isHors:false,isTasks:false, title:'',sub:'',time:'',bg:'',bd:'none',fg:C.ink,subFg:C.t2,timeFg:C.t2,stripe:'transparent',
  deco:'none',dot:C.ink,tags:[],hasTags:false,hasDocs:false,docs:'',hasChk:false,chkBg:'',chkBd:'',chkFg:C.ink,chkMark:'',op:'1',ol:'none',hasTime:true,hasNote:false,note:'',
  absA:'',absB:'',absL:'',absS:'',hasAbsS:false,absFg:C.note, mTitle:'',mTime:'',mSub:'', hT:'', kT:'', kBg:C.card, hasWhy:false, why:'' };
function chk(o, x) {
  if (!o.chk) return;
  x.hasChk = true;
  if (o.chk === 'on') { x.chkBg = C.y; x.chkBd = '2px solid '+C.ink; x.chkMark = '✓'; x.ol = '2.5px solid '+C.ink; }
  else if (o.chk === 'lock') { x.chkBg = C.lock; x.chkBd = '2px solid '+C.line2; x.chkMark = '–'; x.chkFg = C.t2; }
  else { x.chkBg = C.card; x.chkBd = '2px solid '+C.ink; x.chkMark = ''; }
}
function bub(code, cr, st, o) {
  o = o || {}; const c = CL[code]; const k = CR[cr || 'j'];
  const x = Object.assign({}, B0, { isCard:true, bg:k.f, bd:'1.5px dashed '+C.prevBd, stripe:k.s, dot:c.c >= 0 ? PAL[c.c] : C.ink });
  x.title = code === 'AU' ? 'Autre · ' + (o.note || 'Dépannage') : c.n;
  x.sub = code === 'AU' ? 'Nommé par le salarié' : c.p + ' · ' + c.v;
  x.time = o.t || (cr === 'j' || !cr ? 'Sans horaire' : '');
  let tags = [];
  if (st === 'aenv') { x.bd = '1.5px solid '+C.aeBd; x.timeFg = C.aeT; tags.push(T('À ENVOYER',C.aeBg,C.aeT)); }
  if (st === 'env') { x.bg = C.ink; x.bd = '1.5px solid '+C.ink; x.fg = C.cream; x.subFg = 'rgba(242,237,227,.82)'; x.timeFg = C.y; tags.push(T('ENVOYÉ',C.green,'#FFFFFF')); }
  if (st === 'ret') { x.bg = C.lock; x.bd = '1.5px solid '+C.line2; x.fg = C.t2; x.timeFg = C.t2; x.deco = 'line-through'; x.stripe = C.line2; tags.push(T('RETIRÉE PAR LE SALARIÉ',C.sand,C.note)); }
  if (st === 'ajt') { x.bg = C.card; x.bd = '1.5px solid '+C.ink; x.timeFg = C.ink; tags.push(T('AJOUTÉE PAR LE SALARIÉ',C.ink,C.y)); }
  if (st === 'live') { x.bg = C.liveBg; x.bd = '1.5px solid '+C.live; x.timeFg = C.liveT; tags.push(T('● EN COURS DEPUIS '+(o.since || '07:45'),C.green,'#FFFFFF')); }
  if (o.late) tags.push(T('PAS D\u2019HEURES ENVOYÉES',C.errBg,C.errT));
  if (o.rec) tags.push(REC[o.rec]);
  if (o.tags) tags = tags.concat(o.tags);
  x.tags = tags; x.hasTags = tags.length > 0;
  if (o.docs) { x.hasDocs = true; x.docs = '⧉ ' + o.docs; }
  if (o.note && code !== 'AU') { x.hasNote = true; x.note = o.note; }
  chk(o, x);
  if (o.drag) { x.op = '.45'; x.ol = '2px dashed '+C.ink; }
  if (o.hl) x.ol = '3px solid '+C.y;
  if (o.focus) x.ol = '2px solid '+C.ink;
  if (o.why) { x.hasWhy = true; x.why = o.why; }
  return x;
}
function abs(type, sub, o) { o = o || {}; const a = ABS[type]; const x = Object.assign({}, B0, { isAbs:true, absA:a.a, absB:a.b, absL:o.l || a.l, absS:sub || '', hasAbsS:!!sub }); chk(o, x); return x; }
function meet(title, time, sub) { return Object.assign({}, B0, { isMeet:true, mTitle:title, mTime:time, mSub:sub || '' }); }
function hors(t) { return Object.assign({}, B0, { isHors:true, hT:t }); }
function tasks(t, o) { o = o || {}; return Object.assign({}, B0, { isTasks:true, kT:t, kBg:o.bg || C.card }); }

// ---------- semaine de référence S-42 ----------
const DAYS = [['Lun',12,'31:45 h'],['Mar',13,'30:00 h'],['Mer',14,'38:30 h'],['Jeu',15,'4:00 h · 1 en direct'],['Ven',16,'—'],['Sam',17,'—'],['Dim',18,'—']];
function days(o) {
  o = o || {};
  return (o.list || DAYS).map((d, i) => {
    const today = o.today === undefined ? i === 3 : o.today === i;
    const clos = !!(o.clos && o.clos.includes(i));
    const x = { l:d[0], n:String(d[1]), sub:d[2], isToday:today, bg: clos ? C.lock : (today ? C.todayH : C.card), top: today ? 'inset 0 4px 0 '+C.y : 'none',
      hasClos:clos, hasChk:false, chkBg:'', chkMark:'' };
    if (o.sel) { x.hasChk = true; const on = o.selDays && o.selDays.includes(i); x.chkBg = on ? C.y : C.card; x.chkMark = on ? '✓' : ''; }
    return x;
  });
}
const PEOPLE = [
  { ini:'AT', av:'#FFC21A', name:'Alex Test', st:'À jour', ok:true, hrs:'28:15 h envoyées · +7:00 prévues', pct:'80%' },
  { ini:'BE', av:'#DDEBFA', name:'Bruno Exemple', st:'2 jours en attente', hrs:'8:00 h envoyées · +17:00 prévues', pct:'23%' },
  { ini:'CD', av:'#E0ECE6', name:'Camille Démo', chef:true, st:'À jour', ok:true, hrs:'27:30 h envoyées · +8:00 prévues', pct:'79%' },
  { ini:'DF', av:'#F1E2E2', name:'Dina Fictive', st:'À jour', ok:true, hrs:'0:00 h · arrêt maladie', pct:'0%' },
  { ini:'EM', av:'#EAD6F4', name:'Eli Martin-Lefebvre-Dubois de la Roche-Valmont', st:'1 jour en attente', hrs:'16:00 h envoyées · +2:00 prévues', pct:'46%' },
  { ini:'FE', av:'#FCE3CF', name:'Fanny Essai', st:'2 jours en attente', hrs:'8:00 h envoyées · +4:00 prévues', pct:'23%' },
  { ini:'GT', av:'#E2EBEC', name:'Gabriel Témoin', st:'À jour', ok:true, hrs:'16:00 h envoyées · +16:00 prévues', pct:'46%' },
  { ini:'HM', av:'#EFEADB', name:'Hugo Modèle', st:'À jour', ok:true, hrs:'0:00 h envoyées · +16:00 prévues', pct:'0%' } ];
function baseCells(o) {
  o = o || {};
  const s = o.sel; // 'off' par défaut en mode sélection
  const k = (st) => s ? (st === 'env' || st === 'live' || st === 'ajt' || st === 'aenv' ? 'lock' : 'off') : undefined;
  const b = (code, cr, st, oo) => bub(code, cr, st, Object.assign({ chk:k(st) }, oo || {}));
  const ab = (t, sub) => abs(t, sub, { chk: s ? 'lock' : undefined });
  return [
    [[b('VE','m','env',{t:'07:30–11:45 · 4:15'}), b('MD','a','env',{t:'13:00–17:00 · 4:00',docs:2})], [b('VE','j','env',{t:'07:30–16:30 · 8:00',rec:'res'})], [b('MD','j','env',{t:'07:30–16:00 · 8:00',rec:'sans'})],
     [b('VE','m','live',{t:'Prévu 08:00–12:00',docs:3}), b('RT','a','prev',{t:'13:30–17:00'})], [b('VE','j','prev')], [], []],
    [[b('RT','j','prev',{late:true})], [b('RT','j','prev',{late:true})], [b('RT','j','env',{t:'07:30–16:00 · 8:00'})],
     [b('AF','m','aenv',{t:'07:30–11:30 · 4:00'}), b('AF','a','prev',{t:'13:30–17:00'})], [b('AF','j','prev',{note:'Prendre l\u2019escabeau long'})], [], []],
    [[b('IM','m','env',{t:'07:00–12:00 · 5:00'}), b('GD','a','env',{t:'13:00–16:30 · 3:30'})], [b('IM','j','env',{t:'07:00–16:00 · 8:00',rec:'cours'})],
     [b('IM','j','env',{t:'07:00–13:00 · 6:00'}), b('BT','a','ajt',{t:'14:00–19:00 · 5:00'})], [b('IM','m','aenv',{t:'07:00–11:00 · 4:00'}), tasks('Tâches 1/3'), meet('Réunion sécurité','17:15','Dépôt · 4 participants')], [b('IM','j','prev')], [], []],
    [[ab('maladie','du 12 au 16')], [ab('maladie','du 12 au 16')], [ab('maladie','du 12 au 16')], [ab('maladie','du 12 au 16')], [ab('maladie','du 12 au 16')], [], []],
    [[b('MD','m','env',{t:'08:00–12:00 · 4:00'}), b('RT','a','ret',{t:'14:00–16:00 · 2:00'})], [b('MD','j','prev',{late:true})], [b('MD','j','env',{t:'07:30–16:30 · 8:00',docs:4})],
     [b('GD','s','prev',{t:'18:00–20:00'})], [ab('conge','du 16 au 23')], [], []],
    [[b('AF','j','prev',{late:true})], [b('AF','j','env',{t:'07:30–16:00 · 8:00'})], [b('AU','j','aenv',{t:'08:00–12:00 · 4:00',note:'Dépannage M. Voisin'})], [b('AF','m','prev',{t:'08:00–12:00'})], [ab('intemp','vent fort')], [], []],
    [[b('GD','j','env',{t:'07:30–16:00 · 8:00',rec:'lev'})], [b('GD','j','env',{t:'07:30–16:00 · 8:00'}), hors('+1:30 h sur Maison Démo · ajouté par le salarié')], [ab('repos','')],
     [b('VE','m','prev',{t:'08:00–12:00'}), b('VE','a','prev',{t:'13:30–17:00'})], [b('VE','j','prev')], [], []],
    [[], [], [], [b('RT','j','prev',{t:'08:00–17:00'})], [b('RT','j','prev')], [], []] ];
}
function rows(o) {
  o = o || {};
  const cells = baseCells(o);
  const n = o.n === undefined ? PEOPLE.length : o.n;
  return PEOPLE.slice(0, n).map((p, r) => {
    const x = { ini:p.ini, av:p.av, name:p.name, chef:!!p.chef, st:p.st, stC: p.ok ? C.liveT : C.errT, hrs:p.hrs, pct:p.pct, hasChk:false, chkBg:'', chkMark:'', hl:'transparent',
      cells: cells[r].map((items, d) => cell(items, d, o)) };
    if (o.sel) { x.hasChk = true; const on = o.selRows && o.selRows.includes(r); x.chkBg = on ? C.y : C.card; x.chkMark = on ? '✓' : ''; }
    if (o.empty) x.cells = x.cells.map((c, d) => cell([], d, o));
    return x;
  });
}
function cell(items, d, o) {
  o = o || {};
  const today = (o.today === undefined ? 3 : o.today) === d;
  const clos = !!(o.clos && o.clos.includes(d));
  const isAbs = items.some(i => i.isAbs);
  return { items, bg: clos ? C.lock : (today ? C.todayC : 'transparent'), empty: items.length === 0 && !o.sel && !clos, more: items.length > 0 && !isAbs && !o.sel && !clos && items.length < 3,
    closEmpty: clos && items.length === 0, hasTgt:false, tgtL:'', tgtBg:'', tgtFg:'', tgtBd:'', ring:'none' };
}
function target(row, d, kind, label) { // kind ok | copy | ko
  const c = row.cells[d]; c.hasTgt = true; c.tgtL = label;
  if (kind === 'ko') { c.tgtBg = C.errBg; c.tgtFg = C.errT; c.ring = 'inset 0 0 0 2px '+C.err; }
  else { c.tgtBg = C.ink; c.tgtFg = C.y; c.ring = 'inset 0 0 0 3px '+C.y; c.bg = C.yp; }
}

// ---------- boutons ----------
const BV = { pri:[C.y,C.ink,'1.5px solid '+C.yd], dark:[C.ink,C.cream,'1.5px solid '+C.ink], ghost:['transparent',C.ink,'1.5px solid '+C.line2],
  dan:[C.err,'#FFFFFF','1.5px solid '+C.err], dis:[C.sand,C.t3,'1.5px solid '+C.sand], danGhost:['transparent',C.errT,'1.5px solid '+C.errBd], onDark:['transparent',C.cream,'1.5px solid rgba(242,237,227,.3)'] };
function btn(v, l, o) { o = o || {}; const b = BV[v] || BV.ghost; return { l, bg:b[0], fg:b[1], bd:b[2], grow: o.grow ? '1' : '0', ml: o.right ? 'auto' : '0' }; }

// ---------- blocs ----------
const FLAGS = ['P','Lab','Fields','Seg','Chips','Checks','Toggles','Alert','Rows','Table','Stats','Bars','Cal','Days','Bub','Kv','Hist','Drop','Gauge','Btns','Steps','Qr','Msg','Composer','Search','Sep','Skel','Empty','Plans','Photos','Code','Legend','Tabs'];
function blk(type, o) { const x = {}; FLAGS.forEach(f => { x['is' + f] = f === type; }); return Object.assign(x, o); }
const B = {
  p: (t, o) => blk('P', { t, c: (o && o.c) || C.note, fs: (o && o.fs) || '14.5px', fw: (o && o.fw) || '400' }),
  lab: (t, r) => blk('Lab', { t, r: r || '', hasR: !!r }),
  f: (label, value, o) => { o = o || {}; return { label, value: value || o.ph || '', ph: !value, req: !!o.req, hasHint: !!o.hint || !!o.err, hint: o.err || o.hint || '',
    hintC: o.err ? C.errT : C.t2, hintFw: o.err ? '700' : '400', bd: o.err ? '2px solid '+C.err : (o.focus ? '2px solid '+C.ink : '1.5px solid '+C.line2),
    bg: o.dis ? C.lock : C.card, vc: value ? (o.dis ? C.t2 : C.ink) : C.t3, h: o.area ? '96px' : '44px', ai: o.area ? 'flex-start' : 'center', pt: o.area ? '12px' : '0',
    suf: o.sel ? '▾' : (o.suf || ''), hasSuf: !!(o.sel || o.suf), span: o.span ? 'span ' + o.span : 'auto', mono: o.mono ? "'JetBrains Mono',monospace" : 'inherit',
    hasCount: !!o.count, count: o.count || '' }; },
  fields: (items, cols) => blk('Fields', { items, gtc: 'repeat(' + (cols || 1) + ',minmax(0,1fr))' }),
  seg: (opts, on, o) => blk('Seg', { items: opts.map((l, i) => ({ l, bg: i === on ? C.ink : 'transparent', fg: i === on ? C.y : C.ink, fw: i === on ? '800' : '700' })), label: (o && o.label) || '', hasLabel: !!(o && o.label) }),
  chips: (list, label) => blk('Chips', { label: label || '', hasLabel: !!label, items: list.map(c => typeof c === 'string' ? { l:c, bg:C.card, fg:C.ink, bd:'1.5px solid '+C.line2 } :
    { l:c.l, bg: c.on ? C.ink : (c.dis ? C.lock : C.card), fg: c.on ? C.y : (c.dis ? C.t2 : C.ink), bd: c.on ? '1.5px solid '+C.ink : '1.5px solid '+C.line2 }) }),
  checks: (list, o) => blk('Checks', { label: (o && o.label) || '', hasLabel: !!(o && o.label), items: list.map(c => ({ l:c.l, s:c.s || '', hasS: !!c.s, bg: c.on ? C.ink : (c.dis ? C.lock : C.card),
    bd: c.dis ? '2px solid '+C.line2 : '2px solid '+C.ink, mark: c.on ? '✓' : (c.dis ? '–' : ''), fg: c.dis ? C.t2 : C.ink, r: c.r || '', hasR: !!c.r, rc: c.rc || C.t2 })) }),
  toggles: (list) => blk('Toggles', { items: list.map(c => ({ l:c.l, s:c.s || '', hasS: !!c.s, tb: c.on ? C.green : C.line2, tl: c.on ? '22px' : '2px', st: c.on ? 'Activé' : 'Désactivé', stc: c.on ? C.liveT : C.t2,
    hasNow: !!c.now, now: c.now || '' })) }),
  alert: (tone, title, text, o) => { o = o || {}; const t = { err:[C.errBg,'1.5px solid '+C.err,C.errT], warn:[C.yp,'1.5px solid '+C.aeBd,C.yt], info:[C.card,'1.5px solid '+C.line2,C.ink],
    ok:[C.liveBg,'1.5px solid '+C.live,C.liveT], lock:[C.lock,'1.5px solid '+C.line2,C.note], dark:[C.ink,'1.5px solid '+C.ink,C.cream] }[tone];
    return blk('Alert', { bg:t[0], bd:t[1], fg:t[2], title: title || '', hasTitle: !!title, t: text || '', hasT: !!text, hasBtn: !!o.btn, btn: o.btn || '', hasBtn2: !!o.btn2, btn2: o.btn2 || '' }); },
  rows: (items, o) => { o = o || {}; return blk('Rows', { title: o.title || '', hasTitle: !!o.title, items: items.map((r, i) => ({ t:r.t, s:r.s || '', hasS: !!r.s, r:r.r || '', hasR: !!r.r, rFg: r.rFg || C.ink,
    rMono: r.rMono === false ? 'inherit' : "'JetBrains Mono',monospace", badge: r.badge || T('','',''), hasBadge: !!r.badge, btn: r.btn || btn('ghost',''), hasBtn: !!r.btn, btn2: r.btn2 || btn('ghost',''), hasBtn2: !!r.btn2,
    ini: r.ini || '', hasIni: !!r.ini, avBg: r.avBg || C.sand, dot: r.dot || '', hasDot: !!r.dot, chev: !!r.chev, deco: r.strike ? 'line-through' : 'none', tc: r.dim ? C.t2 : C.ink,
    bg: r.on ? C.yp : 'transparent', bt: i === 0 ? 'none' : '1px solid '+C.soft, hasChk: r.chk !== undefined, chkBg: r.chk === true ? C.ink : (r.chk === 'lock' ? C.lock : C.card), chkMark: r.chk === true ? '✓' : (r.chk === 'lock' ? '–' : ''),
    chkBd: r.chk === 'lock' ? '2px solid '+C.line2 : '2px solid '+C.ink, fw: r.fw || '800', hasWhy: !!r.why, why: r.why || '', grab: !!r.grab })) }); },
  table: (cols, rws, o) => { o = o || {}; return blk('Table', { gtc: cols.map(c => c[1] || '1fr').join(' '), head: cols.map(c => ({ l:c[0] })), title: o.title || '', hasTitle: !!o.title,
    rows: rws.map(r => { const cells = (r.cells || r).map(v => typeof v === 'object' && v !== null ? { v:v.v || '', fw:v.b ? '800' : '500', c:v.c || C.ink, mono: v.mono ? "'JetBrains Mono',monospace" : 'inherit',
      tag: v.tag || T('','',''), hasTag: !!v.tag, s: v.s || '', hasS: !!v.s, deco: v.strike ? 'line-through' : 'none' } : { v:String(v), fw:'500', c:C.ink, mono:'inherit', tag:T('','',''), hasTag:false, s:'', hasS:false, deco:'none' });
      return { cells, bg: r.bg || 'transparent', bl: r.bl || 'none', fw: r.sum ? '900' : '500' }; }) }); },
  stats: (tiles, cols) => blk('Stats', { gtc: 'repeat(' + (cols || tiles.length) + ',minmax(0,1fr))', items: tiles.map(t => ({ k:t.k, v:t.v, u:t.u || '', s:t.s || '', hasS: !!t.s,
    bg: t.dark ? C.ink2 : (t.tone === 'err' ? C.errBg : (t.tone === 'ok' ? C.liveBg : (t.tone === 'warn' ? C.yp : C.card))),
    fg: t.dark ? C.cream : (t.tone === 'err' ? C.errT : (t.tone === 'ok' ? C.liveT : C.ink)), kc: t.dark ? 'rgba(242,237,227,.75)' : (t.tone === 'err' ? C.errT : (t.tone === 'ok' ? C.liveT : C.t2)),
    bd: t.dark ? '1px solid '+C.ink2 : (t.tone === 'err' ? '1.5px solid '+C.err : (t.tone === 'ok' ? '1.5px solid '+C.live : (t.tone === 'warn' ? '1.5px solid '+C.aeBd : '1px solid '+C.line))), fs: t.fs || '36px' })) }),
  bars: (items, o) => { o = o || {}; const mx = Math.max.apply(null, items.map(i => i.v || 0)) || 1;
    return blk('Bars', { title: o.title || '', hasTitle: !!o.title, h: o.h || '140px', dark: !!o.dark, bg: o.dark ? C.ink2 : C.card, fg: o.dark ? C.cream : C.ink, items: items.map(i => ({ l:i.l, vl:i.vl || '', h: Math.round((i.v || 0) / mx * 100) + '%',
      bg: i.bg || (o.dark ? C.y : C.ink), lc: i.on ? (o.dark ? C.y : C.ink) : (o.dark ? 'rgba(242,237,227,.75)' : C.t2), fw: i.on ? '800' : '600', ol: i.on ? '2px solid '+(o.dark ? C.cream : C.ink) : 'none' })) }); },
  cal: (title, firstDow, nDays, st, o) => { o = o || {}; const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push({ n:'', bg:'transparent', fg:C.t2, bd:'none', fw:'500', deco:'none' });
    for (let d = 1; d <= nDays; d++) { const s = st[d] || ''; cells.push({ n:String(d),
      bg: s === 'in' ? C.yp : (s === 'end' ? C.ink : (s === 'abs' ? '#EFE6D2' : (s === 'clos' ? C.lock : 'transparent'))), fg: s === 'end' ? C.y : (s === 'dis' || s === 'clos' ? C.t3 : C.ink),
      bd: s === 'today' ? '2px solid '+C.ink : 'none', fw: s === 'end' || s === 'in' || s === 'today' ? '800' : '500', deco: s === 'dis' ? 'line-through' : 'none' }); }
    return blk('Cal', { title, cells, dows: ['L','M','M','J','V','S','D'], note: o.note || '', hasNote: !!o.note }); },
  days: (items, o) => { o = o || {}; return blk('Days', { title: o.title || '', hasTitle: !!o.title, items: items.map(d => ({ l:d[0], n:d[1],
    bg: d[2] === 'on' ? C.ink : (d[2] === 'no' ? C.lock : C.card), fg: d[2] === 'on' ? C.y : (d[2] === 'no' ? C.t3 : C.ink), bd: d[2] === 'no' ? '1.5px dashed '+C.line2 : (d[2] === 'on' ? '1.5px solid '+C.ink : '1.5px solid '+C.line2),
    mark: d[2] === 'on' ? '✓' : (d[2] === 'no' ? '✕' : ''), why: d[3] || '', hasWhy: !!d[3] })) }); },
  bub: (b, o) => blk('Bub', { b, label: (o && o.label) || '', hasLabel: !!(o && o.label) }),
  kv: (items, o) => blk('Kv', { title: (o && o.title) || '', hasTitle: !!(o && o.title), items: items.map(i => ({ k:i[0], v:i[1], mono: i[2] ? "'JetBrains Mono',monospace" : 'inherit' })) }),
  hist: (items) => blk('Hist', { items: items.map(i => ({ when:i[0], who:i[1], what:i[2], d:i[3] || '', hasD: !!i[3] })) }),
  drop: (t, s) => blk('Drop', { t, s: s || '' }),
  gauge: (l, pct, txt, tone) => blk('Gauge', { l, w: pct + '%', txt, bg: tone === 'err' ? C.err : (tone === 'warn' ? C.aeBd : C.green), tc: tone === 'err' ? C.errT : (tone === 'warn' ? C.aeT : C.liveT) }),
  btns: (list, o) => blk('Btns', { items: list, jc: (o && o.jc) || 'flex-start' }),
  steps: (list) => blk('Steps', { items: list.map((s, i) => ({ n: s.done ? '✓' : String(i + 1), t:s.t, s:s.s || '', hasS: !!s.s, bg: s.done ? C.green : C.ink, fg: s.done ? '#FFFFFF' : C.y, deco: s.done ? 'line-through' : 'none', btn: s.btn || '', hasBtn: !!s.btn })) }),
  qr: (o) => blk('Qr', { t: o.t || '', code: o.code || '', hasCode: !!o.code, s: o.s || '' }),
  msg: (me, t, o) => { o = o || {}; return blk('Msg', { me, bot: !me, t, jc: me ? 'flex-end' : 'flex-start', bg: me ? C.ink : C.card, fg: me ? C.cream : C.ink, bd: me ? 'none' : '1px solid '+C.line,
    links: o.links || [], hasLinks: !!(o.links && o.links.length), card: o.card || {}, hasCard: !!o.card, done: o.done || '', hasDone: !!o.done, att: o.att || '', hasAtt: !!o.att }); },
  composer: (o) => { o = o || {}; return blk('Composer', { ph: o.v || 'Écrivez votre demande…', vc: o.v ? C.ink : C.t3, sug: o.sug || [], hasSug: !!(o.sug && o.sug.length), count: o.count || '0/500', att: o.att || '', hasAtt: !!o.att, rec: !!o.rec }); },
  search: (ph, v) => blk('Search', { t: v || ph, c: v ? C.ink : C.t3, bd: v ? '2px solid '+C.ink : '1.5px solid '+C.line2 }),
  sep: () => blk('Sep', {}),
  skel: (hs) => blk('Skel', { items: (hs || [56,56,56]).map(h => ({ h: h + 'px' })) }),
  empty: (t, s, b) => blk('Empty', { t, s: s || '', hasS: !!s, btn: b || '', hasBtn: !!b }),
  plans: (items) => blk('Plans', { items: items.map(p => ({ name:p.name, range:p.range, price:p.price, tag:p.tag || '', hasTag: !!p.tag, bg: p.dis ? C.lock : (p.on ? C.ink : C.card), fg: p.dis ? C.t2 : (p.on ? C.cream : C.ink),
    bd: p.on ? '2px solid '+C.ink : '1.5px solid '+C.line2, tagBg: p.dis ? C.sand : C.y, tagFg: p.dis ? C.note : C.ink, b: btn(p.dis ? 'dis' : (p.on ? 'pri' : 'dark'), p.dis ? 'Trop petit' : 'Choisir', { grow:true }) })) }),
  photos: (items, cols) => blk('Photos', { gtc: 'repeat(' + (cols || 4) + ',minmax(0,1fr))', items: items.map(p => ({ l:p[0], s:p[1] || '', tag:p[2] || '', hasTag: !!p[2], ol: p[3] ? '3px solid '+C.y : 'none', file: !!p[4] })) }),
  code: (digits, s) => blk('Code', { items: digits.split('').map(d => ({ d })), s: s || '' }),
  legend: (o) => blk('Legend', { items: LEGEND, cols: (o && o.cols) || 'repeat(2,minmax(0,1fr))' }),
  tabs: (list, on) => blk('Tabs', { items: list.map((l, i) => ({ l, bd: i === on ? '3px solid '+C.ink : '3px solid transparent', fw: i === on ? '900' : '700', c: i === on ? C.ink : C.t2 })) }),
};
const LEGEND = [
  { l:'Matin (avant 12 h)', bg:CR.m.f, bd:'none', bl:'5px solid '+CR.m.s }, { l:'Après-midi (12 h – 18 h)', bg:CR.a.f, bd:'none', bl:'5px solid '+CR.a.s },
  { l:'Soir (après 18 h)', bg:CR.s.f, bd:'none', bl:'5px solid '+CR.s.s }, { l:'Journée entière ou sans horaire', bg:'#FFFFFF', bd:'1px solid '+C.line2, bl:'5px solid '+C.ink },
  { l:'Prévue (pointillés)', bg:C.card, bd:'1.5px dashed '+C.prevBd, bl:'1.5px dashed '+C.prevBd }, { l:'Saisie, à envoyer (ne compte pas)', bg:C.aeBg, bd:'1.5px solid '+C.aeBd, bl:'1.5px solid '+C.aeBd },
  { l:'Envoyée (compte)', bg:C.ink, bd:'none', bl:'none' }, { l:'En direct (pointage en cours)', bg:C.liveBg, bd:'1.5px solid '+C.live, bl:'1.5px solid '+C.live },
  { l:'Ajoutée par le salarié', bg:C.card, bd:'1.5px solid '+C.ink, bl:'1.5px solid '+C.ink }, { l:'Retirée par le salarié (barrée)', bg:C.lock, bd:'1.5px solid '+C.line2, bl:'1.5px solid '+C.line2 },
  { l:'Réunion (hors heures)', bg:C.meet, bd:'1.5px solid '+C.meetBd, bl:'1.5px solid '+C.meetBd }, { l:'Absence (rayée)', bg:'repeating-linear-gradient(135deg,#EFE6D2 0 6px,#E4D6B8 6px 12px)', bd:'none', bl:'none' },
  { l:'Mois clôturé (CLOS)', bg:C.lock, bd:'1.5px solid '+C.line2, bl:'1.5px solid '+C.line2 }, { l:'Réserve à traiter', bg:C.errBg, bd:'1.5px solid '+C.err, bl:'1.5px solid '+C.err } ];

// ---------- calques (fenêtres, panneaux, menus, feuilles) ----------
const O0 = { isBox:false,isScrim:false,isGuide:false,isGhost:false, l:'auto',t:'auto',r:'auto',b:'auto',w:'auto',h:'auto',mh:'none',tf:'none',rad:'0',bg:C.card,sh:'0 30px 80px rgba(21,18,15,.28)',z:'50',
  topLine:false, grab:false, hasHead:false, kicker:'', hasKicker:false, kc:C.lbl, title:'', hasTitle:false, titleFs:'24px', sub:'', hasSub:false, close:false, back:false, cols:[], gtc:'minmax(0,1fr)',
  hasFoot:false, foot:[], hasFootNote:false, footNote:'', pad:'20px 24px', bodyGap:'14px', hasTabs:false, tabs:[], bd:'1px solid '+C.line,
  gl:'0',gt:'0',gw:'0',gh:'0',grad:'12px', tipL:'0',tipT:'0',tipW:'320px', tipStep:'', tipT2:'', tipBtns:[], ghT:'', ghS:'', ghMark:'', hasGhMark:false, scrimBg:'rgba(21,18,15,.5)' };
const GEO = {
  panel: { l:'auto', r:'0', t:'0', b:'0', w:'480px', rad:'0', topLine:true, z:'50' },
  wide: { l:'auto', r:'0', t:'0', b:'0', w:'760px', rad:'0', topLine:true, z:'50' },
  dialog: { l:'50%', t:'50%', tf:'translate(-50%,-50%)', w:'520px', rad:'20px', topLine:true, z:'50' },
  pop: { w:'320px', rad:'18px', sh:'0 20px 50px rgba(21,18,15,.2)', pad:'14px 16px', bodyGap:'10px', z:'45' },
  drawer: { l:'0', t:'0', b:'0', w:'380px', rad:'0', z:'45', sh:'20px 0 50px rgba(21,18,15,.16)' },
  page: { l:'0', t:'60px', r:'0', b:'0', rad:'0', bg:C.cream, sh:'none', bd:'none', pad:'24px 32px', z:'20' },
  assist: { l:'auto', r:'0', t:'0', b:'0', w:'440px', rad:'0', topLine:true, z:'70', bg:C.cream },
  sheet: { l:'0', r:'0', b:'0', mh:'calc(100% - 48px)', rad:'28px 28px 0 0', topLine:true, grab:true, pad:'14px 18px', z:'50' },
  mfull: { l:'0', r:'0', t:'0', b:'0', rad:'0', bg:C.cream, sh:'none', bd:'none', pad:'14px 16px', z:'50' },
  malert: { l:'16px', r:'16px', t:'50%', tf:'translateY(-50%)', rad:'20px', topLine:true, pad:'18px 18px', z:'50' },
  massist: { l:'0', r:'0', t:'0', b:'0', rad:'0', bg:C.cream, sh:'none', bd:'none', pad:'14px 16px', z:'70', topLine:true } };
function ov(kind, o) {
  o = o || {};
  const x = Object.assign({}, O0, GEO[kind] || {}, { isBox:true });
  ['l','t','r','b','w','h','mh','tf','rad','bg','z','pad','bodyGap','titleFs'].forEach(k => { if (o[k] !== undefined) x[k] = o[k]; });
  if (o.kicker) { x.kicker = o.kicker; x.hasKicker = true; }
  if (o.title) { x.title = o.title; x.hasTitle = true; }
  if (o.sub) { x.sub = o.sub; x.hasSub = true; }
  x.close = o.close !== false && kind !== 'pop' && kind !== 'page';
  x.back = !!o.back; if (x.back) x.close = !!o.closeToo;
  x.hasHead = x.hasTitle || x.hasKicker;
  if (o.tabs) { x.hasTabs = true; x.tabs = o.tabs.list.map((l, i) => ({ l, bd: i === o.tabs.on ? '3px solid '+C.ink : '3px solid transparent', fw: i === o.tabs.on ? '900' : '700', c: i === o.tabs.on ? C.ink : C.t2 })); }
  const cols = o.cols || [o.body || []];
  x.cols = cols.map(bl => ({ blocks: bl }));
  x.gtc = o.gtc || cols.map(() => 'minmax(0,1fr)').join(' ');
  if (o.foot) { x.hasFoot = true; x.foot = o.foot; }
  if (o.footNote) { x.hasFootNote = true; x.footNote = o.footNote; }
  if (kind === 'pop') { x.l = o.x || 'auto'; x.t = o.y || 'auto'; x.r = o.rx || 'auto'; x.w = o.w || '320px'; }
  return x;
}
function scrim(o) { return Object.assign({}, O0, { isScrim:true, scrimBg: (o && o.bg) || 'rgba(21,18,15,.5)', z: (o && o.z) || '49' }); }
function guide(ring, tip) { return Object.assign({}, O0, { isGuide:true, z:'60', gl:ring[0]+'px', gt:ring[1]+'px', gw:ring[2]+'px', gh:ring[3]+'px', grad:(ring[4] || 999)+'px',
  tipL:tip.x+'px', tipT:tip.y+'px', tipW:(tip.w || 340)+'px', tipStep:tip.step, tipT2:tip.t, tipBtns:tip.btns || [btn('ghost','Quitter le guide'), btn('pri','Suivant')] }); }
function ghost(x, y, t, s, mark) { return Object.assign({}, O0, { isGhost:true, z:'55', gl:x+'px', gt:y+'px', ghT:t, ghS:s, ghMark:mark || '', hasGhMark:!!mark }); }

// ---------- écrans ----------
const S0 = { isD:false, isM:false, isNew:false, note:'', hasNote:false, fw:'1440px', fh:'900px', ovs:[], toasts:[], hasToasts:false,
  hdr:true, tb:true, cockOpen:true, cockClosed:false, focus:false, isGrid:true, isCenter:false, ctr:{}, tabPl:true, tabSt:false, trial:true, trialT:'Essai · 12 jours', support:false, supportT:'',
  kick:'SEMAINE ACTUELLE', wk:'S-42', range:'12 – 18 octobre 2026', cur:true, todayOp:'.45', clientsBg:C.card, selBg:C.card, plusBg:C.card, acctOpen:false,
  days:[], rows:[], legendOpen:false, legendClosed:true, hasSel:false, selCount:'', selDel:{}, cockErr:false, kpi:{}, relErr:false, gridDim:false,
  hasAstFab:false,
  mDays:[], mCards:[], mCounters:[], mCenter:false, mCtr:{}, mSel:false, mSelCount:'', mSelDel:{}, mBody:true, mDayTitle:'', mGtc:'minmax(0,1fr)', mRad:'48px', mIn:'40px', mPadTop:'42px', mTablet:false };
const KPI = { sent:'142:15', planned:'+ 61:00 h prévues à venir', rel:'5', relS:'Bruno ×2, Fanny ×2, Eli', live:'1', liveS:'Alex · Villa Exemple depuis 07:45', abs:'1', absS:'Dina · arrêt maladie', pcs:'14', pcsS:'sur 5 chantiers',
  bars:[['L',31.75],['M',30],['M',38.5],['J',4],['V',0],['S',0],['D',0]] };
function kpi(o) { const k = Object.assign({}, KPI, o || {}); const mx = 40;
  k.barsN = k.bars.map((b, i) => ({ l:b[0], v: b[1] ? String(Math.floor(b[1])) + 'h' : '', h: Math.max(4, Math.round(b[1] / mx * 64)) + 'px', bg: i === 3 ? C.y : (b[1] ? '#F2EDE3' : '#3A3129'), ol: i === 3 ? '2px solid #F2EDE3' : 'none', lc: i === 3 ? C.y : 'rgba(242,237,227,.75)' }));
  return k; }
function D(o) {
  const s = Object.assign({}, S0, { isD:true, kpi: kpi(o.kpi) }, o);
  if (o.note) s.hasNote = true;
  s.hasToasts = (s.toasts || []).length > 0;
  if (s.chrome === 'closed') { s.cockOpen = false; s.cockClosed = true; }
  if (s.chrome === 'focus') { s.hdr = false; s.tb = false; s.cockOpen = false; s.cockClosed = false; s.focus = true; }
  if (s.chrome === 'bare') { s.tb = false; s.cockOpen = false; s.cockClosed = false; }
  if (s.chrome === 'none') { s.hdr = false; s.tb = false; s.cockOpen = false; s.cockClosed = false; }
  if (s.center) { s.isGrid = false; s.isCenter = true; s.ctr = Object.assign({ title:'', sub:'', hasSub:false, spin:false, btn:'', hasBtn:false, tone:C.ink }, s.center); s.ctr.hasSub = !!s.ctr.sub; s.ctr.hasBtn = !!s.ctr.btn; }
  if (s.isGrid && !o.rows) { s.rows = rows(o.rowOpts); }
  if (s.isGrid && !o.days) { s.days = days(o.dayOpts); }
  if (!s.cur) { s.kick = 'AUTRE SEMAINE'; s.todayOp = '1'; }
  if (s.legend) { s.legendOpen = true; s.legendClosed = false; }
  s.legendItems = LEGEND;
  if (s.sel) { s.hasSel = true; s.selCount = s.sel.count; s.selDel = s.sel.del; s.selBg = C.yp; }
  if (s.tab === 'stats') { s.tabPl = false; s.tabSt = true; }
  s.hasAstFab = s.focus;
  return s;
}
const MDAYS = [['L','12'],['M','13'],['M','14'],['J','15'],['V','16'],['S','17'],['D','18']];
function mdays(on, o) { o = o || {}; return MDAYS.map((d, i) => ({ l:d[0], n:d[1], bg: i === on ? C.y : C.ink3, fg: i === on ? C.ink : C.cream, bd: i === 3 && on !== 3 ? '2px solid '+C.y : '2px solid transparent',
  dot: (o.dots && o.dots[i]) || 'transparent' })); }
function mcards(o) {
  o = o || {};
  const d = o.day === undefined ? 3 : o.day;
  const cells = baseCells({ sel: o.sel });
  return PEOPLE.slice(0, o.n === undefined ? PEOPLE.length : o.n).map((p, r) => {
    const items = cells[r][d];
    const isAbs = items.some(i => i.isAbs);
    const live = items.some(i => i.isCard && i.tags.some(t => t.l.indexOf('EN COURS') >= 0));
    const sent = items.length && items.filter(i => i.isCard).every(i => i.tags.some(t => t.l === 'ENVOYÉ'));
    let st = '', stBg = 'transparent', stFg = C.ink;
    if (isAbs) { st = items[0].absL; stBg = C.sand; stFg = C.note; }
    else if (live) { st = 'EN COURS'; stBg = C.green; stFg = '#FFFFFF'; }
    else if (sent) { st = 'ENVOYÉ'; stBg = C.ink; stFg = C.y; }
    return { ini:p.ini, av:p.av, name:p.name, chef:!!p.chef, wait: p.ok ? '' : p.st, hasWait: !p.ok, st, hasSt: !!st, stBg, stFg, items: isAbs ? [] : items, isAbsDay: isAbs,
      absL: isAbs ? items[0].absL : '', absS: isAbs ? items[0].absS : '', absA: isAbs ? items[0].absA : '', absB: isAbs ? items[0].absB : '',
      add: !isAbs && !o.sel, noAdd: isAbs && !o.sel, hasChk: !!o.sel, chkBg: o.selRows && o.selRows.includes(r) ? C.y : C.card, chkMark: o.selRows && o.selRows.includes(r) ? '✓' : '' };
  });
}
function M(o) {
  const s = Object.assign({}, S0, { isM:true, fw:'390px', fh:'844px', hdr:true }, o);
  if (o.note) s.hasNote = true;
  s.hasToasts = (s.toasts || []).length > 0;
  if (!o.mDays) s.mDays = mdays(o.day === undefined ? 3 : o.day, o.dayOpts);
  if (!o.mCards && !o.mCenter) s.mCards = mcards(o.cardOpts || { day: o.day });
  if (!o.mCounters) s.mCounters = [{ v:'5 j', l:'à relancer', bg:C.errBg, fg:C.errT, bd:'1.5px solid '+C.err }, { v:'1', l:'en direct', bg:C.liveBg, fg:C.liveT, bd:'1.5px solid '+C.live }, { v:'1', l:'absent', bg:C.card, fg:C.ink, bd:'1px solid '+C.line }];
  if (o.mCenter) { s.mBody = false; s.mCtr = Object.assign({ title:'', sub:'', hasSub:false, btn:'', hasBtn:false, spin:false, skel:false }, o.mCenter); s.mCtr.hasSub = !!s.mCtr.sub; s.mCtr.hasBtn = !!s.mCtr.btn; s.mCenter = true; }
  if (o.mSel) { s.mSel = true; s.mSelCount = o.mSel.count; s.mSelDel = o.mSel.del; }
  const dn = ['Lundi 12','Mardi 13','Mercredi 14','Jeudi 15','Vendredi 16','Samedi 17','Dimanche 18'];
  s.mDayTitle = o.mDayTitle || ((o.day === undefined ? 3 : o.day) === 3 ? "Aujourd'hui · Jeudi 15 octobre" : dn[o.day] + ' octobre');
  if (o.tablet) { s.mTablet = true; s.fw = '834px'; s.fh = '1112px'; s.mGtc = 'repeat(2,minmax(0,1fr))'; s.mRad = '36px'; s.mIn = '28px'; s.mPadTop = '28px'; }
  return s;
}
function toast(t, o) { o = o || {}; return { t, sub: o.sub || '', hasSub: !!o.sub, act: o.act || '', hasAct: !!o.act, dot: o.tone === 'err' ? '#FF6B6B' : (o.tone === 'info' ? C.y : C.live), x: o.x || '50%' }; }

// menus réutilisés
const MENU_PLUS = (x, y) => ov('pop', { x, y, w:'300px', body:[ B.lab('SUIVI'), B.rows([{ t:'Coût chantiers', chev:true }, { t:'Versions du planning', chev:true }, { t:'Interventions supprimées ou décalées', chev:true }]),
  B.lab('ÉQUIPE'), B.rows([{ t:'Formations', r:'2 à voir', rMono:false, rFg:C.t2, chev:true }, { t:'Envoyer par e-mail', chev:true }]) ] });
const MENU_ACCT = (x, y) => ov('pop', { x, y, w:'320px', body:[ B.rows([{ t:'Entreprise Test', s:'SIRET 000 000 000 00000', ini:'ET', avBg:C.y }, { t:'Sam Patron', s:'sam@entreprise-test.fr · Bureau · accès complet', ini:'SP' }]),
  B.rows([{ t:'Réglages de l\u2019entreprise', chev:true }, { t:'Déconnexion', chev:false }]) ] });
const MNAV = ['Salariés','Chantiers','Demandes de congé','Formations','Réserves de chantier','Borne','Coût chantiers','Statistiques','Exporter','Envoyer par e-mail','Sélectionner des interventions','Réglages de l\u2019entreprise','Versions du planning','Interventions supprimées ou décalées','Légende'];

window.BX = window.BX || {};
Object.assign(window.BX, { C, CR, PAL, CL, ABS, REC, T, bub, abs, meet, hors, tasks, days, rows, cell, target, baseCells, PEOPLE, btn, B, ov, scrim, guide, ghost, D, M, mdays, mcards, toast, MENU_PLUS, MENU_ACCT, MNAV, LEGEND, kpi });
})();
