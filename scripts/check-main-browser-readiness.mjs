import { spawnSync } from 'node:child_process';

const DEFAULT_WHALE_PORT = Number(process.env.CHZZK_MAIN_WHALE_PORT || 9223);
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

function whaleProcesses() {
  const output = runPowerShell(`
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -like 'whale*' } |
      Select-Object ProcessId, Name, CommandLine |
      ConvertTo-Json -Depth 3
  `);
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
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

function classifyWhaleProcess(process) {
  const commandLine = String(process.CommandLine || '');
  const lower = commandLine.toLowerCase();
  return {
    pid: process.ProcessId,
    hasRemoteDebugging: /--remote-debugging-port=/.test(commandLine),
    isCodexIsolatedProfile: lower.includes('codex-whale-profile') || lower.includes('codex-whale-chzzk-sidebar'),
    usesExplicitUserDataDir: /--user-data-dir=/i.test(commandLine)
  };
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
  const processes = whaleProcesses().map(classifyWhaleProcess);
  const chrome = chromeProcesses().map(classifyChromeProcess);
  const remoteDebugProcesses = processes.filter(item => item.hasRemoteDebugging);
  const cdp = await cdpVersion(DEFAULT_WHALE_PORT);
  const portOwner = remoteDebugProcesses.find(item => !item.isCodexIsolatedProfile) ||
    remoteDebugProcesses.find(item => item.isCodexIsolatedProfile) ||
    null;

  const mainWhaleRunning = processes.some(item => !item.isCodexIsolatedProfile);
  const mainWhaleAttachReady = Boolean(cdp?.version && portOwner && !portOwner.isCodexIsolatedProfile);
  const isolatedPortOnly = Boolean(cdp?.version && portOwner?.isCodexIsolatedProfile);

  const result = {
    status: mainWhaleAttachReady ? 'READY' : 'NOT_READY',
    mainBrowserEvidence: mainWhaleAttachReady,
    realUseReadiness: mainWhaleAttachReady ? 'MAIN_BROWSER_READY' : 'MAIN_BROWSER_UNVERIFIED',
    completionGuard: mainWhaleAttachReady
      ? 'Main Whale is controllable. Run the real CHZZK journey before claiming REAL_USE_PASS.'
      : 'Do not claim REAL_USE_PASS, Done, or release-ready from isolated Chrome/Whale harnesses alone.',
    requireMainBrowser,
    whale: {
      checkedPort: DEFAULT_WHALE_PORT,
      cdpHost: cdp?.host || null,
      processCount: processes.length,
      mainWhaleRunning,
      remoteDebugProcessCount: remoteDebugProcesses.length,
      portOpen: Boolean(cdp?.version),
      portLooksIsolated: isolatedPortOnly,
      mainWhaleAttachReady
    },
    chrome: {
      processCount: chrome.length,
      mainChromeRunning: chrome.length > 0,
      remoteDebugProcessCount: chrome.filter(item => item.hasRemoteDebugging).length,
      note: 'Chrome extension install/update and chrome://extensions are verified through the Chrome plugin real-use path when available; process presence alone is not extension QA evidence.'
    },
    nextAction: mainWhaleAttachReady
      ? 'Use @whale/CDP on this existing main Whale endpoint for real-use QA.'
      : 'Main Whale is not controllable yet. Do not substitute isolated QA. Ask for approval to restart main Whale with a remote debugging port, or have the manager open Whale with remote debugging enabled.'
  };

  console.log(JSON.stringify(result, null, 2));

  if (requireMainBrowser && !mainWhaleAttachReady) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
