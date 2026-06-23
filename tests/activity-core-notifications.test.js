const assert = require('node:assert/strict');
const core = require('../js/activityCore.js');

const builtDefault = core.buildStreamerUnit({
  name: 'Alpha',
  channel: '0123456789abcdef0123456789abcdef'
});

assert.equal(builtDefault.ok, true);
assert.deepEqual(
  builtDefault.unit.notifications,
  { liveStart: true, titleChange: true, cafePosts: true },
  'New activity streamer units should enable all notification types by default'
);

const builtCustom = core.buildStreamerUnit({
  name: 'Beta',
  channel: 'fedcba9876543210fedcba9876543210',
  notifications: {
    liveStart: false,
    titleChange: true,
    cafePosts: false
  }
});

assert.equal(builtCustom.ok, true);
assert.deepEqual(
  builtCustom.unit.notifications,
  { liveStart: false, titleChange: true, cafePosts: false },
  'New activity streamer units should preserve per-streamer notification disables'
);

const migrated = core.migrateToStreamerUnits(
  [
    {
      id: 'existing-unit',
      name: 'Existing',
      channelId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      profileImageUrl: '',
      cafe: null,
      notifications: { titleChange: false }
    },
    {
      id: 'legacy-channel',
      name: 'Legacy',
      channelId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      notifications: { liveStart: false, cafePosts: false }
    }
  ],
  [
    {
      id: 'cafe-only',
      name: 'Cafe Only',
      cafeName: 'cafeonly',
      nickname: 'CafeWriter',
      notifications: { cafePosts: false }
    }
  ]
);

assert.deepEqual(
  migrated.find(unit => unit.id === 'existing-unit').notifications,
  { liveStart: true, titleChange: false, cafePosts: true },
  'Already-migrated activity units should normalize missing notification keys without losing disabled keys'
);
assert.deepEqual(
  migrated.find(unit => unit.id === 'legacy-channel').notifications,
  { liveStart: false, titleChange: true, cafePosts: false },
  'Legacy CHZZK activity rows should carry notification preferences into streamer units'
);
assert.deepEqual(
  migrated.find(unit => unit.id === 'cafe-only').notifications,
  { liveStart: true, titleChange: true, cafePosts: false },
  'Legacy cafe subscriptions should carry notification preferences into streamer units'
);

console.log('activity core notification regression passed');
