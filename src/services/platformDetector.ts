import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { FormatOption, ParsedMediaInfo, PlatformId } from '../types';
import {
  extractAparatHash,
  isAparatUrl,
  probeAparatIsolated
} from './aparatExtractor';

export { extractAparatHash, isAparatUrl };

export const SAMPLE_URLS: { label: string; platform: PlatformId; url: string }[] = [
  {
    label: 'YouTube 4K Demo',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
  },
  {
    label: 'Aparat HD Video',
    platform: 'aparat',
    url: 'https://www.aparat.com/v/visdtjz'
  },
  {
    label: 'TikTok Viral Clip',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@tiktok/video/7106594312292453675'
  },
  {
    label: 'Instagram Reel',
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/DWwz7U6DcVx/'
  }
];

/**
 * Detects whether the app is running inside a native Android APK (Capacitor) or file:// origin
 * where relative `/api/...` server routes do not exist on localhost.
 */
export function isCapacitorOrNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // ignore
  }
  if ((window as any).Capacitor?.isNativePlatform?.()) return true;
  const proto = window.location.protocol;
  const host = window.location.hostname;
  if (proto === 'capacitor:' || proto === 'file:') return true;
  if (host === 'localhost' && !window.location.port) return true;
  return false;
}

export const CLOUD_BACKEND_URLS = [
  'https://ais-pre-bp7ohi7vpvm6mgmp5wbo3w-79764360167.asia-east1.run.app',
  'https://ais-dev-bp7ohi7vpvm6mgmp5wbo3w-79764360167.asia-east1.run.app'
];

/**
 * Returns the local native stream proxy base URL (`http://127.0.0.1:<port>`) running inside MainActivity.java
 * on Android APK, or empty string on Web.
 */
export function getNativeLocalProxyUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const base = (window as any).OneDownloadNative?.getLocalProxyUrl?.();
    if (base && typeof base === 'string' && base.startsWith('http://127.0.0.1:')) {
      return base.replace(/\/+$/, '');
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Wraps an upstream media URL with the Android APK's local 127.0.0.1 stream proxy if available.
 */
export function wrapWithNativeLocalProxy(rawUrl: string): string {
  if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
    return rawUrl;
  }
  if (rawUrl.startsWith('http://127.0.0.1:')) {
    return rawUrl;
  }
  const localBase = getNativeLocalProxyUrl();
  if (localBase) {
    return `${localBase}/stream?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

/**
 * Resolves a `/api/...` path for both Web and Native Android APK.
 * On Native Android APK, prefixes relative `/api/...` paths with the live Cloud Run backend origin.
 */
export function getApiUrl(apiPath: string): string {
  if (!apiPath) return '';
  if (apiPath.startsWith('http://') || apiPath.startsWith('https://')) {
    return apiPath;
  }
  const normalized = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  if (!isCapacitorOrNative()) {
    return normalized;
  }
  return `${CLOUD_BACKEND_URLS[0]}${normalized}`;
}

/**
 * Performs a fetch to our backend `/api/...` endpoint on both Web/PWA and Native Android APK.
 */
export async function fetchBackendApi(
  apiPath: string,
  init?: RequestInit
): Promise<Response> {
  const normalized = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  if (!isCapacitorOrNative()) {
    let lastWebErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1400 * attempt));
        }
        const res = await fetch(normalized, {
          ...init,
          credentials: 'include'
        });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html') && normalized.startsWith('/api/')) {
          throw new Error(`Invalid HTML response from ${normalized}`);
        }
        return res;
      } catch (e) {
        lastWebErr = e;
      }
    }
    throw lastWebErr || new Error(`Failed to fetch ${normalized}`);
  }

  let lastErr: unknown;
  for (const base of CLOUD_BACKEND_URLS) {
    try {
      const res = await fetch(`${base}${normalized}`, init);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') && normalized.startsWith('/api/')) {
        continue;
      }
      if (res.ok) {
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Backend API unreachable');
}

const tikWmClientCache = new Map<string, { data: any; ts: number }>();

/**
 * Cached TikWM API resolver to prevent TikWM's 1-request-per-second rate limit
 * when parseMediaUrl (link analysis) is immediately followed by download start.
 */
export async function fetchTikWmCached(url: string): Promise<any | null> {
  const key = url.trim();
  const cached = tikWmClientCache.get(key);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
    return cached.data;
  }
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(key)}&hd=1`;
  let json = await smartFetchJson(apiUrl, { method: 'GET', timeoutMs: 9000 });
  if (!json || json.code !== 0 || !json.data) {
    await new Promise((r) => setTimeout(r, 1150));
    json = await smartFetchJson(apiUrl, { method: 'GET', timeoutMs: 9000 });
  }
  if (json && json.code === 0 && json.data) {
    tikWmClientCache.set(key, { data: json.data, ts: Date.now() });
    return json.data;
  }
  return null;
}

/**
 * Cross-platform JSON requester that uses native Java HttpURLConnection (`CapacitorHttp`) on Android APK
 * (completely bypassing CORS restrictions on savevideo.uz, instagram.com, tikwm.com, etc.)
 * and standard `fetch` on Web.
 */
export async function smartFetchJson(
  url: string,
  options?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: any;
    timeoutMs?: number;
  }
): Promise<any | null> {
  const method = options?.method || 'GET';
  const timeoutMs = options?.timeoutMs || 11000;

  if (isCapacitorOrNative()) {
    try {
      const response = await CapacitorHttp.request({
        url,
        method,
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...(options?.headers || {})
        },
        data: options?.body,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs
      });
      if (response.status >= 200 && response.status < 300 && response.data) {
        return typeof response.data === 'string'
          ? JSON.parse(response.data)
          : response.data;
      }
    } catch {
      // Fall through to standard fetch below
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const SafeHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
    };
    const res = await fetch(url, {
      method,
      headers: SafeHeaders,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Extracts the first HTTP/HTTPS URL found inside arbitrary shared text
 */
export function extractUrlFromText(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].trim() : trimmed;
}

/**
 * Strict HTTP/HTTPS URL validator
 */
export function isValidHttpUrl(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) return false;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}

export function detectPlatform(url: string): PlatformId {
  const lower = url.toLowerCase().trim();
  if (!lower) return 'generic';

  if (lower.includes('aparat.com')) return 'aparat';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com') || lower.includes('t.co')) return 'twitter';
  if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('vimeo.com')) return 'vimeo';
  if (lower.includes('soundcloud.com')) return 'soundcloud';
  if (lower.includes('pinterest.com') || lower.includes('pin.it')) return 'pinterest';

  return 'generic';
}

/**
 * Checks whether a URL belongs to a supported video/music platform or is a direct media file link.
 * Used to block unsupported general websites with the «این پلتفرم پشتیبانی نمی‌شود» warning.
 */
export function isSupportedMediaUrl(url: string): boolean {
  if (!isValidHttpUrl(url)) return false;
  const lower = url.toLowerCase().trim();

  if (detectPlatform(lower) !== 'generic') return true;

  if (
    /\.(mp4|mp3|m4a|webm|mkv|mov|wav|ogg|aac|flac|m3u8)(\?.*|#.*)?$/i.test(lower)
  ) {
    return true;
  }

  const extraSupportedHosts = [
    'reddit.com',
    'redd.it',
    'dailymotion.com',
    'dai.ly',
    'twitch.tv',
    'bilibili.com',
    'rumble.com',
    'threads.net',
    'snapchat.com',
    't.me',
    'telegram.me',
    'linkedin.com',
    'namasha.com',
    'tamasha.com',
    'telewebion.com',
    'cdninstagram.com',
    'fbcdn.net',
    'tiktokcdn.com',
    'googlevideo.com',
    'aparat.com'
  ];

  return extraSupportedHosts.some((host) => lower.includes(host));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const regExp =
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/i;
    const match = url.match(regExp);
    if (match && match[1]) {
      return match[1];
    }
    const parsed = new URL(url);
    const vParam = parsed.searchParams.get('v');
    if (vParam && vParam.length === 11) {
      return vParam;
    }
  } catch {
    // Ignore invalid URL parse
  }
  return null;
}

export function extractInstagramShortcode(url: string): string | null {
  const match =
    url.match(
      /(?:instagram\.com|instagr\.am)\/(?:share\/)?(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i
    ) ||
    url.match(/(?:instagram\.com|instagr\.am)\/stories\/[^/?#]+\/(\d+)/i);
  return match ? match[1] : null;
}

export function extractTwitterStatusId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:[^/]+\/)?(?:status|statuses|videos)\/(\d+)/i);
  return match ? match[1] : null;
}

function deriveTitleFromUrl(url: string, platform: PlatformId): string {
  try {
    const parsed = new URL(url);
    if (platform === 'aparat') {
      const hash = extractAparatHash(url);
      if (hash) return `ویدیو آپارات (${hash})`;
    }
    if (platform === 'instagram') {
      const code = extractInstagramShortcode(url);
      if (code) return `ویدیو اینستاگرام (${code})`;
    }
    if (platform === 'twitter') {
      const id = extractTwitterStatusId(url);
      if (id) return `ویدیو ایکس / توییتر (${id})`;
    }
    if (platform === 'youtube') {
      const ytId = extractYouTubeVideoId(url);
      if (ytId) {
        return url.includes('/shorts/') ? `YouTube Shorts (${ytId})` : `YouTube Video (${ytId})`;
      }
    }
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      const last = pathSegments[pathSegments.length - 1];
      const cleaned = decodeURIComponent(last).replace(/[-_]/g, ' ');
      if (cleaned.length > 3) {
        return `${platform.toUpperCase()} - ${cleaned.slice(0, 60)}`;
      }
    }
  } catch {
    // ignore
  }
  const hostLabel = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return platform.toUpperCase();
    }
  })();
  return `ویدیو از ${hostLabel}`;
}

function generateFormatOptions(
  durationSeconds: number,
  _probedHeights?: number[],
  probedEst?: Record<string, number>,
  audioEst?: number,
  formatsMap?: Record<string, string>,
  directVideoUrl?: string,
  directAudioUrl?: string
): FormatOption[] {
  const safeDuration = Math.max(durationSeconds || 120, 20);
  const calcBytes = (kbps: number) => Math.round(((kbps * 1000) / 8) * safeDuration);

  // TubeMate Standard Progressive Video Resolutions: 1080p Full HD, 720p HD, 480p, 360p
  const tubeMateVideoDefinitions: {
    height: number;
    id: string;
    format: 'mp4';
    qualityLabel: string;
    resolution: string;
    fps: number;
    vCodec: string;
    aCodec: string;
    bitrate: string;
    isHdr: boolean;
    defaultKbps: number;
  }[] = [
    {
      height: 1080,
      id: 'v-1080p',
      format: 'mp4',
      qualityLabel: '1080p Full HD',
      resolution: '1920x1080',
      fps: 60,
      vCodec: 'AVC1 (H.264 High)',
      aCodec: 'AAC-LC 256k',
      bitrate: '4.5 Mbps',
      isHdr: false,
      defaultKbps: 4200
    },
    {
      height: 720,
      id: 'v-720p',
      format: 'mp4',
      qualityLabel: '720p HD',
      resolution: '1280x720',
      fps: 30,
      vCodec: 'AVC1 (H.264 Main)',
      aCodec: 'AAC-LC 192k',
      bitrate: '2.4 Mbps',
      isHdr: false,
      defaultKbps: 2200
    },
    {
      height: 480,
      id: 'v-480p',
      format: 'mp4',
      qualityLabel: '480p',
      resolution: '854x480',
      fps: 30,
      vCodec: 'AVC1 (H.264)',
      aCodec: 'AAC-LC 128k',
      bitrate: '1.1 Mbps',
      isHdr: false,
      defaultKbps: 1100
    },
    {
      height: 360,
      id: 'v-360p',
      format: 'mp4',
      qualityLabel: '360p',
      resolution: '640x360',
      fps: 30,
      vCodec: 'AVC1 (H.264)',
      aCodec: 'AAC-LC 96k',
      bitrate: '650 kbps',
      isHdr: false,
      defaultKbps: 650
    }
  ];

  const availableMapHeights = formatsMap
    ? Object.keys(formatsMap)
        .map((k) => Number(k))
        .filter((n) => !isNaN(n) && n > 0)
        .sort((a, b) => a - b)
    : [];

  const ref720Bytes =
    (probedEst?.['720'] && probedEst['720'] > 30000 ? probedEst['720'] : 0) ||
    (probedEst?.['1080'] && probedEst['1080'] > 30000 ? Math.round(probedEst['1080'] * 0.62) : 0);

  const videoFormats: FormatOption[] = tubeMateVideoDefinitions.map((def) => {
    const rawEst = probedEst?.[String(def.height)];
    let estSize = rawEst && rawEst > 30000 ? rawEst : 0;
    if (!estSize && ref720Bytes > 0) {
      const ratio =
        def.height >= 1080
          ? 1.55
          : def.height >= 720
          ? 1.0
          : def.height >= 480
          ? 0.62
          : 0.42;
      estSize = Math.round(ref720Bytes * ratio);
    }
    if (!estSize) {
      estSize = calcBytes(def.defaultKbps);
    }

    let matchedDirectUrl = formatsMap?.[String(def.height)];
    if (!matchedDirectUrl && formatsMap && availableMapHeights.length > 0) {
      const lowerOrEqual = availableMapHeights.filter((h) => h <= def.height);
      const pickedH =
        lowerOrEqual.length > 0
          ? lowerOrEqual[lowerOrEqual.length - 1]
          : availableMapHeights[0];
      // Only reuse a fallback map URL if all map entries point to the same single-stream CDN (e.g. Instagram/TikTok)
      const uniqueUrls = new Set(Object.values(formatsMap).filter(Boolean));
      if (uniqueUrls.size === 1 || pickedH <= def.height) {
        matchedDirectUrl = formatsMap[String(pickedH)];
      }
    }

    return {
      id: def.id,
      type: 'video',
      format: def.format,
      qualityLabel: def.qualityLabel,
      resolution: def.resolution,
      fps: def.fps,
      vCodec: def.vCodec,
      aCodec: def.aCodec,
      bitrate: def.bitrate,
      isHdr: def.isHdr,
      estimatedSizeBytes: estSize,
      estimatedSizeFormatted: formatBytes(estSize),
      directUrl: matchedDirectUrl
    };
  });

  // TubeMate Dedicated Audio Extraction Options: MP3 (256k), MP3 (128k), and M4A/AAC
  const mp3Size256 = audioEst && audioEst > 15000 ? audioEst : calcBytes(256);
  const mp3Size128 = calcBytes(128);
  const m4aSize192 = calcBytes(192);
  const resolvedAudioDirect = directAudioUrl || directVideoUrl;

  const audioFormats: FormatOption[] = [
    {
      id: 'a-mp3-256',
      type: 'audio',
      format: 'mp3',
      qualityLabel: 'MP3 (256k HQ)',
      aCodec: 'LAME MP3 256k',
      bitrate: '256 kbps',
      channels: 'Stereo 2.0 (48kHz)',
      estimatedSizeBytes: mp3Size256,
      estimatedSizeFormatted: formatBytes(mp3Size256),
      directUrl: resolvedAudioDirect
    },
    {
      id: 'a-mp3-128',
      type: 'audio',
      format: 'mp3',
      qualityLabel: 'MP3 (128k)',
      aCodec: 'MP3 Joint Stereo 128k',
      bitrate: '128 kbps',
      channels: 'Stereo 2.0 (44.1kHz)',
      estimatedSizeBytes: mp3Size128,
      estimatedSizeFormatted: formatBytes(mp3Size128),
      directUrl: resolvedAudioDirect
    },
    {
      id: 'a-m4a-192',
      type: 'audio',
      format: 'm4a',
      qualityLabel: 'M4A / AAC (192k)',
      aCodec: 'AAC-LC Audio',
      bitrate: '192 kbps',
      channels: 'Stereo 2.0 (44.1kHz)',
      estimatedSizeBytes: m4aSize192,
      estimatedSizeFormatted: formatBytes(m4aSize192),
      directUrl: resolvedAudioDirect
    }
  ];

  return [...videoFormats, ...audioFormats];
}

/**
 * Generates an inline SVG Data URI cover so thumbnails never fail offline
 */
export function createSvgCoverDataUri(platform: PlatformId, label: string): string {
  const safeText = label.replace(/[<>&"']/g, '').slice(0, 28);
  const colors: Record<PlatformId, [string, string]> = {
    youtube: ['#ef4444', '#991b1b'],
    aparat: ['#e11d48', '#881337'],
    tiktok: ['#ec4899', '#06b6d4'],
    instagram: ['#d946ef', '#f97316'],
    twitter: ['#0ea5e9', '#1e3a8a'],
    facebook: ['#2563eb', '#1e40af'],
    vimeo: ['#06b6d4', '#0e7490'],
    soundcloud: ['#f97316', '#c2410c'],
    pinterest: ['#e11d48', '#9f1239'],
    generic: ['#6366f1', '#4338ca']
  };
  const [c1, c2] = colors[platform] || colors.generic;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#g)"/>
    <circle cx="400" cy="200" r="54" fill="rgba(255,255,255,0.18)"/>
    <polygon points="385,175 385,225 428,200" fill="#ffffff"/>
    <text x="400" y="310" font-family="sans-serif" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="middle">${platform.toUpperCase()}</text>
    <text x="400" y="350" font-family="sans-serif" font-size="20" fill="rgba(255,255,255,0.85)" text-anchor="middle">${safeText}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Helper: Client-side Twitter/X API resolver (Selects highest bitrate direct .mp4 variant)
 */
async function probeTwitterClientSide(url: string): Promise<{
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  directVideoUrl: string;
  formatsMap?: Record<string, string>;
} | null> {
  const tweetId = extractTwitterStatusId(url);
  if (!tweetId) return null;

  for (const apiUrl of [
    `https://api.fxtwitter.com/status/${tweetId}`,
    `https://api.vxtwitter.com/Twitter/status/${tweetId}`
  ]) {
    try {
      const data = await smartFetchJson(apiUrl, { method: 'GET', timeoutMs: 7000 });
      if (!data) continue;
      const tweet = data?.tweet || data;
      const mediaList = tweet?.media?.videos || tweet?.media_extended || tweet?.media?.all || [];
      const videoItem = Array.isArray(mediaList)
        ? mediaList.find(
            (m: any) =>
              m &&
              (m.type === 'video' ||
                m.type === 'gif' ||
                (typeof m.url === 'string' && m.url.includes('.mp4')))
          )
        : null;
      if (videoItem) {
        const variants: Array<{ url: string; bitrate: number }> = [];
        if (Array.isArray(videoItem.variants)) {
          for (const v of videoItem.variants) {
            if (v && typeof v.url === 'string' && v.url.includes('.mp4') && !v.url.includes('.m3u8')) {
              variants.push({ url: v.url, bitrate: Number(v.bitrate) || 1500000 });
            }
          }
        }
        if (typeof videoItem.url === 'string' && videoItem.url.includes('.mp4')) {
          variants.push({ url: videoItem.url, bitrate: Number(videoItem.bitrate) || 9999999 });
        }
        variants.sort((a, b) => b.bitrate - a.bitrate);
        const bestMp4 = variants[0]?.url || videoItem.url;
        if (bestMp4) {
          const midMp4 = variants[Math.min(1, variants.length - 1)]?.url || bestMp4;
          const lowMp4 = variants[variants.length - 1]?.url || midMp4;
          const durSec = videoItem.duration_millis ? Math.max(5, Math.round(videoItem.duration_millis / 1000)) : 35;
          return {
            title: (tweet.text || `X Video (${tweetId})`).replace(/\s+/g, ' ').trim().slice(0, 95),
            author: tweet.user_name ? `${tweet.user_name} (@${tweet.user_screen_name || 'x'})` : 'X / Twitter',
            duration: durSec,
            thumbnail: videoItem.thumbnail_url ? getSafeThumbnail(videoItem.thumbnail_url) : '',
            directVideoUrl: bestMp4,
            formatsMap: {
              '1080': bestMp4,
              '720': bestMp4,
              '480': midMp4,
              '360': lowMp4
            }
          };
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Helper: Client-side Instagram & Facebook & YouTube resolver via SaveVideo API
 */
async function probeViaSaveVideoClientSide(
  url: string,
  platform: PlatformId
): Promise<{
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  directVideoUrl: string;
  fileSize?: number;
  heights?: number[];
  est?: Record<string, number>;
  audioEst?: number;
} | null> {
  const isNative = isCapacitorOrNative();
  const shortcode = platform === 'instagram' ? extractInstagramShortcode(url) : null;
  const ytId = platform === 'youtube' ? extractYouTubeVideoId(url) : null;

  const realThumb = ytId
    ? getSafeThumbnail('', ytId)
    : shortcode
    ? getSafeThumbnail(`/api/media/thumbnail?ig=${shortcode}`)
    : '';

  // For YouTube (both standard watch?v= and Shorts /shorts/), use canonical watch URL with /api/yt/probe
  if (platform === 'youtube') {
    const canonicalYtUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : url;
    const ytProbe = await smartFetchJson('https://savevideo.uz/api/yt/probe', {
      method: 'POST',
      headers: { Referer: 'https://savevideo.uz/' },
      body: { url: canonicalYtUrl },
      timeoutMs: 9000
    });
    if (ytProbe && (ytProbe.title || ytProbe.heights)) {
      const cleanedEst: Record<string, number> = {};
      if (ytProbe.est && typeof ytProbe.est === 'object') {
        for (const [k, v] of Object.entries(ytProbe.est)) {
          if (typeof v === 'number' && v > 30000) {
            cleanedEst[k] = v;
          }
        }
      }
      return {
        title: ytProbe.title || (ytId ? `YouTube Video (${ytId})` : 'YouTube Video'),
        author: 'YouTube Creator',
        duration: Number(ytProbe.duration) || (url.includes('/shorts/') ? 45 : 120),
        thumbnail: realThumb,
        directVideoUrl: '',
        heights: Array.isArray(ytProbe.heights) ? ytProbe.heights : [360, 480, 720, 1080],
        est: cleanedEst,
        audioEst: typeof ytProbe.audio_est === 'number' && ytProbe.audio_est > 15000 ? ytProbe.audio_est : undefined
      };
    }
    return {
      title: url.includes('/shorts/') ? `YouTube Shorts (${ytId || 'HD'})` : `YouTube Video (${ytId || 'HD'})`,
      author: 'YouTube Creator',
      duration: url.includes('/shorts/') ? 45 : 120,
      thumbnail: realThumb,
      directVideoUrl: '',
      heights: [360, 480, 720, 1080]
    };
  }

  // Fast Native Instagram Embed Extractor via CapacitorHttp (< 1.5s response on Android APK)
  if (platform === 'instagram' && shortcode && isNative) {
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      const embedResp = await CapacitorHttp.get({
        url: embedUrl,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml'
        },
        connectTimeout: 8000,
        readTimeout: 8000
      });
      if (embedResp.status >= 200 && embedResp.status < 300 && typeof embedResp.data === 'string') {
        const html = embedResp.data;
        const videoMatch =
          html.match(/"video_url"\s*:\s*"([^"]+)"/i) ||
          html.match(/\\"video_url\\"\s*:\s*\\"([^\\"]+)\\"/i) ||
          html.match(/class="EmbeddedMediaVideo"[^>]*src="([^"]+)"/i);
        if (videoMatch && videoMatch[1]) {
          const decodedUrl = videoMatch[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\\//g, '/')
            .replace(/&amp;/g, '&');
          const usernameMatch =
            html.match(/"username"\s*:\s*"([^"]+)"/i) ||
            html.match(/\\"username\\"\s*:\s*\\"([^\\"]+)\\"/i);
          const author = usernameMatch ? `@${usernameMatch[1]}` : 'Instagram Creator';
          return {
            title: `Instagram Reel (${author})`,
            author,
            duration: 35,
            thumbnail: realThumb,
            directVideoUrl: wrapWithNativeLocalProxy(decodedUrl)
          };
        }
      }
    } catch {
      // Fall through to SaveVideo below
    }
  }

  const cleanTargetUrl =
    platform === 'instagram' && shortcode && !/\/stories\//i.test(url)
      ? `https://www.instagram.com/reel/${shortcode}/`
      : url.split('?')[0] || url;

  const startData = await smartFetchJson('https://savevideo.uz/api/download', {
    method: 'POST',
    headers: { Referer: 'https://savevideo.uz/' },
    body: { url: cleanTargetUrl },
    timeoutMs: 10000
  });

  if (startData && startData.task_id) {
    for (let attempt = 0; attempt < 18; attempt++) {
      await new Promise((r) => setTimeout(r, 950));
      const stData = await smartFetchJson(`https://savevideo.uz/api/status/${startData.task_id}`, {
        method: 'GET',
        headers: { Referer: 'https://savevideo.uz/' },
        timeoutMs: 7000
      });
      if (!stData) continue;
      if (stData.status === 'done') {
        const token = stData.file_token || '';
        const ext = stData.ext || 'mp4';
        const rawSvFileUrl = `https://savevideo.uz/api/file/${startData.task_id}?t=${encodeURIComponent(token)}`;
        const fileUrl = isNative
          ? wrapWithNativeLocalProxy(rawSvFileUrl)
          : `/api/media/file/${startData.task_id}?t=${encodeURIComponent(token)}&ext=${ext}&title=${encodeURIComponent(
              stData.title || 'video'
            )}`;
        return {
          title:
            stData.title ||
            (shortcode ? `Instagram Reel (${shortcode})` : 'Social Media Video (HD)'),
          author:
            platform === 'instagram'
              ? 'Instagram Creator'
              : platform === 'facebook'
              ? 'Facebook Creator'
              : 'Creator',
          duration: 45,
          thumbnail: realThumb,
          directVideoUrl: fileUrl,
          fileSize: typeof stData.file_size === 'number' ? stData.file_size : undefined
        };
      }
      if (stData.status === 'error') break;
    }
  }

  // Fallback for Instagram: Embed via allorigins CORS proxy
  if (shortcode) {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    try {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(embedUrl)}`);
      if (res.ok) {
        const html = await res.text();
        const videoMatch =
          html.match(/"video_url"\s*:\s*"([^"]+)"/i) ||
          html.match(/\\"video_url\\"\s*:\s*\\"([^\\"]+)\\"/i) ||
          html.match(/class="EmbeddedMediaVideo"[^>]*src="([^"]+)"/i);
        if (videoMatch && videoMatch[1]) {
          const decodedUrl = videoMatch[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\\//g, '/')
            .replace(/&amp;/g, '&');
          return {
            title: `Instagram Reel (${shortcode})`,
            author: 'Instagram Creator',
            duration: 45,
            thumbnail: realThumb,
            directVideoUrl: isNative ? wrapWithNativeLocalProxy(decodedUrl) : decodedUrl
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Fetches real video metadata & stream formats via backend `/api/media/probe` (on Web)
 * and native CapacitorHttp / multi-platform resolvers (on Android APK & Web fallback).
 */
export async function parseMediaUrl(url: string): Promise<ParsedMediaInfo> {
  const cleanUrl = url.trim();
  const platform = detectPlatform(cleanUrl);
  const ytVideoId = platform === 'youtube' ? extractYouTubeVideoId(cleanUrl) : null;
  const igShortcode = platform === 'instagram' ? extractInstagramShortcode(cleanUrl) : null;

  let resolvedTitle = deriveTitleFromUrl(cleanUrl, platform);
  let resolvedAuthor = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Creator`;
  let resolvedThumbnail = ytVideoId
    ? getSafeThumbnail('', ytVideoId)
    : igShortcode
    ? getSafeThumbnail(`/api/media/thumbnail?ig=${igShortcode}`)
    : createSvgCoverDataUri(platform, resolvedTitle);
  let durationSeconds = cleanUrl.includes('/shorts/') || cleanUrl.includes('/reel') ? 45 : 120;
  let viewsCount: string | undefined = undefined;
  let probedHeights: number[] | undefined;
  let probedEst: Record<string, number> | undefined;
  let audioEst: number | undefined;
  let formatsMap: Record<string, string> | undefined;
  let directVideoUrl: string | undefined;
  let directAudioUrl: string | undefined;

  // 0. Isolated Aparat Module: If URL is Aparat, run inside isolated aparatExtractor
  if (platform === 'aparat' || isAparatUrl(cleanUrl)) {
    const aparatInfo = await probeAparatIsolated(cleanUrl);
    if (aparatInfo) {
      resolvedTitle = aparatInfo.title;
      resolvedAuthor = aparatInfo.author;
      durationSeconds = aparatInfo.duration;
      if (aparatInfo.thumbnail) {
        resolvedThumbnail = aparatInfo.thumbnail;
      }
      viewsCount = aparatInfo.viewsCount;
      probedHeights = aparatInfo.heights;
      probedEst = aparatInfo.est;
      formatsMap = aparatInfo.formatsMap;
      directVideoUrl = aparatInfo.directVideoUrl;
      directAudioUrl = aparatInfo.directVideoUrl;
    }
  }

  // 1. Primary Probe on Web/Preview: Full-Stack Express Backend `/api/media/probe`
  // (On standalone Android APK, skip dead Cloud Run probe and use direct native CapacitorHttp resolvers immediately)
  if (!isCapacitorOrNative() && (!directVideoUrl || platform !== 'aparat')) {
    try {
      const probeRes = await fetchBackendApi('/api/media/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl })
      });

      if (probeRes.ok) {
        const data = await probeRes.json();
        if (data && data.success) {
          if (data.title && data.title !== 'Media Stream' && data.title !== 'YouTube Media') {
            resolvedTitle = data.title;
          }
          if (data.author) {
            resolvedAuthor = data.author;
          }
          if (typeof data.duration === 'number' && data.duration > 0) {
            durationSeconds = data.duration;
          }
          if (data.viewsCount) {
            viewsCount = String(data.viewsCount);
          }
          if (Array.isArray(data.heights) && data.heights.length > 0) {
            probedHeights = data.heights;
          }
          if (data.est && typeof data.est === 'object') {
            probedEst = data.est;
          }
          if (typeof data.audio_est === 'number' && data.audio_est > 15000) {
            audioEst = data.audio_est;
          }
          if (data.thumbnail && !String(data.thumbnail).startsWith('data:image/svg')) {
            resolvedThumbnail = getSafeThumbnail(data.thumbnail, ytVideoId || undefined);
          }
          if (data.formats_map && typeof data.formats_map === 'object') {
            const normalizedMap: Record<string, string> = {};
            for (const [k, v] of Object.entries(data.formats_map)) {
              if (typeof v === 'string' && v) {
                normalizedMap[k] = getApiUrl(v);
              }
            }
            formatsMap = normalizedMap;
          }
          if (data.direct_video_url) {
            directVideoUrl = getApiUrl(String(data.direct_video_url));
          }
          if (data.direct_audio_url) {
            directAudioUrl = getApiUrl(String(data.direct_audio_url));
          }
        }
      }
    } catch {
      // Fall back to direct / CapacitorHttp resolvers below
    }
  }

  // 2. TikTok TikWM Direct Resolver (Cached to avoid 1-req/sec rate limit)
  if (platform === 'tiktok' && (!directVideoUrl || !formatsMap || Object.keys(formatsMap).length === 0)) {
    const d = await fetchTikWmCached(cleanUrl);
    if (d) {
      if (d.title) resolvedTitle = d.title;
      if (d.author?.nickname) resolvedAuthor = `${d.author.nickname} (@${d.author.unique_id || 'tiktok'})`;
      if (d.duration) durationSeconds = Number(d.duration);
      if (d.cover) resolvedThumbnail = getSafeThumbnail(d.cover);
      if (d.play_count) viewsCount = String(d.play_count);

      const idPlay = d.id ? `https://www.tikwm.com/video/media/play/${d.id}.mp4` : '';
      const hdPlay = d.hdplay
        ? String(d.hdplay).startsWith('http')
          ? String(d.hdplay)
          : `https://www.tikwm.com${d.hdplay}`
        : idPlay;
      const stdPlay = d.play
        ? String(d.play).startsWith('http')
          ? String(d.play)
          : `https://www.tikwm.com${d.play}`
        : idPlay;
      const wmPlay = d.wmplay
        ? String(d.wmplay).startsWith('http')
          ? String(d.wmplay)
          : `https://www.tikwm.com${d.wmplay}`
        : stdPlay;

      const rawStd = Number(d.size) > 150000 ? Number(d.size) : 0;
      const rawWm = Number(d.wm_size) > 150000 ? Number(d.wm_size) : 0;
      const rawHd = Number(d.hd_size) > 150000 ? Number(d.hd_size) : 0;
      const wmIsSmaller = rawWm > 150000 && rawStd > 150000 && rawWm < rawStd * 0.85;

      const baseStd = rawStd > 150000 ? rawStd : rawWm > 150000 ? rawWm : 4500000;
      const baseHd =
        rawHd > baseStd ? rawHd : rawWm > baseStd ? rawWm : Math.round(baseStd * 1.38);
      const base480 = wmIsSmaller ? rawWm : Math.round(baseStd * 0.56);
      const base360 = Math.round(baseStd * 0.36);

      const primaryPlay = stdPlay || idPlay || hdPlay;
      if (!directVideoUrl) {
        if (!isCapacitorOrNative()) {
          formatsMap = {
            '1080': getApiUrl(`/api/media/stream?url=${encodeURIComponent(cleanUrl)}&quality=1080&audio=0`),
            '720': getApiUrl(`/api/media/stream?url=${encodeURIComponent(cleanUrl)}&quality=720&audio=0`),
            '480': getApiUrl(`/api/media/stream?url=${encodeURIComponent(cleanUrl)}&quality=480&audio=0`),
            '360': getApiUrl(`/api/media/stream?url=${encodeURIComponent(cleanUrl)}&quality=360&audio=0`)
          };
          directVideoUrl = formatsMap['720'];
        } else if (primaryPlay) {
          directVideoUrl = primaryPlay;
          formatsMap = {
            '1080': hdPlay || primaryPlay,
            '720': stdPlay || idPlay || primaryPlay,
            '480': (wmIsSmaller ? wmPlay : stdPlay) || primaryPlay,
            '360': (wmIsSmaller ? wmPlay : stdPlay) || primaryPlay
          };
        }
      }
      probedEst = {
        '360': base360,
        '480': base480,
        '720': baseStd,
        '1080': baseHd
      };
      if (d.music && !directAudioUrl) {
        directAudioUrl = d.music;
      }
    }
  }

  // 3. Instagram, Facebook & YouTube Native APK / Fallback Resolver via SaveVideo API (CapacitorHttp)
  if (
    (platform === 'instagram' || platform === 'facebook' || platform === 'youtube') &&
    (!directVideoUrl || isCapacitorOrNative())
  ) {
    const svInfo = await probeViaSaveVideoClientSide(cleanUrl, platform);
    if (svInfo) {
      if (svInfo.title) resolvedTitle = svInfo.title;
      if (svInfo.author) resolvedAuthor = svInfo.author;
      if (svInfo.duration) durationSeconds = svInfo.duration;
      if (svInfo.thumbnail) resolvedThumbnail = svInfo.thumbnail;
      if (svInfo.heights) probedHeights = svInfo.heights;
      if (svInfo.est && Object.keys(svInfo.est).length > 0) probedEst = svInfo.est;
      if (svInfo.audioEst) audioEst = svInfo.audioEst;
      if (svInfo.directVideoUrl) {
        directVideoUrl = svInfo.directVideoUrl;
        directAudioUrl = svInfo.directVideoUrl;
        formatsMap = {
          '1080': svInfo.directVideoUrl,
          '720': svInfo.directVideoUrl,
          '480': svInfo.directVideoUrl,
          '360': svInfo.directVideoUrl
        };
      }
      if (svInfo.fileSize && svInfo.fileSize > 30000) {
        probedEst = {
          '1080': svInfo.fileSize,
          '720': Math.round(svInfo.fileSize * 0.8),
          '480': Math.round(svInfo.fileSize * 0.55),
          '360': Math.round(svInfo.fileSize * 0.38)
        };
      }
    }
  }

  // Ensure YouTube on Web/Preview has signed direct muxed MP4 stream URLs ready for every resolution
  if (platform === 'youtube' && !isCapacitorOrNative()) {
    const canonicalYtUrl = ytVideoId ? `https://www.youtube.com/watch?v=${ytVideoId}` : cleanUrl;
    if (!formatsMap || Object.keys(formatsMap).length === 0) {
      formatsMap = {
        '1080': getApiUrl(`/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=1080&audio=0`),
        '720': getApiUrl(`/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=720&audio=0`),
        '480': getApiUrl(`/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=480&audio=0`),
        '360': getApiUrl(`/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=360&audio=0`)
      };
    }
    if (!directVideoUrl) {
      directVideoUrl = formatsMap['720'];
    }
    if (!directAudioUrl) {
      directAudioUrl = getApiUrl(`/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=720&audio=1`);
    }
  }

  // 4. Twitter/X Resolver if needed
  if (platform === 'twitter' && !directVideoUrl) {
    const twInfo = await probeTwitterClientSide(cleanUrl);
    if (twInfo) {
      resolvedTitle = twInfo.title;
      resolvedAuthor = twInfo.author;
      durationSeconds = twInfo.duration;
      if (twInfo.thumbnail) resolvedThumbnail = getSafeThumbnail(twInfo.thumbnail);
      directVideoUrl = twInfo.directVideoUrl;
      directAudioUrl = twInfo.directVideoUrl;
      formatsMap = twInfo.formatsMap || { '1080': twInfo.directVideoUrl, '720': twInfo.directVideoUrl };
    }
  }

  // 5. Public oEmbed metadata enrichment (author name / title / real thumbnail for YouTube, Twitter, Facebook, TikTok)
  try {
    const data = await smartFetchJson(
      `https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`,
      { method: 'GET', timeoutMs: 5000 }
    );
    if (data && !data.error) {
      if (
        data.title &&
        (resolvedTitle.startsWith('ویدیو') ||
          resolvedTitle.startsWith('YouTube ') ||
          resolvedTitle.includes(' - '))
      ) {
        resolvedTitle = data.title;
      }
      if (data.author_name) {
        resolvedAuthor = data.author_name;
      }
      if (!ytVideoId && data.thumbnail_url && resolvedThumbnail.startsWith('data:image')) {
        resolvedThumbnail = getSafeThumbnail(data.thumbnail_url);
      }
    }
  } catch {
    // Ignore oEmbed failure
  }

  const formats = generateFormatOptions(
    durationSeconds,
    probedHeights,
    probedEst,
    audioEst,
    formatsMap,
    directVideoUrl,
    directAudioUrl
  );

  return {
    id: `media-${Date.now()}`,
    originalUrl: cleanUrl,
    videoId: ytVideoId || undefined,
    platform,
    title: resolvedTitle,
    author: resolvedAuthor,
    durationSeconds,
    durationFormatted: formatDuration(durationSeconds),
    viewsCount,
    thumbnail: resolvedThumbnail,
    formats,
    directVideoUrl,
    directAudioUrl,
    timestamp: Date.now()
  };
}

/**
 * Ensures any thumbnail URL loads reliably on both Web and Native Android APK
 */
export function getSafeThumbnail(thumbnailUrl: string, ytVideoId?: string): string {
  if (ytVideoId && /^[\w-]{11}$/.test(ytVideoId)) {
    return `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`;
  }
  if (!thumbnailUrl) return '';
  if (thumbnailUrl.startsWith('data:image') || thumbnailUrl.startsWith('blob:')) {
    return thumbnailUrl;
  }

  // Unwrap any /api/media/thumbnail URLs to direct CDN / wsrv.nl so thumbnails use 0 server QPS/bandwidth
  if (thumbnailUrl.includes('/api/media/thumbnail')) {
    try {
      const qIndex = thumbnailUrl.indexOf('?');
      if (qIndex !== -1) {
        const params = new URLSearchParams(thumbnailUrl.slice(qIndex + 1));
        const yt = params.get('yt');
        if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
        const ig = params.get('ig');
        if (ig) {
          return `https://wsrv.nl/?url=${encodeURIComponent(
            `https://www.instagram.com/p/${ig}/media/?size=l`
          )}&w=480&output=jpg`;
        }
        const innerUrl = params.get('url');
        if (innerUrl) {
          if (innerUrl.includes('i.ytimg.com') || innerUrl.includes('aparat.com')) {
            return innerUrl;
          }
          return `https://wsrv.nl/?url=${encodeURIComponent(innerUrl)}&w=480&output=jpg`;
        }
      }
    } catch {
      // ignore
    }
  }

  if (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')) {
    if (
      thumbnailUrl.includes('wsrv.nl') ||
      thumbnailUrl.includes('aparat.com') ||
      thumbnailUrl.includes('cdn.asset.aparat.com') ||
      thumbnailUrl.includes('i.ytimg.com')
    ) {
      return thumbnailUrl;
    }
    return `https://wsrv.nl/?url=${encodeURIComponent(thumbnailUrl)}&w=480&output=jpg`;
  }

  return thumbnailUrl;
}

/**
 * Checks if a URL is a social media webpage (e.g. YouTube watch page, Aparat page, Instagram post)
 * rather than a playable media file.
 */
export function isWebpageUrl(url?: string | null): boolean {
  if (!url) return false;
  if (
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.includes('/api/media/file') ||
    url.includes('/api/media/audio') ||
    url.includes('/api/media/proxy-stream') ||
    url.includes('/api/media/stream') ||
    url.includes('savevideo.uz/api/file/') ||
    url.includes('savevideo.uz/api/audio/') ||
    url.includes('tikwm.com/video/media/')
  ) {
    return false;
  }
  if (/\.(mp4|mp3|m4a|webm|wav|ogg|mov)(\?.*)?$/i.test(url)) {
    return false;
  }
  return /(?:youtube\.com|youtu\.be|instagram\.com|instagr\.am|tiktok\.com|twitter\.com|x\.com|facebook\.com|aparat\.com\/v\/)/i.test(
    url
  );
}
