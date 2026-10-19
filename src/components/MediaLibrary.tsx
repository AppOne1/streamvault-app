import React, { useState, useEffect } from 'react';
import { DownloadTask, Language } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { getTranslation } from '../i18n/translations';
import { getSafeThumbnail } from '../services/platformDetector';
import { getAllOfflineMedia, deleteOfflineMedia, OfflineMediaRecord } from '../services/storageService';
import {
  Search,
  Star,
  Play,
  Save,
  Trash2,
  HardDrive,
  Film,
  Music,
  FolderOpen,
  Clock
} from 'lucide-react';

interface MediaLibraryProps {
  language: Language;
  tasks: DownloadTask[];
  onPlayMedia: (task: DownloadTask) => void;
  onSaveToDisk: (task: DownloadTask) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  language,
  tasks,
  onPlayMedia,
  onSaveToDisk,
  onDeleteTask,
  onToggleStar
}) => {
  const t = getTranslation(language);
  const [activeTab, setActiveTab] = useState<'all' | 'video' | 'audio' | 'starred'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'size'>('newest');
  const [offlineRecords, setOfflineRecords] = useState<OfflineMediaRecord[]>([]);

  // Load actual offline media records from IndexedDB "offline_media" ObjectStore
  useEffect(() => {
    let isMounted = true;
    getAllOfflineMedia().then((records) => {
      if (isMounted) setOfflineRecords(records);
    });
    return () => {
      isMounted = false;
    };
  }, [tasks]);

  // Combine completed tasks with IndexedDB records
  const libraryItems: DownloadTask[] = React.useMemo(() => {
    const completedTasks = tasks.filter((t) => t.status === 'completed');
    const taskMap = new Map<string, DownloadTask>();
    completedTasks.forEach((t) => taskMap.set(t.id, t));

    // Ensure all IndexedDB records are present and have their real Blob and URLs
    offlineRecords.forEach((rec) => {
      const existing = taskMap.get(rec.id);
      if (existing) {
        if (!existing.mediaBlob) existing.mediaBlob = rec.mediaBlob;
        if (!existing.blobUrl && rec.mediaBlob) existing.blobUrl = URL.createObjectURL(rec.mediaBlob);
        existing.totalBytes = rec.fileSize || existing.totalBytes;
        existing.downloadedBytes = rec.fileSize || existing.downloadedBytes;
        existing.totalSizeFormatted = `${(rec.fileSize / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        // Create task representation from IndexedDB record
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
            format: (ext as any),
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
          mediaBlob: rec.mediaBlob,
          blobUrl,
          directUrl: rec.directUrl
        });
      }
    });

    return Array.from(taskMap.values());
  }, [tasks, offlineRecords]);

  // Calculate total offline storage used
  const totalBytes = libraryItems.reduce((acc, curr) => acc + (curr.totalBytes || 0), 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);

  // Filter & Search
  const filteredItems = libraryItems
    .filter((item) => {
      if (activeTab === 'video' && item.format.type !== 'video') return false;
      if (activeTab === 'audio' && item.format.type !== 'audio') return false;
      if (activeTab === 'starred' && !item.isStarred) return false;

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

  return (
    <section className="w-full max-w-5xl mx-auto px-4 py-6">
      {/* Header & Device Storage Folder Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {language === 'fa' ? '📁 پوشه رسانه‌های دانلودشده در دستگاه' : '📁 Device Downloaded Media'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              {language === 'fa' ? 'پخش آفلاین بدون فیلترشکن' : 'Offline / Zero-VPN'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {language === 'fa'
              ? `${libraryItems.length} فایل در حافظه دستگاه ذخیره شده و بدون اینترنت قابل مشاهده است.`
              : `${libraryItems.length} media files stored on device and available offline.`}
          </p>
        </div>

        {/* Local Storage Indicator */}
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs card-3d">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500">
            <HardDrive className="w-4 h-4 shrink-0" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold">
              {language === 'fa' ? 'حجم مصرفی در حافظه:' : t.totalStorageUsed}
            </span>
            <span className="font-extrabold text-slate-800 dark:text-slate-200 font-mono">
              {totalMb} MB
            </span>
          </div>
        </div>
      </div>

      {/* Tabs & Search Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-x-auto">
          {[
            { id: 'all', label: t.tabAllMedia, icon: null },
            { id: 'video', label: t.tabVideos, icon: Film },
            { id: 'audio', label: t.tabAudios, icon: Music },
            { id: 'starred', label: t.tabFavorites, icon: Star },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="newest">{t.sortByDate}</option>
            <option value="name">{t.sortByName}</option>
            <option value="size">{t.sortBySize}</option>
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 && (
        <div className="p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
            <FolderOpen className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {t.libraryEmpty}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {t.librarySubEmpty}
          </p>
        </div>
      )}

      {/* Media Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="group relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d overflow-hidden flex flex-col justify-between"
          >
            {/* Top thumbnail & hover play button */}
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
              
              {/* Dark overlay on hover */}
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                <button
                  onClick={() => onPlayMedia(item)}
                  className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 active:scale-95 transition-all transform scale-90 group-hover:scale-100"
                  title={t.openFile}
                >
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </button>
              </div>

              {/* Platform tag & Format badge */}
              <div className="absolute top-2 left-2 p-1 rounded-md bg-black/60 backdrop-blur-xs">
                <PlatformIcon platform={item.platform} size={14} />
              </div>

              {/* Star toggle button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(item.id);
                }}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-xs text-white transition-colors"
                title={item.isStarred ? t.unfavorite : t.favorite}
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    item.isStarred ? 'fill-amber-400 text-amber-400' : 'text-white'
                  }`}
                />
              </button>

              {/* Quality & Type pill */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono font-bold text-white uppercase flex items-center gap-1">
                {item.format.type === 'video' ? <Film className="w-3 h-3 text-indigo-400" /> : <Music className="w-3 h-3 text-pink-400" />}
                <span>{item.format.qualityLabel}</span>
              </div>

              {/* File size */}
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-slate-200">
                {item.totalSizeFormatted}
              </div>
            </div>

            {/* Bottom details & action row */}
            <div className="p-3.5 flex flex-col justify-between flex-1">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {item.title}
                </h4>
                <p className="text-[11px] text-slate-400 font-mono truncate mb-3">
                  {item.fileName}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-[10px] text-slate-400 font-mono">
                  {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : 'Offline'}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onPlayMedia(item)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[11px] btn-3d-primary active:scale-95"
                    title={language === 'fa' ? 'پخش آفلاین بدون نیاز به اینترنت و فیلترشکن' : t.openFile}
                  >
                    <Play className="w-3 h-3 fill-current ml-0.5" />
                    <span>{language === 'fa' ? 'پخش آفلاین' : 'Play'}</span>
                  </button>

                  <button
                    onClick={() => onSaveToDisk(item)}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] btn-3d-secondary active:scale-95"
                    title={language === 'fa' ? 'ذخیره در پوشه دانلودهای گوشی / گالری' : t.exportFile}
                  >
                    <Save className="w-3 h-3 text-indigo-500" />
                    <span className="hidden xs:inline">{language === 'fa' ? 'ذخیره در فایل‌ها' : 'Export'}</span>
                  </button>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t.deleteItem}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
