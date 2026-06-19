const assert = require('node:assert/strict');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, force) {
    if (force) this.add(value);
    else this.remove(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.classList = new FakeClassList();
    this.style = {};
    this.innerHTML = '';
    this.title = '';
    this.type = '';
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  remove() {
    this.removed = true;
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    }
  }

  closest(selector) {
    return selector === 'li' && this.tagName === 'LI' ? this : null;
  }

  querySelector(selector) {
    if (selector === 'a[href*="/live/"], a[href*="/channel/"]') {
      return this.children.find(child => child.tagName === 'A') || null;
    }
    if (selector === '[data-chzzk-star-btn]') {
      return findDeep(this, child => !child.removed && child.attrs['data-chzzk-star-btn']);
    }
    return null;
  }

  addEventListener() {}
}

function findDeep(element, predicate) {
  for (const child of element.children || []) {
    if (predicate(child)) return child;
    const nested = findDeep(child, predicate);
    if (nested) return nested;
  }
  return null;
}

global.document = {
  head: { appendChild() {} },
  body: {},
  getElementById() {
    return null;
  },
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  querySelectorAll() {
    return [];
  }
};

global.window = {
  ChzzkLogger: {
    info() {},
    warn() {},
    error() {}
  }
};

const { StarManager } = require('../js/star.js');
const manager = new StarManager();
manager.loaded = true;

const li = new FakeElement('li');
li.appendChild(new FakeElement('a', { href: '/live/channel-alpha' }));
const existing = new FakeElement('button', { 'data-chzzk-star-btn': 'channel-alpha', 'aria-pressed': 'true' });
existing.classList.add('chzzk-star-active');
li.appendChild(existing);

manager.injectStarButton(li);
assert.equal(existing.removed, true);

const rebound = li.querySelector('[data-chzzk-star-btn]');
assert.notEqual(rebound, existing);
assert.equal(rebound.getAttribute('aria-pressed'), 'false');
assert.equal(rebound.title, '즐겨찾기 추가');
assert.equal(rebound.classList.contains('chzzk-star-active'), false);

manager.starredChannels.add('channel-alpha');
manager.injectStarButton(li);
assert.equal(li.querySelector('[data-chzzk-star-btn]'), rebound);
assert.equal(rebound.getAttribute('aria-pressed'), 'true');
assert.equal(rebound.title, '즐겨찾기 해제');
assert.equal(rebound.classList.contains('chzzk-star-active'), true);

manager.starredChannels = new Set(['channel-alpha', 'channel-beta']);
manager.syncStarredChannels(['channel-alpha'], 'local');
assert.equal(manager.isStarred('channel-alpha'), true);
assert.equal(manager.isStarred('channel-beta'), false);

(async () => {
  const rollbackManager = new StarManager();
  rollbackManager.loaded = true;
  rollbackManager.save = async () => {
    throw new Error('Extension context invalidated.');
  };

  await assert.rejects(
    () => rollbackManager.toggleStar('channel-gamma'),
    /Extension context invalidated/
  );
  assert.equal(rollbackManager.isStarred('channel-gamma'), false);

  rollbackManager.starredChannels.add('channel-delta');
  await assert.rejects(
    () => rollbackManager.toggleStar('channel-delta'),
    /Extension context invalidated/
  );
  assert.equal(rollbackManager.isStarred('channel-delta'), true);

  console.log('star state regression passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
