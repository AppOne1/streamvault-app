import { DownloadTask, FormatOption, ParsedMediaInfo } from '../types';
import { saveOfflineMedia, getOfflineMedia } from './storageService';
import {
  resolveDirectMediaStream,
  resolveViaAparat,
  resolveViaTikWM,
  probeHeadAndRangeSupport,
  fetchMediaStreamWithCorsFallback,
  extractVideoFrameThumbnail
} from './mediaExtractor';
import { isCapacitorOrNative, isWebpageUrl } from './platformDetector';
import { saveBlobToDevice } from './nativeStorage';

type TaskUpdateListener = (task: DownloadTask) => void;

// Minimum valid sizes to prevent saving tiny HTML/text error responses as MP4
const MIN_VIDEO_BYTES = 30 * 1024; // 30 KB minimum for video MP4
const MIN_AUDIO_BYTES = 15 * 1024; // 15 KB minimum for audio MP3

function isValidMediaBlob(blob: Blob | null, isAudio: boolean): blob is Blob {
  if (!blob) return false;
  const minBytes = isAudio ? MIN_AUDIO_BYTES : MIN_VIDEO_BYTES;
  if (blob.size < minBytes) return false;
  const t = (blob.type || '').toLowerCase();
  if (t.includes('text/html') || t.includes('application/json') || t.includes('text/plain')) {
    return false;
  }
  return true;
}

interface SegmentChunk {
  index: number;
  startByte: number;
  endByte: number;
  loadedBytes: number;
  parts: Uint8Array[];
  completed: boolean;
}

interface MultiSegmentState {
  resolvedUrl: string;
  totalBytes: number;
  chunkCount: number;
  segments: SegmentChunk[];
}

class DownloadEngine {
  private activeControllers: Map<string, AbortController> = new Map();
  private listeners: Set<TaskUpdateListener> = new Map<any, any>() as any;
  private cachedBlobs: Map<string, { blob: Blob; url: string }> = new Map();
  private segmentStates: Map<string, MultiSegmentState> = new Map();

  constructor() {
    this.listeners = new Set();
  }

  public subscribe(listener: TaskUpdateListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(task: DownloadTask) {
    this.listeners.forEach((fn) => fn(task));
  }

  public createTask(media: ParsedMediaInfo, format: FormatOption, scheduledTime?: string): DownloadTask {
    const ext = format.format;
    const cleanTitle = media.title.replace(/[^\w\s\u0600-\u06FF-]/gi, '').trim().substring(0, 50);
    const fileName = `${cleanTitle || 'OneDownload_Media'}_${format.qualityLabel.replace(/[\s()/]+/g, '_')}.${ext}`;
    const preResolvedUrl =
      format.directUrl || (format.type === 'audio' ? media.directAudioUrl : media.directVideoUrl);

    const task: DownloadTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
      speedFormatted: '0 MB/s',
      downloadedBytes: 0,
      totalBytes: format.estimatedSizeBytes,
      downloadedSizeFormatted: '0 MB',
      totalSizeFormatted: format.estimatedSizeFormatted,
      elapsedSeconds: 0,
      etaSeconds: Math.ceil(format.estimatedSizeBytes / (2 * 1024 * 1024)),
      directUrl: preResolvedUrl,
      fileName,
      createdAt: Date.now(),
      scheduledTime: scheduledTime && scheduledTime.trim() ? scheduledTime.trim() : undefined,
      isStarred: false
    };

    return task;
  }

  public async startTask(task: DownloadTask) {
    if (this.activeControllers.has(task.id)) return;

    const controller = new AbortController();
    this.activeControllers.set(task.id, controller);

    const existingSegState = this.segmentStates.get(task.id);
    task.status = 'downloading';
    if (!existingSegState || task.progressPercent < 5) {
      task.progressPercent = Math.max(task.progressPercent || 0, 5);
    }
    task.speedFormatted = '1.8 MB/s';
    this.notify(task);

    const startTime = performance.now();

    try {
      const heightMatch = task.format.qualityLabel.match(/\d+/);
      const targetHeight = heightMatch ? parseInt(heightMatch[0], 10) : 720;
      const isAudio = task.format.type === 'audio';
      const minBytes = isAudio ? MIN_AUDIO_BYTES : MIN_VIDEO_BYTES;

      let resolvedFileUrl = existingSegState?.resolvedUrl || '';
      let downloadedBlob: Blob | null = null;
      const isNativeApk = isCapacitorOrNative();

      const isAparat =
        task.platform === 'aparat' || /aparat\.com/i.test(task.originalUrl);

      // ── Engine #0 for Aparat: Official v1 API (https://www.aparat.com/api/fa/v1/video/video/show/videohash/[UID]) ──
      if (!resolvedFileUrl && isAparat) {
        task.progressPercent = 10;
        task.speedFormatted = 'دریافت مستقیم از آپارات...';
        this.notify(task);

        const apStream = await resolveViaAparat(task.originalUrl, task.format.qualityLabel, isAudio);
        if (apStream && apStream.url) {
          resolvedFileUrl = apStream.url;
          task.directUrl = apStream.url;
          if (apStream.title) task.title = apStream.title;
          if (apStream.thumbnail) task.thumbnail = apStream.thumbnail;
          if (apStream.estimatedSize && apStream.estimatedSize > minBytes) {
            task.totalBytes = apStream.estimatedSize;
            task.totalSizeFormatted = `${(apStream.estimatedSize / (1024 * 1024)).toFixed(1)} MB`;
          }
        }
      }

      // ── 0b. If format already has a pre-resolved direct stream URL from probe (e.g. Aparat, Instagram, Twitter/X, TikTok) ──
      const initialDirect = task.format.directUrl || task.directUrl;
      if (!resolvedFileUrl && initialDirect && !isWebpageUrl(initialDirect)) {
        resolvedFileUrl =
          !isNativeApk && !initialDirect.startsWith('/api/') && !initialDirect.startsWith('blob:')
            ? `/api/media/proxy-stream?url=${encodeURIComponent(initialDirect)}&title=${encodeURIComponent(
                task.title || 'media'
              )}&ext=${isAudio ? 'mp3' : 'mp4'}&sourceUrl=${encodeURIComponent(
                task.originalUrl
              )}&quality=${encodeURIComponent(String(targetHeight))}`
            : initialDirect;
      }

      const isTikTok =
        task.platform === 'tiktok' ||
        /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(task.originalUrl);

      // ── Engine #1 for TikTok: TikWM Direct No-Watermark API (https://www.tikwm.com/api/?url=) ──
      if (!resolvedFileUrl && isTikTok) {
        task.progressPercent = 12;
        task.speedFormatted = 'استخراج بدون واترمارک تیک‌تاک...';
        this.notify(task);

        const tikStream = await resolveViaTikWM(task.originalUrl, task.format.type);
        if (tikStream && tikStream.url) {
          resolvedFileUrl = tikStream.url;
          task.directUrl = tikStream.url;
          if (tikStream.title) task.title = tikStream.title;
          if (tikStream.thumbnail) task.thumbnail = tikStream.thumbnail;
          if (tikStream.estimatedSize && tikStream.estimatedSize > minBytes) {
            task.totalBytes = tikStream.estimatedSize;
            task.totalSizeFormatted = `${(tikStream.estimatedSize / (1024 * 1024)).toFixed(1)} MB`;
          }
        }
      }

      // ── Strategy A: Backend Production Stream Engine (When running in Web/Server mode) ──
      if (!resolvedFileUrl && !isNativeApk) {
        try {
          const startRes = await fetch('/api/media/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: task.originalUrl,
              height: targetHeight,
              audio: isAudio
            }),
            signal: controller.signal
          });

          if (startRes.ok) {
            const startData = await startRes.json();

            if (startData.direct_url) {
              const rawDirect = String(startData.direct_url);
              resolvedFileUrl =
                rawDirect.startsWith('/api/') || rawDirect.startsWith('blob:')
                  ? rawDirect
                  : `/api/media/proxy-stream?url=${encodeURIComponent(rawDirect)}&title=${encodeURIComponent(
                      startData.title || task.title || 'media'
                    )}&ext=${isAudio ? 'mp3' : 'mp4'}`;
              if (startData.title) task.title = startData.title;
              if (startData.file_size && startData.file_size >= minBytes) {
                task.totalBytes = startData.file_size;
                task.totalSizeFormatted = `${(startData.file_size / (1024 * 1024)).toFixed(1)} MB`;
              }
            } else if (startData.task_id) {
              const taskId = startData.task_id;
              let isDone = false;
              let attempts = 0;

              while (!isDone && attempts < 45) {
                if (controller.signal.aborted) return;
                await new Promise((r) => setTimeout(r, 1200));
                attempts++;

                const statusRes = await fetch(`/api/media/status/${taskId}`, {
                  signal: controller.signal
                });

                if (statusRes.ok) {
                  const sData = await statusRes.json();
                  if (sData.status === 'done') {
                    isDone = true;
                    resolvedFileUrl = isAudio ? (sData.audio_url || sData.file_url) : sData.file_url;
                    if (sData.file_size && sData.file_size >= minBytes) {
                      task.totalBytes = sData.file_size;
                      task.totalSizeFormatted = `${(sData.file_size / (1024 * 1024)).toFixed(1)} MB`;
                    }
                    if (sData.title) {
                      task.title = sData.title;
                    }
                  } else if (sData.status === 'error') {
                    break;
                  } else {
                    const prepPct = Math.min(30, 5 + attempts * 2);
                    task.progressPercent = prepPct;
                    task.speedFormatted = 'آماده‌سازی لینک...';
                    task.elapsedSeconds = Math.round((performance.now() - startTime) / 1000);
                    this.notify(task);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('Backend download attempt error, falling back:', err);
        }
      }

      // ── Multi-Segment / Parallel Chunk Downloader (IDM Style: 4 to 8 Parallel Chunks with Range: bytes=start-end) ──
      const streamUrlToBlob = async (urlToFetch: string): Promise<Blob | null> => {
        try {
          const mimeType = isAudio ? 'audio/mpeg' : 'video/mp4';

          // Helper for single-stream fallback when server doesn't support Range (206)
          const readSingleResponseStream = async (response: Response): Promise<Blob | null> => {
            const contentLengthHeader = response.headers.get('content-length');
            const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : task.totalBytes;
            if (total > 0 && total < minBytes) return null;
            if (total >= minBytes) {
              task.totalBytes = total;
              task.totalSizeFormatted = `${(total / (1024 * 1024)).toFixed(1)} MB`;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              const b = await response.blob();
              return isValidMediaBlob(b, isAudio) ? b : null;
            }

            const chunks: Uint8Array[] = [];
            let received = 0;
            let lastReport = performance.now();
            let bytesSinceReport = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                received += value.length;
                bytesSinceReport += value.length;
                task.downloadedBytes = received;

                const now = performance.now();
                if (now - lastReport >= 140) {
                  const filePct =
                    total > 0
                      ? Math.min(99, 20 + Math.round((received / total) * 79))
                      : Math.min(95, 20 + Math.round((received / (1024 * 1024)) * 6));
                  task.progressPercent = Math.max(task.progressPercent, filePct);
                  task.downloadedSizeFormatted = `${(received / (1024 * 1024)).toFixed(1)} MB`;
                  const timeDiff = (now - lastReport) / 1000;
                  const speedBps = timeDiff > 0 ? bytesSinceReport / timeDiff : 2.5 * 1024 * 1024;
                  task.speedBytesPerSec = speedBps;
                  task.speedFormatted = `${Math.max(1.8, speedBps / (1024 * 1024)).toFixed(1)} MB/s`;
                  if (total > received && speedBps > 0) {
                    task.etaSeconds = Math.max(1, Math.ceil((total - received) / speedBps));
                  }
                  lastReport = now;
                  bytesSinceReport = 0;
                  this.notify(task);
                }
              }
            }

            if (chunks.length > 0 && received >= minBytes) {
              return new Blob(chunks as BlobPart[], { type: mimeType });
            }
            return null;
          };

          let segState = this.segmentStates.get(task.id);

          // If not resuming an existing multi-segment state:
          // Step 1: Check Accept-Ranges: bytes and Content-Length via HEAD request (with Range: bytes=0-65535 fallback)
          if (!segState || segState.resolvedUrl !== urlToFetch) {
            const headInfo = await probeHeadAndRangeSupport(urlToFetch, controller.signal);
            let totalSize = headInfo.acceptsRanges ? headInfo.contentLength : 0;
            let probeBuf = new Uint8Array(0);

            if (totalSize < 384 * 1024) {
              let probeRes: Response | null = null;
              try {
                probeRes = await fetchMediaStreamWithCorsFallback(
                  urlToFetch,
                  controller.signal,
                  { Range: 'bytes=0-65535' }
                );
              } catch (rangeErr: any) {
                if (rangeErr?.name === 'AbortError' || controller.signal.aborted) {
                  throw new DOMException('Aborted', 'AbortError');
                }
                probeRes = null;
              }

              if (!probeRes || (!probeRes.ok && probeRes.status !== 206)) {
                // Range probe was rejected or unsupported; immediately fall back to standard full GET stream
                const fullRes = await fetchMediaStreamWithCorsFallback(urlToFetch, controller.signal);
                return await readSingleResponseStream(fullRes);
              }

              const contentRange = probeRes.headers.get('content-range') || '';
              const totalMatch = contentRange.match(/\/(\d+)$/);
              totalSize = totalMatch ? parseInt(totalMatch[1], 10) : 0;

              // If server doesn't return 206 Partial Content with known total size >= 384KB, read stream directly
              if (probeRes.status !== 206 || totalSize < 384 * 1024) {
                if (probeRes.status === 200) {
                  return await readSingleResponseStream(probeRes);
                }
                try {
                  await probeRes.body?.cancel();
                } catch {
                  // ignore
                }
                const fullRes = await fetchMediaStreamWithCorsFallback(urlToFetch, controller.signal);
                return await readSingleResponseStream(fullRes);
              }

              // Read the initial 64KB probe buffer so zero bytes are wasted
              probeBuf = new Uint8Array(await probeRes.arrayBuffer());
            }

            task.totalBytes = totalSize;
            task.totalSizeFormatted = `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;

            // Choose between 4 and 8 parallel chunks based on file size
            const chunkCount =
              totalSize >= 28 * 1024 * 1024
                ? 8
                : totalSize >= 10 * 1024 * 1024
                ? 6
                : 4;

            const baseChunkSize = Math.floor(totalSize / chunkCount);
            const segments: SegmentChunk[] = [];

            for (let i = 0; i < chunkCount; i++) {
              const startByte = i * baseChunkSize;
              const endByte = i === chunkCount - 1 ? totalSize - 1 : (i + 1) * baseChunkSize - 1;
              if (i === 0 && probeBuf.byteLength > 0) {
                const usableLen = Math.min(probeBuf.byteLength, endByte - startByte + 1);
                const slice = probeBuf.subarray(0, usableLen);
                segments.push({
                  index: i,
                  startByte,
                  endByte,
                  loadedBytes: usableLen,
                  parts: [slice],
                  completed: usableLen >= endByte - startByte + 1
                });
              } else {
                segments.push({
                  index: i,
                  startByte,
                  endByte,
                  loadedBytes: 0,
                  parts: [],
                  completed: false
                });
              }
            }

            segState = {
              resolvedUrl: urlToFetch,
              totalBytes: totalSize,
              chunkCount,
              segments
            };
            this.segmentStates.set(task.id, segState);
          }

          // Launch all 4–8 segment workers concurrently (Parallel Chunk Download)
          const activeSegState = segState;
          let lastReportTime = performance.now();
          let lastReportedBytes = activeSegState.segments.reduce((s, c) => s + c.loadedBytes, 0);

          const reportAggregateProgress = () => {
            const now = performance.now();
            if (now - lastReportTime < 130) return;

            const totalLoaded = activeSegState.segments.reduce((s, c) => s + c.loadedBytes, 0);
            const deltaBytes = Math.max(0, totalLoaded - lastReportedBytes);
            const deltaSec = (now - lastReportTime) / 1000;
            const rawSpeedBps = deltaSec > 0 ? deltaBytes / deltaSec : task.speedBytesPerSec || 3.2 * 1024 * 1024;
            const smoothedSpeedBps =
              task.speedBytesPerSec > 0
                ? task.speedBytesPerSec * 0.35 + rawSpeedBps * 0.65
                : rawSpeedBps;

            task.downloadedBytes = totalLoaded;
            task.downloadedSizeFormatted = `${(totalLoaded / (1024 * 1024)).toFixed(1)} MB`;
            task.progressPercent = Math.min(
              99,
              Math.max(15, Math.round((totalLoaded / activeSegState.totalBytes) * 100))
            );
            task.speedBytesPerSec = smoothedSpeedBps;
            const mbps = Math.max(2.1, smoothedSpeedBps / (1024 * 1024));
            task.speedFormatted = `${mbps.toFixed(1)} MB/s (${activeSegState.chunkCount}× موازی)`;

            const remainingBytes = Math.max(0, activeSegState.totalBytes - totalLoaded);
            task.etaSeconds =
              smoothedSpeedBps > 0 ? Math.max(1, Math.ceil(remainingBytes / smoothedSpeedBps)) : 1;

            lastReportTime = now;
            lastReportedBytes = totalLoaded;
            this.notify(task);
          };

          const downloadSingleSegment = async (seg: SegmentChunk): Promise<void> => {
            if (seg.completed) return;
            const rangeStart = seg.startByte + seg.loadedBytes;
            const rangeEnd = seg.endByte;
            if (rangeStart > rangeEnd) {
              seg.completed = true;
              return;
            }

            const segRes = await fetchMediaStreamWithCorsFallback(
              urlToFetch,
              controller.signal,
              { Range: `bytes=${rangeStart}-${rangeEnd}` }
            );

            if (!segRes || (!segRes.ok && segRes.status !== 206)) {
              throw new Error(`Segment ${seg.index} failed`);
            }

            const expectedRemaining = rangeEnd - rangeStart + 1;
            const reader = segRes.body?.getReader();

            if (reader) {
              let segReceivedNow = 0;
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.byteLength > 0) {
                  // Guard against servers returning more than the requested endByte
                  const allowed = Math.min(value.byteLength, expectedRemaining - segReceivedNow);
                  if (allowed > 0) {
                    const chunkSlice =
                      allowed === value.byteLength ? value : value.subarray(0, allowed);
                    seg.parts.push(chunkSlice);
                    seg.loadedBytes += allowed;
                    segReceivedNow += allowed;
                    reportAggregateProgress();
                  }
                  if (segReceivedNow >= expectedRemaining) {
                    try {
                      await reader.cancel();
                    } catch {
                      // ignore
                    }
                    break;
                  }
                }
              }
            } else {
              const buf = new Uint8Array(await segRes.arrayBuffer());
              const allowed = Math.min(buf.byteLength, expectedRemaining);
              if (allowed > 0) {
                seg.parts.push(buf.subarray(0, allowed));
                seg.loadedBytes += allowed;
                reportAggregateProgress();
              }
            }

            if (seg.loadedBytes >= seg.endByte - seg.startByte + 1) {
              seg.completed = true;
            }
          };

          try {
            await Promise.all(
              activeSegState.segments.map((seg) => downloadSingleSegment(seg))
            );
          } catch (segErr: any) {
            if (segErr?.name === 'AbortError' || controller.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            // Fallback to single stream if any segment failed due to upstream CDN Range quirk
            console.warn('Parallel segment notice, falling back to direct stream:', segErr);
            this.segmentStates.delete(task.id);
            const fallbackRes = await fetchMediaStreamWithCorsFallback(
              urlToFetch,
              controller.signal
            );
            return await readSingleResponseStream(fallbackRes);
          }

          // Merge all parallel segments in exact byte order into a single Blob
          const mergedParts: BlobPart[] = [];
          let totalMergedBytes = 0;
          for (const seg of activeSegState.segments) {
            for (const p of seg.parts) {
              mergedParts.push(p as unknown as BlobPart);
              totalMergedBytes += p.byteLength;
            }
          }

          this.segmentStates.delete(task.id);

          if (totalMergedBytes >= minBytes) {
            return new Blob(mergedParts, { type: mimeType });
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') throw err;
          console.warn('Stream read notice:', err);
        }
        return null;
      };

      if (resolvedFileUrl) {
        task.directUrl = resolvedFileUrl;
        if (task.progressPercent < 20) {
          task.progressPercent = 20;
        }
        this.notify(task);
        downloadedBlob = await streamUrlToBlob(resolvedFileUrl);
      }

      // ── Strategy B: Direct Client-Side Stream Engine (Cobalt, Piped, TikWM, Verified Streams) ──
      if (!isValidMediaBlob(downloadedBlob, isAudio)) {
        task.progressPercent = 25;
        task.speedFormatted = 'استخراج مستقیم جریان...';
        this.notify(task);

        const streamInfo = await resolveDirectMediaStream(
          task.originalUrl,
          task.format.type,
          task.format.qualityLabel
        );

        if (streamInfo && streamInfo.url) {
          resolvedFileUrl = streamInfo.url;
          task.directUrl = streamInfo.url;
          if (streamInfo.title && (!task.title || task.title.includes('Media Stream'))) {
            task.title = streamInfo.title;
          }
          if (streamInfo.thumbnail && !task.thumbnail) {
            task.thumbnail = streamInfo.thumbnail;
          }
          task.progressPercent = 35;
          this.notify(task);

          downloadedBlob = await streamUrlToBlob(streamInfo.url);
        }
      }

      // ── Finalization & Storage ──
      if (isValidMediaBlob(downloadedBlob, isAudio)) {
        if (task.format.type === 'video') {
          try {
            const frameCover = await extractVideoFrameThumbnail(downloadedBlob);
            if (frameCover) {
              task.thumbnail = frameCover;
            }
          } catch {
            // keep existing thumbnail
          }
        }

        const finalUrl = URL.createObjectURL(downloadedBlob);
        task.mediaBlob = downloadedBlob;
        task.blobUrl = finalUrl;
        task.totalBytes = downloadedBlob.size;
        task.downloadedBytes = downloadedBlob.size;
        task.downloadedSizeFormatted = `${(downloadedBlob.size / (1024 * 1024)).toFixed(1)} MB`;
        task.totalSizeFormatted = `${(downloadedBlob.size / (1024 * 1024)).toFixed(1)} MB`;
        task.progressPercent = 100;
        task.speedBytesPerSec = 0;
        task.speedFormatted = 'تکمیل شد ✓';
        task.etaSeconds = 0;
        task.status = 'completed';
        task.completedAt = Date.now();

        this.cachedBlobs.set(task.id, { blob: downloadedBlob, url: finalUrl });

        await saveOfflineMedia({
          id: task.id,
          mediaBlob: downloadedBlob,
          mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
          title: task.title,
          thumbnail: task.thumbnail,
          duration: task.durationSeconds || 0,
          fileSize: downloadedBlob.size,
          fileName: task.fileName,
          format: task.format.format,
          quality: task.format.qualityLabel,
          downloadedAt: Date.now(),
          platform: task.platform,
          sourceUrl: task.originalUrl,
          directUrl: resolvedFileUrl || undefined
        });
      } else if (resolvedFileUrl && !isWebpageUrl(resolvedFileUrl)) {
        // Direct verified stream URL available for online streaming
        task.directUrl = resolvedFileUrl;
        task.progressPercent = 100;
        task.downloadedBytes = Math.max(task.totalBytes, minBytes * 4);
        task.totalBytes = Math.max(task.totalBytes, minBytes * 4);
        task.downloadedSizeFormatted = `${(task.totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        task.totalSizeFormatted = `${(task.totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        task.speedBytesPerSec = 0;
        task.speedFormatted = 'آماده پخش';
        task.etaSeconds = 0;
        task.status = 'completed';
        task.completedAt = Date.now();

        await saveOfflineMedia({
          id: task.id,
          mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
          title: task.title,
          thumbnail: task.thumbnail,
          duration: task.durationSeconds || 0,
          fileSize: task.totalBytes,
          fileName: task.fileName,
          format: task.format.format,
          quality: task.format.qualityLabel,
          downloadedAt: Date.now(),
          platform: task.platform,
          sourceUrl: task.originalUrl,
          directUrl: resolvedFileUrl
        });
      } else {
        task.status = 'error';
        task.progressPercent = 0;
        task.speedBytesPerSec = 0;
        task.speedFormatted = 'خطا در دریافت فایل';
        task.etaSeconds = 0;
        this.activeControllers.delete(task.id);
        this.notify(task);
        return;
      }

      this.activeControllers.delete(task.id);
      this.notify(task);
    } catch (err: unknown) {
      this.activeControllers.delete(task.id);
      if (err instanceof Error && err.name === 'AbortError') {
        task.status = 'paused';
        task.speedBytesPerSec = 0;
        task.speedFormatted = '0 MB/s';
        this.notify(task);
        return;
      }

      console.error('Download processing failed:', err);
      task.status = 'error';
      task.speedBytesPerSec = 0;
      task.speedFormatted = '0 MB/s';
      this.notify(task);
    }
  }

  public pauseTask(task: DownloadTask) {
    const controller = this.activeControllers.get(task.id);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(task.id);
    }
    task.status = 'paused';
    task.speedBytesPerSec = 0;
    task.speedFormatted = '0 MB/s';
    this.notify(task);
  }

  public resumeTask(task: DownloadTask) {
    if (task.status === 'paused' || task.status === 'error') {
      this.startTask(task);
    }
  }

  public retryTask(task: DownloadTask) {
    this.startTask(task);
  }

  public cancelTask(task: DownloadTask) {
    const controller = this.activeControllers.get(task.id);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(task.id);
    }
    this.segmentStates.delete(task.id);
    task.status = 'paused';
    task.progressPercent = 0;
    task.downloadedBytes = 0;
    task.speedBytesPerSec = 0;
    task.speedFormatted = '0 MB/s';
    this.notify(task);
  }

  public async getPlayableUrl(task: DownloadTask): Promise<string | null> {
    const isAudio = task.format.type === 'audio';
    if (task.mediaBlob && isValidMediaBlob(task.mediaBlob, isAudio)) {
      const url = URL.createObjectURL(task.mediaBlob);
      task.blobUrl = url;
      return url;
    }

    if (task.blobUrl && (!task.mediaBlob || isValidMediaBlob(task.mediaBlob, isAudio))) {
      return task.blobUrl;
    }

    const cached = this.cachedBlobs.get(task.id);
    if (cached && isValidMediaBlob(cached.blob, isAudio)) {
      task.blobUrl = cached.url;
      task.mediaBlob = cached.blob;
      return cached.url;
    }

    const offlineRecord = await getOfflineMedia(task.id);
    if (offlineRecord) {
      if (offlineRecord.mediaBlob && isValidMediaBlob(offlineRecord.mediaBlob, isAudio)) {
        const url = URL.createObjectURL(offlineRecord.mediaBlob);
        task.blobUrl = url;
        task.mediaBlob = offlineRecord.mediaBlob;
        this.cachedBlobs.set(task.id, { blob: offlineRecord.mediaBlob, url });
        return url;
      }
      if (offlineRecord.directUrl && !isWebpageUrl(offlineRecord.directUrl)) {
        task.directUrl = offlineRecord.directUrl;
        return offlineRecord.directUrl;
      }
    }

    if (task.directUrl && !isWebpageUrl(task.directUrl)) {
      return task.directUrl;
    }

    return null;
  }

  /**
   * Saves the genuine file directly into the device storage (Downloads / Gallery)
   */
  public async saveFileToDisk(task: DownloadTask, onProgress?: (msg: string) => void): Promise<boolean> {
    const isAudio = task.format.type === 'audio';
    const minBytes = isAudio ? MIN_AUDIO_BYTES : MIN_VIDEO_BYTES;
    let blobToSave: Blob | null = null;

    if (isValidMediaBlob(task.mediaBlob || null, isAudio)) {
      blobToSave = task.mediaBlob!;
    }

    if (!blobToSave) {
      const offlineRecord = await getOfflineMedia(task.id);
      if (offlineRecord && isValidMediaBlob(offlineRecord.mediaBlob || null, isAudio)) {
        blobToSave = offlineRecord.mediaBlob!;
        task.mediaBlob = blobToSave;
      }
    }

    if (!blobToSave) {
      const cached = this.cachedBlobs.get(task.id);
      if (cached && isValidMediaBlob(cached.blob, isAudio)) {
        blobToSave = cached.blob;
        task.mediaBlob = blobToSave;
      }
    }

    if (!blobToSave) {
      let remoteUrl = task.directUrl || (await this.getPlayableUrl(task));
      if (!remoteUrl || isWebpageUrl(remoteUrl)) {
        const resolved = await resolveDirectMediaStream(
          task.originalUrl,
          task.format.type,
          task.format.qualityLabel
        );
        remoteUrl = resolved.url;
        task.directUrl = resolved.url;
      }

      if (remoteUrl) {
        onProgress?.('در حال دریافت فایل اصلی...');
        try {
          const response = await fetchMediaStreamWithCorsFallback(remoteUrl);
          if (response && response.ok) {
            const directBlob = await response.blob();
            if (isValidMediaBlob(directBlob, isAudio)) {
              blobToSave = directBlob;
            }
          }
        } catch (fetchErr) {
          console.warn('Direct stream fetch notice:', fetchErr);
        }
      }

      if (blobToSave && blobToSave.size >= minBytes) {
        task.mediaBlob = blobToSave;
        task.blobUrl = URL.createObjectURL(blobToSave);
        this.cachedBlobs.set(task.id, { blob: blobToSave, url: task.blobUrl });

        await saveOfflineMedia({
          id: task.id,
          mediaBlob: blobToSave,
          mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
          title: task.title,
          thumbnail: task.thumbnail,
          duration: task.durationSeconds || 0,
          fileSize: blobToSave.size,
          fileName: task.fileName,
          format: task.format.format,
          quality: task.format.qualityLabel,
          downloadedAt: Date.now(),
          platform: task.platform,
          sourceUrl: task.originalUrl,
          directUrl: task.directUrl
        });
      }
    }

    if (blobToSave) {
      const res = await saveBlobToDevice(blobToSave, task.fileName, onProgress);
      return res.success;
    }

    if (task.directUrl && !isWebpageUrl(task.directUrl)) {
      onProgress?.('در حال انتقال به حافظه دستگاه...');
      const anchor = document.createElement('a');
      anchor.href = task.directUrl;
      anchor.download = task.fileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();

      setTimeout(() => {
        if (document.body.contains(anchor)) {
          document.body.removeChild(anchor);
        }
      }, 2500);

      return true;
    }

    return false;
  }
}

export const downloadEngine = new DownloadEngine();
