import { MediaType } from '../types';
import {
  extractInstagramShortcode,
  extractTwitterStatusId,
  extractYouTubeVideoId,
  fetchBackendApi,
  fetchTikWmCached,
  getApiUrl,
  getSafeThumbnail,
  isAparatUrl,
  isCapacitorOrNative,
  smartFetchJson
} from './platformDetector';
import {
  AparatResolvedStream,
  resolveViaAparat
} from './aparatExtractor';
import { MIN_VALID_AUDIO_BYTES, MIN_VALID_VIDEO_BYTES } from './nativeStorage';

export type { AparatResolvedStream };
export { resolveViaAparat };

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.drgns.space'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com',
  'https://vid.puffyan.us',
  'https://iv.ggtyler.dev'
];

const COBALT_INSTANCES = [
  'https://cobalt-api.kwiatekmiki.com',
  'https://cobalt.api.timelessnesses.me',
  'https://api.cobalt.best',
  'https://co.eepy.today'
];

/**
 * Unwraps any `/api/media/proxy-stream` or `/api/media/file/:taskId` or `/api/media/audio/:taskId`
 * into the underlying raw upstream binary stream URL.
 */
export function unwrapRawMediaUrl(url: string): string {
  if (!url) return '';
  if (url.includes('/api/media/proxy-stream')) {
    try {
      const qsIndex = url.indexOf('?');
      if (qsIndex !== -1) {
        const params = new URLSearchParams(url.slice(qsIndex + 1));
        const inner = params.get('url');
        if (inner && inner.startsWith('http')) {
          return inner;
        }
      }
    } catch {
      // ignore
    }
  }
  const fileMatch = url.match(/\/api\/media\/file\/([A-Za-z0-9_-]+)(\?.*)?$/i);
  if (fileMatch && fileMatch[1]) {
    const taskId = fileMatch[1];
    let token = '';
    try {
      const qsIndex = url.indexOf('?');
      if (qsIndex !== -1) {
        const params = new URLSearchParams(url.slice(qsIndex + 1));
        token = params.get('t') || '';
      }
    } catch {
      // ignore
    }
    return `https://savevideo.uz/api/file/${taskId}?t=${encodeURIComponent(token)}`;
  }

  const audioMatch = url.match(/\/api\/media\/audio\/([A-Za-z0-9_-]+)(\?.*)?$/i);
  if (audioMatch && audioMatch[1]) {
    const taskId = audioMatch[1];
    let token = '';
    try {
      const qsIndex = url.indexOf('?');
      if (qsIndex !== -1) {
        const params = new URLSearchParams(url.slice(qsIndex + 1));
        token = params.get('t') || '';
      }
    } catch {
      // ignore
    }
    return `https://savevideo.uz/api/audio/${taskId}?t=${encodeURIComponent(token)}`;
  }

  return url;
}

export function isCorsDirectCdnUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  if (url.includes('/api/media/')) return false;
  return /(?:tiktokcdn|tikwm\.com\/video\/media|cdn\.asset\.aparat\.com|aparat\.com\/v\/|twimg\.com)/i.test(
    url
  );
}

/**
 * Active CORS Header-Rewriting Proxy Pool (Web / WebView / Native Fallback Pool)
 */
export const CORS_PROXIES = [
  (targetUrl: string) => {
    if (!targetUrl) return '';
    if (targetUrl.startsWith('/api/media/')) {
      return getApiUrl(targetUrl);
    }
    if (targetUrl.includes('/api/media/')) {
      return targetUrl;
    }
    const raw = unwrapRawMediaUrl(targetUrl);
    return raw.startsWith('http')
      ? getApiUrl(`/api/media/proxy-stream?url=${encodeURIComponent(raw)}`)
      : '';
  }
];

export interface ResolvedStreamInfo {
  url: string;
  fallbackUrls?: string[];
  isRealExtracted: boolean;
  mimeType: string;
  estimatedBytes?: number;
  title?: string;
  thumbnail?: string;
}

function parseRequestedHeight(qualityLabel?: string): number {
  if (!qualityLabel) return 720;
  if (qualityLabel.includes('2160') || qualityLabel.includes('4K')) return 2160;
  if (qualityLabel.includes('1440') || qualityLabel.includes('2K')) return 1440;
  if (qualityLabel.includes('1080')) return 1080;
  if (qualityLabel.includes('720')) return 720;
  if (qualityLabel.includes('480')) return 480;
  if (qualityLabel.includes('360')) return 360;
  if (qualityLabel.includes('240')) return 240;
  return 720;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function wrapStreamUrl(
  rawUrl: string,
  title?: string,
  isAudio?: boolean,
  sourceUrl?: string,
  quality?: string
): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('blob:')) return rawUrl;
  if (rawUrl.startsWith('/api/media/') || rawUrl.includes('/api/media/')) {
    let updated = rawUrl;
    if (
      sourceUrl &&
      !updated.includes('sourceUrl=') &&
      (updated.includes('/api/media/file/') ||
        updated.includes('/api/media/audio/') ||
        updated.includes('/api/media/proxy-stream'))
    ) {
      const sep = updated.includes('?') ? '&' : '?';
      updated += `${sep}sourceUrl=${encodeURIComponent(sourceUrl)}`;
    }
    return getApiUrl(updated);
  }
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    return '';
  }
  let built = `/api/media/proxy-stream?url=${encodeURIComponent(rawUrl)}&title=${encodeURIComponent(
    title || 'media'
  )}&ext=${isAudio ? 'mp3' : 'mp4'}`;
  if (sourceUrl) {
    built += `&sourceUrl=${encodeURIComponent(sourceUrl)}`;
  }
  if (quality) {
    built += `&quality=${encodeURIComponent(quality)}`;
  }
  return getApiUrl(built);
}

export interface TikWMResolvedStream {
  url: string;
  fallbackUrls: string[];
  title?: string;
  thumbnail?: string;
  duration?: number;
  estimatedSize?: number;
}

/**
 * Direct No-Watermark TikTok Stream Resolver via TikWM API (with Cached Rate-Limit Protection)
 */
export async function resolveViaTikWM(
  originalUrl: string,
  mediaType: MediaType
): Promise<TikWMResolvedStream | null> {
  try {
    const data = await fetchTikWmCached(originalUrl);
    if (data) {
      const isAudio = mediaType === 'audio';
      const idPlayUrl = data.id ? `https://www.tikwm.com/video/media/play/${data.id}.mp4` : '';
      const hdPlayUrl = data.hdplay
        ? String(data.hdplay).startsWith('http')
          ? String(data.hdplay)
          : `https://www.tikwm.com${data.hdplay}`
        : '';
      const stdPlayUrl = data.play
        ? String(data.play).startsWith('http')
          ? String(data.play)
          : `https://www.tikwm.com${data.play}`
        : '';
      const wmPlayUrl = data.wmplay
        ? String(data.wmplay).startsWith('http')
          ? String(data.wmplay)
          : `https://www.tikwm.com${data.wmplay}`
        : '';
      const musicUrl = data.music
        ? String(data.music).startsWith('http')
          ? String(data.music)
          : `https://www.tikwm.com${data.music}`
        : '';

      const orderedRawCandidates = isAudio
        ? [musicUrl, idPlayUrl, stdPlayUrl, hdPlayUrl].filter(Boolean)
        : [idPlayUrl, stdPlayUrl, hdPlayUrl, wmPlayUrl].filter(Boolean);

      if (orderedRawCandidates.length > 0) {
        const primaryRaw = orderedRawCandidates[0];
        const fallbackUrls: string[] = [];
        for (const candidate of orderedRawCandidates) {
          const wrapped = wrapStreamUrl(candidate, data.title || 'tiktok_video', isAudio, originalUrl);
          if (wrapped && !fallbackUrls.includes(wrapped)) fallbackUrls.push(wrapped);
        }

        return {
          url: primaryRaw,
          fallbackUrls,
          title: data.title || `TikTok Video (@${data.author?.unique_id || 'tiktok'})`,
          thumbnail: data.cover || data.origin_cover,
          duration: data.duration,
          estimatedSize: data.size || data.hd_size || 4500000
        };
      }
    }
  } catch (err) {
    console.warn('TikWM direct resolve error:', err);
  }
  return null;
}

/**
 * Extracts a real frame from a downloaded Video Blob as a JPEG data URL cover
 */
export async function extractVideoFrameThumbnail(videoBlob: Blob): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objUrl = URL.createObjectURL(videoBlob);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(objUrl);
      video.removeAttribute('src');
      video.load();
    };

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), 5000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const seekTarget = video.duration > 2 ? Math.min(2.5, video.duration * 0.25) : 0.2;
      video.currentTime = seekTarget;
    };

    video.onseeked = () => {
      try {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          clearTimeout(timer);
          finish(dataUrl.length > 200 ? dataUrl : null);
          return;
        }
      } catch {
        // ignore canvas error
      }
      clearTimeout(timer);
      finish(null);
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };

    video.src = objUrl;
  });
}

/**
 * Resolves additional fallback stream URLs from alternate engines (Piped, Invidious, Cobalt, SaveVideo 720p/360p)
 * when a primary stream URL fails or returns a blocked < 500 KB response.
 */
export async function resolveFallbackMediaStreams(
  originalUrl: string,
  mediaType: MediaType,
  qualityLabel?: string
): Promise<string[]> {
  const isAudio = mediaType === 'audio';
  const requestedHeight = parseRequestedHeight(qualityLabel);
  const ytId = extractYouTubeVideoId(originalUrl);
  const results: string[] = [];

  const addCandidate = (rawOrWrapped: string) => {
    if (!rawOrWrapped) return;
    const wrapped = wrapStreamUrl(rawOrWrapped, 'media', isAudio, originalUrl, String(requestedHeight));
    if (wrapped && !results.includes(wrapped)) results.push(wrapped);
  };

  // 1. Backend /api/media/stream with explicit quality fallbacks (720p, 360p)
  addCandidate(
    getApiUrl(
      `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${requestedHeight}&audio=${
        isAudio ? '1' : '0'
      }`
    )
  );
  if (requestedHeight > 720) {
    addCandidate(
      getApiUrl(
        `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=720&audio=${isAudio ? '1' : '0'}`
      )
    );
  }

  // 2. If YouTube, query Piped & Invidious instances for direct progressive MP4 streams
  if (ytId) {
    for (const instance of PIPED_INSTANCES.slice(0, 3)) {
      try {
        const data = await smartFetchJson(`${instance}/streams/${ytId}`, {
          method: 'GET',
          timeoutMs: 5000
        });
        if (!data) continue;
        if (isAudio && Array.isArray(data.audioStreams)) {
          for (const s of data.audioStreams) {
            if (s?.url) addCandidate(s.url);
          }
        } else if (!isAudio && Array.isArray(data.videoStreams)) {
          const prog = data.videoStreams.filter((s: any) => s.videoOnly === false && s.url);
          for (const s of prog) {
            addCandidate(s.url);
          }
        }
        if (results.length >= 4) break;
      } catch {
        // continue
      }
    }

    for (const instance of INVIDIOUS_INSTANCES.slice(0, 2)) {
      try {
        const data = await smartFetchJson(`${instance}/api/v1/videos/${ytId}`, {
          method: 'GET',
          timeoutMs: 5000
        });
        if (data && Array.isArray(data.formatStreams)) {
          for (const s of data.formatStreams) {
            if (s?.url) addCandidate(s.url);
          }
        }
        if (results.length >= 5) break;
      } catch {
        // continue
      }
    }
  }

  // 3. Cobalt API fallback
  for (const cobaltBase of COBALT_INSTANCES.slice(0, 2)) {
    try {
      const data = await smartFetchJson(`${cobaltBase}/`, {
        method: 'POST',
        body: {
          url: originalUrl,
          videoQuality: String(requestedHeight),
          downloadMode: isAudio ? 'audio' : 'auto',
          audioFormat: 'mp3'
        },
        timeoutMs: 5000
      });
      const streamUrl = data?.url || data?.audio;
      if (streamUrl && typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
        addCandidate(streamUrl);
        break;
      }
    } catch {
      // continue
    }
  }

  return results;
}

/**
 * Resolves the real downloadable media stream for YouTube (Shorts & Long), Instagram, TikTok, Twitter/X, Facebook, and Aparat.
 */
export async function resolveDirectMediaStream(
  originalUrl: string,
  mediaType: MediaType,
  qualityLabel?: string,
  preResolvedDirectUrl?: string,
  onProgress?: (percent: number) => void
): Promise<ResolvedStreamInfo> {
  const isAudio = mediaType === 'audio';
  const requestedHeight = parseRequestedHeight(qualityLabel);

  // 0a. Direct media file link (.mp4 / .mp3 / .webm)
  if (/\.(mp4|mp3|m4a|webm|wav|ogg|mov)(\?.*)?$/i.test(originalUrl)) {
    const isDirectCors = isCorsDirectCdnUrl(originalUrl);
    const wrapped = wrapStreamUrl(originalUrl, 'direct_media', isAudio);
    return {
      url: isDirectCors ? originalUrl : wrapped,
      fallbackUrls: isDirectCors ? [wrapped] : [originalUrl],
      isRealExtracted: true,
      mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
    };
  }

  // 0b. Isolated Aparat Module (Only if URL is Aparat — zero interference with global platforms)
  if (isAparatUrl(originalUrl)) {
    const aparatStream = await resolveViaAparat(originalUrl, qualityLabel, isAudio);
    if (aparatStream && aparatStream.url) {
      return {
        url: aparatStream.rawUrl || aparatStream.url,
        fallbackUrls: aparatStream.rawUrl ? [aparatStream.url] : undefined,
        isRealExtracted: true,
        mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
        estimatedBytes: aparatStream.estimatedSize,
        title: aparatStream.title,
        thumbnail: aparatStream.thumbnail
      };
    }
  }

  // 0c. For TikTok, try fast client-side cached TikWM first if available, or backend /api/media/start
  const isTikTok = /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(originalUrl);

  // 1. Primary Full-Stack Express Backend (/api/media/start + /api/media/status) on both Web and Native APK
  try {
    onProgress?.(4);
    const startRes = await fetchBackendApi('/api/media/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: originalUrl,
        height: requestedHeight,
        audio: isAudio
      })
    });

    if (startRes.ok) {
      const startData = await startRes.json();

      if (startData.status === 'done' && startData.direct_url) {
        onProgress?.(12);
        const rawUrl = unwrapRawMediaUrl(String(startData.direct_url));
        const wrappedPrimary = wrapStreamUrl(
          String(startData.direct_url),
          startData.title || 'media',
          isAudio,
          originalUrl,
          String(requestedHeight)
        );
        const extraFallbacks: string[] = [];
        if (Array.isArray(startData.fallback_urls)) {
          for (const u of startData.fallback_urls) {
            const rawF = unwrapRawMediaUrl(String(u));
            if (isCorsDirectCdnUrl(rawF) && !extraFallbacks.includes(rawF)) {
              extraFallbacks.push(rawF);
            }
            const wrappedF = wrapStreamUrl(
              String(u),
              startData.title || 'media',
              isAudio,
              originalUrl,
              String(requestedHeight)
            );
            if (wrappedF && !extraFallbacks.includes(wrappedF)) {
              extraFallbacks.push(wrappedF);
            }
          }
        }
        const streamFallback = getApiUrl(
          `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${requestedHeight}&audio=${
            isAudio ? '1' : '0'
          }`
        );

        // If rawUrl is a CORS-enabled direct CDN (e.g. tiktokcdn-us.com, tikwm.com, aparat.com, twimg.com),
        // use rawUrl FIRST so the browser downloads directly with 0 Cloud Run container bandwidth!
        const useRawFirst = isCorsDirectCdnUrl(rawUrl);
        const primaryUrl = useRawFirst ? rawUrl : wrappedPrimary;
        const allFallbacks = useRawFirst
          ? [wrappedPrimary, ...extraFallbacks, streamFallback]
          : [...extraFallbacks, streamFallback];

        return {
          url: primaryUrl,
          fallbackUrls: allFallbacks.filter((u) => u && u !== primaryUrl),
          isRealExtracted: true,
          mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
          estimatedBytes: startData.file_size,
          title: startData.title,
          thumbnail: startData.thumbnail
        };
      }

      const taskId = startData.task_id;
      if (taskId) {
        for (let attempt = 0; attempt < 45; attempt++) {
          const simulatedPrep = Math.min(14, 5 + Math.round((attempt / 25) * 9));
          onProgress?.(simulatedPrep);
          await sleep(2500);
          try {
            const statusRes = await fetchBackendApi(`/api/media/status/${taskId}`);
            if (!statusRes.ok) continue;

            const statusData = await statusRes.json();
            if (typeof statusData.progress === 'number' && statusData.progress > 0) {
              onProgress?.(Math.min(14, Math.max(simulatedPrep, Math.round(statusData.progress * 0.14))));
            }
            if (statusData.status === 'done') {
              onProgress?.(15);
              const resolvedTaskId = statusData.task_id || taskId;
              const token = statusData.file_token || '';
              const ext = isAudio ? 'mp3' : statusData.ext || 'mp4';
              const streamEndpoint = getApiUrl(
                isAudio
                  ? `/api/media/audio/${resolvedTaskId}?t=${encodeURIComponent(token)}&quality=${requestedHeight}&sourceUrl=${encodeURIComponent(
                      originalUrl
                    )}`
                  : `/api/media/file/${resolvedTaskId}?t=${encodeURIComponent(token)}&ext=${ext}&quality=${requestedHeight}&title=${encodeURIComponent(
                      statusData.title || 'video'
                    )}&sourceUrl=${encodeURIComponent(originalUrl)}`
              );
              const streamFallback = getApiUrl(
                `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${requestedHeight}&audio=${
                  isAudio ? '1' : '0'
                }`
              );

              return {
                url: streamEndpoint,
                fallbackUrls: [streamFallback],
                isRealExtracted: true,
                mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
                estimatedBytes: statusData.file_size,
                title: statusData.title,
                thumbnail: statusData.thumbnail
              };
            } else if (statusData.status === 'error') {
              break;
            }
          } catch {
            // continue polling
          }
        }
      }
    }
  } catch {
    // fall through to client-side / native resolvers below
  }

  // 2. TikTok Direct No-Watermark API Fallback (Client/Native)
  if (isTikTok) {
    const tikResolved = await resolveViaTikWM(originalUrl, mediaType);
    if (tikResolved && tikResolved.url) {
      return {
        url: tikResolved.url,
        fallbackUrls: tikResolved.fallbackUrls,
        isRealExtracted: true,
        mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
        estimatedBytes: tikResolved.estimatedSize,
        title: tikResolved.title,
        thumbnail: tikResolved.thumbnail
      };
    }
  }

  // 2b. If preResolvedDirectUrl is already a concrete permanent CDN link (not a generic /api/media/stream wrapper or single-use SaveVideo token), use it with fallbacks
  if (
    preResolvedDirectUrl &&
    preResolvedDirectUrl.trim() &&
    !preResolvedDirectUrl.includes('/api/media/stream') &&
    !preResolvedDirectUrl.includes('/api/media/file/') &&
    !preResolvedDirectUrl.includes('/api/media/audio/') &&
    !preResolvedDirectUrl.includes('savevideo.uz')
  ) {
    const raw = unwrapRawMediaUrl(preResolvedDirectUrl.trim());
    const wrapped = wrapStreamUrl(
      preResolvedDirectUrl.trim(),
      'media',
      isAudio,
      originalUrl,
      String(requestedHeight)
    );
    const streamFallback = getApiUrl(
      `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${requestedHeight}&audio=${
        isAudio ? '1' : '0'
      }`
    );
    const useRawFirst = isCorsDirectCdnUrl(raw);
    return {
      url: useRawFirst ? raw : wrapped,
      fallbackUrls: useRawFirst ? [wrapped, streamFallback] : [raw, streamFallback].filter(Boolean),
      isRealExtracted: true,
      mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
    };
  }

  // 3. Direct SaveVideo Engine via smartFetchJson (with automatic 1080p -> 720p -> 360p fallback)
  const ytId = extractYouTubeVideoId(originalUrl);
  const igShortcode = extractInstagramShortcode(originalUrl);
  const isInstagram = Boolean(igShortcode || /(?:instagram\.com|instagr\.am)/i.test(originalUrl));
  const isFacebook = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(originalUrl);
  const tweetId = extractTwitterStatusId(originalUrl);

  if (ytId || isInstagram || isFacebook || tweetId) {
    const normalizedTargetUrl = ytId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : isInstagram && igShortcode && !/\/stories\//i.test(originalUrl)
      ? `https://www.instagram.com/reel/${igShortcode}/`
      : originalUrl.split('?')[0] || originalUrl;

    const heightsToTry = ytId
      ? Array.from(new Set([requestedHeight, 720, 360]))
      : [requestedHeight];

    for (const tryHeight of heightsToTry) {
      const startEndpoint = ytId
        ? 'https://savevideo.uz/api/yt/start'
        : 'https://savevideo.uz/api/download';
      const startPayload = ytId
        ? { url: normalizedTargetUrl, height: tryHeight, audio: isAudio }
        : { url: normalizedTargetUrl };

      const data = await smartFetchJson(startEndpoint, {
        method: 'POST',
        headers: { Referer: 'https://savevideo.uz/' },
        body: startPayload,
        timeoutMs: 11000
      });

      if (data && data.task_id) {
        for (let attempt = 0; attempt < 25; attempt++) {
          await sleep(1800);
          const stData = await smartFetchJson(`https://savevideo.uz/api/status/${data.task_id}`, {
            method: 'GET',
            headers: { Referer: 'https://savevideo.uz/' },
            timeoutMs: 7000
          });
          if (!stData) continue;
          if (stData.status === 'done') {
            const fileSize = typeof stData.file_size === 'number' ? stData.file_size : 0;
            const minRequired = isAudio ? MIN_VALID_AUDIO_BYTES : MIN_VALID_VIDEO_BYTES;
            if (fileSize > 0 && fileSize < minRequired) {
              break; // Reject corrupt/tiny file and try next resolution
            }
            const token = stData.file_token || '';
            const proxiedUrl = getApiUrl(
              isAudio
                ? `/api/media/audio/${data.task_id}?t=${encodeURIComponent(token)}&sourceUrl=${encodeURIComponent(
                    originalUrl
                  )}`
                : `/api/media/file/${data.task_id}?t=${encodeURIComponent(token)}&ext=${
                    stData.ext || 'mp4'
                  }&title=${encodeURIComponent(stData.title || 'video')}&sourceUrl=${encodeURIComponent(
                    originalUrl
                  )}`
            );

            return {
              url: proxiedUrl,
              fallbackUrls: [
                getApiUrl(
                  `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${tryHeight}&audio=${
                    isAudio ? '1' : '0'
                  }`
                )
              ],
              isRealExtracted: true,
              mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
              estimatedBytes: fileSize > 0 ? fileSize : undefined,
              title: stData.title,
              thumbnail: ytId
                ? getSafeThumbnail('', ytId)
                : igShortcode
                ? getSafeThumbnail(`/api/media/thumbnail?ig=${igShortcode}`)
                : undefined
            };
          }
          if (stData.status === 'error') break;
        }
      }
    }
  }

  // 4. Client/Native Engine for Twitter / X (FXTwitter & VXTwitter highest bitrate .mp4)
  if (tweetId) {
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
            const wrapped = wrapStreamUrl(bestMp4, tweet.text || `x_${tweetId}`, isAudio);
            return {
              url: bestMp4,
              fallbackUrls: [wrapped],
              isRealExtracted: true,
              mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
              title: tweet.text,
              thumbnail: videoItem.thumbnail_url ? getSafeThumbnail(videoItem.thumbnail_url) : undefined
            };
          }
        }
      } catch {
        // continue
      }
    }
  }

  // 5. Client/Native Engine for YouTube: Piped & Invidious APIs
  if (ytId) {
    const extraFallbacks = await resolveFallbackMediaStreams(originalUrl, mediaType, qualityLabel);
    if (extraFallbacks.length > 0) {
      return {
        url: extraFallbacks[0],
        fallbackUrls: extraFallbacks.slice(1),
        isRealExtracted: true,
        mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
      };
    }
  }

  // 6. Universal Multi-Platform Engine: Cobalt API
  for (const cobaltBase of COBALT_INSTANCES) {
    try {
      const data = await smartFetchJson(`${cobaltBase}/`, {
        method: 'POST',
        body: {
          url: originalUrl,
          videoQuality: String(requestedHeight),
          downloadMode: isAudio ? 'audio' : 'auto',
          audioFormat: 'mp3'
        },
        timeoutMs: 5500
      });

      if (data) {
        const streamUrl = data.url || data.audio;
        if (streamUrl && typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
          return {
            url: wrapStreamUrl(streamUrl, data.filename || 'media', isAudio),
            fallbackUrls: [streamUrl],
            isRealExtracted: true,
            mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
          };
        }
      }
    } catch {
      // try next Cobalt instance
    }
  }

  // 7. Universal Backend Stream Fallback
  const universalStreamUrl = getApiUrl(
    `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${requestedHeight}&audio=${
      isAudio ? '1' : '0'
    }`
  );
  return {
    url: universalStreamUrl,
    fallbackUrls:
      requestedHeight > 720
        ? [
            getApiUrl(
              `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=720&audio=${
                isAudio ? '1' : '0'
              }`
            )
          ]
        : undefined,
    isRealExtracted: true,
    mimeType: isAudio
      ? qualityLabel?.toLowerCase().includes('m4a')
        ? 'audio/mp4'
        : 'audio/mpeg'
      : 'video/mp4'
  };
}

/**
 * Validates that a response is a genuine binary media response (NEVER HTML, XML, JSON, or < 120 KB error payload).
 */
function isGenuineMediaResponse(
  res: Response,
  isAudio: boolean = false,
  isRangeSlice: boolean = false
): boolean {
  if (!res.ok && res.status !== 206) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (
    ct.includes('text/html') ||
    ct.includes('application/xhtml') ||
    ct.includes('application/json') ||
    ct.includes('text/plain') ||
    ct.includes('text/xml') ||
    ct.includes('application/xml')
  ) {
    return false;
  }

  const minBytes = isAudio ? MIN_VALID_AUDIO_BYTES : MIN_VALID_VIDEO_BYTES;
  const cr = res.headers.get('content-range') || '';
  if (cr.includes('/')) {
    const totalStr = cr.split('/')[1];
    const totalNum = Number(totalStr || '0');
    if (totalNum > 0 && totalNum < minBytes) {
      return false;
    }
    return true;
  }

  if (!isRangeSlice && res.status !== 206) {
    const cl = Number(res.headers.get('content-length') || '0');
    if (cl > 0 && cl < minBytes) {
      return false;
    }
  }
  return true;
}

/**
 * TubeMate Direct Stream Fetcher (Supports both full stream and sequential Range slices):
 * Keeps the primary `/api/media/...` endpoint first and supports `rangeHeader` via both
 * HTTP `Range` header and `&range=` query parameter so proxy timeouts never interrupt large downloads.
 */
export async function fetchMediaStreamWithCorsFallback(
  targetUrl: string,
  signal?: AbortSignal,
  isAudio: boolean = false,
  rangeHeader?: string
): Promise<Response> {
  if (!targetUrl) {
    throw new Error('لینک مستقیم ویدیو استخراج نشد.');
  }

  const isBackendTarget =
    targetUrl.startsWith('/api/media/') || targetUrl.includes('/api/media/');

  const candidateUrls: string[] = [];

  if (isBackendTarget) {
    candidateUrls.push(getApiUrl(targetUrl));
  } else {
    candidateUrls.push(targetUrl);
  }

  let lastError: unknown;
  for (const baseCandidateUrl of candidateUrls) {
    if (!baseCandidateUrl) continue;
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      let fetchUrl = baseCandidateUrl;
      const reqHeaders: Record<string, string> = {};
      if (rangeHeader) {
        reqHeaders['Range'] = rangeHeader;
        if (fetchUrl.includes('/api/media/') && !fetchUrl.includes('range=')) {
          const sep = fetchUrl.includes('?') ? '&' : '?';
          fetchUrl = `${fetchUrl}${sep}range=${encodeURIComponent(rangeHeader)}`;
        }
      }

      const isSameOriginBackend =
        fetchUrl.startsWith('/') ||
        (typeof window !== 'undefined' && fetchUrl.startsWith(window.location.origin));

      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
        signal,
        credentials: isSameOriginBackend ? 'include' : 'omit',
        referrerPolicy: isSameOriginBackend ? undefined : 'no-referrer'
      });
      if (isGenuineMediaResponse(res, isAudio, Boolean(rangeHeader))) {
        return res;
      }
      lastError = new Error(`Invalid media response (${res.status})`);
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('خطا در دریافت استریم مدیا');
}
