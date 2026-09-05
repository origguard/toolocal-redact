# Toolocal Redact — application Nextcloud

Caviarder un PDF depuis Nextcloud, **sans qu'il aille chez un tiers**.

Clic droit sur un PDF dans Fichiers → *Caviarder* → le fichier est lu par WebDAV, traité **dans le navigateur**, réécrit par WebDAV. Aucun service externe n'intervient, aucun serveur supplémentaire n'est requis côté administrateur.

---

## La formulation exacte de la promesse

C'est le point le plus important du projet, et il diffère de celui de toolocal.tech.

| ❌ Ne pas écrire | ✅ Écrire |
|---|---|
| « Le fichier ne quitte jamais l'appareil » | « Le fichier ne circule qu'entre votre instance Nextcloud et votre navigateur » |
| « Aucune requête réseau » | « Aucun tiers ne reçoit le fichier. Aucun sous-traitant. Aucun DPA. » |

Le fichier **vient** d'un serveur : celui du client. Le prétendre local serait faux, et un DPO le verrait immédiatement. Ce qui a de la valeur pour lui, ce n'est pas l'absence de serveur — c'est **l'absence de tiers**.

## La condition technique qui rend la promesse vraie

**Le paquet doit être entièrement autonome.** Aucun script chargé depuis `toolocal.tech`, aucune police CDN, aucun WASM distant.

Si le paquet charge quoi que ce soit depuis tes serveurs :
- le client dépend de ta disponibilité ;
- il peut recevoir du code différent d'un jour à l'autre ;
- ton nom entre dans sa chaîne de sous-traitance, et le DPA revient.

L'argument s'effondre entièrement. **C'est la seule règle non négociable de ce dépôt.**

## Comment elle est vérifiée, pas affirmée

```bash
npx @origguard-web/local-guard --target js
```

`local-guard.json` déclare **une seule** exception : les appels WebDAV vers l'instance de l'utilisateur, avec leur motif. Tout appel vers une origine tierce fait échouer la CI.

La commande est dans le README public de l'application : un administrateur peut la lancer lui-même sur le paquet qu'il vient d'installer.

## Périmètre — volontairement minuscule

**Un seul outil : le caviardage.** Pas les 111. Une application qui fait une chose et la fait de façon vérifiable passe la revue de sécurité ; une suite complète ne la passe pas au premier essai.

## Architecture

```
appinfo/info.xml              déclaration de l'app
lib/AppInfo/Application.php   enregistrement du script front
src/fileaction.js             action « Caviarder » sur les PDF
src/redact-view.js            la vue de caviardage — LA frontière d'isolation
js/                           sortie de build : c'est ELLE qui est contrôlée
local-guard.json              l'unique exception, avec son motif
```

> **Attention aux versions.** Les API front de Nextcloud (`@nextcloud/files`, `registerFileAction`) évoluent d'une version majeure à l'autre. Ce squelette vise Nextcloud 30+. Vérifie contre la documentation de ta version cible avant de coder — c'est le premier endroit où ce genre de squelette se périme.
