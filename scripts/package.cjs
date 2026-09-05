const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist-package');
const targetAppDir = path.join(distRoot, 'toolocal_redact');

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
  }
}

for (const d of dirsToCopy) {
  const src = path.join(root, d);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(targetAppDir, d), { recursive: true });
  }
}

const jsDir = path.join(targetAppDir, 'js');
if (fs.existsSync(jsDir)) {
  for (const f of fs.readdirSync(jsDir)) {
    if (f.endsWith('.map')) {
      fs.unlinkSync(path.join(jsDir, f));
    }
  }
}

const archivePath = path.join(root, 'toolocal_redact-0.1.0.tar.gz');
execSync(`tar -czf "${archivePath}" -C "${distRoot}" toolocal_redact`);

const listOutput = execSync(`tar -tzf "${archivePath}"`).toString();
console.log('Archive contents:');
console.log(listOutput);

fs.rmSync(distRoot, { recursive: true, force: true });
console.log('SUCCESS: toolocal_redact-0.1.0.tar.gz generated successfully!');
