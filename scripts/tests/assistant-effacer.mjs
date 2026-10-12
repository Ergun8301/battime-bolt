// Lancer : node scripts/tests/assistant-effacer.mjs out docs/captures-ia-supprimer (après npm run build).
// Lot 8, sur la VRAIE page planning (base simulée, avec état) : « Efface le planning de la
// semaine prochaine » → 27 cases effacées d'un coup, la carte affiche le nombre et un
// « Annuler » bien visible ; Annuler remet les 27 cases À L'IDENTIQUE. Les cases avec des
// heures envoyées et le mois clôturé ne sont jamais touchés.
// Lot 1 (heures sûres) : AVANT tout effacement, la carte de confirmation dit ce qui part
// (27 cases, les jours) et ce qui reste (3 cases avec des heures) ; rien n'est écrit avant
// le clic « Effacer ».
// Lot 3 (traces) : l'en-tête `x-bemexo-origine: assistant` part sur l'action et son
// « Annuler », jamais aux chargements ni vers les fonctions ; et JAMAIS tant que la
// table `traces` n'existe pas (migration pas appliquée : requêtes identiques à avant).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT='4198'] = process.argv; fs.mkdirSync(SH,{recursive:true});
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.json':'application/json','.webmanifest':'application/json'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);for(const c of [p,p+'.html',path.join(p,'index.html')]){const f=path.join(OUT,c);if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});return fs.createReadStream(f).pipe(r);}}r.writeHead(404);r.end();});
await new Promise(r=>srv.listen(Number(PORT),r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const CO='c0000000-0000-0000-0000-000000000001';
const iso=(d)=>d.toISOString().slice(0,10);
const t0=new Date(); t0.setUTCHours(12,0,0,0);
const mon=new Date(t0); mon.setUTCDate(t0.getUTCDate()+((8-t0.getUTCDay())%7||7)); // lundi prochain
const days=[0,1,2,3,4].map(i=>{const d=new Date(mon); d.setUTCDate(mon.getUTCDate()+i); return iso(d);});
const W=[{id:'w1',company_id:CO,client_name:'Villa Dupont',city:'Lyon',is_active:true}];
const workers=['u1','u2','u3','u4','u5','u6'];
const users=[{id:'u-admin',company_id:CO,first_name:'Paul',last_name:'Martin',role:'admin',email:'paul@exemple.fr',is_active:true,created_at:'2026-01-01'},
  ...workers.map((id,i)=>({id,company_id:CO,first_name:['Kevin','Sofiane','Karim','Luc','Marc','Enzo'][i],last_name:'X',role:'worker',email:`${id}@x.fr`,is_active:true,created_at:'2026-01-01'}))];
// 6 salariés × 5 jours = 30 cases ; 3 portent des heures (1 envoyée, 2 brouillons) → 27 effaçables.
const planning=[]; let n=0;
for(const u of workers) for(const d of days) planning.push({id:`p${String(++n).padStart(2,'0')}`,company_id:CO,user_id:u,worksite_id:'w1',work_date:d,absence_type:null,estimated_start:'08:00:00',estimated_end:'16:30:00',notes:`note ${n}`,created_by:'u-admin'});
const snapshot=JSON.stringify(planning);
const D={ users, companies:[{id:CO,name:'Pizzeria Exemple',ai_enabled:true,kiosk_enabled:false,position_tracking_enabled:false,subscription_status:'active',trial_ends_at:'2030-01-01',weekly_hours:35}],
  worksites:W, planning,
  time_entries:[{id:'t1',planning_id:'p01',user_id:'u1',status:'sent'},{id:'t2',planning_id:'p07',user_id:'u2',status:'draft'},{id:'t3',planning_id:'p13',user_id:'u3',status:'validated'}],
  active_sessions:[], month_closures:[], leave_requests:[], invitations:[], documents:[], certifications:[], push_subscriptions:[], assistant_journal:[] };
const REP={answer:'',links:[],remaining:40,
  action:{draft:{type:'effacer_planning',user_id:null,salarie_texte:'',du:days[0],au:days[4]},problems:[],summary:`Toute l’équipe · du ${days[0]} au ${days[4]}`,question:null},
  options:{salaries:workers.map(id=>({id,nom:id})),chantiers:[{id:'w1',nom:'Villa Dupont',ville:'Lyon'}]}};
const ctx=await b.newContext({viewport:{width:1280,height:900},locale:'fr-FR',timezoneId:'Europe/Paris'});
const now=Math.floor(Date.now()/1000); const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u-admin',role:'authenticated',exp:now+36000,aal:'aal1'})}.sig`;
const session={access_token:jwt,refresh_token:'r',expires_at:now+36000,expires_in:36000,token_type:'bearer',user:{id:'u-admin',email:'paul@exemple.fr',aud:'authenticated',role:'authenticated'}};
await ctx.addInitScript(([k,v])=>{ localStorage.setItem(k,v); },['sb-sdperbcquvneohotjono-auth-token',JSON.stringify(session)]);
// Filtres PostgREST utiles au test : eq, neq, in, gte, lte, is.null, not.is.null
const match=(x,k,v)=>{ if(!(k in x)) return true; const s=x[k]==null?null:String(x[k]);
  if(v.startsWith('eq.')) return s===v.slice(3); if(v.startsWith('neq.')) return s!==v.slice(4);
  if(v.startsWith('in.(')) return v.slice(4,-1).split(',').map(z=>z.replace(/^"|"$/g,'')).includes(s);
  if(v.startsWith('gte.')) return s>=v.slice(4); if(v.startsWith('lte.')) return s<=v.slice(4);
  if(v==='is.null') return s===null; if(v==='not.is.null') return s!==null; return true; };
const SKIP=new Set(['select','limit','order','on_conflict','columns','offset']);
const filt=(rows,sp)=>rows.filter(x=>[...sp].every(([k,v])=>SKIP.has(k)||match(x,k,v)));
const log=[];
// Lot 3 : chaque requête, avec son en-tête d'origine et le moment (chargement, action, annuler).
let phase='load', TRACES='oui'; const reqs=[];
await ctx.route('**/*.supabase.co/**', async (r)=>{
  const u=new URL(r.request().url()); const m=r.request().method();
  reqs.push({phase,m,path:u.pathname,origin:r.request().headers()['x-bemexo-origine']||null});
  if(u.pathname==='/rest/v1/traces'&&TRACES!=='oui') return r.fulfill({status:404,json:{code:'PGRST205',message:"Could not find the table 'public.traces' in the schema cache",details:null,hint:null}});
  if(u.pathname.startsWith('/auth/v1/user')) return r.fulfill({json:session.user});
  if(u.pathname.startsWith('/auth/v1/')) return r.fulfill({json:{}});
  if(u.pathname.startsWith('/functions/v1/assistant')) return r.fulfill({json:REP});
  if(u.pathname.startsWith('/functions/v1/')) return r.fulfill({json:{}});
  if(u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({json:[]});
  const t=u.pathname.replace('/rest/v1/',''); D[t]=D[t]||[];
  if(m==='DELETE'){ const gone=filt(D[t],u.searchParams); D[t]=D[t].filter(x=>!gone.includes(x)); log.push(`DELETE ${t} ${gone.length}`); return r.fulfill({json:gone.map(x=>({id:x.id}))}); }
  if(m==='POST'){ const body=JSON.parse(r.request().postData()||'[]'); const arr=Array.isArray(body)?body:[body];
    for(const row of arr){ const i=D[t].findIndex(x=>x.id===row.id); if(i>=0) D[t][i]=row; else D[t].push(row); }
    log.push(`POST ${t} ${arr.length}`); return r.fulfill({status:201,json:arr}); }
  if(m!=='GET'&&m!=='HEAD'){ log.push(`${m} ${t}`); return r.fulfill({json:[]}); }
  const rows=filt(D[t],u.searchParams);
  if((r.request().headers()['accept']||'').includes('vnd.pgrst.object')) return rows.length? r.fulfill({json:rows[0]}) : r.fulfill({status:406,json:{code:'PGRST116',message:'none'}});
  return r.fulfill({json:rows,headers:{'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
});
let ok=0, ko=0; const check=(c,m)=>{ if(c){ok++;console.log('✅',m);} else {ko++;console.log('❌',m);} };
const p=await ctx.newPage(); await p.goto(`http://localhost:${PORT}/admin`); await p.waitForTimeout(2500);
phase='action';
await p.click('[data-testid="bar-assistant"]'); await p.waitForTimeout(400);
await p.fill('.as-bar textarea','Efface le planning de la semaine prochaine');
await p.click('button[aria-label="Envoyer"]');
// Lot 1 : la carte de confirmation d'abord — lue par le même code que l'effacement, rien d'écrit.
await p.waitForSelector('[data-testid=removal-notice]', { timeout: 10000 }).catch(()=>{});
await p.waitForFunction(() => /27 cases retirées/.test(document.querySelector('[data-testid=removal-notice]')?.textContent || ''), null, { timeout: 8000 }).catch(()=>{});
const notice=await p.locator('[data-testid=removal-notice]').innerText().catch(()=> '');
check(/27 cases retirées/.test(notice), `carte de confirmation : le nombre AVANT d’effacer (${(/\d+ cases retirées[^.]*/.exec(notice) ?? [''])[0]})`);
check(/3 cases gardées/.test(notice) && /heures déjà envoyées/.test(notice), 'carte : les 3 cases avec des heures restent, et c’est dit avant');
check(/Rien n’est fait avant « Effacer »/.test(notice), 'carte : rien n’est fait avant le clic');
check(D.planning.length===30 && !log.some(x=>x.startsWith('DELETE')), `base intacte tant qu’on n’a pas confirmé (${D.planning.length} cases, ${log.filter(x=>x.startsWith('DELETE')).length} DELETE)`);
await p.locator('[data-testid=assistant-panel]').screenshot({path:`${SH}/00-confirmation-avant-effacement.png`});
await p.click('[data-testid=action-confirm]');
await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(()=>{});
const card=await p.locator('[data-testid=action-done]').innerText().catch(()=> '');
check(/27 cases effacées/.test(card), `carte « Fait » affiche le nombre : ${card.split('\n')[0]}`);
check(/3 gardées/.test(card) && /heures déjà envoyées/.test(card), '3 cases avec des heures gardées, et c’est dit');
check(D.planning.length===3 && ['p01','p07','p13'].every(id=>D.planning.some(x=>x.id===id)), `base : il reste ${D.planning.length} cases (celles avec des heures)`);
const undoBtn=p.locator('[data-testid=action-undo]');
check(await undoBtn.getAttribute('class')==='strong' && /tout remettre/.test(await undoBtn.innerText()), '« Annuler : tout remettre » bien visible (plus de 10 éléments)');
await p.locator('[data-testid=assistant-panel]').screenshot({path:`${SH}/01-27-cases-effacees.png`});
phase='undo';
await undoBtn.click();
await p.waitForSelector('[data-testid=action-undone]', { timeout: 10000 }).catch(()=>{});
const undone=await p.locator('[data-testid=action-undone]').innerText().catch(()=> '');
check(/27 cases remises/.test(undone), `après Annuler : ${undone.trim()}`);
const sort=(a)=>JSON.stringify([...a].sort((x,y)=>x.id.localeCompare(y.id)));
check(sort(D.planning)===sort(JSON.parse(snapshot)), 'base : les 30 cases sont revenues À L’IDENTIQUE (mêmes id, horaires, notes, auteur)');
await p.locator('[data-testid=assistant-panel]').screenshot({path:`${SH}/02-annuler-tout-remis.png`});
console.log('   requêtes :', log.join(' | '));
// ─── Lot 3 : l'en-tête d'origine ───
const tagged=(ph)=>reqs.filter(x=>x.phase===ph&&x.origin);
check(tagged('load').length===0, `chargement : aucun en-tête x-bemexo-origine (${tagged('load').length})`);
check(reqs.some(x=>x.phase==='action'&&x.m==='DELETE'&&x.path==='/rest/v1/planning'&&x.origin==='assistant'), 'action de l’assistant : l’effacement porte « x-bemexo-origine: assistant »');
check(reqs.some(x=>x.phase==='undo'&&x.m==='POST'&&x.path==='/rest/v1/planning'&&x.origin==='assistant'), '« Annuler » : la remise porte l’en-tête aussi');
check(!reqs.some(x=>x.path.startsWith('/functions/')&&x.origin), 'jamais vers les fonctions edge');
check(!reqs.some(x=>!x.path.startsWith('/rest/v1/')&&x.origin), 'jamais vers l’authentification ni le stockage');
// Sans la migration (table `traces` absente) : aucun en-tête, nulle part.
TRACES='non'; phase='load'; reqs.length=0;
const p2=await ctx.newPage(); await p2.goto(`http://localhost:${PORT}/admin`); await p2.waitForTimeout(2500);
phase='action';
await p2.click('[data-testid="bar-assistant"]'); await p2.waitForTimeout(400);
await p2.fill('.as-bar textarea','Efface le planning de la semaine prochaine');
await p2.click('button[aria-label="Envoyer"]');
// Lot 1 : la carte de confirmation d'abord, puis « Effacer ».
await p2.waitForSelector('[data-testid=action-confirm]', { timeout: 10000 }).catch(()=>{});
check(!reqs.some(x=>x.m==='DELETE'), 'sans la migration : rien d’effacé avant la confirmation');
await p2.click('[data-testid=action-confirm]');
await p2.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(()=>{});
phase='undo';
await p2.locator('[data-testid=action-undo]').click();
await p2.waitForSelector('[data-testid=action-undone]', { timeout: 10000 }).catch(()=>{});
check(/27 cases remises/.test(await p2.locator('[data-testid=action-undone]').innerText().catch(()=> '')), 'sans la migration : l’action et « Annuler » marchent comme avant');
check(reqs.length>0&&reqs.every(x=>!x.origin), `sans la migration : aucun en-tête d’origine (${reqs.filter(x=>x.origin).length} sur ${reqs.length} requêtes)`);
check(sort(D.planning)===sort(JSON.parse(snapshot)), 'base : les 30 cases sont revenues À L’IDENTIQUE');
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close(); process.exit(ko?1:0);
