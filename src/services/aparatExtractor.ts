/**
 * Isolated Aparat Media Extractor Module
 * Completely separated from YouTube, Instagram, TikTok, Twitter/X, and Facebook pipelines
 * so any timeout or failure in Aparat web services never affects international platforms.
 */

export interface AparatProbeResult {
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  viewsCount?: string;
  heights: number[];
  est: Record<string, number>;
  formatsMap: Record<string, string>;
  directVideoUrl: string;
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

export function isAparatUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return /aparat\.com/i.test(url);
}

export function extractAparatHash(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.trim();
  if (!isAparatUrl(cleaned)) return null;
  const match =
    cleaned.match(/aparat\.com\/(?:v|embed)\/([A-Za-z0-9_-]{3,20})(?:[/?#&]|$)/i) ||
    cleaned.match(/aparat\.com\/video\/video\/embed\/videohash\/([A-Za-z0-9_-]{3,20})(?:[/?#&]|$)/i) ||
    cleaned.match(/videohash\/([A-Za-z0-9_-]{3,20})(?:[/?#&]|$)/i) ||
    cleaned.match(/[?&]videohash=([A-Za-z0-9_-]{3,20})(?:[&#]|$)/i) ||
    cleaned.match(/aparat\.com\/(?:v|embed)\/([A-Za-z0-9_-]+)/i) ||
    cleaned.match(/aparat\.com\/.*?\/([A-Za-z0-9]{4,14})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

function parseQualityHeight(qualityLabel?: string): number {
  if (!qualityLabel) return 720;
  if (qualityLabel.includes('1080')) return 1080;
  if (qualityLabel.includes('720')) return 720;
  if (qualityLabel.includes('480')) return 480;
  if (qualityLabel.includes('360')) return 360;
  if (qualityLabel.includes('240')) return 240;
  return 720;
}

export async function probeAparatIsolated(url: string): Promise<AparatProbeResult | null> {
  if (!isAparatUrl(url)) return null;
  const hash = extractAparatHash(url);
  if (!hash) return null;

  const endpoints = [
    `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${hash}`,
    `https://www.aparat.com/etc/api/video/videohash/${hash}`
  ];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5500);
      const res = await fetch(ep, {
        headers: { Accept: 'application/json, text/plain, */*' },
        credentials: 'omit',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const json = await res.json();
      const v = json?.data?.attributes || json?.video || json?.data;
      if (!v) continue;

      const formatsMap: Record<string, string> = {};
      const heights: number[] = [];
      const est: Record<string, number> = {};
      const duration = Number(v.duration) || 120;

      const registerAparatUrl = (profileText: string, rawCandidate: unknown) => {
        const urlCandidate = Array.isArray(rawCandidate) ? rawCandidate[0] : rawCandidate;
        if (typeof urlCandidate !== 'string' || !urlCandidate.startsWith('http')) return;
        const hMatch =
          String(profileText || '').match(/(\d{3,4})/) ||
          urlCandidate.match(/-(\d{3,4})p\.mp4/i);
        const h = hMatch ? parseInt(hMatch[1], 10) : 720;
        if (!heights.includes(h)) heights.push(h);
        formatsMap[String(h)] = urlCandidate;
        const bitrateKbps = h >= 1080 ? 2800 : h >= 720 ? 1500 : h >= 480 ? 850 : 520;
        est[String(h)] = Math.round(((bitrateKbps * 1000) / 8) * duration);
      };

      const directLinkSource = v.directLink || v.direct_link || json?.directLink;
      if (Array.isArray(directLinkSource)) {
        for (const item of directLinkSource) {
          if (typeof item === 'string') {
            registerAparatUrl('720p', item);
          } else if (item && typeof item === 'object') {
            registerAparatUrl(
              String(item.profile || item.quality || item.text || '720p'),
              item.urls || item.url || item.link
            );
          }
        }
      } else if (typeof directLinkSource === 'string' && directLinkSource.startsWith('http')) {
        registerAparatUrl('720p', directLinkSource);
      }

      if (Array.isArray(v.file_link_all)) {
        for (const item of v.file_link_all) {
          if (!item) continue;
          registerAparatUrl(String(item.profile || item.text || ''), item.urls || item.url);
        }
      }

      heights.sort((a, b) => a - b);
      const safeFileLink =
        typeof v.file_link === 'string' && v.file_link.startsWith('http')
          ? v.file_link
          : undefined;
      const highestKey = heights.length > 0 ? String(heights[heights.length - 1]) : '';
      const bestVideoUrl =
        (highestKey ? formatsMap[highestKey] : undefined) ||
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
          v.big_poster || v.small_poster || v.medium_poster || v.med_poster || v.poster || '';
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
    } catch {
      // Isolated failure: never throw or disrupt other platforms
    }
  }

  return null;
}

export async function resolveViaAparat(
  originalUrl: string,
  qualityLabel?: string,
  _isAudio = false
): Promise<AparatResolvedStream | null> {
  if (!isAparatUrl(originalUrl)) return null;
  const probed = await probeAparatIsolated(originalUrl);
  if (!probed) return null;

  const reqNum = parseQualityHeight(qualityLabel);
  const requestedHeight = String(reqNum);
  const availableHeights = Object.keys(probed.formatsMap)
    .map((k) => Number(k))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  // Pick exact height, or highest available <= reqNum, or lowest available if all are > reqNum
  let matchedHeightKey = requestedHeight;
  if (!probed.formatsMap[matchedHeightKey] && availableHeights.length > 0) {
    const lowerOrEqual = availableHeights.filter((h) => h <= reqNum);
    const picked =
      lowerOrEqual.length > 0
        ? lowerOrEqual[lowerOrEqual.length - 1]
        : availableHeights[0];
    matchedHeightKey = String(picked);
  }

  const chosenUrl =
    probed.formatsMap[matchedHeightKey] ||
    probed.formatsMap[requestedHeight] ||
    probed.directVideoUrl;

  if (!chosenUrl) return null;

  return {
    url: chosenUrl,
    rawUrl: chosenUrl,
    title: probed.title,
    thumbnail: probed.thumbnail,
    duration: probed.duration,
    estimatedSize:
      probed.est[matchedHeightKey] ||
      probed.est[requestedHeight] ||
      Math.round(probed.duration * 180000),
    formatsMap: probed.formatsMap
  };
}
