import React, { useState } from 'react';
import {
  X,
  Share2,
  PlusSquare,
  Smartphone,
  Apple,
  Check,
  Copy,
  AlertTriangle,
  ExternalLink,
  Download,
  Share,
  FileDown,
  Info,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { Language } from '../types';
import { getTranslation } from '../i18n/translations';

interface IOSInstallGuideProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  onTriggerInstall?: () => Promise<boolean>;
  hasNativePrompt?: boolean;
}

export const IOSInstallGuide: React.FC<IOSInstallGuideProps> = ({
  language,
  isOpen,
  onClose,
  onTriggerInstall,
  hasNativePrompt
}) => {
  const t = getTranslation(language);
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'direct'>('android');
  const [copiedLink, setCopiedLink] = useState(false);
  const [installStatusMsg, setInstallStatusMsg] = useState<string | null>(null);
  const [downloadedLauncher, setDownloadedLauncher] = useState(false);

  if (!isOpen) return null;

  const appUrl =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.protocol}//${window.location.host}${window.location.pathname}`
      : 'https://onedownload.app';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = appUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'وان‌اکسپرس - دانلودر هوشمند',
          text: 'سامانه دانلود سریع ویدیو و صوت با کیفیت اصلی',
          url: appUrl
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  const handleTriggerInstall = async () => {
    setInstallStatusMsg(null);
    if (onTriggerInstall) {
      const accepted = await onTriggerInstall();
      if (accepted) {
        setInstallStatusMsg(
          language === 'fa'
            ? '✅ نصب با موفقیت انجام شد! آیکون برنامه در صفحه اصلی گوشی قرار گرفت.'
            : '✅ App installed successfully on your home screen!'
        );
        return;
      }
    }

    // If native prompt wasn't available (e.g. Chrome inside iframe or user already dismissed)
    setInstallStatusMsg(
      language === 'fa'
        ? '💡 راهنمای نصب فوری: لطفاً در منوی بالای مرورگر (سه نقطه ⋮) گزینه «افزودن به صفحه اصلی» یا «Install app» را انتخاب نمایید.'
        : '💡 Tap the 3 dots menu ⋮ in your browser and select "Add to Home screen" or "Install app".'
    );
  };

  // Generates and downloads a lightweight standalone WebApp launcher HTML file
  const handleDownloadLauncher = () => {
    try {
      const launcherHtml = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>وان‌اکسپرس - دانلودر هوشمند</title>
  <meta name="theme-color" content="#4f46e5">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #090d16;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 20px;
    }
    .card {
      background: #111827;
      border: 1px solid #374151;
      padding: 32px 24px;
      border-radius: 28px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .icon {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.5);
    }
    h2 { margin: 0 0 8px; font-size: 20px; font-weight: 800; }
    p { margin: 0 0 24px; color: #9ca3af; font-size: 13px; line-height: 1.6; }
    .btn {
      display: block;
      width: 100%;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: #ffffff;
      text-decoration: none;
      padding: 14px 20px;
      border-radius: 16px;
      font-weight: 700;
      font-size: 15px;
      border: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v12" />
        <path d="m8 11 4 4 4-4" />
        <path d="M4 17c0 2 2 3 4 3h8c2 0 4-1 4-3" />
      </svg>
    </div>
    <h2>وان‌اکسپرس - دانلودر هوشمند</h2>
    <p>در حال باز کردن نرم‌افزار بدون نیاز به فیلترشکن...</p>
    <a href="${appUrl}" class="btn">ورود به وان‌اکسپرس</a>
  </div>
  <script>
    setTimeout(function() {
      window.location.replace("${appUrl}");
    }, 300);
  </script>
</body>
</html>`;

      const blob = new Blob([launcherHtml], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'OneExpress-App.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

      setDownloadedLauncher(true);
      setTimeout(() => setDownloadedLauncher(false), 3000);
    } catch (e) {
      console.error('Failed to download launcher file', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d p-5 sm:p-6 text-slate-900 dark:text-white my-6 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 card-3d">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-base sm:text-lg text-3d">
              {language === 'fa' ? 'نصب برنامه روی گوشی (اندروید و آیفون)' : 'Install App on Mobile Phone'}
            </h3>
            <p className="text-xs text-slate-400">
              {language === 'fa' ? 'نصب مستقیم، فوق‌سریع و بدون نیاز به فیلترشکن' : 'Direct install on your home screen without VPN'}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 mb-4 text-xs font-black">
          <button
            type="button"
            onClick={() => {
              setActiveTab('android');
              setInstallStatusMsg(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all ${
              activeTab === 'android'
                ? 'btn-3d-primary bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{language === 'fa' ? 'اندروید' : 'Android'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('ios');
              setInstallStatusMsg(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all ${
              activeTab === 'ios'
                ? 'btn-3d-primary bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Apple className="w-4 h-4" />
            <span>{language === 'fa' ? 'آیفون' : 'iPhone (iOS)'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('direct');
              setInstallStatusMsg(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all ${
              activeTab === 'direct'
                ? 'btn-3d-primary bg-emerald-600 text-white shadow-emerald-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>{language === 'fa' ? 'دانلود میانبر' : 'Shortcut'}</span>
          </button>
        </div>

        {/* Status notice if install was clicked */}
        {installStatusMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs leading-relaxed animate-fade-in flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
            <span>{installStatusMsg}</span>
          </div>
        )}

        {/* ── Android Steps ── */}
        {activeTab === 'android' && (
          <div className="space-y-3 text-xs">
            {/* Primary Action Button 1: Smart Browser Install */}
            <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-extrabold text-indigo-950 dark:text-indigo-200 block text-xs">
                    {language === 'fa' ? 'روش ۱: نصب خودکار با یک لمس' : 'Method 1: One-Tap Install'}
                  </span>
                  <span className="text-[11px] text-indigo-700 dark:text-indigo-400">
                    {language === 'fa' ? 'درخواست مستقیم نصب اپلیکیشن از گوگل کروم' : 'Request native install prompt'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerInstall}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs btn-3d-primary flex items-center gap-1.5 shrink-0 shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>{language === 'fa' ? 'نصب روی گوشی' : 'Install Now'}</span>
                </button>
              </div>
            </div>

            {/* Android Step Guide */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
              <div className="w-6 h-6 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 font-black flex items-center justify-center shrink-0 text-xs">
                ۱
              </div>
              <div className="leading-relaxed">
                <span className="font-extrabold text-slate-900 dark:text-white block mb-0.5">
                  {language === 'fa' ? 'باز کردن در مرورگر اصلی Google Chrome یا Samsung Internet' : 'Open in Google Chrome or Samsung Internet'}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  {language === 'fa'
                    ? 'مطمئن شوید صفحه را در کروم باز کرده‌اید (نه داخل مرورگر داخلی تلگرام، روبیکا، یا اینستاگرام).'
                    : 'Ensure you are in Google Chrome and not an in-app browser.'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
              <div className="w-6 h-6 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 font-black flex items-center justify-center shrink-0 text-xs">
                ۲
              </div>
              <div className="leading-relaxed">
                <span className="font-extrabold text-slate-900 dark:text-white block mb-0.5">
                  {language === 'fa' ? 'لمس منوی سه نقطه (⋮) در بالای مرورگر' : 'Tap the 3 dots menu ⋮'}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  {language === 'fa'
                    ? 'در گوشه بالا منوی سه نقطه کروم را لمس نمایید.'
                    : 'Tap the three dots icon at the top corner of Chrome.'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/60 flex items-start gap-3">
              <div className="w-6 h-6 rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 font-black flex items-center justify-center shrink-0 text-xs">
                ۳
              </div>
              <div className="leading-relaxed">
                <span className="font-extrabold text-emerald-950 dark:text-emerald-200 block mb-0.5">
                  {language === 'fa' ? 'انتخاب «افزودن به صفحه اصلی» یا «نصب برنامه»' : 'Tap "Add to Home screen" or "Install App"'}
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                  {language === 'fa'
                    ? 'گزینه «افزودن به صفحه اصلی» (Add to Home screen) یا «نصب برنامه» را انتخاب کرده و تایید کنید. آیکون برنامه فوراً به منوی گوشی شما اضافه می‌شود.'
                    : 'Select "Add to Home screen" or "Install app". The icon will appear on your phone screen immediately.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── iOS Steps ── */}
        {activeTab === 'ios' && (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
              <div className="w-6 h-6 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 font-black flex items-center justify-center shrink-0 text-xs">
                ۱
              </div>
              <div className="leading-relaxed">
                <span className="font-extrabold text-slate-900 dark:text-white block mb-0.5">
                  {language === 'fa' ? 'باز کردن با مرورگر سافاری (Safari)' : 'Open in Safari'}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  {language === 'fa'
                    ? 'لینک برنامه را در مرورگر اصلی Safari آیفون باز نمایید.'
                    : 'Make sure to open this page inside Apple Safari on iOS.'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
              <div className="p-1.5 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 shrink-0">
                <Share className="w-4 h-4" />
              </div>
              <div className="leading-relaxed">
                <span className="font-extrabold text-slate-900 dark:text-white block mb-0.5">
                  {language === 'fa' ? 'لمس دکمه اشتراک‌گذاری (Share)' : 'Tap Share button'}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  {language === 'fa'
                    ? 'دکمه اشتراک‌گذاری (مربع با فلش رو به بالا) را در نوار پایین سافاری لمس کنید.'
                    : 'Tap the Share icon (square with upward arrow) at the bottom toolbar.'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/60 flex items-start gap-3">
              <div className="p-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 shrink-0">
                <PlusSquare className="w-4 h-4" />
              </div>
              <div className="leading-relaxed">
                <span className="font-extrabold text-emerald-950 dark:text-emerald-200 block mb-0.5">
                  {language === 'fa' ? 'انتخاب «Add to Home Screen»' : 'Select "Add to Home Screen"'}
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                  {language === 'fa'
                    ? 'گزینه Add to Home Screen را لمس کرده و در گوشه بالا دکمه Add را بزنید.'
                    : 'Tap "Add to Home Screen", then tap "Add" at the top right.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Direct Download / Offline Launcher Tab ── */}
        {activeTab === 'direct' && (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
              <div className="flex items-center gap-2 font-black text-emerald-950 dark:text-emerald-200">
                <FileDown className="w-4 h-4 text-emerald-600" />
                <span>{language === 'fa' ? 'دانلود فایل میانبر برنامه روی حافظه گوشی:' : 'Download App Launcher File:'}</span>
              </div>
              <p className="text-emerald-700 dark:text-emerald-300 text-[11px] leading-relaxed">
                {language === 'fa'
                  ? 'یک فایل میانبر کم‌حجم (.html) اختصاصی در حافظه گوشی شما ذخیره می‌شود. با هر بار لمس این فایل، برنامه مستقیماً باز می‌شود.'
                  : 'A standalone launcher file will be saved directly to your phone. Tapping it opens the app instantly.'}
              </p>
              <button
                type="button"
                onClick={handleDownloadLauncher}
                className="w-full mt-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs btn-3d-primary flex items-center justify-center gap-2 shadow-md transition-all"
              >
                {downloadedLauncher ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>{language === 'fa' ? 'فایل دانلود و ذخیره شد!' : 'Downloaded to Device!'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>{language === 'fa' ? 'دانلود فایل نصب/میانبر روی گوشی (OneExpress.html)' : 'Download Launcher File'}</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 space-y-2">
              <span className="font-extrabold text-slate-900 dark:text-white block">
                {language === 'fa' ? 'آیا به فایل APK نیاز است؟' : 'Is an APK file needed?'}
              </span>
              <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                {language === 'fa'
                  ? 'وان دانلود هم به صورت نسخه نصبی اندروید (APK) و هم وب‌اپلیکیشن مستقل (PWA) قابل نصب روی صفحه اصلی گوشی شماست.'
                  : 'OneDownload runs as both a native Android APK and a high-performance standalone PWA directly on your phone.'}
              </p>
            </div>
          </div>
        )}

        {/* Clean Link & Share Actions */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] text-slate-400 font-bold">
                {language === 'fa' ? 'آدرس مستقیم نرم‌افزار جهت باز کردن در کروم گوشی:' : 'Direct App URL:'}
              </span>
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate block select-all">
                {appUrl}
              </span>
            </div>

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary shrink-0 shadow-xs"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-indigo-500" />}
              <span>{copiedLink ? (language === 'fa' ? 'کپی شد' : 'Copied') : (language === 'fa' ? 'کپی لینک' : 'Copy')}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>{language === 'fa' ? 'ارسال به گوشی / پیام‌رسان' : 'Share to Mobile'}</span>
            </button>

            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <span>{language === 'fa' ? 'باز کردن در پنجره جدید' : 'Open in new window'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-3 rounded-2xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 btn-3d-primary active:scale-95 transition-all shadow-md"
        >
          {t.close}
        </button>
      </div>
    </div>
  );
};
