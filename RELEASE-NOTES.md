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
- **SHA-256**: `c01258c4f22dbf38963e1ad4fd206b0413b35a268c852efb03bec88b85e158e9`
- **SHA-512**: `4a1fbaa0cef1578310e1a0c6ab1035891dcc583e9381e39855a75824ea49316dc01533d5f61bc6762df95896a4b233a5e7871ec7e7f886d06d97ad429df41aa5`
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
