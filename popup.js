// 설정 로드 및 초기화
document.addEventListener('DOMContentLoaded', async () => {
  await loadAndApplySettings();
  setupEventListeners();
});

// 설정 로드 및 UI 업데이트
async function loadAndApplySettings() {
  try {
    const result = await chrome.storage.sync.get(['hideViewerCount', 'enableShuffle']);
    const hideViewerCount = result.hideViewerCount !== undefined ? result.hideViewerCount : true;
    const enableShuffle = result.enableShuffle !== undefined ? result.enableShuffle : true;
    
    // 토글 스위치 상태 업데이트
    updateToggleSwitch('hideViewerToggle', hideViewerCount);
    updateToggleSwitch('enableShuffleToggle', enableShuffle);
    
    console.log('Settings loaded:', { hideViewerCount, enableShuffle });
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// 토글 스위치 상태 업데이트
function updateToggleSwitch(toggleId, isActive) {
  const toggle = document.getElementById(toggleId);
  if (toggle) {
    if (isActive) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 시청자 수 숨기기 토글
  document.getElementById('hideViewerToggle').addEventListener('click', async () => {
    const toggle = document.getElementById('hideViewerToggle');
    const isActive = !toggle.classList.contains('active');
    
    updateToggleSwitch('hideViewerToggle', isActive);
    
    try {
      await chrome.storage.sync.set({ hideViewerCount: isActive });
      console.log('hideViewerCount set to:', isActive);
    } catch (error) {
      console.error('Failed to save hideViewerCount:', error);
    }
  });
  
  // 셔플 기능 토글
  document.getElementById('enableShuffleToggle').addEventListener('click', async () => {
    const toggle = document.getElementById('enableShuffleToggle');
    const isActive = !toggle.classList.contains('active');
    
    updateToggleSwitch('enableShuffleToggle', isActive);
    
    try {
      await chrome.storage.sync.set({ enableShuffle: isActive });
      console.log('enableShuffle set to:', isActive);
    } catch (error) {
      console.error('Failed to save enableShuffle:', error);
    }
  });
  
  // 셔플 실행 버튼
  document.getElementById('shuffleBtn').addEventListener('click', async () => {
    // 현재 설정 확인
    const settings = await chrome.storage.sync.get(['enableShuffle', 'hideViewerCount']);
    const enableShuffle = settings.enableShuffle !== undefined ? settings.enableShuffle : true;
    const hideViewerCount = settings.hideViewerCount !== undefined ? settings.hideViewerCount : true;
    
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab && tab.url && tab.url.includes('chzzk.naver.com')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (enableShuffle, hideViewerCount) => {
            console.log('[CHZZK SHUFFLE] Manual shuffle triggered via popup');
            console.log('[CHZZK SHUFFLE] Settings:', { enableShuffle, hideViewerCount });
            
            // 강제로 셔플 실행 (수동 실행이므로 설정 무시)
            if (typeof window.shuffleSidebar === 'function') {
              console.log('[CHZZK SHUFFLE] Using global shuffleSidebar function');
              // 일시적으로 설정 변경하여 강제 실행
              if (window.settings) {
                const originalSetting = window.settings.enableShuffle;
                window.settings.enableShuffle = true;
                window.shuffleSidebar();
                window.settings.enableShuffle = originalSetting;
              } else {
                window.shuffleSidebar();
              }
            } else {
              console.log('[CHZZK SHUFFLE] Global function not found, using fallback');
              
              // 강화된 fallback 로직
              const allLists = document.querySelectorAll('.navigation_bar_list__+d2qh, .navigator_list__cHnuV');
              let bestList = null;
              let maxChannels = 0;
              
              console.log(`[CHZZK SHUFFLE] Found ${allLists.length} potential lists`);
              
              allLists.forEach((list, index) => {
                const items = list.querySelectorAll('.navigator_item__mH4JG, .navigator_item__qXlq9');
                console.log(`[CHZZK SHUFFLE] List ${index}: ${items.length} items`);
                if (items.length > maxChannels) {
                  maxChannels = items.length;
                  bestList = list;
                }
              });
              
              if (bestList && maxChannels > 0) {
                console.log(`[CHZZK SHUFFLE] Using best list with ${maxChannels} channels`);
                const items = Array.from(bestList.querySelectorAll('.navigator_item__mH4JG, .navigator_item__qXlq9'));
                const live = [];
                const offline = [];
                
                items.forEach(item => {
                  const viewerCount = item.querySelector('.navigator_count__kpr6-, .navigator_count__db5Av, em[class*="count"], span[class*="count"]');
                  if (viewerCount && hideViewerCount) {
                    viewerCount.style.setProperty('display', 'none', 'important');
                    viewerCount.style.setProperty('visibility', 'hidden', 'important');
                    viewerCount.style.setProperty('opacity', '0', 'important');
                  }
                  
                  if (viewerCount) {
                    live.push(item);
                  } else {
                    offline.push(item);
                  }
                });
                
                console.log(`[CHZZK SHUFFLE] Categorized: ${live.length} live, ${offline.length} offline`);
                
                // 셔플 알고리즘
                const shuffle = (arr) => {
                  for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                  }
                };
                
                // DOM에서 제거
                items.forEach(item => {
                  if (item.parentNode) {
                    item.parentNode.removeChild(item);
                  }
                });
                
                // 셔플 실행
                shuffle(live);
                shuffle(offline);
                
                // 다시 추가 (라이브 먼저, 오프라인 나중에)
                [...live, ...offline].forEach(item => {
                  bestList.appendChild(item);
                });
                
                console.log('[CHZZK SHUFFLE] Shuffle completed successfully');
              } else {
                console.warn('[CHZZK SHUFFLE] No suitable list found for shuffling');
              }
            }
          },
          args: [enableShuffle, hideViewerCount]
        });
      } else {
        console.warn('[CHZZK SHUFFLE] Not on chzzk.naver.com');
      }
    });
  });
}