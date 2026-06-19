const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');
const sidebarCss = readFileSync(join(__dirname, '..', 'sidebar.css'), 'utf8');

assert.match(
  sidebarJs,
  /async function moveDraggedChannel\(zone, event, channelId, nextTier\)[\s\S]*store\.reorderTier\(nextTier, ids\)/,
  'Dropping inside a tier should persist the computed same-tier order, not only assign the tier'
);

assert.match(
  sidebarJs,
  /function orderedDropIds\(zone, event, channelId\)[\s\S]*dropBeforeCard\(event, targetCard\)/,
  'Sidebar DnD should calculate an insertion index from the pointer position'
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

console.log('sidebar DnD reorder regression passed');
