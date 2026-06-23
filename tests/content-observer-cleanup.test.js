const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');

assert.match(
  contentJs,
  /let changeObserverCleanup = null;/,
  'Content controller should keep a cleanup handle for page observer resources'
);

assert.match(
  contentJs,
  /function setupChangeObserver\(\) \{[\s\S]*cleanupChangeObserverResources\(\);/,
  'Repeated setupChangeObserver calls should clean the previous observer resources first'
);

assert.match(
  contentJs,
  /changeObserverCleanup = \(\) => \{[\s\S]*observer\.disconnect\(\);[\s\S]*clearTimeout\(updateTimeout\);[\s\S]*resizeObserver\.disconnect\(\);[\s\S]*clearInterval\(visibilityMonitor\);/,
  'Change observer cleanup should disconnect DOM/resize observers and clear timeout/visibility interval'
);

assert.match(
  contentJs,
  /if \(window\.lnbVisibilityMonitor === visibilityMonitor\) \{[\s\S]*window\.lnbVisibilityMonitor = null;/,
  'Cleanup should only clear the global LNB monitor handle when it owns the active interval'
);

assert.match(
  contentJs,
  /function cleanupPreviousPage\(\)[\s\S]*cleanupChangeObserverResources\(\);/,
  'Page cleanup should use the shared observer cleanup path'
);

assert.match(
  contentJs,
  /clickExpandButton\(moreButton, 'shuffle-recovery'/,
  'Wide-mode shuffle recovery should route automatic expand clicks through the MoreButton manager'
);

assert.doesNotMatch(
  contentJs,
  /moreButton\.click\(\)/,
  'Content recovery should not bypass the guarded MoreButton manager with direct DOM clicks'
);

console.log('content observer cleanup regression passed');
