import { MediaType } from '../types';
import {
  extractAparatHash,
  extractInstagramShortcode,
  extractTwitterStatusId,
  extractYouTubeVideoId,
  isCapacitorOrNative
} from './platformDetector';

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

export function unwrapRawMediaUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/api/media/proxy-stream')) {
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
  return url;
}

export const CORS_PROXIES = [
  (targetUrl: string) => {
    if (isCapacitorOrNative() || targetUrl.startsWith('/api/')) return targetUrl;
    return `/api/media/proxy-stream?url=${encodeURIComponent(targetUrl)}`;
  },
  (targetUrl: string) => unwrapRawMediaUrl(targetUrl),
  (targetUrl: string) => {
    const raw = unwrapRawMediaUrl(targetUrl);
    return raw.startsWith('http')
      ? `https://corsproxy.io/?${encodeURIComponent(raw)}`
      : targetUrl;
  },
  (targetUrl: string) => {
    const raw = unwrapRawMediaUrl(targetUrl);
    return raw.startsWith('http')
      ? `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(raw)}`
      : targetUrl;
  },
  (targetUrl: string) => {
    const raw = unwrapRawMediaUrl(targetUrl);
    return raw.startsWith('http')
      ? `https://api.allorigins.win/raw?url=${encodeURIComponent(raw)}`
      : targetUrl;
  }
];

export interface ResolvedStreamInfo {
  url: string;
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

function wrapStreamUrl(
  rawUrl: string,
  title?: string,
  isAudio?: boolean,
  sourceUrl?: string,
  quality?: string
): string {
  if (!rawUrl) return '';
  if (
    isCapacitorOrNative() ||
    rawUrl.startsWith('/api/') ||
    rawUrl.startsWith('blob:')
  ) {
    return rawUrl;
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
  return built;
}

export interface AparatResolvedStream {
  url: string;
  rawUrl: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  estimatedSize?: number;
  formatsMap?: Record<string, string>;
}

/**
 * Direct Aparat Resolver via Official v1 API:
 * https://www.aparat.com/api/fa/v1/video/video/show/videohash/[UID]
 * Extracts json.data.attributes.file_link_all (360p, 480p, 720p, 1080p) with automatic CORS proxy fallback.
 */
export async function resolveViaAparat(
  originalUrl: string,
  qualityLabel?: string,
  isAudio = false
): Promise<AparatResolvedStream | null> {
  const aparatHash = extractAparatHash(originalUrl);
  if (!aparatHash) return null;

  const requestedHeight = String(parseRequestedHeight(qualityLabel));

  // 1. On Web/Server mode, try our Express /api/media/start endpoint first (zero-CORS, sets Referer: https://www.aparat.com/)
  if (!isCapacitorOrNative()) {
    try {
      const startRes = await fetch('/api/media/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: originalUrl,
          height: Number(requestedHeight) || 720,
          audio: isAudio
        })
      });
      if (startRes.ok) {
        const startData = await startRes.json();
        if (startData && startData.direct_url) {
          const rawUrl = String(startData.direct_url);
          return {
            url: wrapStreamUrl(
              rawUrl,
              startData.title || `aparat_${aparatHash}`,
              isAudio,
              originalUrl,
              requestedHeight
            ),
            rawUrl,
            title: startData.title,
            thumbnail: startData.thumbnail,
            estimatedSize: startData.file_size
          };
        }
      }
    } catch {
      // Fall through to direct v1 API with CORS proxy fallback
    }
  }

  // 2. Direct Official v1 API + Stable CORS Proxy Fallback
  const v1Api = `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${aparatHash}`;
  const legacyApi = `https://www.aparat.com/etc/api/video/videohash/${aparatHash}`;
  const candidateApis = [
    v1Api,
    `https://corsproxy.io/?${encodeURIComponent(v1Api)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(v1Api)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(v1Api)}`,
    legacyApi,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(legacyApi)}`
  ];

  for (const ep of candidateApis) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7500);
      const res = await fetch(ep, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const json = await res.json();
      const attrs = json?.data?.attributes || json?.video;
      if (!attrs) continue;

      const formatsMap: Record<string, string> = {};
      if (Array.isArray(attrs.file_link_all)) {
        for (const item of attrs.file_link_all) {
          const hMatch = String(item.profile || item.text || '').match(/(\d{3,4})/);
          const u = Array.isArray(item.urls) ? item.urls[0] : item.url;
          if (hMatch && u) {
            formatsMap[hMatch[1]] = u;
          }
        }
      }

      const safeFileLink =
        typeof attrs.file_link === 'string' && attrs.file_link.includes('.mp4')
          ? attrs.file_link
          : undefined;

      const chosenRaw =
        formatsMap[requestedHeight] ||
        formatsMap['1080'] ||
        formatsMap['720'] ||
        formatsMap['480'] ||
        formatsMap['360'] ||
        formatsMap['240'] ||
        formatsMap['144'] ||
        safeFileLink;

      if (chosenRaw) {
        const dur = Number(attrs.duration) || 120;
        const estBytes = Math.round(dur * (Number(requestedHeight) >= 720 ? 220000 : 120000));
        return {
          url: wrapStreamUrl(
            chosenRaw,
            attrs.title || `aparat_${aparatHash}`,
            isAudio,
            originalUrl,
            requestedHeight
          ),
          rawUrl: chosenRaw,
          title: attrs.title,
          thumbnail: attrs.big_poster || attrs.medium_poster || attrs.med_poster || attrs.small_poster,
          duration: dur,
          estimatedSize: estBytes,
          formatsMap
        };
      }
    } catch {
      // Try next endpoint
    }
  }

  return null;
}

export interface TikWMResolvedStream {
  url: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  estimatedSize?: number;
}

/**
 * Direct No-Watermark TikTok Stream Resolver via TikWM API
 */
export async function resolveViaTikWM(
  originalUrl: string,
  mediaType: MediaType
): Promise<TikWMResolvedStream | null> {
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(originalUrl)}&hd=1`;
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.code === 0 && json.data) {
      const data = json.data;
      const isAudio = mediaType === 'audio';
      const directMediaUrl = isAudio
        ? data.music || `https://www.tikwm.com/video/media/play/${data.id}.mp4`
        : data.id
        ? `https://www.tikwm.com/video/media/play/${data.id}.mp4`
        : data.hdplay || data.play;

      if (directMediaUrl) {
        return {
          url: wrapStreamUrl(directMediaUrl, data.title || 'tiktok_video', isAudio),
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
 * Resolves the real downloadable media stream for YouTube, Shorts, Aparat, Instagram, TikTok, Twitter/X, Facebook, and global platforms.
 * Zero mock or dummy fallback videos are used.
 */
export async function resolveDirectMediaStream(
  originalUrl: string,
  mediaType: MediaType,
  qualityLabel?: string,
  preResolvedDirectUrl?: string
): Promise<ResolvedStreamInfo> {
  const isAudio = mediaType === 'audio';
  const requestedHeight = parseRequestedHeight(qualityLabel);

  // 0. If the format already has a real extracted direct stream URL (e.g. from /api/media/probe for Aparat, Instagram, TikTok, X)
  if (preResolvedDirectUrl && preResolvedDirectUrl.trim()) {
    return {
      url: wrapStreamUrl(preResolvedDirectUrl.trim(), 'media', isAudio),
      isRealExtracted: true,
      mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
    };
  }

  // 0b. If the user pasted a direct .mp4 / .mp3 / .webm file link
  if (/\.(mp4|mp3|m4a|webm|wav|ogg|mov)(\?.*)?$/i.test(originalUrl)) {
    return {
      url: wrapStreamUrl(originalUrl, 'direct_media', isAudio),
      isRealExtracted: true,
      mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
    };
  }

  // 1. Primary Engine: Our Full-Stack Express Backend (/api/media/start + /api/media/status)
  if (!isCapacitorOrNative()) {
    try {
      const startRes = await fetch('/api/media/start', {
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

        // Direct instant resolution (Aparat, Instagram, Twitter/X, TikTok, yt-dlp, OpenGraph)
        if (startData.status === 'done' && startData.direct_url) {
          return {
            url: wrapStreamUrl(startData.direct_url, startData.title || 'media', isAudio),
            isRealExtracted: true,
            mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
            estimatedBytes: startData.file_size,
            title: startData.title,
            thumbnail: startData.thumbnail
          };
        }

        const taskId = startData.task_id;
        if (taskId) {
          for (let attempt = 0; attempt < 25; attempt++) {
            await sleep(1200);
            const statusRes = await fetch(`/api/media/status/${taskId}`);
            if (!statusRes.ok) continue;

            const statusData = await statusRes.json();
            if (statusData.status === 'done') {
              const token = statusData.file_token || '';
              const ext = isAudio ? 'mp3' : statusData.ext || 'mp4';
              const streamEndpoint = isAudio
                ? `/api/media/audio/${taskId}?t=${encodeURIComponent(token)}`
                : `/api/media/file/${taskId}?t=${encodeURIComponent(token)}&ext=${ext}&title=${encodeURIComponent(
                    statusData.title || 'video'
                  )}`;

              return {
                url: streamEndpoint,
                isRealExtracted: true,
                mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
                estimatedBytes: statusData.file_size,
                title: statusData.title,
                thumbnail: statusData.thumbnail
              };
            } else if (statusData.status === 'error') {
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Backend media resolver fallback:', err);
    }
  }

  // 2. Client-Side Engine for Aparat (aparat.com/v/{hash}) via Official v1 API
  const aparatHash = extractAparatHash(originalUrl);
  if (aparatHash) {
    const v1Api = `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${aparatHash}`;
    const legacyApi = `https://www.aparat.com/etc/api/video/videohash/${aparatHash}`;
    const endpoints = [
      v1Api,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(v1Api)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(v1Api)}`,
      legacyApi,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(legacyApi)}`
    ];
    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7500);
        const res = await fetch(ep, {
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) continue;
        const json = await res.json();
        const v = json?.data?.attributes || json?.video;
        if (v && (v.file_link_all || v.file_link || v.hls_link)) {
          const formatsMap: Record<string, string> = {};
          if (Array.isArray(v.file_link_all)) {
            for (const item of v.file_link_all) {
              const hMatch = String(item.profile || item.text || '').match(/(\d{3,4})/);
              const u = Array.isArray(item.urls) ? item.urls[0] : item.url;
              if (hMatch && u) formatsMap[hMatch[1]] = u;
            }
          }
          const chosenUrl =
            formatsMap[String(requestedHeight)] ||
            formatsMap['1080'] ||
            formatsMap['720'] ||
            formatsMap['480'] ||
            formatsMap['360'] ||
            v.file_link ||
            v.hls_link;
          if (chosenUrl) {
            return {
              url: wrapStreamUrl(chosenUrl, v.title || 'aparat_video', isAudio),
              isRealExtracted: true,
              mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
              title: v.title,
              thumbnail: v.big_poster || v.medium_poster || v.med_poster || v.small_poster
            };
          }
        }
      } catch {
        // try next endpoint
      }
    }
  }

  // 3. Client-Side Engine for Instagram (instagram.com/reel/..., /p/..., /tv/...)
  const igShortcode = extractInstagramShortcode(originalUrl);
  if (igShortcode) {
    // 3a. Try DDInstagram JSON/OpenGraph via CORS proxy
    const ddEmbedUrl = `https://www.instagram.com/p/${igShortcode}/embed/captioned/`;
    const scrapeUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(ddEmbedUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(ddEmbedUrl)}`
    ];
    for (const ep of scrapeUrls) {
      try {
        const res = await fetch(ep);
        if (!res.ok) continue;
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
            url: wrapStreamUrl(decodedUrl, `instagram_${igShortcode}`, isAudio),
            isRealExtracted: true,
            mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
          };
        }
      } catch {
        // continue
      }
    }
  }

  // 4. Client-Side Engine for Twitter / X (twitter.com / x.com)
  const tweetId = extractTwitterStatusId(originalUrl);
  if (tweetId) {
    for (const apiUrl of [
      `https://api.vxtwitter.com/Twitter/status/${tweetId}`,
      `https://api.fxtwitter.com/status/${tweetId}`
    ]) {
      try {
        const res = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const data = await res.json();
        const tweet = data?.tweet || data;
        const mediaList = tweet?.media_extended || tweet?.media?.videos || [];
        const videoItem = Array.isArray(mediaList)
          ? mediaList.find((m: any) => m.type === 'video' || m.type === 'gif' || (m.url && m.url.includes('.mp4')))
          : null;
        if (videoItem && videoItem.url) {
          return {
            url: wrapStreamUrl(videoItem.url, tweet.text || `x_${tweetId}`, isAudio),
            isRealExtracted: true,
            mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
            title: tweet.text,
            thumbnail: videoItem.thumbnail_url
          };
        }
      } catch {
        // continue
      }
    }
  }

  // 5. Client-Side Engine for TikTok (TikWM Direct No-Watermark API)
  const isTikTok = /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(originalUrl);
  if (isTikTok) {
    try {
      const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(originalUrl)}&hd=1`);
      if (tikRes.ok) {
        const tikJson = await tikRes.json();
        if (tikJson && tikJson.code === 0 && tikJson.data) {
          const d = tikJson.data;
          const directMediaUrl = isAudio
            ? d.music || `https://www.tikwm.com/video/media/play/${d.id}.mp4`
            : d.id
            ? `https://www.tikwm.com/video/media/play/${d.id}.mp4`
            : d.hdplay || d.play;
          if (directMediaUrl) {
            return {
              url: wrapStreamUrl(directMediaUrl, d.title || 'tiktok_video', isAudio),
              isRealExtracted: true,
              mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
              estimatedBytes: d.size || d.hd_size || 4500000,
              title: d.title,
              thumbnail: d.cover
            };
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  // 6. Client-Side Engine for YouTube: Piped & Invidious APIs
  const ytId = extractYouTubeVideoId(originalUrl);
  if (ytId) {
    for (const instance of PIPED_INSTANCES) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${instance}/streams/${ytId}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) continue;
        const data = await res.json();

        if (isAudio && Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
          const sorted = [...data.audioStreams].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          const bestAudio = sorted.find((s) => s.mimeType?.includes('mp4') || s.mimeType?.includes('mpeg')) || sorted[0];
          if (bestAudio?.url) {
            return {
              url: wrapStreamUrl(bestAudio.url, data.title || 'youtube_audio', true),
              isRealExtracted: true,
              mimeType: bestAudio.mimeType || 'audio/mp4',
              estimatedBytes: bestAudio.contentLength ? Number(bestAudio.contentLength) : undefined,
              title: data.title,
              thumbnail: data.thumbnailUrl
            };
          }
        }

        if (!isAudio && Array.isArray(data.videoStreams) && data.videoStreams.length > 0) {
          const progressiveStreams = data.videoStreams.filter((s: any) => s.videoOnly === false && s.url);
          const pool = progressiveStreams.length > 0 ? progressiveStreams : data.videoStreams.filter((s: any) => s.url);
          if (pool.length > 0) {
            const matched =
              pool.find((s: any) => s.quality?.includes(String(requestedHeight))) ||
              pool.find((s: any) => s.quality?.includes('720')) ||
              pool.find((s: any) => s.quality?.includes('480')) ||
              pool[0];
            if (matched?.url) {
              return {
                url: wrapStreamUrl(matched.url, data.title || 'youtube_video', false),
                isRealExtracted: true,
                mimeType: matched.mimeType || 'video/mp4',
                estimatedBytes: matched.contentLength ? Number(matched.contentLength) : undefined,
                title: data.title,
                thumbnail: data.thumbnailUrl
              };
            }
          }
        }
      } catch {
        // try next Piped instance
      }
    }

    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${instance}/api/v1/videos/${ytId}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) continue;
        const data = await res.json();

        if (!isAudio && Array.isArray(data.formatStreams) && data.formatStreams.length > 0) {
          const best =
            data.formatStreams.find((s: any) => s.qualityLabel?.includes(String(requestedHeight))) ||
            data.formatStreams.find((s: any) => s.qualityLabel?.includes('720')) ||
            data.formatStreams[0];
          if (best?.url) {
            return {
              url: wrapStreamUrl(best.url, data.title || 'youtube_video', false),
              isRealExtracted: true,
              mimeType: 'video/mp4',
              title: data.title
            };
          }
        }

        if (isAudio && Array.isArray(data.adaptiveFormats) && data.adaptiveFormats.length > 0) {
          const audioTracks = data.adaptiveFormats.filter((f: any) => f.type?.startsWith('audio/'));
          if (audioTracks.length > 0 && audioTracks[0].url) {
            return {
              url: wrapStreamUrl(audioTracks[0].url, data.title || 'youtube_audio', true),
              isRealExtracted: true,
              mimeType: 'audio/mp4',
              title: data.title
            };
          }
        }
      } catch {
        // try next Invidious instance
      }
    }
  }

  // 7. Universal Multi-Platform Engine: Cobalt API (Instagram, TikTok, X/Twitter, Facebook, Vimeo, SoundCloud)
  for (const cobaltBase of COBALT_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${cobaltBase}/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: originalUrl,
          videoQuality: String(requestedHeight),
          downloadMode: isAudio ? 'audio' : 'auto',
          audioFormat: 'mp3'
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const streamUrl = data.url || data.audio;
        if (streamUrl && typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
          return {
            url: wrapStreamUrl(streamUrl, data.filename || 'media', isAudio),
            isRealExtracted: true,
            mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
          };
        }
      }
    } catch {
      // try next Cobalt instance
    }
  }

  return {
    url: '',
    isRealExtracted: false,
    mimeType: isAudio ? 'audio/mpeg' : 'video/mp4'
  };
}

/**
 * Validates that a response has a genuine media Content-Type (video/*, audio/*, application/octet-stream)
 * and is NOT an HTML webpage or JSON error payload.
 */
function isGenuineMediaResponse(res: Response, isRangeRequest = false): boolean {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain')) {
    return false;
  }
  if (!isRangeRequest && res.status !== 206) {
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl > 0 && cl < 15000) {
      return false;
    }
  }
  return true;
}

/**
 * Probes the media stream with a HEAD request first to check `Accept-Ranges: bytes`
 * and `Content-Length` before splitting into 4 to 8 parallel Range chunks.
 */
export async function probeHeadAndRangeSupport(
  targetUrl: string,
  signal?: AbortSignal
): Promise<{ acceptsRanges: boolean; contentLength: number }> {
  if (!targetUrl) {
    return { acceptsRanges: false, contentLength: 0 };
  }

  const candidates =
    targetUrl.startsWith('/api/media/') && !isCapacitorOrNative()
      ? [targetUrl, unwrapRawMediaUrl(targetUrl)]
      : CORS_PROXIES.map((fn) => fn(targetUrl));

  for (const candidateUrl of candidates) {
    if (!candidateUrl) continue;
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const headRes = await fetch(candidateUrl, {
        method: 'HEAD',
        signal,
        credentials: 'omit'
      });
      if (headRes.ok || headRes.status === 206) {
        const acceptRanges = (headRes.headers.get('accept-ranges') || '').toLowerCase();
        const exposeHeaders = (headRes.headers.get('access-control-expose-headers') || '').toLowerCase();
        const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
        const contentRange = headRes.headers.get('content-range') || '';
        const crMatch = contentRange.match(/\/(\d+)$/);
        const totalSize = crMatch ? parseInt(crMatch[1], 10) : contentLength;

        if (totalSize > 0) {
          const supportsRange =
            acceptRanges.includes('bytes') ||
            exposeHeaders.includes('range') ||
            headRes.status === 206 ||
            Boolean(crMatch) ||
            candidateUrl.startsWith('/api/media/') ||
            candidateUrl.includes('cdn.asset.aparat.com');

          return {
            acceptsRanges: supportsRange,
            contentLength: totalSize
          };
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  return { acceptsRanges: false, contentLength: 0 };
}

/**
 * Fetches the resolved real media stream with automatic CORS proxy fallback
 * Supports HTTP Range headers (`Range: bytes=start-end`) for parallel multi-segment downloads.
 */
export async function fetchMediaStreamWithCorsFallback(
  targetUrl: string,
  signal?: AbortSignal,
  customHeaders?: Record<string, string>
): Promise<Response> {
  if (!targetUrl) {
    throw new Error('لینک مستقیم ویدیو استخراج نشد. لطفاً از صحت لینک اطمینان حاصل کنید.');
  }

  const isRange = Boolean(customHeaders && (customHeaders['Range'] || customHeaders['range']));

  if (targetUrl.startsWith('/api/media/') && !isCapacitorOrNative()) {
    try {
      const res = await fetch(targetUrl, {
        signal,
        headers: customHeaders,
        credentials: 'omit'
      });
      if ((res.ok || res.status === 206) && res.body && isGenuineMediaResponse(res, isRange)) {
        return res;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  let lastError: unknown;
  for (const buildProxyUrl of CORS_PROXIES) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const candidateUrl = buildProxyUrl(targetUrl);
    if (!candidateUrl || (isCapacitorOrNative() && candidateUrl.startsWith('/api/'))) continue;
    try {
      const res = await fetch(candidateUrl, {
        signal,
        headers: customHeaders,
        credentials: 'omit'
      });
      if ((res.ok || res.status === 206) && res.body && isGenuineMediaResponse(res, isRange)) {
        return res;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('خطا در دریافت استریم مستقیم مدیا از سرور مبدأ');
}
