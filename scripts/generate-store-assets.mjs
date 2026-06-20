import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'store-assets');
const iconOut = join(root, 'assets', 'icons');
const artifacts = join(root, 'artifacts');

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function svgText(lines, x, y, options = {}) {
  const {
    size = 32,
    weight = 700,
    fill = '#f4fff9',
    lineHeight = Math.round(size * 1.38),
    anchor = 'start'
  } = options;

  return lines.map((line, index) => `
    <text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}"
      font-family="Pretendard, Inter, Segoe UI, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
      font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>
  `).join('');
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    const candidates = [
      process.env.STORE_ASSET_NODE_MODULES,
      join(root, 'node_modules'),
      process.env.USERPROFILE
        ? join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules')
        : null
    ].filter(Boolean);

    const extraNodePaths = candidates
      .flatMap((dir) => [dir, join(dir, '.pnpm', 'node_modules')])
      .filter((dir) => existsSync(dir));
    if (extraNodePaths.length) {
      process.env.NODE_PATH = [process.env.NODE_PATH, ...extraNodePaths].filter(Boolean).join(process.platform === 'win32' ? ';' : ':');
      Module._initPaths();
    }

    try {
      return require('sharp');
    } catch {
      // Try package paths below.
    }

    for (const dir of candidates) {
      const entry = join(dir, 'sharp');
      if (!existsSync(entry)) continue;
      try {
        return require(entry);
      } catch {
        try {
          return (await import(pathToFileURL(join(entry, 'lib', 'index.js')).href)).default;
        } catch {
          // Try the next candidate.
        }
      }
    }
  }

  throw new Error('sharp is required to generate PNG store assets. Set STORE_ASSET_NODE_MODULES to a node_modules folder containing sharp.');
}

function iconSvg(size = 128) {
  const scale = size / 128;
  const s = (value) => Math.round(value * scale * 1000) / 1000;
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="bg" x1="16" y1="16" x2="112" y2="112" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0d151c"/>
        <stop offset="1" stop-color="#17232d"/>
      </linearGradient>
      <linearGradient id="star" x1="34" y1="31" x2="94" y2="95" gradientUnits="userSpaceOnUse">
        <stop stop-color="#00ffa3"/>
        <stop offset="1" stop-color="#73c2fb"/>
      </linearGradient>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.4" result="blur"/>
        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0 0 0 0 0 1 0 0 0 0 .62 0 0 0 .55 0"/>
        <feBlend in="SourceGraphic"/>
      </filter>
    </defs>
    <rect x="${s(16)}" y="${s(16)}" width="${s(96)}" height="${s(96)}" rx="${s(24)}" fill="url(#bg)"/>
    <rect x="${s(16.75)}" y="${s(16.75)}" width="${s(94.5)}" height="${s(94.5)}" rx="${s(23.25)}" fill="none" stroke="#2a3947" stroke-width="${s(1.5)}"/>
    <path filter="url(#glow)" fill="url(#star)" d="M64 29.5 72.7 48l20.2 2.8-14.6 14.1 3.6 20-17.9-9.5-18 9.5 3.5-20-14.5-14.1L55.2 48 64 29.5Z"/>
    <rect x="${s(36)}" y="${s(93)}" width="${s(56)}" height="${s(6)}" rx="${s(3)}" fill="#00ffa3"/>
    <rect x="${s(43)}" y="${s(102)}" width="${s(42)}" height="${s(5)}" rx="${s(2.5)}" fill="#73c2fb" opacity=".95"/>
  </svg>`;
}

async function writePngFromSvg(sharp, svg, path, width, height) {
  ensureDir(dirname(path));
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(path);
}

function slideSvg({ title, subtitle, bullets, label, accent = '#00ffa3', mode = 'chrome' }) {
  const bulletText = bullets.map((bullet, index) => `
    <g transform="translate(84 ${index * 70 + 405})">
      <circle cx="0" cy="-8" r="8" fill="${accent}"/>
      <text x="24" y="0" font-family="Pretendard, Inter, Segoe UI, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
        font-size="28" font-weight="700" fill="#d8e6e0">${escapeXml(bullet)}</text>
    </g>
  `).join('');

  const tierRows = ['S', 'A', 'B', 'C', 'D'].map((tier, index) => {
    const colors = ['#ff6b6b', '#ffd166', '#7bd88f', '#73c2fb', '#b8b8c7'];
    const y = 168 + index * 72;
    return `
      <g transform="translate(704 ${y})">
        <rect width="84" height="48" rx="12" fill="${colors[index]}" opacity=".92"/>
        <text x="42" y="32" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-size="26" font-weight="900" fill="#06100c">${tier}</text>
        <rect x="104" width="${index < 2 ? 272 : 214}" height="48" rx="12" fill="#18242e" stroke="#2e4150"/>
        <circle cx="132" cy="24" r="12" fill="${colors[index]}"/>
        <rect x="154" y="15" width="${index < 2 ? 158 : 108}" height="10" rx="5" fill="#dceae3"/>
        <rect x="154" y="31" width="${index < 2 ? 94 : 76}" height="7" rx="3.5" fill="#768796"/>
      </g>
    `;
  }).join('');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
    <defs>
      <linearGradient id="page" x1="0" y1="0" x2="1280" y2="800" gradientUnits="userSpaceOnUse">
        <stop stop-color="#071015"/>
        <stop offset=".62" stop-color="#101922"/>
        <stop offset="1" stop-color="#132028"/>
      </linearGradient>
      <radialGradient id="halo" cx="72%" cy="24%" r="58%">
        <stop stop-color="${accent}" stop-opacity=".25"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="800" fill="url(#page)"/>
    <rect width="1280" height="800" fill="url(#halo)"/>
    <rect x="64" y="56" width="104" height="42" rx="21" fill="#13232c" stroke="#28424f"/>
    <text x="116" y="84" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-size="17" font-weight="800" fill="${accent}">${escapeXml(label)}</text>
    ${svgText(title, 64, 178, { size: 58, weight: 900, lineHeight: 70 })}
    ${svgText([subtitle], 66, 316, { size: 28, weight: 600, fill: '#aab8c5' })}
    ${bulletText}
    <rect x="646" y="74" width="558" height="652" rx="32" fill="#0c141b" stroke="#28404d" stroke-width="2"/>
    <rect x="676" y="112" width="498" height="574" rx="24" fill="#101b24" stroke="#223542"/>
    ${mode === 'tiers' ? tierRows : ''}
    <text x="925" y="698" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-size="18" font-weight="700" fill="#6f8190">CHZZK Favorites &amp; Tiers</text>
  </svg>`;
}

async function makeSlide(sharp, config) {
  const base = sharp(Buffer.from(slideSvg(config))).png();
  const composites = [];

  if (config.screenshot && existsSync(config.screenshot)) {
    const image = await sharp(config.screenshot)
      .resize({ width: config.screenshotWidth || 390, height: config.screenshotHeight || 574, fit: 'contain', background: '#101b24' })
      .png()
      .toBuffer();
    composites.push({ input: image, left: config.left || 728, top: config.top || 112 });
  }

  const output = await base.composite(composites).png().toBuffer();
  ensureDir(dirname(config.output));
  await sharp(output).png().toFile(config.output);
}

async function main() {
  const sharp = await loadSharp();
  ensureDir(iconOut);
  ensureDir(outRoot);

  for (const size of [16, 32, 48, 128, 512]) {
    const path = size === 512
      ? join(outRoot, 'icons', 'store-icon-512.png')
      : join(iconOut, `icon-${size}.png`);
    await writePngFromSvg(sharp, iconSvg(size), path, size, size);
  }
  copyFileSync(join(iconOut, 'icon-128.png'), join(root, 'icon.png'));
  copyFileSync(join(iconOut, 'icon-128.png'), join(outRoot, 'icons', 'store-icon-128.png'));

  const popupShot = join(artifacts, 'chromium-popup-final-390.png');
  const slides = [
    {
      file: '01-tier-sort.png',
      title: ['팔로잉 목록을', '티어 순서로 정리'],
      subtitle: 'S/A/B/C/D와 미분류 즐겨찾기를 먼저 보여줍니다.',
      bullets: ['티어 우선 정렬', '같은 티어 안에서만 셔플', '일반 라이브·오프라인 분리'],
      label: 'SORT',
      mode: 'tiers',
      accent: '#00ffa3'
    },
    {
      file: '02-popup-controls.png',
      title: ['Chrome 팝업에서', '바로 적용'],
      subtitle: '팝업에서 즉시 실행합니다.',
      bullets: ['현재 치지직 탭 감지', '버튼 상태와 이유 표시', '작은 팝업에서도 안정적인 조작'],
      label: 'CHROME',
      screenshot: popupShot,
      screenshotWidth: 390,
      screenshotHeight: 574,
      left: 728,
      top: 112,
      accent: '#73c2fb'
    },
    {
      file: '03-tier-manager.png',
      title: ['팝업 안에서', '티어 관리'],
      subtitle: '새 탭 없이 팝업 안에서 바로 관리합니다.',
      bullets: ['팝업 내부 관리 화면', '뒤로 가기로 원래 화면 복귀', '오프라인 추적 채널 포함'],
      label: 'MANAGE',
      screenshot: popupShot,
      screenshotWidth: 390,
      screenshotHeight: 574,
      left: 728,
      top: 112,
      accent: '#8bdbff'
    },
    {
      file: '04-safe-qa.png',
      title: ['채널이 사라지지 않게', '검증한 정렬'],
      subtitle: '즐겨찾기 추가·티어 지정·제거 후에도 LNB 채널 수를 보존합니다.',
      bullets: ['실제 치지직 URL 기반 QA', 'stale 확장 컨텍스트 복구 안내', 'Chrome 전용 패키지 생성'],
      label: 'SAFE',
      mode: 'tiers',
      accent: '#ffd166'
    }
  ];

  for (const slide of slides) {
    const chromePath = join(outRoot, 'chrome', 'screenshots', slide.file);
    await makeSlide(sharp, { ...slide, output: chromePath });
  }

  await writePngFromSvg(sharp, `
    <svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="440" y2="280"><stop stop-color="#071015"/><stop offset="1" stop-color="#10262c"/></linearGradient>
      </defs>
      <rect width="440" height="280" fill="url(#bg)"/>
      <circle cx="340" cy="72" r="106" fill="#00ffa3" opacity=".12"/>
      <image href="data:image/png;base64,${readFileSync(join(iconOut, 'icon-128.png')).toString('base64')}" x="44" y="52" width="112" height="112"/>
      ${svgText(['CHZZK', 'Favorites & Tiers'], 182, 104, { size: 34, weight: 900, lineHeight: 42 })}
      ${svgText(['즐겨찾기 · 티어 · 셔플'], 184, 184, { size: 19, weight: 700, fill: '#9fb0bd' })}
    </svg>
  `, join(outRoot, 'chrome', 'promo-small-440x280.png'), 440, 280);

  await writePngFromSvg(sharp, `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1400" y2="560"><stop stop-color="#071015"/><stop offset="1" stop-color="#12323a"/></linearGradient>
      </defs>
      <rect width="1400" height="560" fill="url(#bg)"/>
      <circle cx="1090" cy="110" r="260" fill="#00ffa3" opacity=".12"/>
      <image href="data:image/png;base64,${readFileSync(join(iconOut, 'icon-128.png')).toString('base64')}" x="118" y="154" width="220" height="220"/>
      ${svgText(['치지직 팔로잉을', '내 순서대로 정리'], 405, 215, { size: 76, weight: 900, lineHeight: 88 })}
      ${svgText(['즐겨찾기 · 티어표 · 안전한 그룹 셔플'], 410, 415, { size: 30, weight: 700, fill: '#a7b8c4' })}
    </svg>
  `, join(outRoot, 'chrome', 'promo-marquee-1400x560.png'), 1400, 560);

  console.log(JSON.stringify({
    status: 'PASS',
    icons: iconOut,
    storeAssets: outRoot
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
