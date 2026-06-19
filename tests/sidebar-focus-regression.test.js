const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');

assert.match(
  sidebarJs,
  /focusChannelMini\(channel\.id, action === 'add' \? '\.unassigned' : '\.all-channels'\)/,
  'Favorite add/remove should restore focus to the moved channel button'
);

assert.match(
  sidebarJs,
  /function focusChannelMini\(channelId, scopeSelector\)/,
  'Sidebar needs a helper for restoring favorite button focus after rerender'
);

assert.match(
  sidebarJs,
  /function focusChannelTier\(channelId, tierId\)/,
  'Sidebar needs a helper for restoring tier-chip focus after rerender'
);

assert.match(
  sidebarJs,
  /function cssEscape\(value\)/,
  'Focus restoration selectors must escape channel and tier ids'
);

console.log('sidebar focus regression passed');
