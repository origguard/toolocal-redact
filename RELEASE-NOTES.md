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
- **SHA-256**: `1d7d453140535f5266bd99ef6e33bc038ad216805280cebf2a7119a2d0a74616`
- **SHA-512**: `e8cc7b4f2bc219550de9a5c54ef19db8ec1dd15ff494183854acbb6d663a7a898c75981e4ab85916881d7269b24acc5209c69dad333e26331402f06f5b9ab0a5`
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
