const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const contentJs = readFileSync(join(__dirname, '..', 'content.js'), 'utf8');

assert.match(
  contentJs,
  /const videoNo = core\?\.getVideoNo\?\.\(location\.href\) \|\| '';/,
  'Timecode copy command should derive the CHZZK VOD id from the current URL'
);

assert.match(
  contentJs,
  /core\.buildCopyText\(\{ seconds, videoNo, format: videoNo \? core\.FORMAT_VOD : core\.FORMAT_CONTEXT \}\)/,
  'Timecode copy command should use VOD format on /video pages and context format elsewhere'
);

assert.doesNotMatch(
  contentJs,
  /core\.buildCopyText\(\{ seconds, videoNo: core\.getVideoNo\?\.\(location\.href\) \|\| '' \}\)/,
  'Timecode copy command must not pass a video id while leaving the copy format at the generic context default'
);

console.log('timecode copy command regression passed');
