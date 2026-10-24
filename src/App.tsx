import React, { useEffect, useState } from 'react';
import {
  AppSettings,
  DownloadTask,
  FormatOption,
  ParsedMediaInfo,
  UserSession
} from './types';
import { getTranslation } from './i18n/translations';
import {
  extractUrlFromText,
  isSupportedMediaUrl,
  isValidHttpUrl,
  parseMediaUrl
} from './services/platformDetector';
import { downloadEngine } from './services/downloadEngine';
import {
  clearAllIDBBlobs,
  deleteMediaBlobFromIDB,
  DEFAULT_SETTINGS,
  loadSettingsFromStorage,
  loadSessionFromIDB,
  loadSessionFromStorage,
  loadTasksFromStorage,
  resetUserSessionAndClearAllData,
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
import { TrendingShowcase } from './components/TrendingShowcase';
import { PermissionsDisclosureModal, PERMISSIONS_DISCLOSURE_STORAGE_KEY } from './components/PermissionsDisclosureModal';
import { InAppUpdateModal, CURRENT_APP_VERSION } from './components/InAppUpdateModal';
import { CoinRewardAnimation } from './components/CoinRewardAnimation';
import { ODLogo } from './components/ODLogo';
import {
  getOrCreateDeviceId,
  restoreHardwareIdFromIndexedDB,
  shareAppToFriends
} from './services/deviceService';
import {
  canDownload,
  claimRewardAction,
  consumeDownloadQuota,
  DEFAULT_LOCK_PASSWORD,
  getCoinsBalance,
  getDailyQuota,
  getMyReferralCode,
  isAppLockEnabled,
  MASTER_KEYWORD,
  QuotaInfo,
  resetUserAccountAndQuotaToGuest,
  subscribeQuotaAndCoins,
  syncReferralFromCloud,
  verifyAppLockPinOrKeyword
} from './services/quotaService';
import { Download, Film, Settings, Sparkles, AlertCircle, Loader2, CheckCircle, Crown, Lock, KeyRound } from 'lucide-react';

interface ToastNotice {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

const UPDATE_DISMISSED_SESSION_KEY = 'onedownload_update_dismissed_session_v1';

export default function App() {
  // 1.5-second sleek dark 3D Splash Screen on startup
  const [isSplashVisible, setIsSplashVisible] = useState<boolean>(true);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettingsFromStorage());
  const [userSession, setUserSession] = useState<UserSession>(() => loadSessionFromStorage());
  const [tasks, setTasks] = useState<DownloadTask[]>(() => loadTasksFromStorage());
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo>(() => getDailyQuota());
  const [coinsBalance, setCoinsBalance] = useState<number>(() => getCoinsBalance());

  // App Security Lock State (Default PIN: 12345678 | Master Keyword: onedownload)
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => isAppLockEnabled());
  const [lockInput, setLockInput] = useState<string>('');
  const [lockError, setLockError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'downloader' | 'downloads' | 'library' | 'settings'>('downloader');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [customFileName, setCustomFileName] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [parsedMedia, setParsedMedia] = useState<ParsedMediaInfo | null>(null);
  const [activePlayerTask, setActivePlayerTask] = useState<DownloadTask | null>(null);
  // Persistent Login: Skip Auth screen on startup if user is already logged in (od_user_session)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => !loadSessionFromStorage().isLoggedIn);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [latestServerVersion, setLatestServerVersion] = useState<string>('2.7.0');
  // First-Launch Privacy & Permission Notice Modal: Shown automatically on first launch until accepted
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
  const isFa = settings.language === 'fa';
  const isAr = settings.language === 'ar';
  const isRtl = isFa || isAr;

  // 1.5s Splash Screen Timer + Permanent Hardware ID Restore + Cloud Referral Sync + Version Check
  useEffect(() => {
    const splashTimer = window.setTimeout(() => {
      setIsSplashVisible(false);
    }, 1500);

    restoreHardwareIdFromIndexedDB().then(() => {
      getOrCreateDeviceId();
      syncReferralFromCloud().then((res) => {
        setQuotaInfo(getDailyQuota());
        if (res.autoActivatedVip) {
          setToastNotice({
            type: 'success',
            title: isFa
              ? '🎉 تبریک! ۱ ماه اشتراک VIP رایگان فعال شد!'
              : isAr
              ? '🎉 مبروك! تم تفعيل اشتراك VIP لمدة شهر مجاناً!'
              : '🎉 Congrats! 1-Month Free VIP Activated!',
            message: isFa
              ? '۳ دعوت موفق با کد معرف شما ثبت شد و اشتراک VIP یک‌ماهه به صورت خودکار فعال گردید.'
              : isAr
              ? 'تم تسجيل ٣ دعوات ناجحة بكود الإحالة الخاص بك وتفعيل VIP تلقائياً.'
              : '3 successful referrals reached! Your 1-Month VIP subscription is now active.'
          });
          setTimeout(() => setToastNotice(null), 6500);
        }
      });
    });

    // Check server version for In-App Update popup
    fetch('/api/app/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.latestVersion && data.latestVersion !== CURRENT_APP_VERSION) {
          setLatestServerVersion(data.latestVersion);
          const dismissed = sessionStorage.getItem(UPDATE_DISMISSED_SESSION_KEY) === 'true';
          if (!dismissed) {
            setTimeout(() => setIsUpdateModalOpen(true), 2200);
          }
        }
      })
      .catch(() => {
        // Ignore offline version check
      });

    return () => window.clearTimeout(splashTimer);
  }, []);

  // Restore session from IndexedDB on mount if localStorage was cleared
  useEffect(() => {
    if (!userSession.isLoggedIn) {
      loadSessionFromIDB().then((idbSession) => {
        if (idbSession && idbSession.isLoggedIn) {
          setUserSession(idbSession);
          setIsAuthModalOpen(false);
        }
      });
    }
  }, []);

  // Sync theme class & direction (RTL for both Persian & Arabic)
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    root.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    root.setAttribute('lang', settings.language);
  }, [settings.theme, settings.language, isRtl]);

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

      // Smart Notifications: Notify on download completion
      if (updatedTask.status === 'completed') {
        const smartNotifyEnabled = localStorage.getItem('onedownload_smart_notifications_v1') !== 'false';
        if (smartNotifyEnabled) {
          setToastNotice({
            type: 'success',
            title: isFa
              ? '🔔 دانلود با موفقیت تکمیل شد!'
              : isAr
              ? '🔔 اكتمل التحميل بنجاح!'
              : '🔔 Download Completed!',
            message: updatedTask.fileName
          });
          setTimeout(() => setToastNotice(null), 4500);
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(
                isFa ? 'وان دانلود (OneDownload)' : 'OneDownload',
                {
                  body: isFa
                    ? `فایل «${updatedTask.fileName}» با موفقیت دانلود شد.`
                    : isAr
                    ? `تم تحميل الملف "${updatedTask.fileName}" بنجاح.`
                    : `"${updatedTask.fileName}" finished downloading.`
                }
              );
            }
          } catch {
            // Ignore browser Notification API errors
          }
        }
      }

      // Auto-save finished task directly to device storage
      if (updatedTask.status === 'completed' && settings.autoSaveToDevice) {
        downloadEngine.saveFileToDisk(updatedTask);
        setToastNotice({
          type: 'success',
          title: isFa
            ? 'فایل در حافظه دستگاه ذخیره شد'
            : isAr
            ? 'تم حفظ الملف في ذاكرة الجهاز'
            : 'File saved to device',
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
  }, [settings.autoPlayAfterDownload, settings.autoSaveToDevice, isFa, isAr]);

  // Web Share Target API: Catch URL shared from external apps (e.g. YouTube, TikTok, Instagram)
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const sharedUrl = searchParams.get('url') || searchParams.get('text') || searchParams.get('title');

      if (sharedUrl) {
        const extracted = extractUrlFromText(sharedUrl);
        if (extracted && isValidHttpUrl(extracted)) {
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

  // Helper to check if a scheduled HH:MM time is due
  const isScheduledTimeDue = (hhmm?: string): boolean => {
    if (!hhmm) return true;
    const now = new Date();
    const currentHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentHm === hhmm;
  };

  // Automatic Sequential Queue Scheduler + Scheduled Download Timer
  useEffect(() => {
    const checkQueueAndSchedule = () => {
      const currentlyDownloading = tasks.filter((t) => t.status === 'downloading');
      if (currentlyDownloading.length === 0) {
        const nextReadyQueued = [...tasks]
          .reverse()
          .find((t) => t.status === 'queued' && (!t.scheduledTime || isScheduledTimeDue(t.scheduledTime)));
        if (nextReadyQueued) {
          downloadEngine.startTask(nextReadyQueued);
        }
      }
    };

    checkQueueAndSchedule();
    const timer = window.setInterval(checkQueueAndSchedule, 5000);
    return () => window.clearInterval(timer);
  }, [tasks]);

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
      language: prev.language === 'fa' ? 'ar' : prev.language === 'ar' ? 'en' : 'fa'
    }));
  };

  const handleDirectShareApp = async () => {
    const code = getMyReferralCode();
    const ok = await shareAppToFriends(code, settings.language);
    if (ok) {
      claimRewardAction('share_app');
    }
  };

  /**
   * Strict URL Validation: Rejects plain text, symbols, or unsupported platforms
   * and shows a clear warning without opening MediaResultModal.
   */
  const handleAnalyze = async (targetUrl?: string) => {
    const rawCandidate = (targetUrl ?? inputUrl).trim();
    if (!rawCandidate || !isValidHttpUrl(rawCandidate)) {
      setToastNotice({
        type: 'error',
        title: t.invalidUrlError,
        message: isFa
          ? 'لینک باید با https:// یا http:// شروع شود'
          : isAr
          ? 'يجب أن يبدأ الرابط بـ https:// أو http://'
          : 'URL must start with https:// or http://'
      });
      setTimeout(() => setToastNotice(null), 3500);
      return;
    }

    const cleanUrl = extractUrlFromText(rawCandidate) || rawCandidate;

    if (!isSupportedMediaUrl(cleanUrl)) {
      setToastNotice({
        type: 'error',
        title: isFa
          ? 'این پلتفرم پشتیبانی نمی‌شود'
          : isAr
          ? 'هذه المنصة غير مدعومة'
          : 'This platform is not supported',
        message: isFa
          ? 'لطفاً لینک ویدیو یا موزیک از پلتفرم‌های مجاز (اینستاگرام، یوتیوب، آپارات، تیک‌تاک و...) وارد نمایید.'
          : isAr
          ? 'يرجى إدخال رابط فيديو أو موسيقى من المنصات المدعومة.'
          : 'Please enter a video or audio link from supported platforms (YouTube, Instagram, TikTok, Aparat, etc.).'
      });
      setTimeout(() => setToastNotice(null), 4500);
      return;
    }

    if (!navigator.onLine) {
      setToastNotice({
        type: 'error',
        title: isFa
          ? 'خطای اتصال اینترنت یا فیلترشکن (VPN)'
          : isAr
          ? 'خطأ في الاتصال بالإنترنت أو VPN'
          : 'Network or VPN Connection Error',
        message: isFa
          ? 'اینترنت قطع است؛ لطفاً اتصال شبکه یا وضعیت فیلترشکن (VPN) خود را بررسی کنید.'
          : isAr
          ? 'يرجى التحقق من اتصال الإنترنت أو تفعيل VPN والمحاولة مجدداً.'
          : 'Please check your internet connection or VPN status and try again.'
      });
      setTimeout(() => setToastNotice(null), 4500);
      return;
    }

    // Automatically clear the URL input box immediately so it is ready for the next link
    setInputUrl('');
    setIsAnalyzing(true);
    try {
      const media = await parseMediaUrl(cleanUrl);
      setParsedMedia(media);
    } catch (err) {
      console.error('Failed to parse media URL:', err);
      setToastNotice({
        type: 'error',
        title: isFa
          ? 'کندی شبکه یا عدم اتصال VPN'
          : isAr
          ? 'بطء الشبكة أو عدم اتصال VPN'
          : 'Slow Network or VPN Disconnected',
        message: isFa
          ? 'پاسخی از سرور دریافت نشد؛ برای پلتفرم‌های خارجی (یوتیوب/اینستاگرام) وضعیت فیلترشکن خود را بررسی نمایید.'
          : isAr
          ? 'تعذر الوصول للخادم؛ يرجى التحقق من سرعة الإنترنت أو VPN.'
          : 'Could not reach media server; please check your internet speed or VPN connection.'
      });
      setTimeout(() => setToastNotice(null), 5000);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartDownload = (
    media: ParsedMediaInfo,
    format: FormatOption,
    modalScheduledTime?: string
  ) => {
    // 0. Enforce mandatory simple registration (email + password) for download access
    if (!userSession.isLoggedIn) {
      setIsAuthModalOpen(true);
      setToastNotice({
        type: 'info',
        title: isFa
          ? 'ثبت‌نام ساده برای دانلود الزامی است'
          : isAr
          ? 'التسجيل السريع مطلوب للتحميل'
          : 'Registration Required to Download',
        message: isFa
          ? 'لطفاً با ایمیل و رمز عبور خود ثبت‌نام کنید یا وارد شوید'
          : isAr
          ? 'يرجى التسجيل أو تسجيل الدخول بالبريد الإلكتروني وكلمة المرور'
          : 'Please register or sign in with your email and password'
      });
      setTimeout(() => setToastNotice(null), 5000);
      return;
    }

    // 1. Enforce daily quota (3 free downloads/day; extra download costs 5 coins)
    if (!canDownload() && getCoinsBalance() < 5) {
      setIsUpgradeModalOpen(true);
      setToastNotice({
        type: 'error',
        title: isFa
          ? 'سهمیه ۳ دانلود رایگان روزانه به پایان رسید!'
          : isAr
          ? 'انتهت الحصة اليومية المجانية (٣ تحميلات)!'
          : '3 Daily Free Downloads Used!',
        message: isFa
          ? 'هر دانلود اضافه نیازمند ۵ سکه است؛ سکه دریافت کنید یا اشتراک VIP فعال نمایید'
          : isAr
          ? 'كل تحميل إضافي يتطلب ٥ عملات، أو قم بتفعيل اشتراك VIP'
          : 'Each extra download requires 5 coins, or upgrade to VIP Pro'
      });
      setTimeout(() => setToastNotice(null), 5000);
      return;
    }

    // 2. Consume 1 quota count (or auto-deduct 5 coins if 3 free downloads are used)
    const { quota, autoDeductedCoins } = consumeDownloadQuota();
    setQuotaInfo(quota);
    setCoinsBalance(getCoinsBalance());

    if (autoDeductedCoins > 0) {
      setToastNotice({
        type: 'info',
        title: isFa
          ? '۵ سکه بابت دانلود اضافه کسر شد'
          : isAr
          ? 'تم خصم ٥ عملات للتحميل الإضافي'
          : '5 Coins deducted for extra download',
        message: isFa
          ? `موجودی فعلی سکه: ${getCoinsBalance()} سکه`
          : isAr
          ? `الرصيد المتبقي: ${getCoinsBalance()} عملة`
          : `Remaining balance: ${getCoinsBalance()} Coins`
      });
      setTimeout(() => setToastNotice(null), 4000);
    }

    const finalMedia: ParsedMediaInfo = customFileName.trim()
      ? { ...media, title: customFileName.trim() }
      : media;

    const finalSchedule = modalScheduledTime || scheduledTime || undefined;
    const newTask = downloadEngine.createTask(finalMedia, format, finalSchedule);
    setInputUrl('');
    setCustomFileName('');
    setScheduledTime('');

    const hasActiveDownload = tasks.some((t) => t.status === 'downloading');
    setTasks((prev) => [newTask, ...prev]);

    if (finalSchedule && !isScheduledTimeDue(finalSchedule)) {
      setToastNotice({
        type: 'info',
        title: isFa
          ? `⏰ دانلود برای ساعت ${finalSchedule} زمان‌بندی شد`
          : isAr
          ? `⏰ تمت جدولة التحميل للساعة ${finalSchedule}`
          : `⏰ Download scheduled for ${finalSchedule}`,
        message: newTask.fileName
      });
      setTimeout(() => setToastNotice(null), 4500);
    } else if (!hasActiveDownload) {
      downloadEngine.startTask(newTask);
    }

    setActiveTab('downloads');
  };

  const handleStartBatchDownload = async (
    urls: string[],
    qualityPreset: '1080p' | '720p' | 'mp3'
  ) => {
    if (!userSession.isLoggedIn) {
      setIsAuthModalOpen(true);
      setToastNotice({
        type: 'info',
        title: isFa
          ? 'ثبت‌نام ساده برای دانلود الزامی است'
          : isAr
          ? 'التسجيل السريع مطلوب للتحميل'
          : 'Registration Required to Download',
        message: isFa
          ? 'لطفاً با ایمیل و رمز عبور خود ثبت‌نام کنید یا وارد شوید'
          : isAr
          ? 'يرجى التسجيل أو تسجيل الدخول بالبريد الإلكتروني وكلمة المرور'
          : 'Please register or sign in with your email and password'
      });
      setTimeout(() => setToastNotice(null), 5000);
      return;
    }

    if (!canDownload() && getCoinsBalance() < 5) {
      setIsUpgradeModalOpen(true);
      setToastNotice({
        type: 'error',
        title: isFa
          ? 'سهمیه ۳ دانلود رایگان روزانه تکمیل شده است!'
          : isAr
          ? 'انتهت الحصة اليومية المجانية!'
          : '3 Daily Free Downloads Reached!',
        message: isFa
          ? 'هر دانلود اضافه ۵ سکه کسر می‌کند؛ سکه دریافت کنید یا اشتراک VIP فعال نمایید'
          : isAr
          ? 'كل تحميل إضافي يخصم ٥ عملات أو قم بالترقية إلى VIP'
          : 'Extra download costs 5 coins or upgrade to VIP Pro'
      });
      setTimeout(() => setToastNotice(null), 5000);
      return;
    }

    const { quota } = consumeDownloadQuota();
    setQuotaInfo(quota);
    setCoinsBalance(getCoinsBalance());

    setToastNotice({
      type: 'info',
      title: isFa
        ? `در حال افزودن ${urls.length} لینک به صف دانلود نوبتی...`
        : isAr
        ? `جاري إضافة ${urls.length} روابط إلى قائمة التحميل...`
        : `Adding ${urls.length} links to batch queue...`,
      message: qualityPreset.toUpperCase()
    });

    const createdTasks: DownloadTask[] = [];
    for (const rawUrl of urls) {
      if (!isValidHttpUrl(rawUrl)) continue;
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
        title: isFa
          ? `${createdTasks.length} فایل به صف دانلود نوبتی اضافه شد!`
          : isAr
          ? `تمت إضافة ${createdTasks.length} ملفات إلى قائمة الانتظار!`
          : `${createdTasks.length} files added to sequential queue!`,
        message: isFa
          ? 'دانلودها به نوبت و خودکار انجام می‌شوند'
          : isAr
          ? 'سيتم التحميل بالتتابع تلقائياً'
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
      title: isFa ? 'در حال آماده‌سازی فایل...' : isAr ? 'جاري تجهيز الملف...' : 'Preparing file...',
      message: task.fileName
    });
    const success = await downloadEngine.saveFileToDisk(task, (msg) => {
      setToastNotice({
        type: 'info',
        title: isFa ? 'در حال انتقال به حافظه...' : isAr ? 'جاري الحفظ في الجهاز...' : 'Saving to storage...',
        message: msg
      });
    });
    if (success) {
      setToastNotice({
        type: 'success',
        title: isFa ? 'فایل با موفقیت ذخیره شد!' : isAr ? 'تم حفظ الملف بنجاح!' : 'File successfully saved!',
        message: task.fileName
      });
    } else {
      setToastNotice({
        type: 'error',
        title: isFa ? 'خطا در ذخیره‌سازی فایل' : isAr ? 'خطأ في حفظ الملف' : 'Failed to save file',
        message: isFa
          ? 'لطفاً وضعیت اتصال را بررسی کرده و مجدد امتحان کنید'
          : isAr
          ? 'يرجى التحقق من الاتصال والمحاولة مرة أخرى'
          : 'Please check connection and retry'
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
    const permanentHwId = getOrCreateDeviceId();
    const permanentRefCode = getMyReferralCode();
    localStorage.clear();
    try {
      localStorage.setItem('onedownload_hardware_device_id_v1', permanentHwId);
      localStorage.setItem('onedownload_my_random_ref_code_v1', permanentRefCode);
    } catch {
      // ignore
    }
    setSettings(DEFAULT_SETTINGS);
  };

  /**
   * Complete Logout & State Reset:
   * Cancels active downloads, clears session, tasks, IndexedDB blobs, and resets coins to 0.
   */
  const handleCompleteLogout = async (keepModalOpen = true) => {
    tasks.forEach((t) => downloadEngine.cancelTask(t));
    setTasks([]);
    setParsedMedia(null);
    setActivePlayerTask(null);
    setInputUrl('');
    setCustomFileName('');
    setScheduledTime('');
    resetUserAccountAndQuotaToGuest();
    setCoinsBalance(0);
    setQuotaInfo(getDailyQuota());
    setActiveTab('downloader');
    setIsAuthModalOpen(keepModalOpen);
    const freshGuest = await resetUserSessionAndClearAllData(settings.language);
    setUserSession(freshGuest);
  };

  const handleUnlockAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLockError(null);
    if (verifyAppLockPinOrKeyword(lockInput)) {
      setIsAppLocked(false);
      setLockInput('');
    } else {
      setLockError(
        isFa
          ? `رمز واردشده نادرست است! (رمز پیش‌فرض: ${DEFAULT_LOCK_PASSWORD} یا کیورد: ${MASTER_KEYWORD})`
          : isAr
          ? `الرمز غير صحيح! (الرمز الافتراضي: ${DEFAULT_LOCK_PASSWORD} أو الكلمة المفتاحية: ${MASTER_KEYWORD})`
          : `Incorrect PIN! (Default: ${DEFAULT_LOCK_PASSWORD} or Keyword: ${MASTER_KEYWORD})`
      );
    }
  };

  const activeDownloadsCount = tasks.filter(
    (t) => t.status === 'downloading' || t.status === 'queued'
  ).length;
  const completedLibraryCount = tasks.filter((t) => t.status === 'completed').length;

  // 1.5-Second Sleek Dark 3D Splash Screen on App Startup
  if (isSplashVisible) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center text-center space-y-5 animate-fade-in">
          <div className="p-4 rounded-3xl bg-slate-900/90 border border-indigo-500/40 shadow-2xl shadow-indigo-500/25 card-3d animate-bounce-subtle">
            <ODLogo className="w-20 h-20 sm:w-24 sm:h-24" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white text-3d" dir="ltr">
              OneDownload
            </h1>
            <p className="text-xs sm:text-sm font-extrabold text-indigo-300">
              {isFa
                ? 'وان دانلود • دانلودر فوق‌سریع ویدیو و موزیک 4K'
                : isAr
                ? 'وان داونلود • أسرع برنامج لتحميل الفيديو والموسيقى 4K'
                : 'Ultra-Fast 4K Video & Music Downloader'}
            </p>
          </div>
          <div className="w-44 h-1.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
            <div className="h-full w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-amber-400 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Startup App Security Lock Screen (when enabled in Settings)
  if (isAppLocked) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 text-white">
        <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-indigo-500/40 p-6 card-3d text-center space-y-4">
          <div className="flex justify-center">
            <ODLogo className="w-16 h-16" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">
              {t.appTitle}
            </h1>
            <p className="text-xs text-amber-400 font-bold mt-1 flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>{t.appLockTitle}</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t.appLockEnterPin}
            </p>
          </div>

          {lockError && (
            <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs font-bold">
              {lockError}
            </div>
          )}

          <form onSubmit={handleUnlockAppSubmit} className="space-y-3">
            <div className="relative">
              <KeyRound className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                dir="ltr"
                autoFocus
                value={lockInput}
                onChange={(e) => setLockInput(e.target.value)}
                placeholder={`${DEFAULT_LOCK_PASSWORD} / ${MASTER_KEYWORD}`}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-center text-sm font-mono font-black tracking-widest text-white focus:outline-none focus:border-amber-400 input-3d"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-sm btn-3d-amber"
            >
              {t.appLockUnlockBtn}
            </button>
          </form>
        </div>
      </div>
    );
  }

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
        onOpenShare={handleDirectShareApp}
      />

      {/* Main Content Area */}
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
                title={isFa ? 'مشاهده سهمیه روزانه و ارتقا' : 'Daily Quota & VIP'}
              >
                <Crown className="w-3.5 h-3.5 fill-current" />
                <span>
                  {quotaInfo.isPro
                    ? isFa
                      ? 'VIP فعال (دسترسی نامحدود)'
                      : isAr
                      ? 'VIP نشط (غير محدود)'
                      : 'VIP Active (Unlimited)'
                    : isFa
                    ? `${quotaInfo.remainingToday} از ${quotaInfo.maxDaily} دانلود`
                    : isAr
                    ? `${quotaInfo.remainingToday} من ${quotaInfo.maxDaily} تحميلات`
                    : `${quotaInfo.remainingToday}/${quotaInfo.maxDaily} downloads`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: URL Downloader + Coin Rewards & Latest 2 Files */}
        {activeTab === 'downloader' && (
          <div className="animate-fade-in">
            <UrlInputSection
              language={settings.language}
              url={inputUrl}
              setUrl={setInputUrl}
              customFileName={customFileName}
              setCustomFileName={setCustomFileName}
              scheduledTime={scheduledTime}
              setScheduledTime={setScheduledTime}
              isLoading={isAnalyzing}
              onAnalyze={handleAnalyze}
              onStartBatchDownload={handleStartBatchDownload}
              sharedLinkNotice={sharedLinkNotice}
              autoSniffClipboard={settings.autoSniffClipboard}
              tasks={tasks}
            />

            <TrendingShowcase
              language={settings.language}
              recentTasks={tasks}
              onPlayItem={handlePlayMedia}
              onOpenViewAllDownloads={() => setActiveTab('downloads')}
              onOpenShare={handleDirectShareApp}
              onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
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
              onBackToHome={() => setActiveTab('downloader')}
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
              onBackToHome={() => setActiveTab('downloader')}
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
              onOpenShare={handleDirectShareApp}
              onOpenPermissionsModal={() => setIsPermissionsModalOpen(true)}
              onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
              onBackToHome={() => setActiveTab('downloader')}
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
          <span className="truncate max-w-[78px]">
            {isFa ? 'پوشه دانلودها' : isAr ? 'المجلدات' : 'Library'}
          </span>
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
        initialCustomFileName={customFileName}
        initialScheduledTime={scheduledTime}
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
        session={userSession}
        onClose={() => setIsAuthModalOpen(false)}
        onUpdateSession={setUserSession}
        onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
        onLogout={handleCompleteLogout}
        onSelectLanguage={(newLang) =>
          setSettings((prev) => ({
            ...prev,
            language: newLang
          }))
        }
        onAuthSuccess={() => {
          setToastNotice({
            type: 'success',
            title: isFa
              ? 'خوش آمدید! ورود با موفقیت انجام شد.'
              : isAr
              ? 'أهلاً بك! تم تسجيل الدخول بنجاح.'
              : 'Welcome! Logged in successfully.',
            message: isFa
              ? 'دسترسی دانلود و امکانات حساب شما فعال است'
              : isAr
              ? 'تم تفعيل حسابك وصلاحية التحميل بنجاح'
              : 'Your account and download access are now active'
          });
          setTimeout(() => setToastNotice(null), 4500);
        }}
      />

      <ProUpgradeModal
        language={settings.language}
        userCountry={userSession.user.country}
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        onOpenAuthReferral={() => setIsAuthModalOpen(true)}
        onSuccess={(updatedQuota, customMessage) => {
          setQuotaInfo(updatedQuota);
          setCoinsBalance(getCoinsBalance());
          setToastNotice({
            type: 'success',
            title: isFa ? 'عملیات با موفقیت انجام شد!' : isAr ? 'تمت العملية بنجاح!' : 'Success!',
            message:
              customMessage ||
              (isFa
                ? 'اشتراک VIP Pro فعال گردید و اکنون نامحدود هستید.'
                : isAr
                ? 'تم تفعيل اشتراك VIP غير المحدود بنجاح.'
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

      <PermissionsDisclosureModal
        language={settings.language}
        isOpen={isPermissionsModalOpen}
        onAccept={() => setIsPermissionsModalOpen(false)}
      />

      <InAppUpdateModal
        language={settings.language}
        isOpen={isUpdateModalOpen}
        currentVersion={CURRENT_APP_VERSION}
        latestVersion={latestServerVersion}
        onClose={() => {
          try {
            sessionStorage.setItem(UPDATE_DISMISSED_SESSION_KEY, 'true');
          } catch {
            // ignore
          }
          setIsUpdateModalOpen(false);
        }}
      />

      <CoinRewardAnimation language={settings.language} />

      <OfflineBanner
        language={settings.language}
        isOnline={isOnline}
      />

      {/* Top Notification Toast (Welcome on Login/Register + Device Storage Save Notices) */}
      {toastNotice && (
        <div className={`fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-2xl text-white p-4 shadow-2xl flex items-center gap-3 border animate-bounce-subtle ${
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
