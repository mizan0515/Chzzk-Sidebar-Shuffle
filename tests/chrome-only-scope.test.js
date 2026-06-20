const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'manifest.json'), 'utf8'));
const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
const buildScript = readFileSync(join(__dirname, '..', 'scripts', 'build.mjs'), 'utf8');
const validateScript = readFileSync(join(__dirname, '..', 'scripts', 'validate.mjs'), 'utf8');
const completionGuard = readFileSync(join(__dirname, '..', 'scripts', 'check-completion-guard.mjs'), 'utf8');
const popupJs = readFileSync(join(__dirname, '..', 'popup.js'), 'utf8');

assert.equal(packageJson.scripts['build:whale'], undefined, 'Product scope is Chrome-only; build:whale must not be exposed');
assert.equal(packageJson.scripts['qa:whale:isolated'], undefined, 'Product scope is Chrome-only; Whale isolated QA must not be a required lane');
assert.equal(packageJson.scripts['qa:main:whale:start'], undefined, 'Product scope is Chrome-only; main Whale restart automation must not be exposed');
assert.match(packageJson.description, /Chrome\./, 'Package description should name Chrome as the product browser');
assert.doesNotMatch(packageJson.description, /Whale|NAVER Whale/i, 'Package description must not advertise Whale as a supported product');
assert.equal(manifest.name, 'CHZZK Favorite Tiers', 'Extension name should describe favorite/tier management, not only shuffling');
assert.equal(manifest.action?.default_title, 'CHZZK Favorite Tiers', 'Chrome toolbar title should match the extension name');

assert.match(readme, /Chrome-only/i, 'README should state the Chrome-only product scope');
assert.doesNotMatch(readme, /build:whale|qa:whale:isolated|qa:main:whale|dist\/whale|Whale Store/i, 'README must not instruct managers to build, QA, or release Whale');

assert.match(buildScript, /target === 'all' \? \['chrome'\]/, 'build:all should build only Chrome');
assert.doesNotMatch(buildScript, /manifest\.sidebar_action\s*=|default_page|sidebar_action\s*=/i, 'Build script must not create a Whale sidebar package');
assert.match(buildScript, /removeUnsupportedBrowserArtifacts/, 'Build script should remove stale unsupported browser artifacts');

assert.doesNotMatch(validateScript, /validateManifest\('whale'\)|sidebar_action\.default_page|Whale manifest/i, 'Validation must not require a Whale manifest');
assert.doesNotMatch(completionGuard, /whale_isolated|Chrome\/Whale|Main Whale/i, 'Completion guard must not require Whale evidence');
assert.match(completionGuard, /validation\.main_chrome\s*\|\|\s*validation\.main_browser/, 'Completion guard should read the Chrome-specific real-use evidence field');
assert.match(completionGuard, /UNVERIFIED\|NOT_READY\|blocked/, 'Completion guard should classify UNVERIFIED_* values as scoped non-release states');
assert.doesNotMatch(popupJs, /showWhaleSidebar|sidebarAction\.show|platform\?\.isWhale\(\)/, 'Popup tier manager must not leave Chrome popup flow for Whale sidebar');

console.log('chrome-only product scope regression passed');
