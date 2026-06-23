import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowMainUnverified = process.argv.includes('--allow-main-unverified');
const boardPath = join(root, '.runtime', 'mission-control', 'status-board.json');

function fail(message) {
  console.error(JSON.stringify({
    status: 'FAIL',
    completionGuard: 'NOT_READY',
    message
  }, null, 2));
  process.exit(1);
}

function isPass(value) {
  return /^PASS\b/i.test(String(value || '').trim());
}

function isUnverified(value) {
  return /UNVERIFIED|NOT_READY|blocked/i.test(String(value || ''));
}

if (!existsSync(boardPath)) {
  fail(`Missing mission-control status board: ${boardPath}`);
}

const board = JSON.parse(readFileSync(boardPath, 'utf8'));
const validation = board.validation || {};
const requiredPassFields = ['static', 'build'];
const missing = requiredPassFields.filter(field => !isPass(validation[field]));

if (missing.length) {
  fail(`Missing PASS validation fields before closeout: ${missing.join(', ')}`);
}

const mainBrowser = String(validation.main_chrome || validation.main_browser || '');
if (!isPass(mainBrowser) && !allowMainUnverified) {
  fail('Main logged-in Chrome real-use evidence is not PASS. Run the real main Chrome action-popup and CHZZK following-page QA before release/Done, or rerun this guard with --allow-main-unverified only for a Draft PR report that preserves the exact Chrome retry condition.');
}

if (allowMainUnverified && !isUnverified(mainBrowser) && !isPass(mainBrowser)) {
  fail('Main browser state must be either PASS or explicitly UNVERIFIED/NOT_READY when using --allow-main-unverified.');
}

console.log(JSON.stringify({
  status: 'PASS',
  completionGuard: isPass(mainBrowser) ? 'REAL_USE_READY' : 'SCOPED_WITH_MAIN_BROWSER_UNVERIFIED',
  mainBrowserEvidence: isPass(mainBrowser),
  issue: board.issue?.number || null,
  branch: board.branch || null,
  note: isPass(mainBrowser)
    ? 'Main browser real-use evidence is present.'
    : 'Static/build gates are complete, but root Done/release-ready still requires main-browser evidence. Keep the PR Draft and retry only when manager-visible Chrome is foreground on chzzk.naver.com with the toolbar/action area visible, or when an approved Chrome/CDP/Computer Use route exposes the real extension action popup internals by label.'
}, null, 2));
