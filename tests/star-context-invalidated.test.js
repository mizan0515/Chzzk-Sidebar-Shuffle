const assert = require('node:assert/strict');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.disabled = false;
    this.textContent = '';
    this.className = '';
    this.classList = {
      toggle() {},
      add() {},
      remove() {},
      contains() { return false; }
    };
    this.style = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener() {}

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  getAttribute(name) {
    return this.attrs[name];
  }
}

let storageSetCalls = 0;
let storageGetCalls = 0;
let markedInvalidated = 0;
let reloadNotice = null;
const staleStarButton = new FakeElement('button');

global.document = {
  head: { appendChild() {} },
  body: {
    appendChild(element) {
      if (element.id === 'chzzk-extension-reload-notice') reloadNotice = element;
      return element;
    }
  },
  getElementById(id) {
    return id === 'chzzk-extension-reload-notice' ? reloadNotice : null;
  },
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  querySelectorAll(selector) {
    return selector === '[data-chzzk-star-btn]' ? [staleStarButton] : [];
  }
};

global.window = {
  ChzzkLogger: {
    info() {},
    warn() {},
    error() {}
  },
  ChzzkPlatform: {
    storage: { local: {}, sync: {} },
    isContextInvalidated: () => true,
    isContextInvalidatedError(error) {
      return /Extension context invalidated/i.test(String(error?.message || error));
    },
    markContextInvalidated() {
      markedInvalidated += 1;
    },
    storageGet() {
      storageGetCalls += 1;
      return Promise.resolve({});
    },
    storageSet() {
      storageSetCalls += 1;
      return Promise.resolve();
    }
  },
  addEventListener() {},
  location: {
    reload() {}
  }
};

const { StarManager } = require('../js/star.js');

(async () => {
  const manager = new StarManager();
  manager.loaded = true;

  await assert.rejects(
    () => manager.toggleStar('alpha'),
    /Extension context invalidated/
  );

  assert.equal(storageGetCalls, 0);
  assert.equal(storageSetCalls, 0);
  assert.equal(markedInvalidated > 0, true);
  assert.equal(manager.isStarred('alpha'), false);
  assert.equal(staleStarButton.disabled, true);
  assert.equal(staleStarButton.attrs['aria-disabled'], 'true');
  assert.equal(!!reloadNotice, true);
  assert.equal(reloadNotice.attrs.role, 'status');
  assert.equal(reloadNotice.attrs['aria-live'], 'polite');

  console.log('star context invalidation regression passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
