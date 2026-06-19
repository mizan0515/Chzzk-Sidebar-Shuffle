import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed`);
  }
}

function walk(dir, predicate, output = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.yoyo', 'dist', 'artifacts', 'node_modules'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, output);
    else if (predicate(full)) output.push(full);
  }
  return output;
}

function validateManifest(browser) {
  const manifestPath = join(root, 'dist', browser, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail(`Missing ${manifestPath}. Run npm run build:all first.`);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (browser === 'chrome' && manifest.sidebar_action) fail('Chrome manifest must not include sidebar_action');
  if (browser === 'chrome' && !manifest.action) fail('Chrome manifest must include action');
  if (browser === 'whale' && manifest.action) fail('Whale manifest must not include action');
  if (browser === 'whale' && !manifest.sidebar_action) fail('Whale manifest must include sidebar_action');
  if (browser === 'whale' && !manifest.sidebar_action.default_page) fail('Whale sidebar_action.default_page is required');
  if (browser === 'whale' && !manifest.sidebar_action.default_icon) fail('Whale sidebar_action.default_icon is required');
}

function validateQaScriptNames() {
  const misleadingNames = ['qa:chrome', 'qa:chromium', 'qa:whale'];
  misleadingNames.forEach((name) => {
    if (packageJson.scripts?.[name]) {
      fail(`${name} is ambiguous. Use an explicit :isolated suffix for regression harnesses, and keep main-browser QA separate.`);
    }
  });
}

const jsFiles = walk(root, file => /\.(js|mjs)$/.test(file));
jsFiles.forEach(file => run('node', ['--check', file]));
validateQaScriptNames();

const dangerousSelector = /\.[A-Za-z0-9_-]*\+[A-Za-z0-9_-]*/;
[
  join(root, 'content.js'),
  join(root, 'popup.js'),
  join(root, 'sidebar.js'),
  join(root, 'js')
].forEach((path) => {
  const files = existsSync(path) && statSync(path).isDirectory() ? walk(path, file => file.endsWith('.js')) : [path];
  files.forEach((file) => {
    const text = readFileSync(file, 'utf8');
    if (dangerousSelector.test(text)) fail(`Dangerous unescaped selector found in ${file}`);
  });
});

walk(join(root, 'tests'), file => file.endsWith('.test.js')).forEach((file) => {
  run('node', [file]);
});
run('node', ['scripts/build.mjs', 'all']);
validateManifest('chrome');
validateManifest('whale');

if (!process.exitCode) {
  console.log('Validation passed');
}
