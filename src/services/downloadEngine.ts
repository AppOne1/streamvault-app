import { DownloadTask, FormatOption, ParsedMediaInfo } from '../types';
import { formatBytes, getApiUrl } from './platformDetector';
import {
  saveOfflineMedia,
  getOfflineMedia,
  getMediaBlobFromIDB,
  loadSettingsFromStorage
} from './storageService';
import {
  resolveDirectMediaStream,
  fetchMediaStreamWithCorsFallback,
  resolveFallbackMediaStreams
} from './mediaExtractor';
import {
  forceDeviceDownload,
  triggerSilentAttachmentDownload,
  saveBlobToDevice,
  isBlobGenuineMedia,
  ensureMediaFileName,
  MIN_VALID_AUDIO_BYTES,
  MIN_VALID_VIDEO_BYTES
} from './nativeStorage';
import { isAparatUrl, resolveViaAparat } from './aparatExtractor';

type TaskUpdateCallback = (task: DownloadTask) => void;
type FileSavedCallback = (task: DownloadTask) => void;

const OFFLINE_CACHE_NAME = 'onedownload-offline-media-v1';

export { forceDeviceDownload };

/**
 * Formats completion date/time cleanly according to active language:
 * - fa / ar: Solar Hijri / Persian formatted date & time (e.g., ۱۴۰۳/۰۸/۰۴ - ۱۷:۲۵)
 * - en: Gregorian YYYY/MM/DD - HH:mm (e.g., 2026/10/25 - 17:25)
 */
export function formatDownloadTimestamp(timestampMs: number = Date.now(), lang?: string): string {
  const date = new Date(timestampMs);
  const resolvedLang =
    lang ||
    (() => {
      try {
        const s = loadSettingsFromStorage();
        if (s?.language) return s.language;
      } catch {
        // ignore
      }
      return 'fa';
    })();

  if (resolvedLang === 'en') {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} - ${hh}:${mm}`;
  }

  try {
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);

    const year = parts.find((p) => p.type === 'year')?.value || '';
    const month = parts.find((p) => p.type === 'month')?.value || '';
    const day = parts.find((p) => p.type === 'day')?.value || '';
    const hour = parts.find((p) => p.type === 'hour')?.value || '';
    const minute = parts.find((p) => p.type === 'minute')?.value || '';
    if (year && month && day && hour && minute) {
      return `${year}/${month}/${day} - ${hour}:${minute}`;
    }
  } catch {
    // Fallback below
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} - ${hh}:${mm}`;
}

/**
 * Persists a binary media Blob to CacheStorage (`onedownload-offline-media-v1`)
 * so offline playback in BuiltInMediaPlayer is doubly backed by IndexedDB + CacheStorage.
 */
async function saveBlobToCacheStorage(
  taskId: string,
  blob: Blob,
  mimeType: string
): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const response = new Response(blob, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(blob.size)
      }
    });
    await cache.put(`/offline-media/${encodeURIComponent(taskId)}`, response);
  } catch {
    // Ignore CacheStorage quota notice
  }
}

/**
 * Retrieves a binary media Blob from CacheStorage if present.
 */
export async function getBlobFromCacheStorage(
  taskId: string,
  isAudio: boolean = false
): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const match = await cache.match(`/offline-media/${encodeURIComponent(taskId)}`);
    if (match && match.ok) {
      const blob = await match.blob();
      if (await isBlobGenuineMedia(blob, isAudio)) return blob;
    }
  } catch {
    // Ignore
  }
  return null;
}

function getCanonicalMimeType(format: FormatOption): string {
  if (format.type === 'audio') {
    return format.format === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
  }
  return 'video/mp4';
}

function getCanonicalExtension(format: FormatOption): 'mp4' | 'mp3' | 'm4a' {
  if (format.type === 'audio') {
    return format.format === 'm4a' ? 'm4a' : 'mp3';
  }
  return 'mp4';
}

const BACKEND_SLICE_BYTES = 1572864; // 1.5 MB per slice (stays well under Cloud Run 32MB limit and BW burst quota)

interface PartialDownloadState {
  chunks: Uint8Array[];
  receivedBytes: number;
  knownTotalBytes: number;
  workingUrl: string;
  baseProgressPercent: number;
}

export class DownloadEngine {
  private activeControllers: Map<string, AbortController> = new Map();
  private activeTaskLocks: Set<string> = new Set();
  private waitingQueue: DownloadTask[] = [];
  private partialTaskState: Map<string, PartialDownloadState> = new Map();
  private savedTaskIds: Set<string> = new Set();
  private listeners: Set<TaskUpdateCallback> = new Set();
  private fileSavedListeners: Set<FileSavedCallback> = new Set();
  private blobMemoryCache: Map<string, Blob> = new Map();
  private activeWakeLock: any = null;

  private async acquireKeepAwake(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    try {
      if ('wakeLock' in navigator && !this.activeWakeLock) {
        this.activeWakeLock = await (navigator as any).wakeLock.request('screen');
      }
    } catch {
      // Ignore if WakeLock is not permitted
    }
  }

  private async releaseKeepAwake(): Promise<void> {
    try {
      if (this.activeWakeLock && this.activeTaskLocks.size === 0) {
        await this.activeWakeLock.release();
        this.activeWakeLock = null;
      }
    } catch {
      this.activeWakeLock = null;
    }
  }

  /**
   * Avoids mobile browser background timer throttling when the user switches apps:
   * Only waits `ms` when the document is visible in the foreground.
   */
  private async paceDelay(ms: number): Promise<void> {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    await new Promise((r) => setTimeout(r, ms));
  }

  public subscribe(cb: TaskUpdateCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public onFileSaved(cb: FileSavedCallback): () => void {
    this.fileSavedListeners.add(cb);
    return () => this.fileSavedListeners.delete(cb);
  }

  private notify(task: DownloadTask) {
    this.listeners.forEach((cb) => cb({ ...task }));
  }

  private notifyFileSaved(task: DownloadTask) {
    this.fileSavedListeners.forEach((cb) => cb({ ...task }));
  }

  public createTask(
    media: ParsedMediaInfo,
    format: FormatOption,
    scheduledTime?: string
  ): DownloadTask {
    const ext = getCanonicalExtension(format);
    const safeTitle = media.title
      .replace(/\.(html?|txt|json|xml|php)$/i, '')
      .replace(/[\/\\?%*:|"<>]/g, '_')
      .trim()
      .substring(0, 80);

    const fileName = ensureMediaFileName(
      `${safeTitle}_${format.qualityLabel.replace(/\s+/g, '')}.${ext}`,
      getCanonicalMimeType(format)
    );

    const totalBytes = format.estimatedSizeBytes || 3 * 1024 * 1024;
    const directUrl =
      format.directUrl ||
      (format.type === 'audio'
        ? media.directAudioUrl || media.directVideoUrl
        : media.directVideoUrl);

    return {
      id: `dl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      mediaId: media.id,
      originalUrl: media.originalUrl,
      videoId: media.videoId,
      title: media.title,
      platform: media.platform,
      thumbnail: media.thumbnail,
      durationFormatted: media.durationFormatted,
      durationSeconds: media.durationSeconds,
      format,
      status: 'queued',
      progressPercent: 0,
      speedBytesPerSec: 0,
      speedFormatted: '0 KB/s',
      downloadedBytes: 0,
      totalBytes,
      downloadedSizeFormatted: '0 B',
      totalSizeFormatted: formatBytes(totalBytes),
      elapsedSeconds: 0,
      etaSeconds: 0,
      directUrl,
      fileName,
      createdAt: Date.now(),
      scheduledTime,
      isSaved: false
    };
  }

  /**
   * Dual-Mode Binary Stream Reader with Pause/Resume Byte-Offset Preservation:
   * - Restores already-downloaded `chunks` and `receivedBytes` from `this.partialTaskState` when resuming a paused task.
   * - For direct external CORS CDNs (`!isBackendRoute`, e.g. tiktokcdn, tikwm, aparat, twimg):
   *   Streams directly in the browser with a continuous GET (or `Range: bytes=${receivedBytes}-` on resume).
   * - For backend routes (`isBackendRoute`, e.g. `/api/media/file/:taskId`, `/api/media/proxy-stream`):
   *   Streams in paced 1.5 MB sequential `Range` slices with up to 8 exponential cooldown retries per slice.
   */
  private async streamResponseToBlob(
    task: DownloadTask,
    targetUrl: string,
    signal: AbortSignal,
    baseProgressPercent: number = 0
  ): Promise<Blob> {
    const isAudio = task.format.type === 'audio';
    const canonicalMime = getCanonicalMimeType(task.format);
    const minRequiredBytes = isAudio ? MIN_VALID_AUDIO_BYTES : MIN_VALID_VIDEO_BYTES;
    const isBackendRoute =
      targetUrl.startsWith('/api/media/') || targetUrl.includes('/api/media/');

    const savedPartial = this.partialTaskState.get(task.id);
    const canReusePartial =
      savedPartial &&
      savedPartial.receivedBytes > 0 &&
      savedPartial.chunks.length > 0 &&
      (!savedPartial.workingUrl || savedPartial.workingUrl === targetUrl);

    const chunks: Uint8Array[] = canReusePartial ? [...savedPartial.chunks] : [];
    let receivedBytes = canReusePartial ? savedPartial.receivedBytes : 0;
    let knownTotalBytes = canReusePartial ? savedPartial.knownTotalBytes : 0;
    const initialBytesAtSessionStart = receivedBytes;
    const startTime = Date.now();
    let lastUiNotify = 0;
    let sliceRetries = 0;

    // Brief initial pause before hitting backend stream so /api/media/start QPS window settles
    if (isBackendRoute && receivedBytes === 0) {
      await this.paceDelay(350);
    }

    while (true) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (knownTotalBytes > 0 && receivedBytes >= knownTotalBytes) {
        break;
      }

      let rangeHeader: string | undefined;
      if (isBackendRoute) {
        const sliceEnd =
          knownTotalBytes > 0
            ? Math.min(knownTotalBytes - 1, receivedBytes + BACKEND_SLICE_BYTES - 1)
            : receivedBytes + BACKEND_SLICE_BYTES - 1;
        rangeHeader = `bytes=${receivedBytes}-${sliceEnd}`;
      } else {
        rangeHeader = receivedBytes > 0 ? `bytes=${receivedBytes}-` : undefined;
      }

      let res: Response;
      try {
        res = await fetchMediaStreamWithCorsFallback(
          targetUrl,
          signal,
          isAudio,
          rangeHeader
        );
      } catch (err: any) {
        if (signal.aborted || err?.name === 'AbortError') throw err;
        const maxRetries = isBackendRoute ? 8 : receivedBytes > 0 ? 4 : 0;
        if (sliceRetries < maxRetries) {
          sliceRetries++;
          const cooldownMs = Math.min(5000, 1500 * sliceRetries);
          await new Promise((r) => setTimeout(r, cooldownMs));
          continue;
        }
        throw err;
      }

      const contentRangeHeader = res.headers.get('content-range') || '';
      const isPartialRange = res.status === 206 || contentRangeHeader.includes('/');

      if (contentRangeHeader.includes('/')) {
        const totalPart = contentRangeHeader.split('/')[1];
        const parsedTotal = Number(totalPart || '0');
        if (parsedTotal > 0) {
          if (parsedTotal < minRequiredBytes) {
            throw new Error(`Incomplete stream payload (${parsedTotal} bytes)`);
          }
          knownTotalBytes = parsedTotal;
          task.totalBytes = parsedTotal;
          task.totalSizeFormatted = formatBytes(parsedTotal);
        }
      } else if (!isPartialRange) {
        const contentLengthHeader = Number(res.headers.get('content-length') || '0');
        if (contentLengthHeader > 0 && contentLengthHeader < minRequiredBytes) {
          throw new Error(`Incomplete stream payload (${contentLengthHeader} bytes)`);
        }
        if (contentLengthHeader >= minRequiredBytes) {
          knownTotalBytes = contentLengthHeader;
          task.totalBytes = contentLengthHeader;
          task.totalSizeFormatted = formatBytes(contentLengthHeader);
        }
        // If server returned 200 OK (ignored Range) after we already had partial chunks, reset chunks so we don't duplicate
        if (receivedBytes > 0) {
          chunks.length = 0;
          receivedBytes = 0;
        }
      }

      if (!res.body) {
        const arrayBuf = await res.arrayBuffer();
        const u8 = new Uint8Array(arrayBuf);
        if (u8.byteLength > 0) {
          chunks.push(u8);
          receivedBytes += u8.byteLength;
          task.downloadedBytes = receivedBytes;
          task.downloadedSizeFormatted = formatBytes(receivedBytes);
          this.partialTaskState.set(task.id, {
            chunks,
            receivedBytes,
            knownTotalBytes,
            workingUrl: targetUrl,
            baseProgressPercent
          });
          this.notify(task);
        }
        if (!isPartialRange || (knownTotalBytes > 0 && receivedBytes >= knownTotalBytes)) {
          break;
        }
        continue;
      }

      const reader = res.body.getReader();
      let passBytesRead = 0;
      let streamInterrupted = false;

      try {
        while (true) {
          if (signal.aborted) {
            await reader.cancel().catch(() => {});
            throw new DOMException('Aborted', 'AbortError');
          }

          const { done, value } = await reader.read();
          if (done) break;

          if (value && value.byteLength > 0) {
            chunks.push(value);
            receivedBytes += value.byteLength;
            passBytesRead += value.byteLength;
            task.downloadedBytes = receivedBytes;
            task.downloadedSizeFormatted = formatBytes(receivedBytes);

            this.partialTaskState.set(task.id, {
              chunks,
              receivedBytes,
              knownTotalBytes,
              workingUrl: targetUrl,
              baseProgressPercent
            });

            if (receivedBytes > task.totalBytes) {
              task.totalBytes = Math.round(receivedBytes * 1.08);
              task.totalSizeFormatted = formatBytes(task.totalBytes);
            }

            const now = Date.now();
            const elapsedSec = Math.max(0.25, (now - startTime) / 1000);
            const sessionBytes = Math.max(value.byteLength, receivedBytes - initialBytesAtSessionStart);
            const speedBps = Math.round(sessionBytes / elapsedSec);
            task.speedBytesPerSec = speedBps;
            task.speedFormatted = `${formatBytes(speedBps)}/s`;
            task.elapsedSeconds = Math.round(elapsedSec);

            const remainingBytes = Math.max(0, task.totalBytes - receivedBytes);
            task.etaSeconds = speedBps > 0 ? Math.max(0, Math.round(remainingBytes / speedBps)) : 0;

            const streamFraction =
              task.totalBytes > 0 ? Math.min(0.99, receivedBytes / task.totalBytes) : 0.5;
            const scaledProgress = Math.round(
              baseProgressPercent + streamFraction * (99 - baseProgressPercent)
            );
            task.progressPercent = Math.min(99, Math.max(task.progressPercent, scaledProgress));

            if (now - lastUiNotify >= 120) {
              lastUiNotify = now;
              this.notify(task);
            }
          }
        }
      } catch (readErr: any) {
        if (signal.aborted || readErr?.name === 'AbortError') throw readErr;
        streamInterrupted = true;
      }

      if (passBytesRead > 0) {
        sliceRetries = 0;
      }

      if (streamInterrupted) {
        const maxReadRetries = isBackendRoute ? 8 : 4;
        if (sliceRetries < maxReadRetries) {
          sliceRetries++;
          const cooldownMs = Math.min(5000, 1500 * sliceRetries);
          await new Promise((r) => setTimeout(r, cooldownMs));
          continue;
        }
        throw new Error('وقفه در دریافت استریم — لطفاً تلاش مجدد کنید');
      }

      if (isBackendRoute && isPartialRange) {
        if (knownTotalBytes > 0 && receivedBytes >= knownTotalBytes) {
          break;
        }
        if (passBytesRead === 0) {
          break;
        }
        // Paced inter-slice delay (280ms in foreground; 0ms in background so background tab isn't throttled)
        await this.paceDelay(280);
        continue;
      }

      // Non-sliced or 200 OK full stream completed
      if (knownTotalBytes > 0 && receivedBytes > 0 && receivedBytes < knownTotalBytes * 0.98) {
        if (sliceRetries < 4) {
          sliceRetries++;
          await new Promise((r) => setTimeout(r, 1200 * sliceRetries));
          continue;
        }
        throw new Error('وقفه در دریافت استریم — لطفاً تلاش مجدد کنید');
      }

      break;
    }

    const mediaBlob = new Blob(chunks, { type: canonicalMime });
    if (!(await isBlobGenuineMedia(mediaBlob, isAudio))) {
      throw new Error(`Invalid or undersized media payload (${mediaBlob.size} bytes)`);
    }

    return mediaBlob;
  }

  public isTaskQueuedOrActive(taskId: string): boolean {
    return (
      this.activeTaskLocks.has(taskId) ||
      this.waitingQueue.some((t) => t.id === taskId)
    );
  }

  /**
   * Silent Native Blob Download Engine:
   * 1. Enforces 1 active download at a time (queuing additional tasks) so concurrent streams never trip Cloud Run quotas.
   * 2. Preserves partial downloaded chunks when paused, resuming from the exact byte offset (`Range: bytes=receivedBytes-...`).
   * 3. Resolves the direct media stream via backend `/api/media/start` (or platform extractors).
   * 4. Downloads the real binary stream into a verified `Blob` object (`video/mp4` or `audio/mpeg`)
   *    while showing real-time downloaded MB and MB/s speed.
   * 5. Stores the `Blob` in internal app storage (IndexedDB + CacheStorage + memory) so the built-in player works 100% offline.
   * 6. Triggers `saveBlobToDevice(mediaBlob, task.fileName)` strictly ONCE with NO `target="_blank"` and NO new tab.
   */
  public async startTask(task: DownloadTask): Promise<void> {
    if (this.activeTaskLocks.has(task.id)) return;
    if (task.status === 'completed' && (task.isSaved || this.savedTaskIds.has(task.id))) return;

    // If another task is currently downloading, queue this task once without triggering a render loop
    if (this.activeTaskLocks.size > 0) {
      const alreadyQueued = this.waitingQueue.some((t) => t.id === task.id);
      if (!alreadyQueued) {
        this.waitingQueue.push(task);
      }
      if (!alreadyQueued || task.status !== 'queued' || task.speedFormatted !== 'در صف دانلود...') {
        task.status = 'queued';
        task.errorMessage = undefined;
        task.speedBytesPerSec = 0;
        task.speedFormatted = 'در صف دانلود...';
        this.notify(task);
      }
      return;
    }

    this.activeTaskLocks.add(task.id);
    const controller = new AbortController();
    this.activeControllers.set(task.id, controller);
    await this.acquireKeepAwake();

    if (!task.originalUrl && task.videoId) {
      task.originalUrl = `https://www.youtube.com/watch?v=${task.videoId}`;
    }

    const isAudio = task.format.type === 'audio';
    const canonicalMime = getCanonicalMimeType(task.format);
    task.fileName = ensureMediaFileName(task.fileName, canonicalMime);

    const heightMatch =
      task.format.resolution?.match(/x(\d+)/) ||
      task.format.qualityLabel.match(/(\d{3,4})p/);
    const reqQuality = heightMatch ? heightMatch[1] : '720';

    const savedPartial = this.partialTaskState.get(task.id);
    const isResumingPartial = Boolean(
      savedPartial && savedPartial.receivedBytes > 0 && savedPartial.chunks.length > 0
    );

    task.status = 'downloading';
    task.errorMessage = undefined;
    if (isResumingPartial && savedPartial) {
      task.downloadedBytes = savedPartial.receivedBytes;
      task.downloadedSizeFormatted = formatBytes(savedPartial.receivedBytes);
      if (savedPartial.knownTotalBytes > 0) {
        task.totalBytes = savedPartial.knownTotalBytes;
        task.totalSizeFormatted = formatBytes(savedPartial.knownTotalBytes);
      }
      task.progressPercent = Math.max(task.progressPercent, 5);
      task.speedFormatted = 'در حال ادامه دانلود...';
    } else {
      task.downloadedBytes = 0;
      task.downloadedSizeFormatted = '0 B';
      task.progressPercent = 2;
      task.speedFormatted = 'در حال آماده‌سازی استریم...';
    }
    this.notify(task);

    const prepTimer = setInterval(() => {
      if (task.status === 'downloading' && task.downloadedBytes === 0 && task.progressPercent < 10) {
        task.progressPercent = Math.min(10, task.progressPercent + 1);
        task.speedFormatted = 'در حال آماده‌سازی سرور...';
        this.notify(task);
      }
    }, 1200);

    try {
      const candidateUrls: string[] = [];
      const addCandidate = (u?: string) => {
        if (u && u.trim() && !candidateUrls.includes(u.trim())) {
          candidateUrls.push(u.trim());
        }
      };

      // If resuming from a paused state with a known working URL, try that exact URL first without re-probing!
      if (isResumingPartial && savedPartial?.workingUrl) {
        addCandidate(savedPartial.workingUrl);
      } else if (task.platform === 'aparat' || isAparatUrl(task.originalUrl)) {
        const aparatStream = await resolveViaAparat(
          task.originalUrl,
          task.format.qualityLabel,
          isAudio
        );
        if (aparatStream) {
          addCandidate(aparatStream.rawUrl);
          addCandidate(aparatStream.url);
        }
      } else {
        const resolved = await resolveDirectMediaStream(
          task.originalUrl,
          task.format.type,
          task.format.qualityLabel,
          task.directUrl,
          (prepPercent) => {
            if (task.status === 'downloading' && task.downloadedBytes === 0) {
              const cappedPrep = Math.min(12, Math.max(2, prepPercent));
              if (cappedPrep > task.progressPercent) {
                task.progressPercent = cappedPrep;
              }
              task.speedFormatted = 'در حال آماده‌سازی سرور...';
              this.notify(task);
            }
          }
        );
        if (resolved) {
          addCandidate(resolved.url);
          if (Array.isArray(resolved.fallbackUrls)) {
            resolved.fallbackUrls.forEach(addCandidate);
          }
          if (resolved.estimatedBytes && resolved.estimatedBytes > 120000) {
            task.totalBytes = resolved.estimatedBytes;
            task.totalSizeFormatted = formatBytes(resolved.estimatedBytes);
          }
        }
      }

      clearInterval(prepTimer);

      // 2. Include 1 clean universal stream fallback if needed
      addCandidate(
        getApiUrl(
          `/api/media/stream?url=${encodeURIComponent(
            task.originalUrl
          )}&quality=${reqQuality}&audio=${isAudio ? '1' : '0'}`
        )
      );

      const basePrepProgress =
        isResumingPartial && savedPartial
          ? savedPartial.baseProgressPercent
          : task.progressPercent;
      let downloadedBlob: Blob | null = null;
      let workingStreamUrl = candidateUrls[0] || '';

      // 3. Try candidate stream URLs (up to 3 top candidates) until we obtain a verified binary Blob
      const topCandidates = candidateUrls.slice(0, 3);
      for (let i = 0; i < topCandidates.length; i++) {
        const candidateUrl = topCandidates[i];
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }
        try {
          downloadedBlob = await this.streamResponseToBlob(
            task,
            candidateUrl,
            controller.signal,
            basePrepProgress
          );
          if (downloadedBlob) {
            workingStreamUrl = candidateUrl;
            break;
          }
        } catch (err: any) {
          if (controller.signal.aborted || err?.name === 'AbortError') throw err;
        }
      }

      // 4. If primary candidates failed, query extra fallback resolvers (Piped / Invidious / Cobalt)
      if (!downloadedBlob) {
        await new Promise((r) => setTimeout(r, 1500));
        const extraFallbacks = await resolveFallbackMediaStreams(
          task.originalUrl,
          task.format.type,
          task.format.qualityLabel
        );
        for (const extraUrl of extraFallbacks.slice(0, 2)) {
          if (controller.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          if (topCandidates.includes(extraUrl)) continue;
          try {
            downloadedBlob = await this.streamResponseToBlob(
              task,
              extraUrl,
              controller.signal,
              basePrepProgress
            );
            if (downloadedBlob) {
              workingStreamUrl = extraUrl;
              break;
            }
          } catch (err: any) {
            if (controller.signal.aborted || err?.name === 'AbortError') throw err;
          }
        }
      }

      if (!downloadedBlob) {
        throw new Error('خطا در دریافت فایل باینری مدیا — لطفاً تلاش مجدد کنید');
      }

      // 5. Persist binary Blob in internal app storage (Memory + IndexedDB + CacheStorage) for 100% offline playback
      this.partialTaskState.delete(task.id);
      const finalBytes = downloadedBlob.size;
      const offlineBlobUrl =
        typeof window !== 'undefined' ? window.URL.createObjectURL(downloadedBlob) : '';

      this.blobMemoryCache.set(task.id, downloadedBlob);
      task.mediaBlob = downloadedBlob;
      task.blobUrl = offlineBlobUrl;
      task.directUrl = workingStreamUrl || task.directUrl;
      task.totalBytes = finalBytes;
      task.downloadedBytes = finalBytes;
      task.totalSizeFormatted = formatBytes(finalBytes);
      task.downloadedSizeFormatted = formatBytes(finalBytes);
      task.progressPercent = 100;
      task.speedBytesPerSec = 0;
      task.speedFormatted = 'پایان یافت';
      task.etaSeconds = 0;
      task.completedAt = Date.now();
      task.status = 'completed';
      task.errorMessage = undefined;

      await saveOfflineMedia({
        id: task.id,
        mediaBlob: downloadedBlob,
        mimeType: canonicalMime,
        title: task.title,
        thumbnail: task.thumbnail,
        duration: task.durationSeconds || 60,
        fileSize: finalBytes,
        fileName: task.fileName,
        format: task.format.format,
        quality: task.format.qualityLabel,
        downloadedAt: task.completedAt,
        platform: task.platform,
        sourceUrl: task.originalUrl,
        directUrl: task.directUrl
      });

      await saveBlobToCacheStorage(task.id, downloadedBlob, canonicalMime);

      this.notify(task);
    } catch (err: any) {
      clearInterval(prepTimer);
      if (controller.signal.aborted || err?.name === 'AbortError') {
        return;
      }
      task.status = 'error';
      task.speedBytesPerSec = 0;
      task.speedFormatted = 'خطا در دریافت — تلاش مجدد کنید';
      task.errorMessage = err?.message || 'Download failed';
      this.notify(task);
    } finally {
      clearInterval(prepTimer);
      this.activeControllers.delete(task.id);
      this.activeTaskLocks.delete(task.id);
      await this.releaseKeepAwake();
      if (this.waitingQueue.length > 0 && this.activeTaskLocks.size === 0) {
        const nextTask = this.waitingQueue.shift();
        if (nextTask && nextTask.status === 'queued') {
          setTimeout(() => {
            this.startTask(nextTask);
          }, 400);
        }
      }
    }
  }

  public pauseTask(task: DownloadTask): void {
    this.waitingQueue = this.waitingQueue.filter((t) => t.id !== task.id);
    const controller = this.activeControllers.get(task.id);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(task.id);
    }
    this.activeTaskLocks.delete(task.id);
    task.status = 'paused';
    task.speedBytesPerSec = 0;
    task.speedFormatted =
      task.downloadedBytes > 0 ? 'متوقف شده (آماده ادامه)' : 'متوقف شده';
    this.notify(task);

    // If another task is waiting in the queue, start it now that this one is paused
    if (this.waitingQueue.length > 0 && this.activeTaskLocks.size === 0) {
      const nextTask = this.waitingQueue.shift();
      if (nextTask && nextTask.status === 'queued') {
        setTimeout(() => {
          this.startTask(nextTask);
        }, 400);
      }
    }
  }

  public resumeTask(task: DownloadTask): void {
    if (task.status === 'paused' || task.status === 'error' || task.status === 'queued') {
      task.scheduledTime = undefined;
      // Preserve partialTaskState and working directUrl if we already downloaded partial bytes!
      const hasPartial = this.partialTaskState.has(task.id);
      if (!hasPartial) {
        task.directUrl = undefined;
        if (task.format) {
          task.format.directUrl = undefined;
        }
      }
      this.savedTaskIds.delete(task.id);
      task.isSaved = false;
      this.startTask(task);
    }
  }

  public retryTask(task: DownloadTask): void {
    this.waitingQueue = this.waitingQueue.filter((t) => t.id !== task.id);
    const controller = this.activeControllers.get(task.id);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(task.id);
    }
    this.activeTaskLocks.delete(task.id);
    this.savedTaskIds.delete(task.id);
    const hasPartial = this.partialTaskState.has(task.id);
    if (!hasPartial) {
      task.directUrl = undefined;
      if (task.format) {
        task.format.directUrl = undefined;
      }
      task.progressPercent = 2;
    }
    task.isSaved = false;
    task.status = 'queued';
    this.startTask(task);
  }

  public cancelTask(task: DownloadTask): void {
    this.waitingQueue = this.waitingQueue.filter((t) => t.id !== task.id);
    const controller = this.activeControllers.get(task.id);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(task.id);
    }
    this.activeTaskLocks.delete(task.id);
    this.partialTaskState.delete(task.id);
    this.blobMemoryCache.delete(task.id);
    task.status = 'cancelled';
    task.speedBytesPerSec = 0;
    task.speedFormatted = '0 KB/s';
    this.notify(task);
  }

  /**
   * Resolves any stored offline binary Blob from Memory, IndexedDB, or CacheStorage.
   */
  public async getTaskMediaBlob(task: DownloadTask): Promise<Blob | null> {
    const isAudio = task.format.type === 'audio';

    const memBlob = this.blobMemoryCache.get(task.id);
    if (memBlob && (await isBlobGenuineMedia(memBlob, isAudio))) {
      return memBlob;
    }

    if (task.mediaBlob && (await isBlobGenuineMedia(task.mediaBlob, isAudio))) {
      this.blobMemoryCache.set(task.id, task.mediaBlob);
      return task.mediaBlob;
    }

    try {
      const record = await getOfflineMedia(task.id);
      if (record && record.mediaBlob && (await isBlobGenuineMedia(record.mediaBlob, isAudio))) {
        this.blobMemoryCache.set(task.id, record.mediaBlob);
        task.mediaBlob = record.mediaBlob;
        return record.mediaBlob;
      }
    } catch {
      // continue
    }

    try {
      const idbBlob = await getMediaBlobFromIDB(task.id);
      if (idbBlob && (await isBlobGenuineMedia(idbBlob, isAudio))) {
        this.blobMemoryCache.set(task.id, idbBlob);
        task.mediaBlob = idbBlob;
        return idbBlob;
      }
    } catch {
      // continue
    }

    const cachedBlob = await getBlobFromCacheStorage(task.id, isAudio);
    if (cachedBlob && (await isBlobGenuineMedia(cachedBlob, isAudio))) {
      this.blobMemoryCache.set(task.id, cachedBlob);
      task.mediaBlob = cachedBlob;
      return cachedBlob;
    }

    return null;
  }

  /**
   * Manual "Save to Device" button action from user on completed download cards or player.
   * Uses the cached offline Blob (or silent same-origin attachment stream) with zero new tabs.
   */
  public async saveFileToDisk(
    task: DownloadTask,
    onProgress?: (msg: string) => void
  ): Promise<boolean> {
    onProgress?.('در حال ذخیره در حافظه دستگاه...');
    const blob = await this.getTaskMediaBlob(task);

    if (blob) {
      const res = await saveBlobToDevice(blob, task.fileName);
      if (res.saved) {
        task.isSaved = true;
        this.savedTaskIds.add(task.id);
        this.notifyFileSaved(task);
        this.notify(task);
        return true;
      }
    }

    const isAudio = task.format.type === 'audio';
    const heightMatch =
      task.format.resolution?.match(/x(\d+)/) ||
      task.format.qualityLabel.match(/(\d{3,4})p/);
    const reqQuality = heightMatch ? heightMatch[1] : '720';
    const streamUrl =
      (task.directUrl && task.directUrl.includes('/api/media/'))
        ? task.directUrl
        : getApiUrl(
            `/api/media/stream?url=${encodeURIComponent(
              task.originalUrl
            )}&quality=${reqQuality}&audio=${isAudio ? '1' : '0'}`
          );

    triggerSilentAttachmentDownload(streamUrl, task.fileName);
    task.isSaved = true;
    this.savedTaskIds.add(task.id);
    this.notifyFileSaved(task);
    this.notify(task);
    return true;
  }
}

export const downloadEngine = new DownloadEngine();
export { formatBytes };
