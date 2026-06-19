const assert = require('node:assert/strict');
const dom = require('../js/domAdapter.js');

class FakeElement {
  constructor(tagName, className = '', attrs = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.attrs = attrs;
    this.textContent = text;
    this.children = [];
    this.parent = null;
  }

  append(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  get href() {
    return this.attrs.href || '';
  }

  get src() {
    return this.attrs.src || '';
  }

  matches(selector) {
    return matches(this, selector);
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matches(current, selector)) return current;
      current = current.parent;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (/\.[A-Za-z0-9_-]*\+[A-Za-z0-9_-]*/.test(selector)) {
      throw new SyntaxError(`Invalid selector ${selector}`);
    }
    const result = [];
    visit(this, node => {
      if (node !== this && selector.split(',').some(part => matches(node, part.trim()))) result.push(node);
    });
    return result;
  }
}

function visit(node, callback) {
  callback(node);
  node.children.forEach(child => visit(child, callback));
}

function matches(node, selector) {
  if (!selector) return false;
  if (selector === '*') return true;
  if (selector === 'ul') return node.tagName === 'UL';
  if (selector === 'li') return node.tagName === 'LI';
  if (selector === 'strong') return node.tagName === 'STRONG';
  if (selector === 'span') return node.tagName === 'SPAN';
  if (selector === 'img') return node.tagName === 'IMG';
  if (selector === 'nav ul') return node.tagName === 'UL' && node.parent?.tagName === 'NAV';
  if (selector === 'aside ul') return node.tagName === 'UL' && !!node.closest('aside');
  if (selector === 'aside') return node.tagName === 'ASIDE';
  if (selector.startsWith('a[')) {
    const needle = selector.includes('/live/') ? '/live/' : '/channel/';
    return node.tagName === 'A' && node.href.includes(needle);
  }
  if (selector.includes('a[href*="/live/"], a[href*="/channel/"]')) return node.tagName === 'A' && /\/(live|channel)\//.test(node.href);
  if (selector.includes('[class*="')) {
    const value = selector.match(/\[class\*="([^"]+)"\]/)?.[1];
    return value ? String(node.className).includes(value) : false;
  }
  if (selector.startsWith('li[class*="')) {
    const value = selector.match(/\[class\*="([^"]+)"\]/)?.[1];
    return node.tagName === 'LI' && String(node.className).includes(value);
  }
  return false;
}

const root = new FakeElement('aside', 'aside_container__R9MN6');
const nav = root.append(new FakeElement('nav'));
const list = nav.append(new FakeElement('ul', 'navigation_bar_list__+d2qh'));
const alpha = list.append(new FakeElement('li', 'navigation_bar_item__4OS5Z navigator_item__mH4JG'));
alpha.append(new FakeElement('a', '', { href: '/live/alpha' })).append(new FakeElement('strong', 'navigator_name__k4Sc2', {}, 'Alpha'));
const beta = list.append(new FakeElement('li', 'navigation_bar_item__4OS5Z navigator_item__qXlq9'));
beta.append(new FakeElement('a', '', { href: '/channel/beta' })).append(new FakeElement('strong', 'navigator_name__k4Sc2', {}, 'Beta'));
const gamma = list.append(new FakeElement('li', 'navigation_bar_item__4OS5Z'));
const gammaLink = gamma.append(new FakeElement('a', '', { href: '/live/gamma' }));
gammaLink.append(new FakeElement('span', '', {}, 'Gamma Stream'));
gammaLink.append(new FakeElement('span', '', {}, '라이브'));
const delta = list.append(new FakeElement('li', '_item_q99ll_63'));
delta.append(new FakeElement('a', '_item_link_1lz65_108', { href: '/live/delta' }));
const deltaInfo = delta.append(new FakeElement('div', '_information_1lz65_179'));
const deltaName = deltaInfo.append(new FakeElement('strong', '_name_1lz65_74', {}, 'Delta\n인증 마크'));
deltaName.append(new FakeElement('span', '_text_dtc6c_2', {}, 'Delta'));
deltaName.append(new FakeElement('i', '_icon_dtc6c_17', {}, '인증 마크'));
deltaInfo.append(new FakeElement('span', '_description_1lz65_218', {}, '2026 FIFA 북중미 월드컵'));

const invalidHashedSelector = '.navigation_bar_list__' + '+d2qh';
assert.equal(dom.safeQueryAll(root, invalidHashedSelector).length, 0);
const found = dom.findChannelsList(root);
assert.equal(found.items.length, 4);
assert.deepEqual(found.items.map(item => dom.extractChannel(item).id), ['alpha', 'beta', 'gamma', 'delta']);
assert.equal(dom.extractChannel(gamma).name, 'Gamma Stream');
assert.equal(dom.extractChannel(delta).name, 'Delta');
assert.equal(dom.parseChannelIdFromHref('/live/abc?x=1'), 'abc');

console.log('selector regression passed');
