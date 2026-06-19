const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const popupJs = readFileSync(join(__dirname, '..', 'popup.js'), 'utf8');

assert.match(
  popupJs,
  /function pickBestChzzkTab\(tabs\)/,
  'Popup should isolate CHZZK tab selection into a reusable function'
);

assert.match(
  popupJs,
  /const \[activeTab\] = await platform\.queryTabs\(\{ active: true, currentWindow: true \}\)/,
  'Popup should include the active tab in target discovery'
);

assert.match(
  popupJs,
  /const tabs = await platform\.queryTabs\(\{ url: '\*:\/\/*chzzk\.naver\.com\/\*' \}\)/,
  'Popup should query all open CHZZK tabs, not only the active tab'
);

assert.match(
  popupJs,
  /activeChzzkTab = pickBestChzzkTab\(\[activeTab, \.\.\.\(tabs \|\| \[\]\)\]\);/,
  'Popup should choose the best CHZZK tab from active and background tabs'
);

assert.match(
  popupJs,
  /candidates\.find\(tab => isFollowingTab\(tab\.url\)\) \|\| candidates\[0\] \|\| null/,
  'Popup should prefer the following page over other CHZZK tabs'
);

assert.match(
  popupJs,
  /new URL\(url\)\.pathname === '\/following'/,
  'Popup following tab detection should use URL parsing'
);

assert.doesNotMatch(
  popupJs,
  /activeChzzkTab = tabs\?\.\[0\] \|\| null;/,
  'Popup must not fall back to the first arbitrary CHZZK tab'
);

assert.doesNotMatch(
  popupJs,
  /activeChzzkTab = tab && tab\.url && tab\.url\.includes\('chzzk\.naver\.com'\) \? tab : null;/,
  'Popup must not prefer a non-following active CHZZK page over an open following tab'
);

assert.match(
  popupJs,
  /const seen = new Set\(\);/,
  'Popup should dedupe active and background tab candidates'
);

console.log('popup tab selection regression passed');
