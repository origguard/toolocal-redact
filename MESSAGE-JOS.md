# Recontacter Nextcloud — quand et comment

## Quand

**Pas avant que l'application soit publiée et fonctionnelle.** Jos a dit exactement ça : il n'investit pas de temps sur une promesse. Un second message avant la publication brûle le seul contact que tu aies.

## Le message, une fois l'app en ligne

> **Subject — Nextcloud app: local PDF redaction, no third party**
>
> Hi Jos,
>
> Following your note, we built it rather than asked: a Nextcloud app that redacts PDFs client-side. Right-click a PDF in Files, redact, save back. <link to the app store listing>
>
> Two things that may matter to your team:
>
> No server component — nothing for the admin to deploy or maintain, unlike the office suites.
>
> No third party touches the file. It goes from the instance to the browser and back over WebDAV. We made that verifiable rather than claimed: the package is self-contained, and anyone can check it on their own installation with a single command — `npx @origguard-web/local-guard --target apps/toolocal_redact/js`. Any call to a third-party origin makes it fail. The only declared exception is WebDAV against the user's own instance.
>
> For public-sector deployments this removes the sub-processor question entirely.
>
> No ask attached — if it's useful to your users, we'd welcome a mention whenever it suits you.
>
> Emmanuel

## Pourquoi ce message et pas un autre

- **Il n'attend rien.** « No ask attached » retire la pression, ce qui rend un retweet plus probable, pas moins.
- **Il donne à son équipe commerciale un argument utilisable** — « aucun sous-traitant » est ce que leurs prospects du secteur public demandent, pas ce que toi tu veux vendre.
- **Il rend la promesse vérifiable en une commande.** C'est ce qui te distingue de toutes les autres intégrations qu'ils reçoivent.

## Ce qu'il ne faut PAS écrire

| Ne pas écrire | Pourquoi |
|---|---|
| « validée par Nextcloud », « intégrée à l'écosystème » | publier sur un app store ouvert n'est pas une validation |
| « vous vous étiez engagé à relayer » | il a écrit *might*. Le lui rappeler ferme la porte |
| « WebAssembly » | seulement si c'en est vraiment. Vérifie avant |
| une demande de webinaire ou de partenariat | il a dit : ça vient **si leurs clients** le demandent. Pas de toi |

## Ce que tu peux dire au Web Summit, dès maintenant

> Nous construisons une intégration Nextcloud pour le caviardage local, après un échange avec leur co-fondateur.

Vrai, vérifiable, et déjà un signal fort. Rien de plus tant que l'app n'est pas publiée.
