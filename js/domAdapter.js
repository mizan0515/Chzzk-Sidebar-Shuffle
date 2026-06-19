/**
 * DOM adapter for CHZZK sidebar discovery.
 * Avoids brittle hashed class selectors that can throw SyntaxError.
 */
(function() {
  'use strict';

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function safeQuery(root, selector) {
    try {
      return (root || document).querySelector(selector);
    } catch (error) {
      if (typeof window !== 'undefined') {
        window.ChzzkLogger?.warn(`[DOM] Ignored invalid selector: ${selector}`, error);
      }
      return null;
    }
  }

  function safeQueryAll(root, selector) {
    try {
      return toArray((root || document).querySelectorAll(selector));
    } catch (error) {
      if (typeof window !== 'undefined') {
        window.ChzzkLogger?.warn(`[DOM] Ignored invalid selector: ${selector}`, error);
      }
      return [];
    }
  }

  function textOf(element) {
    return (element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isStatusText(text) {
    return /^(live|on|off|offline|라이브|오프라인|방송중)$/i.test(String(text || '').trim());
  }

  function isNonNameText(text) {
    const value = String(text || '').trim();
    if (!value) return true;
    if (isStatusText(value)) return true;
    if (/^(인증\s*마크|★|☆)$/.test(value)) return true;
    if (/^[\d,]+명?$/.test(value)) return true;
    return false;
  }

  function textLines(element) {
    const raw = element?.innerText || element?.textContent || '';
    return String(raw)
      .split(/\r?\n/)
      .map(text => text.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function firstNameText(element) {
    const line = textLines(element).find(text => !isNonNameText(text));
    if (line) return line;

    return textOf(element)
      .replace(/인증\s*마크/g, '')
      .replace(/[★☆]/g, '')
      .trim();
  }

  function extractChannelName(element, link) {
    const nameElement =
      safeQuery(element, '[class*="navigator_name"]') ||
      safeQuery(element, '[class*="name_text"]') ||
      safeQuery(element, '[class*="nickname"]') ||
      safeQuery(element, '[class*="channel_name"]') ||
      safeQuery(element, 'strong');

    if (nameElement) return firstNameText(nameElement);

    const directTextChild = toArray(link?.children)
      .map(child => firstNameText(child))
      .find(text => text && !isNonNameText(text));

    return directTextChild || firstNameText(link);
  }

  function parseChannelIdFromHref(href) {
    if (!href) return null;
    const match = String(href).match(/\/(?:live|channel)\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getChannelLink(element) {
    if (!element) return null;
    if (element.matches?.('a[href*="/live/"], a[href*="/channel/"]')) return element;
    return safeQuery(element, 'a[href*="/live/"], a[href*="/channel/"]');
  }

  function extractChannel(element) {
    const link = getChannelLink(element);
    const href = link?.getAttribute('href') || link?.href || '';
    const id = parseChannelIdFromHref(href);
    if (!id) return null;

    const avatar = safeQuery(element, 'img');
    const isLive = !!(
      safeQuery(element, '[class*="navigator_count"]') ||
      safeQuery(element, '[class*="live"]') ||
      safeQuery(element, 'em[class*="count"], span[class*="count"]')
    );

    return {
      id,
      name: extractChannelName(element, link) || id,
      href: href || `/live/${id}`,
      avatarUrl: avatar?.src || '',
      isLive,
      lastSeenAt: Date.now()
    };
  }

  function findChannelItems(root) {
    const searchRoot = root || document;
    const candidates = [
      ...safeQueryAll(searchRoot, '[class*="navigator_item"]'),
      ...safeQueryAll(searchRoot, 'li[class*="navigation_bar_item"]'),
      ...safeQueryAll(searchRoot, 'a[href*="/live/"]'),
      ...safeQueryAll(searchRoot, 'a[href*="/channel/"]')
    ];

    const seen = new Set();
    const items = [];

    candidates.forEach((candidate) => {
      const item = candidate.closest?.('li') || candidate;
      if (!item || seen.has(item)) return;
      if (!getChannelLink(item)) return;
      seen.add(item);
      items.push(item);
    });

    return items;
  }

  function scoreList(list) {
    if (!list) return 0;
    const items = findChannelItems(list);
    const className = typeof list.className === 'string' ? list.className : '';
    let score = items.length * 10;
    if (className.includes('navigation_bar_list')) score += 30;
    if (className.includes('navigator_list')) score += 20;
    if (list.tagName === 'UL') score += 5;
    return score;
  }

  function findChannelsList(root) {
    const searchRoot = root || document;
    const selectors = [
      '[class*="navigation_bar_list"]',
      '[class*="navigator_list"]',
      'nav ul',
      'aside ul',
      'ul'
    ];

    let best = null;
    let bestScore = 0;

    selectors.forEach((selector) => {
      safeQueryAll(searchRoot, selector).forEach((list) => {
        const currentScore = scoreList(list);
        if (currentScore > bestScore) {
          best = list;
          bestScore = currentScore;
        }
      });
    });

    return {
      list: best,
      items: best ? findChannelItems(best) : [],
      selector: best ? 'domAdapter' : ''
    };
  }

  const adapter = {
    safeQuery,
    safeQueryAll,
    parseChannelIdFromHref,
    getChannelLink,
    extractChannelName,
    extractChannel,
    findChannelItems,
    findChannelsList
  };

  if (typeof window !== 'undefined') {
    window.ChzzkDom = adapter;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = adapter;
  }
})();
