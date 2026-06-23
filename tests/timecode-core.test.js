const assert = require('node:assert/strict');

const core = require('../js/timecodeCore.js');

assert.equal(core.formatTime(3723), '01:02:03');
assert.equal(core.formatTime(-5), '00:00:00');
assert.equal(core.clampSeconds(45.9), 45);

assert.equal(core.parseTimeInput('1:02:03'), 3723);
assert.equal(core.parseTimeInput('02:03'), 123);
assert.equal(core.parseTimeInput('90'), 90);
assert.equal(core.parseTimeInput('1시간 2분 3초'), 3723);
assert.equal(core.parseTimeInput('[2:30]'), 150);
assert.equal(core.parseTimeInput('1:99'), null);

assert.equal(core.getVideoNo('https://chzzk.naver.com/video/12345'), '12345');
assert.equal(core.getVideoNo('https://chzzk.naver.com/live/abc'), '');

assert.equal(core.buildCopyText({ seconds: 3723, format: core.FORMAT_TIME }), '01:02:03');
assert.equal(core.buildCopyText({ seconds: 3723, format: core.FORMAT_CONTEXT }), '- [01:02:03] ');
assert.equal(core.buildCopyText({ seconds: 60, format: core.FORMAT_VOD, videoNo: '777' }), 'VOD 777 00:01:00');

assert.equal(core.parseLiveElapsed('06:43:12 스트리밍 중'), 6 * 3600 + 43 * 60 + 12);
assert.equal(core.parseLiveElapsed('2401:20:01 스트리밍 중'), 2401 * 3600 + 20 * 60 + 1);
assert.equal(core.parseLiveElapsed('12명 시청 중'), null);

const nowMs = new Date(2026, 5, 4, 1, 30, 0, 0).getTime();
assert.equal(core.resolveLiveStartMs(null, 3600, nowMs), nowMs - 3600 * 1000);
assert.equal(core.resolveLiveStartMs(null, null, nowMs), null);

const currentElapsed = 8 * 3600;
const rewind = core.computeLiveRewindTarget({
  seekableStart: 0,
  seekableEnd: 3600,
  currentElapsedSec: currentElapsed,
  rewindSec: 300
});
assert.equal(rewind.seekable, true);
assert.equal(rewind.targetElapsedSec, currentElapsed - 300);
assert.equal(rewind.mediaPos, 3300);

const outOfWindow = core.computeLiveRewindTarget({
  seekableStart: 0,
  seekableEnd: 3600,
  currentElapsedSec: currentElapsed,
  rewindSec: 7200
});
assert.equal(outOfWindow.seekable, false);
assert.equal(outOfWindow.reason, 'out-of-window');
assert.equal(outOfWindow.targetElapsedSec, currentElapsed - 7200);

const picked = core.selectLiveElapsedCandidate([
  { tooltip: '', text: '1,756명 시청 중 01:19:13 스트리밍 중', depth: 5 },
  { tooltip: '', text: '1,756명 시청 중', depth: 6 },
  { tooltip: '라이브 시작: 2026-06-03 23:33:55', text: '01:19:13 스트리밍 중', depth: 6 }
]);
assert.equal(picked.found, true);
assert.equal(picked.elapsedSec, 1 * 3600 + 19 * 60 + 13);
assert.equal(picked.liveStartMs, new Date(2026, 5, 3, 23, 33, 55).getTime());

const currentProd = core.selectLiveElapsedCandidate([
  { tooltip: '', text: '114명 시청 중07:59:46 스트리밍 중', depth: 13 },
  { tooltip: '', text: '07:59:46 스트리밍 중', depth: 14 }
]);
assert.equal(currentProd.found, true);
assert.equal(currentProd.elapsedSec, 7 * 3600 + 59 * 60 + 46);
assert.equal(currentProd.liveStartMs, null);

console.log('timecode core regression passed');
