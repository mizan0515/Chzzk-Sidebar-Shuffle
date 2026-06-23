const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'manifest.json'), 'utf8'));
const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
const buildScript = readFileSync(join(__dirname, '..', 'scripts', 'build.mjs'), 'utf8');
const validateScript = readFileSync(join(__dirname, '..', 'scripts', 'validate.mjs'), 'utf8');
const completionGuard = readFileSync(join(__dirname, '..', 'scripts', 'check-completion-guard.mjs'), 'utf8');
const readinessScript = readFileSync(join(__dirname, '..', 'scripts', 'check-main-browser-readiness.mjs'), 'utf8');
const browserQaCleanupScript = readFileSync(join(__dirname, '..', 'scripts', 'Stop-BrowserQaSessions.ps1'), 'utf8');
const popupJs = readFileSync(join(__dirname, '..', 'popup.js'), 'utf8');
const storeAssetGenerator = readFileSync(join(__dirname, '..', 'scripts', 'generate-store-assets.mjs'), 'utf8');
const mainChromePopupQa = readFileSync(join(__dirname, '..', 'scripts', 'qa-main-chrome-popup.mjs'), 'utf8');

assert.equal(packageJson.scripts['build:whale'], undefined, 'Product scope is Chrome-only; build:whale must not be exposed');
assert.equal(packageJson.scripts['qa:whale:isolated'], undefined, 'Product scope is Chrome-only; Whale isolated QA must not be a required lane');
assert.equal(packageJson.scripts['qa:main:whale:start'], undefined, 'Product scope is Chrome-only; main Whale restart automation must not be exposed');
assert.equal(packageJson.scripts['qa:chromium:isolated'], undefined, 'Do not expose isolated Chromium QA; it can be mistaken for real-use evidence');
assert.equal(packageJson.scripts['qa:isolated'], undefined, 'Do not expose generic isolated browser QA');
assert.equal(packageJson.scripts['qa:main:chrome:start'], undefined, 'Do not launch a separate Chrome QA profile from npm scripts');
assert.equal(packageJson.scripts['qa:main:chrome:plan'], undefined, 'Do not present a separate Chrome profile launch plan as real-use QA');
assert.match(packageJson.description, /Chrome\./, 'Package description should name Chrome as the product browser');
assert.doesNotMatch(packageJson.description, /Whale|NAVER Whale/i, 'Package description must not advertise Whale as a supported product');
assert.equal(manifest.name, 'CHZZK Favorites & Tiers', 'Extension name should describe favorite/tier management, not only shuffling');
assert.equal(manifest.action?.default_title, 'CHZZK Favorites & Tiers', 'Chrome toolbar title should match the extension name');
assert.match(buildScript, /default_title:\s*'CHZZK Favorites & Tiers'/, 'Built Chrome action title should not drift from the product name');

assert.match(readme, /Chrome-only/i, 'README should state the Chrome-only product scope');
assert.doesNotMatch(readme, /build:whale|qa:whale:isolated|qa:main:whale|dist\/whale|Whale Store/i, 'README must not instruct managers to build, QA, or release Whale');
assert.doesNotMatch(readme, /requires static validation, Chrome build, isolated Chromium/i, 'README completion gate must not make isolated Chromium part of Chrome-only release readiness');
assert.doesNotMatch(readme, /ask the manager to .*provide|provide a controllable Chrome plugin|enable a controllable Chrome plugin/i, 'README must not hand browser QA mechanics back to the non-developer manager');
assert.match(readme, /keep the PR draft[\s\S]*manager-visible Chrome is foreground[\s\S]*real extension action popup internals by label/, 'README should give the exact bounded retry condition when main Chrome evidence is unavailable');

assert.match(buildScript, /target === 'all' \? \['chrome'\]/, 'build:all should build only Chrome');
assert.doesNotMatch(buildScript, /manifest\.sidebar_action\s*=|default_page|sidebar_action\s*=/i, 'Build script must not create a Whale sidebar package');
assert.match(buildScript, /removeUnsupportedBrowserArtifacts/, 'Build script should remove stale unsupported browser artifacts');

assert.doesNotMatch(validateScript, /validateManifest\('whale'\)|sidebar_action\.default_page|Whale manifest/i, 'Validation must not require a Whale manifest');
assert.doesNotMatch(completionGuard, /whale_isolated|Chrome\/Whale|Main Whale/i, 'Completion guard must not require Whale evidence');
assert.doesNotMatch(completionGuard, /chromium_isolated|isolated QA are complete/i, 'Completion guard must not require or reward isolated Chromium evidence');
assert.doesNotMatch(completionGuard, /manager-only follow-up|manager-only\/hard-external/i, 'Completion guard must not classify missing Chrome real-use evidence as manager-only by default');
assert.match(completionGuard, /Keep the PR Draft[\s\S]*manager-visible Chrome is foreground[\s\S]*real extension action popup internals by label/, 'Completion guard should preserve the bounded Chrome retry condition when main evidence is unverified');
assert.match(completionGuard, /validation\.main_chrome\s*\|\|\s*validation\.main_browser/, 'Completion guard should read the Chrome-specific real-use evidence field');
assert.match(completionGuard, /UNVERIFIED\|NOT_READY\|blocked/, 'Completion guard should classify UNVERIFIED_* values as scoped non-release states');
assert.doesNotMatch(readinessScript, /Start-MainChromeQa|qa:main:chrome:plan|qa:main:chrome:start|restart with remote debugging/i, 'Readiness output must not route managers to separate Chrome profile launch helpers');
assert.match(readinessScript, /Computer Use/, 'Readiness output should route unavailable CDP cases to manager-visible Computer Use evidence');
assert.doesNotMatch(readinessScript, /ask the manager to .*provide|provide\/enable a controllable Chrome plugin|enable a controllable Chrome plugin/i, 'Readiness output must keep browser tooling retry conditions agent-owned');
assert.match(readinessScript, /Keep PR #5 Draft[\s\S]*manager-visible Chrome is foreground[\s\S]*real extension action popup internals by label/, 'Readiness output should preserve the bounded Chrome real-use retry condition');
assert.doesNotMatch(browserQaCleanupScript, /whale|Whale|WHALE|9223/, 'Browser QA cleanup must not target Whale or old Whale QA ports in Chrome-only scope');
assert.doesNotMatch(popupJs, /showWhaleSidebar|sidebarAction\.show|platform\?\.isWhale\(\)/, 'Popup tier manager must not leave Chrome popup flow for Whale sidebar');

[
  join(__dirname, '..', 'scripts', 'qa-whale.mjs'),
  join(__dirname, '..', 'scripts', 'qa-main-whale-realuse.mjs'),
  join(__dirname, '..', 'scripts', 'Start-MainWhaleQa.ps1'),
  join(__dirname, '..', 'scripts', 'qa-chromium.mjs'),
  join(__dirname, '..', 'scripts', 'Start-MainChromeQa.ps1'),
  join(__dirname, '..', 'store-assets', 'whale'),
  join(__dirname, '..', 'store-assets', 'chrome', 'screenshots', '03-whale-sidebar.png')
].forEach((path) => {
  assert.equal(existsSync(path), false, `Chrome-only scope must not leave stale Whale surface: ${path}`);
});

assert.doesNotMatch(storeAssetGenerator, /whale|Whale|WHALE/, 'Store asset generator must not create or advertise Whale assets');
assert.match(storeAssetGenerator, /03-tier-manager\.png/, 'Chrome store screenshots should show in-popup tier management, not Whale sidebar');
assert.doesNotMatch(mainChromePopupQa, /direct-popup-url-fallback|Target\.createTarget|popup\.html`\s*\}/, 'Main Chrome popup QA must not substitute direct popup URL for the extension action');
assert.match(mainChromePopupQa, /Real extension action popup did not open/, 'Main Chrome popup QA should fail clearly when the real action popup cannot be opened');
assert.match(mainChromePopupQa, /requireCdpReady/, 'Main Chrome popup QA should verify the CDP endpoint before claiming main-browser evidence');
assert.match(mainChromePopupQa, /mainBrowserEvidence:\s*popupOpened/, 'Main Chrome popup QA failures before action.openPopup must not claim main-browser evidence');
assert.match(mainChromePopupQa, /MAIN_CHROME_POPUP_UNVERIFIED/, 'Main Chrome popup QA should classify pre-popup failures as unverified, not real-use failures');

console.log('chrome-only product scope regression passed');
