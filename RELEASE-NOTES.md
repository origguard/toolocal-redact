# Toolocal Redact v0.2.1 - Official Release

## Summary / Résumé
- **EN**: Redact PDFs in Nextcloud without sending them to any third party. Strictly zero third-party sub-processors, zero external network requests. Compatible with Nextcloud Hub 33 to 35.
- **FR**: Caviardez vos documents PDF directement dans Nextcloud sans aucun transfert vers des tiers. Zéro sous-traitant, zéro requête externe. Compatible avec Nextcloud Hub 33 à 35.

## What's New in v0.2.1
- **Complete compatibility with modern Nextcloud Hub (33 to 35)**: PSR-14 `LoadAdditionalScriptsEvent` front-end registration.
- **Enhanced Sovereign Redaction Engine**:
  - Resilient multi-word term detection across complex PDF text-item splits and kerning.
  - Automatic GDPR / PII recognition (IBAN, Email, Phone numbers, French Social Security NIR).
  - Predefined sensitive corporate markers (Confidential, Secret, Statutory Work, Tenant, Migration Risk).
- **Live Visual Preview**: Instant highlighted overlays on canvas before applying permanent redaction.
- **Direct WebDAV Synchronization**: Native in-browser WebDAV save with automatic CSRF token injection and file list refresh.
- **Zero-DPA Auditability**: Shipped with `local-guard.json` and verified clean with 0 undeclared third-party network mechanisms.

## Package Integrity & Cryptography
- **Archive**: `toolocal_redact-0.2.1.tar.gz`
- **SHA-256**: `20cb462210096aa43a4121efdf1d97e8499a5f4d6b534d5e8efb2260798facf1`
- **SHA-512**: `045a935467dc58d8ef26c9a32813c7096e5dbfaf4c4617e1dee03fd4c12bd63fed03dbd10efaa93f458f0670c02909feb083bc8ffac93ced3ac2f7252e203aae`
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
