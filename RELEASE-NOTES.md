# Toolocal Redact v0.2.0 - Official Release

## Summary / Résumé
- **EN**: Redact PDFs in Nextcloud without sending them to any third party. Strictly zero third-party sub-processors, zero external network requests. Compatible with Nextcloud Hub 30 to 38.
- **FR**: Caviardez vos documents PDF directement dans Nextcloud sans aucun transfert vers des tiers. Zéro sous-traitant, zéro requête externe. Compatible avec Nextcloud Hub 30 à 38.

## What's New in v0.2.0
- **Complete compatibility with modern Nextcloud Hub (30 to 38+)**: PSR-14 `LoadAdditionalScriptsEvent` front-end registration.
- **Enhanced Sovereign Redaction Engine**:
  - Resilient multi-word term detection across complex PDF text-item splits and kerning.
  - Automatic GDPR / PII recognition (IBAN, Email, Phone numbers, French Social Security NIR).
  - Predefined sensitive corporate markers (Confidential, Secret, Statutory Work, Tenant, Migration Risk).
- **Live Visual Preview**: Instant highlighted overlays on canvas before applying permanent redaction.
- **Direct WebDAV Synchronization**: Native in-browser WebDAV save with automatic CSRF token injection and file list refresh.
- **Zero-DPA Auditability**: Shipped with `local-guard.json` and verified clean with 0 undeclared third-party network mechanisms.

## Package Integrity & Cryptography
- **Archive**: `toolocal_redact-0.2.0.tar.gz`
- **SHA-256**: `3d3998cee237882e0b83178f4c99f8325e105eac70163a97aac3361cdafb7d3e`
- **SHA-512**: `f33a46ee6693361b63b7b10cbb89664270967e9cf795797db580433fcaf4644e467ccf45f5cc995f2224752b1aeb20df537d42f252f6fecc8ec463e8423d2685`
- **RSA-SHA512 Signature**: See `toolocal_redact-0.2.0.tar.gz.sig`

## Installation
```bash
# Direct download into Nextcloud apps folder
cd /var/www/nextcloud/apps
curl -L -O https://github.com/origguard/toolocal-redact/releases/download/v0.2.0/toolocal_redact-0.2.0.tar.gz
tar -xzf toolocal_redact-0.2.0.tar.gz
rm toolocal_redact-0.2.0.tar.gz
occ app:enable toolocal_redact
```
