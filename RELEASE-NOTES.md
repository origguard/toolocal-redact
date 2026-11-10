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
- **SHA-256**: `0ae334e79ccb17a0deb765bc9a716216b82e2166fdf92692f78bdeee4259248d`
- **SHA-512**: `6c0410bd2fe1183c551e0feae43cccc13725d5752ac267ea0c39a3b7494f98eedde10e5a9b2631d7f5af7ae5b9691cf97cf015efe38ae14cd434abbe32c4f735`
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
