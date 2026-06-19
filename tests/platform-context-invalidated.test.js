const assert = require('node:assert/strict');

let storageSetCalls = 0;

global.window = {
  ChzzkLogger: {
    warn() {}
  },
  addEventListener() {},
  dispatchEvent() {}
};

global.chrome = {
  runtime: {
    lastError: null
  },
  storage: {
    local: {
      set(_value, callback) {
        storageSetCalls += 1;
        global.chrome.runtime.lastError = { message: 'Extension context invalidated.' };
        callback();
      }
    }
  }
};

const { platform } = require('../js/platform.js');

(async () => {
  await assert.rejects(
    platform.storageSet('local', { starredChannels: ['alpha'] }),
    (error) => {
      assert.equal(error.name, 'ExtensionContextInvalidatedError');
      assert.equal(error.code, 'EXTENSION_CONTEXT_INVALIDATED');
      assert.equal(error.recoverable, true);
      return true;
    }
  );

  assert.equal(platform.isContextInvalidated(), true);

  await assert.rejects(
    platform.storageSet('local', { starredChannels: ['beta'] }),
    /Extension context invalidated/
  );
  assert.equal(storageSetCalls, 1);

  console.log('platform context invalidation regression passed');
})();
