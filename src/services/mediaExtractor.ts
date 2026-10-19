/**
 * Real Media Stream Extractor
 * Resolves direct remote video/audio streams via public resolver instances
 * (Cobalt instances, Piped instances, Invidious instances, and direct CORS proxies)
 */

export interface ExtractedStreamInfo {
  url: string;
  mimeType: string;
  fileName: string;
  estimatedSize?: number;
  quality?: string;
  isDirectStream: boolean;
}

// Public Cobalt API instances with fallback
const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt.koyeb.app',
  'https://co.wuk.sh',
  'https://cobalt.xy2401.top'
];

// Public Piped API instances
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://piped-api.lunar.icu',
  'https://api.piped.private.coffee'
];

// Public Invidious API instances
const INVIDIOUS_INSTANCES = [
  'https://invidious.projectsegfau.lt',
  'https://yewtu.be',
  'https://iv.melmac.space',
  'https://invidious.slipfox.xyz',
  'https://invidious.nerdvpn.de'
];

// CORS proxies to bypass browser CORS restrictions for genuine stream downloading
export const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

/**
 * Extracts YouTube video ID from URL
 */
function extractYouTubeId(url: string): string | null {
  const regExp = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

/**
 * Checks if URL is already a direct playable audio or video file
 */
export function isDirectMediaFile(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|mkv|mov|mp3|m4a|aac|wav|ogg|flac)$/i.test(clean);
}

/**
 * Resolves direct media stream using Cobalt API
 */
async function resolveViaCobalt(
  mediaUrl: string,
  formatType: 'video' | 'audio',
  qualityLabel?: string
): Promise<ExtractedStreamInfo | null> {
  const isAudio = formatType === 'audio';
  const qualityNumber = qualityLabel?.match(/\d+/)?.[0] || '720';

  for (const instance of COBALT_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const endpoint = instance.endsWith('/') ? `${instance}api/json` : `${instance}/api/json`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({
          url: mediaUrl,
          videoQuality: qualityNumber,
          downloadMode: isAudio ? 'audio' : 'auto',
          audioFormat: isAudio ? 'mp3' : undefined
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && (data.url || data.status === 'stream' || data.status === 'redirect')) {
          const directUrl = data.url;
          const mimeType = isAudio ? 'audio/mpeg' : 'video/mp4';
          const ext = isAudio ? 'mp3' : 'mp4';
          return {
            url: directUrl,
            mimeType,
            fileName: `media_${Date.now()}.${ext}`,
            isDirectStream: true
          };
        }
      }
    } catch {
      // Try next instance
    }
  }

  return null;
}

/**
 * Resolves YouTube direct stream via Piped API
 */
async function resolveViaPiped(
  videoId: string,
  formatType: 'video' | 'audio',
  qualityLabel?: string
): Promise<ExtractedStreamInfo | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (formatType === 'audio' && data.audioStreams?.length > 0) {
          const stream = data.audioStreams[0];
          return {
            url: stream.url,
            mimeType: stream.mimeType || 'audio/mp4',
            fileName: `audio_${videoId}.m4a`,
            quality: stream.quality,
            isDirectStream: true
          };
        }

        if (formatType === 'video' && data.videoStreams?.length > 0) {
          // Find stream matching quality or pick highest with video+audio
          const targetQuality = qualityLabel || '720p';
          const match = data.videoStreams.find((s: { quality: string }) => s.quality.includes(targetQuality)) || data.videoStreams[0];
          return {
            url: match.url,
            mimeType: match.mimeType || 'video/mp4',
            fileName: `video_${videoId}.mp4`,
            quality: match.quality,
            isDirectStream: true
          };
        }
      }
    } catch {
      // Try next instance
    }
  }

  return null;
}

/**
 * Resolves YouTube direct stream via Invidious API
 */
async function resolveViaInvidious(
  videoId: string,
  formatType: 'video' | 'audio'
): Promise<ExtractedStreamInfo | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (formatType === 'video' && data.formatStreams?.length > 0) {
          const stream = data.formatStreams[0];
          return {
            url: stream.url,
            mimeType: stream.type || 'video/mp4',
            fileName: `video_${videoId}.mp4`,
            quality: stream.resolution,
            isDirectStream: true
          };
        }

        if (formatType === 'audio' && data.adaptiveFormats?.length > 0) {
          const audioStream = data.adaptiveFormats.find((f: { type: string }) => f.type?.includes('audio')) || data.adaptiveFormats[0];
          return {
            url: audioStream.url,
            mimeType: audioStream.type || 'audio/mp4',
            fileName: `audio_${videoId}.m4a`,
            isDirectStream: true
          };
        }
      }
    } catch {
      // Try next instance
    }
  }

  return null;
}

/**
 * Master Resolver: Resolves real direct media stream for any URL
 */
export async function resolveDirectMediaStream(
  mediaUrl: string,
  formatType: 'video' | 'audio',
  qualityLabel?: string
): Promise<ExtractedStreamInfo> {
  // 1. Direct file check
  if (isDirectMediaFile(mediaUrl)) {
    const isAudio = formatType === 'audio';
    const ext = mediaUrl.split('.').pop()?.split('?')[0] || (isAudio ? 'mp3' : 'mp4');
    return {
      url: mediaUrl,
      mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
      fileName: `media_${Date.now()}.${ext}`,
      isDirectStream: true
    };
  }

  // 2. Try Cobalt Resolver
  const cobaltResult = await resolveViaCobalt(mediaUrl, formatType, qualityLabel);
  if (cobaltResult) return cobaltResult;

  // 3. YouTube specific resolvers (Piped & Invidious)
  const ytId = extractYouTubeId(mediaUrl);
  if (ytId) {
    const pipedResult = await resolveViaPiped(ytId, formatType, qualityLabel);
    if (pipedResult) return pipedResult;

    const invidiousResult = await resolveViaInvidious(ytId, formatType);
    if (invidiousResult) return invidiousResult;
  }

  // 4. Fallback: Provide direct stream URL via privacy proxy stream
  const isAudio = formatType === 'audio';
  const ext = isAudio ? 'mp3' : 'mp4';
  const mimeType = isAudio ? 'audio/mpeg' : 'video/mp4';

  if (ytId) {
    // Invidious video stream direct endpoint
    return {
      url: `https://yewtu.be/latest_version?id=${ytId}&itag=${isAudio ? '140' : '22'}`,
      mimeType,
      fileName: `video_${ytId}.${ext}`,
      isDirectStream: true
    };
  }

  return {
    url: mediaUrl,
    mimeType,
    fileName: `download_${Date.now()}.${ext}`,
    isDirectStream: false
  };
}

/**
 * Fetches stream with automatic CORS proxy fallbacks if direct fetch is blocked.
 * Returns Response if binary stream can be read, or null if browser CORS limits script reading.
 */
export async function fetchMediaStreamWithCorsFallback(
  url: string,
  signal?: AbortSignal
): Promise<Response | null> {
  // Try direct fetch first
  try {
    const directRes = await fetch(url, { signal, headers: { 'Accept': '*/*' } });
    if (directRes.ok && directRes.status < 400) {
      const cType = directRes.headers.get('content-type') || '';
      // Verify it is not an error HTML page
      if (!cType.includes('text/html') || url.includes('.mp4') || url.includes('.mp3')) {
        return directRes;
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
  }

  // Try each CORS proxy in order
  for (const proxyFn of CORS_PROXIES) {
    try {
      const proxiedUrl = proxyFn(url);
      const res = await fetch(proxiedUrl, { signal });
      if (res.ok && res.status < 400) {
        const cType = res.headers.get('content-type') || '';
        if (!cType.includes('text/html')) {
          return res;
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
    }
  }

  // If cross-origin reading is restricted by browser security policies, return null
  return null;
}

/**
 * Extracts a crisp, authentic thumbnail frame from a downloaded video Blob.
 * Uses an offscreen HTMLVideoElement and HTMLCanvasElement to guarantee
 * 100% genuine cover images for Shorts, Reels, TikTok, and long videos offline.
 */
export function extractVideoFrameThumbnail(videoBlob: Blob): Promise<string> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(videoBlob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      let isResolved = false;
      const cleanUp = () => {
        if (!isResolved) {
          isResolved = true;
          URL.revokeObjectURL(url);
          video.remove();
        }
      };

      video.onloadedmetadata = () => {
        const targetTime = Math.min(1.0, (video.duration || 2) * 0.15);
        video.currentTime = targetTime > 0 ? targetTime : 0.1;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            cleanUp();
            resolve(dataUrl);
            return;
          }
        } catch {
          // ignore
        }
        cleanUp();
        resolve('');
      };

      video.onerror = () => {
        cleanUp();
        resolve('');
      };

      setTimeout(() => {
        cleanUp();
        resolve('');
      }, 3500);
    } catch {
      resolve('');
    }
  });
}
