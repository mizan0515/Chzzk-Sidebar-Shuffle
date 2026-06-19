try {
  importScripts('activityCore.js');
} catch (error) {
  console.warn('[ACTIVITY] activityCore unavailable', error);
}

const primaryApi = globalThis.whale || globalThis.chrome;
const chromeApi = globalThis.chrome;
const ACTIVITY_KEYS = {
  streamers: 'satChzzkStreamers',
  states: 'satChzzkStates',
  events: 'satEvents',
  settings: 'satSettings',
  lastRun: 'satLastRun'
};

function apiWith(path) {
  const parts = path.split('.');
  const hasPath = (api) => !!parts.reduce((obj, key) => obj && obj[key], api);
  return hasPath(primaryApi) ? primaryApi : chromeApi;
}

function promisify(callbackApi, thisArg, ...args) {
  return new Promise((resolve, reject) => {
    if (!callbackApi) {
      reject(new Error('Extension API is unavailable'));
      return;
    }
    callbackApi.call(thisArg, ...args, (result) => {
      const runtimeError = primaryApi?.runtime?.lastError || chromeApi?.runtime?.lastError;
      if (runtimeError) reject(new Error(runtimeError.message || String(runtimeError)));
      else resolve(result);
    });
  });
}

primaryApi?.runtime?.onInstalled?.addListener(() => {
  // Keeps a debuggable extension target available for Whale sidebar validation.
});

(primaryApi?.commands || chromeApi?.commands)?.onCommand?.addListener?.((command) => {
  if (command !== 'copy-timecode') return;
  copyTimecodeFromActiveTab().catch((error) => {
    console.warn('[TIMECODE] Copy command failed', error);
  });
});

(primaryApi?.runtime || chromeApi?.runtime)?.onMessage?.addListener((message, sender, sendResponse) => {
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
    case 'ACTIVITY_ADD_STREAMER':
      return addActivityStreamer(message.input || {});
    case 'ACTIVITY_REMOVE_STREAMER':
      return removeActivityStreamer(message.id);
    case 'ACTIVITY_TOGGLE_STREAMER':
      return toggleActivityStreamer(message.id, message.enabled);
    case 'ACTIVITY_RUN_NOW':
      return runActivityCheck();
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
    settings: result?.[ACTIVITY_KEYS.settings] || {},
    lastRun: result?.[ACTIVITY_KEYS.lastRun] || null
  };
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

async function runActivityCheck() {
  const core = globalThis.StreamerActivityCore;
  if (!core?.normalizeChzzkLiveStatus) return { ok: false, error: 'Activity core unavailable' };
  const state = await getActivityState();
  const previousStates = state.states || {};
  const nextStates = { ...previousStates };
  const nextEvents = [...(state.events || [])];
  let checked = 0;

  for (const streamer of state.streamers.filter(item => item.enabled !== false && item.channelId)) {
    try {
      const live = await fetchChzzkLiveStatus(streamer.channelId);
      const current = core.normalizeChzzkLiveStatus(live, streamer.channelId);
      const previous = previousStates[streamer.channelId];
      const events = core.detectChzzkEvents(previous, current, {
        notifyLiveStart: state.settings.notifyLiveStart,
        notifyTitleChange: state.settings.notifyTitleChange,
        profileImageUrl: streamer.profileImageUrl
      });
      nextStates[streamer.channelId] = current;
      nextEvents.unshift(...events);
      checked += 1;
    } catch (error) {
      nextStates[streamer.channelId] = {
        ...(previousStates[streamer.channelId] || {}),
        channelId: streamer.channelId,
        channelName: streamer.name,
        error: error.message || String(error),
        checkedAt: new Date().toISOString()
      };
    }
  }

  const trimmedEvents = nextEvents.slice(0, 80);
  const lastRun = new Date().toISOString();
  await storageSet({
    [ACTIVITY_KEYS.states]: nextStates,
    [ACTIVITY_KEYS.events]: trimmedEvents,
    [ACTIVITY_KEYS.lastRun]: lastRun
  });
  return { ok: true, checked, states: nextStates, events: trimmedEvents, lastRun };
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
