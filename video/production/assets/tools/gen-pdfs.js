// Generates the 3 fictional demo PDFs with jsPDF (from the isolated app copy's node_modules).
// node assets/tools/gen-pdfs.js
const path = require('path');
const fs = require('fs');
const APP_NM = path.resolve(__dirname, '../../app/node_modules');
const { jsPDF } = require(path.join(APP_NM, 'jspdf/dist/jspdf.node.min.js'));
const OUT = path.resolve(__dirname, '../docs');
fs.mkdirSync(OUT, { recursive: true });

const INK = [21, 18, 15], YEL = [255, 194, 26], MUTED = [110, 106, 99], CREAM = [242, 237, 227];
const FIXED_DATE = new Date(Date.UTC(2026, 8, 15, 8, 0, 0));

function header(doc, title, ref) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK); doc.rect(0, 0, W, 30, 'F');
  // hatched ribbon
  doc.saveGraphicsState();
  for (let x = W - 70; x < W + 10; x += 6) { doc.setFillColor(...YEL); doc.triangle(x, 30, x + 3, 30, x + 3 - 4, 26, 'F'); }
  doc.restoreGraphicsState();
  doc.setTextColor(...CREAM); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('DELORME RÉNOVATION', 14, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(200, 192, 176);
  doc.text('Menuiserie · Plâtrerie · Peinture — 12 avenue des Îles, 74000 Annecy (données fictives)', 14, 21);
  doc.setTextColor(...YEL); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(title, W - 14, 14, { align: 'right' });
  doc.setTextColor(200, 192, 176); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(ref, W - 14, 21, { align: 'right' });
  doc.setTextColor(...INK);
}
function footer(doc) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 212, 196); doc.setLineWidth(0.3); doc.line(14, H - 16, W - 14, H - 16);
  doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text('Document de démonstration — entreprise, client et montants fictifs. Aucune valeur contractuelle.', 14, H - 10);
  doc.text('Page 1/1', W - 14, H - 10, { align: 'right' });
}
function mk(opts) {
  const doc = new jsPDF(opts);
  doc.setProperties({ title: 'Démo BEMEXO', author: 'Delorme Rénovation (fictif)', creator: 'BEMEXO demo', subject: 'Données fictives' });
  doc.setCreationDate(FIXED_DATE);
  return doc;
}
const eur = (n) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';

// 1) Devis
{
  const doc = mk({ unit: 'mm', format: 'a4' });
  header(doc, 'DEVIS N° D-2026-0142', 'Émis le 15/09/2026 · valable 30 jours');
  doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text('CLIENT', 14, 44); doc.text('CHANTIER', 110, 44);
  doc.setTextColor(...INK); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('École Les Marquisats', 14, 51); doc.text('Rénovation salle 2 — RDC', 110, 51);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(['5 rue des Marquisats', '74000 Annecy', 'ecole.marquisats@example.com'], 14, 57);
  doc.text(['Démarrage prévu : 29/09/2026', 'Durée estimée : 4 jours', 'Chef d’équipe : Karim B.'], 110, 57);
  const rows = [
    ['Dépose ancien doublage + évacuation', '18 m²', 22, 18],
    ['Cloison plaque de plâtre BA13 sur ossature', '24 m²', 48.5, 24],
    ['Bandes, enduit et ponçage', '24 m²', 14, 24],
    ['Peinture acrylique velours 2 couches', '62 m²', 16.8, 62],
    ['Remplacement seuil de porte alu', '1 u', 185, 1],
    ['Joint silicone menuiseries extérieures', '14 ml', 9.5, 14],
    ['Protection sols et nettoyage fin de chantier', 'forfait', 240, 1],
  ];
  let y = 82;
  doc.setFillColor(...INK); doc.rect(14, y - 6, 182, 9, 'F');
  doc.setTextColor(...CREAM); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('DÉSIGNATION', 17, y); doc.text('QTÉ', 128, y, { align: 'right' }); doc.text('P.U. HT', 158, y, { align: 'right' }); doc.text('TOTAL HT', 193, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.setFontSize(9.5);
  let tot = 0;
  rows.forEach((r, i) => {
    y += 10;
    if (i % 2 === 0) { doc.setFillColor(248, 244, 236); doc.rect(14, y - 6.5, 182, 10, 'F'); }
    const t = r[2] * r[3]; tot += t;
    doc.text(r[0], 17, y); doc.text(r[1], 128, y, { align: 'right' }); doc.text(eur(r[2]), 158, y, { align: 'right' }); doc.text(eur(t), 193, y, { align: 'right' });
  });
  y += 16;
  const tva = tot * 0.1;
  [['Total HT', eur(tot)], ['TVA 10 % (rénovation)', eur(tva)]].forEach(([k, v]) => { doc.text(k, 150, y, { align: 'right' }); doc.text(v, 193, y, { align: 'right' }); y += 7; });
  doc.setFillColor(...YEL); doc.rect(110, y - 5, 86, 10, 'F');
  doc.setFont('helvetica', 'bold'); doc.text('TOTAL TTC', 150, y + 1.5, { align: 'right' }); doc.text(eur(tot + tva), 193, y + 1.5, { align: 'right' });
  y += 22; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(['Conditions : acompte 30 % à la commande, solde à réception des travaux.', 'Bon pour accord — date et signature du client :'], 14, y);
  doc.setDrawColor(200, 190, 170); doc.rect(14, y + 10, 80, 26);
  footer(doc);
  fs.writeFileSync(path.join(OUT, 'devis-demo.pdf'), Buffer.from(doc.output('arraybuffer')));
}

// 2) PV de réception
{
  const doc = mk({ unit: 'mm', format: 'a4' });
  header(doc, 'PROCÈS-VERBAL DE RÉCEPTION', 'Réf. PV-2026-031 · 02/10/2026');
  doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.text('Chantier : École Les Marquisats — Rénovation salle 2 (RDC)', 14, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(['Maître d’ouvrage : École Les Marquisats, 5 rue des Marquisats, 74000 Annecy', 'Entreprise : Delorme Rénovation — lot plâtrerie / peinture / menuiserie', 'Marché : devis D-2026-0142 du 15/09/2026'], 14, 54);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Décision du maître d’ouvrage', 14, 76);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  const opts = [['Réception prononcée sans réserve', false], ['Réception prononcée avec réserves (voir liste ci-dessous)', true], ['Réception refusée', false]];
  opts.forEach(([t, on], i) => { const yy = 84 + i * 7; doc.setDrawColor(...INK); doc.rect(16, yy - 3.5, 4, 4); if (on) { doc.setFillColor(...INK); doc.rect(16.8, yy - 2.7, 2.4, 2.4, 'F'); } doc.text(t, 23, yy); });
  let y = 112;
  doc.setFillColor(...INK); doc.rect(14, y - 6, 182, 9, 'F'); doc.setTextColor(...CREAM); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('N°', 17, y); doc.text('RÉSERVE', 28, y); doc.text('LOCALISATION', 128, y); doc.text('LEVÉE AVANT', 193, y, { align: 'right' });
  doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  const res = [['1', 'Joint silicone manquant, fenêtre côté cour', 'Salle 2 — baie F3', '09/10/2026'], ['2', 'Retouche peinture sous tableau blanc', 'Salle 2 — mur nord', '09/10/2026'], ['3', 'Seuil de porte : réglage de la butée', 'Accès couloir', '09/10/2026']];
  res.forEach((r, i) => { y += 10; if (i % 2 === 0) { doc.setFillColor(248, 244, 236); doc.rect(14, y - 6.5, 182, 10, 'F'); } doc.text(r[0], 17, y); doc.text(r[1], 28, y); doc.text(r[2], 128, y); doc.text(r[3], 193, y, { align: 'right' }); });
  y += 20; doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text('Photos jointes : 6 (horodatées, prises depuis l’application BEMEXO).', 14, y);
  y += 14; doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text('Le maître d’ouvrage', 14, y); doc.text('L’entreprise', 110, y);
  doc.setDrawColor(200, 190, 170); doc.rect(14, y + 4, 80, 30); doc.rect(110, y + 4, 86, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text('Signé électroniquement — démo', 16, y + 30); doc.text('Signé électroniquement — démo', 112, y + 30);
  footer(doc);
  fs.writeFileSync(path.join(OUT, 'pv-reception-demo.pdf'), Buffer.from(doc.output('arraybuffer')));
}

// 3) Plan RDC
{
  const doc = mk({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  header(doc, 'PLAN RDC — INDICE B', 'École Les Marquisats · échelle 1:100 (indicative)');
  const ox = 20, oy = 48, s = 6.6; // 1 m = 6.6 mm
  doc.setDrawColor(...INK); doc.setLineWidth(1.6);
  doc.rect(ox, oy, 30 * s, 18 * s); // outer walls 30m x 18m
  doc.setLineWidth(0.8);
  doc.line(ox + 12 * s, oy, ox + 12 * s, oy + 11 * s);
  doc.line(ox, oy + 11 * s, ox + 30 * s, oy + 11 * s);
  doc.line(ox + 21 * s, oy, ox + 21 * s, oy + 11 * s);
  doc.line(ox + 8 * s, oy + 11 * s, ox + 8 * s, oy + 18 * s);
  // door gaps (white) + arcs
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.2);
  [[ox + 4 * s, oy + 11 * s], [ox + 15 * s, oy + 11 * s], [ox + 24 * s, oy + 11 * s]].forEach(([x, y]) => doc.line(x, y, x + 0.9 * s, y));
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.3);
  [[ox + 4 * s, oy + 11 * s], [ox + 15 * s, oy + 11 * s], [ox + 24 * s, oy + 11 * s]].forEach(([x, y]) => { doc.line(x, y, x, y - 0.9 * s); });
  // windows on top wall
  doc.setDrawColor(90, 140, 190); doc.setLineWidth(1.1);
  for (let i = 0; i < 6; i++) { const x = ox + (1.5 + i * 4.7) * s; doc.line(x, oy, x + 2 * s, oy); }
  // hatched highlight: salle 2
  doc.setFillColor(255, 238, 180); doc.rect(ox + 12 * s + 0.8, oy + 0.8, 9 * s - 1.6, 11 * s - 1.6, 'F');
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('SALLE 1', ox + 6 * s, oy + 5.5 * s, { align: 'center' });
  doc.text('SALLE 2', ox + 16.5 * s, oy + 5.5 * s, { align: 'center' });
  doc.text('SALLE 3', ox + 25.5 * s, oy + 5.5 * s, { align: 'center' });
  doc.text('HALL', ox + 4 * s, oy + 15 * s, { align: 'center' });
  doc.text('COULOIR', ox + 19 * s, oy + 15 * s, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text('62 m² · travaux', ox + 16.5 * s, oy + 5.5 * s + 6, { align: 'center' });
  doc.text('58 m²', ox + 6 * s, oy + 5.5 * s + 6, { align: 'center' });
  doc.text('54 m²', ox + 25.5 * s, oy + 5.5 * s + 6, { align: 'center' });
  // dimension line
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.3); doc.line(ox, oy + 18 * s + 8, ox + 30 * s, oy + 18 * s + 8);
  doc.line(ox, oy + 18 * s + 5, ox, oy + 18 * s + 11); doc.line(ox + 30 * s, oy + 18 * s + 5, ox + 30 * s, oy + 18 * s + 11);
  doc.text('30,00 m', ox + 15 * s, oy + 18 * s + 6.5, { align: 'center' });
  // legend
  const lx = ox + 30 * s + 14; doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('LÉGENDE', lx, oy + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setFillColor(255, 238, 180); doc.rect(lx, oy + 9, 6, 4, 'F'); doc.text('Zone de travaux', lx + 9, oy + 12.2);
  doc.setDrawColor(90, 140, 190); doc.setLineWidth(1.1); doc.line(lx, oy + 19, lx + 6, oy + 19); doc.text('Menuiseries extérieures', lx + 9, oy + 20.2);
  doc.setDrawColor(...INK); doc.setLineWidth(1.6); doc.line(lx, oy + 27, lx + 6, oy + 27); doc.text('Murs porteurs', lx + 9, oy + 28.2);
  doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(['Indice B — 18/09/2026', 'Dessiné par : bureau (démo)'], lx, oy + 42);
  footer(doc);
  fs.writeFileSync(path.join(OUT, 'plan-rdc-demo.pdf'), Buffer.from(doc.output('arraybuffer')));
}
console.log('ok', fs.readdirSync(OUT));
