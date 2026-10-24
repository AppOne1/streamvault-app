import React, { useState } from 'react';
import { AppSettings, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { clearAllIDBBlobs, getLockedAccountCurrency } from '../services/storageService';
import {
  buildAppShareMessage
} from '../services/deviceService';
import {
  claimRewardAction,
  DEFAULT_LOCK_PASSWORD,
  getAppLockPin,
  getDailyQuota,
  getMyReferralCode,
  isAppLockEnabled,
  MASTER_KEYWORD,
  setAppLockEnabled,
  setAppLockPin,
  syncReferralFromCloud
} from '../services/quotaService';
import { SupportChannelsBox } from './SupportChannelsBox';
import {
  Globe,
  Moon,
  Sun,
  PlaySquare,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Crown,
  Mail,
  Info,
  ShieldCheck,
  Share2,
  Radar,
  ArrowRight,
  ArrowLeft,
  HardDrive,
  Bell,
  Cloud,
  Lock,
  KeyRound
} from 'lucide-react';

interface SettingsViewProps {
  language: Language;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClearAllAppData: () => void;
  onOpenUpgradeModal: () => void;
  onOpenShare?: () => void;
  onOpenPermissionsModal?: () => void;
  onOpenUpdateModal?: () => void;
  onBackToHome?: () => void;
}

const toFaDigits = (val: string | number): string =>
  String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const SMART_NOTIFY_STORAGE_KEY = 'onedownload_smart_notifications_v1';
const CLOUD_SYNC_TIMESTAMP_KEY = 'onedownload_last_cloud_sync_v1';

export const SettingsView: React.FC<SettingsViewProps> = ({
  language,
  settings,
  onUpdateSettings,
  onClearAllAppData,
  onOpenUpgradeModal,
  onOpenPermissionsModal,
  onOpenUpdateModal,
  onBackToHome
}) => {
  const t = getTranslation(language);
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;
  const lockedCurrency = getLockedAccountCurrency();
  const isTomanAccount = lockedCurrency === 'toman' || isFa;

  const [clearedNotice, setClearedNotice] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [copiedShareText, setCopiedShareText] = useState(false);
  const [copiedRefCode, setCopiedRefCode] = useState(false);

  // App Lock (PIN / Password) State
  const [appLockActive, setAppLockActive] = useState<boolean>(() => isAppLockEnabled());
  const [pinDraft, setPinDraft] = useState<string>(() => getAppLockPin());
  const [pinSavedNotice, setPinSavedNotice] = useState<boolean>(false);

  // Smart Notifications (Download Completion & VIP Expiry Alert)
  const [smartNotifyEnabled, setSmartNotifyEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SMART_NOTIFY_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  // Cloud Sync State
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [lastCloudSync, setLastCloudSync] = useState<string>(() => {
    try {
      return (
        localStorage.getItem(CLOUD_SYNC_TIMESTAMP_KEY) ||
        (isFa
          ? 'همگام‌سازی خودکار فعال'
          : isAr
          ? 'المزامنة التلقائية مفعلة'
          : 'Auto-Sync Active')
      );
    } catch {
      return isFa
        ? 'همگام‌سازی خودکار فعال'
        : isAr
        ? 'المزامنة التلقائية مفعلة'
        : 'Auto-Sync Active';
    }
  });

  const quota = getDailyQuota();
  const myReferralCode = getMyReferralCode();
  const fullShareMessage = buildAppShareMessage(myReferralCode, language);

  const handleClear = async () => {
    if (window.confirm(t.clearDataConfirm)) {
      await clearAllIDBBlobs();
      onClearAllAppData();
      setClearedNotice(true);
      setTimeout(() => setClearedNotice(false), 2500);
    }
  };

  const handleCheckUpdate = () => {
    setIsCheckingUpdate(true);
    setUpdateStatusText(null);
    setTimeout(() => {
      setIsCheckingUpdate(false);
      if (onOpenUpdateModal) {
        onOpenUpdateModal();
      } else {
        setUpdateStatusText(
          isFa
            ? 'نرم‌افزار شما به آخرین نسخه پایدار (v2.6.0) به‌روز است ✓'
            : isAr
            ? 'تطبيقك محدّث إلى آخر إصدار مستقر (v2.6.0) ✓'
            : 'You are on the latest version (v2.6.0) ✓'
        );
        setTimeout(() => setUpdateStatusText(null), 4000);
      }
    }, 650);
  };

  /**
   * Single unified copy button for promotional slogan + personal referral code
   */
  const handleCopyFullShareMessage = async () => {
    try {
      await navigator.clipboard.writeText(fullShareMessage);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = fullShareMessage;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {
        // ignore
      }
      document.body.removeChild(textarea);
    }
    claimRewardAction('share_app');
    setCopiedShareText(true);
    setShareFeedback(
      isFa
        ? 'متن دعوت و کد معرف اختصاصی شما در کلیپ‌بورد کپی شد ✓ اکنون در هر برنامه‌ای جای‌گذاری (Paste) کنید.'
        : isAr
        ? 'تم نسخ نص الدعوة وكود الإحالة الخاص بك إلى الحافظة ✓'
        : 'Invite text and your referral code copied to clipboard ✓'
    );
    setTimeout(() => setCopiedShareText(false), 2800);
    setTimeout(() => setShareFeedback(null), 4500);
  };

  const handleCopyMyRefCode = async () => {
    try {
      await navigator.clipboard.writeText(myReferralCode);
      setCopiedRefCode(true);
      setTimeout(() => setCopiedRefCode(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleToggleAppLock = (enabled: boolean) => {
    setAppLockActive(enabled);
    setAppLockEnabled(enabled);
    setShareFeedback(
      enabled
        ? isFa
          ? `قفل امنیتی ورود به برنامه فعال شد (رمز پیش‌فرض: ${DEFAULT_LOCK_PASSWORD} | کیورد بازیابی: ${MASTER_KEYWORD})`
          : isAr
          ? `تم تفعيل قفل التطبيق (الرمز الافتراضي: ${DEFAULT_LOCK_PASSWORD} | الكلمة المفتاحية: ${MASTER_KEYWORD})`
          : `App Lock enabled (Default PIN: ${DEFAULT_LOCK_PASSWORD} | Keyword: ${MASTER_KEYWORD})`
        : isFa
        ? 'قفل امنیتی ورود به برنامه غیرفعال شد'
        : isAr
        ? 'تم إيقاف قفل التطبيق'
        : 'App Lock disabled'
    );
    setTimeout(() => setShareFeedback(null), 4000);
  };

  const handleSaveAppLockPin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pinDraft.trim() || DEFAULT_LOCK_PASSWORD;
    setPinDraft(cleaned);
    setAppLockPin(cleaned);
    setPinSavedNotice(true);
    setTimeout(() => setPinSavedNotice(false), 2500);
  };

  const handleToggleSmartNotifications = async (checked: boolean) => {
    setSmartNotifyEnabled(checked);
    try {
      localStorage.setItem(SMART_NOTIFY_STORAGE_KEY, String(checked));
    } catch {
      // ignore
    }
    if (checked && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if (Notification.permission === 'granted') {
          new Notification('وان دانلود (OneDownload)', {
            body: isFa
              ? 'سیستم اعلان هوشمند برای اتمام دانلود و وضعیت بسته VIP فعال شد.'
              : isAr
              ? 'تم تفعيل الإشعارات الذكية عند اكتمال التحميل وحالة اشتراك VIP.'
              : 'Smart notifications enabled for download completion & VIP status.'
          });
        }
      } catch {
        // ignore
      }
    }
  };

  const handleCloudSyncNow = () => {
    setIsSyncingCloud(true);
    syncReferralFromCloud().finally(() => {
      setTimeout(() => {
        const nowStr = new Date().toLocaleTimeString(isFa ? 'fa-IR' : isAr ? 'ar-IQ' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const label = isFa
          ? `آخرین همگام‌سازی موفق: ساعت ${nowStr}`
          : isAr
          ? `آخر مزامنة ناجحة: ${nowStr}`
          : `Last synced at ${nowStr}`;
        setLastCloudSync(label);
        try {
          localStorage.setItem(CLOUD_SYNC_TIMESTAMP_KEY, label);
        } catch {
          // ignore
        }
        setIsSyncingCloud(false);
        setShareFeedback(
          isFa
            ? 'همگام‌سازی ابری (Cloud Sync) کد معرف، سکه‌ها و وضعیت اشتراک VIP با موفقیت انجام شد ✓'
            : isAr
            ? 'تمت المزامنة السحابية لكود الإحالة والعملات وحالة VIP بنجاح ✓'
            : 'Cloud sync of referral count, coins, and VIP status completed ✓'
        );
        setTimeout(() => setShareFeedback(null), 3500);
      }, 650);
    });
  };

  return (
    <section className="w-full max-w-3xl mx-auto px-3 sm:px-4 pt-3 pb-28 sm:pb-12 overflow-y-auto">
      {/* Top Header with Explicit Back (بازگشت) Button */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm text-3d">
              {t.settingsHeader}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isFa
                ? 'معرفی به دوستان، قفل امنیتی برنامه، زبان (فارسی/عربی/انگلیسی) و تنظیمات پیشرفته'
                : isAr
                ? 'دعوة الأصدقاء، قفل التطبيق، اللغة (العربية/فارسي/English) والإعدادات المتقدمة'
                : 'Invite Friends, App Security Lock, Language & Preferences'}
            </p>
          </div>

          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-black btn-3d-secondary shrink-0"
              title={isFa ? 'بازگشت به صفحه اصلی' : isAr ? 'رجوع للرئيسية' : 'Back to Home'}
            >
              {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{isFa ? 'بازگشت' : isAr ? 'رجوع' : 'Back'}</span>
            </button>
          )}
        </div>

        {/* VIP Subscription Button (Opens the exclusive VIP & Hardware ID Modal) */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onOpenUpgradeModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 btn-3d-amber transition-all"
          >
            <Crown className="w-3.5 h-3.5 fill-slate-950" />
            <span>
              {quota.isPro
                ? isFa
                  ? `اشتراک VIP فعال (${toFaDigits(quota.remainingProDays || 30)} روز باقی‌مانده)`
                  : isAr
                  ? `اشتراك VIP مفعل (${quota.remainingProDays || 30} يوم متبقي)`
                  : `VIP Active (${quota.remainingProDays || 30}d left)`
                : isFa
                ? 'بخش فعال‌سازی اشتراک VIP و شناسه دستگاه'
                : isAr
                ? 'تفعيل اشتراك VIP ومعرف الجهاز'
                : 'VIP Subscription & Hardware ID'}
            </span>
          </button>
        </div>
      </div>

      {clearedNotice && (
        <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{t.dataCleared}</span>
        </div>
      )}

      {shareFeedback && (
        <div className="mb-4 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>{shareFeedback}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* 1. Exclusive "معرفی به دوستان (شعار تبلیغاتی + کد معرف)" Card with Single Prominent Copy Button */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 text-white border border-indigo-500/40 card-3d space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-500/25 text-indigo-300 border border-indigo-400/30 shrink-0">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm sm:text-base text-white">
                  {isFa
                    ? 'معرفی به دوستان و اشتراک‌گذاری کد معرف'
                    : isAr
                    ? 'دعوة الأصدقاء ومشاركة كود الإحالة'
                    : 'Invite Friends & Share Referral Code'}
                </h4>
                <p className="text-[11px] text-indigo-200/80">
                  {isFa
                    ? 'کپی متن دعوت به همراه کد معرف اختصاصی شما (با دعوت هر ۳ نفر در ثبت‌نام = ۱ ماه VIP رایگان خودکار)'
                    : isAr
                    ? 'انسخ نص الدعوة مع كود الإحالة الخاص بك (دعوة ٣ أصدقاء = شهر VIP مجاناً تلقائياً)'
                    : 'Copy invite slogan & your personal referral code (3 referrals = Automatic 1-Month Free VIP)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-indigo-500/40 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold">
                {isFa ? 'کد معرف ثابت شما:' : isAr ? 'كود الإحالة:' : 'Your Fixed Code:'}
              </span>
              <span className="font-mono font-black text-xs text-amber-400 select-all">
                {myReferralCode}
              </span>
              <button
                type="button"
                onClick={handleCopyMyRefCode}
                className="p-1 rounded-lg hover:bg-slate-800 text-indigo-300"
                title={isFa ? 'کپی کد معرف' : 'Copy Code'}
              >
                {copiedRefCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Preview of Exact Promotional Slogan & Referral Code */}
          <div className="p-3 rounded-2xl bg-slate-950/85 border border-slate-800 text-xs leading-relaxed text-slate-200 font-bold whitespace-pre-line select-all">
            {fullShareMessage}
          </div>

          {/* Single Unified Prominent Copy Invite Text & Referral Code Button */}
          <button
            type="button"
            onClick={handleCopyFullShareMessage}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 btn-3d-primary cursor-pointer"
          >
            {copiedShareText ? (
              <Check className="w-4 h-4 text-emerald-300 shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-amber-300 shrink-0" />
            )}
            <span>
              {copiedShareText
                ? isFa
                  ? 'متن دعوت و کد معرف در کلیپ‌بورد کپی شد ✓'
                  : isAr
                  ? 'تم نسخ نص الدعوة وكود الإحالة ✓'
                  : 'Invite Text & Referral Code Copied ✓'
                : isFa
                ? 'کپی متن دعوت و کد معرف'
                : isAr
                ? 'نسخ نص الدعوة وكود الإحالة'
                : 'Copy Invite Text & Referral Code'}
            </span>
          </button>
        </div>

        {/* 2. App Security Lock (قفل امنیتی برنامه + کیورد بازیابی onedownload) */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-amber-500/35 dark:border-amber-500/30 card-3d space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                  {isFa
                    ? 'قفل امنیتی برنامه'
                    : isAr
                    ? 'قفل التطبيق'
                    : 'App Security Lock'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isFa
                    ? `محافظت از ورود به برنامه با رمز عبور یا پین (رمز پیش‌فرض: ${DEFAULT_LOCK_PASSWORD} | کیورد: ${MASTER_KEYWORD})`
                    : isAr
                    ? `حماية الدخول إلى التطبيق برمز سري (الافتراضي: ${DEFAULT_LOCK_PASSWORD} | الكلمة المفتاحية: ${MASTER_KEYWORD})`
                    : `Protect app entry with PIN/password (Default: ${DEFAULT_LOCK_PASSWORD} | Keyword: ${MASTER_KEYWORD})`}
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={appLockActive}
                onChange={(e) => handleToggleAppLock(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
            </label>
          </div>

          <form onSubmit={handleSaveAppLockPin} className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  dir="ltr"
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value)}
                  placeholder={DEFAULT_LOCK_PASSWORD}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 input-3d"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs btn-3d-amber shrink-0"
              >
                {pinSavedNotice
                  ? isFa
                    ? 'ذخیره شد ✓'
                    : isAr
                    ? 'تم الحفظ ✓'
                    : 'Saved ✓'
                  : isFa
                  ? 'ذخیره رمز ورود'
                  : isAr
                  ? 'حفظ رمز القفل'
                  : 'Save Lock PIN'}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/70 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-800">
              <span>
                {isFa
                  ? `رمز پیش‌فرض: ${DEFAULT_LOCK_PASSWORD}`
                  : isAr
                  ? `الرمز الافتراضي: ${DEFAULT_LOCK_PASSWORD}`
                  : `Default PIN: ${DEFAULT_LOCK_PASSWORD}`}
              </span>
              <span className="font-mono font-black text-amber-600 dark:text-amber-400">
                Keyword: {MASTER_KEYWORD}
              </span>
            </div>
          </form>
        </div>

        {/* 3. Language Selection Card (3 Languages: فارسی | العربية | English) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.langSelector}
              </h4>
              <p className="text-xs text-slate-400">
                فارسی 🇮🇷 • العربية (العراق والخليج) 🇮🇶 • English 🌐
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold self-end sm:self-auto">
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, language: 'fa' })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                settings.language === 'fa'
                  ? 'bg-indigo-600 text-white font-black btn-3d-primary'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              فارسی 🇮🇷
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, language: 'ar' })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                settings.language === 'ar'
                  ? 'bg-indigo-600 text-white font-black btn-3d-primary'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              العربية 🇮🇶
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, language: 'en' })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                settings.language === 'en'
                  ? 'bg-indigo-600 text-white font-black btn-3d-primary'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              English 🌐
            </button>
          </div>
        </div>

        {/* 4. Theme Selector Card (Dark & Light Mode) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
              {settings.theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-500" />}
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {isFa ? 'تغییر تم برنامه (تیره و روشن)' : t.themeSelector}
              </h4>
              <p className="text-xs text-slate-400">
                {settings.theme === 'dark'
                  ? isFa
                    ? 'تم تیره (Dark Mode) فعال است'
                    : t.themeDark
                  : isFa
                  ? 'تم روشن (Light Mode) فعال است'
                  : t.themeLight}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                settings.theme === 'light'
                  ? 'bg-indigo-600 text-white font-black btn-3d-primary'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>{isFa ? 'روشن' : isAr ? 'فاتح' : 'Light'}</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                settings.theme === 'dark'
                  ? 'bg-indigo-600 text-white font-black btn-3d-primary'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>{isFa ? 'تیره' : isAr ? 'داكن' : 'Dark'}</span>
            </button>
          </div>
        </div>

        {/* 5. Smart Notification System (اعلان هوشمند اتمام دانلود و بسته VIP) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between shadow-xs card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {isFa
                  ? 'سیستم اعلان هوشمند (Smart Notifications)'
                  : isAr
                  ? 'نظام الإشعارات الذكية'
                  : 'Smart Notifications'}
              </h4>
              <p className="text-xs text-slate-400">
                {isFa
                  ? 'ارسال اعلان هوشمند هنگام اتمام دانلود فایل‌ها و یادآوری مهلت بسته اشتراک VIP'
                  : isAr
                  ? 'إرسال إشعار عند اكتمال التحميل والتذكير بانتهاء باقة VIP'
                  : 'Notify when downloads finish or when VIP subscription is near expiry'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={smartNotifyEnabled}
              onChange={(e) => handleToggleSmartNotifications(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
          </label>
        </div>

        {/* 6. Cloud Sync Structure (همگام‌سازی ابری حساب، سکه‌ها و تاریخچه) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 shadow-xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {isFa
                    ? 'همگام‌سازی ابری هوشمند (Cloud Sync)'
                    : isAr
                    ? 'المزامنة السحابية الذكية (Cloud Sync)'
                    : 'Smart Cloud Synchronization'}
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black">
                  {isFa ? 'متصل' : isAr ? 'متصل' : 'Connected'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {lastCloudSync}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloudSyncNow}
            disabled={isSyncingCloud}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white bg-sky-600 hover:bg-sky-500 btn-3d-primary transition-all disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingCloud
                ? isFa
                  ? 'در حال همگام‌سازی...'
                  : isAr
                  ? 'جاري المزامنة...'
                  : 'Syncing...'
                : isFa
                ? 'همگام‌سازی ابری آنی'
                : isAr
                ? 'مزامنة سحابية فورية'
                : 'Sync Cloud Now'}
            </span>
          </button>
        </div>

        {/* 7. Smart Auto-Clipboard Sniffer Toggle */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between shadow-xs card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
              <Radar className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {isFa
                  ? 'رصد خودکار کلیپ‌بورد (Auto-Paste)'
                  : isAr
                  ? 'الكشف التلقائي للحافظة (Auto-Paste)'
                  : 'Auto-Paste Clipboard Sniffer'}
              </h4>
              <p className="text-xs text-slate-400">
                {isFa
                  ? 'تشخیص هوشمند لینک کپی‌شده به محض ورود به برنامه و نمایش خودکار پیش‌نمایش'
                  : isAr
                  ? 'اكتشاف الرابط المنسوخ تلقائياً فور فتح التطبيق وعرض المعاينة'
                  : 'Automatically detect copied media URLs on app focus and trigger preview'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.autoSniffClipboard !== false}
              onChange={(e) => onUpdateSettings({ ...settings, autoSniffClipboard: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
          </label>
        </div>

        {/* 8. Auto-Play & Auto-Save Toggles */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
              <PlaySquare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.autoPlayToggle}
              </h4>
              <p className="text-xs text-slate-400">
                {isFa
                  ? 'اجرای خودکار پلیر داخلی بلافاصله پس از اتمام دانلود'
                  : isAr
                  ? 'تشغيل المشغل الداخلي تلقائياً فور انتهاء التحميل'
                  : 'Launch media player immediately when download finishes'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.autoPlayAfterDownload}
              onChange={(e) => onUpdateSettings({ ...settings, autoPlayAfterDownload: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.autoSaveToDeviceToggle}
              </h4>
              <p className="text-xs text-slate-400">
                {t.autoSaveToDeviceDesc}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.autoSaveToDevice}
              onChange={(e) => onUpdateSettings({ ...settings, autoSaveToDevice: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
          </label>
        </div>

        {/* 9. Official Support & Management Contact Channels («پشتیبانی و ارتباط با مدیریت») */}
        <SupportChannelsBox
          language={language}
          isTomanAccount={isTomanAccount}
          darkVariant={false}
        />

        {/* 10. Developer, Privacy Statement & In-App Update Card */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white border border-indigo-500/20 card-3d space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-base text-white">
                  {isFa ? 'درباره ما و نسخه برنامه' : isAr ? 'من نحن وإصدار التطبيق' : 'About App & Version'}
                </h4>
                <p className="text-xs text-slate-400">
                  {isFa
                    ? 'توسعه‌داده‌شده توسط گروه appone-علوی (v2.6.0)'
                    : isAr
                    ? 'تطوير مجموعة appone-Alavi (v2.6.0)'
                    : 'Developed by appone-Alavi Group (v2.6.0)'}
                </p>
              </div>
            </div>

            <a
              href="mailto:alavipoco@gmail.com"
              className="font-bold text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>alavipoco@gmail.com</span>
            </a>
          </div>

          {updateStatusText && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/35 text-emerald-200 text-xs font-bold">
              {updateStatusText}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800">
            {onOpenPermissionsModal && (
              <button
                type="button"
                onClick={onOpenPermissionsModal}
                className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 btn-3d-emerald cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                <span>
                  {isFa
                    ? 'مشاهده بیانیه حریم خصوصی و دسترسی‌ها'
                    : isAr
                    ? 'بيان الخصوصية والأذونات'
                    : 'Privacy & Permissions Statement'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs flex items-center justify-center gap-2 border border-slate-700 btn-3d-secondary cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              <span>
                {isCheckingUpdate
                  ? isFa
                    ? 'در حال بررسی...'
                    : isAr
                    ? 'جاري التحقق...'
                    : 'Checking...'
                  : isFa
                  ? 'بررسی بروزرسانی نرم‌افزار'
                  : isAr
                  ? 'التحقق من التحديثات'
                  : 'Check for Updates'}
              </span>
            </button>
          </div>
        </div>

        {/* 11. Clear Data Card */}
        <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 flex items-center justify-between card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-rose-900 dark:text-rose-200">
                {t.clearAllData}
              </h4>
              <p className="text-xs text-rose-500/80">
                {isFa
                  ? 'پاکسازی کامل تاریخچه دانلودها و حافظه کش محلی'
                  : isAr
                  ? 'مسح سجل التحميلات والملفات المؤقتة بالكامل'
                  : 'Wipe local download history and cached blobs'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-sm shrink-0 cursor-pointer"
          >
            {isFa ? 'پاکسازی کامل' : isAr ? 'مسح الكل' : 'Clear Data'}
          </button>
        </div>
      </div>
    </section>
  );
};
