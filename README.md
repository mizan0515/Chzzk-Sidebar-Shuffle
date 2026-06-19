# Chzzk Sidebar Shuffler

치지직 팔로잉 사이드바를 즐겨찾기, 티어, 셔플 기준으로 정렬하는 Chrome/Whale 확장입니다.

## 주요 기능

- 즐겨찾기 별표: 사이드바 채널을 즐겨찾기로 고정합니다.
- 티어 정렬: S/A/B/C/D, 미분류 즐겨찾기, 일반 라이브, 일반 오프라인 순서로 정렬합니다.
- 그룹 안 셔플: 티어 경계를 유지한 채 같은 그룹 안에서만 섞습니다.
- 시청자 수 숨김: 사이드바와 카드의 시청자 수 노출을 줄입니다.
- 활동 추적 통합: 활동 추적 대상 채널을 저장 채널 모델에 합쳐 비방송 중 채널도 티어 관리에 표시합니다.
- 타임코드 복사: 치지직 영상/라이브의 현재 시간을 복사용 텍스트로 만듭니다.
- Whale 사이드바: Whale 전용 오른쪽/왼쪽 사이드바 패널에서 티어를 관리합니다.

## 설치

### Chrome 개발자 설치

1. `npm run build:chrome`
2. Chrome에서 `chrome://extensions`를 엽니다.
3. 개발자 모드를 켭니다.
4. `dist/chrome` 폴더를 압축해제된 확장 프로그램으로 로드합니다.

### Whale 개발자 설치

1. `npm run build:whale`
2. Whale에서 확장앱 관리 화면을 엽니다.
3. 개발자 모드를 켭니다.
4. `dist/whale` 폴더를 로드합니다.
5. Whale 사이드바에서 `치지직 티어 정렬` 패널을 엽니다.

## 빌드 산출물

```powershell
npm run build:all
```

- Chrome 폴더: `dist/chrome`
- Whale 폴더: `dist/whale`
- Chrome 압축 해제 폴더: `artifacts/chzzk-sidebar-shuffler-chrome-v<version>`
- Whale 압축 해제 폴더: `artifacts/chzzk-sidebar-shuffler-whale-v<version>`
- Chrome zip: `artifacts/chzzk-sidebar-shuffler-chrome-v<version>.zip`
- Whale zip: `artifacts/chzzk-sidebar-shuffler-whale-v<version>.zip`

`npm run build:chrome`, `npm run build:whale`, `npm run build:all`, `npm run validate`는 모두 해당 브라우저의 zip과 압축 해제 폴더를 함께 갱신합니다.

버전을 올릴 때는 Codex가 `npm run version:patch`, `npm run version:minor`, `npm run version:major` 중 하나를 실행하면 됩니다. `package.json` 버전이 바뀌면 `manifest.json` 버전이 동기화되고, 검증과 Chrome/Whale zip 및 압축 해제 폴더 생성이 이어서 실행됩니다. `npm version patch` 같은 기본 npm version 흐름도 `version` lifecycle로 같은 검증을 실행합니다.

## 검증

```powershell
npm run validate
```

검증에는 다음 항목이 포함됩니다.

- 모든 JavaScript `node --check`
- 위험한 `+` 포함 해시 class selector 회귀 검사
- CHZZK sidebar selector 회귀 테스트
- Chrome/Whale manifest 분리 검증
- Chrome/Whale zip artifact 생성

### 실사용 브라우저 QA 기준

브라우저에서 실제 동작을 확인할 때는 다음 순서를 기본으로 합니다.

1. 관리자가 `@chrome`, `@browser`, `@whale`을 지정한 경우 해당 플러그인으로 이미 열린 메인 브라우저 탭과 확장 상태를 먼저 확인합니다.
2. 메인 Chrome/Whale에 확장을 새로 설치하거나 `chrome://extensions`, `whale://extensions` 같은 설정 화면을 조작해야 하면, 브라우저 상태 변경이므로 실행 직전에 관리자 승인을 받습니다.
3. 자동 회귀 검증은 별도 격리 브라우저에서 실행합니다. 이는 기능 회귀를 빠르게 잡기 위한 하니스이며, 메인 Chrome/Whale 실사용 증거로 대체하지 않습니다.

메인 Whale 준비 상태 확인:

```powershell
npm run qa:main:readiness
```

이 명령은 새 Whale을 띄우지 않고 현재 실행 중인 Whale 프로세스와 디버깅 포트 상태만 읽습니다. `127.0.0.1`와 `[::1]` 디버깅 엔드포인트를 모두 확인합니다. `mainBrowserEvidence`가 `false`이면 메인 Whale에 붙은 것이 아니므로, 격리 하니스 결과로 실사용 QA를 대체하지 않습니다.

Whale에서 `dist/whale` 압축해제 확장이 `DISABLED`인데 manifest/runtime 오류가 비어 있으면, 코드 오류가 아니라 개발자 모드가 꺼진 상태일 수 있습니다. Whale 확장앱 관리 화면에서 개발자 모드를 켠 뒤 확장을 다시 갱신합니다. 이때 비활성 사유가 `unsupportedDeveloperExtension`이면 개발자 모드/압축해제 확장 정책 문제로 보고, 기능 버그로 분류하지 않습니다.

메인 Whale 재시작 계획 확인:

```powershell
npm run qa:main:whale:plan
```

이 명령은 메인 Whale을 닫거나 새로 띄우지 않고, 제어 포트와 `dist/whale` 확장을 붙여 재시작할 때 닫힐 Whale 프로세스와 실행 인자를 보여줍니다.

관리자가 열린 탭 손실 위험을 승인한 뒤에만 실행:

```powershell
npm run qa:main:whale:start
```

이 명령은 메인 Whale을 `--remote-debugging-port=9223` 및 `--load-extension=dist/whale`로 재시작합니다. 메인 프로필에서는 기존 확장을 끄는 `--disable-extensions-except`를 쓰지 않습니다.

격리 Chromium 회귀 하니스:

```powershell
npm run qa:chromium:isolated
```

이 명령은 `dist/chrome`을 별도 Chromium 프로필에 로드하고, 테스트용 치지직 사이드바 DOM에서 팝업 버튼, 티어 저장, 정렬 적용, 버튼 오버플로우를 검증합니다. 출력의 `mainBrowserEvidence`가 `false`이면 메인 Chrome 실사용 검증이 아니라 자동 회귀 검증입니다.

격리 Whale 회귀 하니스:

```powershell
npm run qa:whale:isolated
```

이 명령은 `dist/whale`을 별도 Whale 프로필에 로드하고, Whale 전용 `sidebar_action` 패널, 즐겨찾기 별 토글, 티어 저장, 정렬 적용, 버튼 오버플로우를 검증합니다. 출력의 `mainBrowserEvidence`가 `false`이면 메인 Whale 로그인 세션 검증이 아니라 자동 회귀 검증입니다.

`qa:chromium`, `qa:chrome`, `qa:whale`처럼 메인 브라우저 실사용 QA로 오해될 수 있는 명령명은 쓰지 않습니다. 메인 Chrome/Whale 실사용 QA는 사용자가 실제로 쓰는 브라우저에 플러그인으로 붙어야 하며, 제어 포트나 확장 관리 화면 접근이 막히면 `BLOCKED/UNVERIFIED`로 남깁니다.

## 스토어 배포 기준

Chrome Web Store와 Whale Store 업로드는 계정, 심사, 공개 범위 승인이 필요합니다. 이 저장소의 기본 자동화는 zip 생성까지입니다. 실제 업로드와 공개 배포는 관리자 승인 후 별도 workflow로 추가합니다.

## 완료 게이트

격리 브라우저 QA를 메인 브라우저 실사용 QA로 착각하지 않도록 완료 게이트를 둡니다.

```powershell
npm run guard:completion
```

이 명령은 `npm run validate`, 격리 Chromium QA, 격리 Whale QA, 메인 브라우저 실사용 증거가 모두 상태판에 `PASS`로 기록되어야 통과합니다.

메인 Chrome/Whale에 제어 포트나 플러그인으로 붙을 수 없어 실사용 증거를 얻지 못한 경우에는, 최종 보고서에서 `UNVERIFIED`를 명시한 뒤에만 다음 명령을 사용합니다.

```powershell
npm run guard:completion:allow-main-unverified
```

이 명령이 통과해도 공개 스토어 업로드나 root Done을 의미하지 않습니다. 메인 브라우저 실사용 검증이 남아 있으면 PR/후속 이슈에서 별도 완료 조건으로 유지합니다.

## 라이선스

MIT License

## 후원

[후원하기](https://aq.gy/f/Jf1nN)
