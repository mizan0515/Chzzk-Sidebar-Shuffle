const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');

const refreshBlockStart = contentJs.indexOf("if (type === 'REFRESH_STAR_BUTTONS')");
assert.notEqual(refreshBlockStart, -1, 'REFRESH_STAR_BUTTONS handler is missing');

const refreshBlock = contentJs.slice(refreshBlockStart, refreshBlockStart + 900);

assert.match(
  refreshBlock,
  /await window\.ChzzkSettings\?\.load\?\.\(\)/,
  'Star refresh must reload settings before applying the toggle state'
);

assert.match(
  refreshBlock,
  /!window\.ChzzkSettings\?\.get\('enableStar'\)/,
  'Star refresh must respect enableStar=false'
);

assert.match(
  refreshBlock,
  /window\.ChzzkStar\?\.removeAllStarButtons\?\.\(\)/,
  'Star refresh must remove existing star buttons when disabled'
);

assert.match(
  refreshBlock,
  /window\.ChzzkStar\?\.stopObserving\?\.\(\)/,
  'Star refresh must stop observing new channels when disabled'
);

assert.match(
  refreshBlock,
  /window\.ChzzkStar\?\.startObserving\?\.\(\)/,
  'Star refresh must resume observing new channels when enabled'
);

assert.match(
  contentJs,
  /function ensureStarObservation\(list = document, delay = 200\)/,
  'Content initialization should use a reusable star-observer helper'
);

assert.match(
  contentJs,
  /data-chzzk-star-observer', 'ready'/,
  'Star observer readiness should be visible in the page for real-browser QA'
);

['Main page', 'Following page', 'Live page', 'Universal page'].forEach((label) => {
  const labelIndex = contentJs.indexOf(label);
  assert.notEqual(labelIndex, -1, `${label} initialization log is missing`);
});

assert.match(
  contentJs,
  /Following page: No initial channels found[\s\S]*ensureStarObservation\(document\)/,
  'Following page should start star observation even when initial channels load late'
);

assert.match(
  contentJs,
  /Main page: No channels found after dynamic loading[\s\S]*ensureStarObservation\(document\)/,
  'Main page should start star observation even when initial channels load late'
);

assert.match(
  contentJs,
  /Live page: No channels found, retrying[\s\S]*ensureStarObservation\(document\)/,
  'Live page should start star observation before retrying late channel discovery'
);

assert.match(
  contentJs,
  /Universal page: No channels found, retrying[\s\S]*ensureStarObservation\(document\)/,
  'Universal page should start star observation before retrying late channel discovery'
);

console.log('refresh star buttons regression passed');
