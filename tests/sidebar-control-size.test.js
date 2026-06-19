const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sidebarCss = readFileSync(join(__dirname, '..', 'sidebar.css'), 'utf8');
const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');

assert.match(
  sidebarCss,
  /--touch-target:\s*40px;/,
  'Sidebar needs at least a 40px touch target token for reliable compact Whale controls'
);

assert.match(
  sidebarCss,
  /\.icon-slot\s*\{[\s\S]*width:\s*var\(--control-icon\);[\s\S]*height:\s*var\(--control-icon\);/,
  'Sidebar action icons should use a dedicated fixed icon slot'
);

assert.match(
  sidebarCss,
  /\.toolbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) var\(--touch-target\);/,
  'Sidebar toolbar should reserve a stable right column for the icon button'
);

assert.doesNotMatch(
  sidebarCss,
  /\.toolbar\s*\{[\s\S]*position:\s*sticky;/,
  'Sidebar toolbar should not float over tier rows while users scroll the Whale side panel'
);

assert.match(
  sidebarCss,
  /\.toolbar\s*\{[\s\S]*position:\s*relative;/,
  'Sidebar toolbar should keep the progress indicator scoped without overlapping content'
);

assert.match(
  sidebarCss,
  /\.toolbar\s*\{[\s\S]*margin:\s*-14px 0 0;/,
  'Sidebar toolbar should not use negative horizontal margins that can clip the refresh button'
);

assert.match(
  sidebarCss,
  /\.toolbar > div\s*\{[\s\S]*min-width:\s*0;/,
  'Sidebar toolbar text column must be allowed to shrink before pushing the refresh button'
);

assert.match(
  sidebarCss,
  /\.streamer-card\s*\{[\s\S]*grid-template-columns:\s*36px minmax\(0, 1fr\) var\(--touch-target\);/,
  'Streamer cards should reserve the full touch target width for favorite buttons'
);

assert.match(
  sidebarCss,
  /@container \(min-width: 470px\)[\s\S]*\.streamer-card\s*\{[\s\S]*grid-template-columns:\s*36px minmax\(0, 1fr\) var\(--touch-target\) minmax\(210px, 0\.78fr\);/,
  'Wide Whale sidebar layout should keep the favorite-button column aligned to the shared touch target'
);

assert.match(
  sidebarCss,
  /html\s*\{[\s\S]*scroll-padding-block-start:\s*16px;/,
  'Sidebar should keep a small focus scroll buffer without reserving space for a floating toolbar'
);

assert.match(
  sidebarCss,
  /\.streamer-card\s*\{[\s\S]*scroll-margin-block:\s*16px;/,
  'Streamer cards should keep a compact focus buffer without causing toolbar overlap'
);

assert.match(
  sidebarCss,
  /\.mini\s*\{[\s\S]*width:\s*var\(--touch-target\);[\s\S]*height:\s*var\(--touch-target\);/,
  'Favorite mini buttons should use the shared touch target size'
);

assert.match(
  sidebarCss,
  /\.card-actions\s*\{[\s\S]*width:\s*var\(--touch-target\);/,
  'Card action column should match the mini button touch target'
);

assert.match(
  sidebarCss,
  /\.tier-picker\s*\{[\s\S]*grid-template-columns:\s*repeat\(5, minmax\(30px, 1fr\)\) minmax\(52px, 1\.2fr\);/,
  'Tier picker should preserve readable tier and unclassified button widths'
);

assert.match(
  sidebarCss,
  /\.tier-chip\s*\{[\s\S]*min-height:\s*30px;/,
  'Tier chips should remain tall enough for reliable clicking'
);

assert.match(
  sidebarCss,
  /\.tier-chip\s*\{[\s\S]*color:\s*color-mix\(in srgb, var\(--tier-color,/,
  'Tier chips should inherit the tier color cue so users can associate chips with tier rows'
);

assert.match(
  sidebarCss,
  /\.tier-chip\.active\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--tier-color,/,
  'Active tier chips should use the tier color cue instead of a generic selected style'
);

assert.match(
  sidebarCss,
  /\.tier-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(124px, 0\.32fr\) minmax\(0, 1fr\);/,
  'Tier rows should reserve enough left-column width so labels do not break into single syllables'
);

assert.match(
  sidebarCss,
  /\.tier-head h2,[\s\S]*\.section-title h2\s*\{[\s\S]*white-space:\s*nowrap;/,
  'Tier headings should remain on one line in the Whale sidebar width range'
);

assert.match(
  sidebarJs,
  /els\.applyBtn\.classList\.toggle\('hidden', !chzzkTab\);/,
  'Sidebar should hide apply when there is no connected CHZZK tab'
);

assert.match(
  sidebarJs,
  /els\.shuffleBtn\.classList\.toggle\('hidden', !chzzkTab\);/,
  'Sidebar should hide shuffle when there is no connected CHZZK tab'
);

assert.match(
  sidebarJs,
  /els\.clearAssignmentsBtn\.classList\.toggle\('hidden', !hasAssignments\(state\)\);/,
  'Sidebar should hide the destructive reset action until there are assignments to clear'
);

assert.match(
  sidebarJs,
  /function sortDisabledReason/,
  'Sidebar should expose a reusable reason for disabled sort buttons'
);

assert.match(
  sidebarJs,
  /즐겨찾기 채널을 먼저 추가해 주세요/,
  'Sidebar disabled sort buttons should explain the missing favorite requirement'
);

console.log('sidebar control size regression passed');
