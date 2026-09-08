const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist-package');
const targetAppDir = path.join(distRoot, 'toolocal_redact');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const appId = pkg.name;

console.log(`=======================================================`);
console.log(`  PACKAGING NEXTCLOUD APP: ${appId} v${version}`);
console.log(`=======================================================\n`);

// 1. Validation & Cleanliness checks
const forbiddenFiles = ['MESSAGE-JOS.md', '.env', 'id_rsa'];
for (const forbidden of forbiddenFiles) {
  if (fs.existsSync(path.join(root, forbidden))) {
    console.error(`ERROR: Forbidden file detected in repository root: ${forbidden}`);
    process.exit(1);
  }
}

const infoXmlPath = path.join(root, 'appinfo', 'info.xml');
const infoXml = fs.readFileSync(infoXmlPath, 'utf8');
if (!infoXml.includes(`<version>${version}</version>`)) {
  console.error(`ERROR: info.xml version does not match package.json version (${version})`);
  process.exit(1);
}

// 2. Prepare staging directory
if (fs.existsSync(distRoot)) {
  fs.rmSync(distRoot, { recursive: true, force: true });
}
fs.mkdirSync(targetAppDir, { recursive: true });

const filesToCopy = ['README.md', 'COPYING', 'local-guard.json'];
const dirsToCopy = ['appinfo', 'img', 'js', 'lib'];

for (const f of filesToCopy) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(targetAppDir, f));
  } else {
    console.warn(`Warning: file not found: ${f}`);
  }
}

for (const d of dirsToCopy) {
  const src = path.join(root, d);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(targetAppDir, d), { recursive: true });
  } else {
    console.warn(`Warning: directory not found: ${d}`);
  }
}

// Strip source maps from distribution
const jsDir = path.join(targetAppDir, 'js');
if (fs.existsSync(jsDir)) {
  for (const f of fs.readdirSync(jsDir)) {
    if (f.endsWith('.map')) {
      fs.unlinkSync(path.join(jsDir, f));
    }
  }
}

// 3. Create tar.gz archive
const archiveName = `${appId}-${version}.tar.gz`;
const archivePath = path.join(root, archiveName);
if (fs.existsSync(archivePath)) {
  fs.unlinkSync(archivePath);
}

console.log(`1. Generating archive: ${archiveName}...`);
execSync(`tar -czf "${archivePath}" -C "${distRoot}" toolocal_redact`);

const archiveBuffer = fs.readFileSync(archivePath);
const archiveSize = archiveBuffer.length;
console.log(`   ✓ Archive created (${(archiveSize / 1024).toFixed(1)} KB)`);

// 4. Calculate Checksums
const sha256 = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
const sha512 = crypto.createHash('sha512').update(archiveBuffer).digest('hex');

fs.writeFileSync(path.join(root, `${archiveName}.sha256`), `${sha256}  ${archiveName}\n`);
fs.writeFileSync(path.join(root, `${archiveName}.sha512`), `${sha512}  ${archiveName}\n`);
console.log(`2. Checksums generated:`);
console.log(`   SHA256: ${sha256}`);
console.log(`   SHA512: ${sha512.substring(0, 48)}...`);

// 5. Cryptographic Signing
const keyPath = path.join(root, '.certs', 'toolocal_redact.key');
if (!fs.existsSync(keyPath)) {
  console.error(`ERROR: Private key not found at ${keyPath}`);
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
const pubKeyObj = crypto.createPublicKey(privateKeyPem);
const pubKeyPem = pubKeyObj.export({ type: 'spki', format: 'pem' });

// 5a. Release Archive Signature (RSA-SHA512 over tar.gz)
const archiveSigner = crypto.createSign('RSA-SHA512');
archiveSigner.update(archiveBuffer);
const archiveSignature = archiveSigner.sign(privateKeyPem, 'base64');

const sigPath = path.join(root, `${archiveName}.sig`);
fs.writeFileSync(sigPath, archiveSignature + '\n');
console.log(`3. Release archive RSA-SHA512 signature generated (${archiveSignature.length} chars)`);

// Verify archive signature
const archiveVerifier = crypto.createVerify('RSA-SHA512');
archiveVerifier.update(archiveBuffer);
if (!archiveVerifier.verify(pubKeyPem, archiveSignature, 'base64')) {
  console.error('ERROR: Cryptographic self-verification of release archive signature failed!');
  process.exit(1);
}
console.log(`   ✓ Archive signature verified with public key.`);

// 5b. App ID Ownership Signature (RSA-SHA512 over string "APP_ID" for apps.nextcloud.com/developer/apps/new)
const appIdSigner = crypto.createSign('RSA-SHA512');
appIdSigner.update(appId);
const appIdSignature = appIdSigner.sign(privateKeyPem, 'base64');

const appIdSigPath = path.join(root, `${appId}.app_id.sig`);
fs.writeFileSync(appIdSigPath, appIdSignature + '\n');
console.log(`4. App ID ownership signature generated (${appIdSignature.length} chars)`);

const appIdVerifier = crypto.createVerify('RSA-SHA512');
appIdVerifier.update(appId);
if (!appIdVerifier.verify(pubKeyPem, appIdSignature, 'base64')) {
  console.error('ERROR: Cryptographic self-verification of App ID signature failed!');
  process.exit(1);
}
console.log(`   ✓ App ID ownership signature verified with public key.`);

// 6. Generate Release Notes & Submission Metadata
const downloadUrl = `https://github.com/origguard/toolocal-redact/releases/download/v${version}/${archiveName}`;

const submissionPayload = {
  app_id: appId,
  version: version,
  app_registration: {
    instruction: "Required only once when registering the app on https://apps.nextcloud.com/developer/apps/new",
    url: "https://apps.nextcloud.com/developer/apps/new",
    app_id: appId,
    signature: appIdSignature,
    csr_file: ".certs/toolocal_redact.csr",
    certificate_request_repo: "https://github.com/nextcloud/app-certificate-requests/tree/master/toolocal_redact"
  },
  release_upload: {
    instruction: "Required for every release on https://apps.nextcloud.com/developer/apps/releases/new",
    url: "https://apps.nextcloud.com/developer/apps/releases/new",
    download_url: downloadUrl,
    signature: archiveSignature,
    is_nightly: false
  },
  integrity: {
    tarball_filename: archiveName,
    tarball_size_bytes: archiveSize,
    sha256: sha256,
    sha512: sha512
  },
  compatibility: {
    min_nextcloud_version: 30,
    max_nextcloud_version: 38,
    licence: "agpl"
  },
  generated_at: new Date().toISOString()
};

fs.writeFileSync(path.join(root, 'submission-metadata.json'), JSON.stringify(submissionPayload, null, 2));

const releaseNotes = `# Toolocal Redact v${version} - Official Release

## Summary / Résumé
- **EN**: Redact PDFs in Nextcloud without sending them to any third party. Strictly zero third-party sub-processors, zero external network requests. Compatible with Nextcloud Hub 30 to 38.
- **FR**: Caviardez vos documents PDF directement dans Nextcloud sans aucun transfert vers des tiers. Zéro sous-traitant, zéro requête externe. Compatible avec Nextcloud Hub 30 à 38.

## What's New in v${version}
- **Complete compatibility with modern Nextcloud Hub (30 to 38+)**: PSR-14 \`LoadAdditionalScriptsEvent\` front-end registration.
- **Enhanced Sovereign Redaction Engine**:
  - Resilient multi-word term detection across complex PDF text-item splits and kerning.
  - Automatic GDPR / PII recognition (IBAN, Email, Phone numbers, French Social Security NIR).
  - Predefined sensitive corporate markers (Confidential, Secret, Statutory Work, Tenant, Migration Risk).
- **Live Visual Preview**: Instant highlighted overlays on canvas before applying permanent redaction.
- **Direct WebDAV Synchronization**: Native in-browser WebDAV save with automatic CSRF token injection and file list refresh.
- **Zero-DPA Auditability**: Shipped with \`local-guard.json\` and verified clean with 0 undeclared third-party network mechanisms.

## Package Integrity & Cryptography
- **Archive**: \`${archiveName}\`
- **SHA-256**: \`${sha256}\`
- **SHA-512**: \`${sha512}\`
- **RSA-SHA512 Signature**: See \`${archiveName}.sig\`

## Installation
\`\`\`bash
# Direct download into Nextcloud apps folder
cd /var/www/nextcloud/apps
curl -L -O ${downloadUrl}
tar -xzf ${archiveName}
rm ${archiveName}
occ app:enable toolocal_redact
\`\`\`
`;

fs.writeFileSync(path.join(root, 'RELEASE-NOTES.md'), releaseNotes);

// Clean up temporary staging
fs.rmSync(distRoot, { recursive: true, force: true });

console.log(`\n=======================================================`);
console.log(`  PACKAGING COMPLETE & READY FOR SUBMISSION!`);
console.log(`=======================================================`);
console.log(`Archive:    ${archivePath}`);
console.log(`Signature:  ${sigPath}`);
console.log(`Metadata:   ${path.join(root, 'submission-metadata.json')}`);
console.log(`Notes:      ${path.join(root, 'RELEASE-NOTES.md')}\n`);

