import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'package.json');
const bump = process.argv[2];

if (!bump) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>');
  process.exit(1);
}

function parseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid semver: ${version}`);
  return match.slice(1).map(Number);
}

function nextVersion(current, type) {
  const [major, minor, patch] = parseVersion(current);
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'major') return `${major + 1}.0.0`;
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  throw new Error(`Unsupported version bump: ${type}`);
}

function runNodeScript(script) {
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const next = nextVersion(packageJson.version, bump);
packageJson.version = next;
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Updated package.json version to ${next}`);

runNodeScript('scripts/sync-version.mjs');
runNodeScript('scripts/validate.mjs');
