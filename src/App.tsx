import React, { useEffect, useState } from 'react';
import {
  AppSettings,
  DownloadTask,
  FormatOption,
  Language,
  ParsedMediaInfo,
  ThemeMode,
  UserSession
} from './types';
import { getTranslation } from './i18n/translations';
import { detectPlatform, extractUrlFromText, parseMediaUrl } from './services/platformDetector';
import { downloadEngine } from './services/downloadEngine';
import {
  clearAllIDBBlobs,
  deleteMediaBlobFromIDB,
  DEFAULT_SETTINGS,
  loadSettingsFromStorage,
  loadSessionFromStorage,
  loadTasksFromStorage,
  saveSettingsToStorage,
  saveSessionToStorage,
  saveTasksToStorage
} from './services/storageService';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';
import { Header } from './components/Header';
import { UrlInputSection } from './components/UrlInputSection';
import { MediaResultModal } from './components/MediaResultModal';
import { DownloadManager } from './components/DownloadManager';
import { MediaLibrary } from './components/MediaLibrary';
import { BuiltInMediaPlayer } from './components/BuiltInMediaPlayer';
import { SettingsView } from './components/SettingsView';
import { AuthModal } from './components/AuthModal';
import { ProUpgradeModal } from './components/ProUpgradeModal';
import { IOSInstallGuide } from './components/IOSInstallGuide';
import { OfflineBanner } from './components/OfflineBanner';
import { ShareAppModal } from './components/ShareAppModal';
import { TrendingShowcase } from './components/TrendingShowcase';
import { PermissionsDisclosureModal, PERMISSIONS_DISCLOSURE_STORAGE_KEY } from './components/PermissionsDisclosureModal';
import {
  canDownload,
  consumeDownloadQuota,
  getCoinsBalance,
  getDailyQuota,
  QuotaInfo,
  subscribeQuotaAndCoins
} from './services/quotaService';
import { Download, Film, HardDrive, Settings, Sparkles, AlertCircle, Loader2, CheckCircle, Crown, Coins } from 'lucide-react';

interface ToastNotice {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettingsFromStorage());
  const [userSession, setUserSession] = useState<UserSession>(() => loadSessionFromStorage());
  const [tasks, setTasks] = useState<DownloadTask[]>(() => loadTasksFromStorage());
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo>(() => getDailyQuota());
  const [coinsBalance, setCoinsBalance] = useState<number>(() => getCoinsBalance());
  
  const [activeTab, setActiveTab] = useState<'downloader' | 'downloads' | 'library' | 'settings'>('downloader');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [parsedMedia, setParsedMedia] = useState<ParsedMediaInfo | null>(null);
  const [activePlayerTask, setActivePlayerTask] = useState<DownloadTask | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PERMISSIONS_DISCLOSURE_STORAGE_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [sharedLinkNotice, setSharedLinkNotice] = useState<boolean>(false);
  const [toastNotice, setToastNotice] = useState<ToastNotice | null>(null);

  const isOnline = useOnlineStatus();
  const {
    isInstallable,
    showIOSModal,
    setShowIOSModal,
    triggerInstall
  } = usePWAInstall();

  const t = getTranslation(settings.language);

  // Sync theme class & direction
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    root.setAttribute('dir', settings.language === 'fa' ? 'rtl' : 'ltr');
    root.setAttribute('lang', settings.language);
  }, [settings.theme, settings.language]);

  // Save settings and session changes
  useEffect(() => {
    saveSettingsToStorage(settings);
  }, [settings]);

  useEffect(() => {
    saveSessionToStorage(userSession);
  }, [userSession]);

  useEffect(() => {
    saveTasksToStorage(tasks);
  }, [tasks]);

  // Subscribe to quota & Jet Coins balance updates across the app
  useEffect(() => {
    const unsub = subscribeQuotaAndCoins(() => {
      setQuotaInfo(getDailyQuota());
      setCoinsBalance(getCoinsBalance());
    });
    return () => unsub();
  }, []);

  // Subscribe to real-time download engine ticks
  useEffect(() => {
    const unsubscribe = downloadEngine.subscribe((updatedTask) => {
      setTasks((prev) => {
        const index = prev.findIndex((t) => t.id === updatedTask.id);
        if (index === -1) {
          return [updatedTask, ...prev];
        }
        const copy = [...prev];
        copy[index] = { ...updatedTask };
        return copy;
      });

      // Auto-save finished task directly to device storage
      if (updatedTask.status === 'completed' && settings.autoSaveToDevice) {
        downloadEngine.saveFileToDisk(updatedTask);
        setToastNotice({
          type: 'success',
          title: settings.language === 'fa' ? 'فایل در حافظه دستگاه ذخیره شد' : 'File saved to device',
          message: updatedTask.fileName
        });
        setTimeout(() => setToastNotice(null), 4500);
      }

      // Auto-play finished task if preference is enabled
      if (updatedTask.status === 'completed' && settings.autoPlayAfterDownload) {
        setActivePlayerTask(updatedTask);
      }
    });

    return () => unsubscribe();
  }, [settings.autoPlayAfterDownload, settings.autoSaveToDevice]);

  // Web Share Target API: Catch URL shared from external apps (e.g. YouTube, TikTok, Instagram)
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const sharedUrl = searchParams.get('url') || searchParams.get('text') || searchParams.get('title');

      if (sharedUrl) {
        const extracted = extractUrlFromText(sharedUrl);
        if (extracted) {
          setInputUrl(extracted);
          setSharedLinkNotice(true);
          handleAnalyze(extracted);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    } catch (err) {
      console.warn('Share target parsing error:', err);
    }
  }, []);

  // Handlers
  const handleToggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark'
    }));
  };

  const handleToggleLanguage = () => {
    setSettings((prev) => ({
      ...prev,
      language: prev.language === 'fa' ? 'en' : 'fa'
    }));
  };

  const handleAnalyze = async (targetUrl?: string) => {
    const urlToParse = targetUrl || inputUrl;
    if (!urlToParse.trim()) return;

    setIsAnalyzing(true);
    try {
      const media = await parseMediaUrl(urlToParse);
      setParsedMedia(media);
    } catch (err) {
      console.error('Failed to parse media URL:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Automatic Sequential Queue Scheduler: starts next 'queued' task when active downloads < 2
  useEffect(() => {
    const currentlyDownloading = tasks.filter((t) => t.status === 'downloading');
    if (currentlyDownloading.length === 0) {
      const nextQueued = [...tasks].reverse().find((t) => t.status === 'queued');
      if (nextQueued) {
        downloadEngine.startTask(nextQueued);
      }
    }
  }, [tasks]);

  const handleStartDownload = (media: ParsedMediaInfo, format: FormatOption) => {
    // 1. Enforce daily quota for guest / free tier
    if (!canDownload()) {
      setIsUpgradeModalOpen(true);
      setToastNotice({
        type: 'error',
        title: settings.language === 'fa' ? 'سهمیه دانلود رایگان امروز به پایان رسید!' : 'Daily Free Quota Reached!',
        message:
          settings.language === 'fa'
            ? 'با استفاده از سکه‌های رایگان یا ارتقا به VIP Pro بدون محدودیت دانلود کنید'
            : 'Redeem free coins or upgrade to VIP Pro for unlimited downloads'
      });
      setTimeout(() => setToastNotice(null), 5000);
      return;
    }

    // 2. Consume 1 quota count
    consumeDownloadQuota();
    setQuotaInfo(getDailyQuota());

    const newTask = downloadEngine.createTask(media, format);
    const hasActiveDownload = tasks.some((t) => t.status === 'downloading');
    setTasks((prev) => [newTask, ...prev]);

    // Start immediately if no active download, otherwise keep 'queued' for sequential scheduler
    if (!hasActiveDownload) {
      downloadEngine.startTask(newTask);
    }
    setActiveTab('downloads');
  };

  const handleStartBatchDownload = async (
    urls: string[],
    qualityPreset: '1080p' | '720p' | 'mp3'
  ) => {
    if (!canDownload()) {
      setIsUpgradeModalOpen(true);
      setToastNotice({
        type: 'error',
        title: settings.language === 'fa' ? 'سهمیه دانلود رایگان امروز تکمیل شده است!' : 'Daily Free Quota Reached!',
        message:
          settings.language === 'fa'
            ? 'برای استفاده از دانلود دسته‌جمعی، با سکه یا اشتراک به VIP Pro ارتقا دهید'
            : 'Redeem coins or upgrade to VIP Pro for batch downloading'
      });
      setTimeout(() => setToastNotice(null), 5000);
      return;
    }

    consumeDownloadQuota();
    setQuotaInfo(getDailyQuota());

    setToastNotice({
      type: 'info',
      title:
        settings.language === 'fa'
          ? `در حال افزودن ${urls.length} لینک به صف دانلود نوبتی...`
          : `Adding ${urls.length} links to batch queue...`,
      message: qualityPreset.toUpperCase()
    });

    const createdTasks: DownloadTask[] = [];
    for (const rawUrl of urls) {
      try {
        const media = await parseMediaUrl(rawUrl);
        let chosenFormat =
          qualityPreset === 'mp3'
            ? media.formats.find((f) => f.type === 'audio')
            : qualityPreset === '720p'
            ? media.formats.find((f) => f.type === 'video' && f.qualityLabel.includes('720'))
            : media.formats.find((f) => f.type === 'video' && f.qualityLabel.includes('1080'));
        if (!chosenFormat) {
          chosenFormat = media.formats[0];
        }
        const task = downloadEngine.createTask(media, chosenFormat);
        createdTasks.push(task);
      } catch {
        // skip invalid url
      }
    }

    if (createdTasks.length > 0) {
      setTasks((prev) => [...createdTasks, ...prev]);
      setActiveTab('downloads');
      setToastNotice({
        type: 'success',
        title:
          settings.language === 'fa'
            ? `${createdTasks.length} فایل به صف دانلود نوبتی اضافه شد!`
            : `${createdTasks.length} files added to sequential queue!`,
        message:
          settings.language === 'fa'
            ? 'دانلودها به نوبت و خودکار انجام می‌شوند'
            : 'Downloads will run automatically in sequence'
      });
      setTimeout(() => setToastNotice(null), 4000);
    }
  };

  const handlePauseTask = (task: DownloadTask) => {
    downloadEngine.pauseTask(task);
  };

  const handleResumeTask = (task: DownloadTask) => {
    downloadEngine.resumeTask(task);
  };

  const handleCancelTask = (task: DownloadTask) => {
    downloadEngine.cancelTask(task);
  };

  const handleRetryTask = (task: DownloadTask) => {
    downloadEngine.retryTask(task);
  };

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((t) => t.id === taskId);
    if (taskToDelete) {
      downloadEngine.cancelTask(taskToDelete);
    }
    await deleteMediaBlobFromIDB(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (activePlayerTask?.id === taskId) {
      setActivePlayerTask(null);
    }
  };

  const handlePlayMedia = (task: DownloadTask) => {
    setActivePlayerTask(task);
  };

  const handleSaveToDisk = async (task: DownloadTask) => {
    setToastNotice({
      type: 'info',
      title: settings.language === 'fa' ? 'در حال آماده‌سازی فایل...' : 'Preparing file...',
      message: task.fileName
    });
    const success = await downloadEngine.saveFileToDisk(task, (msg) => {
      setToastNotice({
        type: 'info',
        title: settings.language === 'fa' ? 'در حال انتقال به حافظه...' : 'Saving to storage...',
        message: msg
      });
    });
    if (success) {
      setToastNotice({
        type: 'success',
        title: settings.language === 'fa' ? 'فایل با موفقیت ذخیره شد!' : 'File successfully saved!',
        message: task.fileName
      });
    } else {
      setToastNotice({
        type: 'error',
        title: settings.language === 'fa' ? 'خطا در ذخیره‌سازی فایل' : 'Failed to save file',
        message: settings.language === 'fa' ? 'لطفاً وضعیت اتصال را بررسی کرده و مجدد امتحان کنید' : 'Please check connection and retry'
      });
    }
    setTimeout(() => setToastNotice(null), 4500);
  };

  const handlePauseAll = () => {
    tasks.forEach((t) => {
      if (t.status === 'downloading') {
        downloadEngine.pauseTask(t);
      }
    });
  };

  const handleResumeAll = () => {
    tasks.forEach((t) => {
      if (t.status === 'paused') {
        downloadEngine.resumeTask(t);
      }
    });
  };

  const handleClearCompleted = () => {
    setTasks((prev) => prev.filter((t) => t.status !== 'completed'));
  };

  const handleToggleStar = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, isStarred: !t.isStarred } : t))
    );
  };

  const handleToggleVault = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, isVaulted: !t.isVaulted } : t))
    );
  };

  const handleClearAllAppData = async () => {
    tasks.forEach((t) => downloadEngine.cancelTask(t));
    await clearAllIDBBlobs();
    setTasks([]);
    localStorage.clear();
    setSettings(DEFAULT_SETTINGS);
  };

  const activeDownloadsCount = tasks.filter(
    (t) => t.status === 'downloading' || t.status === 'queued'
  ).length;
  const completedLibraryCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      {/* Header Bar */}
      <Header
        language={settings.language}
        theme={settings.theme}
        isOnline={isOnline}
        userSession={userSession}
        quotaInfo={quotaInfo}
        coinsBalance={coinsBalance}
        isInstallable={isInstallable}
        onToggleTheme={handleToggleTheme}
        onToggleLanguage={handleToggleLanguage}
        onTriggerInstall={triggerInstall}
        onOpenInstallGuide={() => setShowIOSModal(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
        onOpenShare={() => setIsShareModalOpen(true)}
      />

      {/* Main Content Area (Proper top & bottom padding so headers never hide under sticky header or 3D bottom dock) */}
      <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden pt-2 sm:pt-4 pb-28 sm:pb-12">
        {/* Navigation Tabs (Desktop & Tablet view only - hidden on mobile) */}
        <div className="hidden sm:block max-w-4xl mx-auto px-4 pt-4 sm:pt-6">
          <div className="flex items-center justify-center sm:justify-start gap-1.5 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d">
            <button
              onClick={() => setActiveTab('downloader')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'downloader'
                  ? 'btn-3d-primary bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{t.tabDownloader}</span>
            </button>

            <button
              onClick={() => setActiveTab('downloads')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'downloads'
                  ? 'btn-3d-primary bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>{t.tabDownloads}</span>
              {activeDownloadsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-500 text-white animate-pulse">
                  {activeDownloadsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'library'
                  ? 'btn-3d-primary bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>{t.tabLibrary}</span>
              {completedLibraryCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {completedLibraryCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'settings'
                  ? 'btn-3d-primary bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>{t.tabSettings}</span>
            </button>

            {/* Daily Quota quick badge on desktop */}
            <div className="ms-auto flex items-center gap-2 pe-1">
              <button
                onClick={() => setIsUpgradeModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-xs active:scale-95 transition-all"
                title="مشاهده سهمیه روزانه و ارتقا"
              >
                <Crown className="w-3.5 h-3.5 fill-current" />
                <span>
                  {quotaInfo.isPro
                    ? (settings.language === 'fa' ? 'VIP Pro نامحدود' : 'VIP Unlimited')
                    : (settings.language === 'fa' ? `${quotaInfo.remainingToday} از ${quotaInfo.maxDaily} دانلود` : `${quotaInfo.remainingToday}/${quotaInfo.maxDaily} downloads`)}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: URL Downloader + Trending Clips & Music Showcase */}
        {activeTab === 'downloader' && (
          <div className="animate-fade-in">
            <UrlInputSection
              language={settings.language}
              url={inputUrl}
              setUrl={setInputUrl}
              isLoading={isAnalyzing}
              onAnalyze={handleAnalyze}
              onStartBatchDownload={handleStartBatchDownload}
              sharedLinkNotice={sharedLinkNotice}
              autoSniffClipboard={settings.autoSniffClipboard}
              tasks={tasks}
            />

            {/* Trending Clips & Music Showcase + 3-Option Jet Coins Panel */}
            <TrendingShowcase
              language={settings.language}
              onPlayItem={handlePlayMedia}
              onDownloadItem={handleStartDownload}
              onOpenShare={() => setIsShareModalOpen(true)}
              onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
            />

            {/* Numbered Queue Overview (۱، ۲، ۳...) with Distinct Statuses */}
            {tasks.length > 0 && (
              <div className="max-w-4xl mx-auto px-3 sm:px-4 mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span>{settings.language === 'fa' ? 'فهرست صف دانلودها (نوبتی):' : t.downloadsHeader}</span>
                  </h3>
                  <button
                    onClick={() => setActiveTab('downloads')}
                    className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {settings.language === 'fa' ? `مشاهده کل صف (${tasks.length}) ←` : `View All (${tasks.length}) →`}
                  </button>
                </div>
                <div className="space-y-2">
                  {tasks.slice(0, 4).map((task, idx) => {
                    const numLabel =
                      settings.language === 'fa'
                        ? String(idx + 1).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
                        : String(idx + 1);
                    return (
                      <div
                        key={task.id}
                        className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between gap-3 card-3d"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                            {numLabel}
                          </span>
                          {task.thumbnail ? (
                            <img
                              src={task.thumbnail}
                              alt={task.title}
                              className="w-12 h-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                              <Film className="w-4 h-4 text-slate-500" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs sm:text-sm truncate">
                              {task.title}
                            </h4>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {task.format.qualityLabel} • {task.progressPercent}%
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {task.status === 'completed' ? (
                            <button
                              onClick={() => handlePlayMedia(task)}
                              className="px-3 py-1 rounded-xl text-xs font-black bg-indigo-600 text-white btn-3d-primary"
                            >
                              {t.openFile}
                            </button>
                          ) : task.status === 'downloading' ? (
                            <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>{settings.language === 'fa' ? 'در حال دانلود' : 'Downloading'}</span>
                            </span>
                          ) : task.status === 'queued' ? (
                            <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              {settings.language === 'fa' ? 'در انتظار' : 'Waiting'}
                            </span>
                          ) : (
                            <span className="text-xs font-mono font-bold text-indigo-500">
                              {task.status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Download Tasks Queue */}
        {activeTab === 'downloads' && (
          <div className="animate-fade-in">
            <DownloadManager
              language={settings.language}
              tasks={tasks}
              onPauseTask={handlePauseTask}
              onResumeTask={handleResumeTask}
              onCancelTask={handleCancelTask}
              onRetryTask={handleRetryTask}
              onDeleteTask={handleDeleteTask}
              onPlayMedia={handlePlayMedia}
              onSaveToDisk={handleSaveToDisk}
              onPauseAll={handlePauseAll}
              onResumeAll={handleResumeAll}
              onClearCompleted={handleClearCompleted}
              onStartBatchDownload={handleStartBatchDownload}
            />
          </div>
        )}

        {/* Tab 3: Media Library */}
        {activeTab === 'library' && (
          <div className="animate-fade-in">
            <MediaLibrary
              language={settings.language}
              tasks={tasks}
              onPlayMedia={handlePlayMedia}
              onSaveToDisk={handleSaveToDisk}
              onDeleteTask={handleDeleteTask}
              onToggleStar={handleToggleStar}
              onToggleVault={handleToggleVault}
            />
          </div>
        )}

        {/* Tab 4: Settings */}
        {activeTab === 'settings' && (
          <div className="animate-fade-in">
            <SettingsView
              language={settings.language}
              settings={settings}
              onUpdateSettings={setSettings}
              onClearAllAppData={handleClearAllAppData}
              onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
              onOpenShare={() => setIsShareModalOpen(true)}
              onOpenPermissionsModal={() => setIsPermissionsModalOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Mobile App 3D Floating Glass Dock (Bottom Navigation) */}
      <nav className="sm:hidden fixed bottom-2.5 left-2.5 right-2.5 z-40 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800/90 px-2 py-1.5 flex items-center justify-around dock-3d">
        <button
          type="button"
          onClick={() => setActiveTab('downloader')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all duration-150 ${
            activeTab === 'downloader'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-t border-white/25 shadow-[0_3px_0_rgb(76,29,149)] -translate-y-0.5'
              : 'text-slate-500 dark:text-slate-400 active:translate-y-[2px]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="truncate max-w-[68px]">{t.tabDownloader}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('downloads')}
          className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all duration-150 ${
            activeTab === 'downloads'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-t border-white/25 shadow-[0_3px_0_rgb(76,29,149)] -translate-y-0.5'
              : 'text-slate-500 dark:text-slate-400 active:translate-y-[2px]'
          }`}
        >
          <Download className="w-4 h-4" />
          <span className="truncate max-w-[68px]">{t.tabDownloads}</span>
          {activeDownloadsCount > 0 && (
            <span className="absolute top-1 right-1.5 w-2.5 h-2.5 rounded-full dot-3d-amber animate-ping" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all duration-150 ${
            activeTab === 'library'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-t border-white/25 shadow-[0_3px_0_rgb(76,29,149)] -translate-y-0.5'
              : 'text-slate-500 dark:text-slate-400 active:translate-y-[2px]'
          }`}
        >
          <Film className="w-4 h-4" />
          <span className="truncate max-w-[78px]">{settings.language === 'fa' ? 'پوشه دانلودها' : 'Library'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all duration-150 ${
            activeTab === 'settings'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-t border-white/25 shadow-[0_3px_0_rgb(76,29,149)] -translate-y-0.5'
              : 'text-slate-500 dark:text-slate-400 active:translate-y-[2px]'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="truncate max-w-[68px]">{t.tabSettings}</span>
        </button>
      </nav>

      {/* Modals & Overlays */}
      <MediaResultModal
        language={settings.language}
        media={parsedMedia}
        onClose={() => setParsedMedia(null)}
        onStartDownload={handleStartDownload}
      />

      <BuiltInMediaPlayer
        language={settings.language}
        task={activePlayerTask}
        onClose={() => setActivePlayerTask(null)}
        onSaveToDisk={handleSaveToDisk}
      />

      <AuthModal
        language={settings.language}
        isOpen={isAuthModalOpen}
        userSession={userSession}
        onClose={() => setIsAuthModalOpen(false)}
        onUpdateSession={setUserSession}
      />

      <ProUpgradeModal
        language={settings.language}
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        onSuccess={(updatedQuota, customMessage) => {
          setQuotaInfo(updatedQuota);
          setCoinsBalance(getCoinsBalance());
          setToastNotice({
            type: 'success',
            title: settings.language === 'fa' ? 'ارتقای سهمیه انجام شد!' : 'Quota Upgraded!',
            message:
              customMessage ||
              (settings.language === 'fa'
                ? 'اشتراک VIP Pro فعال گردید و اکنون نامحدود هستید.'
                : 'Unlimited downloads enabled.')
          });
          setTimeout(() => setToastNotice(null), 4500);
        }}
      />

      <IOSInstallGuide
        language={settings.language}
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
        onTriggerInstall={triggerInstall}
      />

      <ShareAppModal
        language={settings.language}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

      <PermissionsDisclosureModal
        language={settings.language}
        isOpen={isPermissionsModalOpen}
        onAccept={() => setIsPermissionsModalOpen(false)}
      />

      <OfflineBanner
        language={settings.language}
        isOnline={isOnline}
      />

      {/* Direct Device Storage Save Notification Toast */}
      {toastNotice && (
        <div className={`fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 max-w-md rounded-2xl text-white p-4 shadow-2xl flex items-center gap-3 border animate-bounce-subtle ${
          toastNotice.type === 'error'
            ? 'bg-rose-600 border-rose-400/40 shadow-rose-900/40'
            : toastNotice.type === 'info'
            ? 'bg-indigo-600 border-indigo-400/40 shadow-indigo-900/40'
            : 'bg-emerald-600 border-emerald-400/40 shadow-emerald-900/40'
        }`}>
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            {toastNotice.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-white" />
            ) : toastNotice.type === 'info' ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-xs sm:text-sm">
              {toastNotice.title}
            </h4>
            <p className="text-[11px] text-white/90 font-mono truncate">
              {toastNotice.message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
