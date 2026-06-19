import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'all';
const targets = target === 'all' ? ['chrome', 'whale'] : [target];

if (!targets.every(item => ['chrome', 'whale'].includes(item))) {
  console.error('Usage: node scripts/build.mjs [chrome|whale|all]');
  process.exit(1);
}

const baseManifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const version = baseManifest.version;
const distRoot = join(root, 'dist');
const artifactsRoot = join(root, 'artifacts');

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyFileTo(file, outDir) {
  const from = join(root, file);
  const to = join(outDir, file);
  ensureDir(dirname(to));
  cpSync(from, to);
}

function manifestFor(browser) {
  const manifest = JSON.parse(JSON.stringify(baseManifest));
  delete manifest.action;
  delete manifest.sidebar_action;

  if (browser === 'chrome') {
    manifest.action = {
      default_popup: 'popup.html',
      default_icon: {
        16: 'assets/icons/icon-16.png',
        32: 'assets/icons/icon-32.png',
        48: 'assets/icons/icon-48.png',
        128: 'assets/icons/icon-128.png'
      }
    };
  } else {
    manifest.sidebar_action = {
      default_page: 'sidebar.html',
      default_icon: { 16: 'assets/icons/icon-16.png' },
      default_title: '치지직 티어 정렬',
      use_navigation_bar: false,
      mobile_user_agent: false
    };
  }

  return manifest;
}

function zipDirectory(sourceDir, zipPath) {
  rmSync(zipPath, { force: true });
  ensureDir(dirname(zipPath));

  if (process.platform === 'win32') {
    const command = `Compress-Archive -Path '${sourceDir.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    return;
  }

  const result = spawnSync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

function build(browser) {
  const outDir = join(distRoot, browser);
  const unpackedArtifactDir = join(artifactsRoot, `chzzk-sidebar-shuffler-${browser}-v${version}`);
  rmSync(outDir, { recursive: true, force: true });
  rmSync(unpackedArtifactDir, { recursive: true, force: true });
  ensureDir(outDir);

  [
    'icon.png',
    'popup.html',
    'popup.js',
    'sidebar.html',
    'sidebar.css',
    'sidebar.js',
    'content.js'
  ].forEach(file => copyFileTo(file, outDir));

  cpSync(join(root, 'js'), join(outDir, 'js'), { recursive: true });
  if (existsSync(join(root, 'assets'))) {
    cpSync(join(root, 'assets'), join(outDir, 'assets'), { recursive: true });
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifestFor(browser), null, 2)}\n`);

  cpSync(outDir, unpackedArtifactDir, { recursive: true });

  const zipPath = join(artifactsRoot, `chzzk-sidebar-shuffler-${browser}-v${version}.zip`);
  zipDirectory(outDir, zipPath);
  console.log(`Built ${browser}: ${outDir}`);
  console.log(`Unpacked artifact: ${unpackedArtifactDir}`);
  console.log(`Artifact: ${zipPath}`);
}

for (const browser of targets) {
  build(browser);
}
