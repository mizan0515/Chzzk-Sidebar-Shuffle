/**
 * 더보기 버튼 관리 모듈
 * 치지직 사이드바의 더보기 버튼을 관리하고 모든 채널을 로드하는 기능
 */

// 더보기 버튼 상태 관리
let moreButtonCreated = false;

/**
 * 더보기 버튼 관리 클래스
 */
class MoreButtonManager {
  constructor() {
    this.created = false;
    this.expandCallbacks = new Set();
    this.autoObserver = null;
    this.autoTimer = null;
    this.autoTimeouts = new Set();
    this.lastAutoExpandAt = 0;
    this.lastExpandedHref = '';
  }

  findExpandButton() {
    const selectors = [
      '[class*="navigation_bar_more_button__"]',
      'button[aria-expanded="false"][class*="more"]',
      'button[aria-expanded="false"][class*="navigation_bar"]',
      'button[aria-expanded="false"][class*="navigator"]',
      'nav[class*="navigation_bar"] button[aria-expanded="false"]',
      'aside:not([class*="chat"]) button[aria-expanded="false"]'
    ];

    for (const selector of selectors) {
      const buttons = window.ChzzkDom?.safeQueryAll(document, selector) || Array.from(document.querySelectorAll(selector));
      const button = buttons.find(candidate => this.isFollowingExpandButton(candidate));
      if (button) return button;
    }

    return this.findButtonByText() || this.findButtonByAria();
  }

  isFollowingExpandButton(button) {
    if (!button || button.disabled) return false;
    const text = button.textContent?.trim() || '';
    const ariaLabel = button.getAttribute('aria-label') || '';
    const ariaExpanded = button.getAttribute('aria-expanded');
    const className = typeof button.className === 'string' ? button.className : '';
    const inLnb = !!button.closest?.('aside:not([class*="chat"]), nav[class*="navigation_bar"], [class*="aside_content"], [class*="navigation_bar"]');
    const looksLikeMore = className.includes('navigation_bar_more_button') ||
      className.includes('navigator_button_more') ||
      text.includes('더보기') ||
      text.includes('펼치기') ||
      text.includes('Show more') ||
      ariaLabel.includes('더보기') ||
      ariaLabel.includes('펼치기') ||
      ariaLabel.toLowerCase().includes('more');

    return inLnb && ariaExpanded !== 'true' && looksLikeMore;
  }

  /**
   * 사이드바를 강제로 확장하여 모든 채널 로드
   * @param {Function} callback - 확장 완료 후 호출될 콜백
   */
  forceExpand(callback) {
    const startTime = Date.now();
    
    try {
      window.ChzzkLogger?.info('🔧 Attempting to expand sidebar...');
      
      const moreBtn = this.findExpandButton();
      const foundSelector = moreBtn ? 'semantic-lnb-more-button' : '';
      
      // 버튼 클릭 시도
      if (moreBtn) {
        this.clickExpandButton(moreBtn, foundSelector, callback);
      } else {
        window.ChzzkLogger?.warn('⚠️ No expand button found - this might cause incomplete channel loading');
        callback?.();
      }
      
    } catch (error) {
      window.ChzzkLogger?.error('💥 Error in forceExpand:', error);
      callback?.();
    }
    
    const duration = Date.now() - startTime;
    window.ChzzkLogger?.debug(`forceExpand completed in ${duration}ms`);
  }

  /**
   * 텍스트로 더보기 버튼 찾기
   * @private
   * @returns {Element|null} 찾은 버튼 요소
   */
  findButtonByText() {
    window.ChzzkLogger?.info('🔍 Searching for expand button by text content...');
    const buttons = document.querySelectorAll('button');
    const moreBtn = Array.from(buttons).find(btn => {
      const text = btn.textContent?.trim();
      return text && this.isFollowingExpandButton(btn) && (text.includes('더보기') || text.includes('펼치기') || text.includes('expand') || text.includes('Show more'));
    });
    
    if (moreBtn) {
      window.ChzzkLogger?.info('✓ Found expand button by text content:', moreBtn.textContent?.trim());
    }
    
    return moreBtn;
  }

  /**
   * aria-expanded 속성으로 더보기 버튼 찾기
   * @private
   * @returns {Element|null} 찾은 버튼 요소
   */
  findButtonByAria() {
    window.ChzzkLogger?.info('🔍 Searching for expand button by aria-expanded=false...');
    const ariaButtons = document.querySelectorAll('button[aria-expanded]');
    const moreBtn = Array.from(ariaButtons).find(btn => this.isFollowingExpandButton(btn));
    
    if (moreBtn) {
      window.ChzzkLogger?.info('✓ Found expand button by aria-expanded=false');
    }
    
    return moreBtn;
  }

  /**
   * 더보기 버튼 클릭 처리
   * @private
   * @param {Element} button - 클릭할 버튼
   * @param {string} foundSelector - 버튼을 찾은 방법
   * @param {Function} callback - 완료 콜백
   */
  clickExpandButton(button, foundSelector, callback) {
    const isCollapsed = button.getAttribute('aria-expanded') === 'false' ||
                       button.textContent?.includes('더보기') ||
                       button.textContent?.includes('펼치기') ||
                       button.textContent?.includes('Show more');
    
    if (isCollapsed) {
      window.ChzzkLogger?.info(`🖱️ Clicking expand button to load all channels... (found via: ${foundSelector})`);
      
      // 클릭 전 상태 확인
      const beforeClick = {
        ariaExpanded: button.getAttribute('aria-expanded'),
        textContent: button.textContent?.trim()
      };
      
      button.click();
      
      // 클릭 후 확인을 위해 약간의 지연
      setTimeout(() => {
        const afterClick = {
          ariaExpanded: button.getAttribute('aria-expanded'),
          textContent: button.textContent?.trim()
        };
        
        window.ChzzkLogger?.info('📊 Button click result:', {
          before: beforeClick,
          after: afterClick,
          clickSuccessful: beforeClick.ariaExpanded !== afterClick.ariaExpanded
        });
        
        // 추가 로딩 시간을 위해 더 긴 지연
        callback?.();
      }, 200);
      
      return;
    } else {
      window.ChzzkLogger?.info('✅ Sidebar already expanded');
    }
    
    // 버튼이 없거나 이미 확장된 경우 즉시 콜백 실행
    callback?.();
  }

  autoExpand(reason = 'auto') {
    if (window.ChzzkSettings && window.ChzzkSettings.get('enableAutoExpand') === false) {
      return false;
    }

    const now = Date.now();
    const pageKey = window.location.href;
    if (this.lastExpandedHref === pageKey && now - this.lastAutoExpandAt < 3000) {
      return false;
    }

    const button = this.findExpandButton();
    if (!button) return false;

    this.lastExpandedHref = pageKey;
    this.lastAutoExpandAt = now;
    window.ChzzkLogger?.info(`[AUTO-EXPAND] LNB expand requested (${reason})`);
    this.clickExpandButton(button, reason, () => {
      const { list } = window.ChzzkShuffle?.findChannelsList?.() || {};
      if (list) {
        this.enhanceOriginal(button, list);
        window.ChzzkStar?.injectAllStarButtons?.(list);
      }
    });
    return true;
  }

  startAutoExpand() {
    this.stopAutoExpand();
    const attempt = (reason) => this.autoExpand(reason);
    const scheduleAttempt = (reason, delay) => {
      const timer = setTimeout(() => {
        this.autoTimeouts.delete(timer);
        attempt(reason);
      }, delay);
      this.autoTimeouts.add(timer);
    };

    scheduleAttempt('initial-300ms', 300);
    scheduleAttempt('initial-1000ms', 1000);
    scheduleAttempt('initial-2500ms', 2500);

    this.autoObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          setTimeout(() => attempt('mutation'), 100);
          break;
        }
      }
    });

    if (document.body) {
      this.autoObserver.observe(document.body, { childList: true, subtree: true });
    }

    this.autoTimer = setInterval(() => attempt('interval'), 5000);
    window.ChzzkLogger?.info('[AUTO-EXPAND] Auto expand monitor started');
  }

  stopAutoExpand() {
    this.autoTimeouts.forEach(timer => clearTimeout(timer));
    this.autoTimeouts.clear();
    if (this.autoObserver) {
      this.autoObserver.disconnect();
      this.autoObserver = null;
    }
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
  }

  /**
   * 더보기 버튼을 맨 아래에 생성 (필요한 경우)
   * @param {Element} list - 버튼을 추가할 리스트 요소
   */
  ensureAtBottom(list) {
    // 중복 생성 방지
    if (this.created) {
      window.ChzzkLogger?.debug('🔄 More button already created, skipping...');
      return;
    }
    
    // 원래 더보기 버튼이 있는지 확인
    const originalMoreButton = this.findExpandButton();
    if (originalMoreButton) {
      window.ChzzkLogger?.info('👍 원래 더보기 버튼을 사용합니다. 새로 생성하지 않습니다.');
      this.enhanceOriginal(originalMoreButton, list);
      this.created = true;
      return;
    }
    
    // 원래 버튼이 없을 때만 새로 생성
    window.ChzzkLogger?.info('🔧 원래 더보기 버튼이 없어서 새로 생성합니다...');
    
    try {
      this.createNewButton(list);
      this.created = true;
      window.ChzzkLogger?.info('✅ More button successfully created');
    } catch (error) {
      window.ChzzkLogger?.error('❌ Error creating more button:', error);
    }
  }

  /**
   * 새로운 더보기 버튼 생성
   * @private
   * @param {Element} list - 버튼을 추가할 리스트 요소
   */
  createNewButton(list) {
    // 기존 footer 제거
    const existingFooters = list.querySelectorAll('[data-shuffle-created="true"]');
    if (existingFooters.length > 0) {
      window.ChzzkLogger?.debug(`🗑️ Removing ${existingFooters.length} existing footer(s)`);
      existingFooters.forEach(footer => footer.remove());
    }
    
    const moreButtonContainer = document.createElement('div');
    moreButtonContainer.className = 'navigation_bar_footer__Xd1Uj';
    moreButtonContainer.setAttribute('data-shuffle-created', 'true');
    
    const moreButton = document.createElement('button');
    moreButton.type = 'button';
    moreButton.className = 'navigator_button_more__UE0v3';
    moreButton.setAttribute('aria-expanded', 'false');
    moreButton.setAttribute('data-shuffle-button', 'true');
    
    this.updateButtonText(moreButton, false);
    
    moreButton.addEventListener('click', () => {
      const expanded = moreButton.getAttribute('aria-expanded') === 'true';
      const newState = !expanded;
      moreButton.setAttribute('aria-expanded', newState.toString());
      this.updateButtonText(moreButton, newState);
      
      this.toggleItems(list, newState);
      
      window.ChzzkLogger?.debug(`🖱️ More button clicked: expanding: ${newState}`);
    });
    
    moreButtonContainer.appendChild(moreButton);
    list.appendChild(moreButtonContainer);
  }

  /**
   * 원래 더보기 버튼 개선 (점진적 셔플 지원)
   * @param {Element} originalButton - 원래 더보기 버튼
   * @param {Element} list - 채널 리스트 요소
   */
  enhanceOriginal(originalButton, list) {
    window.ChzzkLogger?.info('🔧 더보기 버튼 점진적 로딩 지원으로 개선 중...');
    
    // 이미 처리되었는지 확인
    if (originalButton.hasAttribute('data-shuffle-enhanced')) {
      window.ChzzkLogger?.debug('🔄 버튼이 이미 처리되었습니다.');
      return;
    }
    
    originalButton.setAttribute('data-shuffle-enhanced', 'true');
    
    // 클릭 전 채널 수 저장을 위한 변수
    let previousChannelCount = 0;
    
    // 원래 버튼 클릭 이벤트에 점진적 셔플 추가 (강화된 버전)
    originalButton.addEventListener('click', () => {
      // 클릭 전 채널 수 확인
      const beforeItems = list.querySelectorAll('.navigator_item__mH4JG, .navigator_item__qXlq9, a[href*="/live/"], a[href*="/channel/"]');
      previousChannelCount = beforeItems.length;
      
      const buttonState = originalButton.getAttribute('aria-expanded');
      const isExpanding = buttonState === 'false';
      
      window.ChzzkLogger?.info(`🖱️ 더보기 버튼 클릭 - 현재 채널 수: ${previousChannelCount}, 상태: ${isExpanding ? '확장' : '축소'}`);
      
      // 원래 동작 완료 후 처리
      setTimeout(() => {
        const afterItems = list.querySelectorAll('.navigator_item__mH4JG, .navigator_item__qXlq9, a[href*="/live/"], a[href*="/channel/"]');
        const newChannelCount = afterItems.length;
        
        window.ChzzkLogger?.info(`📊 더보기 클릭 후 채널 수: ${previousChannelCount} → ${newChannelCount}`);
        
        if (isExpanding) {
          // 확장 시: 새 채널이 추가되었다면 점진적 셔플, 그렇지 않으면 전체 셔플
          if (newChannelCount > previousChannelCount) {
            const newChannels = Array.from(afterItems).slice(previousChannelCount);
            window.ChzzkLogger?.info(`🔄 ${newChannels.length}개 새 채널 발견, 점진적 셔플 실행`);
            
            if (window.ChzzkShuffle && window.ChzzkShuffle.progressiveShuffle) {
              window.ChzzkShuffle.progressiveShuffle(list, newChannels);
            }
          } else {
            // 새 채널이 없어도 전체 셔플 실행 (와이드모드 복구 등의 경우)
            window.ChzzkLogger?.info(`🎲 새 채널이 없지만 전체 채널 셔플 실행 (${newChannelCount}개)`);
            
            if (window.ChzzkShuffle && window.ChzzkSettings?.get('enableShuffle')) {
              // 전체 리셋 후 새로 셔플
              window.ChzzkShuffle.reset();
              window.ChzzkShuffle.performShuffle(list, Array.from(afterItems), true);
            }
          }
        } else {
          // 축소 시: 시청자 수 숨기기만 적용 (셔플 상태는 유지)
          window.ChzzkLogger?.info('📦 더보기 버튼 축소 - 셔플 상태 유지');
        }
        
        // 시청자 수 숨기기 적용
        if (window.ChzzkViewerCount) {
          window.ChzzkViewerCount.hideAll(list);
        }
        
        window.ChzzkLogger?.debug('🙈 더보기 버튼 클릭 후 시청자 수 숨기기 완료');
      }, 500); // 더 긴 지연으로 DOM 업데이트 대기 (300ms → 500ms)
    });
    
    window.ChzzkLogger?.info('✅ 더보기 버튼 점진적 로딩 지원 설정 완료');
  }

  /**
   * 버튼 텍스트 업데이트
   * @private
   * @param {Element} button - 업데이트할 버튼
   * @param {boolean} expanded - 확장 상태
   */
  updateButtonText(button, expanded) {
    button.innerHTML = expanded
      ? `접기<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 6.5L8 9.5L11 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
      : `더보기<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 6.5L8 9.5L11 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  }

  /**
   * 아이템들의 표시/숨김 토글
   * @private
   * @param {Element} list - 채널 리스트 요소
   * @param {boolean} expanded - 확장 상태
   */
  toggleItems(list, expanded) {
    const items = list.querySelectorAll('.navigator_item__mH4JG, .navigator_item__qXlq9, a[href*="/live/"], a[href*="/channel/"]');
    
    items.forEach((item, index) => {
      if (expanded) {
        item.style.removeProperty('display');
      } else {
        if (index >= 6) {
          item.style.display = 'none';
        }
      }
    });
    
    // 시청자 수 숨기기 적용
    if (window.ChzzkViewerCount) {
      setTimeout(() => {
        window.ChzzkViewerCount.hideAll(list);
      }, 50);
    }
  }

  /**
   * 더보기 버튼 생성 상태 초기화
   */
  reset() {
    this.created = false;
    window.ChzzkLogger?.debug('🔄 More button creation state reset');
  }

  /**
   * 정리 함수
   */
  cleanup() {
    // 생성된 버튼들 제거
    const createdButtons = document.querySelectorAll('[data-shuffle-created="true"]');
    createdButtons.forEach(button => button.remove());
    
    // 개선된 버튼들의 속성 제거
    const enhancedButtons = document.querySelectorAll('[data-shuffle-enhanced="true"]');
    enhancedButtons.forEach(button => {
      button.removeAttribute('data-shuffle-enhanced');
    });
    
    this.reset();
    this.stopAutoExpand();
    window.ChzzkLogger?.info('🧹 More button manager cleaned up');
  }
}

// 싱글톤 인스턴스 생성
const moreButtonManager = new MoreButtonManager();

// 레거시 호환성을 위한 전역 함수들
function forceExpandSidebar(callback) {
  moreButtonManager.forceExpand(callback);
}

function ensureMoreButtonAtBottom(list) {
  moreButtonManager.ensureAtBottom(list);
}

function enhanceOriginalMoreButton(originalButton, list) {
  moreButtonManager.enhanceOriginal(originalButton, list);
}

function updateMoreButtonText(button, expanded) {
  moreButtonManager.updateButtonText(button, expanded);
}

// 전역 접근을 위한 window 객체에 등록
if (typeof window !== 'undefined') {
  window.ChzzkMoreButton = moreButtonManager;
  
  // 레거시 호환성
  window.forceExpandSidebar = forceExpandSidebar;
  window.ensureMoreButtonAtBottom = ensureMoreButtonAtBottom;
  window.enhanceOriginalMoreButton = enhanceOriginalMoreButton;
  window.updateMoreButtonText = updateMoreButtonText;
  window.moreButtonCreated = false; // 레거시 전역 변수
}

// 모듈 export (Node.js 환경 대응)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MoreButtonManager,
    moreButtonManager,
    forceExpandSidebar,
    ensureMoreButtonAtBottom,
    enhanceOriginalMoreButton,
    updateMoreButtonText
  };
}
