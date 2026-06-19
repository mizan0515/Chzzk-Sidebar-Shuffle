const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const starJs = readFileSync(join(__dirname, '..', 'js', 'star.js'), 'utf8');

assert.match(
  starJs,
  /\.chzzk-star-btn\s*\{[\s\S]*width:\s*32px;[\s\S]*height:\s*32px;/,
  'Injected CHZZK star buttons should keep a readable 32px control size'
);

assert.match(
  starJs,
  /\.chzzk-star-btn\s*\{[\s\S]*line-height:\s*0;/,
  'Injected star buttons should not let line-height offset the icon'
);

assert.match(
  starJs,
  /\.chzzk-star-btn svg\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;/,
  'Injected star icons should stay centered at a readable size'
);

assert.match(
  starJs,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.chzzk-star-btn\s*\{[\s\S]*transition-duration:\s*0\.01ms !important;/,
  'Injected star button motion should respect reduced-motion preferences'
);

assert.match(
  starJs,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.chzzk-star-btn:hover\s*\{[\s\S]*transform:\s*none;/,
  'Reduced-motion mode should disable hover scale on injected star buttons'
);

assert.match(
  starJs,
  /\.chzzk-star-slot\s*\{[\s\S]*position:\s*absolute;[\s\S]*place-items:\s*center;/,
  'Star button should live in a reserved slot outside the channel text flow'
);

assert.match(
  starJs,
  /\.chzzk-star-host\s*\{[\s\S]*min-height:\s*40px !important;/,
  'Star host rows should reserve enough block height so adjacent channel hit targets do not overlap'
);

assert.match(
  starJs,
  /\.chzzk-star-host > a\s*\{[\s\S]*padding-right:\s*max\(44px,[\s\S]*min-height:\s*40px !important;[\s\S]*display:\s*flex !important;/,
  'Channel links should reserve inline space so viewer count text cannot sit under the star button'
);

assert.match(
  starJs,
  /\.chzzk-extension-reload-notice\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*2147483647;/,
  'Extension context recovery notice should stay visible above the CHZZK page when stale content scripts are clicked'
);

assert.match(
  starJs,
  /\.chzzk-extension-reload-notice\s*\{[\s\S]*max-width:\s*min\(420px,\s*calc\(100vw - 32px\)\);/,
  'Extension context recovery notice should fit narrow browser sidebars without horizontal overflow'
);

assert.match(
  starJs,
  /\.chzzk-extension-reload-button\s*\{[\s\S]*min-height:\s*32px;[\s\S]*font-weight:\s*700;/,
  'Extension context recovery notice should expose a readable reload action'
);

assert.match(
  starJs,
  /data-chzzk-extension-version/,
  'Injected content script should expose the loaded extension version for main-browser stale-script QA'
);

assert.match(
  starJs,
  /getExtensionVersion\(\)/,
  'Injected content script version marker should be resolved through a guarded helper'
);

assert.match(
  starJs,
  /ChzzkDom\?\.findChannelItems\?\.\(node\)/,
  'Star MutationObserver should use the DOM adapter so dynamically loaded CHZZK links receive star buttons'
);

console.log('star css regression passed');
