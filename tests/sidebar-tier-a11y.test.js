const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');
const sidebarHtml = readFileSync(join(__dirname, '..', 'sidebar.html'), 'utf8');

assert.match(
  sidebarHtml,
  /id="connectionText" role="status" aria-live="polite"/,
  'Sidebar connection feedback should be announced as a polite status'
);

assert.match(
  sidebarJs,
  /aria-label="\$\{escapeAttr\(tier\.label\)\} 티어로 배정"/,
  'Tier chips need action-oriented accessible names'
);

assert.match(
  sidebarJs,
  /function safeTierColor/,
  'Tier chip colors should be sanitized before they are written into inline CSS custom properties'
);

assert.match(
  sidebarJs,
  /style="--tier-color:\$\{color\}"/,
  'Tier chips should visually connect to their tier row color without changing the storage schema'
);

assert.match(
  sidebarJs,
  /aria-label="미분류로 배정"/,
  'Unclassified tier chip needs an action-oriented accessible name'
);

console.log('sidebar tier accessibility regression passed');
