const platform = window.ChzzkPlatform;
const store = window.ChzzkFavoriteTierStore;
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

const els = {
  connectionText: document.getElementById('connectionText'),
  tabState: document.getElementById('tabState'),
  tabStateText: document.getElementById('tabStateText'),
  favoriteCount: document.getElementById('favoriteCount'),
  assignedCount: document.getElementById('assignedCount'),
  refreshBtn: document.getElementById('refreshBtn'),
  openChzzkBtn: document.getElementById('openChzzkBtn'),
  applyBtn: document.getElementById('applyBtn'),
  shuffleBtn: document.getElementById('shuffleBtn'),
  searchInput: document.getElementById('searchInput'),
  tiers: document.getElementById('tiers'),
  unassignedList: document.getElementById('unassignedList'),
  unassignedCount: document.getElementById('unassignedCount'),
  channelList: document.getElementById('channelList'),
  channelCount: document.getElementById('channelCount'),
  clearAssignmentsBtn: document.getElementById('clearAssignmentsBtn'),
  activityRunBtn: document.getElementById('activityRunBtn'),
  activityForm: document.getElementById('activityForm'),
  activityNameInput: document.getElementById('activityNameInput'),
  activityChannelInput: document.getElementById('activityChannelInput'),
  activityCafeInput: document.getElementById('activityCafeInput'),
  activityNicknameInput: document.getElementById('activityNicknameInput'),
  activityMonitorToggleBtn: document.getElementById('activityMonitorToggleBtn'),
  activityIntervalInput: document.getElementById('activityIntervalInput'),
  activityNotifyLiveStartInput: document.getElementById('activityNotifyLiveStartInput'),
  activityNotifyTitleInput: document.getElementById('activityNotifyTitleInput'),
  activityNotifyCafeInput: document.getElementById('activityNotifyCafeInput'),
  activityList: document.getElementById('activityList'),
  activityCount: document.getElementById('activityCount')
};

let chzzkTab = null;
let draggedId = null;
let query = '';
let detectedIds = [];
let lastDetectedCount = 0;
let pageStatus = {};
let reinjectedTabIds = new Set();
let isWorking = false;
let dragAutoScrollTimer = null;
let dragAutoScrollDelta = 0;
let activityState = { streamers: [], events: [], states: {}, settings: defaultActivitySettings(), lastRun: null };

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await refresh();
});

function bindEvents() {
  els.refreshBtn.addEventListener('click', () => runExclusive('새로고침 중입니다.', refresh));
  els.openChzzkBtn.addEventListener('click', async () => {
    if (isWorking) return;
    if (platform.tabs?.create) {
      await platform.tabs.create({ url: 'https://chzzk.naver.com/following' });
    }
    els.connectionText.textContent = '치지직 탭을 열었습니다.';
  });
  els.applyBtn.addEventListener('click', () => runExclusive('티어 정렬을 적용하는 중입니다.', () => applySort(false)));
  els.shuffleBtn.addEventListener('click', () => runExclusive('그룹 안에서 섞는 중입니다.', () => applySort(true)));
  els.searchInput.addEventListener('input', () => {
    query = els.searchInput.value.trim().toLowerCase();
    render();
  });
  els.clearAssignmentsBtn.addEventListener('click', async () => {
    if (isWorking) return;
    await store.ensureLoaded();
    if (!hasAssignments(store.state)) return;
    if (!confirm('모든 티어 배정을 초기화할까요? 즐겨찾기는 유지됩니다.')) return;
    await runExclusive('티어 배정을 초기화하는 중입니다.', async () => {
      store.state.assignments = {};
      Object.keys(store.state.tierOrder).forEach((tierId) => {
        store.state.tierOrder[tierId] = [];
      });
      await store.save();
      await applySortQuietly('티어 배정을 초기화했습니다.');
      render();
    });
  });
  els.activityRunBtn?.addEventListener('click', () => runExclusive('활동을 확인하는 중입니다.', async () => {
    const response = await platform.sendRuntimeMessage?.({ type: 'ACTIVITY_RUN_NOW' }).catch(error => ({ ok: false, error: error.message || String(error) }));
    if (response?.ok) {
      activityState = {
        ...activityState,
        events: response.events || activityState.events || [],
        states: response.states || activityState.states || {},
        settings: normalizeActivitySettings(response.settings || activityState.settings),
        lastRun: response.lastRun || activityState.lastRun
      };
      await mergeActivityChannels();
      els.connectionText.textContent = `활동 ${response.checked || 0}개 채널을 확인했습니다.`;
      render();
      return;
    }
    els.connectionText.textContent = '활동 확인을 완료하지 못했습니다.';
    renderActivity();
  }));
  els.activityForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = {
      name: els.activityNameInput?.value?.trim() || '',
      channel: els.activityChannelInput?.value?.trim() || '',
      cafe: els.activityCafeInput?.value?.trim() || '',
      nickname: els.activityNicknameInput?.value?.trim() || ''
    };
    await runExclusive('추적 채널을 추가하는 중입니다.', async () => {
      const response = await platform.sendRuntimeMessage?.({ type: 'ACTIVITY_ADD_STREAMER', input }).catch(error => ({ ok: false, error: error.message || String(error) }));
      if (!response?.ok) {
        els.connectionText.textContent = response?.error || '추적 채널을 추가하지 못했습니다.';
        return false;
      }
      els.activityNameInput.value = '';
      els.activityChannelInput.value = '';
      if (els.activityCafeInput) els.activityCafeInput.value = '';
      if (els.activityNicknameInput) els.activityNicknameInput.value = '';
      await loadActivityState();
      els.connectionText.textContent = '활동 추적 채널을 추가했습니다.';
      render();
      return true;
    });
  });
  els.activityMonitorToggleBtn?.addEventListener('click', () => updateActivitySettings({
    isMonitoring: activityState.settings?.isMonitoring === false
  }));
  els.activityIntervalInput?.addEventListener('change', () => updateActivitySettings({
    intervalMinutes: Number(els.activityIntervalInput.value) || defaultActivitySettings().intervalMinutes
  }));
  els.activityNotifyLiveStartInput?.addEventListener('change', () => updateActivitySettings({
    notifyLiveStart: !!els.activityNotifyLiveStartInput.checked
  }));
  els.activityNotifyTitleInput?.addEventListener('change', () => updateActivitySettings({
    notifyTitleChange: !!els.activityNotifyTitleInput.checked
  }));
  els.activityNotifyCafeInput?.addEventListener('change', () => updateActivitySettings({
    notifyCafePosts: !!els.activityNotifyCafeInput.checked
  }));
}

async function runExclusive(message, task) {
  if (isWorking) return false;
  isWorking = true;
  document.body?.classList.add('is-working');
  document.body?.setAttribute('aria-busy', 'true');
  if (message) els.connectionText.textContent = message;
  updateWorkingControls();

  try {
    return await task();
  } catch (error) {
    els.connectionText.textContent = platform?.isContextInvalidatedError?.(error)
      ? '확장이 갱신되었습니다. 치지직 탭을 새로고침해 주세요.'
      : '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    window.ChzzkLogger?.warn?.('[SIDEBAR] Action failed', error);
    return false;
  } finally {
    isWorking = false;
    document.body?.classList.remove('is-working');
    document.body?.setAttribute('aria-busy', 'false');
    updateWorkingControls();
  }
}

function updateWorkingControls() {
  document.querySelectorAll('button, input').forEach((element) => {
    element.disabled = isWorking;
  });
  if (!isWorking) updateHeaderState(store.state);
}

async function refresh() {
  await store.load();
  await loadActivityState();
  chzzkTab = await findChzzkTab();

  if (!chzzkTab) {
    detectedIds = [];
    lastDetectedCount = 0;
    pageStatus = {};
    els.connectionText.textContent = '치지직 탭 없음';
    render();
    return;
  }

  const response = await sendToTab({ type: 'GET_CHZZK_CHANNELS' });
  if (response?.ok) {
    detectedIds = (response.channels || []).map(channel => channel.id).filter(Boolean);
    lastDetectedCount = detectedIds.length;
    pageStatus = response.pageStatus || {};
    await store.mergeChannels(response.channels || []);
    await mergeActivityChannels();
    await sendToTab({ type: 'REFRESH_STAR_BUTTONS' }, false);
    els.connectionText.textContent = pageStatus.loginRequired
      ? '치지직 로그인이 필요합니다.'
      : `연결됨: ${response.channels?.length || 0}개 채널 감지`;
  } else {
    detectedIds = [];
    lastDetectedCount = 0;
    pageStatus = {};
    els.connectionText.textContent = '치지직 탭 연결 대기 중';
  }

  render();
}

async function loadActivityState() {
  const response = await platform.sendRuntimeMessage?.({ type: 'ACTIVITY_GET_STATE' }).catch(() => null);
  if (response?.ok) {
    activityState = {
      streamers: response.streamers || [],
      events: response.events || [],
      states: response.states || {},
      settings: normalizeActivitySettings(response.settings),
      lastRun: response.lastRun || null
    };
    await mergeActivityChannels();
  } else {
    activityState = { streamers: [], events: [], states: {}, settings: defaultActivitySettings(), lastRun: null };
  }
}

async function mergeActivityChannels() {
  const channels = (activityState.streamers || [])
    .filter(streamer => streamer.channelId)
    .map((streamer) => {
      const liveState = activityState.states?.[streamer.channelId] || {};
      return {
        id: streamer.channelId,
        name: streamer.name || liveState.channelName || streamer.channelId,
        href: `/live/${streamer.channelId}`,
        avatarUrl: streamer.profileImageUrl || liveState.profileImageUrl || '',
        liveStatus: liveState.isLive ? 'live' : 'offline',
        activityEnabled: streamer.enabled !== false,
        source: 'activity-tracker',
        lastSeenAt: Date.now()
      };
    });
  if (channels.length) await store.mergeChannels(channels);
}

async function findChzzkTab() {
  const tabs = await platform.queryTabs({ url: '*://chzzk.naver.com/*' }).catch(() => []);
  return pickBestChzzkTab(tabs);
}

function pickBestChzzkTab(tabs) {
  const candidates = (tabs || []).filter(tab => /^https?:\/\/chzzk\.naver\.com\//.test(tab.url || ''));
  return candidates.find(tab => isFollowingTab(tab.url)) || candidates[0] || null;
}

function isFollowingTab(url) {
  try {
    return new URL(url).pathname === '/following';
  } catch {
    return false;
  }
}

async function sendToTab(message, retryOnMissingReceiver = true) {
  if (!chzzkTab?.id) return null;
  try {
    const response = await platform.sendMessage(chzzkTab.id, message);
    if (response === undefined && retryOnMissingReceiver && await reinjectContentScripts(chzzkTab.id)) {
      return await platform.sendMessage(chzzkTab.id, message).catch(() => null);
    }
    return response;
  } catch {
    if (retryOnMissingReceiver && await reinjectContentScripts(chzzkTab.id)) {
      try {
        return await platform.sendMessage(chzzkTab.id, message);
      } catch {
        return null;
      }
    }
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
      window.ChzzkLogger?.warn?.('[SIDEBAR] Content script injection failed', directError);
      return false;
    }
  }
}

async function applySort(shuffleWithinTiers) {
  if (!chzzkTab) await refresh();
  if (!chzzkTab) {
    els.connectionText.textContent = '치지직 탭을 먼저 열어 주세요.';
    return false;
  }

  if (lastDetectedCount === 0) {
    els.connectionText.textContent = '정렬할 사이드바 채널이 아직 없습니다.';
    return false;
  }

  const response = await sendToTab({ type: shuffleWithinTiers ? 'SHUFFLE_WITHIN_TIERS' : 'APPLY_TIER_SORT' });
  els.connectionText.textContent = response?.ok
    ? (shuffleWithinTiers ? '티어 경계 안에서 섞었습니다.' : '티어 정렬을 적용했습니다.')
    : '정렬할 채널 목록을 찾지 못했습니다.';
  return !!response?.ok;
}

async function applySortQuietly(successMessage, options = {}) {
  if (!chzzkTab || lastDetectedCount === 0) {
    els.connectionText.textContent = successMessage;
    return false;
  }

  const response = await sendToTab({ type: 'APPLY_TIER_SORT', ...options });
  els.connectionText.textContent = response?.ok ? '저장하고 현재 탭에 반영했습니다.' : successMessage;
  return !!response?.ok;
}

function render() {
  const state = store.state;
  const managedIds = unique([...(state.starred || []), ...Object.keys(state.assignments || {})]);
  const allKnownChannels = Object.values(state.channels || {}).sort((a, b) => channelRank(a) - channelRank(b));
  const favoriteChannels = managedIds
    .map(id => state.channels[id] || { id, name: id, href: `/live/${id}`, avatarUrl: '' })
    .filter(channel => !query || `${channel.name} ${channel.id}`.toLowerCase().includes(query));
  const allChannels = allKnownChannels
    .filter(channel => !query || `${channel.name} ${channel.id}`.toLowerCase().includes(query));

  updateHeaderState(state);
  renderTiers(state, favoriteChannels);
  renderUnassigned(state, favoriteChannels);
  renderAllChannels(state, allChannels, managedIds, allKnownChannels.length);
  renderActivity();
}

function updateHeaderState(state) {
  const favoriteCount = (state.starred || []).length;
  const assignedCount = Object.keys(state.assignments || {}).length;
  els.favoriteCount.textContent = String(favoriteCount);
  els.assignedCount.textContent = String(assignedCount);
  els.tabState.classList.toggle('connected', !!chzzkTab);
  els.tabStateText.textContent = chzzkTab ? '연결됨' : '탭 없음';
  els.openChzzkBtn.classList.toggle('hidden', !!chzzkTab);
  els.applyBtn.classList.toggle('hidden', !chzzkTab);
  els.shuffleBtn.classList.toggle('hidden', !chzzkTab);
  const canApplyToCurrentTab = !!chzzkTab && favoriteCount > 0 && lastDetectedCount > 0;
  const disabledReason = sortDisabledReason({ favoriteCount, detectedCount: lastDetectedCount, hasTab: !!chzzkTab });
  setControlState(els.applyBtn, {
    label: '정렬 적용',
    disabled: isWorking || !canApplyToCurrentTab,
    reason: isWorking ? '처리 중입니다.' : disabledReason
  });
  setControlState(els.shuffleBtn, {
    label: '그룹 셔플',
    disabled: isWorking || !canApplyToCurrentTab,
    reason: isWorking ? '처리 중입니다.' : disabledReason
  });
  setControlState(els.clearAssignmentsBtn, {
    label: '티어 배정 초기화',
    disabled: isWorking || !hasAssignments(state),
    reason: isWorking ? '처리 중입니다.' : (!hasAssignments(state) ? '초기화할 티어 배정이 없습니다.' : '')
  });
  els.clearAssignmentsBtn.classList.toggle('hidden', !hasAssignments(state));
  setControlState(els.refreshBtn, {
    label: '새로고침',
    disabled: isWorking,
    reason: isWorking ? '처리 중입니다.' : ''
  });
  els.searchInput.disabled = isWorking;
  els.searchInput.setAttribute('aria-disabled', String(isWorking));
}

function setControlState(element, { label, disabled, reason }) {
  if (!element) return;
  element.disabled = !!disabled;
  element.setAttribute('aria-disabled', String(!!disabled));
  element.title = disabled && reason ? reason : label;
  if (label) element.setAttribute('aria-label', disabled && reason ? `${label}: ${reason}` : label);
}

function sortDisabledReason({ favoriteCount, detectedCount, hasTab }) {
  if (!hasTab) return '치지직 팔로잉 탭을 먼저 열어 주세요.';
  if (detectedCount <= 0) return '감지된 사이드바 채널이 없습니다.';
  if (favoriteCount <= 0) return '즐겨찾기 채널을 먼저 추가해 주세요.';
  return '';
}

function renderTiers(state, channels) {
  els.tiers.textContent = '';
  state.tiers.slice().sort((a, b) => a.order - b.order).forEach((tier) => {
    const row = document.createElement('section');
    row.className = 'tier-row';
    row.innerHTML = `
      <div class="tier-head">
        <span class="tier-label" style="background:${tier.color}">${tier.label}</span>
        <h2>${tier.label} 티어</h2>
        <span class="tier-count">0</span>
      </div>
      <div class="drop-zone" data-tier-id="${tier.id}"></div>
    `;
    const zone = row.querySelector('.drop-zone');
    const ids = orderedIdsForTier(state, tier.id, channels);
    row.querySelector('.tier-count').textContent = String(ids.length);
    fillZone(zone, ids.map(id => state.channels[id]).filter(Boolean));
    attachDropZone(zone);
    els.tiers.appendChild(row);
  });
}

function renderUnassigned(state, channels) {
  const assigned = new Set(Object.keys(state.assignments || {}));
  const items = channels.filter(channel => !assigned.has(channel.id));
  els.unassignedCount.textContent = String(items.length);
  fillZone(els.unassignedList, items);
  attachDropZone(els.unassignedList);
}

function renderAllChannels(state, channels, managedIds, totalChannelCount) {
  const managed = new Set(managedIds);
  const available = channels.filter(channel => !managed.has(channel.id));
  els.channelCount.textContent = query
    ? `${available.length}/${totalChannelCount}`
    : (channels.length ? `${available.length}/${channels.length}` : '0');
  els.channelList.textContent = '';
  if (!channels.length) {
    els.channelList.appendChild(emptyNode(emptyChannelMessage()));
    return;
  }

  if (!available.length) {
    els.channelList.appendChild(emptyNode('감지된 채널은 모두 즐겨찾기에 있습니다.'));
    return;
  }

  available.forEach((channel) => {
    const card = createCard(channel, '', false, 'add');
    els.channelList.appendChild(card);
  });
}

function emptyChannelMessage() {
  if (query) return '검색 결과 없음';
  if (!chzzkTab) return '팔로잉 탭을 열면 채널이 표시됩니다.';
  if (pageStatus.loginRequired) return '치지직 로그인 후 새로고침하세요.';
  return '새로고침하면 감지 채널이 표시됩니다.';
}

function orderedIdsForTier(state, tierId, channels) {
  const valid = new Set(channels.map(channel => channel.id));
  const ordered = (state.tierOrder[tierId] || []).filter(id => valid.has(id) && state.assignments[id] === tierId);
  const missing = channels
    .filter(channel => state.assignments[channel.id] === tierId && !ordered.includes(channel.id))
    .map(channel => channel.id);
  return [...ordered, ...missing];
}

function fillZone(zone, channels) {
  zone.textContent = '';
  if (!channels.length) {
    zone.appendChild(emptyNode(query ? '검색 결과 없음' : (zone.dataset.tierId ? '비어 있음' : '미분류 없음')));
    return;
  }

  channels.forEach((channel) => {
    zone.appendChild(createCard(channel, zone.dataset.tierId, true, 'remove'));
  });
}

function createCard(channel, tierId, draggable, action = 'remove') {
  const card = document.createElement('article');
  card.className = 'streamer-card';
  if (!store.state.starred?.includes(channel.id)) card.classList.add('is-unmanaged');
  card.draggable = !!draggable;
  card.dataset.channelId = channel.id;
  card.title = `${channel.name || channel.id} (${channel.id})`;
  const actionLabel = action === 'add' ? '즐겨찾기 추가' : '즐겨찾기 해제';
  card.innerHTML = `
    <div class="avatar">${channel.avatarUrl ? `<img src="${escapeAttr(channel.avatarUrl)}" alt="">` : ''}</div>
    <div class="meta">
      <div class="name">${escapeText(channel.name || channel.id)}</div>
      <div class="id">${escapeText(cardMetaText(channel, tierId, action))}</div>
    </div>
    <div class="card-actions">
      <button class="mini ${action === 'remove' ? 'is-starred' : ''}" type="button" title="${actionLabel}" aria-label="${actionLabel}" aria-pressed="${action === 'remove'}">${favoriteIcon(action)}</button>
    </div>
    <div class="tier-picker" role="group" aria-label="${escapeAttr(channel.name || channel.id)} 티어 선택">
      ${tierButtons(tierId)}
    </div>
  `;

  card.addEventListener('dragstart', () => {
    draggedId = channel.id;
  });

  card.querySelector('.mini').addEventListener('click', async () => {
    await runExclusive(action === 'add' ? '즐겨찾기에 추가하는 중입니다.' : '즐겨찾기에서 제거하는 중입니다.', async () => {
      await store.setStarred(channel.id, action === 'add', channel);
      await applySortQuietly(
        action === 'add' ? '즐겨찾기에 추가했습니다.' : '즐겨찾기에서 제거했습니다.',
        action === 'add' ? { pinChannelId: channel.id } : {}
      );
      render();
      focusChannelMini(channel.id, action === 'add' ? '.unassigned' : '.all-channels');
    });
  });

  card.querySelectorAll('[data-tier-choice]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextTier = button.dataset.tierChoice;
      await runExclusive(nextTier ? `${button.textContent.trim()} 티어로 옮기는 중입니다.` : '미분류로 옮기는 중입니다.', async () => {
        await setChannelTier(channel, nextTier);
        await applySortQuietly(nextTier ? `${button.textContent.trim()} 티어에 넣었습니다.` : '미분류로 옮겼습니다.');
        render();
        focusChannelTier(channel.id, nextTier);
      });
    });
  });

  return card;
}

async function setChannelTier(channel, tierId) {
  if (tierId) {
    await store.assignTier(channel.id, tierId);
    return;
  }
  await store.setStarred(channel.id, true, channel);
  await store.assignTier(channel.id, '');
}

function attachDropZone(zone) {
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('drag-over');
    scheduleDragAutoScroll(event);
    const targetCard = event.target.closest?.('.streamer-card');
    zone.querySelectorAll('.streamer-card').forEach(card => card.classList.remove('drop-before', 'drop-after'));
    if (targetCard && targetCard.dataset.channelId !== draggedId) {
      targetCard.classList.add(dropBeforeCard(event, targetCard) ? 'drop-before' : 'drop-after');
    }
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
    zone.querySelectorAll('.streamer-card').forEach(card => card.classList.remove('drop-before', 'drop-after'));
    stopDragAutoScroll();
  });
  zone.addEventListener('drop', async (event) => {
    event.preventDefault();
    stopDragAutoScroll();
    zone.classList.remove('drag-over');
    zone.querySelectorAll('.streamer-card').forEach(card => card.classList.remove('drop-before', 'drop-after'));
    if (!draggedId || isWorking) return;
    const nextTier = zone.dataset.tierId || '';
    await runExclusive(nextTier ? '티어를 변경하는 중입니다.' : '미분류로 옮기는 중입니다.', async () => {
      await moveDraggedChannel(zone, event, draggedId, nextTier);
      draggedId = null;
      await applySortQuietly(nextTier ? '티어를 변경했습니다.' : '미분류로 옮겼습니다.');
      render();
    });
  });
}

async function moveDraggedChannel(zone, event, channelId, nextTier) {
  await store.ensureLoaded();
  const channel = store.state.channels[channelId] || { id: channelId, name: channelId, href: `/live/${channelId}` };

  if (nextTier) {
    await store.assignTier(channelId, nextTier);
    const ids = orderedDropIds(zone, event, channelId);
    await store.reorderTier(nextTier, ids);
    return;
  }

  await store.setStarred(channelId, true, channel);
  await store.assignTier(channelId, '');
}

function orderedDropIds(zone, event, channelId) {
  const cards = Array.from(zone.querySelectorAll('.streamer-card'))
    .map(card => card.dataset.channelId)
    .filter(id => id && id !== channelId);
  const targetCard = event.target.closest?.('.streamer-card');
  return window.ChzzkSidebarDnd.computeOrderedDropIds(
    cards,
    channelId,
    targetCard?.dataset.channelId || '',
    !!(targetCard && targetCard.dataset.channelId !== channelId && dropBeforeCard(event, targetCard))
  );
}

function dropBeforeCard(event, card) {
  const rect = card.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2;
}

function emptyNode(text) {
  const element = document.createElement('div');
  element.className = 'empty';
  element.textContent = text;
  return element;
}

function tierButtons(activeTierId) {
  const tiers = (store.state.tiers || []).slice().sort((a, b) => a.order - b.order);
  return [
    ...tiers.map((tier) => {
      const active = activeTierId === tier.id;
      const color = safeTierColor(tier.color);
      return `<button class="tier-chip ${active ? 'active' : ''}" type="button" data-tier-choice="${escapeAttr(tier.id)}" style="--tier-color:${color}" title="${escapeAttr(tier.label)} 티어" aria-label="${escapeAttr(tier.label)} 티어로 배정" aria-pressed="${active}">${escapeText(tier.label)}</button>`;
    }),
    `<button class="tier-chip ${!activeTierId ? 'active' : ''}" type="button" data-tier-choice="" title="미분류" aria-label="미분류로 배정" aria-pressed="${!activeTierId}">미분류</button>`
  ].join('');
}

function cardMetaText(channel, tierId, action) {
  if (tierId) return `${tierId.toUpperCase()} 티어`;
  if (action === 'remove') return '미분류 즐겨찾기';
  if (channel.activityEnabled) return channel.liveStatus === 'live' ? '활동 추적 중 · 라이브' : '활동 추적 중';
  if (detectedIds.includes(channel.id)) return channel.isLive ? '라이브 채널' : '감지된 채널';
  return '저장된 채널';
}

function renderActivity() {
  if (!els.activityList || !els.activityCount) return;
  const events = activityState.events || [];
  const streamers = activityState.streamers || [];
  const settings = normalizeActivitySettings(activityState.settings);
  els.activityCount.textContent = String(streamers.length);
  if (els.activityMonitorToggleBtn) {
    const isMonitoring = settings.isMonitoring !== false;
    els.activityMonitorToggleBtn.textContent = isMonitoring ? '자동 추적 켜짐' : '자동 추적 꺼짐';
    els.activityMonitorToggleBtn.setAttribute('aria-pressed', String(isMonitoring));
  }
  if (els.activityIntervalInput && document.activeElement !== els.activityIntervalInput) {
    els.activityIntervalInput.value = String(settings.intervalMinutes);
  }
  if (els.activityNotifyLiveStartInput) els.activityNotifyLiveStartInput.checked = settings.notifyLiveStart !== false;
  if (els.activityNotifyTitleInput) els.activityNotifyTitleInput.checked = settings.notifyTitleChange !== false;
  if (els.activityNotifyCafeInput) els.activityNotifyCafeInput.checked = settings.notifyCafePosts !== false;
  els.activityList.textContent = '';
  if (!streamers.length && !events.length) {
    els.activityList.appendChild(emptyNode('추적 채널 없음'));
    return;
  }
  streamers.forEach((streamer) => {
    const liveState = activityState.states?.[streamer.channelId] || {};
    const item = document.createElement('div');
    item.className = 'activity-item streamer-activity-row';
    item.dataset.channelId = streamer.channelId || '';
    item.innerHTML = `
      <div class="activity-copy">
        <strong>${escapeText(streamer.name || liveState.channelName || streamer.channelId || '스트리머')}</strong>
        <span>${escapeText(activitySummaryText(streamer, liveState))}</span>
      </div>
      <div class="activity-notification-controls" aria-label="${escapeAttr(streamer.name || streamer.channelId || '스트리머')} 알림 설정">
        ${activityNotificationToggle(streamer, 'liveStart', '방송')}
        ${activityNotificationToggle(streamer, 'titleChange', '제목')}
        ${activityNotificationToggle(streamer, 'cafePosts', '카페')}
      </div>
      <div class="activity-row-actions">
        <button class="tiny" type="button" data-activity-toggle="${escapeAttr(streamer.id || streamer.channelId)}" aria-pressed="${streamer.enabled !== false}">${streamer.enabled === false ? '켜기' : '끄기'}</button>
        <button class="tiny danger-text" type="button" data-activity-remove="${escapeAttr(streamer.id || streamer.channelId)}">삭제</button>
      </div>
    `;
    item.querySelector('[data-activity-toggle]')?.addEventListener('click', () => updateActivityStreamer(streamer.id || streamer.channelId, streamer.enabled === false));
    item.querySelector('[data-activity-remove]')?.addEventListener('click', () => removeActivityStreamer(streamer.id || streamer.channelId));
    item.querySelectorAll('[data-activity-notification]').forEach((input) => {
      input.addEventListener('change', () => updateActivityStreamerNotifications(streamer.id || streamer.channelId, {
        [input.dataset.activityNotification]: !!input.checked
      }));
    });
    els.activityList.appendChild(item);
  });
  events.slice(0, 5).forEach((event) => {
    const item = document.createElement('a');
    item.className = 'activity-item';
    item.href = event.url || '#';
    item.target = '_blank';
    item.rel = 'noreferrer';
    item.innerHTML = `
      <strong>${escapeText(event.title || '새 활동')}</strong>
      <span>${escapeText(event.message || event.createdAt || '')}</span>
    `;
    els.activityList.appendChild(item);
  });
}

function scheduleDragAutoScroll(event) {
  const delta = window.ChzzkSidebarDnd.computeAutoScrollDelta(
    event.clientY,
    window.innerHeight || document.documentElement.clientHeight
  );
  dragAutoScrollDelta = delta;
  if (!delta) {
    stopDragAutoScroll();
    return;
  }

  if (dragAutoScrollTimer) return;
  dragAutoScrollTimer = window.setInterval(() => {
    window.scrollBy({ top: dragAutoScrollDelta, left: 0, behavior: 'auto' });
  }, 50);
}

function stopDragAutoScroll() {
  if (!dragAutoScrollTimer) return;
  window.clearInterval(dragAutoScrollTimer);
  dragAutoScrollTimer = null;
  dragAutoScrollDelta = 0;
}

function activitySummaryText(streamer, liveState) {
  const parts = [];
  if (streamer.channelId) parts.push(liveState.isLive ? '방송 중' : '방송 꺼짐');
  if (streamer.cafe?.cafeName) parts.push(`카페 ${streamer.cafe.cafeRealName || streamer.cafe.cafeName}`);
  return parts.length ? parts.join(' · ') : '연결 없음';
}

function activityNotificationToggle(streamer, key, label) {
  const checked = streamer.notifications?.[key] !== false ? ' checked' : '';
  return `
    <label class="activity-notification-toggle">
      <input type="checkbox" data-activity-notification="${escapeAttr(key)}"${checked}>
      <span>${escapeText(label)}</span>
    </label>
  `;
}

function defaultActivitySettings() {
  return {
    intervalMinutes: 5,
    isMonitoring: true,
    notifyLiveStart: true,
    notifyTitleChange: true,
    notifyCafePosts: true
  };
}

function normalizeActivitySettings(value) {
  const settings = { ...defaultActivitySettings(), ...(value || {}) };
  settings.intervalMinutes = Math.max(1, Math.min(60, Number(settings.intervalMinutes) || 5));
  settings.isMonitoring = settings.isMonitoring !== false;
  settings.notifyLiveStart = settings.notifyLiveStart !== false;
  settings.notifyTitleChange = settings.notifyTitleChange !== false;
  settings.notifyCafePosts = settings.notifyCafePosts !== false;
  return settings;
}

async function updateActivitySettings(settings) {
  await runExclusive('활동 추적 설정을 저장하는 중입니다.', async () => {
    const response = await platform.sendRuntimeMessage?.({ type: 'ACTIVITY_SAVE_SETTINGS', settings }).catch(error => ({ ok: false, error: error.message || String(error) }));
    if (!response?.ok) {
      els.connectionText.textContent = '활동 추적 설정을 저장하지 못했습니다.';
      renderActivity();
      return false;
    }
    activityState = {
      ...activityState,
      settings: normalizeActivitySettings(response.settings)
    };
    els.connectionText.textContent = '활동 추적 설정을 저장했습니다.';
    render();
    return true;
  });
}

async function updateActivityStreamer(id, enabled) {
  await runExclusive('추적 상태를 저장하는 중입니다.', async () => {
    const response = await platform.sendRuntimeMessage?.({ type: 'ACTIVITY_TOGGLE_STREAMER', id, enabled }).catch(error => ({ ok: false, error: error.message || String(error) }));
    if (!response?.ok) {
      els.connectionText.textContent = '추적 상태를 저장하지 못했습니다.';
      return false;
    }
    await loadActivityState();
    render();
    return true;
  });
}

async function updateActivityStreamerNotifications(id, notifications) {
  await runExclusive('스트리머 알림 설정을 저장하는 중입니다.', async () => {
    const response = await platform.sendRuntimeMessage?.({ type: 'ACTIVITY_UPDATE_STREAMER_NOTIFICATIONS', id, notifications }).catch(error => ({ ok: false, error: error.message || String(error) }));
    if (!response?.ok) {
      els.connectionText.textContent = '스트리머 알림 설정을 저장하지 못했습니다.';
      return false;
    }
    await loadActivityState();
    render();
    return true;
  });
}

async function removeActivityStreamer(id) {
  await runExclusive('추적 채널을 삭제하는 중입니다.', async () => {
    const response = await platform.sendRuntimeMessage?.({ type: 'ACTIVITY_REMOVE_STREAMER', id }).catch(error => ({ ok: false, error: error.message || String(error) }));
    if (!response?.ok) {
      els.connectionText.textContent = '추적 채널을 삭제하지 못했습니다.';
      return false;
    }
    await loadActivityState();
    render();
    return true;
  });
}

function favoriteIcon(action) {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"></path>
    </svg>
  `;
}

function focusChannelMini(channelId, scopeSelector) {
  setTimeout(() => {
    const root = document.querySelector(scopeSelector) || document;
    root.querySelector(`[data-channel-id="${cssEscape(channelId)}"] .mini`)?.focus();
  }, 0);
}

function focusChannelTier(channelId, tierId) {
  setTimeout(() => {
    const root = tierId
      ? document.querySelector(`.drop-zone[data-tier-id="${cssEscape(tierId)}"]`)
      : document.getElementById('unassignedList');
    const card = (root || document).querySelector(`[data-channel-id="${cssEscape(channelId)}"]`);
    const selector = tierId ? `[data-tier-choice="${cssEscape(tierId)}"]` : '[data-tier-choice=""]';
    card?.querySelector(selector)?.focus();
  }, 0);
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, '\\$&');
}

function channelRank(channel) {
  const detectedIndex = detectedIds.indexOf(channel.id);
  if (detectedIndex >= 0) return detectedIndex;
  return 1000000000 - (channel.lastSeenAt || 0);
}

function hasAssignments(state) {
  return Object.keys(state.assignments || {}).length > 0;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return escapeText(value).replace(/`/g, '&#96;');
}

function safeTierColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#7bd88f';
}
