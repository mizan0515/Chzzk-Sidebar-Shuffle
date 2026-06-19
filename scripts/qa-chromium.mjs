import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'dist', 'chrome');
const screenshotPath = join(root, 'artifacts', 'chromium-popup-final-340.png');
const port = Number(process.env.CHZZK_QA_PORT || 9262);
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function chromiumCandidates() {
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    process.env.CHZZK_QA_CHROMIUM,
    join(localAppData, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
    join(localAppData, 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe'),
    join(localAppData, 'ms-playwright', 'chromium-1181', 'chrome-win', 'chrome.exe')
  ].filter(Boolean);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, label, timeoutMs = 15000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out during ${label}`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function waitJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url).then(response => response.json());
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function makeClient(target) {
  let seq = 0;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  };

  ws.onclose = () => {
    pending.forEach(request => request.reject(new Error('CDP websocket closed')));
    pending.clear();
  };

  return {
    ready,
    send(method, params = {}, timeoutMs = 15000) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return withTimeout(new Promise((resolve, reject) => pending.set(id, { resolve, reject })), method, timeoutMs);
    },
    close() {
      ws.close();
    }
  };
}

async function evalIn(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result.value;
}

async function click(client, label, expression) {
  const box = await evalIn(client, expression);
  if (!box) throw new Error(`Click target not found: ${label}`);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(700);
}

async function contentStarState(client, channelId) {
  return evalIn(client, `(() => {
    const button = document.querySelector('#codex-chzzk-test-sidebar [data-chzzk-star-btn="${channelId}"]');
    const rect = button?.getBoundingClientRect();
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    const hit = center ? document.elementFromPoint(center.x, center.y) : null;
    return {
      order: Array.from(document.querySelectorAll('#codex-chzzk-test-sidebar li')).map(li => li.dataset.testId).join(','),
      pressed: button?.getAttribute('aria-pressed') || null,
      label: button?.getAttribute('aria-label') || null,
      active: button?.classList.contains('chzzk-star-active') || false,
      disabled: Boolean(button?.disabled),
      ariaBusy: button?.getAttribute('aria-busy') || null,
      noticeVisible: Boolean(document.getElementById('chzzk-extension-reload-notice')),
      rect: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      hitTag: hit?.tagName || null,
      hitStarId: hit?.closest?.('[data-chzzk-star-btn]')?.getAttribute('data-chzzk-star-btn') || null,
      boxes: Array.from(document.querySelectorAll('#codex-chzzk-test-sidebar [data-chzzk-star-btn]')).map(item => {
        const itemRect = item.getBoundingClientRect();
        const center = { x: itemRect.left + itemRect.width / 2, y: itemRect.top + itemRect.height / 2 };
        const centerHit = document.elementFromPoint(center.x, center.y);
        return {
          id: item.getAttribute('data-chzzk-star-btn'),
          rect: { left: Math.round(itemRect.left), top: Math.round(itemRect.top), width: Math.round(itemRect.width), height: Math.round(itemRect.height) },
          hitStarId: centerHit?.closest?.('[data-chzzk-star-btn]')?.getAttribute('data-chzzk-star-btn') || null,
          parentTestId: item.closest('li')?.dataset?.testId || null
        };
      })
    };
  })()`);
}

async function chzzkSidebarOrder(client) {
  return evalIn(client, `Array.from(document.querySelectorAll('#codex-chzzk-test-sidebar li')).map(li => li.dataset.testId).join(',')`);
}

async function waitForPageValue(client, label, expression, attempts = 40) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    last = await evalIn(client, expression).catch(error => ({ error: error.message || String(error) }));
    if (last === true || (last && typeof last === 'object' && last.ok)) return last;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`);
}

async function findExtensionId(targets) {
  for (const target of targets.filter(item => item.type === 'service_worker' || item.type === 'background_page')) {
    const client = makeClient(target);
    await client.ready;
    await client.send('Runtime.enable');
    const manifest = await evalIn(client, 'chrome.runtime.getManifest && chrome.runtime.getManifest()');
    client.close();
    if (manifest?.name === 'Chzzk Sidebar Shuffler') {
      return target.url.match(/chrome-extension:\/\/([^/]+)/)?.[1] || null;
    }
  }
  return null;
}

async function main() {
  if (!existsSync(extensionDir)) {
    throw new Error(`Missing ${extensionDir}. Run npm run build:chrome first.`);
  }

  const chromium = chromiumCandidates().find(candidate => existsSync(candidate));
  if (!chromium) {
    throw new Error('No Playwright Chromium found. Set CHZZK_QA_CHROMIUM to chrome.exe.');
  }

  const userDataDir = join(tmpdir(), `codex-chromium-chzzk-popup-${port}`);
  rmSync(userDataDir, { recursive: true, force: true });

  const child = spawn(chromium, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await waitJson(`http://127.0.0.1:${port}/json/version`);
    await sleep(1500);

    let targets = await waitJson(`http://127.0.0.1:${port}/json/list`);
    const extensionId = await findExtensionId(targets);
    if (!extensionId) {
      throw new Error(`Chzzk extension worker not found. Targets: ${targets.map(item => item.url).join(', ')}`);
    }

    await fetch(`http://127.0.0.1:${port}/json/new?https://chzzk.naver.com/following?tab=ALL`, { method: 'PUT' }).catch(() => null);
    await sleep(2500);
    targets = await waitJson(`http://127.0.0.1:${port}/json/list`);

    const chzzkTarget = targets.find(item => item.type === 'page' && item.url.includes('chzzk.naver.com/following'));
    if (!chzzkTarget) throw new Error('CHZZK tab not found');

    const chzzk = makeClient(chzzkTarget);
    await chzzk.ready;
    await chzzk.send('Runtime.enable');
    const observerReady = await waitForPageValue(chzzk, 'content star observer', `(() => ({
      ok: document.documentElement?.getAttribute('data-chzzk-star-observer') === 'ready',
      marker: document.documentElement?.getAttribute('data-chzzk-star-observer') || '',
      version: document.getElementById('chzzk-star-styles')?.dataset.chzzkExtensionVersion || ''
    }))()`);
    await evalIn(chzzk, `(() => {
      document.querySelector('#codex-chzzk-test-sidebar')?.remove();
      const host = document.createElement('aside');
      host.id = 'codex-chzzk-test-sidebar';
      host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;width:280px;background:#0d131a;padding:8px;';
      host.innerHTML = '<ul class="navigation_bar_list__codex"><li data-test-id="alpha"><a href="/live/alpha"><span>Alpha Stream</span><span>라이브</span></a></li><li data-test-id="beta"><a href="/live/beta"><span>Beta Live</span><span>라이브</span></a></li><li data-test-id="gamma"><a href="/channel/gamma"><span>Gamma Offline</span></a></li></ul>';
      document.body.prepend(host);
      return true;
    })()`);
    await sleep(900);
    const before = await chzzkSidebarOrder(chzzk);
    const contentScriptVersion = await evalIn(chzzk, `document.getElementById('chzzk-star-styles')?.dataset.chzzkExtensionVersion || ''`);
    const starButtonInitial = await evalIn(chzzk, `(() => {
      const buttons = Array.from(document.querySelectorAll('#codex-chzzk-test-sidebar [data-chzzk-star-btn]'));
      return {
        hasMarker: Boolean(document.getElementById('chzzk-star-styles')),
        bodyHasFixture: Boolean(document.getElementById('codex-chzzk-test-sidebar')),
        count: buttons.length,
        directLinkCount: document.querySelectorAll('#codex-chzzk-test-sidebar a[href*="/live/"], #codex-chzzk-test-sidebar a[href*="/channel/"]').length,
        labels: buttons.map(button => button.getAttribute('aria-label')),
        boxes: buttons.map(button => {
          const buttonRect = button.getBoundingClientRect();
          const iconRect = button.querySelector('svg')?.getBoundingClientRect();
          return {
            id: button.getAttribute('data-chzzk-star-btn'),
            width: Math.round(buttonRect.width),
            height: Math.round(buttonRect.height),
            centerDeltaX: iconRect ? Math.round(((iconRect.left + iconRect.width / 2) - (buttonRect.left + buttonRect.width / 2)) * 10) / 10 : null,
            centerDeltaY: iconRect ? Math.round(((iconRect.top + iconRect.height / 2) - (buttonRect.top + buttonRect.height / 2)) * 10) / 10 : null
          };
        })
      };
    })()`);
    if (starButtonInitial.count !== 3) {
      throw new Error(`Content star buttons were not injected for all test channels before click: ${JSON.stringify(starButtonInitial)}`);
    }

    await click(chzzk, 'content gamma star add', `(() => {
      const element = document.querySelector('#codex-chzzk-test-sidebar [data-chzzk-star-btn="gamma"]');
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`);
    const afterContentStarAdd = await contentStarState(chzzk, 'gamma');

    await click(chzzk, 'content gamma star remove', `(() => {
      const element = document.querySelector('#codex-chzzk-test-sidebar [data-chzzk-star-btn="gamma"]');
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`);
    const afterContentStarRemove = await contentStarState(chzzk, 'gamma');

    await fetch(`http://127.0.0.1:${port}/json/new?chrome-extension://${extensionId}/popup.html`, { method: 'PUT' }).catch(() => null);
    await sleep(1200);
    targets = await waitJson(`http://127.0.0.1:${port}/json/list`);
    const popupTarget = targets.find(item => item.type === 'page' && item.url === `chrome-extension://${extensionId}/popup.html`);
    if (!popupTarget) throw new Error('Popup target not found');

    const popup = makeClient(popupTarget);
    await popup.ready;
    await popup.send('Runtime.enable');
    await popup.send('Page.enable');
    await popup.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 620, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);

    const initial = await evalIn(popup, `(() => ({
      status: document.getElementById('status')?.textContent,
      badge: document.getElementById('browserBadge')?.textContent,
      version: document.getElementById('versionText')?.textContent,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      applyVisible: !document.getElementById('applyTierBtn')?.classList.contains('hidden'),
      iconSlotMetrics: Array.from(document.querySelectorAll('.icon-slot')).filter(slot => slot.offsetParent !== null).map((slot, index) => {
        const slotRect = slot.getBoundingClientRect();
        const svgRect = slot.querySelector('svg')?.getBoundingClientRect();
        return {
          index,
          width: Math.round(slotRect.width),
          height: Math.round(slotRect.height),
          iconWidth: svgRect ? Math.round(svgRect.width) : 0,
          iconHeight: svgRect ? Math.round(svgRect.height) : 0,
          centerDeltaX: svgRect ? Math.round(((svgRect.left + svgRect.width / 2) - (slotRect.left + slotRect.width / 2)) * 10) / 10 : null,
          centerDeltaY: svgRect ? Math.round(((svgRect.top + svgRect.height / 2) - (slotRect.top + slotRect.height / 2)) * 10) / 10 : null
        };
      })
    }))()`);

    await evalIn(popup, `chrome.storage.local.set({
      chzzkFavoriteTierState: {
        version: 2,
        channels: {
          alpha: { id: 'alpha', name: 'Alpha Stream', href: '/live/alpha', avatarUrl: '', lastSeenAt: Date.now() },
          beta: { id: 'beta', name: 'Beta Live', href: '/live/beta', avatarUrl: '', lastSeenAt: Date.now() }
        },
        starred: ['alpha', 'beta'],
        tiers: [
          { id: 's', label: 'S', color: '#ff6b6b', order: 0 },
          { id: 'a', label: 'A', color: '#ffd166', order: 1 },
          { id: 'b', label: 'B', color: '#7bd88f', order: 2 },
          { id: 'c', label: 'C', color: '#73c2fb', order: 3 },
          { id: 'd', label: 'D', color: '#b8b8c7', order: 4 }
        ],
        assignments: { beta: 's', alpha: 'a' },
        tierOrder: { s: ['beta'], a: ['alpha'], b: [], c: [], d: [] }
      }
    })`);

    await click(popup, 'refresh', `(() => {
      const element = document.getElementById('refreshBtn');
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await click(popup, 'apply', `(() => {
      const element = document.getElementById('applyTierBtn');
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);

    const after = await chzzkSidebarOrder(chzzk);
    const finalPopup = await evalIn(popup, `(() => ({
      status: document.getElementById('status')?.textContent,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      buttonOverflow: Array.from(document.querySelectorAll('button')).filter(button => button.scrollWidth > Math.ceil(button.clientWidth) || button.scrollHeight > Math.ceil(button.clientHeight)).map(button => button.id),
      iconSlotMetrics: Array.from(document.querySelectorAll('.icon-slot')).filter(slot => slot.offsetParent !== null).map((slot, index) => {
        const slotRect = slot.getBoundingClientRect();
        const svgRect = slot.querySelector('svg')?.getBoundingClientRect();
        return {
          index,
          width: Math.round(slotRect.width),
          height: Math.round(slotRect.height),
          iconWidth: svgRect ? Math.round(svgRect.width) : 0,
          iconHeight: svgRect ? Math.round(svgRect.height) : 0,
          centerDeltaX: svgRect ? Math.round(((svgRect.left + svgRect.width / 2) - (slotRect.left + slotRect.width / 2)) * 10) / 10 : null,
          centerDeltaY: svgRect ? Math.round(((svgRect.top + svgRect.height / 2) - (slotRect.top + slotRect.height / 2)) * 10) / 10 : null
        };
      })
    }))()`);

    const screenshot = await popup.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, 45000);
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    if (before !== 'alpha,beta,gamma') throw new Error(`Unexpected initial order: ${before}`);
    if (contentScriptVersion !== packageJson.version) {
      throw new Error(`Content script version marker mismatch: ${contentScriptVersion || '(missing)'} !== ${packageJson.version}`);
    }
    if (starButtonInitial.boxes.some(box => box.width < 32 || box.height < 32 || Math.abs(box.centerDeltaX) > 1 || Math.abs(box.centerDeltaY) > 1)) {
      throw new Error(`Content star icons are not centered in their controls: ${JSON.stringify(starButtonInitial)}`);
    }
    if (afterContentStarAdd.pressed !== 'true' || !afterContentStarAdd.active || afterContentStarAdd.order.split(',').filter(Boolean).length !== 3) {
      throw new Error(`Content star add did not persist or preserve LNB channels: ${JSON.stringify(afterContentStarAdd)}`);
    }
    if (afterContentStarRemove.pressed !== 'false' || afterContentStarRemove.active || afterContentStarRemove.order.split(',').filter(Boolean).length !== 3) {
      throw new Error(`Content star remove did not persist or preserve LNB channels: ${JSON.stringify(afterContentStarRemove)}`);
    }
    if (after !== 'beta,alpha,gamma') throw new Error(`Tier sort did not apply. Final order: ${after}`);
    if (initial.iconSlotMetrics.length < 5 || initial.iconSlotMetrics.some(metric => metric.width !== 16 || metric.height !== 16 || metric.iconWidth !== 16 || metric.iconHeight !== 16 || Math.abs(metric.centerDeltaX) > 1 || Math.abs(metric.centerDeltaY) > 1)) {
      throw new Error(`Popup action icons are not centered before interaction: ${JSON.stringify(initial)}`);
    }
    if (finalPopup.overflowX || finalPopup.buttonOverflow.length) throw new Error(`Popup layout overflow: ${JSON.stringify(finalPopup)}`);
    if (finalPopup.iconSlotMetrics.length < 5 || finalPopup.iconSlotMetrics.some(metric => metric.width !== 16 || metric.height !== 16 || metric.iconWidth !== 16 || metric.iconHeight !== 16 || Math.abs(metric.centerDeltaX) > 1 || Math.abs(metric.centerDeltaY) > 1)) {
      throw new Error(`Popup action icons are not centered after interaction: ${JSON.stringify(finalPopup)}`);
    }

    console.log(JSON.stringify({
      status: 'PASS',
      route: 'isolated-chromium-regression-harness',
      mainBrowserEvidence: false,
      note: 'This proves extension behavior in an isolated Chromium harness. Use @chrome/@whale for manager main-browser QA.',
      extensionId,
      contentScriptVersion,
      observerReady,
      before,
      after,
      starButtonInitial,
      contentStarInteractions: {
        afterContentStarAdd,
        afterContentStarRemove
      },
      initial,
      finalPopup,
      screenshotPath
    }, null, 2));
    popup.close();
    chzzk.close();
  } finally {
    try {
      await fetch(`http://127.0.0.1:${port}/json/close`, { method: 'PUT' }).catch(() => null);
    } catch {
      // Chrome may already be gone.
    }
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
    await sleep(500);
    try {
      child.kill('SIGKILL');
    } catch {
      // Already exited.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
