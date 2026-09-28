// Every capture take of the storyboard. Run: node takes.js <takeName> [more…] | all
const path = require('path');
const fs = require('fs');
const { Take, http, SP } = require('./rec');

const D = '2026-09-24';
const at = (hhmmss, day = D) => new Date(`${day}T${hhmmss}+02:00`).toISOString();
const PHOTO = path.join(SP, 'assets/photos/chantier-01.jpg');

// Locate the planning cell of a worker for a weekday (0 = lundi).
const cell = (name, dayIdx) => `tr:has(.bt-pl-name:text-is("${name}")) > td:nth-child(${dayIdx + 2})`;

// Scroll a TimeCylinder column to a value, frame by frame (looks like a finger flick).
async function wheelTo(t, colIndex, targetLabel, sec = 0.9) {
  const info = await t.page.evaluate(([ci, lab]) => {
    const cols = [...document.querySelectorAll('.snap-y.snap-mandatory')].filter((e) => e.offsetParent);
    const el = cols[ci];
    if (!el) return null;
    const items = [...el.querySelectorAll('li')];
    const cur = el.scrollTop;
    const center = Math.round(cur / 40);
    // nearest index with that label
    let best = null;
    items.forEach((li, i) => { if (li.textContent.trim() === lab && (best === null || Math.abs(i - center) < Math.abs(best - center))) best = i; });
    return { from: cur, to: best * 40 };
  }, [colIndex, targetLabel]);
  if (!info || info.to == null) throw new Error('wheel not found ' + colIndex + ' ' + targetLabel);
  const n = Math.round(sec * 30);
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const e = 1 - Math.pow(1 - k, 3);
    const v = info.from + (info.to - info.from) * e;
    await t.page.evaluate(([ci, top]) => {
      const cols = [...document.querySelectorAll('.snap-y.snap-mandatory')].filter((e) => e.offsetParent);
      cols[ci].scrollTop = top;
    }, [colIndex, v]);
    await t.frame();
  }
  await t.hold(0.3);
}

const TAKES = {
  // ── Scène 1 · PLANIFIER ────────────────────────────────────────────────
  async planning() {
    const t = await new Take({ name: 'planning', kind: 'desktop', scene: 's1', now: at('07:25:00'), url: '/admin', session: 'admin', cursorStart: [1180, 760] }).open();
    t.mark('wide');
    await t.hold(3.2);
    t.mark('clients-open');
    await t.click('button:has-text("Clients")', { moveSec: 0.8 });
    await t.hold(0.4);
    t.mark('drag');
    await t.drag('text=Villa Martin', cell('Lucas Martin', 4), 1.5, { hover: 0.6 });
    t.mark('dropped');
    await t.hold(1.6);
    await t.page.keyboard.press('Escape');
    await t.hold(0.3);
    t.mark('absences');
    await t.moveTo(cell('Inès Garcia', 2), 0.9);
    await t.hold(2.2);
    await t.close();
  },

  // ── Scène 2 · split « 5 en direct » ───────────────────────────────────
  async liveAdmin() {
    const t = await new Take({ name: 'liveAdmin', kind: 'desktop', scene: 's2x', now: at('07:31:00'), url: '/admin', session: 'admin' }).open();
    await t.hold(3);
    await t.close();
  },

  // ── Scène 2 · POINTER ─────────────────────────────────────────────────
  async pointage() {
    const t = await new Take({ name: 'pointage', kind: 'mobile', scene: 's2', now: at('07:29:53'), url: '/poseur', session: 'karim' }).open();
    t.mark('day');
    await t.hold(2.0);
    t.mark('geo');
    await t.hold(1.2);
    await t.tap('select.bt-lt-sel', { indicatorOnly: true, after: 0.3 });
    const ws = await t.page.locator('select.bt-lt-sel option', { hasText: 'Villa Martin' }).first().getAttribute('value');
    await t.page.selectOption('select.bt-lt-sel', ws);
    await t.hold(0.6);
    t.mark('start');
    await t.tap('button:has-text("Je commence")', { after: 1.4 });
    await t.syncServerClock();
    t.mark('running');
    await t.jumpTo(at('10:42:41'));
    await t.hold(3.2);
    t.mark('finish');
    await t.jumpTo(at('12:00:03'));
    await t.tap('button:has-text("J\'ai fini")', { after: 2.4 });
    await t.close();
  },

  // ── Scène 2 fin · hors-ligne, route, panier ──────────────────────────
  async offline() {
    const t = await new Take({ name: 'offline', kind: 'mobile', scene: 's3a', now: at('16:31:00'), url: '/poseur', session: 'karim' }).open();
    await t.hold(1.0);
    t.mark('offline');
    await t.context.setOffline(true);
    await t.page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await t.hold(1.4);
    await t.tap('button[aria-label="Ajouter un chantier"]', { after: 0.8 });
    await t.tap('.bt-ed-ws:has-text("Résidence Les Cèdres"), button:has-text("Résidence Les Cèdres")', { after: 0.6 });
    // Début 12:45
    await t.tap('text=Début', { after: 0.6 });
    await wheelTo(t, 0, '12');
    await wheelTo(t, 1, '45', 0.6);
    await t.tap('.bt-segb >> nth=1', { after: 0.4 });
    await wheelTo(t, 0, '16');
    await wheelTo(t, 1, '30', 0.6);
    await t.tap('button:has-text("Valider les heures")', { after: 0.6 });
    await t.tap('button:has-text("OK")', { after: 1.6 });
    t.mark('on-phone');
    await t.hold(1.0);
    t.mark('online');
    await t.context.setOffline(false);
    await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await t.hold(2.4);
    t.mark('gap');
    await t.tap('button.bt-gap-b:has-text("Route")', { after: 1.2 });
    t.mark('panier');
    await t.tap('[aria-label="Panier repas"]', { after: 1.8 });
    await t.close();
  },

  // ── Scène 3 · PROUVER ─────────────────────────────────────────────────
  async preuve() {
    const t = await new Take({ name: 'preuve', kind: 'mobile', scene: 's3b', now: at('16:44:00'), url: '/poseur', session: 'karim' }).open();
    await t.hold(0.8);
    await t.tap('text=Villa Martin', { after: 0.9 });
    t.mark('reserve');
    await t.tap('button:has-text("Avec réserve")', { after: 0.8 });
    await t.tap('textarea', { after: 0.3 });
    await t.typeText('Joint silicone manquant fenêtre salon', 16);
    t.mark('docs');
    await t.tap('button:has-text("Documents")', { after: 1.0 });
    const input = t.page.locator('input[type=file][capture="environment"]').first();
    await t.tap('button:has-text("Photo")', { after: 0.2 });
    t.uploadFile = PHOTO;
    await input.setInputFiles(PHOTO);
    await t.hold(2.4);
    t.mark('photo-listed');
    await t.hold(1.2);
    await t.page.keyboard.press('Escape');
    await t.hold(0.5);
    await t.tap('button:has-text("OK")', { after: 1.2 });
    t.mark('send');
    await t.tap('button.bt-send', { after: 2.8 });
    await t.close();
  },

  // ── Scène 4 · CONTRÔLER ───────────────────────────────────────────────
  async beforeSend() {
    const t = await new Take({ name: 'beforeSend', kind: 'desktop', scene: 's4b', now: at('16:44:30'), url: '/admin', session: 'admin' }).open();
    await t.hold(1.5);
    await t.close();
  },
  async controle() {
    const t = await new Take({ name: 'controle', kind: 'desktop', scene: 's4', now: at('17:05:00'), url: '/admin', session: 'admin', cursorStart: [1100, 700] }).open();
    t.mark('arrived');
    await t.hold(1.6);
    t.mark('popup');
    await t.click(`${cell('Karim Benali', 3)} .bt-pl-bub`, { moveSec: 0.8 });
    await t.hold(2.6);
    await t.page.keyboard.press('Escape');
    await t.hold(0.4);
    t.mark('fiche');
    await t.click('.bt-pl-namebtn:has-text("Karim Benali")');
    await t.click('button:has-text("Feuille d\'heures")', { after: 0.8 });
    await t.click('button:has-text("Cette semaine")', { after: 1.8 });
    t.mark('week');
    await t.hold(1.5);
    t.mark('correct');
    await t.click('button:has-text("Corriger les heures")', { after: 0.6 });
    await t.click('input[aria-label="Heure de fin"]', { dx: 0.22, after: 0.2 });
    await t.typeText('1600', 8, { after: 0.5 });
    t.mark('prevenir');
    await t.click('button:has-text("Corriger et prévenir")', { after: 2.8 });
    await t.close();
  },

  // Karim voit la correction (même état serveur que la prise précédente, pas de reset)
  async corrige() {
    const t = await new Take({ name: 'corrige', kind: 'mobile', now: at('17:07:30'), url: '/poseur', session: 'karim' }).open();
    await t.hold(0.6);
    await t.box('text=Le bureau a corrigé');
    await t.hold(2.6);
    await t.close();
  },

  // ── Scène 5 · PILOTER ─────────────────────────────────────────────────
  async piloter() {
    const t = await new Take({ name: 'piloter', kind: 'desktop', scene: 's5', now: at('17:20:00'), url: '/admin', session: 'admin', cursorStart: [1200, 600] }).open();
    t.mark('reserves');
    await t.click('role=button[name=/^Réserves/]', { moveSec: 0.8, after: 1.0 });
    await t.click('button:has-text("Lever la réserve") >> nth=1', { after: 0.4 });
    await t.typeText('Vérifié le 24/09 — seuil repris', 18);
    await t.click('button:has-text("Confirmer la levée")', { after: 1.8 });
    await t.page.keyboard.press('Escape');
    await t.hold(0.4);
    t.mark('cost');
    await t.click('role=button[name=/^Coût chantiers/]', { after: 2.4 });
    t.mark('expand');
    await t.click('[role=dialog] >> text=Villa Martin', { after: 0.6 });
    await t.scrollIn('[role=dialog]', 360, 1.0);
    await t.hold(2.4);
    await t.close();
  },

  // ── Scène 6 · PAYER ───────────────────────────────────────────────────
  async paie() {
    const t = await new Take({ name: 'paie', kind: 'desktop', scene: 's6', now: at('17:00:00', '2026-09-30'), url: '/admin', session: 'admin', cursorStart: [1100, 600] }).open();
    t.mark('export');
    await t.click('button:has-text("Exporter")', { moveSec: 0.8, after: 0.5 });
    await t.click('text=Exporter l\'équipe', { after: 0.9 });
    await t.click('button:has-text("Créneau")', { after: 0.8 });
    await t.click('[role=dialog] button[name="day"]:text-is("1"), .rdp button:text-is("1")', { moveSec: 0.6, after: 0.3 });
    await t.click('[role=dialog] button[name="day"]:text-is("30"), .rdp button:text-is("30")', { moveSec: 0.6, after: 0.6 });
    await t.click('text=Exporter les heures de l\'équipe', { moveSec: 0.5, after: 0.6 });
    t.mark('csv');
    const dlP = t.page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
    await t.click('button:has-text("CSV pour la paie")', { after: 0.2 });
    await t.hold(2.2);
    const dl = await dlP;
    if (dl) await dl.saveAs(require('path').join(t.dir, 'bemexo-paie.csv'));
    t.mark('send');
    await t.moveTo('button:has-text("Envoyer à")', 0.8);
    await t.hold(1.6);
    t.mark('cloture');
    await t.click('button:has-text("Clôturer")', { moveSec: 0.8, after: 1.0 });
    await t.click('button:has-text("Clôturer") >> nth=-1', { moveSec: 0.6, after: 2.6 });
    await t.close();
  },

  async comptable() {
    const t = await new Take({ name: 'comptable', kind: 'mobile', scene: 's6x', now: at('17:06:00', '2026-09-30'), url: '/poseur', session: 'karim' }).open();
    await t.hold(0.6);
    await t.box('text=Chez le comptable');
    await t.hold(2.8);
    await t.close();
  },

  // ── Scène 7 · ET AUSSI ────────────────────────────────────────────────
  async chef() {
    const t = await new Take({ name: 'chef', kind: 'mobile', scene: 's7c', now: at('10:20:00'), url: '/poseur', session: 'julien' }).open();
    await t.hold(0.5);
    await t.box("text=Mon équipe aujourd'hui");
    await t.hold(2.4);
    await t.close();
  },
  async conges() {
    const t = await new Take({ name: 'conges', kind: 'mobile', scene: 's7', now: at('17:30:00'), url: '/poseur', session: 'karim' }).open();
    await t.hold(0.4);
    await t.tap('header button:has-text("Karim"), button:has-text("Karim")', { after: 0.6 });
    await t.tap('text=Mes congés', { after: 2.6 });
    await t.close();
  },
  async habil() {
    const t = await new Take({ name: 'habil', kind: 'desktop', scene: 's7', now: at('17:31:00'), url: '/admin', session: 'admin', cursorStart: [900, 500] }).open();
    await t.click('role=button[name=/^Salariés/]', { moveSec: 0.6, after: 0.8 });
    await t.click('[role=dialog] >> text=Sofia Rossi', { moveSec: 0.6, after: 1.0 });
    await t.box('text=Habilitations');
    await t.hold(2.6);
    await t.close();
  },
  async importe() {
    const t = await new Take({ name: 'importe', kind: 'desktop', scene: 's7', now: at('17:32:00'), url: '/admin', session: 'admin', cursorStart: [900, 500] }).open();
    await t.click('button:has-text("Clients")', { moveSec: 0.6, after: 0.5 });
    await t.click('text=Importer (CSV/Excel)', { moveSec: 0.6, after: 0.8 });
    await t.page.locator('[role=dialog] input[type=file]').first().setInputFiles(require('path').join(SP, 'assets/import-clients.csv'));
    await t.hold(1.8);
    await t.click('[role=dialog] button:has-text("Importer ")', { moveSec: 0.7, after: 2.6 });
    await t.close();
  },
};

(async () => {
  const names = process.argv.slice(2);
  const list = names[0] === 'all' ? Object.keys(TAKES) : names;
  for (const n of list) {
    if (!TAKES[n]) { console.error('unknown take', n); continue; }
    const t0 = Date.now();
    try { await TAKES[n](); } catch (e) { console.error(`[${n}] FAILED`, e.message); }
    console.log(`[${n}] ${(Date.now() - t0) / 1000}s`);
  }
  process.exit(0);
})();

module.exports = { TAKES, cell, wheelTo, at };
