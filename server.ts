import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable, pipeline } from 'stream';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const SAVEVIDEO_BASE = 'https://savevideo.uz';
const YTDLP_BIN = path.resolve(__dirname, 'bin', 'yt-dlp');

// Ensure local yt-dlp binary has execute permissions on server startup
try {
  if (fs.existsSync(YTDLP_BIN)) {
    fs.chmodSync(YTDLP_BIN, 0o755);
  }
} catch {
  // ignore permission change notice on read-only fs
}

const MOBILE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface CachedSaveVideoResult {
  taskId: string;
  fileToken: string;
  title: string;
  fileSize: number;
  ext: string;
  fileType: string;
  directVideoUrl: string;
  directAudioUrl: string;
  createdAt: number;
}

const saveVideoResultCache = new Map<string, CachedSaveVideoResult>();
const taskSourceUrlMap = new Map<string, { url: string; height?: number; audio?: boolean }>();
const tikTokResultCache = new Map<string, { data: any; expiresAt: number }>();
const ytDlpResultCache = new Map<string, { data: ExtractedPlatformMedia; expiresAt: number }>();
const tikTokTranscodeCache = new Map<string, { filePath: string; size: number; expiresAt: number }>();

async function resolveViaTikWMServer(url: string, requestedHeight = 720, isAudio = false): Promise<any | null> {
  const cleanBaseUrl = url.trim().split('?')[0].replace(/\/+$/, '') || url.trim();
  const resolutionKey = `${cleanBaseUrl}::${requestedHeight}::${isAudio ? 'a' : 'v'}`;
  const cached = tikTokResultCache.get(resolutionKey) || tikTokResultCache.get(cleanBaseUrl) || tikTokResultCache.get(url.trim());
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1100));
      const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
        headers: { Accept: 'application/json', 'User-Agent': DESKTOP_CHROME_UA }
      });
      if (tikRes.ok) {
        const tikJson = await tikRes.json();
        if (tikJson && tikJson.code === 0 && tikJson.data) {
          const d = tikJson.data;
          if (d.id && !d.resolved_cdn_url) {
            try {
              const idPlayUrl = `https://www.tikwm.com/video/media/play/${d.id}.mp4`;
              const redirRes = await fetch(idPlayUrl, {
                method: 'GET',
                headers: { 'User-Agent': DESKTOP_CHROME_UA, Referer: 'https://www.tikwm.com/' },
                redirect: 'manual'
              });
              const loc = redirRes.headers.get('location');
              if (loc && loc.startsWith('http')) {
                d.resolved_cdn_url = loc;
              }
            } catch {
              // ignore redirect check error
            }
          }
          const ttl = Date.now() + 10 * 60 * 1000;
          tikTokResultCache.set(resolutionKey, { data: d, expiresAt: ttl });
          tikTokResultCache.set(cleanBaseUrl, { data: d, expiresAt: ttl });
          tikTokResultCache.set(url.trim(), { data: d, expiresAt: ttl });
          return d;
        }
      }
    } catch {
      // retry after 1.1s
    }
  }
  return null;
}

/**
 * Helper: Compute strictly distinct TikTok stream URLs and byte sizes per resolution (360p, 480p, 720p, 1080p)
 * Prevents the bug where TikWM's watermarked stream (`d.wmplay` / `d.wm_size`, often 11.8MB+) was mistakenly assigned to 360p/480p.
 */
function computeTikTokResolutionMeta(d: any, ytdlpData?: ExtractedPlatformMedia | null) {
  const resolvedCdn = d?.resolved_cdn_url || '';
  const idPlay = d?.id ? `https://www.tikwm.com/video/media/play/${d.id}.mp4` : '';
  const hdPlay = d?.hdplay
    ? String(d.hdplay).startsWith('http')
      ? String(d.hdplay)
      : `https://www.tikwm.com${d.hdplay}`
    : idPlay;
  const stdPlay = d?.play
    ? String(d.play).startsWith('http')
      ? String(d.play)
      : `https://www.tikwm.com${d.play}`
    : idPlay;
  const wmPlay = d?.wmplay
    ? String(d.wmplay).startsWith('http')
      ? String(d.wmplay)
      : `https://www.tikwm.com${d.wmplay}`
    : stdPlay;

  const rawStdSize = Number(d?.size) > 150000 ? Number(d.size) : 0;
  const rawWmSize = Number(d?.wm_size) > 150000 ? Number(d.wm_size) : 0;
  const rawHdSize = Number(d?.hd_size) > 150000 ? Number(d.hd_size) : 0;

  // Pick the smaller non-HD stream as the 720p baseline (never use wm_size if it is larger than stdSize)
  const wmIsSmaller = rawWmSize > 150000 && rawStdSize > 150000 && rawWmSize < rawStdSize * 0.85;
  const base720Size =
    ytdlpData?.est?.['720'] ||
    (rawStdSize > 150000 ? rawStdSize : rawWmSize > 150000 ? rawWmSize : 4500000);
  const base1080Size =
    ytdlpData?.est?.['1080'] ||
    (rawHdSize > base720Size
      ? rawHdSize
      : rawWmSize > base720Size
      ? rawWmSize
      : Math.round(base720Size * 1.38));
  const base480Size =
    ytdlpData?.est?.['480'] && ytdlpData.est['480'] < base720Size * 0.9
      ? ytdlpData.est['480']
      : wmIsSmaller
      ? rawWmSize
      : Math.round(base720Size * 0.56);
  const base360Size =
    ytdlpData?.est?.['360'] && ytdlpData.est['360'] < base480Size * 0.92
      ? ytdlpData.est['360']
      : Math.round(base720Size * 0.36);

  const url1080 = ytdlpData?.formats_map?.['1080'] || hdPlay || resolvedCdn || stdPlay || idPlay;
  const url720 = ytdlpData?.formats_map?.['720'] || stdPlay || resolvedCdn || idPlay || hdPlay;
  const url480 =
    ytdlpData?.formats_map?.['480'] || (wmIsSmaller ? wmPlay : stdPlay) || resolvedCdn || idPlay;
  const url360 =
    ytdlpData?.formats_map?.['360'] || (wmIsSmaller ? wmPlay : stdPlay) || resolvedCdn || idPlay;

  return {
    est: {
      '360': base360Size,
      '480': base480Size,
      '720': base720Size,
      '1080': base1080Size
    },
    rawUrls: {
      '360': url360,
      '480': url480,
      '720': url720,
      '1080': url1080
    },
    hasDistinctLowResStream: Boolean(
      (ytdlpData?.formats_map?.['360'] && ytdlpData.formats_map['360'] !== url720) ||
        (ytdlpData?.formats_map?.['480'] && ytdlpData.formats_map['480'] !== url720) ||
        wmIsSmaller
    ),
    musicUrl: d?.music || ytdlpData?.direct_audio_url || url720
  };
}

/**
 * Helper: Transcode TikTok stream to exact 360p or 480p via local ffmpeg when upstream only provides a single high-bitrate stream.
 * Cached by `url::height::v` so repeated requests or Range requests are instantaneous.
 */
async function transcodeTikTokToTargetHeight(
  sourceUrl: string,
  upstreamMediaUrl: string,
  targetHeight: number
): Promise<{ filePath: string; size: number } | null> {
  const cleanKey = `${sourceUrl.trim().split('?')[0]}::${targetHeight}::v`;
  const existing = tikTokTranscodeCache.get(cleanKey);
  if (existing && existing.expiresAt > Date.now() && fs.existsSync(existing.filePath)) {
    return { filePath: existing.filePath, size: existing.size };
  }

  const ffmpegCandidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  let ffmpegBin = '';
  for (const bin of ffmpegCandidates) {
    if (bin === 'ffmpeg' || fs.existsSync(bin)) {
      ffmpegBin = bin;
      break;
    }
  }
  if (!ffmpegBin) return null;

  const safeHash = Buffer.from(cleanKey).toString('base64url').slice(0, 28);
  const outPath = path.join('/tmp', `od_tiktok_${safeHash}_${targetHeight}p.mp4`);

  try {
    if (fs.existsSync(outPath)) {
      const st = fs.statSync(outPath);
      if (st.size > 80 * 1024) {
        tikTokTranscodeCache.set(cleanKey, {
          filePath: outPath,
          size: st.size,
          expiresAt: Date.now() + 15 * 60 * 1000
        });
        return { filePath: outPath, size: st.size };
      }
    }

    const crf = targetHeight <= 360 ? '30' : '26';
    const maxrate = targetHeight <= 360 ? '420k' : '740k';
    const bufsize = targetHeight <= 360 ? '840k' : '1480k';
    const audioBitrate = targetHeight <= 360 ? '80k' : '96k';

    await execFileAsync(
      ffmpegBin,
      [
        '-y',
        '-headers',
        `User-Agent: ${DESKTOP_CHROME_UA}\r\nReferer: https://www.tikwm.com/\r\n`,
        '-i',
        upstreamMediaUrl,
        '-vf',
        `scale='if(gt(iw,ih),-2,${targetHeight})':'if(gt(iw,ih),${targetHeight},-2)'`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        crf,
        '-maxrate',
        maxrate,
        '-bufsize',
        bufsize,
        '-c:a',
        'aac',
        '-b:a',
        audioBitrate,
        '-movflags',
        '+faststart',
        outPath
      ],
      { timeout: 22000 }
    );

    if (fs.existsSync(outPath)) {
      const st = fs.statSync(outPath);
      if (st.size > 80 * 1024) {
        tikTokTranscodeCache.set(cleanKey, {
          filePath: outPath,
          size: st.size,
          expiresAt: Date.now() + 15 * 60 * 1000
        });
        return { filePath: outPath, size: st.size };
      }
    }
  } catch {
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {
      // ignore cleanup error
    }
  }
  return null;
}

async function resolveViaSaveVideoBackend(
  url: string,
  maxPollAttempts = 85,
  forceFresh = false,
  height = 720,
  audio = false
): Promise<CachedSaveVideoResult | null> {
  const reqHeightNum = Number(height) || 720;
  const isYt = /(?:youtube\.com|youtu\.be)/i.test(url);
  const isTikTok = /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(url);
  const ytMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/i
  );
  const targetUrl = isYt && ytMatch
    ? `https://www.youtube.com/watch?v=${ytMatch[1]}`
    : url.trim().split('?')[0].replace(/\/+$/, '') || url.trim();

  const cleanKey = `${targetUrl}::${reqHeightNum}::${audio ? 'a' : 'v'}`;
  if (!forceFresh) {
    const existing = saveVideoResultCache.get(cleanKey);
    if (existing && Date.now() - existing.createdAt < 10 * 60 * 1000) {
      return existing;
    }
  }

  const useHeightAwareEndpoint = isYt || (isTikTok && reqHeightNum <= 720);
  const startEndpoint = useHeightAwareEndpoint
    ? `${SAVEVIDEO_BASE}/api/yt/start`
    : `${SAVEVIDEO_BASE}/api/download`;

  // Never upgrade a lower resolution (e.g. 360p) to 720p/1080p; only fall back downward if needed
  const heightCandidates =
    useHeightAwareEndpoint && !audio
      ? reqHeightNum <= 360
        ? [360]
        : reqHeightNum <= 480
        ? [480, 360]
        : reqHeightNum <= 720
        ? [720, 480, 360]
        : Array.from(new Set([reqHeightNum, 720, 360]))
      : [reqHeightNum];

  for (const candidateHeight of heightCandidates) {
    const startBody = useHeightAwareEndpoint
      ? { url: targetUrl, height: candidateHeight, audio: !!audio }
      : { url: targetUrl };

    try {
      const dlRes = await fetch(startEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': `${SAVEVIDEO_BASE}/`,
          'User-Agent': DESKTOP_CHROME_UA
        },
        body: JSON.stringify(startBody)
      });

      if (!dlRes.ok) continue;
      const startData = await dlRes.json();
      const taskId = startData?.task_id;
      if (!taskId) continue;

      taskSourceUrlMap.set(taskId, { url: targetUrl, height: candidateHeight, audio });

      for (let i = 0; i < maxPollAttempts; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const stRes = await fetch(`${SAVEVIDEO_BASE}/api/status/${taskId}`, {
          headers: {
            'Referer': `${SAVEVIDEO_BASE}/`,
            'User-Agent': DESKTOP_CHROME_UA
          }
        });
        if (!stRes.ok) continue;
        const stData = await stRes.json();
        if (stData.status === 'done') {
          const fileSize = Number(stData.file_size) || 0;
          // Reject corrupt < 200KB video outputs and try fallback height
          if (!audio && fileSize > 0 && fileSize < 200 * 1024) {
            break;
          }
          const fileToken = stData.file_token || '';
          const ext = stData.ext || 'mp4';
          const title = stData.title || '';
          const validSize = fileSize > 200000 ? fileSize : 8400000;
          const fileType = stData.file_type || 'video';
          const directVideoUrl = `/api/media/file/${taskId}?t=${encodeURIComponent(fileToken)}&ext=${ext}&quality=${candidateHeight}&title=${encodeURIComponent(
            title || 'video'
          )}&sourceUrl=${encodeURIComponent(targetUrl)}`;
          const directAudioUrl = `/api/media/audio/${taskId}?t=${encodeURIComponent(fileToken)}&quality=${candidateHeight}&sourceUrl=${encodeURIComponent(
            targetUrl
          )}`;

          const result: CachedSaveVideoResult = {
            taskId,
            fileToken,
            title,
            fileSize: validSize,
            ext,
            fileType,
            directVideoUrl,
            directAudioUrl,
            createdAt: Date.now()
          };
          const exactCandidateKey = `${targetUrl}::${candidateHeight}::${audio ? 'a' : 'v'}`;
          saveVideoResultCache.set(exactCandidateKey, result);
          if (candidateHeight === reqHeightNum) {
            saveVideoResultCache.set(cleanKey, result);
          }
          return result;
        } else if (stData.status === 'error') {
          break;
        }
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

function isSafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === 'metadata.google.internal' ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/');
}

interface ExtractedPlatformMedia {
  platform: string;
  title: string;
  author?: string;
  duration: number;
  thumbnail: string;
  viewsCount?: string;
  heights: number[];
  max_height: number;
  est: Record<string, number>;
  formats_map: Record<string, string>;
  direct_video_url?: string;
  direct_audio_url?: string;
  is_shorts?: boolean;
}

/**
 * Helper: Parse size string like "33.18 مگابایت" or "850 کیلوبایت" into bytes
 */
function parsePersianSizeToBytes(sizeStr?: string): number | null {
  if (!sizeStr || typeof sizeStr !== 'string') return null;
  const normalized = sizeStr
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;
  const val = parseFloat(numMatch[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  if (/گیگ|gb/i.test(normalized)) return Math.round(val * 1024 * 1024 * 1024);
  if (/کیلو|kb/i.test(normalized)) return Math.round(val * 1024);
  return Math.round(val * 1024 * 1024);
}

function extractAparatHashServer(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.trim();
  const match =
    cleaned.match(/aparat\.com\/(?:v|embed)\/([A-Za-z0-9_-]{3,20})(?:[/?#&]|$)/i) ||
    cleaned.match(/aparat\.com\/video\/video\/embed\/videohash\/([A-Za-z0-9_-]{3,20})(?:[/?#&]|$)/i) ||
    cleaned.match(/videohash\/([A-Za-z0-9_-]{3,20})(?:[/?#&]|$)/i) ||
    cleaned.match(/[?&]videohash=([A-Za-z0-9_-]{3,20})(?:[&#]|$)/i) ||
    cleaned.match(/aparat\.com\/(?:v|embed)\/([A-Za-z0-9_-]+)/i) ||
    cleaned.match(/aparat\.com\/.*?\/([A-Za-z0-9]{4,14})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

/**
 * Helper: Extract Aparat Video via Official v1 & Legacy API
 * Reads real thumbnail (`big_poster` or `small_poster`) and direct MP4 from `directLink` / `file_link_all`
 * using neutral headers without forced sanctioned proxies.
 */
async function extractAparatMedia(url: string): Promise<ExtractedPlatformMedia | null> {
  const hash = extractAparatHashServer(url);
  if (!hash) return null;

  const neutralHeaders: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent': DESKTOP_CHROME_UA
  };

  const apiEndpoints = [
    `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${hash}`,
    `https://www.aparat.com/etc/api/video/videohash/${hash}`
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8500);
      const apiRes = await fetch(endpoint, {
        headers: neutralHeaders,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (apiRes.ok) {
        const json = await apiRes.json();
        const v = json?.data?.attributes || json?.video || json?.data;
        if (v && (v.directLink || v.direct_link || v.file_link_all || v.file_link || v.hls_link)) {
          const formatsMap: Record<string, string> = {};
          const heights: number[] = [];
          const est: Record<string, number> = {};
          const duration = Number(v.duration) || 120;

          const registerCandidateUrl = (profileText: string, rawCandidate: unknown, sizeLabel?: string) => {
            const urlStr = Array.isArray(rawCandidate) ? rawCandidate[0] : rawCandidate;
            if (typeof urlStr !== 'string' || !urlStr.startsWith('http')) return;
            const hMatch =
              String(profileText || '').match(/(\d{3,4})/) ||
              urlStr.match(/-(\d{3,4})p\.mp4/i);
            const h = hMatch ? parseInt(hMatch[1], 10) : 720;
            if (!heights.includes(h)) heights.push(h);
            formatsMap[String(h)] = urlStr;
            const parsedBytes = parsePersianSizeToBytes(sizeLabel);
            const bitrateKbps =
              h >= 1080 ? 2800 : h >= 720 ? 1500 : h >= 480 ? 850 : h >= 360 ? 520 : 300;
            est[String(h)] = parsedBytes || Math.round(((bitrateKbps * 1000) / 8) * duration);
          };

          // 1. Check `directLink` / `direct_link` array or field first
          const directLinkSource = v.directLink || v.direct_link || json?.directLink;
          if (Array.isArray(directLinkSource)) {
            for (const item of directLinkSource) {
              if (typeof item === 'string') {
                registerCandidateUrl('720p', item);
              } else if (item && typeof item === 'object') {
                registerCandidateUrl(
                  String(item.profile || item.quality || item.text || '720p'),
                  item.urls || item.url || item.link,
                  item.size
                );
              }
            }
          } else if (typeof directLinkSource === 'string' && directLinkSource.startsWith('http')) {
            registerCandidateUrl('720p', directLinkSource);
          }

          // 2. Check `file_link_all` array
          if (Array.isArray(v.file_link_all)) {
            for (const item of v.file_link_all) {
              if (!item) continue;
              registerCandidateUrl(
                String(item.profile || item.text || ''),
                item.urls || item.url,
                item.size
              );
            }
          }

          heights.sort((a, b) => a - b);
          const safeFileLink =
            typeof v.file_link === 'string' && v.file_link.startsWith('http')
              ? v.file_link
              : undefined;
          const highestHeightKey = heights.length > 0 ? String(heights[heights.length - 1]) : '';
          const bestVideoUrl =
            (highestHeightKey ? formatsMap[highestHeightKey] : undefined) ||
            formatsMap['1080'] ||
            formatsMap['720'] ||
            formatsMap['480'] ||
            formatsMap['360'] ||
            formatsMap['240'] ||
            formatsMap['144'] ||
            safeFileLink;

          if (bestVideoUrl) {
            if (heights.length === 0) {
              heights.push(480, 720);
              formatsMap['720'] = bestVideoUrl;
              formatsMap['480'] = bestVideoUrl;
            }
            const rawPoster =
              v.big_poster ||
              v.small_poster ||
              v.medium_poster ||
              v.med_poster ||
              v.poster ||
              '';
            const includedAuthor = Array.isArray(json?.included)
              ? json.included.find((inc: any) => inc?.attributes?.name || inc?.attributes?.username)
                  ?.attributes
              : null;
            const authorName =
              includedAuthor?.name ||
              includedAuthor?.username ||
              v.sender_name ||
              v.owner_username ||
              v.username ||
              'Aparat';

            return {
              platform: 'aparat',
              title: decodeHtmlEntities(v.title || `ویدیو آپارات (${hash})`),
              author: decodeHtmlEntities(authorName),
              duration,
              thumbnail: rawPoster,
              viewsCount:
                v.visit_cnt_non_formatted || v.visit_cnt
                  ? String(v.visit_cnt_non_formatted || v.visit_cnt)
                  : undefined,
              heights,
              max_height: heights[heights.length - 1] || 720,
              est,
              formats_map: formatsMap,
              direct_video_url: bestVideoUrl,
              direct_audio_url: bestVideoUrl
            };
          }
        }
      }
    } catch (err) {
      console.warn('Aparat API attempt notice:', err);
    }
  }

  // 2. Fallback: Scrape Aparat Video Web Page HTML / JSON-LD / OpenGraph with neutral headers
  try {
    const pageRes = await fetch(`https://www.aparat.com/v/${hash}`, {
      headers: {
        'User-Agent': DESKTOP_CHROME_UA,
        'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8'
      }
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
      const ogImage =
        html.match(/"big_poster"\s*:\s*"([^"]+)"/i)?.[1] ||
        html.match(/"small_poster"\s*:\s*"([^"]+)"/i)?.[1] ||
        html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
      const ogVideo =
        html.match(/<meta\s+property=["']og:video:url["']\s+content=["']([^"']+\.mp4[^"']*)["']/i)?.[1] ||
        html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+\.mp4[^"']*)["']/i)?.[1] ||
        html.match(/https?:\/\/[^"'\s\\]+\.aparat\.com\/[^"'\s\\]+\.mp4[^"'\s\\]*/i)?.[0];

      if (ogVideo) {
        const cleanVideoUrl = decodeHtmlEntities(ogVideo);
        const cleanThumb = ogImage ? decodeHtmlEntities(ogImage) : '';
        return {
          platform: 'aparat',
          title: decodeHtmlEntities(ogTitle || `ویدیو آپارات (${hash})`),
          author: 'Aparat',
          duration: 120,
          thumbnail: cleanThumb,
          heights: [480, 720, 1080],
          max_height: 1080,
          est: {},
          formats_map: {
            '1080': cleanVideoUrl,
            '720': cleanVideoUrl,
            '480': cleanVideoUrl
          },
          direct_video_url: cleanVideoUrl,
          direct_audio_url: cleanVideoUrl
        };
      }
    }
  } catch (err) {
    console.warn('Aparat HTML scrape error:', err);
  }

  return null;
}

/**
 * Helper: Extract Instagram Reel / Post / Story / Video via Multi-Engine Real Scrapers + SaveVideo + Live /media/?size=l Thumbnail
 */
async function extractInstagramMedia(url: string, forceFresh = false): Promise<ExtractedPlatformMedia | null> {
  const reelOrPostMatch = url.match(
    /(?:instagram\.com|instagr\.am)\/(?:share\/)?(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i
  );
  const storyMatch = url.match(
    /(?:instagram\.com|instagr\.am)\/stories\/([^/?#]+)\/(\d+)/i
  );
  const shortcode = reelOrPostMatch
    ? reelOrPostMatch[1]
    : storyMatch
    ? storyMatch[2]
    : null;

  if (!shortcode && !/(?:instagram\.com|instagr\.am)/i.test(url)) return null;

  // Clean canonical URL without tracking parameters (?igsh=...) for reliable upstream extraction
  const cleanInstagramUrl = reelOrPostMatch
    ? `https://www.instagram.com/reel/${reelOrPostMatch[1]}/`
    : url.split('?')[0];

  // Authentic live Instagram thumbnail endpoint via our proxy (/api/media/thumbnail?ig=SHORTCODE)
  const guaranteedThumb = reelOrPostMatch
    ? `/api/media/thumbnail?ig=${encodeURIComponent(reelOrPostMatch[1])}`
    : '';

  // Strategy 1: SaveVideo Live Resolver (Extracts real MP4 stream, caption, and exact byte size in ~2-3s)
  for (const candidateIgUrl of [cleanInstagramUrl, url]) {
    try {
      const svResolved = await resolveViaSaveVideoBackend(candidateIgUrl, 14, forceFresh);
      if (svResolved && svResolved.directVideoUrl) {
        const cleanTitle = svResolved.title
          ? svResolved.title.replace(/\s+/g, ' ').trim().slice(0, 95)
          : `Instagram Video (${shortcode || 'HD'})`;
        const sizeBytes = svResolved.fileSize > 30000 ? svResolved.fileSize : 8400000;
        return {
          platform: 'instagram',
          title: cleanTitle,
          author: storyMatch ? `@${storyMatch[1]}` : 'Instagram Creator',
          duration: 35,
          thumbnail: guaranteedThumb,
          heights: [720, 1080],
          max_height: 1080,
          est: {
            '720': Math.round(sizeBytes * 0.75),
            '1080': sizeBytes
          },
          formats_map: {
            '1080': svResolved.directVideoUrl,
            '720': svResolved.directVideoUrl
          },
          direct_video_url: svResolved.directVideoUrl,
          direct_audio_url: svResolved.directAudioUrl || svResolved.directVideoUrl
        };
      }
    } catch (err) {
      console.warn('Instagram SaveVideo resolver notice:', err);
    }
  }

  if (!shortcode) return null;

  // Strategy 2: Instagram Embed Captioned Page (Official Instagram embed endpoint with Mobile User-Agent)
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        'User-Agent': MOBILE_SAFARI_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (embedRes.ok) {
      const html = await embedRes.text();
      const videoUrlMatch =
        html.match(/"video_url"\s*:\s*"([^"]+)"/i) ||
        html.match(/\\"video_url\\"\s*:\s*\\"([^\\"]+)\\"/i) ||
        html.match(/class="EmbeddedMediaVideo"[^>]*src="([^"]+)"/i);

      if (videoUrlMatch && videoUrlMatch[1]) {
        const rawVideoUrl = decodeHtmlEntities(
          videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/')
        );
        const thumbMatch =
          html.match(/"display_url"\s*:\s*"([^"]+)"/i) ||
          html.match(/\\"display_url\\"\s*:\s*\\"([^\\"]+)\\"/i) ||
          html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i);
        const rawThumb = thumbMatch
          ? decodeHtmlEntities(thumbMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'))
          : '';
        const usernameMatch =
          html.match(/"username"\s*:\s*"([^"]+)"/i) ||
          html.match(/\\"username\\"\s*:\s*\\"([^\\"]+)\\"/i);
        const captionMatch =
          html.match(/class="Caption"[^>]*>[\s\S]*?<br\s*\/?>([\s\S]*?)<div/i) ||
          html.match(/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"([^"]+)"/i);

        const author = usernameMatch ? `@${decodeHtmlEntities(usernameMatch[1])}` : 'Instagram Creator';
        const rawCaption = captionMatch
          ? decodeHtmlEntities(captionMatch[1].replace(/<[^>]+>/g, '').trim())
          : '';
        const title = rawCaption
          ? rawCaption.slice(0, 90)
          : `Instagram Reel (${author})`;

        return {
          platform: 'instagram',
          title,
          author,
          duration: 35,
          thumbnail: rawThumb
            ? `/api/media/thumbnail?url=${encodeURIComponent(rawThumb)}`
            : guaranteedThumb,
          heights: [720, 1080],
          max_height: 1080,
          est: { '720': 5200000, '1080': 8400000 },
          formats_map: {
            '1080': rawVideoUrl,
            '720': rawVideoUrl
          },
          direct_video_url: rawVideoUrl,
          direct_audio_url: rawVideoUrl
        };
      }
    }
  } catch (err) {
    console.warn('Instagram embed extraction notice:', err);
  }

  // Strategy 3: Instagram GraphQL API Query
  try {
    const gqlUrl = `https://www.instagram.com/graphql/query/?doc_id=8845758582119845&variables=${encodeURIComponent(
      JSON.stringify({ shortcode, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null })
    )}`;
    const gqlRes = await fetch(gqlUrl, {
      headers: {
        'User-Agent': MOBILE_SAFARI_UA,
        'X-IG-App-ID': '936619743392459',
        'Accept': 'application/json',
        'Referer': `https://www.instagram.com/p/${shortcode}/`
      }
    });
    if (gqlRes.ok) {
      const gqlJson = await gqlRes.json();
      const media = gqlJson?.data?.xdt_shortcode_media || gqlJson?.data?.shortcode_media;
      if (media && media.video_url) {
        const captionEdge = media.edge_media_to_caption?.edges?.[0]?.node?.text;
        const owner = media.owner?.username ? `@${media.owner.username}` : 'Instagram Creator';
        const thumb = media.display_url || media.thumbnail_src || '';
        const dur = Math.round(Number(media.video_duration) || 35);
        return {
          platform: 'instagram',
          title: captionEdge ? String(captionEdge).slice(0, 95) : `Instagram Video (${owner})`,
          author: owner,
          duration: dur,
          thumbnail: thumb
            ? `/api/media/thumbnail?url=${encodeURIComponent(thumb)}`
            : guaranteedThumb,
          heights: [720, 1080],
          max_height: 1080,
          est: {},
          formats_map: {
            '1080': media.video_url,
            '720': media.video_url
          },
          direct_video_url: media.video_url,
          direct_audio_url: media.video_url
        };
      }
    }
  } catch (err) {
    console.warn('Instagram GraphQL fallback notice:', err);
  }

  return null;
}

/**
 * Helper: Extract Twitter / X Video via FXTwitter / VXTwitter / Syndication / SaveVideo APIs
 * Selects the direct .mp4 variant with the highest bitrate so downloads complete to 100%.
 */
async function extractTwitterMedia(url: string): Promise<ExtractedPlatformMedia | null> {
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:[^/]+\/)?(?:status|statuses|videos)\/(\d+)/i);
  const tweetId = match ? match[1] : null;
  if (!tweetId) return null;

  // 1. FXTwitter & VXTwitter JSON APIs (with variant bitrate sorting)
  const apis = [
    `https://api.fxtwitter.com/status/${tweetId}`,
    `https://api.vxtwitter.com/Twitter/status/${tweetId}`
  ];

  for (const apiUrl of apis) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);
      const res = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': DESKTOP_CHROME_UA },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const tweet = data?.tweet || data;
        const mediaList = tweet?.media?.videos || tweet?.media_extended || tweet?.media?.all || [];
        const videoItems = Array.isArray(mediaList)
          ? mediaList.filter(
              (m: any) =>
                m &&
                (m.type === 'video' ||
                  m.type === 'gif' ||
                  (typeof m.url === 'string' && m.url.includes('.mp4')))
            )
          : [];

        if (videoItems.length > 0) {
          const videoItem = videoItems[0];
          const variants: Array<{ url: string; bitrate: number; height: number }> = [];

          if (Array.isArray(videoItem.variants)) {
            for (const v of videoItem.variants) {
              if (
                v &&
                typeof v.url === 'string' &&
                v.url.includes('.mp4') &&
                !v.url.includes('.m3u8')
              ) {
                const resMatch = v.url.match(/\/(\d{2,4})x(\d{2,4})\//);
                const h = resMatch ? Math.min(Number(resMatch[1]), Number(resMatch[2])) : 720;
                variants.push({
                  url: v.url,
                  bitrate: Number(v.bitrate) || h * 1500,
                  height: h
                });
              }
            }
          }

          if (typeof videoItem.url === 'string' && videoItem.url.includes('.mp4')) {
            const resMatch = videoItem.url.match(/\/(\d{2,4})x(\d{2,4})\//);
            const h = resMatch ? Math.min(Number(resMatch[1]), Number(resMatch[2])) : 1080;
            variants.push({
              url: videoItem.url,
              bitrate: Number(videoItem.bitrate) || 9999999,
              height: h
            });
          }

          variants.sort((a, b) => b.bitrate - a.bitrate);
          const bestMp4Url = variants[0]?.url || videoItem.url;

          if (bestMp4Url) {
            const formatsMap: Record<string, string> = {};
            const heights: number[] = [];
            for (const vr of variants) {
              const stdH = vr.height >= 1080 ? 1080 : vr.height >= 720 ? 720 : vr.height >= 480 ? 480 : 360;
              if (!formatsMap[String(stdH)]) {
                formatsMap[String(stdH)] = vr.url;
              }
              if (!heights.includes(stdH)) heights.push(stdH);
            }
            if (heights.length === 0) {
              heights.push(720, 1080);
            }
            formatsMap['1080'] = formatsMap['1080'] || bestMp4Url;
            formatsMap['720'] = formatsMap['720'] || bestMp4Url;
            heights.sort((a, b) => a - b);

            const thumb = videoItem.thumbnail_url || tweet?.mediaURLs?.[0] || '';
            const dur = videoItem.duration_millis
              ? Math.round(videoItem.duration_millis / 1000)
              : Math.round(Number(videoItem.duration) || 30);
            const author = tweet.user_name
              ? `${tweet.user_name} (@${tweet.user_screen_name || 'x'})`
              : tweet.author?.name || 'X / Twitter';
            const title = (tweet.text || `X Video (${tweetId})`).replace(/\s+/g, ' ').trim().slice(0, 95);

            return {
              platform: 'twitter',
              title,
              author,
              duration: dur,
              thumbnail: thumb ? `/api/media/thumbnail?url=${encodeURIComponent(thumb)}` : '',
              heights,
              max_height: heights[heights.length - 1] || 1080,
              est: {},
              formats_map: formatsMap,
              direct_video_url: bestMp4Url,
              direct_audio_url: bestMp4Url
            };
          }
        }
      }
    } catch {
      // continue to next API
    }
  }

  // 2. Twitter Syndication API fallback (with authentic mathematical syndication token)
  try {
    const synToken = ((Number(tweetId) / 1e15) * Math.PI)
      .toString(36)
      .replace(/(0+|\.)/g, '');
    const synRes = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${synToken || 'x'}`,
      { headers: { 'Accept': 'application/json', 'User-Agent': DESKTOP_CHROME_UA } }
    );
    if (synRes.ok) {
      const synData = await synRes.json();
      const mediaDetails = synData?.mediaDetails || [];
      for (const m of mediaDetails) {
        const rawVariants = m?.video_info?.variants || [];
        const mp4Variants = rawVariants
          .filter((v: any) => v && v.content_type === 'video/mp4' && typeof v.url === 'string')
          .sort((a: any, b: any) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
        if (mp4Variants.length > 0) {
          const bestMp4 = mp4Variants[0].url;
          const thumb = m.media_url_https || synData?.photos?.[0]?.url || '';
          return {
            platform: 'twitter',
            title: (synData.text || `X Video (${tweetId})`).replace(/\s+/g, ' ').trim().slice(0, 95),
            author: synData?.user?.name ? `${synData.user.name} (@${synData.user.screen_name})` : 'X / Twitter',
            duration: m?.video_info?.duration_millis ? Math.round(m.video_info.duration_millis / 1000) : 30,
            thumbnail: thumb ? `/api/media/thumbnail?url=${encodeURIComponent(thumb)}` : '',
            heights: [720, 1080],
            max_height: 1080,
            est: {},
            formats_map: { '1080': bestMp4, '720': bestMp4 },
            direct_video_url: bestMp4,
            direct_audio_url: bestMp4
          };
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. SaveVideo Live Resolver fallback for Twitter / X
  try {
    const svTw = await resolveViaSaveVideoBackend(url, 12);
    if (svTw && svTw.directVideoUrl) {
      const sizeBytes = svTw.fileSize > 30000 ? svTw.fileSize : 6500000;
      return {
        platform: 'twitter',
        title: svTw.title || `X Video (${tweetId})`,
        author: 'X / Twitter',
        duration: 35,
        thumbnail: '',
        heights: [720, 1080],
        max_height: 1080,
        est: { '720': Math.round(sizeBytes * 0.75), '1080': sizeBytes },
        formats_map: { '1080': svTw.directVideoUrl, '720': svTw.directVideoUrl },
        direct_video_url: svTw.directVideoUrl,
        direct_audio_url: svTw.directAudioUrl || svTw.directVideoUrl
      };
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Helper: Extract Facebook Video with Guaranteed Audio+Video Progressive MP4 Stream
 * Prevents silent DASH video-only streams by extracting combined Progressive HD/SD MP4 streams.
 */
async function extractFacebookMedia(url: string): Promise<ExtractedPlatformMedia | null> {
  if (!/(?:facebook\.com|fb\.watch|fb\.com)/i.test(url)) return null;

  // Quick helper to scrape Facebook OpenGraph thumbnail so Facebook cards always have a real thumbnail
  let fbScrapedThumb = '';
  let fbScrapedTitle = '';
  try {
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': MOBILE_SAFARI_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const ogImg = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
      const ogTit = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
      if (ogImg) fbScrapedThumb = `/api/media/thumbnail?url=${encodeURIComponent(decodeHtmlEntities(ogImg))}`;
      if (ogTit) fbScrapedTitle = decodeHtmlEntities(ogTit).trim().slice(0, 95);
    }
  } catch {
    // ignore
  }

  // 1. Try SaveVideo Backend Resolver first (muxes audio + video into progressive MP4)
  try {
    const svResolved = await resolveViaSaveVideoBackend(url, 16);
    if (svResolved && svResolved.directVideoUrl) {
      const sizeBytes = svResolved.fileSize > 30000 ? svResolved.fileSize : 9500000;
      return {
        platform: 'facebook',
        title: svResolved.title || fbScrapedTitle || 'Facebook Video (HD with Audio)',
        author: 'Facebook Creator',
        duration: 45,
        thumbnail: fbScrapedThumb,
        heights: [720, 1080],
        max_height: 1080,
        est: {
          '720': Math.round(sizeBytes * 0.75),
          '1080': sizeBytes
        },
        formats_map: {
          '1080': svResolved.directVideoUrl,
          '720': svResolved.directVideoUrl
        },
        direct_video_url: svResolved.directVideoUrl,
        direct_audio_url: svResolved.directAudioUrl || svResolved.directVideoUrl
      };
    }
  } catch (err) {
    console.warn('Facebook SaveVideo resolver notice:', err);
  }

  // 2. Scrape Facebook Progressive HD / SD MP4 (browser_native_hd_url / playable_url_quality_hd / hd_src / sd_src)
  // These progressive streams always contain multiplexed AAC audio + H.264 video (never silent DASH video-only).
  for (const ua of [DESKTOP_CHROME_UA, MOBILE_SAFARI_UA]) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Mode': 'navigate'
        },
        redirect: 'follow'
      });
      if (!res.ok) continue;
      const html = await res.text();

      const extractCleanFbUrl = (patterns: RegExp[]): string | null => {
        for (const rx of patterns) {
          const m = html.match(rx);
          if (m && m[1]) {
            const cleaned = decodeHtmlEntities(
              m[1]
                .replace(/\\u0025/g, '%')
                .replace(/\\u0026/g, '&')
                .replace(/\\\//g, '/')
                .replace(/\\/g, '')
            );
            if (cleaned.startsWith('http') && !cleaned.includes('bytestart=')) {
              return cleaned;
            }
          }
        }
        return null;
      };

      const hdUrl = extractCleanFbUrl([
        /"browser_native_hd_url"\s*:\s*"([^"]+)"/i,
        /"playable_url_quality_hd"\s*:\s*"([^"]+)"/i,
        /"hd_src_no_ratelimit"\s*:\s*"([^"]+)"/i,
        /"hd_src"\s*:\s*"([^"]+)"/i,
        /hd_src\s*:\s*"([^"]+)"/i
      ]);

      const sdUrl = extractCleanFbUrl([
        /"browser_native_sd_url"\s*:\s*"([^"]+)"/i,
        /"playable_url"\s*:\s*"([^"]+)"/i,
        /"sd_src_no_ratelimit"\s*:\s*"([^"]+)"/i,
        /"sd_src"\s*:\s*"([^"]+)"/i,
        /sd_src\s*:\s*"([^"]+)"/i
      ]);

      const chosenProgressiveUrl = hdUrl || sdUrl;
      if (chosenProgressiveUrl) {
        const ogTitle =
          html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
          html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
          'Facebook Video';
        const ogImage =
          html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] || '';
        const cleanThumb = ogImage ? decodeHtmlEntities(ogImage) : '';

        const formatsMap: Record<string, string> = {};
        const heights: number[] = [];
        if (hdUrl) {
          formatsMap['1080'] = hdUrl;
          formatsMap['720'] = hdUrl;
          heights.push(720, 1080);
        }
        if (sdUrl) {
          formatsMap['480'] = sdUrl;
          if (!formatsMap['720']) formatsMap['720'] = sdUrl;
          if (!heights.includes(480)) heights.unshift(480);
          if (!heights.includes(720)) heights.push(720);
        }

        return {
          platform: 'facebook',
          title: decodeHtmlEntities(ogTitle).trim().slice(0, 95),
          author: 'Facebook',
          duration: 60,
          thumbnail: cleanThumb ? `/api/media/thumbnail?url=${encodeURIComponent(cleanThumb)}` : '',
          heights,
          max_height: hdUrl ? 1080 : 720,
          est: {},
          formats_map: formatsMap,
          direct_video_url: chosenProgressiveUrl,
          direct_audio_url: chosenProgressiveUrl
        };
      }
    } catch {
      // try next UA
    }
  }

  return null;
}

/**
 * Helper: Extract via local /bin/yt-dlp binary if present
 * Always prioritizes Progressive Combined Audio+Video streams (`acodec !== 'none' && vcodec !== 'none'`)
 * so downloaded Facebook / YouTube / Twitter videos are never silent.
 */
async function extractViaYtDlp(
  url: string,
  targetHeight?: number
): Promise<ExtractedPlatformMedia | null> {
  try {
    if (!fs.existsSync(YTDLP_BIN)) return null;
    const cleanKey = `${url.trim().split('?')[0]}::${targetHeight || 'all'}`;
    const cached = ytDlpResultCache.get(cleanKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const args = ['--dump-json', '--no-playlist', '--no-warnings', '--no-check-certificates'];
    if (targetHeight && targetHeight > 0) {
      // Lock format filter strictly to requested height (supports both horizontal height<=H and vertical 9:16 width<=H)
      args.push(
        '-f',
        `bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]/best[width<=${targetHeight}]/best`
      );
    }
    args.push(url);

    const { stdout } = await execFileAsync(YTDLP_BIN, args, {
      timeout: 14000,
      maxBuffer: 10 * 1024 * 1024
    });
    if (!stdout) return null;
    const info = JSON.parse(stdout.trim().split('\n')[0]);
    if (!info) return null;

    const progressiveMap: Record<string, string> = {};
    const fallbackVideoMap: Record<string, string> = {};
    const heights: number[] = [];
    const est: Record<string, number> = {};
    let bestAudioUrl: string | undefined;
    let bestProgressiveUrl: string | undefined;
    let bestFallbackVideoUrl: string | undefined =
      typeof info.url === 'string' &&
      !info.url.includes('manifest.googlevideo.com') &&
      !info.url.includes('.m3u8') &&
      !info.url.includes('.mpd')
        ? info.url
        : undefined;

    const durationSec = Math.max(1, Math.round(Number(info.duration) || 35));
    const progressiveList: Array<{
      url: string;
      shortDim: number;
      rawHeight: number;
      bytes: number;
      isH264: boolean;
    }> = [];

    if (Array.isArray(info.formats)) {
      for (const f of info.formats) {
        if (!f.url || f.protocol === 'mhtml') continue;
        const proto = String(f.protocol || '').toLowerCase();
        const fUrl = String(f.url || '');
        if (
          proto.includes('m3u8') ||
          proto.includes('dash') ||
          fUrl.includes('manifest.googlevideo.com') ||
          fUrl.includes('.m3u8') ||
          fUrl.includes('.mpd')
        ) {
          continue;
        }
        const isDirectMp4 =
          f.ext === 'mp4' || f.ext === 'webm' || proto === 'https' || proto === 'http';
        const hasVideo =
          Boolean(f.vcodec && f.vcodec !== 'none') ||
          (f.ext === 'mp4' && !String(f.format_id || '').includes('audio'));
        const hasAudio = Boolean(f.acodec && f.acodec !== 'none');

        if (hasVideo && isDirectMp4) {
          const w = Number(f.width) || 0;
          const rawH =
            Number(f.height) || (f.format_id === 'hd' ? 1080 : f.format_id === 'sd' ? 480 : 720);
          // Normalize vertical 9:16 video dimensions (e.g. 576x1024 -> 576, 720x1280 -> 720, 1080x1920 -> 1080)
          const shortDim = w > 0 && rawH > 0 ? Math.min(w, rawH) : rawH;
          const bucketH =
            shortDim <= 380
              ? 360
              : shortDim <= 580
              ? 480
              : shortDim <= 760
              ? 720
              : 1080;

          if (!heights.includes(bucketH)) heights.push(bucketH);
          const estBytes = Number(
            f.filesize ||
              f.filesize_approx ||
              (f.tbr ? Math.round(((Number(f.tbr) * 1000) / 8) * durationSec) : 0)
          );

          if (hasAudio || f.format_id === 'hd' || f.format_id === 'sd') {
            progressiveList.push({
              url: fUrl,
              shortDim,
              rawHeight: bucketH,
              bytes: estBytes,
              isH264: /avc1|h264/i.test(String(f.vcodec || ''))
            });
            // Keep lowest-bitrate stream for 360/480 buckets and highest-bitrate for 1080
            if (bucketH <= 480) {
              if (!progressiveMap[String(bucketH)] || (estBytes > 0 && (!est[String(bucketH)] || estBytes < est[String(bucketH)]))) {
                progressiveMap[String(bucketH)] = fUrl;
                if (estBytes > 0) est[String(bucketH)] = estBytes;
              }
            } else {
              progressiveMap[String(bucketH)] = fUrl;
              if (estBytes > 0) est[String(bucketH)] = estBytes;
            }
            bestProgressiveUrl = fUrl;
          } else {
            fallbackVideoMap[String(bucketH)] = fUrl;
            if (estBytes > 0 && !est[String(bucketH)]) {
              est[String(bucketH)] = estBytes;
            }
            bestFallbackVideoUrl = fUrl;
          }
        } else if (hasAudio && (!f.vcodec || f.vcodec === 'none')) {
          bestAudioUrl = fUrl;
        }
      }
    }

    // Sort all progressive streams by byte size / bitrate ascending so 360p, 480p, 720p, 1080p map to distinct tiers
    if (progressiveList.length > 0) {
      progressiveList.sort((a, b) => {
        if (a.bytes > 0 && b.bytes > 0 && a.bytes !== b.bytes) return a.bytes - b.bytes;
        return a.shortDim - b.shortDim;
      });
      const n = progressiveList.length;
      const tier360 = progressiveList[0];
      const tier480 = progressiveList[Math.min(n - 1, Math.floor((n - 1) * 0.35))];
      const tier720 = progressiveList[Math.min(n - 1, Math.floor((n - 1) * 0.7))];
      const tier1080 = progressiveList[n - 1];

      if (!progressiveMap['360'] && tier360) {
        progressiveMap['360'] = tier360.url;
        if (tier360.bytes > 0) est['360'] = tier360.bytes;
      }
      if (!progressiveMap['480'] && tier480) {
        progressiveMap['480'] = tier480.url;
        if (tier480.bytes > 0) est['480'] = tier480.bytes;
      }
      if (!progressiveMap['720'] && tier720) {
        progressiveMap['720'] = tier720.url;
        if (tier720.bytes > 0) est['720'] = tier720.bytes;
      }
      if (!progressiveMap['1080'] && tier1080) {
        progressiveMap['1080'] = tier1080.url;
        if (tier1080.bytes > 0) est['1080'] = tier1080.bytes;
      }
      for (const hVal of [360, 480, 720, 1080]) {
        if (progressiveMap[String(hVal)] && !heights.includes(hVal)) {
          heights.push(hVal);
        }
      }
    }

    if (targetHeight && bestFallbackVideoUrl && !progressiveMap[String(targetHeight)]) {
      progressiveMap[String(targetHeight)] = bestFallbackVideoUrl;
    }

    heights.sort((a, b) => a - b);
    const hasProgressive = Object.keys(progressiveMap).length > 0;
    const isYouTubeExtractor = String(info.extractor_key || info.extractor || '')
      .toLowerCase()
      .includes('youtube');
    const chosenFormatsMap = hasProgressive
      ? progressiveMap
      : isYouTubeExtractor
      ? {}
      : fallbackVideoMap;
    const bestVideoUrl =
      (targetHeight ? chosenFormatsMap[String(targetHeight)] : undefined) ||
      bestProgressiveUrl ||
      (heights.length > 0 ? chosenFormatsMap[String(heights[heights.length - 1])] : undefined) ||
      (isYouTubeExtractor ? undefined : bestFallbackVideoUrl);

    if (!bestVideoUrl) return null;

    const rawThumb =
      info.thumbnail ||
      (Array.isArray(info.thumbnails) && info.thumbnails[info.thumbnails.length - 1]?.url) ||
      '';
    const result: ExtractedPlatformMedia = {
      platform: String(info.extractor_key || info.extractor || 'Media').toLowerCase(),
      title: info.title || info.fulltitle || 'Video Stream',
      author: info.uploader || info.channel || info.creator || undefined,
      duration: durationSec,
      thumbnail: rawThumb ? `/api/media/thumbnail?url=${encodeURIComponent(rawThumb)}` : '',
      viewsCount: info.view_count ? String(info.view_count) : undefined,
      heights: heights.length > 0 ? heights : [360, 480, 720, 1080],
      max_height: heights[heights.length - 1] || 1080,
      est,
      formats_map:
        Object.keys(chosenFormatsMap).length > 0
          ? chosenFormatsMap
          : { '720': bestVideoUrl, '1080': bestVideoUrl },
      direct_video_url: bestVideoUrl,
      direct_audio_url: bestAudioUrl || bestVideoUrl
    };
    ytDlpResultCache.set(cleanKey, { data: result, expiresAt: Date.now() + 10 * 60 * 1000 });
    return result;
  } catch {
    return null;
  }
}

/**
 * Helper: Extract Generic OpenGraph Video / Audio / Metadata from any webpage
 */
async function extractOpenGraphMedia(url: string): Promise<ExtractedPlatformMedia | null> {
  try {
    if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)) {
      const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Video.mp4');
      return {
        platform: 'generic',
        title: fileName.replace(/\.(mp4|webm|mov|m4v)$/i, ''),
        author: new URL(url).hostname.replace(/^www\./, ''),
        duration: 120,
        thumbnail: '',
        heights: [720, 1080],
        max_height: 1080,
        est: {},
        formats_map: { '720': url, '1080': url },
        direct_video_url: url,
        direct_audio_url: url
      };
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    if (!res.ok) return null;
    const html = await res.text();

    const ogTitle =
      html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const ogImage =
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
    const ogVideo =
      html.match(/<meta\s+property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta\s+property=["']og:video:url["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<video[^>]+src=["']([^"']+\.mp4[^"']*)["']/i)?.[1] ||
      html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i)?.[1];

    if (ogVideo && !ogVideo.includes('.swf') && !ogVideo.includes('embed')) {
      const cleanVideo = decodeHtmlEntities(ogVideo);
      const cleanThumb = ogImage ? decodeHtmlEntities(ogImage) : '';
      return {
        platform: new URL(url).hostname.replace(/^www\./, ''),
        title: decodeHtmlEntities(ogTitle || 'Media Video').trim(),
        author: new URL(url).hostname.replace(/^www\./, ''),
        duration: 120,
        thumbnail: cleanThumb ? `/api/media/thumbnail?url=${encodeURIComponent(cleanThumb)}` : '',
        heights: [720, 1080],
        max_height: 1080,
        est: {},
        formats_map: { '720': cleanVideo, '1080': cleanVideo },
        direct_video_url: cleanVideo,
        direct_audio_url: cleanVideo
      };
    }
  } catch {
    // ignore
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // CORS headers for all API requests (including Range & Content-Range for parallel multi-segment downloads)
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Content-Length, Accept-Ranges, Content-Type, Content-Disposition'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  /**
   * 1. Probe Media Endpoint (Extracts real title, duration, resolutions, thumbnails, and direct stream URLs)
   */
  app.post('/api/media/probe', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // A. Aparat (aparat.com/v/...)
      if (/aparat\.com/i.test(url)) {
        const aparatData = await extractAparatMedia(url);
        if (aparatData) {
          return res.json({
            success: true,
            ...aparatData
          });
        }
      }

      // B. Instagram (instagram.com/reel/..., /p/..., /tv/...)
      if (/(?:instagram\.com|instagr\.am)/i.test(url)) {
        const igData = (await extractInstagramMedia(url)) || (await extractViaYtDlp(url));
        if (igData) {
          return res.json({
            success: true,
            ...igData
          });
        }
      }

      // C. Twitter / X (twitter.com / x.com)
      if (/(?:twitter\.com|x\.com)/i.test(url)) {
        const twData = (await extractTwitterMedia(url)) || (await extractViaYtDlp(url));
        if (twData) {
          return res.json({
            success: true,
            ...twData
          });
        }
      }

      // C2. Facebook (facebook.com, fb.watch, fb.com) — Combined Progressive Audio+Video MP4
      if (/(?:facebook\.com|fb\.watch|fb\.com)/i.test(url)) {
        const fbData = (await extractFacebookMedia(url)) || (await extractViaYtDlp(url));
        if (fbData) {
          return res.json({
            success: true,
            ...fbData
          });
        }
      }

      // D. TikTok (tiktok.com, vt.tiktok.com, vm.tiktok.com) — Resolution-Locked Stream & Volume Binding
      const isTikTok = /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(url);
      if (isTikTok) {
        const [d, ytdlpTikTok] = await Promise.all([
          resolveViaTikWMServer(url, 720, false),
          extractViaYtDlp(url)
        ]);
        if (d || ytdlpTikTok) {
          const meta = computeTikTokResolutionMeta(d, ytdlpTikTok);
          const cleanTikTokUrl = url.trim();
          // Bind each resolution to its dedicated server stream endpoint keyed by url::height::type
          const resolutionBoundMap: Record<string, string> = {
            '1080': `/api/media/stream?url=${encodeURIComponent(cleanTikTokUrl)}&quality=1080&audio=0`,
            '720': `/api/media/stream?url=${encodeURIComponent(cleanTikTokUrl)}&quality=720&audio=0`,
            '480': `/api/media/stream?url=${encodeURIComponent(cleanTikTokUrl)}&quality=480&audio=0`,
            '360': `/api/media/stream?url=${encodeURIComponent(cleanTikTokUrl)}&quality=360&audio=0`
          };
          const rawThumb = d?.cover || '';
          return res.json({
            success: true,
            platform: 'TikTok',
            title:
              d?.title ||
              ytdlpTikTok?.title ||
              `TikTok Video (@${d?.author?.unique_id || 'creator'})`,
            author: d?.author?.nickname
              ? `${d.author.nickname} (@${d.author.unique_id})`
              : ytdlpTikTok?.author,
            duration: d?.duration || ytdlpTikTok?.duration || 30,
            max_height: 1080,
            heights: [360, 480, 720, 1080],
            est: meta.est,
            thumbnail: rawThumb
              ? `/api/media/thumbnail?url=${encodeURIComponent(rawThumb)}`
              : ytdlpTikTok?.thumbnail || '',
            formats_map: resolutionBoundMap,
            direct_video_url: resolutionBoundMap['720'],
            direct_audio_url:
              meta.musicUrl ||
              `/api/media/stream?url=${encodeURIComponent(cleanTikTokUrl)}&quality=720&audio=1`
          });
        }
      }

      // E. YouTube (youtube.com/watch?v=..., youtube.com/shorts/..., youtu.be/...)
      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      const ytMatch = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/i
      );
      const ytId = ytMatch ? ytMatch[1] : null;

      if (isYouTube) {
        const canonicalYtUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : url;
        const isShortsUrl = /\/shorts\//i.test(url);

        // Background pre-warm of 720p progressive MP4 stream on SaveVideo so download starts immediately when user clicks
        resolveViaSaveVideoBackend(canonicalYtUrl, 28, false, 720, false).catch(() => {});

        const signedFormatsMap: Record<string, string> = {
          '1080': `/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=1080&audio=0`,
          '720': `/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=720&audio=0`,
          '480': `/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=480&audio=0`,
          '360': `/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=360&audio=0`
        };
        const signedAudioUrl = `/api/media/stream?url=${encodeURIComponent(canonicalYtUrl)}&quality=720&audio=1`;

        try {
          const probeRes = await fetch(`${SAVEVIDEO_BASE}/api/yt/probe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Referer': `${SAVEVIDEO_BASE}/`,
              'User-Agent': DESKTOP_CHROME_UA
            },
            body: JSON.stringify({ url: canonicalYtUrl })
          });

          if (probeRes.ok) {
            const data = await probeRes.json();
            let cleanTitle =
              data.title ||
              (isShortsUrl || data.is_shorts
                ? `YouTube Shorts (${ytId || ''})`
                : ytId
                ? `YouTube Video (${ytId})`
                : 'YouTube Media');
            let authorName: string | undefined;

            if (cleanTitle.startsWith('YouTube ')) {
              try {
                const oeRes = await fetch(
                  `https://noembed.com/embed?url=${encodeURIComponent(canonicalYtUrl)}`
                );
                if (oeRes.ok) {
                  const oeData = await oeRes.json();
                  if (oeData?.title) cleanTitle = oeData.title;
                  if (oeData?.author_name) authorName = oeData.author_name;
                }
              } catch {
                // ignore
              }
            }

            const cleanedEst: Record<string, number> = {};
            if (data.est && typeof data.est === 'object') {
              for (const [k, v] of Object.entries(data.est)) {
                if (typeof v === 'number' && v > 500000) {
                  cleanedEst[k] = v;
                }
              }
            }
            return res.json({
              success: true,
              platform: 'YouTube',
              title: cleanTitle,
              author: authorName,
              duration: data.duration || (isShortsUrl || data.is_shorts ? 45 : 120),
              max_height: data.max_height || 1080,
              heights: data.heights || [360, 480, 720, 1080],
              est: cleanedEst,
              audio_est: typeof data.audio_est === 'number' && data.audio_est > 150000 ? data.audio_est : undefined,
              is_shorts: isShortsUrl || !!data.is_shorts,
              thumbnail: ytId ? `/api/media/thumbnail?yt=${ytId}` : '',
              formats_map: signedFormatsMap,
              direct_video_url: signedFormatsMap['720'],
              direct_audio_url: signedAudioUrl
            });
          }
        } catch {
          // continue to fallback
        }
      }

      // F. Universal yt-dlp or OpenGraph extraction for Vimeo, SoundCloud, Pinterest, etc.
      const ytdlpData = await extractViaYtDlp(url);
      if (ytdlpData) {
        return res.json({
          success: true,
          ...ytdlpData
        });
      }

      const ogData = await extractOpenGraphMedia(url);
      if (ogData) {
        return res.json({
          success: true,
          ...ogData
        });
      }

      return res.status(422).json({
        success: false,
        error: 'Could not resolve media metadata from source URL'
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Probe failed';
      console.error('Probe error:', message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * 2. Start Download Endpoint (Initiates real stream resolution on backend)
   */
  app.post('/api/media/start', async (req, res) => {
    try {
      const { url, height, audio } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Engine A: Aparat Direct Stream Resolution (Strictly matches requested height first)
      if (/aparat\.com/i.test(url)) {
        const aparatData = await extractAparatMedia(url);
        if (aparatData && aparatData.direct_video_url) {
          const reqH = Number(height) || 720;
          const targetHeight = String(reqH);
          const availableHeights = (aparatData.heights || [360, 480, 720, 1080]).slice().sort((a, b) => a - b);
          // Pick exact height, or closest height <= reqH, or lowest available
          const bestMatchHeight =
            availableHeights.find((h) => h === reqH) ||
            availableHeights.slice().reverse().find((h) => h <= reqH) ||
            availableHeights[0] ||
            720;
          const chosenStream =
            aparatData.formats_map[targetHeight] ||
            aparatData.formats_map[String(bestMatchHeight)] ||
            aparatData.direct_video_url;
          return res.json({
            status: 'done',
            direct_url: chosenStream,
            title: aparatData.title,
            file_size: aparatData.est[targetHeight] || aparatData.est[String(bestMatchHeight)] || 15000000,
            thumbnail: aparatData.thumbnail
          });
        }
      }

      // Engine B: Instagram Direct Stream Resolution (Force fresh token when starting download)
      if (/(?:instagram\.com|instagr\.am)/i.test(url)) {
        const igData = (await extractInstagramMedia(url, true)) || (await extractViaYtDlp(url));
        if (igData && igData.direct_video_url) {
          return res.json({
            status: 'done',
            direct_url: igData.direct_video_url,
            title: igData.title,
            file_size: igData.est?.['1080'] || 8400000,
            thumbnail: igData.thumbnail
          });
        }
      }

      // Engine C: Twitter / X Direct Stream Resolution (Highest bitrate MP4)
      if (/(?:twitter\.com|x\.com)/i.test(url)) {
        const twData = (await extractTwitterMedia(url)) || (await extractViaYtDlp(url));
        if (twData && twData.direct_video_url) {
          const targetHeight = String(height || 1080);
          const chosenUrl = twData.formats_map[targetHeight] || twData.direct_video_url;
          return res.json({
            status: 'done',
            direct_url: chosenUrl,
            title: twData.title,
            file_size: 7500000,
            thumbnail: twData.thumbnail
          });
        }
      }

      // Engine C2: Facebook Progressive Audio+Video Stream Resolution (Never silent DASH video-only)
      if (/(?:facebook\.com|fb\.watch|fb\.com)/i.test(url)) {
        const fbData = (await extractFacebookMedia(url)) || (await extractViaYtDlp(url));
        if (fbData && fbData.direct_video_url) {
          const targetHeight = String(height || 1080);
          const chosenUrl = fbData.formats_map[targetHeight] || fbData.direct_video_url;
          return res.json({
            status: 'done',
            direct_url: chosenUrl,
            title: fbData.title,
            file_size: fbData.est[targetHeight] || 9500000,
            thumbnail: fbData.thumbnail
          });
        }
      }

      // Engine D: TikTok Direct Stream API (Strictly matches requested height 360p/480p/720p/1080p via url::height::type)
      const isTikTok = /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(url);
      if (isTikTok) {
        const reqH = Number(height) || 720;
        const heightBucket = reqH <= 360 ? '360' : reqH <= 480 ? '480' : reqH <= 720 ? '720' : '1080';
        const [d, ytdlpTikTok] = await Promise.all([
          resolveViaTikWMServer(url, Number(heightBucket), !!audio),
          extractViaYtDlp(url, Number(heightBucket))
        ]);
        if (d || ytdlpTikTok) {
          const meta = computeTikTokResolutionMeta(d, ytdlpTikTok);
          let chosenSize = meta.est[heightBucket as keyof typeof meta.est] || meta.est['720'];
          const rawChosenUrl = meta.rawUrls[heightBucket as keyof typeof meta.rawUrls] || meta.rawUrls['720'];

          // If user requested 360p or 480p and upstream only gave a single high-bitrate stream, pre-transcode to exact target height
          if (!audio && Number(heightBucket) <= 480 && !meta.hasDistinctLowResStream && rawChosenUrl) {
            const transcoded = await transcodeTikTokToTargetHeight(
              url,
              rawChosenUrl,
              Number(heightBucket)
            );
            if (transcoded && transcoded.size > 0) {
              chosenSize = transcoded.size;
            }
          }

          const streamBoundUrl = `/api/media/stream?url=${encodeURIComponent(
            url.trim()
          )}&quality=${heightBucket}&audio=${audio ? '1' : '0'}`;

          return res.json({
            status: 'done',
            direct_url: audio ? meta.musicUrl || streamBoundUrl : streamBoundUrl,
            fallback_urls: audio
              ? [meta.musicUrl, streamBoundUrl, rawChosenUrl].filter(Boolean)
              : [streamBoundUrl, rawChosenUrl].filter(Boolean),
            title: d?.title || ytdlpTikTok?.title || 'TikTok Video',
            file_size: audio ? Math.round(meta.est['720'] * 0.25) : chosenSize,
            thumbnail: d?.cover || ytdlpTikTok?.thumbnail || ''
          });
        }
      }

      // Engine E: YouTube Binary Offline Download Pipeline (Unified for Standard watch?v=, Shorts /shorts/, and youtu.be/)
      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      if (isYouTube) {
        const ytMatch = url.match(
          /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/i
        );
        const ytId = ytMatch ? ytMatch[1] : null;
        // Canonical watch URL ensures both YouTube Shorts and standard videos mux cleanly into Progressive MP4 via /api/yt/start
        const canonicalYtUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : url;
        const reqHeight = Number(height) || 720;

        // 0. Check if pre-warmed SaveVideo result for this EXACT height is already ready in saveVideoResultCache
        const exactKey = `${canonicalYtUrl}::${reqHeight}::${audio ? 'a' : 'v'}`;
        const cachedYt = saveVideoResultCache.get(exactKey);

        if (cachedYt && Date.now() - cachedYt.createdAt < 10 * 60 * 1000) {
          return res.json({
            status: 'done',
            task_id: cachedYt.taskId,
            file_token: cachedYt.fileToken,
            direct_url: audio ? cachedYt.directAudioUrl : cachedYt.directVideoUrl,
            title: cachedYt.title,
            file_size: cachedYt.fileSize
          });
        }

        // 1. Resolve via SaveVideo Backend directly inside /api/media/start (up to 20s server-side polling)
        // so the browser receives status: 'done' + direct_url in a single HTTP request (0 polling QPS!)
        const svDirect = await resolveViaSaveVideoBackend(
          canonicalYtUrl,
          20,
          false,
          reqHeight,
          !!audio
        );
        if (svDirect && svDirect.taskId) {
          return res.json({
            status: 'done',
            task_id: svDirect.taskId,
            file_token: svDirect.fileToken,
            direct_url: audio ? svDirect.directAudioUrl : svDirect.directVideoUrl,
            title: svDirect.title,
            file_size: svDirect.fileSize
          });
        }

        // 1b. If video is still muxing after 20s, start/return task_id for client status polling
        for (const candidateYtUrl of [canonicalYtUrl, url]) {
          try {
            const startRes = await fetch(`${SAVEVIDEO_BASE}/api/yt/start`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Referer': `${SAVEVIDEO_BASE}/`,
                'User-Agent': DESKTOP_CHROME_UA
              },
              body: JSON.stringify({
                url: candidateYtUrl,
                height: reqHeight,
                audio: !!audio
              })
            });

            if (startRes.ok) {
              const data = await startRes.json();
              if (data && (data.task_id || data.status === 'done')) {
                if (data.task_id) {
                  taskSourceUrlMap.set(data.task_id, {
                    url: candidateYtUrl,
                    height: reqHeight,
                    audio: !!audio
                  });
                }
                return res.json(data);
              }
            }
          } catch (svErr) {
            console.warn('YouTube SaveVideo /api/yt/start notice:', svErr);
          }
        }

        // 2. Fallback: Local yt-dlp progressive stream (matches exact or closest <= reqHeight)
        const ytdlpYt = await extractViaYtDlp(url);
        if (ytdlpYt && ytdlpYt.direct_video_url) {
          const availH = Object.keys(ytdlpYt.formats_map)
            .map((k) => Number(k))
            .filter((n) => !isNaN(n) && n > 0)
            .sort((a, b) => a - b);
          const lowerEq = availH.filter((h) => h <= reqHeight);
          const pickedH =
            lowerEq.length > 0
              ? String(lowerEq[lowerEq.length - 1])
              : availH.length > 0
              ? String(availH[0])
              : String(reqHeight);
          const chosenUrl = audio
            ? ytdlpYt.direct_audio_url || ytdlpYt.direct_video_url
            : ytdlpYt.formats_map[String(reqHeight)] ||
              ytdlpYt.formats_map[pickedH] ||
              ytdlpYt.direct_video_url;
          return res.json({
            status: 'done',
            direct_url: chosenUrl,
            title: ytdlpYt.title,
            file_size:
              ytdlpYt.est[String(reqHeight)] ||
              ytdlpYt.est[pickedH] ||
              (reqHeight <= 360 ? 3500000 : reqHeight <= 480 ? 6500000 : 14000000),
            thumbnail: ytdlpYt.thumbnail
          });
        }

        // 3. Fallback: Try SaveVideo /api/download generic endpoint (only if high-res or audio)
        if (reqHeight >= 720 || audio) {
          try {
            const dlRes = await fetch(`${SAVEVIDEO_BASE}/api/download`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Referer': `${SAVEVIDEO_BASE}/`,
                'User-Agent': DESKTOP_CHROME_UA
              },
              body: JSON.stringify({ url: canonicalYtUrl })
            });
            if (dlRes.ok) {
              const dlData = await dlRes.json();
              if (dlData && (dlData.task_id || dlData.status === 'done')) {
                if (dlData.task_id) {
                  taskSourceUrlMap.set(dlData.task_id, {
                    url: canonicalYtUrl,
                    height: reqHeight,
                    audio: !!audio
                  });
                }
                return res.json(dlData);
              }
            }
          } catch {
            // continue
          }
        }
      }

      // Engine F: Local yt-dlp binary or OpenGraph direct stream for other platforms
      const ytdlpData = await extractViaYtDlp(url);
      if (ytdlpData && ytdlpData.direct_video_url) {
        const reqH = Number(height) || 720;
        const availH = Object.keys(ytdlpData.formats_map)
          .map((k) => Number(k))
          .filter((n) => !isNaN(n) && n > 0)
          .sort((a, b) => a - b);
        const lowerEq = availH.filter((h) => h <= reqH);
        const pickedH =
          lowerEq.length > 0
            ? String(lowerEq[lowerEq.length - 1])
            : availH.length > 0
            ? String(availH[0])
            : String(reqH);
        const chosenUrl = audio
          ? ytdlpData.direct_audio_url || ytdlpData.direct_video_url
          : ytdlpData.formats_map[String(reqH)] ||
            ytdlpData.formats_map[pickedH] ||
            ytdlpData.direct_video_url;
        return res.json({
          status: 'done',
          direct_url: chosenUrl,
          title: ytdlpData.title,
          file_size: ytdlpData.est[String(reqH)] || ytdlpData.est[pickedH] || 12000000,
          thumbnail: ytdlpData.thumbnail
        });
      }

      const ogData = await extractOpenGraphMedia(url);
      if (ogData && ogData.direct_video_url) {
        return res.json({
          status: 'done',
          direct_url: ogData.direct_video_url,
          title: ogData.title,
          file_size: 10000000,
          thumbnail: ogData.thumbnail
        });
      }

      // Engine G: SaveVideo Backend Pipeline for remaining Global Platforms
      const dlRes = await fetch(`${SAVEVIDEO_BASE}/api/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': `${SAVEVIDEO_BASE}/`,
          'User-Agent': DESKTOP_CHROME_UA
        },
        body: JSON.stringify({ url })
      });

      const data = await dlRes.json();
      if (data?.task_id) {
        taskSourceUrlMap.set(data.task_id, { url, height: height || 720, audio: !!audio });
      }
      return res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Start download failed';
      console.error('Start error:', message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * 3. Poll Download Status Endpoint (with automatic resolution fallback if upstream fails)
   */
  app.get('/api/media/status/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;
      const statusRes = await fetch(`${SAVEVIDEO_BASE}/api/status/${taskId}`, {
        headers: {
          'Referer': `${SAVEVIDEO_BASE}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!statusRes.ok) {
        return res.status(statusRes.status).json({ error: 'Status fetch failed' });
      }

      const data = await statusRes.json();

      if (data.status === 'done') {
        const fileSize = Number(data.file_size) || 0;
        const mappedInfo = taskSourceUrlMap.get(taskId);
        if (!mappedInfo?.audio && fileSize > 0 && fileSize < 120 * 1024 && mappedInfo?.url) {
          const fallbackResolved = await resolveViaSaveVideoBackend(
            mappedInfo.url,
            18,
            true,
            mappedInfo.height || 360,
            false
          );
          if (fallbackResolved && fallbackResolved.taskId) {
            return res.json({
              status: 'done',
              task_id: fallbackResolved.taskId,
              file_token: fallbackResolved.fileToken,
              ext: fallbackResolved.ext,
              title: fallbackResolved.title,
              file_size: fallbackResolved.fileSize,
              file_url: fallbackResolved.directVideoUrl,
              audio_url: fallbackResolved.directAudioUrl
            });
          }
        }

        const fileToken = data.file_token || '';
        const ext = data.ext || 'mp4';
        return res.json({
          ...data,
          file_url: `/api/media/file/${taskId}?t=${encodeURIComponent(fileToken)}&ext=${ext}`,
          audio_url: `/api/media/audio/${taskId}?t=${encodeURIComponent(fileToken)}`
        });
      }

      if (data.status === 'error') {
        const mappedInfo = taskSourceUrlMap.get(taskId);
        if (mappedInfo?.url) {
          const fallbackResolved = await resolveViaSaveVideoBackend(
            mappedInfo.url,
            18,
            true,
            mappedInfo.height || 360,
            !!mappedInfo.audio
          );
          if (fallbackResolved && fallbackResolved.taskId) {
            return res.json({
              status: 'done',
              task_id: fallbackResolved.taskId,
              file_token: fallbackResolved.fileToken,
              ext: fallbackResolved.ext,
              title: fallbackResolved.title,
              file_size: fallbackResolved.fileSize,
              file_url: fallbackResolved.directVideoUrl,
              audio_url: fallbackResolved.directAudioUrl
            });
          }
        }
      }

      return res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Status poll failed';
      return res.status(500).json({ error: message });
    }
  });

  // In-memory stream URL cache for fast progressive chunked streaming of long YouTube / Aparat videos
  const streamUrlCache = new Map<string, { directUrl: string; mimeType: string; expiresAt: number }>();

  /**
  /**
   * 4. Stream and Deliver Real Media File (Zero-VPN server pipeline, supports GET & HEAD + Range + Automatic Token Recovery)
   */
  app.all('/api/media/file/:taskId', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).end();
    }
    try {
      const { taskId } = req.params;
      const token = req.query.t as string;
      const ext = (req.query.ext as string) || 'mp4';
      const isDownload = req.query.download === '1' || req.query.dl === '1';

      const targetUrl = `${SAVEVIDEO_BASE}/api/file/${taskId}?t=${encodeURIComponent(token || '')}`;

      const headers: Record<string, string> = {
        'Referer': `${SAVEVIDEO_BASE}/`,
        'User-Agent': DESKTOP_CHROME_UA
      };

      const queryRange = (req.query.range as string) || '';
      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      } else if (queryRange) {
        headers['Range'] = queryRange.startsWith('bytes=') ? queryRange : `bytes=${queryRange}`;
      } else if (req.method === 'HEAD') {
        headers['Range'] = 'bytes=0-0';
      }

      let remoteRes = await fetch(targetUrl, {
        method: 'GET',
        headers,
        redirect: 'follow'
      });

      // Automatic Token Recovery: If SaveVideo taskId expired or single-use token was already consumed,
      // automatically re-resolve a fresh SaveVideo task from sourceUrl and stream seamlessly!
      if (!remoteRes.ok && remoteRes.status >= 400) {
        for (const [k, v] of saveVideoResultCache.entries()) {
          if (v.taskId === taskId) {
            saveVideoResultCache.delete(k);
          }
        }
        const mappedInfo = taskSourceUrlMap.get(taskId);
        const recoveryUrl = (req.query.sourceUrl as string) || mappedInfo?.url || '';
        if (recoveryUrl && isSafeUrl(recoveryUrl)) {
          const reqHeight = parseInt((req.query.quality as string) || '', 10) || mappedInfo?.height || 480;
          const freshResolved = await resolveViaSaveVideoBackend(
            recoveryUrl,
            75,
            true,
            reqHeight,
            false
          );
          if (freshResolved && freshResolved.taskId) {
            const freshTargetUrl = `${SAVEVIDEO_BASE}/api/file/${freshResolved.taskId}?t=${encodeURIComponent(
              freshResolved.fileToken || ''
            )}`;
            remoteRes = await fetch(freshTargetUrl, {
              method: 'GET',
              headers,
              redirect: 'follow'
            });
          }
        }
      }

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Remote error: ${remoteRes.statusText}` });
      }

      const upstreamCt = (remoteRes.headers.get('content-type') || '').toLowerCase();
      if (upstreamCt.includes('text/html') || upstreamCt.includes('application/xhtml') || upstreamCt.includes('application/json')) {
        return res.status(422).json({ error: 'Upstream returned HTML/JSON instead of binary media' });
      }

      const mimeType = ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : 'video/mp4';
      res.status(req.method === 'HEAD' ? 200 : remoteRes.status);
      res.setHeader('Content-Type', isDownload ? 'application/octet-stream' : mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange && req.method !== 'HEAD') {
        res.setHeader('Content-Range', contentRange);
      }

      let contentLength = remoteRes.headers.get('content-length');
      if (req.method === 'HEAD' && contentRange && contentRange.includes('/')) {
        const totalPart = contentRange.split('/')[1];
        if (totalPart && /^\d+$/.test(totalPart)) {
          contentLength = totalPart;
        }
      }
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const dispositionType = isDownload ? 'attachment' : 'inline';
      const rawTitle = (req.query.title as string) || `media_${taskId}`;
      const safeName = rawTitle.replace(/[\/\\?%*:|"<>]/g, '_').substring(0, 100);
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename="media_${taskId}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeName)}.${ext}`
      );

      if (req.method === 'HEAD') {
        try {
          await remoteRes.body?.cancel();
        } catch {
          // ignore
        }
        return res.end();
      }

      if (remoteRes.body) {
        const nodeStream = Readable.fromWeb(remoteRes.body as any);
        req.on('close', () => {
          nodeStream.destroy();
        });
        pipeline(nodeStream, res, (err) => {
          if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.warn('File stream notice:', err.message);
          }
        });
      } else {
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'File proxy stream failed';
      console.error('File proxy stream error:', message);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * 5. Stream and Deliver Audio File (Zero-VPN audio pipeline, supports GET & HEAD + Range + Automatic Token Recovery)
   */
  app.all('/api/media/audio/:taskId', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).end();
    }
    try {
      const { taskId } = req.params;
      const token = req.query.t as string;
      const isDownload = req.query.download === '1' || req.query.dl === '1';

      const targetUrl = `${SAVEVIDEO_BASE}/api/audio/${taskId}?t=${encodeURIComponent(token || '')}`;

      const headers: Record<string, string> = {
        'Referer': `${SAVEVIDEO_BASE}/`,
        'User-Agent': DESKTOP_CHROME_UA
      };

      const queryRange = (req.query.range as string) || '';
      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      } else if (queryRange) {
        headers['Range'] = queryRange.startsWith('bytes=') ? queryRange : `bytes=${queryRange}`;
      } else if (req.method === 'HEAD') {
        headers['Range'] = 'bytes=0-0';
      }

      let remoteRes = await fetch(targetUrl, {
        method: 'GET',
        headers,
        redirect: 'follow'
      });

      if (!remoteRes.ok && remoteRes.status >= 400) {
        for (const [k, v] of saveVideoResultCache.entries()) {
          if (v.taskId === taskId) {
            saveVideoResultCache.delete(k);
          }
        }
        const mappedInfo = taskSourceUrlMap.get(taskId);
        const recoveryUrl = (req.query.sourceUrl as string) || mappedInfo?.url || '';
        if (recoveryUrl && isSafeUrl(recoveryUrl)) {
          const freshResolved = await resolveViaSaveVideoBackend(
            recoveryUrl,
            75,
            true,
            mappedInfo?.height || 720,
            true
          );
          if (freshResolved && freshResolved.taskId) {
            const freshTargetUrl = `${SAVEVIDEO_BASE}/api/audio/${freshResolved.taskId}?t=${encodeURIComponent(
              freshResolved.fileToken || ''
            )}`;
            remoteRes = await fetch(freshTargetUrl, {
              method: 'GET',
              headers,
              redirect: 'follow'
            });
          }
        }
      }

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Audio error: ${remoteRes.statusText}` });
      }

      const upstreamAudioCt = (remoteRes.headers.get('content-type') || '').toLowerCase();
      if (upstreamAudioCt.includes('text/html') || upstreamAudioCt.includes('application/xhtml') || upstreamAudioCt.includes('application/json')) {
        return res.status(422).json({ error: 'Upstream returned HTML/JSON instead of binary audio' });
      }

      res.status(req.method === 'HEAD' ? 200 : remoteRes.status);
      res.setHeader('Content-Type', isDownload ? 'application/octet-stream' : 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange && req.method !== 'HEAD') {
        res.setHeader('Content-Range', contentRange);
      }

      let contentLength = remoteRes.headers.get('content-length');
      if (req.method === 'HEAD' && contentRange && contentRange.includes('/')) {
        const totalPart = contentRange.split('/')[1];
        if (totalPart && /^\d+$/.test(totalPart)) {
          contentLength = totalPart;
        }
      }
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const dispositionType = isDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${dispositionType}; filename="audio_${taskId}.mp3"`);

      if (req.method === 'HEAD') {
        try {
          await remoteRes.body?.cancel();
        } catch {
          // ignore
        }
        return res.end();
      }

      if (remoteRes.body) {
        const nodeStream = Readable.fromWeb(remoteRes.body as any);
        req.on('close', () => {
          nodeStream.destroy();
        });
        pipeline(nodeStream, res, (err) => {
          if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.warn('Audio stream notice:', err.message);
          }
        });
      } else {
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Audio proxy stream failed';
      console.error('Audio proxy stream error:', message);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * 6. Universal Direct Stream & Attachment Proxy (Follows all redirects server-side, supports GET, HEAD, and parallel Range requests)
   */
  app.all('/api/media/proxy-stream', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).end();
    }
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: 'URL parameter is required' });
      }

      // Security: SSRF Protection
      if (!isSafeUrl(targetUrl)) {
        return res.status(403).json({ error: 'Access to internal or private addresses is forbidden.' });
      }

      let activeTargetUrl = targetUrl;
      const sourceUrl = (req.query.sourceUrl as string) || '';
      const rawTitle = (req.query.title as string) || 'download';
      const ext = (req.query.ext as string) || (activeTargetUrl.includes('.mp3') ? 'mp3' : 'mp4');
      const isDownload = req.query.download === '1' || req.query.dl === '1';
      const safeName = rawTitle.replace(/[\/\\?%*:|"<>]/g, '_').substring(0, 100);

      const headers: Record<string, string> = {
        'User-Agent': DESKTOP_CHROME_UA
      };

      if (activeTargetUrl.includes('aparat.com') || activeTargetUrl.includes('cdn.asset.aparat.com')) {
        // Neutral headers for Aparat CDN (no Origin/Referer that could trigger hotlink or proxy blocks)
        headers['Accept'] = '*/*';
      } else if (activeTargetUrl.includes('instagram') || activeTargetUrl.includes('cdninstagram')) {
        headers['Referer'] = 'https://www.instagram.com/';
        headers['User-Agent'] = MOBILE_SAFARI_UA;
      } else if (activeTargetUrl.includes('fbcdn.net') || activeTargetUrl.includes('facebook.com')) {
        headers['Referer'] = 'https://www.facebook.com/';
      } else if (activeTargetUrl.includes('tikwm.com')) {
        headers['Referer'] = 'https://www.tikwm.com/';
      } else if (activeTargetUrl.includes('tiktok')) {
        headers['Referer'] = 'https://www.tiktok.com/';
      } else if (activeTargetUrl.includes('savevideo.uz')) {
        headers['Referer'] = `${SAVEVIDEO_BASE}/`;
      } else if (activeTargetUrl.includes('googlevideo.com') || activeTargetUrl.includes('youtube.com')) {
        headers['Referer'] = 'https://www.youtube.com/';
      }

      const queryRange = (req.query.range as string) || '';
      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      } else if (queryRange) {
        headers['Range'] = queryRange.startsWith('bytes=') ? queryRange : `bytes=${queryRange}`;
      }

      let remoteRes = await fetch(activeTargetUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        redirect: 'follow'
      });

      // Automatic retry for 503/429 rate-limits (e.g. TikWM 1-request-per-second limit when stream starts right after probe/start)
      for (let retry = 0; retry < 2 && (remoteRes.status === 503 || remoteRes.status === 429); retry++) {
        try {
          await remoteRes.body?.cancel();
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 1150 * (retry + 1)));
        remoteRes = await fetch(activeTargetUrl, {
          method: req.method === 'HEAD' ? 'HEAD' : 'GET',
          headers,
          redirect: 'follow'
        });
      }

      // If TikWM / TikTok stream failed, fallback to alternate TikWM CDN stream (d.play / d.hdplay)
      if (
        (!remoteRes.ok && remoteRes.status >= 400) &&
        (activeTargetUrl.includes('tikwm.com') || activeTargetUrl.includes('tiktok') || sourceUrl.includes('tiktok'))
      ) {
        const ttSource = sourceUrl.includes('tiktok') ? sourceUrl : activeTargetUrl;
        const d = await resolveViaTikWMServer(ttSource);
        if (d) {
          const candidates = [d.play, d.hdplay, d.wmplay, d.id ? `https://www.tikwm.com/video/media/play/${d.id}.mp4` : '']
            .filter((u): u is string => Boolean(u && typeof u === 'string' && u.startsWith('http') && u !== activeTargetUrl));
          for (const altUrl of candidates) {
            remoteRes = await fetch(altUrl, {
              method: req.method === 'HEAD' ? 'HEAD' : 'GET',
              headers: {
                ...headers,
                Referer: altUrl.includes('tikwm.com') ? 'https://www.tikwm.com/' : 'https://www.tiktok.com/'
              },
              redirect: 'follow'
            });
            if (remoteRes.ok || remoteRes.status === 206) {
              activeTargetUrl = altUrl;
              break;
            }
          }
        }
      }

      // If Aparat CDN rejects the token (e.g. wmsAuthSign was generated for client IP instead of server IP),
      // automatically re-resolve a fresh server-IP wmsAuthSign URL from Aparat's v1 API and retry!
      if (
        (!remoteRes.ok && remoteRes.status >= 400) &&
        (activeTargetUrl.includes('aparat.com') || sourceUrl.includes('aparat.com'))
      ) {
        const aparatSource = sourceUrl.includes('aparat.com') ? sourceUrl : activeTargetUrl;
        const freshAparat = await extractAparatMedia(aparatSource);
        if (freshAparat && freshAparat.direct_video_url) {
          const qMatch = activeTargetUrl.match(/-(\d{3,4})p\.mp4/i);
          const wantedHeight = (req.query.quality as string) || (qMatch ? qMatch[1] : '720');
          activeTargetUrl =
            freshAparat.formats_map[wantedHeight] ||
            freshAparat.formats_map['720'] ||
            freshAparat.formats_map['480'] ||
            freshAparat.direct_video_url;
          remoteRes = await fetch(activeTargetUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers,
            redirect: 'follow'
          });
        }
      }

      // Fallback if upstream CDN rejects HEAD with 403/405: probe with GET Range: bytes=0-0
      if (req.method === 'HEAD' && (!remoteRes.ok && remoteRes.status >= 400)) {
        const rangeProbeHeaders = { ...headers, Range: 'bytes=0-0' };
        remoteRes = await fetch(activeTargetUrl, {
          method: 'GET',
          headers: rangeProbeHeaders,
          redirect: 'follow'
        });
      }

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Remote error: ${remoteRes.statusText}` });
      }

      const proxyUpstreamCt = (remoteRes.headers.get('content-type') || '').toLowerCase();
      if (proxyUpstreamCt.includes('text/html') || proxyUpstreamCt.includes('application/xhtml') || proxyUpstreamCt.includes('application/json')) {
        return res.status(422).json({ error: 'Upstream returned HTML/JSON instead of binary media' });
      }

      // Pre-Download Validation: Reject 200 OK full video responses smaller than 120 KB (corrupt/403 block pages)
      const upstreamClNum = Number(remoteRes.headers.get('content-length') || '0');
      if (
        req.method === 'GET' &&
        !req.headers.range &&
        !queryRange &&
        ext === 'mp4' &&
        upstreamClNum > 0 &&
        upstreamClNum < 120 * 1024
      ) {
        return res.status(422).json({ error: `Upstream video payload too small (${upstreamClNum} bytes < 120 KB)` });
      }

      const mimeType = ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : 'video/mp4';
      res.status(req.method === 'HEAD' ? 200 : remoteRes.status);
      res.setHeader('Content-Type', isDownload ? 'application/octet-stream' : mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      // Extract total length from Content-Range if this was a HEAD fallback via Range: bytes=0-0
      let contentLength = remoteRes.headers.get('content-length');
      if (req.method === 'HEAD' && contentRange && contentRange.includes('/')) {
        const totalPart = contentRange.split('/')[1];
        if (totalPart && /^\d+$/.test(totalPart)) {
          contentLength = totalPart;
        }
      }
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const dispositionType = isDownload ? 'attachment' : 'inline';
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename="media_${Date.now()}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeName)}.${ext}`
      );

      if (req.method === 'HEAD') {
        try {
          await remoteRes.body?.cancel();
        } catch {
          // ignore
        }
        return res.end();
      }

      if (remoteRes.body) {
        const nodeStream = Readable.fromWeb(remoteRes.body as any);
        req.on('close', () => {
          nodeStream.destroy();
        });
        pipeline(nodeStream, res, (err) => {
          if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.warn('Proxy stream notice:', err.message);
          }
        });
      } else {
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Proxy stream error';
      console.error('Proxy stream error:', message);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * 6b. Progressive Chunked Streaming & Universal Fallback Endpoint (/api/media/stream)
   * Streams YouTube (Shorts & Long), Instagram, TikTok, Twitter, Facebook, and Aparat videos
   * directly as binary MP4/MP3 with full Range and attachment download support.
   */
  app.all('/api/media/stream', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).end();
    }
    try {
      const sourceUrl = (req.query.url as string) || '';
      const quality = (req.query.quality as string) || '720';
      const isAudio = req.query.audio === '1';
      const isDownload = req.query.download === '1' || req.query.dl === '1';

      if (!sourceUrl || !isSafeUrl(sourceUrl)) {
        return res.status(400).json({ error: 'Valid source URL is required' });
      }

      const cacheKey = `${sourceUrl}::${quality}::${isAudio ? 'a' : 'v'}`;
      let cached = streamUrlCache.get(cacheKey);

      const unwrapLocalSaveVideoUrl = (candidate: string): string => {
        const fileMatch = candidate.match(/\/api\/media\/file\/([A-Za-z0-9_-]+)\?t=([^&]*)/i);
        if (fileMatch) {
          return `${SAVEVIDEO_BASE}/api/file/${fileMatch[1]}?t=${fileMatch[2]}`;
        }
        const audioMatch = candidate.match(/\/api\/media\/audio\/([A-Za-z0-9_-]+)\?t=([^&]*)/i);
        if (audioMatch) {
          return `${SAVEVIDEO_BASE}/api/audio/${audioMatch[1]}?t=${audioMatch[2]}`;
        }
        return candidate;
      };

      const resolveFreshStreamEntry = async (forceFresh = false) => {
        let resolvedDirect = '';
        const resolvedMime = isAudio ? 'audio/mpeg' : 'video/mp4';

        // 1. Aparat
        if (sourceUrl.includes('aparat.com')) {
          const apData = await extractAparatMedia(sourceUrl);
          if (apData && apData.direct_video_url) {
            resolvedDirect =
              apData.formats_map[quality] ||
              apData.formats_map['720'] ||
              apData.formats_map['480'] ||
              apData.direct_video_url;
          }
        }

        // 2. Instagram (Reels, Posts, Stories)
        if (!resolvedDirect && /(?:instagram\.com|instagr\.am)/i.test(sourceUrl)) {
          const igData = await extractInstagramMedia(sourceUrl, true);
          if (igData && igData.direct_video_url) {
            resolvedDirect = unwrapLocalSaveVideoUrl(igData.direct_video_url);
          }
        }

        // 3. Twitter / X
        if (!resolvedDirect && /(?:twitter\.com|x\.com)/i.test(sourceUrl)) {
          const twData = await extractTwitterMedia(sourceUrl);
          if (twData && twData.direct_video_url) {
            resolvedDirect = unwrapLocalSaveVideoUrl(
              twData.formats_map[quality] || twData.direct_video_url
            );
          }
        }

        // 4. Facebook
        if (!resolvedDirect && /(?:facebook\.com|fb\.watch|fb\.com)/i.test(sourceUrl)) {
          const fbData = await extractFacebookMedia(sourceUrl);
          if (fbData && fbData.direct_video_url) {
            resolvedDirect = unwrapLocalSaveVideoUrl(
              fbData.formats_map[quality] || fbData.direct_video_url
            );
          }
        }

        // 5. TikTok (strictly respects requested quality 360/480/720/1080 via url::height::type)
        if (!resolvedDirect && /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(sourceUrl)) {
          const reqQ = parseInt(quality, 10) || 720;
          const heightBucket = reqQ <= 360 ? '360' : reqQ <= 480 ? '480' : reqQ <= 720 ? '720' : '1080';
          const [d, ytdlpTikTok] = await Promise.all([
            resolveViaTikWMServer(sourceUrl, Number(heightBucket), isAudio),
            extractViaYtDlp(sourceUrl, Number(heightBucket))
          ]);
          if (d || ytdlpTikTok) {
            const meta = computeTikTokResolutionMeta(d, ytdlpTikTok);
            if (isAudio) {
              resolvedDirect = meta.musicUrl || meta.rawUrls['720'] || '';
            } else {
              const candidateRawUrl =
                meta.rawUrls[heightBucket as keyof typeof meta.rawUrls] || meta.rawUrls['720'] || '';
              if (Number(heightBucket) <= 480 && !meta.hasDistinctLowResStream && candidateRawUrl) {
                const transcoded = await transcodeTikTokToTargetHeight(
                  sourceUrl,
                  candidateRawUrl,
                  Number(heightBucket)
                );
                if (transcoded && fs.existsSync(transcoded.filePath)) {
                  resolvedDirect = `file://${transcoded.filePath}`;
                }
              }
              if (!resolvedDirect) {
                resolvedDirect = candidateRawUrl;
              }
            }
          }
        }

        // 6. YouTube (Standard & Shorts) or SaveVideo Fallback (75 poll attempts + automatic resolution fallback)
        if (!resolvedDirect) {
          const svData = await resolveViaSaveVideoBackend(
            sourceUrl,
            75,
            forceFresh,
            parseInt(quality, 10) || 720,
            isAudio
          );
          if (svData && svData.taskId) {
            resolvedDirect = isAudio
              ? `${SAVEVIDEO_BASE}/api/audio/${svData.taskId}?t=${encodeURIComponent(svData.fileToken || '')}`
              : `${SAVEVIDEO_BASE}/api/file/${svData.taskId}?t=${encodeURIComponent(svData.fileToken || '')}`;
          }
        }

        // 7. Try yt-dlp direct stream URL extraction locked to requested quality
        if (!resolvedDirect) {
          const ytData = await extractViaYtDlp(sourceUrl, parseInt(quality, 10) || 720);
          if (ytData && ytData.direct_video_url) {
            resolvedDirect = isAudio
              ? ytData.direct_audio_url || ytData.direct_video_url
              : ytData.formats_map[quality] || ytData.direct_video_url;
          }
        }

        // 8. If sourceUrl is already a direct media stream
        if (!resolvedDirect && /\.(mp4|mp3|m4a|webm)(\?.*)?$/i.test(sourceUrl)) {
          resolvedDirect = sourceUrl;
        }

        if (resolvedDirect) {
          const entry = {
            directUrl: resolvedDirect,
            mimeType: resolvedMime,
            expiresAt: Date.now() + 45 * 1000
          };
          streamUrlCache.set(cacheKey, entry);
          return entry;
        }
        return undefined;
      };

      if (!cached || cached.expiresAt < Date.now()) {
        cached = await resolveFreshStreamEntry(false);
      }

      if (!cached || !cached.directUrl) {
        return res.status(404).json({ error: 'Progressive stream not resolved' });
      }

      // Serve locally transcoded resolution-locked MP4 (e.g. TikTok 360p / 480p) with full HTTP Range & HEAD support
      if (cached.directUrl.startsWith('file://')) {
        const localPath = cached.directUrl.slice('file://'.length);
        if (fs.existsSync(localPath)) {
          const stat = fs.statSync(localPath);
          const totalSize = stat.size;
          const ext = isAudio ? 'mp3' : 'mp4';
          res.setHeader(
            'Content-Type',
            isDownload ? 'application/octet-stream' : cached.mimeType || 'video/mp4'
          );
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('X-Accel-Buffering', 'no');
          res.setHeader('Cache-Control', 'no-store, no-transform');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader(
            'Access-Control-Expose-Headers',
            'Accept-Ranges, Content-Length, Content-Range'
          );
          res.setHeader(
            'Content-Disposition',
            `${isDownload ? 'attachment' : 'inline'}; filename="onedownload_${quality}p_${Date.now()}.${ext}"`
          );

          const rangeHeader = req.headers.range;
          if (rangeHeader && /^bytes=\d*-\d*$/i.test(rangeHeader)) {
            const parts = rangeHeader.replace(/bytes=/i, '').split('-');
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? Math.min(totalSize - 1, parseInt(parts[1], 10)) : totalSize - 1;
            const chunkSize = Math.max(0, end - start + 1);
            res.status(req.method === 'HEAD' ? 200 : 206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            res.setHeader('Content-Length', String(req.method === 'HEAD' ? totalSize : chunkSize));
            if (req.method === 'HEAD') return res.end();
            const fileStream = fs.createReadStream(localPath, { start, end });
            req.on('close', () => fileStream.destroy());
            return pipeline(fileStream, res, () => {});
          }

          res.status(200);
          res.setHeader('Content-Length', String(totalSize));
          if (req.method === 'HEAD') return res.end();
          const fileStream = fs.createReadStream(localPath);
          req.on('close', () => fileStream.destroy());
          return pipeline(fileStream, res, () => {});
        } else {
          streamUrlCache.delete(cacheKey);
        }
      }

      const fetchUpstreamFromEntry = async (entryUrl: string) => {
        const streamHeaders: Record<string, string> = {
          'User-Agent': DESKTOP_CHROME_UA
        };
        if (entryUrl.includes('savevideo.uz')) {
          streamHeaders['Referer'] = `${SAVEVIDEO_BASE}/`;
        } else if (entryUrl.includes('tikwm.com')) {
          streamHeaders['Referer'] = 'https://www.tikwm.com/';
        } else if (entryUrl.includes('tiktok')) {
          streamHeaders['Referer'] = 'https://www.tiktok.com/';
        } else if (entryUrl.includes('instagram') || entryUrl.includes('cdninstagram')) {
          streamHeaders['Referer'] = 'https://www.instagram.com/';
          streamHeaders['User-Agent'] = MOBILE_SAFARI_UA;
        } else if (entryUrl.includes('aparat.com')) {
          streamHeaders['Accept'] = '*/*';
        }
        if (req.headers.range) {
          streamHeaders['Range'] = req.headers.range as string;
        } else if (req.method === 'HEAD') {
          streamHeaders['Range'] = 'bytes=0-0';
        }

        return fetch(entryUrl, {
          method: 'GET',
          headers: streamHeaders,
          redirect: 'follow'
        });
      };

      let upstream = await fetchUpstreamFromEntry(cached.directUrl);

      if (!upstream.ok && upstream.status >= 400) {
        streamUrlCache.delete(cacheKey);
        cached = await resolveFreshStreamEntry(true);
        if (cached && cached.directUrl) {
          upstream = await fetchUpstreamFromEntry(cached.directUrl);
        }
      }

      if (!upstream.ok && upstream.status >= 400) {
        streamUrlCache.delete(cacheKey);
        return res.status(upstream.status).json({ error: 'Upstream media stream error' });
      }

      const streamUpstreamCt = (upstream.headers.get('content-type') || '').toLowerCase();
      if (streamUpstreamCt.includes('text/html') || streamUpstreamCt.includes('application/xhtml') || streamUpstreamCt.includes('application/json')) {
        streamUrlCache.delete(cacheKey);
        return res.status(422).json({ error: 'Upstream returned HTML/JSON instead of binary media' });
      }

      const streamClNum = Number(upstream.headers.get('content-length') || '0');
      if (req.method === 'GET' && !req.headers.range && !isAudio && streamClNum > 0 && streamClNum < 120 * 1024) {
        streamUrlCache.delete(cacheKey);
        return res.status(422).json({ error: `Upstream video payload too small (${streamClNum} bytes < 120 KB)` });
      }

      const ext = isAudio ? 'mp3' : 'mp4';
      res.status(req.method === 'HEAD' ? 200 : upstream.status);
      res.setHeader(
        'Content-Type',
        isDownload ? 'application/octet-stream' : cached?.mimeType || (isAudio ? 'audio/mpeg' : 'video/mp4')
      );
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');
      res.setHeader(
        'Content-Disposition',
        `${isDownload ? 'attachment' : 'inline'}; filename="onedownload_${Date.now()}.${ext}"`
      );

      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);

      if (req.method === 'HEAD') {
        return res.end();
      }

      if (upstream.body) {
        const nodeStream = Readable.fromWeb(upstream.body as any);
        req.on('close', () => nodeStream.destroy());
        pipeline(nodeStream, res, () => {});
      } else {
        res.end();
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  /**
   * 7. Thumbnail Proxy (Zero-VPN authentic cover photo for YouTube, Shorts, TikTok, Instagram, Twitter, Aparat)
   */
  app.get('/api/media/thumbnail', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      const ytId = req.query.yt as string;
      const igShortcode = req.query.ig as string;

      // Live Instagram Thumbnail via /p/{shortcode}/media/?size=l with Mobile User-Agent
      if (igShortcode && /^[A-Za-z0-9_-]{4,24}$/.test(igShortcode)) {
        const igThumbEndpoints = [
          `https://www.instagram.com/p/${igShortcode}/media/?size=l`,
          `https://www.instagram.com/reel/${igShortcode}/media/?size=l`
        ];
        for (const igUrl of igThumbEndpoints) {
          try {
            const imgRes = await fetch(igUrl, {
              headers: {
                'User-Agent': MOBILE_SAFARI_UA,
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': 'https://www.instagram.com/'
              },
              redirect: 'follow'
            });
            const ct = (imgRes.headers.get('content-type') || '').toLowerCase();
            if (imgRes.ok && imgRes.body && ct.startsWith('image/')) {
              res.setHeader('Content-Type', ct || 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.setHeader('Access-Control-Allow-Origin', '*');
              const nodeStream = Readable.fromWeb(imgRes.body as any);
              return pipeline(nodeStream, res, () => {});
            }
          } catch {
            // try next ig thumb endpoint
          }
        }
        return res.status(404).end();
      }

      if (ytId && /^[\w-]{11}$/.test(ytId)) {
        const qualityVariants = [
          `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/default.jpg`
        ];

        for (const variant of qualityVariants) {
          try {
            const imgRes = await fetch(variant, {
              headers: { 'User-Agent': DESKTOP_CHROME_UA }
            });
            if (imgRes.ok && imgRes.body) {
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.setHeader('Access-Control-Allow-Origin', '*');
              const nodeStream = Readable.fromWeb(imgRes.body as any);
              return pipeline(nodeStream, res, () => {});
            }
          } catch {
            // continue next variant
          }
        }
        return res.status(404).end();
      }

      if (targetUrl && isSafeUrl(targetUrl)) {
        const isIg =
          targetUrl.includes('instagram') ||
          targetUrl.includes('cdninstagram') ||
          targetUrl.includes('fbcdn.net');
        const headers: Record<string, string> = {
          'User-Agent': isIg ? MOBILE_SAFARI_UA : DESKTOP_CHROME_UA,
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        };
        if (isIg) {
          headers['Referer'] = 'https://www.instagram.com/';
        } else if (targetUrl.includes('tiktok')) {
          headers['Referer'] = 'https://www.tiktok.com/';
        } else if (targetUrl.includes('aparat')) {
          headers['Referer'] = 'https://www.aparat.com/';
        } else if (targetUrl.includes('twimg.com') || targetUrl.includes('twitter') || targetUrl.includes('x.com')) {
          headers['Referer'] = 'https://x.com/';
        }

        const imgRes = await fetch(targetUrl, { headers, redirect: 'follow' });
        if (imgRes.ok && imgRes.body) {
          res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          const nodeStream = Readable.fromWeb(imgRes.body as any);
          return pipeline(nodeStream, res, () => {});
        }
      }

      return res.status(400).json({ error: 'Valid thumbnail URL or YouTube ID required' });
    } catch {
      if (!res.headersSent) res.status(500).end();
    }
  });

  /**
   * 8. Cloud Referral Sync Store (/api/referral/apply & /api/referral/sync)
   * Stores successful referral invites by referral code and syncs invite counts to the code owner.
   */
  const referralDataDir = path.resolve(__dirname, 'data');
  const referralDataFile = path.resolve(referralDataDir, 'cloud_referrals.json');

  interface CloudReferralEntry {
    id: string;
    codeOrIdentifier: string;
    refereeHardwareId?: string;
    timestamp: number;
  }

  function loadCloudReferrals(): Record<string, CloudReferralEntry[]> {
    try {
      if (fs.existsSync(referralDataFile)) {
        const raw = fs.readFileSync(referralDataFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  }

  function saveCloudReferrals(store: Record<string, CloudReferralEntry[]>): void {
    try {
      if (!fs.existsSync(referralDataDir)) {
        fs.mkdirSync(referralDataDir, { recursive: true });
      }
      fs.writeFileSync(referralDataFile, JSON.stringify(store, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }

  app.post('/api/referral/apply', (req, res) => {
    try {
      const { ownerCode, friendIdentifier, refereeHardwareId } = req.body || {};
      const cleanOwner = String(ownerCode || '').trim().toUpperCase();
      if (!cleanOwner || cleanOwner.length < 4) {
        return res.status(400).json({ success: false, error: 'Invalid referral code' });
      }

      const store = loadCloudReferrals();
      const list = Array.isArray(store[cleanOwner]) ? store[cleanOwner] : [];

      const identifierLabel = friendIdentifier
        ? `${friendIdentifier} (${cleanOwner})`
        : refereeHardwareId || `User-${Date.now().toString(36).toUpperCase()}`;

      // Prevent duplicate registration from the exact same identifier/device
      const alreadyExists = list.some(
        (item) =>
          (refereeHardwareId && item.refereeHardwareId === refereeHardwareId) ||
          item.codeOrIdentifier === identifierLabel
      );

      if (!alreadyExists) {
        list.push({
          id: `cloud-ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          codeOrIdentifier: identifierLabel,
          refereeHardwareId: refereeHardwareId ? String(refereeHardwareId) : undefined,
          timestamp: Date.now()
        });
        store[cleanOwner] = list;
        saveCloudReferrals(store);
      }

      return res.json({
        success: true,
        ownerCode: cleanOwner,
        invitedCount: list.length,
        invitedUsers: list,
        unlockedVip: list.length >= 3
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Referral sync error' });
    }
  });

  app.get('/api/referral/sync', (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ success: false, invitedCount: 0, invitedUsers: [] });
      }
      const store = loadCloudReferrals();
      const list = Array.isArray(store[code]) ? store[code] : [];
      return res.json({
        success: true,
        code,
        invitedCount: list.length,
        invitedUsers: list,
        unlockedVip: list.length >= 3
      });
    } catch {
      return res.json({ success: false, invitedCount: 0, invitedUsers: [] });
    }
  });

  /**
   * 9. In-App Update Version Checker Endpoint (/api/app/version)
   */
  app.get('/api/app/version', (_req, res) => {
    res.json({
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      releaseDate: '1405/08/01',
      bazaarUrl: 'bazaar://details?id=ir.appone.onedownload',
      bazaarWebUrl: 'https://cafebazaar.ir/app/ir.appone.onedownload',
      myketUrl: 'myket://details?id=ir.appone.onedownload',
      myketWebUrl: 'https://myket.ir/app/ir.appone.onedownload',
      changelogFa: [
        'افزایش چشمگیر سرعت دانلود چندبخشی موازی (IDM Style) تا ۸ رشته همزمان',
        'ارتقای موتور استخراج مستقیم آپارات، اینستاگرام، تیک‌تاک و یوتیوب 4K',
        'پشتیبانی از فعال‌سازی خودکار اشتراک VIP یک‌ماهه با دعوت ۳ نفر',
        'بهبود پخش‌کننده داخلی و مدیریت هوشمند حافظه آفلاین'
      ],
      changelogAr: [
        'زيادة سرعة التحميل المتعدد المتوازي (IDM Style) حتى ٨ مسارات متزامنة',
        'تطوير محرك الاستخراج المباشر من يوتيوب، إنستغرام، تيك توك وأبارات بجودة 4K',
        'تفعيل تلقائي لاشتراك VIP لمدة شهر عند دعوة ٣ أصدقاء',
        'تحسين المشغل الداخلي وإدارة الملفات بدون إنترنت'
      ],
      changelogEn: [
        'Boosted multi-threaded parallel chunk download speed (up to 8 concurrent streams)',
        'Enhanced 4K direct stream extraction for YouTube, Instagram, TikTok & Aparat',
        'Automatic 1-Month VIP activation upon 3 successful friend referrals',
        'Improved built-in media player and offline storage stability'
      ]
    });
  });

  // Deliver self-cleaning /sw.js and /dev-sw.js with no-store headers
  app.get(['/sw.js', '/dev-sw.js', '/registerSW.js'], (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.sendFile(path.resolve(__dirname, 'public', 'sw.js'));
  });

  // Deliver /manifest.json directly
  app.get('/manifest.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.resolve(__dirname, 'public', 'manifest.json'));
  });

  // Frontend integration: Vite middleware in development, static in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OneDownload Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
