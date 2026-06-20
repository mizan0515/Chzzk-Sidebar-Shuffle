/**
 * Browser platform adapter.
 * Keeps Chrome extension API access in one place.
 */
(function() {
  'use strict';

  const chromeApi = globalThis.chrome;
  let contextInvalidated = false;

  function resolveApi(path) {
    const parts = path.split('.');
    const resolveFrom = (api) => parts.reduce((obj, key) => obj && obj[key], api);
    return resolveFrom(chromeApi) ? chromeApi : null;
  }

  function hasApi(path) {
    const api = resolveApi(path);
    return path.split('.').every((part, index, parts) => {
      const base = index === 0 ? api : parts.slice(0, index).reduce((obj, key) => obj && obj[key], api);
      return !!base && part in base;
    });
  }

  function lastRuntimeError() {
    return chromeApi?.runtime?.lastError;
  }

  function isContextInvalidatedError(error) {
    const message = String(error?.message || error || '');
    return /Extension context invalidated|context invalidated|Extension context/i.test(message);
  }

  class ExtensionContextInvalidatedError extends Error {
    constructor(message) {
      super(message || 'Extension context invalidated');
      this.name = 'ExtensionContextInvalidatedError';
      this.code = 'EXTENSION_CONTEXT_INVALIDATED';
      this.recoverable = true;
    }
  }

  function markContextInvalidated(error) {
    const wasInvalidated = contextInvalidated;
    contextInvalidated = true;
    if (wasInvalidated) return;
    const message = error?.message || String(error || 'Extension context invalidated');
    try {
      window.ChzzkLogger?.warn?.('[PLATFORM] Extension context invalidated; reload the CHZZK tab to continue.', error);
      window.dispatchEvent?.(new CustomEvent('chzzk:extension-context-invalidated', {
        detail: { message }
      }));
    } catch {
      // The context can be partially torn down; avoid throwing from the recovery path.
    }
  }

  function contextInvalidatedError(message) {
    const error = new ExtensionContextInvalidatedError(message);
    markContextInvalidated(error);
    return error;
  }

  function promisify(callbackApi, thisArg, ...args) {
    return new Promise((resolve, reject) => {
      if (contextInvalidated) {
        reject(contextInvalidatedError());
        return;
      }

      if (!callbackApi) {
        reject(new Error('Extension API is unavailable'));
        return;
      }

      try {
        callbackApi.call(thisArg, ...args, (result) => {
          const runtimeError = lastRuntimeError();
          if (runtimeError) {
            const message = runtimeError.message || String(runtimeError);
            reject(isContextInvalidatedError(message) ? contextInvalidatedError(message) : new Error(message));
            return;
          }
          resolve(result);
        });
      } catch (error) {
        reject(isContextInvalidatedError(error) ? contextInvalidatedError(error.message || String(error)) : error);
      }
    });
  }

  const platform = {
    api: chromeApi,

    isExtensionContext() {
      return !!chromeApi;
    },

    hasApi,
    isContextInvalidatedError,
    markContextInvalidated,

    isContextInvalidated() {
      return contextInvalidated;
    },

    get storage() {
      return chromeApi?.storage;
    },

    get tabs() {
      return chromeApi?.tabs;
    },

    get runtime() {
      return chromeApi?.runtime;
    },

    getManifestVersion() {
      try {
        return this.runtime?.getManifest?.().version || '';
      } catch {
        return '';
      }
    },

    get scripting() {
      return chromeApi?.scripting;
    },

    storageGet(area, keys) {
      const store = this.storage?.[area];
      return promisify(store?.get, store, keys);
    },

    storageSet(area, value) {
      const store = this.storage?.[area];
      return promisify(store?.set, store, value);
    },

    storageRemove(area, keys) {
      const store = this.storage?.[area];
      return promisify(store?.remove, store, keys);
    },

    queryTabs(queryInfo) {
      return promisify(this.tabs?.query, this.tabs, queryInfo);
    },

    sendMessage(tabId, message) {
      return promisify(this.tabs?.sendMessage, this.tabs, tabId, message);
    },

    sendRuntimeMessage(message) {
      return promisify(this.runtime?.sendMessage, this.runtime, message);
    },

    executeScripts(tabId, files) {
      if (!this.scripting?.executeScript) {
        return Promise.reject(new Error('Scripting API is unavailable'));
      }
      return promisify(this.scripting.executeScript, this.scripting, {
        target: { tabId },
        files
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.ChzzkPlatform = platform;
    window.addEventListener?.('unhandledrejection', (event) => {
      if (!isContextInvalidatedError(event.reason)) return;
      markContextInvalidated(event.reason);
      event.preventDefault?.();
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { platform };
  }
})();
