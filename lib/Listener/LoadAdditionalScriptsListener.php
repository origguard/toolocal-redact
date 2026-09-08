<?php
declare(strict_types=1);

namespace OCA\ToolocalRedact\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Charge le script de caviardage souverain lors de l'initialisation de l'application Fichiers.
 */
class LoadAdditionalScriptsListener implements IEventListener {
    public function handle(Event $event): void {
        if (!($event instanceof LoadAdditionalScriptsEvent)) {
            return;
        }

        Util::addScript('toolocal_redact', 'toolocal_redact-main');
    }

    public function __invoke(Event $event): void {
        $this->handle($event);
    }
}
