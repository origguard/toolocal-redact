# Toolocal Redact v0.3.0 - Official Release

## Summary / Résumé
- **EN**: Redact PDFs in Nextcloud without sending them to any third party. Strictly zero third-party sub-processors, zero external network requests. Compatible with Nextcloud Hub 33 to 35.
- **FR**: Caviardez vos documents PDF directement dans Nextcloud sans aucun transfert vers des tiers. Zéro sous-traitant, zéro requête externe. Compatible avec Nextcloud Hub 33 à 35.

## What's New in v0.3.0
- **Complete compatibility with modern Nextcloud Hub (33 to 35)**: PSR-14 `LoadAdditionalScriptsEvent` front-end registration.
- **Enhanced Sovereign Redaction Engine**:
  - Resilient multi-word term detection across complex PDF text-item splits and kerning.
  - Automatic GDPR / PII recognition (IBAN, Email, Phone numbers, French Social Security NIR).
  - Predefined sensitive corporate markers (Confidential, Secret, Statutory Work, Tenant, Migration Risk).
- **Live Visual Preview**: Instant highlighted overlays on canvas before applying permanent redaction.
- **Direct WebDAV Synchronization**: Native in-browser WebDAV save with automatic CSRF token injection and file list refresh.
- **Zero-DPA Auditability**: Shipped with `local-guard.json` and verified clean with 0 undeclared third-party network mechanisms.

## Package Integrity & Cryptography
- **Archive**: `toolocal_redact-0.3.0.tar.gz`
- **SHA-256**: `78e02ae987b0259d9ee07bf2c5e33b5fb9d73ad697000f743847d6a9ee5adbcc`
- **SHA-512**: `964ea42f09a5d4eb4055b05fa890737855de958f366df9899ba7c10526a3d992126951cf0d0ff7f0038f3762e79119ca34648d3e4f9f160bc7ae33e3c1305ecb`
- **RSA-SHA512 Signature**: See `toolocal_redact-0.3.0.tar.gz.sig`

## Installation
```bash
# Direct download into Nextcloud apps folder
cd /var/www/nextcloud/apps
curl -L -O https://github.com/origguard/toolocal-redact/releases/download/v0.3.0/toolocal_redact-0.3.0.tar.gz
tar -xzf toolocal_redact-0.3.0.tar.gz
rm toolocal_redact-0.3.0.tar.gz
occ app:enable toolocal_redact
```
