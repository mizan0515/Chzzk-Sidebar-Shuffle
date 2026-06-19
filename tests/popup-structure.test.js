const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const popupHtml = readFileSync(join(__dirname, '..', 'popup.html'), 'utf8');
const popupJs = readFileSync(join(__dirname, '..', 'popup.js'), 'utf8');

const actionsIndex = popupHtml.indexOf('class="section actions"');
const settingsIndex = popupHtml.indexOf('class="section settings"');
const applyIndex = popupHtml.indexOf('id="applyTierBtn"');
const firstSettingIndex = popupHtml.indexOf('id="enableTierSortToggle"');
const openChzzkButtonMatch = popupHtml.match(/<button\s+class="([^"]+)"\s+id="openChzzkBtn"/);

assert.ok(actionsIndex > -1, 'Popup actions section is missing');
assert.ok(settingsIndex > -1, 'Popup settings section is missing');
assert.ok(actionsIndex < settingsIndex, 'Primary actions must appear before settings');
assert.ok(applyIndex > -1 && firstSettingIndex > -1, 'Apply button and first setting must exist');
assert.ok(applyIndex < firstSettingIndex, 'Apply action must not be pushed below settings');
assert.ok(openChzzkButtonMatch, 'Open CHZZK button is missing');
assert.equal(openChzzkButtonMatch[1].includes('primary'), false, 'Open CHZZK should only become primary when no CHZZK tab is connected');
assert.match(popupHtml, /#openChzzkBtn:not\(\.hidden\)/, 'Open CHZZK needs a visible-state primary rule');
assert.match(popupHtml, /scrollbar-gutter:\s*stable/, 'Popup should reserve scrollbar gutter to avoid layout shift');
assert.match(popupHtml, /\.actions\.is-empty/, 'Popup should have a distinct empty-state action layout');
assert.match(popupHtml, /id="openManagerBtn"[^>]*data-variant="quiet"/, 'Tier management should stay visually secondary in compact popup actions');
assert.match(popupHtml, /\.command\[data-variant="quiet"\]/, 'Popup quiet action buttons should have a stable visual style');
assert.match(popupHtml, /\.icon-slot\s*\{[\s\S]*place-items:\s*center;/, 'Popup icons should be centered through a dedicated icon slot');
assert.equal((popupHtml.match(/class="icon-slot"/g) || []).length, 6, 'Every popup action button should use an icon slot');
assert.match(popupHtml, /id="tierScreen"/, 'Chrome tier management should be an in-popup screen instead of a new tab');
assert.match(popupHtml, /id="backToHomeBtn"/, 'In-popup tier management needs a visible back control');
assert.match(popupHtml, /id="tierFrame"[\s\S]*title="티어 관리"/, 'Popup tier screen should host the shared tier manager iframe');
assert.match(popupJs, /function showTierScreen\(\)[\s\S]*tierFrame\.src[\s\S]*sidebar\.html/, 'Tier manager button should switch to the embedded tier screen');
assert.match(popupJs, /function showHomeScreen\(\)[\s\S]*homeScreen\?\.classList\.remove\('hidden'\)/, 'Popup back action should restore the home screen');
assert.doesNotMatch(popupJs, /openManagerBtn[\s\S]{0,500}tabs\.create\(\{\s*url:\s*platform\.runtime\.getURL\('sidebar\.html'\)/, 'Chrome tier management must not open sidebar.html in a new tab');

console.log('popup structure regression passed');
