# 🎲 Chzzk Sidebar Shuffler

> 치지직 팔로잉 스트리머 사이드바를 무작위로 정렬하고 치지직에서 실시간 시청자 수를 가리는 Chrome 확장 프로그램

## ✨ 주요 기능

- **🎯 채널 셔플**: 팔로잉 채널을 무작위로 재정렬
- **👁️ 시청자 수 숨기기**: 실시간 시청자 수 표시/숨김 토글
- **🎬 와이드모드 지원**: 극장모드 전환 시 자동 상태 복원
- **⚡ 실시간 반응**: 페이지 변화 즉시 감지 및 처리

## 📦 설치 방법

1. Chrome 웹스토어에서 설치 (`https://chromewebstore.google.com/detail/chzzk-sidebar-shuffler/egahjcimnelicdkjgadobmednkpdnmpo`)
2. 또는 수동 설치:
   - 이 저장소를 다운로드
   - Chrome 확장 프로그램 페이지 (`chrome://extensions`)에서 개발자 모드 활성화
   - "압축해제된 확장 프로그램 로드"로 폴더 선택

## 🎮 사용법

1. 치지직 사이트 접속
2. 확장 프로그램 아이콘 클릭
3. 원하는 기능 활성화:
   - **시청자 수 숨기기**: 토글 ON/OFF
   - **자동 셔플**: 페이지 로드 시 자동 셔플
   - **수동 셔플**: 버튼으로 즉시 셔플 실행

## 🔧 기술 스택

- **Manifest V3** Chrome Extension
- **Vanilla JavaScript** (ES6+)
- **Chrome Storage API** (설정 동기화)
- **MutationObserver** (실시간 DOM 감지)

## 📱 지원 페이지

- ✅ 메인 페이지 (`/`)
- ✅ 팔로잉 페이지 (`/following`) 
- ✅ 라이브 페이지 (`/live/*`)
- ✅ 모든 치지직 페이지 (범용 지원)

## ⚖️ 라이선스

MIT License

## 💝 후원

개발자를 응원해주세요: [☕ 후원하기](https://aq.gy/f/Jf1nN)