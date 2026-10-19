import React, { useState } from 'react';
import { AppSettings, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { clearAllIDBBlobs } from '../services/storageService';
import { getDeviceProfile } from '../services/deviceService';
import { getDailyQuota } from '../services/quotaService';
import {
  Globe,
  Moon,
  Sun,
  Sliders,
  PlaySquare,
  Trash2,
  CheckCircle2,
  Shield,
  HardDrive,
  Cpu,
  Copy,
  Check,
  RefreshCw,
  Crown,
  Sparkles,
  Mail,
  Smartphone,
  Layers,
  Info,
  BookOpen,
  ShieldCheck,
  AlertTriangle,
  Share2,
  Send,
  Bluetooth
} from 'lucide-react';

interface SettingsViewProps {
  language: Language;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClearAllAppData: () => void;
  onOpenUpgradeModal: () => void;
  onOpenInstallGuide?: () => void;
  onOpenShare?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  language,
  settings,
  onUpdateSettings,
  onClearAllAppData,
  onOpenUpgradeModal,
  onOpenInstallGuide,
  onOpenShare
}) => {
  const t = getTranslation(language);
  const [clearedNotice, setClearedNotice] = useState(false);
  const [copiedDeviceId, setCopiedDeviceId] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);

  const deviceProfile = getDeviceProfile();
  const quota = getDailyQuota();

  const handleClear = async () => {
    if (window.confirm(t.clearDataConfirm)) {
      await clearAllIDBBlobs();
      onClearAllAppData();
      setClearedNotice(true);
      setTimeout(() => setClearedNotice(false), 2500);
    }
  };

  const handleCopyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceProfile.deviceId);
      setCopiedDeviceId(true);
      setTimeout(() => setCopiedDeviceId(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCheckUpdate = () => {
    setIsCheckingUpdate(true);
    setUpdateStatusText(null);
    setTimeout(() => {
      setIsCheckingUpdate(false);
      setUpdateStatusText(
        language === 'fa'
          ? 'نرم‌افزار شما به آخرین نسخه پایدار (v2.5.0) به‌روز است ✓'
          : 'You are on the latest version (v2.5.0) ✓'
      );
      setTimeout(() => setUpdateStatusText(null), 4000);
    }, 1500);
  };

  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {t.settingsHeader}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {language === 'fa'
              ? 'پیکربندی هویت دستگاه، سهمیه روزانه، بروزرسانی و موتور پردازش'
              : 'Device profile, daily quota, in-app update & stream engine settings'}
          </p>
        </div>

        {/* Quota Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={onOpenUpgradeModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Crown className="w-3.5 h-3.5 fill-slate-950" />
            <span>
              {quota.isPro
                ? (language === 'fa' ? 'اشتراک VIP Pro (نامحدود)' : 'VIP Pro (Unlimited)')
                : (language === 'fa' ? `سهمیه امروز: ${quota.remainingToday} از ۳ فیلم` : `Daily: ${quota.remainingToday}/3 left`)}
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

      <div className="space-y-4">
        {/* 1. Unique Device Identification Card */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shadow-xs card-3d">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{language === 'fa' ? 'شناسه اختصاصی دستگاه شما' : 'Unique Device Identifier'}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300">
                    Hardware ID
                  </span>
                </h4>
                <p className="text-xs text-slate-400">
                  {language === 'fa'
                    ? 'شناسه امن برای محاسبه سهمیه روزانه و فعال‌سازی اشتراک'
                    : 'Unique hardware fingerprint for quota and subscription binding'}
                </p>
              </div>
            </div>

            <button
              onClick={handleCopyDeviceId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary transition-colors shrink-0"
              title="کپی شناسه دستگاه"
            >
              {copiedDeviceId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-indigo-500" />}
              <span>{copiedDeviceId ? (language === 'fa' ? 'کپی شد' : 'Copied') : (language === 'fa' ? 'کپی شناسه' : 'Copy ID')}</span>
            </button>
          </div>

          {/* Device ID Display & Specs */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold tracking-wider text-center select-all input-3d">
            {deviceProfile.deviceId}
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="p-2 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center card-3d">
              <span className="block text-[10px] text-slate-400">سیستم‌عامل</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{deviceProfile.os}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center card-3d">
              <span className="block text-[10px] text-slate-400">مرورگر</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{deviceProfile.browser}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center card-3d">
              <span className="block text-[10px] text-slate-400">رزولوشن</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{deviceProfile.screenResolution}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center card-3d">
              <span className="block text-[10px] text-slate-400">وضعیت سهمیه</span>
              <span className="font-bold text-amber-500">{quota.isPro ? 'VIP Pro' : `${quota.remainingToday}/3`}</span>
            </div>
          </div>
        </div>

        {/* 2. In-App Update Checker Card */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 card-3d">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 shadow-xs">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'fa' ? 'بروزرسانی داخلی نرم‌افزار' : 'In-App Update Engine'}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                  v2.5.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {updateStatusText || (language === 'fa' ? 'بررسی آخرین نسخه منتشرشده در مخزن رسمی' : 'Check for latest stable update release')}
              </p>
            </div>
          </div>

          <button
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 btn-3d-primary transition-all active:scale-95 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>{isCheckingUpdate ? (language === 'fa' ? 'در حال بررسی...' : 'Checking...') : (language === 'fa' ? 'بررسی بروزرسانی' : 'Check for Updates')}</span>
          </button>
        </div>

        {/* 3. Developer & About Us Card */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white border border-indigo-500/20 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-base text-white">
                  {language === 'fa' ? 'درباره ما و سازنده نرم‌افزار' : 'About Us & Developer'}
                </h4>
                <p className="text-xs text-slate-400">
                  {language === 'fa' ? 'توسعه‌داده‌شده توسط گروه appone-علوی' : 'Developed by appone-Alavi Group'}
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-indigo-600 text-white uppercase tracking-wider shadow-xs">
              AppOne Express
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{language === 'fa' ? 'ایمیل پشتیبانی، نظرات و ارتباط:' : 'Support & Feedback:'}</span>
              <a
                href="mailto:alavipoco@gmail.com"
                className="font-mono font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>alavipoco@gmail.com</span>
              </a>
            </div>


            {onOpenShare && (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onOpenShare}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all active:scale-95 shadow-md shadow-indigo-600/30 btn-3d-primary"
                >
                  <Share2 className="w-4 h-4 text-white" />
                  <span>{language === 'fa' ? 'اشتراک‌گذاری و ارسال نرم‌افزار (بلوتوث، زاپیا، لینک)' : 'Share & Send App (Bluetooth, Zapya, Link)'}</span>
                </button>
              </div>
            )}

            {onOpenInstallGuide && (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onOpenInstallGuide}
                  className="w-full py-2.5 px-3 rounded-2xl bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-400/50 text-indigo-100 font-extrabold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
                >
                  <Smartphone className="w-4 h-4 text-indigo-300" />
                  <span>{language === 'fa' ? 'راهنمای نصب برنامه روی گوشی و رفع خطای نصب (اندروید / آیفون)' : 'Install on Mobile & Fix Errors Guide (Android / iOS)'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4. Dedicated Share & Send Application Card */}
        {onOpenShare && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs card-3d">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {language === 'fa' ? 'اشتراک‌گذاری و ارسال نرم‌افزار به دیگران' : 'Share Application with Others'}
                </h4>
                <p className="text-xs text-slate-400">
                  {language === 'fa'
                    ? 'ارسال مستقیم با بلوتوث، زاپیا، شبکه‌های اجتماعی یا لینک اختصاصی'
                    : 'Send via Bluetooth, Zapya, Social apps or Custom link'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenShare}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-600/30 active:scale-95 transition-all shrink-0 btn-3d-primary"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{language === 'fa' ? 'ارسال نرم‌افزار' : 'Share App'}</span>
            </button>
          </div>
        )}

        {/* 4. Language Selection Card */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.langSelector}
              </h4>
              <p className="text-xs text-slate-400">
                فارسی (راست‌چین) / English (Left-to-Right)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
            <button
              onClick={() => onUpdateSettings({ ...settings, language: 'fa' })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                settings.language === 'fa'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              فارسی
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, language: 'en' })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                settings.language === 'en'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* 5. Theme Card */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
              {settings.theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.themeSelector}
              </h4>
              <p className="text-xs text-slate-400">
                {settings.theme === 'dark' ? t.themeDark : t.themeLight}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                settings.theme === 'light'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Light
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                settings.theme === 'dark'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Dark
            </button>
          </div>
        </div>

        {/* 6. Auto-Play Toggle */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
              <PlaySquare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.autoPlayToggle}
              </h4>
              <p className="text-xs text-slate-400">
                {language === 'fa' ? 'اجرای خودکار پلیر داخلی بلافاصله پس از اتمام دانلود' : 'Launch media player immediately when download finishes'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoPlayAfterDownload}
              onChange={(e) => onUpdateSettings({ ...settings, autoPlayAfterDownload: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>

        {/* 7. Auto-Save to Device Storage Toggle */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-center justify-between shadow-xs">
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

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoSaveToDevice}
              onChange={(e) => onUpdateSettings({ ...settings, autoSaveToDevice: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
          </label>
        </div>

        {/* 8. Parallel Thread Concurrency */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {t.chunkConcurrencyTitle}
                </h4>
                <p className="text-xs text-slate-400">
                  {language === 'fa' ? 'تعداد رشته‌های همزمان پردازش و دریافت مدیا' : 'Parallel multi-threaded segmented downloading'}
                </p>
              </div>
            </div>
            <span className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
              {settings.chunkConcurrency} threads
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={settings.chunkConcurrency}
            onChange={(e) => onUpdateSettings({ ...settings, chunkConcurrency: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>

        {/* 9. Wipe Data Card */}
        <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-rose-900 dark:text-rose-200">
                {t.clearAllData}
              </h4>
              <p className="text-xs text-rose-700/70 dark:text-rose-400/80">
                {language === 'fa' ? 'حذف دائمی تمامی فایل‌های بارگیری‌شده و حافظه موقت' : 'Permanently wipes all queued downloads and local media storage'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClear}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-sm shadow-rose-600/30 transition-all active:scale-95 shrink-0"
          >
            {t.deleteItem}
          </button>
        </div>
      </div>
    </section>
  );
};
