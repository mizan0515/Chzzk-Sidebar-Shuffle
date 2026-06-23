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
  notifyCafePosts: true,
  disableLiveChatInput: false,
  disableLiveDonationButtons: false
};
const ACTIVITY_KEYS = {
  streamers: 'satChzzkStreamers',
  states: 'satChzzkStates',
  events: 'satEvents',
  settings: 'satSettings',
  lastRun: 'satLastRun',
  schemaVersion: 'satSchemaVersion',
  cafeSubscriptions: 'satCafeSubscriptions',
  cafeLastSeen: 'satCafeLastSeen',
  cafeCursors: 'satCafeCursors',
  cafeRecovery: 'satCafeRecovery'
};
const ACTIVITY_SCHEMA_VERSION = 2;
const CAFE_RECOVERY_VERSION = 1;
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
    case 'ACTIVITY_REMOVE_EVENT':
      return removeActivityEvent(message.id);
    case 'ACTIVITY_TOGGLE_STREAMER':
      return toggleActivityStreamer(message.id, message.enabled);
    case 'ACTIVITY_UPDATE_STREAMER_NOTIFICATIONS':
      return updateActivityStreamerNotifications(message.id, message.notifications || {});
    case 'ACTIVITY_RUN_NOW':
      return runActivityCheck('manual');
    default:
      return { ok: false, error: 'Unknown activity message' };
  }
}

async function getActivityState() {
  await migrateActivityStateIfNeeded();
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

async function migrateActivityStateIfNeeded() {
  const core = globalThis.StreamerActivityCore;
  if (!core?.migrateToStreamerUnits) return;
  const result = await storageGet([
    ACTIVITY_KEYS.schemaVersion,
    ACTIVITY_KEYS.streamers,
    ACTIVITY_KEYS.cafeSubscriptions
  ]);
  const version = Number(result?.[ACTIVITY_KEYS.schemaVersion]) || 0;
  if (version >= ACTIVITY_SCHEMA_VERSION) return;

  const streamers = Array.isArray(result?.[ACTIVITY_KEYS.streamers]) ? result[ACTIVITY_KEYS.streamers] : [];
  const cafeSubscriptions = Array.isArray(result?.[ACTIVITY_KEYS.cafeSubscriptions]) ? result[ACTIVITY_KEYS.cafeSubscriptions] : [];
  const migrated = dedupeActivityUnits(core.migrateToStreamerUnits(streamers, cafeSubscriptions));
  await storageSet({
    [ACTIVITY_KEYS.streamers]: migrated,
    [ACTIVITY_KEYS.schemaVersion]: ACTIVITY_SCHEMA_VERSION
  });
}

function normalizeActivitySettings(value) {
  const settings = { ...DEFAULT_ACTIVITY_SETTINGS, ...(value || {}) };
  settings.intervalMinutes = Math.max(1, Math.min(60, Number(settings.intervalMinutes) || DEFAULT_ACTIVITY_SETTINGS.intervalMinutes));
  settings.isMonitoring = settings.isMonitoring !== false;
  settings.notifyLiveStart = settings.notifyLiveStart !== false;
  settings.notifyTitleChange = settings.notifyTitleChange !== false;
  settings.notifyCafePosts = settings.notifyCafePosts !== false;
  settings.disableLiveChatInput = settings.disableLiveChatInput === true;
  settings.disableLiveDonationButtons = settings.disableLiveDonationButtons === true;
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
  if (built.unit.channelId && !built.unit.profileImageUrl) {
    built.unit.profileImageUrl = await fetchChzzkChannelProfile(built.unit.channelId);
  }
  const state = await getActivityState();
  const streamers = upsertActivityUnit(state.streamers, built.unit);
  await storageSet({ [ACTIVITY_KEYS.streamers]: streamers });
  return { ok: true, streamers };
}

async function removeActivityStreamer(id) {
  const state = await getActivityState();
  const streamers = state.streamers.filter(item => item.id !== id && item.channelId !== id);
  await storageSet({ [ACTIVITY_KEYS.streamers]: streamers });
  return { ok: true, streamers };
}

async function removeActivityEvent(id) {
  const state = await getActivityState();
  const events = (state.events || []).filter(item => item.id !== id);
  await storageSet({ [ACTIVITY_KEYS.events]: events });
  return { ok: true, events };
}

async function toggleActivityStreamer(id, enabled) {
  const state = await getActivityState();
  const streamers = state.streamers.map(item =>
    item.id === id || item.channelId === id ? { ...item, enabled: enabled !== false } : item
  );
  await storageSet({ [ACTIVITY_KEYS.streamers]: streamers });
  return { ok: true, streamers };
}

async function updateActivityStreamerNotifications(id, notifications) {
  const state = await getActivityState();
  const streamers = state.streamers.map((item) => {
    if (item.id !== id && item.channelId !== id) return item;
    return {
      ...item,
      notifications: normalizeStreamerNotificationSettings({
        ...(item.notifications || {}),
        ...(notifications || {})
      })
    };
  });
  await storageSet({ [ACTIVITY_KEYS.streamers]: streamers });
  return { ok: true, streamers };
}

function normalizeStreamerNotificationSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  return {
    liveStart: settings.liveStart !== false,
    titleChange: settings.titleChange !== false,
    cafePosts: settings.cafePosts !== false
  };
}

function upsertActivityUnit(units, unit) {
  const next = [];
  let merged = null;
  for (const item of units || []) {
    if (isSameActivityUnit(item, unit)) {
      merged = mergeActivityUnit(item, merged || unit);
      continue;
    }
    next.push(item);
  }
  next.push(merged || unit);
  return dedupeActivityUnits(next);
}

function dedupeActivityUnits(units) {
  return (units || []).reduce((next, unit) => upsertActivityUnitNoRecurse(next, unit), []);
}

function upsertActivityUnitNoRecurse(units, unit) {
  const next = [];
  let merged = null;
  for (const item of units || []) {
    if (isSameActivityUnit(item, unit)) {
      merged = mergeActivityUnit(item, merged || unit);
      continue;
    }
    next.push(item);
  }
  next.push(merged || unit);
  return next;
}

function mergeActivityUnit(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    createdAt: existing.createdAt || incoming.createdAt,
    channelId: incoming.channelId || existing.channelId || null,
    cafe: incoming.cafe || existing.cafe || null,
    profileImageUrl: incoming.profileImageUrl || existing.profileImageUrl || '',
    enabled: incoming.enabled !== false && existing.enabled !== false,
    notifications: normalizeStreamerNotificationSettings({
      ...(incoming.notifications || {}),
      ...(existing.notifications || {})
    })
  };
}

function isSameActivityUnit(left, right) {
  if (!left || !right) return false;
  if (left.channelId && right.channelId && left.channelId === right.channelId) return true;
  const leftCafe = activityCafeKey(left);
  const rightCafe = activityCafeKey(right);
  if (leftCafe && leftCafe === rightCafe) return true;
  return shouldMergeComplementaryActivityUnit(left, right);
}

function shouldMergeComplementaryActivityUnit(left, right) {
  const leftName = normalizeText(left.name).toLowerCase();
  const rightName = normalizeText(right.name).toLowerCase();
  if (!leftName || leftName !== rightName) return false;

  const leftHasChannel = !!left.channelId;
  const rightHasChannel = !!right.channelId;
  const leftHasCafe = !!activityCafeKey(left);
  const rightHasCafe = !!activityCafeKey(right);
  return (leftHasChannel && !leftHasCafe && !rightHasChannel && rightHasCafe) ||
    (!leftHasChannel && leftHasCafe && rightHasChannel && !rightHasCafe);
}

function activityCafeKey(unit) {
  const cafeName = normalizeText(unit?.cafe?.cafeName).toLowerCase();
  const nickname = normalizeText(unit?.cafe?.nickname).toLowerCase();
  return cafeName && nickname ? `${cafeName}:${nickname}` : '';
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
  const nextStreamers = (state.streamers || []).map(streamer => ({ ...streamer }));
  const errors = [];
  let checked = 0;
  let streamersChanged = false;

  for (const streamer of nextStreamers.filter(item => item.enabled !== false && item.channelId)) {
    try {
      const live = await fetchChzzkLiveStatus(streamer.channelId);
      const current = core.normalizeChzzkLiveStatus(live, streamer.channelId);
      if (!current.channelName && streamer.name) current.channelName = streamer.name;
      if (current.profileImageUrl && current.profileImageUrl !== streamer.profileImageUrl) {
        streamer.profileImageUrl = current.profileImageUrl;
        streamersChanged = true;
      } else if (!streamer.profileImageUrl) {
        const seeded = await fetchChzzkChannelProfile(streamer.channelId);
        if (seeded) {
          streamer.profileImageUrl = seeded;
          streamersChanged = true;
        }
      }
      const previous = previousStates[streamer.channelId];
      const events = core.detectChzzkEvents(previous, current, {
        notifyLiveStart: state.settings?.notifyLiveStart !== false && streamer.notifications?.liveStart !== false,
        notifyTitleChange: state.settings?.notifyTitleChange !== false && streamer.notifications?.titleChange !== false,
        profileImageUrl: streamer.profileImageUrl || current.profileImageUrl
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

  const cafeResult = await checkCafeActivity({ ...state, streamers: nextStreamers }).catch((error) => {
    errors.push(error.message || String(error));
    return { checked: 0, events: [] };
  });
  checked += cafeResult.checked || 0;
  for (const event of cafeResult.events || []) {
    nextEvents.unshift(event);
  }

  const trimmedEvents = nextEvents.slice(0, 80);
  const lastRun = { checkedAt: new Date().toISOString(), reason, errors };
  const writes = {
    [ACTIVITY_KEYS.states]: nextStates,
    [ACTIVITY_KEYS.events]: trimmedEvents,
    [ACTIVITY_KEYS.lastRun]: lastRun
  };
  if (streamersChanged || cafeResult.streamersChanged) {
    writes[ACTIVITY_KEYS.streamers] = cafeResult.streamers || nextStreamers;
  }
  await storageSet(writes);
  return { ok: true, checked, states: nextStates, events: trimmedEvents, settings: state.settings, lastRun };
}

async function checkCafeActivity(state) {
  const core = globalThis.StreamerActivityCore;
  if (state.settings?.notifyCafePosts === false || !core?.selectNewCafeArticles) {
    return { checked: 0, events: [] };
  }
  const cafeUnits = (state.streamers || []).filter(unit =>
    unit.enabled !== false &&
    unit.notifications?.cafePosts !== false &&
    unit.cafe?.cafeName &&
    unit.cafe?.nickname
  );
  if (!cafeUnits.length) return { checked: 0, events: [] };

  const stored = await storageGet([
    ACTIVITY_KEYS.cafeLastSeen,
    ACTIVITY_KEYS.cafeCursors,
    ACTIVITY_KEYS.cafeRecovery,
    ACTIVITY_KEYS.streamers
  ]);
  const lastSeen = stored?.[ACTIVITY_KEYS.cafeLastSeen] || {};
  const cafeCursors = stored?.[ACTIVITY_KEYS.cafeCursors] || {};
  const cafeRecovery = stored?.[ACTIVITY_KEYS.cafeRecovery] || {};
  const streamers = Array.isArray(state.streamers) ? state.streamers : stored?.[ACTIVITY_KEYS.streamers];
  const nextSeen = { ...lastSeen };
  const nextCursors = { ...cafeCursors };
  const nextRecovery = {
    version: CAFE_RECOVERY_VERSION,
    done: cafeRecovery.version === CAFE_RECOVERY_VERSION && cafeRecovery.done ? { ...cafeRecovery.done } : {}
  };
  const nextStreamers = streamers.map(unit => ({ ...unit, cafe: unit.cafe ? { ...unit.cafe } : null }));
  const events = [];
  const fetchedByCafe = new Map();
  const recentByCafe = new Map();
  let checked = 0;
  let recoveryChanged = cafeRecovery.version !== CAFE_RECOVERY_VERSION;
  let streamersChanged = false;

  for (const unit of nextStreamers) {
    if (
      unit.enabled === false ||
      unit.notifications?.cafePosts === false ||
      !unit.cafe?.cafeName ||
      !unit.cafe?.nickname
    ) continue;
    const cafe = unit.cafe;
    if (!cafe.cafeId || isLikelyMojibake(cafe.cafeRealName)) {
      const info = await resolveCafeInfo(cafe.cafeName);
      if (!cafe.cafeId) {
        cafe.cafeId = info.cafeId || '';
        streamersChanged = true;
      }
      if (info.cafeRealName && !isLikelyMojibake(info.cafeRealName)) {
        cafe.cafeRealName = info.cafeRealName;
        streamersChanged = true;
      } else if (!cafe.cafeRealName) {
        cafe.cafeRealName = cafe.cafeName;
        streamersChanged = true;
      }
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
    const emittedIds = new Set(emitted.map(article => article.articleId).filter(Boolean));
    nextSeen[seenKey] = matched.map(article => article.articleId);
    for (const article of emitted) {
      const event = await notifyCafeArticle(unit, cafe, article);
      events.push(event);
    }
    const recoveryKey = `${unit.id || seenKey}:${cursorKey}:${cafe.nickname}`;
    if (!nextRecovery.done[recoveryKey]) {
      let recoveryArticle = matched[0];
      if (!recoveryArticle) {
        if (!recentByCafe.has(cursorKey)) {
          recentByCafe.set(cursorKey, fetchCafeRecentArticles(cafe, CAFE_CATCHUP_PAGES));
        }
        const recentResult = await recentByCafe.get(cursorKey);
        recoveryArticle = recentResult.articles
          .map(normalizeCafeArticle)
          .find(article => article.articleId && article.author === cafe.nickname);
      }
      if (recoveryArticle && !emittedIds.has(recoveryArticle.articleId)) {
        const event = await notifyCafeArticle(unit, cafe, recoveryArticle);
        events.push(event);
      }
      nextRecovery.done[recoveryKey] = new Date().toISOString();
      recoveryChanged = true;
    }
    checked += 1;
  }

  const writes = {
    [ACTIVITY_KEYS.cafeLastSeen]: nextSeen,
    [ACTIVITY_KEYS.cafeCursors]: nextCursors,
    [ACTIVITY_KEYS.streamers]: nextStreamers
  };
  if (recoveryChanged) writes[ACTIVITY_KEYS.cafeRecovery] = nextRecovery;
  await storageSet(writes);
  return { checked, events, streamersChanged, streamers: nextStreamers };
}

async function resolveCafeInfo(cafeName) {
  const response = await fetch(`https://cafe.naver.com/${encodeURIComponent(cafeName)}?cafe_bot=true&t=${Date.now()}`, {
    credentials: 'omit',
    cache: 'no-store'
  });
  const html = await readCafeHtml(response);
  const idMatch = html.match(/(?:"clubId"\s*:\s*|clubid=|"cafeId"\s*:\s*)(\d+)/i);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return {
    cafeId: idMatch ? idMatch[1] : '',
    cafeRealName: titleMatch ? titleMatch[1].replace(/\s*:\s*네이버 카페\s*$/i, '').trim() : cafeName
  };
}

async function readCafeHtml(response) {
  if (!response?.arrayBuffer) {
    return response?.text ? response.text() : '';
  }
  const buffer = await response.arrayBuffer();
  const headerCharset = response.headers?.get?.('content-type')?.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const asciiHead = new TextDecoder('ascii').decode(buffer.slice(0, 4096));
  const metaCharset = asciiHead.match(/charset=["']?\s*([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
  const charset = cafeCharsetLabel(headerCharset || metaCharset || 'utf-8');
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function cafeCharsetLabel(charset) {
  const label = String(charset || '').toLowerCase();
  return /^(ms949|cp949|ksc5601|ks_c_5601-1987|euc-?kr|windows-949|x-windows-949)$/.test(label)
    ? 'euc-kr'
    : (label || 'utf-8');
}

function isLikelyMojibake(value) {
  const text = String(value || '');
  if (!text) return false;
  if (text.includes('�')) return true;
  const suspect = (text.match(/[\u0080-\u00ff]/g) || []).length;
  const hangul = (text.match(/[가-힣]/g) || []).length;
  return suspect >= 2 && hangul === 0;
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

async function fetchCafeRecentArticles(cafe, pageLimit) {
  const articles = [];
  let newestArticleId = '';
  const maxPages = Math.max(1, Math.min(CAFE_CATCHUP_PAGES, Number(pageLimit) || 1));
  for (let page = 1; page <= maxPages; page += 1) {
    const content = await fetchCafeArticlePage(cafe, page);
    const pageArticles = content.articleList || content.articles || [];
    if (!pageArticles.length) break;
    if (!newestArticleId) {
      newestArticleId = normalizeText(pageArticles[0].articleId || pageArticles[0].id || pageArticles[0].articleNo);
    }
    articles.push(...pageArticles);
    if (content.hasNext === false || pageArticles.length < CAFE_PAGE_SIZE) break;
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
  const pollingResponse = await fetch(`https://api.chzzk.naver.com/polling/v2/channels/${encodeURIComponent(channelId)}/live-status`, {
    credentials: 'omit',
    cache: 'no-store'
  });
  if (pollingResponse.ok) {
    const payload = await pollingResponse.json();
    if (payload?.code === 200 && payload?.content) return payload;
    return { content: { status: 'CLOSED' } };
  }

  const detailResponse = await fetch(`https://api.chzzk.naver.com/service/v2/channels/${encodeURIComponent(channelId)}/live-detail`, {
    credentials: 'omit',
    cache: 'no-store'
  });
  if (!detailResponse.ok) return { content: { status: 'CLOSED' } };
  return detailResponse.json();
}

async function fetchChzzkChannelProfile(channelId) {
  try {
    const response = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${encodeURIComponent(channelId)}`, {
      credentials: 'omit',
      cache: 'no-store'
    });
    if (!response.ok) return '';
    const payload = await response.json();
    return normalizeText(payload?.content?.channelImageUrl);
  } catch {
    return '';
  }
}

async function copyTimecodeFromActiveTab() {
  const tabsApi = apiWith('tabs.query')?.tabs;
  const tabs = await promisify(tabsApi?.query, tabsApi, { active: true, currentWindow: true });
  const tab = Array.isArray(tabs) ? tabs[0] : null;
  if (!tab?.id || !/^https?:\/\/chzzk\.naver\.com\//.test(tab.url || '')) return;
  const response = await promisify(tabsApi?.sendMessage, tabsApi, tab.id, { type: 'COPY_TIMECODE' }).catch(() => null);
  if (response?.ok) return;
}
