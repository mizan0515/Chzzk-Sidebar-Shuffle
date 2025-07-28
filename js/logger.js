/**
 * 로깅 및 디버깅 시스템
 * 치지직 사이드바 셔플러용 로깅 유틸리티
 */

// 디버깅 및 로깅 설정
const DEBUG_MODE = false;
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

let currentLogLevel = DEBUG_MODE ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

/**
 * 통합 로깅 함수
 * @param {string} level - 로그 레벨
 * @param {string} message - 로그 메시지
 * @param {*} data - 추가 데이터 (선택사항)
 * @param {boolean} forceShow - 강제 표시 여부
 */
function log(level, message, data = null, forceShow = false) {
  const logLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  
  if (!DEBUG_MODE && !forceShow && logLevel > LOG_LEVELS.ERROR) {
    return;
  }
  
  if (logLevel <= currentLogLevel) {
    const prefix = `[CHZZK SHUFFLE ${level.toUpperCase()}]`;
    
    if (data !== null) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

/**
 * 로깅 편의 함수들
 */
const logger = {
  error: (message, data = null) => log('ERROR', message, data, true),
  warn: (message, data = null) => log('WARN', message, data),
  info: (message, data = null) => log('INFO', message, data),
  debug: (message, data = null) => log('DEBUG', message, data),
  trace: (message, data = null) => log('TRACE', message, data),
  
  // 특별한 카테고리별 로깅
  shuffle: (message, data = null) => log('INFO', `🎲 ${message}`, data),
  viewer: (message, data = null) => log('DEBUG', `👁️ ${message}`, data),
  button: (message, data = null) => log('DEBUG', `🔘 ${message}`, data),
  dom: (message, data = null) => log('DEBUG', `🏗️ ${message}`, data),
  
  // 성능 측정용
  time: (label) => {
    if (DEBUG_MODE) {
      console.time(`[CHZZK SHUFFLE] ${label}`);
    }
  },
  
  timeEnd: (label) => {
    if (DEBUG_MODE) {
      console.timeEnd(`[CHZZK SHUFFLE] ${label}`);
    }
  },
  
  // 그룹 로깅
  group: (title) => {
    if (DEBUG_MODE) {
      console.group(`[CHZZK SHUFFLE] ${title}`);
    }
  },
  
  groupEnd: () => {
    if (DEBUG_MODE) {
      console.groupEnd();
    }
  }
};

// 전역 접근을 위한 window 객체에 등록
if (typeof window !== 'undefined') {
  window.ChzzkLogger = logger;
}

// 모듈 export (Node.js 환경 대응)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = logger;
}