const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');
const sidebarHtml = readFileSync(join(__dirname, '..', 'sidebar.html'), 'utf8');
const sidebarJs = readFileSync(join(__dirname, '..', 'sidebar.js'), 'utf8');
const backgroundJs = readFileSync(join(__dirname, '..', 'js', 'background.js'), 'utf8');

assert.match(
  contentJs,
  /window\.__chzzkLiveSafetyCleanup\(\)/,
  'Live safety setup should clean previous content-script listeners before reinjection'
);

assert.match(
  contentJs,
  /changes\?\.satSettings[\s\S]*updateLiveSafetySettings/,
  'Live safety controls should react to activity settings changes without requiring a page reload'
);

assert.match(
  contentJs,
  /pathname\.startsWith\('\/live\/'\)/,
  'Live safety controls should only apply to CHZZK live pages'
);

assert.match(
  contentJs,
  /textarea\[class\*="live_chatting_input_input"\][\s\S]*textarea\[placeholder\*="채팅"\][\s\S]*\[contenteditable="true"\]\[class\*="chat"\]/,
  'Live safety controls should target CHZZK chat inputs by resilient selectors'
);

assert.match(
  contentJs,
  /#send_chat_or_donate[\s\S]*button\[class\*="live_chatting_input_send_button"\]/,
  'Live safety controls should target CHZZK chat send buttons by current and fallback selectors'
);

assert.match(
  contentJs,
  /\[class\*="live_chatting_input_donation"\][\s\S]*includes\('후원'\)/,
  'Live safety controls should hide donation controls by class and text fallback'
);

assert.match(
  contentJs,
  /preventDefault\(\);[\s\S]*stopPropagation\(\);/,
  'Live safety controls should block disabled chat or donation clicks before CHZZK handles them'
);

assert.match(
  sidebarHtml,
  /activityDisableLiveChatInput[\s\S]*activityDisableDonationInput/,
  'Chrome popup should expose opt-in live safety toggles'
);

assert.match(
  sidebarJs,
  /disableLiveChatInput[\s\S]*disableLiveDonationButtons/,
  'Chrome popup should save both live safety settings'
);

assert.match(
  backgroundJs,
  /disableLiveChatInput:\s*false[\s\S]*disableLiveDonationButtons:\s*false/,
  'Background settings should preserve live safety defaults as opt-in'
);

console.log('live safety controls regression passed');
