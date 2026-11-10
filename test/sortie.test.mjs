/* =============================================================================
   test/sortie.test.mjs — le moteur RÉEL, de bout en bout
   -----------------------------------------------------------------------------
   engine.test.mjs vérifie l'inspection et la détection, mais n'appelle jamais
   redactPdf : la fonction qui produit le fichier transmis n'avait aucun test.

   Ici, un PDF portant texte et métadonnées passe par redactPdf, et sa sortie
   est contrôlée : plus de texte, plus de métadonnées, plus rien de l'original.

   redactPdf dessine sur un <canvas>. Hors navigateur, node-canvas le fournit —
   dépendance de TEST uniquement, jamais embarquée dans l'application.

   CE QUE CE TEST NE VÉRIFIE PAS : l'emplacement des bandes noires. Hors
   navigateur, pdf.js ne dispose pas des polices standard et n'en dessine pas
   les glyphes — les avertissements « getPathGenerator » le signalent. L'image
   produite est donc presque blanche, et la couverture visuelle des termes ne
   peut pas être jugée ici. Elle se vérifie dans le navigateur, sur une vraie
   instance Nextcloud.

   Ce test établit ce qui ne dépend pas des pixels : rien de l'original et
   rien du traitement ne subsiste dans le fichier produit.
============================================================================= */
import { createCanvas } from 'canvas';
import { PDFDocument, PDFName, PDFDict, StandardFonts } from 'pdf-lib';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

globalThis.document = {
  createElement: (t) => {
    if (t === 'canvas') return createCanvas(1, 1);
    return {};
  },
  head: {
    appendChild: () => {},
    append: () => {},
  },
};

import '../src/vendor/pdf.worker.min.js';

const { redactPdf, getPdfJs } = await import('../src/engine/redact.js');
const pdfjs = getPdfJs();

let echecs = 0;
const test = (nom, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nom}${detail ? ' — ' + detail : ''}`);
  if (!cond) echecs++;
};

/* ---- un original réaliste : texte sur deux pages, métadonnées renseignées */
const src = await PDFDocument.create();
src.setTitle('Contrat Dupont — confidentiel');
src.setAuthor('Cabinet Durand');
src.setSubject('Pièce n° 14');
src.setKeywords(['Dupont', 'confidentiel']);
const f = await src.embedFont(StandardFonts.Helvetica);
for (let p = 0; p < 2; p++) {
  const pg = src.addPage([595, 842]);
  pg.drawText('Entre Monsieur Dupont, joignable au 06 12 34 56 78,', { x: 50, y: 780, size: 11, font: f });
  pg.drawText('virement sur le compte FR7630006000011234567890189.', { x: 50, y: 755, size: 11, font: f });
  pg.drawText('Ce paragraphe ne contient aucun terme sensible.', { x: 50, y: 730, size: 11, font: f });
}
const original = await src.save();

console.log('\n=== le moteur réel produit sa sortie ===');
const t0 = Date.now();
const sortie = await redactPdf(original, { terms: ['Dupont', '06 12 34 56 78', 'FR7630006000011234567890189'] });
console.log(`  ${sortie.length} octets en ${Date.now() - t0} ms`);

/* pdf.js S'APPROPRIE le tampon qu'on lui passe et le vide. Contrôler les
   octets après l'avoir appelé revenait à fouiller une chaîne vide : les
   recherches de termes passaient sans rien prouver. On fige donc une copie
   AVANT, et on exige qu'elle ait la taille du fichier produit. */
const brut = Buffer.from(sortie).toString('latin1');
test('le fichier contrôlé n\'est pas vide', brut.length === sortie.length && brut.length > 1000,
  `${brut.length} octets`);

/* ---- ce qui ne doit plus exister */
console.log('\n=== rien de l\'original ne passe ===');
const out = await PDFDocument.load(sortie, { updateMetadata: false });
const refInfo = out.context.trailerInfo.Info;
const info = refInfo ? out.context.lookup(refInfo, PDFDict) : null;
test('aucun dictionnaire de métadonnées', !info,
  info ? 'présent : ' + info.entries().map(([k]) => String(k)).join(' ') : '');
test('aucune date de traitement', !info || (!info.get(PDFName.of('CreationDate')) && !info.get(PDFName.of('ModDate'))));
test('aucun flux XMP', !out.catalog.get(PDFName.of('Metadata')));
test('même nombre de pages', out.getPageCount() === 2, `${out.getPageCount()} page(s)`);

/* ---- le texte : contrôle par pdf.js, indépendant de la construction */
const lu = await pdfjs.getDocument({ data: sortie.slice(), disableWorker: true, isEvalSupported: false }).promise;
let caracteres = 0;
for (let i = 1; i <= lu.numPages; i++) {
  const c = await (await lu.getPage(i)).getTextContent();
  caracteres += c.items.map((x) => x.str).join('').length;
}
test('aucun caractère extractible', caracteres === 0, `${caracteres} caractère(s)`);

for (const terme of ['Dupont', 'Durand', 'confidentiel', 'FR7630006000011234567890189']) {
  test(`« ${terme} » absent des octets`, !brut.includes(terme));
}
{ const n=(brut.match(/%%EOF/g) || []).length; test('une seule révision', n === 1 && !/\/Prev\s+\d+/.test(brut), n + ' marqueur(s) de fin'); }

console.log(echecs ? `\n  ${echecs} échec(s).\n` : '\n  Sortie conforme : rien de l\'original, rien du traitement.\n');
process.exit(echecs ? 1 : 0);
