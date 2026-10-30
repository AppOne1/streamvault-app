import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Minimum valid binary size thresholds:
 * - Video files MUST be at least 120 KB (122,880 bytes) to prevent saving 80-83 KB 403/HTML error pages or corrupt stubs.
 * - Audio files MUST be at least 50 KB (51,200 bytes).
 */
export const MIN_VALID_VIDEO_BYTES = 120 * 1024; // 120 KB
export const MIN_VALID_AUDIO_BYTES = 50 * 1024; // 50 KB

/**
 * Deterministic & dialog-free direct Blob download trigger for phone/browser storage:
 * Converts the binary Blob into a local object URL and clicks a hidden <a download="..."> element
 * WITHOUT target="_blank" or window.open so the browser saves the MP4 directly to Downloads/Gallery
 * and NEVER opens a new tab or leaves the app page.
 */
export function forceDeviceDownload(blobData: Blob, fileName?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !blobData) return;
  const localBlobUrl = window.URL.createObjectURL(blobData);
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = localBlobUrl;
  link.setAttribute('download', fileName || 'video.mp4');
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(localBlobUrl);
    } catch {
      // ignore cleanup error
    }
  }, 2000);
}

/**
 * Silent same-origin binary attachment download trigger (NO target="_blank", NO window.open):
 * Points a hidden <a style="display:none" download="..."> to a same-origin endpoint serving
 * Content-Type: application/octet-stream + Content-Disposition: attachment so the browser
 * never navigates away or opens a media player, and saves directly to phone storage.
 */
export function triggerSilentAttachmentDownload(attachmentUrl: string, fileName?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !attachmentUrl) return;
  const safeName = ensureMediaFileName(fileName || 'video.mp4');
  const sep = attachmentUrl.includes('?') ? '&' : '?';
  const finalHref = attachmentUrl.includes('download=1')
    ? attachmentUrl
    : `${attachmentUrl}${sep}download=1`;

  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = finalHref;
  link.setAttribute('download', safeName);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    } catch {
      // ignore cleanup error
    }
  }, 2500);
}

/**
 * Inspects both the byte size and the binary header / magic bytes
 * of a Blob to guarantee it is a genuine media file and NEVER an 80 KB 403/HTML error page.
 */
export async function isBlobGenuineMedia(blob: Blob, isAudio = false): Promise<boolean> {
  if (!blob) return false;

  const mime = (blob.type || '').toLowerCase();
  const inferredAudio =
    isAudio || mime.includes('audio') || mime.includes('mpeg') || mime.includes('m4a');
  const minBytes = inferredAudio ? MIN_VALID_AUDIO_BYTES : MIN_VALID_VIDEO_BYTES;

  // 1. Pre-Download / Pre-Save Size Validation: Reject any file smaller than 120 KB (video) / 50 KB (audio)
  if (blob.size < minBytes) {
    return false;
  }

  // 2. Reject invalid text/HTML/JSON MIME types
  if (
    mime.includes('text/html') ||
    mime.includes('application/xhtml') ||
    mime.includes('text/plain') ||
    mime.includes('application/json') ||
    mime.includes('text/xml') ||
    mime.includes('application/xml')
  ) {
    return false;
  }

  // 3. Inspect first 512 bytes for HTML/403/JSON error signatures and verify binary media container
  try {
    const headerSlice = blob.slice(0, 512);
    const buffer = await headerSlice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength < 16) return false;

    const headerText = new TextDecoder('utf-8', { fatal: false })
      .decode(bytes.subarray(0, Math.min(300, bytes.byteLength)))
      .trim()
      .toLowerCase();

    if (
      headerText.startsWith('<!doctype') ||
      headerText.startsWith('<html') ||
      headerText.startsWith('<head') ||
      headerText.startsWith('<body') ||
      headerText.startsWith('<script') ||
      headerText.startsWith('<?xml') ||
      headerText.includes('<html') ||
      headerText.includes('<!doctype html') ||
      headerText.includes('403 forbidden') ||
      headerText.includes('access denied') ||
      headerText.includes('cloudflare') ||
      headerText.startsWith('{"error"') ||
      headerText.startsWith('{"status":"error"') ||
      headerText.startsWith('{"code":-1')
    ) {
      return false;
    }
  } catch {
    // Non-UTF8 binary stream
  }

  return true;
}

/**
 * Sanitizes filename and forces a valid media extension (.mp4, .mp3, .m4a).
 * Explicitly strips any accidental .html / .htm / .txt extension.
 */
export function ensureMediaFileName(fileName: string, mimeType?: string): string {
  const isAudioMp3 = (mimeType || '').includes('mpeg') || /\.mp3$/i.test(fileName);
  const isAudioM4a =
    (mimeType || '').includes('audio/mp4') ||
    (mimeType || '').includes('m4a') ||
    /\.m4a$/i.test(fileName);
  const targetExt = isAudioMp3 ? 'mp3' : isAudioM4a ? 'm4a' : 'mp4';

  const stripped = fileName
    .replace(/\.(html?|txt|json|xml|php|aspx?)$/i, '')
    .replace(/\.(mp4|mp3|m4a|webm|mkv|wav)$/i, '')
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .trim();

  const baseName = stripped || `OneDownload_${Date.now()}`;
  return `${baseName}.${targetExt}`;
}

/**
 * Convert a Blob to a Base64 string for Capacitor Filesystem API
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check and request Android storage permissions if running natively
 */
export async function ensureStoragePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage === 'granted') {
      return true;
    }
    const requested = await Filesystem.requestPermissions();
    return requested.publicStorage === 'granted';
  } catch (err) {
    console.warn('Filesystem permission check notice:', err);
    return true;
  }
}

/**
 * Saves a verified binary media Blob to the device storage / Gallery ONCE and silently.
 * - Rejects any corrupt or HTML / 403 error payloads so corrupt 80 KB files are NEVER saved.
 * - On Android APK: writes directly to public Download/OneDownload or Documents/OneDownload.
 * - On Web/Mobile Browser: triggers `forceDeviceDownload(cleanMediaBlob, safeFileName)` with no new tab.
 */
export async function saveBlobToDevice(
  blob: Blob,
  fileName: string
): Promise<{ saved: boolean; path: string }> {
  const safeFileName = ensureMediaFileName(fileName, blob.type);
  const isAudio = safeFileName.endsWith('.mp3') || safeFileName.endsWith('.m4a');

  const isValid = await isBlobGenuineMedia(blob, isAudio);
  if (!isValid) {
    console.warn(
      `Blocked saving corrupt or undersized payload (${blob?.size || 0} bytes) to device:`,
      safeFileName
    );
    return { saved: false, path: '' };
  }

  const canonicalMime = safeFileName.endsWith('.mp3')
    ? 'audio/mpeg'
    : safeFileName.endsWith('.m4a')
    ? 'audio/mp4'
    : 'video/mp4';

  const cleanMediaBlob =
    blob.type === canonicalMime ? blob : new Blob([blob], { type: canonicalMime });

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureStoragePermissions();
      const base64Data = await blobToBase64(cleanMediaBlob);

      try {
        const result = await Filesystem.writeFile({
          path: `Download/OneDownload/${safeFileName}`,
          data: base64Data,
          directory: Directory.ExternalStorage,
          recursive: true
        });
        return { saved: true, path: result.uri };
      } catch {
        const fallbackResult = await Filesystem.writeFile({
          path: `OneDownload/${safeFileName}`,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });
        return { saved: true, path: fallbackResult.uri };
      }
    } catch (err) {
      console.error('Native filesystem write failed:', err);
    }
  }

  // Standard Web / Mobile Browser silent single-execution Blob save (no target="_blank", no new tab)
  try {
    forceDeviceDownload(cleanMediaBlob, safeFileName);
    return { saved: true, path: `Downloads/${safeFileName}` };
  } catch (e) {
    console.warn('Browser blob save failed:', e);
    return { saved: false, path: '' };
  }
}
