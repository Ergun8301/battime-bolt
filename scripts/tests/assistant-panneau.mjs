// Lancer : node scripts/tests/assistant-panneau.mjs out docs/captures-ia-v2 (après npm run build).
// Vérifie sur la VRAIE page planning (base simulée) : bulle « Autre » (titre + horaire)
// et panneau qui reste ouvert / garde la conversation quand l'onglet revient au premier plan.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT='4197'] = process.argv; fs.mkdirSync(SH,{recursive:true});
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.json':'application/json','.webmanifest':'application/json'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);for(const c of [p,p+'.html',path.join(p,'index.html')]){const f=path.join(OUT,c);if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});return fs.createReadStream(f).pipe(r);}}r.writeHead(404);r.end();});
await new Promise(r=>srv.listen(Number(PORT),r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
const CO='c0000000-0000-0000-0000-000000000001';
const autre={id:'w-autre',company_id:CO,client_name:'Autre',city:'',is_active:true};
const D={
  users:[{id:'u-admin',company_id:CO,first_name:'Paul',last_name:'Martin',role:'admin',email:'paul@exemple.fr',is_active:true,created_at:'2026-01-01'},
    {id:'u-kevin',company_id:CO,first_name:'Kevin',last_name:'Roussel',role:'worker',email:'k@x.fr',is_active:true,created_at:'2026-01-01'}],
  companies:[{id:CO,name:'Pizzeria Exemple',ai_enabled:true,kiosk_enabled:false,position_tracking_enabled:false,subscription_status:'active',trial_ends_at:'2030-01-01',weekly_hours:35}],
  worksites:[{id:'w1',company_id:CO,client_name:'Villa Dupont',city:'Lyon',is_active:true},autre],
  planning:[{id:'f440b232',company_id:CO,user_id:'u-kevin',worksite_id:'w-autre',work_date:today,absence_type:null,estimated_start:'14:00:00',estimated_end:'18:00:00',notes:'Intervention à Lyon',worksite:autre}],
  time_entries:[], active_sessions:[], month_closures:[], leave_requests:[], invitations:[], documents:[], certifications:[], push_subscriptions:[],
};
const REP={answer:'C’est fait.',links:[],remaining:40,
  action:{draft:{type:'affecter_planning',user_id:'u-kevin',salarie_texte:'Kevin',worksite_id:'w-autre',chantier_texte:'Lyon',dates:[today],note:'Intervention à Lyon',debut:'14:00',fin:'18:00'},problems:[],summary:'Kevin · Intervention à Lyon',question:null},
  options:{salaries:[{id:'u-kevin',nom:'Kevin Roussel'}],chantiers:[{id:'w1',nom:'Villa Dupont',ville:'Lyon'},{id:'w-autre',nom:'Autre',ville:null}]}};
const ctx=await b.newContext({viewport:{width:1280,height:900},locale:'fr-FR',timezoneId:'Europe/Paris'});
const now=Math.floor(Date.now()/1000); const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u-admin',role:'authenticated',exp:now+36000,aal:'aal1'})}.sig`;
const session={access_token:jwt,refresh_token:'r',expires_at:now+36000,expires_in:36000,token_type:'bearer',user:{id:'u-admin',email:'paul@exemple.fr',aud:'authenticated',role:'authenticated'}};
await ctx.addInitScript(([k,v])=>{ localStorage.setItem(k,v); },['sb-sdperbcquvneohotjono-auth-token',JSON.stringify(session)]);
let assistantDelay=0, writes=0;
await ctx.route('**/*.supabase.co/**', async (r)=>{
  const u=new URL(r.request().url());
  if(u.pathname.startsWith('/auth/v1/user')) return r.fulfill({json:session.user});
  if(u.pathname.startsWith('/auth/v1/')) return r.fulfill({json:{}});
  if(u.pathname.startsWith('/functions/v1/assistant')) { await new Promise(x=>setTimeout(x,assistantDelay)); return r.fulfill({json:REP}); }
  if(u.pathname.startsWith('/functions/v1/')) return r.fulfill({json:{}});
  if(u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({json:[]});
  const t=u.pathname.replace('/rest/v1/','');
  let rows=D[t]||[];
  for(const [k,v] of u.searchParams){ if(v.startsWith('eq.')) { const val=v.slice(3); rows=rows.filter(x=>!(k in x)||String(x[k])===val); } }
  const acc=r.request().headers()['accept']||'';
  if(r.request().method()!=='GET' && r.request().method()!=='HEAD') { writes++; console.log('   écriture', r.request().method(), t); return r.fulfill({status:201,json:rows.length?rows[0]:{id:'new-1'}}); }
  if(acc.includes('vnd.pgrst.object')) return rows.length? r.fulfill({json:rows[0]}) : r.fulfill({status:406,json:{code:'PGRST116',message:'none'}});
  return r.fulfill({json:rows,headers:{'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
});
let ok=0, ko=0; const check=(c,m)=>{ if(c){ok++;console.log('✅',m);} else {ko++;console.log('❌',m);} };
const p=await ctx.newPage(); await p.goto(`http://localhost:${PORT}/admin`); await p.waitForTimeout(2500);
// 3) Bulle « Autre »
const titles=await p.locator('[data-testid=bubble-title]').allInnerTexts(); const hours=await p.locator('[data-testid=bubble-hours]').allInnerTexts();
check(titles.includes('Intervention à Lyon'), `3) titre de la bulle : ${titles.join(' / ')}`);
check(hours.includes('14:00–18:00'), `3) horaire de la bulle : ${hours.join(' / ')}`);
await p.locator('[data-testid=bubble-title]', { hasText: 'Intervention à Lyon' }).first().screenshot({path:`${SH}/11-planning-bulle-autre.png`});
// 2) Panneau : réponse lente + retour sur l'onglet PENDANT l'attente, puis encore après
const away = async () => { await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); window.dispatchEvent(new Event('visibilitychange'));
}); await p.waitForTimeout(300); await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); window.dispatchEvent(new Event('visibilitychange'));
}); await p.waitForTimeout(1200); };
await p.click('[data-testid="bar-assistant"]'); await p.waitForTimeout(400);
assistantDelay=2500;
await p.fill('.as-bar textarea','Ajoute une intervention à Lyon pour Kevin jeudi de 14h à 18h');
await p.click('button[aria-label="Envoyer"]');
await p.waitForTimeout(500); await away();
const loadingSeen = await p.locator('text=Chargement du planning').count();
check(loadingSeen===0, '2) pas d’écran « Chargement » au retour sur l’onglet');
await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(()=>{});
check(await p.locator('[data-testid=assistant-panel]').count()===1, '2) panneau toujours ouvert');
check(await p.locator('[data-testid=action-done]').count()===1, '2) carte « Fait » arrivée malgré le retour sur l’onglet');
await away();
check(await p.locator('[data-testid=assistant-panel]').count()===1 && await p.locator('[data-testid=action-done]').count()===1, '2) après un 2ᵉ retour : panneau ouvert, « Fait » + Annuler/Modifier toujours là');
check(await p.locator('[data-testid=action-undo]').count()===1 && await p.locator('[data-testid=action-edit]').count()===1, '2) boutons Annuler et Modifier présents');
check(writes===1, `2) une seule écriture (pas de doublon) : ${writes}`);
await p.locator('[data-testid=assistant-panel]').screenshot({path:`${SH}/12-panneau-reste-ouvert.png`});
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
