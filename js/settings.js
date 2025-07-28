/**
 * 설정 관리 모듈
 * 치지직 사이드바 셔플러 설정 저장/로드/변경 감지
 */

// 기본 설정값
const DEFAULT_SETTINGS = {
  hideViewerCount: true,
  enableShuffle: true
};

// 현재 설정 상태
let currentSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

// 설정 변경 콜백들
const settingsChangeCallbacks = new Set();

/**
 * 설정 관리 클래스
 */
class SettingsManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.loaded = false;
    this.changeCallbacks = new Set();
    
    // Chrome storage 변경 감지
    this.setupStorageListener();
  }

  /**
   * 설정 로드
   * @returns {Promise<Object>} 설정 객체
   */
  async load() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
        
        // 기본값과 저장된 값 병합
        this.settings = {
          hideViewerCount: result.hideViewerCount !== undefined ? result.hideViewerCount : DEFAULT_SETTINGS.hideViewerCount,
          enableShuffle: result.enableShuffle !== undefined ? result.enableShuffle : DEFAULT_SETTINGS.enableShuffle
        };
      }
      
      this.loaded = true;
      window.ChzzkLogger?.info('⚙️ Settings loaded:', this.settings);
      
      return this.settings;
    } catch (error) {
      window.ChzzkLogger?.warn('⚠️ Failed to load settings, using defaults:', error);
      this.settings = { ...DEFAULT_SETTINGS };
      this.loaded = true;
      return this.settings;
    }
  }

  /**
   * 설정 저장
   * @param {Object} newSettings - 새로운 설정
   * @returns {Promise<boolean>} 저장 성공 여부
   */
  async save(newSettings) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.sync.set(newSettings);
      }
      
      // 로컬 설정 업데이트
      Object.assign(this.settings, newSettings);
      
      window.ChzzkLogger?.info('💾 Settings saved:', newSettings);
      
      // 변경 콜백 호출
      this.notifyChanges(newSettings);
      
      return true;
    } catch (error) {
      window.ChzzkLogger?.warn('⚠️ Failed to save settings:', error);
      return false;
    }
  }

  /**
   * 개별 설정 업데이트
   * @param {string} key - 설정 키
   * @param {*} value - 설정 값
   * @returns {Promise<boolean>} 저장 성공 여부
   */
  async set(key, value) {
    const newSettings = { [key]: value };
    return await this.save(newSettings);
  }

  /**
   * 설정 값 가져오기
   * @param {string} key - 설정 키
   * @returns {*} 설정 값
   */
  get(key) {
    return this.settings[key];
  }

  /**
   * 모든 설정 가져오기
   * @returns {Object} 전체 설정 객체
   */
  getAll() {
    return { ...this.settings };
  }

  /**
   * 설정이 로드되었는지 확인
   * @returns {boolean} 로드 여부
   */
  isLoaded() {
    return this.loaded;
  }

  /**
   * 설정 변경 콜백 등록
   * @param {Function} callback - 변경 시 호출될 함수
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this.changeCallbacks.add(callback);
      
      // 제거 함수 반환
      return () => {
        this.changeCallbacks.delete(callback);
      };
    }
  }

  /**
   * 설정 변경 알림
   * @private
   * @param {Object} changes - 변경된 설정들
   */
  notifyChanges(changes) {
    this.changeCallbacks.forEach(callback => {
      try {
        callback(changes, this.settings);
      } catch (error) {
        window.ChzzkLogger?.error('❌ Error in settings change callback:', error);
      }
    });
  }

  /**
   * Chrome storage 변경 감지 설정
   * @private
   */
  setupStorageListener() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
          const relevantChanges = {};
          let hasRelevantChanges = false;
          
          // 관련 설정 변경사항만 필터링
          Object.keys(DEFAULT_SETTINGS).forEach(key => {
            if (changes[key]) {
              relevantChanges[key] = changes[key].newValue;
              this.settings[key] = changes[key].newValue;
              hasRelevantChanges = true;
            }
          });
          
          if (hasRelevantChanges) {
            window.ChzzkLogger?.info('🔄 Settings changed externally:', relevantChanges);
            this.notifyChanges(relevantChanges);
          }
        }
      });
    }
  }

  /**
   * 설정 초기화
   * @returns {Promise<boolean>} 초기화 성공 여부
   */
  async reset() {
    return await this.save(DEFAULT_SETTINGS);
  }
}

// 싱글톤 인스턴스 생성
const settingsManager = new SettingsManager();

// 레거시 호환성을 위한 전역 변수 및 함수
let settings = settingsManager;

async function loadSettings() {
  return await settingsManager.load();
}

async function saveSettings(newSettings) {
  return await settingsManager.save(newSettings);
}

// 전역 접근을 위한 window 객체에 등록
if (typeof window !== 'undefined') {
  window.ChzzkSettings = settingsManager;
  window.settings = settingsManager.settings; // 레거시 호환성
}

// 모듈 export (Node.js 환경 대응)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SettingsManager,
    settingsManager,
    loadSettings,
    saveSettings,
    DEFAULT_SETTINGS
  };
}