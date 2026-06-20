const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');
const sidebarCss = readFileSync(join(__dirname, '..', 'sidebar.css'), 'utf8');
const { computeOrderedDropIds } = require('../js/sidebarDnd.js');

assert.match(
  sidebarJs,
  /async function moveDraggedChannel\(zone, event, channelId, nextTier\)[\s\S]*store\.reorderTier\(nextTier, ids\)/,
  'Dropping inside a tier should persist the computed same-tier order, not only assign the tier'
);

assert.match(
  sidebarJs,
  /function orderedDropIds\(zone, event, channelId\)[\s\S]*ChzzkSidebarDnd\.computeOrderedDropIds/,
  'Sidebar DnD should use the tested ordering helper instead of ad hoc DOM-only order math'
);

assert.match(
  sidebarJs,
  /targetCard\.classList\.add\(dropBeforeCard\(event, targetCard\) \? 'drop-before' : 'drop-after'\)/,
  'Sidebar DnD should provide before/after feedback before the user drops a card'
);

assert.match(
  sidebarCss,
  /\.streamer-card\.drop-before\s*\{[\s\S]*inset 0 3px 0 var\(--primary\)[\s\S]*\.streamer-card\.drop-after\s*\{[\s\S]*inset 0 -3px 0 var\(--primary\)/,
  'Sidebar DnD before/after indicators should be styled for visible drop feedback'
);

assert.deepEqual(
  computeOrderedDropIds(['alpha', 'beta', 'gamma'], 'gamma', 'alpha', true),
  ['gamma', 'alpha', 'beta'],
  'Dropping before the first same-tier card should persist the dragged card at the top'
);

assert.deepEqual(
  computeOrderedDropIds(['alpha', 'beta', 'gamma'], 'alpha', 'gamma', false),
  ['beta', 'gamma', 'alpha'],
  'Dropping after the last same-tier card should persist the dragged card at the bottom'
);

assert.deepEqual(
  computeOrderedDropIds(['alpha', 'beta', 'gamma'], 'beta', 'gamma', true),
  ['alpha', 'beta', 'gamma'],
  'Dropping before a later same-tier card should preserve the intended middle position'
);

assert.deepEqual(
  computeOrderedDropIds(['alpha', 'beta', 'gamma'], 'beta', '', false),
  ['alpha', 'gamma', 'beta'],
  'Dropping on empty zone space should append the dragged card'
);

console.log('sidebar DnD reorder regression passed');
