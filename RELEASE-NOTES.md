# Toolocal Redact v0.2.1 - Official Release

## Summary / Résumé
- **EN**: Redact PDFs in Nextcloud without sending them to any third party. Strictly zero third-party sub-processors, zero external network requests. Compatible with Nextcloud Hub 30 to 38.
- **FR**: Caviardez vos documents PDF directement dans Nextcloud sans aucun transfert vers des tiers. Zéro sous-traitant, zéro requête externe. Compatible avec Nextcloud Hub 30 à 38.

## What's New in v0.2.1
- **Complete compatibility with modern Nextcloud Hub (30 to 38+)**: PSR-14 `LoadAdditionalScriptsEvent` front-end registration.
- **Enhanced Sovereign Redaction Engine**:
  - Resilient multi-word term detection across complex PDF text-item splits and kerning.
  - Automatic GDPR / PII recognition (IBAN, Email, Phone numbers, French Social Security NIR).
  - Predefined sensitive corporate markers (Confidential, Secret, Statutory Work, Tenant, Migration Risk).
- **Live Visual Preview**: Instant highlighted overlays on canvas before applying permanent redaction.
- **Direct WebDAV Synchronization**: Native in-browser WebDAV save with automatic CSRF token injection and file list refresh.
- **Zero-DPA Auditability**: Shipped with `local-guard.json` and verified clean with 0 undeclared third-party network mechanisms.

## Package Integrity & Cryptography
- **Archive**: `toolocal_redact-0.2.1.tar.gz`
- **SHA-256**: `7d562ff4bd4e76ff345bf143c5b2f90b839b664459b02d32ad23c5bd934e588e`
- **SHA-512**: `ae1635995135e7942a014d0a5e302b0d847a7fedd5913fed89f08bf93cb1a74484296fd7fb96959ff52ce339512895764b948b20a51dbdf9f99e0528604eaab5`
- **RSA-SHA512 Signature**: See `toolocal_redact-0.2.1.tar.gz.sig`

## Installation
```bash
# Direct download into Nextcloud apps folder
cd /var/www/nextcloud/apps
curl -L -O https://github.com/origguard/toolocal-redact/releases/download/v0.2.1/toolocal_redact-0.2.1.tar.gz
tar -xzf toolocal_redact-0.2.1.tar.gz
rm toolocal_redact-0.2.1.tar.gz
occ app:enable toolocal_redact
```
