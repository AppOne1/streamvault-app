/**
 * Unique Device Identifier and Hardware Profiler Service
 * Generates and stores persistent hardware fingerprint for AppOne Express
 */

export interface DeviceProfile {
  deviceId: string;
  os: string;
  browser: string;
  screenResolution: string;
  platform: string;
  cores: number;
  colorDepth: number;
  createdAt: number;
}

const STORAGE_KEY = 'appone_unique_device_id';
const PROFILE_KEY = 'appone_device_profile';

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    const randomHex = () => Math.random().toString(16).substring(2, 6).toUpperCase();
    id = `APPONE-DEV-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function getDeviceProfile(): DeviceProfile {
  const cached = localStorage.getItem(PROFILE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Re-generate
    }
  }

  const userAgent = navigator.userAgent || '';
  let os = 'Unknown OS';
  if (/android/i.test(userAgent)) os = 'Android OS';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'Apple iOS';
  else if (/windows/i.test(userAgent)) os = 'Windows PC';
  else if (/macintosh|mac os x/i.test(userAgent)) os = 'macOS';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  let browser = 'Unknown Browser';
  if (/chrome|crios/i.test(userAgent) && !/edg/i.test(userAgent)) browser = 'Chrome';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/samsungbrowser/i.test(userAgent)) browser = 'Samsung Internet';

  const profile: DeviceProfile = {
    deviceId: getOrCreateDeviceId(),
    os,
    browser,
    screenResolution: `${window.screen.width} × ${window.screen.height}`,
    platform: navigator.platform || 'Web/PWA',
    cores: navigator.hardwareConcurrency || 4,
    colorDepth: window.screen.colorDepth || 24,
    createdAt: Date.now()
  };

  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

import { DownloadTask } from '../types';
import { getOfflineMedia } from './storageService';

/**
 * Shares genuine downloaded video/audio file via Native Mobile Share Sheet
 * (Supports Bluetooth, Quick Share / Nearby Share, Telegram, WhatsApp, Zapya, etc.)
 */
export async function shareMediaFile(task: DownloadTask): Promise<boolean> {
  try {
    let blob = task.mediaBlob;
    if (!blob && task.id) {
      const rec = await getOfflineMedia(task.id);
      if (rec && rec.mediaBlob) {
        blob = rec.mediaBlob;
      }
    }

    const ext = task.format.format || 'mp4';
    const mime = task.format.type === 'audio' ? 'audio/mpeg' : 'video/mp4';
    const fileName = task.fileName || `media_${task.id}.${ext}`;

    // If browser supports native file sharing (Android Chrome, iOS Safari, PWA)
    if (blob && typeof navigator !== 'undefined' && navigator.canShare) {
      const file = new File([blob], fileName, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: task.title,
          text: `ویدیو ذخیره‌شده: ${task.title}`
        });
        return true;
      }
    }

    // Fallback: share title & playable link
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({
        title: task.title,
        text: `ویدیو دانلود شده: ${task.title}`,
        url: task.directUrl || window.location.href
      });
      return true;
    }

    return false;
  } catch (err) {
    if ((err as any)?.name !== 'AbortError') {
      console.warn('Share media file notice:', err);
    }
    return false;
  }
}

/**
 * Shares application download link / invitation with friends
 */
export async function shareAppToFriends(customUrl?: string): Promise<boolean> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
  const shareUrl = customUrl?.trim() && !customUrl.includes('localhost')
    ? customUrl.trim()
    : (!isLocal && origin ? origin : 'https://cafebazaar.ir/app/ir.appone.onedownload');

  const shareData = {
    title: 'وان دانلود (OneDownload) | دانلودر فوق‌سریع ویدیو و موزیک',
    text: 'اپلیکیشن وان دانلود (OneDownload) — دانلودر فوق‌سریع ویدیو و موزیک از یوتیوب، تیک‌تاک و اینستاگرام با کیفیت 4K و پخش آفلاین (گروه AppOne علوی):',
    url: shareUrl
  };

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(shareData);
      return true;
    } catch {
      // Fallback to clipboard if user cancels or share fails
    }
  }

  try {
    await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
    return true;
  } catch {
    return false;
  }
}
