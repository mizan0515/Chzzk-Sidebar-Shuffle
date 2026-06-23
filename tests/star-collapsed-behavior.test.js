const assert = require('node:assert/strict');

class FakeClassList {
  constructor(owner, initial = '') {
    this.owner = owner;
    this.values = new Set(String(initial).split(/\s+/).filter(Boolean));
    this.sync();
  }

  sync() {
    this.owner.className = Array.from(this.values).join(' ');
  }

  add(value) {
    this.values.add(value);
    this.sync();
  }

  remove(value) {
    this.values.delete(value);
    this.sync();
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
    this.sync();
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, attrs = {}, className = '') {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.style = {};
    this.innerHTML = '';
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.disabled = false;
    this.removed = false;
    this._width = 160;
    this.classList = new FakeClassList(this, className);
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter(item => item !== child);
    }
    this.children.push(child);
    child.parentElement = this;
    child.parentNode = this;
    return child;
  }

  remove() {
    this.removed = true;
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  addEventListener() {}

  getBoundingClientRect() {
    return { width: this._width, height: 40, top: 0 };
  }

  querySelector(selector) {
    if (selector === ':scope > .chzzk-star-slot') {
      return this.children.find(child => child.classList?.contains('chzzk-star-slot')) || null;
    }
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
  if (selector === 'li') return node.tagName === 'LI';
  if (selector === '[data-chzzk-star-btn]') return node.hasAttribute('data-chzzk-star-btn');
  if (selector === '.chzzk-star-host') return node.classList.contains('chzzk-star-host');
  if (selector === '[aria-expanded="false"]') return node.getAttribute('aria-expanded') === 'false';
  if (selector === 'a[href*="/live/"], a[href*="/channel/"]' ||
      selector === 'a[href*="/live/"]' ||
      selector === 'a[href*="/channel/"]') {
    return node.tagName === 'A' && /\/(live|channel)\//.test(node.getAttribute('href') || '');
  }
  const classContains = selector.match(/^\[class\*="([^"]+)"\]$/);
  if (classContains) return String(node.className).includes(classContains[1]);
  return false;
}

const body = new FakeElement('body');
const head = new FakeElement('head');
let observedOptions = null;
let lastObserver = null;
let resizeHandler = null;

global.document = {
  body,
  head,
  documentElement: new FakeElement('html'),
  getElementById() {
    return null;
  },
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  querySelectorAll(selector) {
    return body.querySelectorAll(selector);
  }
};

global.window = {
  ChzzkLogger: {
    info() {},
    warn() {},
    error() {}
  },
  addEventListener(type, handler) {
    if (type === 'resize') resizeHandler = handler;
  },
  removeEventListener(type, handler) {
    if (type === 'resize' && resizeHandler === handler) resizeHandler = null;
  }
};
global.setTimeout = (fn) => {
  if (typeof fn === 'function') fn();
  return 1;
};
global.clearTimeout = () => {};
global.MutationObserver = class {
  constructor(callback) {
    this.callback = callback;
    lastObserver = this;
  }

  observe(target, options) {
    observedOptions = options;
    this.target = target;
  }

  disconnect() {
    this.disconnected = true;
  }
};
global.Node = { ELEMENT_NODE: 1 };

const { StarManager } = require('../js/star.js');
const manager = new StarManager();
manager.loaded = true;

const row = body.appendChild(new FakeElement('li'));
row.appendChild(new FakeElement('a', { href: '/live/collapse-alpha' }));

manager.injectStarButton(row);
assert.equal(row.classList.contains('chzzk-star-host'), true);
assert.equal(row.classList.contains('chzzk-star-host-collapsed'), false);
assert.ok(row.querySelector('[data-chzzk-star-btn]'), 'Star button should be injected before collapse');

manager.startObserving();
assert.deepEqual(
  observedOptions.attributeFilter,
  ['href', 'class', 'style', 'aria-expanded'],
  'Star observer should watch collapse-related attributes as well as href changes'
);
assert.equal(typeof resizeHandler, 'function', 'Star observer should refresh collapsed state on resize');

row._width = 56;
lastObserver.callback([{ type: 'attributes', attributeName: 'class', target: row }]);
assert.equal(
  row.classList.contains('chzzk-star-host-collapsed'),
  true,
  'Class/width collapse changes after injection should hide the star slot'
);

row._width = 160;
row.setAttribute('aria-expanded', 'true');
resizeHandler();
assert.equal(
  row.classList.contains('chzzk-star-host-collapsed'),
  false,
  'Resize/expand changes should show the star slot again when the row is wide'
);

row.setAttribute('aria-expanded', 'false');
lastObserver.callback([{ type: 'attributes', attributeName: 'aria-expanded', target: row }]);
assert.equal(
  row.classList.contains('chzzk-star-host-collapsed'),
  true,
  'aria-expanded=false should hide injected star controls even when row width is not narrow'
);

manager.stopObserving();
assert.equal(resizeHandler, null, 'Stopping observation should release the resize handler');

console.log('star collapsed behavior regression passed');
