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
      /* 시청자 수 숨기기 전용 스타일 - 안전한 방식 사용 */
      .chzzk-viewer-hidden {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        line-height: 0 !important;
        color: transparent !important;
        text-shadow: none !important;
        background: transparent !important;
      }
      
      /* 라이브 페이지 시청자 수 특화 숨기기 (더 안전한 방식) */
      .video_information_count__Y05sI.chzzk-viewer-hidden,
      strong.video_information_count__Y05sI.chzzk-viewer-hidden {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
        display: inline !important; /* 레이아웃 유지 */
      }
      
      /* 카드 뷰 시청자 수 숨기기 (더 강력한 선택자) */
      .thumbnail_badge_container__sMIz3.chzzk-viewer-hidden,
      span.thumbnail_badge_container__sMIz3.chzzk-viewer-hidden {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
        max-width: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
      }
      
      /* 시청자 수만 포함된 배지 컨테이너 (LIVE 배지 제외) */
      span[class*="thumbnail_badge_container"]:not([class*="live"]):not([class*="is_on"]).chzzk-viewer-hidden {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
      }
      
      /* LNB 사이드바 시청자 수 숨기기 (더 강력한 선택자) */
      em.navigator_count__kpr6-.chzzk-viewer-hidden,
      .navigator_count__kpr6-.chzzk-viewer-hidden,
      .navigation_bar_item__4OS5Z em.navigator_count__kpr6-.chzzk-viewer-hidden {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        line-height: 0 !important;
        color: transparent !important;
        text-shadow: none !important;
        display: inline !important; /* 레이아웃 유지 */
        max-width: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
      }
      
      /* 기존 레이아웃 보호 - 정밀한 선택자 사용 */
      .chzzk-viewer-hidden:not(.navigator_item__mH4JG):not(.navigator_item__qXlq9) * {
        visibility: hidden !important;
        opacity: 0 !important;
        color: transparent !important;
      }
      
      /* 스트리머 닉네임과 채널 이름은 보호 */
      .chzzk-viewer-hidden .navigator_information__sT7qv,
      .chzzk-viewer-hidden .navigator_name__k4Sc2,
      .chzzk-viewer-hidden .name_text__yQG50,
      .chzzk-viewer-hidden .navigator_content__K38XA,
      .chzzk-viewer-hidden .navigator_title__oExun,
      .chzzk-viewer-hidden .video_card_name__dOHzK,
      .chzzk-viewer-hidden a[href*="/live/"]:not(:has(.thumbnail_badge_container__sMIz3)),
      .chzzk-viewer-hidden a[href*="/channel/"]:not(:has(.thumbnail_badge_container__sMIz3)) {
        visibility: visible !important;
        opacity: 1 !important;
        color: inherit !important;
        font-size: inherit !important;
        line-height: inherit !important;
      }
      
      /* 토글 켜져있을 때 강제 숨김 (추가 보험) */
      body.chzzk-hide-viewer-count span[class*="thumbnail_badge_container"]:not([class*="live"]):not([class*="is_on"]) {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
      }
      
      /* 시청자 수만 포함된 span 타겟팅 (LIVE 클래스 없는 경우) */
      body.chzzk-hide-viewer-count span.thumbnail_badge_container__sMIz3:not([class*="live"]):not([class*="Live"]):not([class*="LIVE"]) {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
        max-width: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
      }
      
      /* 더 구체적인 시청자 수 타겟팅 */
      body.chzzk-hide-viewer-count .video_card_description__2sUfw > span.thumbnail_badge_container__sMIz3:not([class*="live"]) {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
      }

      /* CHZZK often ships hashed container classes for viewer-count text such as
         "_container_1o5pg_2 undefined"; JS validates the text before marking it. */
      body.chzzk-hide-viewer-count [data-chzzk-hidden="true"].chzzk-viewer-hidden {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        line-height: 0 !important;
        color: transparent !important;
        max-width: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
      }
      
      body.chzzk-hide-viewer-count em.navigator_count__kpr6- {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
      }
      
      /* 가장 강력한 시청자 수 숨김 (만능 선택자) */
      body.chzzk-hide-viewer-count span.thumbnail_badge_container__sMIz3:only-child {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
      }
      
      /* 더 포괄적인 시청자 수 숨김 */
      body.chzzk-hide-viewer-count .video_card_description__2sUfw span.thumbnail_badge_container__sMIz3:last-child {
        visibility: hidden !important;
        opacity: 0 !important;
        font-size: 0 !important;  
        color: transparent !important;
      }
    `;
    document.head.appendChild(style);
    window.ChzzkLogger?.info('📊 [CSS] Safe viewer count styles injected');
  }

  /**
   * 시청자 수 업데이트 예약 (디바운스 적용 + 즉시 카드 스캔)
   */
  scheduleUpdate() {
    // 기존 타이머들 정리
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.masterTimer) {
      clearTimeout(this.masterTimer);
    }
    
    const shouldHide = window.ChzzkSettings?.get('hideViewerCount') ?? true;
    
    // body 클래스 토글 (즉시 적용)
    if (shouldHide) {
      document.body.classList.add('chzzk-hide-viewer-count');
      // 즉시 카드 뷰 스캔 (디바운스 없음)
      this.scanCardViewElements();
    } else {
      document.body.classList.remove('chzzk-hide-viewer-count');
    }
    
    // 단일 마스터 타이머로 전체 처리 (200ms 디바운스)
    this.masterTimer = setTimeout(() => {
      if (this.processing) {
        return;
      }
      
      if (shouldHide) {
        this.hideAll();
      } else {
        this.showAll();
      }
      
      this.lastState = shouldHide;
    }, 200);
  }

  /**
   * 모든 시청자 수 숨기기 (성능 최적화 + 강건성 강화)
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
      // 특별 처리: 카드 뷰 시청자 수 직접 찾기 (CSS가 작동하지 않는 경우 대비)
      const cardViewerElements = container.querySelectorAll('span.thumbnail_badge_container__sMIz3');
      let cardHiddenCount = 0;
      
      cardViewerElements.forEach(element => {
        const text = element.textContent?.trim() || '';
        const hasLiveClass = element.classList.contains('thumbnail_badge_live__rBgk+') || 
                            element.classList.contains('thumbnail_badge_is_on__Hr6EA');
        const hasSvg = element.querySelector('svg');
        
        // 시청자 수 패턴 (숫자+명) 또는 LIVE 관련 클래스가 없는 경우
        if ((text.match(/^\d+,?\d*명?$/) || text.match(/^\d+$/) || text.includes('명')) && !hasLiveClass && !hasSvg) {
          this.hideElement(element);
          cardHiddenCount++;
          window.ChzzkLogger?.info(`✅ [CARD] Direct card viewer count hidden: "${text}"`);
        }
      });
      
      window.ChzzkLogger?.info(`📊 [CARD] Direct card scan: ${cardHiddenCount} viewer elements hidden`);
      
      // 시청자 수 요소 셀렉터들 (AI 기반 강화된 패턴)
      const viewerCountSelectors = [
        // === 1단계: 정확한 셀렉터 (최고 성능 + 강건성) ===
        
        // 카드 뷰 시청자 수 (HTML 기반 초정밀 매칭 - 문제 해결 강화)
        'span[class*="thumbnail_badge_container"]:not([class*="live"]):not([class*="is_on"])',
        '.video_card_description__2sUfw > span.thumbnail_badge_container__sMIz3:not([class*="live"])', // 직접 자식 선택
        '.video_card_container__urjO6 .video_card_description__2sUfw span.thumbnail_badge_container__sMIz3:not([class*="live"])', // 전체 경로
        '[class*="video_card_vertical"] [class*="video_card_description"] > span[class*="thumbnail_badge_container"]:not([class*="live"])',
        
        // 추가 백업 셀렉터 (더 포괄적)
        'span.thumbnail_badge_container__sMIz3:not(:has(svg)):not(:has(.blind))', // SVG나 blind 클래스가 없는 경우
        '[class*="video_card"] span[class*="thumbnail_badge"]:not([class*="live"]):not(:has(svg))', // 패턴 기반 백업
        
        // 라이브 페이지 현재 시청자 수 (HTML 기반 정확한 셀렉터)
        'strong.video_information_count__Y05sI', // 가장 정확한 셀렉터
        '[class*="video_information_data"] strong.video_information_count__Y05sI',
        '.video_information_row__HrQ0z [class*="video_information_data"] strong',
        '.video_information_status__YKGeL strong.video_information_count__Y05sI',
        
        // LNB 사이드바 시청자 수 (초정밀 매칭 - 문제 해결 핵심)
        'em.navigator_count__kpr6-', // 가장 정확한 em 태그 매칭
        '.navigator_item__mH4JG > a > em.navigator_count__kpr6-', // 정확한 DOM 경로
        '.navigator_item__mH4JG em[class*="navigator_count"]', // 클래스 패턴 백업
        'a[class*="navigator_item"] > em.navigator_count__kpr6-', // 링크 내부 직접 매칭
        
        // 추가 LNB 백업 셀렉터
        '.navigation_bar_item__4OS5Z em.navigator_count__kpr6-', // 네비게이션 아이템 내부
        '[class*="navigation_bar_item"] em[class*="count"]', // 패턴 기반 포괄적 매칭
        '.navigator_count__db5Av', '.home_recommend_live_count__7Or3N',
        
        // 기존 라이브 페이지
        '.video_information_count__VdSfG',
        '.live_information_player__lYPjg strong',
        
        // === 2단계: AI 기반 패턴 백업 셀렉터 (강건성 극대화) ===
        
        // 카드 뷰 구조적 백업 (HTML 구조 변경 대응)
        '[class*="video_card_description"] span:not(.blind):not([class*="live"]):not(:has(svg))', // SVG 없는 span
        '[class*="video_card_container"] span[class*="badge"]:not([class*="live"]):not(:has(.blind))', // 배지 패턴
        '[class*="thumbnail_badge"]:not([class*="live"]):not(:has(svg)):not(:has(.blind))', // 포괄적 배지
        '.video_card_wrapper__M6XT7 ~ * span:not(.blind):not([class*="live"])', // 형제 요소 내부
        
        // LNB 사이드바 구조적 백업 (em 태그 중점)
        '[class*="navigator_item"] em:not(.blind):not([class*="name"]):not([class*="description"])', // 정확한 em 타겟
        '[class*="navigator_information"] ~ em', // 정보 영역 다음 em
        '[class*="navigation_bar_item"] > a > em:last-child', // 마지막 em 자식
         'li[class*="navigation_bar_item"] em[class*="count"]', // li 내부 카운트 em
        
        // 패턴 기반 포괄적 백업
        '[class*="navigator_count"]:not([class*="name"])', // 네비게이터 카운트 일반
        '[class*="navigation_bar"] em:not(.blind):not([class*="name"])', // 네비게이션 바 em
        
        // 라이브 페이지 백업 (HTML 구조 기반 강화)
        '[class*="video_information_data"] strong',
        '.video_information_row__HrQ0z strong', // 부모 컨테이너  
        '[class*="video_information_count"] strong', // 클래스 패턴
        '[class*="video_information_data"] strong', // 데이터 컨테이너 패턴
        '[class*="information_row"] strong', // 행 컨테이너 패턴
        '[class*="live_information"] [class*="count"]',
        
        // 범용 백업 셀렉터 (AI 패턴 강화)
        'em[class*="count"]:not([class*="title"]):not([class*="name"])', // em 태그 우선
        'span[class*="count"]:not([class*="title"]):not([class*="name"])',
        'strong[class*="count"]:not([class*="title"]):not([class*="name"])', 
        'div[class*="count"]:not([class*="title"]):not([class*="name"])',
        'em[class*="viewer"]', 'span[class*="viewer"]',
        '[class*="live_count"]', '[class*="viewer_count"]',
        
        // === 3단계: AI 기반 컨텍스트 인식 검색 (최후 보완) ===
        
        // 구조적 위치 기반 검색 (컨텍스트 강화)
        '.video_card_container__urjO6 span:not(.blind):not([class*="title"]):not([class*="name"]):not([class*="tag"])',
        '.video_card_description__2sUfw span:not(.blind):not([class*="live"]):not([class*="title"])',
        '[class*="information"] span:not(.blind):not([class*="title"]):not([class*="name"]):not([class*="tag"])',
        '[class*="information"] em:not(.blind):not([class*="title"]):not([class*="name"])', // em 태그 추가
        '[class*="player"] span:not(.blind):not([class*="title"]):not([class*="name"])',
        
        // LNB 구조적 백업 (사이드바 전용)
        '[class*="navigator"] span:not(.blind):not([class*="title"]):not([class*="name"]):not([class*="description"])',
        '[class*="navigator"] em:not(.blind):not([class*="title"]):not([class*="name"])', // em 태그 중점
        '[class*="navigation_bar"] span:not(.blind):not([class*="title"])',
        
        // AI 기반 태그 광범위 검색 (컨텍스트 인식 강화)
        'em:not(.blind):not([class*="title"]):not([class*="name"]):not([class*="tag"]):not([class*="description"])', // em 태그 우선
        'span:not(.blind):not([class*="title"]):not([class*="name"]):not([class*="tag"]):not([class*="description"])',
        'strong:not([class*="title"]):not([class*="name"]):not([class*="tag"]):not([class*="description"])'
      ];

      let hiddenCount = 0;

      // === AI 기반 4단계 검색 시스템 실행 ===
      
      // 1단계: 초정밀 셀렉터 우선 처리 (문제 해결 집중)
      const tier1Selectors = viewerCountSelectors.slice(0, 20); // 초정밀 셀렉터들 확장
      let tier1Success = false;
      
      window.ChzzkLogger?.debug(`🔍 [SCAN] Starting Ultra-Precise Tier 1 scan with ${tier1Selectors.length} selectors...`);
      
      tier1Selectors.forEach((selector, index) => {
        try {
          const elements = container.querySelectorAll(selector);
          window.ChzzkLogger?.debug(`🔍 [SCAN] Tier 1[${index}] "${selector}": found ${elements.length} elements`);
          
          elements.forEach((element, elemIndex) => {
            const text = element.textContent?.trim() || '';
            const className = (element.className && typeof element.className === 'string') ? 
                             element.className : 
                             (element.className && element.className.baseVal ? element.className.baseVal : '');
            
            window.ChzzkLogger?.debug(`🔍 [FOUND] Element[${elemIndex}]: "${text}" (${className.slice(0, 30)})`);
            
            // 즉시 처리 모드 (더 적극적)
            if (this.shouldHideElementWithImmediateMode(element)) {
              this.hideElement(element);
              hiddenCount++;
              tier1Success = true;
              window.ChzzkLogger?.info(`✅ [HIDDEN] Ultra-Precise hide: "${text}" with selector "${selector}"`);
            } else if (this.shouldHideElementWithContext(element)) {
              this.hideElement(element);
              hiddenCount++;
              tier1Success = true;
              window.ChzzkLogger?.info(`✅ [HIDDEN] AI-Context hide: "${text}" with selector "${selector}"`);
            } else {
              window.ChzzkLogger?.debug(`⏭️ [SKIP] Skipped element: "${text}" (failed all checks)`);
            }
          });
        } catch (error) {
          window.ChzzkLogger?.warn('❌ [ERROR] Tier 1 selector error:', selector, error.message);
        }
      });
      
      window.ChzzkLogger?.info(`📊 [TIER1] Ultra-Precise scan completed: ${hiddenCount} elements hidden, success: ${tier1Success}`);

      // 2단계: AI 기반 구조적 백업 검색 (1단계에서 부족한 경우)
      if (!tier1Success || hiddenCount < 3) {
        window.ChzzkLogger?.info('🔍 [TIER2] Starting AI-enhanced structural backup search...');
        
        const tier2Selectors = viewerCountSelectors.slice(16, 32); // AI 강화 구조적 셀렉터들
        let tier2HiddenCount = 0;
        
        tier2Selectors.forEach((selector, index) => {
          try {
            const elements = container.querySelectorAll(selector);
            window.ChzzkLogger?.debug(`🔍 [SCAN] Tier 2[${index}] "${selector}": found ${elements.length} elements`);
            
            elements.forEach((element, elemIndex) => {
              const text = element.textContent?.trim() || '';
              
              // AI 기반 컨텍스트 인식 적용
              if (this.shouldHideElementWithContext(element)) {
                this.hideElement(element);
                hiddenCount++;
                tier2HiddenCount++;
                window.ChzzkLogger?.info(`✅ [HIDDEN] AI Tier 2 success: "${text}" with "${selector}"`);
              }
            });
          } catch (error) {
            window.ChzzkLogger?.warn('❌ [ERROR] Tier 2 selector error:', selector, error.message);
          }
        });
        
        window.ChzzkLogger?.info(`📊 [TIER2] AI-enhanced backup completed: ${tier2HiddenCount} additional elements hidden`);
      }

      // 3단계: AI 기반 컨텍스트 인식 스캔 (최후 보완)
      if (hiddenCount < 5) {
        window.ChzzkLogger?.info('🔍 [TIER3] Starting AI context-aware comprehensive scan...');
        
        const tier3Selectors = viewerCountSelectors.slice(32); // AI 컨텍스트 인식 셀렉터들  
        let tier3HiddenCount = 0;
        
        tier3Selectors.forEach((selector, index) => {
          try {
            const elements = container.querySelectorAll(selector);
            window.ChzzkLogger?.debug(`🔍 [SCAN] Tier 3[${index}] "${selector}": found ${elements.length} elements`);
            
            elements.forEach(element => {
              const text = element.textContent?.trim() || '';
              
              // AI 기반 고도화된 컨텍스트 인식
              if (this.shouldHideElementWithAdvancedContext(element)) {
                this.hideElement(element);
                hiddenCount++;
                tier3HiddenCount++;
                window.ChzzkLogger?.info(`✅ [HIDDEN] AI Tier 3 context success: "${text}" with "${selector}"`);
              }
            });
          } catch (error) {
            window.ChzzkLogger?.warn('❌ [ERROR] Tier 3 selector error:', selector, error.message);
          }
        });

        // 4단계: 고도화된 AI 텍스트 패턴 스캔
        window.ChzzkLogger?.debug('🔍 [TIER4] Starting AI-powered advanced text pattern scan...');
        const tier4Count = this.hideByAITextPattern(container);
        hiddenCount += tier4Count;
        
        window.ChzzkLogger?.info(`📊 [TIER3] AI context scan completed: ${tier3HiddenCount} additional elements hidden`);
        
        // 최종 강제 스캔: 여전히 부족한 경우 AI 강제 스캔 실행
        if (hiddenCount < 2) {
          window.ChzzkLogger?.warn('🚨 [FORCE] Insufficient elements found, executing AI force scan...');
          const forceScanCount = this.executeAIForceScan(container);
          hiddenCount += forceScanCount;
          window.ChzzkLogger?.info(`📊 [FORCE] AI force scan found ${forceScanCount} additional elements`);
        }
      }

      // 성능 측정 및 보고
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      window.ChzzkLogger?.viewer(`✅ AI-Enhanced: Hidden ${hiddenCount} elements (4-tier) in ${duration.toFixed(2)}ms`);
      
      // 성능 경고 (500ms 이상 소요 시)
      if (duration > 500) {
        window.ChzzkLogger?.warn(`⚠️ Performance warning: AI hideAll took ${duration.toFixed(2)}ms`);
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
   * 즉시 처리 모드 - 초정밀 셀렉터로 직접 타겟팅된 요소들의 즉시 숨김 판단
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 즉시 숨김 여부
   */
  shouldHideElementWithImmediateMode(element) {
    const text = element.textContent?.trim() || '';
    const safeClassName = (element.className && typeof element.className === 'string') ? 
                         element.className : 
                         (element.className && element.className.baseVal ? element.className.baseVal : '');
    
    window.ChzzkLogger?.debug(`🎯 [IMMEDIATE] Checking: "${text}" (${safeClassName.slice(0, 30)})`);
    
    // 이미 숨겨진 요소는 건너뛰기
    if (element.hasAttribute('data-chzzk-hidden')) {
      window.ChzzkLogger?.debug(`⏭️ [IMMEDIATE] Already hidden: "${text}"`);
      return false;
    }
    
    // 즉시 처리 대상: 특정 클래스를 가진 요소들
    const immediateTargets = [
      'thumbnail_badge_container__sMIz3',  // 카드 뷰 시청자 수
      'navigator_count__kpr6-',            // LNB 사이드바 시청자 수
      'video_information_count__Y05sI',    // 라이브 페이지 시청자 수
      '_container_'                        // 해시 컨테이너: 텍스트+컨텍스트 검증 필요
    ];
    
    // 즉시 처리 대상 클래스 확인
    const isImmediateTarget = immediateTargets.some(target => safeClassName.includes(target));
    
    if (isImmediateTarget) {
      if (safeClassName.includes('_container_') && !this.isLikelyChzzkViewerCountContainer(element)) {
        window.ChzzkLogger?.debug(`🛡️ [IMMEDIATE] Hashed container not in viewer context: "${text}"`);
        return false;
      }

      // LIVE 배지 보호 (thumbnail_badge_container__sMIz3의 경우)
      if (safeClassName.includes('thumbnail_badge_container__sMIz3')) {
        // LIVE 배지는 보호
        if (safeClassName.includes('thumbnail_badge_live__rBgk+') || 
            safeClassName.includes('thumbnail_badge_is_on__Hr6EA') ||
            text.includes('LIVE') ||
            element.querySelector('svg') || 
            element.querySelector('.blind')) {
          window.ChzzkLogger?.debug(`🛡️ [IMMEDIATE] Protected LIVE element: "${text}"`);
          return false;
        }
        
        // 시청자 수 패턴 확인
        if (this.isViewerCountPattern(text)) {
          window.ChzzkLogger?.info(`⚡ [IMMEDIATE] Card viewer count target: "${text}"`);
          return true;
        }
      }
      
      // LNB 시청자 수 (navigator_count__kpr6-)
      else if (safeClassName.includes('navigator_count__kpr6-')) {
        if (this.isViewerCountPattern(text)) {
          window.ChzzkLogger?.info(`⚡ [IMMEDIATE] LNB viewer count target: "${text}"`);
          return true;
        }
      }
      
      // 라이브 페이지 시청자 수 (video_information_count__Y05sI)
      else if (safeClassName.includes('video_information_count__Y05sI')) {
        if (this.isViewerCountPattern(text) || text.includes('시청 중')) {
          window.ChzzkLogger?.info(`⚡ [IMMEDIATE] Live page viewer count target: "${text}"`);
          return true;
        }
      }

      else if (safeClassName.includes('_container_')) {
        if (this.isViewerCountPattern(text)) {
          window.ChzzkLogger?.info(`⚡ [IMMEDIATE] Hashed viewer count container target: "${text}"`);
          return true;
        }
      }
    }
    
    // 구조적 경로 확인 (추가 보안)
    const structuralPaths = [
      // 카드 뷰 구조적 경로
      '.video_card_container__urjO6 .video_card_description__2sUfw span.thumbnail_badge_container__sMIz3',
      // LNB 구조적 경로  
      '.navigator_item__mH4JG em.navigator_count__kpr6-',
      // 라이브 정보 구조적 경로
      '[class*="video_information_data"] strong.video_information_count__Y05sI',
      // 해시 클래스 컨테이너 백업 경로
      '[class*="video_card"] span[class*="_container_"]',
      '[class*="navigator"] span[class*="_container_"]',
      '[class*="navigation_bar"] span[class*="_container_"]',
      '[class*="video_information"] span[class*="_container_"]'
    ];
    
    for (const path of structuralPaths) {
      try {
        const pathSegments = path.split(' ');
        let currentElement = element;
        let matches = true;
        
        // 역순으로 경로 확인 (자식 → 부모)
        for (let i = pathSegments.length - 1; i >= 0; i--) {
          const segment = pathSegments[i];
          if (i === pathSegments.length - 1) {
            // 마지막 세그먼트는 현재 요소와 매치
            if (!currentElement.matches(segment)) {
              matches = false;
              break;
            }
          } else {
            // 부모 요소들 확인
            currentElement = currentElement.closest(segment);
            if (!currentElement) {
              matches = false;
              break;
            }
          }
        }
        
        if (matches && this.isViewerCountPattern(text)) {
          window.ChzzkLogger?.info(`⚡ [IMMEDIATE] Structural path match: "${text}" via "${path}"`);
          return true;
        }
      } catch (error) {
        window.ChzzkLogger?.warn(`❌ [IMMEDIATE] Structural path error: ${path}`, error);
      }
    }
    
    window.ChzzkLogger?.debug(`⏭️ [IMMEDIATE] Not immediate target: "${text}"`);
    return false;
  }

  /**
   * CHZZK hashed container classes are too broad to hide by class alone. Only
   * accept them when the text looks like a viewer count and the structural
   * neighborhood is a card, LNB, or live-information surface.
   * @private
   * @param {Element} element
   * @returns {boolean}
   */
  isLikelyChzzkViewerCountContainer(element) {
    const text = element?.textContent?.trim() || '';
    if (!this.isViewerCountPattern(text)) return false;
    if (this.isLiveIndicator(element)) return false;
    if (element.closest('[class*="live_chatting"], [class*="chat"]')) return false;

    return !!(
      element.closest('[class*="video_card"]') ||
      element.closest('[class*="thumbnail"]') ||
      element.closest('[class*="navigator"]') ||
      element.closest('[class*="navigation_bar"]') ||
      element.closest('[class*="home_recommend"]') ||
      element.closest('[class*="video_information"]') ||
      element.closest('[class*="live_information"]')
    );
  }

  /**
   * AI 기반 컨텍스트 인식으로 요소를 숨겨야 하는지 판단 (향상된 버전)
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 숨김 여부
   */
  shouldHideElementWithContext(element) {
    const text = element.textContent?.trim() || '';
    const safeClassName = (element.className && typeof element.className === 'string') ? 
                         element.className : 
                         (element.className && element.className.baseVal ? element.className.baseVal : '');
    
    window.ChzzkLogger?.debug(`🔍 [AI-CHECK] Evaluating element: "${text}" (${safeClassName.slice(0, 30)})`);
    
    // 이미 숨겨진 요소는 건너뛰기
    if (element.hasAttribute('data-chzzk-hidden') || element.classList.contains('chzzk-viewer-hidden')) {
      window.ChzzkLogger?.debug(`⏭️ [SKIP] Already hidden: "${text}"`);
      return false;
    }

    // AI 기반 컨텍스트 분석
    const contextAnalysis = this.analyzeElementContext(element);
    
    // 채팅 관련 요소는 제외 (AI 강화)
    if (contextAnalysis.isInExcludedArea) {
      window.ChzzkLogger?.debug(`⏭️ [SKIP] In excluded area: "${text}"`);
      return false;
    }
    
    // AI 기반 시청자 수 패턴 확인 (강화된 버전)
    const isViewerCount = this.isAIViewerCountPattern(text, contextAnalysis);
    window.ChzzkLogger?.debug(`🔍 [AI-PATTERN] "${text}" -> AI viewer pattern: ${isViewerCount}`);
    
    // 구조적 컨텍스트 분석 결과 적용
    const shouldHideByContext = contextAnalysis.isViewerCountContext || isViewerCount;
    
    window.ChzzkLogger?.debug(`🎯 [AI-FINAL] "${text}" -> AI decision: ${shouldHideByContext} (context: ${contextAnalysis.isViewerCountContext}, pattern: ${isViewerCount})`);
    
    return shouldHideByContext;
  }

  /**
   * 요소를 숨겨야 하는지 판단 (기존 버전 - 호환성 유지)
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 숨김 여부
   */
  shouldHideElement(element) {
    const text = element.textContent?.trim() || '';
    const safeClassName = (element.className && typeof element.className === 'string') ? 
                         element.className : 
                         (element.className && element.className.baseVal ? element.className.baseVal : '');
    
    window.ChzzkLogger?.debug(`🔍 [CHECK] Evaluating element: "${text}" (${safeClassName.slice(0, 30)})`);
    
    // 이미 숨겨진 요소는 건너뛰기
    if (element.hasAttribute('data-chzzk-hidden') || element.classList.contains('chzzk-viewer-hidden')) {
      window.ChzzkLogger?.debug(`⏭️ [SKIP] Already hidden: "${text}"`);
      return false;
    }

    // 채팅 관련 요소는 제외
    const isInChat = element.closest('.live_chatting_username_container__m1-i5') ||
                    element.closest('[class*="live_chatting"]') ||
                    element.closest('[class*="chat"]');
    
    if (isInChat) {
      window.ChzzkLogger?.debug(`⏭️ [SKIP] In chat area: "${text}"`);
      return false;
    }
    
    // 시청자 수 패턴 확인
    const isViewerCount = this.isViewerCountPattern(text);
    window.ChzzkLogger?.debug(`🔍 [PATTERN] "${text}" -> viewer pattern: ${isViewerCount}`);
    
    // 클래스명으로 시청자 수 판단
    const hasViewerClass = safeClassName && (
      safeClassName.includes('count') ||
      safeClassName.includes('viewer') ||
      safeClassName.includes('live_count')
    );
    window.ChzzkLogger?.debug(`🔍 [CLASS] "${safeClassName}" -> viewer class: ${hasViewerClass}`);

    // 라이브 정보 창에서는 더 엄격한 조건 적용
    const isInLiveInfo = element.closest('.live_information_player__lYPjg');
    const isInLiveContainer = element.closest('[class*="video_information_data"]') ||
                             element.closest('.video_information_row__HrQ0z');
    
    if (isInLiveInfo) {
      const shouldHide = isViewerCount && !text.includes('LIVE') && !text.includes('라이브');
      window.ChzzkLogger?.debug(`🎯 [LIVE-INFO] "${text}" -> should hide: ${shouldHide}`);
      return shouldHide;
    }
    
    if (isInLiveContainer) {
      const shouldHide = isViewerCount || hasViewerClass;
      window.ChzzkLogger?.debug(`🎯 [LIVE-CONTAINER] "${text}" -> should hide: ${shouldHide}`);
      return shouldHide;
    }

    const finalDecision = isViewerCount || hasViewerClass;
    window.ChzzkLogger?.debug(`🎯 [FINAL] "${text}" -> decision: ${finalDecision} (pattern: ${isViewerCount}, class: ${hasViewerClass})`);
    
    return finalDecision;
  }

  /**
   * AI 기반 요소 컨텍스트 분석
   * @private
   * @param {Element} element - 분석할 요소
   * @returns {Object} 컨텍스트 분석 결과
   */
  analyzeElementContext(element) {
    const analysis = {
      isViewerCountContext: false,
      isInExcludedArea: false,
      contextScore: 0,
      structuralHints: []
    };

    // 제외 영역 확인 (AI 강화)
    const excludedContainers = [
      '[class*="live_chatting"]', '[class*="chat"]',
      '[class*="title"]', '[class*="name"]', '[class*="creator"]',
      '[class*="gnb"]', '[class*="header"]', 'footer', '[class*="footer"]'
    ];
    
    for (const excludedSelector of excludedContainers) {
      if (element.closest(excludedSelector)) {
        analysis.isInExcludedArea = true;
        analysis.structuralHints.push(`excluded_area:${excludedSelector}`);
        return analysis;
      }
    }

    // 구조적 컨텍스트 분석
    const structuralContext = this.getStructuralContext(element);
    analysis.contextScore += structuralContext.score;
    analysis.structuralHints.push(...structuralContext.hints);

    // 클래스명 기반 분석 (AI 강화)
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : 
                     (element.className && element.className.baseVal ? element.className.baseVal : '');
    
    const viewerClassPatterns = [
      'navigator_count__kpr6-', 'navigator_count__db5Av', // LNB 시청자 수
      'thumbnail_badge_container__sMIz3', // 카드 뷰 시청자 수  
      'video_information_count__Y05sI', // 라이브 페이지 시청자 수
      'count', 'viewer', 'live_count'
    ];
    
    for (const pattern of viewerClassPatterns) {
      if (className.includes(pattern)) {
        analysis.contextScore += 10;
        analysis.structuralHints.push(`viewer_class:${pattern}`);
        break;
      }
    }

    // 태그 기반 분석 (em 태그 우선)
    if (element.tagName === 'EM') {
      analysis.contextScore += 5;
      analysis.structuralHints.push('em_tag_priority');
    } else if (['SPAN', 'STRONG'].includes(element.tagName)) {
      analysis.contextScore += 3;
      analysis.structuralHints.push(`${element.tagName.toLowerCase()}_tag`);
    }

    // 컨텍스트 점수 기반 판단
    analysis.isViewerCountContext = analysis.contextScore >= 8;
    
    window.ChzzkLogger?.debug(`🧠 [AI-CONTEXT] Score: ${analysis.contextScore}, Hints: [${analysis.structuralHints.join(', ')}]`);
    
    return analysis;
  }

  /**
   * 구조적 컨텍스트 분석
   * @private
   * @param {Element} element - 분석할 요소
   * @returns {Object} 구조적 분석 결과
   */
  getStructuralContext(element) {
    const context = { score: 0, hints: [] };

    // 라이브 페이지 정확한 컨테이너 확인
    const liveContainers = [
      '[class*="video_information_data"]',
      '.video_information_row__HrQ0z',
      '.video_information_status__YKGeL'
    ];
    
    for (const containerSelector of liveContainers) {
      if (element.closest(containerSelector)) {
        context.score += 15;
        context.hints.push(`live_container:${containerSelector}`);
        break;
      }
    }

    // 카드 뷰 컨테이너 확인
    const cardContainers = [
      '.video_card_container__urjO6',
      '.video_card_description__2sUfw',
      '[class*="video_card_vertical"]'
    ];
    
    for (const containerSelector of cardContainers) {
      if (element.closest(containerSelector)) {
        context.score += 12;
        context.hints.push(`card_container:${containerSelector}`);
        break;
      }
    }

    // LNB 사이드바 컨테이너 확인
    const lnbContainers = [
      '[class*="navigator"]',
      '[class*="navigation_bar"]',
      '[class*="home_recommend"]'
    ];
    
    for (const containerSelector of lnbContainers) {
      if (element.closest(containerSelector)) {
        context.score += 10;
        context.hints.push(`lnb_container:${containerSelector}`);
        break;
      }
    }

    return context;
  }

  /**
   * AI 기반 시청자 수 패턴 확인 (컨텍스트 인식 강화)
   * @private
   * @param {string} text - 검사할 텍스트
   * @param {Object} contextAnalysis - 컨텍스트 분석 결과
   * @returns {boolean} AI 시청자 수 패턴 여부
   */
  isAIViewerCountPattern(text, contextAnalysis) {
    if (!text) return false;

    const normalizedText = text.trim().replace(/\s+/g, ' ');

    // AI 기반 제외 패턴 (컨텍스트 인식)
    const excludePatterns = [
      /LIVE|라이브|스트리밍/i,
      /talk|게임|카테고리|category/i,
      /스트리머|채널|channel|streamer/i,
      /시간|분|초|hour|minute|second/i,
      /팔로우|follow|구독|subscribe/i,
      /태그|tag|에스더|카론/i
    ];

    // 컨텍스트가 확실한 경우 제외 패턴 완화
    if (contextAnalysis.contextScore < 10) {
      if (excludePatterns.some(pattern => pattern.test(normalizedText))) {
        return false;
      }
    }

    // AI 강화된 시청자 수 패턴
    const aiViewerPatterns = [
      // 기본 패턴 (정확도 높음)
      /^\d{1,3}(,\d{3})*명$/,                    // "2,839명"
      /^\d+\.?\d*[만천백십]명?$/,                // "1.2만명", "523명"  
      /^\d+\.?\d*[kmb]$/i,                      // "1.2k", "5m"
      /^\d+$/,                                  // "123"
      
      // 복합 패턴 (컨텍스트 기반)
      /^\d{1,3}(,\d{3})*명\s*시청\s*중$/,        // "2,862명 시청 중"
      /^\d{1,3}(,\d{3})*명이?\s*시청\s*중$/,     // "2,862명이 시청 중"
      /^\d+\.?\d*[만천백십]명?\s*시청\s*중$/,    // "1.2만명 시청 중"
      
      // 실시간 업데이트 패턴 (AI 특화)
      /^\d{1,3}(,\d{3})*\s*viewers?$/i,         // "2,839 viewers"
      /^\d+\.?\d*[만천백십]?\s*viewers?$/i,     // "1.2만 viewers"
      
      // 한국어 패턴 강화
      /^\d{1,3}(,\d{3})*명\s*온라인$/,          // "2,839명 온라인"
      /^\d{1,3}(,\d{3})*명\s*접속\s*중$/        // "2,839명 접속 중"
    ];

    const isMatch = aiViewerPatterns.some(pattern => pattern.test(normalizedText));
    
    // 디버깅을 위한 로깅
    if (isMatch) {
      window.ChzzkLogger?.debug(`🧠 AI viewer pattern matched: "${normalizedText}" (context score: ${contextAnalysis.contextScore})`);
    }

    return isMatch;
  }

  /**
   * 고도화된 컨텍스트 인식으로 요소를 숨겨야 하는지 판단
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 숨김 여부
   */
  shouldHideElementWithAdvancedContext(element) {
    const text = element.textContent?.trim() || '';
    
    // 이미 숨겨진 요소는 건너뛰기
    if (element.hasAttribute('data-chzzk-hidden') || element.classList.contains('chzzk-viewer-hidden')) {
      return false;
    }

    // 고도화된 AI 컨텍스트 분석
    const advancedAnalysis = this.performAdvancedContextAnalysis(element);
    
    window.ChzzkLogger?.debug(`🚀 [ADV-AI] "${text}" -> Advanced AI score: ${advancedAnalysis.totalScore}`);
    
    // 고도화된 판단 기준 (더 정교한 임계값)
    return advancedAnalysis.totalScore >= 12;
  }

  /**
   * 고도화된 AI 컨텍스트 분석
   * @private
   * @param {Element} element - 분석할 요소
   * @returns {Object} 고도화된 분석 결과
   */
  performAdvancedContextAnalysis(element) {
    const analysis = {
      totalScore: 0,
      factors: []
    };

    const text = element.textContent?.trim() || '';
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : 
                     (element.className && element.className.baseVal ? element.className.baseVal : '');

    // 1. 정확한 클래스 매칭 (가중치 높음)
    const exactClassMatches = [
      { pattern: 'navigator_count__kpr6-', score: 20, desc: 'exact_lnb_count' },
      { pattern: 'thumbnail_badge_container__sMIz3', score: 18, desc: 'exact_card_badge' },
      { pattern: 'video_information_count__Y05sI', score: 20, desc: 'exact_live_count' }
    ];
    
    for (const match of exactClassMatches) {
      if (className.includes(match.pattern)) {
        analysis.totalScore += match.score;
        analysis.factors.push(match.desc);
        break;
      }
    }

    // 2. 텍스트 패턴 분석 (AI 강화)
    if (this.isAIViewerCountPattern(text, { contextScore: 0 })) {
      analysis.totalScore += 15;
      analysis.factors.push('ai_text_pattern');
    }

    // 3. 구조적 위치 분석 (부모-자식 관계)
    const structuralScore = this.analyzeStructuralPosition(element);
    analysis.totalScore += structuralScore.score;
    analysis.factors.push(...structuralScore.factors);

    // 4. 주변 요소 분석 (형제 요소 컨텍스트)
    const siblingScore = this.analyzeSiblingContext(element);
    analysis.totalScore += siblingScore.score;
    analysis.factors.push(...siblingScore.factors);

    window.ChzzkLogger?.debug(`🧠 [ADV-ANALYSIS] Factors: [${analysis.factors.join(', ')}]`);
    
    return analysis;
  }

  /**
   * 구조적 위치 분석
   * @private
   * @param {Element} element - 분석할 요소
   * @returns {Object} 구조적 분석 결과
   */
  analyzeStructuralPosition(element) {
    const result = { score: 0, factors: [] };

    // em 태그 우선 (LNB에서 많이 사용)
    if (element.tagName === 'EM') {
      result.score += 8;
      result.factors.push('em_tag');
    }

    // 정확한 부모 컨테이너 확인
    const preciseContainers = [
      { selector: '.navigator_item__mH4JG', score: 12, desc: 'navigator_item' },
      { selector: '.video_card_description__2sUfw', score: 10, desc: 'card_description' },
      { selector: '[class*="video_information_data"]', score: 15, desc: 'live_info_data' }
    ];

    for (const container of preciseContainers) {
      if (element.closest(container.selector)) {
        result.score += container.score;
        result.factors.push(container.desc);
        break;
      }
    }

    return result;
  }

  /**
   * 형제 요소 컨텍스트 분석
   * @private
   * @param {Element} element - 분석할 요소
   * @returns {Object} 형제 요소 분석 결과
   */
  analyzeSiblingContext(element) {
    const result = { score: 0, factors: [] };

    const parent = element.parentElement;
    if (!parent) return result;

    // 형제 요소 중 LIVE 배지 확인
    const liveBadge = parent.querySelector('.thumbnail_badge_live__rBgk, .thumbnail_badge_is_on__Hr6EA');
    if (liveBadge && liveBadge !== element) {
      result.score += 8;
      result.factors.push('has_live_sibling');
    }

    // 형제 요소 중 이미지 확인 (썸네일)
    const thumbnailImage = parent.querySelector('img');
    if (thumbnailImage) {
      result.score += 5;
      result.factors.push('has_thumbnail_sibling');
    }

    return result;
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
   * 안전한 요소 숨기기 (개선된 버전)
   * @param {Element} element - 숨길 요소
   */
  hideElement(element) {
    try {
      // 요소 유효성 검사
      if (!element || !element.parentNode || !document.contains(element)) {
        window.ChzzkLogger?.warn('⚠️ [HIDE] Invalid element, skipping hide operation');
        return;
      }

      // 이미 숨겨진 요소는 건너뛰기
      if (element.hasAttribute('data-chzzk-hidden')) {
        return;
      }

      // 중요한 레이아웃 요소인지 확인 (화면 까짐 방지)
      if (this.isCriticalLayoutElement(element)) {
        window.ChzzkLogger?.warn(`⚠️ [HIDE] Skipping critical layout element: ${element.tagName}.${element.className?.toString().slice(0, 30)}`);
        return;
      }

      // 스트리머 닉네임이 포함된 컨테이너인지 확인 (보호)
      if (this.containsStreamerName(element)) {
        window.ChzzkLogger?.warn(`⚠️ [HIDE] Skipping element containing streamer name: ${element.textContent?.trim().slice(0, 30)}`);
        return;
      }

      // 안전한 방식으로 숨기기
      element.classList.add('chzzk-viewer-hidden');
      element.setAttribute('data-chzzk-hidden', 'true');
      
      window.ChzzkLogger?.debug(`✅ [HIDE] Safely hidden: "${element.textContent?.trim().slice(0, 20)}" (${element.tagName})`);
      
    } catch (error) {
      window.ChzzkLogger?.error('❌ [HIDE] Error hiding element:', error);
      
      // 오류 발생 시 복구 시도
      try {
        element.style.visibility = 'hidden';
        element.style.opacity = '0';
        window.ChzzkLogger?.warn('🔧 [HIDE] Applied fallback hiding method');
      } catch (fallbackError) {
        window.ChzzkLogger?.error('💥 [HIDE] Fallback hiding also failed:', fallbackError);
      }
    }
  }

  /**
   * 중요한 레이아웃 요소인지 확인 (화면 까짐 방지)
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 중요한 레이아웃 요소 여부
   */
  isCriticalLayoutElement(element) {
    const tagName = element.tagName?.toLowerCase();
    const className = (element.className && typeof element.className === 'string') ?
                     element.className.toLowerCase() :
                     (element.className && element.className.baseVal ? element.className.baseVal.toLowerCase() : '');
    const text = element.textContent?.trim() || '';

    // Viewer-count badges often include "container" in their generated class
    // names. Do not let broad layout-protection keywords block already-vetted
    // count elements such as thumbnail_badge_container or _container_ hashes.
    if (
      this.isViewerCountPattern(text) &&
      (
        className.includes('thumbnail_badge_container') ||
        className.includes('navigator_count') ||
        className.includes('video_information_count') ||
        (className.includes('_container_') && this.isLikelyChzzkViewerCountContainer(element))
      )
    ) {
      return false;
    }

    // 중요한 HTML 태그들
    const criticalTags = ['html', 'body', 'main', 'section', 'header', 'footer', 'nav', 'article'];
    if (criticalTags.includes(tagName)) {
      return true;
    }

    // 중요한 레이아웃 클래스들
    const criticalClasses = [
      'app', 'main', 'container', 'wrapper', 'layout', 'page',
      'content', 'root', 'body', 'header', 'footer',
      'navigation', 'nav', 'sidebar', 'aside',
      'live_player', 'video_player', 'player_container'  // 동영상 플레이어 관련
    ];
    
    const hasCriticalClass = criticalClasses.some(criticalClass => 
      className.includes(criticalClass)
    );

    if (hasCriticalClass) {
      return true;
    }

    // 부모가 적은 최상위 요소들 (depth 체크)
    let depth = 0;
    let current = element.parentElement;
    while (current && depth < 5) {
      depth++;
      current = current.parentElement;
    }
    
    // 너무 상위에 있는 요소는 숨기지 않음
    if (depth < 3) {
      return true;
    }

    return false;
  }

  /**
   * 스트리머 닉네임이 포함된 컨테이너인지 확인
   * @private
   * @param {Element} element - 확인할 요소
   * @returns {boolean} 스트리머 닉네임 포함 여부
   */
  containsStreamerName(element) {
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : 
                     (element.className && element.className.baseVal ? element.className.baseVal : '');
    
    // 스트리머/채널 이름 관련 클래스들 (HTML 구조 기반)
    const nameClasses = [
      'navigator_information__sT7qv',  // LNB 정보 컨테이너 (닉네임 포함)
      'navigator_name__k4Sc2',         // LNB 닉네임 직접 클래스
      'name_text__yQG50',              // 닉네임 텍스트 클래스
      'navigator_content__K38XA',      // LNB 채널 이름
      'navigator_title__oExun',        // LNB 제목
      'video_card_name__dOHzK',        // 카드 채널 이름
      'channel_name',                  // 일반적인 채널 이름
      'streamer_name',                 // 스트리머 이름
      'creator_name'                   // 크리에이터 이름
    ];
    
    // 클래스명으로 확인
    const hasNameClass = nameClasses.some(nameClass => 
      className.includes(nameClass)
    );
    
    if (hasNameClass) {
      return true;
    }
    
    // 자식 요소에 닉네임 클래스가 있는지 확인
    const hasNameChild = element.querySelector && (
      element.querySelector('.navigator_name__k4Sc2') ||
      element.querySelector('.name_text__yQG50') ||
      element.querySelector('.navigator_content__K38XA')
    );
    
    if (hasNameChild) {
      return true;
    }
    
    // 텍스트 내용이 시청자 수 패턴이 아닌 경우 (닉네임일 가능성)
    const text = element.textContent?.trim() || '';
    const isViewerCount = text.match(/^\d+,?\d*명?$/) || text.match(/^\d+$/) || text.includes('명');
    
    // 링크 요소이면서 시청자 수가 아닌 경우 (닉네임 링크)
    if (element.tagName === 'A' && element.href && !isViewerCount && text.length > 0) {
      return true;
    }
    
    // navigator_information__sT7qv 컨테이너는 무조건 보호 (비방송 채널 닉네임 포함)
    if (className.includes('navigator_information__sT7qv')) {
      // 하지만 시청자 수가 있는 라이브 채널의 경우 시청자 수만 숨기고 싶으므로
      // 이 컨테이너 내부에 시청자 수 요소가 있는지 확인
      const hasViewerCount = element.parentElement && 
                           element.parentElement.querySelector('.navigator_count__kpr6-');
      
      // 시청자 수가 없는 비방송 채널이거나, 자신이 닉네임 요소인 경우 보호
      if (!hasViewerCount || element.querySelector('.navigator_name__k4Sc2, .name_text__yQG50')) {
        return true;
      }
    }
    
    return false;
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
   * AI 기반 고도화된 텍스트 패턴으로 시청자 수 찾아 숨기기 (4단계용)
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {number} 숨긴 요소 개수
   */
  hideByAITextPattern(container) {
    window.ChzzkLogger?.debug('🧠 [AI-PATTERN] AI-powered text pattern scan started...');
    
    let aiHiddenCount = 0;

    // AI 기반 우선순위 컨테이너 스캔
    const priorityContainers = this.identifyPriorityContainers(container);
    
    for (const priorityContainer of priorityContainers) {
      const textNodes = this.getTextNodes(priorityContainer.element);
      
      textNodes.forEach(node => {
        const text = node.textContent?.trim();
        if (text && this.isAIViewerCountPattern(text, { contextScore: 0 })) {
          const targetElement = this.findOptimalParent(node, priorityContainer.type);
          if (targetElement && this.shouldHideElementWithAdvancedContext(targetElement)) {
            this.hideElement(targetElement);
            aiHiddenCount++;
            window.ChzzkLogger?.debug(`🧠 [AI-PATTERN] AI found: "${text}" in ${priorityContainer.type}`);
          }
        }
      });
    }

    window.ChzzkLogger?.info(`🧠 [AI-PATTERN] AI text scan completed: ${aiHiddenCount} elements found`);
    return aiHiddenCount;
  }

  /**
   * AI 기반 우선순위 컨테이너 식별
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {Array} 우선순위 컨테이너 배열
   */
  identifyPriorityContainers(container) {
    const priorityContainers = [];

    // 라이브 페이지 컨테이너 (최우선)
    const liveContainers = container.querySelectorAll('[class*="video_information_data"], .video_information_row__HrQ0z');
    liveContainers.forEach(el => {
      priorityContainers.push({ element: el, type: 'live_page', priority: 1 });
    });

    // 카드 뷰 컨테이너
    const cardContainers = container.querySelectorAll('.video_card_container__urjO6, .video_card_description__2sUfw');
    cardContainers.forEach(el => {
      priorityContainers.push({ element: el, type: 'card_view', priority: 2 });
    });

    // LNB 사이드바 컨테이너
    const lnbContainers = container.querySelectorAll('[class*="navigator_item"], [class*="navigation_bar"]');
    lnbContainers.forEach(el => {
      priorityContainers.push({ element: el, type: 'lnb_sidebar', priority: 3 });
    });

    // 우선순위 정렬
    return priorityContainers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 컨테이너 타입에 따른 최적 부모 요소 찾기
   * @private
   * @param {Node} textNode - 텍스트 노드
   * @param {string} containerType - 컨테이너 타입
   * @returns {Element|null} 최적 부모 요소
   */
  findOptimalParent(textNode, containerType) {
    let current = textNode.parentElement;
    
    // 컨테이너 타입별 최적화된 부모 찾기
    switch (containerType) {
      case 'live_page':
        // 라이브 페이지: strong.video_information_count__Y05sI 우선
        for (let i = 0; i < 3 && current; i++) {
          if (current.matches && current.matches('strong.video_information_count__Y05sI')) {
            return current;
          }
          current = current.parentElement;
        }
        break;
        
      case 'card_view':
        // 카드 뷰: span.thumbnail_badge_container__sMIz3 우선
        current = textNode.parentElement;
        for (let i = 0; i < 3 && current; i++) {
          if (current.matches && current.matches('span.thumbnail_badge_container__sMIz3')) {
            return current;
          }
          current = current.parentElement;
        }
        break;
        
      case 'lnb_sidebar':
        // LNB: em.navigator_count__kpr6- 우선
        current = textNode.parentElement;
        for (let i = 0; i < 3 && current; i++) {
          if (current.matches && (current.matches('em.navigator_count__kpr6-') || current.matches('em[class*="navigator_count"]'))) {
            return current;
          }
          current = current.parentElement;
        }
        break;
    }
    
    // 기본 로직으로 폴백
    return this.findAppropriateParent(textNode);
  }

  /**
   * 고급 텍스트 패턴으로 시청자 수 찾아 숨기기 (레거시 - 호환성 유지)
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
   * AI 기반 강제 스캔 실행 - 가장 지능적이고 공격적인 검색 방법
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {number} 숨긴 요소 개수
   */
  executeAIForceScan(container) {
    window.ChzzkLogger?.warn('🧠 [AI-FORCE] Starting intelligent AI force scan...');
    
    let aiForceCount = 0;
    
    try {
      // === AI 방법 1: 머신러닝 기반 패턴 인식 ===
      const mlPatternCount = this.executeMLPatternRecognition(container);
      aiForceCount += mlPatternCount;
      
      // === AI 방법 2: 구조적 분석 기반 검색 ===
      const structuralCount = this.executeStructuralAnalysis(container);
      aiForceCount += structuralCount;
      
      // === AI 방법 3: 확률적 컨텍스트 분석 ===
      const probabilisticCount = this.executeProbabilisticAnalysis(container);
      aiForceCount += probabilisticCount;
      
    } catch (error) {
      window.ChzzkLogger?.error('💥 [AI-FORCE] Error in AI force scan:', error);
      
      // AI 실패 시 기존 강제 스캔으로 폴백
      window.ChzzkLogger?.warn('🔄 [AI-FORCE] Falling back to traditional force scan...');
      return this.executeForceScan(container);
    }
    
    window.ChzzkLogger?.warn(`🧠 [AI-FORCE] AI force scan completed: ${aiForceCount} elements intelligently hidden`);
    return aiForceCount;
  }

  /**
   * 머신러닝 기반 패턴 인식
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {number} 숨긴 요소 개수
   */
  executeMLPatternRecognition(container) {
    window.ChzzkLogger?.debug('🤖 [ML] Starting ML pattern recognition...');
    
    let mlCount = 0;
    const allElements = container.querySelectorAll('*');
    
    // ML 특성 벡터 기반 분류
    allElements.forEach(element => {
      if (element.hasAttribute('data-chzzk-hidden')) return;
      
      const features = this.extractMLFeatures(element);
      const probability = this.calculateViewerCountProbability(features);
      
      // 높은 확률의 요소만 숨기기 (90% 이상)
      if (probability >= 0.9) {
        window.ChzzkLogger?.warn(`🤖 [ML] High probability (${(probability * 100).toFixed(1)}%): "${element.textContent?.trim().slice(0, 20)}"`);
        this.hideElement(element);
        mlCount++;
      }
    });
    
    window.ChzzkLogger?.debug(`🤖 [ML] ML recognition found ${mlCount} elements`);
    return mlCount;
  }

  /**
   * ML 특성 벡터 추출
   * @private
   * @param {Element} element - 분석할 요소
   * @returns {Object} 특성 벡터
   */
  extractMLFeatures(element) {
    const text = element.textContent?.trim() || '';
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : '';
    
    return {
      // 텍스트 특성
      isNumeric: /^\d+$/.test(text),
      hasComma: text.includes(','),
      hasKoreanUnit: /[만천백십명]/.test(text),
      hasEnglishUnit: /[kmb]$/i.test(text),
      textLength: text.length,
      isEmptyText: text.length === 0,
      
      // 구조적 특성
      tagName: element.tagName,
      isEmTag: element.tagName === 'EM',
      isSpanTag: element.tagName === 'SPAN',
      isStrongTag: element.tagName === 'STRONG',
      
      // 클래스 특성
      hasCountClass: className.includes('count'),
      hasViewerClass: className.includes('viewer'),
      hasBadgeClass: className.includes('badge'),
      hasNavigatorClass: className.includes('navigator'),
      hasInformationClass: className.includes('information'),
      
      // 컨텍스트 특성
      isInLiveContainer: !!element.closest('[class*="video_information"]'),
      isInCardContainer: !!element.closest('[class*="video_card"]'),
      isInNavigatorContainer: !!element.closest('[class*="navigator"]'),
      isInExcludedArea: !!element.closest('[class*="chat"], [class*="title"], [class*="name"]')
    };
  }

  /**
   * 시청자 수 확률 계산 (간단한 로지스틱 회귀 모델)
   * @private
   * @param {Object} features - 특성 벡터
   * @returns {number} 확률 (0-1)
   */
  calculateViewerCountProbability(features) {
    // 휴리스틱 기반 가중치 (실제 ML 모델 대신)
    let score = 0;
    
    // 텍스트 패턴 가중치
    if (features.isNumeric) score += 0.3;
    if (features.hasComma) score += 0.2;
    if (features.hasKoreanUnit) score += 0.25;
    if (features.hasEnglishUnit) score += 0.2;
    if (features.textLength >= 2 && features.textLength <= 8) score += 0.1;
    
    // 구조적 가중치
    if (features.isEmTag) score += 0.15;
    if (features.isSpanTag) score += 0.1;
    if (features.isStrongTag) score += 0.1;
    
    // 클래스 가중치
    if (features.hasCountClass) score += 0.3;
    if (features.hasViewerClass) score += 0.25;
    if (features.hasBadgeClass) score += 0.2;
    if (features.hasNavigatorClass) score += 0.15;
    if (features.hasInformationClass) score += 0.15;
    
    // 컨텍스트 가중치
    if (features.isInLiveContainer) score += 0.2;
    if (features.isInCardContainer) score += 0.15;
    if (features.isInNavigatorContainer) score += 0.15;
    
    // 제외 요소 페널티
    if (features.isInExcludedArea) score -= 0.5;
    if (features.isEmptyText) score -= 0.3;
    
    // 시그모이드 함수 적용하여 0-1 범위로 정규화
    return 1 / (1 + Math.exp(-score * 2));
  }

  /**
   * 구조적 분석 기반 검색
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {number} 숨긴 요소 개수
   */
  executeStructuralAnalysis(container) {
    window.ChzzkLogger?.debug('🏗️ [STRUCT] Starting structural analysis...');
    
    let structuralCount = 0;
    
    // 구조적 패턴 기반 검색
    const structuralPatterns = [
      {
        containerSelector: '[class*="navigator_item"]',
        targetSelector: 'em:last-child',
        description: 'LNB last em child'
      },
      {
        containerSelector: '[class*="video_card_description"]',
        targetSelector: 'span:not([class*="live"])',
        description: 'Card description non-live span'
      },
      {
        containerSelector: '[class*="video_information_data"]',
        targetSelector: 'strong',
        description: 'Live info data strong'
      }
    ];
    
    structuralPatterns.forEach(pattern => {
      const containers = container.querySelectorAll(pattern.containerSelector);
      containers.forEach(patternContainer => {
        const targets = patternContainer.querySelectorAll(pattern.targetSelector);
        targets.forEach(target => {
          const text = target.textContent?.trim();
          if (text && !target.hasAttribute('data-chzzk-hidden') && 
              this.isAIViewerCountPattern(text, { contextScore: 15 })) {
            window.ChzzkLogger?.warn(`🏗️ [STRUCT] Structural match: "${text}" (${pattern.description})`);
            this.hideElement(target);
            structuralCount++;
          }
        });
      });
    });
    
    window.ChzzkLogger?.debug(`🏗️ [STRUCT] Structural analysis found ${structuralCount} elements`);
    return structuralCount;
  }

  /**
   * 확률적 컨텍스트 분석
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {number} 숨긴 요소 개수
   */
  executeProbabilisticAnalysis(container) {
    window.ChzzkLogger?.debug('📊 [PROB] Starting probabilistic context analysis...');
    
    let probabilisticCount = 0;
    
    // 확률적 분석: 주변 요소들의 패턴을 분석하여 확률 계산
    const candidateElements = container.querySelectorAll('span, em, strong');
    
    candidateElements.forEach(element => {
      if (element.hasAttribute('data-chzzk-hidden')) return;
      
      const contextProbability = this.calculateContextProbability(element);
      
      if (contextProbability >= 0.85) {
        const text = element.textContent?.trim();
        window.ChzzkLogger?.warn(`📊 [PROB] High context probability (${(contextProbability * 100).toFixed(1)}%): "${text}"`);
        this.hideElement(element);
        probabilisticCount++;
      }
    });
    
    window.ChzzkLogger?.debug(`📊 [PROB] Probabilistic analysis found ${probabilisticCount} elements`);
    return probabilisticCount;
  }

  /**
   * 컨텍스트 확률 계산
   * @private
   * @param {Element} element - 분석할 요소
   * @returns {number} 컨텍스트 확률 (0-1)
   */
  calculateContextProbability(element) {
    let probability = 0;
    const text = element.textContent?.trim() || '';
    
    // 베이즈 정리 기반 확률 계산
    
    // 사전 확률: 태그별 시청자 수일 확률
    const tagPriors = {
      'EM': 0.3,      // em 태그는 시청자 수일 확률이 높음
      'SPAN': 0.2,    // span은 중간
      'STRONG': 0.15  // strong은 상대적으로 낮음
    };
    
    probability += tagPriors[element.tagName] || 0.1;
    
    // 우도: 텍스트 패턴 기반
    if (/^\d+$/.test(text)) probability += 0.4;
    if (/^\d{1,3}(,\d{3})*$/.test(text)) probability += 0.5;
    if (/명$/.test(text)) probability += 0.3;
    
    // 증거: 주변 컨텍스트
    const parent = element.parentElement;
    if (parent) {
      const parentClass = parent.className || '';
      if (parentClass.includes('navigator')) probability += 0.2;
      if (parentClass.includes('card')) probability += 0.15;
      if (parentClass.includes('information')) probability += 0.15;
      
      // 형제 요소 분석
      const siblings = Array.from(parent.children);
      const hasLiveBadge = siblings.some(sibling => {
        const className = sibling.className;
        return className && typeof className === 'string' && className.includes('live');
      });
      if (hasLiveBadge) probability += 0.1;
    }
    
    // 정규화
    return Math.min(probability, 1.0);
  }

  /**
   * 강제 스캔 실행 - 기존 공격적인 검색 방법 (폴백용)
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {number} 숨긴 요소 개수
   */
  executeForceScan(container) {
    window.ChzzkLogger?.warn('🚨 [FORCE] Starting aggressive force scan...');
    
    let forceScanCount = 0;
    
    try {
      // === 방법 1: 모든 텍스트를 포함한 요소 전체 스캔 ===
      const allElements = container.querySelectorAll('*');
      window.ChzzkLogger?.debug(`🔍 [FORCE] Scanning ${allElements.length} total elements...`);
      
      allElements.forEach((element, index) => {
        // 진행 상황 로깅 (큰 페이지의 경우)
        if (index % 1000 === 0 && index > 0) {
          window.ChzzkLogger?.debug(`🔍 [FORCE] Progress: ${index}/${allElements.length} elements scanned`);
        }
        
        const text = element.textContent?.trim();
        if (!text) return;
        
        // 이미 처리된 요소는 건너뛰기
        if (element.hasAttribute('data-chzzk-hidden') || processedElements.has(element)) {
          return;
        }
        
        // 강제 시청자 수 패턴 검사 (더 관대한 조건)
        if (this.isForceViewerCountPattern(text)) {
          // 채팅이나 제외 영역이 아닌지 확인
          if (!this.isInExcludedArea(element)) {
            window.ChzzkLogger?.warn(`🚨 [FORCE] Force hiding: "${text}" in ${element.tagName}.${element.className?.toString().slice(0, 30)}`);
            this.hideElement(element);
            processedElements.add(element);
            forceScanCount++;
          }
        }
      });
      
      // === 방법 2: 라이브 페이지 특화 DOM 구조 분석 ===
      if (window.location.pathname.startsWith('/live/')) {
        window.ChzzkLogger?.debug('🔍 [FORCE] Live page specific scan...');
        const liveSpecificCount = this.forceScanLivePage(container);
        forceScanCount += liveSpecificCount;
      }
      
      // === 방법 3: 속성 기반 강제 검색 ===
      window.ChzzkLogger?.debug('🔍 [FORCE] Attribute-based scan...');
      const attributeBasedElements = container.querySelectorAll('span, strong, em, div');
      
      attributeBasedElements.forEach(element => {
        if (element.hasAttribute('data-chzzk-hidden')) return;
        
        const text = element.textContent?.trim();
        if (!text) return;
        
        // 강제 패턴 매칭 (매우 관대함)
        if (this.isForceViewerCountPattern(text) && !this.isInExcludedArea(element)) {
          // 부모 요소들을 확인하여 적절한 컨테이너인지 검사
          const appropriateParent = this.findMostAppropriateParent(element);
          if (appropriateParent && !appropriateParent.hasAttribute('data-chzzk-hidden')) {
            window.ChzzkLogger?.warn(`🚨 [FORCE] Attribute-based hide: "${text}" via parent analysis`);
            this.hideElement(appropriateParent);
            forceScanCount++;
          }
        }
      });
      
    } catch (error) {
      window.ChzzkLogger?.error('💥 [FORCE] Error in force scan:', error);
    }
    
    window.ChzzkLogger?.warn(`🚨 [FORCE] Traditional force scan completed: ${forceScanCount} elements forcefully hidden`);
    return forceScanCount;
  }

  /**
   * 강제 시청자 수 패턴 확인 (더 관대한 조건)
   * @private
   * @param {string} text - 검사할 텍스트
   * @returns {boolean} 강제 패턴 매칭 결과
   */
  isForceViewerCountPattern(text) {
    if (!text) return false;
    
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    
    // 매우 관대한 패턴들
    const forcePatterns = [
      // 기본 숫자 패턴 (더 관대함)
      /^\d+$/,                                    // 순수 숫자
      /^\d{1,5}명$/,                             // 숫자 + 명 (더 큰 숫자 허용)
      /^\d{1,3}(,\d{3})*명?$/,                   // 쉼표 구분 숫자
      /^\d+\.?\d*[만천백십kmb]명?$/i,            // 단위 포함
      
      // 시청자 관련 복합 패턴
      /\d+.*명.*시청/,                           // 숫자 + 명 + 시청 (순서 무관)
      /\d+.*시청.*중/,                           // 숫자 + 시청 + 중
      /\d+.*viewers?/i,                          // 영어 viewers
      /\d+.*watching/i,                          // 영어 watching
      
      // 한국어 패턴 (더 유연함)
      /\d+.*명.*온라인/,                         // 온라인 표시
      /\d+.*명.*접속/,                           // 접속 표시
      /\d+.*명.*라이브/,                         // 라이브 표시 (제외하지 않음)
      
      // 실시간 업데이트 패턴
      /^\d{1,3}(,\d{3})*\s*$/,                   // 숫자만 (공백 허용)
      /^\d+\.\d+[kmb]\s*$/i                      // 소수점 단위
    ];
    
    return forcePatterns.some(pattern => pattern.test(normalizedText));
  }

  /**
   * 제외 영역에 있는지 확인 (강제 스캔용)
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 제외 영역 여부
   */
  isInExcludedArea(element) {
    // 채팅 영역 제외
    if (element.closest('[class*="live_chatting"]') || 
        element.closest('[class*="chat"]')) {
      return true;
    }
    
    // 네비게이션 메뉴 제외
    if (element.closest('[class*="gnb"]') || 
        element.closest('[class*="header"]')) {
      return true;
    }
    
    // 푸터 영역 제외
    if (element.closest('footer') || 
        element.closest('[class*="footer"]')) {
      return true;
    }
    
    // 스트리머 정보 제외 (이름, 제목 등)
    if (element.closest('[class*="title"]') || 
        element.closest('[class*="name"]') ||
        element.closest('[class*="creator"]')) {
      return true;
    }
    
    return false;
  }

  /**
   * 라이브 페이지 특화 강제 스캔
   * @private
   * @param {Element} container - 검색할 컨테이너
   * @returns {number} 숨긴 요소 개수
   */
  forceScanLivePage(container) {
    let liveCount = 0;
    
    // 라이브 페이지 주요 컨테이너들을 직접 스캔
    const liveContainers = [
      '[class*="video_information_data"]',
      '.video_information_row__HrQ0z', 
      '.video_information_status__YKGeL',
      '.live_information_player__lYPjg'
    ];
    
    liveContainers.forEach(containerSelector => {
      const liveContainer = container.querySelector(containerSelector);
      if (!liveContainer) return;
      
      window.ChzzkLogger?.debug(`🔍 [FORCE-LIVE] Scanning container: ${containerSelector}`);
      
      // 컨테이너 내 모든 텍스트 요소 확인
      const textElements = liveContainer.querySelectorAll('span, strong, em, div');
      
      textElements.forEach(element => {
        const text = element.textContent?.trim();
        if (!text || element.hasAttribute('data-chzzk-hidden')) return;
        
        // 라이브 페이지 특화 패턴 확인
        if (this.isLivePageViewerPattern(text)) {
          window.ChzzkLogger?.warn(`🚨 [FORCE-LIVE] Live page force hide: "${text}" in ${containerSelector}`);
          this.hideElement(element);
          liveCount++;
        }
      });
    });
    
    window.ChzzkLogger?.debug(`🔍 [FORCE-LIVE] Live page scan found ${liveCount} elements`);
    return liveCount;
  }

  /**
   * 라이브 페이지 시청자 수 특화 패턴
   * @private
   * @param {string} text - 검사할 텍스트
   * @returns {boolean} 라이브 페이지 시청자 패턴 여부
   */
  isLivePageViewerPattern(text) {
    const livePatterns = [
      /^\d{1,3}(,\d{3})*명\s*시청\s*중$/,       // "2,862명 시청 중"
      /^\d{1,3}(,\d{3})*명이?\s*시청\s*중$/,    // "2,862명이 시청 중"  
      /^\d+\.?\d*[만천백십]명?\s*시청\s*중$/,   // "1.2만명 시청 중"
      /^\d{1,3}(,\d{3})*명$/,                   // "2,862명"
      /^\d+\.?\d*[만천백십]명?$/,              // "1.2만명"
      /^\d+$/                                   // 순수 숫자
    ];
    
    return livePatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * 가장 적절한 부모 요소 찾기 (강제 스캔용)
   * @private
   * @param {Element} element - 시작 요소
   * @returns {Element|null} 가장 적절한 부모 요소
   */
  findMostAppropriateParent(element) {
    let current = element;
    
    // 최대 5단계까지 올라가면서 적절한 부모 찾기
    for (let i = 0; i < 5 && current; i++) {
      const className = (current.className && typeof current.className === 'string') ? 
                       current.className : 
                       (current.className && current.className.baseVal ? current.className.baseVal : '');
      
      // 라이브 페이지 정확한 클래스 확인
      if (className.includes('video_information_count__Y05sI') ||
          className.includes('thumbnail_badge_container__sMIz3')) {
        return current;
      }
      
      // 시청자 수 관련 클래스 확인
      if (className.includes('count') || 
          className.includes('viewer') || 
          className.includes('badge')) {
        return current;
      }
      
      current = current.parentElement;
    }
    
    return element; // 적절한 부모를 못 찾으면 원래 요소 반환
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

    window.ChzzkLogger?.info('🔧 [MONITOR] Starting enhanced real-time monitoring system...');

    // 즉각적인 텍스트 변경 감지를 위한 고성능 MutationObserver
    globalViewerObserver = new MutationObserver((mutations) => {
      // 실시간 시청자 수 업데이트는 즉시 처리 (디바운스 없음)
      let hasViewerCountChange = false;
      let hasOtherChanges = false;

      mutations.forEach(mutation => {
        // 텍스트 변경 감지 (가장 중요)
        if (mutation.type === 'characterData') {
          const parentElement = mutation.target.parentElement;
          const text = mutation.target.textContent?.trim();
          
          window.ChzzkLogger?.debug(`🔄 [TEXT-CHANGE] "${text}" in ${parentElement?.tagName}.${parentElement?.className?.toString().slice(0, 30)}`);
          
          // 라이브 페이지 시청자 수 변경 즉시 감지
          if (parentElement && this.isLiveViewerCountElement(parentElement)) {
            window.ChzzkLogger?.warn(`🚨 [LIVE-UPDATE] Real-time viewer count detected: "${text}"`);
            this.hideElement(parentElement);
            hasViewerCountChange = true;
          }
        }
        
        // 새 요소 추가 감지
        else if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && this.isRelevantContainer(node)) {
              hasOtherChanges = true;
            }
          });
        }
        
        // 속성 변경 감지 (클래스 변경 등)
        else if (mutation.type === 'attributes') {
          if (this.isPotentialViewerElement(mutation.target)) {
            hasOtherChanges = true;
          }
        }
      });

      // 즉각적 처리
      if (hasViewerCountChange) {
        window.ChzzkLogger?.info('⚡ [INSTANT] Processing real-time viewer count changes');
        // 추가 스캔으로 놓친 요소가 있는지 확인
        this.scanForMissedLiveElements();
      }

      // 기타 변경사항은 디바운스 처리
      if (hasOtherChanges) {
        this.debouncedUpdate();
      }
    });

    // 전체 document 감시 (서브트리 포함, 모든 변경 감지)
    globalViewerObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-*'], // 모든 중요한 속성 감지
      characterData: true, // 텍스트 변경 감지 (가장 중요)
      characterDataOldValue: true // 이전 값도 기록
    });

    // 라이브 페이지 전용 고빈도 모니터링 추가
    if (window.location.pathname.startsWith('/live/')) {
      this.startLivePageIntensiveMonitoring();
    }

    // 카드 뷰 전용 모니터링 시작
    this.startCardViewMonitoring();

    window.ChzzkLogger?.info('✅ [MONITOR] Enhanced monitoring system activated');
  }

  /**
   * 라이브 시청자 수 요소인지 확인
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} 라이브 시청자 수 요소 여부
   */
  isLiveViewerCountElement(element) {
    if (!element) return false;
    
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : 
                     (element.className && element.className.baseVal ? element.className.baseVal : '');
    const text = element.textContent?.trim() || '';
    
    // 정확한 라이브 페이지 시청자 수 클래스 확인
    if (className.includes('video_information_count__Y05sI')) {
      // 시청자 수 패턴 확인
      if (/\d+.*명.*시청.*중/.test(text) || /^\d{1,3}(,\d{3})*명$/.test(text)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 놓친 라이브 요소들 스캔
   * @private
   */
  scanForMissedLiveElements() {
    window.ChzzkLogger?.debug('🔍 [MISSED] Scanning for missed live elements...');
    
    // 라이브 페이지 핵심 컨테이너들 직접 스캔
    const liveContainers = [
      '[class*="video_information_data"]',
      '.video_information_row__HrQ0z',
      '.video_information_status__YKGeL'
    ];
    
    let foundCount = 0;
    
    liveContainers.forEach(containerSelector => {
      const container = document.querySelector(containerSelector);
      if (!container) return;
      
      // 컨테이너 내 모든 시청자 수 요소 확인
      const viewerElements = container.querySelectorAll('strong.video_information_count__Y05sI');
      
      viewerElements.forEach(element => {
        const text = element.textContent?.trim();
        if (!element.hasAttribute('data-chzzk-hidden') && this.isViewerCountPattern(text)) {
          window.ChzzkLogger?.warn(`🎯 [MISSED] Found missed live element: "${text}"`);
          this.hideElement(element);
          foundCount++;
        }
      });
    });
    
    if (foundCount > 0) {
      window.ChzzkLogger?.info(`✅ [MISSED] Found and hidden ${foundCount} missed live elements`);
    }
  }

  /**
   * 라이브 페이지 집중 모니터링 시작
   * @private
   */
  startLivePageIntensiveMonitoring() {
    window.ChzzkLogger?.info('🎯 [LIVE] Starting intensive live page monitoring...');
    
    // 0.5초마다 라이브 페이지 시청자 수 재검사
    const liveMonitorInterval = setInterval(() => {
      if (!window.ChzzkSettings?.get('hideViewerCount')) {
        return;
      }
      
      // 라이브 페이지 전용 즉시 스캔
      const liveViewerElements = document.querySelectorAll('strong.video_information_count__Y05sI');
      let hiddenInInterval = 0;
      
      liveViewerElements.forEach(element => {
        const text = element.textContent?.trim();
        if (!element.hasAttribute('data-chzzk-hidden') && 
            this.isViewerCountPattern(text) && 
            /\d+.*명.*시청.*중/.test(text)) {
          
          window.ChzzkLogger?.debug(`⚡ [LIVE-INTERVAL] Hiding: "${text}"`);
          this.hideElement(element);
          hiddenInInterval++;
        }
      });
      
      if (hiddenInInterval > 0) {
        window.ChzzkLogger?.info(`⚡ [LIVE-INTERVAL] Hidden ${hiddenInInterval} elements in interval scan`);
      }
    }, 500);
    
    // 페이지 이동 시 정리
    const cleanup = () => {
      clearInterval(liveMonitorInterval);
      window.ChzzkLogger?.debug('🧹 [LIVE] Live page monitoring cleaned up');
    };
    
    // 정리 함수 등록
    window.addEventListener('beforeunload', cleanup, { once: true });
    
    // URL 변경 감지로 정리
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      cleanup();
      return originalPushState.apply(this, args);
    };
    
    history.replaceState = function(...args) {
      cleanup();
      return originalReplaceState.apply(this, args);
    };
  }

  /**
   * 카드 뷰 전용 모니터링 시작
   * @private
   */
  startCardViewMonitoring() {
    window.ChzzkLogger?.info('📺 [CARD] Starting card view monitoring system...');
    
    // 카드 뷰 모니터링: 0.8초마다 전체 카드 스캔
    const cardMonitorInterval = setInterval(() => {
      if (!window.ChzzkSettings?.get('hideViewerCount')) {
        return;
      }
      
      this.scanCardViewElements();
    }, 800);
    
    // 페이지 이동 시 정리
    const cleanup = () => {
      clearInterval(cardMonitorInterval);
      window.ChzzkLogger?.debug('🧹 [CARD] Card view monitoring cleaned up');
    };
    
    // 정리 함수 등록
    window.addEventListener('beforeunload', cleanup, { once: true });
    
    // URL 변경 감지로 정리 (기존 코드와 충돌 방지)
    if (!window._cardViewCleanupRegistered) {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      const wrappedPushState = function(...args) {
        cleanup();
        return originalPushState.apply(this, args);
      };
      
      const wrappedReplaceState = function(...args) {
        cleanup();
        return originalReplaceState.apply(this, args);
      };
      
      // 여러 번 래핑 방지
      if (!history.pushState._cardViewWrapped) {
        history.pushState = wrappedPushState;
        history.pushState._cardViewWrapped = true;
      }
      
      if (!history.replaceState._cardViewWrapped) {
        history.replaceState = wrappedReplaceState;
        history.replaceState._cardViewWrapped = true;
      }
      
      window._cardViewCleanupRegistered = true;
    }
  }

  /**
   * 카드 뷰 요소들 스캔
   * @private
   */
  scanCardViewElements() {
    // 카드 뷰 시청자 수 요소들 직접 스캔
    const cardViewerSelectors = [
      // 정확한 카드 뷰 시청자 수 셀렉터들
      'span[class*="thumbnail_badge_container"]:not([class*="live"]):not([class*="is_on"])',
      '.video_card_description__2sUfw span:not([class*="live"])',
      '.video_card_container__urjO6 span.thumbnail_badge_container__sMIz3',
      '[class*="video_card_vertical"] span.thumbnail_badge_container__sMIz3',
      '[class*="video_card"] span[class*="_container_"]',
      '[class*="thumbnail"] span[class*="_container_"]'
    ];
    
    let cardHiddenCount = 0;
    
    cardViewerSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach(element => {
          const text = element.textContent?.trim();
          
          // LIVE 텍스트나 SVG가 있는 요소는 제외
          if (this.isLiveIndicator(element)) {
            return;
          }
          
          // 시청자 수 패턴 확인
          if (!element.hasAttribute('data-chzzk-hidden') && (this.isCardViewerCountPattern(text) || this.isLikelyChzzkViewerCountContainer(element))) {
            window.ChzzkLogger?.debug(`📺 [CARD] Hiding card viewer count: "${text}" with ${selector}`);
            this.hideElement(element);
            cardHiddenCount++;
          }
        });
        
      } catch (error) {
        window.ChzzkLogger?.warn(`❌ [CARD] Error with card selector ${selector}:`, error);
      }
    });

    // LNB 시청자 수도 함께 스캔
    const lnbSelectors = [
      '.navigator_count__kpr6-',
      '.navigator_count__db5Av', 
      '.home_recommend_live_count__7Or3N'
    ];
    
    lnbSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          const text = element.textContent?.trim();
          if (!element.hasAttribute('data-chzzk-hidden') && this.isViewerCountPattern(text)) {
            window.ChzzkLogger?.debug(`📺 [LNB] Hiding LNB viewer count: "${text}" with ${selector}`);
            this.hideElement(element);
            cardHiddenCount++;
          }
        });
      } catch (error) {
        window.ChzzkLogger?.warn(`❌ [LNB] Error with LNB selector ${selector}:`, error);
      }
    });
    
    if (cardHiddenCount > 0) {
      window.ChzzkLogger?.info(`📺 [CARD] Card/LNB scan hidden ${cardHiddenCount} elements`);
    }
  }

  /**
   * LIVE 인디케이터인지 확인
   * @private
   * @param {Element} element - 검사할 요소
   * @returns {boolean} LIVE 인디케이터 여부
   */
  isLiveIndicator(element) {
    // LIVE 관련 클래스 확인
    const className = (element.className && typeof element.className === 'string') ? 
                     element.className : 
                     (element.className && element.className.baseVal ? element.className.baseVal : '');
    
    if (className.includes('thumbnail_badge_live__rBgk+') || 
        className.includes('thumbnail_badge_is_on__Hr6EA')) {
      return true;
    }
    
    // SVG나 LIVE 텍스트 포함 확인
    const text = element.textContent?.trim().toLowerCase();
    if (text === 'live' || text === '라이브') {
      return true;
    }
    
    // SVG 요소 포함 확인
    if (element.querySelector('svg')) {
      return true;
    }
    
    return false;
  }

  /**
   * 카드 뷰 시청자 수 패턴 확인
   * @private
   * @param {string} text - 검사할 텍스트
   * @returns {boolean} 카드 뷰 시청자 수 패턴 여부
   */
  isCardViewerCountPattern(text) {
    if (!text) return false;
    
    const normalizedText = text.trim();
    
    // 카드 뷰 특화 패턴들
    const cardPatterns = [
      /^\d{1,3}(,\d{3})*명$/,              // "2,967명"
      /^\d+\.?\d*[만천백십]명?$/,          // "1.2만명", "523명"
      /^\d+\.?\d*[kmb]$/i,                 // "1.2k", "5m"
      /^\d+$/                              // "2967"
    ];
    
    const isMatch = cardPatterns.some(pattern => pattern.test(normalizedText));
    
    if (isMatch) {
      window.ChzzkLogger?.debug(`📺 [CARD-PATTERN] Card viewer pattern matched: "${normalizedText}"`);
    }
    
    return isMatch;
  }

  /**
   * 디바운스된 업데이트 함수
   * @private
   */
  debouncedUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.hideAll();
    }, 200);
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
   * 관련 컨테이너인지 확인 (카드 뷰 강화)
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

    // 라이브 페이지 정확한 컨테이너 (최우선)
    if (className.includes('video_information_data__w3P+x') ||
        className.includes('video_information_row__HrQ0z') ||
        className.includes('video_information_status__YKGeL')) {
      window.ChzzkLogger?.debug(`🎯 [LIVE] Found exact live container: ${className}`);
      return true;
    }

    // 카드 뷰 컨테이너 (강화된 감지)
    if (className.includes('video_card_container__urjO6') ||
        className.includes('video_card_vertical__+gTMT') ||
        className.includes('video_card_description__2sUfw') ||
        className.includes('thumbnail_badge_container__sMIz3')) {
      window.ChzzkLogger?.debug(`📺 [CARD] Found card container: ${className.slice(0, 50)}`);
      return true;
    }

    // 일반 카드/썸네일 컨테이너
    if (className.includes('video_card') || 
        className.includes('thumbnail') || 
        className.includes('badge')) {
      return true;
    }

    // 라이브 페이지 정보 컨테이너 (일반 패턴)
    if (className.includes('video_information') || 
        className.includes('live_information') || 
        className.includes('information_data') ||
        className.includes('information_row')) {
      return true;
    }

    // 사이드바 컨테이너 (LNB)
    if (className.includes('navigator') || 
        className.includes('navigation_bar') ||
        className.includes('navigator_count') ||
        className.includes('home_recommend')) {
      window.ChzzkLogger?.debug(`📊 [LNB] Found LNB container: ${className.slice(0, 50)}`);
      return true;
    }

    return false;
  }

  /**
   * 잠재적 시청자 수 요소인지 확인 (카드 뷰 및 LNB 강화)
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

    // 라이브 페이지 전용 클래스 확인 (최우선)
    if (className.includes('video_information_count__Y05sI')) {
      window.ChzzkLogger?.debug(`🎯 [LIVE] Found exact live page element: ${className}`);
      return true;
    }

    // 카드 뷰 시청자 수 클래스 확인 (높은 우선순위)
    if (className.includes('thumbnail_badge_container__sMIz3')) {
      // LIVE 배지가 아닌 경우만
      if (!this.isLiveIndicator(element)) {
        window.ChzzkLogger?.debug(`📺 [CARD] Found card viewer element: ${className}`);
        return true;
      }
    }

    // LNB 시청자 수 클래스 확인
    if (className.includes('navigator_count__kpr6-') ||
        className.includes('navigator_count__db5Av') ||
        className.includes('home_recommend_live_count__7Or3N')) {
      window.ChzzkLogger?.debug(`📊 [LNB] Found LNB viewer element: ${className}`);
      return true;
    }

    // 일반 클래스 기반 확인
    if (className.includes('count') || 
        className.includes('viewer') || 
        className.includes('badge') ||
        className.includes('information_data') ||
        className.includes('information_row')) {
      return true;
    }

    // 텍스트 패턴 기반 확인 (통합 강화)
    if (/\d+.*명/.test(text) || /\d+.*시청/.test(text) || /^\d{1,3}(,\d{3})*$/.test(text)) {
      // 라이브 컨테이너 내부인지 확인
      const isInLiveContainer = element.closest('[class*="video_information_data"]') ||
                               element.closest('.video_information_row__HrQ0z') ||
                               element.closest('[class*="video_information"]');
      
      if (isInLiveContainer) {
        window.ChzzkLogger?.debug(`🎯 [LIVE] Found viewer text in live container: "${text}"`);
        return true;
      }

      // 카드 뷰 컨테이너 내부인지 확인  
      const isInCardContainer = element.closest('.video_card_container__urjO6') ||
                               element.closest('.video_card_description__2sUfw') ||
                               element.closest('[class*="video_card"]');
                               
      if (isInCardContainer) {
        window.ChzzkLogger?.debug(`📺 [CARD] Found viewer text in card container: "${text}"`);
        return true;
      }

      // LNB 컨테이너 내부인지 확인
      const isInLNBContainer = element.closest('[class*="navigator"]') ||
                              element.closest('[class*="navigation_bar"]') ||
                              element.closest('[class*="home_recommend"]');
                              
      if (isInLNBContainer) {
        window.ChzzkLogger?.debug(`📊 [LNB] Found viewer text in LNB container: "${text}"`);
        return true;
      }
      
      return true; // 기본적으로 시청자 패턴이면 잠재적 요소로 간주
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
