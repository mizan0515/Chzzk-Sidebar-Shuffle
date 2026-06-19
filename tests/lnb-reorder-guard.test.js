const assert = require('node:assert/strict');

class FakeElement {
  constructor(tagName, className = '', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.attrs = attrs;
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this.id = attrs.id || '';
  }

  appendChild(child) {
    if (child.isFragment) {
      [...child.children].forEach(item => this.appendChild(item));
      child.children = [];
      return child;
    }

    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter(item => item !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter(item => item !== this);
    this.parentElement = null;
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  get href() {
    return this.attrs.href || '';
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    visit(this, node => {
      if (node !== this && matches(node, selector)) result.push(node);
    });
    return result;
  }
}

class FakeFragment {
  constructor() {
    this.isFragment = true;
    this.children = [];
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter(item => item !== child);
    }
    child.parentElement = null;
    this.children.push(child);
    return child;
  }
}

function visit(node, callback) {
  callback(node);
  node.children.forEach(child => visit(child, callback));
}

function matches(node, selector) {
  if (selector.includes('a[href*="/live/"], a[href*="/channel/"]')) {
    return node.tagName === 'A' && /\/(live|channel)\//.test(node.href);
  }
  if (selector === '.chzzk-shuffle-hidden' || selector === '.chzzk-hidden') return false;
  return false;
}

function channelLi(id) {
  const li = new FakeElement('li', '_item_q99ll_63');
  li.appendChild(new FakeElement('a', '', { href: `/live/${id}` }));
  return li;
}

const body = new FakeElement('body');
const head = new FakeElement('head');
global.document = {
  body,
  head,
  getElementById: () => null,
  createElement: tag => new FakeElement(tag),
  createDocumentFragment: () => new FakeFragment(),
  querySelectorAll: selector => body.querySelectorAll(selector),
  contains(node) {
    let current = node;
    while (current) {
      if (current === body || current === head) return true;
      current = current.parentElement;
    }
    return false;
  }
};
global.window = {
  ChzzkLogger: {
    debug() {},
    info() {},
    warn() {},
    error() {},
    shuffle() {},
    trace() {}
  }
};
global.setTimeout = fn => fn();

require('../js/shuffle.js');

const shuffle = global.window.ChzzkShuffle;
const list = new FakeElement('ul', '_list_q99ll_53');
body.appendChild(list);
const header = list.appendChild(new FakeElement('li', '_header_q99ll_1'));
const alpha = list.appendChild(channelLi('alpha'));
const beta = list.appendChild(channelLi('beta'));
const gamma = list.appendChild(channelLi('gamma'));

const reordered = shuffle.applySafeReordering(list, [
  { element: gamma },
  { element: alpha },
  { element: beta }
]);

assert.equal(reordered, true);
assert.deepEqual(list.children, [header, gamma, alpha, beta]);
assert.equal(list.children.length, 4);

const beforeUnsafe = [...list.children];
const unsafeSubset = shuffle.applySafeReordering(list, [
  { element: gamma },
  { element: alpha }
]);

assert.equal(unsafeSubset, false);
assert.deepEqual(list.children, beforeUnsafe);
assert.equal(list.children.length, 4);

const foreignList = new FakeElement('ul', '_list_q99ll_53');
body.appendChild(foreignList);
const foreign = foreignList.appendChild(channelLi('foreign'));
const unsafeForeign = shuffle.applySafeReordering(list, [
  { element: gamma },
  { element: alpha },
  { element: foreign }
]);

assert.equal(unsafeForeign, false);
assert.deepEqual(list.children, beforeUnsafe);

shuffle.baselineOrderById = new Map();
shuffle.rememberBaselineOrder([{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }]);
const restoredByBaseline = [
  { id: 'gamma', originalIndex: 0 },
  { id: 'alpha', originalIndex: 1 },
  { id: 'beta', originalIndex: 2 }
].sort((a, b) => shuffle.getBaselineOrder(a) - shuffle.getBaselineOrder(b));
assert.deepEqual(restoredByBaseline.map(item => item.id), ['alpha', 'beta', 'gamma']);

global.window.ChzzkPlatform = { isContextInvalidated: () => true };
const beforeInvalidatedSort = [...list.children];
assert.equal(shuffle.reorderByStarState(), false);
assert.deepEqual(list.children, beforeInvalidatedSort);
assert.equal(shuffle.applyTierSort(), false);
assert.deepEqual(list.children, beforeInvalidatedSort);
global.window.ChzzkPlatform = null;

const restoreState = {
  timestamp: Date.now(),
  totalChannels: 3,
  channelOrder: [
    { href: '/live/alpha', streamerName: null },
    { href: '/live/beta', streamerName: null },
    { href: '/live/gamma', streamerName: null }
  ],
  shuffleCompleted: true
};

shuffle.findChannelsList = () => ({ list, items: [gamma, alpha, beta] });
shuffle.findChannelItems = () => [gamma, alpha, beta];
assert.equal(shuffle.restoreShuffleState(restoreState), true);
assert.deepEqual(list.children, [header, alpha, beta, gamma]);

const beforeUnsafeRestore = [...list.children];
shuffle.findChannelsList = () => ({ list, items: [alpha, beta] });
shuffle.findChannelItems = () => [alpha, beta];
assert.equal(shuffle.restoreShuffleState(restoreState), false);
assert.deepEqual(list.children, beforeUnsafeRestore);
assert.equal(list.children.length, 4);

console.log('lnb reorder guard passed');
