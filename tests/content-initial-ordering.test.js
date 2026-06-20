const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');

const applyInitialStart = contentJs.indexOf('async function applyInitialChannelOrdering');
assert.notEqual(applyInitialStart, -1, 'Initial channel ordering helper is missing');
const applyInitialBlock = contentJs.slice(applyInitialStart, applyInitialStart + 900);

assert.match(
  applyInitialBlock,
  /enableTierSort[\s\S]*window\.applyChzzkTierSort/,
  'F5/initial page load should prefer favorite-tier ordering when tier sort is enabled'
);

assert.match(
  applyInitialBlock,
  /shuffleWithinTiers:\s*!!window\.ChzzkSettings\?\.get\('enableShuffle'\)/,
  'Initial ordering should respect the group-shuffle setting only inside tier groups'
);

assert.match(
  applyInitialBlock,
  /if \(applied\) return true;/,
  'Initial ordering should not run a second legacy shuffle after tier ordering succeeds'
);

assert.match(
  applyInitialBlock,
  /catch \(error\)[\s\S]*falling back to legacy shuffle/,
  'Initial ordering should visibly fall back only when tier ordering throws'
);

assert.match(
  applyInitialBlock,
  /window\.ChzzkShuffle\.executeShuffle\(list, items\);/,
  'Initial ordering fallback should use the existing safe shuffle path'
);

assert.match(
  contentJs,
  /Following page[\s\S]*applyInitialChannelOrdering\(list, items, `following:\$\{reason\}`\)/,
  'Following page F5 path should apply favorite-tier ordering to the initial LNB channel list'
);

assert.match(
  contentJs,
  /following:late-list-retry/,
  'Following page should retry favorite-tier ordering when the LNB appears after the first load pass'
);

assert.match(
  contentJs,
  /applyChzzkTierSort\(\{ shuffleWithinTiers: false, reason: 'same-type-url-change' \}/,
  'SPA same-route changes should reapply favorite-tier ordering without random group shuffle'
);

console.log('content initial ordering regression passed');
