/**
 * 치지직 사이드바 셔플러 - 메인 컨트롤러
 * 모든 모듈을 통합하고 초기화하는 메인 진입점
 * @version 1.2
 */

(function() {
  'use strict';

  // 전역 상태 관리
  let initialized = false;
  let currentPageType = 'unknown';
  let observer = null;

  // 페이지 타입 감지 (모든 치지직 페이지 지원)
  function getCurrentPageType() {
    const path = window.location.pathname;
    if (path === '/' || path.startsWith('/home')) return 'main';
    if (path.startsWith('/following')) return 'following';
    if (path.startsWith('/live/')) return 'live';
    
    // 모든 치지직 페이지에서 LNB 셔플 지원
    // 카테고리, 검색, 게임 등 모든 페이지
    return 'universal';
  }

  // 안전한 초기화 래퍼 (강화된 오류 처리)
  function safeInitialize() {
    if (initialized) {
      window.ChzzkLogger?.warn('⚠️ Already initialized, skipping duplicate initialization');
      return;
    }

    try {
      window.ChzzkLogger?.info('🚀 [INIT] Starting enhanced Chzzk Sidebar Shuffler initialization...');
      
      // 의존성 확인
      const requiredModules = ['ChzzkLogger', 'ChzzkSettings', 'ChzzkViewerCount', 'ChzzkMoreButton', 'ChzzkShuffle'];
      const missingModules = requiredModules.filter(module => !window[module]);
      
      if (missingModules.length > 0) {
        console.error('❌ [INIT] Missing required modules:', missingModules);
        
        // 재시도 메커니즘
        setTimeout(() => {
          window.ChzzkLogger?.warn('🔄 [INIT] Retrying initialization...');
          safeInitialize();
        }, 2000);
        return;
      }

      // 설정 로드 및 초기화
      initializeExtension();
      
    } catch (error) {
      window.ChzzkLogger?.error('💥 [INIT] Critical error during initialization:', error);
      
      // 복구 모드 활성화
      activateRecoveryMode(error);
    }
  }

  // 복구 모드 - 기본 기능이라도 작동시키기
  function activateRecoveryMode(error) {
    window.ChzzkLogger?.error('🚨 [RECOVERY] Activating recovery mode due to error:', error);
    
    try {
      // 최소한의 기능만 활성화
      if (window.ChzzkViewerCount) {
        window.ChzzkViewerCount.scheduleUpdate();
        window.ChzzkLogger?.info('✅ [RECOVERY] Viewer count hiding activated');
      }
      
      // 간단한 오류 보고
      if (typeof window.ChzzkSettings?.get === 'function') {
        window.ChzzkLogger?.warn('🔧 [RECOVERY] Partial functionality restored');
      }
      
    } catch (recoveryError) {
      window.ChzzkLogger?.error('💥 [RECOVERY] Recovery mode also failed:', recoveryError);
      console.error('Chzzk Sidebar Shuffler: Complete failure, all systems down');
    }
  }

  // 확장 프로그램 초기화
  async function initializeExtension() {
    try {
      // 1. 설정 로드
      await window.ChzzkSettings.load();
      window.ChzzkLogger?.info('⚙️ Settings loaded successfully');

      // 2. 설정 변경 감지 등록
      window.ChzzkSettings.onChange((changes) => {
        window.ChzzkLogger?.info('🔄 Settings changed:', changes);
        
        // 시청자 수 설정 변경 시 즉시 적용
        if (changes.hideViewerCount !== undefined) {
          window.ChzzkViewerCount.scheduleUpdate();
        }
        
        // 셔플 설정 변경은 다음 셔플 시 적용
        if (changes.enableShuffle !== undefined) {
          window.ChzzkLogger?.info(`🎲 Shuffle setting changed to: ${changes.enableShuffle}`);
        }
      });

      // 3. 페이지 타입별 초기화
      currentPageType = getCurrentPageType();
      await initializeByPageType(currentPageType);

      // 4. URL 변경 감지 설정
      setupUrlChangeDetection();

      // 5. 전역 함수 등록
      registerGlobalFunctions();

      initialized = true;
      window.ChzzkLogger?.info('✅ Chzzk Sidebar Shuffler initialized successfully');

    } catch (error) {
      window.ChzzkLogger?.error('❌ Error during extension initialization:', error);
    }
  }

  // 페이지 타입별 초기화
  async function initializeByPageType(pageType) {
    window.ChzzkLogger?.info(`🚀 Initializing for page type: ${pageType}`);
    
    // 모든 페이지에서 즉시 시청자 수 설정 적용
    window.ChzzkViewerCount.scheduleUpdate();

    switch (pageType) {
      case 'main':
        await initializeMainPage();
        break;
        
      case 'following':
        await initializeFollowingPage();
        break;
        
      case 'live':
        await initializeLivePage();
        break;
        
      case 'universal':
        await initializeUniversalPage();
        break;
        
      default:
        window.ChzzkLogger?.info('ℹ️ Unknown page type, applying basic functionality only');
        // 기본 기능만 적용 (시청자 수 숨기기)
        window.ChzzkViewerCount.scheduleUpdate();
        break;
    }
  }

  // 메인 페이지 초기화
  async function initializeMainPage() {
    window.ChzzkLogger?.info('🏠 Initializing main page features');
    
    // 동적 로딩 감지 후 셔플 실행
    window.ChzzkShuffle.waitForDynamicLoading((list, items, reason) => {
      window.ChzzkLogger?.info(`🎯 Main page dynamic loading completed: ${items?.length || 0} channels (reason: ${reason})`);
      
      if (items && items.length > 0) {
        window.ChzzkLogger?.info(`✅ Main page: Found ${items.length} channels, executing shuffle`);
        window.ChzzkShuffle.executeShuffle(list, items);
        setupChangeObserver();
      } else {
        window.ChzzkLogger?.warn('⚠️ Main page: No channels found after dynamic loading');
      }
    });
  }

  // 팔로잉 페이지 초기화 (점진적 셔플 지원)
  async function initializeFollowingPage() {
    window.ChzzkLogger?.info('👥 Initializing following page features (progressive shuffle)');
    
    // 점진적 셔플: 초기 로드된 채널만 먼저 셔플
    window.ChzzkShuffle.waitForDynamicLoading((list, items, reason) => {
      window.ChzzkLogger?.info(`🎯 Following page initial loading completed: ${items?.length || 0} channels (reason: ${reason})`);
      
      if (items && items.length > 0) {
        window.ChzzkLogger?.info(`✅ Following page: Found ${items.length} initial channels, executing initial shuffle`);
        
        // 1. 초기 채널들만 셔플 (더보기 클릭 전 상태)
        window.ChzzkShuffle.executeShuffle(list, items);
        
        // 2. 더보기 버튼 점진적 로딩 지원 설정
        setupProgressiveLoadingSupport(list);
        
        // 3. DOM 변경 감지 설정
        setupChangeObserver();
        
        window.ChzzkLogger?.info('🔧 Following page: 점진적 셔플 시스템 준비 완료');
      } else {
        window.ChzzkLogger?.warn('⚠️ Following page: No initial channels found');
      }
    }, 8000); // 초기 로딩은 8초만 대기 (점진적이므로 더 짧게)
  }

  // 라이브 페이지 초기화
  async function initializeLivePage() {
    window.ChzzkLogger?.info('📺 Initializing live page features');
    
    // 라이브 페이지에서도 사이드바 셔플 지원
    window.ChzzkShuffle.waitForDynamicLoading((list, items, reason) => {
      window.ChzzkLogger?.info(`🎯 Live page dynamic loading completed: ${items?.length || 0} channels (reason: ${reason})`);
      
      if (items && items.length > 0) {
        window.ChzzkLogger?.info(`✅ Live page: Found ${items.length} channels, executing shuffle`);
        window.ChzzkShuffle.executeShuffle(list, items);
        setupChangeObserver();
      } else {
        window.ChzzkLogger?.warn('⚠️ Live page: No channels found after dynamic loading');
      }
    }, 10000);

    // 라이브 페이지 전용 시청자 수 모니터링 강화
    setupLivePageMonitoring();
  }

  // 라이브 페이지 전용 모니터링 (강화된 버전)
  function setupLivePageMonitoring() {
    window.ChzzkLogger?.info('🔧 Setting up enhanced live page monitoring');
    
    // 라이브 페이지는 실시간 업데이트가 빈번하므로 더 적극적인 모니터링
    const liveMonitorInterval = setInterval(() => {
      if (window.ChzzkSettings?.get('hideViewerCount')) {
        // 라이브 페이지 메인 시청자 수 (강화된 셀렉터)
        const mainViewerSelectors = [
          // 기본 셀렉터
          '.live_information_player__lYPjg [class*="video_information_count"]',
          '.live_information_player__lYPjg strong',
          '.video_information_count__VdSfG',
          
          // 추가 강화 셀렉터
          '.live_information_player__lYPjg [class*="count"]',
          '[class*="live_information"] [class*="count"]',
          '[class*="video_information"] strong',
          '.live_information_text__TyGBp strong',
          '.video_information_text__+uTx5 strong',
          
          // 더 넓은 범위
          '.live_information_player__lYPjg span:not([class*="title"]):not([class*="name"])',
          '.live_information_player__lYPjg em:not([class*="title"]):not([class*="name"])'
        ];

        let hiddenCount = 0;
        mainViewerSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              // 시청자 수 패턴 확인
              const text = el.textContent?.trim() || '';
              const isViewerCount = /^\d{1,3}(,\d{3})*$|^\d+\.?\d*[만천백십kmb]?$/i.test(text);
              
              if (isViewerCount && !el.classList.contains('chzzk-viewer-hidden')) {
                // 제목이나 스트리머 이름이 아닌지 확인
                const isNotTitle = !el.closest('[class*="title"]') && 
                                 !el.closest('[class*="name"]') &&
                                 !text.includes('LIVE') && 
                                 !text.includes('라이브');
                
                if (isNotTitle) {
                  window.ChzzkViewerCount.hideElement(el);
                  hiddenCount++;
                  window.ChzzkLogger?.debug(`🎯 [LIVE] Hidden viewer count: "${text}" (${selector})`);
                }
              }
            });
          } catch (error) {
            window.ChzzkLogger?.warn(`❌ Error with live selector ${selector}:`, error);
          }
        });

        if (hiddenCount > 0) {
          window.ChzzkLogger?.debug(`🎯 [LIVE] Total hidden ${hiddenCount} main viewer count elements`);
        }
      }
    }, 300); // 0.3초마다 모니터링 (더 빈번하게)

    // 페이지 이동 시 정리
    const cleanup = () => {
      clearInterval(liveMonitorInterval);
    };

    // URL 변경 시 정리
    window.addEventListener('beforeunload', cleanup);
    
    // Pushstate/popstate 이벤트에서도 정리
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      cleanup();
      return originalPushState.apply(this, args);
    };
  }

  // URL 변경 감지 설정
  function setupUrlChangeDetection() {
    let lastUrl = window.location.href;
    let lastPageType = currentPageType;

    const checkUrlChange = () => {
      const currentUrl = window.location.href;
      const newPageType = getCurrentPageType();

      if (currentUrl !== lastUrl || newPageType !== lastPageType) {
        window.ChzzkLogger?.info(`🔄 URL changed: ${lastPageType} → ${newPageType}`);
        
        // 이전 페이지 상태 정리
        cleanupPreviousPage();
        
        // 새 페이지 초기화
        currentPageType = newPageType;
        lastPageType = newPageType;
        lastUrl = currentUrl;
        
        // 약간의 지연 후 새 페이지 초기화
        setTimeout(() => {
          initializeByPageType(newPageType);
        }, 500);
      }
    };

    // Pushstate와 popstate 이벤트 감지
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      const result = originalPushState.apply(this, args);
      setTimeout(checkUrlChange, 100);
      return result;
    };

    window.addEventListener('popstate', () => {
      setTimeout(checkUrlChange, 100);
    });

    // 주기적 URL 체크 (백업)
    setInterval(checkUrlChange, 2000);
  }

  // 이전 페이지 정리
  function cleanupPreviousPage() {
    // 셔플 상태 초기화
    if (window.ChzzkShuffle) {
      window.ChzzkShuffle.reset();
    }

    // 더보기 버튼 상태 초기화
    if (window.ChzzkMoreButton) {
      window.ChzzkMoreButton.reset();
    }

    // 옵저버 정리
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    window.ChzzkLogger?.debug('🧹 Previous page cleaned up');
  }

  // DOM 변경 감지 설정
  function setupChangeObserver() {
    if (observer) {
      observer.disconnect();
    }

    let updateTimeout = null; // 지역 변수로 변경

    observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        // 새로운 채널이 추가되었는지 확인
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 채널 관련 요소가 추가되었는지 확인
              const hasChannelContent = node.querySelector && (
                node.querySelector('a[href*="/live/"]') ||
                node.querySelector('a[href*="/channel/"]') ||
                node.matches && (
                  node.matches('.navigator_item__mH4JG') ||
                  node.matches('.navigator_item__qXlq9')
                )
              );

              if (hasChannelContent) {
                shouldUpdate = true;
                break;
              }
            }
          }
        }
      });

      // 디바운스된 업데이트
      if (shouldUpdate) {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          window.ChzzkViewerCount.scheduleUpdate();
        }, 200);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.ChzzkLogger?.debug('👁️ DOM change observer set up');
  }

  // 범용 페이지 초기화 (모든 치지직 페이지)
  async function initializeUniversalPage() {
    window.ChzzkLogger?.info('🌐 Initializing universal page features (all chzzk pages)');
    
    // 모든 페이지에서 LNB 셔플 지원
    window.ChzzkShuffle.waitForDynamicLoading((list, items, reason) => {
      window.ChzzkLogger?.info(`🎯 Universal page dynamic loading completed: ${items?.length || 0} channels (reason: ${reason})`);
      
      if (items && items.length > 0) {
        window.ChzzkLogger?.info(`✅ Universal page: Found ${items.length} channels, executing shuffle`);
        
        // LNB 채널 셔플 실행
        window.ChzzkShuffle.executeShuffle(list, items);
        
        // 점진적 로딩 지원 설정
        setupProgressiveLoadingSupport(list);
        
        // DOM 변경 감지 설정
        setupChangeObserver();
        
        window.ChzzkLogger?.info('🔧 Universal page: LNB 셔플 시스템 준비 완료');
      } else {
        window.ChzzkLogger?.info('ℹ️ Universal page: No channels found, applying viewer count settings only');
      }
    }, 6000); // 범용 페이지는 6초 대기
  }

  // 점진적 로딩 지원 설정
  function setupProgressiveLoadingSupport(list) {
    window.ChzzkLogger?.info('🔧 Setting up progressive loading support...');
    
    // 더보기 버튼을 찾아서 점진적 셔플 지원 설정
    const moreButton = document.querySelector('.navigation_bar_more_button__7DoyA');
    if (moreButton) {
      window.ChzzkLogger?.info('✅ Found more button, setting up progressive shuffle support');
      window.ChzzkMoreButton.enhanceOriginal(moreButton, list);
    } else {
      window.ChzzkLogger?.info('ℹ️ No more button found initially, will monitor for it');
      
      // 더보기 버튼이 나중에 나타날 수 있으므로 모니터링
      const buttonObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const addedButton = document.querySelector('.navigation_bar_more_button__7DoyA');
            if (addedButton && !addedButton.hasAttribute('data-shuffle-enhanced')) {
              window.ChzzkLogger?.info('🎯 More button appeared, setting up progressive shuffle support');
              window.ChzzkMoreButton.enhanceOriginal(addedButton, list);
              buttonObserver.disconnect();
            }
          }
        });
      });
      
      buttonObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // 5초 후 옵저버 정리 (메모리 누수 방지)
      setTimeout(() => {
        buttonObserver.disconnect();
      }, 5000);
    }
  }

  // 전역 함수 등록 (팝업에서 사용)
  function registerGlobalFunctions() {
    // 팝업에서 호출할 수 있는 메인 셔플 함수
    window.shuffleSidebar = () => {
      window.ChzzkLogger?.shuffle('🎯 Global shuffleSidebar function called from popup');
      
      if (!window.ChzzkSettings?.get('enableShuffle')) {
        window.ChzzkLogger?.info('🚫 Shuffle disabled by user setting in global function');
        return;
      }
      
      // 충분한 아이템이 로드될 때까지 대기 후 셔플 실행
      waitUntilEnoughItems(8, (list, items) => {
        window.ChzzkLogger?.shuffle('🎯 Global shuffleSidebar callback executed');
        if (list && items) {
          window.ChzzkShuffle.executeShuffle(list, items, true); // 강제 셔플로 실행
        }
      });
    };

    window.ChzzkLogger?.info('🔧 Global functions registered');
  }

  // 충분한 아이템이 로드될 때까지 대기
  function waitUntilEnoughItems(minCount, callback, attempt = 0, maxAttempts = 8) {
    const callbackId = `callback_${Date.now()}_${Math.random()}`;
    
    if (window.ChzzkShuffle.activeCallbacks?.has(callbackId)) {
      window.ChzzkLogger?.warn(`⚠️ Duplicate callback detected: ${callbackId}, skipping`);
      return;
    }
    
    if (window.ChzzkShuffle.activeCallbacks) {
      window.ChzzkShuffle.activeCallbacks.add(callbackId);
    }

    try {
      const { list, items } = window.ChzzkShuffle.findChannelsList();
      const allChannelItems = window.ChzzkShuffle.findChannelItems(list || document);
      const totalItems = Math.max(items.length, allChannelItems.length);

      window.ChzzkLogger?.debug(`📊 Item check [Attempt ${attempt + 1}]: ${totalItems}/${minCount} items`);

      if (totalItems >= minCount || attempt >= maxAttempts) {
        // 콜백 실행
        if (typeof callback === 'function') {
          try {
            callback(list, allChannelItems);
          } catch (callbackError) {
            window.ChzzkLogger?.error(`❌ Error in callback execution [ID: ${callbackId}]:`, callbackError);
          } finally {
            if (window.ChzzkShuffle.activeCallbacks) {
              window.ChzzkShuffle.activeCallbacks.delete(callbackId);
            }
          }
        }
      } else {
        // 재시도
        setTimeout(() => {
          waitUntilEnoughItems(minCount, callback, attempt + 1, maxAttempts);
        }, 1000);
      }
    } catch (error) {
      window.ChzzkLogger?.error(`💥 Error in waitUntilEnoughItems [Attempt ${attempt + 1}]:`, error);
      if (window.ChzzkShuffle.activeCallbacks) {
        window.ChzzkShuffle.activeCallbacks.delete(callbackId);
      }
    }
  }

  // 초기화 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInitialize);
  } else {
    safeInitialize();
  }

})();