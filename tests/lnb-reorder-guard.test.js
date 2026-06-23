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

  closest(selector) {
    if (selector !== 'li') return null;
    let current = this;
    while (current) {
      if (current.tagName === 'LI') return current;
      current = current.parentElement;
    }
    return null;
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

function channelOrder(list) {
  return list.children
    .map(child => child.querySelector?.('a[href*="/live/"], a[href*="/channel/"]')?.href?.split('/').pop())
    .filter(Boolean);
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
const incompleteList = new FakeElement('ul', '_list_incomplete');
body.appendChild(incompleteList);
const incompleteHeader = incompleteList.appendChild(new FakeElement('li', '_header'));
const incompleteAlpha = incompleteList.appendChild(channelLi('alpha'));
const incompleteBeta = incompleteList.appendChild(channelLi('beta'));
shuffle.findChannelsList = () => ({ list: incompleteList, items: [incompleteAlpha, incompleteBeta] });
shuffle.findChannelItems = () => [alpha, beta];
assert.equal(shuffle.restoreShuffleState(restoreState), false);
assert.deepEqual(list.children, beforeUnsafeRestore);
assert.equal(list.children.length, 4);
assert.deepEqual(incompleteList.children, [incompleteHeader, incompleteAlpha, incompleteBeta]);

const directList = new FakeElement('ul', '_list_direct');
body.appendChild(directList);
const directHeader = directList.appendChild(new FakeElement('li', '_header'));
const directAlpha = directList.appendChild(channelLi('direct-alpha'));
const directBeta = directList.appendChild(channelLi('direct-beta'));
const directGamma = directList.appendChild(channelLi('direct-gamma'));
const nestedAnchors = [directAlpha, directBeta, directGamma].map(item => item.querySelector('a[href*="/live/"], a[href*="/channel/"]'));

global.window.ChzzkPlatform = null;
global.window.ChzzkFavoriteTierStore = {
  state: {
    starred: ['direct-gamma'],
    tiers: [],
    assignments: {},
    tierOrder: {}
  }
};
global.window.ChzzkStar = {
  isStarred: id => id === 'direct-gamma',
  extractChannelId: element => {
    const link = element.querySelector?.('a[href*="/live/"], a[href*="/channel/"]') || (element.tagName === 'A' ? element : null);
    return link?.href?.split('/').pop() || '';
  }
};
global.window.ChzzkDom = {
  extractChannel: element => {
    const link = element.querySelector?.('a[href*="/live/"], a[href*="/channel/"]') || (element.tagName === 'A' ? element : null);
    const id = link?.href?.split('/').pop() || '';
    return id ? { id } : null;
  }
};
shuffle.findChannelsList = () => ({ list: directList, items: nestedAnchors });
shuffle.findChannelItems = () => nestedAnchors;
assert.equal(shuffle.applyTierSort({ shuffleWithinTiers: false }), true);
assert.deepEqual(directList.children, [directHeader, directGamma, directAlpha, directBeta]);

const pinList = new FakeElement('ul', '_list_pin');
body.appendChild(pinList);
pinList.appendChild(new FakeElement('li', '_header'));
const pinAlpha = pinList.appendChild(channelLi('pin-alpha'));
const pinBeta = pinList.appendChild(channelLi('pin-beta'));
const pinGamma = pinList.appendChild(channelLi('pin-gamma'));
const pinAnchors = [pinAlpha, pinBeta, pinGamma].map(item => item.querySelector('a[href*="/live/"], a[href*="/channel/"]'));
global.window.ChzzkFavoriteTierStore = {
  state: {
    starred: ['pin-alpha', 'pin-beta', 'pin-gamma'],
    tiers: [
      { id: 's', order: 0 },
      { id: 'a', order: 1 }
    ],
    assignments: {
      'pin-alpha': 's',
      'pin-beta': 'a'
    },
    tierOrder: {
      s: ['pin-alpha'],
      a: ['pin-beta']
    }
  }
};
global.window.ChzzkStar = {
  isStarred: id => ['pin-alpha', 'pin-beta', 'pin-gamma'].includes(id),
  extractChannelId: element => {
    const link = element.querySelector?.('a[href*="/live/"], a[href*="/channel/"]') || (element.tagName === 'A' ? element : null);
    return link?.href?.split('/').pop() || '';
  }
};
shuffle.findChannelsList = () => ({ list: pinList, items: pinAnchors });
shuffle.findChannelItems = () => pinAnchors;
assert.equal(shuffle.applyTierSort({ shuffleWithinTiers: false, pinChannelId: 'pin-beta' }), true);
assert.deepEqual(channelOrder(pinList), ['pin-beta', 'pin-alpha', 'pin-gamma']);

const tierShuffleList = new FakeElement('ul', '_list_tier_shuffle');
body.appendChild(tierShuffleList);
tierShuffleList.appendChild(new FakeElement('li', '_header'));
const tierIds = ['tier-s1', 'tier-s2', 'tier-a1', 'tier-a2', 'tier-u1', 'tier-u2', 'tier-g1'];
const tierItems = tierIds.map(id => tierShuffleList.appendChild(channelLi(id)));
const tierAnchors = tierItems.map(item => item.querySelector('a[href*="/live/"], a[href*="/channel/"]'));
global.window.ChzzkFavoriteTierStore = {
  state: {
    starred: ['tier-s1', 'tier-s2', 'tier-a1', 'tier-a2', 'tier-u1', 'tier-u2'],
    tiers: [
      { id: 's', order: 0 },
      { id: 'a', order: 1 }
    ],
    assignments: {
      'tier-s1': 's',
      'tier-s2': 's',
      'tier-a1': 'a',
      'tier-a2': 'a'
    },
    tierOrder: {
      s: ['tier-s1', 'tier-s2'],
      a: ['tier-a1', 'tier-a2']
    }
  }
};
global.window.ChzzkStar = {
  isStarred: id => global.window.ChzzkFavoriteTierStore.state.starred.includes(id),
  extractChannelId: element => {
    const link = element.querySelector?.('a[href*="/live/"], a[href*="/channel/"]') || (element.tagName === 'A' ? element : null);
    return link?.href?.split('/').pop() || '';
  }
};
const originalShuffleArray = shuffle.shuffleArray;
let tierShuffleCalls = 0;
shuffle.shuffleArray = group => {
  tierShuffleCalls += 1;
  group.reverse();
};
shuffle.findChannelsList = () => ({ list: tierShuffleList, items: tierAnchors });
shuffle.findChannelItems = () => tierAnchors;
assert.equal(shuffle.applyTierSort({ shuffleWithinTiers: true }), true);
assert.deepEqual(channelOrder(tierShuffleList), ['tier-s2', 'tier-s1', 'tier-a2', 'tier-a1', 'tier-u2', 'tier-u1', 'tier-g1']);
assert.equal(tierShuffleCalls, 4);

assert.equal(shuffle.applyTierSort({ shuffleWithinTiers: true, reason: 'mutation:new-channel-content' }), true);
assert.deepEqual(channelOrder(tierShuffleList), ['tier-s2', 'tier-s1', 'tier-a2', 'tier-a1', 'tier-u2', 'tier-u1', 'tier-g1']);
assert.equal(tierShuffleCalls, 8);

assert.equal(shuffle.applyTierSort({ shuffleWithinTiers: true, reason: 'mutation:new-channel-content' }), true);
assert.deepEqual(channelOrder(tierShuffleList), ['tier-s2', 'tier-s1', 'tier-a2', 'tier-a1', 'tier-u2', 'tier-u1', 'tier-g1']);
assert.equal(tierShuffleCalls, 8);

assert.equal(shuffle.applyTierSort({ shuffleWithinTiers: true }), true);
assert.deepEqual(channelOrder(tierShuffleList), ['tier-s2', 'tier-s1', 'tier-a2', 'tier-a1', 'tier-u2', 'tier-u1', 'tier-g1']);
assert.equal(tierShuffleCalls, 12);
shuffle.shuffleArray = originalShuffleArray;

console.log('lnb reorder guard passed');
