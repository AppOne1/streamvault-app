import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Converts a Blob to a pure Base64 string for Capacitor Filesystem
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves a media Blob directly into the device storage (Android Documents/Downloads or Browser Download)
 */
export async function saveBlobToDevice(
  blob: Blob,
  fileName: string,
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; filePath?: string }> {
  try {
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

    if (isNative) {
      onStatus?.('در حال نوشتن فایل روی حافظه دستگاه...');
      const base64Data = await blobToBase64(blob);

      // Save directly to Documents directory on Android
      const writeResult = await Filesystem.writeFile({
        path: `Download/${fileName}`,
        data: base64Data,
        directory: Directory.ExternalStorage,
        recursive: true
      }).catch(async () => {
        // Fallback to Documents directory
        return await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });
      });

      onStatus?.('فایل در حافظه دستگاه ذخیره شد ✓');
      return { success: true, filePath: writeResult.uri };
    }

    // Browser / Mobile Chrome / Web mode:
    onStatus?.('در حال ارسال فایل به بخش دانلودها...');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
      // Note: We avoid revoking immediately so any pending browser download completes
    }, 2000);

    return { success: true };
  } catch (err) {
    console.error('saveBlobToDevice error:', err);
    return { success: false };
  }
}

/**
 * Native Android or Web Share API for downloaded media
 */
export async function shareDownloadedFile(blob: Blob, fileName: string, title?: string): Promise<boolean> {
  try {
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

    if (isNative) {
      const base64Data = await blobToBase64(blob);
      const tempFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      await Share.share({
        title: title || fileName,
        url: tempFile.uri
      });
      return true;
    }

    // Web Share API with File
    if (typeof navigator !== 'undefined' && navigator.canShare) {
      const file = new File([blob], fileName, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || fileName
        });
        return true;
      }
    }

    return false;
  } catch (err) {
    console.warn('Share file error:', err);
    return false;
  }
}
