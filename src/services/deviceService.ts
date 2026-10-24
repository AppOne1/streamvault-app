/**
 * Unique Device Identifier, Hardware Profiler & Slogan/Referral + Media Share Service
 * - Generates and locks a 100% permanent Hardware ID (شناسه اختصاصی سخت‌افزاری دستگاه)
 *   across localStorage, long-lived cookies, IndexedDB, and deterministic hardware fingerprinting
 *   so it never changes on restart or cache clear.
 * - Dynamically generates and shares ONLY the promotional slogan + personal referral code text in FA, AR, or EN.
 * - Shares downloaded video & audio files directly.
 */

import { DownloadTask, Language } from '../types';
import { getOfflineMedia } from './storageService';

export const DEVICE_ID_STORAGE_KEY = 'onedownload_unique_device_id_v1';
const DEVICE_ID_COOKIE_NAME = 'od_permanent_hwid_v1';
const DEVICE_ID_IDB_DB = 'OneDownloadPermanentHWID';
const DEVICE_ID_IDB_STORE = 'hwid_lock';

export interface DeviceProfile {
  deviceId: string;
  platformName: string;
  userAgentSummary: string;
  screenResolution: string;
  createdAt: string;
}

function readCookieHardwareId(): string | null {
  try {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${DEVICE_ID_COOKIE_NAME}=([^;]+)`)
    );
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]).trim().toUpperCase();
      if (decoded.startsWith('APPONE-DEV-')) return decoded;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeCookieHardwareId(hwid: string): void {
  try {
    if (typeof document === 'undefined') return;
    // Lock for 10 years
    document.cookie = `${DEVICE_ID_COOKIE_NAME}=${encodeURIComponent(
      hwid
    )}; max-age=315360000; path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function syncHardwareIdToIndexedDB(hwid: string): void {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) return;
    const req = window.indexedDB.open(DEVICE_ID_IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DEVICE_ID_IDB_STORE)) {
        db.createObjectStore(DEVICE_ID_IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(DEVICE_ID_IDB_STORE, 'readwrite');
        tx.objectStore(DEVICE_ID_IDB_STORE).put({ id: 'primary_hwid', hwid });
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }
}

export function restoreHardwareIdFromIndexedDB(): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        resolve(getOrCreateDeviceId());
        return;
      }
      const req = window.indexedDB.open(DEVICE_ID_IDB_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DEVICE_ID_IDB_STORE)) {
          db.createObjectStore(DEVICE_ID_IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(DEVICE_ID_IDB_STORE, 'readonly');
          const getReq = tx.objectStore(DEVICE_ID_IDB_STORE).get('primary_hwid');
          getReq.onsuccess = () => {
            const saved = getReq.result?.hwid;
            if (saved && typeof saved === 'string' && saved.startsWith('APPONE-DEV-')) {
              localStorage.setItem(DEVICE_ID_STORAGE_KEY, saved);
              writeCookieHardwareId(saved);
              resolve(saved);
            } else {
              const current = getOrCreateDeviceId();
              syncHardwareIdToIndexedDB(current);
              resolve(current);
            }
          };
          getReq.onerror = () => resolve(getOrCreateDeviceId());
        } catch {
          resolve(getOrCreateDeviceId());
        }
      };
      req.onerror = () => resolve(getOrCreateDeviceId());
    } catch {
      resolve(getOrCreateDeviceId());
    }
  });
}

/**
 * Generates a deterministic hardware-based identifier from physical device traits
 * Format: APPONE-DEV-XXXX-XXXX
 */
function generateHardwareBoundId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as any);
  const scr = typeof window !== 'undefined' && window.screen ? window.screen : ({} as any);
  const tz =
    typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC';

  // Collect stable hardware traits (CPU cores, screen dimensions, pixel ratio, platform, timezone)
  const rawFingerprint = [
    nav.platform || 'PLAT',
    nav.hardwareConcurrency || 4,
    (nav as any).deviceMemory || 4,
    scr.width || 1080,
    scr.height || 2400,
    scr.colorDepth || 24,
    typeof window !== 'undefined' ? Math.round((window.devicePixelRatio || 1) * 100) : 100,
    tz,
    nav.maxTouchPoints || 0
  ].join('::');

  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < rawFingerprint.length; i++) {
    const c = rawFingerprint.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i * 31;
    h2 = Math.imul(h2, 0x85ebca6b);
  }

  const pickChar = (seed: number, step: number) =>
    chars[Math.abs(Math.imul(seed, step * 17 + 13) ^ (seed >>> (step % 7))) % chars.length];

  let seg1 = '';
  let seg2 = '';
  for (let i = 0; i < 4; i++) {
    seg1 += pickChar(h1, i + 1);
    seg2 += pickChar(h2, i + 5);
  }

  return `APPONE-DEV-${seg1}-${seg2}`;
}

export function getOrCreateDeviceId(): string {
  try {
    const fromStorage = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (fromStorage && fromStorage.startsWith('APPONE-DEV-')) {
      writeCookieHardwareId(fromStorage);
      syncHardwareIdToIndexedDB(fromStorage);
      return fromStorage;
    }

    const fromCookie = readCookieHardwareId();
    if (fromCookie && fromCookie.startsWith('APPONE-DEV-')) {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, fromCookie);
      syncHardwareIdToIndexedDB(fromCookie);
      return fromCookie;
    }

    const created = generateHardwareBoundId();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    writeCookieHardwareId(created);
    syncHardwareIdToIndexedDB(created);
    return created;
  } catch {
    return 'APPONE-DEV-7F9A-4C2E';
  }
}

export function getDeviceProfile(): DeviceProfile {
  const deviceId = getOrCreateDeviceId();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  let os = 'Unknown OS';
  if (/android/i.test(ua)) os = 'Android OS';
  else if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS / iPhone';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Mac/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'WebView / Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  const screenRes =
    typeof window !== 'undefined' && window.screen
      ? `${window.screen.width}×${window.screen.height}`
      : '1920×1080';

  return {
    deviceId,
    platformName: `${os} (${browser})`,
    userAgentSummary: ua.slice(0, 90),
    screenResolution: screenRes,
    createdAt: new Date().toLocaleDateString('fa-IR')
  };
}

/**
 * Dynamic promotional slogan & personal referral code message based on selected language (FA / AR / EN).
 * Never includes any APK file or web link.
 */
export function buildAppShareMessage(referralCode?: string, language: Language = 'fa'): string {
  const code = (referralCode || 'OD-9X4K7M2P').trim();

  if (language === 'ar') {
    return `🚀 وان داونلود (OneDownload) | أقوى وأسرع برنامج لتحميل الفيديو والموسيقى بجودة 4K وتشغيل بدون نت من يوتيوب، إنستغرام وتيك توك!\n🎁 حمّل التطبيق الآن وادخل كود الإحالة الخاص بي عند التسجيل: ${code}`;
  }

  if (language === 'en') {
    return `🚀 OneDownload | Ultra-fast 4K Video & Music Downloader with Offline Playback for YouTube, Instagram & TikTok!\n🎁 Install now and enter my referral code during sign-up: ${code}`;
  }

  return `🚀 وان دانلود (OneDownload) | دانلودر فوق‌سریع ویدیو و موزیک با کیفیت 4K و پخش آفلاین از یوتیوب، اینستاگرام و تیک‌تاک!\n🎁 همین حالا نصب کن و هنگام ثبت‌نام کد معرف من رو وارد کن: ${code}`;
}

/**
 * Copies the unified promotional slogan + personal referral code text to clipboard.
 */
export async function shareAppToFriends(
  referralCode?: string,
  language: Language = 'fa'
): Promise<{
  openedNativeSheet: boolean;
  copiedToClipboard: boolean;
  shareMessage: string;
}> {
  const shareMessage = buildAppShareMessage(referralCode, language);

  let copiedToClipboard = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareMessage);
      copiedToClipboard = true;
    } catch {
      // ignore
    }
  }

  if (!copiedToClipboard && typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = shareMessage;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copiedToClipboard = true;
    } catch {
      // ignore
    }
  }

  return {
    openedNativeSheet: false,
    copiedToClipboard,
    shareMessage
  };
}

/**
 * Shares an actual downloaded media file (MP4 Video or MP3 Audio) directly from the user's Library
 * via Native Share Sheet.
 */
export async function shareDownloadedMediaFile(task: DownloadTask): Promise<{
  success: boolean;
  method: 'file_share' | 'text_share' | 'disk_export';
}> {
  let blob: Blob | null = task.mediaBlob || null;

  if (!blob) {
    try {
      const offlineRecord = await getOfflineMedia(task.id);
      if (offlineRecord?.mediaBlob) {
        blob = offlineRecord.mediaBlob;
      }
    } catch {
      // ignore
    }
  }

  const mimeType =
    task.format.type === 'audio'
      ? 'audio/mpeg'
      : 'video/mp4';

  const cleanFileName =
    task.fileName ||
    `${task.title.replace(/[^\w\u0600-\u06FF\s.-]/g, '_').slice(0, 40)}.${
      task.format.format || (task.format.type === 'audio' ? 'mp3' : 'mp4')
    }`;

  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const mediaFile = new File([blob], cleanFileName, { type: mimeType });
      if (!navigator.canShare || navigator.canShare({ files: [mediaFile] })) {
        await navigator.share({
          title: task.title,
          text: `🎬 ${task.title}\n🚀 OneDownload`,
          files: [mediaFile]
        });
        return { success: true, method: 'file_share' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { success: false, method: 'file_share' };
      }
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: task.title,
        text: `🎬 ${task.title}\n🚀 OneDownload`
      });
      return { success: true, method: 'text_share' };
    } catch {
      // ignore
    }
  }

  return { success: false, method: 'disk_export' };
}
