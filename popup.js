const platform = window.ChzzkPlatform;
const CONTENT_SCRIPT_FILES = [
  'js/logger.js',
  'js/platform.js',
  'js/domAdapter.js',
  'js/favoriteTierStore.js',
  'js/timecodeCore.js',
  'js/settings.js',
  'js/viewerCount.js',
  'js/moreButton.js',
  'js/star.js',
  'js/shuffle.js',
  'content.js'
];
const DEFAULTS = {
  hideViewerCount: true,
  enableShuffle: true,
  enableStar: true,
  enableTierSort: true,
  enableAutoExpand: true
};

const statusEl = document.getElementById('status');
const browserBadge = document.getElementById('browserBadge');
const versionText = document.getElementById('versionText');
const homeScreen = document.getElementById('homeScreen');
const tierScreen = document.getElementById('tierScreen');
const tierFrame = document.getElementById('tierFrame');
const store = window.ChzzkFavoriteTierStore;

let activeChzzkTab = null;
let reinjectedTabIds = new Set();
let isWorking = false;

document.addEventListener('DOMContentLoaded', async () => {
  browserBadge.textContent = 'Chrome';
  versionText.textContent = `v${platform.runtime?.getManifest?.().version || ''}`;
  setupEvents();
  try {
    await loadSettings();
    await hydrateActiveTab();
  } catch (error) {
    setButtonsEnabled(false);
    setStatus(platform?.isContextInvalidatedError?.(error)
      ? '확장이 갱신되었습니다. 치지직 탭을 새로고침해 주세요.'
      : '팝업을 초기화하지 못했습니다. 새로고침을 눌러 다시 연결하세요.');
    window.ChzzkLogger?.warn?.('[POPUP] Initialization failed', error);
  }
});

async function loadSettings() {
  const keys = Object.keys(DEFAULTS);
  const result = await platform.storageGet('sync', keys).catch(() => ({}));
  keys.forEach((key) => {
    setSwitch(`${key}Toggle`, result[key] !== undefined ? result[key] : DEFAULTS[key]);
  });
}

function setupEvents() {
  Object.keys(DEFAULTS).forEach((key) => {
    const switchButton = document.getElementById(`${key}Toggle`);
    switchButton?.addEventListener('click', async () => {
      await runExclusive('설정을 저장하는 중입니다.', async () => {
        const next = !getSwitch(`${key}Toggle`);
        setSwitch(`${key}Toggle`, next);
        await platform.storageSet('sync', { [key]: next });
        setStatus('설정을 저장했습니다.');
        if (key === 'enableStar') await sendToActiveTab({ type: 'REFRESH_STAR_BUTTONS' }, false);
      });
    });

    switchButton?.closest('.toggle')?.addEventListener('click', (event) => {
      if (event.target.closest('button, a')) return;
      switchButton.click();
    });
  });

  document.getElementById('applyTierBtn').addEventListener('click', async () => {
    await runExclusive('티어 정렬을 적용하는 중입니다.', async () => {
      const response = await sendToActiveTab({ type: 'APPLY_TIER_SORT' });
      setStatus(response?.ok ? '현재 치지직 탭에 티어 정렬을 적용했습니다.' : '정렬할 채널 목록을 찾지 못했습니다.');
    });
  });

  document.getElementById('shuffleBtn').addEventListener('click', async () => {
    await runExclusive('그룹 안에서 섞는 중입니다.', async () => {
      const response = await sendToActiveTab({ type: 'SHUFFLE_WITHIN_TIERS' });
      setStatus(response?.ok ? '티어 경계 안에서 채널을 섞었습니다.' : '셔플할 채널 목록을 찾지 못했습니다.');
    });
  });

  document.getElementById('expandBtn').addEventListener('click', async () => {
    await runExclusive('목록을 펼치는 중입니다.', async () => {
      const response = await sendToActiveTab({ type: 'EXPAND_LNB' });
      setStatus(response?.ok ? `목록 펼치기 요청 완료. 감지 채널 ${response.channelCount || 0}개.` : '펼칠 목록 버튼을 찾지 못했습니다.');
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await runExclusive('현재 탭을 확인하는 중입니다.', hydrateActiveTab);
  });

  document.getElementById('openChzzkBtn').addEventListener('click', async () => {
    if (platform.tabs?.create) {
      await platform.tabs.create({ url: 'https://chzzk.naver.com/following?tab=ALL' });
      setStatus('치지직 팔로잉을 열었습니다.');
      window.close();
      return;
    }
    setStatus('치지직 탭을 열 수 없습니다.');
  });

  document.getElementById('openManagerBtn').addEventListener('click', async () => {
    if (isWorking) return;
    showTierScreen();
  });

  document.getElementById('backToHomeBtn')?.addEventListener('click', () => {
    showHomeScreen();
  });
}

async function runExclusive(message, task) {
  if (isWorking) return false;
  isWorking = true;
  document.body?.classList.add('is-working');
  document.body?.setAttribute('aria-busy', 'true');
  setStatus(message);
  setButtonsEnabled(!!activeChzzkTab);

  try {
    return await task();
  } catch (error) {
    setStatus(platform?.isContextInvalidatedError?.(error)
      ? '확장이 갱신되었습니다. 치지직 탭을 새로고침해 주세요.'
      : '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return false;
  } finally {
    isWorking = false;
    document.body?.classList.remove('is-working');
    document.body?.setAttribute('aria-busy', 'false');
    setButtonsEnabled(!!activeChzzkTab);
  }
}

function setSwitch(id, active) {
  const element = document.getElementById(id);
  if (!element) return;
  element.setAttribute('aria-checked', String(!!active));
}

function getSwitch(id) {
  return document.getElementById(id)?.getAttribute('aria-checked') === 'true';
}

function setStatus(message) {
  statusEl.textContent = message;
}

function showTierScreen() {
  if (!tierFrame?.src) {
    tierFrame.src = platform.runtime?.getURL?.('sidebar.html') || 'sidebar.html';
  }
  homeScreen?.classList.add('hidden');
  tierScreen?.classList.remove('hidden');
  document.getElementById('backToHomeBtn')?.focus();
}

function showHomeScreen() {
  tierScreen?.classList.add('hidden');
  homeScreen?.classList.remove('hidden');
  document.getElementById('openManagerBtn')?.focus();
  hydrateActiveTab();
}

async function hydrateActiveTab() {
  const [activeTab] = await platform.queryTabs({ active: true, currentWindow: true }).catch(() => []);
  const tabs = await platform.queryTabs({ url: '*://chzzk.naver.com/*' }).catch(() => []);
  activeChzzkTab = pickBestChzzkTab([activeTab, ...(tabs || [])]);

  setButtonsEnabled(!!activeChzzkTab);

  if (!activeChzzkTab) {
    setStatus('치지직 팔로잉 탭을 열어 정렬을 시작하세요.');
    return;
  }

  const response = await sendToActiveTab({ type: 'GET_CHZZK_CHANNELS' }, false);
  if (response?.ok) {
    await store?.load();
    setStatus(response.pageStatus?.loginRequired
      ? '치지직 로그인이 필요합니다. 로그인 후 새로고침하세요.'
      : `현재 탭 연결됨. 감지된 채널 ${response.channels?.length || 0}개.`);
  } else {
    setStatus('치지직 탭은 열려 있지만 확장 스크립트 연결을 기다리는 중입니다.');
  }
}

function pickBestChzzkTab(tabs) {
  const seen = new Set();
  const candidates = (tabs || []).filter((tab) => {
    if (!/^https?:\/\/chzzk\.naver\.com\//.test(tab?.url || '')) return false;
    const key = tab.id ?? tab.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return candidates.find(tab => isFollowingTab(tab.url)) || candidates[0] || null;
}

function isFollowingTab(url) {
  try {
    return new URL(url).pathname === '/following';
  } catch {
    return false;
  }
}

async function sendToActiveTab(message, showError = true) {
  if (!activeChzzkTab?.id) {
    if (showError) setStatus('먼저 치지직 탭을 활성화해 주세요.');
    return null;
  }

  try {
    const response = await platform.sendMessage(activeChzzkTab.id, message);
    if (response === undefined && await reinjectContentScripts(activeChzzkTab.id)) {
      return await platform.sendMessage(activeChzzkTab.id, message).catch(() => null);
    }
    return response;
  } catch (error) {
    if (await reinjectContentScripts(activeChzzkTab.id)) {
      try {
        return await platform.sendMessage(activeChzzkTab.id, message);
      } catch (retryError) {
        if (showError) setStatus(`요청 실패: ${retryError.message || retryError}`);
        return null;
      }
    }
    if (showError) setStatus(`요청 실패: ${error.message || error}`);
    return null;
  }
}

async function reinjectContentScripts(tabId) {
  if (!tabId || reinjectedTabIds.has(tabId)) return false;
  try {
    if (platform.executeScripts) {
      await platform.executeScripts(tabId, CONTENT_SCRIPT_FILES);
    } else {
      await platform.sendRuntimeMessage({ type: 'INJECT_CONTENT_SCRIPTS', tabId, files: CONTENT_SCRIPT_FILES });
    }
    reinjectedTabIds.add(tabId);
    await new Promise(resolve => setTimeout(resolve, 250));
    return true;
  } catch (directError) {
    try {
      const response = await platform.sendRuntimeMessage({ type: 'INJECT_CONTENT_SCRIPTS', tabId, files: CONTENT_SCRIPT_FILES });
      if (!response?.ok) throw new Error(response?.error || 'Background injection failed');
      reinjectedTabIds.add(tabId);
      await new Promise(resolve => setTimeout(resolve, 250));
      return true;
    } catch {
      window.ChzzkLogger?.warn?.('[POPUP] Content script injection failed', directError);
      return false;
    }
  }
}

function setButtonsEnabled(enabled) {
  const actions = document.querySelector('.actions');
  actions?.classList.toggle('is-empty', !enabled);
  document.getElementById('openChzzkBtn')?.classList.toggle('hidden', enabled);
  ['applyTierBtn', 'shuffleBtn', 'expandBtn'].forEach((id) => {
    document.getElementById(id)?.classList.toggle('hidden', !enabled);
  });
  ['applyTierBtn', 'shuffleBtn', 'expandBtn', 'refreshBtn', 'openManagerBtn'].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    const isTabAction = ['applyTierBtn', 'shuffleBtn', 'expandBtn'].includes(id);
    const disabled = isWorking || (!enabled && isTabAction);
    element.disabled = disabled;
    element.setAttribute('aria-disabled', String(disabled));
    const label = controlLabel(id);
    const reason = isWorking
      ? '처리 중입니다.'
      : (!enabled && isTabAction ? '치지직 팔로잉 탭을 먼저 열어 주세요.' : label);
    element.title = reason;
    element.setAttribute('aria-label', disabled ? `${label}: ${reason}` : label);
  });
  document.querySelectorAll('.switch').forEach(button => {
    button.disabled = isWorking;
    button.setAttribute('aria-disabled', String(isWorking));
  });
}

function controlLabel(id) {
  return ({
    applyTierBtn: '정렬 적용',
    shuffleBtn: '그룹 셔플',
    expandBtn: '목록 펼치기',
    refreshBtn: '새로고침',
    openManagerBtn: '티어 관리'
  })[id] || '';
}
