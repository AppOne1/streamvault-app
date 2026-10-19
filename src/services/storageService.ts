import { AppSettings, DownloadTask, UserSession } from '../types';

const STORAGE_KEYS = {
  TASKS: 'streamvault_tasks_v2',
  SETTINGS: 'streamvault_settings_v2',
  SESSION: 'streamvault_session_v2'
};

const DB_NAME = 'StreamVaultOfflineDB';
const DB_VERSION = 2;
export const OFFLINE_MEDIA_STORE = 'offline_media';
const LEGACY_BLOB_STORE = 'media_blobs';

export interface OfflineMediaRecord {
  id: string; // taskId or unique ID
  mediaBlob?: Blob; // optional raw binary Blob
  mimeType: string; // 'video/mp4' | 'audio/mpeg' | 'audio/mp4' etc.
  title: string;
  thumbnail: string;
  duration: number; // in seconds
  fileSize: number; // in bytes
  fileName: string;
  format: string; // 'mp4' | 'mp3' etc.
  quality: string;
  downloadedAt: number;
  platform: string;
  sourceUrl: string;
  directUrl?: string;
}

// IndexedDB Helper for persistent offline audio/video storage
function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_MEDIA_STORE)) {
        db.createObjectStore(OFFLINE_MEDIA_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LEGACY_BLOB_STORE)) {
        db.createObjectStore(LEGACY_BLOB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves genuine media Blob and complete metadata to the offline_media ObjectStore
 */
export async function saveOfflineMedia(record: OfflineMediaRecord): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction([OFFLINE_MEDIA_STORE, LEGACY_BLOB_STORE], 'readwrite');
    const store = tx.objectStore(OFFLINE_MEDIA_STORE);
    store.put(record);

    // Also put in legacy store for backward compatibility
    const legacyStore = tx.objectStore(LEGACY_BLOB_STORE);
    legacyStore.put({ id: record.id, blob: record.mediaBlob, updatedAt: Date.now() });

    await new Promise((res, rej) => {
      tx.oncomplete = () => res(undefined);
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.error('Could not save media record to IndexedDB offline_media:', err);
  }
}

/**
 * Retrieves raw OfflineMediaRecord from offline_media store
 */
export async function getOfflineMedia(id: string): Promise<OfflineMediaRecord | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(OFFLINE_MEDIA_STORE, 'readonly');
    const store = tx.objectStore(OFFLINE_MEDIA_STORE);
    const request = store.get(id);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Error reading from offline_media:', err);
    return null;
  }
}

/**
 * Retrieves all offline records from offline_media store
 */
export async function getAllOfflineMedia(): Promise<OfflineMediaRecord[]> {
  try {
    const db = await getDB();
    const tx = db.transaction(OFFLINE_MEDIA_STORE, 'readonly');
    const store = tx.objectStore(OFFLINE_MEDIA_STORE);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Error fetching all offline media records:', err);
    return [];
  }
}

/**
 * Deletes record from offline_media
 */
export async function deleteOfflineMedia(id: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction([OFFLINE_MEDIA_STORE, LEGACY_BLOB_STORE], 'readwrite');
    tx.objectStore(OFFLINE_MEDIA_STORE).delete(id);
    tx.objectStore(LEGACY_BLOB_STORE).delete(id);
  } catch (err) {
    console.warn('Error deleting from offline_media:', err);
  }
}

/**
 * Clears all records from offline_media
 */
export async function clearAllOfflineMedia(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction([OFFLINE_MEDIA_STORE, LEGACY_BLOB_STORE], 'readwrite');
    tx.objectStore(OFFLINE_MEDIA_STORE).clear();
    tx.objectStore(LEGACY_BLOB_STORE).clear();
  } catch (err) {
    console.warn('Error clearing offline_media:', err);
  }
}

export async function saveMediaBlobToIDB(id: string, blob: Blob): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(LEGACY_BLOB_STORE, 'readwrite');
    const store = tx.objectStore(LEGACY_BLOB_STORE);
    store.put({ id, blob, updatedAt: Date.now() });
  } catch (err) {
    console.warn('Could not cache blob to IndexedDB:', err);
  }
}

export async function getMediaBlobFromIDB(id: string): Promise<Blob | null> {
  // First try offline_media store
  const record = await getOfflineMedia(id);
  if (record && record.mediaBlob) {
    return record.mediaBlob;
  }

  // Fallback to legacy blob store
  try {
    const db = await getDB();
    const tx = db.transaction(LEGACY_BLOB_STORE, 'readonly');
    const store = tx.objectStore(LEGACY_BLOB_STORE);
    const request = store.get(id);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        if (request.result && request.result.blob) {
          resolve(request.result.blob);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteMediaBlobFromIDB(id: string): Promise<void> {
  return deleteOfflineMedia(id);
}

export async function clearAllIDBBlobs(): Promise<void> {
  return clearAllOfflineMedia();
}

// LocalStorage helpers for tasks & metadata
export function loadTasksFromStorage(): DownloadTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load tasks from localStorage:', err);
    return [];
  }
}

export function saveTasksToStorage(tasks: DownloadTask[]): void {
  try {
    // Strip in-memory blob URLs and blobs before saving JSON
    const sanitized = tasks.map(t => ({
      ...t,
      blobUrl: undefined,
      mediaBlob: undefined
    }));
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(sanitized));
  } catch (err) {
    console.error('Failed to save tasks to localStorage:', err);
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'fa', // Default to Persian as requested by user prompt, dynamic switch to English
  theme: 'dark',
  autoPlayAfterDownload: false,
  autoSaveToDevice: true, // Automatically triggers native file download to phone/system Downloads folder
  downloadPathHint: 'Downloads/OneDownload',
  chunkConcurrency: 4
};

export function loadSettingsFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettingsToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export const DEFAULT_SESSION: UserSession = {
  isLoggedIn: true,
  user: {
    id: 'user-vip-appone',
    name: 'کاربر ویژه وان دانلود (گروه AppOne علوی)',
    email: 'vip@appone.ir',
    avatarUrl: '',
    plan: 'VIP Pro',
    quotaUsedMb: 120,
    quotaMaxMb: 50000
  }
};

export function loadSessionFromStorage(): UserSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (!raw) return DEFAULT_SESSION;
    const parsed: UserSession = JSON.parse(raw);
    if (
      !parsed.user ||
      parsed.user.email === 'user@streamvault.app' ||
      parsed.user.name?.includes('استریم‌ولت') ||
      parsed.user.id === 'guest'
    ) {
      saveSessionToStorage(DEFAULT_SESSION);
      return DEFAULT_SESSION;
    }
    return parsed;
  } catch {
    return DEFAULT_SESSION;
  }
}

export function saveSessionToStorage(session: UserSession): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}
