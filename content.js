// Revised CHZZK SHUFFLE content.js (with auto-expand fix)
let isShuffling = false;
let mutationLock = false;
let observer = null;
let restoreLock = false;

function injectStyleOnce() {
  if (document.getElementById('chzzk-style')) return;
  const style = document.createElement('style');
  style.id = 'chzzk-style';
  style.textContent = `.chzzk-hidden { display: none !important; }`;
  document.head.appendChild(style);
  console.log('[CHZZK SHUFFLE] Custom CSS injected.');
}

function forceExpandSidebar(callback) {
  const moreBtn = document.querySelector('.navigator_button__BbAEb');
  if (moreBtn && moreBtn.textContent.includes('더보기')) {
    console.log('[CHZZK SHUFFLE] Clicking native more button to load all channels.');
    moreBtn.click();
    setTimeout(() => callback(), 800);
  } else {
    callback();
  }
}

function waitUntilEnoughItems(minCount = 10, callback, attempt = 0) {
  const list = document.querySelector('.navigator_list__cHnuV');
  const items = list?.querySelectorAll('.navigator_item__qXlq9') || [];
  console.log(`[CHZZK SHUFFLE] [Wait Attempt ${attempt}] Items loaded: ${items.length}/${minCount}`);
  if (items.length >= minCount) {
    console.log('[CHZZK SHUFFLE] All expected items loaded.');
    callback(list);
  } else if (attempt < 20) {
    forceExpandSidebar(() => {
      setTimeout(() => waitUntilEnoughItems(minCount, callback, attempt + 1), 400);
    });
  } else {
    console.warn('[CHZZK SHUFFLE] Item loading timeout. Proceeding anyway.');
    callback(list);
  }
}

function shuffleSidebar() {
  const list = document.querySelector('.navigator_list__cHnuV');
  if (!list || mutationLock) return;
  const items = Array.from(list.querySelectorAll('.navigator_item__qXlq9'));
  const live = [];
  const offline = [];
  items.forEach(item => {
    const viewerCount = item.querySelector('.navigator_count__db5Av');
    if (viewerCount) {
      viewerCount.style.setProperty('display', 'none', 'important');
      live.push(item);
    } else {
      offline.push(item);
    }
  });
  items.forEach(item => item.remove());
  shuffleArray(live);
  shuffleArray(offline);
  [...live, ...offline].forEach(item => list.appendChild(item));
  isShuffling = true;
  ensureMoreButtonAtBottom(list);
}

function ensureMoreButtonAtBottom(list) {
  console.log('[CHZZK SHUFFLE] Ensuring more button at bottom...');
  const footerClass = 'navigator_footer__7EbUV';
  list.querySelectorAll(`.${footerClass}`).forEach(footer => footer.remove());
  const moreButtonContainer = document.createElement('div');
  moreButtonContainer.className = footerClass;
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'navigator_button_more__UE0v3';
  moreButton.setAttribute('aria-expanded', 'false');
  updateMoreButtonText(moreButton, false);
  moreButton.addEventListener('click', () => {
    const expanded = moreButton.getAttribute('aria-expanded') === 'true';
    const newState = !expanded;
    moreButton.setAttribute('aria-expanded', newState.toString());
    updateMoreButtonText(moreButton, newState);
    const items = list.querySelectorAll('.navigator_item__qXlq9');
    console.log(`[CHZZK SHUFFLE] More button clicked. Items: ${items.length}, Expanding: ${newState}`);
    items.forEach((item, index) => {
      if (index >= 6) item.classList.toggle('chzzk-hidden', !newState);
    });
  });
  const items = list.querySelectorAll('.navigator_item__qXlq9');
  items.forEach((item, index) => {
    if (index >= 6) item.classList.add('chzzk-hidden');
  });
  moreButtonContainer.appendChild(moreButton);
  list.appendChild(moreButtonContainer);
  console.log('[CHZZK SHUFFLE] More button inserted.');
}

function updateMoreButtonText(button, expanded) {
  button.innerHTML = expanded
    ? `접기<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 6.5L8 9.5L11 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
    : `더보기<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 6.5L8 9.5L11 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function injectShuffleButton() {
  if (document.querySelector('#customShuffleBtn')) return;
  const target = document.querySelector('.header_service__DyG7M');
  if (!target) return;
  const button = document.createElement('button');
  button.id = 'customShuffleBtn';
  button.textContent = '채널 셔플';
  Object.assign(button.style, {
    margin: '4px', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer'
  });
  button.addEventListener('click', () => {
    console.log('[CHZZK SHUFFLE] Shuffle button clicked.');
    waitUntilEnoughItems(10, (list) => {
      shuffleSidebar();
    });
  });
  target.appendChild(button);
  console.log('[CHZZK SHUFFLE] Shuffle button injected.');
}

function observeChanges() {
  const sidebar = document.querySelector('#navigation');
  if (!sidebar) return;
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    if (mutationLock || restoreLock) return;
    mutationLock = true;
    setTimeout(() => {
      console.log('[CHZZK SHUFFLE] DOM mutation observed. Reapplying UI.');
      waitUntilEnoughItems(10, (list) => {
        shuffleSidebar();
        injectShuffleButton();
        mutationLock = false;
      });
    }, 500);
  });
  observer.observe(sidebar, { childList: true, subtree: true });
  console.log('[CHZZK SHUFFLE] Mutation observer activated.');
}

function monitorUrlAndRestore() {
  let lastUrl = location.href;
  setInterval(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('[CHZZK SHUFFLE] URL changed. Reinitializing...');
      setTimeout(() => {
        waitUntilEnoughItems(10, (list) => {
          shuffleSidebar();
          injectShuffleButton();
          observeChanges();
        });
      }, 500);
    }
  }, 1000);
}

function monitorAndRestore() {
  setInterval(() => {
    if (restoreLock) return;
    const sidebar = document.querySelector('#navigation');
    const list = document.querySelector('.navigator_list__cHnuV');
    const shuffleBtn = document.querySelector('#customShuffleBtn');
    const footer = document.querySelector('.navigator_footer__7EbUV');
    if (sidebar && list && (!shuffleBtn || !footer)) {
      restoreLock = true;
      console.log('[CHZZK SHUFFLE] DOM reset detected. Restoring...');
      waitUntilEnoughItems(10, (list) => {
        shuffleSidebar();
        injectShuffleButton();
        restoreLock = false;
      });
    }
  }, 1000);
}

function reinitializeOnLayoutChange() {
  const handler = () => {
    console.log('[CHZZK SHUFFLE] Layout change detected.');
    waitUntilEnoughItems(10, (list) => {
      shuffleSidebar();
      injectShuffleButton();
    });
  };
  window.addEventListener('resize', handler);
  document.addEventListener('fullscreenchange', handler);
}

window.addEventListener('load', () => {
  setTimeout(() => {
    injectStyleOnce();
    waitUntilEnoughItems(10, (list) => {
      shuffleSidebar();
      injectShuffleButton();
      observeChanges();
    });
    reinitializeOnLayoutChange();
    monitorAndRestore();
    monitorUrlAndRestore();
  }, 500);
});
