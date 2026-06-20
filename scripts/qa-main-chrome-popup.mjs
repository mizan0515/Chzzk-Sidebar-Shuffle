import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.CHZZK_MAIN_CHROME_PORT || 9222);
const screenshotPath = join(root, 'artifacts', 'main-chrome-popup-action.png');

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
  const socket = new WebSocket(target.webSocketDebuggerUrl);

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
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
    close() {
      socket.close();
    }
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function waitForPopup(extensionId) {
  let last = [];
  for (let i = 0; i < 50; i += 1) {
    last = await json('/json/list');
    const target = last.find(item =>
      item.url === `chrome-extension://${extensionId}/popup.html` ||
      item.url?.startsWith(`chrome-extension://${extensionId}/popup.html`)
    );
    if (target) return target;
    await sleep(200);
  }
  throw new Error(`Popup target did not appear. Last targets: ${last.map(item => item.url).join(', ')}`);
}

async function bringContentPageToFront() {
  const targets = await json('/json/list');
  const page = targets.find(item => item.type === 'page' && item.url?.startsWith('https://chzzk.naver.com/')) ||
    targets.find(item => item.type === 'page' && !item.url?.startsWith('chrome-extension://'));
  if (!page) return { ok: false, error: 'content page target not found' };
  const client = makeClient(page);
  await client.ready;
  const result = await client.send('Page.bringToFront').then(() => ({ ok: true, url: page.url })).catch(error => ({ ok: false, error: error.message }));
  client.close();
  return result;
}

async function findExtensionWorker() {
  const targets = await json('/json/list');
  const extensionTargets = targets.filter(item =>
    (item.type === 'service_worker' || item.type === 'background_page' || item.type === 'page') &&
    item.url?.startsWith('chrome-extension://')
  );
  for (const target of extensionTargets) {
    const client = makeClient(target);
    await client.ready;
    await client.send('Runtime.enable');
    const manifest = await evaluate(client, 'chrome.runtime.getManifest()').catch(() => null);
    if (manifest?.name === 'Chzzk Sidebar Shuffler') {
      const extensionId = target.url.match(/^chrome-extension:\/\/([^/]+)/)?.[1] || '';
      return { worker: target, client, extensionId, manifest };
    }
    client.close();
  }
  throw new Error(`Chzzk extension service worker not found. Targets: ${targets.map(item => item.url).join(', ')}`);
}

async function main() {
  const { client: workerClient, extensionId, manifest } = await findExtensionWorker();
  const bringToFront = await bringContentPageToFront();
  const openResult = await evaluate(workerClient, `new Promise(resolve => {
    try {
      if (!chrome.action?.openPopup) {
        resolve({ ok: false, error: 'chrome.action.openPopup unavailable' });
        return;
      }
      chrome.action.openPopup(() => {
        resolve({ ok: !chrome.runtime.lastError, lastError: chrome.runtime.lastError?.message || null });
      });
    } catch (error) {
      resolve({ ok: false, error: error.message });
    }
  })`);

  let popupTarget;
  let popupOpenMode = 'action.openPopup';
  if (openResult?.ok) {
    popupTarget = await waitForPopup(extensionId);
  } else {
    popupOpenMode = 'direct-popup-url-fallback';
    const fallbackTarget = await workerClient.send('Target.createTarget', {
      url: `chrome-extension://${extensionId}/popup.html`
    });
    await sleep(500);
    const targets = await json('/json/list');
    popupTarget = targets.find(item => item.id === fallbackTarget.targetId) || await waitForPopup(extensionId);
  }

  const popupClient = makeClient(popupTarget);
  await popupClient.ready;
  await popupClient.send('Runtime.enable');
  await popupClient.send('Page.enable');
  const metricsOverride = await popupClient
    .send('Emulation.setDeviceMetricsOverride', { width: 360, height: 720, deviceScaleFactor: 1, mobile: false })
    .then(() => ({ ok: true }))
    .catch(error => ({ ok: false, error: error.message }));
  await sleep(500);

  const metrics = await evaluate(popupClient, `(() => {
    const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
    return {
      title: document.title,
      url: location.href,
      bodyTextLength: bodyText.length,
      bodyTextPreview: bodyText.slice(0, 160),
      buttonCount: document.querySelectorAll('button').length,
      status: document.getElementById('status')?.textContent || '',
      version: document.getElementById('versionText')?.textContent || '',
      hasHomeScreen: Boolean(document.getElementById('homeScreen')),
      hasTierScreen: Boolean(document.getElementById('tierScreen')),
      overflowX: document.documentElement.scrollWidth > innerWidth,
      viewport: { width: innerWidth, height: innerHeight },
      documentSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      }
    };
  })()`);

  const screenshot = await popupClient.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  popupClient.close();
  workerClient.close();

  const blankOrTall = metrics.bodyTextLength < 20 || metrics.buttonCount < 2 || metrics.documentSize.height > 1200;
  const result = {
    status: blankOrTall ? 'FAIL' : 'PASS',
    route: 'main-chrome-action-popup-cdp',
    mainBrowserEvidence: true,
    extensionId,
    manifestVersion: manifest.version,
    popupOpenMode,
    bringToFront,
    openResult,
    metricsOverride,
    metrics,
    screenshotPath
  };

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL',
    route: 'main-chrome-action-popup-cdp',
    mainBrowserEvidence: true,
    error: error.message
  }, null, 2));
  process.exit(1);
});
