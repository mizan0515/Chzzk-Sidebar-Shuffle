const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const viewerCountJs = readFileSync(join(__dirname, '..', 'js', 'viewerCount.js'), 'utf8');

assert.match(
  viewerCountJs,
  /this\.liveMonitorInterval = null;[\s\S]*this\.cardMonitorInterval = null;/,
  'Viewer count live/card interval handles should be owned by the manager instance'
);

assert.match(
  viewerCountJs,
  /startAdvancedMonitoring\(\) \{[\s\S]*this\.stopRouteScopedMonitoring\(\);/,
  'Restarting viewer count monitoring should clear route-scoped intervals first'
);

assert.match(
  viewerCountJs,
  /ensureRouteCleanup\(\)[\s\S]*viewerRouteCleanupRegistered[\s\S]*history\.pushState = function[\s\S]*stopRouteScopedMonitoring/,
  'Viewer count route cleanup should use one shared history wrapper instead of per-monitor wrappers'
);

assert.match(
  viewerCountJs,
  /stopRouteScopedMonitoring\(\) \{[\s\S]*this\.stopLivePageIntensiveMonitoring\(\);[\s\S]*this\.stopCardViewMonitoring\(\);/,
  'Route-scoped viewer count cleanup should stop both live and card monitors'
);

assert.match(
  viewerCountJs,
  /setEnabled\(enabled\)[\s\S]*this\.stopRouteScopedMonitoring\(\);[\s\S]*this\.showAll\(\);/,
  'Disabling viewer count hiding should stop route-scoped monitoring intervals'
);

assert.match(
  viewerCountJs,
  /cleanup\(\)[\s\S]*this\.stopRouteScopedMonitoring\(\);[\s\S]*processedElements = new WeakSet\(\);/,
  'Viewer count cleanup should stop route-scoped monitoring before resetting state'
);

assert.doesNotMatch(
  viewerCountJs,
  /const liveMonitorInterval = setInterval|const cardMonitorInterval = setInterval|_cardViewCleanupRegistered|_cardViewWrapped/,
  'Viewer count monitoring should not use local interval handles or one-off card wrappers'
);

console.log('viewer count monitoring cleanup regression passed');
