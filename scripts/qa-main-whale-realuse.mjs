const port = Number(process.env.CHZZK_MAIN_WHALE_PORT || 9223);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function json(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`CDP HTTP ${path} failed: ${response.status}`);
  return response.json();
}

function makeClient(target) {
  let nextId = 1;
  const pending = new Map();
  const contexts = [];
  const socket = new WebSocket(target.webSocketDebuggerUrl);

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.executionContextCreated') {
      contexts.push(message.params.context);
    }
    if (!message.id) return;
    const deferred = pending.get(message.id);
    if (!deferred) return;
    pending.delete(message.id);
    if (message.error) deferred.reject(new Error(message.error.message || JSON.stringify(message.error)));
    else deferred.resolve(message.result || {});
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    send(method, params = {}) {
      const id = nextId++;
      const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return promise;
    },
    contexts,
    close() {
      socket.close();
    }
  };
}

async function evaluate(client, expression, awaitPromise = true, contextId = undefined) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    ...(contextId ? { contextId } : {})
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function activityProbe(client) {
  await sleep(600);
  const context = client.contexts.find(item => item.name === 'Chzzk Sidebar Shuffler');
  if (!context) {
    return { ok: false, error: 'CHZZK_EXTENSION_ISOLATED_CONTEXT_NOT_FOUND' };
  }

  return evaluate(client, `new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'ACTIVITY_GET_STATE' }, response => {
        resolve({
          ok: !chrome.runtime.lastError && !!response?.ok,
          lastError: chrome.runtime.lastError?.message || null,
          response
        });
      });
    } catch (error) {
      resolve({ ok: false, error: error.message });
    }
  })`, true, context.id);
}

async function waitForValue(client, label, expression, attempts = 30) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    last = await evaluate(client, expression).catch(error => ({ error: error.message }));
    if (last?.ok) return last;
    await sleep(1000);
  }
  throw new Error(`${label} did not become ready: ${JSON.stringify(last)}`);
}

async function waitForContentScriptOrReload(client) {
  try {
    return await waitForValue(client, 'CHZZK content script and channels', chzzkProbeExpression(), 12);
  } catch (firstError) {
    await client.send('Page.reload', { ignoreCache: true });
    await sleep(8000);
    try {
      return await waitForValue(client, 'CHZZK content script and channels after reload', chzzkProbeExpression(), 45);
    } catch (secondError) {
      secondError.cause = firstError;
      throw secondError;
    }
  }
}

function chzzkProbeExpression() {
  return `(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/live/"], a[href*="/channel/"]'));
    const channelLinks = links.filter(link => /\\/(live|channel)\\/[^/?#]+/.test(link.getAttribute('href') || link.href || ''));
    const starButtons = Array.from(document.querySelectorAll('[data-chzzk-star-btn]'));
    const styles = document.getElementById('chzzk-star-styles');
    const channels = channelLinks.map(link => {
      const href = link.getAttribute('href') || link.href || '';
      const match = href.match(/\\/(?:live|channel)\\/([^/?#]+)/);
      const row = link.closest('li') || link;
      const button = match ? document.querySelector('[data-chzzk-star-btn="' + CSS.escape(decodeURIComponent(match[1])) + '"]') : null;
      return {
        id: match ? decodeURIComponent(match[1]) : '',
        href,
        name: (link.innerText || link.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
        top: Math.round(row.getBoundingClientRect().top),
        starred: button?.getAttribute('aria-pressed') === 'true',
        hasStarButton: Boolean(button)
      };
    }).filter(channel => channel.id);
    return {
      ok: channelLinks.length > 0 && Boolean(styles),
      url: location.href,
      title: document.title,
      markerVersion: styles?.dataset?.chzzkExtensionVersion || '',
      channelCount: channels.length,
      starButtonCount: starButtons.length,
      loginRequiredHint: /로그인|login/i.test(document.body?.innerText || ''),
      channels: channels.slice(0, 20)
    };
  })()`;
}

async function reversibleStarClick(client) {
  return evaluate(client, `new Promise((resolve) => {
    const beforeRows = Array.from(document.querySelectorAll('a[href*="/live/"], a[href*="/channel/"]'))
      .map(link => {
        const href = link.getAttribute('href') || link.href || '';
        const match = href.match(/\\/(?:live|channel)\\/([^/?#]+)/);
        const row = link.closest('li') || link;
        const id = match ? decodeURIComponent(match[1]) : '';
        const button = id ? document.querySelector('[data-chzzk-star-btn="' + CSS.escape(id) + '"]') : null;
        return { id, top: Math.round(row.getBoundingClientRect().top), starred: button?.getAttribute('aria-pressed') === 'true' };
      })
      .filter(item => item.id);
    const target = beforeRows.find(item => !item.starred);
    if (!target) {
      resolve({ ok: true, skipped: true, reason: 'NO_UNSTARRED_CHANNEL_TO_MUTATE_SAFELY', beforeCount: beforeRows.length });
      return;
    }
    const button = document.querySelector('[data-chzzk-star-btn="' + CSS.escape(target.id) + '"]');
    if (!button) {
      resolve({ ok: false, error: 'STAR_BUTTON_NOT_FOUND', target, beforeCount: beforeRows.length });
      return;
    }
    button.click();
    setTimeout(() => {
      const afterAddRows = Array.from(document.querySelectorAll('a[href*="/live/"], a[href*="/channel/"]'))
        .map(link => {
          const href = link.getAttribute('href') || link.href || '';
          const match = href.match(/\\/(?:live|channel)\\/([^/?#]+)/);
          const row = link.closest('li') || link;
          const id = match ? decodeURIComponent(match[1]) : '';
          const itemButton = id ? document.querySelector('[data-chzzk-star-btn="' + CSS.escape(id) + '"]') : null;
          return { id, top: Math.round(row.getBoundingClientRect().top), starred: itemButton?.getAttribute('aria-pressed') === 'true' };
        })
        .filter(item => item.id);
      const targetAfterAdd = afterAddRows.find(item => item.id === target.id);
      const removeButton = document.querySelector('[data-chzzk-star-btn="' + CSS.escape(target.id) + '"]');
      removeButton?.click();
      setTimeout(() => {
        const afterRemoveRows = Array.from(document.querySelectorAll('a[href*="/live/"], a[href*="/channel/"]'))
          .map(link => {
            const href = link.getAttribute('href') || link.href || '';
            const match = href.match(/\\/(?:live|channel)\\/([^/?#]+)/);
            const row = link.closest('li') || link;
            const id = match ? decodeURIComponent(match[1]) : '';
            const itemButton = id ? document.querySelector('[data-chzzk-star-btn="' + CSS.escape(id) + '"]') : null;
            return { id, top: Math.round(row.getBoundingClientRect().top), starred: itemButton?.getAttribute('aria-pressed') === 'true' };
          })
          .filter(item => item.id);
        const targetAfterRemove = afterRemoveRows.find(item => item.id === target.id);
        resolve({
          ok: beforeRows.length === afterAddRows.length && beforeRows.length === afterRemoveRows.length && targetAfterAdd?.starred === true && targetAfterRemove?.starred === false,
          targetId: target.id,
          beforeCount: beforeRows.length,
          afterAddCount: afterAddRows.length,
          afterRemoveCount: afterRemoveRows.length,
          movedUpOnAdd: typeof targetAfterAdd?.top === 'number' ? targetAfterAdd.top <= target.top : null,
          restoredUnstarred: targetAfterRemove?.starred === false,
          beforeTop: target.top,
          afterAddTop: targetAfterAdd?.top ?? null,
          afterRemoveTop: targetAfterRemove?.top ?? null
        });
      }, 1300);
    }, 1300);
  })`, true);
}

async function main() {
  const targets = await json('/json/list');
  const chzzk = targets.find(item => item.type === 'page' && /^https:\/\/chzzk\.naver\.com\/following/.test(item.url));
  if (!chzzk) throw new Error('Main Whale CHZZK following page target not found');

  const client = makeClient(chzzk);
  await client.ready;
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  const initial = await waitForContentScriptOrReload(client);
  const starInteraction = await reversibleStarClick(client);
  const activity = await activityProbe(client);
  const after = await evaluate(client, chzzkProbeExpression());
  client.close();

  const result = {
    status: initial.ok && starInteraction.ok && activity.ok && after.ok ? 'PASS' : 'FAIL',
    route: 'main-whale-realuse-cdp',
    mainBrowserEvidence: true,
    targetUrl: chzzk.url,
    initial,
    starInteraction,
    activity,
    after
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', route: 'main-whale-realuse-cdp', mainBrowserEvidence: true, error: error.message }, null, 2));
  process.exit(1);
});
