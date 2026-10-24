import { FormatOption, ParsedMediaInfo, PlatformId } from '../types';

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
    url: 'https://www.instagram.com/reel/C5X9_abc123/'
  }
];

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
    const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i;
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

export function extractAparatHash(url: string): string | null {
  if (!url) return null;
  const cleaned = url.trim();
  const match =
    cleaned.match(/aparat\.com\/(?:v|embed)\/([A-Za-z0-9]{4,16})(?:[/?#&]|$)/i) ||
    cleaned.match(/aparat\.com\/video\/video\/embed\/videohash\/([A-Za-z0-9]{4,16})(?:[/?#&]|$)/i) ||
    cleaned.match(/videohash\/([A-Za-z0-9]{4,16})(?:[/?#&]|$)/i) ||
    cleaned.match(/aparat\.com\/(?:v|embed)\/([A-Za-z0-9_-]+)/i) ||
    cleaned.match(/aparat\.com\/.*\/([A-Za-z0-9]{4,12})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

export function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/(?:instagram\.com|instagr\.am)\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

export function extractTwitterStatusId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:[^/]+)\/status\/(\d+)/i);
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
  probedHeights?: number[],
  probedEst?: Record<string, number>,
  audioEst?: number,
  formatsMap?: Record<string, string>,
  directVideoUrl?: string,
  directAudioUrl?: string
): FormatOption[] {
  const calcBytes = (kbps: number) => Math.round(((kbps * 1000) / 8) * Math.max(durationSeconds, 30));

  const allVideoDefinitions: {
    height: number;
    id: string;
    format: 'mp4' | 'webm';
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
      height: 2160,
      id: 'v-4k-60',
      format: 'mp4',
      qualityLabel: '4K Ultra HD (2160p)',
      resolution: '3840x2160',
      fps: 60,
      vCodec: 'AV01 (AV1 10-bit)',
      aCodec: 'AAC-LC 320k',
      bitrate: '24.5 Mbps',
      isHdr: true,
      defaultKbps: 18500
    },
    {
      height: 1440,
      id: 'v-2k-60',
      format: 'mp4',
      qualityLabel: '2K QHD (1440p)',
      resolution: '2560x1440',
      fps: 60,
      vCodec: 'VP9.2 HDR',
      aCodec: 'Opus 256k',
      bitrate: '12.0 Mbps',
      isHdr: true,
      defaultKbps: 9800
    },
    {
      height: 1080,
      id: 'v-1080p',
      format: 'mp4',
      qualityLabel: '1080p Full HD',
      resolution: '1920x1080',
      fps: 60,
      vCodec: 'AVC1 (H.264 High)',
      aCodec: 'AAC-LC 256k',
      bitrate: '5.8 Mbps',
      isHdr: false,
      defaultKbps: 4800
    },
    {
      height: 720,
      id: 'v-720p',
      format: 'mp4',
      qualityLabel: '720p HD Ready',
      resolution: '1280x720',
      fps: 30,
      vCodec: 'AVC1 (H.264 Main)',
      aCodec: 'AAC-LC 192k',
      bitrate: '2.6 Mbps',
      isHdr: false,
      defaultKbps: 2400
    },
    {
      height: 480,
      id: 'v-480p',
      format: 'mp4',
      qualityLabel: '480p Standard',
      resolution: '854x480',
      fps: 30,
      vCodec: 'AVC1 (H.264)',
      aCodec: 'AAC-LC 128k',
      bitrate: '1.2 Mbps',
      isHdr: false,
      defaultKbps: 1150
    },
    {
      height: 360,
      id: 'v-360p',
      format: 'mp4',
      qualityLabel: '360p Eco Saver',
      resolution: '640x360',
      fps: 30,
      vCodec: 'AVC1 (H.264)',
      aCodec: 'AAC-LC 96k',
      bitrate: '700 kbps',
      isHdr: false,
      defaultKbps: 650
    },
    {
      height: 240,
      id: 'v-240p',
      format: 'mp4',
      qualityLabel: '240p Low Data',
      resolution: '426x240',
      fps: 30,
      vCodec: 'AVC1 (H.264)',
      aCodec: 'AAC-LC 64k',
      bitrate: '400 kbps',
      isHdr: false,
      defaultKbps: 380
    }
  ];

  const filteredDefs =
    probedHeights && probedHeights.length > 0
      ? allVideoDefinitions.filter((d) => probedHeights.includes(d.height))
      : allVideoDefinitions.filter((d) => [1080, 720, 480, 360].includes(d.height));

  const finalVideoDefs =
    filteredDefs.length > 0
      ? filteredDefs
      : allVideoDefinitions.filter((d) => [1080, 720, 480, 360].includes(d.height));

  const videoFormats: FormatOption[] = finalVideoDefs.map((def) => {
    const estSize = probedEst?.[String(def.height)] || calcBytes(def.defaultKbps);
    const matchedDirectUrl =
      formatsMap?.[String(def.height)] ||
      directVideoUrl;

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

  const mp3Size320 = audioEst || calcBytes(320);
  const m4aSize256 = calcBytes(256);
  const mp3Size128 = calcBytes(128);
  const resolvedAudioDirect = directAudioUrl || directVideoUrl;

  const audioFormats: FormatOption[] = [
    {
      id: 'a-mp3-320',
      type: 'audio',
      format: 'mp3',
      qualityLabel: '320 kbps Studio Master',
      aCodec: 'LAME MP3 CBR',
      bitrate: '320 kbps',
      channels: 'Stereo 2.0 (48kHz)',
      estimatedSizeBytes: mp3Size320,
      estimatedSizeFormatted: formatBytes(mp3Size320),
      directUrl: resolvedAudioDirect
    },
    {
      id: 'a-m4a-256',
      type: 'audio',
      format: 'm4a',
      qualityLabel: '256 kbps Apple AAC',
      aCodec: 'AAC-LC VBR',
      bitrate: '256 kbps',
      channels: 'Stereo 2.0 (44.1kHz)',
      estimatedSizeBytes: m4aSize256,
      estimatedSizeFormatted: formatBytes(m4aSize256),
      directUrl: resolvedAudioDirect
    },
    {
      id: 'a-mp3-128',
      type: 'audio',
      format: 'mp3',
      qualityLabel: '128 kbps Standard Audio',
      aCodec: 'MP3 Joint Stereo',
      bitrate: '128 kbps',
      channels: 'Stereo 2.0',
      estimatedSizeBytes: mp3Size128,
      estimatedSizeFormatted: formatBytes(mp3Size128),
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
 * Helper: Client-side Aparat API resolver using official v1 API
 * (`https://www.aparat.com/api/fa/v1/video/video/show/videohash/[UID]`)
 */
async function probeAparatClientSide(url: string): Promise<{
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  viewsCount?: string;
  heights: number[];
  est: Record<string, number>;
  formatsMap: Record<string, string>;
  directVideoUrl: string;
} | null> {
  const hash = extractAparatHash(url);
  if (!hash) return null;

  const v1Api = `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${hash}`;
  const legacyApi = `https://www.aparat.com/etc/api/video/videohash/${hash}`;
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
        const heights: number[] = [];
        const est: Record<string, number> = {};
        const duration = Number(v.duration) || 120;

        if (Array.isArray(v.file_link_all)) {
          for (const item of v.file_link_all) {
            const profileStr = String(item.profile || item.text || '');
            const hMatch = profileStr.match(/(\d{3,4})/);
            const urlCandidate = Array.isArray(item.urls) ? item.urls[0] : item.url;
            if (hMatch && urlCandidate) {
              const h = parseInt(hMatch[1], 10);
              if (!heights.includes(h)) heights.push(h);
              formatsMap[String(h)] = urlCandidate;
              const bitrateKbps = h >= 1080 ? 2800 : h >= 720 ? 1500 : h >= 480 ? 850 : 520;
              est[String(h)] = Math.round(((bitrateKbps * 1000) / 8) * duration);
            }
          }
        }

        heights.sort((a, b) => a - b);
        const safeFileLink =
          typeof v.file_link === 'string' && v.file_link.includes('.mp4')
            ? v.file_link
            : undefined;
        const bestVideoUrl =
          formatsMap['1080'] ||
          formatsMap['720'] ||
          formatsMap['480'] ||
          formatsMap['360'] ||
          formatsMap['240'] ||
          formatsMap['144'] ||
          formatsMap[String(heights[heights.length - 1])] ||
          safeFileLink;

        if (bestVideoUrl) {
          if (heights.length === 0) {
            heights.push(480, 720);
            formatsMap['720'] = bestVideoUrl;
            formatsMap['480'] = bestVideoUrl;
          }
          const rawPoster =
            v.big_poster || v.medium_poster || v.med_poster || v.small_poster || '';
          return {
            title: v.title || `ویدیو آپارات (${hash})`,
            author: v.sender_name || v.owner_username || v.username || 'Aparat',
            duration,
            thumbnail: rawPoster,
            viewsCount:
              v.visit_cnt_non_formatted || v.visit_cnt
                ? String(v.visit_cnt_non_formatted || v.visit_cnt)
                : undefined,
            heights,
            est,
            formatsMap,
            directVideoUrl: bestVideoUrl
          };
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Helper: Client-side Twitter/X API resolver
 */
async function probeTwitterClientSide(url: string): Promise<{
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  directVideoUrl: string;
} | null> {
  const tweetId = extractTwitterStatusId(url);
  if (!tweetId) return null;

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
          title: (tweet.text || `X Video (${tweetId})`).replace(/\s+/g, ' ').trim().slice(0, 95),
          author: tweet.user_name ? `${tweet.user_name} (@${tweet.user_screen_name || 'x'})` : 'X / Twitter',
          duration: videoItem.duration_millis ? Math.round(videoItem.duration_millis / 1000) : 35,
          thumbnail: videoItem.thumbnail_url || '',
          directVideoUrl: videoItem.url
        };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Fetches real video metadata & stream formats via backend `/api/media/probe` and multi-platform resolvers
 */
export async function parseMediaUrl(url: string): Promise<ParsedMediaInfo> {
  const cleanUrl = url.trim();
  const platform = detectPlatform(cleanUrl);
  const ytVideoId = platform === 'youtube' ? extractYouTubeVideoId(cleanUrl) : null;

  let resolvedTitle = deriveTitleFromUrl(cleanUrl, platform);
  let resolvedAuthor = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Creator`;
  let resolvedThumbnail = ytVideoId
    ? `/api/media/thumbnail?yt=${ytVideoId}`
    : createSvgCoverDataUri(platform, resolvedTitle);
  let durationSeconds = 120;
  let viewsCount: string | undefined = undefined;
  let probedHeights: number[] | undefined;
  let probedEst: Record<string, number> | undefined;
  let audioEst: number | undefined;
  let formatsMap: Record<string, string> | undefined;
  let directVideoUrl: string | undefined;
  let directAudioUrl: string | undefined;

  // 1. Primary Probe: Our Full-Stack Backend `/api/media/probe`
  try {
    const probeRes = await fetch('/api/media/probe', {
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
        if (typeof data.audio_est === 'number') {
          audioEst = data.audio_est;
        }
        if (data.thumbnail) {
          resolvedThumbnail = data.thumbnail;
        }
        if (data.formats_map && typeof data.formats_map === 'object') {
          formatsMap = data.formats_map;
        }
        if (data.direct_video_url) {
          directVideoUrl = data.direct_video_url;
        }
        if (data.direct_audio_url) {
          directAudioUrl = data.direct_audio_url;
        }
      }
    }
  } catch {
    // Fallback to client-side resolvers below (e.g., on standalone Android APK)
  }

  // 2. Client-side Aparat resolver if directVideoUrl not yet populated
  if (platform === 'aparat' && !directVideoUrl) {
    const aparatInfo = await probeAparatClientSide(cleanUrl);
    if (aparatInfo) {
      resolvedTitle = aparatInfo.title;
      resolvedAuthor = aparatInfo.author;
      durationSeconds = aparatInfo.duration;
      if (aparatInfo.thumbnail) {
        resolvedThumbnail = getSafeThumbnail(aparatInfo.thumbnail);
      }
      viewsCount = aparatInfo.viewsCount;
      probedHeights = aparatInfo.heights;
      probedEst = aparatInfo.est;
      formatsMap = aparatInfo.formatsMap;
      directVideoUrl = aparatInfo.directVideoUrl;
      directAudioUrl = aparatInfo.directVideoUrl;
    }
  }

  // 3. Client-side TikTok TikWM resolver if needed
  if (platform === 'tiktok' && !directVideoUrl) {
    try {
      const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`);
      if (tikRes.ok) {
        const tikJson = await tikRes.json();
        if (tikJson && tikJson.code === 0 && tikJson.data) {
          const d = tikJson.data;
          if (d.title) resolvedTitle = d.title;
          if (d.author?.nickname) resolvedAuthor = `${d.author.nickname} (@${d.author.unique_id || 'tiktok'})`;
          if (d.duration) durationSeconds = Number(d.duration);
          if (d.cover) resolvedThumbnail = getSafeThumbnail(d.cover);
          if (d.play_count) viewsCount = String(d.play_count);
          const playUrl = d.id ? `https://www.tikwm.com/video/media/play/${d.id}.mp4` : (d.hdplay || d.play);
          if (playUrl) {
            directVideoUrl = playUrl;
            formatsMap = { '1080': playUrl, '720': playUrl };
          }
          if (d.music) {
            directAudioUrl = d.music;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Client-side Twitter/X resolver if needed
  if (platform === 'twitter' && !directVideoUrl) {
    const twInfo = await probeTwitterClientSide(cleanUrl);
    if (twInfo) {
      resolvedTitle = twInfo.title;
      resolvedAuthor = twInfo.author;
      durationSeconds = twInfo.duration;
      if (twInfo.thumbnail) resolvedThumbnail = getSafeThumbnail(twInfo.thumbnail);
      directVideoUrl = twInfo.directVideoUrl;
      directAudioUrl = twInfo.directVideoUrl;
      formatsMap = { '1080': twInfo.directVideoUrl, '720': twInfo.directVideoUrl };
    }
  }

  // 5. Public oEmbed metadata enrichment (author name / title if still default)
  try {
    const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`);
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      if (data && !data.error) {
        if (data.title && (resolvedTitle.startsWith('ویدیو') || resolvedTitle.includes(' - '))) {
          resolvedTitle = data.title;
        }
        if (data.author_name) {
          resolvedAuthor = data.author_name;
        }
        if (!ytVideoId && data.thumbnail_url && resolvedThumbnail.startsWith('data:image')) {
          resolvedThumbnail = getSafeThumbnail(data.thumbnail_url);
        }
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
 * Detects whether the app is running inside a native Android APK (Capacitor) or file:// origin
 * where relative `/api/...` server routes do not exist.
 */
export function isCapacitorOrNative(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).Capacitor?.isNativePlatform?.()) return true;
  const proto = window.location.protocol;
  const host = window.location.hostname;
  if (proto === 'capacitor:' || proto === 'file:') return true;
  if (host === 'localhost' && !window.location.port) return true;
  return false;
}

/**
 * Ensures any thumbnail URL is routed safely on Web or loaded directly on Native Android APK
 */
export function getSafeThumbnail(thumbnailUrl: string, ytVideoId?: string): string {
  const isNative = isCapacitorOrNative();

  if (ytVideoId && /^[\w-]{11}$/.test(ytVideoId)) {
    return isNative
      ? `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`
      : `/api/media/thumbnail?yt=${ytVideoId}`;
  }
  if (!thumbnailUrl) return '';
  if (thumbnailUrl.startsWith('data:image') || thumbnailUrl.startsWith('blob:')) {
    return thumbnailUrl;
  }
  if (thumbnailUrl.startsWith('/api/media/thumbnail')) {
    if (isNative) {
      const matchYt = thumbnailUrl.match(/yt=([\w-]{11})/);
      if (matchYt) return `https://i.ytimg.com/vi/${matchYt[1]}/hqdefault.jpg`;
      const matchUrl = thumbnailUrl.match(/url=([^&]+)/);
      if (matchUrl) return decodeURIComponent(matchUrl[1]);
    }
    return thumbnailUrl;
  }
  if (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')) {
    if (isNative) return thumbnailUrl;
    return `/api/media/thumbnail?url=${encodeURIComponent(thumbnailUrl)}`;
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
    url.startsWith('/api/media/file') ||
    url.startsWith('/api/media/audio') ||
    url.startsWith('/api/media/proxy-stream')
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
