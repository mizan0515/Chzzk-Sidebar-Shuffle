const assert = require('node:assert/strict');
const { FavoriteTierStore, STATE_KEY } = require('../js/favoriteTierStore.js');

async function main() {
  const writes = [];
  const fakeStorage = {
    [STATE_KEY]: {
      version: 2,
      channels: {
        alpha: { id: 'alpha', name: 'Alpha', href: '/live/alpha', source: 'chzzk-page' }
      },
      starred: ['alpha'],
      assignments: {},
      tierOrder: { s: [], a: [], b: [], c: [], d: [] }
    },
    satChzzkStreamers: [
      { channelId: 'offline-one', name: 'Offline One', enabled: true, profileImageUrl: 'https://example.test/offline.png' },
      { channelId: 'disabled-one', name: 'Disabled One', enabled: false }
    ],
    satChzzkStates: {
      'offline-one': { isLive: false, channelName: 'Offline One From State' },
      'disabled-one': { isLive: true, channelName: 'Disabled One From State' }
    }
  };

  const platform = {
    storage: true,
    async storageGet(area, keys) {
      if (area === 'sync') return {};
      const output = {};
      const requested = Array.isArray(keys) ? keys : [keys];
      requested.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(fakeStorage, key)) output[key] = fakeStorage[key];
      });
      return output;
    },
    async storageSet(area, value) {
      writes.push({ area, value });
    },
    isContextInvalidated() {
      return false;
    },
    isContextInvalidatedError() {
      return false;
    }
  };

  const store = new FavoriteTierStore(platform);
  const state = await store.load();

  assert.equal(state.channels.alpha.name, 'Alpha');
  assert.equal(state.channels['offline-one'].name, 'Offline One');
  assert.equal(state.channels['offline-one'].activityEnabled, true);
  assert.equal(state.channels['offline-one'].liveStatus, 'offline');
  assert.equal(state.channels['offline-one'].source, 'activity-tracker');
  assert.equal(state.channels['disabled-one'].activityEnabled, false);
  assert.equal(state.channels['disabled-one'].liveStatus, 'live');
  assert.ok(writes.some(write => write.area === 'local' && write.value[STATE_KEY]?.channels?.['offline-one']), 'Activity channels should be persisted into the V2 channel model after load');

  console.log('favorite tier activity merge regression passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
