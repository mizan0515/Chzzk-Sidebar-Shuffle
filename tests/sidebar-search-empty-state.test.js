const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');

assert.match(
  sidebarJs,
  /const allKnownChannels = Object\.values\(state\.channels \|\| \{\}\)\.sort/,
  'Sidebar search needs an unfiltered total channel list'
);

assert.match(
  sidebarJs,
  /query\s*\?\s*`\$\{available\.length\}\/\$\{totalChannelCount\}`/,
  'Search mode should show filtered count against total known channels'
);

assert.match(
  sidebarJs,
  /function emptyChannelMessage\(\)/,
  'All-channel empty state should use a dedicated message helper'
);

assert.match(
  sidebarJs,
  /if \(!chzzkTab\) return '팔로잉 탭을 열면 채널이 표시됩니다\.';/,
  'No-tab empty state should explain that channels appear after opening the following tab'
);

assert.match(
  sidebarJs,
  /if \(pageStatus\.loginRequired\) return '치지직 로그인 후 새로고침하세요\.';/,
  'Logged-out following pages should tell the user to log in and refresh'
);

assert.match(
  sidebarJs,
  /query \? '검색 결과 없음' : \(zone\.dataset\.tierId \? '비어 있음' : '미분류 없음'\)/,
  'Tier and unassigned empty states should distinguish no search results'
);

console.log('sidebar search empty state regression passed');
