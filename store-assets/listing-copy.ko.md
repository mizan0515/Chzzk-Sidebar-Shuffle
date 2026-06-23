# CHZZK Favorites & Tiers - 스토어 등록 문구 초안

## Chrome Web Store

### 이름
CHZZK Favorites & Tiers

### 짧은 설명
치지직 팔로잉 스트리머를 즐겨찾기, 티어, 셔플 기준으로 보기 좋게 정렬합니다.

### 상세 설명
CHZZK Favorites & Tiers는 치지직 팔로잉 사이드바를 자주 보는 사용자에게 필요한 정리 도구입니다. 즐겨찾는 스트리머를 별표로 고정하고, S/A/B/C/D 티어로 분류한 뒤, 내가 정한 우선순서대로 팔로잉 목록을 정렬할 수 있습니다.

주요 기능:
- 치지직 팔로잉 채널 옆 별표로 즐겨찾기 등록
- S/A/B/C/D 티어와 미분류 즐겨찾기 관리
- 티어 우선 정렬과 같은 그룹 내부 셔플
- 일반 라이브 채널과 오프라인 채널 분리 정렬
- 시청자 수 숨김, 팔로잉 목록 자동 펼치기
- 활동 추적 채널을 저장 목록에 병합해 비방송 중 채널도 티어 관리
- 치지직 타임코드 복사 단축키
- 현재 치지직 탭에 바로 정렬 적용

Chrome 확장 팝업에서 빠르게 정렬, 셔플, 설정을 조작하고 같은 팝업 안에서 티어 관리 화면으로 전환할 수 있습니다. 이 제품은 Chrome-only로 운영하며 Whale 사이드바 전용 UX는 출시 범위에 포함하지 않습니다.

이 확장은 치지직 페이지에서만 동작하도록 제한되어 있으며, 즐겨찾기와 티어 정보는 브라우저의 확장 저장소에 저장됩니다.

### 권한 설명
- `storage`: 즐겨찾기, 티어, 정렬 설정을 저장합니다.
- `activeTab`, `scripting`, `tabs`: 현재 열려 있는 치지직 탭을 찾고 정렬 기능을 적용합니다.
- `alarms`: 활동 추적을 주기적으로 확인할 수 있게 준비합니다.
- `notifications`: 방송 상태 변경 알림 기능을 위해 사용합니다.
- `clipboardWrite`: 사용자가 요청한 치지직 타임코드를 클립보드에 복사합니다.
- `declarativeNetRequest`: 치지직/네이버 요청을 안전하게 다루는 활동 추적 확장 기능을 위해 준비합니다.
- `*://chzzk.naver.com/*`: 치지직 팔로잉 목록에서 채널 정보를 읽고 정렬 버튼을 표시합니다.
- `https://api.chzzk.naver.com/*`: 활동 추적 대상 채널의 라이브 상태를 확인합니다.
- `*://*.naver.com/*`, `*://*.pstatic.net/*`: 치지직과 네이버 관련 활동 추적/이미지 리소스에 한정해 사용합니다.

### 개인정보/데이터 설명
이 확장은 치지직 팔로잉 정렬과 활동 추적을 위해 브라우저 확장 저장소에 채널 이름, 채널 링크, 즐겨찾기 여부, 티어 배정, 활동 추적 여부, 최근 감지 상태를 저장합니다. 이 데이터는 확장 기능 제공을 위해 치지직/네이버 페이지와 API에서만 사용하며 별도 외부 서버로 전송하지 않습니다.

## 이미지 산출물

### Chrome 스크린샷
- `store-assets/chrome/screenshots/01-tier-sort.png`
- `store-assets/chrome/screenshots/02-popup-controls.png`
- `store-assets/chrome/screenshots/04-safe-qa.png`

### Chrome 프로모션 이미지
- `store-assets/chrome/promo-small-440x280.png`
- `store-assets/chrome/promo-marquee-1400x560.png`

### 아이콘
- `assets/icons/icon-16.png`
- `assets/icons/icon-32.png`
- `assets/icons/icon-48.png`
- `assets/icons/icon-128.png`
- `store-assets/icons/store-icon-128.png`
- `store-assets/icons/store-icon-512.png`

## 업로드 전 주의

- Chrome Store 공개 전에는 `npm run validate`, `npm run build:chrome`, 실제 Chrome 확장 액션 팝업, 치지직 팔로잉 페이지 동작 검증을 분리해 확인해야 합니다.
- 격리 Chromium, 직접 `chrome-extension://.../popup.html`, Whale 사이드바 경로는 Chrome Web Store 공개 가능 판정의 acceptance evidence가 아닙니다.
- 실제 스토어 제출은 계정, 심사, 공개 범위가 걸린 manager-only 결정입니다.
