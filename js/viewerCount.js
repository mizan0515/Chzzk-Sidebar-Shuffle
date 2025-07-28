/**
 * 시청자 수 숨기기 모듈
 * 치지직 사이드바에서 시청자 수를 선택적으로 숨기는 기능
 */

// 시청자 수 처리 상태 관리
let viewerCountProcessing = false;
let viewerCountDebounceTimer = null;
let masterViewerCountTimer = null;
let lastViewerCountState = null;

/**
 * 시청자 수 관리 클래스
 */
class ViewerCountManager {
  constructor() {
    this.processing = false;
    this.debounceTimer = null;
    this.masterTimer = null;
    this.lastState = null;
    this.isEnabled = true;
    
    // CSS 스타일 주입
    this.injectCSS();
  }

  /**
   * 시청자 수 숨기기 CSS 스타일 주입
   * @private
   */
  injectCSS() {
    const style = document.createElement('style');
    style.id = 'chzzk-viewer-count-styles';
    style.textContent = `
      /* 시청자 수 숨기기 전용 스타일 */
      .chzzk-viewer-hidden {
        position: absolute !important;
        left: -9999px !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
      
      /* 라이브 화면 시청자 수 숨기기 */
      .live_information_player__lYPjg .chzzk-viewer-hidden,
      .video_information_count__VdSfG.chzzk-viewer-hidden {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `;
    document.head.appendChild(style);
    window.ChzzkLogger?.debug('📊 Viewer count CSS styles injected');
  }

  /**
   * 시청자 수 업데이트 예약 (디바운스 적용)
   */
  scheduleUpdate() {
    // 기존 타이머들 정리
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.masterTimer) {
      clearTimeout(this.masterTimer);
    }
    
    // 단일 마스터 타이머로 처리 (200ms 디바운스)
    this.masterTimer = setTimeout(() => {
      if (this.processing) {
        return;
      }
      
      const shouldHide = window.ChzzkSettings?.get('hideViewerCount') ?? true;
      
      if (shouldHide) {
        this.hideAll();
      } else {
        this.showAll();
      }
      
      this.lastState = shouldHide;
    }, 200);
  }

  /**
   * 모든 시청자 수 숨기기
   * @param {Element} container - 검색할 컨테이너 (기본값: document)
   */
  hideAll(container = document) {
    if (!this.isEnabled) {
      return;
    }
    
    // 처리 중이면 건너뛰기 (깜빡임 방지)
    if (this.processing) {
      return;
    }
    
    this.processing = true;
    
    try {
      // 시청자 수 요소 셀렉터들 (라이브 페이지 강화)
      const viewerCountSelectors = [
        // 사이드바 시청자 수
        '.navigator_count__kpr6-', '.navigator_count__db5Av',
        'em[class*="count"]', 'span[class*="count"]',
        'em[class*="viewer"]', 'span[class*="viewer"]',
        '[class*="live_count"]', '[class*="viewer_count"]',
        '.home_recommend_live_count__7Or3N',
        
        // 라이브 페이지 현재 시청자 수 (강화된 셀렉터)
        '.video_information_count__VdSfG',
        '.live_information_player__lYPjg [class*="video_information_count"]',
        '.live_information_player__lYPjg strong',
        '.live_information_player__lYPjg [class*="count"]',
        
        // 추가 라이브 페이지 시청자 수 셀렉터
        '[class*="live_information"] [class*="count"]',
        '[class*="player"] [class*="count"]',
        '[class*="video_information"] strong',
        '.live_information_text__TyGBp strong',
        '.video_information_text__+uTx5 strong',
        
        // 더 넓은 범위 셀렉터 (라이브 페이지 전용)
        '.live_information_player__lYPjg span:not([class*="live_information_title"])',
        '.live_information_player__lYPjg em:not([class*="live_information_title"])'
      ];

      let hiddenCount = 0;

      viewerCountSelectors.forEach(selector => {
        try {
          const elements = container.querySelectorAll(selector);
          elements.forEach(element => {
            if (this.shouldHideElement(element)) {
              this.hideElement(element);
              hiddenCount++;
            }
          });
        } catch (error) {
          window.ChzzkLogger?.warn('❌ Error with selector:', selector, error.message);
        }
      });

      // 숫자 패턴으로 시청자 수 찾기 (보조 방법)
      this.hideByNumberPattern(container);

      window.ChzzkLogger?.viewer(`Hidden ${hiddenCount} viewer count elements`);
    } catch (error) {
      window.ChzzkLogger?.error('❌ Error hiding viewer counts:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * 모든 시청자 수 표시
   * @param {Element} container - 검색할 컨테이너 (기본값: document)
   */
  showAll(container = document) {
    try {
      const hiddenElements = container.querySelectorAll('.chzzk-viewer-hidden');
      let restoredCount = 0;

      hiddenElements.forEach(element => {
        this.showElement(element);
        restoredCount++;
      });

      window.ChzzkLogger?.viewer(`Restored ${restoredCount} viewer count elements`);
    } catch (error) {
      window.ChzzkLogger?.error('❌ Error showing viewer counts:', error);
    }
  }

  /**
   * 요소를 숨겨야 하는지 판단
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 숨김 여부
   */
  shouldHideElement(element) {
    // 이미 숨겨진 요소는 건너뛰기
    if (element.hasAttribute('data-chzzk-hidden') || element.classList.contains('chzzk-viewer-hidden')) {
      return false;
    }

    // 채팅 관련 요소는 제외
    const isInChat = element.closest('.live_chatting_username_container__m1-i5') ||
                    element.closest('[class*="live_chatting"]') ||
                    element.closest('[class*="chat"]');
    
    if (isInChat) {
      return false;
    }

    const text = element.textContent?.trim() || '';
    
    // 시청자 수 패턴 확인
    const isViewerCount = this.isViewerCountPattern(text);
    
    // 클래스명으로 시청자 수 판단
    const hasViewerClass = element.className && (
      element.className.includes('count') ||
      element.className.includes('viewer') ||
      element.className.includes('live_count')
    );

    // 라이브 정보 창에서는 더 엄격한 조건 적용
    const isInLiveInfo = element.closest('.live_information_player__lYPjg');
    if (isInLiveInfo) {
      return isViewerCount && !text.includes('LIVE') && !text.includes('라이브');
    }

    return isViewerCount || hasViewerClass;
  }

  /**
   * 시청자 수 패턴인지 확인
   * @private
   * @param {string} text - 검사할 텍스트
   * @returns {boolean} 시청자 수 패턴 여부
   */
  isViewerCountPattern(text) {
    if (!text) return false;

    // LIVE 텍스트나 한국어 '라이브'는 제외
    if (text.includes('LIVE') || text.includes('라이브')) {
      return false;
    }

    // 숫자 + 단위 패턴 (예: "1.2만", "523", "1,234")
    const viewerPatterns = [
      /^\d{1,3}(,\d{3})*$/,  // 쉼표로 구분된 숫자: 1,234
      /^\d+\.?\d*[만천백십]?$/,  // 한국어 단위: 1.2만, 523
      /^\d+\.?\d*[kmb]$/i,   // 영어 단위: 1.2k, 5m
      /^\d+$/                // 순수 숫자: 123
    ];

    return viewerPatterns.some(pattern => pattern.test(text));
  }

  /**
   * 요소 숨기기 (public 메서드로 변경)
   * @param {Element} element - 숨길 요소
   */
  hideElement(element) {
    try {
      element.classList.add('chzzk-viewer-hidden');
      element.setAttribute('data-chzzk-hidden', 'true');
    } catch (error) {
      window.ChzzkLogger?.warn('❌ Error hiding element:', error);
    }
  }

  /**
   * 요소 표시
   * @private
   * @param {Element} element - 표시할 요소
   */
  showElement(element) {
    try {
      element.classList.remove('chzzk-viewer-hidden');
      element.removeAttribute('data-chzzk-hidden');
    } catch (error) {
      window.ChzzkLogger?.warn('❌ Error showing element:', error);
    }
  }

  /**
   * 숫자 패턴으로 시청자 수 찾아 숨기기
   * @private
   * @param {Element} container - 검색할 컨테이너
   */
  hideByNumberPattern(container) {
    const textNodes = this.getTextNodes(container);
    
    textNodes.forEach(node => {
      if (node.parentElement && this.isViewerCountPattern(node.textContent)) {
        if (this.shouldHideElement(node.parentElement)) {
          this.hideElement(node.parentElement);
        }
      }
    });
  }

  /**
   * 텍스트 노드들 가져오기
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {Array} 텍스트 노드 배열
   */
  getTextNodes(container) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim()) {
        textNodes.push(node);
      }
    }
    
    return textNodes;
  }

  /**
   * 시청자 수 숨기기 기능 활성화/비활성화
   * @param {boolean} enabled - 활성화 여부
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    
    if (!enabled) {
      this.showAll();
    }
    
    window.ChzzkLogger?.info(`👁️ Viewer count hiding ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 정리 함수
   */
  cleanup() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.masterTimer) {
      clearTimeout(this.masterTimer);
    }
    
    // 모든 시청자 수 복원
    this.showAll();
    
    // CSS 스타일 제거
    const style = document.getElementById('chzzk-viewer-count-styles');
    if (style) {
      style.remove();
    }
  }
}

// 싱글톤 인스턴스 생성
const viewerCountManager = new ViewerCountManager();

// 레거시 호환성을 위한 전역 함수들
function hideAllViewerCounts(container) {
  viewerCountManager.hideAll(container);
}

function showAllViewerCounts(container) {
  viewerCountManager.showAll(container);
}

function scheduleViewerCountUpdate() {
  viewerCountManager.scheduleUpdate();
}

// 전역 접근을 위한 window 객체에 등록
if (typeof window !== 'undefined') {
  window.ChzzkViewerCount = viewerCountManager;
  
  // 레거시 호환성
  window.hideAllViewerCounts = hideAllViewerCounts;
  window.showAllViewerCounts = showAllViewerCounts;
  window.scheduleViewerCountUpdate = scheduleViewerCountUpdate;
}

// 모듈 export (Node.js 환경 대응)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ViewerCountManager,
    viewerCountManager,
    hideAllViewerCounts,
    showAllViewerCounts,
    scheduleViewerCountUpdate
  };
}