/**
 * DOM 조작 및 셔플 로직 모듈
 * 치지직 사이드바 채널 목록을 찾고 셔플하는 핵심 기능
 */

// 셔플 상태 관리
let isShuffling = false;
let mutationLock = false;
let shuffleCompleted = false;
let restoreLock = false;

// 채널 카운트 히스토리 및 모니터링
let channelCountHistory = [];
let dynamicLoadingMonitor = null;

// 활성 콜백 추적
const activeCallbacks = new Set();

/**
 * 셔플 관리 클래스
 */
class ShuffleManager {
  constructor() {
    this.isShuffling = false;
    this.mutationLock = false;
    this.shuffleCompleted = false;
    this.restoreLock = false;
    this.channelCountHistory = [];
    this.dynamicLoadingMonitor = null;
    this.activeCallbacks = new Set();
    
    // CSS 스타일 주입
    this.injectCSS();
  }

  /**
   * 안전한 셔플용 CSS 스타일 주입
   * @private
   */
  injectCSS() {
    // 기존 스타일이 있으면 제거
    const existingStyle = document.getElementById('chzzk-shuffle-styles');
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'chzzk-shuffle-styles';
    style.textContent = `
      /* 안전한 셔플 전용 숨김 클래스 - 레이아웃 보존 */
      .chzzk-shuffle-hidden { 
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        position: relative !important; /* 레이아웃 유지 */
      }
      
      /* LNB 채널 영역 보호 - 절대 숨기지 않음 */
      .navigation_bar_list__\\+d2qh,
      .navigator_list__cHnuV,
      .aside_content__j2eTE,
      .navigation_bar__F4qHX {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      
      /* 채널 아이템들은 개별적으로만 조작 */
      .navigator_item__mH4JG,
      .navigator_item__qXlq9,
      .navigation_bar_item__4OS5Z {
        /* 기본 스타일 유지, 강제 덮어쓰기 금지 */
      }
    `;
    
    try {
      document.head.appendChild(style);
      window.ChzzkLogger?.info('🎨 [CSS] Safe shuffle styles injected');
    } catch (error) {
      window.ChzzkLogger?.error('❌ [CSS] Failed to inject styles:', error);
    }
  }

  /**
   * 팔로잉 채널 목록 찾기
   * @returns {Object} { list: Element, items: Array, selector: string }
   */
  findChannelsList() {
    window.ChzzkLogger?.debug("🔍 DOM 분석 결과 기반 채널 목록 검색...");
    
    // DOM 분석에서 확인된 실제 데이터 순서로 배치
    const selectors = [
      '.navigation_bar_list__+d2qh', // 분석 결과: 55개 자식 확인됨 (두 번째 것이 채널 리스트)
      'ul[class*="navigation_bar_list"]',
      '.navigator_list__cHnuV',
      'ul[class*="navigator_list"]',
      '.aside_content__j2eTE ul',
      'nav[class*="navigation_bar"] ul',
      'aside ul'
    ];
    
    window.ChzzkLogger?.debug(`Testing ${selectors.length} list selectors...`);
    
    let bestChannelList = null;
    let maxChannelCount = 0;
    
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      try {
        window.ChzzkLogger?.trace(`[${i+1}/${selectors.length}] Trying selector: ${selector}`);
        
        // 같은 셀렉터로 여러 리스트가 있을 수 있으므로 모두 검사
        const allLists = document.querySelectorAll(selector);
        
        allLists.forEach((list, listIndex) => {
          window.ChzzkLogger?.debug(`📋 리스트[${listIndex + 1}]: ${selector} (${list.childElementCount}개 자식)`);
          
          if (list && list.childElementCount > 0) {
            window.ChzzkLogger?.trace(`List element details:`, {
              tagName: list.tagName,
              className: list.className,
              id: list.id,
              childElementCount: list.childElementCount
            });
            
            // DOM 분석 결과 기반: 실제로 존재하는 셀렉터 우선 사용
            const knownItemSelectors = [
              '.navigator_item__mH4JG', // 59개 확인됨
              '.navigation_bar_item__4OS5Z', // 71개 확인됨
              'li', // 기본 리스트 아이템
              '[class*="navigator_item"]',
              'a[href*="/live/"]'
            ];
            
            let bestResult = { selector: '', count: 0, items: [] };
            
            knownItemSelectors.forEach(itemSelector => {
              try {
                const items = Array.from(list.querySelectorAll(itemSelector));
                if (items.length > bestResult.count) {
                  bestResult = { selector: itemSelector, count: items.length, items };
                  window.ChzzkLogger?.debug(`🎯 Better result: ${items.length} items with ${itemSelector}`);
                }
              } catch (error) {
                window.ChzzkLogger?.trace(`Error with ${itemSelector}:`, error);
              }
            });
            
            // 최대 채널 수를 가진 리스트 추적
            if (bestResult.count > maxChannelCount) {
              maxChannelCount = bestResult.count;
              bestChannelList = { list, items: bestResult.items, selector: bestResult.selector };
              window.ChzzkLogger?.info(`🚀 새로운 최적 채널 리스트: ${selector} (${bestResult.count}개 채널)`);
            }
          }
        });
      } catch (error) {
        window.ChzzkLogger?.error(`❌ Error with selector ${selector}:`, error);
      }
    }
    
    // 최적의 채널 리스트 반환
    if (bestChannelList && maxChannelCount > 0) {
      window.ChzzkLogger?.info(`✅ 최종 선택된 채널 리스트: ${maxChannelCount}개 채널`);
      return bestChannelList;
    }
    
    window.ChzzkLogger?.warn("❌ No channel list found with any selector");
    return { list: null, items: [] };
  }

  /**
   * 채널 아이템 검색
   * @param {Element} container - 검색할 컨테이너
   * @returns {Array} 채널 아이템 배열
   */
  findChannelItems(container = document) {
    window.ChzzkLogger?.debug("🔍 단순화된 채널 검색 시작...");
    window.ChzzkLogger?.trace("Search container:", container === document ? "document" : container.tagName + "." + container.className);
    
    // DOM 분석 결과 기반 직접 셀렉터들 (복잡한 필터링 제거)
    const directSelectors = [
      // DOM 분석에서 확인된 실제 클래스들 (59개 확인)
      '.navigator_item__mH4JG',
      '.navigator_item__qXlq9',
      
      // 백업 셀렉터들
      'li[class*="navigation_bar_item"]',
      '[class*="navigator_item"]'
    ];
    
    const selectorResults = {};
    const allItems = [];
    const seenElements = new Set();
    
    for (const selector of directSelectors) {
      try {
        const items = Array.from(container.querySelectorAll(selector));
        selectorResults[selector] = items.length;
        
        if (items.length > 0) {
          let newItemsAdded = 0;
          items.forEach(item => {
            if (!seenElements.has(item)) {
              seenElements.add(item);
              allItems.push(item);
              newItemsAdded++;
              window.ChzzkLogger?.trace(`  Added: ${item.tagName}.${item.className.slice(0, 30)}...`);
            }
          });
          
          if (newItemsAdded > 0) {
            window.ChzzkLogger?.info(`🎯 Added ${newItemsAdded} new items from ${selector} (total: ${allItems.length})`);
          }
          
          // 첫 번째로 많은 결과를 얻으면 우선 사용 (복잡한 조건 제거)
          if (allItems.length >= 8) {
            window.ChzzkLogger?.info(`🎯 Good results (${allItems.length}) with ${selector}, using as primary`);
            break;
          }
        } else {
          window.ChzzkLogger?.trace(`✗ No items found with: ${selector}`);
        }
      } catch (error) {
        window.ChzzkLogger?.error(`❌ Error with item selector ${selector}:`, error);
        selectorResults[selector] = `ERROR: ${error.message}`;
      }
    }
    
    window.ChzzkLogger?.info(`📊 Channel items search results:`, selectorResults);
    window.ChzzkLogger?.info(`✅ Found ${allItems.length} unique channel items`);
    
    return allItems;
  }

  /**
   * 동적 채널 로딩 대기
   * @param {Function} callback - 로딩 완료 후 호출될 콜백
   * @param {number} maxWaitTime - 최대 대기 시간 (ms)
   */
  waitForDynamicLoading(callback, maxWaitTime = 12000) {
    const startTime = Date.now();
    let lastStableCount = 0;
    let stableCountStreak = 0;
    let maxSeenCount = 0;
    const requiredStableStreak = 6; // 연속 6번 같은 수가 나와야 안정화로 판단
    
    window.ChzzkLogger?.info('🔄 Starting enhanced dynamic channel loading detection...');
    
    const checkInterval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      
      // 더 정확한 채널 수 확인
      const { list, items } = this.findChannelsList();
      const allChannelItems = this.findChannelItems(list || document);
      const currentCount = Math.max(items.length, allChannelItems.length);
      
      // 최대 발견 채널 수 추적
      if (currentCount > maxSeenCount) {
        maxSeenCount = currentCount;
        window.ChzzkLogger?.info(`📈 New maximum channel count detected: ${maxSeenCount}`);
      }
      
      // 더보기 버튼 상태 확인
      const moreButton = document.querySelector('.navigation_bar_more_button__7DoyA');
      const isExpanded = moreButton ? moreButton.getAttribute('aria-expanded') === 'true' : true;
      
      // 채널 수 히스토리 업데이트
      const historyEntry = {
        timestamp: new Date().toISOString().slice(11, 23),
        count: currentCount,
        elapsed: `${elapsed}ms`,
        fromList: items.length,
        fromSearch: allChannelItems.length,
        listSelector: list ? list.className : 'none',
        moreButtonExpanded: isExpanded
      };
      
      this.channelCountHistory.push(historyEntry);
      
      // 최근 20개 유지
      if (this.channelCountHistory.length > 20) {
        this.channelCountHistory.shift();
      }
      
      window.ChzzkLogger?.debug(`🔍 Channel count: ${currentCount} (max: ${maxSeenCount}, list: ${items.length}, search: ${allChannelItems.length}, expanded: ${isExpanded}) at ${elapsed}ms`);
      
      // 안정화 확인
      if (currentCount === lastStableCount && currentCount > 0) {
        stableCountStreak++;
        window.ChzzkLogger?.debug(`📊 Stable streak: ${stableCountStreak}/${requiredStableStreak} (count: ${currentCount})`);
      } else {
        if (lastStableCount > 0) {
          window.ChzzkLogger?.info(`📈 Channel count changed: ${lastStableCount} → ${currentCount} (${elapsed}ms)`);
        }
        lastStableCount = currentCount;
        stableCountStreak = 0;
      }
      
      // 완료 조건 확인
      const isStable = stableCountStreak >= requiredStableStreak;
      const hasExcellentChannels = currentCount >= 10;
      const hasReasonableChannels = currentCount >= 6;
      const hasMinimumChannels = currentCount >= 3;
      const isTimeout = elapsed >= maxWaitTime;
      const hasWaitedEnough = elapsed >= 3000;
      
      if (isStable && hasExcellentChannels && hasWaitedEnough) {
        clearInterval(checkInterval);
        window.ChzzkLogger?.info(`✅ Excellent! Channel loading stabilized: ${currentCount} channels after ${elapsed}ms`);
        callback(list, allChannelItems, 'stable-excellent');
      } else if (isStable && hasReasonableChannels && hasWaitedEnough) {
        clearInterval(checkInterval);
        window.ChzzkLogger?.info(`✅ Channel loading stabilized: ${currentCount} channels after ${elapsed}ms`);
        callback(list, allChannelItems, 'stable');
      } else if (isStable && hasMinimumChannels && elapsed >= 6000) {
        clearInterval(checkInterval);
        window.ChzzkLogger?.info(`✅ Channel loading stabilized (minimum): ${currentCount} channels after ${elapsed}ms`);
        callback(list, allChannelItems, 'stable-minimum');
      } else if (isTimeout) {
        clearInterval(checkInterval);
        if (currentCount >= hasMinimumChannels) {
          window.ChzzkLogger?.warn(`⏰ Timeout reached but found ${currentCount} channels - proceeding anyway`);
        } else {
          window.ChzzkLogger?.warn(`⏰ Timeout reached with only ${currentCount} channels (max seen: ${maxSeenCount})`);
        }
        callback(list, allChannelItems, 'timeout');
      }
    }, 600);
    
    // 즉시 첫 번째 확인
    setTimeout(() => {
      window.ChzzkLogger?.debug("🔍 Initial channel count check...");
      const { list, items } = this.findChannelsList();
      const allChannelItems = this.findChannelItems(list || document);
      const initialCount = Math.max(items.length, allChannelItems.length);
      lastStableCount = initialCount;
      maxSeenCount = initialCount;
      
      window.ChzzkLogger?.info(`🎯 Initial channel count: ${initialCount} (list: ${items.length}, search: ${allChannelItems.length})`);
    }, 300);
  }

  /**
   * 메인 셔플 실행 함수
   * @param {Element} providedList - 제공된 리스트 요소
   * @param {Array} providedItems - 제공된 아이템 배열
   * @param {boolean} forceReshuffle - 강제 셔플 여부
   */
  executeShuffle(providedList = null, providedItems = null, forceReshuffle = false) {
    try {
      window.ChzzkLogger?.shuffle(`🎯 Shuffle execution started: list=${!!providedList}, items=${providedItems?.length || 0}, force=${forceReshuffle}`);
      
      // 설정 확인
      if (!forceReshuffle && !window.ChzzkSettings?.get('enableShuffle')) {
        window.ChzzkLogger?.shuffle('🚫 Shuffle disabled by user setting');
        if (window.ChzzkViewerCount) {
          window.ChzzkViewerCount.scheduleUpdate();
        }
        return;
      }
      
      // 중복 실행 확인
      if (!forceReshuffle && this.isShuffling) {
        window.ChzzkLogger?.shuffle('⚠️ Shuffle already in progress, skipping duplicate call');
        return;
      }
      
      // 완료 상태 확인
      if (!forceReshuffle && this.shuffleCompleted) {
        window.ChzzkLogger?.shuffle('⚠️ Shuffle already completed for this page, skipping');
        return;
      }
      
      this.isShuffling = true;
      
      // 점진적 셔플: 현재 로드된 채널만 셔플 (강제 확장 제거)
      window.ChzzkLogger?.shuffle('🔧 Starting progressive shuffle with currently loaded channels...');
      
      // 강제 확장 없이 바로 셔플 수행
      this.performShuffle(providedList, providedItems);
      
    } catch (error) {
      window.ChzzkLogger?.error('❌ Error in executeShuffle:', error);
      this.isShuffling = false;
    }
  }

  /**
   * 실제 셔플 수행
   * @private
   * @param {Element} providedList - 제공된 리스트 요소
   * @param {Array} providedItems - 제공된 아이템 배열
   */
  performShuffle(providedList, providedItems) {
    try {
      // 제공된 리스트와 아이템들을 사용하거나 직접 찾기
      const { list: foundList, items: foundItems } = providedList ? 
        { list: providedList, items: providedItems || [] } : 
        this.findChannelsList();
      
      const list = foundList;
      const allChannelItems = providedItems || this.findChannelItems(list || document);
      
      window.ChzzkLogger?.info(`🎯 [SHUFFLE] Parameters: list=${!!list}, items=${allChannelItems?.length || 0}, mutationLock=${this.mutationLock}`);
      
      // 안전성 검사 강화
      if (!list || this.mutationLock) {
        window.ChzzkLogger?.warn('⚠️ [SHUFFLE] Skipped: no list or mutation locked');
        if (window.ChzzkViewerCount) {
          window.ChzzkViewerCount.scheduleUpdate();
        }
        this.isShuffling = false;
        return;
      }

      // DOM 안전성 검사
      if (!document.contains(list)) {
        window.ChzzkLogger?.error('❌ [SHUFFLE] List element not in DOM, aborting shuffle');
        this.isShuffling = false;
        return;
      }

      // LNB 컨테이너 보호 검사
      if (this.isProtectedLNBContainer(list)) {
        window.ChzzkLogger?.warn('🛡️ [SHUFFLE] Protected LNB container detected, using safe mode');
        return this.performSafeShuffle(list, allChannelItems);
      }
      
      if (allChannelItems.length === 0) {
        window.ChzzkLogger?.shuffle('[CHZZK SHUFFLE] No items to shuffle, applying settings');
        if (window.ChzzkViewerCount) {
          window.ChzzkViewerCount.scheduleUpdate();
        }
        this.isShuffling = false;
        return;
      }
      
      window.ChzzkLogger?.shuffle(`🎯 Starting shuffle of ${allChannelItems.length} items`);
      
      // DOM 구조 보존을 위해 li 컨테이너와 함께 처리
      const channelContainers = this.prepareContainers(allChannelItems);
      
      // 라이브/오프라인 분리
      const liveContainers = channelContainers.filter(container => container.isLive);
      const offlineContainers = channelContainers.filter(container => !container.isLive);
      
      window.ChzzkLogger?.info(`📊 Live containers: ${liveContainers.length}, Offline containers: ${offlineContainers.length}`);
      
      // 셔플 실행 (라이브 채널도 셔플하되 최상단 유지)
      window.ChzzkLogger?.shuffle(`🔀 Shuffling arrays: ${liveContainers.length} live, ${offlineContainers.length} offline`);
      
      // 셔플 전 라이브 채널 순서 로깅
      window.ChzzkLogger?.debug('📊 Live channels before shuffle:', liveContainers.map((c, i) => `${i+1}. ${c.element.className.slice(0, 30)}`));
      
      this.shuffleArray(liveContainers);
      this.shuffleArray(offlineContainers);
      
      // 셔플 후 라이브 채널 순서 로깅
      window.ChzzkLogger?.debug('📊 Live channels after shuffle:', liveContainers.map((c, i) => `${i+1}. ${c.element.className.slice(0, 30)}`));
      
      // DOM에서 기존 컨테이너들 제거
      let removedCount = 0;
      channelContainers.forEach(container => {
        try {
          if (container.element.parentNode) {
            container.element.remove();
            removedCount++;
          }
        } catch (error) {
          window.ChzzkLogger?.warn('⚠️ Error removing container:', error);
        }
      });
      window.ChzzkLogger?.shuffle(`✂️ Removed ${removedCount} containers from DOM`);
      
      // 새로운 순서로 재배치 (라이브 먼저, 그 다음 오프라인)
      const reorderedContainers = [...liveContainers, ...offlineContainers];
      
      // 최종 배치 순서 로깅
      window.ChzzkLogger?.shuffle('📋 Final arrangement order:');
      reorderedContainers.forEach((container, index) => {
        const type = container.isLive ? '🔴LIVE' : '⚫OFF';
        const channelInfo = container.element.textContent?.trim().slice(0, 20) || 'Unknown';
        window.ChzzkLogger?.debug(`  ${index + 1}. ${type} ${channelInfo}`);
      });
      
      // 공통 재배치 로직 사용
      this.rearrangeChannels(list, liveContainers, offlineContainers);
      
      // 더보기 버튼 점진적 로딩 설정
      if (window.ChzzkMoreButton) {
        const originalMoreButton = document.querySelector('.navigation_bar_more_button__7DoyA');
        if (originalMoreButton) {
          window.ChzzkLogger?.info('👍 더보기 버튼 점진적 로딩 기능 설정...');
          window.ChzzkMoreButton.enhanceOriginal(originalMoreButton, list);
        } else {
          window.ChzzkLogger?.info('ℹ️ 더보기 버튼이 없어서 새로 생성하지 않습니다 (점진적 로딩 방식)');
        }
      }
      
      this.shuffleCompleted = true;
      
      const allContainers = [...liveContainers, ...offlineContainers];
      
      window.ChzzkLogger?.shuffle(`🎯 ✅ Shuffle completed successfully: ${liveContainers.length} live, ${offlineContainers.length} offline`);
      window.ChzzkLogger?.shuffle(`🎯 📊 Final order: live channels first, then offline channels`);
      
      // 셔플 후 UI 정리 및 원래 기능 복원
      setTimeout(() => {
        this.cleanupAfterShuffle(list);
        this.fixSpacingIssues(list);
      }, 100);
      
    } catch (error) {
      window.ChzzkLogger?.error('❌ Error in performShuffle:', error);
    } finally {
      this.isShuffling = false;
    }
  }

  /**
   * 채널 컨테이너 준비
   * @private
   * @param {Array} allChannelItems - 모든 채널 아이템
   * @returns {Array} 컨테이너 배열
   */
  prepareContainers(allChannelItems) {
    const channelContainers = [];
    
    allChannelItems.forEach(item => {
      try {
        // 시청자 수 숨기기
        if (window.ChzzkViewerCount) {
          window.ChzzkViewerCount.hideAll(item);
        }
        
        // 부모 li 컨테이너 찾기
        const liContainer = item.closest('li');
        
        if (liContainer) {
          // li 컨테이너 전체를 사용 (DOM 구조 보존)
          if (!channelContainers.find(container => container.element === liContainer)) {
            const isLive = this.isLiveChannel(liContainer);
            
            channelContainers.push({
              element: liContainer,
              isLive: isLive
            });
            
            window.ChzzkLogger?.debug(`📦 Found container: ${liContainer.className}, isLive: ${isLive}`);
          }
        } else {
          // li 컨테이너가 없는 경우 새로 생성
          const newLi = this.createContainerForItem(item);
          if (newLi) {
            channelContainers.push(newLi);
          }
        }
      } catch (error) {
        window.ChzzkLogger?.error('[CHZZK SHUFFLE] Error processing item:', error);
      }
    });
    
    return channelContainers;
  }

  /**
   * 라이브 채널인지 확인
   * @private
   * @param {Element} container - 확인할 컨테이너
   * @returns {boolean} 라이브 여부
   */
  isLiveChannel(container) {
    const viewerCountSelectors = [
      '.navigator_count__kpr6-', '.navigator_count__db5Av',
      'em[class*="count"]', 'span[class*="count"]',
      'em[class*="viewer"]', 'span[class*="viewer"]',
      '[class*="live_count"]', '[class*="viewer_count"]'
    ];
    
    for (const selector of viewerCountSelectors) {
      const viewerCount = container.querySelector(selector);
      if (viewerCount) return true;
    }
    
    return false;
  }

  /**
   * 아이템용 컨테이너 생성
   * @private
   * @param {Element} item - 아이템 요소
   * @returns {Object|null} 컨테이너 객체
   */
  createContainerForItem(item) {
    try {
      window.ChzzkLogger?.warn(`⚠️ No li container found for item: ${item.className}, creating one`);
      
      const newLi = document.createElement('li');
      newLi.className = 'navigation_bar_item__4OS5Z';
      
      const itemClone = item.cloneNode(true);
      newLi.appendChild(itemClone);
      
      const isLive = this.isLiveChannel(newLi);
      
      // 원본 아이템 제거
      if (item.parentNode) {
        item.remove();
      }
      
      return {
        element: newLi,
        isLive: isLive
      };
    } catch (error) {
      window.ChzzkLogger?.error('❌ Error creating container for item:', error);
      return null;
    }
  }

  /**
   * 배열 셔플 (Fisher-Yates 알고리즘)
   * @private
   * @param {Array} array - 셔플할 배열
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * 셔플 후 정리 작업 (셔플된 순서 보존)
   * @private
   * @param {Element} list - 채널 리스트 요소
   */
  cleanupAfterShuffle(list) {
    window.ChzzkLogger?.info('🧽 셔플 후 스타일 정리 중 (순서 보존)...');
    
    // 모든 아이템의 셔플 과정 임시 스타일만 제거
    const allItems = list.querySelectorAll('.navigator_item__mH4JG, .navigator_item__qXlq9, a[href*="/live/"], a[href*="/channel/"]');
    allItems.forEach(item => {
      // 오직 셔플 과정에서 추가된 임시 스타일만 제거
      if (item.style.position === 'absolute') item.style.removeProperty('position');
      if (item.style.left === '-9999px') item.style.removeProperty('left');
      if (item.style.visibility === 'hidden') item.style.removeProperty('visibility');
      if (item.style.transform) item.style.removeProperty('transform');
      if (item.style.opacity && item.style.opacity !== '1') item.style.removeProperty('opacity');
      
      // 셔플 전용 클래스만 제거
      item.classList.remove('chzzk-hidden');
      
      // 중요: display 스타일은 건드리지 않음 (셔플된 순서 보존)
    });
    
    // 더보기 버튼은 점진적 로딩을 위해 원래 상태 유지
    const originalMoreButton = document.querySelector('.navigation_bar_more_button__7DoyA');
    if (originalMoreButton) {
      window.ChzzkLogger?.info('🔄 더보기 버튼 점진적 로딩 상태 유지...');
      
      // 더보기 버튼 상태를 건드리지 않음 - 점진적 로딩을 위해 원래 상태 보존
      const currentExpanded = originalMoreButton.getAttribute('aria-expanded');
      window.ChzzkLogger?.info(`📊 더보기 버튼 현재 상태: ${currentExpanded} (보존됨)`);
    }
    
    window.ChzzkLogger?.info('✅ 셔플된 순서 보존하며 스타일 정리 완료');
  }

  /**
   * 간격 문제 수정
   * @private
   * @param {Element} list - 채널 리스트 요소
   */
  fixSpacingIssues(list) {
    // 기본적인 간격 정리만 수행
    try {
      const allItems = list.querySelectorAll('.navigator_item__mH4JG, .navigator_item__qXlq9, a[href*="/live/"], a[href*="/channel/"]');
      allItems.forEach(item => {
        // 기본 스타일만 확인
        if (item.style.margin) item.style.removeProperty('margin');
        if (item.style.padding) item.style.removeProperty('padding');
      });
    } catch (error) {
      window.ChzzkLogger?.warn('⚠️ Error fixing spacing:', error);
    }
  }

  /**
   * 점진적 셔플 - 새 채널 추가 시 기존 셔플된 목록에 통합
   * @param {Element} list - 채널 리스트 요소
   * @param {Array} newChannels - 새로 추가된 채널들
   */
  progressiveShuffle(list, newChannels = []) {
    if (this.isShuffling || !list) {
      window.ChzzkLogger?.debug('⏸️ Progressive shuffle skipped: already shuffling or no list');
      return;
    }

    try {
      this.isShuffling = true;
      window.ChzzkLogger?.shuffle(`🔄 Progressive shuffle: adding ${newChannels.length} new channels`);

      // 현재 DOM에 있는 모든 채널 가져오기
      const currentChannels = this.findChannelItems(list);
      const channelContainers = this.prepareContainers(currentChannels);

      // 라이브/오프라인 분리
      const liveContainers = channelContainers.filter(container => container.isLive);
      const offlineContainers = channelContainers.filter(container => !container.isLive);

      // 새로 추가된 채널들만 셔플하여 기존 목록에 통합
      if (newChannels.length > 0) {
        const newContainers = this.prepareContainers(newChannels);
        const newLive = newContainers.filter(c => c.isLive);
        const newOffline = newContainers.filter(c => !c.isLive);

        // 새 채널들만 셔플
        this.shuffleArray(newLive);
        this.shuffleArray(newOffline);

        // 기존 목록에 통합
        liveContainers.push(...newLive);
        offlineContainers.push(...newOffline);

        window.ChzzkLogger?.shuffle(`➕ Added ${newLive.length} live, ${newOffline.length} offline channels`);
      }

      // 전체 재배치
      this.rearrangeChannels(list, liveContainers, offlineContainers);

    } catch (error) {
      window.ChzzkLogger?.error('❌ Error in progressive shuffle:', error);
    } finally {
      this.isShuffling = false;
    }
  }

  /**
   * 채널 재배치 (공통 로직)
   * @private
   */
  rearrangeChannels(list, liveContainers, offlineContainers) {
    // DOM에서 기존 컨테이너들 제거
    [...liveContainers, ...offlineContainers].forEach(container => {
      if (container.element.parentNode) {
        container.element.remove();
      }
    });

    // 새로운 순서로 재배치 (라이브 먼저, 그 다음 오프라인)
    const reorderedContainers = [...liveContainers, ...offlineContainers];

    // DOM에 순서대로 다시 추가
    reorderedContainers.forEach((container, index) => {
      try {
        list.appendChild(container.element);

        // 시청자 수 숨기기 적용
        if (window.ChzzkViewerCount) {
          window.ChzzkViewerCount.hideAll(container.element);
        }

        const type = container.isLive ? '🔴LIVE' : '⚫OFF';
        window.ChzzkLogger?.trace(`📦 Placed ${type} at position ${index + 1}`);
      } catch (error) {
        window.ChzzkLogger?.warn('⚠️ Error placing container:', error);
      }
    });

    window.ChzzkLogger?.shuffle(`✅ Progressive rearrangement complete: ${liveContainers.length} live + ${offlineContainers.length} offline`);
  }

  /**
   * 셔플 상태 초기화
   */
  reset() {
    this.isShuffling = false;
    this.shuffleCompleted = false;
    this.mutationLock = false;
    this.restoreLock = false;
    this.channelCountHistory = [];
    
    if (this.dynamicLoadingMonitor) {
      clearInterval(this.dynamicLoadingMonitor);
      this.dynamicLoadingMonitor = null;
    }
    
    window.ChzzkLogger?.info('🔄 Shuffle state reset');
  }

  /**
   * 보호된 LNB 컨테이너인지 확인
   * @private
   * @param {Element} list - 검사할 리스트 요소  
   * @returns {boolean} 보호된 컨테이너 여부
   */
  isProtectedLNBContainer(list) {
    if (!list) return false;
    
    const className = (list.className && typeof list.className === 'string') ? 
                     list.className : 
                     (list.className && list.className.baseVal ? list.className.baseVal : '');
    
    // 중요한 LNB 컨테이너 클래스들
    const protectedClasses = [
      'navigation_bar_list__+d2qh',
      'navigator_list__cHnuV', 
      'aside_content__j2eTE',
      'navigation_bar__F4qHX'
    ];
    
    const isProtected = protectedClasses.some(protectedClass => 
      className.includes(protectedClass.replace('\\', ''))
    );
    
    if (isProtected) {
      window.ChzzkLogger?.warn(`🛡️ [PROTECT] Detected protected LNB container: ${className.slice(0, 50)}`);
    }
    
    return isProtected;
  }

  /**
   * 안전한 셔플 수행 (LNB 보호)
   * @private
   * @param {Element} list - 리스트 요소
   * @param {Array} items - 아이템 배열
   */
  performSafeShuffle(list, items) {
    try {
      window.ChzzkLogger?.info(`🛡️ [SAFE-SHUFFLE] Starting safe shuffle for ${items.length} items`);
      
      if (items.length === 0) {
        window.ChzzkLogger?.warn('⚠️ [SAFE-SHUFFLE] No items to shuffle');
        this.isShuffling = false;
        return;
      }

      // 현재 DOM 상태 백업
      const originalOrder = Array.from(items).map(item => ({
        element: item,
        nextSibling: item.nextSibling,
        parent: item.parentNode
      }));

      // 안전한 방식으로 셔플 수행
      const channelContainers = this.prepareContainers(items);
      const liveContainers = channelContainers.filter(container => container.isLive);
      const offlineContainers = channelContainers.filter(container => !container.isLive);
      
      this.shuffleArray(liveContainers);
      this.shuffleArray(offlineContainers);
      
      const finalOrder = [...liveContainers, ...offlineContainers];
      
      // DOM 조작 전 안전성 재확인
      if (!document.contains(list)) {
        window.ChzzkLogger?.error('❌ [SAFE-SHUFFLE] List disappeared during shuffle, restoring original order');
        this.restoreOriginalOrder(originalOrder);
        this.isShuffling = false;
        return;  
      }
      
      // 매우 조심스럽게 DOM 재배열
      this.applySafeReordering(list, finalOrder);
      
      window.ChzzkLogger?.info(`✅ [SAFE-SHUFFLE] Safely completed shuffle of ${finalOrder.length} items`);
      
      // 시청자 수 숨기기 적용
      if (window.ChzzkViewerCount) {
        setTimeout(() => {
          window.ChzzkViewerCount.scheduleUpdate();
        }, 100);
      }
      
      this.shuffleCompleted = true;
      this.isShuffling = false;
      
    } catch (error) {
      window.ChzzkLogger?.error('❌ [SAFE-SHUFFLE] Error in safe shuffle:', error);
      this.isShuffling = false;
    }
  }

  /**
   * 안전한 DOM 재배열
   * @private
   * @param {Element} list - 리스트 요소
   * @param {Array} finalOrder - 최종 순서 배열
   */
  applySafeReordering(list, finalOrder) {
    try {
      // DocumentFragment를 사용하여 안전한 DOM 조작
      const fragment = document.createDocumentFragment();
      
      finalOrder.forEach(container => {
        if (container.element && document.contains(container.element)) {
          // 요소를 fragment로 이동 (DOM에서 제거됨)
          fragment.appendChild(container.element);
        }
      });
      
      // 한 번에 모든 요소를 다시 삽입
      list.appendChild(fragment);
      
      window.ChzzkLogger?.debug(`🔄 [SAFE-REORDER] Successfully reordered ${finalOrder.length} elements`);
      
    } catch (error) {
      window.ChzzkLogger?.error('❌ [SAFE-REORDER] Error during safe reordering:', error);
      throw error;
    }
  }

  /**
   * 원래 순서 복원
   * @private
   * @param {Array} originalOrder - 원래 순서 정보
   */
  restoreOriginalOrder(originalOrder) {
    try {
      window.ChzzkLogger?.warn('🔄 [RESTORE] Restoring original order due to error');
      
      originalOrder.forEach(({ element, nextSibling, parent }) => {
        if (element && parent && document.contains(parent)) {
          if (nextSibling && document.contains(nextSibling)) {
            parent.insertBefore(element, nextSibling);
          } else {
            parent.appendChild(element);
          }
        }
      });
      
      window.ChzzkLogger?.info('✅ [RESTORE] Original order restored');
    } catch (error) {
      window.ChzzkLogger?.error('❌ [RESTORE] Failed to restore original order:', error);
    }
  }

  /**
   * 정리 함수
   */
  cleanup() {
    this.reset();
    
    // CSS 스타일 제거 (더 안전하게)
    const style = document.getElementById('chzzk-shuffle-styles');
    if (style) {
      style.remove();
    }
    
    // 숨김 클래스 제거 (안전한 클래스명으로 업데이트)
    const hiddenElements = document.querySelectorAll('.chzzk-shuffle-hidden');
    hiddenElements.forEach(el => {
      el.classList.remove('chzzk-shuffle-hidden');
      el.removeAttribute('data-chzzk-shuffle-hidden');
    });
    
    // 기존 클래스도 정리
    const oldHiddenElements = document.querySelectorAll('.chzzk-hidden');
    oldHiddenElements.forEach(el => el.classList.remove('chzzk-hidden'));
    
    window.ChzzkLogger?.info('🧹 Shuffle manager safely cleaned up');
  }
}

// 싱글톤 인스턴스 생성
const shuffleManager = new ShuffleManager();

// 레거시 호환성을 위한 전역 함수들
function findFollowingChannelsList() {
  return shuffleManager.findChannelsList();
}

function findFollowingChannelItems(container) {
  return shuffleManager.findChannelItems(container);
}

function waitForDynamicChannelLoading(callback, maxWaitTime) {
  return shuffleManager.waitForDynamicLoading(callback, maxWaitTime);
}

function shuffleSidebarInternal(providedList, providedItems, forceReshuffle) {
  return shuffleManager.executeShuffle(providedList, providedItems, forceReshuffle);
}

function performActualShuffle(providedList, providedItems, forceReshuffle) {
  return shuffleManager.performShuffle(providedList, providedItems);
}

function progressiveShuffle(list, newChannels) {
  return shuffleManager.progressiveShuffle(list, newChannels);
}

// 전역 접근을 위한 window 객체에 등록
if (typeof window !== 'undefined') {
  window.ChzzkShuffle = shuffleManager;
  
  // 레거시 호환성
  window.findFollowingChannelsList = findFollowingChannelsList;
  window.findFollowingChannelItems = findFollowingChannelItems;
  window.waitForDynamicChannelLoading = waitForDynamicChannelLoading;
  window.shuffleSidebarInternal = shuffleSidebarInternal;
  window.performActualShuffle = performActualShuffle;
  window.progressiveShuffle = progressiveShuffle;
  
  // 레거시 전역 변수들
  window.isShuffling = false;
  window.mutationLock = false;
  window.shuffleCompleted = false;
  window.channelCountHistory = [];
}

// 모듈 export (Node.js 환경 대응)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ShuffleManager,
    shuffleManager,
    findFollowingChannelsList,
    findFollowingChannelItems,
    waitForDynamicChannelLoading,
    shuffleSidebarInternal,
    performActualShuffle
  };
}