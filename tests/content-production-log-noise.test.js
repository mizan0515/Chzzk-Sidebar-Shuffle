const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');

assert.doesNotMatch(
  contentJs,
  /console\.log\s*\(/,
  'Content scripts must not write recurring production diagnostics directly to the page console'
);

assert.match(
  contentJs,
  /ChzzkLogger\?\.debug/,
  'Production diagnostics should remain behind the existing ChzzkLogger debug gate'
);

console.log('content production log noise regression passed');
