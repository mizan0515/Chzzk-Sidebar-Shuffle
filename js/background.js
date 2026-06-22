try {
  importScripts('activityCore.js');
} catch (error) {
  console.warn('[ACTIVITY] activityCore unavailable', error);
}

const chromeApi = globalThis.chrome;
const ACTIVITY_ALARM_NAME = 'chzzkFavoritesActivityCheck';
const DEFAULT_ACTIVITY_SETTINGS = {
  intervalMinutes: 5,
  isMonitoring: true,
  notifyLiveStart: true,
  notifyTitleChange: true,
  notifyCafePosts: true
};
const ACTIVITY_KEYS = {
  streamers: 'satChzzkStreamers',
  states: 'satChzzkStates',
  events: 'satEvents',
  settings: 'satSettings',
  lastRun: 'satLastRun',
  cafeLastSeen: 'satCafeLastSeen',
  cafeCursors: 'satCafeCursors'
};
const CAFE_PAGE_SIZE = 50;
const CAFE_CATCHUP_PAGES = 2;
const CAFE_HEADER_RULE_ID = 9001;
const openedNotificationIds = new Set();

function apiWith(path) {
  const parts = path.split('.');
  const hasPath = (api) => !!parts.reduce((obj, key) => obj && obj[key], api);
  return hasPath(chromeApi) ? chromeApi : null;
}

function promisify(callbackApi, thisArg, ...args) {
  return new Promise((resolve, reject) => {
    if (!callbackApi) {
      reject(new Error('Extension API is unavailable'));
      return;
    }
    callbackApi.call(thisArg, ...args, (result) => {
      const runtimeError = chromeApi?.runtime?.lastError;
      if (runtimeError) reject(new Error(runtimeError.message || String(runtimeError)));
      else resolve(result);
    });
  });
}

chromeApi?.runtime?.onInstalled?.addListener(() => {
  // Keeps a debuggable extension target available for Chrome action-popup QA.
  ensureActivityMonitoring().catch((error) => console.warn('[ACTIVITY] install setup failed', error));
});

chromeApi?.runtime?.onStartup?.addListener?.(() => {
  ensureActivityMonitoring().catch((error) => console.warn('[ACTIVITY] startup setup failed', error));
});

chromeApi?.alarms?.onAlarm?.addListener?.((alarm) => {
  if (alarm?.name !== ACTIVITY_ALARM_NAME) return;
  runActivityCheck('alarm').catch((error) => console.warn('[ACTIVITY] alarm check failed', error));
});

chromeApi?.notifications?.onClicked?.addListener?.((notificationId) => {
  openActivityNotification(notificationId).catch((error) => console.warn('[ACTIVITY] notification click failed', error));
});

chromeApi?.commands?.onCommand?.addListener?.((command) => {
  if (command !== 'copy-timecode') return;
  copyTimecodeFromActiveTab().catch((error) => {
    console.warn('[TIMECODE] Copy command failed', error);
  });
});

chromeApi?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  if (message?.type?.startsWith?.('ACTIVITY_')) {
    handleActivityMessage(message).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });
    return true;
  }

  if (message?.type !== 'INJECT_CONTENT_SCRIPTS') return false;

  (async () => {
    const scriptingApi = apiWith('scripting.executeScript')?.scripting;
    await promisify(scriptingApi?.executeScript, scriptingApi, {
      target: { tabId: message.tabId },
      files: message.files || []
    });
    sendResponse({ ok: true });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });

  return true;
});

async function storageGet(keys) {
  const store = apiWith('storage.local')?.storage?.local;
  return promisify(store?.get, store, keys);
}

async function storageSet(value) {
  const store = apiWith('storage.local')?.storage?.local;
  return promisify(store?.set, store, value);
}

async function handleActivityMessage(message) {
  switch (message.type) {
    case 'ACTIVITY_GET_STATE':
      return { ok: true, ...(await getActivityState()) };
    case 'ACTIVITY_SAVE_SETTINGS':
      return saveActivitySettings(message.settings || {});
    case 'ACTIVITY_START_MONITORING':
      return saveActivitySettings({ isMonitoring: true });
    case 'ACTIVITY_STOP_MONITORING':
      return saveActivitySettings({ isMonitoring: false });
    case 'ACTIVITY_ADD_STREAMER':
      return addActivityStreamer(message.input || {});
    case 'ACTIVITY_REMOVE_STREAMER':
      return removeActivityStreamer(message.id);
    case 'ACTIVITY_TOGGLE_STREAMER':
      return toggleActivityStreamer(message.id, message.enabled);
    case 'ACTIVITY_RUN_NOW':
      return runActivityCheck('manual');
    default:
      return { ok: false, error: 'Unknown activity message' };
  }
}

async function getActivityState() {
  const result = await storageGet([
    ACTIVITY_KEYS.streamers,
    ACTIVITY_KEYS.states,
    ACTIVITY_KEYS.events,
    ACTIVITY_KEYS.settings,
    ACTIVITY_KEYS.lastRun
  ]);
  return {
    streamers: Array.isArray(result?.[ACTIVITY_KEYS.streamers]) ? result[ACTIVITY_KEYS.streamers] : [],
    states: result?.[ACTIVITY_KEYS.states] || {},
    events: Array.isArray(result?.[ACTIVITY_KEYS.events]) ? result[ACTIVITY_KEYS.events] : [],
    settings: normalizeActivitySettings(result?.[ACTIVITY_KEYS.settings]),
    lastRun: result?.[ACTIVITY_KEYS.lastRun] || null
  };
}

function normalizeActivitySettings(value) {
  const settings = { ...DEFAULT_ACTIVITY_SETTINGS, ...(value || {}) };
  settings.intervalMinutes = Math.max(1, Math.min(60, Number(settings.intervalMinutes) || DEFAULT_ACTIVITY_SETTINGS.intervalMinutes));
  settings.isMonitoring = settings.isMonitoring !== false;
  settings.notifyLiveStart = settings.notifyLiveStart !== false;
  settings.notifyTitleChange = settings.notifyTitleChange !== false;
  settings.notifyCafePosts = settings.notifyCafePosts !== false;
  return settings;
}

async function saveActivitySettings(nextSettings) {
  const current = await getActivityState();
  const settings = normalizeActivitySettings({ ...current.settings, ...nextSettings });
  await storageSet({ [ACTIVITY_KEYS.settings]: settings });
  await configureActivityAlarm(settings);
  return { ok: true, settings };
}

async function ensureActivityMonitoring() {
  const state = await getActivityState();
  await storageSet({ [ACTIVITY_KEYS.settings]: state.settings });
  await ensureCafeRequestRules();
  await configureActivityAlarm(state.settings);
}

async function ensureCafeRequestRules() {
  const dnr = apiWith('declarativeNetRequest.updateDynamicRules')?.declarativeNetRequest;
  if (!dnr?.updateDynamicRules) return;
  const rule = {
    id: CAFE_HEADER_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: 'https://cafe.naver.com' },
        { header: 'Referer', operation: 'set', value: 'https://cafe.naver.com/' }
      ]
    },
    condition: {
      regexFilter: '.*cafe_bot=true.*',
      resourceTypes: ['xmlhttprequest']
    }
  };
  await promisify(dnr.updateDynamicRules, dnr, {
    removeRuleIds: [CAFE_HEADER_RULE_ID],
    addRules: [rule]
  }).catch(() => undefined);
}

async function configureActivityAlarm(settings) {
  const alarms = apiWith('alarms.clear')?.alarms;
  if (!alarms?.clear || !alarms?.create) return;
  await promisify(alarms.clear, alarms, ACTIVITY_ALARM_NAME).catch(() => undefined);
  if (!settings.isMonitoring) return;
  alarms.create(ACTIVITY_ALARM_NAME, {
    delayInMinutes: Math.max(0.05, settings.intervalMinutes),
    periodInMinutes: Math.max(1, settings.intervalMinutes)
  });
}

async function addActivityStreamer(input) {
  const core = globalThis.StreamerActivityCore;
  if (!core?.buildStreamerUnit) return { ok: false, error: 'Activity core unavailable' };
  const built = core.buildStreamerUnit(input);
  if (!built.ok) return { ok: false, error: built.error };
  const state = await getActivityState();
  const existing = state.streamers.filter(item => item.channelId !== built.unit.channelId || !built.unit.channelId);
  const streamers = [...existing, built.unit];
  await storageSet({ [ACTIVITY_KEYS.streamers]: streamers });
  return { ok: true, streamers };
}

async function removeActivityStreamer(id) {
  const state = await getActivityState();
  const streamers = state.streamers.filter(item => item.id !== id && item.channelId !== id);
  await storageSet({ [ACTIVITY_KEYS.streamers]: streamers });
  return { ok: true, streamers };
}

async function toggleActivityStreamer(id, enabled) {
  const state = await getActivityState();
  const streamers = state.streamers.map(item =>
    item.id === id || item.channelId === id ? { ...item, enabled: enabled !== false } : item
  );
  await storageSet({ [ACTIVITY_KEYS.streamers]: streamers });
  return { ok: true, streamers };
}

async function addActivityEvents(events) {
  if (!events?.length) return [];
  const state = await getActivityState();
  const nextEvents = [...events, ...(state.events || [])].slice(0, 80);
  await storageSet({ [ACTIVITY_KEYS.events]: nextEvents });
  return nextEvents;
}

async function notifyActivityEvent(event) {
  const notificationsApi = apiWith('notifications.create')?.notifications;
  await addActivityEvents([event]);
  if (!notificationsApi?.create) return;
  await promisify(notificationsApi.create, notificationsApi, event.id, {
    type: 'basic',
    iconUrl: event.imageUrl || 'assets/icons/icon-128.png',
    title: event.title || 'CHZZK Favorites & Tiers',
    message: event.message || '',
    priority: 1
  }).catch(() => undefined);
}

async function openActivityNotification(notificationId) {
  if (!notificationId || openedNotificationIds.has(notificationId)) return;
  const state = await getActivityState();
  const event = (state.events || []).find(item => item.id === notificationId);
  if (!event?.url || !chromeApi?.tabs?.create) return;
  openedNotificationIds.add(notificationId);
  chromeApi?.notifications?.clear?.(notificationId, () => undefined);
  await chromeApi.tabs.create({ url: event.url });
}

async function runActivityCheck(reason = 'manual') {
  const core = globalThis.StreamerActivityCore;
  if (!core?.normalizeChzzkLiveStatus) return { ok: false, error: 'Activity core unavailable' };
  const state = await getActivityState();
  if (reason === 'alarm' && state.settings?.isMonitoring === false) {
    return { ok: true, skipped: true, checked: 0, states: state.states, events: state.events, lastRun: state.lastRun };
  }
  const previousStates = state.states || {};
  const nextStates = { ...previousStates };
  const nextEvents = [...(state.events || [])];
  const errors = [];
  let checked = 0;

  for (const streamer of state.streamers.filter(item => item.enabled !== false && item.channelId)) {
    try {
      const live = await fetchChzzkLiveStatus(streamer.channelId);
      const current = core.normalizeChzzkLiveStatus(live, streamer.channelId);
      const previous = previousStates[streamer.channelId];
      const events = core.detectChzzkEvents(previous, current, {
        notifyLiveStart: state.settings?.notifyLiveStart,
        notifyTitleChange: state.settings?.notifyTitleChange,
        profileImageUrl: streamer.profileImageUrl
      });
      nextStates[streamer.channelId] = current;
      for (const event of events) {
        await notifyActivityEvent(event);
        nextEvents.unshift(event);
      }
      checked += 1;
    } catch (error) {
      errors.push(`${streamer.name || streamer.channelId}: ${error.message || String(error)}`);
      nextStates[streamer.channelId] = {
        ...(previousStates[streamer.channelId] || {}),
        channelId: streamer.channelId,
        channelName: streamer.name,
        error: error.message || String(error),
        checkedAt: new Date().toISOString()
      };
    }
  }

  const cafeResult = await checkCafeActivity(state).catch((error) => {
    errors.push(error.message || String(error));
    return { checked: 0, events: [] };
  });
  checked += cafeResult.checked || 0;
  for (const event of cafeResult.events || []) {
    nextEvents.unshift(event);
  }

  const trimmedEvents = nextEvents.slice(0, 80);
  const lastRun = { checkedAt: new Date().toISOString(), reason, errors };
  await storageSet({
    [ACTIVITY_KEYS.states]: nextStates,
    [ACTIVITY_KEYS.events]: trimmedEvents,
    [ACTIVITY_KEYS.lastRun]: lastRun
  });
  return { ok: true, checked, states: nextStates, events: trimmedEvents, settings: state.settings, lastRun };
}

async function checkCafeActivity(state) {
  const core = globalThis.StreamerActivityCore;
  if (state.settings?.notifyCafePosts === false || !core?.selectNewCafeArticles) {
    return { checked: 0, events: [] };
  }
  const cafeUnits = (state.streamers || []).filter(unit => unit.enabled !== false && unit.cafe?.cafeName && unit.cafe?.nickname);
  if (!cafeUnits.length) return { checked: 0, events: [] };

  const stored = await storageGet([ACTIVITY_KEYS.cafeLastSeen, ACTIVITY_KEYS.cafeCursors, ACTIVITY_KEYS.streamers]);
  const lastSeen = stored?.[ACTIVITY_KEYS.cafeLastSeen] || {};
  const cafeCursors = stored?.[ACTIVITY_KEYS.cafeCursors] || {};
  const streamers = Array.isArray(stored?.[ACTIVITY_KEYS.streamers]) ? stored[ACTIVITY_KEYS.streamers] : state.streamers;
  const nextSeen = { ...lastSeen };
  const nextCursors = { ...cafeCursors };
  const nextStreamers = streamers.map(unit => ({ ...unit, cafe: unit.cafe ? { ...unit.cafe } : null }));
  const events = [];
  const fetchedByCafe = new Map();
  let checked = 0;

  for (const unit of nextStreamers) {
    if (unit.enabled === false || !unit.cafe?.cafeName || !unit.cafe?.nickname) continue;
    const cafe = unit.cafe;
    if (!cafe.cafeId) {
      const info = await resolveCafeInfo(cafe.cafeName);
      cafe.cafeId = info.cafeId || '';
      cafe.cafeRealName = info.cafeRealName || cafe.cafeRealName || cafe.cafeName;
    }
    if (!cafe.cafeId) continue;
    const cursorKey = cafe.cafeId || cafe.cafeName;
    if (!fetchedByCafe.has(cursorKey)) {
      fetchedByCafe.set(cursorKey, fetchCafeArticlesSince(cafe, nextCursors[cursorKey]));
    }
    const result = await fetchedByCafe.get(cursorKey);
    if (result.newestArticleId) nextCursors[cursorKey] = result.newestArticleId;
    const articles = result.articles.map(normalizeCafeArticle);
    const matched = articles.filter(article => article.articleId && article.author === cafe.nickname);
    const seenKey = `${cafe.cafeName}:${cafe.nickname}`;
    const emitted = core.selectNewCafeArticles(matched, nextSeen[seenKey], unit.createdAt, 5, {
      alreadyOnlyNew: !!cafeCursors[cursorKey]
    });
    nextSeen[seenKey] = matched.map(article => article.articleId);
    for (const article of emitted) {
      const event = await notifyCafeArticle(unit, cafe, article);
      events.push(event);
    }
    checked += 1;
  }

  await storageSet({
    [ACTIVITY_KEYS.cafeLastSeen]: nextSeen,
    [ACTIVITY_KEYS.cafeCursors]: nextCursors,
    [ACTIVITY_KEYS.streamers]: nextStreamers
  });
  return { checked, events };
}

async function resolveCafeInfo(cafeName) {
  const response = await fetch(`https://cafe.naver.com/${encodeURIComponent(cafeName)}?cafe_bot=true&t=${Date.now()}`, {
    credentials: 'omit',
    cache: 'no-store'
  });
  const html = await response.text();
  const idMatch = html.match(/(?:"clubId"\s*:\s*|clubid=|"cafeId"\s*:\s*)(\d+)/i);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return {
    cafeId: idMatch ? idMatch[1] : '',
    cafeRealName: titleMatch ? titleMatch[1].replace(/\s*:\s*네이버 카페\s*$/i, '').trim() : cafeName
  };
}

async function fetchCafeArticlesSince(cafe, lastNewestArticleId) {
  const articles = [];
  let newestArticleId = '';
  const cursor = articleIdNumber(lastNewestArticleId);
  for (let page = 1; page <= CAFE_CATCHUP_PAGES; page += 1) {
    const content = await fetchCafeArticlePage(cafe, page);
    const pageArticles = content.articleList || content.articles || [];
    if (!pageArticles.length) break;
    if (!newestArticleId) {
      newestArticleId = normalizeText(pageArticles[0].articleId || pageArticles[0].id || pageArticles[0].articleNo);
    }
    for (const article of pageArticles) {
      const id = articleIdNumber(article.articleId || article.id || article.articleNo);
      if (cursor > 0 && id <= cursor) {
        return { articles, newestArticleId };
      }
      articles.push(article);
    }
    if (content.hasNext === false) break;
  }
  return { articles, newestArticleId };
}

async function fetchCafeArticlePage(cafe, page) {
  const url = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2.json?search.clubid=${encodeURIComponent(cafe.cafeId)}&search.queryType=lastarticle&search.page=${page}&search.perPage=${CAFE_PAGE_SIZE}&cafe_bot=true&t=${Date.now()}`;
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Naver Cafe API ${response.status}`);
  const payload = await response.json();
  return payload?.message?.result || payload?.result || payload?.content || payload || {};
}

function normalizeCafeArticle(article) {
  return {
    articleId: normalizeText(article.articleId || article.id || article.articleNo),
    author: normalizeText(article.writerNickname || article.writerName || article.memberNickname || article.nickname),
    createdAtMs: Number(article.writeDateTimestamp || article.createdAtMs || 0) || 0,
    title: normalizeText(article.subject || article.title || article.articleTitle),
    url: normalizeText(article.articleUrl || article.url || article.link)
  };
}

async function notifyCafeArticle(unit, cafe, article) {
  const event = {
    id: `cafe_${cafe.cafeName}_${article.articleId}_${Date.now()}`,
    imageUrl: unit.profileImageUrl || 'assets/icons/icon-128.png',
    message: article.title || '새 글이 등록되었습니다.',
    title: `📝 [${cafe.cafeRealName || cafe.cafeName}] ${unit.name || cafe.nickname}님의 새 글`,
    type: 'naver_cafe_post',
    url: article.url || `https://cafe.naver.com/ArticleRead.nhn?clubid=${cafe.cafeId}&articleid=${article.articleId}`,
    createdAt: new Date().toISOString()
  };
  await notifyActivityEvent(event);
  return event;
}

function articleIdNumber(value) {
  const parsed = Number.parseInt(String(value || '').replace(/\D+/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || '').trim();
}

async function fetchChzzkLiveStatus(channelId) {
  const response = await fetch(`https://api.chzzk.naver.com/service/v2/channels/${encodeURIComponent(channelId)}/live-detail`, {
    credentials: 'omit',
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`CHZZK API ${response.status}`);
  return response.json();
}

async function copyTimecodeFromActiveTab() {
  const tabsApi = apiWith('tabs.query')?.tabs;
  const tabs = await promisify(tabsApi?.query, tabsApi, { active: true, currentWindow: true });
  const tab = Array.isArray(tabs) ? tabs[0] : null;
  if (!tab?.id || !/^https?:\/\/chzzk\.naver\.com\//.test(tab.url || '')) return;
  const response = await promisify(tabsApi?.sendMessage, tabsApi, tab.id, { type: 'COPY_TIMECODE' }).catch(() => null);
  if (response?.ok) return;
}
