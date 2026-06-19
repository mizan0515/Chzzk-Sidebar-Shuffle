const assert = require('node:assert/strict');

global.window = {
  ChzzkLogger: {
    warn() {}
  }
};

const { FavoriteTierStore, normalizeState } = require('../js/favoriteTierStore.js');

let invalidatedCount = 0;
const fakePlatform = {
  storage: { local: {}, sync: {} },
  storageSet() {
    return Promise.reject(new Error('Extension context invalidated.'));
  },
  isContextInvalidatedError(error) {
    return /Extension context invalidated/i.test(String(error?.message || error));
  },
  markContextInvalidated() {
    invalidatedCount += 1;
  }
};

(async () => {
  const store = new FavoriteTierStore(fakePlatform);
  store.loaded = true;
  store.state = normalizeState({
    channels: {
      alpha: { id: 'alpha', name: 'Alpha', href: '/live/alpha' }
    },
    starred: ['alpha'],
    assignments: { alpha: 's' },
    tierOrder: { s: ['alpha'], a: [], b: [], c: [], d: [] }
  });

  await assert.rejects(
    () => store.setStarred('beta', true, { id: 'beta', name: 'Beta', href: '/live/beta' }),
    /Extension context invalidated/
  );
  assert.deepEqual(store.state.starred, ['alpha']);
  assert.equal(store.state.channels.beta, undefined);
  assert.equal(invalidatedCount, 1);

  await assert.rejects(
    () => store.assignTier('alpha', 'a'),
    /Extension context invalidated/
  );
  assert.deepEqual(store.state.starred, ['alpha']);
  assert.deepEqual(store.state.assignments, { alpha: 's' });
  assert.deepEqual(store.state.tierOrder.s, ['alpha']);
  assert.deepEqual(store.state.tierOrder.a, []);
  assert.equal(invalidatedCount, 2);

  await assert.rejects(
    () => store.reorderTier('s', []),
    /Extension context invalidated/
  );
  assert.deepEqual(store.state.tierOrder.s, ['alpha']);
  assert.equal(invalidatedCount, 3);

  let invalidatedStorageCalls = 0;
  let invalidatedMarks = 0;
  const alreadyInvalidatedPlatform = {
    storage: { local: {}, sync: {} },
    isContextInvalidated() {
      return true;
    },
    storageSet() {
      invalidatedStorageCalls += 1;
      return Promise.resolve();
    },
    markContextInvalidated() {
      invalidatedMarks += 1;
    }
  };
  const invalidatedStore = new FavoriteTierStore(alreadyInvalidatedPlatform);
  invalidatedStore.loaded = true;
  invalidatedStore.state = normalizeState({ starred: ['alpha'] });

  await assert.rejects(
    () => invalidatedStore.setStarred('beta', true, { id: 'beta', name: 'Beta' }),
    /Extension context invalidated/
  );
  assert.equal(invalidatedStorageCalls, 0);
  assert.equal(invalidatedMarks, 1);
  assert.deepEqual(invalidatedStore.state.starred, ['alpha']);

  console.log('favorite tier rollback regression passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
