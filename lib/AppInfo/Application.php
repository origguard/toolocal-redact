<?php
declare(strict_types=1);

namespace OCA\ToolocalRedact\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\ToolocalRedact\Listener\LoadAdditionalScriptsListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Util;

/**
 * Le back-end ne fait qu'une chose : injecter le script front dans l'app Fichiers.
 *
 * Aucune route, aucun contrôleur, aucun accès serveur au contenu des fichiers.
 * Le PDF n'est jamais lu par PHP : il va de WebDAV au navigateur et revient.
 * C'est cette absence de traitement serveur qui fait qu'aucun composant n'est à
 * administrer — et qu'aucun sous-traitant n'apparaît.
 */
class Application extends App implements IBootstrap {
    public const APP_ID = 'toolocal_redact';

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void {
        $context->registerEventListener(
            LoadAdditionalScriptsEvent::class,
            LoadAdditionalScriptsListener::class
        );
    }

    public function boot(IBootContext $context): void {
        Util::addScript(self::APP_ID, self::APP_ID . '-main');
    }
}
