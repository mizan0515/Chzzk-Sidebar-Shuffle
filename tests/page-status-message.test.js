const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');

assert.match(
  contentJs,
  /function getChzzkPageStatus\(channels = \[\]\)/,
  'Content script should expose a page status helper for UI state decisions'
);

assert.match(
  contentJs,
  /const isFollowingPage = window\.location\.pathname === '\/following';/,
  'Page status should identify the following page by URL path'
);

assert.match(
  contentJs,
  /loginRequired[\s\S]*로그인이 필요합니다\|로그인/,
  'Page status should detect logged-out following pages from visible CHZZK copy'
);

assert.match(
  contentJs,
  /sendResponse\(\{ ok: true, channels, state, pageStatus: getChzzkPageStatus\(channels\) \}\);/,
  'GET_CHZZK_CHANNELS should include pageStatus in its response'
);

console.log('page status message regression passed');
