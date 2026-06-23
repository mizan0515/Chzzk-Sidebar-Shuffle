const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');

assert.match(
  contentJs,
  /if \(changes\.hideViewerCount !== undefined\) \{[\s\S]*ChzzkViewerCount\?\.setEnabled\?\.\(!!changes\.hideViewerCount\);[\s\S]*ChzzkViewerCount\?\.scheduleUpdate\?\.\(\);[\s\S]*\}/,
  'Viewer-count setting changes should enable/disable the manager, not only schedule a one-time update'
);

assert.doesNotMatch(
  contentJs,
  /if \(changes\.hideViewerCount !== undefined\) \{\s*window\.ChzzkViewerCount\.scheduleUpdate\(\);\s*\}/,
  'Disabling viewer-count hiding must restore hidden elements and stop route-scoped monitors immediately'
);

console.log('viewer count setting toggle regression passed');
