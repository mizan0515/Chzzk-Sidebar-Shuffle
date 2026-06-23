/**
 * 치지직 사이드바 셔플러 - 메인 컨트롤러
 * 모든 모듈을 통합하고 초기화하는 메인 진입점
 * @version 1.4.3
 */

(function() {
  'use strict';

  // 전역 상태 관리
  let initialized = false;
  let currentPageType = 'unknown';
  let observer = null;
  let changeObserverCleanup = null;
  let wideModeState = {
    isWideMode: false,
    lastStateChange: 0,
    lnbElementsPresent: true,
    preservedShuffleState: null
  };

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

  /**
   * 와이드모드 상태 감지 함수 (실제 치지직 사이트 구조 기반)
   * @returns {Object} 와이드모드 상태 정보
   */
  function detectWideModeState() {
    window.ChzzkLogger?.debug('🔍 [CHZZK] detectWideModeState() 시작');
    try {
      // 1. 실제 치지직 LNB 요소들의 존재 여부 확인 (실제 HTML 구조 기반)
      const lnbElements = {
        // 실제 HTML에서 확인된 정확한 클래스명들
        asideContainer: document.querySelector('.aside_container__R9MN6'),
        asideContent: document.querySelector('.aside_content__j2eTE'),
        navigationBarSection: document.querySelector('.navigation_bar_section__hDpyD'),
        navigationBarList: window.ChzzkDom?.safeQuery(document, '[class*="navigation_bar_list"]'),

        // 치지직 전용 요소들
        navigatorItem: document.querySelector('.navigator_item__mH4JG'),
        navigationBarItem: document.querySelector('.navigation_bar_item__4OS5Z'),

        // 폴백 셀렉터들 (채팅창 제외)
        anyAside: document.querySelector('aside:not([class*="chatting"]):not([class*="chat"])'),
        anyNav: document.querySelector('nav'),
        anyNavigation: document.querySelector('[class*="navigation_bar"]')
      };

      const lnbPresent = Object.values(lnbElements).some(el => el !== null);

      window.ChzzkLogger?.debug('🔍 [CHZZK] LNB 요소 찾기 결과:', {
        lnbPresent: lnbPresent,
        foundElements: Object.entries(lnbElements).filter(([key, el]) => el !== null).map(([key]) => key),
        detailedElements: Object.entries(lnbElements).reduce((acc, [key, el]) => {
          acc[key] = el ? `${el.tagName}.${el.className}` : null;
          return acc;
        }, {})
      });

      // 2. 실제 치지직 와이드모드 감지 로직 개선
      const wideModeIndicators = {
        // 실제 치지직 body/html 클래스 체크 (더 구체적)
        hasWideModeClass: (() => {
          const bodyClasses = Array.from(document.body.classList);
          const htmlClasses = Array.from(document.documentElement.classList);
          const allClasses = [...bodyClasses, ...htmlClasses];

          return allClasses.some(cls =>
            cls.includes('theater') ||
            cls.includes('wide') ||
            cls.includes('fullscreen') ||
            cls.includes('cinema') ||
            cls.includes('expanded')
          );
        })(),

        // LNB 실제 숨김/표시 상태 체크 (실제 구조 기반)
        lnbActuallyHidden: (() => {
          // 실제 HTML 구조에서 중요한 요소들 순서대로 체크
          const lnb = lnbElements.asideContainer ||
                     lnbElements.asideContent ||
                     lnbElements.navigationBarList ||
                     lnbElements.anyAside;

          if (!lnb) {
            window.ChzzkLogger?.debug('🔍 [CHZZK] lnbActuallyHidden: LNB 요소 없음 → true');
            return true; // LNB가 없으면 숨겨진 것으로 판단
          }

          const style = getComputedStyle(lnb);
          const isHidden = style.display === 'none' ||
                          style.visibility === 'hidden' ||
                          style.opacity === '0' ||
                          lnb.offsetWidth === 0 ||
                          lnb.offsetHeight === 0;

          window.ChzzkLogger?.debug('🔍 [CHZZK] lnbActuallyHidden 체크:', {
            element: `${lnb.tagName}.${lnb.className}`,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            offsetWidth: lnb.offsetWidth,
            offsetHeight: lnb.offsetHeight,
            isHidden: isHidden
          });

          // 부모 요소도 체크 (aside가 숨겨질 수 있음)
          let parent = lnb.parentElement;
          let parentHidden = false;
          while (parent && parent !== document.body) {
            const parentStyle = getComputedStyle(parent);
            if (parentStyle.display === 'none' ||
                parentStyle.visibility === 'hidden' ||
                parentStyle.opacity === '0') {
              window.ChzzkLogger?.debug('🔍 [CHZZK] lnbActuallyHidden: 부모 요소 숨김 발견:', {
                parentTag: parent.tagName,
                parentClass: parent.className,
                display: parentStyle.display,
                visibility: parentStyle.visibility,
                opacity: parentStyle.opacity
              });
              parentHidden = true;
              break;
            }
            parent = parent.parentElement;
          }

          const finalResult = isHidden || parentHidden;
          window.ChzzkLogger?.debug('🔍 [CHZZK] lnbActuallyHidden 최종 결과:', finalResult);
          return finalResult;
        })(),

        // 메인 콘텐츠 영역이 전체 너비를 차지하는지 체크
        contentFullWidth: (() => {
          // 치지직의 실제 메인 콘텐츠 셀렉터들
          const contentSelectors = [
            'main',
            '[class*="content"]',
            '[class*="player"]',
            '[class*="live"]',
            '.live_information_player__lYPjg', // 실제 치지직 플레이어 클래스
            '[class*="video"]'
          ];

          let isFullWidth = false;
          contentSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
              const rect = element.getBoundingClientRect();
              // 90% 이상이면 풀 너비로 판단
              if (rect.width > window.innerWidth * 0.9) {
                isFullWidth = true;
              }
            }
          });

          return isFullWidth;
        })(),

        // 치지직 특정 레이아웃 클래스 감지
        hasTheaterLayout: document.querySelector('[class*="theater"], [class*="cinema"], [class*="wide_mode"]') !== null
      };

      // 3. URL 기반 감지 (개선)
      const urlIndicators = {
        isLivePage: window.location.pathname.startsWith('/live/'),
        hasTheaterParam: (() => {
          const url = window.location.href;
          const search = window.location.search;
          const hash = window.location.hash;

          return search.includes('theater') ||
                 search.includes('wide') ||
                 search.includes('cinema') ||
                 hash.includes('theater') ||
                 hash.includes('wide') ||
                 url.includes('mode=theater') ||
                 url.includes('mode=wide');
        })()
      };

      // 4. 플레이어 상태 기반 감지 (실제 치지직 구조)
      const playerIndicators = {
        // 실제 치지직 플레이어 클래스들 (더 보수적으로)
        hasWidePlayer: (() => {
          const playerSelectors = [
            '.live_information_player__lYPjg', // 실제 확인된 클래스
            '[class*="player"][class*="wide"]',
            '[class*="player"][class*="theater"]',
            '[class*="player"][class*="full"]',
            '[class*="video"][class*="wide"]'
          ];

          let hasWide = false;
          playerSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
              const rect = element.getBoundingClientRect();
              // 플레이어가 화면 너비의 95% 이상을 차지하면 와이드모드
              if (rect.width > window.innerWidth * 0.95) {
                hasWide = true;
              }
            }
          });

          return hasWide;
        })(),

        // 극장모드 버튼 상태 체크
        theaterButtonActive: (() => {
          // 치지직의 극장모드 버튼 찾기
          const buttons = document.querySelectorAll('button, [role="button"]');
          for (const button of buttons) {
            const text = button.textContent || '';
            const title = button.title || '';
            const ariaLabel = button.getAttribute('aria-label') || '';

            if (text.includes('극장') || text.includes('theater') ||
                title.includes('극장') || title.includes('theater') ||
                ariaLabel.includes('극장') || ariaLabel.includes('theater')) {

              // 버튼이 활성 상태인지 확인
              return button.classList.contains('active') ||
                     button.classList.contains('pressed') ||
                     button.getAttribute('aria-pressed') === 'true';
            }
          }
          return false;
        })()
      };

      // 5. 종합 판단 (더 엄격한 로직 - 가중치 조정)
      const indicators = [
        { name: 'lnbAbsent', value: !lnbPresent, weight: 50 },           // 가장 확실한 지표
        { name: 'lnbHidden', value: wideModeIndicators.lnbActuallyHidden, weight: 40 }, // 두 번째로 확실
        { name: 'theaterButton', value: playerIndicators.theaterButtonActive, weight: 30 }, // 버튼 상태
        { name: 'wideModeClass', value: wideModeIndicators.hasWideModeClass, weight: 25 }, // CSS 클래스
        { name: 'widePlayer', value: playerIndicators.hasWidePlayer, weight: 20 },      // 플레이어 크기
        { name: 'contentFullWidth', value: wideModeIndicators.contentFullWidth, weight: 15 }, // 콘텐츠 크기
        { name: 'theaterLayout', value: wideModeIndicators.hasTheaterLayout, weight: 10 }, // 레이아웃
        { name: 'urlIndicator', value: urlIndicators.isLivePage && urlIndicators.hasTheaterParam, weight: 5 } // URL
      ];

      // 각 지표의 상세 값들을 로깅
      window.ChzzkLogger?.debug('📊 [CHZZK] 각 지표 상세 값:', {
        lnbPresent: lnbPresent,
        wideModeIndicators: wideModeIndicators,
        urlIndicators: urlIndicators,
        playerIndicators: playerIndicators
      });

      const totalScore = indicators.reduce((sum, indicator) => {
        return sum + (indicator.value ? indicator.weight : 0);
      }, 0);

      const isWideMode = totalScore >= 40; // 40점 이상이면 와이드모드로 판단 (더 엄격하게)

      const activeIndicators = indicators.filter(ind => ind.value);
      const inactiveIndicators = indicators.filter(ind => !ind.value);

      window.ChzzkLogger?.debug(`🔍 [CHZZK] detectWideModeState() 결과: 와이드모드=${isWideMode}, 점수=${totalScore}/100, LNB존재=${lnbPresent}`);
      window.ChzzkLogger?.debug('✅ [CHZZK] 활성 지표들:', activeIndicators.map(ind => `${ind.name}(${ind.weight}점)`).join(', '));
      window.ChzzkLogger?.debug('비활성 지표들:', inactiveIndicators.map(ind => `${ind.name}(${ind.weight}점)`).join(', '));

      return {
        isWideMode: isWideMode,
        lnbPresent: lnbPresent,
        confidence: totalScore,
        indicators: {
          lnbElements: lnbElements,
          wideModeIndicators: wideModeIndicators,
          urlIndicators: urlIndicators,
          playerIndicators: playerIndicators,
          scoreBreakdown: indicators.map(ind => ({
            name: ind.name,
            value: ind.value,
            weight: ind.weight,
            score: ind.value ? ind.weight : 0
          }))
        },
        debugInfo: {
          lnbElementsFound: Object.entries(lnbElements).filter(([key, el]) => el !== null).map(([key]) => key),
          bodyClasses: Array.from(document.body.classList),
          htmlClasses: Array.from(document.documentElement.classList),
          currentUrl: window.location.href,
          totalScore: totalScore,
          threshold: 40,
          detailedScores: indicators.reduce((acc, ind) => {
            acc[ind.name] = { active: ind.value, weight: ind.weight, score: ind.value ? ind.weight : 0 };
            return acc;
          }, {})
        }
      };

    } catch (error) {
      window.ChzzkLogger?.error('❌ Error detecting wide mode state:', error);
      return {
        isWideMode: false,
        lnbPresent: true,
        confidence: 0,
        error: error.message
      };
    }
  }


  /**
   * 와이드모드 상태 변화 감지 및 처리
   */
  function handleWideModeStateChange() {
    const currentState = detectWideModeState();
    const previousWideMode = wideModeState.isWideMode;
    const previousLNBPresent = wideModeState.lnbElementsPresent;
    const now = Date.now();

    // 상태 변화 감지
    const wideModeChanged = previousWideMode !== currentState.isWideMode;
    const lnbPresenceChanged = previousLNBPresent !== currentState.lnbPresent;
    const anyChange = wideModeChanged || lnbPresenceChanged;

    if (anyChange && (now - wideModeState.lastStateChange) > 1000) { // 1초 디바운스

      // === 와이드모드 진입 감지 ===
      if (!previousWideMode && currentState.isWideMode) {
        window.ChzzkLogger?.warn('🎬 [WIDE MODE] 와이드모드 진입 감지!');
        window.ChzzkLogger?.info(`📊 [WIDE MODE] 점수: ${currentState.confidence}/100 (임계값: 40)`);

        // 상세한 점수 분석 로깅
        const activeIndicators = currentState.indicators.scoreBreakdown.filter(ind => ind.value);
        window.ChzzkLogger?.info('🏆 [WIDE MODE] 활성 지표들:', activeIndicators.map(ind => `${ind.name}(${ind.score}점)`).join(', '));

        window.ChzzkLogger?.debug('🔍 [WIDE MODE] 상세 분석:', {
          totalScore: currentState.debugInfo.totalScore,
          detailedScores: currentState.debugInfo.detailedScores,
          lnbElementsFound: currentState.debugInfo.lnbElementsFound,
          bodyClasses: currentState.debugInfo.bodyClasses,
          currentUrl: currentState.debugInfo.currentUrl
        });

        // 셔플 상태 보존
        if (window.ChzzkShuffle && typeof window.ChzzkShuffle.getShuffleState === 'function') {
          wideModeState.preservedShuffleState = window.ChzzkShuffle.getShuffleState();
          if (wideModeState.preservedShuffleState) {
            window.ChzzkLogger?.info('💾 [WIDE MODE] 셔플 상태 보존됨');
          }
        }
      }

      // === 와이드모드 복구 감지 ===
      else if (previousWideMode && !currentState.isWideMode) {
        window.ChzzkLogger?.warn('🎭 [WIDE MODE → NORMAL] 와이드모드에서 일반모드로 복구 감지!');
        window.ChzzkLogger?.info(`📊 [MODE TRANSITION] 점수: ${currentState.confidence}/100 (임계값: 40)`);
        window.ChzzkLogger?.info(`🔄 [MODE TRANSITION] 이전: 와이드모드 → 현재: 일반모드`);

        // 복구 시에도 상세 분석 로깅
        const activeIndicators = currentState.indicators.scoreBreakdown.filter(ind => ind.value);
        if (activeIndicators.length > 0) {
          window.ChzzkLogger?.info('🏆 [MODE TRANSITION] 남은 지표들:', activeIndicators.map(ind => `${ind.name}(${ind.score}점)`).join(', '));
        } else {
          window.ChzzkLogger?.info('✅ [MODE TRANSITION] 모든 와이드모드 지표 비활성화됨 - 완전한 일반모드 복구');
        }

        // 현재 설정 상태 로깅
        const isAutoShuffleEnabled = window.ChzzkSettings?.get('enableShuffle');
        window.ChzzkLogger?.info(`⚙️ [MODE TRANSITION] 현재 자동 셔플 설정: ${isAutoShuffleEnabled ? 'ON' : 'OFF'}`);

        // LNB 상태 확인
        const { list, items } = window.ChzzkShuffle ? window.ChzzkShuffle.findChannelsList() : { list: null, items: [] };
        window.ChzzkLogger?.info(`📋 [MODE TRANSITION] LNB 상태: list=${!!list}, items=${items?.length || 0}개`);

        if (list) {
          window.ChzzkLogger?.info(`🎯 [MODE TRANSITION] LNB 리스트 정보: ${list.className}, 자식수=${list.children.length}`);
        }

        window.ChzzkLogger?.debug('🔍 [MODE TRANSITION] 복구 상세:', {
          totalScore: currentState.debugInfo.totalScore,
          detailedScores: currentState.debugInfo.detailedScores,
          lnbElementsFound: currentState.debugInfo.lnbElementsFound,
          bodyClasses: currentState.debugInfo.bodyClasses,
          autoShuffleEnabled: isAutoShuffleEnabled,
          hasShuffleModule: !!window.ChzzkShuffle,
          listFound: !!list,
          itemCount: items?.length || 0
        });

        // 셔플 상태 복원 또는 새로운 셔플 시도 (단계적 재시도 + 더보기 버튼 자동 클릭)
        const attemptShuffle = (attempt = 1, maxAttempts = 5) => {
          window.ChzzkLogger?.info(`⏰ [SHUFFLE RECOVERY] 시도 ${attempt}/${maxAttempts} - 셔플 처리 시작`);

          // 필수 모듈 확인
          if (!window.ChzzkSettings) {
            window.ChzzkLogger?.error('❌ [SHUFFLE RECOVERY] ChzzkSettings 모듈이 없음');
            return;
          }

          if (!window.ChzzkShuffle) {
            window.ChzzkLogger?.error('❌ [SHUFFLE RECOVERY] ChzzkShuffle 모듈이 없음');
            return;
          }

          // enableShuffle 설정 확인
          const isAutoShuffleEnabled = window.ChzzkSettings.get('enableShuffle');
          window.ChzzkLogger?.info(`⚙️ [SHUFFLE RECOVERY] 자동 셔플 설정: ${isAutoShuffleEnabled ? 'ON' : 'OFF'}`);

          if (isAutoShuffleEnabled) {
            // 자동 셔플이 켜져있으면 항상 새로운 셔플 수행 (페이지 진입과 동일한 동작)
            window.ChzzkLogger?.info('🎲 [SHUFFLE RECOVERY] 자동 셔플 설정이 켜져있음 - 새로운 셔플 수행 시작');

            try {
              // 먼저 더보기 버튼 확인 및 자동 클릭
              const moreButton = window.ChzzkMoreButton?.findExpandButton?.();
              const isCollapsed = moreButton && moreButton.getAttribute('aria-expanded') === 'false';

              if (isCollapsed) {
                window.ChzzkLogger?.info('🔘 [SHUFFLE RECOVERY] 더보기 버튼이 접힌 상태 - 자동 클릭 실행');
                moreButton.click();

                // 더보기 버튼 클릭 후 충분한 시간 대기
                setTimeout(() => {
                  window.ChzzkLogger?.info('🔘 [SHUFFLE RECOVERY] 더보기 버튼 클릭 후 대기 완료 - 셔플 시작');
                  performShuffleAfterExpand(attempt, maxAttempts);
                }, 1500); // 1.5초 대기
                return;
              } else {
                window.ChzzkLogger?.info('🔘 [SHUFFLE RECOVERY] 더보기 버튼이 이미 펼쳐진 상태 - 바로 셔플 진행');
                performShuffleAfterExpand(attempt, maxAttempts);
              }

            } catch (error) {
              window.ChzzkLogger?.error('❌ [SHUFFLE RECOVERY] 새로운 셔플 실행 중 오류:', error);

              if (attempt < maxAttempts) {
                window.ChzzkLogger?.info(`🔄 [SHUFFLE RECOVERY] 오류 발생, ${1000 * attempt}ms 후 재시도`);
                setTimeout(() => attemptShuffle(attempt + 1, maxAttempts), 1000 * attempt);
              }
            }

            // 보존된 상태는 사용하지 않으므로 정리
            wideModeState.preservedShuffleState = null;

          } else {
            // 자동 셔플이 꺼져있으면 기존 상태 복원 시도
            window.ChzzkLogger?.info('🔄 [SHUFFLE RECOVERY] 자동 셔플 설정이 꺼져있음 - 기존 상태 복원 시도');

            if (wideModeState.preservedShuffleState &&
                window.ChzzkShuffle &&
                typeof window.ChzzkShuffle.restoreShuffleState === 'function') {

              window.ChzzkLogger?.info('🔄 [SHUFFLE RECOVERY] 보존된 셔플 상태로 복원 시도');
              const restored = window.ChzzkShuffle.restoreShuffleState(wideModeState.preservedShuffleState);
              if (restored) {
                window.ChzzkLogger?.info('♻️ [SHUFFLE RECOVERY] 셔플 상태 복원 성공');
                // 별표 버튼 재주입
                if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                  setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 300);
                }
              } else {
                window.ChzzkLogger?.warn('⚠️ [SHUFFLE RECOVERY] 셔플 상태 복원 실패, 새로 셔플 시도');
                const { list } = window.ChzzkShuffle.findChannelsList();
                if (list && list.children.length > 0) {
                  window.ChzzkShuffle.performShuffle(list, null, true);
                  window.ChzzkLogger?.info('🎯 [SHUFFLE RECOVERY] 복원 실패 후 새 셔플 완료');
                }
              }
              wideModeState.preservedShuffleState = null; // 사용 후 정리
            } else {
              window.ChzzkLogger?.warn('⚠️ [SHUFFLE RECOVERY] 복원할 셔플 상태가 없음');
              window.ChzzkLogger?.debug('🔍 [SHUFFLE RECOVERY] 상태 확인:', {
                hasPreservedState: !!wideModeState.preservedShuffleState,
                hasShuffleModule: !!window.ChzzkShuffle,
                hasRestoreFunction: !!(window.ChzzkShuffle && typeof window.ChzzkShuffle.restoreShuffleState === 'function')
              });
            }
          }
        };

        // 더보기 버튼 클릭 후 실제 셔플 수행하는 함수
        const performShuffleAfterExpand = (attempt, maxAttempts) => {
          const { list, items } = window.ChzzkShuffle.findChannelsList();
          window.ChzzkLogger?.info(`🔍 [SHUFFLE RECOVERY] 채널 리스트 검색 결과: list=${!!list}, items=${items?.length || 0}개`);

          if (list && list.children.length > 0) {
            window.ChzzkLogger?.info(`📋 [SHUFFLE RECOVERY] 리스트 상세: className="${list.className}", children=${list.children.length}개`);

            // 셔플 상태 초기화 후 새로운 셔플
            window.ChzzkLogger?.info('🔄 [SHUFFLE RECOVERY] 셔플 상태 초기화 중...');
            window.ChzzkShuffle.reset();

            window.ChzzkLogger?.info('🎯 [SHUFFLE RECOVERY] 새로운 셔플 실행 중...');
            window.ChzzkShuffle.performShuffle(list, null, true);

            window.ChzzkLogger?.info('✅ [SHUFFLE RECOVERY] 와이드모드 복구 후 새로운 셔플 완료');

            // 성공했으므로 시청자 수 숨기기도 적용
            if (window.ChzzkViewerCount) {
              setTimeout(() => {
                window.ChzzkViewerCount.scheduleUpdate();
                window.ChzzkLogger?.info('👁️ [SHUFFLE RECOVERY] 시청자 수 숨기기 설정 적용');
              }, 500);
            }

            // 별표 버튼 재주입 (DOM 재구성으로 사라졌을 수 있음)
            if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
              setTimeout(() => {
                window.ChzzkStar.injectAllStarButtons(list);
                window.ChzzkStar.startObserving();
              }, 300);
            }

          } else if (attempt < maxAttempts) {
            window.ChzzkLogger?.warn(`⚠️ [SHUFFLE RECOVERY] 시도 ${attempt}: 채널 목록이 준비되지 않음 - ${1000 * attempt}ms 후 재시도`);

            // 추가적인 디버깅: 다른 방법으로 LNB 찾기 시도
            const alternativeLists = window.ChzzkDom?.safeQueryAll(document, '[class*="navigation_bar_list"], .navigator_list__cHnuV') || [];
            window.ChzzkLogger?.info(`🔍 [SHUFFLE RECOVERY] 대체 검색 결과: ${alternativeLists.length}개 리스트 발견`);

            alternativeLists.forEach((altList, index) => {
              window.ChzzkLogger?.info(`📋 [SHUFFLE RECOVERY] 대체 리스트 ${index + 1}: className="${altList.className}", children=${altList.children.length}개`);
            });

            // 점진적으로 대기 시간 증가하여 재시도
            setTimeout(() => attemptShuffle(attempt + 1, maxAttempts), 1000 * attempt);
          } else {
            window.ChzzkLogger?.error(`❌ [SHUFFLE RECOVERY] ${maxAttempts}회 시도 후에도 채널 목록을 찾을 수 없음`);

            // 최종 시도: waitForDynamicLoading 사용
            window.ChzzkLogger?.info('🔄 [SHUFFLE RECOVERY] 최종 시도: 동적 로딩 대기 방식 사용');
            window.ChzzkShuffle.waitForDynamicLoading((list, items, reason) => {
              if (list && items && items.length > 0) {
                window.ChzzkLogger?.info(`✅ [SHUFFLE RECOVERY] 동적 로딩 후 셔플 성공: ${items.length}개 채널 (${reason})`);
                window.ChzzkShuffle.executeShuffle(list, items, true);
                // 별표 버튼 재주입
                if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                  setTimeout(() => window.ChzzkStar.injectAllStarButtons(list), 300);
                }
              } else {
                window.ChzzkLogger?.error('❌ [SHUFFLE RECOVERY] 동적 로딩으로도 채널을 찾을 수 없음');
              }
            }, 5000);
          }
        };

        // 첫 번째 시도는 2초 후에 시작
        setTimeout(() => attemptShuffle(1, 5), 2000);
      }

      // === LNB 요소 사라짐/복원 감지 (HTML에서 완전 제거/추가) ===
      if (lnbPresenceChanged) {
        if (previousLNBPresent && !currentState.lnbPresent) {
          window.ChzzkLogger?.error('🚨 [LNB] LNB 요소들이 HTML에서 완전히 사라짐! (DOM 제거)');
          window.ChzzkLogger?.debug('🔍 [LNB] 사라진 상태:', {
            foundElements: currentState.debugInfo.lnbElementsFound,
            bodyClasses: currentState.debugInfo.bodyClasses,
            url: currentState.debugInfo.currentUrl
          });
        } else if (!previousLNBPresent && currentState.lnbPresent) {
          window.ChzzkLogger?.info('🎉 [LNB] LNB 요소들이 HTML에 다시 추가됨! (DOM 복원)');
          window.ChzzkLogger?.debug('🔍 [LNB] 복원된 상태:', {
            foundElements: currentState.debugInfo.lnbElementsFound,
            bodyClasses: currentState.debugInfo.bodyClasses,
            url: currentState.debugInfo.currentUrl
          });
        }
      }

      // 상태 업데이트
      wideModeState.isWideMode = currentState.isWideMode;
      wideModeState.lnbElementsPresent = currentState.lnbPresent;
      wideModeState.lastStateChange = now;

      // 전체 상태 로깅 (변화 시에만)
      window.ChzzkLogger?.info(`📊 [STATE] 와이드모드: ${currentState.isWideMode ? 'ON' : 'OFF'}, LNB 존재: ${currentState.lnbPresent ? 'YES' : 'NO'}, 점수: ${currentState.confidence}/100`);
    }

    return currentState;
  }

  /**
   * 와이드모드 모니터링 시작
   */
  function startWideModeMonitoring() {
    // 기본 로깅 먼저 테스트
    window.ChzzkLogger?.debug('🎬 [CHZZK] startWideModeMonitoring() 함수 호출됨');

    try {
      // 초기 상태 설정
      window.ChzzkLogger?.debug('🔍 [CHZZK] detectWideModeState() 호출 중...');
      const initialState = detectWideModeState();
      window.ChzzkLogger?.debug('🔍 [CHZZK] detectWideModeState() 결과:', initialState);

      wideModeState.isWideMode = initialState.isWideMode;
      wideModeState.lnbElementsPresent = initialState.lnbPresent;
      wideModeState.lastStateChange = Date.now();

      window.ChzzkLogger?.debug(`🎬 [WIDE MODE] 모니터링 시작 - 초기 상태: ${initialState.isWideMode ? 'WIDE' : 'NORMAL'}, LNB: ${initialState.lnbPresent ? 'PRESENT' : 'ABSENT'}, 점수: ${initialState.confidence}/100`);

      // 초기 상태 상세 로깅
      if (initialState.confidence > 0) {
        const activeIndicators = initialState.indicators.scoreBreakdown.filter(ind => ind.value);
        window.ChzzkLogger?.debug('🎯 [WIDE MODE] 초기 활성 지표:', activeIndicators.map(ind => `${ind.name}(${ind.score}점)`).join(', '));
      }

      window.ChzzkLogger?.debug('⏰ [CHZZK] 주기적 모니터링 시작 (1초 간격)');

      // 주기적 모니터링 (1초 간격)
      const monitoringInterval = setInterval(() => {
        try {
          const currentState = handleWideModeStateChange();

          // 디버깅을 위한 상세 로깅 (5초마다)
          if (Date.now() % 5000 < 1000) {
            window.ChzzkLogger?.debug('🔍 [WIDE MODE] 현재 감지 상태:', {
              isWideMode: currentState?.isWideMode,
              score: currentState?.confidence,
              lnbPresent: currentState?.lnbPresent,
              activeIndicators: currentState?.indicators?.scoreBreakdown
                ?.filter(ind => ind.value)
                ?.map(ind => `${ind.name}(${ind.score})`) || []
            });
          }
        } catch (error) {
          console.error('❌ [WIDE MODE] 모니터링 오류:', error);
          window.ChzzkLogger?.error('❌ [WIDE MODE] 모니터링 오류:', error);
        }
      }, 1000);

      // 전역 참조 저장 (정리용)
      window.wideModeMonitoringInterval = monitoringInterval;

      // 즉시 키보드 이벤트 감지 (T키 - 극장 모드)
      document.addEventListener('keydown', (event) => {
        if (event.key === 't' || event.key === 'T') {
          window.ChzzkLogger?.debug('⌨️ [CHZZK] T키 감지 - 극장모드 토글 예상');
          // T키는 치지직에서 극장모드 토글 키
          setTimeout(() => {
            window.ChzzkLogger?.debug('⌨️ [CHZZK] T키 후 상태 체크 실행');
            handleWideModeStateChange();
          }, 500); // 키 입력 후 0.5초 뒤 상태 체크
        }
      });

      // 전체화면 전환 감지 (별표 버튼 복구용)
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          // 전체화면 해제 시 별표 버튼 재주입 + 와이드모드 상태 체크
          window.ChzzkLogger?.info('🖥️ [FULLSCREEN] 전체화면 해제 감지');
          setTimeout(() => {
            handleWideModeStateChange();
            if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
              window.ChzzkStar.injectAllStarButtons();
            }
          }, 1000);
        }
      });

      window.ChzzkLogger?.debug('🎬 [WIDE MODE] 모니터링 설정 완료 (1초 간격 + 키보드 + 전체화면 이벤트)');

    } catch (error) {
      console.error('❌ [CHZZK] startWideModeMonitoring 오류:', error);
      window.ChzzkLogger?.error('❌ [CHZZK] startWideModeMonitoring 오류:', error);
    }
  }

  // 안전한 초기화 래퍼 (강화된 오류 처리)
  function safeInitialize() {
    if (initialized) {
      window.ChzzkLogger?.warn('⚠️ Already initialized, skipping duplicate initialization');
      return;
    }

    try {
      window.ChzzkLogger?.info('🚀 [INIT] Starting enhanced Chzzk Sidebar Shuffler initialization...');
      registerGlobalFunctions();

      // 의존성 확인
      const requiredModules = ['ChzzkLogger', 'ChzzkSettings', 'ChzzkViewerCount', 'ChzzkMoreButton', 'ChzzkStar', 'ChzzkShuffle'];
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

      // 1.5 즐겨찾기 목록 로드
      if (window.ChzzkStar) {
        await window.ChzzkStar.load();
        ensureStarObservation(document, 0);
        window.ChzzkLogger?.info('⭐ Starred channels loaded');
      }

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

        if (changes.enableAutoExpand !== undefined) {
          if (changes.enableAutoExpand) {
            window.ChzzkMoreButton?.startAutoExpand?.();
          } else {
            window.ChzzkMoreButton?.stopAutoExpand?.();
          }
        }
      });

      // 3. 페이지 타입별 초기화
      currentPageType = getCurrentPageType();
      if (window.ChzzkSettings.get('enableAutoExpand')) {
        window.ChzzkMoreButton?.startAutoExpand?.();
      }
      await initializeByPageType(currentPageType);

      // 4. URL 변경 감지 설정
      setupUrlChangeDetection();

      // 5. 전역 함수 등록
      registerGlobalFunctions();

      // 6. 와이드모드 모니터링 시작
      window.ChzzkLogger?.debug('🚀 [CHZZK] 와이드모드 모니터링 시작 호출');
      startWideModeMonitoring();

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

  function ensureStarObservation(list = document, delay = 200) {
    if (!window.ChzzkStar || !window.ChzzkSettings?.get('enableStar')) return;
    setTimeout(() => {
      window.ChzzkStar.injectAllStarButtons(list || document);
      window.ChzzkStar.startObserving();
      document.documentElement?.setAttribute('data-chzzk-star-observer', 'ready');
    }, delay);
  }

  async function applyInitialChannelOrdering(list, items, reason = 'initial') {
    if (!window.ChzzkShuffle) return false;

    try {
      if (window.ChzzkSettings?.get('enableTierSort') && window.applyChzzkTierSort) {
        const applied = await window.applyChzzkTierSort({
          shuffleWithinTiers: !!window.ChzzkSettings?.get('enableShuffle'),
          reason
        });
        if (applied) return true;
      }
    } catch (error) {
      window.ChzzkLogger?.warn(`[TIER] Initial tier ordering failed (${reason}); falling back to legacy shuffle.`, error);
    }

    window.ChzzkShuffle.executeShuffle(list, items);
    return true;
  }

  // 메인 페이지 초기화
  async function initializeMainPage() {
    window.ChzzkLogger?.info('🏠 Initializing main page features');

    // 동적 로딩 감지 후 셔플 실행
    window.ChzzkShuffle.waitForDynamicLoading((list, items, reason) => {
      window.ChzzkLogger?.info(`🎯 Main page dynamic loading completed: ${items?.length || 0} channels (reason: ${reason})`);

      if (items && items.length > 0) {
        window.ChzzkLogger?.info(`✅ Main page: Found ${items.length} channels, applying preferred order`);
        applyInitialChannelOrdering(list, items, `main:${reason}`);
        // 별표 버튼 주입
        ensureStarObservation(list);
        setupChangeObserver();
      } else {
        window.ChzzkLogger?.warn('⚠️ Main page: No channels found after dynamic loading');
        ensureStarObservation(document);
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
        window.ChzzkLogger?.info(`✅ Following page: Found ${items.length} initial channels, applying preferred order`);

        // 1. 초기 채널들에 티어/즐겨찾기 우선 정렬 적용 (더보기 클릭 전 상태)
        applyInitialChannelOrdering(list, items, `following:${reason}`);

        // 1.5 별표 버튼 주입
        ensureStarObservation(list);

        // 2. 더보기 버튼 점진적 로딩 지원 설정
        setupProgressiveLoadingSupport(list);

        // 3. DOM 변경 감지 설정
        setupChangeObserver();

        window.ChzzkLogger?.info('🔧 Following page: 점진적 셔플 시스템 준비 완료');
      } else {
        window.ChzzkLogger?.warn('⚠️ Following page: No initial channels found');
        ensureStarObservation(document);
        setupChangeObserver();
        setTimeout(() => {
          const currentList = window.ChzzkShuffle?.findChannelsList?.();
          if (currentList?.list && currentList?.items?.length) {
            applyInitialChannelOrdering(currentList.list, currentList.items, 'following:late-list-retry');
            ensureStarObservation(currentList.list);
          }
        }, 1000);
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
        window.ChzzkLogger?.info(`✅ Live page: Found ${items.length} channels, applying preferred order`);
        applyInitialChannelOrdering(list, items, `live:${reason}`);
        // 별표 버튼 주입
        ensureStarObservation(list);
        setupChangeObserver();
      } else {
        window.ChzzkLogger?.warn('⚠️ Live page: No channels found, retrying...');
        ensureStarObservation(document);
        // 라이브 페이지에서는 사이드바 로딩이 늦을 수 있으므로 재시도
        retryShuffleForCurrentPage();
      }
    }, 10000);

    // 라이브 페이지 전용 시청자 수 모니터링 강화
    setupLivePageMonitoring();
  }

  // 채널 0개 시 재시도 (라이브/유니버설 페이지 등)
  function retryShuffleForCurrentPage(attempt = 1, maxAttempts = 3) {
    if (attempt > maxAttempts) {
      window.ChzzkLogger?.warn(`⚠️ [RETRY] ${maxAttempts}회 재시도 후에도 채널을 찾지 못함`);
      return;
    }

    const delay = 2000 * attempt;
    window.ChzzkLogger?.info(`🔄 [RETRY] ${delay}ms 후 셔플 재시도 (${attempt}/${maxAttempts})`);

    setTimeout(() => {
      if (!window.ChzzkShuffle) return;

      const { list, items } = window.ChzzkShuffle.findChannelsList();
      const allItems = window.ChzzkShuffle.findChannelItems(list || document);
      const channelItems = allItems.length > items.length ? allItems : items;

      if (list && channelItems.length > 0) {
        window.ChzzkLogger?.info(`✅ [RETRY] 재시도 성공: ${channelItems.length}개 채널 발견`);
        window.ChzzkShuffle.reset();
        applyInitialChannelOrdering(list, channelItems, `retry:${attempt}`);
        // 별표 버튼 주입
        ensureStarObservation(list);
        setupChangeObserver();
      } else {
        retryShuffleForCurrentPage(attempt + 1, maxAttempts);
      }
    }, delay);
  }

  // 라이브 페이지 전용 모니터링 (강화된 버전)
  function setupLivePageMonitoring() {
    window.ChzzkLogger?.info('🔧 Setting up enhanced live page monitoring');

    // 기존 라이브 페이지 모니터링이 있으면 정리
    if (window.livePageMonitorInterval) {
      clearInterval(window.livePageMonitorInterval);
      window.ChzzkLogger?.debug('🧹 Cleaned up existing live page monitor');
    }

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
          '[class*="video_information_text"] strong',

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

    // 전역 변수로 저장하여 페이지 이동 시에도 관리 가능
    window.livePageMonitorInterval = liveMonitorInterval;

    window.ChzzkLogger?.info('✅ Live page monitoring started and stored globally');
  }

  // URL 변경 감지 설정 (개선된 버전)
  function setupUrlChangeDetection() {
    let lastUrl = window.location.href;
    let lastPageType = currentPageType;

    const checkUrlChange = () => {
      const currentUrl = window.location.href;
      const newPageType = getCurrentPageType();

      if (currentUrl !== lastUrl || newPageType !== lastPageType) {
        window.ChzzkLogger?.info(`🔄 [URL CHANGE] ${lastUrl} → ${currentUrl}`);
        window.ChzzkLogger?.info(`🔄 [PAGE TYPE] ${lastPageType} → ${newPageType}`);

        if (newPageType !== lastPageType) {
          // 페이지 타입 변경 → 전체 재초기화 (기존 동작)
          cleanupPreviousPage();

          currentPageType = newPageType;
          lastPageType = newPageType;
          lastUrl = currentUrl;

          setTimeout(() => {
            window.ChzzkLogger?.info(`🔄 [PAGE INIT] Starting initialization for ${newPageType}`);

            if (window.wideModeMonitoringInterval) {
              window.ChzzkLogger?.info('🎬 [PAGE INIT] Wide mode monitoring is still active');
              handleWideModeStateChange();
            } else {
              window.ChzzkLogger?.warn('⚠️ [PAGE INIT] Wide mode monitoring was lost, restarting...');
              startWideModeMonitoring();
            }

            initializeByPageType(newPageType);
          }, 500);
        } else {
          // 같은 페이지 타입, URL만 변경 (예: /live/A → /live/B)
          // 셔플/별표 상태 보존, 경량 업데이트만 수행
          window.ChzzkLogger?.info(`🔄 [SAME TYPE] Same page type (${newPageType}), preserving shuffle and star state`);
          lastUrl = currentUrl;
          lastPageType = newPageType;

          // 시청자 수 숨기기 재적용
          if (window.ChzzkViewerCount) {
            window.ChzzkViewerCount.scheduleUpdate();
          }

          // 별표 버튼 새로고침 후 즐겨찾기 순서 보장 (SPA DOM 재활용 대응)
          if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
            setTimeout(() => {
              window.ChzzkStar.injectAllStarButtons();
              // DOM 안정화 후 즐겨찾기 채널 상단 고정 보장
              if (window.applyChzzkTierSort) {
                setTimeout(() => window.applyChzzkTierSort({ shuffleWithinTiers: false, reason: 'same-type-url-change' }), 200);
              }
            }, 300);
          }

          // 라이브 페이지 모니터링 재시작
          if (newPageType === 'live') {
            if (window.livePageMonitorInterval) {
              clearInterval(window.livePageMonitorInterval);
              window.livePageMonitorInterval = null;
            }
            setupLivePageMonitoring();
          }
        }
      }
    };

    // Pushstate와 popstate 이벤트 감지 (개선된 버전)
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      const result = originalPushState.apply(this, args);
      window.ChzzkLogger?.debug('🔄 [NAVIGATION] pushState detected');
      setTimeout(checkUrlChange, 100);
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      const result = originalReplaceState.apply(this, args);
      window.ChzzkLogger?.debug('🔄 [NAVIGATION] replaceState detected');
      setTimeout(checkUrlChange, 100);
      return result;
    };

    window.addEventListener('popstate', (event) => {
      window.ChzzkLogger?.debug('🔄 [NAVIGATION] popstate detected');
      setTimeout(checkUrlChange, 100);
    });

    // 클릭 이벤트 감지 (SPA 링크 감지)
    document.addEventListener('click', (event) => {
      const target = event.target.closest('a');
      if (target && target.href && target.href.includes('chzzk.naver.com')) {
        window.ChzzkLogger?.debug('🔗 [NAVIGATION] Internal link clicked:', target.href);
        setTimeout(checkUrlChange, 200);
      }
    });

    // 주기적 URL 체크 (백업)
    const urlCheckInterval = setInterval(checkUrlChange, 2000);
    window.urlChangeMonitorInterval = urlCheckInterval; // 전역 참조 저장

    window.ChzzkLogger?.info('🔄 [URL MONITOR] Enhanced URL change detection setup complete');
  }

  // 이전 페이지 정리 (개선된 버전 - 전역 모니터링 유지)
  function cleanupPreviousPage() {
    window.ChzzkLogger?.info('🧹 [CLEANUP] Starting page cleanup...');

    // 셔플 상태 초기화 (페이지별)
    if (window.ChzzkShuffle) {
      window.ChzzkShuffle.reset();
      window.ChzzkLogger?.debug('🧹 [CLEANUP] Shuffle state reset');
    }

    // 더보기 버튼 상태 초기화 (페이지별)
    if (window.ChzzkMoreButton) {
      window.ChzzkMoreButton.reset();
      window.ChzzkLogger?.debug('🧹 [CLEANUP] More button state reset');
    }

    // 별표 버튼 제거 및 옵저버 정리 (페이지별)
    if (window.ChzzkStar) {
      window.ChzzkStar.removeAllStarButtons();
      window.ChzzkStar.reset();
      window.ChzzkLogger?.debug('🧹 [CLEANUP] Star buttons removed and observer reset');
    }

    // DOM 변경 옵저버 정리 (페이지별)
    cleanupChangeObserverResources();

    // LNB 가시성 모니터 정리 (페이지별)
    if (window.lnbVisibilityMonitor) {
      clearInterval(window.lnbVisibilityMonitor);
      window.lnbVisibilityMonitor = null;
      window.ChzzkLogger?.debug('🧹 [CLEANUP] LNB visibility monitor cleaned up');
    }

    // 라이브 페이지 모니터링 정리 (있다면)
    if (window.livePageMonitorInterval) {
      clearInterval(window.livePageMonitorInterval);
      window.livePageMonitorInterval = null;
      window.ChzzkLogger?.debug('🧹 [CLEANUP] Live page monitor cleaned up');
    }

    // **중요: 와이드모드 모니터링은 전역적으로 유지 (삭제하지 않음)**
    // 와이드모드 모니터링은 전체 치지직 사이트에서 지속되어야 함
    if (window.wideModeMonitoringInterval) {
      window.ChzzkLogger?.info('🎬 [CLEANUP] Wide mode monitoring preserved (global)');
    } else {
      window.ChzzkLogger?.warn('⚠️ [CLEANUP] Wide mode monitoring not found - will be restarted');
    }

    // 와이드모드 상태는 부분적으로만 초기화 (보존된 셔플 상태만 정리)
    if (wideModeState.preservedShuffleState) {
      wideModeState.preservedShuffleState = null;
      window.ChzzkLogger?.debug('🧹 [CLEANUP] Preserved shuffle state cleared');
    }
    // 다른 와이드모드 상태는 유지 (isWideMode, lnbElementsPresent 등)

    window.ChzzkLogger?.info('✅ [CLEANUP] Page cleanup completed - global monitoring preserved');
  }

  // 전체 확장 프로그램 종료 시 모든 모니터링 정리
  function cleanupAllMonitoring() {
    window.ChzzkLogger?.info('🧹 [FULL CLEANUP] Starting complete extension cleanup...');

    // 페이지별 정리 먼저 수행
    cleanupPreviousPage();

    // 전역 모니터링 정리
    if (window.wideModeMonitoringInterval) {
      clearInterval(window.wideModeMonitoringInterval);
      window.wideModeMonitoringInterval = null;
      window.ChzzkLogger?.debug('🧹 [FULL CLEANUP] Wide mode monitoring cleaned up');
    }

    if (window.urlChangeMonitorInterval) {
      clearInterval(window.urlChangeMonitorInterval);
      window.urlChangeMonitorInterval = null;
      window.ChzzkLogger?.debug('🧹 [FULL CLEANUP] URL change monitoring cleaned up');
    }

    if (window.livePageMonitorInterval) {
      clearInterval(window.livePageMonitorInterval);
      window.livePageMonitorInterval = null;
      window.ChzzkLogger?.debug('🧹 [FULL CLEANUP] Live page monitoring cleaned up');
    }

    // 모든 상태 초기화
    wideModeState.isWideMode = false;
    wideModeState.lnbElementsPresent = true;
    wideModeState.preservedShuffleState = null;
    wideModeState.lastStateChange = 0;

    window.ChzzkLogger?.info('✅ [FULL CLEANUP] Complete extension cleanup finished');
  }

  // 전역 정리 함수를 window에 등록
  window.cleanupChzzkExtension = cleanupAllMonitoring;

  // 브라우저 탭 종료 시 정리
  window.addEventListener('beforeunload', () => {
    window.ChzzkLogger?.info('🚪 [UNLOAD] Page unloading, cleaning up...');
    cleanupAllMonitoring();
  });

  // DOM 변경 감지 설정
  function setupChangeObserver() {
    cleanupChangeObserverResources();

    let updateTimeout = null;
    let resizeObserver = null;
    let visibilityMonitor = null;

    observer = new MutationObserver((mutations) => {
      if (window.ChzzkShuffle?.mutationLock) return;

      let shouldUpdate = false;
      let shouldReshuffleAfterRestructure = false;

      mutations.forEach((mutation) => {
        // 새로운 채널이 추가되었는지 확인
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 별표 버튼 추가는 무시 (재셔플 방지)
              if (node.hasAttribute && node.hasAttribute('data-chzzk-star-btn')) continue;

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

        // CSS 속성 변화 감지 (와이드모드 관련)
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          const attributeName = mutation.attributeName;

          // 사이드바/네비게이션 관련 요소의 클래스나 스타일 변화 감지
          if (target.matches && (
            target.matches('[class*="navigation_bar"]') ||
            target.matches('[class*="aside"]') ||
            target.matches('[class*="sidebar"]') ||
            target.matches('nav') ||
            target.matches('.navigation_bar_list__LQF-k') ||
            target.closest('.navigation_bar_list__LQF-k')
          )) {

            if (attributeName === 'style') {
              const computedStyle = getComputedStyle(target);
              const isHidden = computedStyle.display === 'none' ||
                             computedStyle.visibility === 'hidden' ||
                             computedStyle.opacity === '0';

              if (isHidden) {
                window.ChzzkLogger?.warn('📱 [STYLE] LNB element hidden, likely wide mode entry');
                shouldReshuffleAfterRestructure = true;
              } else if (mutation.oldValue && mutation.oldValue.includes('none')) {
                window.ChzzkLogger?.warn('📱 [STYLE] LNB element shown, likely wide mode exit');
                shouldReshuffleAfterRestructure = true;
              }
            }

            if (attributeName === 'class') {
              const oldClasses = mutation.oldValue?.split(' ') || [];
              const newClasses = target.className.split(' ');

              // 와이드모드 관련 클래스 변화 감지
              const wideRelatedClasses = ['hidden', 'collapsed', 'compact', 'wide', 'theater', 'fullscreen'];
              const hasWideClassChange = wideRelatedClasses.some(cls =>
                oldClasses.includes(cls) !== newClasses.includes(cls)
              );

              if (hasWideClassChange) {
                window.ChzzkLogger?.warn('📱 [CLASS] Wide mode related class change detected');
                shouldReshuffleAfterRestructure = true;
              }
            }
          }
        }

        // 와이드모드 등으로 인한 대량 DOM 재구성 감지
        if (mutation.type === 'childList') {
          const hasLargeRestructure = mutation.removedNodes.length > 5 && mutation.addedNodes.length > 5;

          // LNB 네비게이션 요소의 재구성 감지
          const hasNavigationRestructure = Array.from(mutation.addedNodes).some(node => {
            return node.nodeType === Node.ELEMENT_NODE &&
                   node.querySelector &&
                   (node.querySelector('.navigation_bar_list__LQF-k') ||
                    node.querySelector('.navigation_bar_item__4OS5Z') ||
                    node.matches('.navigation_bar_list__LQF-k') ||
                    node.matches('.navigation_bar_item__4OS5Z'));
          });

          // 기존 LNB 요소들의 대량 제거 감지 (와이드모드 진입 시)
          const hasNavigationRemoval = Array.from(mutation.removedNodes).some(node => {
            return node.nodeType === Node.ELEMENT_NODE &&
                   ((node.querySelector &&
                     (node.querySelector('.navigation_bar_list__LQF-k') ||
                      node.querySelector('.navigation_bar_item__4OS5Z'))) ||
                    (node.matches &&
                     (node.matches('.navigation_bar_list__LQF-k') ||
                      node.matches('.navigation_bar_item__4OS5Z'))));
          });

          if (hasNavigationRestructure || hasNavigationRemoval) {
            window.ChzzkLogger?.warn('🔄 [DOM] Large DOM restructure detected (likely wide mode toggle)');
            shouldReshuffleAfterRestructure = true;
          }
        }
      });

      // 디바운스된 업데이트
      if (shouldUpdate) {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          window.ChzzkViewerCount.scheduleUpdate();
          const currentList = window.ChzzkShuffle?.findChannelsList?.();
          if (currentList?.list && currentList?.items?.length) {
            applyInitialChannelOrdering(currentList.list, currentList.items, 'mutation:new-channel-content');
          }
          // 새 채널 콘텐츠 감지 시 별표 버튼 재주입
          if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
            setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
          }
        }, 200);
      }

      // DOM 재구성 후 셔플 상태 복원
      if (shouldReshuffleAfterRestructure) {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          if (window.ChzzkShuffle?.shuffleCompleted) {
            // 이미 셔플 완료 상태 - 재정렬만 수행 (무작위 재셔플 방지)
            window.ChzzkLogger?.info('🔄 [SHUFFLE] Reordering (not reshuffling) after DOM restructure');
            window.ChzzkShuffle.reorderByStarState();
            if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
              setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
            }
          } else if (window.ChzzkShuffle?.shuffleEverCompleted) {
            // 셔플이 이전에 완료된 적 있음 - 순서 보존 재정렬만
            window.ChzzkLogger?.info('🔄 [SHUFFLE] Reordering (ever completed) after DOM restructure');
            window.ChzzkShuffle.reorderByStarState();
            if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
              setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
            }
          } else if (window.ChzzkShuffle && typeof window.ChzzkShuffle.performShuffle === 'function') {
            // 최초 셔플이 아직 안 된 경우에만 도달
            window.ChzzkLogger?.info('🔄 [SHUFFLE] First shuffle after DOM restructure');

            // DOM 완전 안정화를 위해 더 긴 시간 대기 후 셔플 시도
            setTimeout(() => {
              const list = document.querySelector('.navigation_bar_list__LQF-k');
              if (list && list.children.length > 0) {
                window.ChzzkLogger?.info('🎯 [SHUFFLE] Auto-shuffling after DOM restructure');
                window.ChzzkShuffle.performShuffle(list, null, true);
                if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                  setTimeout(() => window.ChzzkStar.injectAllStarButtons(list), 200);
                }
              } else {
                window.ChzzkLogger?.warn('⚠️ [SHUFFLE] Navigation list not ready, retrying...');
                setTimeout(() => {
                  const retryList = document.querySelector('.navigation_bar_list__LQF-k');
                  if (retryList && retryList.children.length > 0) {
                    window.ChzzkLogger?.info('🎯 [SHUFFLE] Retry auto-shuffling successful');
                    window.ChzzkShuffle.performShuffle(retryList, null, true);
                    if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                      setTimeout(() => window.ChzzkStar.injectAllStarButtons(retryList), 200);
                    }
                  }
                }, 500);
              }
            }, 1000);
          }
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-*'],
      attributeOldValue: true
    });

    // ResizeObserver 설정 (사이드바 크기 변화 감지)
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const target = entry.target;

          // 사이드바나 네비게이션 관련 요소인지 확인
          if (target.matches && (
            target.matches('[class*="navigation_bar"]') ||
            target.matches('[class*="aside"]') ||
            target.matches('[class*="sidebar"]') ||
            target.matches('nav') ||
            target.closest('[class*="navigation_bar"]')
          )) {
            const { width, height } = entry.contentRect;

            // 크기가 0이 되거나 매우 작아지면 숨겨진 것으로 판단
            if (width < 50 || height < 50) {
              window.ChzzkLogger?.warn('📏 [RESIZE] Sidebar collapsed/hidden, likely wide mode entry');
              // reset() 호출 제거 - 사이드바 축소 시에도 셔플 상태 유지
            } else if (width > 200) {
              window.ChzzkLogger?.warn('📏 [RESIZE] Sidebar expanded, likely wide mode exit');
              clearTimeout(updateTimeout);
              updateTimeout = setTimeout(() => {
                if (window.ChzzkShuffle?.shuffleCompleted) {
                  // 이미 셔플 완료 상태 - 재정렬만 수행
                  window.ChzzkLogger?.info('🎯 [RESIZE] Reordering after sidebar expansion');
                  window.ChzzkShuffle.reorderByStarState();
                  if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                    setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
                  }
                } else if (window.ChzzkShuffle?.shuffleEverCompleted) {
                  // 셔플이 이전에 완료된 적 있음 - 순서 보존 재정렬만
                  window.ChzzkLogger?.info('🎯 [RESIZE] Reordering (ever completed) after sidebar expansion');
                  window.ChzzkShuffle.reorderByStarState();
                  if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                    setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
                  }
                } else if (window.ChzzkShuffle && typeof window.ChzzkShuffle.performShuffle === 'function') {
                  // 최초 셔플이 아직 안 된 경우에만 도달
                  setTimeout(() => {
                    const list = document.querySelector('.navigation_bar_list__LQF-k');
                    if (list && list.children.length > 0) {
                      window.ChzzkLogger?.info('🎯 [RESIZE] First shuffle after sidebar expansion');
                      window.ChzzkShuffle.performShuffle(list, null, true);
                      if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                        setTimeout(() => window.ChzzkStar.injectAllStarButtons(list), 200);
                      }
                    }
                  }, 1200);
                }
              }, 600);
            }
          }
        });
      });

      // 사이드바 관련 요소들을 관찰
      const sidebarElements = document.querySelectorAll('[class*="navigation_bar"], [class*="aside"], [class*="sidebar"], nav');
      sidebarElements.forEach(element => {
        resizeObserver.observe(element);
      });

      window.ChzzkLogger?.debug('📏 ResizeObserver set up for sidebar elements');
    }

    // LNB 가시성 직접 모니터링 설정
    setupLNBVisibilityMonitoring();

    function setupLNBVisibilityMonitoring() {
      let lastVisibilityState = null;
      let shuffleState = null; // 셔플 상태 보존용
      let orderChangeTimeout = null; // 순서 변경 감지 전용 디바운스 (updateTimeout과 분리)

      const checkLNBVisibility = () => {
        if (window.ChzzkShuffle?.mutationLock) return;

        try {
          const lnbList = document.querySelector('.navigation_bar_list__LQF-k');
          if (!lnbList) {
            return;
          }

          // getComputedStyle로 실제 가시성 확인
          const computedStyle = getComputedStyle(lnbList);
          const parentComputedStyle = lnbList.parentElement ? getComputedStyle(lnbList.parentElement) : null;

          const isVisible = computedStyle.display !== 'none' &&
                           computedStyle.visibility !== 'hidden' &&
                           computedStyle.opacity !== '0' &&
                           lnbList.offsetWidth > 0 &&
                           lnbList.offsetHeight > 0 &&
                           (!parentComputedStyle ||
                            (parentComputedStyle.display !== 'none' &&
                             parentComputedStyle.visibility !== 'hidden' &&
                             parentComputedStyle.opacity !== '0'));

          const currentState = {
            visible: isVisible,
            elementCount: lnbList.children.length,
            width: lnbList.offsetWidth,
            height: lnbList.offsetHeight,
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity
          };

          // 상태 변화 감지
          if (lastVisibilityState &&
              lastVisibilityState.visible !== currentState.visible) {

            if (!currentState.visible && lastVisibilityState.visible) {
              // LNB가 숨겨짐 - 셔플 상태 보존
              window.ChzzkLogger?.warn('👁️ [VISIBILITY] LNB hidden, preserving shuffle state');

              if (window.ChzzkShuffle && typeof window.ChzzkShuffle.getShuffleState === 'function') {
                shuffleState = window.ChzzkShuffle.getShuffleState();
                window.ChzzkLogger?.debug('💾 [STATE] Shuffle state preserved:', shuffleState);
              }

            } else if (currentState.visible && !lastVisibilityState.visible) {
              // LNB가 다시 보임 - 셔플 상태 복원
              window.ChzzkLogger?.warn('👁️ [VISIBILITY] LNB restored, attempting to restore shuffle state');

              clearTimeout(updateTimeout);
              updateTimeout = setTimeout(() => {
                if (shuffleState && window.ChzzkShuffle &&
                    typeof window.ChzzkShuffle.restoreShuffleState === 'function') {

                  window.ChzzkLogger?.info('🔄 [STATE] Restoring shuffle state after LNB restoration');
                  window.ChzzkShuffle.restoreShuffleState(shuffleState);

                } else if (window.ChzzkShuffle) {
                  // 상태 복원 함수가 없으면 재정렬 또는 새로 셔플
                  if (window.ChzzkShuffle.shuffleCompleted) {
                    window.ChzzkLogger?.info('🎯 [FALLBACK] Reordering LNB after restoration');
                    window.ChzzkShuffle.reorderByStarState();
                    if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                      setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
                    }
                  } else if (window.ChzzkShuffle.shuffleEverCompleted) {
                    window.ChzzkLogger?.info('🎯 [FALLBACK] Reordering (ever completed) LNB after restoration');
                    window.ChzzkShuffle.reorderByStarState();
                    if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                      setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
                    }
                  } else if (typeof window.ChzzkShuffle.performShuffle === 'function') {
                    // 최초 셔플이 아직 안 된 경우에만 도달
                    const newList = document.querySelector('.navigation_bar_list__LQF-k');
                    if (newList && newList.children.length > 0) {
                      window.ChzzkLogger?.info('🎯 [FALLBACK] First shuffle LNB after restoration');
                      window.ChzzkShuffle.performShuffle(newList, null, true);
                      if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                        setTimeout(() => window.ChzzkStar.injectAllStarButtons(newList), 200);
                      }
                    }
                  }
                }

                shuffleState = null; // 사용 후 정리
              }, 1500); // LNB 완전 복원 대기
            }

          }

          // 순서 기반 변경 감지 (셔플 완료 후, 치지직이 순서를 변경했는지 확인)
          // orderChangeTimeout이 이미 예약되어 있으면 스킵 (500ms 폴링에 의한 반복 취소 방지)
          if (currentState.visible && !orderChangeTimeout &&
              !window.ChzzkShuffle?.mutationLock && !window.ChzzkShuffle?.isShuffling &&
              window.ChzzkShuffle?.shuffleEverCompleted && lnbList) {
            if (window.ChzzkShuffle.hasOrderChanged(lnbList)) {
              window.ChzzkLogger?.warn('🔀 [ORDER] Channel order changed externally, scheduling re-sort');
              orderChangeTimeout = setTimeout(() => {
                orderChangeTimeout = null;
                if (window.ChzzkShuffle?.mutationLock || window.ChzzkShuffle?.isShuffling) return;
                window.ChzzkLogger?.info('🎯 [ORDER] Reordering due to external order change');
                window.ChzzkShuffle.reorderByStarState();
                if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
                  setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 200);
                }
              }, 800);
            }
          }

          lastVisibilityState = currentState;

        } catch (error) {
          window.ChzzkLogger?.error('❌ [VISIBILITY] Error in LNB visibility check:', error);
        }
      };

      // 주기적 가시성 체크 (500ms 간격)
      visibilityMonitor = setInterval(checkLNBVisibility, 500);
      window.lnbVisibilityMonitor = visibilityMonitor; // 전역 참조 저장 (정리용)

      // 초기 상태 설정
      setTimeout(checkLNBVisibility, 100);

      window.ChzzkLogger?.debug('👁️ LNB visibility monitoring started');
    }

    changeObserverCleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (visibilityMonitor) {
        clearInterval(visibilityMonitor);
        if (window.lnbVisibilityMonitor === visibilityMonitor) {
          window.lnbVisibilityMonitor = null;
        }
        visibilityMonitor = null;
      }
      window.ChzzkLogger?.debug('🧹 [CLEANUP] Change observer resources cleaned up');
    };

    window.ChzzkLogger?.debug('👁️ DOM change observer set up');
  }

  function cleanupChangeObserverResources() {
    if (typeof changeObserverCleanup === 'function') {
      changeObserverCleanup();
      changeObserverCleanup = null;
      return;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
      window.ChzzkLogger?.debug('🧹 [CLEANUP] DOM observer disconnected');
    }
  }

  // 범용 페이지 초기화 (모든 치지직 페이지)
  async function initializeUniversalPage() {
    window.ChzzkLogger?.info('🌐 Initializing universal page features (all chzzk pages)');

    // 모든 페이지에서 LNB 셔플 지원
    window.ChzzkShuffle.waitForDynamicLoading((list, items, reason) => {
      window.ChzzkLogger?.info(`🎯 Universal page dynamic loading completed: ${items?.length || 0} channels (reason: ${reason})`);

      if (items && items.length > 0) {
        window.ChzzkLogger?.info(`✅ Universal page: Found ${items.length} channels, applying preferred order`);

        // LNB 채널 티어/즐겨찾기 우선 정렬 실행
        applyInitialChannelOrdering(list, items, `universal:${reason}`);

        // 별표 버튼 주입
        if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
          setTimeout(() => {
            window.ChzzkStar.injectAllStarButtons(list);
            window.ChzzkStar.startObserving();
          }, 200);
        }

        // 점진적 로딩 지원 설정
        setupProgressiveLoadingSupport(list);

        // DOM 변경 감지 설정
        setupChangeObserver();

        window.ChzzkLogger?.info('🔧 Universal page: LNB 셔플 시스템 준비 완료');
      } else {
        window.ChzzkLogger?.info('ℹ️ Universal page: No channels found, retrying...');
        ensureStarObservation(document);
        retryShuffleForCurrentPage();
      }
    }, 6000); // 범용 페이지는 6초 대기
  }

  // 점진적 로딩 지원 설정
  function setupProgressiveLoadingSupport(list) {
    window.ChzzkLogger?.info('🔧 Setting up progressive loading support...');

    // 더보기 버튼을 찾아서 점진적 셔플 지원 설정
    const moreButton = window.ChzzkMoreButton?.findExpandButton?.();
    if (moreButton) {
      window.ChzzkLogger?.info('✅ Found more button, setting up progressive shuffle support');
      window.ChzzkMoreButton.enhanceOriginal(moreButton, list);
    } else {
      window.ChzzkLogger?.info('ℹ️ No more button found initially, will monitor for it');

      // 더보기 버튼이 나중에 나타날 수 있으므로 모니터링
      const buttonObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const addedButton = window.ChzzkMoreButton?.findExpandButton?.();
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
  function getChzzkPageStatus(channels = []) {
    const bodyText = document.body?.innerText || '';
    const isFollowingPage = window.location.pathname === '/following';
    const loginRequired = isFollowingPage &&
      channels.length === 0 &&
      /로그인이 필요합니다|로그인/.test(bodyText);

    return {
      isFollowingPage,
      loginRequired,
      url: window.location.href
    };
  }

  async function copyCurrentTimecode() {
    const core = window.ChzzkTimecodeCore;
    const video = document.querySelector('video');
    const seconds = video ? Math.floor(video.currentTime || 0) : 0;
    const text = core?.buildCopyText ? core.buildCopyText({ seconds, videoNo: core.getVideoNo?.(location.href) || '' }) : `- [${new Date(seconds * 1000).toISOString().slice(11, 19)}] `;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    return { ok: true, text };
  }

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
          if (window.applyChzzkTierSort) {
            window.applyChzzkTierSort({ shuffleWithinTiers: true, reason: 'global-shuffle' });
          } else {
            window.ChzzkShuffle.executeShuffle(list, items, true);
          }
        }
      });
    };

    window.applyChzzkTierSort = async (options = {}) => {
      if (window.ChzzkFavoriteTierStore) {
        const state = await window.ChzzkFavoriteTierStore.load();
        window.ChzzkStar?.syncFromTierState?.(state);
      }
      return window.ChzzkShuffle?.applyTierSort(options) || false;
    };

    const messageApis = Array.from(new Set([
      window.ChzzkPlatform?.api,
      window.chrome
    ].filter(api => api?.runtime?.onMessage)));

    window.__chzzkSidebarMessageRegistered = window.__chzzkSidebarMessageRegistered || new WeakSet();
    messageApis.forEach((extensionApi) => {
      if (window.__chzzkSidebarMessageRegistered.has(extensionApi)) return;
      window.__chzzkSidebarMessageRegistered.add(extensionApi);
      extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
        (async () => {
          const type = message?.type;
          if (type === 'GET_CHZZK_CHANNELS') {
            const channels = window.ChzzkShuffle?.getChannelSnapshot?.() || [];
            const state = window.ChzzkFavoriteTierStore ? await window.ChzzkFavoriteTierStore.load() : null;
            sendResponse({ ok: true, channels, state, pageStatus: getChzzkPageStatus(channels) });
            return;
          }

          if (type === 'APPLY_TIER_SORT') {
            if (window.ChzzkFavoriteTierStore) {
              const state = await window.ChzzkFavoriteTierStore.load();
              window.ChzzkStar?.syncFromTierState?.(state);
            }
            const applied = window.ChzzkShuffle?.applyTierSort?.({ shuffleWithinTiers: false, pinChannelId: message?.pinChannelId || '' }) || false;
            if (window.ChzzkStar && window.ChzzkSettings?.get('enableStar')) {
              setTimeout(() => window.ChzzkStar.injectAllStarButtons(), 150);
            }
            sendResponse({ ok: applied });
            return;
          }

          if (type === 'SHUFFLE_WITHIN_TIERS') {
            if (window.ChzzkFavoriteTierStore) {
              const state = await window.ChzzkFavoriteTierStore.load();
              window.ChzzkStar?.syncFromTierState?.(state);
            }
            const applied = window.ChzzkShuffle?.applyTierSort?.({ shuffleWithinTiers: true }) || false;
            sendResponse({ ok: applied });
            return;
          }

          if (type === 'COPY_TIMECODE') {
            sendResponse(await copyCurrentTimecode());
            return;
          }

          if (type === 'EXPAND_LNB') {
            const expanded = window.ChzzkMoreButton?.autoExpand?.('message') || false;
            setTimeout(() => {
              const channels = window.ChzzkShuffle?.getChannelSnapshot?.() || [];
              sendResponse({ ok: expanded || channels.length > 0, expanded, channelCount: channels.length });
            }, 700);
            return;
          }

          if (type === 'REFRESH_STAR_BUTTONS') {
            await window.ChzzkSettings?.load?.();
            const channels = window.ChzzkShuffle?.getChannelSnapshot?.() || [];
            if (!window.ChzzkSettings?.get('enableStar')) {
              window.ChzzkStar?.removeAllStarButtons?.();
              window.ChzzkStar?.stopObserving?.();
              sendResponse({ ok: true, starEnabled: false, channelCount: channels.length });
              return;
            }

            if (window.ChzzkFavoriteTierStore) {
              const state = await window.ChzzkFavoriteTierStore.load();
              window.ChzzkStar?.syncFromTierState?.(state);
            }
            window.ChzzkStar?.injectAllStarButtons?.();
            window.ChzzkStar?.startObserving?.();
            sendResponse({ ok: true, starEnabled: true, channelCount: channels.length });
          }
        })().catch((error) => {
          window.ChzzkLogger?.error('[MESSAGE] Request failed:', error);
          sendResponse({ ok: false, error: error.message || String(error) });
        });
        return true;
      });
    });

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
