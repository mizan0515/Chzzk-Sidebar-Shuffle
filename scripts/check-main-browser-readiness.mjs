import { spawnSync } from 'node:child_process';

const DEFAULT_CHROME_PORT = Number(process.env.CHZZK_MAIN_CHROME_PORT || 9222);
const requireMainBrowser = process.argv.includes('--require-main');

function runPowerShell(script) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'PowerShell command failed');
  }
  return result.stdout.trim();
}

function chromeProcesses() {
  const output = runPowerShell(`
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -ieq 'chrome.exe' } |
      Select-Object ProcessId, Name, CommandLine |
      ConvertTo-Json -Depth 3
  `);
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function fetchCdpJson(host, port, path) {
  try {
    const response = await fetch(`http://${host}:${port}${path}`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function cdpVersion(port) {
  for (const host of ['127.0.0.1', '[::1]']) {
    const version = await fetchCdpJson(host, port, '/json/version');
    if (version) return { host, version };
  }
  return null;
}

function classifyChromeProcess(process) {
  const commandLine = String(process.CommandLine || '');
  return {
    pid: process.ProcessId,
    hasRemoteDebugging: /--remote-debugging-port=/i.test(commandLine),
    usesExplicitUserDataDir: /--user-data-dir=/i.test(commandLine)
  };
}

async function main() {
  const chrome = chromeProcesses().map(classifyChromeProcess);
  const chromeCdp = await cdpVersion(DEFAULT_CHROME_PORT);
  const remoteDebugProcesses = chrome.filter(item => item.hasRemoteDebugging);
  const mainChromeAttachReady = Boolean(chromeCdp?.version && remoteDebugProcesses.length > 0);

  const result = {
    status: mainChromeAttachReady ? 'READY' : 'NOT_READY',
    mainBrowserEvidence: mainChromeAttachReady,
    realUseReadiness: mainChromeAttachReady ? 'MAIN_CHROME_READY' : 'MAIN_CHROME_UNVERIFIED',
    completionGuard: mainChromeAttachReady
      ? 'Main Chrome is controllable. Run the real CHZZK extension action popup and following-page journey before claiming REAL_USE_PASS.'
      : 'Do not claim REAL_USE_PASS, Done, or release-ready from isolated Chromium harnesses alone.',
    requireMainBrowser,
    chrome: {
      checkedPort: DEFAULT_CHROME_PORT,
      portOpen: Boolean(chromeCdp?.version),
      cdpHost: chromeCdp?.host || null,
      processCount: chrome.length,
      mainChromeRunning: chrome.length > 0,
      remoteDebugProcessCount: chrome.filter(item => item.hasRemoteDebugging).length,
      note: chromeCdp?.version
        ? 'Chrome CDP is reachable. Run npm run qa:main:chrome:popup after loading dist/chrome through scripts/Start-MainChromeQa.ps1.'
        : 'Chrome process presence alone is not extension QA evidence. Use npm run qa:main:chrome:plan, then manager-approved qa:main:chrome:start when restart is acceptable.'
    },
    nextAction: mainChromeAttachReady
      ? 'Use the existing main Chrome CDP endpoint for real-use QA. The next proof must click/open the Chrome extension action popup, not a direct popup URL.'
      : 'Main Chrome is not controllable yet. Do not substitute isolated QA. Ask the manager to keep CHZZK logged in and provide/enable a controllable Chrome plugin or approve a main Chrome restart with remote debugging.'
  };

  console.log(JSON.stringify(result, null, 2));

  if (requireMainBrowser && !mainChromeAttachReady) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
