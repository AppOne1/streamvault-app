import { DownloadTask, FormatOption, ParsedMediaInfo } from '../types';
import { saveOfflineMedia, getOfflineMedia } from './storageService';
import {
  resolveDirectMediaStream,
  resolveViaTikWM,
  fetchMediaStreamWithCorsFallback,
  extractVideoFrameThumbnail
} from './mediaExtractor';
import { isCapacitorOrNative, isWebpageUrl } from './platformDetector';
import { saveBlobToDevice } from './nativeStorage';

type TaskUpdateListener = (task: DownloadTask) => void;

// Minimum valid sizes to prevent saving 0.3 MB HTML/text error responses as MP4
const MIN_VIDEO_BYTES = 500 * 1024; // 500 KB minimum for video MP4
const MIN_AUDIO_BYTES = 100 * 1024; // 100 KB minimum for audio MP3

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

class DownloadEngine {
  private activeControllers: Map<string, AbortController> = new Map();
  private listeners: Set<TaskUpdateListener> = new Set();
  private cachedBlobs: Map<string, { blob: Blob; url: string }> = new Map();

  public subscribe(listener: TaskUpdateListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(task: DownloadTask) {
    this.listeners.forEach((fn) => fn(task));
  }

  public createTask(media: ParsedMediaInfo, format: FormatOption): DownloadTask {
    const ext = format.format;
    const cleanTitle = media.title.replace(/[^\w\s\u0600-\u06FF-]/gi, '').trim().substring(0, 50);
    const fileName = `${cleanTitle || 'OneDownload_Media'}_${format.qualityLabel.replace(/[\s()/]+/g, '_')}.${ext}`;
    
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
      fileName,
      createdAt: Date.now(),
      isStarred: false
    };

    return task;
  }

  public async startTask(task: DownloadTask) {
    if (this.activeControllers.has(task.id)) return;

    const controller = new AbortController();
    this.activeControllers.set(task.id, controller);

    task.status = 'downloading';
    task.progressPercent = 5;
    task.speedFormatted = '1.8 MB/s';
    this.notify(task);

    const startTime = performance.now();

    try {
      const heightMatch = task.format.qualityLabel.match(/\d+/);
      const targetHeight = heightMatch ? parseInt(heightMatch[0], 10) : 720;
      const isAudio = task.format.type === 'audio';
      const minBytes = isAudio ? MIN_AUDIO_BYTES : MIN_VIDEO_BYTES;

      let resolvedFileUrl = '';
      let downloadedBlob: Blob | null = null;
      const isNativeApk = isCapacitorOrNative();
      const isTikTok =
        task.platform === 'tiktok' ||
        /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(task.originalUrl);

      // ── Engine #1 for TikTok: TikWM Direct No-Watermark API (https://www.tikwm.com/api/?url=) ──
      if (isTikTok) {
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
              resolvedFileUrl = startData.direct_url;
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

      // Helper to stream and assemble a verified binary Blob with live progress
      const streamUrlToBlob = async (urlToFetch: string): Promise<Blob | null> => {
        try {
          const response = await fetchMediaStreamWithCorsFallback(urlToFetch, controller.signal);
          if (!response || !response.ok) return null;

          const contentType = (response.headers.get('content-type') || '').toLowerCase();
          if (contentType.includes('text/html') || contentType.includes('application/json') || contentType.includes('text/plain')) {
            return null;
          }

          const contentLengthHeader = response.headers.get('content-length');
          const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : task.totalBytes;
          if (total > 0 && total < minBytes) {
            // Reject small (< 500 KB for video) payloads
            return null;
          }
          if (total >= minBytes) {
            task.totalBytes = total;
            task.totalSizeFormatted = `${(total / (1024 * 1024)).toFixed(1)} MB`;
          }

          const reader = response.body?.getReader();
          if (reader) {
            const chunks: Uint8Array[] = [];
            let received = 0;
            let lastReport = performance.now();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                received += value.length;
                task.downloadedBytes = received;

                const now = performance.now();
                if (now - lastReport >= 160) {
                  const filePct = total > 0
                    ? Math.min(98, 30 + Math.round((received / total) * 68))
                    : Math.min(95, 30 + Math.round((received / (1024 * 1024)) * 6));
                  task.progressPercent = Math.max(30, filePct);
                  task.downloadedSizeFormatted = `${(received / (1024 * 1024)).toFixed(1)} MB`;
                  const timeDiff = (now - lastReport) / 1000;
                  const speed = timeDiff > 0 ? (value.length / timeDiff) / (1024 * 1024) : 2.4;
                  task.speedFormatted = `${Math.max(1.6, speed).toFixed(1)} MB/s`;
                  lastReport = now;
                  this.notify(task);
                }

                if (total > 0 && received >= total) {
                  break;
                }
              }
            }

            if (chunks.length > 0 && received >= minBytes) {
              return new Blob(chunks as BlobPart[], {
                type: isAudio ? 'audio/mpeg' : 'video/mp4'
              });
            }
          } else {
            const b = await response.blob();
            if (isValidMediaBlob(b, isAudio)) {
              return b;
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') throw err;
          console.warn('Stream read notice:', err);
        }
        return null;
      };

      if (resolvedFileUrl) {
        task.directUrl = resolvedFileUrl;
        task.progressPercent = 30;
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
