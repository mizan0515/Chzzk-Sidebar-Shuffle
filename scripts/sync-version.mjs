import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'package.json');
const manifestPath = join(root, 'manifest.json');

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid package version for extension manifest: ${version}`);
  process.exit(1);
}

manifest.version = version;

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Synced manifest.json version to ${version}`);
