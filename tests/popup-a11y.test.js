const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const popupHtml = readFileSync(join(__dirname, '..', 'popup.html'), 'utf8');
const popupJs = readFileSync(join(__dirname, '..', 'popup.js'), 'utf8');

const switchIds = [
  'enableTierSortToggle',
  'hideViewerCountToggle',
  'enableStarToggle',
  'enableAutoExpandToggle',
  'enableShuffleToggle'
];

switchIds.forEach((id) => {
  const match = popupHtml.match(new RegExp(`<button class="switch" id="${id}"[^>]*aria-labelledby="([^"]+)"`));
  assert.ok(match, `${id} should be labelled by visible setting text`);
  assert.match(
    popupHtml,
    new RegExp(`<strong id="${match[1]}">[^<]+</strong>`),
    `${id} aria-labelledby should point to an existing visible label`
  );
});

assert.match(
  popupHtml,
  /id="status" role="status" aria-live="polite"/,
  'Popup status should be announced politely'
);

assert.match(
  popupHtml,
  /\.toggle\s*\{[\s\S]*cursor:\s*pointer;/,
  'Popup setting rows should visually indicate the full row is clickable'
);

assert.match(
  popupHtml,
  /\.switch\s*\{[\s\S]*width:\s*46px;[\s\S]*height:\s*28px;/,
  'Popup switches should remain large enough to hit reliably'
);

assert.match(
  popupJs,
  /switchButton\?\.closest\('\.toggle'\)\?\.addEventListener\('click'/,
  'Clicking a popup setting row should toggle its switch'
);

assert.match(
  popupJs,
  /if \(event\.target\.closest\('button, a'\)\) return;/,
  'Popup row click handling should not double-toggle direct button clicks'
);

assert.doesNotMatch(
  popupJs,
  /showWhaleSidebar|sidebarAction\.show|platform\?\.isWhale\(\)/,
  'Chrome tier management must stay in the popup and must not branch to Whale sidebar UI'
);

assert.match(
  popupJs,
  /\['applyTierBtn', 'shuffleBtn', 'expandBtn'\]\.forEach/,
  'Popup should hide tab-dependent actions when no CHZZK tab is connected'
);

assert.match(
  popupJs,
  /actions\?\.classList\.toggle\('is-empty', !enabled\)/,
  'Popup should expose a dedicated no-tab action layout state'
);

assert.match(
  popupJs,
  /response\.pageStatus\?\.loginRequired/,
  'Popup should distinguish a logged-out following page from a connected channel list'
);

assert.match(
  popupJs,
  /function controlLabel/,
  'Popup should maintain stable accessible names while control state changes'
);

assert.match(
  popupJs,
  /치지직 팔로잉 탭을 먼저 열어 주세요/,
  'Disabled popup tab actions should explain the missing CHZZK tab'
);

assert.match(
  popupJs,
  /element\.setAttribute\('aria-label', disabled \? `\$\{label\}: \$\{reason\}` : label\)/,
  'Popup disabled buttons should expose their reason through the accessible label'
);

console.log('popup accessibility regression passed');
