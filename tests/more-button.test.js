const assert = require('node:assert/strict');

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

console.log('more button regression passed');
