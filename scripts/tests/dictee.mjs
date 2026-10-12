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
// ── Langue de la dictée (salarié : Français / Türkçe), limite de saisie (1500 salarié, 500 bureau) ──
async function runLangs() {
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
  await ctx.addInitScript(FAKE, 'android');
  await ctx.addInitScript(() => { const w = window; w.__err = (code) => { const r = w.__rec.current; if (r && r.alive) { r.onerror && r.onerror({ error: code }); } }; });
  const p = await ctx.newPage();
  const open = async () => {
    await p.goto(`http://localhost:${PORT}/apercu/assistant-salarie?demo=salarie`); await p.waitForTimeout(1500);
    const o = p.locator('[data-testid="assistant-open"], [aria-label="Assistant BEMEXO"]').first();
    if (await o.count()) { await o.click(); await p.waitForTimeout(300); }
  };
  await open();
  const mic = p.locator('[data-testid="assistant-mic"]'); const ta = p.locator('.as-bar textarea');
  ok(await p.locator('[data-testid=assistant-langs]').count() === 1, 'Salarié : le sélecteur « Français / Türkçe » est affiché');
  ok(await p.locator('[data-testid="assistant-lang-fr-FR"]').getAttribute('aria-pressed') === 'true', 'Salarié : français par défaut');
  await mic.click(); await p.waitForTimeout(100);
  ok(await p.evaluate(() => window.__rec.lang) === 'fr-FR', 'Salarié : dictée en fr-FR par défaut');
  ok(await p.locator('[data-testid="assistant-lang-tr-TR"]').isDisabled(), 'Salarié : le sélecteur est grisé pendant l’écoute');
  await mic.click(); await p.waitForTimeout(200);
  await p.locator('[data-testid="assistant-lang-tr-TR"]').click(); await p.waitForTimeout(100);
  ok(await ta.getAttribute('lang') === 'tr', 'Salarié : champ lang="tr" après « Türkçe »');
  await mic.click(); await p.waitForTimeout(100);
  ok(await p.evaluate(() => window.__rec.lang) === 'tr-TR' && await p.evaluate(() => window.__rec.continuous) === true, 'Salarié : « Türkçe » → tr-TR, mode continu');
  await p.evaluate(() => window.__say('bugün sabah 8’den 12’ye kadar çalıştım', true)); await p.waitForTimeout(100);
  ok((await ta.inputValue()) === 'bugün sabah 8’den 12’ye kadar çalıştım', 'Salarié : le texte turc s’écrit dans le champ');
  await mic.click(); await p.waitForTimeout(200);
  // Mémorisée au rechargement
  await open();
  ok(await p.locator('[data-testid="assistant-lang-tr-TR"]').getAttribute('aria-pressed') === 'true', 'Salarié : la langue est mémorisée au rechargement');
  await p.locator('[data-testid=assistant-mic]').click(); await p.waitForTimeout(100);
  ok(await p.evaluate(() => window.__rec.lang) === 'tr-TR', 'Salarié : …et la dictée repart en tr-TR');
  // Langue non prise en charge : arrêt immédiat, message, retour sur Français
  await p.evaluate(() => window.__err('language-not-supported')); await p.waitForTimeout(300);
  ok(await p.locator('[data-testid=assistant-mic]').getAttribute('aria-pressed') === 'false', 'Salarié : language-not-supported → arrêt immédiat');
  ok((await p.locator('.as-bot.notice').last().innerText()).includes('La dictée en turc n’est pas disponible sur cet appareil'), 'Salarié : message « La dictée en turc n’est pas disponible sur cet appareil… »');
  ok(await p.locator('[data-testid="assistant-lang-fr-FR"]').getAttribute('aria-pressed') === 'true', 'Salarié : le sélecteur retourne sur Français');
  // Stockage bloqué : le panneau marche quand même
  await ctx.close();
  const c2 = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
  await c2.addInitScript(FAKE, 'android');
  await c2.addInitScript(() => { const bad = () => { throw new Error('stockage bloqué'); }; Object.defineProperty(window, 'localStorage', { configurable: true, get: bad }); });
  const q = await c2.newPage();
  q.on('pageerror', (e) => ok(false, `Stockage bloqué : erreur de page ${e.message}`));
  await q.goto(`http://localhost:${PORT}/apercu/assistant-salarie?demo=salarie`); await q.waitForTimeout(1500);
  const o2 = q.locator('[data-testid="assistant-open"], [aria-label="Assistant BEMEXO"]').first();
  if (await o2.count()) { await o2.click(); await q.waitForTimeout(300); }
  await q.locator('[data-testid="assistant-lang-tr-TR"]').click(); await q.waitForTimeout(100);
  await q.locator('[data-testid=assistant-mic]').click(); await q.waitForTimeout(100);
  ok(await q.evaluate(() => window.__rec.lang) === 'tr-TR', 'Salarié : avec le stockage bloqué, le choix « Türkçe » marche (sans être mémorisé)');
  await c2.close();
  // Limite : 1500 salarié, 500 bureau ; compteur à partir de 1 200
  const c3 = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
  await c3.addInitScript(FAKE, 'android');
  const s = await c3.newPage();
  await s.goto(`http://localhost:${PORT}/apercu/assistant-salarie?demo=salarie`); await s.waitForTimeout(1500);
  const o3 = s.locator('[data-testid="assistant-open"], [aria-label="Assistant BEMEXO"]').first();
  if (await o3.count()) { await o3.click(); await s.waitForTimeout(300); }
  const t3 = s.locator('.as-bar textarea');
  ok(await t3.getAttribute('maxlength') === '1500', 'Salarié : champ limité à 1500 caractères');
  await t3.fill('a'.repeat(1100)); await s.waitForTimeout(100);
  ok(await s.locator('[data-testid=assistant-count]').count() === 0, 'Salarié : pas de compteur à 1 100 caractères');
  await t3.fill('a'.repeat(1203)); await s.waitForTimeout(100);
  ok((await s.locator('[data-testid=assistant-count]').innerText()).replace(/\s/g, '') === '1203/1500', 'Salarié : compteur « 1 203 / 1 500 » à partir de 1 200');
  ok(await t3.getAttribute('rows') === '6', 'Salarié : champ à 6 lignes au-delà de 300 caractères');
  await t3.fill(''); await s.locator('[data-testid=assistant-mic]').click(); await s.waitForTimeout(100);
  await s.evaluate(() => window.__say('b'.repeat(1520), false)); await s.waitForTimeout(150);
  ok((await t3.inputValue()).length === 1500 && /Message coupé à 1 500 caractères\./.test((await s.locator('.as-bot.notice').last().innerText().catch(() => '')).replace(/\s/g, ' ')), 'Salarié : dictée de 1 520 caractères coupée à 1 500, avec « Message coupé à 1 500 caractères. »');
  await c3.close();
  const c4 = await b.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
  await c4.addInitScript(FAKE, 'android');
  const o = await c4.newPage();
  await o.goto(`http://localhost:${PORT}/apercu/assistant?demo=assistant`); await o.waitForTimeout(1500);
  const o4 = o.locator('[data-testid="assistant-open"], [data-testid="bar-assistant"], [aria-label="Assistant BEMEXO"]').first();
  if (await o4.count()) { await o4.click(); await o.waitForTimeout(300); }
  ok(await o.locator('.as-bar textarea').getAttribute('maxlength') === '500', 'Bureau : champ TOUJOURS limité à 500 caractères');
  ok(await o.locator('[data-testid=assistant-langs]').count() === 0, 'Bureau : aucun sélecteur de langue');
  await o.locator('[data-testid=assistant-mic]').click(); await o.waitForTimeout(100);
  ok(await o.evaluate(() => window.__rec.lang) === 'fr-FR', 'Bureau : dictée TOUJOURS en fr-FR');
  // Dictée au-delà du plafond : le bureau coupe en silence (comme avant), le salarié le dit une fois.
  await o.evaluate(() => window.__say('a'.repeat(520), false)); await o.waitForTimeout(150);
  ok((await o.locator('.as-bar textarea').inputValue()).length === 500 && await o.locator('.as-bot.notice').count() === 0, 'Bureau : dictée de 520 caractères coupée à 500 SANS message (comme avant)');
  await c4.close();
}
await runLangs();
console.log(results.join('\n')); await b.close(); srv.close();
