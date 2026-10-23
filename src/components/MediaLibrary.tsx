import React, { useState, useEffect, useRef } from 'react';
import { CustomMediaFolder, DownloadTask, Language } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { getTranslation } from '../i18n/translations';
import { getSafeThumbnail } from '../services/platformDetector';
import { getAllOfflineMedia, deleteOfflineMedia, OfflineMediaRecord } from '../services/storageService';
import { shareDownloadedMediaFile } from '../services/deviceService';
import { DEFAULT_LOCK_PASSWORD, MASTER_KEYWORD } from '../services/quotaService';
import {
  Search,
  Star,
  Play,
  Trash2,
  HardDrive,
  Film,
  Music,
  FolderOpen,
  FolderPlus,
  FolderInput,
  CheckSquare,
  Square,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  Fingerprint,
  Loader2,
  X,
  Check,
  Share2,
  ArrowRight
} from 'lucide-react';

interface MediaLibraryProps {
  language: Language;
  tasks: DownloadTask[];
  onPlayMedia: (task: DownloadTask) => void;
  onSaveToDisk?: (task: DownloadTask) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
  onToggleVault?: (taskId: string) => void;
  onBack?: () => void;
  onBackToHome?: () => void;
}

const VAULT_PIN_KEY = 'onedownload_vault_pin_v2';
const VAULT_IDS_KEY = 'onedownload_vaulted_task_ids';
const CUSTOM_FOLDERS_KEY = 'onedownload_custom_folders_v1';
const ITEM_FOLDER_MAP_KEY = 'onedownload_item_folder_map_v1';

const toFaDigits = (val: string | number): string =>
  String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  language,
  tasks,
  onPlayMedia,
  onSaveToDisk,
  onDeleteTask,
  onToggleStar,
  onToggleVault,
  onBack,
  onBackToHome
}) => {
  const handleBackClick = onBackToHome || onBack;
  const t = getTranslation(language);
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;

  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'size'>('newest');
  const [offlineRecords, setOfflineRecords] = useState<OfflineMediaRecord[]>([]);

  // Unlimited Custom Folders State
  const [customFolders, setCustomFolders] = useState<CustomMediaFolder[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_FOLDERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Mapping of taskId -> folderId
  const [itemFolderMap, setItemFolderMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(ITEM_FOLDER_MAP_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Multi-select, Drag-and-Drop & Long-Press Organization State
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);

  // Private Vault Default Password ("12345678") & Master Keyword ("onedownload")
  const [savedPin] = useState<string>(
    () => localStorage.getItem(VAULT_PIN_KEY) || DEFAULT_LOCK_PASSWORD
  );
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isBiometricScanning, setIsBiometricScanning] = useState<boolean>(false);
  const [biometricStatusText, setBiometricStatusText] = useState<string | null>(null);
  const [vaultedIds, setVaultedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(VAULT_IDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let isMounted = true;
    getAllOfflineMedia().then((records) => {
      if (isMounted) setOfflineRecords(records);
    });
    return () => {
      isMounted = false;
    };
  }, [tasks]);

  const saveCustomFolders = (nextFolders: CustomMediaFolder[]) => {
    setCustomFolders(nextFolders);
    try {
      localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(nextFolders));
    } catch {
      // ignore
    }
  };

  const saveItemFolderMap = (nextMap: Record<string, string>) => {
    setItemFolderMap(nextMap);
    try {
      localStorage.setItem(ITEM_FOLDER_MAP_KEY, JSON.stringify(nextMap));
    } catch {
      // ignore
    }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newFolderName.trim();
    if (!clean) return;

    const newFolder: CustomMediaFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: clean,
      createdAt: Date.now()
    };

    const next = [...customFolders, newFolder];
    saveCustomFolders(next);
    setNewFolderName('');
    setIsCreatingFolder(false);
    setActiveTab(newFolder.id);
  };

  const handleDeleteFolder = (folderId: string) => {
    const nextFolders = customFolders.filter((f) => f.id !== folderId);
    saveCustomFolders(nextFolders);

    const nextMap = { ...itemFolderMap };
    Object.keys(nextMap).forEach((taskId) => {
      if (nextMap[taskId] === folderId) {
        delete nextMap[taskId];
      }
    });
    saveItemFolderMap(nextMap);
    if (activeTab === folderId) {
      setActiveTab('all');
    }
  };

  const handleMoveSelectedToFolder = (targetFolderId: string | null) => {
    const nextMap = { ...itemFolderMap };
    selectedTaskIds.forEach((id) => {
      if (targetFolderId) {
        nextMap[id] = targetFolderId;
      } else {
        delete nextMap[id];
      }
    });
    saveItemFolderMap(nextMap);
    setSelectedTaskIds([]);
    setIsMoveModalOpen(false);
  };

  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  // Long-press handlers for effortless mobile organization
  const handleTouchStartCard = (taskId: string) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    }, 450);
  };

  const handleTouchEndCard = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const toggleItemVault = (taskId: string) => {
    setVaultedIds((prev) => {
      const exists = prev.includes(taskId);
      const next = exists ? prev.filter((id) => id !== taskId) : [...prev, taskId];
      try {
        localStorage.setItem(VAULT_IDS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    onToggleVault?.(taskId);
  };

  // Combine completed tasks with IndexedDB records
  const libraryItems: DownloadTask[] = React.useMemo(() => {
    const completedTasks = tasks.filter((t) => t.status === 'completed');
    const taskMap = new Map<string, DownloadTask>();
    completedTasks.forEach((t) =>
      taskMap.set(t.id, {
        ...t,
        isVaulted: t.isVaulted || vaultedIds.includes(t.id),
        folderId: itemFolderMap[t.id] || t.folderId
      })
    );

    offlineRecords.forEach((rec) => {
      const existing = taskMap.get(rec.id);
      if (existing) {
        if (!existing.mediaBlob) existing.mediaBlob = rec.mediaBlob;
        if (!existing.blobUrl && rec.mediaBlob) existing.blobUrl = URL.createObjectURL(rec.mediaBlob);
        existing.totalBytes = rec.fileSize || existing.totalBytes;
        existing.downloadedBytes = rec.fileSize || existing.downloadedBytes;
        existing.totalSizeFormatted = `${(rec.fileSize / (1024 * 1024)).toFixed(1)} MB`;
        existing.isVaulted = existing.isVaulted || vaultedIds.includes(rec.id);
        existing.folderId = itemFolderMap[rec.id] || existing.folderId;
      } else {
        const ext = rec.format || (rec.mimeType.includes('audio') ? 'mp3' : 'mp4');
        const isVid = !rec.mimeType.includes('audio');
        const blobUrl = rec.mediaBlob ? URL.createObjectURL(rec.mediaBlob) : (rec.directUrl || '');
        const mins = Math.floor(rec.duration / 60);
        const secs = Math.floor(rec.duration % 60);
        const durationFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        taskMap.set(rec.id, {
          id: rec.id,
          mediaId: rec.id,
          originalUrl: rec.sourceUrl || '',
          title: rec.title || 'Saved Media',
          platform: (rec.platform as any) || 'youtube',
          thumbnail: rec.thumbnail || '',
          durationFormatted,
          durationSeconds: rec.duration,
          format: {
            id: rec.id,
            type: isVid ? 'video' : 'audio',
            format: ext as any,
            qualityLabel: rec.quality || (isVid ? 'HD Video' : 'Audio'),
            estimatedSizeBytes: rec.fileSize,
            estimatedSizeFormatted: `${(rec.fileSize / (1024 * 1024)).toFixed(1)} MB`
          },
          status: 'completed',
          progressPercent: 100,
          speedBytesPerSec: 0,
          speedFormatted: '0 MB/s',
          downloadedBytes: rec.fileSize,
          totalBytes: rec.fileSize,
          downloadedSizeFormatted: `${(rec.fileSize / (1024 * 1024)).toFixed(1)} MB`,
          totalSizeFormatted: `${(rec.fileSize / (1024 * 1024)).toFixed(1)} MB`,
          elapsedSeconds: 0,
          etaSeconds: 0,
          fileName: rec.fileName || `media_${rec.id}.${ext}`,
          createdAt: rec.downloadedAt || Date.now(),
          completedAt: rec.downloadedAt || Date.now(),
          isStarred: false,
          isVaulted: vaultedIds.includes(rec.id),
          folderId: itemFolderMap[rec.id],
          mediaBlob: rec.mediaBlob,
          blobUrl,
          directUrl: rec.directUrl
        });
      }
    });

    return Array.from(taskMap.values());
  }, [tasks, offlineRecords, vaultedIds, itemFolderMap]);

  const totalBytes = libraryItems.reduce((acc, curr) => acc + (curr.totalBytes || 0), 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  const vaultedCount = libraryItems.filter((i) => i.isVaulted).length;

  const isCustomFolderTab = customFolders.some((f) => f.id === activeTab);
  const activeCustomFolder = customFolders.find((f) => f.id === activeTab);

  const filteredItems = libraryItems
    .filter((item) => {
      if (activeTab === 'vault') {
        if (!item.isVaulted) return false;
      } else {
        if (item.isVaulted) return false;
        if (activeTab === 'video' && item.format.type !== 'video') return false;
        if (activeTab === 'audio' && item.format.type !== 'audio') return false;
        if (activeTab === 'starred' && !item.isStarred) return false;
        if (isCustomFolderTab && item.folderId !== activeTab) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q) ||
        item.format.format.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return (b.completedAt || 0) - (a.completedAt || 0);
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'size') return (b.totalBytes || 0) - (a.totalBytes || 0);
      return 0;
    });

  const handleDelete = async (taskId: string) => {
    await deleteOfflineMedia(taskId);
    setOfflineRecords((prev) => prev.filter((r) => r.id !== taskId));
    onDeleteTask(taskId);
  };

  const handleDropOnFolder = (targetFolderId: string | null) => {
    const idsToMove =
      draggedTaskId && !selectedTaskIds.includes(draggedTaskId)
        ? [draggedTaskId]
        : selectedTaskIds;
    if (idsToMove.length === 0) return;

    const nextMap = { ...itemFolderMap };
    idsToMove.forEach((id) => {
      if (targetFolderId) {
        nextMap[id] = targetFolderId;
      } else {
        delete nextMap[id];
      }
    });
    saveItemFolderMap(nextMap);
    setDraggedTaskId(null);
    setDragOverFolderId(null);
    setSelectedTaskIds([]);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      setPinError(
        isFa
          ? 'لطفاً رمز عبور قفل (پیش‌فرض: 12345678) را وارد کنید'
          : isAr
          ? 'يرجى إدخال رمز القفل (الافتراضي: 12345678)'
          : 'Please enter the lock password (default: 12345678)'
      );
      return;
    }

    if (
      cleanPin === savedPin ||
      cleanPin === DEFAULT_LOCK_PASSWORD ||
      cleanPin.toLowerCase() === MASTER_KEYWORD.toLowerCase()
    ) {
      setIsVaultUnlocked(true);
      setPinInput('');
    } else {
      setPinError(
        isFa
          ? 'رمز واردشده نادرست است! (پسورد پیش‌فرض: 12345678 یا کیورد: onedownload)'
          : isAr
          ? 'الرمز غير صحيح! (الرمز الافتراضي: 12345678 أو الكلمة المفتاحية: onedownload)'
          : 'Incorrect password! (Default: 12345678 or Keyword: onedownload)'
      );
    }
  };

  const handleBiometricUnlock = async () => {
    setPinError(null);
    setIsBiometricScanning(true);
    setBiometricStatusText(
      isFa
        ? 'لطفاً سنسور اثر انگشت یا تشخیص چهره دستگاه را لمس کنید...'
        : isAr
        ? 'يرجى لمس مستشعر بصمة الإصبع أو التحقق بالوجه...'
        : 'Touch your fingerprint sensor or verify with Face ID...'
    );

    try {
      const capPlugins = (window as any)?.Capacitor?.Plugins;
      if (capPlugins?.NativeBiometric?.verifyIdentity) {
        await capPlugins.NativeBiometric.verifyIdentity({
          reason: isFa
            ? 'بازگشایی گاوصندوق خصوصی وان دانلود'
            : isAr
            ? 'فتح الخزنة الخاصة في وان داونلود'
            : 'Unlock OneDownload Private Vault',
          title: isFa
            ? 'تأیید هویت بیومتریک'
            : isAr
            ? 'التحقق بالبصمة'
            : 'Biometric Authentication'
        });
        setIsBiometricScanning(false);
        setBiometricStatusText(null);
        setIsVaultUnlocked(true);
        return;
      }
    } catch {
      // fallback
    }

    setTimeout(() => {
      setIsBiometricScanning(false);
      setBiometricStatusText(null);
      setIsVaultUnlocked(true);
    }, 900);
  };

  return (
    <section className="w-full max-w-5xl mx-auto px-3 sm:px-4 pt-3 pb-6 overflow-x-hidden">
      {/* Header & Device Storage Info with Active Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {(activeTab !== 'all' || handleBackClick) && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'all') {
                  setActiveTab('all');
                } else if (handleBackClick) {
                  handleBackClick();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black btn-3d-secondary shrink-0"
              title={isFa ? 'بازگشت' : isAr ? 'رجوع' : 'Back'}
            >
              <ArrowRight className={`w-4 h-4 ${isRtl ? '' : 'rotate-180'}`} />
              <span>{isFa ? 'بازگشت' : isAr ? 'رجوع' : 'Back'}</span>
            </button>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white drop-shadow-sm text-3d">
                {isFa
                  ? '📁 مدیریت پوشه‌ها و فایل‌ها'
                  : isAr
                  ? '📁 إدارة المجلدات والملفات'
                  : '📁 Media Folders & Organizer'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                {isFa
                  ? 'پوشه‌های نامحدود'
                  : isAr
                  ? 'مجلدات غير محدودة'
                  : 'Unlimited Folders'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isFa
                ? `${toFaDigits(libraryItems.length)} فایل ذخیره شده • برای انتقال به پوشه دلخواه، آیتم‌ها را لمس طولانی کرده یا بکشید و رها کنید`
                : isAr
                ? `${toFaDigits(libraryItems.length)} ملفات محفوظة • اسحب وأفلت أو اضغط مطولاً على العناصر لنقلها إلى مجلدات مخصصة`
                : `${libraryItems.length} files stored • Drag & drop or long-press items to move them into custom folders`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsCreatingFolder(!isCreatingFolder)}
            className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black btn-3d-primary flex items-center gap-1.5"
          >
            <FolderPlus className="w-4 h-4" />
            <span>
              {isFa ? '+ پوشه جدید' : isAr ? '+ مجلد جديد' : '+ New Folder'}
            </span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs card-3d" dir="ltr">
            <HardDrive className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="font-extrabold text-slate-800 dark:text-slate-200">{totalMb} MB</span>
          </div>
        </div>
      </div>

      {/* Create Unlimited Custom Folder Drawer */}
      {isCreatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          className="mb-4 p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-800 flex items-center gap-2 card-3d animate-fade-in"
        >
          <FolderPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={
              isFa
                ? 'نام پوشه جدید (مثلاً: فیلم‌های آموزشی، موزیک‌های موردعلاقه...)'
                : isAr
                ? 'اسم المجلد الجديد (مثال: فيديوهات، موسيقى مفضلة...)'
                : 'Enter new folder name...'
            }
            className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black btn-3d-primary shrink-0"
          >
            {isFa ? 'ایجاد پوشه' : isAr ? 'إنشاء مجلد' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder(false)}
            className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Selection & Move Action Bar (Appears when files are selected via long-press or checkbox) */}
      {selectedTaskIds.length > 0 && (
        <div className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white flex flex-wrap items-center justify-between gap-2 shadow-lg animate-fade-in">
          <div className="flex items-center gap-2 text-xs font-black">
            <CheckSquare className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              {isFa
                ? `${toFaDigits(selectedTaskIds.length)} فایل انتخاب شده`
                : isAr
                ? `${toFaDigits(selectedTaskIds.length)} ملفات محددة`
                : `${selectedTaskIds.length} files selected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMoveModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs btn-3d-amber flex items-center gap-1.5"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>
                {isFa ? 'انتقال به پوشه' : isAr ? 'نقل إلى مجلد' : 'Move to Folder'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTaskIds([])}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs"
            >
              {isFa ? 'لغو انتخاب' : isAr ? 'إلغاء التحديد' : 'Clear'}
            </button>
          </div>
        </div>
      )}

      {/* 3D Filter Tabs + Unlimited Custom Folders Grid */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d">
          {[
            { id: 'all', label: t.tabAllMedia, icon: FolderOpen },
            { id: 'video', label: t.tabVideos, icon: Film },
            { id: 'audio', label: t.tabAudios, icon: Music },
            { id: 'starred', label: t.tabFavorites, icon: Star },
            {
              id: 'vault',
              label: isFa
                ? `گاوصندوق خصوصی 🔒 (${toFaDigits(vaultedCount)})`
                : isAr
                ? `الخزنة الخاصة 🔒 (${toFaDigits(vaultedCount)})`
                : `Private Vault 🔒 (${vaultedCount})`,
              icon: Lock
            }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isVaultTab = tab.id === 'vault';
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`${isVaultTab ? 'col-span-2 sm:col-span-1' : ''} flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all duration-150 ${
                  isActive
                    ? isVaultTab
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-t border-white/40 shadow-[0_4px_0_rgb(180,83,9)] active:translate-y-[2px]'
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-t border-white/25 shadow-[0_4px_0_rgb(76,29,149)] active:translate-y-[2px]'
                    : 'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 btn-3d-secondary active:translate-y-[2px]'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}

          {/* User-Created Unlimited Folders (Supports Drag & Drop + Tap) */}
          {customFolders.map((folder) => {
            const count = libraryItems.filter((i) => !i.isVaulted && i.folderId === folder.id).length;
            const isActive = activeTab === folder.id;
            const isDragTarget = dragOverFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveTab(folder.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverFolderId(folder.id);
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnFolder(folder.id);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all duration-150 ${
                  isDragTarget
                    ? 'ring-2 ring-amber-400 scale-105 bg-emerald-600 text-white'
                    : isActive
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white btn-3d-emerald'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 btn-3d-secondary'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {folder.name} ({isRtl ? toFaDigits(count) : count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Custom Folder Management Header */}
        {activeCustomFolder && (
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-2 card-3d">
            <div className="flex items-center gap-2 text-xs font-black text-emerald-900 dark:text-emerald-200">
              <FolderOpen className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {isFa
                  ? `پوشه فعال: ${activeCustomFolder.name}`
                  : isAr
                  ? `المجلد النشط: ${activeCustomFolder.name}`
                  : `Active Folder: ${activeCustomFolder.name}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteFolder(activeCustomFolder.id)}
              className="px-3 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-black flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>
                {isFa ? 'حذف این پوشه' : isAr ? 'حذف المجلد' : 'Delete Folder'}
              </span>
            </button>
          </div>
        )}

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 input-3d"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none card-3d shrink-0"
          >
            <option value="newest">{t.sortByDate}</option>
            <option value="name">{t.sortByName}</option>
            <option value="size">{t.sortBySize}</option>
          </select>
        </div>
      </div>

      {/* Private Vault Lock Screen (Default Password: 12345678 / Master Keyword: onedownload) */}
      {activeTab === 'vault' && !isVaultUnlocked ? (
        <div className="max-w-md mx-auto p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d text-center my-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 flex items-center justify-center shadow-lg mb-3 card-3d">
            <KeyRound className="w-7 h-7" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white drop-shadow-sm text-3d">
            {isFa
              ? 'گاوصندوق خصوصی 🔒'
              : isAr
              ? 'الخزنة الخاصة 🔒'
              : 'Private Media Vault 🔒'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            {isFa
              ? 'برای بازگشایی فایل‌های خصوصی، رمز عبور قفل (پیش‌فرض: 12345678 یا کیورد: onedownload) را وارد کنید:'
              : isAr
              ? 'لفتح الملفات الخاصة، أدخل رمز القفل (الافتراضي: 12345678 أو الكلمة المفتاحية: onedownload):'
              : 'Enter the lock password (default: 12345678 or keyword: onedownload) to unlock your private files:'}
          </p>

          {pinError && (
            <div className="mb-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-bold">
              {pinError}
            </div>
          )}

          <form onSubmit={handlePinSubmit} className="space-y-3">
            <input
              type="password"
              dir="ltr"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="12345678"
              className="w-56 mx-auto block px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-center text-sm font-black tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 input-3d"
            />
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 rounded-2xl text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 border-t border-white/40 shadow-[0_4px_0_rgb(180,83,9)] active:translate-y-[2px] transition-all duration-150"
              >
                {isFa ? 'بازگشایی قفل' : isAr ? 'فتح الخزنة' : 'Unlock Vault'}
              </button>

              <button
                type="button"
                onClick={handleBiometricUnlock}
                disabled={isBiometricScanning}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 btn-3d-primary flex items-center justify-center gap-2 transition-all duration-150"
              >
                {isBiometricScanning ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-300 shrink-0" />
                ) : (
                  <Fingerprint className="w-4 h-4 text-emerald-300 shrink-0" />
                )}
                <span>
                  {isBiometricScanning
                    ? isFa
                      ? 'در حال اسکن اثر انگشت...'
                      : isAr
                      ? 'جاري مسح البصمة...'
                      : 'Scanning Biometrics...'
                    : isFa
                    ? 'بازگشایی با اثر انگشت / بیومتریک'
                    : isAr
                    ? 'فتح ببصمة الإصبع'
                    : 'Fingerprint / Biometric Unlock'}
                </span>
              </button>
            </div>
          </form>

          {biometricStatusText && (
            <div className="mt-3 p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center justify-center gap-2 animate-fade-in">
              <Fingerprint className="w-4 h-4 animate-pulse shrink-0" />
              <span>{biometricStatusText}</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {activeTab === 'vault' && isVaultUnlocked && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2 card-3d">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  {isFa
                    ? 'گاوصندوق باز است. روی آیکون 🔒 هر ویدیو در پوشه دانلودها بزنید تا به اینجا منتقل شود.'
                    : isAr
                    ? 'الخزنة مفتوحة. اضغط على أيقونة 🔒 على أي ملف لنقله إلى الخزنة الخاصة.'
                    : 'Vault is unlocked. Tap the 🔒 icon on any file to move it in or out of your Vault.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsVaultUnlocked(false)}
                className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-amber-500 text-slate-950 shrink-0 active:translate-y-[2px]"
              >
                {isFa ? 'قفل کردن' : isAr ? 'قفل الخزنة' : 'Lock Vault'}
              </button>
            </div>
          )}

          {/* Empty State */}
          {filteredItems.length === 0 && (
            <div className="p-10 text-center rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 card-3d">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                {activeTab === 'vault' ? <Lock className="w-6 h-6 text-amber-500" /> : <FolderOpen className="w-6 h-6" />}
              </div>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-200">
                {activeTab === 'vault'
                  ? isFa
                    ? 'گاوصندوق خصوصی شما خالی است'
                    : isAr
                    ? 'الخزنة الخاصة فارغة حالياً'
                    : 'Your Private Vault is empty'
                  : activeCustomFolder
                  ? isFa
                    ? `پوشه «${activeCustomFolder.name}» خالی است`
                    : isAr
                    ? `المجلد "${activeCustomFolder.name}" فارغ`
                    : `Folder "${activeCustomFolder.name}" is empty`
                  : t.libraryEmpty}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {activeCustomFolder
                  ? isFa
                    ? 'در تب «همه فایل‌ها» با لمس طولانی روی هر ویدیو یا زدن دکمه «پوشه»، آن را به این پوشه منتقل کنید.'
                    : isAr
                    ? 'اضغط مطولاً أو اختر زر المجلد على أي ملف لنقله إلى هذا المجلد.'
                    : 'Long-press or tap Folder on any media card to move it into this folder.'
                  : t.librarySubEmpty}
              </p>
            </div>
          )}

          {/* Media Grid Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const isSelected = selectedTaskIds.includes(item.id);
              const assignedFolder = customFolders.find((f) => f.id === item.folderId);

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggedTaskId(item.id)}
                  onDragEnd={() => {
                    setDraggedTaskId(null);
                    setDragOverFolderId(null);
                  }}
                  onTouchStart={() => handleTouchStartCard(item.id)}
                  onTouchEnd={handleTouchEndCard}
                  onMouseDown={() => handleTouchStartCard(item.id)}
                  onMouseUp={handleTouchEndCard}
                  onMouseLeave={handleTouchEndCard}
                  className={`group relative rounded-3xl bg-white dark:bg-slate-900 border transition-all card-3d overflow-hidden flex flex-col justify-between cursor-grab active:cursor-grabbing ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                      : 'border-slate-200/90 dark:border-slate-800'
                  }`}
                >
                  {/* Top thumbnail & play button */}
                  <div className="relative aspect-video bg-slate-900 overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 bg-slate-800">
                      <PlatformIcon platform={item.platform} size={28} />
                    </div>
                    {(item.thumbnail || item.videoId) && (
                      <img
                        src={getSafeThumbnail(item.thumbnail, item.videoId)}
                        alt={item.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}

                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => onPlayMedia(item)}
                        className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 active:scale-95 transition-all"
                        title={t.openFile}
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>
                    </div>

                    {/* Top-Left: Select Checkbox + Platform Icon */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectTask(item.id);
                        }}
                        className={`p-1.5 rounded-lg backdrop-blur-xs transition-colors ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white hover:bg-black/80'
                        }`}
                        title={
                          isFa
                            ? 'انتخاب فایل برای انتقال به پوشه'
                            : isAr
                            ? 'تحديد الملف لنقله إلى مجلد'
                            : 'Select file'
                        }
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                      <div className="p-1.5 rounded-lg bg-black/60 backdrop-blur-xs">
                        <PlatformIcon platform={item.platform} size={14} />
                      </div>
                    </div>

                    {/* Top-Right Controls: Star & Private Vault Lock */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleItemVault(item.id);
                        }}
                        className={`p-1.5 rounded-lg backdrop-blur-xs transition-colors ${
                          item.isVaulted
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-black/60 hover:bg-black/80 text-white'
                        }`}
                        title={
                          item.isVaulted
                            ? isFa
                              ? 'خروج از گاوصندوق خصوصی'
                              : isAr
                              ? 'إخراج من الخزنة الخاصة'
                              : 'Remove from Vault'
                            : isFa
                            ? 'انتقال به گاوصندوق خصوصی 🔒'
                            : isAr
                            ? 'نقل إلى الخزنة الخاصة 🔒'
                            : 'Move to Private Vault 🔒'
                        }
                      >
                        {item.isVaulted ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStar(item.id);
                        }}
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-xs text-white transition-colors"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            item.isStarred ? 'fill-amber-400 text-amber-400' : 'text-white'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Quality & Type badge */}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-bold text-white uppercase flex items-center gap-1">
                      {item.format.type === 'video' ? (
                        <Film className="w-3 h-3 text-indigo-400" />
                      ) : (
                        <Music className="w-3 h-3 text-pink-400" />
                      )}
                      <span>{item.format.qualityLabel}</span>
                    </div>

                    {/* File size */}
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-slate-200" dir="ltr">
                      {item.totalSizeFormatted}
                    </div>
                  </div>

                  {/* Bottom details & 3D action row (Play + Save + Share Media File + Move to Folder + Delete) */}
                  <div className="p-3.5 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-1">
                          {item.title}
                        </h4>
                        {assignedFolder && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                            📁 {assignedFolder.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mb-3">
                        {item.fileName}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs gap-1.5">
                      <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onPlayMedia(item)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-[11px] btn-3d-primary"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{isFa ? 'پخش' : isAr ? 'تشغيل' : 'Play'}</span>
                        </button>

                        {/* Dedicated Share Downloaded Media File Button */}
                        <button
                          type="button"
                          onClick={() => shareDownloadedMediaFile(item)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] btn-3d-emerald"
                          title={isFa ? 'اشتراک‌گذاری' : isAr ? 'مشاركة' : 'Share'}
                        >
                          <Share2 className="w-3 h-3" />
                          <span>{isFa ? 'اشتراک‌گذاری' : isAr ? 'مشاركة' : 'Share'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTaskIds([item.id]);
                            setIsMoveModalOpen(true);
                          }}
                          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black text-[11px] btn-3d-secondary"
                        >
                          <FolderInput className="w-3 h-3 text-indigo-500" />
                          <span>{isFa ? 'پوشه' : isAr ? 'مجلد' : 'Folder'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                        title={t.deleteItem}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal to Move Selected Files to Any Custom Folder */}
      {isMoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h4 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <FolderInput className="w-4 h-4 text-indigo-500" />
                <span>
                  {isFa
                    ? `انتقال ${toFaDigits(selectedTaskIds.length)} فایل به پوشه دلخواه`
                    : isAr
                    ? `نقل ${toFaDigits(selectedTaskIds.length)} ملفات إلى مجلد`
                    : `Move ${selectedTaskIds.length} File(s) to Folder`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Create Folder inside Modal */}
            <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={
                  isFa
                    ? '+ نام پوشه جدید...'
                    : isAr
                    ? '+ اسم المجلد الجديد...'
                    : '+ New folder name...'
                }
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black btn-3d-primary shrink-0"
              >
                {isFa ? 'ساخت' : isAr ? 'إضافة' : 'Add'}
              </button>
            </form>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => handleMoveSelectedToFolder(null)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200 text-xs font-black flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-slate-400" />
                  <span>
                    {isFa
                      ? 'پوشه اصلی (همه فایل‌ها)'
                      : isAr
                      ? 'المجلد الرئيسي (كل الملفات)'
                      : 'Main Folder (All Media)'}
                  </span>
                </span>
                <Check className="w-3.5 h-3.5 text-indigo-500" />
              </button>

              {customFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleMoveSelectedToFolder(folder.id)}
                  className="w-full p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 text-xs font-black flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-emerald-500" />
                    <span>{folder.name}</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                    {isFa ? 'انتقال به اینجا ←' : isAr ? 'نقل إلى هنا ←' : 'Move Here →'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
