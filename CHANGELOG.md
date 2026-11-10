# Changelog

## 0.3.0 — 2026-11-10

### Aller-retour WebDAV par le client officiel
- L'acces WebDAV passe par `getClient()` de `@nextcloud/files` v4 au lieu d'URL ecrites a la main. Quatre defauts de la 0.2.1 disparaissent : l'adresse DAV absolue qui echouait sur une instance installee dans un sous-dossier ; `encodeURI()` qui laissait passer `#` et `?` et tronquait un nom de fichier ; le PUT qui ecrasait sans prevenir une version caviardee anterieure ; et `fileList.reload()`, l'API de l'ancienne app Fichiers, a cause de laquelle le fichier etait enregistre mais n'apparaissait pas depuis Nextcloud 28 — l'utilisateur croyait a un echec.
- Le nom de sortie est calcule avant ecriture et `overwrite: false` sert de second filet. Une version caviardee deja verifiee et transmise n'est jamais remplacee en silence.
- Les erreurs serveur deviennent des phrases lisibles : 401, 403, 404, 412 et 507.

### Rien du traitement ne passe dans la sortie
- `PDFDocument.create({ updateMetadata: false })`. Sans ce drapeau, pdf-lib inscrivait `CreationDate`, `ModDate` et son propre nom : le document caviarde portait la date et l'heure exactes du traitement.
- Controle mecanique sur une sortie reelle : aucun dictionnaire de metadonnees, aucune date de traitement, aucun flux XMP, zero caractere extractible, une seule revision, et les chaines sensibles de l'original absentes des octets. `npm run test:sortie` le constate, et `scripts/verifier-sortie.mjs` le fait sur un fichier quelconque.

### Conformite
- `COPYING` contient desormais le texte integral de l'AGPL-3.0. Il n'en portait qu'un en-tete de quatre lignes.
- Compatibilite declaree **33 a 35**, les trois versions encore prises en charge. Le manifeste annonçait 30 a 38 et le paquet publie 33 a 34 ; trois chiffres se contredisaient. Le packager **lit** maintenant ces bornes dans le manifeste au lieu de les recopier, donc l'ecart ne peut plus revenir.
- La commande de verification publique est epinglee sur `@origguard-web/local-guard@2`. Sans numero elle prenait `latest`, donc la promesse dependait d'une version future. Depuis la 2.0.0 de cet outil, aucune exception declaree ne peut blanchir un appel vers une origine tierce.

### Dialogue : limites affichees, lisibilite, garde-fous
Defauts constates a l'essai humain sur Nextcloud 33, avant toute publication.
- **Limites de l'outil affichees en tete du dialogue**, en encadre : recherche litterale, pas d'OCR, l'outil applique des regles et ne juge pas, relecture humaine indispensable, jeu de test qui est le notre.
- **Texte illisible en theme sombre.** Des fonds clairs etaient ecrits en dur et le texte heritait la couleur du theme : clair sur clair. Les couleurs suivent maintenant les variables du theme Nextcloud, et aucun fond n'est pose sans la couleur du texte qui va dessus.
- **Apercu coupe.** Le haut de la page etait hors d'atteinte (centrage flex dans une zone defilante) : les zones detectees etaient invisibles et la detection semblait ne pas fonctionner. L'apercu s'ajuste a la largeur et defile depuis le haut.
- **Decompte sur le document entier**, et non plus sur la seule page affichee.
- **Pages sans texte lisible signalees nommement** (scan, image) : la detection automatique n'y voit rien, il faut tracer a la main.
- **Caviardage bloque, avec la raison ecrite**, tant qu'il n'y a rien a noircir, tant que l'apercu n'a pas pu s'afficher, et tant que la case de relecture n'est pas cochee. Auparavant on pouvait produire un fichier « -redacted » sans rien de noirci.
- Le bouton « Tout caviarder », qui ne faisait rien de plus que « Appliquer », est retire.
- Le message de fin donne le nombre de zones noircies et rappelle de relire le fichier avant de le transmettre.

### Perimetre
- L'application fait une chose : caviarder un PDF. La suite Toolocal n'y est pas incluse et ne le sera pas ; seuls les motifs de detection des donnees personnelles sont communs, pas le code.

## 0.2.1 — 2026-09-10
- Conformité officielle avec l'API @nextcloud/files v4 (Nextcloud 33 et 34).
- Utilisation de la signature d'action déstructurée `exec({ nodes, view })`.
- Conditionnement de l'action à `Permission.WRITE` (droit d'écriture effectif sur le fichier).
- Caviardage local destructif exécuté à 100% dans le navigateur via WebDAV local.
- Zéro sous-traitant, zéro requête externe : vérifié par `local-guard.mjs`.
