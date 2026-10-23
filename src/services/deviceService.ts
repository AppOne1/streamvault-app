/**
 * Unique Device Identifier, Hardware Profiler & Slogan/Referral + Media Share Service
 * - Generates and stores persistent Hardware ID (شناسه اختصاصی دستگاه)
 * - Dynamically generates and shares ONLY the promotional slogan + personal referral code text in FA, AR, or EN
 * - Shares downloaded video & audio files directly to Telegram, WhatsApp, Eitaa, Rubika, etc.
 */

import { DownloadTask, Language } from '../types';
import { getOfflineMedia } from './storageService';

const DEVICE_ID_STORAGE_KEY = 'onedownload_unique_device_id_v1';

export interface DeviceProfile {
  deviceId: string;
  platformName: string;
  userAgentSummary: string;
  screenResolution: string;
  createdAt: string;
}

/**
 * Generates a deterministic-looking unique hardware/device identifier
 * Format: APPONE-DEV-XXXX-XXXX
 */
function generateUniqueId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (len: number) => {
    let out = '';
    const randomValues = new Uint32Array(len);
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(randomValues);
      for (let i = 0; i < len; i++) {
        out += chars[randomValues[i] % chars.length];
      }
    } else {
      for (let i = 0; i < len; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return out;
  };

  return `APPONE-DEV-${segment(4)}-${segment(4)}`;
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.startsWith('APPONE-DEV-')) {
      return existing;
    }
    const created = generateUniqueId();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
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
 * Shares ONLY the localized promotional slogan + personal referral code text in one unified message.
 * - Never sends or downloads any APK file.
 * - Never sends any web URL.
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

  // 1. Web Share API (Called synchronously on user gesture before any await)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        text: shareMessage
      });
      return {
        openedNativeSheet: true,
        copiedToClipboard: false,
        shareMessage
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          openedNativeSheet: true,
          copiedToClipboard: false,
          shareMessage
        };
      }
    }
  }

  // 2. Fallback: Copy unified slogan + referral code to clipboard
  let copiedToClipboard = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareMessage);
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
 * via Native Share Sheet (Bluetooth, Telegram, WhatsApp, Eitaa, Rubika, etc.).
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

  // 1. Share actual binary media File via Web Share API Level 2
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

  // 2. Fallback: Share media title via Web Share API without any web URL
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
