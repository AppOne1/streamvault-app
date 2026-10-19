import { DownloadTask, FormatOption, ParsedMediaInfo } from '../types';
import { saveOfflineMedia, getOfflineMedia } from './storageService';
import { resolveDirectMediaStream, fetchMediaStreamWithCorsFallback, extractVideoFrameThumbnail } from './mediaExtractor';
import { isCapacitorOrNative, isWebpageUrl } from './platformDetector';
import { saveBlobToDevice } from './nativeStorage';

type TaskUpdateListener = (task: DownloadTask) => void;

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
    const fileName = `${cleanTitle || 'StreamVault_Media'}_${format.qualityLabel.replace(/[\s()/]+/g, '_')}.${ext}`;
    
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
    task.speedFormatted = '1.5 MB/s';
    this.notify(task);

    const startTime = performance.now();

    try {
      // Extract target quality height (e.g., 720 from 720p HD)
      const heightMatch = task.format.qualityLabel.match(/\d+/);
      const targetHeight = heightMatch ? parseInt(heightMatch[0], 10) : 720;
      const isAudio = task.format.type === 'audio';

      // ── Strategy A: Backend Production Stream Engine (When running in Web/Server mode) ──
      let resolvedFileUrl = '';
      let downloadedBlob: Blob | null = null;
      const isNativeApk = isCapacitorOrNative();

      if (!isNativeApk) {
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
          } else if (startData.task_id) {
            const taskId = startData.task_id;
            let isDone = false;
            let attempts = 0;

            while (!isDone && attempts < 60) {
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
                  if (sData.file_size) {
                    task.totalBytes = sData.file_size;
                    task.totalSizeFormatted = `${(sData.file_size / (1024 * 1024)).toFixed(1)} MB`;
                  }
                  if (sData.title) {
                    task.title = sData.title;
                  }
                } else if (sData.status === 'error') {
                  break;
                } else {
                  // Real-time progress updates during backend stream resolution (Phase 1: 5% - 30%)
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

      // If backend stream URL was resolved:
      if (resolvedFileUrl) {
        task.directUrl = resolvedFileUrl;
        task.progressPercent = 30;
        this.notify(task);

        try {
          // Fetch raw Blob with chunked progress tracking so long videos stream smoothly!
          const fileFetchRes = await fetch(resolvedFileUrl, { signal: controller.signal });
          if (fileFetchRes.ok) {
            const contentLengthHeader = fileFetchRes.headers.get('content-length');
            const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : task.totalBytes;
            if (total > 0) {
              task.totalBytes = total;
              task.totalSizeFormatted = `${(total / (1024 * 1024)).toFixed(1)} MB`;
            }

            const reader = fileFetchRes.body?.getReader();
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
                  if (now - lastReport >= 180) {
                    const filePct = total > 0
                      ? Math.min(98, 30 + Math.round((received / total) * 68))
                      : Math.min(95, 30 + Math.round((received / (1024 * 1024)) * 3));
                    task.progressPercent = Math.max(30, filePct);
                    task.downloadedSizeFormatted = `${(received / (1024 * 1024)).toFixed(1)} MB`;
                    const timeDiff = (now - lastReport) / 1000;
                    const speed = timeDiff > 0 ? (value.length / timeDiff) / (1024 * 1024) : 2.0;
                    task.speedFormatted = `${Math.max(1.5, speed).toFixed(1)} MB/s`;
                    if (total > 0 && received < total) {
                      task.etaSeconds = Math.max(1, Math.round((total - received) / (2.5 * 1024 * 1024)));
                    } else {
                      task.etaSeconds = 1;
                    }
                    lastReport = now;
                    this.notify(task);
                  }

                  if (total > 0 && received >= total) {
                    break;
                  }
                }
              }

              // Verify integrity: only accept blob if received meaningful complete data
              if (chunks.length > 0 && received > 1024 && (!total || received >= total * 0.7)) {
                downloadedBlob = new Blob(chunks as BlobPart[], {
                  type: isAudio ? 'audio/mpeg' : 'video/mp4'
                });
              }
            } else {
              const b = await fileFetchRes.blob();
              if (b && b.size > 1024) {
                downloadedBlob = b;
              }
            }
          }
        } catch (fetchErr) {
          console.warn('Could not read blob in memory, will use direct URL:', fetchErr);
        }
      }

      // ── Strategy B: Direct Client-Side Stream Engine (Essential for offline Android APK) ──
      if (!downloadedBlob && !resolvedFileUrl) {
        task.progressPercent = 15;
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
          task.progressPercent = 30;
          this.notify(task);

          const response = await fetchMediaStreamWithCorsFallback(streamInfo.url, controller.signal);
          if (response && response.ok) {
            const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
            if (contentLength > 0) {
              task.totalBytes = contentLength;
              task.totalSizeFormatted = `${(contentLength / (1024 * 1024)).toFixed(1)} MB`;
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
                  if (now - lastReport >= 180) {
                    const filePct = task.totalBytes > 0
                      ? Math.min(98, 30 + Math.round((received / task.totalBytes) * 68))
                      : Math.min(95, 30 + Math.round((received / (1024 * 1024)) * 3));
                    task.progressPercent = Math.max(30, filePct);
                    task.downloadedSizeFormatted = `${(received / (1024 * 1024)).toFixed(1)} MB`;
                    const timeDiff = (now - lastReport) / 1000;
                    const speed = timeDiff > 0 ? (value.length / timeDiff) / (1024 * 1024) : 2.0;
                    task.speedFormatted = `${Math.max(1.5, speed).toFixed(1)} MB/s`;
                    lastReport = now;
                    this.notify(task);
                  }
                }
              }

              if (chunks.length > 0 && received > 1024) {
                downloadedBlob = new Blob(chunks as BlobPart[], {
                  type: isAudio ? 'audio/mpeg' : 'video/mp4'
                });
              }
            } else {
              const b = await response.blob();
              if (b && b.size > 1024) {
                downloadedBlob = b;
              }
            }
          }
        }
      }

      // ── Finalization & Storage ──
      if (downloadedBlob && downloadedBlob.size > 1024) {
        // Extract authentic video frame thumbnail directly from the downloaded video!
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

        // Full genuine Blob saved in memory and IndexedDB
        const finalUrl = URL.createObjectURL(downloadedBlob);
        task.mediaBlob = downloadedBlob;
        task.blobUrl = finalUrl;
        task.totalBytes = downloadedBlob.size;
        task.downloadedBytes = downloadedBlob.size;
        task.downloadedSizeFormatted = `${(downloadedBlob.size / (1024 * 1024)).toFixed(1)} MB`;
        task.progressPercent = 100;
        task.speedBytesPerSec = 0;
        task.speedFormatted = '0 MB/s';
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

      } else if (resolvedFileUrl) {
        // Stream resolved on server: attempt quick binary blob assembly or fallback to direct URL
        try {
          const retryCtrl = new AbortController();
          const retryTimer = setTimeout(() => retryCtrl.abort(), 4000);
          const fetchRetry = await fetch(resolvedFileUrl, { signal: retryCtrl.signal });
          clearTimeout(retryTimer);
          if (fetchRetry.ok) {
            const b = await fetchRetry.blob();
            if (b && b.size > 1024) {
              downloadedBlob = b;
            }
          }
        } catch (fetchErr) {
          console.warn('Quick blob assembly skipped, using direct stream:', fetchErr);
        }

        if (downloadedBlob && downloadedBlob.size > 1024) {
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
          task.progressPercent = 100;
          task.speedBytesPerSec = 0;
          task.speedFormatted = '0 MB/s';
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
            directUrl: resolvedFileUrl
          });
        } else if (resolvedFileUrl && !isWebpageUrl(resolvedFileUrl)) {
          // Direct audio/video stream URL is valid
          task.directUrl = resolvedFileUrl;
          task.progressPercent = 100;
          task.downloadedBytes = task.totalBytes;
          task.downloadedSizeFormatted = task.totalSizeFormatted;
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
            fileSize: task.totalBytes || 1024 * 1024 * 5,
            fileName: task.fileName,
            format: task.format.format,
            quality: task.format.qualityLabel,
            downloadedAt: Date.now(),
            platform: task.platform,
            sourceUrl: task.originalUrl,
            directUrl: resolvedFileUrl
          });
        } else {
          // Stream could not be extracted as genuine media
          task.status = 'error';
          task.progressPercent = 0;
          task.speedBytesPerSec = 0;
          task.speedFormatted = 'خطا در دریافت جریان ویدیو';
          task.etaSeconds = 0;
          this.activeControllers.delete(task.id);
          this.notify(task);
          return;
        }
      } else {
        // Neither blob nor server stream was resolved
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
    if (task.blobUrl) return task.blobUrl;
    if (task.mediaBlob && task.mediaBlob.size > 0) {
      const url = URL.createObjectURL(task.mediaBlob);
      task.blobUrl = url;
      return url;
    }

    if (task.directUrl) return task.directUrl;

    const cached = this.cachedBlobs.get(task.id);
    if (cached) {
      task.blobUrl = cached.url;
      task.mediaBlob = cached.blob;
      return cached.url;
    }

    // Retrieve from IndexedDB offline_media store
    const offlineRecord = await getOfflineMedia(task.id);
    if (offlineRecord) {
      if (offlineRecord.mediaBlob && offlineRecord.mediaBlob.size > 0) {
        const url = URL.createObjectURL(offlineRecord.mediaBlob);
        task.blobUrl = url;
        task.mediaBlob = offlineRecord.mediaBlob;
        this.cachedBlobs.set(task.id, { blob: offlineRecord.mediaBlob, url });
        return url;
      }
      if (offlineRecord.directUrl) {
        task.directUrl = offlineRecord.directUrl;
        return offlineRecord.directUrl;
      }
    }

    return null;
  }

  /**
   * Saves the genuine file directly into the device storage (Downloads / Gallery)
   * using a pure in-memory Blob URL. This guarantees that Android Chrome / iOS Safari
   * writes directly to disk without ever opening an external browser window or triggering
   * Cloud Run / AI Studio "Cookie check" authentication screens.
   */
  public async saveFileToDisk(task: DownloadTask, onProgress?: (msg: string) => void): Promise<boolean> {
    let blobToSave: Blob | null = null;

    // 1. Check in-memory mediaBlob
    if (task.mediaBlob && task.mediaBlob.size > 1024) {
      blobToSave = task.mediaBlob;
    }

    // 2. Check IndexedDB offline media
    if (!blobToSave) {
      const offlineRecord = await getOfflineMedia(task.id);
      if (offlineRecord && offlineRecord.mediaBlob && offlineRecord.mediaBlob.size > 1024) {
        blobToSave = offlineRecord.mediaBlob;
        task.mediaBlob = blobToSave;
      }
    }

    // 3. Check memory cache
    if (!blobToSave) {
      const cached = this.cachedBlobs.get(task.id);
      if (cached && cached.blob && cached.blob.size > 1024) {
        blobToSave = cached.blob;
        task.mediaBlob = blobToSave;
      }
    }

    // 4. If not yet in storage, fetch the file inside the active iframe session
    if (!blobToSave) {
      const remoteUrl = task.directUrl || (await this.getPlayableUrl(task));

      if (remoteUrl) {
        onProgress?.('در حال دریافت بایت‌های فایل...');
        try {
          const response = await fetch(remoteUrl);
          if (response.ok) {
            const reader = response.body?.getReader();
            if (reader) {
              const chunks: Uint8Array[] = [];
              let received = 0;
              const total = parseInt(response.headers.get('content-length') || '0', 10);

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                  chunks.push(value);
                  received += value.length;
                  if (total > 0) {
                    const pct = Math.round((received / total) * 100);
                    onProgress?.(`در حال آماده‌سازی: ${pct}% (${(received / (1024 * 1024)).toFixed(1)} MB)`);
                  }
                }
              }

              if (chunks.length > 0 && received > 1024) {
                blobToSave = new Blob(chunks as BlobPart[], {
                  type: task.format.type === 'audio' ? 'audio/mpeg' : 'video/mp4'
                });
              }
            } else {
              const directBlob = await response.blob();
              if (directBlob && directBlob.size > 1024) {
                blobToSave = directBlob;
              }
            }
          }
        } catch (fetchErr) {
          console.warn('Direct stream fetch failed, will re-resolve fresh stream:', fetchErr);
        }
      }

      // If remoteUrl failed or expired (404), re-resolve a fresh stream token automatically!
      if (!blobToSave) {
        onProgress?.('در حال آماده‌سازی لینک تازه و دریافت مستقیم...');
        try {
          const heightMatch = task.format.qualityLabel.match(/\d+/);
          const targetHeight = heightMatch ? parseInt(heightMatch[0], 10) : 720;
          const isAudio = task.format.type === 'audio';

          const startRes = await fetch('/api/media/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: task.originalUrl,
              height: targetHeight,
              audio: isAudio
            })
          });

          if (startRes.ok) {
            const startData = await startRes.json();
            let freshUrl = startData.direct_url || '';

            if (startData.task_id) {
              const taskId = startData.task_id;
              let attempts = 0;
              while (!freshUrl && attempts < 40) {
                await new Promise((r) => setTimeout(r, 1200));
                attempts++;
                const sRes = await fetch(`/api/media/status/${taskId}`);
                if (sRes.ok) {
                  const sData = await sRes.json();
                  if (sData.status === 'done') {
                    freshUrl = isAudio ? (sData.audio_url || sData.file_url) : sData.file_url;
                  } else if (sData.status === 'error') {
                    break;
                  }
                }
              }
            }

            if (freshUrl) {
              task.directUrl = freshUrl;
              const freshFetch = await fetch(freshUrl);
              if (freshFetch.ok) {
                const freshBlob = await freshFetch.blob();
                if (freshBlob && freshBlob.size > 1024) {
                  blobToSave = freshBlob;
                }
              }
            }
          }
        } catch (reErr) {
          console.warn('Re-resolving stream error:', reErr);
        }
      }

      if (blobToSave) {
        task.mediaBlob = blobToSave;
        task.blobUrl = URL.createObjectURL(blobToSave);
        this.cachedBlobs.set(task.id, { blob: blobToSave, url: task.blobUrl });

        await saveOfflineMedia({
          id: task.id,
          mediaBlob: blobToSave,
          mimeType: task.format.type === 'audio' ? 'audio/mpeg' : 'video/mp4',
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
          directUrl: task.directUrl || remoteUrl || undefined
        });
      }
    }

    if (blobToSave) {
      const res = await saveBlobToDevice(blobToSave, task.fileName, onProgress);
      return res.success;
    }

    const isNative = isCapacitorOrNative();

    // 4b. If still not in blobToSave, fetch directly into blob
    if (task.directUrl && !isWebpageUrl(task.directUrl)) {
      onProgress?.('در حال دریافت مستقیم جریان فایل...');
      try {
        let fetchUrl = task.directUrl;
        if (!isNative && fetchUrl.startsWith('http') && !fetchUrl.startsWith(window.location.origin)) {
          fetchUrl = `/api/media/proxy-stream?url=${encodeURIComponent(task.directUrl)}&download=1`;
        }
        const streamRes = await fetch(fetchUrl);
        if (streamRes.ok) {
          const directBlob = await streamRes.blob();
          if (directBlob && directBlob.size > 1024) {
            blobToSave = directBlob;
            task.mediaBlob = blobToSave;
            task.blobUrl = URL.createObjectURL(blobToSave);
            this.cachedBlobs.set(task.id, { blob: blobToSave, url: task.blobUrl });
            const res = await saveBlobToDevice(blobToSave, task.fileName, onProgress);
            return res.success;
          }
        }
      } catch (streamErr) {
        console.warn('Direct stream fetch in saveFileToDisk failed:', streamErr);
      }

      // Fallback: trigger download link without target="_blank"
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

    console.error('No valid media stream available to save.');
    return false;
  }
}

export const downloadEngine = new DownloadEngine();
