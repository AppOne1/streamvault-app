import { AppSettings, DownloadTask, Language, UserSession } from '../types';

const STORAGE_KEYS = {
  TASKS: 'onedownload_tasks_v2',
  SETTINGS: 'onedownload_settings_v4',
  SESSION: 'onedownload_session_v2',
  OD_USER_SESSION: 'od_user_session',
  ACCOUNT_CURRENCY_LOCK: 'onedownload_account_currency_lock_v1'
};

const DB_NAME = 'OneDownloadOfflineDB';
const DB_VERSION = 2;
export const OFFLINE_MEDIA_STORE = 'offline_media';
const LEGACY_BLOB_STORE = 'media_blobs';
const IDB_SESSION_RECORD_KEY = '__od_user_session_record__';

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

function normalizeStoredThumbnail(thumb?: string, videoId?: string): string {
  if (videoId && /^[\w-]{11}$/.test(videoId)) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  if (!thumb) return '';
  if (thumb.includes('/api/media/thumbnail')) {
    try {
      const qIndex = thumb.indexOf('?');
      if (qIndex !== -1) {
        const params = new URLSearchParams(thumb.slice(qIndex + 1));
        const yt = params.get('yt');
        if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
        const ig = params.get('ig');
        if (ig) {
          return `https://wsrv.nl/?url=${encodeURIComponent(
            `https://www.instagram.com/p/${ig}/media/?size=l`
          )}&w=480&output=jpg`;
        }
        const innerUrl = params.get('url');
        if (innerUrl) {
          if (innerUrl.includes('i.ytimg.com') || innerUrl.includes('aparat.com')) {
            return innerUrl;
          }
          return `https://wsrv.nl/?url=${encodeURIComponent(innerUrl)}&w=480&output=jpg`;
        }
      }
    } catch {
      // ignore
    }
  }
  return thumb;
}

// LocalStorage helpers for tasks & metadata
export function loadTasksFromStorage(): DownloadTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: DownloadTask) => {
      const cleanThumb = normalizeStoredThumbnail(t.thumbnail, t.videoId);
      if (t.status === 'downloading' || t.status === 'queued' || (t.status as string) === 'merging') {
        return {
          ...t,
          thumbnail: cleanThumb,
          status: 'paused',
          speedBytesPerSec: 0,
          speedFormatted: 'آماده ادامه دانلود'
        };
      }
      return {
        ...t,
        thumbnail: cleanThumb
      };
    });
  } catch (err) {
    console.error('Failed to load tasks from localStorage:', err);
    return [];
  }
}

/**
 * Requests Persistent Storage (`navigator.storage.persist()`) on app startup
 * so the operating system / browser does not evict IndexedDB video Blobs during cache cleanup.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const alreadyPersisted = navigator.storage.persisted
        ? await navigator.storage.persisted()
        : false;
      if (alreadyPersisted) return true;
      return await navigator.storage.persist();
    }
  } catch (err) {
    console.warn('Persistent storage request notice:', err);
  }
  return false;
}

/**
 * Hydrates completed downloads from the dedicated IndexedDB `offline_media` ObjectStore
 * on app startup. Ensures that after closing and reopening the app:
 * 1. Every completed download has its binary `mediaBlob` and `blobUrl` ready for 100% offline playback.
 * 2. Even if localStorage was cleared, any video saved in IndexedDB is restored with full metadata.
 */
export async function hydrateTasksFromIndexedDB(
  existingTasks: DownloadTask[]
): Promise<DownloadTask[]> {
  try {
    const records = await getAllOfflineMedia();
    if (!records || records.length === 0) return existingTasks;

    const recordMap = new Map<string, OfflineMediaRecord>();
    for (const rec of records) {
      if (rec && rec.id) {
        recordMap.set(rec.id, rec);
      }
    }

    const formatSize = (bytes: number) => {
      if (!bytes || bytes <= 0) return '0 B';
      const mb = bytes / (1024 * 1024);
      return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    };

    // IMPORTANT OOM PREVENTION:
    // Do NOT attach `rec.mediaBlob` or call `URL.createObjectURL(rec.mediaBlob)` for every video on startup!
    // Keeping 300MB+ of video Blobs pinned in React state causes Android WebView OutOfMemoryError.
    // BuiltInMediaPlayer, saveFileToDisk, and shareDownloadedMediaFile load `getOfflineMedia(task.id)` on-demand.
    const updatedTasks = existingTasks.map((task) => {
      const rec = recordMap.get(task.id);
      if (rec) {
        recordMap.delete(task.id);
        return {
          ...task,
          status: 'completed' as const,
          title: task.title || rec.title,
          thumbnail: normalizeStoredThumbnail(task.thumbnail || rec.thumbnail, task.videoId),
          fileName: task.fileName || rec.fileName,
          totalBytes: rec.fileSize || task.totalBytes,
          downloadedBytes: rec.fileSize || task.downloadedBytes,
          totalSizeFormatted: formatSize(rec.fileSize || task.totalBytes),
          downloadedSizeFormatted: formatSize(rec.fileSize || task.downloadedBytes),
          completedAt: task.completedAt || rec.downloadedAt,
          mediaBlob: undefined,
          blobUrl: undefined
        };
      }
      return task;
    });

    // Also restore any IndexedDB records that were not in localStorage
    const restoredFromIdb: DownloadTask[] = [];
    recordMap.forEach((rec) => {
      const isAudio =
        (rec.mimeType || '').includes('audio') ||
        rec.format === 'mp3' ||
        rec.format === 'm4a';
      const sizeStr = formatSize(rec.fileSize);
      restoredFromIdb.push({
        id: rec.id,
        mediaId: rec.id,
        originalUrl: rec.sourceUrl || '',
        title: rec.title || rec.fileName || 'Downloaded Media',
        platform: (rec.platform as any) || 'youtube',
        thumbnail: normalizeStoredThumbnail(rec.thumbnail),
        durationFormatted: '01:00',
        durationSeconds: rec.duration || 60,
        format: {
          id: `${rec.id}-fmt`,
          type: isAudio ? 'audio' : 'video',
          format: (rec.format as any) || (isAudio ? 'mp3' : 'mp4'),
          qualityLabel: rec.quality || (isAudio ? '320kbps' : '720p HD'),
          vCodec: isAudio ? undefined : 'H.264',
          aCodec: 'AAC',
          estimatedSizeBytes: rec.fileSize || 0,
          estimatedSizeFormatted: sizeStr
        },
        status: 'completed',
        progressPercent: 100,
        downloadedBytes: rec.fileSize || 0,
        totalBytes: rec.fileSize || 0,
        downloadedSizeFormatted: sizeStr,
        totalSizeFormatted: sizeStr,
        speedBytesPerSec: 0,
        speedFormatted: 'پایان یافت',
        elapsedSeconds: 0,
        etaSeconds: 0,
        createdAt: rec.downloadedAt || Date.now(),
        completedAt: rec.downloadedAt || Date.now(),
        fileName: rec.fileName || `${rec.title || 'video'}.${isAudio ? 'mp3' : 'mp4'}`,
        directUrl: rec.directUrl,
        mediaBlob: undefined,
        blobUrl: undefined
      });
    });

    return [...updatedTasks, ...restoredFromIdb];
  } catch (err) {
    console.warn('Hydrate tasks from IndexedDB notice:', err);
    return existingTasks;
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
  language: 'fa', // Default to Persian (FA) on first installation for Persian markets (CafeBazaar & Myket)
  theme: 'dark',
  autoPlayAfterDownload: false,
  autoSaveToDevice: false, // Keep downloaded files in internal IndexedDB vault; user saves to device optionally via button
  autoSniffClipboard: true, // Smart clipboard auto-sniffer controlled from Settings
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
    localStorage.setItem('onedownload_auto_sniff_enabled_v1', String(settings.autoSniffClipboard));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export const GUEST_DEFAULT_NAMES = [
  'کاربر وان دانلود',
  'کاربر مهمان (وان دانلود)',
  'زائر (وان داونلود)',
  'مستخدم وان داونلود',
  'Guest User (OneDownload)',
  'OneDownload User'
];

export function isDefaultGuestName(name?: string): boolean {
  if (!name || !name.trim()) return true;
  return GUEST_DEFAULT_NAMES.includes(name.trim());
}

export function getLocalizedGuestName(language: Language): string {
  if (language === 'ar') return 'زائر (وان داونلود)';
  if (language === 'en') return 'Guest User (OneDownload)';
  return 'کاربر مهمان (وان دانلود)';
}

export const DEFAULT_SESSION: UserSession = {
  isLoggedIn: false,
  user: {
    id: 'guest-onedownload',
    name: 'کاربر مهمان (وان دانلود)',
    email: '',
    avatarUrl: '',
    plan: 'Free',
    quotaUsedMb: 0,
    quotaMaxMb: 1024
  }
};

export function loadSessionFromStorage(): UserSession {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.OD_USER_SESSION) ||
      localStorage.getItem(STORAGE_KEYS.SESSION);
    const currentSettings = loadSettingsFromStorage();
    const localizedDefaultName = getLocalizedGuestName(currentSettings.language);
    if (!raw) {
      return {
        ...DEFAULT_SESSION,
        user: { ...DEFAULT_SESSION.user, name: localizedDefaultName }
      };
    }
    const parsed: UserSession = JSON.parse(raw);
    if (!parsed.user || parsed.user.id === 'user-vip-appone') {
      const resetSession = {
        ...DEFAULT_SESSION,
        user: { ...DEFAULT_SESSION.user, name: localizedDefaultName }
      };
      saveSessionToStorage(resetSession);
      return resetSession;
    }
    if (isDefaultGuestName(parsed.user.name)) {
      parsed.user.name = localizedDefaultName;
    }
    // Ensure od_user_session and session key stay synchronized
    if (parsed.isLoggedIn) {
      localStorage.setItem(STORAGE_KEYS.OD_USER_SESSION, JSON.stringify(parsed));
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return DEFAULT_SESSION;
  }
}

export function saveSessionToStorage(session: UserSession): void {
  try {
    const serialized = JSON.stringify(session);
    localStorage.setItem(STORAGE_KEYS.SESSION, serialized);
    if (session.isLoggedIn) {
      localStorage.setItem(STORAGE_KEYS.OD_USER_SESSION, serialized);
    } else {
      localStorage.removeItem(STORAGE_KEYS.OD_USER_SESSION);
    }

    // Mirror session state into IndexedDB for persistent storage across Android WebView / browser restarts
    getDB()
      .then((db) => {
        const tx = db.transaction(LEGACY_BLOB_STORE, 'readwrite');
        const store = tx.objectStore(LEGACY_BLOB_STORE);
        if (session.isLoggedIn) {
          store.put({
            id: IDB_SESSION_RECORD_KEY,
            sessionData: session,
            updatedAt: Date.now()
          });
        } else {
          store.delete(IDB_SESSION_RECORD_KEY);
        }
      })
      .catch(() => {});
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}

export async function loadSessionFromIDB(): Promise<UserSession | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(LEGACY_BLOB_STORE, 'readonly');
    const store = tx.objectStore(LEGACY_BLOB_STORE);
    const request = store.get(IDB_SESSION_RECORD_KEY);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const res = request.result;
        if (res && res.sessionData && res.sessionData.isLoggedIn) {
          resolve(res.sessionData as UserSession);
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

const ACCOUNT_VAULT_STORAGE_KEY = 'onedownload_account_vault_v1';

export interface AccountVaultEntry {
  identifier: string;
  user: UserSession['user'];
  tasks: DownloadTask[];
  updatedAt: number;
}

export function normalizeAccountKey(identifier?: string): string {
  return (identifier || '').trim().toLowerCase();
}

export function saveAccountVaultSnapshot(session: UserSession, tasks?: DownloadTask[]): void {
  try {
    if (!session?.isLoggedIn || !session.user) return;
    const key = normalizeAccountKey(session.user.email || session.user.name);
    if (!key) return;

    const currentTasks = (tasks || loadTasksFromStorage()).map((t) => ({
      ...t,
      blobUrl: undefined,
      mediaBlob: undefined
    }));

    const rawVault = localStorage.getItem(ACCOUNT_VAULT_STORAGE_KEY);
    const vaultMap: Record<string, AccountVaultEntry> = rawVault ? JSON.parse(rawVault) : {};

    const existingEntry = vaultMap[key];
    // Merge task lists so previously downloaded videos are never lost
    const mergedTaskMap = new Map<string, DownloadTask>();
    if (existingEntry?.tasks) {
      for (const t of existingEntry.tasks) {
        if (t && t.id) mergedTaskMap.set(t.id, t);
      }
    }
    for (const t of currentTasks) {
      if (t && t.id) mergedTaskMap.set(t.id, t);
    }

    const entry: AccountVaultEntry = {
      identifier: key,
      user: {
        ...existingEntry?.user,
        ...session.user,
        passwordHash: session.user.passwordHash || existingEntry?.user?.passwordHash
      },
      tasks: Array.from(mergedTaskMap.values()),
      updatedAt: Date.now()
    };

    vaultMap[key] = entry;
    localStorage.setItem(ACCOUNT_VAULT_STORAGE_KEY, JSON.stringify(vaultMap));

    getDB()
      .then((db) => {
        const tx = db.transaction(LEGACY_BLOB_STORE, 'readwrite');
        const store = tx.objectStore(LEGACY_BLOB_STORE);
        store.put({
          id: `account_vault::${key}`,
          vaultEntry: entry,
          updatedAt: Date.now()
        });
      })
      .catch(() => {});
  } catch (err) {
    console.warn('saveAccountVaultSnapshot notice:', err);
  }
}

export async function restoreAccountVaultSnapshot(
  identifier: string
): Promise<AccountVaultEntry | null> {
  const key = normalizeAccountKey(identifier);
  if (!key) return null;

  let localEntry: AccountVaultEntry | null = null;
  try {
    const rawVault = localStorage.getItem(ACCOUNT_VAULT_STORAGE_KEY);
    if (rawVault) {
      const vaultMap: Record<string, AccountVaultEntry> = JSON.parse(rawVault);
      if (vaultMap[key]) {
        localEntry = vaultMap[key];
      } else {
        // Also allow matching by username or email prefix if user typed username vs email
        const match = Object.values(vaultMap).find(
          (v) =>
            normalizeAccountKey(v.user?.email) === key ||
            normalizeAccountKey(v.user?.name) === key
        );
        if (match) localEntry = match;
      }
    }
  } catch {
    // ignore
  }

  try {
    const db = await getDB();
    const tx = db.transaction(LEGACY_BLOB_STORE, 'readonly');
    const store = tx.objectStore(LEGACY_BLOB_STORE);
    const request = store.get(`account_vault::${key}`);
    const idbEntry = await new Promise<AccountVaultEntry | null>((resolve) => {
      request.onsuccess = () => {
        const res = request.result;
        resolve(res?.vaultEntry ? (res.vaultEntry as AccountVaultEntry) : null);
      };
      request.onerror = () => resolve(null);
    });
    if (idbEntry && (!localEntry || idbEntry.updatedAt >= localEntry.updatedAt)) {
      return idbEntry;
    }
  } catch {
    // ignore
  }

  return localEntry;
}

/**
 * Logout while 100% preserving all downloaded videos, audios, and account vault data!
 * When the user logs back in with the same username/email and password, all their videos,
 * audios, coins, referrals, and VIP status are immediately restored.
 */
export async function resetUserSessionAndClearAllData(language: Language): Promise<UserSession> {
  try {
    const currentSession = loadSessionFromStorage();
    if (currentSession.isLoggedIn) {
      saveAccountVaultSnapshot(currentSession);
    }
  } catch {
    // ignore
  }

  const freshGuestSession: UserSession = {
    isLoggedIn: false,
    user: {
      id: `guest-${Date.now().toString(36)}`,
      name: getLocalizedGuestName(language),
      email: '',
      passwordHash: undefined,
      avatarUrl: '',
      country: 'IR',
      plan: 'Free',
      quotaUsedMb: 0,
      quotaMaxMb: 1024
    }
  };

  try {
    localStorage.removeItem(STORAGE_KEYS.OD_USER_SESSION);
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(freshGuestSession));
    // Delete only the active session marker in IDB, NEVER delete offline_media videos/audios!
    getDB()
      .then((db) => {
        const tx = db.transaction(LEGACY_BLOB_STORE, 'readwrite');
        const store = tx.objectStore(LEGACY_BLOB_STORE);
        store.delete(IDB_SESSION_RECORD_KEY);
      })
      .catch(() => {});
  } catch {
    // ignore storage errors
  }

  return freshGuestSession;
}

export function getLockedAccountCurrency(): 'toman' | 'usdt' | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.ACCOUNT_CURRENCY_LOCK);
    if (val === 'toman' || val === 'usdt') return val;
    return null;
  } catch {
    return null;
  }
}

export function setLockedAccountCurrency(mode: 'toman' | 'usdt' | null): void {
  try {
    if (!mode) {
      localStorage.removeItem(STORAGE_KEYS.ACCOUNT_CURRENCY_LOCK);
    } else {
      localStorage.setItem(STORAGE_KEYS.ACCOUNT_CURRENCY_LOCK, mode);
    }
  } catch {
    // ignore
  }
}

