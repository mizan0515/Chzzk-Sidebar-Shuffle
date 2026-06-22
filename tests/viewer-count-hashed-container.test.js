const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const viewerCountJs = readFileSync(join(__dirname, '..', 'js', 'viewerCount.js'), 'utf8');

assert.match(
  viewerCountJs,
  /isLikelyChzzkViewerCountContainer\(element\)[\s\S]*isViewerCountPattern\(text\)[\s\S]*video_card[\s\S]*navigation_bar[\s\S]*video_information/,
  'Hashed CHZZK container classes must be hidden only when viewer-count text and a safe CHZZK context both match'
);

assert.match(
  viewerCountJs,
  /'_container_'[\s\S]*Hashed viewer count container target/,
  'The exact hashed container class pattern should be handled for spans like "_container_1o5pg_2 undefined"'
);

assert.match(
  viewerCountJs,
  /\[class\*="video_card"\] span\[class\*="_container_"\]/,
  'Card viewer-count scans should include hashed container spans'
);

assert.match(
  viewerCountJs,
  /body\.chzzk-hide-viewer-count \[data-chzzk-hidden="true"\]\.chzzk-viewer-hidden/,
  'CSS should only collapse hashed viewer-count containers after JS marks them hidden'
);

console.log('viewer count hashed container regression passed');
