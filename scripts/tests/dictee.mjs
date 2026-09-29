// Test de la dictée continue, navigateur réel (Chromium), reconnaissance vocale SIMULÉE
// selon le comportement de chaque plateforme :
//  - android : Chrome Android, mode continu, chaque « final » répète tout ce qui précède ;
//  - ios     : Safari iOS, la reconnaissance se TERMINE à chaque pause (onend).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium, devices } from 'playwright-core';
const [,, OUT, SH, PORT='4195'] = process.argv; fs.mkdirSync(SH,{recursive:true});
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.json':'application/json'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);for(const c of [p,p+'.html',path.join(p,'index.html')]){const f=path.join(OUT,c);if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});return fs.createReadStream(f).pipe(r);}}r.writeHead(404);r.end();});
await new Promise(r=>srv.listen(Number(PORT),r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const FAKE = (mode) => {
  const w = window; w.__rec = { instances: 0, current: null, mode };
  class Fake {
    constructor(){ this.lang=''; this.continuous=false; this.interimResults=false; this.onresult=null; this.onend=null; this.onerror=null; this.results=[]; this.alive=false; w.__rec.instances++; w.__rec.current=this; }
    start(){ if(this.alive) throw new Error('InvalidStateError'); this.alive=true; w.__rec.lang=this.lang; w.__rec.continuous=this.continuous; }
    stop(){ if(!this.alive) return; this.alive=false; setTimeout(()=>this.onend&&this.onend(),10); }
    abort(){ this.stop(); }
    emit(){ this.onresult && this.onresult({ resultIndex: 0, results: this.results.map(r=>Object.assign([{transcript:r.t}],{isFinal:r.f})) }); }
  }
  w.__say = (text, final) => { const r=w.__rec.current; if(!r||!r.alive) return false;
    if (w.__rec.mode==='android' && final) { const prev=r.results.filter(x=>x.f).map(x=>x.t).join(' '); r.results=r.results.filter(x=>x.f); r.results.push({t:(prev?prev+' ':'')+text,f:true}); }
    else { r.results=r.results.filter(x=>x.f); r.results.push({t:text,f:final}); }
    r.emit(); return true; };
  w.__pause = () => { const r=w.__rec.current; if(!r||!r.alive) return; r.alive=false; r.onerror&&r.onerror({error:'no-speech'}); r.onend&&r.onend(); };
  w.webkitSpeechRecognition = Fake; w.SpeechRecognition = undefined;
};
const results=[]; const ok=(c,m)=>{results.push((c?'✅ ':'❌ ')+m); if(!c) process.exitCode=1;};
async function run(label, device, mode, url, shot) {
  const ctx=await b.newContext({...devices[device], locale:'fr-FR'});
  await ctx.addInitScript(FAKE, mode);
  const p=await ctx.newPage(); await p.goto(`http://localhost:${PORT}${url}`); await p.waitForTimeout(1500);
  const openBtn = p.locator('[data-testid="assistant-open"], [data-testid="bar-assistant"], [aria-label="Assistant BEMEXO"]').first();
  if (await openBtn.count()) { await openBtn.click(); await p.waitForTimeout(300); }
  const mic=p.locator('[data-testid="assistant-mic"]'); const ta=p.locator('.as-bar textarea');
  await mic.click(); await p.waitForTimeout(100);
  ok(await p.evaluate(()=>window.__rec.lang==='fr-FR' && window.__rec.continuous===true), `${label} : fr-FR, mode continu`);
  await p.evaluate(()=>window.__say('ajoute une intervention', false)); await p.waitForTimeout(80);
  ok((await ta.inputValue())==='ajoute une intervention', `${label} : texte en direct pendant qu'on parle`);
  await p.evaluate(()=>window.__say('ajoute une intervention', true));
  await p.evaluate(()=>window.__pause()); await p.waitForTimeout(400);  // pause : le navigateur coupe
  ok(await mic.getAttribute('aria-pressed')==='true', `${label} : une pause n'arrête PAS l'enregistrement`);
  ok(await p.evaluate(()=>window.__rec.instances)>=2, `${label} : relance automatique après la coupure du navigateur`);
  await p.evaluate(()=>window.__say('pour Karim demain matin', true)); await p.waitForTimeout(80);
  await p.evaluate(()=>window.__pause()); await p.waitForTimeout(400);
  await p.evaluate(()=>window.__say('chez Dupont', false)); await p.waitForTimeout(80);
  ok((await ta.inputValue())==='ajoute une intervention pour Karim demain matin chez Dupont', `${label} : aucun mot perdu ni doublé (« ${await ta.inputValue()} »)`);
  ok(await p.locator('.as-me').count()===0, `${label} : rien n'est envoyé tout seul`);
  if (shot) await p.screenshot({path:`${SH}/${shot}-ecoute.png`});
  await mic.click(); await p.waitForTimeout(200);
  ok(await mic.getAttribute('aria-pressed')==='false', `${label} : un appui arrête`);
  ok((await ta.inputValue())==='ajoute une intervention pour Karim demain matin chez Dupont', `${label} : le texte reste dans le champ`);
  await ta.fill('ajoute une intervention pour Karim demain matin chez Villa Dupont'); // correction à la main
  await p.waitForTimeout(700);
  ok(await p.locator('.as-me').count()===0, `${label} : toujours rien d'envoyé après l'arrêt`);
  await p.locator('button[aria-label="Envoyer"]').click(); await p.waitForTimeout(300);
  ok((await p.locator('.as-me').first().innerText()).includes('Villa Dupont'), `${label} : Envoyer part avec la correction`);
  // Envoyer direct PENDANT l'enregistrement
  await mic.click(); await p.waitForTimeout(100);
  await p.evaluate(()=>window.__say('qui a pointé hier', false)); await p.waitForTimeout(80);
  await p.locator('button[aria-label="Envoyer"]').click(); await p.waitForTimeout(300);
  ok(await mic.getAttribute('aria-pressed')==='false' && (await p.locator('.as-me').nth(1).innerText()).includes('qui a pointé hier'), `${label} : « Envoyer » pendant l'enregistrement arrête et envoie`);
  await p.evaluate(()=>window.__say('fantôme', true)); await p.waitForTimeout(100);
  ok((await ta.inputValue())==='', `${label} : plus rien n'arrive après l'envoi`);
  if (shot) { await p.waitForTimeout(600); await p.screenshot({path:`${SH}/${shot}-apres.png`}); }
  await ctx.close();
}
await run('Patron · Chrome Android', 'Pixel 7', 'android', '/apercu/assistant?demo=assistant', 'dictee-patron-android');
await run('Patron · Safari iOS', 'iPhone 14', 'ios', '/apercu/assistant?demo=assistant', null);
await run('Salarié · Chrome Android', 'Pixel 7', 'android', '/apercu/assistant-salarie?demo=salarie', null);
await run('Salarié · Safari iOS', 'iPhone 14', 'ios', '/apercu/assistant-salarie?demo=salarie', 'dictee-salarie-ios');
console.log(results.join('\n')); await b.close(); srv.close();
