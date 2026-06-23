const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

async function main() {
  const storage = {
    satChzzkStreamers: [
      {
        id: 'alpha-unit',
        name: 'Alpha',
        channelId: '0123456789abcdef0123456789abcdef',
        cafe: null,
        enabled: true,
        notifications: {
          liveStart: false,
          titleChange: true,
          cafePosts: true
        },
        profileImageUrl: 'https://example.test/alpha.png'
      },
      {
        id: 'cafe-unit',
        name: 'Cafe Alpha',
        channelId: null,
        cafe: {
          cafeName: 'alpha-cafe',
          cafeId: '123456',
          cafeRealName: 'Alpha Cafe',
          nickname: 'AlphaWriter'
        },
        enabled: true,
        notifications: {
          liveStart: true,
          titleChange: true,
          cafePosts: false
        },
        createdAt: '2026-06-20T00:00:00.000Z',
        profileImageUrl: 'https://example.test/cafe.png'
      }
    ],
    satCafeSubscriptions: [
      {
        id: 'legacy-cafe',
        name: 'Legacy Cafe',
        cafeName: 'legacy-cafe',
        nickname: 'LegacyWriter',
        notifications: { cafePosts: false },
        createdAt: '2026-06-19T00:00:00.000Z'
      }
    ],
    satChzzkStates: {
      '0123456789abcdef0123456789abcdef': {
        channelId: '0123456789abcdef0123456789abcdef',
        channelName: 'Alpha',
        isLive: false,
        title: '',
        url: 'https://chzzk.naver.com/live/0123456789abcdef0123456789abcdef'
      }
    },
    satEvents: [],
    satSettings: {
      intervalMinutes: 5,
      isMonitoring: true,
      notifyLiveStart: true,
      notifyTitleChange: true,
      notifyCafePosts: true
    },
    satCafeCursors: { '123456': '9' },
    satCafeLastSeen: { 'alpha-cafe:AlphaWriter': [] }
  };
  const createdAlarms = [];
  const notifications = [];
  const openedTabs = [];
  const clearedNotifications = [];
  let notificationClickListener = null;

  const context = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    fetch: async (url) => {
      const text = String(url);
      if (text.includes('ArticleListV2.json')) {
        return {
          ok: true,
          json: async () => ({
            message: {
              result: {
                hasNext: false,
                articleList: [
                  {
                    articleId: 10,
                    writerNickname: 'AlphaWriter',
                    subject: 'Cafe post',
                    writeDateTimestamp: Date.now()
                  }
                ]
              }
            }
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          content: {
            status: 'OPEN',
            liveTitle: 'Live now',
            channel: {
              channelName: 'Alpha',
              channelImageUrl: 'https://example.test/profile.png'
            }
          }
        })
      };
    },
    chrome: {
      runtime: {
        lastError: null,
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onMessage: { addListener() {} }
      },
      commands: { onCommand: { addListener() {} } },
      alarms: {
        onAlarm: { addListener() {} },
        clear(name, callback) {
          createdAlarms.push({ action: 'clear', name });
          callback?.(true);
        },
        create(name, options) {
          createdAlarms.push({ action: 'create', name, options });
        }
      },
      declarativeNetRequest: {
        updateDynamicRules(input, callback) {
          callback?.(input);
        }
      },
      notifications: {
        onClicked: {
          addListener(listener) {
            notificationClickListener = listener;
          }
        },
        clear(id, callback) {
          clearedNotifications.push(id);
          callback?.(true);
        },
        create(id, options, callback) {
          notifications.push({ id, options });
          callback?.(id);
        }
      },
      tabs: {
        create(input, callback) {
          openedTabs.push(input);
          callback?.({ id: 1, ...input });
        }
      },
      storage: {
        local: {
          get(keys, callback) {
            const requested = Array.isArray(keys) ? keys : Object.keys(keys || {});
            const output = {};
            requested.forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(storage, key)) output[key] = storage[key];
            });
            callback(output);
          },
          set(value, callback) {
            Object.assign(storage, value);
            callback?.();
          }
        }
      }
    },
    importScripts(file) {
      const source = readFileSync(join(__dirname, '..', 'js', file), 'utf8');
      vm.runInContext(source, context, { filename: file });
    }
  };
  context.globalThis = context;
  vm.createContext(context);

  const source = readFileSync(join(__dirname, '..', 'js', 'background.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'background.js' });

  const settingsResponse = await context.handleActivityMessage({
    type: 'ACTIVITY_SAVE_SETTINGS',
    settings: { intervalMinutes: 7, notifyTitleChange: false }
  });
  assert.equal(settingsResponse.ok, true);
  assert.equal(settingsResponse.settings.intervalMinutes, 7);
  assert.equal(settingsResponse.settings.notifyTitleChange, false);
  assert.ok(createdAlarms.some(item => item.action === 'create' && item.options.periodInMinutes === 7));
  assert.equal(storage.satSchemaVersion, 2);
  assert.ok(
    storage.satChzzkStreamers.some(unit => unit.cafe?.cafeName === 'legacy-cafe' && unit.cafe?.nickname === 'LegacyWriter'),
    'Legacy cafe subscriptions should migrate into unified activity units'
  );
  assert.equal(
    storage.satChzzkStreamers.find(unit => unit.cafe?.cafeName === 'legacy-cafe').notifications.cafePosts,
    false,
    'Legacy cafe notification preferences should survive migration'
  );

  const streamerSettingsResponse = await context.handleActivityMessage({
    type: 'ACTIVITY_UPDATE_STREAMER_NOTIFICATIONS',
    id: 'alpha-unit',
    notifications: { liveStart: true }
  });
  assert.equal(streamerSettingsResponse.ok, true);
  assert.equal(storage.satChzzkStreamers[0].notifications.liveStart, true);

  const beforeDuplicateAddCount = storage.satChzzkStreamers.length;
  const duplicateCafeResponse = await context.handleActivityMessage({
    type: 'ACTIVITY_ADD_STREAMER',
    input: {
      name: 'Legacy Cafe Updated',
      cafe: 'https://cafe.naver.com/legacy-cafe',
      nickname: 'LegacyWriter'
    }
  });
  assert.equal(duplicateCafeResponse.ok, true, duplicateCafeResponse.error);
  assert.equal(
    storage.satChzzkStreamers.length,
    beforeDuplicateAddCount,
    'Adding an existing cafe-only activity tracker row should update in place, not duplicate it'
  );
  assert.equal(
    storage.satChzzkStreamers.filter(unit => unit.cafe?.cafeName === 'legacy-cafe' && unit.cafe?.nickname === 'LegacyWriter').length,
    1,
    'Cafe identity should be unique by cafe name and nickname'
  );

  const runResponse = await context.handleActivityMessage({ type: 'ACTIVITY_RUN_NOW' });
  assert.equal(runResponse.ok, true);
  assert.equal(runResponse.checked, 1);
  assert.equal(runResponse.settings.intervalMinutes, 7);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].id, /^live_0123456789abcdef0123456789abcdef_/);
  assert.equal(storage.satEvents.length, 1);
  assert.equal(storage.satCafeCursors['123456'], '9');
  assert.deepEqual(JSON.parse(JSON.stringify(storage.satCafeLastSeen['alpha-cafe:AlphaWriter'])), []);
  assert.equal(storage.satLastRun.reason, 'manual');
  assert.equal(openedTabs.length, 0, 'Activity checks and notification creation must not open tabs automatically');

  await notificationClickListener(notifications[0].id);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(openedTabs[0].url, 'https://chzzk.naver.com/live/0123456789abcdef0123456789abcdef');
  assert.deepEqual(clearedNotifications, [notifications[0].id]);

  await notificationClickListener(notifications[0].id);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(openedTabs.length, 1, 'Repeated notification click events for the same notification must not open duplicate tabs');

  const stoppedResponse = await context.handleActivityMessage({ type: 'ACTIVITY_STOP_MONITORING' });
  assert.equal(stoppedResponse.ok, true);
  assert.equal(stoppedResponse.settings.isMonitoring, false);
  assert.equal(createdAlarms.at(-1).action, 'clear');

  console.log('activity background monitoring regression passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
