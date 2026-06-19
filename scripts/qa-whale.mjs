import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'dist', 'whale');
const screenshotPath = join(root, 'artifacts', 'whale-sidebar-regression-390.png');
const port = Number(process.env.CHZZK_QA_WHALE_PORT || (9323 + Math.floor(Math.random() * 500)));
const userDataDir = mkdtempSync(join(tmpdir(), `codex-whale-chzzk-sidebar-${port}-`));
const extensionName = 'Chzzk Sidebar Shuffler';
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function whaleClientPath() {
  const explicit = process.env.WHALE_CLIENT_MJS;
  if (explicit && existsSync(explicit)) return explicit;

  const codeHome = process.env.CODEX_HOME;
  if (codeHome) {
    const bundled = join(codeHome, 'plugins', 'cache', 'whale-codex', 'whale', '0.1.4', 'scripts', 'whale-client.mjs');
    if (existsSync(bundled)) return bundled;
  }

  throw new Error('Whale client not found. Set WHALE_CLIENT_MJS or run inside Codex with CODEX_HOME.');
}

async function waitForValue(label, fn, attempts = 40) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    last = await fn().catch(error => ({ error: error.message }));
    if (last) return last;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`);
}

async function clickElementCenter(whale, pageId, expression, label) {
  const box = await whale.evaluate(pageId, expression, { port });
  if (!box) throw new Error(`Click target not found: ${label}`);
  await whale.click(pageId, box.x, box.y, { port });
  await sleep(900);
}

async function sidebarMetrics(whale, pageId) {
  return whale.evaluate(pageId, `(() => ({
    status: document.getElementById('connectionText')?.textContent,
    favoriteCount: document.getElementById('favoriteCount')?.textContent,
    assignedCount: document.getElementById('assignedCount')?.textContent,
    overflowX: document.documentElement.scrollWidth > innerWidth,
    buttonOverflow: Array.from(document.querySelectorAll('button')).filter(button => button.scrollWidth > Math.ceil(button.clientWidth) || button.scrollHeight > Math.ceil(button.clientHeight)).map(button => button.id || button.textContent.trim()),
    toolbarButtonBox: (() => {
      const rect = document.getElementById('refreshBtn')?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth } : null;
    })(),
    toolbarPosition: getComputedStyle(document.querySelector('.toolbar')).position,
    starredButtonCount: document.querySelectorAll('.mini.is-starred').length,
    destructiveMiniText: Array.from(document.querySelectorAll('.mini.is-starred')).some(button => button.textContent.includes('×') || button.textContent.includes('X')),
    availableChannelIds: Array.from(document.querySelectorAll('#channelList .streamer-card')).map(card => card.dataset.channelId),
    unassignedIds: Array.from(document.querySelectorAll('#unassignedList .streamer-card')).map(card => card.dataset.channelId),
    sTierIds: Array.from(document.querySelectorAll('.drop-zone[data-tier-id="s"] .streamer-card')).map(card => card.dataset.channelId),
    bTierIds: Array.from(document.querySelectorAll('.drop-zone[data-tier-id="b"] .streamer-card')).map(card => card.dataset.channelId),
    gammaPressed: document.querySelector('[data-channel-id="gamma"] .mini')?.getAttribute('aria-pressed') || null,
    gammaTierPressed: Array.from(document.querySelectorAll('[data-channel-id="gamma"] [data-tier-choice]')).filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.dataset.tierChoice || 'unassigned'),
    coloredTierChipCount: Array.from(document.querySelectorAll('.tier-chip[data-tier-choice]:not([data-tier-choice=""])')).filter(button => button.style.getPropertyValue('--tier-color')).length,
    channelCountText: document.getElementById('channelCount')?.textContent,
    addSectionTitle: document.querySelector('.all-channels h2')?.textContent,
    searchValue: document.getElementById('searchInput')?.value || '',
    channelEmptyText: document.querySelector('#channelList .empty')?.textContent || '',
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
    }),
    iconButtonMetrics: Array.from(document.querySelectorAll('.icon-button')).filter(button => button.offsetParent !== null).map(button => {
      const buttonRect = button.getBoundingClientRect();
      const svgRect = button.querySelector('svg')?.getBoundingClientRect();
      return {
        id: button.id || button.getAttribute('aria-label') || '',
        width: Math.round(buttonRect.width),
        height: Math.round(buttonRect.height),
        iconWidth: svgRect ? Math.round(svgRect.width) : 0,
        iconHeight: svgRect ? Math.round(svgRect.height) : 0,
        centerDeltaX: svgRect ? Math.round(((svgRect.left + svgRect.width / 2) - (buttonRect.left + buttonRect.width / 2)) * 10) / 10 : null,
        centerDeltaY: svgRect ? Math.round(((svgRect.top + svgRect.height / 2) - (buttonRect.top + buttonRect.height / 2)) * 10) / 10 : null
      };
    }),
    miniMetrics: Array.from(document.querySelectorAll('.mini')).filter(button => button.offsetParent !== null).map(button => {
      const buttonRect = button.getBoundingClientRect();
      const svgRect = button.querySelector('svg')?.getBoundingClientRect();
      return {
        channelId: button.closest('[data-channel-id]')?.dataset.channelId || '',
        width: Math.round(buttonRect.width),
        height: Math.round(buttonRect.height),
        iconWidth: svgRect ? Math.round(svgRect.width) : 0,
        iconHeight: svgRect ? Math.round(svgRect.height) : 0,
        centerDeltaX: svgRect ? Math.round(((svgRect.left + svgRect.width / 2) - (buttonRect.left + buttonRect.width / 2)) * 10) / 10 : null,
        centerDeltaY: svgRect ? Math.round(((svgRect.top + svgRect.height / 2) - (buttonRect.top + buttonRect.height / 2)) * 10) / 10 : null
      };
    })
  }))()`, { port });
}

async function chzzkSidebarOrder(whale, pageId) {
  return whale.evaluate(pageId, `Array.from(document.querySelectorAll('#codex-chzzk-test-sidebar li')).map(li => li.dataset.testId).join(',')`, { port });
}

async function setSidebarSearch(whale, pageId, value) {
  await whale.evaluate(pageId, `((value) => {
    const input = document.getElementById('searchInput');
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })(${JSON.stringify(value)})`, { port });
  await sleep(300);
}

async function main() {
  if (!existsSync(extensionDir)) {
    throw new Error(`Missing ${extensionDir}. Run npm run build:whale first.`);
  }

  const whale = await import(pathToFileURL(whaleClientPath()).href);
  const detected = whale.detectWhale();
  if (!detected.found) throw new Error('NAVER Whale executable not found.');

  const launched = whale.launchWhale({
    port,
    userDataDir,
    url: 'about:blank',
    extraArgs: [
      '--window-size=390,900',
      `--load-extension=${extensionDir}`,
      `--disable-extensions-except=${extensionDir}`
    ]
  });

  try {
    await whale.waitForCdp({ port, timeoutMs: 15000 });
    await sleep(1500);

    const chzzkPage = await whale.newPage('https://chzzk.naver.com/following?tab=ALL', { port });
    await sleep(2000);
    await whale.evaluate(chzzkPage.id, `(() => {
      document.querySelector('#codex-chzzk-test-sidebar')?.remove();
      const host = document.createElement('aside');
      host.id = 'codex-chzzk-test-sidebar';
      host.innerHTML = '<ul class="navigation_bar_list__codex"><li data-test-id="alpha"><a href="/live/alpha"><span>Alpha Stream</span><span>라이브</span></a></li><li data-test-id="beta"><a href="/live/beta"><span>Beta Live</span><span>라이브</span></a></li><li data-test-id="gamma"><a href="/channel/gamma"><span>Gamma Offline</span></a></li></ul>';
      document.body.prepend(host);
      return true;
    })()`, { port });

    const before = await chzzkSidebarOrder(whale, chzzkPage.id);
    const contentScriptVersion = await whale.evaluate(chzzkPage.id, `document.getElementById('chzzk-star-styles')?.dataset.chzzkExtensionVersion || ''`, { port });

    const shown = await whale.showSidebarAction(extensionName, { port, pagePath: 'sidebar.html' });
    if (!shown.result?.showCalled || shown.result?.lastError) {
      throw new Error(`Whale sidebar_action.show failed: ${JSON.stringify(shown.result)}`);
    }

    const sidebarPage = await waitForValue('sidebar.html target', async () => {
      const pages = await whale.listPages({ port });
      return pages.find(page => page.url?.includes('/sidebar.html')) || null;
    });

    await sleep(1000);
    await whale.evaluate(sidebarPage.id, `chrome.storage.local.set({
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
        assignments: { beta: 's', alpha: 's' },
        tierOrder: { s: ['beta', 'alpha'], a: [], b: [], c: [], d: [] }
      }
    })`, { port });

    const injectionDebug = await whale.evaluate(sidebarPage.id, `(async () => {
      const files = ${JSON.stringify([
        'js/logger.js',
        'js/platform.js',
        'js/domAdapter.js',
        'js/favoriteTierStore.js',
        'js/settings.js',
        'js/viewerCount.js',
        'js/moreButton.js',
        'js/star.js',
        'js/shuffle.js',
        'content.js'
      ])};
      const result = {
        hasWhale: typeof whale !== 'undefined',
        hasChrome: typeof chrome !== 'undefined',
        whaleScripting: Boolean(globalThis.whale?.scripting?.executeScript),
        chromeScripting: Boolean(globalThis.chrome?.scripting?.executeScript),
        platformScripting: Boolean(window.ChzzkPlatform?.scripting?.executeScript),
        platformRuntime: Boolean(window.ChzzkPlatform?.runtime?.sendMessage)
      };
      try {
        const tabs = await window.ChzzkPlatform.queryTabs({ url: '*://chzzk.naver.com/*' });
        result.tabs = tabs.map(tab => ({ id: tab.id, url: tab.url }));
        result.tabId = tabs[0]?.id;
        if (result.tabId) {
          try {
            await window.ChzzkPlatform.executeScripts(result.tabId, files);
            result.directInject = 'ok';
          } catch (error) {
            result.directInject = error.message || String(error);
          }
          try {
            const response = await window.ChzzkPlatform.sendRuntimeMessage({ type: 'INJECT_CONTENT_SCRIPTS', tabId: result.tabId, files });
            result.backgroundInject = response;
          } catch (error) {
            result.backgroundInject = error.message || String(error);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          const sendVia = (api, label) => new Promise((resolve) => {
            try {
              api.tabs.sendMessage(result.tabId, { type: 'GET_CHZZK_CHANNELS' }, (response) => {
                resolve({
                  label,
                  response,
                  lastError: api.runtime?.lastError?.message || null
                });
              });
            } catch (error) {
              resolve({ label, error: error.message || String(error) });
            }
          });
          result.whaleMessage = globalThis.whale?.tabs ? await sendVia(globalThis.whale, 'whale') : null;
          result.chromeMessage = globalThis.chrome?.tabs ? await sendVia(globalThis.chrome, 'chrome') : null;
        }
      } catch (error) {
        result.queryTabs = error.message || String(error);
      }
      return result;
    })()`, { port });

    await whale.evaluate(sidebarPage.id, `document.getElementById('refreshBtn')?.click(); true`, { port });
    await sleep(1200);
    await whale.evaluate(sidebarPage.id, `document.getElementById('applyBtn')?.click(); true`, { port, userGesture: true });
    await sleep(1200);

    const after = await chzzkSidebarOrder(whale, chzzkPage.id);
    const chzzkDebug = await whale.evaluate(chzzkPage.id, `(() => ({
      hasPlatform: Boolean(window.ChzzkPlatform),
      hasDom: Boolean(window.ChzzkDom),
      hasStore: Boolean(window.ChzzkFavoriteTierStore),
      hasShuffle: Boolean(window.ChzzkShuffle),
      hasMessageFlag: Boolean(window.__chzzkSidebarMessageRegistered),
      snapshotCount: window.ChzzkShuffle?.getChannelSnapshot?.().length ?? null,
      directLinkCount: document.querySelectorAll('#codex-chzzk-test-sidebar a[href*="/live/"], #codex-chzzk-test-sidebar a[href*="/channel/"]').length,
      adapterCount: window.ChzzkDom?.findChannelsList?.(document)?.items?.length ?? null
    }))()`, { port });
    const metrics = await sidebarMetrics(whale, sidebarPage.id);

    const dndResult = await whale.evaluate(sidebarPage.id, `(async () => {
      const zone = document.querySelector('.drop-zone[data-tier-id="s"]');
      const alpha = zone?.querySelector('[data-channel-id="alpha"]');
      const beta = zone?.querySelector('[data-channel-id="beta"]');
      if (!zone || !alpha || !beta) return { ok: false, reason: 'missing-cards' };
      alpha.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }));
      const rect = beta.getBoundingClientRect();
      beta.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: rect.top + 1 }));
      beta.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: rect.top + 1 }));
      await new Promise(resolve => setTimeout(resolve, 1200));
      const state = await chrome.storage.local.get('chzzkFavoriteTierState');
      return {
        ok: true,
        sTierIds: Array.from(document.querySelectorAll('.drop-zone[data-tier-id="s"] .streamer-card')).map(card => card.dataset.channelId),
        storedOrder: state.chzzkFavoriteTierState?.tierOrder?.s || []
      };
    })()`, { port });
    const orderAfterSameTierDnd = await chzzkSidebarOrder(whale, chzzkPage.id);

    await clickElementCenter(whale, sidebarPage.id, `(() => {
      const element = document.querySelector('#channelList [data-channel-id="gamma"] .mini');
      element?.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`, 'gamma add favorite');
    const afterAddFavorite = await sidebarMetrics(whale, sidebarPage.id);
    const orderAfterAddFavorite = await chzzkSidebarOrder(whale, chzzkPage.id);

    await clickElementCenter(whale, sidebarPage.id, `(() => {
      const element = document.querySelector('#unassignedList [data-channel-id="gamma"] [data-tier-choice="b"]');
      element?.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`, 'gamma B tier');
    const afterAssignTier = await sidebarMetrics(whale, sidebarPage.id);
    const orderAfterAssignTier = await chzzkSidebarOrder(whale, chzzkPage.id);

    await clickElementCenter(whale, sidebarPage.id, `(() => {
      const element = document.querySelector('.drop-zone[data-tier-id="b"] [data-channel-id="gamma"] .mini');
      element?.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`, 'gamma remove favorite');
    const afterRemoveFavorite = await sidebarMetrics(whale, sidebarPage.id);
    const orderAfterRemoveFavorite = await chzzkSidebarOrder(whale, chzzkPage.id);

    await whale.screenshot(sidebarPage.id, screenshotPath, { port, fullPage: true });

    if (before !== 'alpha,beta,gamma') throw new Error(`Unexpected initial order: ${before}. Debug: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    if (contentScriptVersion !== packageJson.version) {
      throw new Error(`Content script version marker mismatch: ${contentScriptVersion || '(missing)'} !== ${packageJson.version}. Debug: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    if (after !== 'beta,alpha,gamma') throw new Error(`Tier sort did not apply. Final order: ${after}. Debug: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    if (!dndResult.ok || dndResult.storedOrder.join(',') !== 'alpha,beta' || dndResult.sTierIds.join(',') !== 'alpha,beta') {
      throw new Error(`Same-tier DnD did not persist the requested S tier order: ${JSON.stringify({ dndResult, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (orderAfterSameTierDnd !== 'alpha,beta,gamma') {
      throw new Error(`Same-tier DnD order did not apply to the CHZZK page: ${JSON.stringify({ orderAfterSameTierDnd, dndResult, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (metrics.overflowX || metrics.buttonOverflow.length) throw new Error(`Whale layout overflow: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    if (metrics.iconSlotMetrics.length < 2 || metrics.iconSlotMetrics.some(metric => metric.width !== 16 || metric.height !== 16 || metric.iconWidth !== 16 || metric.iconHeight !== 16 || Math.abs(metric.centerDeltaX) > 1 || Math.abs(metric.centerDeltaY) > 1)) {
      throw new Error(`Whale sidebar action icons are not centered in their slots: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    if (metrics.iconButtonMetrics.some(metric => metric.width < 40 || metric.height < 40 || metric.iconWidth < 16 || metric.iconHeight < 16 || Math.abs(metric.centerDeltaX) > 1 || Math.abs(metric.centerDeltaY) > 1)) {
      throw new Error(`Whale sidebar icon-only buttons are not centered or large enough: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    if (metrics.miniMetrics.some(metric => metric.width < 40 || metric.height < 40 || metric.iconWidth < 16 || metric.iconHeight < 16 || Math.abs(metric.centerDeltaX) > 1 || Math.abs(metric.centerDeltaY) > 1)) {
      throw new Error(`Whale sidebar favorite buttons are not centered or large enough: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    if (!metrics.toolbarButtonBox || metrics.toolbarButtonBox.left < 0 || metrics.toolbarButtonBox.right > metrics.toolbarButtonBox.viewport) {
      throw new Error(`Whale toolbar button is clipped or outside viewport: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    if (metrics.toolbarPosition === 'sticky' || metrics.toolbarPosition === 'fixed') {
      throw new Error(`Whale toolbar should not float over tier rows while scrolled: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    if (metrics.destructiveMiniText) throw new Error(`Starred control still looks destructive: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    if (metrics.coloredTierChipCount < 10) {
      throw new Error(`Tier chips should carry tier color cues for quicker visual parsing: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    if (metrics.addSectionTitle !== '즐겨찾기에 추가' || metrics.availableChannelIds.join(',') !== 'gamma') {
      throw new Error(`Available-channel section is not scoped to unstarred channels: ${JSON.stringify({ metrics, chzzkDebug, injectionDebug })}`);
    }
    await setSidebarSearch(whale, sidebarPage.id, 'Gamma');
    const afterSearchGamma = await sidebarMetrics(whale, sidebarPage.id);
    await setSidebarSearch(whale, sidebarPage.id, 'NoSuchStreamer');
    const afterSearchEmpty = await sidebarMetrics(whale, sidebarPage.id);
    await setSidebarSearch(whale, sidebarPage.id, '');
    const afterSearchClear = await sidebarMetrics(whale, sidebarPage.id);
    if (afterSearchGamma.availableChannelIds.join(',') !== 'gamma' || afterSearchGamma.channelCountText !== '1/3') {
      throw new Error(`Sidebar search should keep matching available channels visible: ${JSON.stringify({ afterSearchGamma, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (afterSearchEmpty.availableChannelIds.length !== 0 || afterSearchEmpty.channelEmptyText !== '검색 결과 없음') {
      throw new Error(`Sidebar search empty state is unclear: ${JSON.stringify({ afterSearchEmpty, afterSearchGamma, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (afterSearchClear.availableChannelIds.join(',') !== 'gamma' || afterSearchClear.searchValue !== '') {
      throw new Error(`Sidebar search clear should restore available channels: ${JSON.stringify({ afterSearchClear, afterSearchEmpty, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (afterAddFavorite.favoriteCount !== '3' || afterAddFavorite.availableChannelIds.length !== 0 || afterAddFavorite.unassignedIds.join(',') !== 'gamma') {
      throw new Error(`Sidebar favorite add button did not move gamma into unassigned favorites: ${JSON.stringify({ afterAddFavorite, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (!orderAfterAddFavorite.startsWith('gamma,')) {
      throw new Error(`Adding a favorite should move that channel to the top immediately. order=${orderAfterAddFavorite}; evidence=${JSON.stringify({ afterAddFavorite, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (orderAfterAddFavorite.split(',').filter(Boolean).length !== 3) {
      throw new Error(`CHZZK sidebar lost channels after adding a favorite: ${JSON.stringify({ orderAfterAddFavorite, afterAddFavorite, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (afterAssignTier.assignedCount !== '3' || afterAssignTier.bTierIds.join(',') !== 'gamma' || afterAssignTier.gammaTierPressed.join(',') !== 'b') {
      throw new Error(`Sidebar tier chip did not assign gamma to B tier: ${JSON.stringify({ afterAssignTier, afterAddFavorite, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (orderAfterAssignTier.split(',').filter(Boolean).length !== 3) {
      throw new Error(`CHZZK sidebar lost channels after assigning a tier: ${JSON.stringify({ orderAfterAssignTier, afterAssignTier, afterAddFavorite, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (afterRemoveFavorite.favoriteCount !== '2' || afterRemoveFavorite.assignedCount !== '2' || afterRemoveFavorite.availableChannelIds.join(',') !== 'gamma') {
      throw new Error(`Sidebar favorite remove button did not return gamma to available channels: ${JSON.stringify({ afterRemoveFavorite, afterAssignTier, afterAddFavorite, metrics, chzzkDebug, injectionDebug })}`);
    }
    if (orderAfterRemoveFavorite.split(',').filter(Boolean).length !== 3) {
      throw new Error(`CHZZK sidebar lost channels after removing a favorite: ${JSON.stringify({ orderAfterRemoveFavorite, afterRemoveFavorite, afterAssignTier, afterAddFavorite, metrics, chzzkDebug, injectionDebug })}`);
    }

    console.log(JSON.stringify({
      status: 'PASS',
      route: 'isolated-whale-regression-harness',
      mainBrowserEvidence: false,
      note: 'This proves Whale extension and sidebar behavior in an isolated Whale harness. Main Whale QA still needs a controllable logged-in profile.',
      pid: launched.pid,
      contentScriptVersion,
      before,
      after,
      injectionDebug,
      metrics,
      searchMetrics: {
        afterSearchGamma,
        afterSearchEmpty,
        afterSearchClear
      },
      interactionMetrics: {
        dndResult,
        orderAfterSameTierDnd,
        afterAddFavorite,
        afterAssignTier,
        afterRemoveFavorite,
        orderAfterAddFavorite,
        orderAfterAssignTier,
        orderAfterRemoveFavorite
      },
      screenshotPath
    }, null, 2));
  } finally {
    try {
      process.kill(launched.pid);
    } catch {
      // The browser may already be closed, or the child process may have spawned workers.
    }
    if (process.platform === 'win32') {
      const { spawnSync } = await import('node:child_process');
      spawnSync('taskkill.exe', ['/PID', String(launched.pid), '/T', '/F'], { stdio: 'ignore' });
    }
    await sleep(500);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Windows can keep the profile directory locked briefly after taskkill.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
