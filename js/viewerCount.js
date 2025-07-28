/**
 * 시청자 수 숨기기 모듈
 * 치지직 사이드바에서 시청자 수를 선택적으로 숨기는 기능
 */

// 시청자 수 처리 상태 관리 (고도화)
let viewerCountProcessing = false;
let viewerCountDebounceTimer = null;
let masterViewerCountTimer = null;
let lastViewerCountState = null;
let globalViewerObserver = null;
let processedElements = new WeakSet(); // 메모리 누수 방지

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
    
    // 고도화된 실시간 모니터링 시작
    this.startAdvancedMonitoring();
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
   * 모든 시청자 수 숨기기 (성능 최적화)
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
    
    // 성능 측정 시작
    const startTime = performance.now();
    this.processing = true;
    
    try {
      // 시청자 수 요소 셀렉터들 (포괄적 강화)
      const viewerCountSelectors = [
        // === 1단계: 정확한 셀렉터 (최고 성능) ===
        
        // 카드 뷰 시청자 수 (새로 추가)
        '.thumbnail_badge_container__sMIz3',
        '.video_card_container__urjO6 .thumbnail_badge_container__sMIz3',
        '.video_card_description__2sUfw span.thumbnail_badge_container__sMIz3',
        
        // 라이브 페이지 현재 시청자 수 (새로 추가)
        '.video_information_count__Y05sI',
        '.video_information_data__w3P+x strong',
        '.video_information_row__HrQ0z strong',
        
        // 기존 사이드바 시청자 수
        '.navigator_count__kpr6-', '.navigator_count__db5Av',
        '.home_recommend_live_count__7Or3N',
        
        // 기존 라이브 페이지
        '.video_information_count__VdSfG',
        '.live_information_player__lYPjg strong',
        
        // === 2단계: 패턴 기반 백업 셀렉터 ===
        
        // 카드 뷰 백업 (클래스 변경 대응)
        '[class*="thumbnail_badge"] span:not([class*="live"])',
        '[class*="video_card"] [class*="badge"] span',
        '[class*="card_description"] span:not(.blind)',
        
        // 라이브 페이지 백업
        '[class*="video_information"] strong',
        '[class*="information_data"] strong',
        '[class*="information_row"] strong',
        '[class*="live_information"] [class*="count"]',
        
        // 범용 백업 셀렉터
        'em[class*="count"]', 'span[class*="count"]',
        'strong[class*="count"]', 'div[class*="count"]',
        'em[class*="viewer"]', 'span[class*="viewer"]',
        '[class*="live_count"]', '[class*="viewer_count"]',
        
        // === 3단계: 광범위 검색 (최후 보완) ===
        
        // 위치 기반 검색
        '.video_card_container__urjO6 span:not(.blind):not([class*="title"]):not([class*="name"])',
        '[class*="information"] span:not(.blind):not([class*="title"]):not([class*="name"])',
        '[class*="player"] span:not(.blind):not([class*="title"]):not([class*="name"])',
        
        // 태그 기반 광범위 검색 (성능상 마지막에 배치)
        'span:not(.blind):not([class*="title"]):not([class*="name"]):not([class*="tag"])',
        'strong:not([class*="title"]):not([class*="name"]):not([class*="tag"])'
      ];

      let hiddenCount = 0;

      // === 3단계 검색 시스템 실행 ===
      
      // 1단계: 정확한 셀렉터 우선 처리 (성능 최적화)
      const tier1Selectors = viewerCountSelectors.slice(0, 15); // 정확한 셀렉터들
      let tier1Success = false;
      
      tier1Selectors.forEach(selector => {
        try {
          const elements = container.querySelectorAll(selector);
          elements.forEach(element => {
            if (this.shouldHideElement(element)) {
              this.hideElement(element);
              hiddenCount++;
              tier1Success = true;
            }
          });
        } catch (error) {
          window.ChzzkLogger?.warn('❌ Tier 1 selector error:', selector, error.message);
        }
      });

      // 2단계: 패턴 기반 백업 검색 (1단계에서 부족한 경우)
      if (!tier1Success || hiddenCount < 3) {
        window.ChzzkLogger?.debug('🔍 Executing Tier 2 pattern-based search...');
        
        const tier2Selectors = viewerCountSelectors.slice(15, 30); // 패턴 기반 셀렉터들
        tier2Selectors.forEach(selector => {
          try {
            const elements = container.querySelectorAll(selector);
            elements.forEach(element => {
              if (this.shouldHideElement(element)) {
                this.hideElement(element);
                hiddenCount++;
              }
            });
          } catch (error) {
            window.ChzzkLogger?.warn('❌ Tier 2 selector error:', selector, error.message);
          }
        });
      }

      // 3단계: 광범위 텍스트 패턴 스캔 (최후 보완)
      if (hiddenCount < 5) {
        window.ChzzkLogger?.debug('🔍 Executing Tier 3 comprehensive text scan...');
        
        const tier3Selectors = viewerCountSelectors.slice(30); // 광범위 셀렉터들
        tier3Selectors.forEach(selector => {
          try {
            const elements = container.querySelectorAll(selector);
            elements.forEach(element => {
              if (this.shouldHideElement(element)) {
                this.hideElement(element);
                hiddenCount++;
              }
            });
          } catch (error) {
            window.ChzzkLogger?.warn('❌ Tier 3 selector error:', selector, error.message);
          }
        });

        // 최후 수단: 전체 텍스트 노드 스캔
        this.hideByAdvancedTextPattern(container);
      }

      // 성능 측정 및 보고
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      window.ChzzkLogger?.viewer(`✅ Hidden ${hiddenCount} elements (3-tier) in ${duration.toFixed(2)}ms`);
      
      // 성능 경고 (500ms 이상 소요 시)
      if (duration > 500) {
        window.ChzzkLogger?.warn(`⚠️ Performance warning: hideAll took ${duration.toFixed(2)}ms`);
      }
      
    } catch (error) {
      window.ChzzkLogger?.error('❌ Error hiding viewer counts:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * 배치 처리로 대량 요소 숨기기 (성능 최적화)
   * @private
   * @param {Element[]} elements - 처리할 요소 배열
   * @param {number} batchSize - 배치 크기
   */
  async processBatch(elements, batchSize = 50) {
    window.ChzzkLogger?.debug(`🔄 Processing ${elements.length} elements in batches of ${batchSize}...`);
    
    for (let i = 0; i < elements.length; i += batchSize) {
      const batch = elements.slice(i, i + batchSize);
      
      // 각 배치를 동기적으로 처리
      batch.forEach(element => {
        if (!processedElements.has(element) && this.shouldHideElement(element)) {
          this.hideElement(element);
          processedElements.add(element); // 중복 처리 방지
        }
      });
      
      // 대량 처리 시 브라우저 블로킹 방지
      if (elements.length > 100 && i + batchSize < elements.length) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
  }

  /**
   * 메모리 효율적인 요소 수집
   * @private
   * @param {string[]} selectors - 셀렉터 배열
   * @param {Element} container - 검색 컨테이너
   * @returns {Element[]} 수집된 요소 배열
   */
  collectElementsEfficiently(selectors, container) {
    const elements = [];
    const seenElements = new Set();
    
    // 메모리 효율성을 위해 한 번에 하나씩 처리
    selectors.forEach(selector => {
      try {
        const nodeList = container.querySelectorAll(selector);
        
        // NodeList를 효율적으로 순회
        for (let i = 0; i < nodeList.length; i++) {
          const element = nodeList[i];
          
          // 중복 제거 (WeakSet 대신 Set 사용으로 메모리 최적화)
          if (!seenElements.has(element)) {
            seenElements.add(element);
            elements.push(element);
          }
        }
      } catch (error) {
        window.ChzzkLogger?.warn(`❌ Selector error: ${selector}`, error.message);
      }
    });
    
    return elements;
  }

  /**
   * 가비지 컬렉션 최적화
   * @private
   */
  optimizeMemory() {
    // 주기적으로 처리된 요소 추적 초기화 (메모리 누수 방지)
    if (processedElements.size > 1000) {
      window.ChzzkLogger?.debug('🧹 Cleaning up processed elements cache...');
      processedElements = new WeakSet();
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
    
    // 클래스명으로 시청자 수 판단 (안전한 문자열 처리)
    const safeClassName = (element.className && typeof element.className === 'string') ? 
                         element.className : 
                         (element.className && element.className.baseVal ? element.className.baseVal : '');
    const hasViewerClass = safeClassName && (
      safeClassName.includes('count') ||
      safeClassName.includes('viewer') ||
      safeClassName.includes('live_count')
    );

    // 라이브 정보 창에서는 더 엄격한 조건 적용
    const isInLiveInfo = element.closest('.live_information_player__lYPjg');
    if (isInLiveInfo) {
      return isViewerCount && !text.includes('LIVE') && !text.includes('라이브');
    }

    return isViewerCount || hasViewerClass;
  }

  /**
   * 시청자 수 패턴인지 확인 (강화된 버전)
   * @private
   * @param {string} text - 검사할 텍스트
   * @returns {boolean} 시청자 수 패턴 여부
   */
  isViewerCountPattern(text) {
    if (!text) return false;

    // 정규화: 공백 제거 및 소문자 변환
    const normalizedText = text.trim().replace(/\s+/g, ' ');

    // === 강화된 제외 패턴 ===
    const excludePatterns = [
      // 기본 제외
      /LIVE|라이브|스트리밍/i,
      // 게임 및 카테고리
      /talk|게임|카테고리|category/i,
      // 스트리머 관련
      /스트리머|채널|channel|streamer/i,
      // 시간 관련  
      /시간|분|초|hour|minute|second/i,
      // 기타 UI 요소
      /팔로우|follow|구독|subscribe/i,
      // 태그 관련
      /태그|tag|에스더|카론/i
    ];

    if (excludePatterns.some(pattern => pattern.test(normalizedText))) {
      return false;
    }

    // === 강화된 시청자 수 패턴 ===
    const viewerPatterns = [
      // 기본 패턴
      /^\d{1,3}(,\d{3})*명$/,                    // "2,839명"
      /^\d+\.?\d*[만천백십]명?$/,                // "1.2만명", "523명"  
      /^\d+\.?\d*[kmb]$/i,                      // "1.2k", "5m"
      /^\d+$/,                                  // "123"
      
      // 복합 패턴 (새로 추가)
      /^\d{1,3}(,\d{3})*명\s*시청\s*중$/,        // "2,862명 시청 중"
      /^\d{1,3}(,\d{3})*명이?\s*시청\s*중$/,     // "2,862명이 시청 중"
      /^\d+\.?\d*[만천백십]명?\s*시청\s*중$/,    // "1.2만명 시청 중"
      /^\d+\.?\d*[kmb]\s*watching$/i,           // "1.2k watching"
      
      // 실시간 업데이트 패턴
      /^\d{1,3}(,\d{3})*\s*viewers?$/i,         // "2,839 viewers"
      /^\d+\.?\d*[만천백십]?\s*viewers?$/i,     // "1.2만 viewers"
      
      // 추가 한국어 패턴
      /^\d{1,3}(,\d{3})*명\s*온라인$/,          // "2,839명 온라인"
      /^\d{1,3}(,\d{3})*명\s*접속\s*중$/        // "2,839명 접속 중"
    ];

    const isMatch = viewerPatterns.some(pattern => pattern.test(normalizedText));
    
    // 디버깅을 위한 로깅
    if (isMatch) {
      window.ChzzkLogger?.debug(`🎯 Viewer pattern matched: "${normalizedText}"`);
    }

    return isMatch;
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
   * 고급 텍스트 패턴으로 시청자 수 찾아 숨기기 (3단계용)
   * @private
   * @param {Element} container - 검색할 컨테이너
   */
  hideByAdvancedTextPattern(container) {
    window.ChzzkLogger?.debug('🔍 Advanced text pattern scan started...');
    
    // 성능을 위해 카드 컨테이너만 우선 검색
    const cardContainers = [
      ...container.querySelectorAll('[class*="video_card"]'),
      ...container.querySelectorAll('[class*="thumbnail"]'),
      ...container.querySelectorAll('[class*="information"]'),
      ...container.querySelectorAll('[class*="badge"]')
    ];

    let advancedHiddenCount = 0;

    cardContainers.forEach(cardContainer => {
      const textNodes = this.getTextNodes(cardContainer);
      
      textNodes.forEach(node => {
        const text = node.textContent?.trim();
        if (text && this.isViewerCountPattern(text)) {
          // 시청자 수 패턴 발견 시 가장 적절한 부모 요소 찾기
          const targetElement = this.findAppropriateParent(node);
          if (targetElement && this.shouldHideElement(targetElement)) {
            this.hideElement(targetElement);
            advancedHiddenCount++;
            window.ChzzkLogger?.debug(`🎯 Advanced pattern found: "${text}" in ${targetElement.tagName}.${targetElement.className.slice(0, 30)}`);
          }
        }
      });
    });

    // 전체 컨테이너 검색 (카드 컨테이너에서 찾지 못한 경우)
    if (advancedHiddenCount === 0) {
      window.ChzzkLogger?.debug('🔍 Fallback: Full container text scan...');
      const allTextNodes = this.getTextNodes(container);
      
      allTextNodes.forEach(node => {
        const text = node.textContent?.trim();
        if (text && this.isViewerCountPattern(text)) {
          const targetElement = this.findAppropriateParent(node);
          if (targetElement && this.shouldHideElement(targetElement)) {
            this.hideElement(targetElement);
            advancedHiddenCount++;
          }
        }
      });
    }

    window.ChzzkLogger?.debug(`🎯 Advanced text scan completed: ${advancedHiddenCount} elements found`);
  }

  /**
   * 텍스트 노드의 적절한 부모 요소 찾기
   * @private
   * @param {Node} textNode - 텍스트 노드
   * @returns {Element|null} 숨길 대상 요소
   */
  findAppropriateParent(textNode) {
    let current = textNode.parentElement;
    
    // 최대 3단계까지 부모를 올라가면서 적절한 요소 찾기
    for (let i = 0; i < 3 && current; i++) {
      // span, strong, em 태그이면서 클래스가 있는 경우 우선
      const hasValidClassName = current.className && 
                               (typeof current.className === 'string' || 
                                (current.className.baseVal && typeof current.className.baseVal === 'string'));
      if (['SPAN', 'STRONG', 'EM'].includes(current.tagName) && hasValidClassName) {
        return current;
      }
      
      // 카드 관련 요소인 경우 (안전한 문자열 처리)
      const safeClassName = (current.className && typeof current.className === 'string') ? 
                           current.className : 
                           (current.className && current.className.baseVal ? current.className.baseVal : '');
      if (safeClassName && (
        safeClassName.includes('badge') ||
        safeClassName.includes('count') ||
        safeClassName.includes('viewer')
      )) {
        return current;
      }
      
      current = current.parentElement;
    }
    
    // 적절한 부모를 찾지 못한 경우 직접 부모 반환
    return textNode.parentElement;
  }

  /**
   * 숫자 패턴으로 시청자 수 찾아 숨기기 (레거시 지원)
   * @private
   * @param {Element} container - 검색할 컨테이너
   */
  hideByNumberPattern(container) {
    // 고급 패턴 검색으로 대체됨 - 레거시 호환성 유지
    this.hideByAdvancedTextPattern(container);
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
   * 고도화된 실시간 모니터링 시작
   */
  startAdvancedMonitoring() {
    if (globalViewerObserver) {
      globalViewerObserver.disconnect();
    }

    window.ChzzkLogger?.info('🔧 Starting advanced real-time monitoring...');

    // 고성능 MutationObserver 설정
    globalViewerObserver = new MutationObserver(this.debounce((mutations) => {
      this.handleDynamicChanges(mutations);
    }, 100));

    // 전체 document 감시 (서브트리 포함)
    globalViewerObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'], // 클래스나 스타일 변경 감지
      characterData: true // 텍스트 변경 감지 (실시간 시청자 수 업데이트)
    });

    window.ChzzkLogger?.info('✅ Advanced monitoring system activated');
  }

  /**
   * 동적 변화 처리
   * @private
   * @param {MutationRecord[]} mutations - DOM 변화 기록
   */
  handleDynamicChanges(mutations) {
    if (!this.isEnabled || this.processing) {
      return;
    }

    let shouldProcess = false;
    const relevantNodes = new Set();

    mutations.forEach(mutation => {
      // 1. 새로 추가된 노드 검사 (카드 뷰, 라이브 페이지 요소)
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 카드 컨테이너나 정보 컨테이너 감지
            if (this.isRelevantContainer(node)) {
              relevantNodes.add(node);
              shouldProcess = true;
              window.ChzzkLogger?.debug(`🆕 New relevant container detected: ${node.className.slice(0, 30)}`);
            }
          }
        });
      }

      // 2. 텍스트 내용 변경 감지 (실시간 시청자 수 업데이트)
      if (mutation.type === 'characterData') {
        const parentElement = mutation.target.parentElement;
        if (parentElement && this.isPotentialViewerElement(parentElement)) {
          relevantNodes.add(parentElement);
          shouldProcess = true;
          window.ChzzkLogger?.debug(`🔄 Text content changed: "${mutation.target.textContent?.slice(0, 20)}"`);
        }
      }

      // 3. 속성 변경 감지 (클래스나 스타일 변경)
      if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
        const element = mutation.target;
        if (this.isPotentialViewerElement(element)) {
          relevantNodes.add(element);
          shouldProcess = true;
        }
      }
    });

    // 관련 변화가 있는 경우에만 처리
    if (shouldProcess) {
      window.ChzzkLogger?.debug(`🔍 Processing ${relevantNodes.size} relevant nodes...`);
      
      // 각 관련 노드에 대해 시청자 수 숨기기 실행
      relevantNodes.forEach(node => {
        this.hideAll(node);
      });
      
      // 주기적 메모리 최적화
      this.optimizeMemory();
    }
  }

  /**
   * 관련 컨테이너인지 확인
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 관련 컨테이너 여부
   */
  isRelevantContainer(element) {
    // 안전한 문자열 변환
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : 
                     (element.className && element.className.baseVal ? element.className.baseVal : '');
    const tagName = element.tagName || '';

    // 카드 뷰 컨테이너
    if (className.includes('video_card') || 
        className.includes('thumbnail') || 
        className.includes('badge')) {
      return true;
    }

    // 라이브 페이지 정보 컨테이너
    if (className.includes('video_information') || 
        className.includes('live_information') || 
        className.includes('information_data')) {
      return true;
    }

    // 사이드바 컨테이너
    if (className.includes('navigator') || 
        className.includes('navigation_bar')) {
      return true;
    }

    return false;
  }

  /**
   * 잠재적 시청자 수 요소인지 확인
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 잠재적 시청자 수 요소 여부
   */
  isPotentialViewerElement(element) {
    // 안전한 문자열 변환
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : 
                     (element.className && element.className.baseVal ? element.className.baseVal : '');
    const tagName = element.tagName || '';
    const text = element.textContent?.trim() || '';

    // 태그 기반 확인
    if (!['SPAN', 'STRONG', 'EM', 'DIV'].includes(tagName)) {
      return false;
    }

    // 클래스 기반 확인
    if (className.includes('count') || 
        className.includes('viewer') || 
        className.includes('badge')) {
      return true;
    }

    // 텍스트 패턴 기반 확인 (간단한 패턴만)
    if (/\d+.*명/.test(text) || /\d+.*시청/.test(text)) {
      return true;
    }

    return false;
  }

  /**
   * 디바운스 유틸리티
   * @private
   * @param {Function} func - 실행할 함수
   * @param {number} wait - 대기 시간 (ms)
   * @returns {Function} 디바운스된 함수
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * 시청자 수 숨기기 기능 활성화/비활성화
   * @param {boolean} enabled - 활성화 여부
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    
    if (enabled) {
      this.startAdvancedMonitoring();
    } else {
      if (globalViewerObserver) {
        globalViewerObserver.disconnect();
        globalViewerObserver = null;
      }
      this.showAll();
    }
    
    window.ChzzkLogger?.info(`👁️ Viewer count hiding ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 정리 함수 (고도화)
   */
  cleanup() {
    // 타이머 정리
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.masterTimer) {
      clearTimeout(this.masterTimer);
    }
    
    // 고도화된 모니터링 시스템 정리
    if (globalViewerObserver) {
      globalViewerObserver.disconnect();
      globalViewerObserver = null;
    }
    
    // 전역 상태 정리
    processedElements = new WeakSet();
    
    // 모든 시청자 수 복원
    this.showAll();
    
    // CSS 스타일 제거
    const style = document.getElementById('chzzk-viewer-count-styles');
    if (style) {
      style.remove();
    }
    
    window.ChzzkLogger?.info('🧹 Advanced viewer count system cleaned up');
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