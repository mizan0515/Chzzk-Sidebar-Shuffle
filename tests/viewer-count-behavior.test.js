const assert = require('node:assert/strict');

class FakeClassList {
  constructor(owner, initial = '') {
    this.owner = owner;
    this.values = new Set(String(initial).split(/\s+/).filter(Boolean));
  }

  add(value) {
    this.values.add(value);
    this.owner.className = Array.from(this.values).join(' ');
  }

  remove(value) {
    this.values.delete(value);
    this.owner.className = Array.from(this.values).join(' ');
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, className = '', textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.textContent = textContent;
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.classList = new FakeClassList(this, className);
  }

  appendChild(child) {
    child.parentElement = this;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    visit(this, (node) => {
      if (node !== this && node.matches(selector)) results.push(node);
    });
    return results;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  matches(selector) {
    return selector
      .split(',')
      .map(part => part.trim())
      .some(part => matchesSimple(this, part));
  }
}

function visit(node, callback) {
  callback(node);
  node.children.forEach(child => visit(child, callback));
}

function matchesSimple(node, selector) {
  if (!selector) return false;
  if (selector === 'svg' || selector === '.blind') return false;
  if (selector.startsWith('.')) {
    return node.classList.contains(selector.slice(1));
  }
  const classContains = selector.match(/^\[class\*="([^"]+)"\]$/);
  if (classContains) {
    return String(node.className).includes(classContains[1]);
  }
  const tagClassContains = selector.match(/^([a-z]+)\[class\*="([^"]+)"\]$/i);
  if (tagClassContains) {
    return node.tagName.toLowerCase() === tagClassContains[1].toLowerCase() &&
      String(node.className).includes(tagClassContains[2]);
  }
  return node.tagName.toLowerCase() === selector.toLowerCase();
}

const body = new FakeElement('body', 'page_root');
const head = new FakeElement('head', 'head_root');

global.window = {
  ChzzkLogger: {
    debug() {},
    info() {},
    warn() {},
    error() {},
    viewer() {}
  },
  ChzzkSettings: { get: () => true },
  location: { pathname: '/following' },
  addEventListener() {}
};
global.document = {
  body,
  head,
  createElement: tag => new FakeElement(tag),
  getElementById: () => null,
  querySelector: selector => body.querySelector(selector),
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
global.performance = { now: () => 0 };
global.MutationObserver = class {
  observe() {}
  disconnect() {}
};
global.Node = { ELEMENT_NODE: 1 };
global.history = {
  pushState() {},
  replaceState() {}
};
global.setInterval = () => 1;
global.clearInterval = () => {};
global.setTimeout = (fn) => {
  if (typeof fn === 'function') fn();
  return 1;
};
global.clearTimeout = () => {};

const { ViewerCountManager } = require('../js/viewerCount.js');
const manager = Object.create(ViewerCountManager.prototype);
manager.isEnabled = true;

const app = body.appendChild(new FakeElement('div', 'app_shell'));
const card = app.appendChild(new FakeElement('div', 'video_card_container__urjO6'));
const description = card.appendChild(new FakeElement('div', 'video_card_description__2sUfw'));
const hashedViewer = description.appendChild(new FakeElement('span', '_container_1o5pg_2 undefined', '47명'));

assert.equal(manager.isLikelyChzzkViewerCountContainer(hashedViewer), true);
assert.equal(manager.shouldHideElementWithImmediateMode(hashedViewer), true);
manager.hideElement(hashedViewer);
assert.equal(hashedViewer.classList.contains('chzzk-viewer-hidden'), true);
assert.equal(hashedViewer.hasAttribute('data-chzzk-hidden'), true);

const chat = app.appendChild(new FakeElement('div', 'live_chatting_area'));
const chatHashed = chat.appendChild(new FakeElement('span', '_container_1o5pg_2 undefined', '47명'));
assert.equal(manager.isLikelyChzzkViewerCountContainer(chatHashed), false);
assert.equal(manager.shouldHideElementWithImmediateMode(chatHashed), false);

console.log('viewer count behavior regression passed');
