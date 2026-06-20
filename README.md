# CHZZK Favorites & Tiers

Chrome-only CHZZK extension for pinning favorite streamers, sorting the following sidebar by tiers, shuffling within groups, and tracking streamer activity.

## Product Scope

- Supported browser: Chrome.
- NAVER Whale is not a release target for this product.
- Whale sidebar-only behavior does not satisfy the requested Chrome toolbar popup UX, so Whale build, QA, and store release lanes are intentionally not part of the default workflow.
- A passing result requires the real Chrome extension action popup to open and be usable. Opening `chrome-extension://.../popup.html` directly is only a render probe and is not real-use evidence.

## Features

- Favorite star: pins a channel immediately and moves it to the top group.
- Tier sort: sorts as S/A/B/C/D, unassigned favorites, regular live, regular offline.
- Group shuffle: shuffles only inside the same tier/group and keeps group boundaries.
- Viewer count hiding: reduces noisy viewer-count text around the sidebar and cards.
- In-popup tier management: the Chrome popup switches to the tier manager screen in place and includes a back button.
- Activity tracker integration: stored tracker channels are merged into the same channel model, so offline tracked streamers can still appear in tier management.
- Timecode copy: copies the current CHZZK live/video time text.

## Chrome Developer Install

```powershell
npm run build:chrome
```

1. Open Chrome `chrome://extensions`.
2. Turn on Developer mode.
3. Load the unpacked folder `dist/chrome`.
4. Pin or open the extension action, then click the extension icon.

Normal result: a usable popup opens with sort, shuffle, settings, and tier management controls. A blank tall 1px-looking popup is a failure.

## Build Artifacts

```powershell
npm run build:all
```

- Chrome folder: `dist/chrome`
- Chrome unpacked artifact: `artifacts/chzzk-sidebar-shuffler-chrome-v<version>`
- Chrome zip: `artifacts/chzzk-sidebar-shuffler-chrome-v<version>.zip`

`build:all` intentionally builds Chrome only.

## Validation

```powershell
npm run validate
```

Validation includes:

- JavaScript syntax checks
- selector and layout regression tests
- popup structure and accessibility checks
- favorite/tier/activity merge checks
- Chrome manifest validation
- Chrome zip and unpacked artifact creation

## Real Chrome QA Standard

Automated isolated Chromium QA is useful for regression checks, but it is not manager real-use evidence.

The required real-use path is:

1. Use the manager's logged-in Chrome session when the behavior depends on CHZZK login or the real toolbar popup.
2. Install or refresh `dist/chrome` in Chrome only after manager approval, because it changes browser extension state.
3. Click the actual Chrome extension icon or trigger the browser-owned extension action surface.
4. Verify the popup is not blank, not 1px wide, and has usable controls.
5. Open tier management from inside the popup, use the back button, and return to the home screen.
6. On `https://chzzk.naver.com/following`, verify favorites, F5 reload order, group shuffle, same-tier drag/drop order, viewer-count layout, and offline tracked streamers.

If the session cannot attach to the logged-in Chrome browser, report `UNVERIFIED_MAIN_CHROME_LOGIN_REQUIRED` and ask the manager to open/log in to Chrome or provide a controllable Chrome plugin/session. Do not substitute isolated Chromium or direct popup URL evidence.

## Browser QA Cleanup

This project does not use an isolated Chrome or Chromium profile as acceptance QA. Real-use browser evidence must come from the manager-visible Chrome surface, through the approved `@chrome` or Computer Use route.

Before Done or PR_READY:

```powershell
npm run qa:browser-cleanup
npm run guard:browser-cleanup
```

The cleanup command targets only browser sessions created by this repository's QA scripts.

## Main Chrome Helpers

```powershell
npm run qa:main:chrome:popup
```

`qa:main:chrome:popup` only works when the manager-visible Chrome instance is already reachable through CDP. It must not launch a separate Chrome profile. If CDP is not attached, use the approved `@chrome` or Computer Use route to inspect the real Chrome window, or report that main Chrome real-use evidence is still unavailable.

## Completion Gate

```powershell
npm run guard:completion
```

This requires static validation, Chrome build, isolated Chromium regression QA, and main logged-in Chrome real-use evidence.

If main Chrome cannot be attached in the current session, the scoped guard may be used only with an explicit final report saying the real-use evidence is still unverified:

```powershell
npm run guard:completion:allow-main-unverified
```

This does not mean public release-ready. Chrome Web Store upload remains manager-approved work.

## License

MIT License

## Support

[후원하기](https://aq.gy/f/Jf1nN)
