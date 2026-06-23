const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const moreButtonJs = readFileSync(join(__dirname, '..', 'js', 'moreButton.js'), 'utf8');

class FakeButton {
  constructor({ className = '', text = '', ariaExpanded = 'false', inLnb = true }) {
    this.className = className;
    this.textContent = text;
    this.disabled = false;
    this.clicked = false;
    this.inLnb = inLnb;
    this.attrs = { 'aria-expanded': ariaExpanded };
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  closest() {
    return this.inLnb ? { nodeType: 1 } : null;
  }

  click() {
    this.clicked = true;
    this.setAttribute('aria-expanded', 'true');
  }
}

const chatButton = new FakeButton({
  className: 'chat_more_button__abc',
  text: '더보기',
  ariaExpanded: 'false',
  inLnb: false
});

const lnbButton = new FakeButton({
  className: 'navigation_bar_more_button__abc',
  text: '더보기',
  ariaExpanded: 'false',
  inLnb: true
});

global.document = {
  body: {
    nodeType: 1
  },
  querySelectorAll(selector) {
    if (selector === 'button') return [chatButton, lnbButton];
    if (selector.includes('navigation_bar_more_button')) return [lnbButton];
    if (selector.includes('aria-expanded')) return [chatButton, lnbButton];
    return [];
  }
};

global.window = {
  ChzzkDom: {
    safeQueryAll: (_root, selector) => global.document.querySelectorAll(selector)
  },
  ChzzkSettings: {
    get(key) {
      return key === 'enableAutoExpand' ? true : undefined;
    }
  },
  ChzzkLogger: {
    info() {},
    warn() {},
    debug() {}
  },
  ChzzkShuffle: {
    findChannelsList() {
      return { list: null };
    }
  },
  ChzzkStar: {
    injectAllStarButtons() {}
  },
  location: {
    href: 'https://chzzk.naver.com/'
  }
};

global.MutationObserver = class {
  observe() {}
  disconnect() {}
};

const { MoreButtonManager } = require('../js/moreButton.js');

const manager = new MoreButtonManager();
assert.equal(manager.findExpandButton(), lnbButton);
assert.equal(manager.autoExpand('test'), true);
assert.equal(lnbButton.clicked, true);
assert.equal(chatButton.clicked, false);

assert.match(
  moreButtonJs,
  /this\.autoTimeouts = new Set\(\);/,
  'Auto-expand initial timers should be owned by the manager'
);

assert.match(
  moreButtonJs,
  /const scheduleAttempt = \(reason, delay\) => \{[\s\S]*this\.autoTimeouts\.add\(timer\);[\s\S]*scheduleAttempt\('initial-300ms', 300\);[\s\S]*scheduleAttempt\('initial-1000ms', 1000\);[\s\S]*scheduleAttempt\('initial-2500ms', 2500\);/,
  'Initial auto-expand attempts should be scheduled through a cancellable helper'
);

assert.match(
  moreButtonJs,
  /stopAutoExpand\(\) \{[\s\S]*this\.autoTimeouts\.forEach\(timer => clearTimeout\(timer\)\);[\s\S]*this\.autoTimeouts\.clear\(\);[\s\S]*clearInterval\(this\.autoTimer\);/,
  'Stopping auto-expand should cancel pending initial attempts and the polling interval'
);

console.log('more button regression passed');
