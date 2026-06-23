const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `${name} should have a body`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body was not closed`);
}

function loadSafetyHelper(relativePath) {
  const source = readFileSync(join(__dirname, '..', relativePath), 'utf8');
  const helperSource = extractFunction(source, 'isSafeActivityEventUrl');
  return vm.runInNewContext(`${helperSource}; isSafeActivityEventUrl`, { URL });
}

const sidebarSafety = loadSafetyHelper('sidebar.js');
const backgroundSafety = loadSafetyHelper(join('js', 'background.js'));

const cases = [
  ['https://chzzk.naver.com/live/0123456789abcdef0123456789abcdef', true],
  ['https://cafe.naver.com/ArticleRead.nhn?clubid=123&articleid=456', true],
  ['https://board.cafe.naver.com/example', true],
  ['http://chzzk.naver.com/live/0123456789abcdef0123456789abcdef', false],
  ['https://chzzk.naver.com.evil.test/live/0123456789abcdef0123456789abcdef', false],
  ['https://evilcafe.naver.com/example', false],
  ['https://cafe.naver.com.evil.test/example', false],
  ['javascript:alert(1)', false],
  ['', false]
];

for (const [url, expected] of cases) {
  assert.equal(sidebarSafety(url), expected, `sidebar URL safety mismatch for ${url || '<empty>'}`);
  assert.equal(backgroundSafety(url), expected, `background URL safety mismatch for ${url || '<empty>'}`);
}

console.log('activity URL safety parity regression passed');
