const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');

assert.match(
  sidebarJs,
  /function pickBestChzzkTab\(tabs\)/,
  'Sidebar should isolate CHZZK tab selection into a reusable function'
);

assert.match(
  sidebarJs,
  /candidates\.find\(tab => isFollowingTab\(tab\.url\)\) \|\| candidates\[0\] \|\| null/,
  'Sidebar should prefer the following page over other CHZZK tabs'
);

assert.match(
  sidebarJs,
  /new URL\(url\)\.pathname === '\/following'/,
  'Following tab detection should use URL parsing instead of brittle substring matching'
);

console.log('sidebar tab selection regression passed');
