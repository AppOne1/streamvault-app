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

/**
 * Helper: Extract Aparat Video via Direct v1 API (`https://www.aparat.com/api/fa/v1/video/video/show/videohash/[UID]`)
 */
async function extractAparatMedia(url: string): Promise<ExtractedPlatformMedia | null> {
  const hash = extractAparatHashServer(url);
  if (!hash) return null;

  const browserHeaders = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': 'https://www.aparat.com',
    'Referer': 'https://www.aparat.com/'
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
        headers: browserHeaders,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (apiRes.ok) {
        const json = await apiRes.json();
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
                const parsedBytes = parsePersianSizeToBytes(item.size);
                const bitrateKbps =
                  h >= 1080 ? 2800 : h >= 720 ? 1500 : h >= 480 ? 850 : h >= 360 ? 520 : 300;
                est[String(h)] =
                  parsedBytes || Math.round(((bitrateKbps * 1000) / 8) * duration);
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
              'Aparat Creator';

            return {
              platform: 'aparat',
              title: decodeHtmlEntities(v.title || `ویدیو آپارات (${hash})`),
              author: decodeHtmlEntities(authorName),
              duration,
              thumbnail: rawPoster
                ? `/api/media/thumbnail?url=${encodeURIComponent(rawPoster)}`
                : '',
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

  // 2. Fallback: Scrape Aparat Video Web Page HTML / JSON-LD / OpenGraph
  try {
    const pageRes = await fetch(`https://www.aparat.com/v/${hash}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8'
      }
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
      const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
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
          author: 'Aparat Channel',
          duration: 120,
          thumbnail: cleanThumb ? `/api/media/thumbnail?url=${encodeURIComponent(cleanThumb)}` : '',
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
 * Helper: Extract Instagram Reel / Post / Video via Multi-Engine Real Scrapers
 */
async function extractInstagramMedia(url: string): Promise<ExtractedPlatformMedia | null> {
  const match = url.match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  const shortcode = match ? match[1] : null;
  if (!shortcode) return null;

  // Strategy 1: Instagram Embed Captioned Page (Official Instagram embed endpoint)
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
          thumbnail: rawThumb ? `/api/media/thumbnail?url=${encodeURIComponent(rawThumb)}` : '',
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

  // Strategy 2: DDInstagram / KKInstagram OpenGraph Bot Scraper
  const mirrorHosts = ['https://www.ddinstagram.com', 'https://d.ddinstagram.com'];
  for (const host of mirrorHosts) {
    try {
      const ddRes = await fetch(`${host}/p/${shortcode}`, {
        headers: {
          'User-Agent': 'TelegramBot (like TwitterBot)',
          'Accept': 'text/html'
        },
        redirect: 'follow'
      });
      if (ddRes.ok) {
        const html = await ddRes.text();
        const ogVideo =
          html.match(/<meta\s+property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i)?.[1] ||
          html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i)?.[1];
        const ogImage =
          html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
        const ogDesc =
          html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1];
        const ogTitle =
          html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];

        if (ogVideo) {
          const resolvedVideo = ogVideo.startsWith('http') ? decodeHtmlEntities(ogVideo) : `${host}${ogVideo}`;
          const resolvedThumb = ogImage
            ? ogImage.startsWith('http')
              ? decodeHtmlEntities(ogImage)
              : `${host}${ogImage}`
            : '';

          return {
            platform: 'instagram',
            title: decodeHtmlEntities(ogDesc || ogTitle || `Instagram Video (${shortcode})`).slice(0, 95),
            author: decodeHtmlEntities(ogTitle || 'Instagram Creator'),
            duration: 35,
            thumbnail: resolvedThumb ? `/api/media/thumbnail?url=${encodeURIComponent(resolvedThumb)}` : '',
            heights: [720, 1080],
            max_height: 1080,
            est: { '720': 5200000, '1080': 8400000 },
            formats_map: {
              '1080': resolvedVideo,
              '720': resolvedVideo
            },
            direct_video_url: resolvedVideo,
            direct_audio_url: resolvedVideo
          };
        }
      }
    } catch {
      // try next mirror
    }
  }

  // Strategy 3: Instagram GraphQL API Query
  try {
    const gqlUrl = `https://www.instagram.com/graphql/query/?doc_id=8845758582119845&variables=${encodeURIComponent(
      JSON.stringify({ shortcode, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null })
    )}`;
    const gqlRes = await fetch(gqlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
          title: (captionEdge ? String(captionEdge).slice(0, 95) : `Instagram Video (${owner})`),
          author: owner,
          duration: dur,
          thumbnail: thumb ? `/api/media/thumbnail?url=${encodeURIComponent(thumb)}` : '',
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
 * Helper: Extract Twitter / X Video via VXTwitter / FXTwitter JSON API
 */
async function extractTwitterMedia(url: string): Promise<ExtractedPlatformMedia | null> {
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:[^/]+)\/status\/(\d+)/i);
  const tweetId = match ? match[1] : null;
  if (!tweetId) return null;

  const apis = [
    `https://api.vxtwitter.com/Twitter/status/${tweetId}`,
    `https://api.fxtwitter.com/status/${tweetId}`
  ];

  for (const apiUrl of apis) {
    try {
      const res = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      if (res.ok) {
        const data = await res.json();
        const tweet = data?.tweet || data;
        const mediaList = tweet?.media_extended || tweet?.media?.videos || tweet?.media?.all || [];
        const videoItem = Array.isArray(mediaList)
          ? mediaList.find((m: any) => m.type === 'video' || m.type === 'gif' || (m.url && m.url.includes('.mp4')))
          : null;

        if (videoItem && videoItem.url) {
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
            heights: [720, 1080],
            max_height: 1080,
            est: {},
            formats_map: {
              '1080': videoItem.url,
              '720': videoItem.url
            },
            direct_video_url: videoItem.url,
            direct_audio_url: videoItem.url
          };
        }
      }
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Helper: Extract via local /bin/yt-dlp binary if present
 */
async function extractViaYtDlp(url: string): Promise<ExtractedPlatformMedia | null> {
  try {
    if (!fs.existsSync(YTDLP_BIN)) return null;
    const { stdout } = await execFileAsync(
      YTDLP_BIN,
      ['--dump-json', '--no-playlist', '--no-warnings', '--no-check-certificates', url],
      { timeout: 14000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!stdout) return null;
    const info = JSON.parse(stdout.trim().split('\n')[0]);
    if (!info) return null;

    const formatsMap: Record<string, string> = {};
    const heights: number[] = [];
    const est: Record<string, number> = {};
    let bestAudioUrl: string | undefined;
    let bestVideoUrl: string | undefined = info.url;

    if (Array.isArray(info.formats)) {
      for (const f of info.formats) {
        if (!f.url || f.protocol === 'mhtml') continue;
        const isMp4OrDirect =
          f.ext === 'mp4' ||
          f.ext === 'webm' ||
          (typeof f.url === 'string' && !f.url.includes('.m3u8'));

        if (f.vcodec && f.vcodec !== 'none' && f.height && isMp4OrDirect) {
          const h = Number(f.height);
          // Prefer progressive streams (acodec !== 'none') or keep highest bitrate
          if (!formatsMap[String(h)] || (f.acodec && f.acodec !== 'none')) {
            formatsMap[String(h)] = f.url;
          }
          if (!heights.includes(h)) heights.push(h);
          if (f.filesize || f.filesize_approx) {
            est[String(h)] = f.filesize || f.filesize_approx;
          }
          bestVideoUrl = f.url;
        } else if (f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')) {
          bestAudioUrl = f.url;
        }
      }
    }

    heights.sort((a, b) => a - b);
    if (!bestVideoUrl && heights.length > 0) {
      bestVideoUrl = formatsMap[String(heights[heights.length - 1])];
    }
    if (!bestVideoUrl) return null;

    const rawThumb = info.thumbnail || (Array.isArray(info.thumbnails) && info.thumbnails[info.thumbnails.length - 1]?.url) || '';
    return {
      platform: String(info.extractor_key || info.extractor || 'Media').toLowerCase(),
      title: info.title || info.fulltitle || 'Video Stream',
      author: info.uploader || info.channel || info.creator || undefined,
      duration: Math.round(Number(info.duration) || 60),
      thumbnail: rawThumb ? `/api/media/thumbnail?url=${encodeURIComponent(rawThumb)}` : '',
      viewsCount: info.view_count ? String(info.view_count) : undefined,
      heights: heights.length > 0 ? heights : [720, 1080],
      max_height: heights[heights.length - 1] || 1080,
      est,
      formats_map: Object.keys(formatsMap).length > 0 ? formatsMap : { '720': bestVideoUrl, '1080': bestVideoUrl },
      direct_video_url: bestVideoUrl,
      direct_audio_url: bestAudioUrl || bestVideoUrl
    };
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

      // D. TikTok (tiktok.com, vt.tiktok.com, vm.tiktok.com)
      const isTikTok = /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(url);
      if (isTikTok) {
        try {
          const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
          });
          if (tikRes.ok) {
            const tikJson = await tikRes.json();
            if (tikJson && tikJson.code === 0 && tikJson.data) {
              const d = tikJson.data;
              const playUrl = d.id ? `https://www.tikwm.com/video/media/play/${d.id}.mp4` : (d.hdplay || d.play);
              return res.json({
                success: true,
                platform: 'TikTok',
                title: d.title || `TikTok Video (@${d.author?.unique_id || 'creator'})`,
                author: d.author?.nickname ? `${d.author.nickname} (@${d.author.unique_id})` : undefined,
                duration: d.duration || 30,
                max_height: 1080,
                heights: [720, 1080],
                est: { '720': d.size || 4500000, '1080': d.hd_size || d.size || 6500000 },
                thumbnail: d.cover ? `/api/media/thumbnail?url=${encodeURIComponent(d.cover)}` : '',
                formats_map: playUrl ? { '720': playUrl, '1080': playUrl } : {},
                direct_video_url: playUrl,
                direct_audio_url: d.music
              });
            }
          }
        } catch (tikErr) {
          console.warn('TikWM probe fallback:', tikErr);
        }
      }

      // E. YouTube (youtube.com, youtu.be)
      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
      const ytId = ytMatch ? ytMatch[1] : null;

      if (isYouTube) {
        try {
          const probeRes = await fetch(`${SAVEVIDEO_BASE}/api/yt/probe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Referer': `${SAVEVIDEO_BASE}/`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: JSON.stringify({ url })
          });

          if (probeRes.ok) {
            const data = await probeRes.json();
            const cleanTitle = data.title || (data.is_shorts ? `YouTube Shorts (${ytId || ''})` : (ytId ? `YouTube Video (${ytId})` : 'YouTube Media'));
            return res.json({
              success: true,
              platform: 'YouTube',
              title: cleanTitle,
              duration: data.duration || (data.is_shorts ? 45 : 0),
              max_height: data.max_height,
              heights: data.heights || [720, 1080],
              est: data.est || {},
              audio_est: data.audio_est,
              is_shorts: !!data.is_shorts,
              thumbnail: ytId ? `/api/media/thumbnail?yt=${ytId}` : ''
            });
          }
        } catch {
          // continue to yt-dlp / Piped fallback
        }
      }

      // F. Universal yt-dlp or OpenGraph extraction for Facebook, Vimeo, SoundCloud, Pinterest, etc.
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

      // Engine A: Aparat Direct Stream Resolution
      if (/aparat\.com/i.test(url)) {
        const aparatData = await extractAparatMedia(url);
        if (aparatData && aparatData.direct_video_url) {
          const targetHeight = String(height || 720);
          const chosenStream =
            aparatData.formats_map[targetHeight] ||
            aparatData.formats_map['1080'] ||
            aparatData.formats_map['720'] ||
            aparatData.formats_map['480'] ||
            aparatData.direct_video_url;
          return res.json({
            status: 'done',
            direct_url: chosenStream,
            title: aparatData.title,
            file_size: aparatData.est[targetHeight] || 15000000,
            thumbnail: aparatData.thumbnail
          });
        }
      }

      // Engine B: Instagram Direct Stream Resolution
      if (/(?:instagram\.com|instagr\.am)/i.test(url)) {
        const igData = (await extractInstagramMedia(url)) || (await extractViaYtDlp(url));
        if (igData && igData.direct_video_url) {
          return res.json({
            status: 'done',
            direct_url: igData.direct_video_url,
            title: igData.title,
            file_size: 8400000,
            thumbnail: igData.thumbnail
          });
        }
      }

      // Engine C: Twitter / X Direct Stream Resolution
      if (/(?:twitter\.com|x\.com)/i.test(url)) {
        const twData = (await extractTwitterMedia(url)) || (await extractViaYtDlp(url));
        if (twData && twData.direct_video_url) {
          return res.json({
            status: 'done',
            direct_url: twData.direct_video_url,
            title: twData.title,
            file_size: 7500000,
            thumbnail: twData.thumbnail
          });
        }
      }

      // Engine D: TikTok Direct No-Watermark API
      const isTikTok = /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(url);
      if (isTikTok) {
        try {
          const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
          });
          if (tikRes.ok) {
            const tikJson = await tikRes.json();
            if (tikJson && tikJson.code === 0 && tikJson.data) {
              const d = tikJson.data;
              const directMediaUrl = audio
                ? (d.music || `https://www.tikwm.com/video/media/play/${d.id}.mp4`)
                : (d.id ? `https://www.tikwm.com/video/media/play/${d.id}.mp4` : (d.hdplay || d.play));
              if (directMediaUrl) {
                return res.json({
                  status: 'done',
                  direct_url: directMediaUrl,
                  title: d.title,
                  file_size: d.size || d.hd_size || 4200000,
                  thumbnail: d.cover
                });
              }
            }
          }
        } catch (tikErr) {
          console.warn('TikWM start fallback:', tikErr);
        }
      }

      // Engine E: Local yt-dlp binary or OpenGraph direct stream
      const ytdlpData = await extractViaYtDlp(url);
      if (ytdlpData && ytdlpData.direct_video_url) {
        const targetHeight = String(height || 720);
        const chosenUrl = audio
          ? (ytdlpData.direct_audio_url || ytdlpData.direct_video_url)
          : (ytdlpData.formats_map[targetHeight] || ytdlpData.direct_video_url);
        return res.json({
          status: 'done',
          direct_url: chosenUrl,
          title: ytdlpData.title,
          file_size: ytdlpData.est[targetHeight] || 12000000,
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

      // Engine F: SaveVideo Backend Pipeline for YouTube & Global Platforms
      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      const isShorts = isYouTube && url.includes('/shorts/');

      if (isYouTube && !isShorts && height) {
        const startRes = await fetch(`${SAVEVIDEO_BASE}/api/yt/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': `${SAVEVIDEO_BASE}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({
            url,
            height: height || 720,
            audio: !!audio
          })
        });

        const data = await startRes.json();
        return res.json(data);
      } else {
        const dlRes = await fetch(`${SAVEVIDEO_BASE}/api/download`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': `${SAVEVIDEO_BASE}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({ url })
        });

        const data = await dlRes.json();
        return res.json(data);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Start download failed';
      console.error('Start error:', message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * 3. Poll Download Status Endpoint
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
        const fileToken = data.file_token || '';
        const ext = data.ext || 'mp4';
        return res.json({
          ...data,
          file_url: `/api/media/file/${taskId}?t=${encodeURIComponent(fileToken)}&ext=${ext}`,
          audio_url: `/api/media/audio/${taskId}?t=${encodeURIComponent(fileToken)}`
        });
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
   * 4. Stream and Deliver Real Media File (Zero-VPN server pipeline, supports GET & HEAD + Range)
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }

      const remoteRes = await fetch(targetUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        redirect: 'follow'
      });

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Remote error: ${remoteRes.statusText}` });
      }

      const mimeType = ext === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      res.status(remoteRes.status);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = remoteRes.headers.get('content-length');
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
   * 5. Stream and Deliver Audio File (Zero-VPN audio pipeline, supports GET & HEAD + Range)
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }

      const remoteRes = await fetch(targetUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        redirect: 'follow'
      });

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Audio error: ${remoteRes.statusText}` });
      }

      res.status(remoteRes.status);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = remoteRes.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const dispositionType = isDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${dispositionType}; filename="audio_${taskId}.mp3"`);

      if (req.method === 'HEAD') {
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      };

      if (activeTargetUrl.includes('aparat.com') || activeTargetUrl.includes('cdn.asset.aparat.com')) {
        headers['Referer'] = 'https://www.aparat.com/';
        headers['Origin'] = 'https://www.aparat.com';
      } else if (activeTargetUrl.includes('instagram') || activeTargetUrl.includes('cdninstagram') || activeTargetUrl.includes('fbcdn.net')) {
        headers['Referer'] = 'https://www.instagram.com/';
      } else if (activeTargetUrl.includes('tiktok')) {
        headers['Referer'] = 'https://www.tiktok.com/';
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

      const mimeType = ext === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      res.status(req.method === 'HEAD' ? 200 : remoteRes.status);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
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
   * 6b. Progressive Chunked Streaming Endpoint for Built-In Media Player (/api/media/stream)
   * Streams long YouTube, Aparat, and global videos in progressive HTTP byte ranges (206 Partial Content)
   * without waiting to buffer the entire video file into RAM or disk first.
   */
  app.all('/api/media/stream', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).end();
    }
    try {
      const sourceUrl = (req.query.url as string) || '';
      const quality = (req.query.quality as string) || '720';
      const isAudio = req.query.audio === '1';

      if (!sourceUrl || !isSafeUrl(sourceUrl)) {
        return res.status(400).json({ error: 'Valid source URL is required' });
      }

      const cacheKey = `${sourceUrl}::${quality}::${isAudio ? 'a' : 'v'}`;
      let cached = streamUrlCache.get(cacheKey);

      if (!cached || cached.expiresAt < Date.now()) {
        let resolvedDirect = '';
        let resolvedMime = isAudio ? 'audio/mpeg' : 'video/mp4';

        // 1. If it's Aparat, resolve fresh MP4 stream via Aparat Official v1 API
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

        // 2. Try yt-dlp direct stream URL extraction (zero disk wait, instant googlevideo / CDN URL)
        if (!resolvedDirect) {
          const ytData = await extractViaYtDlp(sourceUrl);
          if (ytData && ytData.direct_video_url) {
            resolvedDirect = isAudio
              ? ytData.direct_audio_url || ytData.direct_video_url
              : ytData.formats_map[quality] || ytData.direct_video_url;
          }
        }

        // 3. If sourceUrl is already a direct media stream
        if (!resolvedDirect && /\.(mp4|mp3|m4a|webm)(\?.*)?$/i.test(sourceUrl)) {
          resolvedDirect = sourceUrl;
        }

        if (resolvedDirect) {
          cached = {
            directUrl: resolvedDirect,
            mimeType: resolvedMime,
            expiresAt: Date.now() + 15 * 60 * 1000
          };
          streamUrlCache.set(cacheKey, cached);
        }
      }

      if (!cached || !cached.directUrl) {
        return res.status(404).json({ error: 'Progressive stream not resolved' });
      }

      const streamHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      };
      if (cached.directUrl.includes('aparat.com')) {
        streamHeaders['Referer'] = 'https://www.aparat.com/';
      }
      if (req.headers.range) {
        streamHeaders['Range'] = req.headers.range as string;
      }

      const upstream = await fetch(cached.directUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: streamHeaders,
        redirect: 'follow'
      });

      if (!upstream.ok && upstream.status >= 400) {
        streamUrlCache.delete(cacheKey);
        return res.status(upstream.status).end();
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', cached.mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

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
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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
        const headers: Record<string, string> = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        };
        if (
          targetUrl.includes('instagram') ||
          targetUrl.includes('cdninstagram') ||
          targetUrl.includes('fbcdn.net')
        ) {
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
