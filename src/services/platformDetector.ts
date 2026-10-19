import { FormatOption, ParsedMediaInfo, PlatformId } from '../types';

export interface SampleMediaItem {
  id: string;
  name: string;
  url: string;
  platform: PlatformId;
  durationFormatted: string;
}

export const SAMPLE_URLS: SampleMediaItem[] = [
  {
    id: 'yt-tennis',
    name: 'آموزش تنیس روی میز (YouTube)',
    url: 'https://www.youtube.com/watch?v=kYJ5b6wP-4A',
    platform: 'youtube',
    durationFormatted: '08:15'
  },
  {
    id: 'yt-4k',
    name: 'یوتیوب 4K سینمایی',
    url: 'https://www.youtube.com/watch?v=L_LUpnjgPso',
    platform: 'youtube',
    durationFormatted: '03:42'
  },
  {
    id: 'tiktok-viral',
    name: 'کلیپ تیک‌تاک',
    url: 'https://www.tiktok.com/@sports_world/video/7391823901923',
    platform: 'tiktok',
    durationFormatted: '00:55'
  },
  {
    id: 'insta-reel',
    name: 'ریلز اینستاگرام',
    url: 'https://www.instagram.com/reel/C8qXp9zLN5K/',
    platform: 'instagram',
    durationFormatted: '01:15'
  },
  {
    id: 'sc-synth',
    name: 'موزیک ساوندکلاود 320k',
    url: 'https://soundcloud.com/synth-wave/neon-midnight-horizons',
    platform: 'soundcloud',
    durationFormatted: '04:20'
  }
];

export function detectPlatform(url: string): PlatformId {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) return 'youtube';
  if (trimmed.includes('tiktok.com')) return 'tiktok';
  if (trimmed.includes('instagram.com')) return 'instagram';
  if (trimmed.includes('twitter.com') || trimmed.includes('x.com')) return 'twitter';
  if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) return 'facebook';
  if (trimmed.includes('vimeo.com')) return 'vimeo';
  if (trimmed.includes('soundcloud.com')) return 'soundcloud';
  if (trimmed.includes('pinterest.com') || trimmed.includes('pin.it')) return 'pinterest';
  return 'generic';
}

export function extractYouTubeVideoId(url: string): string | null {
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i;
  const match = url.match(regExp);
  return match && match[1] ? match[1] : null;
}

export function extractUrlFromText(rawText: string): string {
  if (!rawText) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = rawText.match(urlRegex);
  return matches && matches.length > 0 ? matches[0] : rawText.trim();
}

/**
 * Derives a human-readable title from URL paths or slugs when oEmbed fails
 */
function deriveTitleFromUrl(url: string, platform: PlatformId, videoId: string | null): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    
    // Check if user provided title in query
    if (urlObj.searchParams.get('title')) {
      return decodeURIComponent(urlObj.searchParams.get('title')!);
    }

    // Check slug in path
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const last = decodeURIComponent(pathParts[pathParts.length - 1]);
      // Remove extensions
      const cleanSlug = last.replace(/\.[a-z0-9]+$/i, '').replace(/[-_+]/g, ' ');
      if (cleanSlug.length > 3 && !cleanSlug.match(/^[a-z0-9_-]{10,}$/i)) {
        return cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
      }
    }

    if (platform === 'youtube' && videoId) {
      return `YouTube Video (${videoId})`;
    }

    return `${platform.toUpperCase()} Media Stream`;
  } catch {
    return 'Media Stream';
  }
}

export function generateFormatStreams(durationSec: number = 220): FormatOption[] {
  const videoBitrates = [
    { label: '4K (2160p)', res: '3840x2160', fps: 60, vCodec: 'AV01 (AV1 High)', aCodec: 'Opus 48kHz', rateMbps: 18.5, isHdr: true, format: 'mp4' as const },
    { label: '2K (1440p)', res: '2560x1440', fps: 60, vCodec: 'VP9.2 (HDR)', aCodec: 'Opus 48kHz', rateMbps: 10.2, isHdr: true, format: 'webm' as const },
    { label: '1080p Full HD', res: '1920x1080', fps: 60, vCodec: 'AVC1 / H.264 Main', aCodec: 'AAC-LC', rateMbps: 5.4, isHdr: false, format: 'mp4' as const },
    { label: '720p HD', res: '1280x720', fps: 30, vCodec: 'AVC1 / H.264', aCodec: 'AAC-LC', rateMbps: 2.8, isHdr: false, format: 'mp4' as const },
    { label: '480p SD', res: '854x480', fps: 30, vCodec: 'VP9', aCodec: 'Opus', rateMbps: 1.2, isHdr: false, format: 'webm' as const },
    { label: '360p Mobile', res: '640x360', fps: 30, vCodec: 'AVC1', aCodec: 'AAC-LC', rateMbps: 0.7, isHdr: false, format: 'mp4' as const },
  ];

  const audioBitrates = [
    { label: '320 kbps Studio HQ', aCodec: 'MP3 Layer III (320k)', kbps: 320, channels: 'Stereo 2.0 (48kHz)', format: 'mp3' as const },
    { label: '256 kbps High Fidelity', aCodec: 'AAC-LC (256k)', kbps: 256, channels: 'Stereo 2.0 (48kHz)', format: 'm4a' as const },
    { label: '128 kbps Standard', aCodec: 'AAC / Opus', kbps: 128, channels: 'Stereo 2.0 (44.1kHz)', format: 'aac' as const },
  ];

  const videoStreams: FormatOption[] = videoBitrates.map((v, idx) => {
    const bytes = Math.round((v.rateMbps * 1000 * 1000 / 8) * durationSec);
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    return {
      id: `v-${idx}-${v.format}-${v.label.replace(/\s+/g, '')}`,
      type: 'video',
      format: v.format,
      qualityLabel: v.label,
      resolution: v.res,
      fps: v.fps,
      vCodec: v.vCodec,
      aCodec: v.aCodec,
      bitrate: `${v.rateMbps} Mbps`,
      channels: 'Stereo 2.0',
      isHdr: v.isHdr,
      estimatedSizeBytes: bytes,
      estimatedSizeFormatted: `${mb} MB`
    };
  });

  const audioStreams: FormatOption[] = audioBitrates.map((a, idx) => {
    const bytes = Math.round((a.kbps * 1000 / 8) * durationSec);
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    return {
      id: `a-${idx}-${a.format}-${a.kbps}k`,
      type: 'audio',
      format: a.format,
      qualityLabel: a.label,
      aCodec: a.aCodec,
      bitrate: `${a.kbps} kbps`,
      channels: a.channels,
      estimatedSizeBytes: bytes,
      estimatedSizeFormatted: `${mb} MB`
    };
  });

  return [...videoStreams, ...audioStreams];
}

/**
 * Fetches real metadata from YouTube / TikTok / Vimeo / SoundCloud oEmbed endpoints
 * with fallback to URL slug derivation
 */
export async function parseMediaUrl(inputUrl: string): Promise<ParsedMediaInfo> {
  const cleanUrl = extractUrlFromText(inputUrl);
  const platform = detectPlatform(cleanUrl);
  const ytVideoId = extractYouTubeVideoId(cleanUrl);

  let title = '';
  let author = '';
  let thumbnail = '';
  const isShortOrReel = cleanUrl.includes('/shorts/') || cleanUrl.includes('/reel/') || cleanUrl.includes('tiktok.com');
  let durationSec = isShortOrReel ? 49 : 85;
  let durationFormatted = isShortOrReel ? '00:49' : '01:25';
  let views = '1.2M views';

  // 1. YouTube specific default thumbnail via Zero-VPN proxy
  if (platform === 'youtube' && ytVideoId) {
    thumbnail = `/api/media/thumbnail?yt=${ytVideoId}`;
  }

  // 2. Multi-strategy real metadata fetching
  let oEmbedSuccess = false;

  // Try Strategy 0: Our backend probe API (Fast and comprehensive)
  try {
    const probeRes = await fetch('/api/media/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl })
    });
    if (probeRes.ok) {
      const probeData = await probeRes.json();
      if (probeData.success) {
        if (probeData.title && probeData.title !== 'Media Stream') {
          title = probeData.title;
        }
        if (probeData.duration) {
          durationSec = probeData.duration;
          const m = Math.floor(durationSec / 60);
          const s = durationSec % 60;
          durationFormatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        if (probeData.thumbnail) {
          thumbnail = probeData.thumbnail;
        } else if (ytVideoId) {
          thumbnail = `/api/media/thumbnail?yt=${ytVideoId}`;
        }
        oEmbedSuccess = true;
      }
    }
  } catch {
    // Continue with other strategies
  }

  // Try Strategy A: noembed.com (Supports YouTube, Vimeo, TikTok, SoundCloud, Twitter, etc. with CORS enabled)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.title && !data.error) {
        title = data.title;
        author = data.author_name || author;
        if (data.thumbnail_url) {
          thumbnail = `/api/media/thumbnail?url=${encodeURIComponent(data.thumbnail_url)}`;
        }
        oEmbedSuccess = true;
      }
    }
  } catch (err) {
    // Ignore timeout / network failure
  }

  // Try Strategy B: YouTube oEmbed directly (if YouTube and Strategy A didn't give title)
  if (!oEmbedSuccess && platform === 'youtube') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          title = data.title;
          author = data.author_name || author;
          if (data.thumbnail_url) {
            thumbnail = `/api/media/thumbnail?url=${encodeURIComponent(data.thumbnail_url)}`;
          }
          oEmbedSuccess = true;
        }
      }
    } catch {
      // Ignore
    }
  }

  // Try Strategy C: TikTok oEmbed directly
  if (!oEmbedSuccess && platform === 'tiktok') {
    try {
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          title = data.title;
          author = data.author_name || author;
          if (data.thumbnail_url) {
            thumbnail = `/api/media/thumbnail?url=${encodeURIComponent(data.thumbnail_url)}`;
          }
          oEmbedSuccess = true;
        }
      }
    } catch {
      // Ignore
    }
  }

  // Try Strategy D: Vimeo oEmbed directly
  if (!oEmbedSuccess && platform === 'vimeo') {
    try {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(cleanUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          title = data.title;
          author = data.author_name || author;
          if (data.thumbnail_url) {
            thumbnail = `/api/media/thumbnail?url=${encodeURIComponent(data.thumbnail_url)}`;
          }
          if (data.duration) {
            durationSec = data.duration;
            const m = Math.floor(data.duration / 60);
            const s = data.duration % 60;
            durationFormatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
          }
          oEmbedSuccess = true;
        }
      }
    } catch {
      // Ignore
    }
  }

  // Fallback: If network or oEmbed couldn't resolve, extract title from URL words/slug
  if (!title) {
    title = deriveTitleFromUrl(cleanUrl, platform, ytVideoId);
  }

  if (!author) {
    if (platform === 'youtube') author = 'YouTube Creator';
    else if (platform === 'tiktok') author = '@tiktok.creator';
    else if (platform === 'instagram') author = '@instagram.user';
    else if (platform === 'soundcloud') author = 'SoundCloud Artist';
    else author = `${platform.toUpperCase()} Channel`;
  }

  if (!thumbnail) {
    if (ytVideoId) {
      thumbnail = `/api/media/thumbnail?yt=${ytVideoId}`;
    } else {
      thumbnail = '';
    }
  }

  const formats = generateFormatStreams(durationSec);

  return {
    id: `media-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    originalUrl: cleanUrl,
    videoId: ytVideoId || undefined,
    platform,
    title,
    author,
    durationSeconds: durationSec,
    durationFormatted,
    viewsCount: views,
    thumbnail,
    formats,
    timestamp: Date.now()
  };
}

/**
 * Detects whether the app is executing inside a standalone Capacitor / Cordova Android APK
 */
export function isCapacitorOrNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof (window as any).Capacitor !== 'undefined' ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    window.location.protocol === 'file:' ||
    (window.location.hostname === 'localhost' && !window.location.port)
  );
}

/**
 * Returns a Zero-VPN safe thumbnail proxy URL in web browsers,
 * or direct CDN image URL when running offline inside an Android APK.
 */
export function getSafeThumbnail(thumbnailUrl?: string, ytVideoId?: string): string {
  const isNative = isCapacitorOrNative();
  if (!thumbnailUrl && ytVideoId) {
    if (isNative) {
      return `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`;
    }
    return `/api/media/thumbnail?yt=${ytVideoId}`;
  }
  if (!thumbnailUrl) return '';
  if (thumbnailUrl.startsWith('data:image')) {
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
  if (thumbnailUrl.includes('i.ytimg.com') || thumbnailUrl.includes('ytimg.com')) {
    if (isNative) return thumbnailUrl;
    if (ytVideoId) return `/api/media/thumbnail?yt=${ytVideoId}`;
    return `/api/media/thumbnail?url=${encodeURIComponent(thumbnailUrl)}`;
  }
  if (thumbnailUrl.includes('tiktokcdn') || thumbnailUrl.includes('instagram') || thumbnailUrl.includes('twimg.com')) {
    if (isNative) return thumbnailUrl;
    return `/api/media/thumbnail?url=${encodeURIComponent(thumbnailUrl)}`;
  }
  return thumbnailUrl;
}

/**
 * Checks if a URL is a social media webpage (e.g. YouTube watch page) rather than a playable media file.
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
  return (
    /(?:youtube\.com|youtu\.be|instagram\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com)/i.test(url) &&
    !/\.(mp4|mp3|m4a|webm|wav|ogg|mov)(\?.*)?$/i.test(url)
  );
}
