/**
 * 별표(즐겨찾기) 관리 모듈
 * 치지직 사이드바의 스트리머를 즐겨찾기하고 셔플 시 최상단 배치
 */

const STAR_STORAGE_KEY = 'starredChannels';
const STAR_BUTTON_ATTR = 'data-chzzk-star-btn';
const STAR_BINDING_ATTR = 'data-chzzk-star-binding';
const STAR_ACTIVE_CLASS = 'chzzk-star-active';
const STAR_BINDING_TOKEN = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

class StarManager {
  constructor() {
    /** @type {Set<string>} 즐겨찾기된 channel_id 목록 */
    this.starredChannels = new Set();
    /** @type {boolean} 스토리지 로드 완료 여부 */
    this.loaded = false;
    /** @type {MutationObserver|null} DOM 변경 감지 옵저버 */
    this.domObserver = null;
    this.contextInvalidated = false;

    this.injectCSS();
    this.setupStorageListener();
    this.setupContextInvalidationListener();
  }

  // --- 스토리지 관련 ---

  /**
   * chrome.storage.sync + local 양쪽에서 즐겨찾기 목록 로드 (합집합 병합)
   * 둘 다 비어있으면 최대 2회 재시도 (1초, 2초 간격)
   * @param {number} [_retryCount=0] - 내부 재시도 카운터
   * @returns {Promise<Set<string>>}
   */
  async load(_retryCount = 0) {
    try {
      this.assertExtensionContextAvailable();
      if (this.hasStorage()) {
        // 양쪽 스토리지에서 동시 로드
        const [syncResult, localResult] = await Promise.all([
          this.storageGet('sync', STAR_STORAGE_KEY).catch((error) => {
            if (this.isExtensionContextInvalidated(error)) throw error;
            return {};
          }),
          this.storageGet('local', STAR_STORAGE_KEY).catch((error) => {
            if (this.isExtensionContextInvalidated(error)) throw error;
            return {};
          })
        ]);

        const syncData = syncResult[STAR_STORAGE_KEY];
        const localData = localResult[STAR_STORAGE_KEY];

        const syncSet = Array.isArray(syncData) ? new Set(syncData) : new Set();
        const localSet = Array.isArray(localData) ? new Set(localData) : new Set();

        // 합집합 병합 — 어느 쪽에라도 있으면 유지
        if (syncSet.size > 0 || localSet.size > 0) {
          this.starredChannels = new Set([...syncSet, ...localSet]);
        } else if (_retryCount < 2) {
          // 둘 다 비어있으면 스토리지 초기화 지연 가능성 → 재시도
          const delay = (_retryCount + 1) * 1000;
          window.ChzzkLogger?.info(`[STAR] Both storages empty, retrying in ${delay}ms (attempt ${_retryCount + 1}/2)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.load(_retryCount + 1);
        }

        if (window.ChzzkFavoriteTierStore) {
          const tierState = await window.ChzzkFavoriteTierStore.load();
          this.starredChannels = new Set([...this.starredChannels, ...(tierState.starred || [])]);
        }
      }
      this.loaded = true;
      window.ChzzkLogger?.info(`[STAR] Loaded ${this.starredChannels.size} starred channels`);
      return this.starredChannels;
    } catch (error) {
      if (this.isExtensionContextInvalidated(error)) {
        this.markExtensionContextInvalidated(error);
        this.loaded = true;
        return this.starredChannels;
      }
      window.ChzzkLogger?.warn('[STAR] Failed to load starred channels:', error);
      this.loaded = true;
      return this.starredChannels;
    }
  }

  /**
   * 현재 즐겨찾기 목록을 chrome.storage.sync + local 양쪽에 저장
   * 빈 데이터로 기존 데이터를 덮어쓰는 것을 방지
   * @returns {Promise<boolean>}
   */
  async save(options = {}) {
    const { syncTierStore = true } = options;
    try {
      this.assertExtensionContextAvailable();
      if (this.hasStorage()) {
        const data = Array.from(this.starredChannels);

        // 빈 데이터 덮어쓰기 방지
        if (data.length === 0 && !this.loaded) {
          const existing = await this.storageGet('local', STAR_STORAGE_KEY).catch((error) => {
            if (this.isExtensionContextInvalidated(error)) throw error;
            return {};
          });
          const existingData = existing[STAR_STORAGE_KEY];
          if (Array.isArray(existingData) && existingData.length > 0) {
            // 기존 데이터가 있는데 빈 데이터로 덮어쓰려는 시도 — 차단
            window.ChzzkLogger?.warn('[STAR] Blocked saving empty data over existing data');
            return false;
          }
        }

        // 용량 체크 (chrome.storage.sync 개별 항목 8KB 한도)
        const serialized = JSON.stringify(data);
        if (serialized.length > 7500) {
          window.ChzzkLogger?.warn('[STAR] Approaching storage limit, removing oldest entries');
          while (JSON.stringify(Array.from(this.starredChannels)).length > 7000) {
            const oldest = this.starredChannels.values().next().value;
            this.starredChannels.delete(oldest);
          }
        }

        // sync + local 양쪽에 저장
        const saveData = Array.from(this.starredChannels);
        await Promise.all([
          this.storageSet('sync', { [STAR_STORAGE_KEY]: saveData }),
          this.storageSet('local', { [STAR_STORAGE_KEY]: saveData })
        ]);

        if (syncTierStore && window.ChzzkFavoriteTierStore) {
          await window.ChzzkFavoriteTierStore.ensureLoaded();
          window.ChzzkFavoriteTierStore.state.starred = saveData;
          saveData.forEach((id) => {
            if (!window.ChzzkFavoriteTierStore.state.channels[id]) {
              window.ChzzkFavoriteTierStore.state.channels[id] = { id, name: id, href: `/live/${id}`, avatarUrl: '', lastSeenAt: Date.now() };
            }
          });
          await window.ChzzkFavoriteTierStore.save();
        }
      }
      window.ChzzkLogger?.info(`[STAR] Saved ${this.starredChannels.size} starred channels`);
      return true;
    } catch (error) {
      if (this.isExtensionContextInvalidated(error)) {
        this.markExtensionContextInvalidated(error);
        throw error;
      }
      window.ChzzkLogger?.warn('[STAR] Failed to save starred channels:', error);
      return false;
    }
  }

  /**
   * 채널 즐겨찾기 토글
   * @param {string} channelId - href에서 추출한 channel_id
   * @returns {Promise<boolean>} 토글 후 즐겨찾기 상태
   */
  async toggleStar(channelId) {
    this.assertExtensionContextAvailable();
    let channel = null;
    const { list } = window.ChzzkShuffle?.findChannelsList?.() || {};
    const items = window.ChzzkDom?.findChannelItems(list || document) || [];
    for (const item of items) {
      const extracted = window.ChzzkDom?.extractChannel(item);
      if (extracted?.id === channelId) {
        channel = extracted;
        break;
      }
    }

    const wasStarred = this.starredChannels.has(channelId);
    const nextStarred = !wasStarred;
    if (nextStarred) {
      this.starredChannels.add(channelId);
    } else {
      this.starredChannels.delete(channelId);
    }

    let legacySaved = false;
    try {
      legacySaved = await this.save({ syncTierStore: false });
    } catch (error) {
      if (wasStarred) this.starredChannels.add(channelId);
      else this.starredChannels.delete(channelId);
      throw error;
    }

    if (!legacySaved) {
      if (wasStarred) this.starredChannels.add(channelId);
      else this.starredChannels.delete(channelId);
      throw new Error('즐겨찾기 저장에 실패했습니다.');
    }

    if (window.ChzzkFavoriteTierStore) {
      try {
        await window.ChzzkFavoriteTierStore.setStarred(channelId, nextStarred, channel);
      } catch (error) {
        if (wasStarred) this.starredChannels.add(channelId);
        else this.starredChannels.delete(channelId);
        await this.save({ syncTierStore: false }).catch(() => undefined);
        throw error;
      }
    }
    return this.starredChannels.has(channelId);
  }

  /**
   * 채널이 즐겨찾기인지 확인
   * @param {string} channelId
   * @returns {boolean}
   */
  isStarred(channelId) {
    return this.starredChannels.has(channelId);
  }

  /**
   * 멀티 탭 동기화를 위한 storage 변경 리스너 (sync + local 양쪽 감지)
   * @private
   */
  setupStorageListener() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if ((areaName === 'sync' || areaName === 'local') && changes[STAR_STORAGE_KEY]) {
          const newValue = changes[STAR_STORAGE_KEY].newValue;
          if (Array.isArray(newValue)) {
            this.syncStarredChannels(newValue, areaName);
          }
        }
      });
    }
  }

  hasStorage() {
    return !!window.ChzzkPlatform?.storage || (typeof chrome !== 'undefined' && !!chrome.storage);
  }

  storageGet(area, keys) {
    if (window.ChzzkPlatform?.storageGet) {
      return window.ChzzkPlatform.storageGet(area, keys);
    }
    const store = chrome?.storage?.[area];
    if (!store?.get) return Promise.resolve({});
    return store.get(keys);
  }

  storageSet(area, value) {
    if (window.ChzzkPlatform?.storageSet) {
      return window.ChzzkPlatform.storageSet(area, value);
    }
    const store = chrome?.storage?.[area];
    if (!store?.set) return Promise.resolve();
    return store.set(value);
  }

  assertExtensionContextAvailable() {
    if (!this.contextInvalidated && !window.ChzzkPlatform?.isContextInvalidated?.()) return;
    const error = new Error('Extension context invalidated.');
    error.code = 'EXTENSION_CONTEXT_INVALIDATED';
    this.markExtensionContextInvalidated(error);
    throw error;
  }

  syncStarredChannels(values, source = 'external') {
    if (!Array.isArray(values)) return;
    this.starredChannels = new Set(values.filter(Boolean));
    window.ChzzkLogger?.info(`[STAR] Starred channels synced from ${source} (${this.starredChannels.size} channels)`);
    this.refreshAllStarButtons();
  }

  syncFromTierState(state) {
    this.syncStarredChannels(state?.starred || [], 'tier-state');
  }

  setupContextInvalidationListener() {
    if (typeof window === 'undefined') return;
    window.addEventListener?.('chzzk:extension-context-invalidated', (event) => {
      this.markExtensionContextInvalidated(event.detail?.message || event);
    });
  }

  isExtensionContextInvalidated(error) {
    return !!window.ChzzkPlatform?.isContextInvalidatedError?.(error) ||
      /Extension context invalidated|context invalidated/i.test(String(error?.message || error || ''));
  }

  markExtensionContextInvalidated(error) {
    this.contextInvalidated = true;
    window.ChzzkPlatform?.markContextInvalidated?.(error);
    document.querySelectorAll?.(`[${STAR_BUTTON_ATTR}]`).forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = '확장이 갱신되었습니다. 치지직 탭을 새로고침해 주세요.';
      button.setAttribute('aria-label', button.title);
    });
    this.showReloadNotice();
    window.ChzzkLogger?.warn('[STAR] Extension context invalidated; disabled stale star buttons.', error);
  }

  showReloadNotice() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.getElementById?.('chzzk-extension-reload-notice')) return;

    const notice = document.createElement('div');
    notice.id = 'chzzk-extension-reload-notice';
    notice.className = 'chzzk-extension-reload-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');

    const message = document.createElement('span');
    message.textContent = '확장이 갱신되었습니다. 즐겨찾기를 계속 쓰려면 치지직 탭을 새로고침하세요.';

    const reloadButton = document.createElement('button');
    reloadButton.type = 'button';
    reloadButton.className = 'chzzk-extension-reload-button';
    reloadButton.textContent = '새로고침';
    reloadButton.addEventListener?.('click', () => {
      window.location?.reload?.();
    });

    notice.appendChild(message);
    notice.appendChild(reloadButton);
    document.body.appendChild?.(notice);
  }

  // --- DOM 조작 관련 ---

  /**
   * 별표 버튼용 CSS 스타일 주입
   * @private
   */
  injectCSS() {
    const existingStyle = document.getElementById('chzzk-star-styles');
    if (existingStyle) existingStyle.remove();

    const style = document.createElement('style');
    style.id = 'chzzk-star-styles';
    const extensionVersion = this.getExtensionVersion();
    if (extensionVersion) {
      style.setAttribute('data-chzzk-extension-version', extensionVersion);
    }
    style.setAttribute('data-chzzk-feature', 'star');
    style.textContent = `
      .chzzk-star-btn {
        position: static;
        transform: none;
        width: 32px;
        height: 32px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(12, 18, 24, 0.88);
        backdrop-filter: blur(10px);
        border-radius: 8px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);
        cursor: pointer;
        line-height: 0;
        padding: 0;
        z-index: 10;
        opacity: 1;
        transition: transform 0.15s ease, color 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        display: inline-grid;
        place-items: center;
        color: #a0aec0;
      }

      .chzzk-star-host {
        position: relative !important;
        min-height: 40px !important;
      }

      .chzzk-star-slot {
        position: absolute;
        top: 50%;
        right: 6px;
        transform: translateY(-50%);
        width: 36px;
        height: 36px;
        z-index: 10;
        display: grid;
        place-items: center;
        pointer-events: none;
      }

      .chzzk-star-slot > .chzzk-star-btn {
        pointer-events: auto;
      }

      .chzzk-star-host > a {
        padding-right: max(44px, var(--chzzk-star-reserved-inline, 44px)) !important;
        min-height: 40px !important;
        display: flex !important;
        align-items: center !important;
      }

      .chzzk-star-btn svg {
        width: 18px;
        height: 18px;
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .navigation_bar_item__4OS5Z:hover > .chzzk-star-btn,
      li:hover > .chzzk-star-btn {
        opacity: 1;
      }

      .chzzk-star-btn.chzzk-star-active {
        opacity: 1;
        color: #111827;
        background: #ffd166;
        border-color: #ffd166;
        box-shadow: 0 0 0 1px rgba(255, 209, 102, 0.24), 0 8px 18px rgba(0, 0, 0, 0.24);
      }

      .chzzk-star-btn.chzzk-star-active svg {
        fill: currentColor;
      }

      .chzzk-star-btn:hover {
        transform: scale(1.06);
        color: #ffd700;
      }

      .chzzk-star-btn:focus-visible {
        outline: 2px solid #69ffd0;
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .chzzk-star-btn {
          transition-duration: 0.01ms !important;
        }

        .chzzk-star-btn:hover {
          transform: none;
        }
      }

      .chzzk-extension-reload-notice {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: min(420px, calc(100vw - 32px));
        padding: 12px 12px 12px 14px;
        border: 1px solid rgba(105, 255, 208, 0.34);
        border-radius: 8px;
        background: rgba(15, 23, 32, 0.96);
        color: #f2f5f7;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
        font-size: 13px;
        line-height: 1.45;
      }

      .chzzk-extension-reload-button {
        flex: 0 0 auto;
        min-height: 32px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        background: #00ffa3;
        color: #08120f;
        font-weight: 700;
        cursor: pointer;
      }

      .chzzk-extension-reload-button:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }
    `;

    try {
      document.head.appendChild(style);
    } catch (error) {
      window.ChzzkLogger?.error('[STAR] Failed to inject star styles:', error);
    }
  }

  getExtensionVersion() {
    try {
      return window.ChzzkPlatform?.getManifestVersion?.() ||
        window.ChzzkPlatform?.runtime?.getManifest?.().version ||
        chrome?.runtime?.getManifest?.().version ||
        '';
    } catch {
      return '';
    }
  }

  /**
   * 채널 요소에서 channel_id 추출
   * @param {Element} channelElement - <li>, <a>, 또는 채널 내부 요소
   * @returns {string|null}
   */
  extractChannelId(channelElement) {
    try {
      // 먼저 내부에서 링크를 찾기
      const linkElement = channelElement.querySelector && channelElement.querySelector('a[href*="/live/"], a[href*="/channel/"]');
      if (linkElement) {
        return this._parseChannelIdFromHref(linkElement.getAttribute('href'));
      }
      // channelElement 자체가 <a>인 경우
      if (channelElement.tagName === 'A' && channelElement.href) {
        return this._parseChannelIdFromHref(channelElement.getAttribute('href'));
      }
      // 부모에서 찾기
      const parentLink = channelElement.closest && channelElement.closest('a[href*="/live/"], a[href*="/channel/"]');
      if (parentLink) {
        return this._parseChannelIdFromHref(parentLink.getAttribute('href'));
      }
      return null;
    } catch (error) {
      window.ChzzkLogger?.warn('[STAR] Error extracting channel ID:', error);
      return null;
    }
  }

  /**
   * href 문자열에서 channel_id 파싱
   * @private
   * @param {string} href
   * @returns {string|null}
   */
  _parseChannelIdFromHref(href) {
    if (!href) return null;
    const match = href.match(/\/(live|channel)\/([^/?#]+)/);
    return match ? match[2] : null;
  }

  /**
   * 단일 채널 요소에 별표 버튼 삽입
   * @param {Element} channelElement - 채널 요소
   */
  injectStarButton(channelElement) {
    // li 컨테이너 기준으로 작업
    const container = channelElement.closest('li') || channelElement;

    const channelId = this.extractChannelId(container);
    if (!channelId) return;

    // 이미 별표 버튼이 있으면 채널 ID 일치 여부 확인
    const existingBtn = container.querySelector(`[${STAR_BUTTON_ATTR}]`);
    if (existingBtn) {
      const existingId = existingBtn.getAttribute(STAR_BUTTON_ATTR);
      if (existingId === channelId) {
        if (existingBtn.getAttribute(STAR_BINDING_ATTR) === STAR_BINDING_TOKEN) {
          this.updateStarButtonState(existingBtn, this.isStarred(channelId));
          return;
        }
        existingBtn.remove();
      } else {
        // 채널 불일치 (SPA DOM 재활용) 또는 리로드 후 stale listener → 새로 생성
        existingBtn.remove();
      }
    }

    const starBtn = document.createElement('button');
    starBtn.setAttribute(STAR_BUTTON_ATTR, channelId);
    starBtn.setAttribute(STAR_BINDING_ATTR, STAR_BINDING_TOKEN);
    starBtn.className = 'chzzk-star-btn';
    starBtn.type = 'button';

    const isStarred = this.isStarred(channelId);
    this.updateStarButtonState(starBtn, isStarred);

    starBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.contextInvalidated || starBtn.disabled) return;

      try {
        starBtn.disabled = true;
        starBtn.setAttribute('aria-busy', 'true');
        const nowStarred = await this.toggleStar(channelId);
        this.updateStarButtonState(starBtn, nowStarred);

        window.ChzzkLogger?.info(`[STAR] Channel ${channelId} ${nowStarred ? 'starred' : 'unstarred'}`);

        // 즐겨찾기 상태 변경 후 즉시 위치 재정렬
        const sortOptions = { shuffleWithinTiers: false, reason: 'star-toggle' };
        if (nowStarred) sortOptions.pinChannelId = channelId;
        if (window.applyChzzkTierSort) {
          await window.applyChzzkTierSort(sortOptions);
        } else if (window.ChzzkShuffle && typeof window.ChzzkShuffle.applyTierSort === 'function') {
          window.ChzzkShuffle.applyTierSort(sortOptions);
        } else if (window.ChzzkShuffle && typeof window.ChzzkShuffle.reorderByStarState === 'function') {
          window.ChzzkShuffle.reorderByStarState();
        }
      } catch (error) {
        this.updateStarButtonState(starBtn, this.isStarred(channelId));
        if (this.isExtensionContextInvalidated(error)) {
          this.markExtensionContextInvalidated(error);
          return;
        }
        window.ChzzkLogger?.warn('[STAR] Toggle failed; restored button state', error);
      } finally {
        starBtn.removeAttribute('aria-busy');
        if (!this.contextInvalidated) {
          starBtn.disabled = false;
          starBtn.removeAttribute('aria-disabled');
        }
      }
    });

    // <li> 컨테이너의 직접 자식 슬롯으로 삽입하여 링크/시청자 수 텍스트 흐름과 분리한다.
    container.classList.add('chzzk-star-host');
    container.style.position = 'relative';
    let slot = container.querySelector(':scope > .chzzk-star-slot');
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'chzzk-star-slot';
      container.appendChild(slot);
    }
    slot.textContent = '';
    slot.appendChild(starBtn);
  }

  /**
   * 주어진 컨테이너 내 모든 채널에 별표 버튼 일괄 삽입
   * @param {Element} [container=document] - 검색할 상위 요소
   */
  injectAllStarButtons(container) {
    const root = container || document;
    const seenElements = new Set();
    const items = window.ChzzkDom?.findChannelItems(root) || [];

    items.forEach(item => {
      if (!seenElements.has(item)) {
        seenElements.add(item);
        this.injectStarButton(item);
      }
    });

    window.ChzzkLogger?.info(`[STAR] Injected star buttons for ${seenElements.size} channels`);
  }

  /**
   * 현재 DOM의 모든 별표 버튼 상태를 갱신
   */
  refreshAllStarButtons() {
    const allButtons = document.querySelectorAll(`[${STAR_BUTTON_ATTR}]`);
    allButtons.forEach(btn => {
      const channelId = btn.getAttribute(STAR_BUTTON_ATTR);
      const isStarred = this.isStarred(channelId);
      this.updateStarButtonState(btn, isStarred);
    });
  }

  updateStarButtonState(button, active) {
    if (!button) return;
    button.innerHTML = this.renderStarIcon(active);
    button.classList.toggle(STAR_ACTIVE_CLASS, active);
    button.title = active ? '즐겨찾기 해제' : '즐겨찾기 추가';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(active));
  }

  renderStarIcon(active) {
    return `
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"></path>
      </svg>
    `;
  }

  /**
   * DOM 변경 감시를 시작하여 새 채널에도 별표 버튼 자동 삽입
   */
  startObserving() {
    if (this.domObserver) {
      this.domObserver.disconnect();
    }

    let debounceTimer = null;

    this.domObserver = new MutationObserver((mutations) => {
      let hasNewChannels = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            // 별표 버튼 자체의 추가는 무시
            if (node.hasAttribute && node.hasAttribute(STAR_BUTTON_ATTR)) continue;

            const isChannel = !!window.ChzzkDom?.getChannelLink?.(node) || (node.matches && (
              node.matches('.navigator_item__mH4JG') ||
              node.matches('.navigator_item__qXlq9') ||
              node.matches('[class*="navigator_item"]') ||
              node.matches('li[class*="navigation_bar_item"]')
            ));

            if (isChannel) {
              hasNewChannels = true;
              break;
            }

            if (node.querySelector) {
              const channels = window.ChzzkDom?.findChannelItems?.(node) || Array.from(node.querySelectorAll(
                '.navigator_item__mH4JG, .navigator_item__qXlq9, [class*="navigator_item"], a[href*="/live/"], a[href*="/channel/"]'
              ));
              if (channels.length > 0) {
                hasNewChannels = true;
                break;
              }
            }
          }
        }

        // href 속성 변경 감지 (SPA DOM 재활용 시 채널 교체 감지)
        if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
          const target = mutation.target;
          if (target.tagName === 'A') {
            const href = target.getAttribute('href');
            if (href && (/\/live\//.test(href) || /\/channel\//.test(href))) {
              const li = target.closest('li');
              if (li) {
                hasNewChannels = true;
              }
            }
          }
        }

        if (hasNewChannels) break;
      }

      if (hasNewChannels) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.injectAllStarButtons(), 150);
      }
    });

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });

    window.ChzzkLogger?.info('[STAR] DOM observer started');
  }

  /**
   * DOM 변경 감시 중지
   */
  stopObserving() {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
      window.ChzzkLogger?.info('[STAR] DOM observer stopped');
    }
  }

  /**
   * 모든 별표 버튼 DOM에서 제거
   */
  removeAllStarButtons() {
    const allButtons = document.querySelectorAll(`[${STAR_BUTTON_ATTR}]`);
    allButtons.forEach(btn => btn.remove());
  }

  /**
   * 상태 초기화 (페이지 전환 시)
   */
  reset() {
    this.stopObserving();
  }
}

// 싱글톤 인스턴스 생성
const starManager = new StarManager();

// 전역 접근
if (typeof window !== 'undefined') {
  window.ChzzkStar = starManager;
}

// Node.js 환경 대응
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StarManager, starManager };
}
