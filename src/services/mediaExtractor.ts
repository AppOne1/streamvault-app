import { CapacitorHttp } from '@capacitor/core';
import { MediaType } from '../types';
import {
  extractInstagramShortcode,
  extractTwitterStatusId,
  extractYouTubeVideoId,
  fetchBackendApi,
  fetchTikWmCached,
  getApiUrl,
  getNativeLocalProxyUrl,
  getSafeThumbnail,
  isAparatUrl,
  isCapacitorOrNative,
  smartFetchJson,
  wrapWithNativeLocalProxy
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
  if (
    url.includes('/api/media/proxy-stream') ||
    url.includes('/api/media/proxy-download') ||
    url.includes('127.0.0.1:')
  ) {
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
        token = params.get('t') || params.get('token') || '';
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
        token = params.get('t') || params.get('token') || '';
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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    setTimeout(resolve, isHidden ? Math.min(ms, 350) : ms);
  });

export function wrapStreamUrl(
  rawUrl: string,
  title?: string,
  isAudio?: boolean,
  sourceUrl?: string,
  quality?: string
): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('http://127.0.0.1:')) return rawUrl;

  const unwrapped = unwrapRawMediaUrl(rawUrl);
  const localProxyBase = getNativeLocalProxyUrl();
  if (localProxyBase && unwrapped.startsWith('http') && !unwrapped.includes('/api/media/')) {
    return `${localProxyBase}/stream?url=${encodeURIComponent(unwrapped)}`;
  }

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
  if (isCapacitorOrNative()) {
    return wrapWithNativeLocalProxy(rawUrl);
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
  mediaType: MediaType,
  qualityLabel: string = '720p'
): Promise<TikWMResolvedStream | null> {
  try {
    const data = await fetchTikWmCached(originalUrl);
    if (data) {
      const isAudio = mediaType === 'audio';
      const heightMatch = qualityLabel.match(/(\d{3,4})/);
      const reqH = heightMatch ? parseInt(heightMatch[1], 10) : 720;

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

      const rawStdSize = Number(data.size) > 150000 ? Number(data.size) : 0;
      const rawWmSize = Number(data.wm_size) > 150000 ? Number(data.wm_size) : 0;
      const rawHdSize = Number(data.hd_size) > 150000 ? Number(data.hd_size) : 0;
      const wmIsSmaller = rawWmSize > 150000 && rawStdSize > 150000 && rawWmSize < rawStdSize * 0.85;

      const baseStdSize = rawStdSize > 150000 ? rawStdSize : rawWmSize > 150000 ? rawWmSize : 4500000;
      const baseHdSize =
        rawHdSize > baseStdSize
          ? rawHdSize
          : rawWmSize > baseStdSize
          ? rawWmSize
          : Math.round(baseStdSize * 1.38);
      const base480Size = wmIsSmaller ? rawWmSize : Math.round(baseStdSize * 0.56);
      const base360Size = Math.round(baseStdSize * 0.36);

      const heightBucket = reqH <= 360 ? 360 : reqH <= 480 ? 480 : reqH <= 720 ? 720 : 1080;
      const isNative = isCapacitorOrNative();
      const serverResolutionStream = !isNative
        ? getApiUrl(
            `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${heightBucket}&audio=${
              isAudio ? '1' : '0'
            }`
          )
        : '';

      let orderedRawCandidates: string[];
      let chosenSize = baseStdSize;

      if (isAudio) {
        orderedRawCandidates = [musicUrl, serverResolutionStream, stdPlayUrl, idPlayUrl].filter(Boolean);
        chosenSize = Math.round(baseStdSize * 0.25);
      } else if (heightBucket >= 1080) {
        orderedRawCandidates = [hdPlayUrl, serverResolutionStream, stdPlayUrl, idPlayUrl].filter(Boolean);
        chosenSize = baseHdSize;
      } else if (heightBucket === 720) {
        orderedRawCandidates = [stdPlayUrl, idPlayUrl, serverResolutionStream, hdPlayUrl].filter(Boolean);
        chosenSize = baseStdSize;
      } else if (heightBucket === 480) {
        orderedRawCandidates = [
          serverResolutionStream,
          wmIsSmaller ? wmPlayUrl : stdPlayUrl,
          idPlayUrl
        ].filter(Boolean);
        chosenSize = base480Size;
      } else {
        orderedRawCandidates = [
          serverResolutionStream,
          wmIsSmaller ? wmPlayUrl : stdPlayUrl,
          idPlayUrl
        ].filter(Boolean);
        chosenSize = base360Size;
      }

      if (orderedRawCandidates.length > 0) {
        const primaryRaw = orderedRawCandidates[0];
        const fallbackUrls: string[] = [];
        for (const candidate of orderedRawCandidates) {
          const wrapped = wrapStreamUrl(
            candidate,
            data.title || 'tiktok_video',
            isAudio,
            originalUrl,
            String(heightBucket)
          );
          if (wrapped && !fallbackUrls.includes(wrapped)) fallbackUrls.push(wrapped);
        }

        return {
          url: primaryRaw,
          fallbackUrls,
          title: data.title || `TikTok Video (@${data.author?.unique_id || 'tiktok'})`,
          thumbnail: data.cover || data.origin_cover,
          duration: data.duration,
          estimatedSize: chosenSize
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
          const prog = data.videoStreams
            .filter((s: any) => s.videoOnly === false && s.url)
            .sort((a: any, b: any) => {
              const ha = parseInt(String(a.quality || a.height || '720'), 10) || 720;
              const hb = parseInt(String(b.quality || b.height || '720'), 10) || 720;
              const aLe = ha <= requestedHeight ? 0 : 10000;
              const bLe = hb <= requestedHeight ? 0 : 10000;
              return aLe + Math.abs(requestedHeight - ha) - (bLe + Math.abs(requestedHeight - hb));
            });
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
          const sortedStreams = [...data.formatStreams].sort((a: any, b: any) => {
            const ha = parseInt(String(a.qualityLabel || a.resolution || '720'), 10) || 720;
            const hb = parseInt(String(b.qualityLabel || b.resolution || '720'), 10) || 720;
            const aLe = ha <= requestedHeight ? 0 : 10000;
            const bLe = hb <= requestedHeight ? 0 : 10000;
            return aLe + Math.abs(requestedHeight - ha) - (bLe + Math.abs(requestedHeight - hb));
          });
          for (const s of sortedStreams) {
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

  // 1. Primary Full-Stack Express Backend (/api/media/start + /api/media/status) on Web/Preview
  // (On standalone Android APK, skip dead Cloud Run and resolve directly via native CapacitorHttp + Local Proxy)
  if (!isCapacitorOrNative()) {
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
          onProgress?.(14);
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
          for (let attempt = 0; attempt < 110; attempt++) {
            const simulatedPrep = Math.min(92, 6 + attempt * 3);
            onProgress?.(simulatedPrep);
            await sleep(1100);
            try {
              const statusRes = await fetchBackendApi(`/api/media/status/${taskId}`);
              if (!statusRes.ok) continue;

              const statusData = await statusRes.json();
              if (typeof statusData.progress === 'number' && statusData.progress > 0) {
                onProgress?.(Math.min(98, Math.max(simulatedPrep, Math.round(statusData.progress))));
              }
              if (statusData.status === 'done') {
                onProgress?.(99);
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
  }

  // 2. TikTok Direct Stream API (Client/Native, strictly respects qualityLabel)
  if (isTikTok) {
    onProgress?.(8);
    const tikResolved = await resolveViaTikWM(originalUrl, mediaType, qualityLabel);
    if (tikResolved && tikResolved.url) {
      onProgress?.(14);
      const primary = isCapacitorOrNative()
        ? wrapWithNativeLocalProxy(tikResolved.url)
        : tikResolved.url;
      return {
        url: primary,
        fallbackUrls: [tikResolved.url, ...tikResolved.fallbackUrls].filter((u) => u && u !== primary),
        isRealExtracted: true,
        mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
        estimatedBytes: tikResolved.estimatedSize,
        title: tikResolved.title,
        thumbnail: tikResolved.thumbnail
      };
    }
  }

  // 2b. If preResolvedDirectUrl is already a concrete CDN or local proxy link, use it immediately
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
      raw,
      'media',
      isAudio,
      originalUrl,
      String(requestedHeight)
    );
    const useRawFirst = isCorsDirectCdnUrl(raw) && !getNativeLocalProxyUrl();
    return {
      url: useRawFirst ? raw : wrapped || raw,
      fallbackUrls: [raw, wrapped].filter((u) => Boolean(u)),
      isRealExtracted: true,
      mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
    };
  }

  const ytId = extractYouTubeVideoId(originalUrl);
  const igShortcode = extractInstagramShortcode(originalUrl);
  const isInstagram = Boolean(igShortcode || /(?:instagram\.com|instagr\.am)/i.test(originalUrl));
  const isFacebook = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(originalUrl);
  const tweetId = extractTwitterStatusId(originalUrl);

  // 2c. Fast Direct Instagram Embed Extraction on Android APK (< 1.5s response, zero queue delay)
  if (isInstagram && igShortcode && isCapacitorOrNative()) {
    try {
      onProgress?.(6);
      const embedUrl = `https://www.instagram.com/p/${igShortcode}/embed/captioned/`;
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
          if (decodedUrl.startsWith('http')) {
            onProgress?.(14);
            const proxiedIg = wrapWithNativeLocalProxy(decodedUrl);
            return {
              url: proxiedIg,
              fallbackUrls: [decodedUrl],
              isRealExtracted: true,
              mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
              thumbnail: getSafeThumbnail(`/api/media/thumbnail?ig=${igShortcode}`)
            };
          }
        }
      }
    } catch {
      // Fall through to SaveVideo below
    }
  }

  // 3. Direct SaveVideo Engine via smartFetchJson (Supports Long YouTube Videos 60+ min, Shorts, Instagram, Facebook)
  if (ytId || isInstagram || isFacebook || tweetId) {
    const normalizedTargetUrl = ytId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : isInstagram && igShortcode && !/\/stories\//i.test(originalUrl)
      ? `https://www.instagram.com/reel/${igShortcode}/`
      : originalUrl.split('?')[0] || originalUrl;

    const heightsToTry = ytId
      ? requestedHeight <= 360
        ? [360]
        : requestedHeight <= 480
        ? [480, 360]
        : requestedHeight <= 720
        ? [720, 480, 360]
        : Array.from(new Set([requestedHeight, 720, 360]))
      : [requestedHeight];

    for (const tryHeight of heightsToTry) {
      onProgress?.(4);
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
        timeoutMs: 12000
      });

      if (data && data.task_id) {
        // Poll up to 130 times so even 60-minute Long YouTube videos finish muxing cleanly!
        for (let attempt = 0; attempt < 130; attempt++) {
          const fallbackSimPrep = Math.min(92, 6 + attempt * 3);
          onProgress?.(fallbackSimPrep);
          await sleep(1100);
          const stData = await smartFetchJson(`https://savevideo.uz/api/status/${data.task_id}`, {
            method: 'GET',
            headers: { Referer: 'https://savevideo.uz/' },
            timeoutMs: 8000
          });
          if (!stData) continue;

          if (typeof stData.progress === 'number' && stData.progress > 0) {
            const mappedPrep = Math.min(98, Math.max(fallbackSimPrep, Math.round(stData.progress)));
            onProgress?.(mappedPrep);
          }

          if (stData.status === 'done') {
            const fileSize = typeof stData.file_size === 'number' ? stData.file_size : 0;
            const minRequired = isAudio ? MIN_VALID_AUDIO_BYTES : MIN_VALID_VIDEO_BYTES;
            if (fileSize > 0 && fileSize < minRequired) {
              break; // Reject corrupt/tiny file and try next resolution
            }
            onProgress?.(99);
            const resolvedTaskId = stData.task_id || data.task_id;
            const token = stData.file_token || '';
            const rawSaveVideoUrl = isAudio
              ? `https://savevideo.uz/api/audio/${resolvedTaskId}?t=${encodeURIComponent(token)}`
              : `https://savevideo.uz/api/file/${resolvedTaskId}?t=${encodeURIComponent(token)}`;

            const isNative = isCapacitorOrNative();
            const primaryStreamUrl = isNative
              ? wrapWithNativeLocalProxy(rawSaveVideoUrl)
              : getApiUrl(
                  isAudio
                    ? `/api/media/audio/${resolvedTaskId}?t=${encodeURIComponent(token)}&sourceUrl=${encodeURIComponent(
                        originalUrl
                      )}`
                    : `/api/media/file/${resolvedTaskId}?t=${encodeURIComponent(token)}&ext=${
                        stData.ext || 'mp4'
                      }&title=${encodeURIComponent(stData.title || 'video')}&sourceUrl=${encodeURIComponent(
                        originalUrl
                      )}`
                );

            const fallbackList = isNative
              ? [rawSaveVideoUrl].filter((u) => u !== primaryStreamUrl)
              : [
                  getApiUrl(
                    `/api/media/stream?url=${encodeURIComponent(originalUrl)}&quality=${tryHeight}&audio=${
                      isAudio ? '1' : '0'
                    }`
                  )
                ];

            return {
              url: primaryStreamUrl,
              fallbackUrls: fallbackList,
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

  // 4. Client/Native Engine for Twitter / X (FXTwitter & VXTwitter resolution-aware .mp4)
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
          const chosenMp4 =
            requestedHeight <= 360
              ? variants[variants.length - 1]?.url
              : requestedHeight <= 480
              ? variants[Math.min(1, variants.length - 1)]?.url
              : variants[0]?.url || videoItem.url;
          if (chosenMp4) {
            const wrapped = wrapStreamUrl(chosenMp4, tweet.text || `x_${tweetId}`, isAudio);
            const useProxyFirst = Boolean(getNativeLocalProxyUrl());
            return {
              url: useProxyFirst ? wrapped : chosenMp4,
              fallbackUrls: useProxyFirst ? [chosenMp4] : [wrapped],
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

  const candidateUrls: string[] = [];
  const addCandidate = (u?: string) => {
    if (u && u.trim() && !candidateUrls.includes(u.trim())) {
      candidateUrls.push(u.trim());
    }
  };

  const unwrapped = unwrapRawMediaUrl(targetUrl);
  const localProxyBase = getNativeLocalProxyUrl();

  if (localProxyBase) {
    // In Android APK: route any http/https stream through our Local Native Stream Proxy (127.0.0.1) first!
    if (targetUrl.startsWith('http://127.0.0.1:')) {
      addCandidate(targetUrl);
    }
    if (unwrapped && unwrapped.startsWith('http') && !unwrapped.includes('/api/media/')) {
      addCandidate(`${localProxyBase}/stream?url=${encodeURIComponent(unwrapped)}`);
      if (isCorsDirectCdnUrl(unwrapped)) {
        addCandidate(unwrapped);
      }
    }
  } else {
    const isBackendTarget =
      targetUrl.startsWith('/api/media/') || targetUrl.includes('/api/media/');
    if (isBackendTarget) {
      addCandidate(getApiUrl(targetUrl));
      if (unwrapped && unwrapped.startsWith('http') && !unwrapped.includes('savevideo.uz')) {
        addCandidate(unwrapped);
      }
    } else {
      addCandidate(targetUrl);
      const wrapped = wrapStreamUrl(targetUrl, 'media', isAudio);
      if (wrapped) {
        addCandidate(wrapped);
      }
    }
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
        if (
          (fetchUrl.includes('/api/media/') || fetchUrl.startsWith('http://127.0.0.1:')) &&
          !fetchUrl.includes('range=')
        ) {
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
