#!/usr/bin/env node
/* =============================================================================
   scripts/verifier-sortie.mjs — contrôle d'un PDF produit par toolocal_redact
   -----------------------------------------------------------------------------
   Le moteur ne retouche pas le document d'origine : il en reconstruit un neuf à
   partir des pages rendues en image. Rien de l'original ne devrait donc passer
   — ni texte, ni métadonnées, ni pièce jointe, ni annotation.

   « Devrait » ne suffit pas. Ce script le constate sur un fichier réel.

       node scripts/verifier-sortie.mjs contrat-redacted.pdf [autre.pdf …]

   Code de sortie : 0 si tous les fichiers passent, 1 sinon — utilisable en CI.

   Il emploie pdf-lib, déjà dépendance de l'application : rien à installer.

   CE QU'IL NE VÉRIFIE PAS : que le caviardage soit COMPLET. Il établit que
   le fichier ne porte plus de texte ; il ne sait pas quels termes devaient
   disparaître. Un nom abrégé échappé à la recherche est effacé des pixels
   seulement s'il a été trouvé — la relecture reste nécessaire.
============================================================================= */

import fs from 'node:fs';
import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef } from 'pdf-lib';

const V = '\x1b[32m', R = '\x1b[31m', J = '\x1b[33m', D = '\x1b[2m', F = '\x1b[0m';

function decoder(flux) {
  const filtre = flux.dict.get(PDFName.of('Filter'));
  const brut = Buffer.from(flux.contents);
  if (!filtre) return brut;
  const noms = filtre instanceof PDFArray ? filtre.asArray().map(String) : [String(filtre)];
  if (noms.length === 1 && noms[0] === '/FlateDecode') {
    try { return zlib.inflateSync(brut); } catch { return brut; }
  }
  return null;   // filtre inconnu : on ne conclut pas à l'absence de texte
}

async function controler(chemin) {
  const octets = fs.readFileSync(chemin);
  const verdicts = [];
  const ok = (quoi, detail) => verdicts.push({ ok: true, quoi, detail });
  const ko = (quoi, detail) => verdicts.push({ ok: false, quoi, detail });

  /* 1. Une seule révision. Une mise à jour incrémentale conserverait
        l'ancienne version du fichier, lisible par tout outil forensique. */
  const eof = (octets.toString('latin1').match(/%%EOF/g) || []).length;
  const prev = /\/Prev\s+\d+/.test(octets.toString('latin1'));
  eof === 1 && !prev
    ? ok('une seule révision')
    : ko('révisions multiples', `${eof} fin(s) de fichier${prev ? ', /Prev présent' : ''}`);

  /* updateMetadata: false — la lecture ne doit rien ajouter au fichier. */
  const doc = await PDFDocument.load(octets, { updateMetadata: false, ignoreEncryption: true });
  const ctx = doc.context;
  const cat = doc.catalog;

  /* 2. Dictionnaire de métadonnées. Absent ou entièrement vide. */
  const refInfo = ctx.trailerInfo.Info;
  const info = refInfo ? ctx.lookup(refInfo, PDFDict) : null;
  if (!info) ok('aucune métadonnée', 'dictionnaire absent');
  else {
    const remplis = [];
    for (const [k, v] of info.entries()) {
      const txt = typeof v.decodeText === 'function' ? v.decodeText() : String(v);
      if (txt && txt !== '()' && txt !== '<>' && txt.replace(/[()<>]/g, '').trim()) {
        remplis.push(`${k.toString().slice(1)} = ${txt.slice(0, 40)}`);
      }
    }
    remplis.length === 0
      ? ok('aucune métadonnée', 'champs présents mais vides')
      : ko('métadonnées renseignées', remplis.join(' · '));
  }

  /* 3. Flux XMP : peut porter l'historique complet du document d'origine. */
  cat.get(PDFName.of('Metadata'))
    ? ko('flux XMP présent', 'métadonnées étendues')
    : ok('aucun flux XMP');

  /* 4. Éléments du catalogue qui ne devraient pas exister dans un PDF
        reconstruit à partir d'images. */
  const intrus = [];
  for (const n of ['AcroForm', 'Names', 'OpenAction', 'Outlines', 'AA']) {
    if (cat.get(PDFName.of(n))) intrus.push(n);
  }
  intrus.length === 0
    ? ok('ni formulaire, ni pièce jointe, ni script, ni signet')
    : ko('éléments hérités', intrus.join(', '));

  /* 5. Page par page : aucune police, aucun opérateur de texte, aucune
        annotation, au moins une image. */
  const pages = doc.getPages();
  let polices = 0, texte = 0, annots = 0, sansImage = 0, illisibles = 0;
  pages.forEach((p) => {
    /* pdf-lib crée un dictionnaire de polices VIDE et un tableau d'annotations
       VIDE sur chaque page. On juge le contenu, pas la présence de la clé :
       sinon tout fichier produit par le moteur échouerait à tort. */
    const res = p.node.Resources();
    const fo = res && res.lookup(PDFName.of('Font'));
    if (fo instanceof PDFDict && fo.entries().length > 0) polices++;
    const xo = res && res.lookup(PDFName.of('XObject'));
    if (!xo || !(xo instanceof PDFDict) || xo.entries().length === 0) sansImage++;
    const an = p.node.lookup(PDFName.of('Annots'));
    if (an instanceof PDFArray && an.size() > 0) annots++;

    let contenus = p.node.Contents();
    const flux = contenus instanceof PDFArray
      ? contenus.asArray().map((r) => ctx.lookup(r))
      : [contenus];
    for (const f of flux) {
      if (!(f instanceof PDFRawStream)) continue;
      const d = decoder(f);
      if (d === null) { illisibles++; continue; }
      if (/(^|\s)BT(\s|$)/.test(d.toString('latin1'))) texte++;
    }
  });

  polices === 0 ? ok('aucune police') : ko('polices présentes', `${polices} page(s)`);
  texte === 0
    ? ok('aucun opérateur de texte', `${pages.length} page(s)`)
    : ko('texte présent', `${texte} page(s) contiennent du texte extractible`);
  annots === 0 ? ok('aucune annotation') : ko('annotations présentes', `${annots} page(s)`);
  sansImage === 0
    ? ok('chaque page est une image rendue')
    : ko('pages sans image', `${sansImage} page(s) — construction inattendue`);
  if (illisibles) ko('flux non décodables', `${illisibles} — le texte n'a pas pu être contrôlé`);

  return { chemin, pages: pages.length, verdicts };
}

/* ------------------------------------------------------------------ rapport */

const fichiers = process.argv.slice(2);
if (!fichiers.length) {
  console.log('\n  node scripts/verifier-sortie.mjs <fichier.pdf> [autres…]\n');
  process.exit(1);
}

let echec = false;
for (const f of fichiers) {
  let r;
  try { r = await controler(f); }
  catch (e) {
    console.log(`\n  ${R}✗ ${f}${F}\n    illisible : ${e.message}`);
    echec = true; continue;
  }
  const bons = r.verdicts.filter((v) => v.ok).length;
  const tout = r.verdicts.length;
  const passe = bons === tout;
  if (!passe) echec = true;
  console.log(`\n  ${passe ? V + '✓' : R + '✗'} ${f}${F}  ${D}${r.pages} page(s) · ${bons}/${tout}${F}`);
  for (const v of r.verdicts) {
    console.log(`    ${v.ok ? V + '✓' : R + '✗'}${F} ${v.quoi}${v.detail ? D + ' — ' + v.detail + F : ''}`);
  }
}
console.log(`\n  ${D}Ce contrôle établit que le fichier ne porte plus rien de l'original.`);
console.log(`  Il n'établit pas que le caviardage soit complet : la relecture reste nécessaire.${F}\n`);
process.exit(echec ? 1 : 0);
